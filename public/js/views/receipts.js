// Belege-Liste View
'use strict';

import { api } from '../api.js';
import { navigiere } from '../app.js';
import * as zeit from '../period.js';
import { renderZeitraumNav } from '../zeitraum-nav.js';

const TYP_ICONS = {
  itemized: '🧾',
  fuel: '⛽',
  restaurant: '🍽️',
  other: '📄',
};

const TYP_LABELS = {
  itemized: 'Kassenbon',
  fuel: 'Tankquittung',
  restaurant: 'Restaurantrechnung',
  other: 'Sonstiges',
};

// Status nur zeigen, wenn er etwas bedeutet. "Fertig" und "Manuell" standen
// vorher an jeder Zeile und waren reines Rauschen.
function statusHinweis(r) {
  if (r.ocr_status === 'pending')    return { cls: 'pending',    label: '⏳ Ausstehend' };
  if (r.ocr_status === 'processing') return { cls: 'processing', label: '🔄 Wird verarbeitet' };
  if (r.ocr_status === 'failed')     return { cls: 'failed',     label: '❌ Fehler' };
  if (r.ocr_status === 'done' && r.uncategorized_count > 0) {
    return { cls: 'processing', label: '🏷️ Kategorisierung läuft' };
  }
  return null;
}

function positionenText(r) {
  if (r.item_count === 1) return '1 Position';
  if (r.item_count > 1) return `${r.item_count} Positionen`;
  return TYP_LABELS[r.receipt_type] || 'Beleg';
}

// Nicht-Zeitraum-Filter über den Sprung in die Detailansicht hinweg merken
let savedState = null;

export async function renderReceipts(container, tenantId, params = {}) {
  if (!tenantId) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Bitte wähle einen Mandanten aus.</p></div>';
    return;
  }

  const restore = params.restoreState && savedState;

  let filter = {
    tenant_id: tenantId,
    limit: 50,
    offset: 0,
    type: restore ? savedState.type : undefined,
    search: restore ? savedState.search : undefined,
    sort_by: restore ? savedState.sort_by : 'receipt_date',
  };

  container.innerHTML = `
    <div class="search-bar">
      <input type="search" class="search-input" id="receipts-search"
        placeholder="Suche..." value="${(filter.search || '').replace(/"/g, '&quot;')}">
    </div>

    <div id="zeitraum-nav"></div>

    <div class="filter-bar">
      <select class="filter-select" id="filter-typ" aria-label="Belegtyp filtern">
        <option value="">Alle Typen</option>
        <option value="itemized">🧾 Kassenbon</option>
        <option value="fuel">⛽ Tankstelle</option>
        <option value="restaurant">🍽️ Restaurant</option>
        <option value="other">📄 Sonstiges</option>
      </select>
      <select class="filter-select" id="filter-sort" aria-label="Zeitraum bezieht sich auf">
        <option value="receipt_date">nach Belegdatum</option>
        <option value="created_at">nach Hochgeladen</option>
      </select>
    </div>

    <div id="receipts-summe" class="listen-summe hidden"></div>

    <div id="receipts-list"></div>
    <div id="receipts-load-more" class="hidden" style="text-align:center;padding:12px">
      <button class="btn btn-secondary" id="load-more-btn">Mehr laden</button>
    </div>
  `;

  const nav = renderZeitraumNav(document.getElementById('zeitraum-nav'), () => {
    filter.offset = 0;
    ladeUndRendere();
  });

  // Gemerkte Auswahl wiederherstellen
  if (filter.type) document.getElementById('filter-typ').value = filter.type;
  if (filter.sort_by) document.getElementById('filter-sort').value = filter.sort_by;

  // Suche (entprellt)
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

  document.getElementById('filter-sort').addEventListener('change', (e) => {
    filter.sort_by = e.target.value || 'receipt_date';
    filter.offset = 0;
    ladeUndRendere();
  });

  document.getElementById('load-more-btn')?.addEventListener('click', () => {
    filter.offset += 50;
    ladeUndRendere(true);
  });

  async function renderLeerZustand(liste) {
    const hatSuche = Boolean(filter.search || filter.type);
    const letzter = await zeit.letzterMonatMitDaten(tenantId);
    const { modus, jahr, m } = zeit.getZeitraum();
    const zeigeSprung = letzter && !hatSuche
      && !(modus === 'monat' && letzter === `${jahr}-${String(m + 1).padStart(2, '0')}`);
    const [lj, lm] = zeigeSprung ? letzter.split('-').map(Number) : [];

    liste.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧾</div>
        <p>${hatSuche ? 'Keine Belege für diese Filter.' : 'Keine Belege in diesem Zeitraum.'}</p>
        <div class="empty-actions">
          ${hatSuche ? '<button class="btn btn-secondary btn-sm" id="leer-reset-btn">Filter zurücksetzen</button>' : ''}
          ${modus !== 'alle' ? '<button class="btn btn-secondary btn-sm" id="leer-alle-btn">Alle Zeiten anzeigen</button>' : ''}
          ${zeigeSprung ? `<button class="btn btn-secondary btn-sm" id="leer-sprung-btn">Zu ${zeit.monatText(lj, lm - 1)}</button>` : ''}
          <button class="btn btn-primary btn-sm" id="leer-erfassen-btn">Beleg erfassen</button>
        </div>
      </div>
    `;

    document.getElementById('leer-reset-btn')?.addEventListener('click', () => {
      filter.search = undefined;
      filter.type = undefined;
      filter.offset = 0;
      document.getElementById('receipts-search').value = '';
      document.getElementById('filter-typ').value = '';
      ladeUndRendere();
    });
    document.getElementById('leer-alle-btn')?.addEventListener('click', () => {
      zeit.setAlle();
      nav.aktualisiere();
      filter.offset = 0;
      ladeUndRendere();
    });
    document.getElementById('leer-sprung-btn')?.addEventListener('click', () => {
      zeit.setMonatAusString(letzter);
      nav.aktualisiere();
      filter.offset = 0;
      ladeUndRendere();
    });
    document.getElementById('leer-erfassen-btn')?.addEventListener('click', () => navigiere('capture'));
  }

  async function ladeUndRendere(append = false) {
    const liste = document.getElementById('receipts-list');
    const summeEl = document.getElementById('receipts-summe');
    if (!append) liste.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const { receipts, total } = await api.getReceipts({ ...filter, ...zeit.grenzen() });

      if (!append) liste.innerHTML = '';

      if (receipts.length === 0 && !append) {
        summeEl.classList.add('hidden');
        document.getElementById('receipts-load-more').classList.add('hidden');
        await renderLeerZustand(liste);
        return;
      }

      for (const r of receipts) {
        const karte = document.createElement('div');
        karte.className = 'receipt-card';
        const datum = new Date(r.receipt_date).toLocaleDateString('de-DE');
        const status = statusHinweis(r);
        karte.innerHTML = `
          <div class="receipt-icon">${TYP_ICONS[r.receipt_type] || '📄'}</div>
          <div class="receipt-info">
            <div class="receipt-store">${r.store_name || 'Unbekanntes Geschäft'}</div>
            <div class="receipt-meta">${datum} · ${positionenText(r)}</div>
            ${r.sum_mismatch ? '<div class="mismatch-banner">⚠️ Summe weicht ab – bitte prüfen</div>' : ''}
          </div>
          <div style="text-align:right">
            <div class="receipt-amount">${r.total_amount.toFixed(2)}€</div>
            ${status ? `<div class="receipt-status status-${status.cls}">${status.label}</div>` : ''}
          </div>
        `;
        karte.addEventListener('click', () => {
          savedState = { type: filter.type, search: filter.search, sort_by: filter.sort_by };
          navigiere('receipt-detail', { id: r.id });
        });
        liste.appendChild(karte);
      }

      // Summe des gefilterten Zeitraums – bei Teilladung als "davon geladen"
      const gezeigt = (filter.offset || 0) + receipts.length;
      const geladeneSumme = receipts.reduce((s, r) => s + (r.total_amount || 0), 0);
      if (append) {
        summeEl.dataset.summe = String(Number(summeEl.dataset.summe || 0) + geladeneSumme);
      } else {
        summeEl.dataset.summe = String(geladeneSumme);
      }
      summeEl.classList.remove('hidden');
      summeEl.textContent = gezeigt < total
        ? `${gezeigt} von ${total} Belegen · ${Number(summeEl.dataset.summe).toFixed(2)}€ geladen`
        : `${total} ${total === 1 ? 'Beleg' : 'Belege'} · ${Number(summeEl.dataset.summe).toFixed(2)}€`;

      // Load More Button
      const loadMore = document.getElementById('receipts-load-more');
      loadMore.classList.toggle('hidden', gezeigt >= total);
    } catch (err) {
      liste.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
    }
  }

  ladeUndRendere();
}
