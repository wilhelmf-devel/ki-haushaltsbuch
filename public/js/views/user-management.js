// Benutzerverwaltung – Mandanten zu Benutzern zuordnen (nur für Admins)
'use strict';

import { api } from '../api.js';
import { zeigeToast, navigiere } from '../app.js';

export async function renderUserManagement(container, currentUser) {
  if (!currentUser?.authActive || !currentUser?.isAdmin) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <p>Kein Zugriff. Diese Seite ist nur für Admins sichtbar.</p>
      </div>`;
    return;
  }

  await ladeUndRendere(container);
}

async function ladeUndRendere(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const { users, tenants } = await api.getAdminUsers();

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="btn btn-ghost btn-sm" id="back-btn">← Zurück</button>
        <h2 style="font-size:1.1rem;font-weight:700;margin:0">👥 Benutzerverwaltung</h2>
      </div>

      <!-- Neuer Benutzer vorerfassen -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Benutzer vorerfassen</span>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Benutzer erscheinen automatisch nach ihrem ersten Login. Hier können Benutzer auch vorab erfasst werden.
        </p>
        <div style="display:flex;gap:8px">
          <input type="text" id="new-username-input" placeholder="Benutzername" class="search-input" style="flex:1">
          <button class="btn btn-primary btn-sm" id="add-user-btn">Hinzufügen</button>
        </div>
      </div>

      <!-- Bekannte Benutzer -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Benutzer &amp; Mandanten</span>
        </div>
        ${users.length === 0 ? `
          <div class="empty-state" style="padding:16px 0">
            <p style="color:var(--text-secondary)">Noch keine Benutzer bekannt.</p>
          </div>
        ` : users.map(u => `
          <div style="border-bottom:1px solid var(--border);padding:12px 0">
            <div style="font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              👤 ${u.username}
              <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:400">
                (seit ${new Date(u.first_seen_at).toLocaleDateString('de-DE')})
              </span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${tenants.map(t => {
                const assigned = u.tenant_ids.includes(t.id);
                return `
                  <button class="btn btn-sm toggle-tenant-btn ${assigned ? 'btn-primary' : 'btn-secondary'}"
                    data-username="${u.username}"
                    data-tenant-id="${t.id}"
                    data-assigned="${assigned}">
                    ${assigned ? '✓ ' : ''}${t.name}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Zurück
    document.getElementById('back-btn').addEventListener('click', () => navigiere('settings'));

    // Benutzer vorerfassen
    document.getElementById('add-user-btn').addEventListener('click', async () => {
      const username = document.getElementById('new-username-input').value.trim();
      if (!username) return;
      try {
        await api.createUser(username);
        zeigeToast(`Benutzer '${username}' vorerfasst`, 'success');
        ladeUndRendere(container);
      } catch (err) {
        zeigeToast(err.message, 'error');
      }
    });

    // Mandant-Zuweisung umschalten
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('.toggle-tenant-btn');
      if (!btn) return;

      const username = btn.dataset.username;
      const tenantId = btn.dataset.tenantId;
      const assigned  = btn.dataset.assigned === 'true';

      btn.disabled = true;
      try {
        if (assigned) {
          await api.unassignTenant(username, tenantId);
        } else {
          await api.assignTenant(username, tenantId);
        }
        ladeUndRendere(container);
      } catch (err) {
        zeigeToast(err.message, 'error');
        btn.disabled = false;
      }
    });

  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>${err.message}</p>
      </div>`;
  }
}
