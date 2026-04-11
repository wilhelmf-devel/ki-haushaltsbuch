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
        <button class="btn btn-danger btn-sm btn-icon" id="delete-btn" title="Löschen">🗑️</button>
      </div>

      <div id="mismatch-container">
        ${receipt.sum_mismatch ? `
          <div class="mismatch-banner" style="margin-bottom:12px;border-radius:var(--radius-sm)">
            ⚠️ Die Summe der erkannten Positionen weicht vom Gesamtbetrag ab. Bitte prüfen.
          </div>
        ` : ''}
      </div>

      <!-- Bild Vorschau -->
      ${receipt.image_path ? `
        <div style="margin-bottom:12px;position:relative">
          <img src="${api.getImageUrl(receipt.image_path)}"
            alt="Beleg-Bild"
            style="width:100%;max-height:200px;object-fit:contain;border-radius:var(--radius);cursor:pointer;background:var(--bg)"
            id="receipt-image">
          <a href="${api.getImageUrl(receipt.image_path)}"
            download="${receipt.image_path}"
            target="_blank"
            style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.55);color:#fff;border-radius:6px;padding:4px 10px;font-size:0.8rem;text-decoration:none"
            title="Bild herunterladen">⬇ Download</a>
        </div>
      ` : ''}

      <!-- Kopfdaten direkt editierbar -->
      <div class="card">
        <div class="form-row" style="grid-template-columns:140px 1fr;align-items:end">
          <div class="form-group">
            <label>Datum</label>
            <input type="date" id="edit-datum" value="${(receipt.receipt_date || '').slice(0, 10)}">
          </div>
          <div class="form-group">
            <label>Geschäft</label>
            <input type="text" id="edit-geschaeft" value="${receipt.store_name || ''}" placeholder="Geschäftsname">
          </div>
        </div>
        <div class="form-group">
          <label>Notiz</label>
          <textarea id="edit-notiz" placeholder="Optionale Notiz">${receipt.notes || ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Gesamtbetrag (€)</label>
            <input type="number" step="0.01" id="edit-betrag" value="${(receipt.total_amount ?? 0).toFixed(2)}">
          </div>
          <div class="form-group" style="justify-content:flex-end">
            <span style="font-size:0.8rem;color:var(--text-secondary);align-self:flex-end;padding-bottom:8px">
              ${typLabels[receipt.receipt_type] || receipt.receipt_type} · ${receipt.ocr_status || 'unbekannt'}
            </span>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="btn btn-primary btn-sm" id="save-edit-btn">Speichern</button>
          ${receipt.ocr_status === 'failed' ? `
            <button class="btn btn-secondary btn-sm" id="retry-ocr-btn">🔄 OCR erneut versuchen</button>
          ` : ''}
        </div>
      </div>

      <!-- Positions-Liste -->
      <div id="items-karte"></div>
    `;

    // Mismatch-Banner dynamisch aktualisieren (nach Item-Änderungen ohne Full-Reload)
    function aktualisiereMismatchBanner(freshReceipt) {
      const container = document.getElementById('mismatch-container');
      if (!container) return;
      container.innerHTML = freshReceipt.sum_mismatch ? `
        <div class="mismatch-banner" style="margin-bottom:12px;border-radius:var(--radius-sm)">
          ⚠️ Die Summe der erkannten Positionen weicht vom Gesamtbetrag ab. Bitte prüfen.
        </div>
      ` : '';
    }

    // Items-Karte rendern (wiederverwendbar nach Änderungen)
    function aktualisiereItemsKarte(items) {
      document.getElementById('items-karte').innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Positionen (${items.length})</span>
          </div>
          <div id="items-list">
            ${items.map(item => renderItemZeile(item, kategorien)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" id="add-item-btn"
            style="margin-top:8px;width:100%;border:1px dashed var(--border)">
            + Zeile hinzufügen
          </button>
        </div>
      `;
      bindItemEvents(items);
    }

    function bindItemEvents(items) {
      // Kategorie-Dropdown
      document.getElementById('items-list')?.addEventListener('change', async (e) => {
        if (!e.target.classList.contains('item-cat-select')) return;
        const itemId = e.target.dataset.itemId;
        try {
          await api.updateReceiptItem(id, itemId, { category_id: e.target.value || null });
          zeigeToast('Kategorie gespeichert', 'success');
        } catch (err) { zeigeToast(err.message, 'error'); }
      });

      // Edit / Delete / Save / Cancel per Event-Delegation
      document.getElementById('items-list')?.addEventListener('click', async (e) => {
        const editBtn  = e.target.closest('.item-edit-btn');
        const delBtn   = e.target.closest('.item-del-btn');
        const saveBtn  = e.target.closest('.item-save-btn');
        const cancBtn  = e.target.closest('.item-cancel-btn');

        if (editBtn) {
          const row = editBtn.closest('.item-row-wrap');
          row.querySelector('.item-view').classList.add('hidden');
          row.querySelector('.item-edit').classList.remove('hidden');
        }
        if (cancBtn) {
          const row = cancBtn.closest('.item-row-wrap');
          row.querySelector('.item-view').classList.remove('hidden');
          row.querySelector('.item-edit').classList.add('hidden');
        }
        if (delBtn) {
          const itemId = delBtn.dataset.itemId;
          if (!confirm('Zeile löschen?')) return;
          try {
            await api.deleteReceiptItem(id, itemId);
            const fresh = await api.getReceipt(id);
            aktualisiereItemsKarte(fresh.items);
            aktualisiereMismatchBanner(fresh);
            zeigeToast('Zeile gelöscht', 'success');
          } catch (err) { zeigeToast(err.message, 'error'); }
        }
        if (saveBtn) {
          const itemId = saveBtn.dataset.itemId;
          const row = saveBtn.closest('.item-row-wrap');
          const desc  = row.querySelector('.edit-desc').value.trim();
          const qty   = parseFloat(row.querySelector('.edit-qty').value) || 1;
          const up    = parseFloat(row.querySelector('.edit-up').value) || 0;
          if (!desc) { zeigeToast('Beschreibung darf nicht leer sein', 'error'); return; }
          try {
            await api.updateReceiptItem(id, itemId, {
              description: desc,
              quantity: qty,
              unit_price: up,
              total_price: qty * up,
            });
            const fresh = await api.getReceipt(id);
            aktualisiereItemsKarte(fresh.items);
            aktualisiereMismatchBanner(fresh);
            zeigeToast('Gespeichert', 'success');
          } catch (err) { zeigeToast(err.message, 'error'); }
        }
      });

      // Neue Zeile hinzufügen
      document.getElementById('add-item-btn')?.addEventListener('click', () => {
        const list = document.getElementById('items-list');
        const neuId = 'new-item-form';
        if (document.getElementById(neuId)) return; // bereits offen
        const div = document.createElement('div');
        div.id = neuId;
        div.style.cssText = 'padding:8px 0;border-top:1px solid var(--border);margin-top:4px';
        div.innerHTML = `
          <div style="margin-bottom:6px">
            <input class="new-desc" placeholder="Beschreibung" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.85rem">
          </div>
          <div style="display:flex;gap:6px;margin-bottom:6px">
            <input class="new-qty" type="number" step="0.001" value="1" placeholder="Menge" style="width:70px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.85rem">
            <input class="new-up" type="number" step="0.01" value="0.00" placeholder="Preis/Stk" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.85rem">
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" id="new-item-save-btn">Hinzufügen</button>
            <button class="btn btn-secondary btn-sm" id="new-item-cancel-btn">Abbrechen</button>
          </div>
        `;
        list.appendChild(div);
        div.querySelector('.new-desc').focus();

        div.querySelector('#new-item-cancel-btn').addEventListener('click', () => div.remove());
        div.querySelector('#new-item-save-btn').addEventListener('click', async () => {
          const desc = div.querySelector('.new-desc').value.trim();
          const qty  = parseFloat(div.querySelector('.new-qty').value) || 1;
          const up   = parseFloat(div.querySelector('.new-up').value) || 0;
          const tp   = qty * up;
          if (!desc) { zeigeToast('Beschreibung darf nicht leer sein', 'error'); return; }
          try {
            await api.addReceiptItem(id, { description: desc, quantity: qty, unit_price: up, total_price: tp });
            const fresh = await api.getReceipt(id);
            aktualisiereItemsKarte(fresh.items);
            aktualisiereMismatchBanner(fresh);
            zeigeToast('Zeile hinzugefügt', 'success');
          } catch (err) { zeigeToast(err.message, 'error'); }
        });
      });
    }

    aktualisiereItemsKarte(receipt.items);

    // Event-Listener Header
    document.getElementById('back-btn').addEventListener('click', () => navigiere('receipts'));

    if (receipt.image_path) {
      document.getElementById('receipt-image').addEventListener('click', () => {
        zeigeBild(api.getImageUrl(receipt.image_path));
      });

    }

    document.getElementById('save-edit-btn').addEventListener('click', async () => {
      try {
        await api.updateReceipt(id, {
          receipt_date: document.getElementById('edit-datum').value,
          store_name: document.getElementById('edit-geschaeft').value || null,
          notes: document.getElementById('edit-notiz').value || null,
          total_amount: parseFloat(document.getElementById('edit-betrag').value) || 0,
        });
        const fresh = await api.getReceipt(id);
        aktualisiereMismatchBanner(fresh);
        zeigeToast('Gespeichert!', 'success');
      } catch (err) {
        zeigeToast(`Fehler: ${err.message}`, 'error');
      }
    });

    document.getElementById('retry-ocr-btn')?.addEventListener('click', async () => {
      try {
        await api.retryReceiptOcr(id);
        zeigeToast('OCR neu gestartet – bitte warte einen Moment', 'success');
        navigiere('receipts');
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

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

function renderItemZeile(item, kategorien) {
  const katOptionen = kategorien.map(k => `
    <option value="${k.id}" ${k.id === item.category_id ? 'selected' : ''}>${k.icon || ''} ${k.name}</option>
  `).join('');

  return `
    <div class="item-row-wrap" style="border-top:1px solid var(--border);padding:8px 0">
      <!-- Normale Ansicht -->
      <div class="item-view" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:0.9rem;font-weight:500">
            ${item.quantity !== 1 ? `${item.quantity}x ` : ''}${item.description}
          </div>
          ${item.quantity !== 1 ? `<div style="font-size:0.75rem;color:var(--text-secondary)">${(item.unit_price ?? 0).toFixed(2)}€/Stk</div>` : ''}
        </div>
        <select class="item-cat-select" data-item-id="${item.id}"
          style="flex:1;min-width:120px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.8rem">
          <option value="">Unkategorisiert</option>
          ${katOptionen}
        </select>
        <span style="font-weight:600;white-space:nowrap;min-width:55px;text-align:right">${(item.total_price ?? 0).toFixed(2)}€</span>
        <button class="item-edit-btn btn btn-ghost btn-sm btn-icon" title="Bearbeiten" style="padding:4px 6px">✏️</button>
        <button class="item-del-btn btn btn-ghost btn-sm btn-icon" data-item-id="${item.id}" title="Löschen" style="padding:4px 6px;color:var(--danger)">🗑️</button>
      </div>
      <!-- Edit-Formular (versteckt) -->
      <div class="item-edit hidden" style="padding-top:6px">
        <div style="margin-bottom:6px">
          <input class="edit-desc" value="${item.description.replace(/"/g, '&quot;')}" placeholder="Beschreibung"
            style="width:100%;box-sizing:border-box;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.85rem">
        </div>
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input class="edit-qty" type="number" step="0.001" value="${item.quantity ?? 1}" placeholder="Menge"
            style="width:70px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.85rem">
          <input class="edit-up" type="number" step="0.01" value="${(item.unit_price ?? 0).toFixed(2)}" placeholder="Preis/Stk"
            style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:0.85rem">
        </div>
        <div style="display:flex;gap:6px">
          <button class="item-save-btn btn btn-primary btn-sm" data-item-id="${item.id}">💾 Speichern</button>
          <button class="item-cancel-btn btn btn-secondary btn-sm">Abbrechen</button>
        </div>
      </div>
    </div>
  `;
}
