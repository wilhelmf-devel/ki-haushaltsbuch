// Routen für Mandanten
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// Alle Mandanten
router.get('/', (req, res) => {
  const mandanten = db.prepare('SELECT * FROM tenants ORDER BY id').all();
  res.json(mandanten);
});

// Mandant anlegen
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name erforderlich' });

  const result = db.prepare('INSERT INTO tenants (name) VALUES (?)').run(name);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Mandant bearbeiten
router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name erforderlich' });

  const vorhanden = db.prepare('SELECT id FROM tenants WHERE id = ?').get(req.params.id);
  if (!vorhanden) return res.status(404).json({ error: 'Mandant nicht gefunden' });

  db.prepare('UPDATE tenants SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ success: true });
});

// Mandant löschen
router.delete('/:id', (req, res) => {
  const anzahlBelege = db.prepare('SELECT COUNT(*) as c FROM receipts WHERE tenant_id = ?').get(req.params.id);
  if (anzahlBelege.c > 0) {
    return res.status(409).json({
      error: `Mandant hat noch ${anzahlBelege.c} Belege und kann nicht gelöscht werden.`
    });
  }
  db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
