// fetch-Wrapper mit Fehlerbehandlung
'use strict';

// Strip undefined/null before building a query string so that
// e.g. { from: undefined } never becomes "from=undefined" in the URL.
function queryStr(params) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  );
}

let _loginOverlayActive = false;

// On iOS PWA, window.location.href to an external IdP breaks out of the WKWebView into Safari.
// Instead: show an overlay, open OAuth in a new tab, poll until the cookie is set, then resume.
function showLoginOverlay() {
  if (_loginOverlayActive) return new Promise(() => {});
  _loginOverlayActive = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.88)',
    'display:flex', 'flex-direction:column', 'align-items:center',
    'justify-content:center', 'z-index:9999', 'padding:2rem',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif', 'color:#fff', 'text-align:center',
  ].join(';');
  overlay.innerHTML = `
    <p style="font-size:1.25rem;font-weight:600;margin:0 0 0.5rem">Sitzung abgelaufen</p>
    <p style="font-size:0.9rem;opacity:0.7;margin:0 0 1.5rem;max-width:18rem">
      Bitte neu anmelden. Die App wird danach automatisch fortgesetzt.
    </p>
    <button id="_oauth_btn" style="
      background:#2563eb;color:#fff;border:none;border-radius:10px;
      padding:0.75rem 2.5rem;font-size:1rem;cursor:pointer;
    ">Anmelden</button>
    <p id="_oauth_status" style="margin-top:1rem;font-size:0.85rem;opacity:0.6;min-height:1.2em"></p>
  `;
  document.body.appendChild(overlay);

  const btn = overlay.querySelector('#_oauth_btn');
  const status = overlay.querySelector('#_oauth_status');

  btn.addEventListener('click', () => {
    const signInUrl = '/oauth2/sign_in?rd=' + encodeURIComponent(location.origin + '/');
    const loginWindow = window.open(signInUrl, '_blank');

    btn.disabled = true;
    btn.style.opacity = '0.5';
    status.textContent = 'Warte auf Anmeldung …';

    if (!loginWindow) {
      // Popup blocked (e.g. desktop browser) – fall back to full-page redirect
      location.href = signInUrl;
      return;
    }

    const timer = setInterval(() => {
      // OAuth redirect brought the tab back to our origin → login complete.
      try {
        if (loginWindow.location.origin === location.origin) {
          clearInterval(timer);
          loginWindow.close();
          _loginOverlayActive = false;
          overlay.remove();
          location.reload();
          return;
        }
      } catch {
        // Still at external IdP – keep watching
      }

      // User closed the tab manually (possibly mid-flow). Don't reload immediately;
      // poll /api/me briefly so that any in-flight OAuth callback can finish first.
      if (loginWindow.closed) {
        clearInterval(timer);
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const res = await fetch('/api/me', { credentials: 'include' });
            if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
              clearInterval(poll);
              _loginOverlayActive = false;
              overlay.remove();
              location.reload();
              return;
            }
          } catch {}
          if (attempts >= 8) {
            // Auth didn't arrive in ~4s – let the user try again
            clearInterval(poll);
            btn.disabled = false;
            btn.style.opacity = '';
            status.textContent = 'Anmeldung nicht erkannt. Bitte erneut versuchen.';
          }
        }, 500);
      }
    }, 500);
  });

  return new Promise(() => {}); // never resolves – caller halts
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  // Session expired: direct 401/403 from forwardAuth
  if (res.status === 401 || res.status === 403) {
    return showLoginOverlay();
  }

  const contentType = res.headers.get('content-type') || '';

  // Session expired: Traefik errors-middleware served the OAuth sign-in HTML instead of JSON
  if (url.startsWith('/api/') && res.ok && contentType.includes('text/html')) {
    return showLoginOverlay();
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      message = json.error || message;
    } catch {}
    throw new Error(message);
  }

  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res;
}

export const api = {
  // Tenants
  getTenants: () => apiFetch('/api/tenants'),
  createTenant: (data) => apiFetch('/api/tenants', { method: 'POST', body: JSON.stringify(data) }),
  updateTenant: (id, data) => apiFetch(`/api/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTenant: (id) => apiFetch(`/api/tenants/${id}`, { method: 'DELETE' }),

  // Receipts
  getReceipts: (params) => apiFetch('/api/receipts?' + queryStr(params)),
  getReceipt: (id) => apiFetch(`/api/receipts/${id}`),
  createReceipt: (data) => apiFetch('/api/receipts', { method: 'POST', body: JSON.stringify(data) }),
  updateReceipt: (id, data) => apiFetch(`/api/receipts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateReceiptItem: (id, itemId, data) => apiFetch(`/api/receipts/${id}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReceiptItem: (id, itemId) => apiFetch(`/api/receipts/${id}/items/${itemId}`, { method: 'DELETE' }),
  addReceiptItem: (id, data) => apiFetch(`/api/receipts/${id}/items`, { method: 'POST', body: JSON.stringify(data) }),
  deleteReceipt: (id) => apiFetch(`/api/receipts/${id}`, { method: 'DELETE' }),
  retryReceiptOcr: (id) => apiFetch(`/api/receipts/${id}/retry-ocr`, { method: 'POST' }),

  // Upload
  upload: (formData) => fetch('/api/upload', { method: 'POST', body: formData }).then(async (res) => {
    if (res.status === 401 || res.status === 403) return showLoginOverlay();
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return res.json();
  }),

  // Categories
  getCategories: (tenantId) => apiFetch('/api/categories' + (tenantId ? `?tenant_id=${tenantId}` : '')),
  createCategory: (data) => apiFetch('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => apiFetch(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id, opts = {}) => apiFetch(`/api/categories/${id}${opts.moveToSonstiges ? '?move_to_sonstiges=true' : ''}`, { method: 'DELETE' }),
  resetCategories: () => apiFetch('/api/categories/reset', { method: 'POST' }),
  recategorizeMissing: () => apiFetch('/api/categories/recategorize-missing', { method: 'POST' }),

  // Stats
  getStats: (params) => apiFetch('/api/stats?' + queryStr(params)),

  // Jobs
  getJobs: () => apiFetch('/api/jobs'),
  retryJob: (id) => apiFetch(`/api/jobs/retry/${id}`, { method: 'POST' }),
  recategorize: (tenantId) => apiFetch('/api/jobs/recategorize', { method: 'POST', body: JSON.stringify({ tenant_id: tenantId }) }),

  // Settings
  getSettings: () => apiFetch('/api/settings'),
  saveSettings: (data) => apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(data) }),

  // Auth / aktueller Benutzer
  getMe: () => apiFetch('/api/me'),

  // Admin – Benutzerverwaltung
  getAdminUsers:  () => apiFetch('/api/admin/users'),
  createUser:     (username) => apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ username }) }),
  assignTenant:   (username, tenantId) => apiFetch(`/api/admin/users/${encodeURIComponent(username)}/tenants/${tenantId}`, { method: 'POST' }),
  unassignTenant: (username, tenantId) => apiFetch(`/api/admin/users/${encodeURIComponent(username)}/tenants/${tenantId}`, { method: 'DELETE' }),

  // Image
  getImageUrl: (filename) => `/api/image/${filename}`,
};
