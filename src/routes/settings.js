// Routen für Einstellungen
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// Einstellungen laden (API-Keys werden nicht ans Frontend gesendet)
router.get('/', (req, res) => {
  const einstellungen = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const e of einstellungen) {
    // API-Keys maskieren
    if (e.key.includes('api_key') || e.key.includes('key')) {
      obj[e.key] = e.value ? '••••••••' : '';
    } else {
      obj[e.key] = e.value;
    }
  }
  // KI-Provider aus env oder DB
  obj.ai_provider = process.env.AI_PROVIDER || obj.ai_provider || 'gemini';
  res.json(obj);
});

// Einstellungen speichern
router.post('/', (req, res) => {
  const erlaubteKeys = ['ai_provider', 'gemini_api_key', 'anthropic_api_key'];
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      if (!erlaubteKeys.includes(key)) continue;
      // Leere API-Keys nicht überschreiben (Platzhalter-Wert von Frontend)
      if (value === '••••••••') continue;
      upsert.run(key, String(value));
    }
  });
  tx();

  res.json({ success: true });
});

module.exports = router;
