// Auth-Middleware: Reverse-Proxy-Header auslesen, req.user setzen
// Nur aktiv wenn AUTH_HEADER in .env gesetzt ist.
'use strict';

const db = require('../db');

const AUTH_HEADER  = process.env.AUTH_HEADER  || null;
const AUTH_ADMINS  = (process.env.AUTH_ADMINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function authMiddleware(req, res, next) {
  // Feature inaktiv → durchlassen, kein User-Kontext
  if (!AUTH_HEADER) {
    req.user = null;
    return next();
  }

  // Header auslesen (HTTP-Header werden von Node.js immer lowercase gespeichert)
  const username = req.headers[AUTH_HEADER.toLowerCase()];
  if (!username) {
    return res.status(403).json({
      error: 'Zugriff verweigert: Authentifizierungs-Header fehlt. Bitte über den Reverse Proxy zugreifen.',
    });
  }

  const isAdmin = AUTH_ADMINS.includes(username);

  // Benutzer beim ersten Login registrieren
  db.prepare('INSERT OR IGNORE INTO known_users (username) VALUES (?)').run(username);

  // Bootstrap: user_tenants leer + Mandanten vorhanden + Admin → alle Mandanten zuweisen
  const tableEmpty = db.prepare('SELECT COUNT(*) as c FROM user_tenants').get().c === 0;
  if (tableEmpty && isAdmin) {
    const tenants = db.prepare('SELECT id FROM tenants').all();
    if (tenants.length > 0) {
      const insert = db.prepare(
        'INSERT OR IGNORE INTO user_tenants (username, tenant_id) VALUES (?, ?)'
      );
      db.transaction(() => {
        for (const t of tenants) insert.run(username, t.id);
      })();
      console.log(`[Auth] Bootstrap: ${tenants.length} Mandant(en) an Admin '${username}' zugewiesen`);
    }
  }

  req.user = { username, isAdmin };
  next();
}

function isAuthActive() {
  return !!AUTH_HEADER;
}

module.exports = { authMiddleware, isAuthActive };
