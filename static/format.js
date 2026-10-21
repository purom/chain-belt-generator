/* Belt & Chain Calculator — Helpers: DOM lookup, number & length formatting (mm | in), icons, small HTML / SVG builders.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

/* ---------------- helpers ---------------- */
const $ = id => document.getElementById(id);
const num = el => parseFloat(el.value);
const f = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';
const sgn = (x, d = 3) => !Number.isFinite(x) ? '—'
  : (Math.abs(x) < 0.5 * 10 ** -d ? '±' : x > 0 ? '+' : '−') + Math.abs(x).toFixed(d);
const deg = r => r * 180 / Math.PI;
const inch = mm => mm / 25.4;

/* ---- display unit: everything is computed in mm; 'in' only changes what is shown and typed (DXF / STEP stay mm) ---- */
const IN = 25.4;
let UNIT = 'mm';
const U = () => UNIT;
const toU = mm => UNIT === 'in' ? mm / IN : mm;
const dU = d => UNIT === 'in' ? [2, 3, 3, 4, 5][d] ?? d + 1 : d;      // inches need about one more decimal
const fl = (x, d = 2) => f(toU(x), dU(d));                            // a length, as a number in the display unit
const len = (x, d = 2) => `${fl(x, d)} ${UNIT}`;
const rawL = x => UNIT === 'in' ? String(+(+x / IN).toFixed(4)) : String(+(+x).toFixed(4));   // a catalog value: as given in mm, or inches to 4 places
const lenR = x => `${rawL(x)} ${UNIT}`;
const sgnL = (x, d = 3) => `${sgn(toU(x), dU(d))} ${UNIT}`;
const alt = x => UNIT === 'in' ? `${f(x, 2)} mm` : `${f(inch(x), 4)} in`;   // the other unit, for the hero sub-lines
const P = v => +v.toFixed(4);
const NS = 'vector-effect="non-scaling-stroke"';
const ICON_COPY = '<svg class="i-cp" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>';
const ICON_OK = '<svg class="i-ok" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" pathLength="1"/></svg>';
const ICON_DL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="2.8" height="10" rx=".6"/><rect x="9.2" y="3" width="2.8" height="10" rx=".6"/></svg>';

const pitchLabel = b => b.inch ? `${(b.pitch / IN).toFixed(3)}″ pitch · ANSI` : `${lenR(b.pitch)} pitch`;

const notesHTML = list => list.length
  ? `<ul class="notes">${list.map(([lv, t], i) => `<li class="${lv}" style="--i:${i}"><span>${keyed(t, `n${i}`)}</span></li>`).join('')}</ul>` : '';

const errorBlock = (title, msg) =>
  `<div class="hero bad"><div class="hero-label" data-k="hl">Can't solve</div><div class="hero-title" data-k="e:t">${title}</div><p>${keyed(msg, 'e:m')}</p></div>`;

/* give every run of text between tags its own roll key, so sentences with <b> parts roll without losing the markup */
function keyed(html, k) { return String(html).split(/(<[^>]+>)/).map((p, j) => !p || p[0] === '<' ? p : `<span data-k="${k}.${j}">${p}</span>`).join(''); }

/* items: [label, displayed value, value to copy (null = no button), roll key (default: the label)] */
function kvGrid(items) {
  return `<div class="kv">${items.map(([k, v, c, key = k], i) => `<div style="--i:${i}"><span class="k" data-k="L:${key}">${k}</span><span class="val"><b data-k="${key}">${v}</b>${
    c == null ? '' : `<button type="button" class="kcopy" data-copy="${c}" title="Copy ${c}" aria-label="Copy ${k}: ${c}">${ICON_COPY}${ICON_OK}</button>`
  }</span></div>`).join('')}</div>`;
}

/* outline [x,y,bulge] → SVG path (y flipped so +Y points up) */
function polyPath(verts, q = P) {
  const n = verts.length;
  let d = `M${q(verts[0][0])} ${q(-verts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0, b] = verts[i], [x1, y1] = verts[(i + 1) % n];
    if (!b) { d += `L${q(x1)} ${q(-y1)}`; continue; }
    const th = 4 * Math.atan(Math.abs(b));
    const r = Math.hypot(x1 - x0, y1 - y0) / (2 * Math.sin(th / 2));
    // CCW in model space stays CCW on screen after the y flip = negative SVG sweep
    d += `A${q(r)} ${q(r)} 0 ${th > Math.PI ? 1 : 0} ${b > 0 ? 0 : 1} ${q(x1)} ${q(-y1)}`;
  }
  return d + 'Z';
}

const circlePath = (r, cx = 0, cy = 0) =>
  `M${P(cx + r)} ${P(cy)}A${P(r)} ${P(r)} 0 1 0 ${P(cx - r)} ${P(cy)}A${P(r)} ${P(r)} 0 1 0 ${P(cx + r)} ${P(cy)}Z`;

function borePath(bore, ox = 0) {
  if (!bore) return '';
  if (bore.kind === 'round') return circlePath(bore.r, ox, 0);
  return polyPath(bore.verts.map(([x, y, b]) => [x + ox, y, b]));
}

const Q3 = v => Math.round(v * 1000) / 1000;
