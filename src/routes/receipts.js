// Routen für Belege (Receipts)
'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');

// Liste aller Belege (mit Filtern)
router.get('/', (req, res) => {
  const { tenant_id, from, to, type, category_id, search, limit = 50, offset = 0 } = req.query;

  if (!tenant_id) return res.status(400).json({ error: 'tenant_id erforderlich' });

  let sql = `
    SELECT DISTINCT r.*,
      (SELECT COUNT(*) FROM receipt_items WHERE receipt_id = r.id) AS item_count
    FROM receipts r
    WHERE r.tenant_id = ?
  `;
  const params = [tenant_id];

  if (from) { sql += ' AND r.receipt_date >= ?'; params.push(from); }
  if (to)   { sql += ' AND r.receipt_date <= ?'; params.push(to); }
  if (type) { sql += ' AND r.receipt_type = ?'; params.push(type); }
  if (search) {
    sql += ` AND (r.store_name LIKE ? OR EXISTS (
      SELECT 1 FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.description LIKE ?
    ))`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category_id) {
    sql += ` AND EXISTS (
      SELECT 1 FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.category_id = ?
    )`;
    params.push(category_id);
  }

  sql += ' ORDER BY r.receipt_date DESC, r.id DESC';
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const receipts = db.prepare(sql).all(...params);

  // Gesamtanzahl für Pagination
  let countSql = `SELECT COUNT(DISTINCT r.id) as total FROM receipts r WHERE r.tenant_id = ?`;
  const countParams = [tenant_id];
  if (from) { countSql += ' AND r.receipt_date >= ?'; countParams.push(from); }
  if (to)   { countSql += ' AND r.receipt_date <= ?'; countParams.push(to); }
  if (type) { countSql += ' AND r.receipt_type = ?'; countParams.push(type); }
  const { total } = db.prepare(countSql).get(...countParams);

  res.json({ receipts, total });
});

// Einzelbeleg mit Items
router.get('/:id', (req, res) => {
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Beleg nicht gefunden' });

  const items = db.prepare(`
    SELECT ri.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM receipt_items ri
    LEFT JOIN categories c ON c.id = ri.category_id
    WHERE ri.receipt_id = ?
    ORDER BY ri.id
  `).all(req.params.id);

  res.json({ ...receipt, items });
});

// Beleg manuell anlegen (ohne Upload)
router.post('/', (req, res) => {
  const { tenant_id, receipt_date, store_name, receipt_type, total_amount, notes, items } = req.body;

  if (!tenant_id || !receipt_date || !receipt_type || total_amount === undefined) {
    return res.status(400).json({ error: 'Pflichtfelder: tenant_id, receipt_date, receipt_type, total_amount' });
  }

  const result = db.prepare(`
    INSERT INTO receipts (tenant_id, receipt_date, store_name, receipt_type, total_amount, notes, ocr_status)
    VALUES (?, ?, ?, ?, ?, ?, 'skipped')
  `).run(tenant_id, receipt_date, store_name || null, receipt_type, total_amount, notes || null);

  const receiptId = result.lastInsertRowid;

  // Items anlegen falls vorhanden
  if (Array.isArray(items) && items.length > 0) {
    const insertItem = db.prepare(`
      INSERT INTO receipt_items (receipt_id, description, quantity, unit_price, total_price, category_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction(() => {
      for (const item of items) {
        insertItem.run(receiptId, item.description, item.quantity || 1, item.unit_price || 0, item.total_price || 0, item.category_id || null);
      }
    });
    tx();
  }

  res.status(201).json({ id: receiptId });
});

// Summen-Mismatch nach Item-Änderungen neu berechnen
function recalcSumMismatch(receiptId) {
  const receipt = db.prepare('SELECT total_amount FROM receipts WHERE id = ?').get(receiptId);
  if (!receipt || !receipt.total_amount) return;
  const { summe } = db.prepare(
    'SELECT COALESCE(SUM(total_price), 0) AS summe FROM receipt_items WHERE receipt_id = ?'
  ).get(receiptId);
  const abweichung = Math.abs(summe - receipt.total_amount) / receipt.total_amount;
  db.prepare('UPDATE receipts SET sum_mismatch = ? WHERE id = ?')
    .run(abweichung > 0.02 ? 1 : 0, receiptId);
}

// Beleg bearbeiten
router.put('/:id', (req, res) => {
  const { receipt_date, store_name, receipt_type, total_amount, notes, items } = req.body;

  const vorhanden = db.prepare('SELECT id FROM receipts WHERE id = ?').get(req.params.id);
  if (!vorhanden) return res.status(404).json({ error: 'Beleg nicht gefunden' });

  db.prepare(`
    UPDATE receipts SET
      receipt_date = COALESCE(?, receipt_date),
      store_name = COALESCE(?, store_name),
      receipt_type = COALESCE(?, receipt_type),
      total_amount = COALESCE(?, total_amount),
      notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(receipt_date, store_name, receipt_type, total_amount, notes ?? null, req.params.id);

  // Items aktualisieren falls mitgeschickt
  if (Array.isArray(items)) {
    db.prepare('DELETE FROM receipt_items WHERE receipt_id = ? AND manually_corrected = 0').run(req.params.id);
    const insertItem = db.prepare(`
      INSERT INTO receipt_items (receipt_id, description, quantity, unit_price, total_price, category_id, manually_corrected)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const tx = db.transaction(() => {
      for (const item of items) {
        insertItem.run(req.params.id, item.description, item.quantity || 1, item.unit_price || 0, item.total_price || 0, item.category_id || null);
      }
    });
    tx();
  }

  recalcSumMismatch(req.params.id);
  res.json({ success: true });
});

// Beleg-Item aktualisieren (Kategorie, Beschreibung, Menge, Preise)
router.put('/:id/items/:itemId', (req, res) => {
  const { category_id, description, quantity, unit_price, total_price } = req.body;
  const felder = [];
  const vals = [];

  if ('category_id' in req.body) { felder.push('category_id = ?'); vals.push(category_id || null); }
  if (description !== undefined)  { felder.push('description = ?');  vals.push(description); }
  if (quantity !== undefined)     { felder.push('quantity = ?');      vals.push(parseFloat(quantity)); }
  if (unit_price !== undefined)   { felder.push('unit_price = ?');    vals.push(parseFloat(unit_price)); }
  if (total_price !== undefined)  { felder.push('total_price = ?');   vals.push(parseFloat(total_price)); }

  if (felder.length === 0) return res.status(400).json({ error: 'Keine Felder angegeben' });

  felder.push('manually_corrected = 1');
  vals.push(req.params.itemId, req.params.id);
  db.prepare(`UPDATE receipt_items SET ${felder.join(', ')} WHERE id = ? AND receipt_id = ?`).run(...vals);
  recalcSumMismatch(req.params.id);
  res.json({ success: true });
});

// Beleg-Item löschen
router.delete('/:id/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM receipt_items WHERE id = ? AND receipt_id = ?').run(req.params.itemId, req.params.id);
  recalcSumMismatch(req.params.id);
  res.json({ success: true });
});

// Neue Beleg-Position hinzufügen
router.post('/:id/items', (req, res) => {
  const { description, quantity = 1, unit_price = 0, total_price, category_id } = req.body;
  if (!description) return res.status(400).json({ error: 'description erforderlich' });
  const tp = total_price !== undefined ? parseFloat(total_price) : parseFloat(unit_price) * parseFloat(quantity);
  const result = db.prepare(`
    INSERT INTO receipt_items (receipt_id, description, quantity, unit_price, total_price, category_id, manually_corrected)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(req.params.id, description, parseFloat(quantity), parseFloat(unit_price), tp, category_id || null);
  recalcSumMismatch(req.params.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Beleg löschen
router.delete('/:id', (req, res) => {
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Beleg nicht gefunden' });

  // Bild löschen falls vorhanden
  if (receipt.image_path) {
    const vollPfad = path.join('/data/uploads', receipt.image_path);
    if (fs.existsSync(vollPfad)) {
      fs.unlinkSync(vollPfad);
    }
  }

  db.prepare('DELETE FROM receipts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
