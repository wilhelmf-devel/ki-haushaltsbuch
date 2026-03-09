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

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const jetzt = new Date();
    const ersterDesMonats = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-01`;
    const letzterDesMonats = new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 0).toISOString().split('T')[0];

    const stats = await api.getStats({
      tenant_id: tenantId,
      from: ersterDesMonats,
      to: letzterDesMonats,
    });

    const monat = jetzt.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    container.innerHTML = `
      <h2 style="margin-bottom:12px;font-size:1rem;color:var(--text-secondary)">
        ${monat}
      </h2>

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

      <!-- Kuchendiagramm Kategorien -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Ausgaben nach Kategorie</span>
        </div>
        <canvas id="pie-chart" width="280" height="200" style="display:block;margin:0 auto"></canvas>
        <div id="pie-legend" style="margin-top:12px"></div>
      </div>

      <!-- Balkendiagramm Monate -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Letzte 6 Monate</span>
        </div>
        <canvas id="bar-chart" width="400" height="200" style="width:100%;max-width:100%"></canvas>
      </div>

      <!-- Top Geschäfte -->
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

    // Belege-Karte klickbar machen
    document.getElementById('belege-card')?.addEventListener('click', () => navigiere('receipts'));

    // Charts zeichnen
    const pieCanvas = document.getElementById('pie-chart');
    if (pieCanvas && stats.nach_kategorie.length > 0) {
      const result = zeichneKuchendiagramm(pieCanvas, stats.nach_kategorie);
      if (result) {
        zeichneLegende(document.getElementById('pie-legend'), stats.nach_kategorie, result.total);
      }
    }

    const barCanvas = document.getElementById('bar-chart');
    if (barCanvas && stats.nach_monat.length > 0) {
      // DPI-Anpassung
      const dpr = window.devicePixelRatio || 1;
      const rect = barCanvas.getBoundingClientRect();
      barCanvas.width = (rect.width || 360) * dpr;
      barCanvas.height = 200 * dpr;
      barCanvas.style.height = '200px';
      barCanvas.getContext('2d').scale(dpr, dpr);
      zeichneBalkendiagramm(barCanvas, stats.nach_monat.slice(-6));
    }

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
    zeigeToast('Fehler beim Laden der Statistiken', 'error');
  }
}
