// Dashboard-View: Übersicht mit Statistiken und Charts
'use strict';

import { api } from '../api.js';
import { zeichneKuchendiagramm, zeichneBalkendiagramm, zeichneLegende } from '../charts.js';
import { zeigeToast, navigiere } from '../app.js';

export async function renderDashboard(container, tenantId) {
  if (!tenantId) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏠</div><p>Bitte wähle einen Mandanten aus.</p></div>';
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

  // Aktuelle Periode: from/to werden über das Objekt gesteuert (undefiniert = kein Filter)
  let periode = {
    from: monatStart(monatState.jahr, monatState.m),
    to:   monatEnde(monatState.jahr, monatState.m),
  };

  // Shell: Monat-Nav + Custom-Range + Content-Container + Balken-Karte
  container.innerHTML = `
    <div class="monat-nav">
      <button class="btn btn-ghost btn-icon" id="dash-prev" title="Vorheriger Monat">‹</button>
      <span id="dash-monat-label" class="monat-label">${monatText(monatState.jahr, monatState.m)}</span>
      <button class="btn btn-ghost btn-icon" id="dash-next" title="Nächster Monat">›</button>
      <button class="btn btn-ghost btn-sm" id="dash-alle-btn">Alle</button>
      <button class="btn btn-ghost btn-icon" id="dash-zeitraum-btn" title="Eigener Zeitraum">📅</button>
    </div>

    <div id="dash-custom-range" class="hidden" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <input type="date" class="filter-select" id="dash-filter-von" style="flex:1">
      <span style="color:var(--text-secondary);flex-shrink:0">–</span>
      <input type="date" class="filter-select" id="dash-filter-bis" style="flex:1">
    </div>

    <div id="dash-content">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="card-header">
        <span class="card-title">Letzte 12 Monate</span>
      </div>
      <canvas id="bar-chart" width="400" height="200" style="width:100%;max-width:100%"></canvas>
    </div>
  `;

  function aktualisiereMonatNav() {
    const label   = document.getElementById('dash-monat-label');
    const prev    = document.getElementById('dash-prev');
    const next    = document.getElementById('dash-next');
    const alleBtn = document.getElementById('dash-alle-btn');
    const cr      = document.getElementById('dash-custom-range');

    if (datumModus === 'alle') {
      label.textContent = 'Alle Zeiten';
    } else if (datumModus === 'zeitraum') {
      label.textContent = 'Eigener Zeitraum';
    } else {
      label.textContent = monatText(monatState.jahr, monatState.m);
    }

    const navAktiv = datumModus === 'monat';
    prev.disabled = next.disabled = !navAktiv;
    prev.style.opacity = next.style.opacity = navAktiv ? '' : '0.35';
    alleBtn.style.fontWeight = datumModus === 'alle' ? '700' : '';

    if (datumModus === 'zeitraum') {
      cr.classList.remove('hidden');
      cr.style.display = 'flex';
    } else {
      cr.classList.add('hidden');
    }
  }

  async function ladeDashboardInhalt() {
    const content = document.getElementById('dash-content');
    if (!content) return;
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const stats = await api.getStats({ tenant_id: tenantId, ...periode });

      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.gesamt.toFixed(2)}€</div>
            <div class="stat-label">Ausgaben</div>
          </div>
          <div class="stat-card" id="belege-card" style="cursor:pointer" title="Alle Belege anzeigen">
            <div class="stat-value">${stats.anzahl_belege}</div>
            <div class="stat-label">Belege</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Ausgaben nach Kategorie</span>
          </div>
          <canvas id="pie-chart" width="280" height="200" style="display:block;margin:0 auto"></canvas>
          <div id="pie-legend" style="margin-top:12px"></div>
        </div>

        ${stats.nach_geschaeft.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Top Geschäfte</span>
          </div>
          ${stats.nach_geschaeft.slice(0, 5).map(g => `
            <div class="item-row">
              <span class="item-description">${g.name}</span>
              <span style="color:var(--text-secondary);font-size:0.8rem">${g.anzahl}x</span>
              <span class="item-price">${g.summe.toFixed(2)}€</span>
            </div>
          `).join('')}
        </div>
        ` : ''}
      `;

      document.getElementById('belege-card')?.addEventListener('click', () => navigiere('receipts'));

      // Tortendiagramm
      const pieCanvas = document.getElementById('pie-chart');
      if (pieCanvas && stats.nach_kategorie.length > 0) {
        const result = zeichneKuchendiagramm(pieCanvas, stats.nach_kategorie);
        if (result) {
          zeichneLegende(document.getElementById('pie-legend'), stats.nach_kategorie, result.total);
        }
      }

      // Balkendiagramm: nach_monat ignoriert from/to im Backend (immer letzte 12 Monate)
      const barCanvas = document.getElementById('bar-chart');
      if (barCanvas && stats.nach_monat.length > 0) {
        const dpr = window.devicePixelRatio || 1;
        const rect = barCanvas.getBoundingClientRect();
        barCanvas.width  = (rect.width || 360) * dpr;
        barCanvas.height = 200 * dpr;
        barCanvas.style.height = '200px';
        barCanvas.getContext('2d').scale(dpr, dpr);
        zeichneBalkendiagramm(barCanvas, stats.nach_monat.slice(-12));
      }

    } catch (err) {
      content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
      zeigeToast('Fehler beim Laden der Statistiken', 'error');
    }
  }

  // ===== Event-Listener Monat-Navigation =====

  document.getElementById('dash-prev').addEventListener('click', () => {
    let { jahr, m } = monatState;
    m--; if (m < 0) { m = 11; jahr--; }
    monatState = { jahr, m };
    datumModus = 'monat';
    periode = { from: monatStart(jahr, m), to: monatEnde(jahr, m) };
    aktualisiereMonatNav();
    ladeDashboardInhalt();
  });

  document.getElementById('dash-next').addEventListener('click', () => {
    let { jahr, m } = monatState;
    m++; if (m > 11) { m = 0; jahr++; }
    monatState = { jahr, m };
    datumModus = 'monat';
    periode = { from: monatStart(jahr, m), to: monatEnde(jahr, m) };
    aktualisiereMonatNav();
    ladeDashboardInhalt();
  });

  document.getElementById('dash-alle-btn').addEventListener('click', () => {
    datumModus = 'alle';
    periode = {}; // no date filter - api.getStats will omit from/to entirely
    aktualisiereMonatNav();
    ladeDashboardInhalt();
  });

  document.getElementById('dash-zeitraum-btn').addEventListener('click', () => {
    if (datumModus === 'zeitraum') {
      // Toggle back to month mode
      datumModus = 'monat';
      periode = { from: monatStart(monatState.jahr, monatState.m), to: monatEnde(monatState.jahr, monatState.m) };
    } else {
      datumModus = 'zeitraum';
      const vonEl = document.getElementById('dash-filter-von');
      const bisEl = document.getElementById('dash-filter-bis');
      // Pre-fill with current period values
      if (!vonEl.value) vonEl.value = periode.from || monatStart(monatState.jahr, monatState.m);
      if (!bisEl.value) bisEl.value = periode.to   || monatEnde(monatState.jahr, monatState.m);
    }
    aktualisiereMonatNav();
    ladeDashboardInhalt();
  });

  document.getElementById('dash-filter-von').addEventListener('change', (e) => {
    if (e.target.value) periode.from = e.target.value;
    else delete periode.from;
    ladeDashboardInhalt();
  });

  document.getElementById('dash-filter-bis').addEventListener('change', (e) => {
    if (e.target.value) periode.to = e.target.value;
    else delete periode.to;
    ladeDashboardInhalt();
  });

  ladeDashboardInhalt();
}
