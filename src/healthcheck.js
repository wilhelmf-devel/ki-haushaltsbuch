'use strict';
// Docker healthcheck – exits 0 (healthy) or 1 (unhealthy).
// Checks: HTTP reachability, SQLite access, stuck worker jobs.
// Uses only Node.js built-ins + better-sqlite3 (already in node_modules).

const http = require('http');
const path = require('path');

// ── 1. SQLite ────────────────────────────────────────────────────────────────
try {
  const Database = require('better-sqlite3');
  const DB_PATH  = process.env.DB_PATH || '/data/haushaltsbuch.db';
  const db       = new Database(DB_PATH, { readonly: true });

  // Basic connectivity
  db.prepare('SELECT 1').get();

  // Stuck jobs: 'processing' for more than 5 minutes → worker likely dead
  const stuckJobs = db.prepare(`
    SELECT COUNT(*) AS c FROM jobs
    WHERE status = 'processing'
      AND updated_at < datetime('now', '-30 minutes')
  `).get();

  db.close();

  if (stuckJobs.c > 0) {
    console.error(`[healthcheck] ${stuckJobs.c} stuck job(s) detected`);
    process.exit(1);
  }
} catch (err) {
  console.error('[healthcheck] DB check failed:', err.message);
  process.exit(1);
}

// ── 2. HTTP ──────────────────────────────────────────────────────────────────
http.get('http://localhost:3000/api/version', (res) => {
  if (res.statusCode !== 200) {
    console.error('[healthcheck] HTTP status:', res.statusCode);
    process.exit(1);
  }
  process.exit(0);
}).on('error', (err) => {
  console.error('[healthcheck] HTTP error:', err.message);
  process.exit(1);
});
