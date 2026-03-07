// Export-Service: CSV und XLSX Generierung
'use strict';

const db = require('../db');

// Daten für Export abfragen
function ladeExportDaten(tenantId, von, bis) {
  let sql = `
    SELECT
      r.receipt_date AS Datum,
      r.store_name AS Geschäft,
      r.receipt_type AS Typ,
      ri.description AS Position,
      ri.quantity AS Menge,
      ri.unit_price AS Einzelpreis,
      ri.total_price AS Gesamtpreis,
      COALESCE(c.name, 'Unkategorisiert') AS Kategorie,
      COALESCE(c.group_name, '') AS Gruppe,
      r.notes AS Notizen
    FROM receipts r
    LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
    LEFT JOIN categories c ON c.id = ri.category_id
    WHERE r.tenant_id = ?
  `;
  const params = [tenantId];

  if (von) { sql += ' AND r.receipt_date >= ?'; params.push(von); }
  if (bis) { sql += ' AND r.receipt_date <= ?'; params.push(bis); }
  sql += ' ORDER BY r.receipt_date DESC, r.id, ri.id';

  return db.prepare(sql).all(...params);
}

// CSV generieren
function generiereCSV(tenantId, von, bis) {
  const zeilen = ladeExportDaten(tenantId, von, bis);

  if (zeilen.length === 0) {
    return 'Datum,Geschäft,Typ,Position,Menge,Einzelpreis,Gesamtpreis,Kategorie,Gruppe,Notizen\n';
  }

  const kopfzeile = Object.keys(zeilen[0]).join(',');
  const datenzeilen = zeilen.map(z =>
    Object.values(z).map(v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      // CSV-Escaping: Anführungszeichen und Kommas in Werten
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  );

  return [kopfzeile, ...datenzeilen].join('\n');
}

// XLSX generieren
function generiereXLSX(tenantId, von, bis) {
  const XLSX = require('xlsx');
  const zeilen = ladeExportDaten(tenantId, von, bis);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(zeilen);

  // Spaltenbreiten anpassen
  ws['!cols'] = [
    { wch: 12 }, // Datum
    { wch: 20 }, // Geschäft
    { wch: 12 }, // Typ
    { wch: 35 }, // Position
    { wch: 8  }, // Menge
    { wch: 12 }, // Einzelpreis
    { wch: 12 }, // Gesamtpreis
    { wch: 20 }, // Kategorie
    { wch: 15 }, // Gruppe
    { wch: 30 }, // Notizen
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Ausgaben');

  // Zusammenfassung nach Kategorie
  const kategorienSummen = db.prepare(`
    SELECT
      COALESCE(c.name, 'Unkategorisiert') AS Kategorie,
      COALESCE(c.group_name, '') AS Gruppe,
      ROUND(SUM(ri.total_price), 2) AS Summe
    FROM receipts r
    LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
    LEFT JOIN categories c ON c.id = ri.category_id
    WHERE r.tenant_id = ?
    ${von ? 'AND r.receipt_date >= ?' : ''}
    ${bis ? 'AND r.receipt_date <= ?' : ''}
    GROUP BY c.id
    ORDER BY Summe DESC
  `).all(...[tenantId, ...(von ? [von] : []), ...(bis ? [bis] : [])]);

  const wsSummary = XLSX.utils.json_to_sheet(kategorienSummen);
  wsSummary['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Kategorien');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generiereCSV, generiereXLSX };
