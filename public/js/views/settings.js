// Einstellungen-View: Mandanten, Kategorien, KI-Einstellungen
'use strict';

import { api } from '../api.js';
import { zeigeToast, navigiere } from '../app.js';

// Verfügbare Modelle pro Provider
const MODELLE = {
  gemini: [
    { value: 'gemini-2.5-flash-lite',         label: 'Gemini 2.5 Flash-Lite (Standard – schnell & günstig)' },
    { value: 'gemini-2.5-flash',              label: 'Gemini 2.5 Flash (höhere Qualität)' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview (neuestes Modell)' },
  ],
  claude: [
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (schnell & günstig)' },
    { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (besser, etwas teurer)' },
  ],
  openai: [
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (Standard)' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano (schneller, für einfache Belege)' },
  ],
};

// Key-Feld rendern: Badge wenn aus env, Input wenn aus DB oder nicht gesetzt
function renderKeyField(id, source, placeholder) {
  if (source === 'env') {
    return `
      <div class="key-env-badge" id="${id}-wrapper">
        🔒 Via <code>.env</code> gesetzt – nicht änderbar
      </div>
      <input type="hidden" id="${id}" value="••••••••">
    `;
  }
  return `
    <input type="password" id="${id}"
      value="${source === 'db' ? '••••••••' : ''}"
      placeholder="${placeholder}"
      autocomplete="new-password">
  `;
}

// Modell-Dropdown rendern
function renderModelSelect(id, provider, currentModel) {
  const optionen = MODELLE[provider] || [];
  return `
    <select id="${id}">
      ${optionen.map(m => `
        <option value="${m.value}" ${currentModel === m.value ? 'selected' : ''}>${m.label}</option>
      `).join('')}
    </select>
  `;
}

export async function renderSettings(container, tenantId, onTenantChange, currentUser = {}) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const [mandanten, kategorien, einstellungen] = await Promise.all([
      api.getTenants(),
      api.getCategories(tenantId),
      api.getSettings(),
    ]);

    // Kategorien nach Gruppe gruppieren
    const gruppenMap = {};
    for (const k of kategorien) {
      const g = k.group_name || 'Sonstige';
      if (!gruppenMap[g]) gruppenMap[g] = [];
      gruppenMap[g].push(k);
    }

    const activeProvider = einstellungen.ai_provider || 'gemini';

    container.innerHTML = `
      <!-- Mandanten -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🗺️ Mandanten</span>
          <button class="btn btn-primary btn-sm" id="new-tenant-btn">+ Neu</button>
        </div>
        <div id="tenants-list">
          ${mandanten.map(t => `
            <div class="item-row" data-tenant-id="${t.id}">
              <span class="item-description">${t.name}</span>
              <button class="btn btn-ghost btn-sm tenant-edit" data-id="${t.id}" data-name="${t.name}">✏️</button>
              <button class="btn btn-ghost btn-sm tenant-del" data-id="${t.id}">🗑️</button>
            </div>
          `).join('')}
        </div>
        <form id="new-tenant-form" class="hidden" style="margin-top:12px;display:flex;gap:8px">
          <input type="text" id="new-tenant-name" placeholder="Name des Mandanten" class="search-input" style="flex:1">
          <button type="submit" class="btn btn-primary btn-sm">Anlegen</button>
          <button type="button" class="btn btn-secondary btn-sm" id="cancel-tenant-btn">Abbrechen</button>
        </form>
      </div>

      <!-- KI-Einstellungen -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🤖 KI-Einstellungen</span>
        </div>

        <div class="form-group">
          <label>Aktiver Provider</label>
          <select id="ai-provider">
            <option value="gemini" ${activeProvider === 'gemini' ? 'selected' : ''}>Gemini</option>
            <option value="claude" ${activeProvider === 'claude' ? 'selected' : ''}>Claude</option>
            <option value="openai" ${activeProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
          </select>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">

        <!-- Gemini -->
        <div class="provider-section ${activeProvider === 'gemini' ? 'provider-active' : ''}">
          <div class="provider-label">
            <span class="provider-name">Gemini</span>
            ${activeProvider === 'gemini' ? '<span class="provider-badge">Aktiv</span>' : ''}
          </div>
          <div class="form-group">
            <label>Modell</label>
            ${renderModelSelect('gemini-model', 'gemini', einstellungen.gemini_model)}
          </div>
          <div class="form-group">
            <label>API-Key <a href="https://aistudio.google.com/" target="_blank" class="key-hint">→ Google AI Studio</a></label>
            ${renderKeyField('gemini-key', einstellungen.gemini_key_source, 'AI… (Google AI Studio)')}
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">

        <!-- Claude -->
        <div class="provider-section ${activeProvider === 'claude' ? 'provider-active' : ''}">
          <div class="provider-label">
            <span class="provider-name">Claude</span>
            ${activeProvider === 'claude' ? '<span class="provider-badge">Aktiv</span>' : ''}
          </div>
          <div class="form-group">
            <label>Modell</label>
            ${renderModelSelect('claude-model', 'claude', einstellungen.claude_model)}
          </div>
          <div class="form-group">
            <label>API-Key <a href="https://console.anthropic.com/" target="_blank" class="key-hint">→ Anthropic Console</a></label>
            ${renderKeyField('anthropic-key', einstellungen.claude_key_source, 'sk-ant-…')}
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">

        <!-- OpenAI -->
        <div class="provider-section ${activeProvider === 'openai' ? 'provider-active' : ''}">
          <div class="provider-label">
            <span class="provider-name">OpenAI</span>
            ${activeProvider === 'openai' ? '<span class="provider-badge">Aktiv</span>' : ''}
          </div>
          <div class="form-group">
            <label>Modell</label>
            ${renderModelSelect('openai-model', 'openai', einstellungen.openai_model)}
          </div>
          <div class="form-group">
            <label>API-Key <a href="https://platform.openai.com/api-keys" target="_blank" class="key-hint">→ OpenAI Platform</a></label>
            ${renderKeyField('openai-key', einstellungen.openai_key_source, 'sk-…')}
          </div>
        </div>

        <div style="margin-top:16px;text-align:right">
          <button class="btn btn-primary" id="save-settings-btn">Einstellungen speichern</button>
        </div>
      </div>

      ${currentUser.authActive && currentUser.isAdmin ? `
      <!-- Benutzerverwaltung (nur für Admins sichtbar wenn Auth aktiv) -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">👥 Benutzerverwaltung</span>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Benutzer Mandanten zuweisen. Nur Admins haben Zugriff auf diese Seite.
        </p>
        <button class="btn btn-secondary" id="open-user-mgmt-btn">Benutzerverwaltung öffnen →</button>
      </div>
      ` : ''}

      <!-- Kategorien -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🏷️ Kategorien</span>
          <button class="btn btn-primary btn-sm" id="new-cat-btn">+ Neu</button>
        </div>

        <form id="new-cat-form" class="hidden" style="margin-bottom:16px;background:var(--bg);padding:12px;border-radius:var(--radius-sm)">
          <div class="form-row">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="new-cat-name" placeholder="z.B. Wein">
            </div>
            <div class="form-group">
              <label>Gruppe</label>
              <input type="text" id="new-cat-group" placeholder="z.B. Getränke" list="gruppen-list">
              <datalist id="gruppen-list">
                ${Object.keys(gruppenMap).map(g => `<option value="${g}">`).join('')}
              </datalist>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Emoji</label>
              <input type="text" id="new-cat-icon" placeholder="🍷" maxlength="4">
            </div>
            <div class="form-group">
              <label>Farbe</label>
              <input type="color" id="new-cat-color" value="#888888">
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button type="submit" class="btn btn-primary btn-sm">Anlegen</button>
            <button type="button" class="btn btn-secondary btn-sm" id="cancel-cat-btn">Abbrechen</button>
          </div>
        </form>

        <div id="cats-list">
          ${Object.entries(gruppenMap).map(([gruppe, kats]) => `
            <div style="margin-bottom:12px">
              <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px">
                ${gruppe}
              </div>
              ${kats.map(k => `
                <div class="item-row" data-cat-id="${k.id}">
                  <span class="color-swatch" style="background:${k.color || '#888'}"></span>
                  <span class="item-description">${k.icon || ''} ${k.name}</span>
                  <button class="btn btn-ghost btn-sm cat-del" data-id="${k.id}">🗑️</button>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Daten-Export -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">📥 Daten exportieren</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="/api/export/csv?tenant_id=${tenantId}" class="btn btn-secondary" download>📄 CSV</a>
          <a href="/api/export/xlsx?tenant_id=${tenantId}" class="btn btn-secondary" download>📊 Excel</a>
        </div>
      </div>

      <!-- Kategorisierung -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔄 Neu kategorisieren</span>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Alle nicht manuell korrigierten Positionen werden mit der aktuellen Kategorieliste neu zugewiesen.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-secondary" id="recategorize-missing-btn">Unkategorisierte neu eingruppieren</button>
          <button class="btn btn-secondary" id="recategorize-btn" style="color:var(--text-secondary)">Alle neu kategorisieren</button>
        </div>
      </div>

      <!-- Kategorien zurücksetzen -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔃 Kategorien zurücksetzen</span>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Alle globalen Kategorien werden auf die 41 Standard-Kategorien zurückgesetzt.
          Eigene Anpassungen gehen verloren. Alle Positionen werden danach automatisch neu kategorisiert.
        </p>
        <button class="btn btn-secondary" id="reset-cats-btn" style="color:#d32f2f">Kategorien auf Standard zurücksetzen</button>
      </div>

      <!-- App-Cache -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔁 App-Cache</span>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Bei sichtbaren Darstellungsproblemen oder nach einem Update: Cache leeren und App neu laden.
          Gespeicherte Daten bleiben erhalten.
        </p>
        <button class="btn btn-secondary" id="clear-cache-btn">App-Cache leeren & neu laden</button>
      </div>
    `;

    // ===== EVENT LISTENER =====

    // Benutzerverwaltung öffnen (Admin-Link)
    document.getElementById('open-user-mgmt-btn')?.addEventListener('click', () => {
      navigiere('user-management');
    });

    // Mandant anlegen
    document.getElementById('new-tenant-btn').addEventListener('click', () => {
      document.getElementById('new-tenant-form').classList.remove('hidden');
    });
    document.getElementById('cancel-tenant-btn').addEventListener('click', () => {
      document.getElementById('new-tenant-form').classList.add('hidden');
    });
    document.getElementById('new-tenant-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-tenant-name').value.trim();
      if (!name) return;
      try {
        await api.createTenant({ name });
        zeigeToast('Mandant angelegt!', 'success');
        onTenantChange?.();
        renderSettings(container, tenantId, onTenantChange);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Mandant umbenennen
    document.getElementById('tenants-list').addEventListener('click', async (e) => {
      const edit = e.target.closest('.tenant-edit');
      if (!edit) return;

      const row = edit.closest('.item-row');
      const id = edit.dataset.id;
      const currentName = edit.dataset.name;

      // Inline-Eingabe einblenden
      row.innerHTML = `
        <input type="text" class="search-input tenant-rename-input" value="${currentName.replace(/"/g, '&quot;')}" style="flex:1">
        <button class="btn btn-primary btn-sm tenant-rename-save">✓</button>
        <button class="btn btn-secondary btn-sm tenant-rename-cancel">✕</button>
      `;
      const input = row.querySelector('.tenant-rename-input');
      input.focus();
      input.select();

      row.querySelector('.tenant-rename-save').addEventListener('click', async () => {
        const newName = input.value.trim();
        if (!newName) return;
        try {
          await api.updateTenant(id, { name: newName });
          zeigeToast('Mandant umbenannt', 'success');
          onTenantChange?.();
          renderSettings(container, tenantId, onTenantChange, currentUser);
        } catch (err) {
          zeigeToast(err.message, 'error');
        }
      });

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') row.querySelector('.tenant-rename-save').click();
        if (ev.key === 'Escape') renderSettings(container, tenantId, onTenantChange, currentUser);
      });

      row.querySelector('.tenant-rename-cancel').addEventListener('click', () => {
        renderSettings(container, tenantId, onTenantChange, currentUser);
      });
    });

    // Mandant löschen
    document.getElementById('tenants-list').addEventListener('click', async (e) => {
      const del = e.target.closest('.tenant-del');
      if (!del) return;
      if (!confirm('Mandant wirklich löschen?')) return;
      try {
        await api.deleteTenant(del.dataset.id);
        zeigeToast('Mandant gelöscht', 'success');
        onTenantChange?.();
        renderSettings(container, tenantId, onTenantChange, currentUser);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Einstellungen speichern
    document.getElementById('save-settings-btn').addEventListener('click', async () => {
      try {
        await api.saveSettings({
          ai_provider:      document.getElementById('ai-provider').value,
          gemini_model:     document.getElementById('gemini-model').value,
          claude_model:     document.getElementById('claude-model').value,
          openai_model:     document.getElementById('openai-model').value,
          gemini_api_key:   document.getElementById('gemini-key').value,
          anthropic_api_key: document.getElementById('anthropic-key').value,
          openai_api_key:   document.getElementById('openai-key').value,
        });
        zeigeToast('Einstellungen gespeichert!', 'success');
        renderSettings(container, tenantId, onTenantChange);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Neue Kategorie
    document.getElementById('new-cat-btn').addEventListener('click', () => {
      document.getElementById('new-cat-form').classList.remove('hidden');
    });
    document.getElementById('cancel-cat-btn').addEventListener('click', () => {
      document.getElementById('new-cat-form').classList.add('hidden');
    });
    document.getElementById('new-cat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-cat-name').value.trim();
      if (!name) return;
      try {
        await api.createCategory({
          tenant_id: null,
          name,
          group_name: document.getElementById('new-cat-group').value.trim() || null,
          icon: document.getElementById('new-cat-icon').value.trim() || null,
          color: document.getElementById('new-cat-color').value,
        });
        zeigeToast('Kategorie angelegt!', 'success');
        renderSettings(container, tenantId, onTenantChange);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Kategorie löschen
    document.getElementById('cats-list').addEventListener('click', async (e) => {
      const del = e.target.closest('.cat-del');
      if (!del) return;
      if (!confirm('Kategorie löschen? Alle Positionen werden auf "Sonstiges" gesetzt.')) return;
      try {
        await api.deleteCategory(del.dataset.id, { moveToSonstiges: true });
        zeigeToast('Kategorie gelöscht', 'success');
        renderSettings(container, tenantId, onTenantChange);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // App-Cache leeren
    document.getElementById('clear-cache-btn').addEventListener('click', async () => {
      try {
        // SW benachrichtigen, alle Caches zu löschen
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.active) {
          reg.active.postMessage({ type: 'CLEAR_CACHE' });
        }
        // Eigene Caches direkt löschen (Fallback)
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        zeigeToast('Cache geleert – App wird neu geladen…', 'success');
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        zeigeToast('Cache-Fehler: ' + err.message, 'error');
      }
    });

    // Kategorien zurücksetzen
    document.getElementById('reset-cats-btn').addEventListener('click', async () => {
      if (!confirm('Wirklich alle globalen Kategorien auf Standard zurücksetzen? Eigene Kategorien gehen verloren und alle Positionen werden neu kategorisiert.')) return;
      try {
        const { categories_reset, receipts_queued } = await api.resetCategories();
        zeigeToast(`${categories_reset} Standard-Kategorien wiederhergestellt, ${receipts_queued} Belege zur Neukategorisierung eingeplant`, 'success');
        renderSettings(container, tenantId, onTenantChange);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Nur unkategorisierte Positionen neu eingruppieren
    document.getElementById('recategorize-missing-btn').addEventListener('click', async () => {
      try {
        const { receipts_queued } = await api.recategorizeMissing();
        if (receipts_queued === 0) {
          zeigeToast('Keine unkategorisierten Positionen gefunden', 'info');
        } else {
          zeigeToast(`${receipts_queued} Belege mit unkategorisierten Positionen eingeplant`, 'success');
        }
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Alle Positionen neu kategorisieren
    document.getElementById('recategorize-btn').addEventListener('click', async () => {
      if (!confirm('Alle Positionen neu kategorisieren? (Manuelle Korrekturen bleiben erhalten)')) return;
      try {
        const { receipts_queued } = await api.recategorize(tenantId);
        zeigeToast(`${receipts_queued} Belege zur Kategorisierung eingeplant`, 'success');
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
  }
}
