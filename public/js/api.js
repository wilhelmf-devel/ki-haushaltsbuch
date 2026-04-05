// fetch-Wrapper mit Fehlerbehandlung
'use strict';

// Strip undefined/null before building a query string so that
// e.g. { from: undefined } never becomes "from=undefined" in the URL.
function queryStr(params) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  );
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      message = json.error || message;
    } catch {}
    throw new Error(message);
  }

  // Kein JSON bei leeren Antworten
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
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

  // Image
  getImageUrl: (filename) => `/api/image/${filename}`,
};
