// Belege-Liste View
'use strict';

import { api } from '../api.js';
import { zeigeToast, navigiere } from '../app.js';

const TYP_ICONS = {
  itemized: '🧾',
  fuel: '⛽',
  restaurant: '🍽️',
  other: '📄',
};

const STATUS_LABELS = {
  pending: '⏳ Ausstehend',
  processing: '🔄 Wird verarbeitet',
  done: '✅ Fertig',
  failed: '❌ Fehler',
  skipped: '✍️ Manuell',
};

export async function renderReceipts(container, tenantId) {
  if (!tenantId) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Bitte wähle einen Mandanten aus.</p></div>';
    return;
  }

  let filter = { tenant_id: tenantId, limit: 50, offset: 0 };
  let alleKategorien = [];

  try {
    alleKategorien = await api.getCategories(tenantId);
  } catch {}

  container.innerHTML = `
    <div class="search-bar">
      <input type="search" class="search-input" id="receipts-search" placeholder="Suche...">
    </div>
    <div class="filter-bar">
      <select class="filter-select" id="filter-typ">
        <option value="">Alle Typen</option>
        <option value="itemized">🧾 Itemized</option>
        <option value="fuel">⛽ Tankstelle</option>
        <option value="restaurant">🍽️ Restaurant</option>
        <option value="other">📄 Sonstiges</option>
      </select>
      <input type="date" class="filter-select" id="filter-von" title="Von">
      <input type="date" class="filter-select" id="filter-bis" title="Bis">
    </div>
    <div id="receipts-list"></div>
    <div id="receipts-load-more" class="hidden" style="text-align:center;padding:12px">
      <button class="btn btn-secondary" id="load-more-btn">Mehr laden</button>
    </div>
  `;

  let suchtimer = null;
  document.getElementById('receipts-search').addEventListener('input', (e) => {
    clearTimeout(suchtimer);
    suchtimer = setTimeout(() => {
      filter.search = e.target.value || undefined;
      filter.offset = 0;
      ladeUndRendere();
    }, 350);
  });

  document.getElementById('filter-typ').addEventListener('change', (e) => {
    filter.type = e.target.value || undefined;
    filter.offset = 0;
    ladeUndRendere();
  });

  document.getElementById('filter-von').addEventListener('change', (e) => {
    filter.from = e.target.value || undefined;
    filter.offset = 0;
    ladeUndRendere();
  });

  document.getElementById('filter-bis').addEventListener('change', (e) => {
    filter.to = e.target.value || undefined;
    filter.offset = 0;
    ladeUndRendere();
  });

  document.getElementById('load-more-btn')?.addEventListener('click', () => {
    filter.offset += 50;
    ladeUndRendere(true);
  });

  async function ladeUndRendere(append = false) {
    const liste = document.getElementById('receipts-list');
    if (!append) liste.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const { receipts, total } = await api.getReceipts({ ...filter });

      if (!append) liste.innerHTML = '';

      if (receipts.length === 0 && !append) {
        liste.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div><p>Keine Belege gefunden.</p></div>';
        document.getElementById('receipts-load-more').classList.add('hidden');
        return;
      }

      for (const r of receipts) {
        const karte = document.createElement('div');
        karte.className = 'receipt-card';
        const datum = new Date(r.receipt_date).toLocaleDateString('de-DE');
        karte.innerHTML = `
          <div class="receipt-icon">${TYP_ICONS[r.receipt_type] || '📄'}</div>
          <div class="receipt-info">
            <div class="receipt-store">${r.store_name || 'Unbekanntes Geschäft'}</div>
            <div class="receipt-meta">${datum} · ${r.item_count > 0 ? `${r.item_count} Positionen` : r.receipt_type}</div>
            ${r.sum_mismatch ? '<div class="mismatch-banner">⚠️ Summe weicht ab – bitte prüfen</div>' : ''}
          </div>
          <div style="text-align:right">
            <div class="receipt-amount">${r.total_amount.toFixed(2)}€</div>
            <div class="receipt-status status-${r.ocr_status || 'done'}">${STATUS_LABELS[r.ocr_status] || ''}</div>
          </div>
        `;
        karte.addEventListener('click', () => navigiere('receipt-detail', { id: r.id }));
        liste.appendChild(karte);
      }

      // Load More Button
      const loadMore = document.getElementById('receipts-load-more');
      const gezeigt = (filter.offset || 0) + receipts.length;
      if (gezeigt < total) {
        loadMore.classList.remove('hidden');
      } else {
        loadMore.classList.add('hidden');
      }
    } catch (err) {
      liste.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
    }
  }

  ladeUndRendere();
}
