// Job-Queue-Worker – verarbeitet OCR und Kategorisierungs-Jobs
'use strict';

const db = require('./db');
const { ocr, kategorisiere } = require('./services/ai');

const INTERVALL_SEK = parseInt(process.env.WORKER_INTERVAL_SEC || '10', 10);

function starteWorker() {
  console.log(`[Worker] Gestartet, Intervall: ${INTERVALL_SEK}s`);
  setInterval(verarbeiteNaechstenJob, INTERVALL_SEK * 1000);
}

async function verarbeiteNaechstenJob() {
  // Nächsten offenen Job holen (OCR hat Vorrang vor Kategorisierung)
  const job = db.prepare(`
    SELECT * FROM jobs
    WHERE status = 'pending'
    ORDER BY CASE type WHEN 'ocr' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get();

  if (!job) return;

  // Job als "wird verarbeitet" markieren
  db.prepare(`
    UPDATE jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(job.id);

  console.log(`[Worker] Verarbeite Job #${job.id} (${job.type})`);

  try {
    if (job.type === 'ocr') {
      await verarbeiteOCRJob(job);
    } else if (job.type === 'categorize') {
      await verarbeiteKategorisierungsJob(job);
    } else {
      throw new Error(`Unbekannter Job-Typ: ${job.type}`);
    }

    db.prepare(`
      UPDATE jobs SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(job.id);

    console.log(`[Worker] Job #${job.id} erfolgreich`);
  } catch (err) {
    console.error(`[Worker] Job #${job.id} fehlgeschlagen:`, err.message);
    db.prepare(`
      UPDATE jobs SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(err.message, job.id);

    // Receipt-Status auf failed setzen wenn OCR-Job fehlschlägt
    if (job.type === 'ocr') {
      const payload = JSON.parse(job.payload);
      db.prepare(`
        UPDATE receipts SET ocr_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(payload.receipt_id);
    }
  }
}

async function verarbeiteOCRJob(job) {
  const payload = JSON.parse(job.payload);
  const receiptId = payload.receipt_id;
  const bildPfad = payload.image_path;

  // Receipt auf "processing" setzen
  db.prepare(`
    UPDATE receipts SET ocr_status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(receiptId);

  // KI-Analyse
  const ergebnis = await ocr(bildPfad);

  // Ergebnis speichern
  db.prepare(`
    UPDATE receipts SET
      store_name = ?,
      receipt_date = ?,
      receipt_type = ?,
      total_amount = ?,
      ocr_status = 'done',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    ergebnis.store_name || null,
    ergebnis.receipt_date || new Date().toISOString().split('T')[0],
    ['itemized','fuel','restaurant','other'].includes(ergebnis.receipt_type) ? ergebnis.receipt_type : 'other',
    ergebnis.total_amount || 0,
    receiptId
  );

  // Items anlegen (nur bei itemized)
  const items = Array.isArray(ergebnis.items) ? ergebnis.items : [];
  if (items.length > 0) {
    const insertItem = db.prepare(`
      INSERT INTO receipt_items (receipt_id, description, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertTx = db.transaction(() => {
      for (const item of items) {
        insertItem.run(
          receiptId,
          item.description || 'Unbekannt',
          item.quantity || 1,
          item.unit_price || 0,
          item.total_price || 0
        );
      }
    });
    insertTx();

    // Summenvalidierung: Weicht KI-Summe mehr als 2% ab?
    const itemSumme = items.reduce((s, i) => s + (i.total_price || 0), 0);
    const gesamtbetrag = ergebnis.total_amount || 0;
    if (gesamtbetrag > 0) {
      const abweichung = Math.abs(itemSumme - gesamtbetrag) / gesamtbetrag;
      if (abweichung > 0.02) {
        db.prepare(`UPDATE receipts SET sum_mismatch = 1 WHERE id = ?`).run(receiptId);
        console.log(`[Worker] Summen-Abweichung bei Receipt #${receiptId}: ${(abweichung * 100).toFixed(1)}%`);
      }
    }

    // Automatisch Kategorisierungs-Job anlegen
    db.prepare(`
      INSERT INTO jobs (type, status, payload)
      VALUES ('categorize', 'pending', ?)
    `).run(JSON.stringify({ receipt_id: receiptId }));
  }
}

async function verarbeiteKategorisierungsJob(job) {
  const payload = JSON.parse(job.payload);
  const receiptId = payload.receipt_id;

  // Unkategorisierte Items laden
  const items = db.prepare(`
    SELECT id, description FROM receipt_items
    WHERE receipt_id = ? AND category_id IS NULL AND manually_corrected = 0
  `).all(receiptId);

  if (items.length === 0) return;

  // Alle verfügbaren Kategorien laden (global + tenant)
  const receipt = db.prepare('SELECT tenant_id FROM receipts WHERE id = ?').get(receiptId);
  const kategorien = db.prepare(`
    SELECT id, name, group_name FROM categories
    WHERE tenant_id IS NULL OR tenant_id = ?
    ORDER BY name
  `).all(receipt?.tenant_id || 0);

  if (kategorien.length === 0) return;

  // KI aufrufen
  const beschreibungen = items.map(i => i.description);
  const zuordnungen = await kategorisiere(beschreibungen, kategorien);

  // Kategorie-Map aufbauen
  const katMap = {};
  for (const k of kategorien) {
    katMap[k.name.toLowerCase()] = k.id;
  }

  // Fallback: "Sonstiges"
  const sonstigesId = kategorien.find(k => k.name === 'Sonstiges')?.id || null;

  // Zuordnungen speichern
  const update = db.prepare(`
    UPDATE receipt_items SET category_id = ? WHERE id = ?
  `);
  const updateTx = db.transaction(() => {
    for (const zuordnung of zuordnungen) {
      const item = items.find(i => i.description === zuordnung.description);
      if (!item) continue;
      const katId = katMap[zuordnung.category?.toLowerCase()] || sonstigesId;
      update.run(katId, item.id);
    }
  });
  updateTx();
}

// Einzelne Receipts neu kategorisieren (für "Alle neu kategorisieren"-Button)
async function recategorizeAll(tenantId) {
  const receipts = db.prepare(`
    SELECT id FROM receipts WHERE tenant_id = ? AND ocr_status = 'done'
  `).all(tenantId);

  for (const r of receipts) {
    // Manuelle Korrekturen nicht überschreiben
    db.prepare(`
      UPDATE receipt_items SET category_id = NULL
      WHERE receipt_id = ? AND manually_corrected = 0
    `).run(r.id);

    db.prepare(`
      INSERT INTO jobs (type, status, payload) VALUES ('categorize', 'pending', ?)
    `).run(JSON.stringify({ receipt_id: r.id }));
  }

  return receipts.length;
}

module.exports = { starteWorker, recategorizeAll };
