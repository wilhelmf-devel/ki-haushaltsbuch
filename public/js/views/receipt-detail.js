// Beleg-Detailansicht
'use strict';

import { api } from '../api.js';
import { zeigeToast, navigiere, zeigeBild } from '../app.js';

export async function renderReceiptDetail(container, tenantId, params = {}) {
  const { id } = params;
  if (!id) { navigiere('receipts'); return; }

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const [receipt, kategorien] = await Promise.all([
      api.getReceipt(id),
      api.getCategories(tenantId),
    ]);

    const datum = new Date(receipt.receipt_date).toLocaleDateString('de-DE', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    const typLabels = { itemized: 'Kassenbon', fuel: 'Tankquittung', restaurant: 'Restaurantrechnung', other: 'Sonstiges' };

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="btn btn-ghost btn-sm" id="back-btn">← Zurück</button>
        <h2 style="flex:1;font-size:1rem">${receipt.store_name || 'Unbekanntes Geschäft'}</h2>
        <button class="btn btn-secondary btn-sm" id="edit-btn">✏️ Bearbeiten</button>
        <button class="btn btn-danger btn-sm btn-icon" id="delete-btn" title="Löschen">🗑️</button>
      </div>

      ${receipt.sum_mismatch ? `
        <div class="mismatch-banner" style="margin-bottom:12px;border-radius:var(--radius-sm)">
          ⚠️ Die Summe der erkannten Positionen weicht vom Gesamtbetrag ab. Bitte prüfen.
        </div>
      ` : ''}

      <!-- Bild Vorschau -->
      ${receipt.image_path ? `
        <div style="margin-bottom:12px">
          <img src="${api.getImageUrl(receipt.image_path)}"
            alt="Beleg-Bild"
            style="width:100%;max-height:200px;object-fit:contain;border-radius:var(--radius);cursor:pointer;background:var(--bg)"
            id="receipt-image">
        </div>
      ` : ''}

      <!-- Kopfdaten -->
      <div class="card" id="header-view">
        <div class="item-row">
          <span class="item-description">Datum</span>
          <span>${datum}</span>
        </div>
        <div class="item-row">
          <span class="item-description">Typ</span>
          <span>${typLabels[receipt.receipt_type] || receipt.receipt_type}</span>
        </div>
        <div class="item-row">
          <span class="item-description">Status</span>
          <span>${receipt.ocr_status || 'unbekannt'}</span>
        </div>
        ${receipt.notes ? `
        <div class="item-row">
          <span class="item-description">Notiz</span>
          <span>${receipt.notes}</span>
        </div>
        ` : ''}
        <div class="divider"></div>
        <div class="item-row" style="font-weight:700">
          <span class="item-description">Gesamtbetrag</span>
          <span>${receipt.total_amount.toFixed(2)}€</span>
        </div>
      </div>

      <!-- Beleg bearbeiten (direkt unter Kopfdaten, damit es sichtbar bleibt) -->
      <div class="card hidden" id="edit-form-card">
        <h3 style="margin-bottom:16px">Beleg bearbeiten</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Datum</label>
            <input type="date" id="edit-datum" value="${(receipt.receipt_date || '').slice(0, 10)}">
          </div>
          <div class="form-group">
            <label>Geschäft</label>
            <input type="text" id="edit-geschaeft" value="${receipt.store_name || ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Notiz</label>
          <textarea id="edit-notiz">${receipt.notes || ''}</textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="save-edit-btn">Speichern</button>
          <button class="btn btn-secondary" id="cancel-edit-btn">Abbrechen</button>
        </div>
      </div>

      <!-- Positions-Liste -->
      ${receipt.items.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Positionen (${receipt.items.length})</span>
          </div>
          <div id="items-list">
            ${receipt.items.map(item => renderItemZeile(item, kategorien)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Event-Listener
    document.getElementById('back-btn').addEventListener('click', () => navigiere('receipts'));

    if (receipt.image_path) {
      document.getElementById('receipt-image').addEventListener('click', () => {
        zeigeBild(api.getImageUrl(receipt.image_path));
      });
    }

    document.getElementById('edit-btn').addEventListener('click', () => {
      document.getElementById('header-view').classList.toggle('hidden');
      document.getElementById('edit-form-card').classList.toggle('hidden');
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
      document.getElementById('header-view').classList.remove('hidden');
      document.getElementById('edit-form-card').classList.add('hidden');
    });

    document.getElementById('save-edit-btn').addEventListener('click', async () => {
      try {
        await api.updateReceipt(id, {
          receipt_date: document.getElementById('edit-datum').value,
          store_name: document.getElementById('edit-geschaeft').value || null,
          notes: document.getElementById('edit-notiz').value || null,
        });
        zeigeToast('Gespeichert!', 'success');
        renderReceiptDetail(container, tenantId, params);
      } catch (err) {
        zeigeToast(`Fehler: ${err.message}`, 'error');
      }
    });

    document.getElementById('delete-btn').addEventListener('click', async () => {
      if (!confirm('Beleg wirklich löschen?')) return;
      try {
        await api.deleteReceipt(id);
        zeigeToast('Beleg gelöscht', 'success');
        navigiere('receipts');
      } catch (err) {
        zeigeToast(`Fehler: ${err.message}`, 'error');
      }
    });

    // Kategorie-Zuordnung per Klick
    document.getElementById('items-list')?.addEventListener('change', async (e) => {
      if (!e.target.classList.contains('item-cat-select')) return;
      const itemId = e.target.dataset.itemId;
      const categoryId = e.target.value || null;
      try {
        await api.updateReceiptItem(id, itemId, { category_id: categoryId });
        zeigeToast('Kategorie gespeichert', 'success');
      } catch (err) {
        zeigeToast(`Fehler: ${err.message}`, 'error');
      }
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

function renderItemZeile(item, kategorien) {
  const farbe = item.category_color || '#9E9E9E';
  const icon = item.category_icon || '📦';
  const katName = item.category_name || 'Unkategorisiert';

  return `
    <div class="item-row" style="flex-wrap:wrap;gap:6px">
      <div style="flex:1;min-width:0">
        <div style="font-size:0.9rem;font-weight:500">
          ${item.quantity !== 1 ? `${item.quantity}x ` : ''}${item.description}
        </div>
        ${item.quantity !== 1 ? `<div style="font-size:0.75rem;color:var(--text-secondary)">${(item.unit_price ?? 0).toFixed(2)}€/Stk</div>` : ''}
      </div>
      <select class="item-cat-select" data-item-id="${item.id}"
        style="flex:1;min-width:120px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.8rem">
        <option value="">Unkategorisiert</option>
        ${kategorien.map(k => `
          <option value="${k.id}" ${k.id === item.category_id ? 'selected' : ''}>
            ${k.icon || ''} ${k.name}
          </option>
        `).join('')}
      </select>
      <span style="font-weight:600;white-space:nowrap">${(item.total_price ?? 0).toFixed(2)}€</span>
    </div>
  `;
}
