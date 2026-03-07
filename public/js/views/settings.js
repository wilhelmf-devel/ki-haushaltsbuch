// Einstellungen-View: Mandanten, Kategorien, KI-Einstellungen
'use strict';

import { api } from '../api.js';
import { zeigeToast } from '../app.js';

export async function renderSettings(container, tenantId, onTenantChange) {
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
          <label>KI-Anbieter</label>
          <select id="ai-provider">
            <option value="gemini" ${einstellungen.ai_provider !== 'claude' ? 'selected' : ''}>Gemini 2.5 Flash (empfohlen)</option>
            <option value="claude" ${einstellungen.ai_provider === 'claude' ? 'selected' : ''}>Claude Haiku 4.5</option>
          </select>
        </div>
        <div class="form-group">
          <label>Google Gemini API-Key</label>
          <input type="password" id="gemini-key" value="${einstellungen.gemini_api_key || ''}" placeholder="Aus Google AI Studio">
        </div>
        <div class="form-group">
          <label>Anthropic API-Key</label>
          <input type="password" id="anthropic-key" value="${einstellungen.anthropic_api_key || ''}" placeholder="sk-ant-...">
        </div>
        <button class="btn btn-primary btn-sm" id="save-settings-btn">Einstellungen speichern</button>
      </div>

      <!-- Kategorien -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🏷️ Kategorien</span>
          <button class="btn btn-primary btn-sm" id="new-cat-btn">+ Neu</button>
        </div>

        <!-- Neue Kategorie Formular -->
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

        <!-- Kategorien-Liste -->
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
          <a href="/api/export/csv?tenant_id=${tenantId}" class="btn btn-secondary" download>
            📄 CSV
          </a>
          <a href="/api/export/xlsx?tenant_id=${tenantId}" class="btn btn-secondary" download>
            📊 Excel
          </a>
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
        <button class="btn btn-secondary" id="recategorize-btn">Alle Positionen neu kategorisieren</button>
      </div>
    `;

    // ===== EVENT LISTENER =====

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

    // Mandant löschen
    document.getElementById('tenants-list').addEventListener('click', async (e) => {
      const del = e.target.closest('.tenant-del');
      if (!del) return;
      if (!confirm('Mandant wirklich löschen?')) return;
      try {
        await api.deleteTenant(del.dataset.id);
        zeigeToast('Mandant gelöscht', 'success');
        onTenantChange?.();
        renderSettings(container, tenantId, onTenantChange);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Einstellungen speichern
    document.getElementById('save-settings-btn').addEventListener('click', async () => {
      try {
        await api.saveSettings({
          ai_provider: document.getElementById('ai-provider').value,
          gemini_api_key: document.getElementById('gemini-key').value,
          anthropic_api_key: document.getElementById('anthropic-key').value,
        });
        zeigeToast('Einstellungen gespeichert!', 'success');
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
          tenant_id: null, // Global
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
      const antwort = confirm('Kategorie löschen? Alle Positionen werden auf "Sonstiges" gesetzt.');
      if (!antwort) return;
      try {
        await api.deleteCategory(del.dataset.id, { moveToSonstiges: true });
        zeigeToast('Kategorie gelöscht', 'success');
        renderSettings(container, tenantId, onTenantChange);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Neu kategorisieren
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
