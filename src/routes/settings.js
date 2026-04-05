// Routen für Einstellungen
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// Hilfsfunktion: Key-Quelle bestimmen (env | db | none)
function keySource(envVar, dbKey) {
  if (process.env[envVar]) return 'env';
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(dbKey);
  return row?.value ? 'db' : 'none';
}

// Einstellungen laden
router.get('/', (req, res) => {
  const einstellungen = db.prepare('SELECT key, value FROM settings').all();
  const dbMap = Object.fromEntries(einstellungen.map(e => [e.key, e.value]));

  // Key-Quellen
  const geminiSource  = keySource('GEMINI_API_KEY',   'gemini_api_key');
  const claudeSource  = keySource('ANTHROPIC_API_KEY', 'anthropic_api_key');
  const openaiSource  = keySource('OPENAI_API_KEY',    'openai_api_key');

  res.json({
    // Aktiver Provider
    ai_provider: process.env.AI_PROVIDER || dbMap.ai_provider || 'gemini',

    // Key-Quellen (env | db | none) – kein Key-Wert ans Frontend
    gemini_key_source:  geminiSource,
    claude_key_source:  claudeSource,
    openai_key_source:  openaiSource,

    // API-Keys maskiert (nur zur Anzeige ob gesetzt)
    gemini_api_key:     geminiSource !== 'none' ? '••••••••' : '',
    anthropic_api_key:  claudeSource !== 'none' ? '••••••••' : '',
    openai_api_key:     openaiSource !== 'none' ? '••••••••' : '',

    // Ausgewählte Modelle (env > DB > default)
    gemini_model: process.env.GEMINI_MODEL || dbMap.gemini_model || 'gemini-2.5-flash',
    claude_model: process.env.CLAUDE_MODEL  || dbMap.claude_model  || 'claude-haiku-4-5-20251001',
    openai_model: process.env.OPENAI_MODEL  || dbMap.openai_model  || 'gpt-5.4-mini',
  });
});

// Einstellungen speichern
router.post('/', (req, res) => {
  const erlaubteKeys = [
    'ai_provider',
    'gemini_api_key', 'anthropic_api_key', 'openai_api_key',
    'gemini_model', 'claude_model', 'openai_model',
  ];
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      if (!erlaubteKeys.includes(key)) continue;
      if (value === '••••••••') continue; // Platzhalter nie speichern
      if (value === '' && key.includes('api_key')) continue; // Leeren Key nicht überschreiben
      upsert.run(key, String(value));
    }
  });
  tx();

  res.json({ success: true });
});

module.exports = router;
