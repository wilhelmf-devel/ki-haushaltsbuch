// Admin-Routen: Benutzerverwaltung (nur aktiv wenn AUTH_HEADER gesetzt)
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthActive } = require('../middleware/auth');

// Nur Admins dürfen diese Routen nutzen
function requireAdmin(req, res, next) {
  if (!isAuthActive()) return res.status(404).json({ error: 'Feature nicht aktiv' });
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin-Zugriff erforderlich' });
  next();
}

// Alle bekannten Benutzer mit ihren Mandanten-Zuordnungen + alle Mandanten
router.get('/users', requireAdmin, (req, res) => {
  const users    = db.prepare('SELECT username, first_seen_at FROM known_users ORDER BY username').all();
  const tenants  = db.prepare('SELECT * FROM tenants ORDER BY id').all();
  const assignments = db.prepare('SELECT username, tenant_id FROM user_tenants').all();

  const result = users.map(u => ({
    ...u,
    tenant_ids: assignments
      .filter(a => a.username === u.username)
      .map(a => a.tenant_id),
  }));

  res.json({ users: result, tenants });
});

// Benutzer vorerfassen (ohne Mandant-Zuweisung – für Benutzer vor ihrem ersten Login)
router.post('/users', requireAdmin, (req, res) => {
  const { username } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'username erforderlich' });
  db.prepare('INSERT OR IGNORE INTO known_users (username) VALUES (?)').run(username.trim());
  res.json({ success: true });
});

// Mandant einem Benutzer zuweisen (legt Benutzer auch in known_users an)
router.post('/users/:username/tenants/:tenantId', requireAdmin, (req, res) => {
  const { username, tenantId } = req.params;

  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Mandant nicht gefunden' });

  db.prepare('INSERT OR IGNORE INTO known_users (username) VALUES (?)').run(username);
  db.prepare('INSERT OR IGNORE INTO user_tenants (username, tenant_id) VALUES (?, ?)').run(username, tenantId);
  res.json({ success: true });
});

// Mandant-Zuweisung entfernen
router.delete('/users/:username/tenants/:tenantId', requireAdmin, (req, res) => {
  const { username, tenantId } = req.params;
  db.prepare('DELETE FROM user_tenants WHERE username = ? AND tenant_id = ?').run(username, tenantId);
  res.json({ success: true });
});

module.exports = router;
