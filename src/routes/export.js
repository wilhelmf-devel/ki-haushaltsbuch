// Routen für Datenexport
'use strict';

const express = require('express');
const router = express.Router();
const { generiereCSV, generiereXLSX } = require('../services/export');

// CSV-Export
router.get('/csv', (req, res) => {
  const { tenant_id, from, to } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id erforderlich' });

  const csv = generiereCSV(tenant_id, from, to);
  const dateiname = `haushaltsbuch_${tenant_id}_${from || 'all'}_${to || 'all'}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${dateiname}"`);
  res.send('\uFEFF' + csv); // BOM für korrekte Excel-Öffnung
});

// XLSX-Export
router.get('/xlsx', (req, res) => {
  const { tenant_id, from, to } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id erforderlich' });

  const buffer = generiereXLSX(tenant_id, from, to);
  const dateiname = `haushaltsbuch_${tenant_id}_${from || 'all'}_${to || 'all'}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${dateiname}"`);
  res.send(buffer);
});

module.exports = router;
