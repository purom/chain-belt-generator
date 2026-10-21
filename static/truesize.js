/* Belt & Chain Calculator — True size: screen scale, reference objects (cards, phones, coins …) and the 1:1 drawing with its ruler.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

const DIAGS = [13.3, 14, 15.6, 17.3, 24, 27, 32];

function screenScale() {
  const w = num($('r-w')), h = num($('r-h')), dg = num($('r-diag')), dpr = window.devicePixelRatio || 1;
  if (!(w >= 100 && h >= 100 && dg >= 3 && dg <= 200)) return null;
  const ppi = Math.hypot(w, h) / dg;
  return { w, h, dg, dpr, ppi, pxmm: ppi / 25.4 / dpr };
}

/* reference objects for checking the true-size scale. Outer size in mm as you hold it (w × h; phones upright),
   corner radius r, or d for round things. Cards, coins and banknotes are standard sizes; phones and AirPods cases are
   Apple's published dimensions (their corner radii are approximate — line up the straight edges). */
const REFS = [
  ['Cards', [
    { k: 'card', t: 'Bank card', w: 85.6, h: 53.98, r: 3.18, how: 'a bank or ID card' },
    { k: 'biz', t: 'Business card', w: 88.9, h: 50.8, r: 0, how: 'a US business card' },
    { k: 'sd', t: 'SD card', w: 24, h: 32, r: 0.8, cut: 4, how: 'an SD card', tip: 'label up, notch top-right' },
    { k: 'msd', t: 'microSD', w: 11, h: 15, r: 0.6, how: 'a microSD card' },
  ]],
  ['Phones', [
    { k: 'ipse', t: 'iPhone SE', w: 67.3, h: 138.4, r: 9.5, how: 'an iPhone SE (2nd / 3rd gen) or iPhone 8', tip: 'without a case' },
    { k: 'ip16', t: 'iPhone 15 / 16', w: 71.6, h: 147.6, r: 10.5, how: 'an iPhone 15 or 16', tip: 'without a case' },
    { k: 'ip16p', t: 'iPhone 16 Pro', w: 71.5, h: 149.6, r: 10.5, how: 'an iPhone 16 Pro', tip: 'without a case' },
    { k: 'ip15pm', t: 'iPhone 15 Pro Max', w: 76.7, h: 159.9, r: 11, how: 'an iPhone 15 Pro Max', tip: 'without a case' },
    { k: 'ip16pm', t: 'iPhone 16 Pro Max', w: 77.6, h: 163, r: 11, how: 'an iPhone 16 Pro Max', tip: 'without a case' },
    { k: 'ip17pm', t: 'iPhone 17 Pro Max', w: 78, h: 163.4, r: 11, how: 'an iPhone 17 Pro Max', tip: 'without a case' },
  ]],
  ['Earbuds', [
    { k: 'app2', t: 'AirPods Pro 2 case', w: 60.6, h: 45.2, r: 14, how: 'an AirPods Pro 2 case', tip: 'front face against the glass' },
    { k: 'ap4', t: 'AirPods 4 case', w: 50.1, h: 46.2, r: 16, how: 'an AirPods 4 case', tip: 'front face against the glass' },
  ]],
  ['Coins', [
    { k: 'usq', t: 'US quarter', d: 24.26 }, { k: 'usp', t: 'US penny', d: 19.05 },
    { k: 'eu1', t: '1 euro', d: 23.25 }, { k: 'eu2', t: '2 euro', d: 25.75 },
  ]],
  ['Other', [
    { k: 'usd', t: 'US banknote', w: 155.96, h: 66.29, r: 0, how: 'a US dollar bill' },
    { k: 'aa', t: 'AA battery', w: 50.5, h: 14.5, r: 1, nub: true, how: 'an AA battery', tip: 'lying flat' },
    { k: 'lego', t: 'LEGO 2×4 brick', w: 31.8, h: 15.8, r: 0.2, studs: [4, 2], how: 'a LEGO 2×4 brick', tip: 'studs facing you' },
    { k: 'usba', t: 'USB-A plug', w: 12, h: 4.5, r: 0.3, how: 'the metal end of a USB-A plug' },
  ]],
];
const REF_BY = Object.fromEntries(REFS.flatMap(([, items]) => items.map(r => [r.k, r])));
let REF = 'card', REF_DRAW = false, TS_SWEEP = false;   // one-shot: draw the outline in / sweep the ruler in on the next render
const refSize = R => R.d ? `Ø${fl(R.d, 2)} ${U()}` : `${fl(R.w, 1)} × ${fl(R.h, 1)} ${U()}`;
const refHint = R => R.d
  ? `Lay a ${R.t} coin on the screen — it should fit this circle exactly. If it doesn't, fix the diagonal.`
  : `Hold ${R.how} against the screen${R.tip ? `, ${R.tip}` : ''} — it should cover this outline exactly. If it doesn't, fix the diagonal.`;
function buildRefs(box) {
  box.innerHTML = REFS.map(([g, items]) => `<div class="ref-row"><span class="chips-l">${g}</span><div class="chips">${
    items.map(R => `<button type="button" class="chip" data-ref="${R.k}">${R.t}</button>`).join('')}</div></div>`).join('');
}
function syncRefs(p) {                             // p: 'r' (belt page) or 'kr' (chain page)
  $(`${p}-refs`).querySelectorAll('[data-ref]').forEach(c => c.classList.toggle('on', c.dataset.ref === REF));
  rollTo($(`${p}-ref-hint`), refHint(REF_BY[REF]));
}
/* the chosen reference at 1:1 (k = CSS px per mm), with its name and size underneath */
function drawRef(svg, k) {
  const R = REF_BY[REF] || REF_BY.card, W = R.d || R.w, H = R.d || R.h;
  const fs = 12.5 / k, label = `${R.t} · ${refSize(R)}`, tw = label.length * fs * 0.56;
  const VW = Math.max(W, tw) + 1, VH = H + fs * 2.2 + 1, x = (VW - 1 - W) / 2, sw = `${NS} stroke-width="1.5"`;
  let g;
  if (R.d) g = `<circle class="card-o" cx="${x + W / 2}" cy="${H / 2}" r="${W / 2}" ${sw}/>`;
  else if (R.cut) g = `<path class="card-o" d="M${x} 0H${x + W - R.cut}L${x + W} ${R.cut}V${H}H${x}Z" ${sw}/>`;
  else if (R.nub) {                                // battery: body and the + terminal
    const body = W - 1, nh = 5.5;
    g = `<rect class="card-o" x="${x}" y="0" width="${body}" height="${H}" rx="${R.r}" ${sw}/>`
      + `<rect class="card-o" x="${x + body}" y="${(H - nh) / 2}" width="1" height="${nh}" rx="0.4" ${sw}/>`;
  } else g = `<rect class="card-o" x="${x}" y="0" width="${W}" height="${H}" rx="${R.r}" ${sw}/>`;
  if (R.studs) {                                   // LEGO studs: Ø4.8 on an 8 mm grid
    const [nx, ny] = R.studs;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) g += `<circle class="ref-detail" cx="${x + 3.9 + 8 * i}" cy="${3.9 + 8 * j}" r="2.4" ${NS} stroke-width="1"/>`;
  }
  svg.setAttribute('viewBox', `-0.5 -0.5 ${VW} ${VH}`);
  svg.style.width = `${VW * k}px`; svg.style.height = `${VH * k}px`;
  svg.innerHTML = g + `<text class="ref-t" x="${(VW - 1) / 2}" y="${H + fs * 1.6}" text-anchor="middle" font-size="${fs}">${escT(label)}</text>`;
  svg.setAttribute('aria-label', `${R.t} outline at true size, ${refSize(R)}`);
  if (REF_DRAW && !reduceMotion) {
    // the line draws itself over its on-screen length: with a non-scaling stroke the dash is measured in screen px, so
    // pathLength (or the length in mm) left a gap that snapped shut at the end. An in-out curve lands softly instead of
    // creeping, and the fill fades in as the line closes.
    svg.querySelectorAll('.card-o').forEach(o => {
      const L = o.getTotalLength() * k + 2, dash = `${L} ${L}`;
      o.animate([{ strokeDasharray: dash, strokeDashoffset: L }, { strokeDasharray: dash, strokeDashoffset: 0 }], { duration: 820, easing: 'cubic-bezier(.6,0,.3,1)' });
      o.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: 520, delay: 400, easing: 'cubic-bezier(.33,0,.2,1)', fill: 'backwards' });
    });
    svg.querySelectorAll('.ref-detail, .ref-t').forEach((o, i) => o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 480, delay: 460 + i * 25, easing: 'cubic-bezier(.33,0,.2,1)', fill: 'backwards' }));
  }
  REF_DRAW = false;
}

/* DXF entities drawn at 1:1 (k = CSS px per mm) with an optional mm ruler underneath.
   cls = [[layers], class, oneShapePerPath]; PITCH + CENTER, ruler and texts are drawn on top. */
function trueSizeSVG(svg, entsIn, k, ruler, cls, extra) {
  const ents = entsIn.slice(), [x0, y0, x1, y1] = extentsOf(ents), sweep = ruler && TS_SWEEP && !reduceMotion;
  TS_SWEEP = false;
  if (ruler) {
    const imp = UNIT === 'in', u = imp ? IN / 10 : 1, ry = y0 - 8;            // one tick = 0.1 in or 1 mm
    const n = imp ? Math.max(20, Math.floor((x1 - x0) / IN) * 10) : Math.max(50, Math.floor((x1 - x0) / 10) * 10), len = n * u;
    ents.push({ type: 'line', layer: 'RULER', a: [x0, ry], b: [x0 + len, ry] });
    for (let m = 0; m <= n; m++) {
      const t = m % 10 === 0 ? 4 : m % 5 === 0 ? 2.6 : 1.4;
      ents.push({ type: 'line', layer: 'RULER', a: [x0 + m * u, ry], b: [x0 + m * u, ry - t] });
      if (m % 10 === 0 && (imp || len <= 300 || m % 50 === 0)) ents.push({ type: 'text', layer: 'RULER', p: [x0 + m * u, ry - 8], h: 3, s: imp ? `${m / 10}″` : `${m}` });
    }
  }
  const [X0, Y0, X1, Y1] = extentsOf(ents), pad = 6, W = X1 - X0 + 2 * pad, H = Y1 - Y0 + 2 * pad + 4;
  svg.setAttribute('viewBox', `${Q3(X0 - pad)} ${Q3(-Y1 - pad)} ${Q3(W)} ${Q3(H)}`);
  svg.style.width = `${W * k}px`; svg.style.height = `${H * k}px`;
  const of = (ls, t) => ents.filter(e => ls.includes(e.layer) && e.type === t);
  const polys = ls => of(ls, 'poly').map(e => polyPath(e.verts, Q3)).join(' ');
  const circs = ls => of(ls, 'circle').map(e => circlePath(e.r, e.c[0], -e.c[1])).join(' ');
  const lines = ls => of(ls, 'line').map(e => `M${Q3(e.a[0])} ${Q3(-e.a[1])}L${Q3(e.b[0])} ${Q3(-e.b[1])}`).join('');
  svg.innerHTML = cls.map(([ls, c, each]) => (each
    ? of(ls, 'poly').map(e => `<path d="${polyPath(e.verts, Q3)}" class="${c}" ${NS} stroke-width="1"/>`).join('')
    : `<path d="${polys(ls)} ${circs(ls)}" class="${c}" fill-rule="evenodd" ${NS} stroke-width="1"/>`)).join('')
    + (extra || '')
    + `<path d="${polys(['PITCH'])} ${circs(['PITCH'])} ${lines(['CENTER'])}" class="rv-pitch" ${NS} stroke-width="1"/>`
    + `<path d="${lines(['RULER'])}" class="rv-ruler" ${NS} stroke-width="1"/>`
    + ents.filter(e => e.type === 'text').map(e => `<text x="${Q3(e.p[0])}" y="${Q3(-e.p[1])}" font-size="${e.h}" text-anchor="middle"${e.layer === 'RULER' ? ' class="rv-rt"' : ''}>${escT(e.s)}</text>`).join('');
  if (sweep) {                                       // the ruler sweeps in from the left, its numbers following
    const rl = svg.querySelector('.rv-ruler');
    if (rl) rl.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 850, easing: 'cubic-bezier(.6,0,.3,1)' });
    const nums = [...svg.querySelectorAll('text.rv-rt')];
    nums.forEach((t, i) => t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay: 120 + 600 * i / Math.max(1, nums.length - 1), easing: 'ease-out', fill: 'backwards' }));
  }
  return { W, H, aw: x1 - x0, ah: y1 - y0 };
}
