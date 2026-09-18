// Gemeinsamer Zeitraum-State für Übersicht und Belege.
// Vorher hielt jede View ihren eigenen Monat – wer im Dashboard auf
// "Alle Zeiten" stellte, landete in den Belegen wieder im leeren aktuellen Monat.
'use strict';

import { api } from './api.js';

const heute = new Date();

// Modul-State: lebt so lange die App geöffnet ist. Bewusst nicht in
// localStorage – ein dauerhaft gemerktes "Alle Zeiten" wäre beim nächsten
// Start eine Überraschung.
let state = {
  modus: 'monat',        // 'monat' | 'alle' | 'zeitraum'
  jahr: heute.getFullYear(),
  m: heute.getMonth(),   // 0-indexiert
  von: null,             // nur im Modus 'zeitraum'
  bis: null,
};

// ===== DATUMS-HILFSFUNKTIONEN =====

export function monatStart(j, m) {
  return `${j}-${String(m + 1).padStart(2, '0')}-01`;
}

export function monatEnde(j, m) {
  const letzter = new Date(j, m + 1, 0);
  return `${j}-${String(m + 1).padStart(2, '0')}-${String(letzter.getDate()).padStart(2, '0')}`;
}

export function monatText(j, m) {
  return new Date(j, m, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

// ===== STATE LESEN =====

export function getZeitraum() {
  return { ...state };
}

// from/to für die API – undefined bedeutet "kein Filter"
export function grenzen() {
  if (state.modus === 'alle') return { from: undefined, to: undefined };
  if (state.modus === 'zeitraum') {
    return { from: state.von || undefined, to: state.bis || undefined };
  }
  return { from: monatStart(state.jahr, state.m), to: monatEnde(state.jahr, state.m) };
}

export function beschriftung() {
  if (state.modus === 'alle') return 'Alle Zeiten';
  if (state.modus === 'zeitraum') return 'Eigener Zeitraum';
  return monatText(state.jahr, state.m);
}

// ===== STATE ÄNDERN =====

export function verschiebeMonat(delta) {
  let { jahr, m } = state;
  m += delta;
  while (m < 0)  { m += 12; jahr--; }
  while (m > 11) { m -= 12; jahr++; }
  state = { ...state, modus: 'monat', jahr, m };
}

export function setMonat(jahr, m) {
  state = { ...state, modus: 'monat', jahr, m };
}

// 'YYYY-MM' → Monatsmodus (für den Sprung aus leeren Ansichten)
export function setMonatAusString(monatStr) {
  const [jahr, monat] = String(monatStr).split('-').map(Number);
  if (!jahr || !monat) return false;
  setMonat(jahr, monat - 1);
  return true;
}

export function setAlle() {
  state = { ...state, modus: 'alle' };
}

export function setZeitraumGrenzen(von, bis) {
  state = { ...state, modus: 'zeitraum', von: von || null, bis: bis || null };
}

// 📅-Button: Zeitraum-Modus an/aus. Beim Einschalten mit dem aktuellen
// Monat vorbelegen, damit die Datumsfelder nicht leer starten.
export function toggleZeitraum() {
  if (state.modus === 'zeitraum') {
    state = { ...state, modus: 'monat' };
    return;
  }
  state = {
    ...state,
    modus: 'zeitraum',
    von: state.von || monatStart(state.jahr, state.m),
    bis: state.bis || monatEnde(state.jahr, state.m),
  };
}

// ===== LETZTER MONAT MIT BELEGEN =====
// Ausweg aus leeren Ansichten: "Zum letzten Monat mit Belegen".
// stats.nach_monat ignoriert from/to im Backend und liefert immer die
// (bis zu 12) Monate mit Daten, aufsteigend sortiert.

const monatsCache = new Map(); // tenantId → 'YYYY-MM' | null

export function merkeMonate(tenantId, nachMonat) {
  if (!Array.isArray(nachMonat)) return;
  const letzter = nachMonat.length ? nachMonat[nachMonat.length - 1].monat : null;
  monatsCache.set(String(tenantId), letzter);
}

export async function letzterMonatMitDaten(tenantId) {
  const key = String(tenantId);
  if (monatsCache.has(key)) return monatsCache.get(key);
  try {
    const stats = await api.getStats({ tenant_id: tenantId });
    merkeMonate(tenantId, stats.nach_monat);
  } catch {
    monatsCache.set(key, null);
  }
  return monatsCache.get(key) ?? null;
}

// Nach dem Anlegen/Löschen von Belegen kann sich der letzte Monat ändern
export function leereMonatsCache() {
  monatsCache.clear();
}
