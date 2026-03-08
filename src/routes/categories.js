// Routen für Kategorien
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// Alle Kategorien (global + tenant-spezifisch)
router.get('/', (req, res) => {
  const { tenant_id } = req.query;

  let sql = `SELECT * FROM categories WHERE tenant_id IS NULL`;
  const params = [];

  if (tenant_id) {
    sql += ` OR tenant_id = ?`;
    params.push(tenant_id);
  }

  sql += ` ORDER BY group_name, name`;
  const kategorien = db.prepare(sql).all(...params);
  res.json(kategorien);
});

// Kategorie anlegen
router.post('/', (req, res) => {
  const { tenant_id, name, color, icon, group_name } = req.body;

  if (!name) return res.status(400).json({ error: 'name erforderlich' });

  const result = db.prepare(`
    INSERT INTO categories (tenant_id, name, color, icon, group_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(tenant_id || null, name, color || '#888888', icon || null, group_name || null);

  res.status(201).json({ id: result.lastInsertRowid });
});

// Kategorie bearbeiten
router.put('/:id', (req, res) => {
  const { name, color, icon, group_name } = req.body;

  const vorhanden = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
  if (!vorhanden) return res.status(404).json({ error: 'Kategorie nicht gefunden' });

  db.prepare(`
    UPDATE categories SET
      name = COALESCE(?, name),
      color = COALESCE(?, color),
      icon = COALESCE(?, icon),
      group_name = COALESCE(?, group_name)
    WHERE id = ?
  `).run(name, color, icon, group_name, req.params.id);

  res.json({ success: true });
});

// Kategorie löschen
router.delete('/:id', (req, res) => {
  const { move_to_sonstiges } = req.query;

  // Prüfen ob Items dieser Kategorie zugeordnet sind
  const anzahlItems = db.prepare(
    'SELECT COUNT(*) as c FROM receipt_items WHERE category_id = ?'
  ).get(req.params.id);

  if (anzahlItems.c > 0 && move_to_sonstiges !== 'true') {
    return res.status(409).json({
      error: `Kategorie wird von ${anzahlItems.c} Position(en) verwendet. Füge ?move_to_sonstiges=true hinzu um alle Positionen nach "Sonstiges" zu verschieben.`,
      item_count: anzahlItems.c,
    });
  }

  if (move_to_sonstiges === 'true') {
    const sonstiges = db.prepare("SELECT id FROM categories WHERE name = 'Sonstiges' AND tenant_id IS NULL").get();
    db.prepare('UPDATE receipt_items SET category_id = ? WHERE category_id = ?').run(
      sonstiges?.id || null, req.params.id
    );
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Globale Kategorien auf Standard zurücksetzen + alle Mandanten neu kategorisieren
router.post('/reset', (req, res) => {
  const anzahl = db.resetGlobaleKategorien();
  const { recategorizeAll } = require('../worker');
  const tenants = db.prepare('SELECT id FROM tenants').all();

  Promise.all(tenants.map(t => recategorizeAll(t.id)))
    .then(ergebnisse => {
      const gesamt = ergebnisse.reduce((s, n) => s + n, 0);
      res.json({ success: true, categories_reset: anzahl, receipts_queued: gesamt });
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

module.exports = router;
