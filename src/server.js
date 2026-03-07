// Express-Server + Worker-Start
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const { starteWorker } = require('./worker');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_MB = parseInt(process.env.UPLOAD_MAX_MB || '25', 10);
const UPLOAD_DIR = '/data/uploads';

// Uploads-Verzeichnis sicherstellen
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Multer für Datei-Upload
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const zeitstempel = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${zeitstempel}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const erlaubt = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (erlaubt.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Nicht unterstütztes Format: ${file.mimetype}`));
    }
  },
});

// API-Routen einbinden
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/export', require('./routes/export'));
app.use('/api/settings', require('./routes/settings'));

// Datei-Upload-Route
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

  const { tenant_id, receipt_date } = req.body;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id erforderlich' });

  // Platzhalter-Receipt anlegen
  const result = db.prepare(`
    INSERT INTO receipts (tenant_id, receipt_date, receipt_type, total_amount, image_path, ocr_status)
    VALUES (?, ?, 'other', 0, ?, 'pending')
  `).run(
    parseInt(tenant_id),
    receipt_date || new Date().toISOString().split('T')[0],
    req.file.filename
  );

  const receiptId = result.lastInsertRowid;

  // OCR-Job anlegen
  db.prepare(`
    INSERT INTO jobs (type, status, payload) VALUES ('ocr', 'pending', ?)
  `).run(JSON.stringify({
    receipt_id: receiptId,
    image_path: path.join(UPLOAD_DIR, req.file.filename),
  }));

  res.status(202).json({
    id: receiptId,
    message: 'Beleg gespeichert, wird verarbeitet...',
  });
});

// Originalbild abrufen
app.get('/api/image/:filename', (req, res) => {
  const dateiname = path.basename(req.params.filename); // Path Traversal verhindern
  const vollPfad = path.join(UPLOAD_DIR, dateiname);
  if (!fs.existsSync(vollPfad)) {
    return res.status(404).json({ error: 'Bild nicht gefunden' });
  }
  res.sendFile(vollPfad);
});

// Job-Queue Statusabfrage
app.get('/api/jobs', (req, res) => {
  const jobs = db.prepare(`
    SELECT j.*, r.store_name, r.receipt_date
    FROM jobs j
    LEFT JOIN receipts r ON r.id = JSON_EXTRACT(j.payload, '$.receipt_id')
    WHERE j.status IN ('pending', 'processing', 'failed')
    ORDER BY j.created_at DESC
    LIMIT 50
  `).all();
  res.json(jobs);
});

// Fehlgeschlagenen Job neu starten
app.post('/api/jobs/retry/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });

  db.prepare(`
    UPDATE jobs SET status = 'pending', error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(req.params.id);

  res.json({ success: true });
});

// Alle Items eines Mandanten neu kategorisieren
app.post('/api/jobs/recategorize', (req, res) => {
  const { tenant_id } = req.body;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id erforderlich' });

  const { recategorizeAll } = require('./worker');
  recategorizeAll(tenant_id).then(anzahl => {
    res.json({ success: true, receipts_queued: anzahl });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

// Fehlerbehandlung für Multer
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Datei zu groß. Maximum: ${MAX_MB}MB` });
  }
  if (err.message?.startsWith('Nicht unterstütztes Format')) {
    return res.status(415).json({ error: err.message });
  }
  console.error('[Server] Fehler:', err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

// SPA Fallback: alle nicht-API-Routen zu index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`[Server] Haushaltsbuch läuft auf Port ${PORT}`);
  starteWorker();
});

module.exports = app;
