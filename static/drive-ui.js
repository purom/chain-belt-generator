/* Belt & Chain Calculator — The N-pulley drive on the belt page: the pulley list (add, remove, reorder, teeth side or
   backside idler, position) shared by the Center distance, Belt length and Pulley DXF tabs; the animated N-pulley layout
   (the belt runs round the whole loop, every pulley turns at its own speed, backside idlers the other way), dragging
   pulleys in it, and the N-pulley versions of the exports, the True size drawing and the warnings.
   The pulleys are DX.p (app.js), in belt order, and DX.cur is the one selected on every tab. DX.roles names the two whose
   centre distance the calculators solve: role 1 sits at the origin, role 2 on +X at the C2C, and their teeth are the
   Pulley 1 / Pulley 2 boxes of each calculator tab; every other pulley has its own teeth and x / y (mm from role 1, +Y up).
   With the two original toothed pulleys none of this runs and the page works exactly as before.
   Loaded as a classic script before app.js (works from file:// too); nothing here runs until app.js calls driveInit(). */
'use strict';

const ICON_PLUS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
const ICON_UP = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 6 4.5l3 3"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg>';
const ICON_DEL = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg>';
const ROLE_N = { a: ['a-n1', 'a-n2'], b: ['b-n1', 'b-n2'] };
const DRV = { drag: null, res: {}, cache: new Map(), soon: false };

/* ---------------- the pulley list as data ---------------- */
const pTag = p => String(p.name).replace(/^P/, '');
function roleIdx(k) { const i = DX.p.findIndex(p => p.id === DX.roles[k]); return i < 0 ? k : i; }
function roleOf(i) { const id = DX.p[i] && DX.p[i].id; return id === DX.roles[0] ? 0 : id === DX.roles[1] ? 1 : -1; }
/* anything but the original pair (P1 at the origin, P2 at the C2C, both toothed) runs on the N-pulley code */
const driveMulti = () => DX.p.length > 2 || DX.p.some(p => p.side < 0) || DX.p[roleIdx(0)].name !== 'P1' || DX.p[roleIdx(1)].name !== 'P2';
/* the drive as calculator tab `tab` ('a' | 'b') sees it: the role pulleys' teeth from its boxes, the others' from the list */
function drivePulleys(tab) {
  readForm();
  return DX.p.map((p, i) => {
    const k = roleOf(i);
    return { id: p.id, name: p.name, tag: pTag(p), side: p.side, x: +p.x || 0, y: +p.y || 0, role: k + 1,
      N: Math.round(k >= 0 ? num($(ROLE_N[tab][k])) : parseFloat(p.v['d-n'])) };
  });
}
/* every pulley where tab `tab` puts it (role 2 at that tab's C2C) */
function drivePlaced(tab) {
  const o = $(`${tab}-svg`)._last, C = o && Number.isFinite(o.g.C) ? o.g.C : tab === 'b' ? num($('b-c')) || 150 : 150;
  return drivePulleys(tab).map(p => p.role === 1 ? { ...p, x: 0, y: 0 } : p.role === 2 ? { ...p, x: C, y: 0 } : p);
}
/* the answer for a calculator tab (same requests and answers as CALC; kept for the warnings) */
function driveCalc(tab, q) {
  const path = tab === 'b' ? 'belt/length' : 'belt/c2c', req = { ...q, pulleys: drivePulleys(tab) }, key = `${path}|${UNIT}|${JSON.stringify(req)}`;
  let r = DRV.cache.get(key);
  if (!r) {
    r = DRIVE_CALC[path](req);
    if (DRV.cache.size > 40) DRV.cache.clear();
    DRV.cache.set(key, r);
  }
  DRV.res[tab] = r;
  return r;
}
const driveTeethTxt = (tab, sep = ' / ') => drivePulleys(tab).map(p => `${p.N}T`).join(sep);

/* ---------------- the list on screen ---------------- */
function teethOf(where, i) {
  const k = roleOf(i);
  if (where !== 'd' && k >= 0) return Math.round(num($(ROLE_N[where][k])));
  return Math.round(i === DX.cur ? num($('d-n')) : parseFloat(DX.p[i].v['d-n']));
}
function driveBad(where) {
  const o = $(`${where === 'd' ? (lastCalc === 'length' ? 'b' : 'a') : where}-svg`)._last;
  return o && o.g && o.g.drive && !o.g.valid ? o.g : null;
}
function plistRows(where) {
  const bad = driveBad(where), n = DX.p.length;
  return `<ol class="pl-list" aria-label="Pulleys in belt order">${DX.p.map((p, i) => {
    const k = roleOf(i), sel = i === DX.cur, isBad = bad && bad.bad.pulleys.has(i), N = teethOf(where, i);
    const at = k === 0 ? 'origin' : k === 1 ? 'at C2C' : `${fl(p.x, 1)}, ${fl(p.y, 1)}`;
    return `<li class="pl-row${sel ? ' sel' : ''}${isBad ? ' bad' : ''}"${isBad ? ` title="${escT(plain(driveWhy(bad)))}"` : ''}>`
      + `<button type="button" class="pl-pick" data-plpick="${i}" aria-pressed="${sel}"><b>${p.name}</b><span class="pl-n">${Number.isFinite(N) ? N : '—'}T</span><em>${at}</em></button>`
      + `<button type="button" class="pl-side${p.side < 0 ? ' back' : ''}" data-plside="${i}" aria-pressed="${p.side < 0}" title="${p.side < 0 ? 'Backside idler: the belt back runs on it. Click for a toothed pulley.' : 'Toothed pulley: the belt teeth wrap it. Click for a backside idler.'}">${p.side < 0 ? 'back' : 'teeth'}</button>`
      + `<button type="button" class="pl-ic" data-plmv="${i}:-1"${i === 0 ? ' disabled' : ''} aria-label="Move ${p.name} up the belt order">${ICON_UP}</button>`
      + `<button type="button" class="pl-ic" data-plmv="${i}:1"${i === n - 1 ? ' disabled' : ''} aria-label="Move ${p.name} down the belt order">${ICON_DOWN}</button>`
      + `<button type="button" class="pl-ic pl-del" data-pldel="${i}"${n <= 2 ? ' disabled' : ''} aria-label="Remove ${p.name}">${ICON_DEL}</button></li>`;
  }).join('')}</ol>`;
}
/* the selected pulley's teeth and position on the calculator tabs ([html, key]: the box isn't redrawn under the cursor) */
function plistEd(where) {
  const i = DX.cur, p = DX.p[i], k = roleOf(i);
  if (k >= 0) {
    return [`<p class="hint sans pl-note">${p.name} ${k ? `sits on the X axis at the C2C from ${DX.p[roleIdx(0)].name}` : 'sits at the origin'} — its teeth are set above. Added pulleys go anywhere: drag them in the layout or type a position.</p>`, `r${p.id}`];
  }
  const id = `${where}-pl`, v = x => +toU(x).toFixed(dU(2));
  return [`<div class="pl-ed-in">
      <div class="field"><label for="${id}-n">${p.name} <span class="u">teeth</span></label><div class="stepper"><button type="button" data-step="-1" data-for="${id}-n" aria-label="Fewer teeth">−</button><input id="${id}-n" data-pled="n" type="number" inputmode="numeric" min="4" step="1" value="${teethOf(where, i)}" data-snap><button type="button" data-step="1" data-for="${id}-n" aria-label="More teeth">+</button></div></div>
      <div class="field"><label for="${id}-x">X <span class="u">${U()}</span></label><input id="${id}-x" class="inp" data-pled="x" type="number" inputmode="decimal" step="any" value="${v(p.x)}"></div>
      <div class="field"><label for="${id}-y">Y <span class="u">${U()}</span></label><input id="${id}-y" class="inp" data-pled="y" type="number" inputmode="decimal" step="any" value="${v(p.y)}"></div>
    </div>
    <span class="hint sans">From the centre of ${DX.p[roleIdx(0)].name}, +Y up — or drag ${p.name} in the layout below.</span>
    ${where === 'b' ? `<div class="pl-fit"><button type="button" class="btn sm" data-plfit>Fit to stock belt</button><span class="hint sans">Slides ${p.name} straight out from the middle of the drive until the belt is the nearest size on the stock list.</span></div>` : ''}`,
    `f${p.id}|${UNIT}`];
}
function plistFoot(where, show) {
  const add = `<button type="button" class="btn sm icon pl-add" data-pladd${DX.p.length >= DRIVE_MAX ? ' disabled' : ''}>${ICON_PLUS}Add pulley</button>`;
  return add + `<span class="hint sans">${!show ? 'Idlers, tensioners or more pulleys — the belt runs round them in list order.'
    : where === 'd' ? 'Pick a pulley to edit it below · the belt runs round them in list order.' : 'The belt runs round the pulleys in list order.'}</span>`;
}
function plSet(el, html, key = '') {
  if (key && el.dataset.key === key && el.contains(document.activeElement)) return;   // being typed in
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
  el.dataset.key = key;
  el.hidden = !html;
}
function plistRender() {
  DRV.soon = false;
  const multi = driveMulti();
  driveLabels();
  document.querySelectorAll('[data-plist]').forEach(box => {
    const where = box.dataset.plist, show = where === 'd' || multi, [rows, ed, foot] = box.children;
    plSet(rows, show ? plistRows(where) : '');
    const [eh, ek] = show && where !== 'd' ? plistEd(where) : ['', ''];
    plSet(ed, eh, ek);
    plSet(foot, plistFoot(where, show));
  });
}
function plistSoon() { if (!DRV.soon) { DRV.soon = true; queueMicrotask(plistRender); } }
/* the calculator tabs' Pulley 1 / Pulley 2 boxes are labelled after the pulleys that hold those roles */
function driveLabels() {
  [0, 1].forEach(k => {
    const t = `Pulley ${pTag(DX.p[roleIdx(k)])} `;
    ['a', 'b'].forEach(w => {
      const l = document.querySelector(`label[for="${ROLE_N[w][k]}"]`), n = l && l.firstChild;
      if (n && n.nodeType === 3 && n.textContent !== t) n.textContent = t;
    });
  });
}

/* ---------------- changing the list ---------------- */
function driveChanged() {
  writeForm();
  renderA(); renderB(true);
  const t = (document.querySelector('#tabs-belt .tab[aria-selected="true"]') || {}).dataset?.tab;
  if (t && t !== 'c2c' && t !== 'length') renderTab(t);
  plistRender();
  scheduleCheck(); scheduleSave();
}
function drivePick(i) {
  if (!DX.p[i]) return;
  if (i !== DX.cur) switchPulley(i);
  plistRender();
}
function driveSide(i) {
  readForm();
  DX.p[i].side = DX.p[i].side < 0 ? 1 : -1;
  driveChanged();
}
function driveMove(i, d) {
  const j = i + d;
  if (j < 0 || j >= DX.p.length) return;
  readForm();
  const cur = DX.p[DX.cur].id;
  [DX.p[i], DX.p[j]] = [DX.p[j], DX.p[i]];
  DX.cur = DX.p.findIndex(p => p.id === cur);
  driveChanged();
}
/* a free spot for a new pulley: out from the loop, between the last pulley and the first (where the belt goes next) */
function driveSpot(np) {
  const tab = lastCalc === 'length' ? 'b' : 'a', o = $(`${tab}-svg`)._last, belt = o ? o.belt : BELTS[tab === 'b' ? B.type : A.type];
  const ps = drivePlaced(tab), n = ps.length, R = p => driveBodyR(belt, p.N, p.side), Rn = R(np);
  const a = ps[n - 1], b = ps[0];
  let A2 = 0;
  ps.forEach((p, i) => { const q = ps[(i + 1) % n]; A2 += p.x * q.y - q.x * p.y; });
  let dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy);
  if (dl < 1e-6) { dx = 1; dy = 0; dl = 1; }
  const s = A2 < 0 ? -1 : 1, out = [s * dy / dl, -s * dx / dl], mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  const clear = 2 * belt.thick + 4, base = Math.max(R(a), R(b)) + Rn + clear, cands = [];
  for (const f of [1, 1.35, 1.8, 2.5, 3.5]) for (const along of [0, 0.25, -0.25]) cands.push([mid[0] + out[0] * base * f + dx * along, mid[1] + out[1] * base * f + dy * along]);
  const free = c => ps.every(p => Math.hypot(p.x - c[0], p.y - c[1]) > R(p) + Rn + clear);
  const works = c => driveSolve(belt, [...ps, { ...np, x: c[0], y: c[1] }]).valid;
  const c = cands.find(x => free(x) && works(x)) || cands.find(free) || cands[0];
  return [+c[0].toFixed(1), +c[1].toFixed(1)];
}
function driveAdd() {
  if (DX.p.length >= DRIVE_MAX) return;
  readForm();
  const src = DX.p[DX.cur], tab = lastCalc === 'length' ? 'b' : 'a', k = roleOf(DX.cur);
  const np = JSON.parse(JSON.stringify(src));              // same bore, holes, fit, flange … and the same side
  const N = Math.round(k >= 0 ? num($(ROLE_N[tab][k])) : parseFloat(src.v['d-n']));
  np.v['d-n'] = String(Number.isFinite(N) && N >= 4 ? N : 20);
  np.id = `p${Math.max(0, ...DX.p.map(p => parseInt(p.id.slice(1), 10) || 0)) + 1}`;
  for (let j = 1; ; j++) if (!DX.p.some(p => p.name === `P${j}`)) { np.name = `P${j}`; break; }
  [np.x, np.y] = driveSpot({ N: +np.v['d-n'], side: np.side });
  DX.p.push(np);
  DX.cur = DX.p.length - 1;
  driveChanged();
  toast(`${np.name} added — drag it in the layout, or set its teeth, position and side in the list.`);
}
/* removing P1 or P2's stand-in hands its role to the next pulley in belt order; the drive is turned so the two role
   pulleys sit on the X axis again, and nothing else moves */
function driveDelete(i) {
  if (DX.p.length <= 2) return;
  readForm();
  const tab = lastCalc === 'length' ? 'b' : 'a', pos = drivePlaced(tab), gone = DX.p[i], k = roleOf(i);
  const keep = DX.cur === i ? null : DX.p[DX.cur].id;
  if (k >= 0) {
    const n = DX.p.length, other = DX.roles[1 - k];
    let heir = null;
    for (let d = 1; d < n && !heir; d++) { const c = DX.p[(i + d) % n]; if (c.id !== other) heir = c; }
    const hn = Math.round(parseFloat(heir.v['d-n']));
    ['a', 'b'].forEach(w => { $(ROLE_N[w][k]).value = hn; });
    DX.roles[k] = heir.id;
    const at = id => pos[DX.p.findIndex(p => p.id === id)], o = at(DX.roles[0]), t = at(DX.roles[1]);
    const ang = Math.atan2(t.y - o.y, t.x - o.x), c = Math.cos(ang), s = Math.sin(ang);
    DX.p.forEach((p, j) => {
      const dx = pos[j].x - o.x, dy = pos[j].y - o.y;
      p.x = +(dx * c + dy * s).toFixed(3); p.y = +(-dx * s + dy * c).toFixed(3);
    });
    $('b-c').value = +Math.hypot(t.x - o.x, t.y - o.y).toFixed(3);
  }
  DX.p.splice(i, 1);
  DX.cur = keep ? DX.p.findIndex(p => p.id === keep) : Math.min(i, DX.p.length - 1);
  driveChanged();
  toast(`${gone.name} removed.`);
}
function driveEdit(el) {
  const p = DX.p[DX.cur], v = num(el);
  if (!p || roleOf(DX.cur) >= 0 || !Number.isFinite(v)) return;
  if (el.dataset.pled === 'n') { p.v['d-n'] = String(Math.round(v)); $('d-n').value = Math.round(v); }
  else p[el.dataset.pled] = +(v * (UNIT === 'in' ? IN : 1)).toFixed(4);
  driveChanged();
}
/* Belt length tab: move the selected added pulley straight out from the middle of the drive (bisection) until the belt is
   the stock length nearest to it now */
function driveFitStock() {
  const i = DX.cur, p = DX.p[i], belt = BELTS[B.type], Ct = num($('b-c'));
  if (roleOf(i) >= 0 || !(Ct > 0)) return;
  const ps = drivePulleys('b').map(q => q.role === 1 ? { ...q, x: 0, y: 0 } : q.role === 2 ? { ...q, x: Ct, y: 0 } : q), g = driveSolve(belt, ps);
  if (!g.valid) { toast('Set up a drive the belt can go round first.'); return; }
  const list = stockList(B.type).filter(L => Math.abs(L / belt.pitch - Math.round(L / belt.pitch)) < 1e-6);
  if (!list.length) { toast(`The ${belt.label} stock list is empty.`); return; }
  const Lt = list.reduce((a, v) => Math.abs(v - g.L) < Math.abs(a - g.L) ? v : a);
  const cx = ps.reduce((s, q) => s + q.x, 0) / ps.length, cy = ps.reduce((s, q) => s + q.y, 0) / ps.length;
  let dx = ps[i].x - cx, dy = ps[i].y - cy, d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
  const hit = driveFit(belt, ps, i, [dx / d, dy / d], Lt);
  if (!hit) { toast(`${p.name} can't reach the ${lenR(Lt)} stock belt along that line — move it by hand.`); return; }
  const moved = Math.hypot(hit.x - p.x, hit.y - p.y);
  p.x = +hit.x.toFixed(4); p.y = +hit.y.toFixed(4);
  B.selL = Lt; B.flash = true;
  driveChanged();
  toast(`${p.name} moved ${len(moved, 2)} — the belt is now the ${Math.round(Lt / belt.pitch)}T (${lenR(Lt)}) stock size.`);
}

/* ---------------- results ---------------- */
/* the per-pulley table and the belt numbers (instead of kvHTML's two-pulley grid) */
function driveKvHTML(belt, g, stock) {
  const p1 = g.ps.find(p => p.role === 1) || g.ps[0], L = g.L;
  const near = stock && stock.length ? stock.reduce((a, v) => Math.abs(v - L) < Math.abs(a - L) ? v : a) : null;
  const spans = g.spans.filter(Boolean).map(s => s.len);
  const rows = g.ps.map(p => {
    const idl = p.side < 0, rel = (idl ? -1 : 1) * p1.N / p.N;
    return `<tr data-plpick="${p.i}" tabindex="0"><td>${p.name}${idl ? '<span class="tag">back</span>' : ''}</td><td>${p.N}T</td>`
      + `<td data-k="dp${p.id}">${fl(2 * p.r, 2)}</td><td data-k="do${p.id}">${fl(2 * p.R, 2)}</td><td data-k="dw${p.id}">${f(deg(g.wrap[p.i]), 1)}°</td>`
      + `<td data-k="dm${p.id}">${idl ? '—' : f(g.tim[p.i], 1)}</td><td data-k="dr${p.id}">${rel < 0 ? '−' : ''}${f(Math.abs(rel), 3)}×</td></tr>`;
  }).join('');
  return `<div>
      <div class="sub-h">Pulleys <small>in belt order · speed relative to ${p1.name}, − = turns the other way</small></div>
      <div class="tbl"><table class="opts drv"><thead><tr><th>Pulley</th><th>Teeth</th><th data-k="dth1">Pitch Ø ${U()}</th><th data-k="dth2">OD ${U()}</th><th>Wrap</th><th>In mesh</th><th>Speed</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    </div>
    ${kvGrid([
      ['Belt pitch', `${lenR(belt.pitch)}`, rawL(belt.pitch)],
      ['Pitch length', `${len(L, 2)}`, fl(L, 2)],
      ['Belt teeth', f(L / belt.pitch, 2), f(L / belt.pitch, 2)],
      ['Nearest stock', near ? `${lenR(near)} · ${Math.round(near / belt.pitch)}T` : '—', near ? rawL(near) : null],
      ['Shortest span', spans.length ? `${len(Math.min(...spans), 2)}` : '—', spans.length ? fl(Math.min(...spans), 2) : null],
      ['Closest ODs', `${len(g.gap, 2)}`, fl(g.gap, 2)],
    ])}`;
}
/* Pulley DXF tab, a backside idler: a smooth roller under the belt back */
function driveIdlerD(belt, N, st, fail) {
  const res = $('d-results'), d = idlerDoc(belt, N, st), p = DX.p[DX.cur];
  if (d.error) return fail("Can't build this idler", emph(d.error));
  const part = d.part, name = `idler_${belt.key}_${N}T${boreHoleTag(st)}.dxf`, [bl, bc] = boreLabel(st);
  DX.doc = { part, flR: d.flR, fx: d.fx, belt, N, st, name, idler: true };
  const notes = [['info', `Backside idler: a smooth roller that runs on the belt back and turns the other way. Rim Ø = belt pitch-line Ø (teeth × pitch / π) − 2 × ${lenR(+beltBack(belt).toFixed(4))} (pitch line to belt back).`]];
  if (d.flR) notes.push(['info', 'Flange disc is placed beside the roller as a separate part (FLANGE layer), with the same bore and holes.']);
  if (st.clear) notes.push(['info', `Bore clearance ${sgnL(st.clear, 2)} per side — the bore is cut at ${len(st.boreSize, 3)}.`]);
  res.innerHTML = `
    <div class="hero">
      <div class="hero-label" data-k="hl">Pulley ${pTag(p)} · backside idler · rim Ø · ${N}T ${belt.label}</div>
      <div class="hero-value"><span class="num" data-k="hero" data-v="${toU(part.od)}" data-d="${dU(3)}">${fl(part.od, 3)}</span><small data-k="hu">${U()}</small></div>
      <div class="hero-sub" data-k="sub">belt pitch line Ø ${len(part.pd, 3)} · ${alt(part.od)} rim</div>
      <button type="button" class="btn sm copy" data-copy="${fl(part.od, 3)}">Copy</button>
    </div>
    <div class="dl">
      <button type="button" class="btn primary icon" data-dl-dxf>${ICON_DL}Download DXF</button>
      <button type="button" class="btn icon" data-dl-both>${ICON_PUL}${DX.p.length > 2 ? 'All pulleys' : 'Both pulleys'}</button>
      <span class="hint">${name} · R12 · mm · ${[...new Set(d.ents.map(e => e.layer))].join(', ')}</span>
    </div>
    ${kvGrid([
      ['Rim Ø', `${len(part.od, 3)}`, fl(part.od, 3)],
      ['Belt pitch line Ø', `${len(part.pd, 3)}`, fl(part.pd, 3)],
      ['Pitch line → back', `${len(beltBack(belt), 3)}`, fl(beltBack(belt), 3)],
      ['Mount holes', st.holes ? `${st.holes.n} × Ø${rawL(+st.holes.d.toFixed(2))} on Ø${lenR(+st.holes.pcd.toFixed(2))}` : '—', st.holes ? rawL(+st.holes.pcd.toFixed(3)) : null],
      ['Bore', bl, bc],
      ['Flange Ø', d.flR ? `${len(2 * d.flR, 2)}` : '—', d.flR ? fl(2 * d.flR, 2) : null],
    ])}
    ${notesHTML(notes)}
    ${asmHTML()}`;
  rollNumbers(res);
  animateHero(res);
  rollTo($('d-viz-meta'), `${belt.label} · ${N}T backside idler · ${bl === 'none' ? 'no bore' : bl}${st.holes ? ` · ${st.holes.n} holes` : ''}`);
  drawProfile(DX.doc);
}
/* the drive of a layout at the C2C its exports use (the Center distance tab's includes the tension allowance) */
const driveExportGeo = (o, belt) => (o.g.valid ? driveAt(belt || o.belt, o.g.ps, o.labelC) : null);
function driveSave(build, o = {}) {
  const file = build();
  if (!file) return;
  if (file.error) { toast(plain(file.error)); return; }
  download(file.name, file.text, o.type || 'application/dxf');
  toast(`Saved ${file.name}`);
}
/* Export DXF menu / assembly buttons for an N-pulley layout */
function driveExport(src, what) {
  const o = $(src)._last, belt = o.belt, bt = { ...belt, thick: beltThick(belt) }, g = driveExportGeo(o, bt);
  if (!g || !g.valid) { toast('No valid layout to export.'); return; }
  driveSave(() => {
    const doc = driveLayoutDoc(bt, g, DX.p.map((_, i) => dxfSettings(i)), what);
    if (doc.error) return doc;
    const c = `C${o.labelC.toFixed(2)}`, part = partNo(belt, doc.bo.Nt * belt.pitch, beltW(belt.key)), set = g.ps.map(p => `${p.N}T`).join('-');
    const name = { assembly: `assembly_${belt.key}_${set}_${part}_${c}`, belt: `belt_${belt.key}_${part}_${c}`, pulleys: `pulleys_${belt.key}_${set}_${c}` }[what] + '.dxf';
    return { name, text: toDXF(doc.ents) };
  });
}
function driveAsmHTML(src, o) {
  const g = driveExportGeo(o);
  if (!g || !g.valid) return '';
  const Nt = Math.round(g.L / o.belt.pitch);
  return `<div class="asm">
      <div class="asm-top"><span class="pick-label">Belt &amp; assembly</span><span class="hint sans">from the ${src === 'b-svg' ? 'Belt length' : 'Center distance'} tab</span></div>
      <div class="asm-main">${o.belt.label} · ${g.ps.map(p => `${p.N}T`).join(' + ')} · ${Nt}T belt<span class="part">${partNo(o.belt, Nt * o.belt.pitch, beltW(o.belt.key))}</span><span class="asm-sub" data-k="asm">C2C ${len(o.labelC, 3)}</span></div>
      <div class="asm-btns">
        <button type="button" class="btn primary icon" data-export="assembly" data-src="${src}">${ICON_ASM}Assembly</button>
        <button type="button" class="btn icon" data-export="belt" data-src="${src}">${ICON_BELT}Belt only</button>
        <button type="button" class="btn icon" data-export="pulleys" data-src="${src}">${ICON_PUL}Pulleys only</button>
      </div>
    </div>`;
}
/* True size tab: the assembly at 1:1 → { ents, bo, layers, overD, set, notes } */
function driveTrueSize(o, belt, showPitch) {
  const g = driveExportGeo(o, belt), notes = [], sts = DX.p.map((_, i) => dxfSettings(i));
  if (!g || !g.valid) return { error: `The belt can't go round the pulleys at ${len(o.labelC, 2)} C2C (tension allowance included).` };
  let doc = driveLayoutDoc(belt, g, sts, 'assembly');
  if (doc.error) { notes.push(['warn', `${doc.error} — showing the belt only (fix it on the Pulley DXF tab).`]); doc = driveLayoutDoc(belt, g, sts, 'belt'); }
  const ents = doc.ents.slice();
  if (showPitch) ents.push({ type: 'poly', layer: 'PITCH', verts: driveLoopVerts(g, 0) }, ...g.ps.map(p => ({ type: 'circle', layer: 'PITCH', c: [p.x, p.y], r: p.r })));
  return { ents, bo: doc.bo, notes, layers: g.ps.map(p => `PULLEY_${p.tag}`), set: g.ps.map(p => `${p.N}T`).join(' + '),
    overD: back => polyPath(driveLoopVerts(g, back), Q3) };
}
/* warnings for an N-pulley layout the calculator tabs can't solve, with the value that fixes it */
function driveLayoutProblems() {
  const tab = lastCalc === 'length' ? 'b' : 'a', r = DRV.res[tab], out = [];
  if (!r || !r.error || r.code === 'input') return out;
  if (tab === 'b') {
    const Ct = num($('b-c')), acts = [];
    if (r.min_c) { const need = roundUp(r.min_c); acts.push(setAct('b', 'b-c', need, len(need, 1), `Target C2C set to ${len(need, 1)}.`)); }
    out.push({ id: 'b', dkey: `b|drive|${B.type}|${plain(r.error)}`, title: `${r.code === 'overlap' ? 'Pulleys overlap' : r.code === 'none' ? 'No belt fits' : 'Belt path can’t be built'} · C2C ${len(Ct, 1)}`,
      msg: plain(r.error), acts: [...acts, ...tabAct('length', 'Belt length')] });
  } else if (r.code === 'too_short') {
    const p = BELTS[A.type].pitch, m = r.min_teeth, Lm = +(m * p).toFixed(4);
    out.push({ id: 'a', dkey: `a|drive|${A.type}|${r.teeth}|${m}`, title: `Belt too short · ${r.teeth}T`, msg: plain(r.error),
      acts: [setAct('a', 'a-len', A.unit === 'teeth' ? m : Lm, A.unit === 'teeth' ? `${m}T` : lenR(Lm), `Belt length set to ${m}T (${lenR(Lm)}).`), ...tabAct('c2c', 'Center distance')] });
  } else {
    out.push({ id: 'a', dkey: `a|drive|${plain(r.error)}`, title: 'Belt path can’t be built', msg: plain(r.error), acts: tabAct('c2c', 'Center distance') });
  }
  return out;
}

/* ---------------- the animated N-pulley layout ---------------- */
/* a backside idler's artwork: smooth rim + the bore / holes chosen on the Pulley DXF tab (cached with the pulley bodies) */
function idlerBody(belt, N, j) {
  const st = dxfSettings(j), key = `idler|${belt.key}|${N}|${st.bore}|${st.boreSize}|${st.holes ? Object.values(st.holes).join(',') : ''}`;
  if (bodyCache.has(key)) return bodyCache.get(key);
  const R = Math.max(0.5, pitchDia(N, belt.pitch) / 2 - beltBack(belt));
  const pp = holesOK(st.holes) && (st.bore === 'none' || st.boreSize > 0) ? idlerParts(belt, N, { ...st, fit: 0 }) : { error: 1 };
  let bore = pp.error ? borePoly(st.bore, st.boreSize, st.boreFlat) : pp.bore;
  if (bore && bore.bad) bore = null;
  const holes = pp.error ? [] : pp.holes;
  if (st.bore !== 'none' && (!bore || bore.ext > R - MIN_WALL)) { const rr = Math.max(R * 0.08, 0.6); bore = { kind: 'round', r: rr, ext: rr }; }
  const hub = Math.min(R * 0.7, Math.max((bore ? bore.ext : 0) * 1.7, R * 0.4));
  const html = `<path d="${circlePath(R)} ${borePath(bore)} ${holes.map(h => circlePath(h.r, h.c[0], -h.c[1])).join(' ')}" class="p-body p-idler" fill-rule="evenodd" ${NS} stroke-width="1"/>`
    + (holes.length ? '' : `<circle r="${Q3(hub)}" class="p-hub" ${NS} stroke-width="1"/>`)
    + `<line x1="0" y1="${Q3(-hub)}" x2="0" y2="${Q3(-R * 0.85)}" class="p-mark" ${NS} stroke-width="2"/>`;
  if (bodyCache.size > 60) bodyCache.clear();
  bodyCache.set(key, html);
  return html;
}
function driveFitView(svg, belt, ps) {
  const T = beltThick(belt), cw = svg.clientWidth || 800, ch = svg.clientHeight || 320;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;           // screen coordinates (y down)
  ps.forEach(p => { const e = p.r + T; x0 = Math.min(x0, p.x - e); x1 = Math.max(x1, p.x + e); y0 = Math.min(y0, -p.y - e); y1 = Math.max(y1, -p.y + e); });
  const scale = Math.max(1e-6, Math.min((cw - 40) / (x1 - x0), (ch - 80) / (y1 - y0))), fs = 12.5 / scale;
  let l = x0 - fs * 1.2, r = x1 + fs * 1.2;                                    // room for the labels over the pulleys
  ps.forEach(p => { l = Math.min(l, p.x - fs * 5.8); r = Math.max(r, p.x + fs * 5.8); });
  const top = y0 - fs * 2.3;
  return [l, top, r - l, y1 + fs * 3.9 - top];
}
/* entry point from drawLayout for N-pulley geometry: o = { belt, N1, N2, g, labelC }. While the pulleys can't carry a
   belt, they are drawn where they are (the offending ones and spans in red) with the last belt that worked. */
function drawDriveLayout(svg, o) {
  svg._last = o;
  if (!svg._sc || !svg._sc.drive) svg._sc = { drive: true, s: 0, psi: {} };
  const sc = svg._sc, { belt, g } = o, prev = sc.tgt;
  const labelC = Number.isFinite(o.labelC) ? o.labelC : g.C, ids = g.ps.map(p => `${p.id}:${p.side}`).join(',');
  if (g.valid) sc.good = g;
  const tgt = { belt, g, labelC, ids, ps: g.ps.map(p => ({ id: p.id, x: p.x, y: p.y, r: p.r })) };
  const changed = sc.refit || !prev || prev.belt !== belt || prev.ids !== ids || Math.abs(prev.labelC - labelC) > 1e-9
    || tgt.ps.some((p, i) => Math.abs(p.x - prev.ps[i].x) > 1e-9 || Math.abs(p.y - prev.ps[i].y) > 1e-9 || Math.abs(p.r - prev.ps[i].r) > 1e-9);
  const dragging = DRV.drag && DRV.drag.svg === svg, visible = svg.clientWidth > 0 && !svg.closest('.panel').hidden;
  sc.refit = false;
  sc.tgt = tgt;
  sc.tgtVb = dragging && sc.cur ? sc.cur.vb : driveFitView(svg, belt, tgt.ps);
  const tr = g.ps.filter(p => p.side > 0).map(p => p.r);
  sc.v = 2 * Math.PI * Math.min(...(tr.length ? tr : g.ps.map(p => p.r))) * 0.3;    // belt speed at 1×: smallest pulley ≈ 0.3 rev/s
  if (!changed && sc.tween) return;
  if (changed && prev && prev.ids === ids && sc.cur && visible && !dragging && !reduceMotion) {
    sc.from = { ps: sc.cur.ps.map(p => ({ ...p })), vb: sc.cur.vb.slice(), labelC: sc.cur.labelC };
    sc.t0 = performance.now();
    sc.tween = true;
    ensureLoop();
    return;
  }
  sc.tween = false;
  sc.cur = { ps: tgt.ps, vb: sc.tgtVb, labelC };
  driveSceneBuild(svg);
  driveSceneTick(svg, 0);
}
function driveSceneBuild(svg) {
  const sc = svg._sc, t = sc.tgt, c = sc.cur, belt = t.belt, g = t.g, [x0, y0, w, h] = c.vb;
  svg.setAttribute('viewBox', `${Q3(x0)} ${Q3(y0)} ${Q3(w)} ${Q3(h)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const scale = Math.min((svg.clientWidth || 800) / w, (svg.clientHeight || 320) / h), fs = 12.5 / scale, T = beltThick(belt);
  // the belt: this frame's geometry while gliding, else the target if the belt fits round it, else the last one that did
  let bg = null;
  if (sc.tween) { const gt = driveSolve(belt, g.ps.map((p, i) => ({ ...p, x: c.ps[i].x, y: c.ps[i].y, rp: c.ps[i].r }))); if (gt.valid) bg = gt; }
  else if (g.valid) bg = g;
  if (!bg) bg = sc.tween && sc.bg ? sc.bg : sc.good || null;
  sc.bg = bg;
  sc.ghost = !!bg && !g.valid && !sc.tween;
  sc.toothed = belt.pitch * scale >= 4;
  const P = c.ps, sel = DX.p[DX.cur] && DX.p[DX.cur].id;
  const bodies = P.map((cp, i) => {
    const p = g.ps[i], free = !p.role;
    return `<g class="dv-pul${free ? ' dv-drag' : ''}" data-dpi="${i}" transform="translate(${Q3(cp.x)} ${Q3(-cp.y)})"><g class="spin"><g transform="scale(${(cp.r / p.r).toFixed(5)})">${
      p.side < 0 ? idlerBody(belt, p.N, i) : pulleyBody(belt, p.N, i)}</g></g></g>`;
  }).join('');
  const over = Math.max(0, T - belt.thick);
  let beltEl = '';
  if (bg) {
    const gh = sc.ghost ? ' dv-ghost' : '';
    if (sc.toothed) {
      beltEl = `<path class="belt-solid${gh}" fill-rule="evenodd" ${NS} stroke-width="1"/>` + (over > 1e-6 ? `<path class="belt-over${gh}" fill-rule="evenodd" ${NS} stroke-width="1"/>` : '');
    } else {
      const d = polyPath(driveLoopVerts(bg, 0), Q3), bw = Math.max(T, 3 / scale);
      beltEl = `<path d="${d}" class="belt${gh}" stroke-width="${Q3(bw)}"/>`
        + `<path d="${d}" class="belt-teeth${gh}" stroke-width="${Q3(bw * 0.42)}" pathLength="${Q3(bg.L / belt.pitch)}" stroke-dasharray="0.5 0.5"/>`;
      if (over > 1e-6) { const ow = bw * over / T; beltEl += `<path d="${polyPath(driveLoopVerts(bg, bw / 2 - ow / 2), Q3)}" class="belt-over-s${gh}" stroke-width="${Q3(ow)}"/>`; }
    }
  }
  let marks = '';
  P.forEach((cp, i) => {
    const p = g.ps[i], ext = cp.r + T, q = Q3(ext + fs * 0.5), X = Q3(cp.x), Y = Q3(-cp.y);
    marks += `<g transform="translate(${X} ${Y})"><circle r="${Q3(cp.r)}" class="p-pitch" ${NS} stroke-width="1"/>`
      + `<line x1="${-q}" x2="${q}" y1="0" y2="0" class="cross" ${NS} stroke-width="1"/><line y1="${-q}" y2="${q}" x1="0" x2="0" class="cross" ${NS} stroke-width="1"/>`
      + (g.bad.pulleys.has(i) ? `<circle r="${Q3(Math.max(ext, p.R + fs * 0.2))}" class="dv-bad" ${NS} stroke-width="1.6"/>` : '')
      + (p.id === sel ? `<circle r="${Q3(ext + fs * 0.35)}" class="dv-sel" ${NS} stroke-width="1.4"/>` : '') + '</g>'
      + `<text x="${X}" y="${Q3(-cp.y - ext - fs * 0.9)}" text-anchor="middle" font-size="${Q3(fs)}"><tspan class="${p.side < 0 ? 'pi' : 'pl'}">${p.name}</tspan> · <tspan class="lt">${p.N}T</tspan> · ${p.side < 0 ? `idler Ø${fl(2 * p.R, 1)}` : `Ø${fl(2 * p.r, 2)}`}</text>`;
  });
  // spans that stop the loop, in red (a dashed centre line where there is no tangent at all)
  g.bad.spans.forEach(k => {
    const S = g.spans[k], A = g.q[k], B = g.q[(k + 1) % g.n], a = S ? S.a : [c.ps[A.i].x, c.ps[A.i].y], b = S ? S.b : [c.ps[B.i].x, c.ps[B.i].y];
    marks += `<line x1="${Q3(a[0])}" y1="${Q3(-a[1])}" x2="${Q3(b[0])}" y2="${Q3(-b[1])}" class="dv-span-bad"${S ? '' : ' stroke-dasharray="4 3"'} ${NS} stroke-width="2"/>`;
  });
  // the C2C the calculators solve, under the drawing, between the two role pulleys (both on the X axis)
  const i1 = g.ps.findIndex(p => p.role === 1), i2 = g.ps.findIndex(p => p.role === 2);
  if (i1 >= 0 && i2 >= 0) {
    const xa = P[i1].x, xb = P[i2].x, low = Math.max(...P.map(cp => -cp.y + cp.r + T)), dy = low + fs * 1.6, a = fs * 0.6, sg = xb >= xa ? 1 : -1;
    marks += `<line x1="${Q3(xa)}" x2="${Q3(xa)}" y1="${Q3(P[i1].r + T + fs * 0.3)}" y2="${Q3(dy + fs * 0.5)}" class="ext" ${NS} stroke-width="1"/>`
      + `<line x1="${Q3(xb)}" x2="${Q3(xb)}" y1="${Q3(P[i2].r + T + fs * 0.3)}" y2="${Q3(dy + fs * 0.5)}" class="ext" ${NS} stroke-width="1"/>`
      + `<line x1="${Q3(xa + sg * a)}" x2="${Q3(xb - sg * a)}" y1="${Q3(dy)}" y2="${Q3(dy)}" class="dim" ${NS} stroke-width="1.2"/>`
      + `<path d="M${Q3(xa)},${Q3(dy)} l${Q3(sg * a)},${Q3(-a * 0.38)} v${Q3(a * 0.76)} Z" class="arrow"/>`
      + `<path d="M${Q3(xb)},${Q3(dy)} l${Q3(-sg * a)},${Q3(-a * 0.38)} v${Q3(a * 0.76)} Z" class="arrow"/>`
      + `<text x="${Q3((xa + xb) / 2)}" y="${Q3(dy + fs * 1.45)}" text-anchor="middle" font-size="${Q3(fs)}" class="dimt">C2C ${len(c.labelC, 3)} · ${g.ps[i1].name}–${g.ps[i2].name}</text>`;
  }
  svg.innerHTML = bodies + beltEl + marks;
  sc.els = { spin: svg.querySelectorAll('.spin'), belt: svg.querySelector('.belt-solid'), over: svg.querySelector('.belt-over'), teeth: svg.querySelector('.belt-teeth') };
}
/* per frame: the teeth slide along the loop, toothed pulleys turn locked in mesh with them (speed ∝ 1 / teeth) and
   backside idlers turn the other way at the same belt speed */
function driveSceneTick(svg, ds) {
  const sc = svg._sc;
  if (!sc || !sc.els) return;
  const t = sc.tgt, c = sc.cur, belt = t.belt, bg = sc.bg;
  let ph = null;
  if (bg) {
    if (sc.toothed && sc.els.belt) {
      const T = beltThick(belt);
      ph = driveOutline(T === belt.thick ? belt : { ...belt, thick: T }, bg, sc.s);
      sc.els.belt.setAttribute('d', polyPath(ph.outer, Q3) + polyPath(ph.inner, Q3));
      if (sc.els.over) sc.els.over.setAttribute('d', polyPath(ph.outer, Q3) + polyPath(driveLoopVerts(bg, ph.tg.back - (T - belt.thick)), Q3));
    } else {
      const Nt = Math.max(3, Math.round(bg.L / belt.pitch)), pe = bg.L / Nt;
      ph = { g: bg, pe, sOff: ((sc.s % pe) + pe) % pe };
      if (sc.els.teeth) sc.els.teeth.setAttribute('stroke-dashoffset', Q3(-ph.sOff / pe));
    }
  }
  const locked = ph && !sc.ghost;
  c.ps.forEach((cp, i) => {
    const p = t.g.ps[i];
    let a = sc.psi[p.id] || 0;
    if (p.side < 0) a -= ds / cp.r;
    else {
      const pred = a + ds / cp.r;
      if (locked) { const step = 2 * Math.PI / p.N, A = drivePhase(ph, i); a = A + step * Math.round((pred - A) / step); } else a = pred;
    }
    sc.psi[p.id] = a;
    const el = sc.els.spin[i];
    if (el) el.setAttribute('transform', `rotate(${Q3(-deg(a) % 360)})`);
  });
}
/* called by app.js frame() for an N-pulley layout; adv = belt advance factor this frame. → still gliding? */
function driveFrame(svg, ts, adv) {
  const sc = svg._sc;
  let tweening = false;
  if (sc.tween) {
    const k = Math.min(1, Math.max(0, (ts - sc.t0) / TWEEN_MS)), e = ease(k), fr = sc.from, t = sc.tgt;
    sc.cur = { ps: t.ps.map((p, i) => ({ id: p.id, x: lerp(fr.ps[i].x, p.x, e), y: lerp(fr.ps[i].y, p.y, e), r: lerp(fr.ps[i].r, p.r, e) })),
      vb: fr.vb.map((v, i) => lerp(v, sc.tgtVb[i], e)), labelC: lerp(fr.labelC, t.labelC, e) };
    if (k >= 1) sc.tween = false; else tweening = true;
    driveSceneBuild(svg);
  }
  const ds = sc.v * adv;
  sc.s += ds;
  driveSceneTick(svg, ds);
  return tweening;
}

/* dragging: click a pulley to select it; added pulleys can be dragged, with the layout following live */
const svgPoint = (svg, e) => { const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return [q.x, -q.y]; };
function driveDragWire(svg) {
  const tab = svg.id[0], render = () => (tab === 'b' ? renderB(true) : renderA());
  svg.addEventListener('pointerdown', e => {
    const sc = svg._sc, el = e.target.closest('[data-dpi]');
    if (!sc || !sc.drive || !el || e.button > 0) return;
    const i = +el.dataset.dpi, p = DX.p[i];
    if (!p) return;
    e.preventDefault();
    if (i !== DX.cur) drivePick(i);
    if (roleOf(i) >= 0) return;                     // the role pulleys sit where the calculators put them
    const m = svgPoint(svg, e);
    DRV.drag = { svg, id: p.id, dx: p.x - m[0], dy: p.y - m[1], moved: false };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', e => {
    const d = DRV.drag;
    if (!d || d.svg !== svg) return;
    const m = svgPoint(svg, e), p = DX.p.find(q => q.id === d.id);
    if (!p) return;
    p.x = Math.round((m[0] + d.dx) * 100) / 100; p.y = Math.round((m[1] + d.dy) * 100) / 100;
    d.moved = true;
    render();
    plistSoon();
  });
  const end = () => {
    const d = DRV.drag;
    if (!d || d.svg !== svg) return;
    DRV.drag = null;
    svg.classList.remove('dragging');
    if (!d.moved) return;
    if (svg._sc) svg._sc.refit = true;              // the view glides to fit the new layout
    driveChanged();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}

function driveInit() {
  document.querySelectorAll('[data-plist]').forEach(box => { box.innerHTML = '<div class="pl-rows"></div><div class="pl-ed"></div><div class="pl-foot"></div>'; });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-plpick], [data-plside], [data-plmv], [data-pldel], [data-pladd], [data-plfit]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.plpick != null) drivePick(+d.plpick);
    else if (d.plside != null) driveSide(+d.plside);
    else if (d.plmv != null) { const [i, s] = d.plmv.split(':').map(Number); driveMove(i, s); }
    else if (d.pldel != null) driveDelete(+d.pldel);
    else if (d.pladd != null) driveAdd();
    else if (d.plfit != null) driveFitStock();
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-plpick]')) { e.preventDefault(); drivePick(+e.target.dataset.plpick); }
  });
  document.addEventListener('input', e => { const el = e.target.closest('[data-pled]'); if (el) driveEdit(el); });
  ['a-svg', 'b-svg'].forEach(id => driveDragWire($(id)));
}
