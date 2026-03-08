// Datenbankinitialisierung – SQLite Schema + Seed-Kategorien
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || '/data/haushaltsbuch.db';

// Sicherstellen, dass das Verzeichnis existiert
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL-Modus für bessere Performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema erstellen
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#888888',
    icon TEXT,
    group_name TEXT
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    receipt_date DATE NOT NULL,
    store_name TEXT,
    receipt_type TEXT NOT NULL CHECK(receipt_type IN ('itemized','fuel','restaurant','other')),
    total_amount REAL NOT NULL,
    notes TEXT,
    image_path TEXT,
    ocr_status TEXT DEFAULT 'pending' CHECK(ocr_status IN ('pending','processing','done','failed','skipped')),
    sum_mismatch INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS receipt_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    manually_corrected INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
    payload TEXT NOT NULL,
    result TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Standard-Kategorien (global, tenant_id = NULL)
const seedKategorien = [
  // Lebensmittel
  { name: 'Gemüse',                group_name: 'Lebensmittel', icon: '🥦', color: '#4CAF50' },
  { name: 'Obst',                  group_name: 'Lebensmittel', icon: '🍎', color: '#8BC34A' },
  { name: 'Fleisch',               group_name: 'Lebensmittel', icon: '🥩', color: '#F44336' },
  { name: 'Fisch & Meeresfrüchte', group_name: 'Lebensmittel', icon: '🐟', color: '#0288D1' },
  { name: 'Milch',                 group_name: 'Lebensmittel', icon: '🥛', color: '#E3F2FD' },
  { name: 'Käse',                  group_name: 'Lebensmittel', icon: '🧀', color: '#FFF9C4' },
  { name: 'Joghurt & Quark',       group_name: 'Lebensmittel', icon: '🫙', color: '#F8BBD0' },
  { name: 'Eier',                  group_name: 'Lebensmittel', icon: '🥚', color: '#FFFDE7' },
  { name: 'Butter',                group_name: 'Lebensmittel', icon: '🧈', color: '#FFC107' },
  { name: 'Öle',                   group_name: 'Lebensmittel', icon: '🫒', color: '#AED581' },
  { name: 'Brot & Backwaren',      group_name: 'Lebensmittel', icon: '🍞', color: '#FF9800' },
  { name: 'Tiefkühlkost',          group_name: 'Lebensmittel', icon: '🧊', color: '#B3E5FC' },
  { name: 'Konserven & Trockenware', group_name: 'Lebensmittel', icon: '🥫', color: '#A1887F' },
  { name: 'Gewürze & Saucen',      group_name: 'Lebensmittel', icon: '🧂', color: '#FFCC02' },
  { name: 'Süßwaren & Snacks',     group_name: 'Lebensmittel', icon: '🍫', color: '#E91E63' },
  // Getränke
  { name: 'Wasser',                group_name: 'Getränke',     icon: '💧', color: '#03A9F4' },
  { name: 'Softdrinks',            group_name: 'Getränke',     icon: '🥤', color: '#F06292' },
  { name: 'Säfte',                 group_name: 'Getränke',     icon: '🍊', color: '#FF9800' },
  { name: 'Limonaden',             group_name: 'Getränke',     icon: '🍋', color: '#FDD835' },
  { name: 'Bier',                  group_name: 'Getränke',     icon: '🍺', color: '#FFC107' },
  { name: 'Wein',                  group_name: 'Getränke',     icon: '🍷', color: '#880E4F' },
  { name: 'Sekt & Champagner',     group_name: 'Getränke',     icon: '🥂', color: '#CE93D8' },
  { name: 'Spirituosen',           group_name: 'Getränke',     icon: '🥃', color: '#6D4C41' },
  { name: 'Kaffee & Tee',          group_name: 'Getränke',     icon: '☕', color: '#795548' },
  // Haushalt
  { name: 'Reinigungsmittel',      group_name: 'Haushalt',     icon: '🧹', color: '#26C6DA' },
  { name: 'Waschmittel',           group_name: 'Haushalt',     icon: '🫧', color: '#4DD0E1' },
  { name: 'Küchenbedarf',          group_name: 'Haushalt',     icon: '🍳', color: '#FF7043' },
  { name: 'Haushaltswaren',        group_name: 'Haushalt',     icon: '🏠', color: '#78909C' },
  // Drogerie
  { name: 'Körperpflege',          group_name: 'Drogerie',     icon: '🧴', color: '#AB47BC' },
  { name: 'Medikamente',           group_name: 'Drogerie',     icon: '💊', color: '#EC407A' },
  { name: 'Hygieneartikel',        group_name: 'Drogerie',     icon: '🪥', color: '#7E57C2' },
  // Mobilität
  { name: 'Tankstelle',            group_name: 'Mobilität',    icon: '⛽', color: '#546E7A' },
  // Ausgehen
  { name: 'Restaurant',            group_name: 'Ausgehen',     icon: '🍽️', color: '#EF5350' },
  { name: 'Café & Bäckerei',       group_name: 'Ausgehen',     icon: '☕', color: '#8D6E63' },
  { name: 'Lieferdienst',          group_name: 'Ausgehen',     icon: '🛵', color: '#FF5722' },
  { name: 'Kultur',                group_name: 'Ausgehen',     icon: '🎭', color: '#7B1FA2' },
  { name: 'Trinkgeld',             group_name: 'Ausgehen',     icon: '💰', color: '#FFD700' },
  // Sonstiges
  { name: 'Tiernahrung',           group_name: 'Sonstiges',    icon: '🐾', color: '#66BB6A' },
  { name: 'Kleidung',              group_name: 'Sonstiges',    icon: '👕', color: '#42A5F5' },
  { name: 'Schuhe',                group_name: 'Sonstiges',    icon: '👟', color: '#795548' },
  { name: 'Elektronik',            group_name: 'Sonstiges',    icon: '💻', color: '#607D8B' },
  { name: 'Sonstiges',             group_name: 'Sonstiges',    icon: '📦', color: '#9E9E9E' },
];

// Seed nur wenn noch keine globalen Kategorien existieren
const anzahlKategorien = db.prepare('SELECT COUNT(*) as c FROM categories WHERE tenant_id IS NULL').get();
if (anzahlKategorien.c === 0) {
  const insertKat = db.prepare(
    'INSERT INTO categories (tenant_id, name, color, icon, group_name) VALUES (NULL, ?, ?, ?, ?)'
  );
  const seedTx = db.transaction(() => {
    for (const k of seedKategorien) {
      insertKat.run(k.name, k.color, k.icon, k.group_name);
    }
  });
  seedTx();
  console.log(`[DB] ${seedKategorien.length} Standard-Kategorien angelegt`);
}

// Migration: Alte zusammengeführte Kategorien durch granularere ersetzen
// Läuft automatisch beim Start, idempotent (prüft ob alte Kategorien noch existieren)
function migrateKategorien() {
  const hatAlteKat = db.prepare(
    "SELECT 1 FROM categories WHERE name IN ('Fleisch & Fisch','Milchprodukte','Butter & Öle','Wasser & Softdrinks') AND tenant_id IS NULL"
  ).get();
  if (!hatAlteKat) return; // bereits migriert oder frische Installation

  // Alte → neue Mappings
  const ersetzen = [
    {
      alt: 'Fleisch & Fisch',
      neu: [
        { name: 'Fleisch',               icon: '🥩', color: '#F44336' },
        { name: 'Fisch & Meeresfrüchte', icon: '🐟', color: '#0288D1' },
      ],
    },
    {
      alt: 'Milchprodukte',
      neu: [
        { name: 'Milch',           icon: '🥛', color: '#E3F2FD' },
        { name: 'Käse',            icon: '🧀', color: '#FFF9C4' },
        { name: 'Joghurt & Quark', icon: '🫙', color: '#F8BBD0' },
      ],
    },
    {
      alt: 'Butter & Öle',
      neu: [
        { name: 'Butter', icon: '🧈', color: '#FFC107' },
        { name: 'Öle',    icon: '🫒', color: '#AED581' },
      ],
    },
    {
      alt: 'Wasser & Softdrinks',
      neu: [
        { name: 'Wasser',     icon: '💧', color: '#03A9F4' },
        { name: 'Softdrinks', icon: '🥤', color: '#F06292' },
      ],
    },
  ];

  // Neue Kategorien die einfach hinzugefügt werden
  const hinzufuegen = [
    { name: 'Eier',         group_name: 'Lebensmittel', icon: '🥚', color: '#FFFDE7' },
    { name: 'Lieferdienst', group_name: 'Ausgehen',     icon: '🛵', color: '#FF5722' },
    { name: 'Kultur',       group_name: 'Ausgehen',     icon: '🎭', color: '#7B1FA2' },
    { name: 'Trinkgeld',    group_name: 'Ausgehen',     icon: '💰', color: '#FFD700' },
    { name: 'Schuhe',       group_name: 'Sonstiges',    icon: '👟', color: '#795548' },
  ];

  const delStmt = db.prepare("DELETE FROM categories WHERE name = ? AND tenant_id IS NULL");
  const insStmt = db.prepare(
    "INSERT OR IGNORE INTO categories (tenant_id, name, color, icon, group_name) VALUES (NULL, ?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    for (const { alt, neu } of ersetzen) {
      // Gruppe der alten Kategorie ermitteln
      const alte = db.prepare("SELECT group_name FROM categories WHERE name = ? AND tenant_id IS NULL").get(alt);
      if (!alte) continue;
      delStmt.run(alt);
      for (const k of neu) {
        insStmt.run(k.name, k.color, k.icon, alte.group_name);
      }
    }
    for (const k of hinzufuegen) {
      insStmt.run(k.name, k.color, k.icon, k.group_name);
    }
  });
  tx();
  console.log('[DB] Kategorien-Migration: granularere Kategorien eingefügt');
}

migrateKategorien();

module.exports = db;
