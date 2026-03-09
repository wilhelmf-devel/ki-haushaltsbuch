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

function statusLabel(r) {
  // OCR done, but categorization still pending for some items
  if (r.ocr_status === 'done' && r.uncategorized_count > 0) {
    return { cls: 'processing', label: '🏷️ Kategorisierung läuft' };
  }
  return { cls: r.ocr_status || 'done', label: STATUS_LABELS[r.ocr_status] || '' };
}

export async function renderReceipts(container, tenantId) {
  if (!tenantId) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Bitte wähle einen Mandanten aus.</p></div>';
    return;
  }

  const heute = new Date();
  let monatState = { jahr: heute.getFullYear(), m: heute.getMonth() }; // 0-indexed
  let datumModus = 'monat'; // 'monat' | 'alle' | 'zeitraum'

  function monatStart(j, m) {
    return `${j}-${String(m + 1).padStart(2, '0')}-01`;
  }
  function monatEnde(j, m) {
    const letzter = new Date(j, m + 1, 0);
    return `${j}-${String(m + 1).padStart(2, '0')}-${String(letzter.getDate()).padStart(2, '0')}`;
  }
  function monatText(j, m) {
    return new Date(j, m, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  }

  let filter = {
    tenant_id: tenantId,
    limit: 50,
    offset: 0,
    from: monatStart(monatState.jahr, monatState.m),
    to:   monatEnde(monatState.jahr, monatState.m),
  };

  let alleKategorien = [];
  try {
    alleKategorien = await api.getCategories(tenantId);
  } catch {}

  container.innerHTML = `
    <div class="search-bar">
      <input type="search" class="search-input" id="receipts-search" placeholder="Suche...">
    </div>

    <!-- Monats-Navigation -->
    <div class="monat-nav">
      <button class="btn btn-ghost btn-icon" id="monat-prev" title="Vorheriger Monat">‹</button>
      <span id="monat-label" class="monat-label">${monatText(monatState.jahr, monatState.m)}</span>
      <button class="btn btn-ghost btn-icon" id="monat-next" title="Nächster Monat">›</button>
      <button class="btn btn-ghost btn-sm" id="alle-btn">Alle</button>
      <button class="btn btn-ghost btn-icon" id="zeitraum-btn" title="Eigener Zeitraum">📅</button>
    </div>

    <!-- Eigener Zeitraum (ausklappbar) -->
    <div id="custom-range" class="hidden" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <input type="date" class="filter-select" id="filter-von" style="flex:1">
      <span style="color:var(--text-secondary);flex-shrink:0">–</span>
      <input type="date" class="filter-select" id="filter-bis" style="flex:1">
    </div>

    <div class="filter-bar">
      <select class="filter-select" id="filter-typ">
        <option value="">Alle Typen</option>
        <option value="itemized">🧾 Kassenbon</option>
        <option value="fuel">⛽ Tankstelle</option>
        <option value="restaurant">🍽️ Restaurant</option>
        <option value="other">📄 Sonstiges</option>
      </select>
    </div>

    <div id="receipts-list"></div>
    <div id="receipts-load-more" class="hidden" style="text-align:center;padding:12px">
      <button class="btn btn-secondary" id="load-more-btn">Mehr laden</button>
    </div>
  `;

  // Monat-Nav aktualisieren (Label + Button-States)
  function aktualisiereMonatNav() {
    const label = document.getElementById('monat-label');
    const prev  = document.getElementById('monat-prev');
    const next  = document.getElementById('monat-next');
    const alleBtn = document.getElementById('alle-btn');

    if (datumModus === 'alle') {
      label.textContent = 'Alle Zeiten';
    } else if (datumModus === 'zeitraum') {
      label.textContent = 'Eigener Zeitraum';
    } else {
      label.textContent = monatText(monatState.jahr, monatState.m);
    }

    const navAktiv = datumModus === 'monat';
    prev.disabled = !navAktiv;
    next.disabled = !navAktiv;
    prev.style.opacity = navAktiv ? '' : '0.35';
    next.style.opacity = navAktiv ? '' : '0.35';
    alleBtn.style.fontWeight = datumModus === 'alle' ? '700' : '';

    // Custom-Range-Zeile ein/ausblenden
    const cr = document.getElementById('custom-range');
    if (datumModus === 'zeitraum') {
      cr.classList.remove('hidden');
      cr.style.display = 'flex';
    } else {
      cr.classList.add('hidden');
    }
  }

  // Monats-Navigation
  document.getElementById('monat-prev').addEventListener('click', () => {
    let { jahr, m } = monatState;
    m--; if (m < 0) { m = 11; jahr--; }
    monatState = { jahr, m };
    datumModus = 'monat';
    filter.from = monatStart(jahr, m);
    filter.to   = monatEnde(jahr, m);
    filter.offset = 0;
    aktualisiereMonatNav();
    ladeUndRendere();
  });

  document.getElementById('monat-next').addEventListener('click', () => {
    let { jahr, m } = monatState;
    m++; if (m > 11) { m = 0; jahr++; }
    monatState = { jahr, m };
    datumModus = 'monat';
    filter.from = monatStart(jahr, m);
    filter.to   = monatEnde(jahr, m);
    filter.offset = 0;
    aktualisiereMonatNav();
    ladeUndRendere();
  });

  // "Alle" – kein Datumsfilter
  document.getElementById('alle-btn').addEventListener('click', () => {
    datumModus = 'alle';
    filter.from = undefined;
    filter.to   = undefined;
    filter.offset = 0;
    aktualisiereMonatNav();
    ladeUndRendere();
  });

  // Eigener Zeitraum ein-/ausklappen
  document.getElementById('zeitraum-btn').addEventListener('click', () => {
    if (datumModus === 'zeitraum') {
      // Zurück zum Monatsmodus
      datumModus = 'monat';
      filter.from = monatStart(monatState.jahr, monatState.m);
      filter.to   = monatEnde(monatState.jahr, monatState.m);
    } else {
      datumModus = 'zeitraum';
      // Datumseingaben mit aktuellem Monat vorbelegen
      const vonEl = document.getElementById('filter-von');
      const bisEl = document.getElementById('filter-bis');
      if (!vonEl.value) vonEl.value = filter.from || monatStart(monatState.jahr, monatState.m);
      if (!bisEl.value) bisEl.value = filter.to   || monatEnde(monatState.jahr, monatState.m);
    }
    filter.offset = 0;
    aktualisiereMonatNav();
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

  // Typ-Filter
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
            <div class="receipt-status status-${statusLabel(r).cls}">${statusLabel(r).label}</div>
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
