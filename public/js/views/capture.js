// Erfassen-View: Fotos hochladen, Schnelleingabe, Manuelle Eingabe
'use strict';

import { api } from '../api.js';
import { zeigeToast, navigiere } from '../app.js';
import { queueUpload, flushQueue } from '../offline.js';

// Schnelleingabe-Typen: label = Anzeige, desc = Item-Beschreibung, kat = Kategoriename in DB
const SCHNELL_TYPEN = [
  { value: 'fuel',          label: '⛽ Tankstelle',       desc: 'Tankfüllung',     receipt_type: 'fuel',       kat: 'Tankstelle' },
  { value: 'restaurant',    label: '🍽️ Restaurant',       desc: 'Restaurant',      receipt_type: 'restaurant', kat: 'Restaurant' },
  { value: 'cafe',          label: '☕ Café & Bäckerei',  desc: 'Café & Bäckerei', receipt_type: 'other',      kat: 'Café & Bäckerei' },
  { value: 'lieferdienst',  label: '🛵 Lieferdienst',     desc: 'Lieferdienst',    receipt_type: 'other',      kat: 'Lieferdienst' },
  { value: 'parkgebuehren', label: '🅿️ Parkgebühren',    desc: 'Parken',          receipt_type: 'other',      kat: 'Parkgebühren' },
  { value: 'oepnv',         label: '🚌 ÖPNV',             desc: 'ÖPNV',            receipt_type: 'other',      kat: 'ÖPNV' },
  { value: 'sport',         label: '🏃 Sport',            desc: 'Sport',           receipt_type: 'other',      kat: 'Sport' },
  { value: 'freizeit',      label: '🎯 Freizeit',         desc: 'Freizeit',        receipt_type: 'other',      kat: 'Freizeit' },
  { value: 'hobby',         label: '🎨 Hobby',            desc: 'Hobby',           receipt_type: 'other',      kat: 'Hobby' },
  { value: 'kultur',        label: '🎭 Kultur',           desc: 'Kultur',          receipt_type: 'other',      kat: 'Kultur' },
  { value: 'other',         label: '📄 Sonstiges',        desc: 'Sonstiges',       receipt_type: 'other',      kat: null },
];

export async function renderCapture(container, tenantId) {
  if (!tenantId) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Bitte wähle einen Mandanten aus.</p></div>';
    return;
  }

  const kategorien = await api.getCategories(tenantId);
  const heuteStr = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="tabs" id="capture-tabs">
      <button class="tab-btn active" data-tab="foto">📷 Foto/PDF</button>
      <button class="tab-btn" data-tab="schnell">⚡ Schnell</button>
      <button class="tab-btn" data-tab="manuell">✏️ Manuell</button>
    </div>

    <!-- Tab: Foto/PDF Upload -->
    <div id="tab-foto" class="tab-content">
      <div class="upload-area" id="upload-area">
        <div class="upload-icon">📷</div>
        <p class="upload-text">Foto aufnehmen oder Datei auswählen</p>
        <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px">JPG, PNG, WebP, HEIC, PDF – max. ${window._maxMB || 25}MB</p>
        <input type="file" class="upload-input" id="file-input"
          accept="image/*,application/pdf" capture="environment">
      </div>
      <div id="upload-progress" class="hidden" style="text-align:center;padding:20px">
        <div class="spinner"></div>
        <p style="color:var(--text-secondary);margin-top:8px">Beleg wird gespeichert...</p>
      </div>
    </div>

    <!-- Tab: Schnelleingabe -->
    <div id="tab-schnell" class="tab-content hidden">
      <form id="schnell-form" class="card">
        <div class="form-group">
          <label>Datum</label>
          <input type="date" id="schnell-datum" value="${heuteStr}" required>
        </div>
        <div class="form-group">
          <label>Art der Ausgabe</label>
          <select id="schnell-typ">
            ${SCHNELL_TYPEN.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Gesamtbetrag (€)</label>
          <input type="number" id="schnell-betrag" step="0.01" min="0" placeholder="0.00" required>
        </div>
        <div class="form-group">
          <label>Geschäft / Ort</label>
          <input type="text" id="schnell-geschaeft" placeholder="z.B. Aral, Starbucks …">
        </div>
        <div class="form-group">
          <label>Notiz</label>
          <input type="text" id="schnell-notiz" placeholder="Optional">
        </div>
        <button type="submit" class="btn btn-primary btn-block">Speichern</button>
      </form>
    </div>

    <!-- Tab: Manuelle Eingabe -->
    <div id="tab-manuell" class="tab-content hidden">
      <div class="card">
        <div class="form-row" style="grid-template-columns:140px 1fr;align-items:end">
          <div class="form-group">
            <label>Datum</label>
            <input type="date" id="manuell-datum" value="${heuteStr}" required>
          </div>
          <div class="form-group">
            <label>Geschäft</label>
            <input type="text" id="manuell-geschaeft" placeholder="Name">
          </div>
        </div>

        <div id="manuell-items" class="manuell-items">
          <!-- Positions-Zeilen werden dynamisch hinzugefügt -->
        </div>

        <button class="btn btn-secondary btn-sm" id="manuell-add-item" style="margin-bottom:16px">
          + Position hinzufügen
        </button>

        <div class="divider"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
          <span style="font-weight:600">Gesamt</span>
          <span id="manuell-gesamt" style="font-weight:700;font-size:1.1rem">0.00€</span>
        </div>

        <button class="btn btn-primary btn-block" id="manuell-save" style="margin-top:16px">
          Beleg speichern
        </button>
      </div>
    </div>
  `;

  // Tab-Switching
  const tabs = document.getElementById('capture-tabs');
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });

  // ===== FOTO UPLOAD =====
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  const uploadProgress = document.getElementById('upload-progress');

  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) starteUpload(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) starteUpload(fileInput.files[0]);
  });

  async function starteUpload(file) {
    uploadArea.classList.add('hidden');
    uploadProgress.classList.remove('hidden');

    if (!navigator.onLine) {
      // Offline: In Queue speichern
      try {
        await queueUpload(file, tenantId, heuteStr);
        zeigeToast('Offline gespeichert – wird automatisch hochgeladen wenn Verbindung besteht.', 'info');
        uploadArea.classList.remove('hidden');
        uploadProgress.classList.add('hidden');
        fileInput.value = '';
      } catch (err) {
        zeigeToast(`Fehler: ${err.message}`, 'error');
        uploadArea.classList.remove('hidden');
        uploadProgress.classList.add('hidden');
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenant_id', tenantId);
      formData.append('receipt_date', heuteStr);

      await api.upload(formData);
      zeigeToast('Beleg gespeichert, KI-Analyse läuft...', 'success');
      navigiere('receipts');
    } catch (err) {
      zeigeToast(`Upload-Fehler: ${err.message}`, 'error');
      uploadArea.classList.remove('hidden');
      uploadProgress.classList.add('hidden');
      fileInput.value = '';
    }
  }

  // ===== SCHNELLEINGABE =====
  document.getElementById('schnell-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const typValue   = document.getElementById('schnell-typ').value;
      const typDef     = SCHNELL_TYPEN.find(t => t.value === typValue) || SCHNELL_TYPEN.at(-1);
      const betrag     = parseFloat(document.getElementById('schnell-betrag').value) || 0;
      const geschaeft  = document.getElementById('schnell-geschaeft').value.trim() || null;
      const katId      = typDef.kat
        ? (kategorien.find(k => k.name === typDef.kat)?.id || null)
        : null;

      await api.createReceipt({
        tenant_id:    tenantId,
        receipt_date: document.getElementById('schnell-datum').value,
        receipt_type: typDef.receipt_type,
        total_amount: betrag,
        store_name:   geschaeft,
        notes:        document.getElementById('schnell-notiz').value.trim() || null,
        // Einzelnes Item mit Kategorie → ermöglicht Auswertung
        items: [{
          description: geschaeft || typDef.desc,
          quantity:    1,
          unit_price:  betrag,
          total_price: betrag,
          category_id: katId,
        }],
      });
      zeigeToast('Beleg gespeichert!', 'success');
      navigiere('receipts');
    } catch (err) {
      zeigeToast(`Fehler: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ===== MANUELLE EINGABE =====
  const itemsContainer = document.getElementById('manuell-items');
  let itemZaehler = 0;

  function aktualisiereGesamt() {
    const inputs = itemsContainer.querySelectorAll('.item-total');
    const gesamt = Array.from(inputs).reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0);
    document.getElementById('manuell-gesamt').textContent = `${gesamt.toFixed(2)}€`;
  }

  function fuegeItemHinzu() {
    const id = ++itemZaehler;
    const zeile = document.createElement('div');
    zeile.dataset.id = id;
    const inputStyle = 'padding:7px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.85rem;min-width:0;box-sizing:border-box';
    zeile.innerHTML = `
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <!-- Zeile 1: Beschreibung + Löschen-Button -->
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          <input type="text" class="item-desc" placeholder="Beschreibung"
            style="${inputStyle};flex:1">
          <button class="btn btn-ghost btn-sm btn-icon item-remove" title="Entfernen" style="flex-shrink:0">✕</button>
        </div>
        <!-- Zeile 2: Menge, Einzelpreis, Gesamt -->
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input type="number" class="item-qty" value="1" min="0.01" step="0.01"
            style="${inputStyle};width:62px" placeholder="Menge">
          <input type="number" class="item-unit" step="0.01" min="0"
            style="${inputStyle};flex:1" placeholder="Einzelpreis">
          <input type="number" class="item-total" step="0.01" min="0"
            style="${inputStyle};flex:1" placeholder="Gesamt">
        </div>
        <!-- Zeile 3: Kategorie -->
        <select class="item-cat" style="${inputStyle};width:100%">
          <option value="">Kategorie …</option>
          ${kategorien.map(k => `<option value="${k.id}">${k.icon || ''} ${k.name}</option>`).join('')}
        </select>
      </div>
    `;

    // Gesamt auto-berechnen
    const qty = zeile.querySelector('.item-qty');
    const unit = zeile.querySelector('.item-unit');
    const total = zeile.querySelector('.item-total');
    const autoCalc = () => {
      const q = parseFloat(qty.value) || 1;
      const u = parseFloat(unit.value) || 0;
      if (u > 0) total.value = (q * u).toFixed(2);
      aktualisiereGesamt();
    };
    qty.addEventListener('input', autoCalc);
    unit.addEventListener('input', autoCalc);
    total.addEventListener('input', aktualisiereGesamt);

    zeile.querySelector('.item-remove').addEventListener('click', () => {
      zeile.remove();
      aktualisiereGesamt();
    });

    itemsContainer.appendChild(zeile);
  }

  document.getElementById('manuell-add-item').addEventListener('click', fuegeItemHinzu);
  fuegeItemHinzu(); // Eine Zeile initial

  document.getElementById('manuell-save').addEventListener('click', async () => {
    const btn = document.getElementById('manuell-save');
    const items = [];
    let gueltig = true;

    for (const zeile of itemsContainer.children) {
      const desc = zeile.querySelector('.item-desc').value.trim();
      const total = parseFloat(zeile.querySelector('.item-total').value);
      if (!desc || isNaN(total)) { gueltig = false; continue; }
      items.push({
        description: desc,
        quantity: parseFloat(zeile.querySelector('.item-qty').value) || 1,
        unit_price: parseFloat(zeile.querySelector('.item-unit').value) || total,
        total_price: total,
        category_id: parseInt(zeile.querySelector('.item-cat').value) || null,
      });
    }

    if (!gueltig || items.length === 0) {
      zeigeToast('Bitte alle Positionen ausfüllen', 'warning');
      return;
    }

    const gesamt = items.reduce((s, i) => s + i.total_price, 0);
    btn.disabled = true;

    try {
      await api.createReceipt({
        tenant_id: tenantId,
        receipt_date: document.getElementById('manuell-datum').value,
        store_name: document.getElementById('manuell-geschaeft').value || null,
        receipt_type: 'itemized',
        total_amount: gesamt,
        items,
      });
      zeigeToast('Beleg gespeichert!', 'success');
      navigiere('receipts');
    } catch (err) {
      zeigeToast(`Fehler: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
