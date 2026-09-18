// Dashboard-View: Übersicht mit Statistiken und Charts
'use strict';

import { api } from '../api.js';
import { zeichneKuchendiagramm, zeichneBalkendiagramm, zeichneLegende } from '../charts.js';
import { zeigeToast, navigiere } from '../app.js';
import * as zeit from '../period.js';
import { renderZeitraumNav } from '../zeitraum-nav.js';

export async function renderDashboard(container, tenantId) {
  if (!tenantId) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏠</div><p>Bitte wähle einen Mandanten aus.</p></div>';
    return;
  }

  // Shell: Zeitraum-Leiste + Content-Container + Balken-Karte
  container.innerHTML = `
    <div id="zeitraum-nav"></div>

    <div id="dash-content">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>

    <div class="card hidden" id="dash-bar-card" style="margin-top:12px">
      <div class="card-header">
        <span class="card-title">Letzte 12 Monate</span>
      </div>
      <canvas id="bar-chart" aria-label="Ausgaben der letzten 12 Monate"></canvas>
    </div>
  `;

  const nav = renderZeitraumNav(
    document.getElementById('zeitraum-nav'),
    () => ladeDashboardInhalt()
  );

  // Leere Periode nicht als Sackgasse stehen lassen
  async function renderLeerZustand(content) {
    const letzter = await zeit.letzterMonatMitDaten(tenantId);
    const { modus, jahr, m } = zeit.getZeitraum();
    const zeigeSprung = letzter
      && !(modus === 'monat' && letzter === `${jahr}-${String(m + 1).padStart(2, '0')}`);

    const [lj, lm] = zeigeSprung ? letzter.split('-').map(Number) : [];

    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧾</div>
        <p>Keine Belege in diesem Zeitraum.</p>
        <div class="empty-actions">
          ${modus !== 'alle' ? '<button class="btn btn-secondary btn-sm" id="leer-alle-btn">Alle Zeiten anzeigen</button>' : ''}
          ${zeigeSprung ? `<button class="btn btn-secondary btn-sm" id="leer-sprung-btn">Zu ${zeit.monatText(lj, lm - 1)}</button>` : ''}
          <button class="btn btn-primary btn-sm" id="leer-erfassen-btn">Beleg erfassen</button>
        </div>
      </div>
    `;

    document.getElementById('leer-alle-btn')?.addEventListener('click', () => {
      zeit.setAlle();
      nav.aktualisiere();
      ladeDashboardInhalt();
    });
    document.getElementById('leer-sprung-btn')?.addEventListener('click', () => {
      zeit.setMonatAusString(letzter);
      nav.aktualisiere();
      ladeDashboardInhalt();
    });
    document.getElementById('leer-erfassen-btn')?.addEventListener('click', () => navigiere('capture'));
  }

  function zeichneBalken(nachMonat) {
    const karte = document.getElementById('dash-bar-card');
    const canvas = document.getElementById('bar-chart');
    if (!karte || !canvas) return;

    if (!nachMonat || nachMonat.length === 0) {
      karte.classList.add('hidden');
      return;
    }
    // Erst einblenden, dann zeichnen – ein verstecktes Canvas hat Breite 0
    karte.classList.remove('hidden');
    zeichneBalkendiagramm(canvas, nachMonat.slice(-12));
  }

  async function ladeDashboardInhalt() {
    const content = document.getElementById('dash-content');
    if (!content) return;
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const stats = await api.getStats({ tenant_id: tenantId, ...zeit.grenzen() });

      // nach_monat ist immer der Gesamtbestand (ignoriert from/to im Backend) –
      // taugt daher als Quelle für "letzter Monat mit Belegen"
      zeit.merkeMonate(tenantId, stats.nach_monat);
      zeichneBalken(stats.nach_monat);

      if (stats.anzahl_belege === 0) {
        await renderLeerZustand(content);
        return;
      }

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

        ${stats.nach_kategorie.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Ausgaben nach Kategorie</span>
          </div>
          <canvas id="pie-chart" style="display:block;margin:0 auto"
            aria-label="Ausgaben nach Kategorie"></canvas>
          <div id="pie-legend" style="margin-top:12px"></div>
        </div>
        ` : ''}

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

    } catch (err) {
      content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
      zeigeToast('Fehler beim Laden der Statistiken', 'error');
    }
  }

  ladeDashboardInhalt();
}
