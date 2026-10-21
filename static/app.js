/* Belt & Chain Calculator — The page: state, rendering of every tab, inputs, warnings, settings and start-up.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

function buildTypes(box, name, initial, onChange) {
  box.innerHTML = Object.entries(BELTS).map(([k, b]) => `
    <label class="seg-opt">
      <input type="radio" name="${name}" value="${k}"${k === initial ? ' checked' : ''}>
      <span><b>${b.label}</b><em data-bkey="${k}">${pitchLabel(b)}</em></span>
    </label>`).join('');
  addInd(box, b => { const i = b.querySelector('input:checked'); return i && i.closest('.seg-opt'); }, 'seg-ind');
  box.addEventListener('change', e => { if (e.target.name === name) { morphSnap(); onChange(e.target.value); updateInds(); } });
}
function setType(box, value) {
  const i = box.querySelector(`input[value="${value}"]`);
  if (i) i.checked = true;
}




function kvHTML(belt, g, N1, N2) {
  const ratio = f(N2 / N1, 3), wrap = f(deg(g.wrapSmall), 1), tim = f(g.timSmall, 1);
  return kvGrid([
    ['Pitch Ø P1', `${len(g.pd1, 3)}`, fl(g.pd1, 3)],
    ['Pitch Ø P2', `${len(g.pd2, 3)}`, fl(g.pd2, 3)],
    ['Outside Ø P1', `${len(g.od1, 2)}`, fl(g.od1, 2)],
    ['Outside Ø P2', `${len(g.od2, 2)}`, fl(g.od2, 2)],
    ['Ratio P2 : P1', `${ratio} : 1`, ratio],
    ['Belt pitch', `${lenR(belt.pitch)}`, rawL(belt.pitch)],
    ['Wrap, small pulley', `${wrap}°`, wrap],
    ['Teeth in mesh', tim, tim],
    ['Free span', `${len(g.span, 2)}`, fl(g.span, 2)],
    ['OD clearance', `${len(g.gap, 2)}`, fl(g.gap, 2)],
  ]);
}

function checks(belt, g) {
  const out = [];
  if (!g.valid) return out;
  if (g.gap <= 0) {
    out.push(['bad', `Pulley outside diameters overlap by ${len(-g.gap, 2)}.`]);
  } else if (g.gap < 2 * belt.thick) {
    out.push(['warn', `Only ${len(g.gap, 2)} between the pulley ODs — flanges usually reach ~${len(belt.thick, 1)} past the OD, so flanged pulleys may touch.`]);
  }
  if (g.timSmall < 6) {
    out.push(['warn', `Only ${f(g.timSmall, 1)} teeth in mesh on the ${g.Nsmall}T pulley (${f(deg(g.wrapSmall), 0)}° wrap). Belt ratings assume 6 or more — capacity drops and tooth-skipping gets likelier.`]);
  }
  if (g.Nsmall < belt.minT) {
    out.push(['warn', `${g.Nsmall}T is below the commonly recommended minimum for ${belt.label} (~${belt.minT}T); expect shorter belt life.`]);
  }
  return out;
}



/* ---------------- animated to-scale layout ---------------- */
const ANIM = { playing: !reduceMotion, speed: 1, cur: 0, raf: 0, last: 0 };
let PAGE = 'belt';                                  // 'belt' | 'chain' (the chain page is static: no animation loop)
const TWEEN_MS = 560;
const bodyCache = new Map();

/* pulley artwork: true groove profile + the bore chosen on the DXF tab (cached) */
function pulleyBody(belt, N, j) {
  const st = dxfSettings(j), key = `${belt.key}|${N}|${st.bore}|${st.boreSize}|${st.holes ? Object.values(st.holes).join(',') : ''}`;
  if (bodyCache.has(key)) return bodyCache.get(key);
  const ol = pulleyOutline(belt, N, 0);
  const R = ol.error ? pitchDia(N, belt.pitch) / 2 - belt.pld : ol.od / 2;
  const rootR = ol.error ? R - belt.toothH : R - ol.D;
  const pp = !ol.error && holesOK(st.holes) && st.boreSize > 0 ? pulleyParts(belt, N, { ...st, fit: 0 }) : { error: 1 };
  let bore = pp.error ? borePoly(st.bore, st.boreSize, st.boreFlat) : pp.bore;
  if (bore && bore.bad) bore = null;
  const holes = pp.error ? [] : pp.holes;
  if (st.bore !== 'none' && (!bore || bore.ext > rootR - MIN_WALL)) { const rr = Math.max(R * 0.08, 0.6); bore = { kind: 'round', r: rr, ext: rr }; }
  const hub = Math.min(rootR * 0.75, Math.max((bore ? bore.ext : 0) * 1.7, rootR * 0.4));
  const holesD = holes.map(h => circlePath(h.r, h.c[0], -h.c[1])).join(' ');
  const html = `<path d="${ol.error ? circlePath(R) : polyPath(ol.verts, Q3)} ${borePath(bore)} ${holesD}" class="p-body" fill-rule="evenodd" ${NS} stroke-width="1"/>`
    + (holes.length ? '' : `<circle r="${Q3(hub)}" class="p-hub" ${NS} stroke-width="1"/>`)
    + `<line x1="0" y1="${Q3(-hub)}" x2="0" y2="${Q3(-rootR * 0.9)}" class="p-mark" ${NS} stroke-width="2"/>`;
  if (bodyCache.size > 60) bodyCache.clear();
  bodyCache.set(key, html);
  return html;
}

function fitView(svg, belt, C, r1, r2) {
  const T = beltThick(belt), ext1 = r1 + T, ext2 = r2 + T, rmax = Math.max(ext1, ext2);
  const cw = svg.clientWidth || 800, ch = svg.clientHeight || 320;
  const scale = Math.max(1e-6, Math.min((cw - 40) / (C + ext1 + ext2), (ch - 80) / (2 * rmax)));
  const fs = 12.5 / scale;                       // ~12.5 px text regardless of model size
  const padL = Math.max(fs * 1.2, fs * 5.8 - ext1), padR = Math.max(fs * 1.2, fs * 5.8 - ext2);
  const x0 = -ext1 - padL, y0 = -rmax - fs * 2.3;
  return [x0, y0, C + ext2 + padR - x0, rmax + fs * 3.9 - y0];
}

/* entry point from the calculators: o = { belt, N1, N2, g, labelC } or null.
   New geometry glides in (centre distance, pulley size, framing) instead of jumping. */
function drawLayout(svg, o) {
  svg._last = o;
  if (!o) {
    svg._sc = null;
    svg.setAttribute('viewBox', '0 0 400 120');
    svg.innerHTML = '<text x="200" y="64" text-anchor="middle" font-size="12" class="empty">No valid layout for these inputs</text>';
    return;
  }
  const { belt, N1, N2, g, labelC } = o;
  const tgt = { belt, N1, N2, labelC, C: g.C, r1: g.r1, r2: g.r2, pd1: g.pd1, pd2: g.pd2 };
  const sc = svg._sc || (svg._sc = { s: 0, psi: [0, 0] });
  const prev = sc.tgt;
  const changed = !prev || prev.belt !== belt || prev.N1 !== N1 || prev.N2 !== N2
    || Math.abs(prev.C - tgt.C) > 1e-9 || Math.abs(prev.labelC - labelC) > 1e-9;
  const visible = svg.clientWidth > 0 && !svg.closest('.panel').hidden;
  sc.tgt = tgt;
  sc.tgtVb = fitView(svg, belt, tgt.C, tgt.r1, tgt.r2);
  sc.v = 2 * Math.PI * Math.min(tgt.r1, tgt.r2) * 0.3;   // belt speed at 1× : small pulley ≈ 0.3 rev/s
  if (!changed && sc.tween) return;                         // same target: keep gliding toward it
  if (changed && prev && sc.cur && visible && !reduceMotion) {   // also across belt types: the new profile grows from the old size
    sc.from = { ...sc.cur, vb: sc.cur.vb.slice() };
    sc.t0 = performance.now();
    sc.tween = true;
    ensureLoop();
    return;
  }
  sc.tween = false;
  sc.cur = { C: tgt.C, r1: tgt.r1, r2: tgt.r2, labelC, vb: sc.tgtVb };
  sceneBuild(svg);
  sceneTick(svg, 0);
}

function sceneBuild(svg) {
  const sc = svg._sc, t = sc.tgt, c = sc.cur, belt = t.belt, [x0, y0, w, h] = c.vb;
  svg.setAttribute('viewBox', `${Q3(x0)} ${Q3(y0)} ${Q3(w)} ${Q3(h)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const scale = Math.min((svg.clientWidth || 800) / w, (svg.clientHeight || 320) / h), fs = 12.5 / scale;
  const T = beltThick(belt), { C, r1, r2 } = c, ext1 = r1 + T, ext2 = r2 + T, rmax = Math.max(ext1, ext2);
  sc.toothed = belt.pitch * scale >= 4;          // real teeth once a tooth is ≥ 4 px on screen
  const pul = (x, k, N, j) => `<g transform="translate(${Q3(x)} 0)"><g class="spin"><g transform="scale(${k.toFixed(5)})">${pulleyBody(belt, N, j)}</g></g></g>`;
  const over = Math.max(0, T - belt.thick);         // backing above the standard thickness → drawn red
  let beltEl = `<path class="belt-solid" fill-rule="evenodd" ${NS} stroke-width="1"/>`
    + (over > 1e-6 ? `<path class="belt-over" fill-rule="evenodd" ${NS} stroke-width="1"/>` : '');
  if (!sc.toothed) {
    const bp = beltPath(r1, r2, C), d = polyPath(loopVerts(bp, 0), Q3), bw = Math.max(T, 3 / scale);
    beltEl = `<path d="${d}" class="belt" stroke-width="${Q3(bw)}"/>`
      + `<path d="${d}" class="belt-teeth" stroke-width="${Q3(bw * 0.42)}" pathLength="${Q3(bp.L / belt.pitch)}" stroke-dasharray="0.5 0.5"/>`;
    if (over > 1e-6) {                             // outer share of the stroke = the extra backing
      const ow = bw * over / T;
      beltEl += `<path d="${polyPath(loopVerts(bp, bw / 2 - ow / 2), Q3)}" class="belt-over-s" stroke-width="${Q3(ow)}"/>`;
    }
  }
  const overlay = (x, r, ext) => {
    const q = Q3(ext + fs * 0.5);
    return `<g transform="translate(${Q3(x)} 0)"><circle r="${Q3(r)}" class="p-pitch" ${NS} stroke-width="1"/>`
      + `<line x1="${-q}" x2="${q}" y1="0" y2="0" class="cross" ${NS} stroke-width="1"/><line y1="${-q}" y2="${q}" x1="0" x2="0" class="cross" ${NS} stroke-width="1"/></g>`;
  };
  const label = (x, ext, N, pd, j) =>
    `<text x="${Q3(x)}" y="${Q3(-ext - fs * 0.9)}" text-anchor="middle" font-size="${Q3(fs)}"><tspan class="pl">P${j + 1}</tspan> · <tspan class="lt">${N}T</tspan> · Ø${fl(pd, 2)}</text>`;
  const dy = rmax + fs * 1.6, a = fs * 0.6;
  const dims = `<line x1="0" x2="0" y1="${Q3(ext1 + fs * 0.3)}" y2="${Q3(dy + fs * 0.5)}" class="ext" ${NS} stroke-width="1"/>`
    + `<line x1="${Q3(C)}" x2="${Q3(C)}" y1="${Q3(ext2 + fs * 0.3)}" y2="${Q3(dy + fs * 0.5)}" class="ext" ${NS} stroke-width="1"/>`
    + `<line x1="${Q3(a)}" x2="${Q3(C - a)}" y1="${Q3(dy)}" y2="${Q3(dy)}" class="dim" ${NS} stroke-width="1.2"/>`
    + `<path d="M0,${Q3(dy)} l${Q3(a)},${Q3(-a * 0.38)} v${Q3(a * 0.76)} Z" class="arrow"/>`
    + `<path d="M${Q3(C)},${Q3(dy)} l${Q3(-a)},${Q3(-a * 0.38)} v${Q3(a * 0.76)} Z" class="arrow"/>`
    + `<text x="${Q3(C / 2)}" y="${Q3(dy + fs * 1.45)}" text-anchor="middle" font-size="${Q3(fs)}" class="dimt">C2C ${len(c.labelC, 3)}</text>`;
  svg.innerHTML = pul(0, r1 / t.r1, t.N1, 0) + pul(C, r2 / t.r2, t.N2, 1) + beltEl
    + overlay(0, r1, ext1) + overlay(C, r2, ext2)
    + label(0, ext1, t.N1, t.pd1, 0) + label(C, ext2, t.N2, t.pd2, 1) + dims;
  sc.els = { spin: svg.querySelectorAll('.spin'), belt: svg.querySelector('.belt-solid'), over: svg.querySelector('.belt-over'), teeth: svg.querySelector('.belt-teeth') };
}

/* per frame: belt teeth slide along the loop and both pulleys turn locked in mesh with them */
function sceneTick(svg, ds) {
  const sc = svg._sc;
  if (!sc || !sc.els) return;
  const t = sc.tgt, c = sc.cur, belt = t.belt, bp = beltPath(c.r1, c.r2, c.C);
  let ph;
  if (sc.toothed && sc.els.belt) {
    const T = beltThick(belt);
    ph = beltOutline(T === belt.thick ? belt : { ...belt, thick: T }, c.r1, c.r2, c.C, sc.s, bp);
    sc.els.belt.setAttribute('d', polyPath(ph.outer, Q3) + polyPath(ph.inner, Q3));
    if (sc.els.over) sc.els.over.setAttribute('d', polyPath(ph.outer, Q3) + polyPath(loopVerts(bp, ph.tg.back - (T - belt.thick)), Q3));
  } else {
    const Nt = Math.max(3, Math.round(bp.L / belt.pitch)), pe = bp.L / Nt;
    ph = { bp, pe, sOff: ((sc.s % pe) + pe) % pe };
    if (sc.els.teeth) sc.els.teeth.setAttribute('stroke-dashoffset', Q3(-ph.sOff / pe));
  }
  [[c.r1, t.N1], [c.r2, t.N2]].forEach(([r, N], j) => {
    // continue the rotation, then snap to the nearest angle where a groove sits under a belt tooth
    const step = 2 * Math.PI / N, A = pulleyPhase(ph, j + 1), pred = sc.psi[j] + ds / r;
    sc.psi[j] = A + step * Math.round((pred - A) / step);
    if (sc.els.spin[j]) sc.els.spin[j].setAttribute('transform', `rotate(${Q3(-deg(sc.psi[j]) % 360)})`);
  });
}

function frame(ts) {
  const dt = ANIM.last ? Math.min(0.05, (ts - ANIM.last) / 1000) : 0;
  ANIM.last = ts;
  const goal = ANIM.playing ? ANIM.speed : 0;          // belt speed follows its goal on a critically damped spring:
  const K = 26, D = 2 * Math.sqrt(K);                  // it spins up and coasts down with inertia, never overshooting
  ANIM.vel = (ANIM.vel || 0) + (K * (goal - ANIM.cur) - D * (ANIM.vel || 0)) * dt;
  ANIM.cur = Math.max(0, ANIM.cur + ANIM.vel * dt);
  if (Math.abs(goal - ANIM.cur) < 0.002 && Math.abs(ANIM.vel) < 0.02) { ANIM.cur = goal; ANIM.vel = 0; }
  let tweening = false;
  for (const id of PAGE === 'chain' ? ['ka-svg', 'kb-svg'] : ['a-svg', 'b-svg']) {
    const svg = $(id), sc = svg._sc;
    if (!sc || !sc.tgt || svg.closest('.panel').hidden) continue;
    if (sc.tween) {
      const k = Math.min(1, Math.max(0, (ts - sc.t0) / TWEEN_MS)), e = ease(k), fr = sc.from, t = sc.tgt;
      sc.cur = sc.chain
        ? { C: lerp(fr.C, t.C, e), R1: lerp(fr.R1, t.R1, e), R2: lerp(fr.R2, t.R2, e), labelC: lerp(fr.labelC, t.labelC, e), vb: fr.vb.map((v, i) => lerp(v, sc.tgtVb[i], e)) }
        : { C: lerp(fr.C, t.C, e), r1: lerp(fr.r1, t.r1, e), r2: lerp(fr.r2, t.r2, e), labelC: lerp(fr.labelC, t.labelC, e), vb: fr.vb.map((v, i) => lerp(v, sc.tgtVb[i], e)) };
      if (k >= 1) sc.tween = false; else tweening = true;
      if (sc.chain) chainSceneBuild(svg); else sceneBuild(svg);
    }
    const ds = sc.v * ANIM.cur * dt;
    sc.s += ds;
    if (sc.chain) chainSceneTick(svg, ds); else sceneTick(svg, ds);
  }
  ANIM.raf = ANIM.playing || ANIM.cur > 0 || tweening ? requestAnimationFrame(frame) : 0;
  if (!ANIM.raf) ANIM.last = 0;
}
function ensureLoop() {
  if (!ANIM.raf) { ANIM.last = 0; ANIM.raf = requestAnimationFrame(frame); }
}
function setPlaying(on) {
  ANIM.playing = on;
  document.body.classList.toggle('paused', !on);
  document.querySelectorAll('[data-anim-toggle]').forEach(b => {
    if (!b.querySelector('.pp')) {
      b.innerHTML = `<span class="pp" aria-hidden="true"><span class="pp-i pp-play">${ICON_PLAY}</span><span class="pp-i pp-pause">${ICON_PAUSE}</span></span><span class="pp-l"></span>`;
    }
    b.setAttribute('aria-pressed', String(on));
    const l = b.querySelector('.pp-l'), txt = on ? 'Pause' : 'Play';
    if (l.textContent !== txt) { l.textContent = txt; l.classList.remove('swap'); void l.offsetWidth; l.classList.add('swap'); }
  });
  ensureLoop();                                   // also lets the belt coast to a stop
}
const redrawLayouts = () => ['a-svg', 'b-svg'].forEach(id => { const s = $(id); if (s._last) drawLayout(s, s._last); });


const paintRange = s => s.style.setProperty('--p', `${((s.value - s.min) / (s.max - s.min)) * 100}%`);
function flashPick() {
  document.querySelectorAll('#b-results .pick, #b-results tr.sel').forEach(x => x.classList.add('flash'));
}

/* ================= SECTION 1: center distance ================= */
const A = { type: 'HTD5M', unit: 'teeth' };

function renderA() {
  const belt = BELTS[A.type], p = belt.pitch;
  const N1 = Math.round(num($('a-n1'))), N2 = Math.round(num($('a-n2')));
  const raw = num($('a-len'));
  const allow = num($('a-allow')) || 0;
  const res = $('a-results'), svg = $('a-svg'), meta = $('a-viz-meta'), hint = $('a-len-hint');

  if (!(N1 >= 4 && N2 >= 4 && N1 <= 1000 && N2 <= 1000) || !(raw > 0)) {
    hint.textContent = '';
    res.innerHTML = resetNumbers(res) + errorBlock('Missing input', 'Enter pulley teeth (4 or more) and a belt length.');
    meta.textContent = ''; drawLayout(svg, null); return;
  }

  const info = [];
  let teeth;
  if (A.unit === 'teeth') {
    teeth = Math.max(1, Math.round(raw));
    if (teeth !== raw) info.push(['info', `Belts have a whole number of teeth — using ${teeth}T.`]);
    rollTo(hint, `= ${lenR(teeth * p)} pitch length · ${partNo(belt, teeth * p, beltW(belt.key))}`);
  } else {
    teeth = Math.max(1, Math.round(raw / p));
    if (Math.abs(raw / p - teeth) > 1e-6) {
      info.push(['info', `${len(raw, 2)} isn't a multiple of the ${lenR(p)} pitch — using the nearest real belt, ${teeth}T = ${lenR(teeth * p)}.`]);
    }
    rollTo(hint, `= ${teeth} teeth · ${partNo(belt, teeth * p, beltW(belt.key))}`);
  }

  const L = teeth * p;
  const g0 = analyze(belt, N1, N2, NaN);
  const C = solveCenter(L, g0.r1, g0.r2);
  const g = analyze(belt, N1, N2, C);
  rollTo(meta, `${belt.label} · ${teeth}T belt (${lenR(L)}) · ${N1}T / ${N2}T · ${beltSize(belt)}`);

  if (!g.valid || g.gap <= 0) {
    const m = minTeethForPair(belt, N1, N2);
    res.innerHTML = resetNumbers(res) + errorBlock('Belt too short',
      `A ${teeth}T (${lenR(L)}) ${belt.label} belt can't go around ${N1}T + ${N2}T pulleys without them colliding. Shortest belt that clears: <b>${m}T (${lenR(m * p)})</b>.`) + notesHTML(info);
    drawLayout(svg, g.valid ? { belt, N1, N2, g, labelC: C } : null);
    return;
  }

  const Cd = C + allow;
  const notes = [...info, ...checks(belt, g)];
  if (!notes.some(n => n[0] === 'warn' || n[0] === 'bad')) notes.push(['ok', 'Geometry looks good.']);

  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Center-to-center distance${allow ? ' (incl. allowance)' : ''}</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(Cd)}" data-d="${dU(3)}">${fl(Cd, 3)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">${alt(Cd)}${allow ? ` · nominal ${fl(C, 3)} ${sgnL(allow, 2)}` : ''}</div>
      <button type="button" class="btn sm copy" data-copy="${fl(Cd, 3)}">Copy</button>
    </div>
    ${kvHTML(belt, g, N1, N2)}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  animateHero(res);
  drawLayout(svg, { belt, N1, N2, g, labelC: Cd });
}

/* ================= SECTION 2: belt length ================= */
const B = { type: 'HTD5M', selL: null };
const stockText = {};

function stockList(type) {
  const txt = stockText[type] ?? STOCK[type].join(', ');
  return [...new Set(txt.split(/[^0-9.]+/).map(Number).filter(v => v > 0))].sort((a, b) => a - b);
}
function updateStockCount() { $('b-stock-count').textContent = `${stockList(B.type).length} sizes`; }
function syncStockBox() {
  $('b-stock').value = stockText[B.type] ?? STOCK[B.type].join(', ');
  $('b-stock-label').textContent = BELTS[B.type].label;
  updateStockCount();
}

function rowHTML(r, tag) {
  const cls = [r.L === B.selL && r.ok ? 'sel' : '', r.ok ? '' : 'dis'].filter(Boolean).join(' ');
  return `<tr data-l="${r.L}"${cls ? ` class="${cls}"` : ''}${r.ok ? ' tabindex="0"' : ''}>
    <td>${r.t}T${tag ? `<span class="tag ${tag[0]}">${tag[1]}</span>` : ''}</td>
    <td data-k="l${r.L}">${rawL(r.L)}</td>
    <td data-k="c${r.L}">${r.ok ? fl(r.C, 3) : '—'}</td>
    <td data-k="d${r.L}">${r.ok ? sgn(toU(r.dC), dU(3)) : 'overlap'}</td>
  </tr>`;
}
const tableHTML = (rows, tagFor) =>
  `<div class="tbl"><table class="opts"><thead><tr><th>Belt</th><th data-k="th1">Length ${U()}</th><th data-k="th2">C2C ${U()}</th><th data-k="th3">Δ ${U()}</th></tr></thead>
   <tbody>${rows.map(r => rowHTML(r, tagFor(r))).join('')}</tbody></table></div>`;
const closest = rows => rows.reduce((a, r) => (!a || Math.abs(r.dC) < Math.abs(a.dC)) ? r : a, null);

function renderB(keepSel) {
  const belt = BELTS[B.type], p = belt.pitch;
  const N1 = Math.round(num($('b-n1'))), N2 = Math.round(num($('b-n2')));
  const Ct = num($('b-c'));
  const res = $('b-results'), svg = $('b-svg'), meta = $('b-viz-meta');
  rollTo($('b-c-hint'), Ct > 0 ? `= ${alt(Ct)}` : '');

  if (!(N1 >= 4 && N2 >= 4 && N1 <= 1000 && N2 <= 1000) || !(Ct > 0)) {
    res.innerHTML = resetNumbers(res) + errorBlock('Missing input', 'Enter pulley teeth (4 or more) and a target center distance.');
    meta.textContent = ''; drawLayout(svg, null); return;
  }

  const g = analyze(belt, N1, N2, Ct);
  if (!g.valid || g.gap <= 0) {
    res.innerHTML = resetNumbers(res) + errorBlock('Pulleys overlap',
      `At ${len(Ct, 2)} the ${N1}T and ${N2}T pulleys collide — their outside diameters need at least <b>${len((g.od1 + g.od2) / 2, 2)}</b> between centers.`);
    meta.textContent = `${belt.label} · ${N1}T / ${N2}T`;
    drawLayout(svg, g.valid ? { belt, N1, N2, g, labelC: Ct } : null);
    return;
  }

  const { Lx, tx, rows } = integerOptions(belt, N1, N2, Ct);
  const okRows = rows.filter(r => r.ok);
  const best = closest(okRows);
  const exact = Math.abs(best.dC) < 0.005;

  // stock list suggestions: two nearest shorter + two nearest longer
  const list = stockList(B.type);
  const offPitch = list.filter(L => Math.abs(L / p - Math.round(L / p)) > 1e-6);
  const stockAll = list.filter(L => !offPitch.includes(L)).map(L => {
    const C = solveCenter(L, g.r1, g.r2), a = analyze(belt, N1, N2, C);
    return { t: Math.round(L / p), L, C, dC: C - Ct, ok: a.valid && a.gap > 0 };
  }).filter(r => r.ok);
  const stockRows = [
    ...stockAll.filter(r => r.L <= Lx + 1e-6).slice(-2),
    ...stockAll.filter(r => r.L > Lx + 1e-6).slice(0, 2),
  ];
  const stockBest = closest(stockRows);

  const pool = [...okRows, ...stockRows];
  if (!keepSel || !pool.some(r => r.L === B.selL)) B.selL = best.L;
  const sel = pool.find(r => r.L === B.selL);
  const gs = analyze(belt, N1, N2, sel.C);

  const notes = [];
  if (Math.abs(sel.dC) >= 0.005) {
    notes.push(['info', sel.dC < 0
      ? `This belt is shorter than ideal: set the pulleys <b>${len(-sel.dC, 2)} closer</b> (C2C ${len(sel.C, 3)}), otherwise it's too tight to fit.`
      : `This belt is longer than ideal: increase the C2C by <b>${len(sel.dC, 2)}</b> to ${len(sel.C, 3)}, or take up the slack with an idler / tensioner.`]);
  }
  notes.push(...checks(belt, gs));
  if (offPitch.length) notes.push(['info', `Ignored stock entries that aren't a multiple of the ${lenR(p)} pitch: ${offPitch.join(', ')}.`]);
  if (!notes.some(n => n[0] === 'warn' || n[0] === 'bad')) notes.push(['ok', 'Geometry looks good.']);

  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Ideal belt length @ ${len(Ct, 2)} C2C</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(Lx)}" data-d="${dU(2)}">${fl(Lx, 2)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">${f(tx, 2)} teeth · ${exact ? 'whole tooth count — exact fit' : 'not a whole tooth count → pick a real belt below'}</div>
    </div>
    <div class="pick">
      <div>
        <div class="pick-label">Selected belt</div>
        <div class="pick-main"><span data-k="pick">${sel.t}T · ${lenR(sel.L)}</span><span class="part">${partNo(belt, sel.L, beltW(belt.key))}</span></div>
        <div class="pick-sub" data-k="pick-sub">C2C ${len(sel.C, 3)} · ${alt(sel.C)} · ${sgnL(sel.dC)} vs target</div>
      </div>
      <div class="pick-actions">
        <button type="button" class="btn" data-copy="${fl(sel.C, 3)}">Copy C2C</button>
        <button type="button" class="btn primary" data-send="${sel.t}">Open in C2C →</button>
      </div>
    </div>
    <div>
      <div class="sub-h">Whole-tooth belts <small>click a row to preview</small></div>
      ${tableHTML(rows, r => r === best ? ['best', exact ? 'exact' : 'closest'] : null)}
    </div>
    <div>
      <div class="sub-h">From stock list <small>${belt.label} · nearest shorter &amp; longer</small></div>
      ${stockRows.length
        ? tableHTML(stockRows, r => r === stockBest ? ['best', 'closest'] : null)
        : '<p class="empty-note">No stock size in your list fits these pulleys near this length.</p>'}
    </div>
    ${kvHTML(belt, gs, N1, N2)}
    ${notesHTML(notes)}`;

  rollNumbers(res);
  animateHero(res);
  rollTo(meta, `${belt.label} · ${sel.t}T belt (${lenR(sel.L)}) · ${N1}T / ${N2}T · ${beltSize(belt)}`);
  drawLayout(svg, { belt, N1, N2, g: gs, labelC: sel.C });
}

function sendToA(teeth) {
  A.type = B.type; setType($('a-type'), A.type);
  $('a-n1').value = $('b-n1').value;
  $('a-n2').value = $('b-n2').value;
  A.unit = 'teeth';
  $('a-units').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.unit === 'teeth')));
  const el = $('a-len'); el.step = 1; el.min = 1; el.value = teeth;
  switchTab('c2c');
  renderA();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================= SECTION 3: pulley DXF ================= */
const DX = { type: 'HTD5M', cur: 0, link: true, doc: null, flhTouched: false };
/* linked mode: Pulley 1 = left layout pulley, Pulley 2 = right; teeth and belt type sync both ways */
function layoutSrc() {
  return lastCalc === 'length'
    ? { tab: 'Belt length', type: B.type, typeBox: 'b-type', n: ['b-n1', 'b-n2'] }
    : { tab: 'Center distance', type: A.type, typeBox: 'a-type', n: ['a-n1', 'a-n2'] };
}
function pullLayout() {
  if (!DX.link) return;
  const s = layoutSrc();
  if (DX.type !== s.type) { DX.type = s.type; setType($('d-type'), s.type); updateInds(); }
  [0, 1].forEach(j => {
    const v = $(s.n[j]).value;
    DX.p[j].v['d-n'] = v;
    if (j === DX.cur && $('d-n').value !== v) { const old = num($('d-n')); $('d-n').value = v; nudge($('d-n'), Math.sign(parseFloat(v) - old)); }
  });
}
function pushLayout(kind) {
  if (!DX.link) return;
  const s = layoutSrc();
  if (kind === 'type') {
    const i = $(s.typeBox).querySelector(`input[value="${DX.type}"]`);
    if (i && !i.checked) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }
    return;
  }
  const el = $(s.n[DX.cur]);
  if (el.value !== $('d-n').value) { el.value = $('d-n').value; el.dispatchEvent(new Event('input', { bubbles: true })); }
}
/* each pulley keeps its own form values; the form always shows pulley DX.cur */
const P_FIELDS = ['d-n', 'd-bore', 'd-flat', 'd-clear', 'd-hn', 'd-hd', 'd-hp', 'd-hr', 'd-fit', 'd-flh'];
const P_CHECKS = ['d-flange', 'd-pitch'];
function newPulley(n) {
  return { bore: 'round', borePre: 'custom', holePre: 'none',
    v: { 'd-n': String(n), 'd-bore': '5', 'd-flat': '5.5', 'd-clear': '0', 'd-hn': '4', 'd-hd': '4.3', 'd-hp': '22.627', 'd-hr': '45', 'd-fit': '0', 'd-flh': '4' },
    c: { 'd-flange': false, 'd-pitch': false } };
}
DX.p = [newPulley(20), newPulley(40)];
['bore', 'borePre', 'holePre'].forEach(k => Object.defineProperty(DX, k, { get: () => DX.p[DX.cur][k], set: v => { DX.p[DX.cur][k] = v; } }));
function readForm() {
  const s = DX.p[DX.cur];
  P_FIELDS.forEach(id => { s.v[id] = $(id).value; });
  P_CHECKS.forEach(id => { s.c[id] = $(id).checked; });
}
function writeForm() {
  const s = DX.p[DX.cur];
  P_FIELDS.forEach(id => { if (s.v[id] != null) $(id).value = s.v[id]; });
  P_CHECKS.forEach(id => { $(id).checked = !!s.c[id]; });
  setBoreShape(s.bore);
  setType($('d-bore-preset'), s.borePre);
  setType($('d-hole-preset'), s.holePre);
  $('d-which').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.which === DX.cur)));
}
function switchPulley(j, skipRead) {
  if (!skipRead) readForm();
  const old = num($('d-n')), changed = j !== DX.cur;
  DX.cur = j;
  writeForm();
  nudge($('d-n'), Math.sign(num($('d-n')) - old));
  if (changed && !reduceMotion) {
    const s = $('d-svg-full');
    s.classList.remove('pv-swap'); void s.offsetWidth; s.classList.add('pv-swap');
    clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('pv-swap'), 900);
  }
  updateInds(); renderD(); redrawLayouts();
}
/* both pulleys side by side in one file */
function bothDoc() {
  const belt = BELTS[DX.type], out = [], th = Math.max(2, belt.pitch * 0.7);
  let x = 0;
  for (let j = 0; j < 2; j++) {
    const st = dxfSettings(j), N = st.n;
    if (!(N >= 6 && N <= 400)) return { error: `Pulley ${j + 1}: enter 6–400 teeth.` };
    if (!holesOK(st.holes) || (st.bore !== 'none' && !(st.boreSize > 0))) return { error: `Pulley ${j + 1}: check the bore and hole fields.` };
    const d = singleDoc(belt, N, st);
    if (d.error) return { error: `Pulley ${j + 1}: ${d.error}` };
    const e = d.ents.map(en => en.layer === 'PULLEY' ? { ...en, layer: `PULLEY_${j + 1}` } : en);
    const b = extentsOf(e), dx = x - b[0];
    out.push({ type: 'text', layer: 'TEXT', p: [x, b[3] + th * 0.8], h: th, s: `PULLEY ${j + 1}  ${N}T ${belt.code}` }, ...shiftEnts(e, dx, 0));
    x = b[2] + dx + Math.max(8, belt.pitch * 2);
  }
  return { ents: out, name: `pulleys_${belt.key}_${dxfSettings(0).n}T_${dxfSettings(1).n}T.dxf` };
}
const BORE_PRE = [
  { v: 'none', t: 'No bore', s: 'solid disc' },
  { v: 'rev', t: 'REV 5mm hex', s: 'hex · 5 AF' },
  { v: 'rex', t: 'goBILDA REX', s: '8mm · 7 AF' },
  { v: 'gbd', t: 'goBILDA D-shaft', s: '6mm · 5.5 flat' },
  { v: 'b14', t: '14mm bearing', s: 'goBILDA 1611' },
  { v: 'custom', t: 'Custom', s: '6 shapes, any size' },
];
const BORE_SET = { rev: ['hex', 5], rex: ['rex', 7], gbd: ['d', 6, 5.5], b14: ['round', 14] };
const BORE_HINT = {
  rev: 'REV 5 mm hex shaft. 3D prints usually need +0.05 … +0.1 mm clearance.',
  rex: 'goBILDA 8 mm REX shaft: 7 mm across flats, corners rounded to Ø8. For plain 7 mm hex use Custom → hex 7.',
  b14: 'Pocket for goBILDA 1611 flanged bearings (8 mm ID × 14 mm OD × 5 mm). Press fit: −0.05 … 0 mm.',
  gbd: 'goBILDA 6 mm D-shaft (5202 Yellow Jacket motors, D-shafting). Flat set to the common 5.5 mm — check yours with calipers.',
  custom: 'Size = diameter (round, D-shapes), across flats (hex, REX) or side (square). Clearance is added on every side.',
};
const HOLE_PRE = [
  { v: 'none', t: 'No holes', s: 'plain disc' },
  { v: 'sonic', t: 'goBILDA Sonic Hub', s: '16mm pattern · M4' },
  { v: 'servo', t: 'goBILDA servo hub', s: '16mm pattern · M4' },
  { v: 'custom', t: 'Custom', s: 'any bolt circle' },
];
const GB16 = [['d-hn', 4], ['d-hd', 4.3], ['d-hp', 22.627], ['d-hr', 45]];
const holesOK = H => !H || (H.n >= 1 && H.n <= 24 && H.d > 0 && H.pcd >= 0 && Number.isFinite(H.rot));
function setBoreShape(k) {
  DX.bore = k;
  $('d-bore-type').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.bore === k)));
}
function setField(id, val) { const el = $(id), old = num(el); el.value = val; nudge(el, Math.sign(val - old)); }
function applyBorePreset(v) {
  DX.borePre = v;
  if (BORE_SET[v]) { setBoreShape(BORE_SET[v][0]); setField('d-bore', BORE_SET[v][1]); if (BORE_SET[v][2]) setField('d-flat', BORE_SET[v][2]); }
}
function applyHolePreset(v) {
  DX.holePre = v;
  if (v === 'sonic' || v === 'servo') GB16.forEach(([id, val]) => setField(id, val));
}
function boreToCustom() { if (BORE_SET[DX.borePre]) { DX.borePre = 'custom'; setType($('d-bore-preset'), 'custom'); } }
function holesToCustom() { if (DX.holePre === 'sonic' || DX.holePre === 'servo') { DX.holePre = 'custom'; setType($('d-hole-preset'), 'custom'); } }
const FLANGE_DEFAULT = { HTD5M: 4, HTD3M: 2.5, GT2_2: 1.5, GT2_3: 2.5, GT3_3: 2.5, GT3_5: 4, MXL: 1.5, XL: 2.5, L: 3.5, H: 4 };
let lastCalc = 'c2c';

function dxfSettings(i = DX.cur) {
  if (i === DX.cur) readForm();
  const s = DX.p[i], v = id => parseFloat(s.v[id]);
  const cl = v('d-clear') || 0, sz = v('d-bore');
  const holes = s.holePre === 'none' ? null : { n: Math.round(v('d-hn')), d: v('d-hd'), pcd: v('d-hp'), rot: v('d-hr') || 0 };
  return {
    bore: s.borePre === 'none' ? 'none' : s.bore, borePre: s.borePre, holePre: s.holePre, n: Math.round(v('d-n')),
    boreNom: sz, boreSize: sz + 2 * cl, boreFlat: v('d-flat') + 2 * cl, clear: cl, holes, fit: v('d-fit') || 0,
    flange: !!s.c['d-flange'], flh: v('d-flh') || 0, pitch: !!s.c['d-pitch'],
  };
}
function chipSource() {
  return lastCalc === 'length'
    ? { type: B.type, n1: Math.round(num($('b-n1'))), n2: Math.round(num($('b-n2'))), from: 'Belt length' }
    : { type: A.type, n1: Math.round(num($('a-n1'))), n2: Math.round(num($('a-n2'))), from: 'Center distance' };
}
function updateChips() {
  const s = chipSource();
  const ok = n => Number.isFinite(n) && n >= 6;
  $('d-chips').innerHTML = `<span class="chips-l">From ${s.from} (${BELTS[s.type].label}):</span>` +
    (ok(s.n1) ? `<button type="button" class="chip" data-chip="0">P1 · ${s.n1}T</button>` : '') +
    (ok(s.n2) ? `<button type="button" class="chip" data-chip="1">P2 · ${s.n2}T</button>` : '') +
    (ok(s.n1) && ok(s.n2) ? '<button type="button" class="chip" data-chip="both">Both</button>' : '');
  $('d-which').querySelectorAll('button').forEach(b => {
    const j = +b.dataset.which, n = j === DX.cur ? Math.round(num($('d-n'))) : Math.round(parseFloat(DX.p[j].v['d-n']));
    rollTo(b, `P${j + 1} · ${j ? 'right' : 'left'}${Number.isFinite(n) ? ` · ${n}T` : ''}`);
  });
  $('d-chips').hidden = DX.link;
  $('d-link').checked = DX.link;
  $('d-link-note').textContent = DX.link ? `· teeth & belt sync with the ${layoutSrc().tab} tab` : '· pulleys are independent of the layout';
}
function dxfName(belt, N, st) {
  const pre = { none: '', rev: '_rev5hex', rex: '_rex8', gbd: '_gbD6', b14: '_brg14' }[st.borePre];
  const b = pre !== undefined ? pre : `_${{ round: 'd', hex: 'hex', square: 'sq', rex: 'rex', d: 'D', dd: 'DD' }[st.bore]}${+st.boreNom.toFixed(3)}`;
  const H = st.holes, h = !H ? '' : st.holePre === 'custom' ? `_${H.n}x${+H.d.toFixed(2)}on${+H.pcd.toFixed(2)}` : '_gb16';
  return `pulley_${belt.key}_${N}T${b}${h}.dxf`;
}
function boreLabel(st) {
  if (st.bore === 'none') return ['none', null];
  const s = +st.boreSize.toFixed(3);
  if (st.bore === 'round') return [`Ø${lenR(s)}`, rawL(s)];
  if (st.bore === 'd' || st.bore === 'dd') return [`${st.bore === 'd' ? 'D' : 'DD'} Ø${rawL(s)} / ${lenR(+st.boreFlat.toFixed(3))}`, rawL(s)];
  return [`${st.bore === 'rex' ? 'REX' : st.bore} ${lenR(s)} ${st.bore === 'square' ? 'sq' : 'AF'}`, rawL(s)];
}

function renderD() {
  pullLayout();
  const belt = BELTS[DX.type];
  const N = Math.round(num($('d-n')));
  const st = dxfSettings();
  const res = $('d-results');
  updateChips();
  $('d-bore-cfg').hidden = DX.borePre === 'none';
  $('d-bore-type').hidden = DX.borePre !== 'custom';      // shape picker only for a custom bore; presets set the shape
  $('d-hole-cfg').hidden = DX.holePre === 'none';
  rollTo($('d-bore-u'), ({ round: 'Ø mm', square: 'side mm', d: 'Ø mm', dd: 'Ø mm' }[DX.bore] || 'AF mm').replace('mm', U()));
  $('d-flat-wrap').hidden = !(DX.bore === 'd' || DX.bore === 'dd');
  rollTo($('d-flat-u'), `${DX.bore === 'dd' ? 'flat to flat' : 'flat to far side'}, ${U()}`);
  $('d-bore-hint').textContent = BORE_HINT[DX.borePre] || '';
  $('d-hole-hint').textContent = DX.holePre === 'custom'
    ? 'Holes are spaced evenly on the bolt circle; rotation 0° puts the first hole on +X.'
    : 'goBILDA 16 mm pattern = 4 holes on a 16 mm square (Ø22.63 bolt circle). Ø4.3 clears M4; use Ø3.3 to tap M4.';
  $('d-flange-wrap').hidden = !st.flange;
  DX.doc = null;

  const fail = (title, msg) => { res.innerHTML = resetNumbers(res) + errorBlock(title, msg); drawProfile(null); };
  if (!(N >= 6 && N <= 400)) return fail('Missing input', 'Enter between 6 and 400 teeth.');
  if (st.bore !== 'none' && !(st.boreSize > 0)) return fail('Missing input', 'Enter a bore size, or pick “No bore”.');
  if (!holesOK(st.holes)) return fail('Missing input', 'Check the mounting-hole fields (1–24 holes, size and bolt circle).');
  const doc = singleDoc(belt, N, st);
  if (doc.error) return fail("Can't build this pulley", doc.error);

  const part = doc.part;
  DX.doc = { ...doc, belt, N, st, name: dxfName(belt, N, st) };
  const [bl, bc] = boreLabel(st);
  const layers = [...new Set(doc.ents.map(e => e.layer))].join(', ');

  const notes = [['info', belt.inch
    ? 'Groove = ISO 5294 trapezoidal groove (40° flanks, flat bottom, corner and tip radii) as true arcs — good for 3D printing, laser or CNC. Test-fit before relying on it under load.'
    : 'Groove = true arcs fitted to the widely used open-source pulley profiles — good for 3D printing, laser or CNC. Test-fit before relying on it under load.']];
  if (st.fit) notes.push(['info', `Fit offset ${sgnL(st.fit, 2)} applied: grooves are ${len(Math.abs(st.fit), 2)} ${st.fit > 0 ? 'deeper and wider' : 'shallower and narrower'} on every side.`]);
  if (part.rtClamped) notes.push(['info', `Tip radius reduced to ${len(part.rt, 3)} so the grooves aren't undercut on this small pulley.`]);
  if (N < belt.minT) notes.push(['warn', `${N}T is below the commonly recommended minimum for ${belt.label} (~${belt.minT}T).`]);
  if (doc.flR) notes.push(['info', `Flange disc is placed beside the pulley as a separate part (FLANGE layer), with the same bore and holes.`]);
  if (st.holes && DX.holePre !== 'custom') notes.push(['info', `${DX.holePre === 'sonic' ? 'Sonic Hub' : 'Servo hub'} pattern from goBILDA's 16 mm hub pattern (the same layout their hub-mount sprockets use around a 14 mm bore). Check it against your hub before cutting metal.`]);
  if (st.clear) notes.push(['info', `Bore clearance ${sgnL(st.clear, 2)} per side — the bore is cut at ${len(st.boreSize, 3)}.`]);

  const rootD = part.od - 2 * part.D;
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Pulley ${DX.cur + 1} · outside Ø · ${N}T ${belt.label}</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(part.od)}" data-d="${dU(3)}">${fl(part.od, 3)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">pitch Ø ${len(part.pd, 3)} · ${alt(part.od)} OD</div>
      <button type="button" class="btn sm copy" data-copy="${fl(part.od, 3)}">Copy</button>
    </div>
    <div class="dl">
      <button type="button" class="btn primary icon" data-dl-dxf>${ICON_DL}Download DXF</button>
      <button type="button" class="btn icon" data-dl-both>${ICON_PUL}Both pulleys</button>
      <span class="hint">${DX.doc.name} · R12 · mm · ${layers}</span>
    </div>
    ${kvGrid([
      ['Pitch Ø', `${len(part.pd, 3)}`, fl(part.pd, 3)],
      ['Outside Ø', `${len(part.od, 3)}`, fl(part.od, 3)],
      ['Root Ø', `${len(rootD, 3)}`, fl(rootD, 3)],
      ['Groove depth', `${len(part.D, 3)}`, fl(part.D, 3)],
      ['Groove opening', `${len(part.W, 3)}`, fl(part.W, 3)],
      ['Bottom radius', `${len(part.rb, 3)}`, fl(part.rb, 3)],
      ['Tip radius', `${len(part.rt, 3)}`, fl(part.rt, 3)],
      ['Mount holes', st.holes ? `${st.holes.n} × Ø${rawL(+st.holes.d.toFixed(2))} on Ø${lenR(+st.holes.pcd.toFixed(2))}` : '—', st.holes ? rawL(+st.holes.pcd.toFixed(3)) : null],
      ['Bore', bl, bc],
      ['Flange Ø', doc.flR ? `${len(2 * doc.flR, 2)}` : '—', doc.flR ? fl(2 * doc.flR, 2) : null],
    ])}
    ${notesHTML(notes)}
    ${asmHTML()}`;
  rollNumbers(res);
  animateHero(res);
  rollTo($('d-viz-meta'), `${belt.label} · ${N}T · ${bl === 'none' ? 'no bore' : bl}${st.holes ? ` · ${st.holes.n} holes` : ''}`);
  drawProfile(DX.doc);
}

function drawProfile(doc) {
  const full = $('d-svg-full'), zoom = $('d-svg-zoom');
  if (!doc) {
    [full, zoom].forEach(s => { s.setAttribute('viewBox', '0 0 300 120'); s.innerHTML = '<text x="150" y="64" text-anchor="middle" font-size="12" class="empty">No profile</text>'; });
    $('d-viz-meta').textContent = '';
    return;
  }
  const { part, flR, fx, belt } = doc;
  const R = part.od / 2, pr = part.pd / 2;
  const holesD = (ox = 0) => (part.holes || []).map(h => circlePath(h.r, h.c[0] + ox, -h.c[1])).join(' ');
  const outline = polyPath(part.verts) + ' ' + borePath(part.bore) + ' ' + holesD();

  // full part (+ flange)
  const right = flR ? fx + flR : pr, top = Math.max(pr, flR || 0);
  const pad = Math.max(right + pr, 2 * top) * 0.07;
  full.setAttribute('viewBox', `${P(-pr - pad)} ${P(-top - pad * 1.6)} ${P(right + pr + 2 * pad)} ${P(2 * top + pad * 2.6)}`);
  full.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const cr = R * 0.18;
  full.innerHTML = '<g class="pv-spin">' +
    `<path d="${outline}" class="pv-part" ${NS} stroke-width="1"/>` +
    `<circle r="${P(pr)}" class="pv-pitch" ${NS} stroke-width="1"/>` +
    `<line x1="${P(-cr)}" x2="${P(cr)}" y1="0" y2="0" class="pv-c" ${NS} stroke-width="1"/><line y1="${P(-cr)}" y2="${P(cr)}" x1="0" x2="0" class="pv-c" ${NS} stroke-width="1"/></g>` +
    (flR ? `<path d="${circlePath(flR, fx)} ${borePath(part.bore, fx)} ${holesD(fx)}" class="pv-flange" ${NS} stroke-width="1"/>` : '');

  // groove detail around the top groove
  const w = belt.pitch * 2.6, h = w * 0.66;
  const cy = -((R - part.D) + pr) / 2;
  zoom.setAttribute('viewBox', `${P(-w / 2)} ${P(cy - h / 2)} ${P(w)} ${P(h)}`);
  zoom.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const fz = w * 0.04, lx = w / 2 - fz * 0.8, ly = cy - h / 2 + fz * 2.4;
  zoom.innerHTML =
    `<path d="${outline}" class="pv-part" ${NS} stroke-width="1.25"/>` +
    `<circle r="${P(pr)}" class="pv-pitch" ${NS} stroke-width="1"/>` +
    `<circle r="${P(R)}" class="pv-od" ${NS} stroke-width="1"/>` +
    `<line x1="0" x2="0" y1="${P(-R - h * 0.08)}" y2="${P(-(R - part.D) + h * 0.12)}" class="pv-c" ${NS} stroke-width="1" stroke-dasharray="3 3"/>` +
    `<text x="${P(lx)}" y="${P(ly)}" text-anchor="end" font-size="${P(fz)}" class="pv-a">- - pitch Ø${fl(part.pd, 2)}</text>` +
    `<text x="${P(lx)}" y="${P(ly + fz * 1.5)}" text-anchor="end" font-size="${P(fz)}" class="pv-l">··· OD Ø${fl(part.od, 2)}</text>`;
}

/* ================= SECTION 4: belt DXF ================= */
/* width and thickness are kept per belt type (wBy / hBy, unset = default / standard) and shared by every tab:
   the layouts draw the belt at this thickness. link: type & teeth follow the Center distance tab, both ways. */
const BT = { type: 'HTD5M', doc: null, link: true, wBy: {}, hBy: {} };
/* thickness range per belt: the backing must stay above the cords on the pitch line */
function thickRange(belt) {
  const lo = Math.ceil((belt.toothH + belt.pld + 0.2) * 20) / 20, hi = Math.round(belt.thick * 2.5 * 20) / 20;
  return [lo, hi];
}
// inch belts come in inch widths: 1/8, 3/16, 1/4 … 2 in (part-number codes 012, 019, 025 … 200)
const W_STD = { HTD5M: [9, 15, 25], HTD3M: [6, 9, 15], GT2_2: [6, 9, 12], GT2_3: [6, 9, 12, 15], GT3_3: [6, 9, 15], GT3_5: [9, 15, 25],
  MXL: [3.175, 4.7625, 6.35], XL: [6.35, 7.9375, 9.525], L: [12.7, 19.05, 25.4], H: [19.05, 25.4, 38.1, 50.8] };
const W_DEF = { HTD5M: 15, HTD3M: 9, GT2_2: 6, GT2_3: 9, GT3_3: 9, GT3_5: 15, MXL: 6.35, XL: 9.525, L: 12.7, H: 25.4 };
const W_MIN = 3, W_MAX = 51;
const beltW = k => BT.wBy[k] >= W_MIN && BT.wBy[k] <= W_MAX ? BT.wBy[k] : W_DEF[k];
const wStep = b => b.inch ? IN / 32 : 1;                 // width slider: 1/32 in or 1 mm
/* inch widths read as fractions: 0.25 in → 1/4″ */
function inFrac(mm) {
  let n = Math.round(mm / IN * 32), d = 32;
  while (n % 2 === 0 && d > 1) { n /= 2; d /= 2; }
  const whole = Math.floor(n / d), r = n % d;
  return `${whole ? whole : ''}${whole && r ? ' ' : ''}${r ? `${r}/${d}` : whole ? '' : '0'}″`;
}
const wLabel = (b, w) => b.inch ? inFrac(w) : lenR(w);
const snapW = (b, v) => b.inch ? +(Math.round(v / wStep(b)) * wStep(b)).toFixed(4) : Math.round(v);
function beltThick(b) {
  const v = BT.hBy[b.key], [lo, hi] = thickRange(b);
  return v >= lo && v <= hi ? v : b.thick;
}
const thickOver = b => beltThick(b) > b.thick + 1e-6;
const beltSize = b => `${wLabel(b, beltW(b.key))} wide · ${len(beltThick(b), 2)} thick${thickOver(b) ? ' (not standard)' : ''}`;
/* belt teeth on the Center distance tab (its length box is in teeth or mm) */
function c2cTeeth() {
  const v = num($('a-len'));
  if (!(v > 0)) return NaN;
  return A.unit === 'teeth' ? Math.round(v) : Math.round(v / BELTS[A.type].pitch);
}
function pullBelt() {
  if (!BT.link) return;
  if (BT.type !== A.type) { BT.type = A.type; setType($('t-type'), BT.type); updateInds(); }
  const n = c2cTeeth(), el = $('t-n');
  if (Number.isFinite(n) && n !== num(el) && document.activeElement !== el) setField('t-n', n);
}
function pushBelt(kind) {
  if (!BT.link) return;
  if (kind === 'type') {
    const i = $('a-type').querySelector(`input[value="${BT.type}"]`);
    if (i && !i.checked) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }
    return;
  }
  const n = Math.round(num($('t-n')));
  if (!(n >= 1)) return;
  const el = $('a-len'), v = A.unit === 'teeth' ? n : n * BELTS[A.type].pitch;
  if (num(el) !== v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
}
/* set the thickness for the belt tab's type (clamped); the standard value clears the override */
function setThick(v) {
  const std = BELTS[BT.type], [lo, hi] = thickRange(std);
  if (!Number.isFinite(v)) v = beltThick(std);
  v = Math.min(hi, Math.max(lo, Math.round(v * 100) / 100));
  const before = beltThick(std);
  if (Math.abs(v - before) < 1e-9) return;        // unchanged (e.g. leaving the box): don't rebuild under the pointer
  if (Math.abs(v - std.thick) < 1e-6) delete BT.hBy[BT.type]; else BT.hBy[BT.type] = v;
  renderT();
  if (Math.abs(before - beltThick(std)) > 1e-9) refreshLayouts();
}
/* the calculator tabs show width / thickness and draw the belt with it */
function refreshLayouts() { renderA(); renderB(true); }
const PREVIEW_TEETH = 30;
function calcLayout() {                       // linked: the Center distance layout; else the last calculator tab, if it is valid
  const from = BT.link || lastCalc !== 'length' ? 'c2c' : 'length', o = $(from === 'length' ? 'b-svg' : 'a-svg')._last;
  if (!o || !(o.g.gap > 0)) return null;
  return { o, t: Math.round(beltLength(o.labelC, o.g.r1, o.g.r2) / o.belt.pitch), from: from === 'length' ? 'Belt length' : 'Center distance' };
}
/* render DXF entities into an SVG preview (model y up → screen y down) */
function drawDoc(svg, ents) {
  const [x0, y0, x1, y1] = extentsOf(ents), w = x1 - x0, h = y1 - y0, pad = Math.max(w, h) * 0.02 + 1;
  svg.setAttribute('viewBox', `${Q3(x0 - pad)} ${Q3(-y1 - pad)} ${Q3(w + 2 * pad)} ${Q3(h + 2 * pad)}`);
  const of = (l, t) => ents.filter(e => e.layer === l && e.type === t);
  const polys = l => of(l, 'poly').map(e => polyPath(e.verts, Q3)).join(' ');
  const lines = l => of(l, 'line').map(e => `M${Q3(e.a[0])} ${Q3(-e.a[1])}L${Q3(e.b[0])} ${Q3(-e.b[1])}`).join('');
  svg.innerHTML = `<path d="${polys('BELT_TOP')}" class="bv-top" ${NS} stroke-width="1"/>`
    + `<path d="${lines('TEETH')}" class="bv-teeth" ${NS} stroke-width="1"/>`
    + `<path d="${polys('BELT')}" class="bv-belt" fill-rule="evenodd" ${NS} stroke-width="1"/>`
    + `<path d="${polys('OVER')}" class="bv-over" fill-rule="evenodd" ${NS} stroke-width="1"/>`
    + `<path d="${polys('PITCH')} ${lines('PITCH')}" class="bv-pitch-u" ${NS} stroke-width="4"/>`
    + `<path d="${polys('PITCH')} ${lines('PITCH')}" class="bv-pitch" ${NS} stroke-width="2"/>`
    + ents.filter(e => e.type === 'text').map(e => `<text x="${Q3(e.p[0])}" y="${Q3(-e.p[1])}" font-size="${Q3(e.h)}" class="bv-t${e.layer === 'PITCH' ? ' bv-pt' : ''}">${escT(e.s)}</text>`).join('');
}
function renderT() {
  pullBelt();
  const std = BELTS[BT.type], p = std.pitch, n = Math.round(num($('t-n'))), W = beltW(BT.type), wEl = $('t-w');
  wEl.min = std.inch ? wStep(std) * 4 : W_MIN; wEl.max = W_MAX; wEl.step = wStep(std);
  if (Math.abs(num(wEl) - W) > 1e-6) wEl.value = W;
  const [hLo, hHi] = thickRange(std), hEl = $('t-h'), hNum = $('t-h-num');
  hEl.min = hLo; hEl.max = hHi; hNum.min = hLo; hNum.max = hHi;
  const T = beltThick(std), over = T > std.thick + 1e-6;
  const belt = { ...std, thick: T };                       // the standard profile with this backing thickness
  if (Math.abs(num(hEl) - T) > 1e-9) hEl.value = T;
  if (document.activeElement !== hNum) { hNum.value = T.toFixed(2); hNum.classList.remove('oob'); }
  paintRange(hEl);
  const pv = (T - hLo) / (hHi - hLo), ps = (std.thick - hLo) / (hHi - hLo);
  hEl.style.setProperty('--ps', `${ps * 100}%`);
  hEl.style.setProperty('--psq', `${pv > 0 ? Math.min(100, ps / pv * 100) : 100}%`);
  hEl.classList.toggle('over', over); hNum.classList.toggle('over', over);
  $('t-h-tag').hidden = !over;
  $('t-legend').hidden = !over;
  rollTo($('t-h-hint'), over ? `${len(T - std.thick, 2)} above the ${len(std.thick, 2)} standard · type a value or drag (${fl(hLo, 2)}–${len(hHi, 2)})`
    : `Type a value or drag · ${fl(hLo, 2)}–${len(hHi, 2)}`);
  $('t-h-hint').classList.toggle('bad', over);
  setChips($('t-hchips'), `<span class="chips-l">Standard:</span><button type="button" class="chip${Math.abs(T - std.thick) < 1e-6 ? ' on' : ''}" data-th="${std.thick}">${len(std.thick, 2)}</button>`);
  const res = $('t-results'), lay = calcLayout();
  $('t-link').checked = BT.link;
  $('t-link-note').textContent = BT.link ? '· belt type & teeth sync with the Center distance tab' : '· belt is independent of the layout';
  $('t-chips').innerHTML = lay && !BT.link ? `<span class="chips-l">Use the ${lay.from} layout:</span><button type="button" class="chip" data-tlay>${lay.o.belt.label} · ${lay.t}T</button>` : '';
  setChips($('t-wchips'), '<span class="chips-l">Standard:</span>'
    + W_STD[BT.type].map(w => `<button type="button" class="chip${w === W ? ' on' : ''}" data-tw="${w}">${wLabel(std, w)}</button>`).join(''));
  rollTo($('t-w-out'), wLabel(std, W));
  paintRange(wEl);
  const segOn = $('t-segon').checked;
  $('t-seg-wrap').hidden = !segOn;
  const loopOK = !!lay && lay.o.belt === std && lay.t === n;
  rollTo($('t-loop-note'), loopOK ? `· ${lay.o.N1}T + ${lay.o.N2}T at ${len(lay.o.labelC, 2)}${BT.link ? ', as on the Center distance tab' : ''}` : '· needs a matching layout');
  rollTo($('t-n-hint'), n > 0 ? `= ${lenR(n * p)} pitch length · ${partNo(belt, n * p, W)}` : '');
  const fail = (title, msg) => { res.innerHTML = resetNumbers(res) + errorBlock(title, msg); $('t-svg').innerHTML = ''; BT.doc = null; rollTo($('t-viz-meta'), ''); $('t-legend').hidden = true; };
  if (!(n >= 10 && n <= 2000)) return fail('Missing input', 'Enter between 10 and 2000 teeth.');
  const views = { loop: $('t-loop').checked && loopOK, profile: $('t-prof').checked, top: $('t-top').checked };
  if (!views.loop && !views.profile && !views.top) {
    return fail('Nothing to export', $('t-loop').checked ? 'The loop needs a matching layout — turn on another view, or use the layout chip.' : 'Turn on at least one view.');
  }
  const seg = segOn ? Math.max(1, Math.round(num($('t-seg')))) : 0;
  const o = { loop: views.loop ? { r1: lay.o.g.r1, r2: lay.o.g.r2, C: lay.o.labelC } : null, profile: views.profile, top: views.top, seg, pitch: $('t-pitch').checked, std: std.thick };
  const doc = beltDoc(belt, n, W, o), L = +(n * p).toFixed(3), Ld = Number.isInteger(L) ? 0 : 2, back = belt.thick - belt.toothH - belt.pld;
  BT.doc = { ents: doc.ents.filter(e => e.layer !== 'OVER'), name: `belt_${belt.key}_${doc.part}${seg ? `_${doc.m}T-piece` : ''}.dxf` };
  const layers = [...new Set(BT.doc.ents.map(e => e.layer))].join(', ');
  const notes = [];
  if ($('t-loop').checked && !loopOK) {
    notes.push(['info', BT.link ? 'The loop view needs a valid layout on the Center distance tab (this belt has to fit around its pulleys).'
      : lay ? `The loop view needs the ${lay.o.belt.label} ${lay.t}T belt from the ${lay.from} tab — tap the chip under Length to use it.`
      : 'Set up a valid layout on the Center distance or Belt length tab to include the belt loop.']);
  }
  if (over) notes.push(['bad', `Not a standard thickness: ${len(T, 2)} is ${len(T - std.thick, 2)} thicker than a stock ${std.label} belt (${len(std.thick, 2)}). The extra backing is drawn red — the teeth stay the same.`]);
  else if (Math.abs(T - std.thick) > 1e-6) notes.push(['info', `Thickness ${len(T, 2)} instead of the standard ${lenR(std.thick)} — the teeth stay the same, only the backing changes.`]);
  if (!W_STD[BT.type].some(w => Math.abs(w - W) < 1e-6)) notes.push(['info', `${wLabel(std, W)} isn't a common ${belt.label} width — usual sizes are ${std.inch ? W_STD[BT.type].map(inFrac).join(' / ') : `${W_STD[BT.type].map(rawL).join(' / ')} ${U()}`}.`]);
  if (seg) notes.push(['info', `Profile and top view show a ${doc.m}-tooth piece (${lenR(doc.m * p)}) — handy for belt clamps.`]);
  notes.push(['info', 'Teeth use the same profile as the assembly export (the groove shape with clearance), not the belt maker’s exact tooth drawing.']);
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Belt pitch length</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(L)}" data-d="${dU(Ld)}">${fl(L, Ld)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">${n} teeth × ${lenR(p)} · ${doc.part}</div>
      <button type="button" class="btn sm copy" data-copy="${doc.part}">Copy</button>
    </div>
    <div class="dl">
      <button type="button" class="btn primary icon" data-dl-belt>${ICON_DL}Download DXF</button>
      <span class="hint">${BT.doc.name} · R12 · mm · ${layers}</span>
    </div>
    ${kvGrid([
      ['Part number', doc.part, doc.part],
      ['Teeth', `${n}`, n],
      ['Pitch length', `${lenR(L)}`, rawL(L)],
      ['Outside length', `${len(L + 2 * Math.PI * back, 2)}`, fl(L + 2 * Math.PI * back, 2)],
      ['Width', `${lenR(W)}`, rawL(W)],
      ['Pulley face, min', `${lenR(W + 1)}`, rawL(W + 1)],
      ['Total thickness', `${len(T, 2)}`, fl(T, 2)],
      ['Tooth height', `${lenR(belt.toothH)}`, rawL(belt.toothH)],
      ['Backing', `${len(belt.thick - belt.toothH, 2)}`, fl(belt.thick - belt.toothH, 2)],
      ['Pitch line offset', `${lenR(belt.pld)}`, rawL(belt.pld)],
    ])}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  animateHero(res);
  const big = !seg && n > PREVIEW_TEETH;
  drawDoc($('t-svg'), big ? beltDoc(belt, n, W, { ...o, seg: PREVIEW_TEETH }).ents : doc.ents);
  rollTo($('t-viz-meta'), `${doc.part} · ${len(T, 2)} thick${big ? ` · preview shows ${PREVIEW_TEETH} of ${n} teeth, the DXF has all` : ''}`);
}

/* ================= SECTION 5: true size on this monitor ================= */
/* CSS px per mm = (physical px per inch / 25.4) / devicePixelRatio — dpr also absorbs browser zoom and OS scaling */
const detRes = () => { const d = window.devicePixelRatio || 1; return [Math.round(screen.width * d), Math.round(screen.height * d)]; };
function renderR() {
  const res = $('r-results'), svg = $('r-svg'), meta = $('r-viz-meta'), [dw, dh] = detRes();
  if (!$('r-w').value) $('r-w').value = dw;
  if (!$('r-h').value) $('r-h').value = dh;
  const sameDet = num($('r-w')) === dw && num($('r-h')) === dh;
  $('r-det').innerHTML = `<span class="chips-l">Detected:</span><button type="button" class="chip${sameDet ? ' on' : ''}" data-rdet>${dw} × ${dh}</button>`;
  $('r-dchips').innerHTML = '<span class="chips-l">Common:</span>' + DIAGS.map(d => `<button type="button" class="chip${num($('r-diag')) === d ? ' on' : ''}" data-rdiag="${d}">${d}″</button>`).join('');
  const S = screenScale();
  const fail = (t, m) => { res.innerHTML = resetNumbers(res) + errorBlock(t, m); svg.innerHTML = ''; svg.removeAttribute('style'); rollTo(meta, ''); };
  if (!S) { $('r-card').innerHTML = ''; return fail('Missing input', 'Enter your screen resolution and its diagonal in inches.'); }
  drawRef($('r-card'), S.pxmm); syncRefs('r');
  const from = lastCalc === 'length' ? 'Belt length' : 'Center distance', o = $(lastCalc === 'length' ? 'b-svg' : 'a-svg')._last;
  if (!o || !(o.g.gap > 0)) return fail('No layout yet', `Set up a valid layout on the ${from} tab — it is drawn here at 1:1.`);
  const T = beltThick(o.belt), belt = { ...o.belt, thick: T }, notes = [];
  let doc = layoutDoc(belt, o.N1, o.N2, o.labelC, [dxfSettings(0), dxfSettings(1)], 'assembly');
  if (doc.error) { notes.push(['warn', `${doc.error} — showing the belt only (fix it on the Pulley DXF tab).`]); doc = layoutDoc(belt, o.N1, o.N2, o.labelC, [dxfSettings(0), dxfSettings(1)], 'belt'); }
  const ents = doc.ents.slice(), bo = doc.bo, showPitch = $('r-pitch').checked;
  if (showPitch) {
    ents.push({ type: 'poly', layer: 'PITCH', verts: loopVerts(bo.bp, 0) },
      { type: 'circle', layer: 'PITCH', c: [0, 0], r: bo.bp.r1 }, { type: 'circle', layer: 'PITCH', c: [o.labelC, 0], r: bo.bp.r2 });
  }
  const over = T > o.belt.thick + 1e-6
    ? `<path d="${polyPath(bo.outer, Q3)} ${polyPath(loopVerts(bo.bp, bo.tg.back - (T - o.belt.thick)), Q3)}" class="rv-over" fill-rule="evenodd" ${NS} stroke-width="1"/>` : '';
  const k = S.pxmm, sz = trueSizeSVG(svg, showPitch ? ents : ents.filter(e => e.layer !== 'CENTER'), k, $('r-ruler').checked,
    [[['PULLEY_1', 'PULLEY_2'], 'rv-pul'], [['BORE', 'HOLES'], 'rv-hole'], [['BELT'], 'rv-belt']], over);
  if (sz.W * k > $('r-scroll').clientWidth + 1) notes.push(['info', `The drawing is ${UNIT === 'in' ? len(sz.W, 1) : `${f(sz.W / 10, 1)} cm`} wide — wider than this window, so scroll sideways.`]);
  if (!sameDet) notes.push(['info', `This differs from the detected ${dw} × ${dh}. Enter the monitor's native resolution, not a scaled one.`]);
  notes.push(['info', `Browser zoom and display scaling (${Math.round(S.dpr * 100)} % now) are taken into account. Check the scale with a reference object below.`]);
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Screen density</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${S.ppi}" data-d="1">${f(S.ppi, 1)}</span><small>PPI</small></div>
      <div class="hero-sub" data-k="sub">${f(UNIT === 'in' ? k * IN : k, 3)} CSS px per ${U()} · ${S.w} × ${S.h} on ${S.dg}″</div>
    </div>
    ${kvGrid([
      [`Physical px / ${U()}`, f(UNIT === 'in' ? S.ppi : S.ppi / 25.4, 3), f(UNIT === 'in' ? S.ppi : S.ppi / 25.4, 3), 'px'],
      ['Pixel pitch', `${len(25.4 / S.ppi, 4)}`, fl(25.4 / S.ppi, 4)],
      ['Scale factor', `${f(S.dpr, 2)}×`, null],
      ['Screen size', `${fl(S.w / S.ppi * 25.4, 0)} × ${len(S.h / S.ppi * 25.4, 0)}`, null],
      ['Assembly', `${fl(sz.aw, 1)} × ${len(sz.ah, 1)}`, null],
      ['From', `${from} tab`, null],
    ])}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  rollTo(meta, `1:1 · ${o.belt.label} · ${o.N1}T + ${o.N2}T · C2C ${len(o.labelC, 2)} · ${len(T, 2)} thick`);
}
['r-w', 'r-h', 'r-diag'].forEach(id => $(id).addEventListener('input', renderR));
buildRefs($('r-refs')); buildRefs($('kr-refs'));
document.addEventListener('click', e => {
  const c = e.target.closest('[data-ref]');
  if (!c || c.dataset.ref === REF) return;
  REF = c.dataset.ref; REF_DRAW = true;
  if (PAGE === 'chain') renderKR(); else renderR();
});
$('r-ruler').addEventListener('change', e => { if (e.target.checked) TS_SWEEP = true; });
['r-pitch', 'r-ruler'].forEach(id => $(id).addEventListener('change', renderR));
$('r-det').addEventListener('click', e => { if (!e.target.closest('[data-rdet]')) return; const [w, h] = detRes(); $('r-w').value = w; $('r-h').value = h; renderR(); });
$('r-dchips').addEventListener('click', e => { const c = e.target.closest('[data-rdiag]'); if (!c) return; setField('r-diag', +c.dataset.rdiag); renderR(); });

function moveInd() {
  document.querySelectorAll('.tabs').forEach(tabsEl => {
    const tabInd = tabsEl.querySelector('.tab-ind'), t = tabsEl.querySelector('.tab[aria-selected="true"]');
    if (!t || !t.offsetWidth) return;
    glide(tabInd, t.offsetLeft, 0, t.offsetWidth);
    if (!tabsEl.classList.contains('has-ind')) {
      tabsEl.classList.add('has-ind');
      requestAnimationFrame(() => requestAnimationFrame(() => tabInd.classList.add('ready')));
    }
  });
}
const TAB_ORDERS = { belt: ['c2c', 'length', 'dxf', 'belt', 'real'], chain: ['k-c2c', 'k-len', 'k-spr', 'k-chain', 'k-real'] };
const TAB_ORDER = TAB_ORDERS.belt;
const pageOfTab = name => (name.startsWith('k-') ? 'chain' : 'belt');
/* ---- top-level pages: the timing-belt calculator and the chain generator ---- */
const pagesEl = document.querySelector('.pages'), pageInd = pagesEl.querySelector('.page-ind');
const PAGE_INFO = {
  belt: { title: 'Timing Belt Calculator', sub: 'Center distance, belt length, pulley & belt DXF for HTD, GT2, GT3 and MXL / XL / L / H belts' },
  chain: { title: 'Chain Generator', sub: 'Roller chain C2C, chain length, sprocket DXF and chain DXF / STEP — ANSI, ISO, moto and bike chains' },
};
function movePageInd() {
  const t = pagesEl.querySelector('.page-t[aria-selected="true"]');
  if (!t || !t.offsetWidth) return;
  glide(pageInd, t.offsetLeft + 2, t.offsetTop + t.offsetHeight - 3, t.offsetWidth - 12);
  if (!pagesEl.classList.contains('has-ind')) {
    pagesEl.classList.add('has-ind');
    requestAnimationFrame(() => requestAnimationFrame(() => pageInd.classList.add('ready')));
  }
}
function switchPage(name) {
  if (name !== 'chain') name = 'belt';
  const was = PAGE;
  PAGE = name;
  pagesEl.querySelectorAll('.page-t').forEach(b => b.setAttribute('aria-selected', String(b.dataset.page === name)));
  $('page-belt').hidden = name !== 'belt'; $('page-chain').hidden = name !== 'chain';
  $('foot-belt').hidden = name !== 'belt'; $('foot-chain').hidden = name !== 'chain';
  $('tabs-belt').hidden = name !== 'belt'; $('tabs-chain').hidden = name !== 'chain';
  document.body.classList.toggle('pg-chain', name === 'chain');
  rollTo($('page-sub'), PAGE_INFO[name].sub);
  $('page-h1').textContent = document.title = PAGE_INFO[name].title;
  closeMenus();
  movePageInd();
  if (was !== name) {
    const t = document.querySelector(`#tabs-${name} .tab[aria-selected="true"]`);
    switchTab(t ? t.dataset.tab : TAB_ORDERS[name][0], true);   // re-render the visible tab, restore its hash
    moveInd(); updateInds();
    if (!reduceMotion) {                             // the new page's cards and tabs come in from the side you moved to
      const d = name === 'chain' ? 1 : -1;
      enterPanel($('page-' + name).querySelector('.panel:not([hidden])'), d);
      $('tabs-' + name).animate([{ opacity: 0, transform: `translateX(${d * 16}px)`, filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
        { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }
  renderAlerts();
  ensureLoop();
}
pagesEl.querySelectorAll('.page-t').forEach(b => b.addEventListener('click', () => { switchPage(b.dataset.page); movePageInd(); }));

/* keyboard: 1–5 open the tabs of the page in view, ← / → go to the belt / chain page, ↑ / ↓ switch mm ⇄ in.
   Not while typing in a box (digits and arrows belong to it), with the arrows on a slider or radio group (they move it),
   inside an open menu, or with Ctrl / Alt / ⌘ held. */
Object.entries(TAB_ORDERS).forEach(([pg, tabs]) => tabs.forEach((t, i) => $(`tabs-${pg}`).querySelector(`[data-tab="${t}"]`).setAttribute('aria-keyshortcuts', String(i + 1))));
pagesEl.querySelectorAll('.page-t').forEach(b => b.setAttribute('aria-keyshortcuts', b.dataset.page === 'belt' ? 'ArrowLeft' : 'ArrowRight'));
$('sys-units').querySelectorAll('button').forEach(b => b.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown'));
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target instanceof Element ? e.target : document.body;
  const typing = t.closest('textarea, select, [contenteditable]:not([contenteditable="false"])')
    || (t.matches('input') && !['radio', 'checkbox', 'range', 'button', 'submit', 'reset', 'color'].includes(t.type));
  if (typing || t.closest('.menu-pop')) return;
  if (/^[1-5]$/.test(e.key)) {                       // top-row and numpad digits give the same key
    const name = TAB_ORDERS[PAGE][+e.key - 1];
    if (!name) return;
    e.preventDefault();
    if (!e.repeat) switchTab(name);
    return;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {  // either one flips the unit (the page no longer scrolls on ↑ / ↓)
    if (t.matches('input[type="radio"], input[type="range"]')) return;
    e.preventDefault();
    if (!e.repeat) setUnit(UNIT === 'mm' ? 'in' : 'mm', true);
    return;
  }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (t.matches('input[type="radio"], input[type="range"]')) return;
  e.preventDefault();
  if (e.repeat) return;
  const to = e.key === 'ArrowLeft' ? 'belt' : 'chain';
  if (to !== PAGE) { switchPage(to); movePageInd(); return; }
  if (!reduceMotion) {                               // already there: the switch bumps against its end
    const d = to === 'belt' ? -1 : 1;
    pagesEl.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${d * 6}px)` }, { transform: 'translateX(0)' }],
      { duration: 280, easing: 'cubic-bezier(.34,1.45,.64,1)' });
  }
});
let tabSwap = null;
/* the old panel slides out one way, the new one slides in from the other side */
function switchTab(name, instant) {
  if (tabSwap) { clearTimeout(tabSwap.t); tabSwap.show(); }
  const pg = pageOfTab(name), root = $('page-' + pg), order = TAB_ORDERS[pg];
  const cur = root.querySelector('.panel:not([hidden])'), next = root.querySelector(`.panel[data-panel="${name}"]`);
  const dir = cur && cur !== next ? Math.sign(order.indexOf(name) - order.indexOf(cur.dataset.panel)) : 0;
  $('tabs-' + pg).querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  moveInd(); closeMenus();
  if (PAGE === pg) { try { history.replaceState(null, '', '#' + name); } catch (_) { /* file:// in some browsers */ } }
  const show = () => {
    tabSwap = null;
    root.querySelectorAll('.panel').forEach(p => { p.classList.remove('leave'); p.hidden = p !== next; });
    if (name === 'c2c' || name === 'length') lastCalc = name;
    if (name === 'real' || name === 'k-real') REF_DRAW = TS_SWEEP = true;   // opening True size: outline draws in, ruler sweeps
    if (name === 'k-c2c' || name === 'k-len') K.calc = name;
    if (dir && !instant) enterPanel(next, dir);
    updateInds();
    renderTab(name);
  };
  if (!dir || instant || reduceMotion) { show(); return; }
  cur.style.setProperty('--lx', `${-dir * 24}px`);
  cur.classList.add('leave');
  tabSwap = { show, t: setTimeout(show, 160) };
}
function renderTab(name) {
  switch (name) {
    case 'dxf': renderD(); break;
    case 'belt': renderT(); break;
    case 'real': renderR(); break;
    case 'c2c': case 'length': { const svg = name === 'c2c' ? $('a-svg') : $('b-svg'); if (svg._last) drawLayout(svg, svg._last); break; }
    case 'k-c2c': renderKA(); break;
    case 'k-len': renderKB(true); break;
    case 'k-spr': renderKS(); break;
    case 'k-chain': renderKC(); break;
    case 'k-real': renderKR(); break;
  }
}

const ICON_ASM = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="4.5" width="17" height="11" rx="5.5"/><circle cx="7" cy="10" r="2.8"/><circle cx="13.5" cy="10" r="2.3"/></svg>';
const ICON_BELT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="4.5" width="17" height="11" rx="5.5"/><path d="M6 7.4h1.5M9.3 7.4h1.5M12.6 7.4h1.5M6 12.6h1.5M9.3 12.6h1.5M12.6 12.6h1.5" stroke-width="1.4" stroke-linecap="round"/></svg>';
const ICON_PUL = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="6.5" cy="10" r="4.5"/><circle cx="15" cy="10" r="3.2"/><circle cx="6.5" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r=".8" fill="currentColor"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg>';
function menuHTML(src) {
  const item = (what, icon, title, sub) =>
    `<button type="button" role="menuitem" data-export="${what}" data-src="${src}"><span class="mi">${icon}</span><span><b>${title}</b><small>${sub}</small></span></button>`;
  return `<button type="button" class="btn sm icon" data-menu-btn aria-haspopup="menu" aria-expanded="false">${ICON_DL}Export DXF${CHEV}</button>`
    + '<div class="menu-pop" role="menu" hidden>'
    + item('assembly', ICON_ASM, 'Assembly', 'Pulleys + belt, teeth meshed — one file')
    + item('belt', ICON_BELT, 'Belt only', 'Toothed belt loop at this C2C')
    + item('pulleys', ICON_PUL, 'Pulleys only', 'Both pulleys placed at this C2C')
    + '<p class="menu-note">Bore, fit offset and pitch lines follow the Pulley DXF tab.</p></div>';
}
function closeMenus() {
  document.querySelectorAll('.menu-pop').forEach(p => {
    if (p.hidden || p._closing) return;
    if (reduceMotion) { p.hidden = true; return; }
    p._closing = true;
    p.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px) scale(.97)' }], { duration: 140, easing: 'ease-in' })
      .onfinish = () => { p.hidden = true; p._closing = false; };
  });
  document.querySelectorAll('[data-menu-btn]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function exportLayout(src, what) {
  const o = $(src)._last;
  if (!o || !(o.g.gap > 0)) { toast('No valid layout to export.'); return; }
  const doc = layoutDoc({ ...o.belt, thick: beltThick(o.belt) }, o.N1, o.N2, o.labelC, [dxfSettings(0), dxfSettings(1)], what);
  if (doc.error) { toast(doc.error); return; }
  const c = `C${o.labelC.toFixed(2)}`, part = partNo(o.belt, doc.bo.Nt * o.belt.pitch, beltW(o.belt.key)), pair = `${o.N1}T-${o.N2}T`;
  const name = { assembly: `assembly_${o.belt.key}_${pair}_${part}_${c}`, belt: `belt_${o.belt.key}_${part}_${c}`, pulleys: `pulleys_${o.belt.key}_${pair}_${c}` }[what] + '.dxf';
  download(name, toDXF(doc.ents));
  toast(`Saved ${name}`);
}
/* belt / assembly export block on the DXF tab, fed by the last calculator tab used */
function asmHTML() {
  const src = lastCalc === 'length' ? 'b-svg' : 'a-svg', o = $(src)._last;
  if (!o || !(o.g.gap > 0)) return '';
  const Nt = Math.round(beltLength(o.labelC, o.g.r1, o.g.r2) / o.belt.pitch);
  return `<div class="asm">
      <div class="asm-top"><span class="pick-label">Belt &amp; assembly</span><span class="hint sans">from the ${lastCalc === 'length' ? 'Belt length' : 'Center distance'} tab</span></div>
      <div class="asm-main">${o.belt.label} · ${o.N1}T + ${o.N2}T · ${Nt}T belt<span class="part">${partNo(o.belt, Nt * o.belt.pitch, beltW(o.belt.key))}</span><span class="asm-sub" data-k="asm">C2C ${len(o.labelC, 3)}</span></div>
      <div class="asm-btns">
        <button type="button" class="btn primary icon" data-export="assembly" data-src="${src}">${ICON_ASM}Assembly</button>
        <button type="button" class="btn icon" data-export="belt" data-src="${src}">${ICON_BELT}Belt only</button>
        <button type="button" class="btn icon" data-export="pulleys" data-src="${src}">${ICON_PUL}Pulleys only</button>
      </div>
    </div>`;
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

/* ---------------- wiring ---------------- */
buildTypes($('a-type'), 'a-belt', A.type, v => {
  A.type = v;
  if (A.unit === 'mm') {
    const p = BELTS[v].pitch, el = $('a-len'), L = num(el);
    el.step = p; el.min = p;
    if (L > 0) el.value = Math.max(1, Math.round(L / p)) * p;
  }
  renderA();
});
buildTypes($('b-type'), 'b-belt', B.type, v => { B.type = v; syncStockBox(); renderB(false); });
buildTypes($('d-type'), 'd-belt', DX.type, v => {
  DX.type = v;
  if (!DX.flhTouched) { $('d-flh').value = FLANGE_DEFAULT[v]; DX.p.forEach(p => { p.v['d-flh'] = String(FLANGE_DEFAULT[v]); }); }
  pushLayout('type');
  renderD();
});

$('a-units').addEventListener('click', e => {
  const b = e.target.closest('button[data-unit]');
  if (!b || b.dataset.unit === A.unit) return;
  const p = BELTS[A.type].pitch, el = $('a-len'), v = num(el);
  A.unit = b.dataset.unit;                          // first: the box converts only while it holds a length
  if (A.unit === 'mm') { el.step = p; el.min = p; if (v > 0) el.value = Math.max(1, Math.round(v)) * p; }
  else { el.step = 1; el.min = 1; if (v > 0) el.value = Math.max(1, Math.round(v / p)); }
  $('a-units').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  updateInds();
  renderA();
});

['a-n1', 'a-n2', 'a-len', 'a-allow'].forEach(id => $(id).addEventListener('input', renderA));
['b-n1', 'b-n2', 'b-c'].forEach(id => $(id).addEventListener('input', () => renderB(false)));
$('b-stock').addEventListener('input', e => { stockText[B.type] = e.target.value; updateStockCount(); renderB(true); });
$('b-stock-reset').addEventListener('click', () => { delete stockText[B.type]; syncStockBox(); renderB(true); });

$('d-n').addEventListener('input', () => { pushLayout('n'); renderD(); });
$('d-fit').addEventListener('input', renderD);
$('d-link').addEventListener('change', e => { DX.link = e.target.checked; renderD(); redrawLayouts(); });
function buildSeg(box, name, opts, initial, onChange) {
  box.innerHTML = opts.map(o => `
    <label class="seg-opt">
      <input type="radio" name="${name}" value="${o.v}"${o.v === initial ? ' checked' : ''}>
      <span><b>${o.t}</b><em>${o.s}</em></span>
    </label>`).join('');
  addInd(box, b => { const i = b.querySelector('input:checked'); return i && i.closest('.seg-opt'); }, 'seg-ind');
  box.addEventListener('change', e => { if (e.target.name === name) { onChange(e.target.value); updateInds(); } });
}
buildSeg($('d-bore-preset'), 'd-borep', BORE_PRE, DX.borePre, v => { applyBorePreset(v); renderD(); redrawLayouts(); });
buildSeg($('d-hole-preset'), 'd-holep', HOLE_PRE, DX.holePre, v => { applyHolePreset(v); renderD(); redrawLayouts(); });
$('d-bore').addEventListener('input', () => { boreToCustom(); updateInds(); renderD(); redrawLayouts(); });
$('d-clear').addEventListener('input', () => { renderD(); redrawLayouts(); });
$('d-flat').addEventListener('input', () => { boreToCustom(); updateInds(); renderD(); redrawLayouts(); });
['d-hn', 'd-hd', 'd-hp', 'd-hr'].forEach(id => $(id).addEventListener('input', () => { holesToCustom(); updateInds(); renderD(); redrawLayouts(); }));

buildTypes($('t-type'), 't-belt', BT.type, v => {
  BT.type = v;
  pushBelt('type');
  renderT();
});
$('t-h').addEventListener('input', () => setThick(num($('t-h'))));
$('t-h-num').addEventListener('input', () => {             // apply while typing when the value is in range
  const el = $('t-h-num'), v = num(el), [lo, hi] = thickRange(BELTS[BT.type]);
  const ok = Number.isFinite(v) && v >= lo && v <= hi;
  el.classList.toggle('oob', !ok && el.value !== '');
  if (ok) setThick(v);
});
$('t-h-num').addEventListener('change', () => {            // on Enter / leaving the box: clamp and tidy the value
  const el = $('t-h-num'), v = num(el), std = BELTS[BT.type], [lo, hi] = thickRange(std);
  if (Number.isFinite(v) && (v < lo || v > hi)) toast(`${std.label} thickness is limited to ${fl(lo, 2)}–${len(hi, 2)}.`);
  el.classList.remove('oob');
  setThick(v);
  el.value = beltThick(std).toFixed(2);
});
$('t-h-num').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('t-hchips').addEventListener('click', e => {
  const c = e.target.closest('[data-th]');
  if (!c) return;
  setThick(+c.dataset.th);
});
$('t-n').addEventListener('input', () => { pushBelt('n'); renderT(); });
$('t-seg').addEventListener('input', renderT);
$('t-w').addEventListener('input', () => { BT.wBy[BT.type] = snapW(BELTS[BT.type], num($('t-w'))); renderT(); refreshLayouts(); });
$('t-link').addEventListener('change', e => {
  BT.link = e.target.checked;
  if (BT.link) { pullBelt(); $('t-loop').checked = true; }
  updateInds(); renderT();
});
['t-loop', 't-prof', 't-top', 't-pitch', 't-segon'].forEach(id => $(id).addEventListener('change', renderT));
$('t-chips').addEventListener('click', e => {
  const lay = e.target.closest('[data-tlay]') && calcLayout();
  if (!lay) return;
  BT.type = lay.o.belt.key; setType($('t-type'), BT.type);
  setField('t-n', lay.t);
  $('t-loop').checked = true;
  updateInds(); renderT();
});
$('t-wchips').addEventListener('click', e => {
  const c = e.target.closest('[data-tw]');
  if (!c) return;
  BT.wBy[BT.type] = +c.dataset.tw; renderT(); refreshLayouts();
});
$('t-results').addEventListener('click', e => {
  if (!e.target.closest('[data-dl-belt]') || !BT.doc) return;
  download(BT.doc.name, toDXF(BT.doc.ents));
  toast(`Saved ${BT.doc.name}`);
});
$('d-flh').addEventListener('input', () => { DX.flhTouched = true; renderD(); });
$('d-flange').addEventListener('change', renderD);
$('d-pitch').addEventListener('change', renderD);
$('d-bore-type').addEventListener('click', e => {
  const b = e.target.closest('button[data-bore]');
  if (!b) return;
  setBoreShape(b.dataset.bore);
  boreToCustom();
  updateInds();
  renderD(); redrawLayouts();
});
$('d-chips').addEventListener('click', e => {
  const c = e.target.closest('[data-chip]');
  if (!c) return;
  const s = chipSource(), which = c.dataset.chip;
  readForm();
  DX.type = s.type; setType($('d-type'), s.type);
  if (!DX.flhTouched) DX.p.forEach(p => { p.v['d-flh'] = String(FLANGE_DEFAULT[s.type]); });
  if (which !== '1') DX.p[0].v['d-n'] = String(s.n1);
  if (which !== '0') DX.p[1].v['d-n'] = String(s.n2);
  switchPulley(which === 'both' ? DX.cur : +which, true);
});
$('d-which').addEventListener('click', e => {
  const b = e.target.closest('[data-which]');
  if (b && +b.dataset.which !== DX.cur) switchPulley(+b.dataset.which);
});
$('d-results').addEventListener('click', e => {
  if (e.target.closest('[data-dl-both]')) {
    const d = bothDoc();
    if (d.error) { toast(d.error); return; }
    download(d.name, toDXF(d.ents)); toast(`Saved ${d.name}`);
    return;
  }
  if (!e.target.closest('[data-dl-dxf]') || !DX.doc) return;
  download(DX.doc.name, toDXF(DX.doc.ents));
  toast(`Saved ${DX.doc.name}`);
});

// export menus + assembly buttons
document.addEventListener('click', e => {
  const item = e.target.closest('[data-export]');
  if (item) { closeMenus(); exportLayout(item.dataset.src, item.dataset.export); return; }
  const btn = e.target.closest('[data-menu-btn]');
  if (btn) {
    const pop = btn.nextElementSibling, open = pop.hidden || pop._closing;
    closeMenus();
    if (open) {
      pop.getAnimations().forEach(a => a.cancel()); pop._closing = false;   // reopened while folding away
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      const first = pop.querySelector('[role="menuitem"]');
      if (first) first.focus({ preventScroll: true });
    }
    return;
  }
  if (!e.target.closest('.menu-pop')) closeMenus();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

// animation controls
document.addEventListener('click', e => { if (e.target.closest('[data-anim-toggle]')) setPlaying(!ANIM.playing); });
document.addEventListener('input', e => {
  if (!e.target.matches('[data-anim-speed]')) return;
  ANIM.speed = parseFloat(e.target.value) || 1;
  document.querySelectorAll('[data-anim-speed]').forEach(s => { if (s !== e.target) s.value = e.target.value; paintRange(s); });
  document.querySelectorAll('[data-anim-out]').forEach(o => rollTo(o, `${ANIM.speed.toFixed(1)}×`));
});

// +/- steppers
document.addEventListener('click', e => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  if (!reduceMotion) {                               // a soft ripple from where the button was pressed
    const r = b.getBoundingClientRect(), rp = document.createElement('span');
    rp.className = 'ripple';
    rp.style.left = `${e.detail ? e.clientX - r.left : r.width / 2}px`; rp.style.top = `${e.detail ? e.clientY - r.top : r.height / 2}px`;
    b.appendChild(rp); setTimeout(() => rp.remove(), 600);
  }
  const el = $(b.dataset.for);
  const step = parseFloat(el.step) || 1;
  const min = el.min === '' ? -Infinity : parseFloat(el.min);
  let v = num(el); if (!Number.isFinite(v)) v = 0;
  v += step * Number(b.dataset.step);
  if ('snap' in el.dataset) v = Math.round(v / step) * step;
  el.value = Math.max(min, +v.toFixed(4));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  nudge(el, Number(b.dataset.step));
});
document.addEventListener('keydown', e => {
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.matches('.stepper input')) nudge(e.target, e.key === 'ArrowUp' ? 1 : -1);
});

// copy buttons (hero buttons swap their label; small icon buttons flash a check)
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const ok = await copyText(b.dataset.copy);
  clearTimeout(b._t);
  if (b.classList.contains('kcopy')) {
    b.classList.toggle('done', ok);
    if (!ok) toast('Copy failed — select the value manually.');
    b._t = setTimeout(() => b.classList.remove('done'), 1100);
    return;
  }
  if (!b.dataset.label) b.dataset.label = b.textContent;
  rollTo(b, ok ? 'Copied' : 'Copy failed');
  b._t = setTimeout(() => rollTo(b, b.dataset.label), 1100);
});

// suggestion rows + send button
$('b-results').addEventListener('click', e => {
  const send = e.target.closest('[data-send]');
  if (send) { sendToA(Number(send.dataset.send)); return; }
  const tr = e.target.closest('tr[data-l]');
  if (tr && !tr.classList.contains('dis')) { B.selL = Number(tr.dataset.l); renderB(true); flashPick(); }
});
$('b-results').addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-l]')) {
    e.preventDefault();
    const L = e.target.dataset.l;
    e.target.click();
    const again = $('b-results').querySelector(`tr[data-l="${L}"]`);
    if (again) again.focus();
  }
});

/* ================= CHAIN GENERATOR PAGE ================= */
/* one shared drive: chain type, sprocket teeth and chain length are the same on every chain tab */
const CH_SUB = {
  A25: '¼″ pitch', A25H: '¼″ heavy', A35: '⅜″ pitch', A40: '½″ pitch', A41: '½″ light', A50: '⅝″ pitch',
  A60: '¾″ pitch', A80: '1″ pitch', A100: '1¼″ pitch',
  B05: '8 mm', B06: '⅜″ · 9.53', B08: '½″ · 12.7', B10: '⅝″ · 15.9', B12: '¾″ · 19.1', B16: '1″ · 25.4',
  M420: '½″ · ¼″ wide', M428: '½″ · 5⁄16″', M520: '⅝″ · ¼″ wide', M525: '⅝″ · 5⁄16″', M530: '⅝″ · ⅜″ wide',
  K8: 'BMX · 1-speed', K332: 'derailleur',
};
const FAM_DEF = { ansi: 'A25', iso: 'B08', moto: 'M520', bike: 'K8' };
const K = {
  type: 'A25', byFam: {}, z1: 15, z2: 30, lenRaw: 80, unit: 'links', allow: 0,
  target: 200, selL: 0,
  strands: 1, clink: true, n: 80, segOn: false, seg: 10,
  views: { loop: true, side: true, top: true, plates: false, pitch: false }, model: 'piece',
  calc: 'k-c2c', doc: null,
};
const kch = () => CHAINS[K.type];
const kZOK = z => Number.isFinite(z) && z >= 6 && z <= 250;
function kLinks() {                                 // links set on the Center distance tab
  const v = +K.lenRaw;
  if (!(v > 0)) return NaN;
  return K.unit === 'links' ? Math.round(v) : Math.round(v / kch().p);
}
/* the drive of the Center distance tab (or the pick on the Chain length tab), straight from the state */
function kDrive(from) {
  const ch = kch(), z1 = K.z1, z2 = K.z2;
  if (!kZOK(z1) || !kZOK(z2) || sprocketOutline(ch, z1, 0).error || sprocketOutline(ch, z2, 0).error) return null;
  let L = kLinks(), C;
  if (from === 'k-len') {
    L = K.selL;
    if (!(L > 1)) return null;
  }
  if (!(L > 1)) return null;
  C = chainCenter(ch, z1, z2, L);
  if (!Number.isFinite(C)) return null;
  const g = chainAnalyze(ch, z1, z2, C);
  if (!g.valid || !(g.gap > 0)) return null;
  return { ch, z1, z2, L, C, labelC: C, g, from: from === 'k-len' ? 'Chain length' : 'Center distance' };
}

/* ---- chain type picker (family + size), one per tab, all in sync ---- */
const KTYPE_BOXES = ['ka-type', 'kb-type', 'ks-type', 'kc-type'];
function buildChainTypes(id) {
  const box = $(id);
  box.innerHTML = `<div class="units wide kfam" role="group" aria-label="Chain standard">${CHAIN_FAMS.map(f => `<button type="button" data-kfam="${f.v}" aria-pressed="false">${f.t}</button>`).join('')}</div>`
    + `<div class="seg kseg" role="radiogroup" aria-label="Chain size">${Object.values(CHAINS).map(c => `<label class="seg-opt" data-fam="${c.fam}"><input type="radio" name="${id}-r" value="${c.key}"><span><b>${c.label}</b><em>${CH_SUB[c.key] || `${lenR(c.p)} pitch`}</em></span></label>`).join('')}</div>`;
  const fam = box.querySelector('.kfam'), seg = box.querySelector('.kseg');
  addInd(fam, 'button[aria-pressed="true"]', 'u-ind');
  addInd(seg, b => { const i = b.querySelector('input:checked'); return i && i.closest('.seg-opt'); }, 'seg-ind');
  fam.addEventListener('click', e => { const b = e.target.closest('[data-kfam]'); if (b) { morphSnap(); setChainType(K.byFam[b.dataset.kfam] || FAM_DEF[b.dataset.kfam]); } });
  seg.addEventListener('change', e => { if (e.target.name === `${id}-r`) { morphSnap(); setChainType(e.target.value); } });
}
function syncChainTypes() {
  const fam = kch().fam;
  for (const id of KTYPE_BOXES) {
    const box = $(id);
    box.querySelectorAll('[data-kfam]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kfam === fam)));
    box.querySelectorAll('.seg-opt').forEach(l => { l.hidden = l.dataset.fam !== fam; });
    const i = box.querySelector(`input[value="${K.type}"]`);
    if (i) i.checked = true;
  }
  updateInds();
}
function setChainType(key) {
  if (!CHAINS[key]) return;
  const old = kch();
  if (key !== K.type && K.unit === 'mm') { const L = Math.round(+K.lenRaw / old.p); if (L > 0) K.lenRaw = +(L * CHAINS[key].p).toFixed(3); }
  K.type = key; K.byFam[CHAINS[key].fam] = key;
  K.strands = Math.min(K.strands, maxStrands(CHAINS[key]));
  syncChainTypes();
  renderKTab(); redrawChains();
}

/* ---- inputs ↔ state ---- */
function setIdle(id, v) {                           // write a value unless the user is typing in that box
  const el = $(id);
  if (!el || document.activeElement === el) return;
  const s = String(v);
  if (el.value !== s) el.value = s;
}
function kWrite() {
  document.querySelectorAll('#page-chain [data-kz]').forEach(el => setIdle(el.id, K[el.dataset.kz]));
  setIdle('ka-len', K.lenRaw); setIdle('ka-allow', K.allow); setIdle('kb-c', K.target);
  $('ka-units').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kunit === K.unit)));
  const p = kch().p, len = $('ka-len');
  len.step = K.unit === 'links' ? 1 : p; len.min = K.unit === 'links' ? 2 : p;
}

/* ---- C2C tab ---- */
function chainChecks(ch, z1, z2, g, L) {
  const out = [], zs = Math.min(z1, z2), th = z1 <= z2 ? g.th1 : g.th2, mesh = z1 <= z2 ? g.mesh1 : g.mesh2;
  const rip = 100 * (1 - Math.cos(Math.PI / zs));
  if (L % 2) out.push(['warn', `Odd link count: the chain needs an offset (half) link, which is weaker — ${L - 1} or ${L + 1} links close with a normal connecting link.`]);
  if (zs < 9) out.push(['bad', `${zs}T is below the 9-tooth minimum for roller chain — rough running and fast wear.`]);
  else if (zs < 12) out.push(['warn', `${zs}T is small: ${f(rip, 1)} % chordal speed ripple. 12+ teeth run smoother, 17+ for faster drives.`]);
  else if (zs < 17) out.push(['info', `Chordal speed ripple ${f(rip, 1)} % on the ${zs}T sprocket — fine for slow drives, use 17+ teeth for fast ones.`]);
  if (deg(th) < 120) out.push(['warn', `Wrap on the small sprocket is only ${f(deg(th), 0)}° — keep it above 120° (longer C2C or a smaller ratio).`]);
  if (mesh < 3) out.push(['bad', `Only ${f(mesh, 1)} teeth in mesh on the small sprocket.`]);
  if (Math.max(z1, z2) / zs > 7) out.push(['warn', `Ratio ${f(Math.max(z1, z2) / zs, 2)} : 1 is steep for one stage — above ~7 : 1 use two stages.`]);
  const cp = g.C / ch.p;
  if (cp < 20) out.push(['info', `C2C is ${f(cp, 1)} pitches — 30 to 50 pitches is the usual sweet spot for chain life.`]);
  else if (cp > 80) out.push(['info', `Long drive (${f(cp, 0)} pitches) — support the slack span or add a tensioner.`]);
  if (g.gap < 2) out.push(['info', `Sprocket tips are only ${len(g.gap, 2)} apart.`]);
  if (ch.fam === 'moto' || ch.fam === 'bike') out.push(['info', `${ch.label} dimensions are typical maker values — check your chain's data sheet for plate and pin sizes.`]);
  return out;
}
function chainKV(ch, z1, z2, g, L) {
  return kvGrid([
    ['Pitch Ø S1', `${len(g.pd1, 3)}`, fl(g.pd1, 3)],
    ['Pitch Ø S2', `${len(g.pd2, 3)}`, fl(g.pd2, 3)],
    ['Outside Ø S1', `${len(g.od1, 2)}`, fl(g.od1, 2)],
    ['Outside Ø S2', `${len(g.od2, 2)}`, fl(g.od2, 2)],
    ['Chain', `${L} links · ${len(L * ch.p, 1)}`, L],
    ['Ratio', `1 : ${f(z2 / z1, 3)}`, f(z2 / z1, 4)],
    ['Wrap S1', `${f(deg(g.th1), 1)}° · ${f(g.mesh1, 1)} teeth`, null],
    ['Wrap S2', `${f(deg(g.th2), 1)}° · ${f(g.mesh2, 1)} teeth`, null],
    ['Free span', `${len(g.span, 2)}`, fl(g.span, 2)],
    ['Tip clearance', `${len(g.gap, 2)}`, fl(g.gap, 2)],
  ]);
}
function renderKA() {
  kWrite();
  const ch = kch(), p = ch.p, z1 = K.z1, z2 = K.z2, raw = +K.lenRaw, allow = +K.allow || 0;
  const res = $('ka-results'), svg = $('ka-svg'), meta = $('ka-viz-meta'), hint = $('ka-len-hint');
  if (!kZOK(z1) || !kZOK(z2) || !(raw > 0)) {
    hint.textContent = ''; meta.textContent = '';
    res.innerHTML = resetNumbers(res) + errorBlock('Missing input', 'Enter sprocket teeth (6 – 250) and a chain length.');
    drawChainLayout(svg, null); return;
  }
  const info = [], L = kLinks();
  if (K.unit === 'links' && L !== raw) info.push(['info', `Chains have a whole number of links — using ${L}.`]);
  if (K.unit === 'mm' && Math.abs(raw / p - L) > 1e-6) info.push(['info', `${len(raw, 2)} isn't a multiple of the ${lenR(p)} pitch — using the nearest real chain, ${L} links = ${len(L * p, 2)}.`]);
  rollTo(hint, K.unit === 'links' ? `= ${len(L * p, 2)} · ${ch.label} × ${L} links` : `= ${L} links · ${ch.label}`);
  const s1 = sprocketOutline(ch, z1, 0), s2 = sprocketOutline(ch, z2, 0);
  if (s1.error || s2.error) { meta.textContent = ''; res.innerHTML = resetNumbers(res) + errorBlock("Can't make this sprocket", s1.error || s2.error); drawChainLayout(svg, null); return; }
  const C = chainCenter(ch, z1, z2, L), g = Number.isFinite(C) ? chainAnalyze(ch, z1, z2, C) : null;
  rollTo(meta, `${ch.label} · ${L} links (${len(L * p, 1)}) · ${z1}T / ${z2}T`);
  if (!g || !g.valid || !(g.gap > 0)) {
    const m = minLinksFor(ch, z1, z2);
    res.innerHTML = resetNumbers(res) + errorBlock('Chain too short',
      `${L} links of ${ch.label} chain can't go around ${z1}T + ${z2}T sprockets without them colliding. Shortest chain that clears: <b>${m} links</b>${m % 2 ? ` (${m + 1} for an even count)` : ''}.`) + notesHTML(info);
    drawChainLayout(svg, g && g.valid ? { ch, z1, z2, L, C, labelC: C, g } : null);
    return;
  }
  const Cd = C + allow, notes = [...info, ...chainChecks(ch, z1, z2, g, L)];
  if (!notes.some(n => n[0] === 'warn' || n[0] === 'bad')) notes.push(['ok', 'Geometry looks good.']);
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Center-to-center distance${allow ? ' (incl. allowance)' : ''}</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(Cd)}" data-d="${dU(3)}">${fl(Cd, 3)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">${alt(Cd)} · ${f(C / p, 2)} pitches${allow ? ` · nominal ${fl(C, 3)} ${sgnL(allow, 2)}` : ''}</div>
      <button type="button" class="btn sm copy" data-copy="${fl(Cd, 3)}">Copy</button>
    </div>
    ${chainKV(ch, z1, z2, g, L)}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  animateHero(res);
  drawChainLayout(svg, { ch, z1, z2, L, C, labelC: C, g });
}

/* ---- Chain length tab ---- */
function renderKB(keepSel) {
  kWrite();
  const ch = kch(), p = ch.p, z1 = K.z1, z2 = K.z2, Ct = +K.target;
  const res = $('kb-results'), svg = $('kb-svg'), meta = $('kb-viz-meta');
  const fail = (t, m) => { res.innerHTML = resetNumbers(res) + errorBlock(t, m); meta.textContent = ''; drawChainLayout(svg, null); };
  if (!kZOK(z1) || !kZOK(z2) || !(Ct > 0)) { $('kb-c-hint').textContent = ''; return fail('Missing input', 'Enter sprocket teeth (6 – 250) and a target C2C.'); }
  const s1 = sprocketOutline(ch, z1, 0), s2 = sprocketOutline(ch, z2, 0);
  if (s1.error || s2.error) return fail("Can't make this sprocket", s1.error || s2.error);
  const Cmin = (s1.od + s2.od) / 2 + 0.5;
  rollTo($('kb-c-hint'), `= ${f(Ct / p, 2)} pitches · sprockets need ≥ ${len(Cmin, 1)}`);
  if (Ct < Cmin) return fail('Sprockets collide', `At ${len(Ct, 2)} the sprocket teeth overlap — use at least ${len(Cmin, 1)} C2C.`);
  const Lx = chainLinksAt(ch, z1, z2, Ct), Lmin = minLinksFor(ch, z1, z2), rows = [];
  for (let L = Math.max(Lmin, 2, Math.floor(Lx) - 3); L <= Math.ceil(Lx) + 3; L++) {
    const C = chainCenter(ch, z1, z2, L);
    if (Number.isFinite(C) && chainAnalyze(ch, z1, z2, C).gap > 0) rows.push({ L, C, dC: C - Ct, even: L % 2 === 0 });
  }
  if (!rows.length) return fail('No chain fits', 'Try a larger C2C.');
  const evens = rows.filter(r => r.even), best = (evens.length ? evens : rows).reduce((a, r) => (!a || Math.abs(r.dC) < Math.abs(a.dC) ? r : a), null);
  if (!keepSel || !rows.some(r => r.L === K.selL)) K.selL = best.L;
  const sel = rows.find(r => r.L === K.selL), g = chainAnalyze(ch, z1, z2, sel.C);
  const exact = Math.abs(Lx - Math.round(Lx)) < 1e-6;
  const notes = [];
  if (Math.abs(sel.dC) >= 0.005) {
    notes.push(['info', sel.dC < 0
      ? `This chain is shorter than ideal: set the sprockets <b>${len(-sel.dC, 2)} closer</b> (C2C ${len(sel.C, 3)}), otherwise it's too tight to fit.`
      : `This chain is longer than ideal: increase the C2C by <b>${len(sel.dC, 2)}</b> to ${len(sel.C, 3)}, or take up the slack with a tensioner / idler.`]);
  }
  notes.push(...chainChecks(ch, z1, z2, g, sel.L));
  if (!notes.some(n => n[0] === 'warn' || n[0] === 'bad')) notes.push(['ok', 'Geometry looks good.']);
  const row = r => `<tr data-kl="${r.L}"${r.L === K.selL ? ' class="sel"' : ''} tabindex="0">
      <td>${r.L} links${r === best ? '<span class="tag best">closest even</span>' : r.even ? '' : '<span class="tag">offset link</span>'}</td>
      <td data-k="l${r.L}">${fl(r.L * p, 1)}</td><td data-k="c${r.L}">${fl(r.C, 3)}</td><td data-k="d${r.L}">${sgn(toU(r.dC), dU(3))}</td></tr>`;
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Ideal chain @ ${len(Ct, 2)} C2C</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${Lx}" data-d="2">${f(Lx, 2)}</span><small>links</small></div>
      <div class="hero-sub" data-k="sub">${len(Lx * p, 1)} · ${exact ? 'whole link count — exact fit' : 'not a whole number of links → pick a chain below'}</div>
    </div>
    <div class="pick">
      <div>
        <div class="pick-label">Selected chain</div>
        <div class="pick-main"><span data-k="pick">${sel.L} links · ${len(sel.L * p, 1)}</span><span class="part">${ch.label} × ${sel.L}</span></div>
        <div class="pick-sub" data-k="pick-sub">C2C ${len(sel.C, 3)} · ${alt(sel.C)} · ${sgnL(sel.dC)} vs target</div>
      </div>
      <div class="pick-actions">
        <button type="button" class="btn" data-copy="${fl(sel.C, 3)}">Copy C2C</button>
        <button type="button" class="btn primary" data-ksend="${sel.L}">Open in C2C →</button>
      </div>
    </div>
    <div>
      <div class="sub-h">Whole-link chains <small>click a row to preview</small></div>
      <div class="tbl"><table class="opts"><thead><tr><th>Chain</th><th data-k="th1">Length ${U()}</th><th data-k="th2">C2C ${U()}</th><th data-k="th3">Δ ${U()}</th></tr></thead>
      <tbody>${rows.map(row).join('')}</tbody></table></div>
    </div>
    ${chainKV(ch, z1, z2, g, sel.L)}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  animateHero(res);
  rollTo(meta, `${ch.label} · ${sel.L} links (${len(sel.L * p, 1)}) · ${z1}T / ${z2}T`);
  drawChainLayout(svg, { ch, z1, z2, L: sel.L, C: sel.C, labelC: sel.C, g });
}

/* ---- animated layout: sprockets turn, every link moves (shares the belt layouts' animation loop) ---- */
const sprBodyCache = new Map();
function sprocketBody(ch, z, j) {
  const st = sprSettings(j), key = `${ch.key}|${z}|${st.bore}|${st.boreSize}|${st.boreFlat}|${st.holes ? Object.values(st.holes).join(',') : ''}`;
  if (sprBodyCache.has(key)) return sprBodyCache.get(key);
  const ol = sprocketOutline(ch, z, 0);
  if (ol.error) return '';
  const rootR = ol.rootD / 2;
  const pp = holesOK(st.holes) && (st.bore === 'none' || st.boreSize > 0) ? sprocketParts(ch, z, { ...st, fit: 0 }) : { error: 1 };
  let bore = pp.error ? borePoly(st.bore, st.boreSize, st.boreFlat) : pp.bore;
  if (bore && bore.bad) bore = null;
  if (st.bore !== 'none' && (!bore || bore.ext > rootR - MIN_WALL)) { const rr = Math.max(rootR * 0.12, 0.6); bore = { kind: 'round', r: rr, ext: rr }; }
  const holes = pp.error ? [] : pp.holes, hub = Math.min(rootR * 0.75, Math.max((bore ? bore.ext : 0) * 1.7, rootR * 0.4));
  const html = `<path d="${polyPath(ol.verts, Q3)} ${borePath(bore)} ${holes.map(h => circlePath(h.r, h.c[0], -h.c[1])).join(' ')}" class="p-body" fill-rule="evenodd" ${NS} stroke-width="1"/>`
    + (holes.length ? '' : `<circle r="${Q3(hub)}" class="p-hub" ${NS} stroke-width="1"/>`)
    + `<line x1="0" y1="${Q3(-hub)}" x2="0" y2="${Q3(-rootR * 0.9)}" class="p-mark" ${NS} stroke-width="2"/>`;
  if (sprBodyCache.size > 60) sprBodyCache.clear();
  sprBodyCache.set(key, html);
  return html;
}
function chainFitView(svg, C, e1, e2) {
  const rmax = Math.max(e1, e2), cw = svg.clientWidth || 800, chh = svg.clientHeight || 320;
  const scale = Math.max(1e-6, Math.min((cw - 40) / (C + e1 + e2), (chh - 80) / (2 * rmax)));
  const fs = 12.5 / scale;
  const padL = Math.max(fs * 1.2, fs * 5.8 - e1), padR = Math.max(fs * 1.2, fs * 5.8 - e2);
  const x0 = -e1 - padL, y0 = -rmax - fs * 2.3;
  return [x0, y0, C + e2 + padR - x0, rmax + fs * 3.9 - y0];
}
function drawChainLayout(svg, o) {
  svg._last = o;
  if (!o) {
    svg._sc = null;
    svg.setAttribute('viewBox', '0 0 400 120');
    svg.innerHTML = '<text x="200" y="64" text-anchor="middle" font-size="12" class="empty">No valid layout for these inputs</text>';
    return;
  }
  const { ch, z1, z2, L, C, labelC } = o, p = ch.p;
  const R1 = sprR(p, z1), R2 = sprR(p, z2);
  const e1 = Math.max(sprocketOutline(ch, z1, 0).od / 2, R1 + ch.hI / 2), e2 = Math.max(sprocketOutline(ch, z2, 0).od / 2, R2 + ch.hI / 2);
  const tgt = { ch, z1, z2, L, C, labelC, R1, R2, e1, e2, pd1: 2 * R1, pd2: 2 * R2 };
  const sc = svg._sc || (svg._sc = { chain: true, s: 0, psi: [NaN, NaN] });
  const prev = sc.tgt;
  const changed = !prev || prev.ch !== ch || prev.z1 !== z1 || prev.z2 !== z2 || prev.L !== L
    || Math.abs(prev.C - C) > 1e-9 || Math.abs(prev.labelC - labelC) > 1e-9;
  const visible = svg.clientWidth > 0 && !svg.closest('.panel').hidden && PAGE === 'chain';
  sc.tgt = tgt;
  sc.tgtVb = chainFitView(svg, C, e1, e2);
  sc.v = Math.min(z1, z2) * 0.3;                    // pitches per second at 1×: small sprocket ≈ 0.3 rev/s
  if (!changed && sc.tween) return;
  if (changed && prev && sc.cur && visible && !reduceMotion) {     // also across chain types
    sc.from = { ...sc.cur, vb: sc.cur.vb.slice() };
    sc.t0 = performance.now();
    sc.tween = true;
    ensureLoop();
    return;
  }
  sc.tween = false;
  sc.cur = { C, R1, R2, labelC, vb: sc.tgtVb };
  chainSceneBuild(svg);
  chainSceneTick(svg);
}
function chainSceneBuild(svg) {
  const sc = svg._sc, t = sc.tgt, c = sc.cur, ch = t.ch, p = ch.p, [x0, y0, w, h] = c.vb;
  svg.setAttribute('viewBox', `${Q3(x0)} ${Q3(y0)} ${Q3(w)} ${Q3(h)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const scale = Math.min((svg.clientWidth || 800) / w, (svg.clientHeight || 320) / h), fs = 12.5 / scale;
  const { C, R1, R2 } = c, k1 = R1 / t.R1, k2 = R2 / t.R2, ext1 = t.e1 * k1, ext2 = t.e2 * k2, rmax = Math.max(ext1, ext2);
  const real = p * scale >= 3.2;                      // real links once a pitch is ≥ 3.2 px on screen
  const spr = (x, k, z, j) => `<g transform="translate(${Q3(x)} 0)"><g class="spin"><g transform="scale(${k.toFixed(5)})">${sprocketBody(ch, z, j)}</g></g></g>`;
  const overlay = (x, r, ext) => {
    const q = Q3(ext + fs * 0.5);
    return `<g transform="translate(${Q3(x)} 0)"><circle r="${Q3(r)}" class="p-pitch" ${NS} stroke-width="1"/>`
      + `<line x1="${-q}" x2="${q}" y1="0" y2="0" class="cross" ${NS} stroke-width="1"/><line y1="${-q}" y2="${q}" x1="0" x2="0" class="cross" ${NS} stroke-width="1"/></g>`;
  };
  const label = (x, ext, z, pd, j) =>
    `<text x="${Q3(x)}" y="${Q3(-ext - fs * 0.9)}" text-anchor="middle" font-size="${Q3(fs)}"><tspan class="pl">S${j + 1}</tspan> · <tspan class="lt">${z}T</tspan> · Ø${fl(pd, 2)}</text>`;
  const dy = rmax + fs * 1.6, a = fs * 0.6;
  const dims = `<line x1="0" x2="0" y1="${Q3(ext1 + fs * 0.3)}" y2="${Q3(dy + fs * 0.5)}" class="ext" ${NS} stroke-width="1"/>`
    + `<line x1="${Q3(C)}" x2="${Q3(C)}" y1="${Q3(ext2 + fs * 0.3)}" y2="${Q3(dy + fs * 0.5)}" class="ext" ${NS} stroke-width="1"/>`
    + `<line x1="${Q3(a)}" x2="${Q3(C - a)}" y1="${Q3(dy)}" y2="${Q3(dy)}" class="dim" ${NS} stroke-width="1.2"/>`
    + `<path d="M0,${Q3(dy)} l${Q3(a)},${Q3(-a * 0.38)} v${Q3(a * 0.76)} Z" class="arrow"/>`
    + `<path d="M${Q3(C)},${Q3(dy)} l${Q3(-a)},${Q3(-a * 0.38)} v${Q3(a * 0.76)} Z" class="arrow"/>`
    + `<text x="${Q3(C / 2)}" y="${Q3(dy + fs * 1.45)}" text-anchor="middle" font-size="${Q3(fs)}" class="dimt">C2C ${len(c.labelC, 3)}</text>`;
  let G = sc.layers;
  if (!G || !svg.contains(G.spr)) {
    svg.innerHTML = '<g class="k-spr"></g><g class="k-chain"></g><g class="k-over"></g>';
    G = sc.layers = { spr: svg.children[0], chain: svg.children[1], over: svg.children[2] };
    sc.chainKey = null;
  }
  G.spr.innerHTML = spr(0, k1, t.z1, 0) + spr(C, k2, t.z2, 1);
  G.over.innerHTML = overlay(0, R1, ext1) + overlay(C, R2, ext2) + label(0, ext1, t.z1, t.pd1, 0) + label(C, ext2, t.z2, t.pd2, 1) + dims;
  if (real) {
    const key = `${ch.key}|${t.L}`;
    if (sc.chainKey !== key) {                       // every link is its own group: plain DOM, styled the same in every browser
      const dB = bushD(ch), path = (v, cls) => `<path d="${polyPath(v, Q3)}" class="${cls}" ${NS} stroke-width="1"/>`;
      const dot = (x, r, cls) => `<circle cx="${Q3(x)}" r="${Q3(r)}" class="${cls}"${cls === 'k-bush' ? ` ${NS} stroke-width="1"` : ''}/>`;
      const PI = path(plateLoop(p, ch.hI), 'k-in') + dot(0, dB / 2, 'k-bush') + dot(p, dB / 2, 'k-bush');
      const PO = path(plateLoop(p, ch.hO), 'k-out') + dot(0, ch.d2 / 2, 'k-pin') + dot(p, ch.d2 / 2, 'k-pin');
      const XI = path(plateLoop(p, ch.hI, offsetCut(ch, 'L')), 'k-in') + dot(0, dB / 2, 'k-bush');
      const XO = path(plateLoop(p, ch.hO, offsetCut(ch, 'R')), 'k-out') + dot(p, ch.d2 / 2, 'k-pin');
      const inner = [], outer = [], odd = t.L % 2;
      for (let k = 0; k < t.L; k++) {
        if (odd && k === t.L - 1) { inner.push(`<g data-l="${k}">${XI}</g>`); outer.push(`<g data-l="${k}">${XO}</g>`); }
        else (k % 2 ? outer : inner).push(`<g data-l="${k}">${k % 2 ? PO : PI}</g>`);
      }
      G.chain.innerHTML = `<g class="k-lin">${inner.join('')}</g><g class="k-lout">${outer.join('')}</g>`;
      sc.chainKey = key;
    }
  } else {
    const cp = chainPath(ch, t.z1, t.z2, C, R1, R2), d = polyPath(loopVerts(cp.bp, 0), Q3), bw = Math.max(ch.hI, 3 / scale);
    G.chain.innerHTML = `<path d="${d}" class="k-band" stroke-width="${Q3(bw)}"/>`
      + `<path d="${d}" class="k-dots" stroke-width="${Q3(Math.max(ch.d2, 1.3 / scale))}" pathLength="${Q3(t.L)}" stroke-dasharray="0.01 0.99" stroke-linecap="round"/>`;
    sc.chainKey = null;
  }
  sc.real = real;
  sc.els = { spin: G.spr.querySelectorAll('.spin'), links: [...G.chain.querySelectorAll('g[data-l]')].map(g => ({ el: g, k: +g.dataset.l })), dots: G.chain.querySelector('.k-dots') };
}
/* per frame: pins slide along the pitch path (one pitch apart); each sprocket keeps turning with the chain
   (one tooth per pitch) and snaps to the nearest angle where its gaps sit under the pins — continuous, like the pulleys */
function chainSceneTick(svg, ds) {
  const sc = svg._sc;
  if (!sc || !sc.els) return;
  const t = sc.tgt, c = sc.cur, cp = chainPath(t.ch, t.z1, t.z2, c.C, c.R1, c.R2);
  // wrap over the whole loop, not one pitch: links alternate inner / outer, so a per-pitch wrap
  // would shift every link onto its neighbour's pin and swap the two plate layers once per pitch
  const du = cp.U / t.L, sOff = ((sc.s % cp.U) + cp.U) % cp.U;
  if (sc.real) {
    const pins = new Array(t.L);
    for (let k = 0; k < t.L; k++) pins[k] = chainAt(cp, sOff + k * du).p;
    for (const { el, k } of sc.els.links) {
      const a = pins[k], b = pins[(k + 1) % t.L];
      el.setAttribute('transform', `translate(${Q3(a[0])} ${Q3(-a[1])}) rotate(${Q3(-deg(Math.atan2(b[1] - a[1], b[0] - a[0])))})`);
    }
  } else if (sc.els.dots) sc.els.dots.setAttribute('stroke-dashoffset', Q3(-sOff / du));
  if (!sc.psi) sc.psi = [NaN, NaN];
  [1, 2].forEach(j => {
    const z = j === 1 ? t.z1 : t.z2, step = 2 * Math.PI / z, A = chainPhase(cp, sOff, du, j);
    const prev = sc.psi[j - 1], pred = Number.isFinite(prev) ? prev + (ds || 0) * step : A;
    sc.psi[j - 1] = A + step * Math.round((pred - A) / step);
    const el = sc.els.spin[j - 1];
    if (el) el.setAttribute('transform', `rotate(${Q3(-deg(sc.psi[j - 1]) % 360)})`);
  });
}
const redrawChains = () => ['ka-svg', 'kb-svg'].forEach(id => { const s = $(id); if (s._last) { if (s._sc) s._sc.tween = false; drawChainLayout(s, s._last); } });

/* ---- export menu on the chain layouts ---- */
const ICON_CUBE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.2 17 6v8l-7 3.8L3 14V6z"/><path d="M3 6l7 3.8L17 6M10 9.8v8"/></svg>';
function kmenuHTML(src) {
  const item = (what, icon, title, sub) =>
    `<button type="button" role="menuitem" data-kexport="${what}" data-src="${src}"><span class="mi">${icon}</span><span><b>${title}</b><small>${sub}</small></span></button>`;
  return `<button type="button" class="btn sm icon" data-menu-btn aria-haspopup="menu" aria-expanded="false">${ICON_DL}Export${CHEV}</button>`
    + '<div class="menu-pop" role="menu" hidden>'
    + item('step-asm', ICON_CUBE, 'Assembly · STEP', '3D sprockets + chain, meshed — one file')
    + item('step-chain', ICON_CUBE, 'Chain loop · STEP', '3D chain at this C2C, every link a solid')
    + item('assembly', ICON_ASM, 'Assembly · DXF', 'Sprockets + chain side view, meshed')
    + item('chain', ICON_BELT, 'Chain only · DXF', 'Side view of the chain loop')
    + item('sprockets', ICON_PUL, 'Sprockets only · DXF', 'Both sprockets placed at this C2C')
    + '<p class="menu-note">Bores, holes and pitch circles follow the Sprocket DXF tab; strands follow the Chain DXF & STEP tab.</p></div>';
}
const kName = (o, what) => `${what}_${chainTag(o.ch)}${K.strands > 1 ? `-${K.strands}` : ''}_${o.z1}T-${o.z2}T_${o.L}L_C${o.labelC.toFixed(2)}`;
function chainStepText(o, withSpr) {
  if (o.L > 600) return { error: 'STEP export is limited to 600 links (the file would get very large).' };
  const ex = chainLoopExact(o.ch, o.z1, o.z2, o.labelC, o.L);
  if (!ex) return { error: "The chain doesn't fit around the sprockets at this C2C." };
  const bodies = chainBodies(o.ch, ex.pins, true, K.strands);
  if (withSpr) {
    for (let j = 0; j < 2; j++) {
      const sb = sprocketBodies(o.ch, j ? o.z2 : o.z1, sprSettings(j), K.strands, j ? o.labelC : 0, ex.psi[j] - Math.PI / 2, `Sprocket ${j + 1} ${j ? o.z2 : o.z1}T`);
      if (sb.error) return { error: `Sprocket ${j + 1}: ${sb.error}` };
      bodies.push(...sb.bodies);
    }
  }
  return { text: stepFile(`${o.ch.code} chain ${o.L} links`, bodies), n: bodies.length };
}
function exportChain(src, what) {
  const o = $(src)._last;
  if (!o || !(o.g && o.g.gap > 0)) { toast('No valid layout to export.'); return; }
  if (what === 'step-asm' || what === 'step-chain') {
    const r = chainStepText(o, what === 'step-asm');
    if (r.error) { toast(r.error); return; }
    const name = `${kName(o, what === 'step-asm' ? 'assembly' : 'chain')}.stp`;
    download(name, r.text, 'model/step');
    toast(`Saved ${name} · ${r.n} solids`);
    return;
  }
  const doc = chainLayoutDoc(o.ch, o.z1, o.z2, o.labelC, o.L, [sprSettings(0), sprSettings(1)], what);
  if (doc.error) { toast(doc.error); return; }
  const name = `${kName(o, what)}.dxf`;
  download(name, toDXF(doc.ents));
  toast(`Saved ${name}`);
}

/* ---- Sprocket DXF tab: each sprocket keeps its own bore / holes / fit ---- */
const sprNew = z => ({ z, borePre: 'custom', bore: 'round', size: 5, flat: 5.5, clear: 0, holePre: 'none', hn: 4, hd: 4.3, hp: 22.627, hr: 45, fit: 0, pitch: false });
const KS = { cur: 0, link: true, doc: null, s: [sprNew(15), sprNew(30)] };
function ksPull() { if (KS.link) { KS.s[0].z = K.z1; KS.s[1].z = K.z2; } }
function sprSettings(j) {
  ksPull();
  const s = KS.s[j], cl = +s.clear || 0;
  return {
    z: Math.round(+s.z), bore: s.borePre === 'none' ? 'none' : s.bore, borePre: s.borePre, holePre: s.holePre,
    boreNom: +s.size, boreSize: +s.size + 2 * cl, boreFlat: +s.flat + 2 * cl, clear: cl,
    holes: s.holePre === 'none' ? null : { n: Math.round(+s.hn), d: +s.hd, pcd: +s.hp, rot: +s.hr || 0 }, fit: +s.fit || 0, pitch: !!s.pitch,
  };
}
function ksWrite() {
  const s = KS.s[KS.cur];
  document.querySelectorAll('#page-chain [data-ks]').forEach(el => {
    if (el.type === 'checkbox') el.checked = !!s[el.dataset.ks];
    else setIdle(el.id, s[el.dataset.ks]);
  });
  $('ks-bore-type').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kbore === s.bore)));
  setType($('ks-bore-preset'), s.borePre);
  setType($('ks-hole-preset'), s.holePre);
  $('ks-which').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.kwhich === KS.cur)));
  $('ks-link').checked = KS.link;
}
function kSprName(ch, z, st) {
  const pre = { none: '', rev: '_rev5hex', rex: '_rex8', gbd: '_gbD6', b14: '_brg14' }[st.borePre];
  const b = pre !== undefined ? pre : `_${{ round: 'd', hex: 'hex', square: 'sq', rex: 'rex', d: 'D', dd: 'DD' }[st.bore]}${+st.boreNom.toFixed(3)}`;
  const H = st.holes, hh = !H ? '' : st.holePre === 'custom' ? `_${H.n}x${+H.d.toFixed(2)}on${+H.pcd.toFixed(2)}` : '_gb16';
  return `sprocket_${chainTag(ch)}_${z}T${b}${hh}`;
}
function sprocketDoc(ch, st) {
  const part = sprocketParts(ch, st.z, st);
  if (part.error) return part;
  const ents = [{ type: 'poly', layer: 'SPROCKET', verts: part.verts, bound: [0, 0, part.od / 2] }];
  if (part.bore && part.bore.kind === 'round') ents.push({ type: 'circle', layer: 'BORE', c: [0, 0], r: part.bore.r });
  else if (part.bore) ents.push({ type: 'poly', layer: 'BORE', verts: part.bore.verts });
  addHoles(ents, part.holes, 0, 0);
  if (st.pitch) ents.push({ type: 'circle', layer: 'PITCH', c: [0, 0], r: part.pd / 2 });
  return { part, ents };
}
function bothSprocketsDoc() {
  const ch = kch(), out = [], th = Math.max(2, ch.p * 0.5);
  let x = 0;
  for (let j = 0; j < 2; j++) {
    const st = sprSettings(j);
    if (!kZOK(st.z)) return { error: `Sprocket ${j + 1}: enter 6 – 250 teeth.` };
    if (!holesOK(st.holes) || (st.bore !== 'none' && !(st.boreSize > 0))) return { error: `Sprocket ${j + 1}: check the bore and hole fields.` };
    const d = sprocketDoc(ch, st);
    if (d.error) return { error: `Sprocket ${j + 1}: ${d.error}` };
    const e = d.ents.map(en => en.layer === 'SPROCKET' ? { ...en, layer: `SPROCKET_${j + 1}` } : en);
    const b = extentsOf(e), dx = x - b[0];
    out.push({ type: 'text', layer: 'TEXT', p: [x, b[3] + th * 0.8], h: th, s: `SPROCKET ${j + 1}  ${st.z}T ${ch.code}` }, ...shiftEnts(e, dx, 0));
    x = b[2] + dx + Math.max(8, ch.p * 2);
  }
  return { ents: out, name: `sprockets_${chainTag(ch)}_${sprSettings(0).z}T_${sprSettings(1).z}T.dxf` };
}
function renderKS() {
  ksPull(); ksWrite();
  const ch = kch(), j = KS.cur, s = KS.s[j], st = sprSettings(j), z = st.z, res = $('ks-results');
  $('ks-bore-cfg').hidden = s.borePre === 'none';
  $('ks-bore-type').hidden = s.borePre !== 'custom';
  $('ks-hole-cfg').hidden = s.holePre === 'none';
  rollTo($('ks-bore-u'), ({ round: 'Ø mm', square: 'side mm', d: 'Ø mm', dd: 'Ø mm' }[s.bore] || 'AF mm').replace('mm', U()));
  $('ks-flat-wrap').hidden = !(s.bore === 'd' || s.bore === 'dd');
  rollTo($('ks-flat-u'), `${s.bore === 'dd' ? 'flat to flat' : 'flat to far side'}, ${U()}`);
  $('ks-bore-hint').textContent = BORE_HINT[s.borePre] || '';
  $('ks-hole-hint').textContent = s.holePre === 'custom'
    ? 'Holes are spaced evenly on the bolt circle; rotation 0° puts the first hole on +X.'
    : 'goBILDA 16 mm pattern = 4 holes on a 16 mm square (Ø22.63 bolt circle). Ø4.3 clears M4; use Ø3.3 to tap M4.';
  $('ks-which').querySelectorAll('button').forEach(b => {
    const k = +b.dataset.kwhich, n = Math.round(+KS.s[k].z);
    rollTo(b, `S${k + 1} · ${k ? 'right' : 'left'}${Number.isFinite(n) ? ` · ${n}T` : ''}`);
  });
  KS.doc = null;
  const fail = (t, m) => { res.innerHTML = resetNumbers(res) + errorBlock(t, m); drawSprocketPreview(null); };
  if (!kZOK(z)) return fail('Missing input', 'Enter between 6 and 250 teeth.');
  if (st.bore !== 'none' && !(st.boreSize > 0)) return fail('Missing input', 'Enter a bore size, or pick “No bore”.');
  if (!holesOK(st.holes)) return fail('Missing input', 'Check the mounting-hole fields (1–24 holes, size and bolt circle).');
  const doc = sprocketDoc(ch, st);
  if (doc.error) return fail("Can't build this sprocket", doc.error);
  const part = doc.part, name = kSprName(ch, z, st);
  KS.doc = { ...doc, ch, z, st, name };
  const [bl, bc] = boreLabel(st), layers = [...new Set(doc.ents.map(e => e.layer))].join(', ');
  const notes = [['info', 'ANSI standard tooth form (seating, working and topping curves): rollers enter and leave the gaps freely. Works for ANSI, ISO and moto / bike chains of the same pitch and roller.']];
  if (st.fit) notes.push(['info', `Seat fit offset ${sgnL(st.fit, 2)}: every tooth gap is ${len(Math.abs(st.fit), 2)} ${st.fit > 0 ? 'larger' : 'smaller'} all round.`]);
  if (z < 9) notes.push(['warn', `${z}T is below the 9-tooth minimum for roller chain.`]);
  if (part.pointed) notes.push(['info', 'Teeth would come to a point at the standard outside Ø, so the tips are trimmed to a short land.']);
  if (st.holes && s.holePre !== 'custom') notes.push(['info', `${s.holePre === 'sonic' ? 'Sonic Hub' : 'Servo hub'} pattern from goBILDA's 16 mm hub pattern. Check it against your hub before cutting metal.`]);
  if (st.clear) notes.push(['info', `Bore clearance ${sgnL(st.clear, 2)} per side — the bore is cut at ${len(st.boreSize, 3)}.`]);
  notes.push(['info', `3D / STEP: tooth width ${lenR(toothW(ch))} (ISO 606: ${ch.p <= 12.7 ? '0.93' : '0.95'} × inner width)${K.strands > 1 ? `, ${K.strands} tooth rows ${lenR(ch.pt)} apart` : ''}. Chamfer the tooth sides in CAD if you like.`]);
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Sprocket ${j + 1} · outside Ø · ${z}T ${ch.label}</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(part.od)}" data-d="${dU(3)}">${fl(part.od, 3)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">pitch Ø ${len(part.pd, 3)} · ${alt(part.od)} OD</div>
      <button type="button" class="btn sm copy" data-copy="${fl(part.od, 3)}">Copy</button>
    </div>
    <div class="dl">
      <button type="button" class="btn primary icon" data-ks-dxf>${ICON_DL}Download DXF</button>
      <button type="button" class="btn icon" data-ks-both>${ICON_PUL}Both sprockets</button>
      <button type="button" class="btn icon dl-step" data-ks-step>${ICON_CUBE}Download STEP</button>
      <span class="hint">${name}.dxf · R12 · mm · ${layers}</span>
    </div>
    ${kvGrid([
      ['Pitch Ø', `${len(part.pd, 3)}`, fl(part.pd, 3)],
      ['Outside Ø', `${len(part.od, 3)}`, fl(part.od, 3)],
      ['Root Ø', `${len(part.rootD, 3)}`, fl(part.rootD, 3)],
      [`Over pins Ø${rawL(ch.d1)}`, `${len(part.mop, 3)}`, fl(part.mop, 3), 'Over pins'],
      ['Seat radius', `${len(part.ri, 3)}`, fl(part.ri, 3)],
      ['Tooth width', `${lenR(toothW(ch))}`, rawL(toothW(ch))],
      ['Mount holes', st.holes ? `${st.holes.n} × Ø${rawL(+st.holes.d.toFixed(2))} on Ø${lenR(+st.holes.pcd.toFixed(2))}` : '—', st.holes ? rawL(+st.holes.pcd.toFixed(3)) : null],
      ['Bore', bl, bc],
    ])}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  animateHero(res);
  rollTo($('ks-viz-meta'), `${ch.label} · ${z}T · ${bl === 'none' ? 'no bore' : bl}${st.holes ? ` · ${st.holes.n} holes` : ''}`);
  drawSprocketPreview(KS.doc);
}
function drawSprocketPreview(doc) {
  const full = $('ks-svg-full'), zoom = $('ks-svg-zoom');
  if (!doc) {
    [full, zoom].forEach(s => { s.setAttribute('viewBox', '0 0 300 120'); s.innerHTML = '<text x="150" y="64" text-anchor="middle" font-size="12" class="empty">No profile</text>'; });
    $('ks-viz-meta').textContent = '';
    return;
  }
  const { part, ch, z } = doc, R = part.od / 2, pr = part.pd / 2;
  const outline = `${polyPath(part.verts)} ${borePath(part.bore)} ${(part.holes || []).map(h => circlePath(h.r, h.c[0], -h.c[1])).join(' ')}`;
  const pad = R * 0.12;
  full.setAttribute('viewBox', `${P(-R - pad)} ${P(-R - pad)} ${P(2 * R + 2 * pad)} ${P(2 * R + 2 * pad)}`);
  full.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const cr = R * 0.18;
  full.innerHTML = '<g class="pv-spin">'
    + `<path d="${outline}" class="pv-part" ${NS} stroke-width="1"/>`
    + `<circle r="${P(pr)}" class="pv-pitch" ${NS} stroke-width="1"/>`
    + `<line x1="${P(-cr)}" x2="${P(cr)}" y1="0" y2="0" class="pv-c" ${NS} stroke-width="1"/><line y1="${P(-cr)}" y2="${P(cr)}" x1="0" x2="0" class="pv-c" ${NS} stroke-width="1"/></g>`;
  // three gaps around the top with rollers and two links seated
  const w = ch.p * 3.2, h = w * 0.66, cy = -(pr + ch.p * 0.15);
  zoom.setAttribute('viewBox', `${P(-w / 2)} ${P(cy - h / 2)} ${P(w)} ${P(h)}`);
  zoom.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const step = 2 * Math.PI / z, rolls = [-1, 0, 1].map(k => [pr * Math.cos(Math.PI / 2 + k * step), pr * Math.sin(Math.PI / 2 + k * step)]);
  const fz = w * 0.04, lx = w / 2 - fz * 0.8, ly = cy - h / 2 + fz * 2.4;
  zoom.innerHTML = `<path d="${outline}" class="pv-part" ${NS} stroke-width="1.25"/>`
    + `<circle r="${P(pr)}" class="pv-pitch" ${NS} stroke-width="1"/>`
    + `<circle r="${P(R)}" class="pv-od" ${NS} stroke-width="1"/>`
    + rolls.map(([x, y]) => `<circle cx="${P(x)}" cy="${P(-y)}" r="${P(ch.d1 / 2)}" class="ks-roller" ${NS} stroke-width="1"/><circle cx="${P(x)}" cy="${P(-y)}" r="${P(ch.d2 / 2)}" class="ks-pin"/>`).join('')
    + `<text x="${P(lx)}" y="${P(ly)}" text-anchor="end" font-size="${P(fz)}" class="pv-a">- - pitch Ø${fl(part.pd, 2)}</text>`
    + `<text x="${P(lx)}" y="${P(ly + fz * 1.5)}" text-anchor="end" font-size="${P(fz)}" class="pv-l">··· OD Ø${fl(part.od, 2)}</text>`;
}
function ksBoreToCustom() { const s = KS.s[KS.cur]; if (BORE_SET[s.borePre]) { s.borePre = 'custom'; setType($('ks-bore-preset'), 'custom'); } }
function ksHolesToCustom() { const s = KS.s[KS.cur]; if (s.holePre === 'sonic' || s.holePre === 'servo') { s.holePre = 'custom'; setType($('ks-hole-preset'), 'custom'); } }
function switchSprocket(j) {
  const changed = j !== KS.cur, old = Math.round(+KS.s[KS.cur].z);
  KS.cur = j;
  ksWrite();
  nudge($('ks-z'), Math.sign(Math.round(+KS.s[j].z) - old));
  if (changed && !reduceMotion) {
    const s = $('ks-svg-full');
    s.classList.remove('pv-swap'); void s.offsetWidth; s.classList.add('pv-swap');
    clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('pv-swap'), 900);
  }
  updateInds(); renderKS();
}

/* ---- Chain DXF & STEP tab ---- */
const KMODELS = [
  { v: 'piece', t: 'Straight chain', s: 'the links above, flat' },
  { v: 'loop', t: 'Loop at C2C', s: 'as in the layout' },
  { v: 'asm', t: 'Loop + sprockets', s: 'whole drive, meshed' },
];
const PREVIEW_LINKS = 30, PREVIEW_3D = 8;
function kcLayout() {                               // the layout the loop views use
  const d = kDrive(K.clink ? 'k-c2c' : K.calc);
  return d && Math.round(+K.n) === d.L ? d : null;
}
function renderKC() {
  const ch = kch(), p = ch.p;
  if (K.clink) { const L = kLinks(); if (Number.isFinite(L)) K.n = L; }
  setIdle('kc-n', K.n); setIdle('kc-seg', K.seg);
  const n = Math.round(+K.n), ms = maxStrands(ch);
  K.strands = Math.max(1, Math.min(K.strands, ms));
  $('kc-strands').querySelectorAll('button').forEach(b => { const v = +b.dataset.kstr; b.disabled = v > ms; b.setAttribute('aria-pressed', String(v === K.strands)); });
  rollTo($('kc-str-hint'), ms === 1 ? `${ch.label} comes as single strand only.` : `Transverse pitch ${lenR(ch.pt)}${K.strands > 1 ? ` · intermediate plates between the strands` : ''}.`);
  $('kc-link').checked = K.clink;
  $('kc-link-note').textContent = K.clink ? '· links sync with the Center distance tab' : '· links are independent of the layout';
  ['loop', 'side', 'top', 'plates', 'pitch'].forEach(v => { $(`kc-${v}`).checked = !!K.views[v]; });
  $('kc-segon').checked = K.segOn;
  $('kc-seg-wrap').hidden = !K.segOn;
  setType($('kc-model'), K.model);
  const lay = kcLayout(), res = $('kc-results');
  rollTo($('kc-loop-note'), lay ? `· ${lay.z1}T + ${lay.z2}T at ${len(lay.C, 2)}` : '· needs a matching layout');
  const designation = `${ch.label}${K.strands > 1 ? `-${K.strands}` : ''}`;
  rollTo($('kc-n-hint'), n > 0 ? `= ${len(n * p, 2)} · ${designation} × ${n} links${n % 2 ? ' · odd: offset link' : ''}` : '');
  K.doc = null;
  const fail = (t, m) => { res.innerHTML = resetNumbers(res) + errorBlock(t, m); $('kc-svg').innerHTML = ''; $('kc-3d').innerHTML = ''; rollTo($('kc-viz-meta'), ''); };
  if (!(n >= 2 && n <= 600)) return fail('Missing input', 'Enter between 2 and 600 links.');
  const piece = K.segOn ? Math.max(1, Math.min(n, Math.round(+K.seg) || 1)) : n;
  const views = { loop: K.views.loop && lay, side: K.views.side, top: K.views.top, plates: K.views.plates };
  let ex = null;
  if (views.loop) { ex = chainLoopExact(ch, lay.z1, lay.z2, lay.C, lay.L); if (!ex) views.loop = null; }
  if (!views.loop && !views.side && !views.top && !views.plates) {
    return fail('Nothing to export', K.views.loop ? 'The loop needs a matching layout — turn on another view.' : 'Turn on at least one view.');
  }
  const o = { loop: views.loop ? { pins: ex.pins, z1: lay.z1, z2: lay.z2, C: lay.C } : null, side: views.side, top: views.top, plates: views.plates, pitch: K.views.pitch, n: piece, strands: K.strands };
  const doc = chainDxfDoc(ch, o), tag = `${chainTag(ch)}${K.strands > 1 ? `-${K.strands}` : ''}`;
  K.doc = { ents: doc.ents, name: `chain_${tag}_${n}L${K.segOn ? `_${piece}L-piece` : ''}.dxf` };
  const Z = chainZ(ch, K.strands), dB = bushD(ch);
  const modelOK = K.model === 'piece' || !!lay;
  const stepName = K.model === 'piece' ? `chain_${tag}_${piece}L.stp` : `${K.model === 'asm' ? 'assembly' : 'chain'}_${tag}_${lay ? `${lay.z1}T-${lay.z2}T_` : ''}${n}L.stp`;
  const solids = K.model === 'piece' ? piece * (ch.bush ? 2 : 3) + piece * 2 * K.strands : n * ((ch.bush ? 2 : 3) * K.strands - (K.strands - 1)) + n * 2 * K.strands;
  const notes = [];
  if ($('kc-loop').checked && !lay) {
    notes.push(['info', K.clink ? 'The loop needs a valid layout on the Center distance tab.'
      : 'The loop needs the same link count as the layout — turn on “Follow the layout”, or set the links to match.']);
  }
  if (n % 2) notes.push(['warn', `${n} links is odd: the loop gets an offset (cranked) link, modelled as an inner-plate half and an outer-plate half.`]);
  if (!modelOK) notes.push(['info', 'The loop / assembly STEP needs a matching layout — the straight chain works any time.']);
  notes.push(['info', 'STEP: every plate, roller, bushing and pin is its own solid (exact B-rep, mm), so you can mate to the pins or hide parts. Opens in Fusion 360, Onshape, SolidWorks, FreeCAD …']);
  if (ch.fam === 'moto' || ch.fam === 'bike') notes.push(['info', `${ch.label} dimensions are typical maker values — check your chain's data sheet.`]);
  const L = n * p;
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Chain length</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(L)}" data-d="${dU(1)}">${fl(L, 1)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">${n} links × ${lenR(p)} · ${designation}</div>
      <button type="button" class="btn sm copy" data-copy="${fl(L, 2)}">Copy</button>
    </div>
    <div class="dl">
      <button type="button" class="btn primary icon" data-kc-dxf>${ICON_DL}Download DXF</button>
      <button type="button" class="btn icon dl-step" data-kc-step${modelOK ? '' : ' disabled'}>${ICON_CUBE}Download STEP</button>
      <span class="hint">${K.doc.name} · ${stepName} (~${solids} solids)</span>
    </div>
    ${kvGrid([
      ['Chain', designation, designation],
      ['Links', `${n}`, n],
      ['Pitch', `${lenR(p)}`, rawL(p)],
      ['Roller Ø', `${lenR(ch.d1)}${ch.bush ? ' (bushing)' : ''}`, rawL(ch.d1)],
      ['Inner width', `${lenR(ch.b1)}`, rawL(ch.b1)],
      ['Pin Ø', `${lenR(ch.d2)}`, rawL(ch.d2)],
      ['Plates (in / out)', `${rawL(ch.hI)} / ${rawL(ch.hO)} × ${rawL(ch.tI)}${ch.tO !== ch.tI ? ` / ${rawL(ch.tO)}` : ''} ${U()}`, null],
      ['Width over pins', `${len(Z.width, 2)}`, fl(Z.width, 2)],
      ['Bushing Ø', `${lenR(dB)}`, rawL(dB)],
      ['Transverse pitch', ch.pt ? `${lenR(ch.pt)}` : '—', ch.pt ? rawL(ch.pt) : null],
    ])}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  animateHero(res);
  const big = !K.segOn && n > PREVIEW_LINKS;
  drawKDoc($('kc-svg'), big ? chainDxfDoc(ch, { ...o, n: PREVIEW_LINKS }).ents : doc.ents);
  const n3 = Math.min(piece, PREVIEW_3D), pins3 = Array.from({ length: n3 + 1 }, (_, i) => [i * p, 0]);
  draw3D($('kc-3d'), chainBodies(ch, pins3, false, K.strands));
  rollTo($('kc-viz-meta'), `${designation} · ${n} links${big ? ` · straight views show ${PREVIEW_LINKS} links, the DXF has all` : ''}`);
}
/* DXF entities → SVG preview */
function drawKDoc(svg, ents) {
  const [x0, y0, x1, y1] = extentsOf(ents), w = x1 - x0, h = y1 - y0, pad = Math.max(w, h) * 0.02 + 1;
  svg.setAttribute('viewBox', `${Q3(x0 - pad)} ${Q3(-y1 - pad)} ${Q3(w + 2 * pad)} ${Q3(h + 2 * pad)}`);
  const of = (l, t) => ents.filter(e => e.layer === l && e.type === t);
  const polys = l => of(l, 'poly').map(e => polyPath(e.verts, Q3)).join(' ');
  const circs = l => of(l, 'circle').map(e => circlePath(e.r, e.c[0], -e.c[1])).join(' ');
  const lines = l => of(l, 'line').map(e => `M${Q3(e.a[0])} ${Q3(-e.a[1])}L${Q3(e.b[0])} ${Q3(-e.b[1])}`).join('');
  const each = (l, cls) => of(l, 'poly').map(e => `<path d="${polyPath(e.verts, Q3)}" class="${cls}" ${NS} stroke-width="1"/>`).join('');
  svg.innerHTML = `<path d="${polys('ROLLER')}" class="kv-roll" ${NS} stroke-width="1"/>`
    + `<path d="${polys('PIN')}" class="kv-pin" ${NS} stroke-width="1"/>`
    + each('PLATE_IN', 'k-in') + each('PLATE_OUT', 'k-out')
    + `<path d="${circs('PIN')}" class="kv-pin"/>`
    + `<path d="${circs('HOLES')}" class="kv-hole" ${NS} stroke-width="1"/>`
    + `<path d="${polys('PITCH')} ${lines('PITCH')}" class="bv-pitch-u" ${NS} stroke-width="4"/>`
    + `<path d="${polys('PITCH')} ${lines('PITCH')}" class="kv-pitch" ${NS} stroke-width="2"/>`
    + ents.filter(e => e.type === 'text').map(e => `<text x="${Q3(e.p[0])}" y="${Q3(-e.p[1])}" font-size="${Q3(e.h)}" class="bv-t">${escT(e.s)}</text>`).join('');
}
/* quick 3D look at the STEP bodies: oblique view, drawn back to front in z slabs (every part is an extrusion along z) */
const B3_COL = { in: ['var(--k-in)', '#22262c'], out: ['var(--k-out)', 'var(--accent-2)'], pin: ['#c9ced6', '#8d95a1'], bush: ['#7b838e', '#59606a'], roll: ['#4b525c', '#33383f'], spr: ['var(--pulley)', 'var(--pulley-edge)'] };
function draw3D(svg, bodies) {
  const ay = 32 * Math.PI / 180, ax = 24 * Math.PI / 180, cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  const prj = (x, y, z) => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, -(y * cx - z1 * sx)]; };
  const flat = loop => {                             // polyline with bulges → points
    const pts = [];
    loop.forEach(([x0, y0, b], i) => {
      const [x1, y1] = loop[(i + 1) % loop.length];
      pts.push([x0, y0]);
      if (!b) return;
      const th = 4 * Math.atan(b), c = Math.hypot(x1 - x0, y1 - y0), k = c / 2 / Math.tan(th / 2);
      const qx = (x0 + x1) / 2 - (y1 - y0) / c * k, qy = (y0 + y1) / 2 + (x1 - x0) / c * k, r = Math.hypot(x0 - qx, y0 - qy), a0 = Math.atan2(y0 - qy, x0 - qx);
      const n = Math.max(2, Math.ceil(Math.abs(th) / 0.3));
      for (let j = 1; j < n; j++) pts.push([qx + r * Math.cos(a0 + th * j / n), qy + r * Math.sin(a0 + th * j / n)]);
    });
    return pts;
  };
  const hull = pts => {                              // convex hull (monotone chain)
    const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of s) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of s.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const B = bodies.map(b => ({ ...b, pts: b.loops.map(flat) }));
  const zs = [...new Set(B.flatMap(b => [b.z0, b.z1]).map(z => Math.round(z * 1e4) / 1e4))].sort((a, b) => a - b);
  const d = pts => `M${pts.map(q => `${Q3(q[0])} ${Q3(q[1])}`).join('L')}Z`;
  let out = '', X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  const grow = pts => pts.forEach(([x, y]) => { X0 = Math.min(X0, x); Y0 = Math.min(Y0, y); X1 = Math.max(X1, x); Y1 = Math.max(Y1, y); });
  for (let i = 0; i + 1 < zs.length; i++) {
    const za = zs[i], zb = zs[i + 1];
    for (const b of B) {
      if (b.z0 > za + 1e-6 || b.z1 < zb - 1e-6) continue;
      const col = B3_COL[b.kind] || B3_COL.pin, outer = b.pts[0];
      const band = hull([...outer.map(([x, y]) => prj(x, y, za)), ...outer.map(([x, y]) => prj(x, y, zb))]);
      grow(band);
      out += `<path d="${d(band)}" style="fill:${col[1]}" class="b3-side"/>`;
      if (Math.abs(b.z1 - zb) < 1e-6) out += `<path d="${b.pts.map(lp => d(lp.map(([x, y]) => prj(x, y, zb)))).join('')}" style="fill:${col[0]}" fill-rule="evenodd" class="b3-top" ${NS} stroke-width="0.6"/>`;
    }
  }
  if (!out) { svg.innerHTML = ''; return; }
  const pw = (X1 - X0) * 0.06 + 1;
  svg.setAttribute('viewBox', `${Q3(X0 - pw)} ${Q3(Y0 - pw)} ${Q3(X1 - X0 + 2 * pw)} ${Q3(Y1 - Y0 + 2 * pw)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.innerHTML = out;
}
function chainStepDownload() {
  const ch = kch(), n = Math.round(+K.n), tag = `${chainTag(ch)}${K.strands > 1 ? `-${K.strands}` : ''}`;
  let text, name, count;
  if (K.model === 'piece') {
    const piece = K.segOn ? Math.max(1, Math.min(n, Math.round(+K.seg) || 1)) : n;
    const bodies = chainBodies(ch, Array.from({ length: piece + 1 }, (_, i) => [i * ch.p, 0]), false, K.strands);
    text = stepFile(`${ch.code} chain ${piece} links`, bodies); name = `chain_${tag}_${piece}L.stp`; count = bodies.length;
  } else {
    const lay = kcLayout();
    if (!lay) { toast('The loop needs a matching layout on the Center distance tab.'); return; }
    const r = chainStepText(lay, K.model === 'asm');
    if (r.error) { toast(r.error); return; }
    text = r.text; count = r.n; name = `${K.model === 'asm' ? 'assembly' : 'chain'}_${tag}_${lay.z1}T-${lay.z2}T_${n}L.stp`;
  }
  download(name, text, 'model/step');
  toast(`Saved ${name} · ${count} solids · ${(text.length / 1048576).toFixed(1)} MB`);
}

/* ---- True size (chain) ---- */
function renderKR() {
  ['w', 'h', 'diag'].forEach(k => setIdle(`kr-${k}`, $(`r-${k}`).value));
  const res = $('kr-results'), svg = $('kr-svg'), meta = $('kr-viz-meta'), [dw, dh] = detRes();
  if (!$('r-w').value) { $('r-w').value = dw; $('kr-w').value = dw; }
  if (!$('r-h').value) { $('r-h').value = dh; $('kr-h').value = dh; }
  const sameDet = num($('r-w')) === dw && num($('r-h')) === dh;
  $('kr-det').innerHTML = `<span class="chips-l">Detected:</span><button type="button" class="chip${sameDet ? ' on' : ''}" data-rdet>${dw} × ${dh}</button>`;
  $('kr-dchips').innerHTML = '<span class="chips-l">Common:</span>' + DIAGS.map(d => `<button type="button" class="chip${num($('r-diag')) === d ? ' on' : ''}" data-rdiag="${d}">${d}″</button>`).join('');
  const S = screenScale();
  const fail = (t, m) => { res.innerHTML = resetNumbers(res) + errorBlock(t, m); svg.innerHTML = ''; svg.removeAttribute('style'); rollTo(meta, ''); };
  if (!S) { $('kr-card').innerHTML = ''; return fail('Missing input', 'Enter your screen resolution and its diagonal in inches.'); }
  drawRef($('kr-card'), S.pxmm); syncRefs('kr');
  const o = kDrive(K.calc);
  if (!o) return fail('No layout yet', `Set up a valid layout on the ${K.calc === 'k-len' ? 'Chain length' : 'Center distance'} tab — it is drawn here at 1:1.`);
  const notes = [];
  let doc = chainLayoutDoc(o.ch, o.z1, o.z2, o.C, o.L, [sprSettings(0), sprSettings(1)], 'assembly');
  if (doc.error) { notes.push(['warn', `${doc.error} — showing the chain only (fix it on the Sprocket DXF tab).`]); doc = chainLayoutDoc(o.ch, o.z1, o.z2, o.C, o.L, [sprSettings(0), sprSettings(1)], 'chain'); }
  if (doc.error) return fail("Can't draw this drive", doc.error);
  const ents = doc.ents.filter(e => e.layer !== 'PITCH' && e.layer !== 'ROLLER'), showPitch = $('kr-pitch').checked;
  if (showPitch) ents.push({ type: 'circle', layer: 'PITCH', c: [0, 0], r: o.g.R1 }, { type: 'circle', layer: 'PITCH', c: [o.C, 0], r: o.g.R2 });
  else for (let i = ents.length - 1; i >= 0; i--) if (ents[i].layer === 'CENTER') ents.splice(i, 1);
  const k = S.pxmm, sz = trueSizeSVG(svg, ents, k, $('kr-ruler').checked, [
    [['SPROCKET_1', 'SPROCKET_2'], 'rv-pul'], [['BORE', 'HOLES'], 'rv-hole'], [['PLATE_IN'], 'rv-kin', true], [['PLATE_OUT'], 'rv-kout', true], [['PIN'], 'rv-kpin'],
  ]);
  if (sz.W * k > $('kr-scroll').clientWidth + 1) notes.push(['info', `The drawing is ${UNIT === 'in' ? len(sz.W, 1) : `${f(sz.W / 10, 1)} cm`} wide — wider than this window, so scroll sideways.`]);
  if (!sameDet) notes.push(['info', `This differs from the detected ${dw} × ${dh}. Enter the monitor's native resolution, not a scaled one.`]);
  notes.push(['info', `Browser zoom and display scaling (${Math.round(S.dpr * 100)} % now) are taken into account. Check the scale with a reference object below.`]);
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Screen density</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${S.ppi}" data-d="1">${f(S.ppi, 1)}</span><small>PPI</small></div>
      <div class="hero-sub" data-k="sub">${f(UNIT === 'in' ? k * IN : k, 3)} CSS px per ${U()} · ${S.w} × ${S.h} on ${S.dg}″</div>
    </div>
    ${kvGrid([
      [`Physical px / ${U()}`, f(UNIT === 'in' ? S.ppi : S.ppi / 25.4, 3), f(UNIT === 'in' ? S.ppi : S.ppi / 25.4, 3), 'px'],
      ['Pixel pitch', `${len(25.4 / S.ppi, 4)}`, fl(25.4 / S.ppi, 4)],
      ['Scale factor', `${f(S.dpr, 2)}×`, null],
      ['Screen size', `${fl(S.w / S.ppi * 25.4, 0)} × ${len(S.h / S.ppi * 25.4, 0)}`, null],
      ['Drive', `${fl(sz.aw, 1)} × ${len(sz.ah, 1)}`, null],
      ['From', `${o.from} tab`, null],
    ])}
    ${notesHTML(notes)}`;
  rollNumbers(res);
  rollTo(meta, `1:1 · ${o.ch.label} × ${o.L} · ${o.z1}T + ${o.z2}T · C2C ${len(o.C, 2)}`);
}

/* ---- alerts: a sprocket that can't be generated ---- */
/* smallest tooth count above n that builds without an error (null if even the largest one fails) */
function minTeeth(build, n, max) {
  if (!(n >= 1) || build(max).error) return null;
  for (let k = Math.max(n + 1, 3); k <= max; k++) if (!build(k).error) return k;
  return null;
}
function sprocketProblems() {
  const out = [], ch = kch();
  for (let j = 0; j < 2; j++) {
    const st = sprSettings(j), z = st.z;
    let msg = null, min = null;
    const build = k => sprocketParts(ch, k, st);
    if (!kZOK(z)) { msg = 'Teeth must be between 6 and 250.'; if (Number.isFinite(z)) min = z > 250 ? 250 : build(6).error ? minTeeth(build, 6, 250) : 6; }
    else if (st.bore !== 'none' && !(st.boreSize > 0)) msg = 'Enter a bore size, or pick “No bore”.';
    else if (!holesOK(st.holes)) msg = 'Check the mounting-hole fields (1–24 holes, size and bolt circle).';
    if (!msg) { const pp = build(z); if (pp.error) { msg = pp.error; min = minTeeth(build, z, 250); } }
    if (msg) out.push({ id: `s${j}`, j, msg, dkey: `s${j}|${z}|${msg}`,
      acts: [...(min ? [[`Use ${min}T`, `kz:${j}:${min}`, 'primary']] : []), ['Fix in Sprocket DXF →', `ks:${j}`]],
      title: `Sprocket ${j + 1} (${j ? 'right' : 'left'})${Number.isFinite(z) ? ` · ${z}T` : ''} can't be generated` });
  }
  return out;
}
const renderKTab = () => { const t = document.querySelector('#tabs-chain .tab[aria-selected="true"]'); renderTab(t ? t.dataset.tab : 'k-c2c'); };

/* ---- wiring ---- */
KTYPE_BOXES.forEach(buildChainTypes);
buildSeg($('ks-bore-preset'), 'ks-borep', BORE_PRE, 'custom', v => {
  const s = KS.s[KS.cur];
  s.borePre = v;
  if (BORE_SET[v]) { s.bore = BORE_SET[v][0]; s.size = BORE_SET[v][1]; if (BORE_SET[v][2]) s.flat = BORE_SET[v][2]; ksWrite(); nudge($('ks-bore'), 1); }
  renderKS(); redrawChains();
});
buildSeg($('ks-hole-preset'), 'ks-holep', HOLE_PRE, 'none', v => {
  const s = KS.s[KS.cur];
  s.holePre = v;
  if (v === 'sonic' || v === 'servo') Object.assign(s, { hn: 4, hd: 4.3, hp: 22.627, hr: 45 });
  renderKS(); redrawChains();
});
buildSeg($('kc-model'), 'kc-modelr', KMODELS, K.model, v => { K.model = v; renderKC(); });
addInd($('ka-units'), 'button[aria-pressed="true"]', 'u-ind');
addInd($('ks-which'), 'button[aria-pressed="true"]', 'u-ind');
addInd($('ks-bore-type'), 'button[aria-pressed="true"]', 'u-ind');
addInd($('kc-strands'), 'button[aria-pressed="true"]', 'u-ind');
document.querySelectorAll('[data-kmenu-for]').forEach(m => { m.innerHTML = kmenuHTML(m.dataset.kmenuFor); });

$('page-chain').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.kz) {                               // sprocket teeth, shared by every tab
    K[el.dataset.kz] = Math.round(num(el));
    renderKTab(); return;
  }
  if (el.dataset.ks) {
    const s = KS.s[KS.cur], k = el.dataset.ks;
    s[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'z' && KS.link) K[KS.cur ? 'z2' : 'z1'] = Math.round(num(el));
    if (k === 'size' || k === 'flat') ksBoreToCustom();
    if (['hn', 'hd', 'hp', 'hr'].includes(k)) ksHolesToCustom();
    updateInds(); renderKS(); redrawChains(); return;
  }
  if (el.dataset.mon) {                              // monitor fields are shared with the belt page's True size tab
    $(`r-${el.dataset.mon}`).value = el.value; renderKR(); return;
  }
  switch (el.id) {
    case 'ka-len': K.lenRaw = el.value; renderKA(); break;
    case 'ka-allow': K.allow = el.value; renderKA(); break;
    case 'kb-c': K.target = el.value; renderKB(false); break;
    case 'kc-n': {
      K.n = Math.round(num(el));
      if (K.clink && K.n >= 2) { K.lenRaw = K.unit === 'links' ? K.n : +(K.n * kch().p).toFixed(3); }
      renderKC(); break;
    }
    case 'kc-seg': K.seg = Math.round(num(el)); renderKC(); break;
  }
});
$('page-chain').addEventListener('change', e => {
  const el = e.target, id = el.id;
  if (id === 'ks-link') { KS.link = el.checked; renderKS(); redrawChains(); return; }
  if (id === 'kc-link') {
    K.clink = el.checked;
    if (K.clink) { const L = kLinks(); if (Number.isFinite(L)) K.n = L; K.views.loop = true; }
    renderKC(); return;
  }
  if (id === 'kc-segon') { K.segOn = el.checked; renderKC(); return; }
  const v = id.startsWith('kc-') && id.slice(3);
  if (v && v in K.views) { K.views[v] = el.checked; renderKC(); return; }
  if (id === 'kr-ruler' && el.checked) TS_SWEEP = true;
  if (id === 'kr-pitch' || id === 'kr-ruler') renderKR();
});
$('page-chain').addEventListener('click', e => {
  const u = e.target.closest('[data-kunit]');
  if (u && u.dataset.kunit !== K.unit) {
    const p = kch().p, v = +K.lenRaw;
    K.unit = u.dataset.kunit;
    if (v > 0) K.lenRaw = K.unit === 'mm' ? +(Math.round(v) * p).toFixed(3) : Math.max(1, Math.round(v / p));
    updateInds(); renderKA(); nudge($('ka-len'), 0); return;
  }
  const w = e.target.closest('[data-kwhich]');
  if (w) { if (+w.dataset.kwhich !== KS.cur) switchSprocket(+w.dataset.kwhich); return; }
  const bt = e.target.closest('[data-kbore]');
  if (bt) { const s = KS.s[KS.cur]; s.bore = bt.dataset.kbore; ksBoreToCustom(); ksWrite(); updateInds(); renderKS(); redrawChains(); return; }
  const st = e.target.closest('[data-kstr]');
  if (st && !st.disabled) { K.strands = +st.dataset.kstr; renderKC(); updateInds(); return; }
  const tr = e.target.closest('tr[data-kl]');
  if (tr) { K.selL = +tr.dataset.kl; renderKB(true); document.querySelectorAll('#kb-results .pick, #kb-results tr.sel').forEach(x => x.classList.add('flash')); return; }
  const send = e.target.closest('[data-ksend]');
  if (send) {
    K.unit = 'links'; K.lenRaw = +send.dataset.ksend;
    switchTab('k-c2c'); updateInds();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }
  if (e.target.closest('[data-ks-dxf]') && KS.doc) { download(`${KS.doc.name}.dxf`, toDXF(KS.doc.ents)); toast(`Saved ${KS.doc.name}.dxf`); return; }
  if (e.target.closest('[data-ks-both]')) {
    const d = bothSprocketsDoc();
    if (d.error) { toast(d.error); return; }
    download(d.name, toDXF(d.ents)); toast(`Saved ${d.name}`); return;
  }
  if (e.target.closest('[data-ks-step]') && KS.doc) {
    const sb = sprocketBodies(KS.doc.ch, KS.doc.z, KS.doc.st, K.strands, 0, 0, `Sprocket ${KS.cur + 1} ${KS.doc.z}T`);
    if (sb.error) { toast(sb.error); return; }
    download(`${KS.doc.name}.stp`, stepFile(`${KS.doc.ch.code} sprocket ${KS.doc.z}T`, sb.bodies), 'model/step');
    toast(`Saved ${KS.doc.name}.stp`); return;
  }
  if (e.target.closest('[data-kc-dxf]') && K.doc) { download(K.doc.name, toDXF(K.doc.ents)); toast(`Saved ${K.doc.name}`); return; }
  if (e.target.closest('[data-kc-step]')) { chainStepDownload(); return; }
  const det = e.target.closest('#kr-det [data-rdet]');
  if (det) { const [w0, h0] = detRes(); $('r-w').value = w0; $('r-h').value = h0; renderKR(); return; }
  const dg = e.target.closest('#kr-dchips [data-rdiag]');
  if (dg) { setField('kr-diag', +dg.dataset.rdiag); $('r-diag').value = dg.dataset.rdiag; renderKR(); }
});
$('kb-results').addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-kl]')) {
    e.preventDefault();
    const L = e.target.dataset.kl;
    e.target.click();
    const again = $('kb-results').querySelector(`tr[data-kl="${L}"]`);
    if (again) again.focus();
  }
});
document.addEventListener('click', e => {
  const item = e.target.closest('[data-kexport]');
  if (item) { closeMenus(); exportChain(item.dataset.src, item.dataset.kexport); }
});

/* ---- remembered chain settings ---- */
const chainSnapshot = () => ({
  type: K.type, byFam: K.byFam, z1: K.z1, z2: K.z2, lenRaw: K.lenRaw, unit: K.unit, allow: K.allow, target: K.target, selL: K.selL,
  strands: K.strands, clink: K.clink, n: K.n, segOn: K.segOn, seg: K.seg, views: K.views, model: K.model, calc: K.calc,
  s: KS.s, cur: KS.cur, slink: KS.link,
});
function cleanSpr(v, z) {
  const d = sprNew(z);
  if (!v || typeof v !== 'object') return d;
  const pick = (x, ok, def) => (ok.includes(x) ? x : def);
  ['z', 'size', 'flat', 'clear', 'hn', 'hd', 'hp', 'hr', 'fit'].forEach(k => { if (typeof v[k] === 'string' || (typeof v[k] === 'number' && Number.isFinite(v[k]))) d[k] = v[k]; });
  d.pitch = !!v.pitch;
  d.borePre = pick(v.borePre, ['none', 'rev', 'rex', 'gbd', 'b14', 'custom'], 'custom');
  d.bore = pick(v.bore, ['round', 'hex', 'square', 'rex', 'd', 'dd'], 'round');
  d.holePre = pick(v.holePre, ['none', 'sonic', 'servo', 'custom'], 'none');
  return d;
}
function restoreChain(k) {
  if (!k || typeof k !== 'object') return;
  const ok = v => Object.prototype.hasOwnProperty.call(CHAINS, v), inR = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;
  if (ok(k.type)) K.type = k.type;
  if (k.byFam && typeof k.byFam === 'object') Object.entries(k.byFam).forEach(([fm, v]) => { if (ok(v) && CHAINS[v].fam === fm) K.byFam[fm] = v; });
  ['z1', 'z2'].forEach(z => { if (inR(k[z], 6, 250)) K[z] = Math.round(k[z]); });
  if (k.unit === 'mm' || k.unit === 'links') K.unit = k.unit;
  ['lenRaw', 'allow', 'target'].forEach(fl => { if (typeof k[fl] === 'string' || (typeof k[fl] === 'number' && Number.isFinite(k[fl]))) K[fl] = k[fl]; });
  if (inR(k.selL, 2, 5000)) K.selL = k.selL;
  if (inR(k.strands, 1, 4)) K.strands = k.strands;
  K.clink = k.clink !== false;
  if (inR(k.n, 2, 600)) K.n = k.n;
  K.segOn = !!k.segOn;
  if (inR(k.seg, 1, 600)) K.seg = k.seg;
  if (k.views && typeof k.views === 'object') Object.keys(K.views).forEach(v => { if (v in k.views) K.views[v] = !!k.views[v]; });
  if (['piece', 'loop', 'asm'].includes(k.model)) K.model = k.model;
  if (k.calc === 'k-len' || k.calc === 'k-c2c') K.calc = k.calc;
  if (Array.isArray(k.s) && k.s.length === 2) KS.s = k.s.map((v, j) => cleanSpr(v, j ? 30 : 15));
  KS.cur = k.cur === 1 ? 1 : 0;
  KS.link = k.slink !== false;
  syncChainTypes();
  setType($('kc-model'), K.model);
}
syncChainTypes();

/* ---------------- remembered settings (browser storage, only after consent) ---------------- */
const STORE = LS || CK.ok ? PS : null;            // browser storage + cookies (see PS above); null if both are blocked
const SKEY = 'belt-calc-settings', CKEY = 'belt-consent';
let consent = STORE ? STORE.getItem(CKEY) : null;
const FORM_IDS = ['a-n1', 'a-n2', 'a-len', 'a-allow', 'b-n1', 'b-n2', 'b-c', 't-n', 't-seg', 'r-w', 'r-h', 'r-diag'];
const CHECK_IDS = ['t-loop', 't-prof', 't-top', 't-pitch', 't-segon', 'r-pitch', 'r-ruler', 'kr-pitch', 'kr-ruler'];
function saveMotionPref(on) {
  if (consent !== 'yes' || !STORE) return;
  try { STORE.setItem('belt-motion', on ? 'on' : 'off'); } catch (_) { /* full or blocked */ }
}
function snapshot() {
  readForm();
  const tab = document.querySelector('#tabs-belt .tab[aria-selected="true"]'), ktab = document.querySelector('#tabs-chain .tab[aria-selected="true"]');
  return {
    v: 1, tab: tab && tab.dataset.tab, ktab: ktab && ktab.dataset.tab, page: PAGE, k: chainSnapshot(),
    f: Object.fromEntries(FORM_IDS.map(id => [id, $(id).value])),
    c: Object.fromEntries(CHECK_IDS.map(id => [id, $(id).checked])),
    a: { type: A.type, unit: A.unit }, b: { type: B.type, stock: stockText, selL: B.selL }, calc: lastCalc,
    d: { type: DX.type, cur: DX.cur, p: DX.p, flhTouched: DX.flhTouched, link: DX.link },
    t: { type: BT.type, link: BT.link, wBy: BT.wBy, hBy: BT.hBy },
    speed: ANIM.speed, playing: ANIM.playing, unit: UNIT, ref: REF,
  };
}
function saveNow() {
  if (consent !== 'yes' || !STORE) return;
  try { STORE.setItem(SKEY, JSON.stringify(snapshot())); } catch (_) { /* full or blocked */ }
}
let saveT = 0;
function scheduleSave() { if (consent === 'yes') { clearTimeout(saveT); saveT = setTimeout(saveNow, 350); } }
function cleanPulley(p, n) {
  const d = newPulley(n);
  if (!p || typeof p !== 'object') return d;
  const pick = (v, ok, def) => ok.includes(v) ? v : def;
  const v = { ...d.v }, c = { ...d.c };
  Object.keys(v).forEach(k => { if (p.v && typeof p.v[k] === 'string') v[k] = p.v[k]; });
  Object.keys(c).forEach(k => { if (p.c && k in p.c) c[k] = !!p.c[k]; });
  return { bore: pick(p.bore, ['round', 'hex', 'square', 'rex', 'd', 'dd'], 'round'), borePre: pick(p.borePre, ['none', 'rev', 'rex', 'gbd', 'b14', 'custom'], 'custom'),
    holePre: pick(p.holePre, ['none', 'sonic', 'servo', 'custom'], 'none'), v, c };
}
function restoreSettings() {
  if (consent !== 'yes' || !STORE) return null;
  let s = null;
  try { s = JSON.parse(STORE.getItem(SKEY) || 'null'); } catch (_) { return null; }
  if (!s || s.v !== 1) return null;
  try {
    const ok = k => Object.prototype.hasOwnProperty.call(BELTS, k);
    if (s.a && ok(s.a.type)) { A.type = s.a.type; setType($('a-type'), A.type); }
    if (s.a && s.a.unit === 'mm') {
      A.unit = 'mm';
      const el = $('a-len'), p = BELTS[A.type].pitch; el.step = p; el.min = p;
      $('a-units').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.unit === 'mm')));
    }
    if (s.b && ok(s.b.type)) { B.type = s.b.type; setType($('b-type'), B.type); }
    if (s.b && typeof s.b.selL === 'number' && s.b.selL > 0) B.selL = s.b.selL;      // the belt picked in the Belt length list
    if (s.calc === 'c2c' || s.calc === 'length') lastCalc = s.calc;
    if (s.b && s.b.stock && typeof s.b.stock === 'object') Object.keys(s.b.stock).forEach(k => { if (ok(k) && typeof s.b.stock[k] === 'string') stockText[k] = s.b.stock[k]; });
    Object.entries(s.f || {}).forEach(([id, v]) => { if (FORM_IDS.includes(id) && typeof v === 'string' && v !== '') $(id).value = v; });
    Object.entries(s.c || {}).forEach(([id, v]) => { if (CHECK_IDS.includes(id)) $(id).checked = !!v; });
    if (s.t && ok(s.t.type)) {
      BT.type = s.t.type; setType($('t-type'), BT.type);
      BT.link = s.t.link !== false; $('t-link').checked = BT.link;
      const nums = (src, lo, hi) => Object.fromEntries(Object.entries(src && typeof src === 'object' ? src : {})
        .filter(([k, v]) => ok(k) && typeof v === 'number' && v >= lo && v <= hi));
      BT.wBy = nums(s.t.wBy, W_MIN, W_MAX); BT.hBy = nums(s.t.hBy, 0.5, 20);
      const f0 = s.f || {};                         // settings saved by the previous version
      if (s.t.wTouched && +f0['t-w'] > 0) BT.wBy[BT.type] = Math.round(+f0['t-w']);
      if (s.t.hTouched && +f0['t-h'] > 0) BT.hBy[BT.type] = +f0['t-h'];
    }
    if (s.d) {
      if (ok(s.d.type)) { DX.type = s.d.type; setType($('d-type'), DX.type); }
      if (Array.isArray(s.d.p) && s.d.p.length === 2) DX.p = [cleanPulley(s.d.p[0], 20), cleanPulley(s.d.p[1], 40)];
      DX.cur = s.d.cur === 1 ? 1 : 0;
      DX.flhTouched = !!s.d.flhTouched;
      DX.link = s.d.link !== false; $('d-link').checked = DX.link;
      writeForm();
    }
    restoreChain(s.k);
    if (typeof s.ref === 'string' && REF_BY[s.ref]) REF = s.ref;
    if (s.speed >= 0.1 && s.speed <= 3) {
      ANIM.speed = +s.speed;
      document.querySelectorAll('[data-anim-speed]').forEach(x => { x.value = s.speed; });
      document.querySelectorAll('[data-anim-out]').forEach(x => { x.textContent = `${ANIM.speed.toFixed(1)}×`; });
    }
    if (s.playing === false) ANIM.playing = false;
    return s;
  } catch (_) { return null; }
}
function consentState() {                            // what the cookie window says about your current choice
  const st = $('consent-state'), del = $('consent-del');
  st.hidden = !consent;
  if (consent === 'yes') st.innerHTML = '<b>Accepted</b> — your settings are remembered in this browser.';
  else if (consent === 'no') st.innerHTML = '<b>Declined</b> — nothing is stored except this choice.';
  del.hidden = !consent;
  document.querySelectorAll('#consent [data-consent="yes"], #consent [data-consent="no"]').forEach(b => b.classList.toggle('primary', b.dataset.consent === (consent === 'no' ? 'no' : 'yes')));
}
function showConsent() { const c = $('consent'); consentState(); c.classList.remove('out'); c.hidden = false; }
function hideConsent() {
  const c = $('consent');
  c.classList.add('out');
  setTimeout(() => { c.hidden = true; c.classList.remove('out'); }, reduceMotion ? 0 : 260);
}
$('consent').addEventListener('click', e => {
  const b = e.target.closest('[data-consent]');
  if (!b) return;
  const v = b.dataset.consent;
  if (v === 'delete') {                                // forget everything: settings, motion choice and the consent itself
    clearTimeout(saveT);
    [SKEY, CKEY, 'belt-motion'].forEach(k => STORE && STORE.removeItem(k));
    consent = null; consentState();
    toast('All saved data deleted. The page keeps what you see until you reload it.');
    return;                                            // the window stays open, so you can choose again
  }
  if (v === 'yes' || v === 'no') {
    consent = v;
    try {
      STORE.setItem(CKEY, v);                          // the choice itself is always remembered
      if (v === 'no') { STORE.removeItem(SKEY); STORE.removeItem('belt-motion'); }
    } catch (_) { /* blocked */ }
    if (v === 'yes') { saveNow(); if (motionTouched) saveMotionPref(!reduceMotion); toast('Your settings will be remembered in this browser.'); }
    else toast('OK — nothing will be stored.');
  }
  hideConsent();
});
$('cookie-open').addEventListener('click', showConsent);
if (!STORE) $('cookie-row').hidden = true;
document.querySelectorAll('.contact .kcopy').forEach(b => { b.innerHTML = ICON_COPY + ICON_OK; });
['input', 'change', 'click'].forEach(ev => document.addEventListener(ev, scheduleSave));
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* ---------------- pinned alerts when a pulley can't be generated ---------------- */
const FLAG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 18V3"/><path d="M5 3.6h10.2l-2.3 3.7 2.3 3.7H5" fill="currentColor"/></svg>';
const DISMISSED = new Set();
const FLYING = new Set();                          // alerts whose fix is still flying (hidden until it lands)

/* the teeth box a fix lands in: the first of these that is on screen in the open tab */
function fixTarget(ids) {
  for (const id of ids) {
    const el = id && $(id), box = el && (el.closest('.stepper') || el.closest('label.check') || el), pnl = el && el.closest('.panel');
    if (box && box.offsetParent !== null && pnl && !pnl.hidden) return box;
  }
  return null;
}
function pulleyProblems() {
  pullLayout();
  const out = [], s = layoutSrc(), belt = BELTS[DX.type];
  const check = (id, j, N, st, who) => {
    let msg = null, min = null;
    const build = k => pulleyParts(belt, k, st);
    if (!(N >= 6 && N <= 400)) { msg = 'Teeth must be between 6 and 400.'; if (Number.isFinite(N)) min = N > 400 ? 400 : build(6).error ? minTeeth(build, 6, 400) : 6; }
    else if (st.bore !== 'none' && !(st.boreSize > 0)) msg = 'Enter a bore size, or pick “No bore”.';
    else if (!holesOK(st.holes)) msg = 'Check the mounting-hole fields (1–24 holes, size and bolt circle).';
    if (!msg) { const p = build(N); if (p.error) { msg = p.error; min = minTeeth(build, N, 400); } }
    if (msg) out.push({ id, j, msg, dkey: `${id}|${N}|${msg}`,
      acts: [...(min ? [[`Use ${min}T`, `pn:${id}:${min}`, 'primary']] : []), ['Fix in Pulley DXF →', `p:${j}`]],
      title: `${who} ${j + 1} (${j ? 'right' : 'left'})${Number.isFinite(N) ? ` · ${N}T` : ''} can't be generated` });
  };
  for (let j = 0; j < 2; j++) {
    const st = dxfSettings(j);
    check(`d${j}`, j, st.n, st, 'Pulley');
    if (!DX.link) {                       // the layout uses its own teeth with these bore / hole settings
      const lo = $(lastCalc === 'length' ? 'b-svg' : 'a-svg')._last;
      if (lo && lo.belt === belt) check(`l${j}`, j, j ? lo.N2 : lo.N1, st, 'Layout pulley');
    }
  }
  return out;
}
/* a belt thicker than the standard, for any belt type a tab is using */
function thickProblems() {
  const used = new Set([BT.type, A.type, B.type]), out = [];
  for (const [k, b] of Object.entries(BELTS)) {
    if (!thickOver(b)) { DISMISSED.delete(`t|${k}`); continue; }        // back to standard: a later one shows again
    if (!used.has(k)) continue;
    const T = beltThick(b);
    out.push({ id: `t-${k}`, dkey: `t|${k}`, roll: true, title: 'Non-standard belt thickness',
      msg: `${b.label} at ${len(T, 2)} is ${len(T - b.thick, 2)} over the ${len(b.thick, 2)} standard — stock belts won't match. The extra backing is drawn red.`,
      acts: [[`Reset to ${len(b.thick, 2)}`, `thick:${k}`], ['Belt DXF →', `belt:${k}`]] });
  }
  return out;
}
/* layout and export problems: each offers the smallest value that works, as a button that flies into its field */
const FIX_NOTE = new Map();                        // alert id → toast once its fix has landed
const setAct = (aid, fid, v, label, note) => { FIX_NOTE.set(aid, note); return [`Use ${label}`, `set:${aid}:${fid}:${v}`, 'primary']; };
const chkAct = (aid, fid, label, note) => { FIX_NOTE.set(aid, note); return [label, `chk:${aid}:${fid}`, 'primary']; };
const tabAct = (tab, label) => document.querySelector(`.tab[data-tab="${tab}"][aria-selected="true"]`) ? [] : [[`${label} →`, `tab:${tab}`]];
const roundUp = mm => { const q = UNIT === 'in' ? IN / 100 : 0.1; return +(Math.ceil((mm + 1e-6) / q) * q).toFixed(4); };   // a tidy value just above mm
function beltLayoutProblems() {
  const out = [];
  if (lastCalc === 'length') {                     // Belt length tab: the target C2C must clear the pulley ODs
    const belt = BELTS[B.type], N1 = Math.round(num($('b-n1'))), N2 = Math.round(num($('b-n2'))), Ct = num($('b-c'));
    if (N1 >= 4 && N2 >= 4 && N1 <= 1000 && N2 <= 1000 && Ct > 0) {
      const g = analyze(belt, N1, N2, Ct);
      if (!g.valid || g.gap <= 0) {
        const need = roundUp((g.od1 + g.od2) / 2);
        out.push({ id: 'b', dkey: `b|${B.type}|${N1}|${N2}|${Ct}`, title: `Pulleys overlap · C2C ${len(Ct, 1)}`,
          msg: `At ${len(Ct, 2)} the ${N1}T and ${N2}T ${belt.label} pulleys collide — their outside diameters need at least ${len(need, 1)} between centers.`,
          acts: [setAct('b', 'b-c', need, len(need, 1), `Target C2C set to ${len(need, 1)}.`), ...tabAct('length', 'Belt length')] });
      }
    }
  } else {                                         // Center distance tab: the belt must reach around both pulleys
    const belt = BELTS[A.type], p = belt.pitch, N1 = Math.round(num($('a-n1'))), N2 = Math.round(num($('a-n2'))), raw = num($('a-len'));
    if (N1 >= 4 && N2 >= 4 && N1 <= 1000 && N2 <= 1000 && raw > 0) {
      const teeth = Math.max(1, Math.round(A.unit === 'teeth' ? raw : raw / p));
      const g0 = analyze(belt, N1, N2, NaN), g = analyze(belt, N1, N2, solveCenter(teeth * p, g0.r1, g0.r2));
      if (!g.valid || g.gap <= 0) {
        const m = minTeethForPair(belt, N1, N2), Lm = +(m * p).toFixed(4);
        out.push({ id: 'a', dkey: `a|${A.type}|${N1}|${N2}|${teeth}`, title: `Belt too short · ${teeth}T`,
          msg: `A ${teeth}T (${lenR(teeth * p)}) ${belt.label} belt can't go around ${N1}T + ${N2}T pulleys without them colliding — the shortest belt that clears is ${m}T (${lenR(Lm)}).`,
          acts: [setAct('a', 'a-len', A.unit === 'teeth' ? m : Lm, A.unit === 'teeth' ? `${m}T` : lenR(Lm), `Belt length set to ${m}T (${lenR(Lm)}).`), ...tabAct('c2c', 'Center distance')] });
      }
    }
  }
  // Belt DXF tab: tooth count and views
  const n = Math.round(num($('t-n')));
  if (Number.isFinite(n) && (n < 10 || n > 2000)) {
    const v = n < 10 ? 10 : 2000;
    out.push({ id: 'u', dkey: `u|${n}`, title: `Belt DXF · ${n}T can't be generated`, msg: 'A belt drawing needs between 10 and 2000 teeth.',
      acts: [setAct('u', 't-n', v, `${v}T`, `Belt DXF set to ${v} teeth.`), ...tabAct('belt', 'Belt DXF')] });
  } else if (n >= 10 && !$('t-prof').checked && !$('t-top').checked) {
    const lay = $('t-loop').checked && calcLayout();
    if (!(lay && lay.o.belt === BELTS[BT.type] && lay.t === n)) {
      out.push({ id: 'v', dkey: `v|${$('t-loop').checked}`, title: 'Belt DXF · nothing to export',
        msg: $('t-loop').checked ? 'The belt loop needs a matching layout, and every other view is off.' : 'Every view in the drawing is turned off.',
        acts: [chkAct('v', 't-prof', 'Turn on tooth profile', 'Tooth profile view turned on.'), ...tabAct('belt', 'Belt DXF')] });
    }
  }
  return out;
}
function chainLayoutProblems() {
  const out = [], ch = kch(), p = ch.p, z1 = K.z1, z2 = K.z2;
  const s1 = kZOK(z1) && sprocketOutline(ch, z1, 0), s2 = kZOK(z2) && sprocketOutline(ch, z2, 0);
  if (s1 && s2 && !s1.error && !s2.error) {
    if (K.calc === 'k-len') {                      // Chain length tab: the target C2C must clear the sprocket tips
      const Ct = +K.target, Cmin = (s1.od + s2.od) / 2 + 0.5;
      if (Ct > 0 && Ct < Cmin) {
        const need = roundUp(Cmin);
        out.push({ id: 'kb', dkey: `kb|${ch.key}|${z1}|${z2}|${Ct}`, title: `Sprockets collide · C2C ${len(Ct, 1)}`,
          msg: `At ${len(Ct, 2)} the ${z1}T and ${z2}T ${ch.label} sprocket teeth overlap — they need at least ${len(need, 1)} between centers.`,
          acts: [setAct('kb', 'kb-c', need, len(need, 1), `Target C2C set to ${len(need, 1)}.`), ...tabAct('k-len', 'Chain length')] });
      }
    } else if (+K.lenRaw > 0) {                    // Center distance tab: the chain must reach around both sprockets
      const L = kLinks(), C = chainCenter(ch, z1, z2, L), g = Number.isFinite(C) ? chainAnalyze(ch, z1, z2, C) : null;
      if (!g || !g.valid || !(g.gap > 0)) {
        const m = minLinksFor(ch, z1, z2), Lm = +(m * p).toFixed(4);
        out.push({ id: 'ka', dkey: `ka|${ch.key}|${z1}|${z2}|${L}`, title: `Chain too short · ${L} links`,
          msg: `${L} links of ${ch.label} chain can't go around ${z1}T + ${z2}T sprockets without them colliding — the shortest chain that clears is ${m} links${m % 2 ? ` (${m + 1} for an even count)` : ''}.`,
          acts: [setAct('ka', 'ka-len', K.unit === 'links' ? m : Lm, K.unit === 'links' ? `${m} links` : lenR(Lm), `Chain set to ${m} links (${lenR(Lm)}).`), ...tabAct('k-c2c', 'Center distance')] });
      }
    }
  }
  // Chain DXF & STEP tab: link count and views
  const n = Math.round(+K.n);
  if (Number.isFinite(n) && (n < 2 || n > 600)) {
    const v = n < 2 ? 2 : 600;
    out.push({ id: 'kn', dkey: `kn|${n}`, title: `Chain DXF · ${n} link${n === 1 ? '' : 's'} can't be generated`, msg: 'A chain drawing needs between 2 and 600 links.',
      acts: [setAct('kn', 'kc-n', v, `${v} links`, `Chain DXF set to ${v} links.`), ...tabAct('k-chain', 'Chain DXF')] });
  } else if (n >= 2 && !K.views.side && !K.views.top && !K.views.plates) {
    const lay = K.views.loop && kcLayout();
    if (!(lay && chainLoopExact(ch, lay.z1, lay.z2, lay.C, lay.L))) {
      out.push({ id: 'kv', dkey: `kv|${K.views.loop}`, title: 'Chain DXF · nothing to export',
        msg: K.views.loop ? 'The chain loop needs a matching layout, and every other view is off.' : 'Every view in the drawing is turned off.',
        acts: [chkAct('kv', 'kc-side', 'Turn on side view', 'Side view turned on.'), ...tabAct('k-chain', 'Chain DXF')] });
    }
  }
  return out;
}
function renderAlerts() {
  const tops = alertTops(), box = $('alerts'), probs = (PAGE === 'chain' ? sprocketProblems().concat(chainLayoutProblems()) : pulleyProblems().concat(thickProblems(), beltLayoutProblems())).filter(p => !DISMISSED.has(p.dkey) && !FLYING.has(p.id)), ids = probs.map(p => p.id);
  box.querySelectorAll('.alert').forEach(el => {
    if (ids.includes(el.dataset.id) || el.classList.contains('out') || el.classList.contains('popping')) return;
    el.classList.add('out');
    el._rm = setTimeout(() => { const t = alertTops(); el.remove(); flipAlerts(t); }, reduceMotion ? 0 : 260);
  });
  probs.forEach(p => {
    let el = box.querySelector(`.alert[data-id="${p.id}"]:not(.popping)`);
    if (el && el.classList.contains('out')) { clearTimeout(el._rm); el.classList.remove('out'); }
    if (!el) {
      el = document.createElement('div');
      el.className = 'alert'; el.dataset.id = p.id; el.setAttribute('role', 'alert');
      el.innerHTML = `<span class="alert-flag">${FLAG}</span><div class="alert-b"><div class="alert-t"></div><div class="alert-m"></div>`
        + '<div class="alert-a"></div></div>'
        + '<button type="button" class="consent-x" data-dismiss aria-label="Dismiss">×</button>';
      el.querySelector('.alert-t').textContent = p.title;
      el.querySelector('.alert-m').textContent = p.msg;
      const after = [...box.querySelectorAll('.alert')].find(x => x.dataset.id > p.id);
      box.insertBefore(el, after || null);
    } else {
      rollTo(el.querySelector('.alert-t'), p.title);
      const m = el.querySelector('.alert-m');
      rollTo(m, p.msg);
    }
    const acts = p.acts.map(([l, fx, cls]) => `<button type="button" class="btn sm${cls ? ` ${cls}` : ''}" data-fix="${fx}">${l}</button>`).join('');
    if (el._acts !== acts) {                       // same buttons with new labels (Use 49.5 mm → Use 1.950 in): roll them
      const box2 = el.querySelector('.alert-a'), was = [...box2.querySelectorAll('button')].map(b => b._rolling ? b._txt : b.textContent);
      box2.innerHTML = acts; el._acts = acts;
      const now = [...box2.querySelectorAll('button')];
      if (now.length === was.length) now.forEach((b, i) => { const to = b.textContent; if (was[i] !== to) { b.textContent = was[i]; rollTo(b, to); } });
    }
    el.dataset.dkey = p.dkey;
  });
  flipAlerts(tops);
}
const renderKTabBelt = () => { const t = document.querySelector('#tabs-belt .tab[aria-selected="true"]'); renderTab(t ? t.dataset.tab : 'c2c'); };
let chkT = 0;
const scheduleCheck = () => { clearTimeout(chkT); chkT = setTimeout(renderAlerts, 90); };
['input', 'change', 'click'].forEach(ev => document.addEventListener(ev, scheduleCheck));
$('alerts').addEventListener('click', e => {
  const el = e.target.closest('.alert');
  if (!el) return;
  if (e.target.closest('[data-dismiss]')) { DISMISSED.add(el.dataset.dkey); popAlert(el); renderAlerts(); return; }
  const fix = e.target.closest('[data-fix]');
  if (!fix) return;
  const [kind, arg] = fix.dataset.fix.split(':');
  if (kind === 'thick') {                          // back to the standard thickness for that belt type
    const aid = el.dataset.id;
    FLYING.add(aid); popAlert(el); renderAlerts();
    gooFly(fix, BT.type === arg ? fixTarget(['t-h-num']) : null, () => {
      FLYING.delete(aid);
      delete BT.hBy[arg];
      renderT(); refreshLayouts(); renderAlerts();
      toast(`${BELTS[arg].label} thickness reset to the standard ${len(BELTS[arg].thick, 2)}.`);
    });
    return;
  }
  if (kind === 'set') {                            // a field to the value that works (in mm / teeth / links, as the field reads)
    const [, aid, fid, val] = fix.dataset.fix.split(':'), f = $(fid);
    FLYING.add(aid); popAlert(el); renderAlerts();
    gooFly(fix, fixTarget([fid]), () => {
      FLYING.delete(aid);
      setField(fid, +val); f.dispatchEvent(new Event('input', { bubbles: true }));
      renderAlerts();
      if (FIX_NOTE.has(aid)) toast(FIX_NOTE.get(aid));
    });
    return;
  }
  if (kind === 'chk') {                            // switch a view back on
    const [, aid, fid] = fix.dataset.fix.split(':'), f = $(fid);
    FLYING.add(aid); popAlert(el); renderAlerts();
    gooFly(fix, fixTarget([fid]), () => {
      FLYING.delete(aid);
      f.checked = true; f.dispatchEvent(new Event('change', { bubbles: true }));
      renderAlerts();
      if (FIX_NOTE.has(aid)) toast(FIX_NOTE.get(aid));
    });
    return;
  }
  if (kind === 'tab') { switchTab(arg); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
  if (kind === 'belt') {
    if (BT.type !== arg) { BT.type = arg; setType($('t-type'), arg); pushBelt('type'); }
    if ($('t-h').closest('.panel').hidden) switchTab('belt'); else renderT();
    setTimeout(() => { $('t-h-field').scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }); $('t-h-num').focus({ preventScroll: true }); }, reduceMotion ? 0 : 200);
    return;
  }
  if (kind === 'pn') {                             // a pulley to its smallest working tooth count
    const [, id, nv] = fix.dataset.fix.split(':'), j = +id.slice(1), n = +nv;
    const layoutToo = id[0] === 'l' || DX.link;
    FLYING.add(id); popAlert(el); renderAlerts();
    gooFly(fix, fixTarget([id[0] === 'd' && j === DX.cur && 'd-n', layoutToo && layoutSrc().n[j]]), () => {
      FLYING.delete(id);
      if (id[0] === 'd') {                         // the Pulley DXF pulley (and the layout, when they are linked)
        DX.p[j].v['d-n'] = String(n);
        if (j === DX.cur) setField('d-n', n);
      }
      if (layoutToo) { const el = $(layoutSrc().n[j]); setField(el.id, n); el.dispatchEvent(new Event('input', { bubbles: true })); }
      refreshLayouts(); renderKTabBelt(); renderAlerts();
      toast(`Pulley ${j + 1} set to ${n} teeth.`);
    });
    return;
  }
  if (kind === 'kz') {                             // a sprocket to its smallest working tooth count
    const j = +arg, z = +fix.dataset.fix.split(':')[2], id = `s${j}`;
    FLYING.add(id); popAlert(el); renderAlerts();
    gooFly(fix, fixTarget([j === KS.cur && 'ks-z', KS.link && `ka-z${j + 1}`, KS.link && `kb-z${j + 1}`]), () => {
      FLYING.delete(id);
      KS.s[j].z = z;
      if (KS.link) K[j ? 'z2' : 'z1'] = z;
      kWrite(); ksWrite(); renderKA(); renderKB(true); renderKTab(); renderAlerts();
      toast(`Sprocket ${j + 1} set to ${z} teeth.`);
    });
    return;
  }
  if (kind === 'ks') {                             // a sprocket on the chain page
    const k = +arg;
    if ($('ks-which').closest('.panel').hidden) { KS.cur = k; switchTab('k-spr'); updateInds(); } else if (k !== KS.cur) switchSprocket(k);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }
  const j = +arg;
  if (!$('d-which').closest('.panel').hidden) { if (j !== DX.cur) switchPulley(j); }
  else { readForm(); DX.cur = j; writeForm(); switchTab('dxf'); }
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
});

/* inertia: the pinned stack lags behind a scroll, then springs back into its corner */
const corner = $('corner'), INR = { y: 0, v: 0, last: scrollY, raf: 0, t: 0 };
function inertiaStep(ts) {
  const dt = INR.t ? Math.min(0.033, (ts - INR.t) / 1000) : 0.016;
  INR.t = ts;
  const k = 170, c = 2 * Math.sqrt(k) * 0.42;      // under-damped spring: a small overshoot
  INR.v += (-k * INR.y - c * INR.v) * dt;
  INR.y = Math.max(-44, Math.min(44, INR.y + INR.v * dt));
  if (Math.abs(INR.y) < 0.05 && Math.abs(INR.v) < 0.5) { INR.y = 0; INR.v = 0; INR.raf = 0; INR.t = 0; corner.style.transform = ''; return; }
  corner.style.transform = `translate3d(0, ${INR.y.toFixed(2)}px, 0)`;
  INR.raf = requestAnimationFrame(inertiaStep);
}
window.addEventListener('scroll', () => {
  const dy = scrollY - INR.last;
  INR.last = scrollY;
  if (reduceMotion || !corner.querySelector('.alert, .consent:not([hidden])')) return;
  INR.y = Math.max(-28, Math.min(28, INR.y - dy * 0.18));
  INR.v = Math.max(-700, Math.min(700, INR.v - dy * 1.6));
  if (!INR.raf) INR.raf = requestAnimationFrame(inertiaStep);
}, { passive: true });

/* ---------------- display unit (mm | in) ----------------
   The page reads and writes its length boxes in mm. While inches are shown, each box converts at its own
   value / min / max / step, so the calculators, settings and DXF / STEP output never see an inch. */
const VAL = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const NICE_IN = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1];
const LEN_BOXES = [];
function lenBox(id, isLen = () => true, exact = false) {     // exact: keep the step as is (whole belt / chain pitches)
  const el = $(id), mm = { min: el.getAttribute('min'), max: el.getAttribute('max'), step: el.getAttribute('step') };
  const on = () => UNIT === 'in' && isLen(), show = v => String(+(+v / IN).toFixed(4));
  let mmS = null, inS = null;                                // last value written, so mm survives the round trip exactly
  const inStep = () => exact ? +mm.step / IN : NICE_IN.find(x => x >= +mm.step / IN * 0.99) || 1;
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() {
      const s = VAL.get.call(el);
      if (!on() || s === '') return s;
      if (s === inS) return mmS;
      const v = parseFloat(s);
      return Number.isFinite(v) ? String(+(v * IN).toFixed(6)) : s;
    },
    set(v) {
      mmS = String(v);
      inS = on() && mmS !== '' && Number.isFinite(+mmS) ? show(mmS) : null;
      VAL.set.call(el, inS ?? mmS);
    },
  });
  ['min', 'max'].forEach(k => Object.defineProperty(el, k, {
    configurable: true, get: () => mm[k] ?? '', set(v) { mm[k] = String(v); sync(); },
  }));
  Object.defineProperty(el, 'step', {
    configurable: true, get: () => mm.step == null ? '' : on() ? String(inStep() * IN) : mm.step, set(v) { mm.step = String(v); sync(); },
  });
  function sync() {                                          // the browser's own attributes, in the shown unit
    for (const k of ['min', 'max']) { if (mm[k] == null) continue; el.setAttribute(k, on() ? show(mm[k]) : mm[k]); }
    if (mm.step != null) el.setAttribute('step', on() ? String(+inStep().toFixed(6)) : mm.step);
  }
  LEN_BOXES.push({ el, sync });
}
lenBox('a-len', () => A.unit === 'mm', true);
lenBox('ka-len', () => K.unit === 'mm', true);
['a-allow', 'b-c', 'd-bore', 'd-clear', 'd-flat', 'd-hd', 'd-hp', 'd-fit', 'd-flh', 't-h-num',
  'ka-allow', 'kb-c', 'ks-bore', 'ks-clear', 'ks-flat', 'ks-hd', 'ks-hp', 'ks-fit'].forEach(id => lenBox(id));

function setUnit(u, save) {                               // save: the user switched (animate); else a silent restore
  u = u === 'in' ? 'in' : 'mm';
  const roll = ROLL;
  if (!save) ROLL = false;
  const vals = LEN_BOXES.map(b => b.el.value), shown = LEN_BOXES.map(b => VAL.get.call(b.el));   // mm, and what the box shows
  UNIT = u;
  LEN_BOXES.forEach((b, i) => {                              // boxes slide their new value in (inches are smaller: from above)
    b.el.value = vals[i]; b.sync();
    if (save && VAL.get.call(b.el) !== shown[i]) nudge(b.el, u === 'in' ? -1 : 1);
  });
  $('sys-units').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sys === u)));
  document.querySelectorAll('[data-sys-label]').forEach(b => rollTo(b, u));
  document.querySelectorAll('[data-bkey]').forEach(el => rollTo(el, pitchLabel(BELTS[el.dataset.bkey])));
  const swap = (el, imp) => { if (el.dataset.mm == null) el.dataset.mm = el.textContent; rollTo(el, u === 'in' ? imp(el.dataset.mm) : el.dataset.mm); };
  document.querySelectorAll('[data-in]').forEach(el => swap(el, () => el.dataset.in));
  document.querySelectorAll('label .u:not([id])').forEach(el => swap(el, t => t.replace(/\bmm\b/, 'in')));
  renderA(); renderB(true); renderKA(); renderKB(true);
  renderTab((document.querySelector(`#tabs-${PAGE} .tab[aria-selected="true"]`) || {}).dataset?.tab);
  renderAlerts();
  updateInds();
  if (save && !reduceMotion) {                               // labels inside the drawings fade into their new values
    document.querySelectorAll('.page:not([hidden]) .panel:not([hidden]) svg').forEach(svg => {
      svg.classList.remove('u-swap'); void svg.getBoundingClientRect(); svg.classList.add('u-swap');
      clearTimeout(svg._us); svg._us = setTimeout(() => svg.classList.remove('u-swap'), 650);
    });
  }
  ROLL = roll;
  if (save) scheduleSave();
}
$('sys-units').addEventListener('click', e => {
  const b = e.target.closest('button[data-sys]');
  if (b && b.dataset.sys !== UNIT) setUnit(b.dataset.sys, true);
});

/* ---------------- init ---------------- */
const saved = restoreSettings();
setMotion(!reduceMotion);
$('motion-on').addEventListener('change', e => setMotion(e.target.checked, true));
document.querySelectorAll('[data-menu-for]').forEach(m => { m.innerHTML = menuHTML(m.dataset.menuFor); });
syncStockBox();
const hashTab = location.hash.slice(1);
const startTab = TAB_ORDERS.belt.includes(hashTab) ? hashTab : (saved && TAB_ORDERS.belt.includes(saved.tab) ? saved.tab : 'c2c');
const startKTab = TAB_ORDERS.chain.includes(hashTab) ? hashTab : (saved && TAB_ORDERS.chain.includes(saved.ktab) ? saved.ktab : 'k-c2c');
const startPage = hashTab === 'chain' || TAB_ORDERS.chain.includes(hashTab) ? 'chain'
  : TAB_ORDERS.belt.includes(hashTab) ? 'belt' : (saved && saved.page === 'chain' ? 'chain' : 'belt');
renderA();
renderB(true);                                      // keeps a remembered pick if it still fits
addInd($('a-units'), 'button[aria-pressed="true"]', 'u-ind');
addInd($('sys-units'), 'button[aria-pressed="true"]', 'u-ind');
if (saved && saved.unit === 'in') setUnit('in');
addInd($('d-bore-type'), 'button[aria-pressed="true"]', 'u-ind');
addInd($('d-which'), 'button[aria-pressed="true"]', 'u-ind');
document.querySelectorAll('[data-anim-speed]').forEach(paintRange);
switchTab(startTab, true);
renderKA(); renderKB(true);                        // the chain layouts exist before their tabs are opened
switchTab(startKTab, true);
switchPage(startPage);
enterPanel($('page-' + startPage).querySelector('.panel:not([hidden])'));
setPlaying(ANIM.playing);
window.addEventListener('resize', () => {
  moveInd(); movePageInd(); updateInds();
  if (PAGE === 'belt' && !$('r-svg').closest('.panel').hidden) renderR();
  if (PAGE === 'chain' && !$('kr-svg').closest('.panel').hidden) renderKR();
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { moveInd(); movePageInd(); updateInds(); });
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(entries => entries.forEach(en => {
    const s = en.target;
    if (s._last && s.clientWidth) { if (s._sc) s._sc.tween = false; (s.classList.contains('ksvg') ? drawChainLayout : drawLayout)(s, s._last); }
  }));
  ['a-svg', 'b-svg', 'ka-svg', 'kb-svg'].forEach(id => ro.observe($(id)));
}
if (STORE && !consent) setTimeout(showConsent, 700);
renderAlerts();

