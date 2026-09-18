// Monats-/Zeitraum-Navigation – gemeinsam von Übersicht und Belegen genutzt.
// Beide Views hatten diese Leiste vorher doppelt, mit eigenem State.
'use strict';

import * as zeit from './period.js';

// Rendert die Navigation in `container` und verdrahtet sie.
// `onChange` läuft nach jeder Zeitraum-Änderung.
export function renderZeitraumNav(container, onChange) {
  if (!container) return;

  container.innerHTML = `
    <div class="monat-nav">
      <button class="btn btn-ghost btn-icon" data-zeit="prev"
        title="Vorheriger Monat" aria-label="Vorheriger Monat">‹</button>
      <span class="monat-label" data-zeit="label" aria-live="polite"></span>
      <button class="btn btn-ghost btn-icon" data-zeit="next"
        title="Nächster Monat" aria-label="Nächster Monat">›</button>
      <button class="btn btn-ghost btn-sm" data-zeit="alle">Alle</button>
      <button class="btn btn-ghost btn-icon" data-zeit="range"
        title="Eigener Zeitraum" aria-label="Eigener Zeitraum">📅</button>
    </div>

    <div class="custom-range hidden" data-zeit="range-row">
      <input type="date" class="filter-select" data-zeit="von" aria-label="Zeitraum von">
      <span class="range-trenner">–</span>
      <input type="date" class="filter-select" data-zeit="bis" aria-label="Zeitraum bis">
    </div>
  `;

  const el = (name) => container.querySelector(`[data-zeit="${name}"]`);

  function aktualisiere() {
    const { modus } = zeit.getZeitraum();
    const grenzen = zeit.grenzen();

    el('label').textContent = zeit.beschriftung();

    // Monatspfeile nur im Monatsmodus sinnvoll
    const navAktiv = modus === 'monat';
    for (const name of ['prev', 'next']) {
      el(name).disabled = !navAktiv;
      el(name).style.opacity = navAktiv ? '' : '0.35';
    }
    el('alle').style.fontWeight = modus === 'alle' ? '700' : '';
    el('range').setAttribute('aria-pressed', modus === 'zeitraum' ? 'true' : 'false');

    const zeile = el('range-row');
    zeile.classList.toggle('hidden', modus !== 'zeitraum');
    if (modus === 'zeitraum') {
      el('von').value = grenzen.from || '';
      el('bis').value = grenzen.to || '';
    }
  }

  function geaendert() {
    aktualisiere();
    onChange?.();
  }

  el('prev').addEventListener('click', () => { zeit.verschiebeMonat(-1); geaendert(); });
  el('next').addEventListener('click', () => { zeit.verschiebeMonat(1);  geaendert(); });
  el('alle').addEventListener('click', () => { zeit.setAlle();           geaendert(); });
  el('range').addEventListener('click', () => { zeit.toggleZeitraum();   geaendert(); });

  for (const name of ['von', 'bis']) {
    el(name).addEventListener('change', () => {
      zeit.setZeitraumGrenzen(el('von').value, el('bis').value);
      geaendert();
    });
  }

  aktualisiere();

  // Damit Ausweg-Buttons aus leeren Ansichten die Leiste mitziehen können
  return { aktualisiere };
}
