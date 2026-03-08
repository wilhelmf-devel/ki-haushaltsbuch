// Chart.js Wrapper – Diagramme für Dashboard
'use strict';

// Chart.js wird über ein minimales Inline-Bundle bereitgestellt (CDN-frei).
// Wir laden es lazy aus dem Public-Verzeichnis.

let Chart = null;

async function ladeChartJS() {
  if (Chart) return Chart;
  // Dynamischer Import von chart.js via fetch + eval (kein CDN, kein Bundler)
  // Stattdessen nutzen wir ein schlankes Canvas-2D-Rendering
  return null;
}

// Hilfsfunktion: Hex-Farbe mit Transparenz
function hexMitAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Kuchendiagramm: Ausgaben nach Kategorie
export function zeichneKuchendiagramm(canvas, daten) {
  if (!canvas || !daten || daten.length === 0) return null;

  const ctx = canvas.getContext('2d');
  const breite = canvas.width;
  const hoehe = canvas.height;
  ctx.clearRect(0, 0, breite, hoehe);

  const total = daten.reduce((s, d) => s + d.summe, 0);
  if (total === 0) return null;

  const cx = breite / 2;
  const cy = hoehe / 2;
  const radius = Math.min(cx, cy) - 10;

  let startWinkel = -Math.PI / 2;

  for (const d of daten) {
    const winkel = (d.summe / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startWinkel, startWinkel + winkel);
    ctx.closePath();
    ctx.fillStyle = d.color || '#9E9E9E';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    startWinkel += winkel;
  }

  // Innenloch (Donut-Style)
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.55, 0, 2 * Math.PI);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#fff';
  ctx.fill();

  return { total };
}

// Balkendiagramm: Ausgaben der letzten Monate
export function zeichneBalkendiagramm(canvas, daten) {
  if (!canvas || !daten || daten.length === 0) return null;

  const ctx = canvas.getContext('2d');
  const breite = canvas.width;
  const hoehe = canvas.height;
  ctx.clearRect(0, 0, breite, hoehe);

  const padding = { top: 16, right: 12, bottom: 40, left: 50 };
  const plotBreite = breite - padding.left - padding.right;
  const plotHoehe = hoehe - padding.top - padding.bottom;

  const maxWert = Math.max(...daten.map(d => d.summe), 1);
  const balkenBreite = (plotBreite / daten.length) * 0.7;
  const balkenAbstand = plotBreite / daten.length;

  // Hintergrundgitter
  const primaer = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#1976D2';
  const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#757575';

  ctx.strokeStyle = 'rgba(128,128,128,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + plotHoehe * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotBreite, y);
    ctx.stroke();

    // Y-Achsen-Labels
    const val = (maxWert * i / 4).toFixed(0);
    ctx.fillStyle = textSecondary;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${val}€`, padding.left - 4, y + 4);
  }

  // Balken
  daten.forEach((d, i) => {
    const x = padding.left + i * balkenAbstand + (balkenAbstand - balkenBreite) / 2;
    const balkenHoehe = (d.summe / maxWert) * plotHoehe;
    const y = padding.top + plotHoehe - balkenHoehe;

    ctx.fillStyle = primaer;
    ctx.beginPath();
    ctx.roundRect(x, y, balkenBreite, balkenHoehe, [4, 4, 0, 0]);
    ctx.fill();

    // X-Achsen-Labels
    const [jahr, monat] = d.monat.split('-');
    const label = `${monat}/${jahr.slice(2)}`;
    ctx.fillStyle = textSecondary;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + balkenBreite / 2, hoehe - padding.bottom + 14);
  });

  return true;
}

// Legende für Kuchendiagramm rendern
export function zeichneLegende(container, daten, total) {
  if (!container) return;
  container.innerHTML = '';

  const anzeigeEintraege = daten.slice(0, 8); // Max 8 Einträge
  for (const d of anzeigeEintraege) {
    const prozent = total > 0 ? ((d.summe / total) * 100).toFixed(1) : '0';
    const zeile = document.createElement('div');
    zeile.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.8rem;';
    zeile.innerHTML = `
      <span class="color-swatch" style="background:${d.color || '#9E9E9E'}"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.icon || ''} ${d.name}</span>
      <span style="color:var(--text-secondary)">${prozent}%</span>
      <span style="font-weight:600">${d.summe.toFixed(2)}€</span>
    `;
    container.appendChild(zeile);
  }

  if (daten.length > 8) {
    const restEintraege = daten.slice(8);
    let aufgeklappt = false;

    const restContainer = document.createElement('div');
    restEintraege.forEach(d => {
      const prozent = total > 0 ? ((d.summe / total) * 100).toFixed(1) : '0';
      const zeile = document.createElement('div');
      zeile.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.8rem;display:none;';
      zeile.innerHTML = `
        <span class="color-swatch" style="background:${d.color || '#9E9E9E'}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.icon || ''} ${d.name}</span>
        <span style="color:var(--text-secondary)">${prozent}%</span>
        <span style="font-weight:600">${d.summe.toFixed(2)}€</span>
      `;
      restContainer.appendChild(zeile);
    });
    container.appendChild(restContainer);

    const toggle = document.createElement('div');
    toggle.style.cssText = 'font-size:0.75rem;color:var(--primary);text-align:center;margin-top:4px;cursor:pointer;user-select:none;';
    toggle.textContent = `+ ${restEintraege.length} weitere Kategorien`;
    toggle.addEventListener('click', () => {
      aufgeklappt = !aufgeklappt;
      restContainer.querySelectorAll('div').forEach(el => el.style.display = aufgeklappt ? 'flex' : 'none');
      toggle.textContent = aufgeklappt ? '▲ weniger anzeigen' : `+ ${restEintraege.length} weitere Kategorien`;
    });
    container.appendChild(toggle);
  }
}
