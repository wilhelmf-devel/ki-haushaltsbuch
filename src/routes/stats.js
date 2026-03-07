// Routen für Auswertungen/Statistiken
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { tenant_id, from, to } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id erforderlich' });

  const params = [tenant_id];
  const datumsfilter = [];
  if (from) { datumsfilter.push('r.receipt_date >= ?'); params.push(from); }
  if (to)   { datumsfilter.push('r.receipt_date <= ?'); params.push(to); }
  const wo = datumsfilter.length ? ' AND ' + datumsfilter.join(' AND ') : '';

  // Gesamtausgaben
  const gesamtRow = db.prepare(`
    SELECT ROUND(SUM(total_amount), 2) as gesamt, COUNT(*) as anzahl_belege
    FROM receipts r
    WHERE r.tenant_id = ?${wo}
  `).get(...params);

  // Ausgaben nach Kategorie
  const nachKategorie = db.prepare(`
    SELECT
      COALESCE(c.name, 'Unkategorisiert') AS name,
      COALESCE(c.group_name, '') AS group_name,
      COALESCE(c.color, '#9E9E9E') AS color,
      COALESCE(c.icon, '📦') AS icon,
      ROUND(SUM(ri.total_price), 2) AS summe
    FROM receipts r
    JOIN receipt_items ri ON ri.receipt_id = r.id
    LEFT JOIN categories c ON c.id = ri.category_id
    WHERE r.tenant_id = ?${wo}
    GROUP BY ri.category_id
    ORDER BY summe DESC
  `).all(...params);

  // Ausgaben nach Monat (letzte 12 Monate)
  const nachMonat = db.prepare(`
    SELECT
      strftime('%Y-%m', r.receipt_date) AS monat,
      ROUND(SUM(r.total_amount), 2) AS summe
    FROM receipts r
    WHERE r.tenant_id = ?
    GROUP BY monat
    ORDER BY monat DESC
    LIMIT 12
  `).all(tenant_id);

  // Ausgaben nach Geschäft (Top 10)
  const nachGeschaeft = db.prepare(`
    SELECT
      COALESCE(r.store_name, 'Unbekannt') AS name,
      ROUND(SUM(r.total_amount), 2) AS summe,
      COUNT(*) AS anzahl
    FROM receipts r
    WHERE r.tenant_id = ?${wo}
    GROUP BY r.store_name
    ORDER BY summe DESC
    LIMIT 10
  `).all(...params);

  res.json({
    gesamt: gesamtRow.gesamt || 0,
    anzahl_belege: gesamtRow.anzahl_belege || 0,
    nach_kategorie: nachKategorie,
    nach_monat: nachMonat.reverse(),
    nach_geschaeft: nachGeschaeft,
  });
});

module.exports = router;
