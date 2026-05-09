// Router + Init + ServiceWorker-Registrierung
'use strict';

import { api } from './api.js';
import { initOfflineSync, flushQueue } from './offline.js';

// ===== STATE =====
let aktiverMandant = null;
let aktiverView = null;
let aktiverViewParams = {};
let mandanten = [];
let currentUser = { authActive: false, username: null, isAdmin: false };

// ===== TOASTS =====
export function zeigeToast(nachricht, typ = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${typ}`;
  toast.textContent = nachricht;
  container.appendChild(toast);

  const entfernen = () => toast.remove();
  toast.addEventListener('click', entfernen);
  setTimeout(entfernen, 3500);
}

// ===== NAVIGATION =====
export function navigiere(view, params = {}) {
  aktiverView = view;
  aktiverViewParams = params;

  // Nav-Buttons aktualisieren
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Hash aktualisieren
  const hash = params.id ? `#${view}/${params.id}` : `#${view}`;
  if (location.hash !== hash) history.pushState(null, '', hash);

  ladeView();
}

// ===== BILD-VIEWER =====
export function zeigeBild(url) {
  const viewer = document.getElementById('image-viewer');
  const img = document.getElementById('image-viewer-img');
  if (!viewer || !img) return;
  img.src = url;
  viewer.classList.remove('hidden');
}

// ===== VIEW LADEN =====
async function ladeView() {
  const container = document.getElementById('view-container');
  if (!container) return;

  const tenantId = aktiverMandant?.id;

  try {
    switch (aktiverView) {
      case 'dashboard': {
        const { renderDashboard } = await import('./views/dashboard.js');
        await renderDashboard(container, tenantId);
        break;
      }
      case 'capture': {
        const { renderCapture } = await import('./views/capture.js');
        await renderCapture(container, tenantId);
        break;
      }
      case 'receipts': {
        const { renderReceipts } = await import('./views/receipts.js');
        await renderReceipts(container, tenantId, aktiverViewParams);
        break;
      }
      case 'receipt-detail': {
        const { renderReceiptDetail } = await import('./views/receipt-detail.js');
        await renderReceiptDetail(container, tenantId, aktiverViewParams);
        break;
      }
      case 'settings': {
        const { renderSettings } = await import('./views/settings.js');
        await renderSettings(container, tenantId, () => {
          ladeUndRendereMandanten();
        }, currentUser);
        break;
      }
      case 'user-management': {
        const { renderUserManagement } = await import('./views/user-management.js');
        await renderUserManagement(container, currentUser);
        break;
      }
      default:
        navigiere('dashboard');
    }
  } catch (err) {
    console.error('[App] View-Fehler:', err);
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Fehler: ${err.message}</p></div>`;
  }
}

// ===== MANDANTEN =====
async function ladeUndRendereMandanten() {
  // Errors propagate to caller – caller decides if it's a fetch error or no tenants
  mandanten = await api.getTenants();

  const select = document.getElementById('tenant-select');
  if (!select) return mandanten.length > 0;

  select.innerHTML = mandanten.map(t =>
    `<option value="${t.id}">${t.name}</option>`
  ).join('');

  // Gespeicherten Mandanten laden
  const gespeicherterMandant = localStorage.getItem('aktiverMandant');
  const gefunden = gespeicherterMandant
    ? mandanten.find(t => t.id === parseInt(gespeicherterMandant))
    : null;

  aktiverMandant = gefunden || mandanten[0] || null;

  if (aktiverMandant) {
    select.value = aktiverMandant.id;
  }

  return mandanten.length > 0;
}

// ===== JOB BADGE =====
let jobPollingTimer = null;

async function aktualisiereJobBadge() {
  try {
    const jobs = await api.getJobs();
    const badge = document.getElementById('job-badge');
    const count = document.getElementById('job-count');
    if (!badge || !count) return;

    if (jobs.length > 0) {
      badge.classList.remove('hidden');
      count.textContent = jobs.length;
    } else {
      badge.classList.add('hidden');
    }
  } catch {}
}

function starteJobPolling() {
  aktualisiereJobBadge();
  jobPollingTimer = setInterval(aktualisiereJobBadge, 10000);
}

// ===== HASH-ROUTING =====
function leseHashRoute() {
  const hash = location.hash.replace('#', '');
  if (!hash) return { view: 'dashboard', params: {} };

  const teile = hash.split('/');
  const view = teile[0] || 'dashboard';
  const params = teile[1] ? { id: parseInt(teile[1]) } : {};
  return { view, params };
}

// ===== INIT =====
async function init() {
  // Auth-Status laden + Username-Chip anzeigen
  try {
    currentUser = await api.getMe();
    if (currentUser.authActive && currentUser.username) {
      const chip = document.getElementById('user-chip');
      if (chip) {
        chip.textContent = '👤 ' + currentUser.username;
        chip.classList.remove('hidden');
      }
    }
  } catch { /* Auth nicht verfügbar – unkritisch */ }

  // Setup-Overlay oder Hauptlayout zeigen
  let hatMandanten;
  try {
    hatMandanten = await ladeUndRendereMandanten();
  } catch (err) {
    // Transient server/network error – show retry instead of setup form so that
    // existing users don't get prompted to create a tenant they already have.
    console.error('[App] Mandanten laden fehlgeschlagen:', err);
    const container = document.getElementById('view-container');
    if (container) container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Verbindung fehlgeschlagen. Bitte neu laden.</p>
        <button class="btn btn-primary" onclick="location.reload()">Neu laden</button>
      </div>`;
    return;
  }

  if (!hatMandanten) {
    // Echte Erstanmeldung ohne Mandanten
    const overlay = document.getElementById('setup-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const setupBtn   = document.getElementById('setup-btn');
    const setupInput = document.getElementById('setup-tenant-name');

    setupBtn?.addEventListener('click', async () => {
      const name = setupInput?.value?.trim();
      if (!name) {
        // Sichtbares Feedback statt lautlosem Abbruch
        setupInput?.focus();
        if (setupInput) setupInput.style.borderColor = 'var(--danger, #e53e3e)';
        return;
      }
      setupBtn.disabled = true;
      try {
        await api.createTenant({ name });
        // Voll neu laden: nav-listener und restlicher init-Code werden korrekt gesetzt
        location.reload();
      } catch (err) {
        setupBtn.disabled = false;
        zeigeToast(`Fehler: ${err.message}`, 'error');
      }
    });
    setupInput?.addEventListener('input', () => {
      if (setupInput.style.borderColor) setupInput.style.borderColor = '';
    });
    return;
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      navigiere(btn.dataset.view);
    });
  });

  // Mandanten-Wechsel
  document.getElementById('tenant-select')?.addEventListener('change', (e) => {
    const gefunden = mandanten.find(t => t.id === parseInt(e.target.value));
    if (gefunden) {
      aktiverMandant = gefunden;
      localStorage.setItem('aktiverMandant', gefunden.id);
      ladeView();
    }
  });

  // Job-Badge Klick
  document.getElementById('job-badge')?.addEventListener('click', () => {
    navigiere('receipts');
  });

  // Bild-Viewer schließen
  document.getElementById('image-viewer-close')?.addEventListener('click', () => {
    document.getElementById('image-viewer')?.classList.add('hidden');
  });
  document.getElementById('image-viewer')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // Hash-Routing (Back/Forward)
  window.addEventListener('popstate', () => {
    const { view, params } = leseHashRoute();
    aktiverView = view;
    aktiverViewParams = params;
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    ladeView();
  });

  // Offline-Sync
  initOfflineSync((versendet, gesamt) => {
    zeigeToast(`Offline-Upload ${versendet}/${gesamt} übertragen`, 'info');
  });

  // Beim Start sofort ausstehende Uploads abschicken
  if (navigator.onLine) {
    flushQueue().then(count => {
      if (count > 0) zeigeToast(`${count} Offline-Upload(s) nachgeholt`, 'success');
    });
  }

  // Initiale Route
  const { view, params } = leseHashRoute();
  aktiverView = view || 'dashboard';
  aktiverViewParams = params;
  ladeView();

  // Job-Polling
  starteJobPolling();

  // Nach aktiver View-Reload auch Badge aktualisieren
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) aktualisiereJobBadge();
  });
}

// ===== SERVICE WORKER REGISTRIERUNG =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(() => {
      console.log('[SW] Registriert');
    }).catch(err => {
      console.warn('[SW] Registrierung fehlgeschlagen:', err);
    });
  });
}

// App starten
init().catch(err => {
  console.error('[App] Init-Fehler:', err);
  document.getElementById('view-container').innerHTML =
    `<div class="empty-state"><div class="empty-icon">💥</div><p>Startfehler: ${err.message}</p></div>`;
});
