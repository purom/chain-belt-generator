/* Belt & Chain Calculator — Pulley DXF & STEP tab, the 3D side: face width and rims, the turning 3D preview (it runs on
   the page's animation loop, so the Play / Pause button and the speed slider drive it like the belt), the rim section
   sketch with its dimensions, the STEP download and the pinned warnings for the STEP fields.
   Loaded after drive-ui.js and before app.js; top-level names are shared with the other static/*.js files. */
'use strict';

const RIM_PRE = [
  { v: 'none', t: 'No rims', s: 'plain toothed body' },
  { v: 'one', t: 'One side', s: 'rim on the top end' },
  { v: 'both', t: 'Both sides', s: 'the belt can’t walk off' },
];
const RIM_FIELD = { 'd-fw': ['fw', 'Face width'], 'd-flh': ['h', 'Rim height'], 'd-fla': ['a', 'Rim angle'], 'd-flt': ['t', 'Rim thickness'] };
const faceWidthAuto = belt => +(beltW(belt.key) + 1).toFixed(3);         // the belt's width + 1 mm of side clearance
const PV3 = { svg: null, m: null, mesh: null, phi: 0.5, kick: 0, col: null, frame: 0, skip: 1 };
const P3_EL = 26 * Math.PI / 180;                                        // view: 26° above the end face

/* the 3D build of pulley j: its part (pulleyParts / idlerParts) and the solid's layout (pulley3d.js) */
function pulleyBuild(j = DX.cur) {
  const belt = BELTS[DX.type], st = dxfSettings(j), idl = DX.p[j].side < 0;
  if (!(st.n >= 6 && st.n <= 400) || !holesOK(st.holes) || (st.bore !== 'none' && !(st.boreSize > 0))) return { error: 'Check the pulley fields first.' };
  const part = (idl ? idlerParts : pulleyParts)(belt, st.n, st);
  if (part.error) return { error: part.error };
  const m = pulleyModel(part, st);
  return m.error ? m : { m, belt, st, idl, part };
}
function stepName(belt, st, idl) {
  const r = st.rims === 'none' ? '' : `_${st.rims === 'both' ? '2rims' : 'rim'}-h${+(+st.flh).toFixed(2)}-a${+(+st.fla).toFixed(1)}`;
  return `${idl ? 'idler' : 'pulley'}_${belt.key}_${st.n}T${boreHoleTag(st)}_w${+(+st.fw).toFixed(2)}${r}.stp`;
}
function pulleyStepDownload() {
  driveSave(() => {
    const b = pulleyBuild();
    if (b.error) return b;
    const tag = pTag(DX.p[DX.cur]), what = b.idl ? 'idler' : 'pulley';
    return { name: stepName(b.belt, b.st, b.idl), text: pulleyStepText(`${b.belt.code} ${what} ${b.st.n}T`, `Pulley ${tag} ${b.st.n}T`, b.m) };
  }, { type: 'model/step' });
}

/* results-panel parts the pulley and the idler share: STEP button, rows, notes */
function stepButtonHTML(b) {
  return `<button type="button" class="btn icon dl-step" data-dl-step${b.error ? ' disabled' : ''}>${ICON_CUBE}Download STEP</button>`;
}
const stepHint = b => b.error ? '' : ` · ${stepName(b.belt, b.st, b.idl)}`;
function rimRows(b, st, idl) {                        // idl: an idler calls its roller surface the rim, so these are flanges
  const m = b.m;
  return [
    ['Face width', m ? `${len(m.F, 2)}` : '—', m ? fl(m.F, 2) : null],
    [idl ? 'Flange Ø' : 'Rim Ø', m && m.top ? `${len(2 * m.Rr, 2)}` : '—', m && m.top ? fl(2 * m.Rr, 2) : null],
    [st.rims === 'none' ? 'Width' : `Width over ${idl ? 'flanges' : 'rims'}`, m ? `${len(m.width, 2)}` : '—', m ? fl(m.width, 2) : null, 'Width over rims'],
  ];
}
function rimNotes(b) {
  const notes = [];
  if (b.error) { notes.push(['warn', `STEP: ${b.error}`]); return notes; }
  const m = b.m, belt = b.belt, bw = beltW(belt.key), r = m.top;
  // an idler's "rim" is its roller surface, so there the rims are called flanges
  const [rim, body, od] = b.idl ? ['flange', 'roller', 'roller'] : ['rim', 'teeth', 'OD'];
  if (bw > m.F + 1e-9) notes.push(['warn', `The ${lenR(bw)} wide belt (Belt DXF tab) is wider than the ${len(m.F, 2)} face — give the face at least the belt width.`]);
  else if (r && m.F - bw < 0.3) notes.push(['info', `Only ${len(m.F - bw, 2)} of side play for the ${lenR(bw)} belt between the ${rim}s — about 1 mm is usual.`]);
  if (r) {
    const back = beltThick(belt) - (b.idl ? 0 : belt.toothH);            // how far the belt stands above the OD (an idler: teeth out)
    if (r.H < back) notes.push(['warn', `The ${rim}s reach ${len(r.H, 2)} above the ${od} but the belt stands ${len(back, 2)} above it — it can climb over. Use ≥ ${len(Math.ceil(back * 10) / 10, 1)}.`]);
    if (r.c) notes.push(['info', `${b.idl ? 'Flange' : 'Rim'} wall at ${f(r.a, 1)}° out to the ${rim} edge, after a ${len(r.eps, 2)} flat just above the ${od} so the wall meets the ${body} cleanly.${Math.abs(r.a - 45) < 0.01 ? ` 45° ${rim}s 3D-print without supports.` : ''}`]);
  }
  notes.push(['info', `STEP: the whole ${b.idl ? 'idler' : 'pulley'} is one solid — ${body}${r ? `, ${m.bot ? `two ${rim}s` : `one ${rim}`}` : ''}, bore and holes — as exact B-rep in mm. Opens in Fusion 360, Onshape, SolidWorks, FreeCAD …`]);
  return notes;
}

/* ---- the 3D preview: faces sorted back to front, lit from the upper left, turning on the page's animation loop ---- */
function parseCol(s) {
  s = String(s || '').trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1]; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  m = s.match(/rgba?\(([^)]+)\)/);
  return m ? m[1].split(',').slice(0, 3).map(v => parseFloat(v)) : [128, 128, 128];
}
const mixC = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function colors3D() {
  const cs = getComputedStyle(document.documentElement), a = parseCol(cs.getPropertyValue('--pulley')), b = parseCol(cs.getPropertyValue('--pulley-edge'));
  const ac = parseCol(cs.getPropertyValue('--accent')), dark = lum(a) < lum(b);
  const lo = dark ? mixC(a, [0, 0, 0], 0.15) : b, hi = dark ? mixC(b, [255, 255, 255], 0.35) : mixC(a, [255, 255, 255], 0.35);
  return { lo, hi, rlo: mixC(lo, ac, 0.55), rhi: mixC(hi, ac, 0.6) };
}
function draw3DPulley(svg, b) {
  PV3.svg = svg;
  if (!b || b.error) { PV3.m = PV3.mesh = null; svg.setAttribute('viewBox', '0 0 300 120'); svg.innerHTML = `<text x="150" y="64" text-anchor="middle" font-size="12" class="empty">${b ? 'No STEP model' : 'No profile'}</text>`; return; }
  const m = b.m, se = Math.sin(P3_EL), ce = Math.cos(P3_EL);
  PV3.m = m; PV3.mesh = pulleyMesh(m); PV3.col = colors3D(); PV3.skip = Math.max(1, Math.ceil(PV3.mesh.length / 1800));
  const R = m.Rr, top = -(R * se + m.zT * ce), bot = R * se - m.zB * ce, pad = Math.max(2 * R, bot - top) * 0.07;
  svg.setAttribute('viewBox', `${Q3(-R - pad)} ${Q3(top - pad)} ${Q3(2 * R + 2 * pad)} ${Q3(bot - top + 2 * pad)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  paint3D();
}
function paint3D() {
  const { svg, mesh, m, col } = PV3;
  if (!svg || !mesh) return;
  const se = Math.sin(P3_EL), ce = Math.cos(P3_EL), c = Math.cos(PV3.phi), s = Math.sin(PV3.phi);
  const L = [-0.42, -0.62, 0.66], Ln = Math.hypot(...L), q = m.Rr < 25 ? 1000 : 100, r = v => Math.round(v * q) / q;
  const items = [];
  for (const fc of mesh) {
    const nx = fc.n[0] * c - fc.n[1] * s, ny = fc.n[0] * s + fc.n[1] * c, nz = fc.n[2];
    if (-ny * ce + nz * se <= 1e-6) continue;                         // faces turned away
    let d = '', depth = 0, k = 0;
    for (const lp of fc.loops) {
      lp.forEach(([x, y, z], i) => {
        const X = x * c - y * s, Y = x * s + y * c;
        d += `${i ? 'L' : 'M'}${r(X)} ${r(-(Y * se + z * ce))}`;
        depth += -Y * ce + z * se; k++;
      });
      d += 'Z';
    }
    const lit = 0.18 + 0.82 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / Ln);
    const rgb = mixC(fc.rim ? col.rlo : col.lo, fc.rim ? col.rhi : col.hi, lit).map(Math.round);
    items.push({ g: fc.g, depth: depth / k, d, f: `rgb(${rgb})` });
  }
  items.sort((a, b) => a.g - b.g || a.depth - b.depth);
  svg.innerHTML = items.map(it => `<path d="${it.d}" fill="${it.f}" stroke="${it.f}"/>`).join('');
}
/* per animation frame (app.js frame()): the model turns with the belt speed, plus a decaying spin after a switch;
   true while that spin still needs frames */
function spin3D(dt, speed) {
  if (!PV3.mesh || !PV3.svg || PV3.svg.closest('.panel').hidden) { PV3.kick = 0; return false; }
  const w = 0.45 * speed + PV3.kick;
  PV3.kick = PV3.kick > 0.02 ? PV3.kick * Math.exp(-3.2 * dt) : 0;
  if (w <= 0 || !dt) return PV3.kick > 0;
  PV3.phi += w * dt;
  if (++PV3.frame % PV3.skip === 0 || PV3.kick) paint3D();
  return PV3.kick > 0;
}
function kick3D() {
  if (reduceMotion || !PV3.mesh) return;
  PV3.kick = 7;
  ensureLoop();
}

/* ---- the rim section: half a section through a tooth (axis along x, radius up), dimensioned like a sketch ---- */
function drawRimSection(svg, b) {
  if (!b || b.error) { svg.setAttribute('viewBox', '0 0 300 120'); svg.innerHTML = `<text x="150" y="64" text-anchor="middle" font-size="12" class="empty">${b ? 'No STEP model' : 'No profile'}</text>`; return; }
  const m = b.m, belt = b.belt, Ro = m.Ro, Rr = m.Rr, F = m.F, r = m.top || m.bot;
  const bore = m.part.bore, rIn = bore ? bore.s / 2 : 0, rootR = Ro - (m.part.D || 0);
  const w = m.width, fs = Math.max(w, Rr - rootR) * 0.062, gap = fs * 0.9;
  const z0 = m.zB - fs * 3.2, z1 = m.zT + fs * 4.2, top = Rr + fs * (r ? 4.9 : 3.4), hv = (z1 - z0) * 0.78;
  const bottom = Math.max(-fs * 1.5, Math.min(rootR - fs * 2.5, top - hv));
  svg.setAttribute('viewBox', `${Q3(z0)} ${Q3(-top)} ${Q3(z1 - z0)} ${Q3(top - bottom)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const Y = v => Q3(-v), X = Q3;
  const prof = pulleySection(m), poly = [[m.zB, rIn], ...prof, [m.zT, rIn]];
  const d = `M${poly.map(([z, rr]) => `${X(z)} ${Y(rr)}`).join('L')}Z`;
  const a = fs * 0.55;
  const arrow = (x, y, dx, dy) => {                     // arrow head at (x, y) pointing along (dx, dy)
    const n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
    return `<path d="M${X(x)} ${Y(y)}L${X(x - ux * a - uy * a * 0.38)} ${Y(y - uy * a + ux * a * 0.38)}L${X(x - ux * a + uy * a * 0.38)} ${Y(y - uy * a - ux * a * 0.38)}Z" class="arrow"/>`;
  };
  const line = (za, ra, zb, rb, cls) => `<line x1="${X(za)}" y1="${Y(ra)}" x2="${X(zb)}" y2="${Y(rb)}" class="${cls}" ${NS} stroke-width="1"/>`;
  const text = (z, rr, s, anchor = 'middle', cls = 'dimt') => `<text x="${X(z)}" y="${Y(rr)}" text-anchor="${anchor}" font-size="${Q3(fs)}" class="${cls}">${escT(s)}</text>`;
  const hdim = (za, zb, rr, s, from) => line(za, from[0], za, rr + fs * 0.3, 'ext') + line(zb, from[1], zb, rr + fs * 0.3, 'ext')
    + line(za, rr, zb, rr, 'dim') + arrow(za, rr, za - zb, 0) + arrow(zb, rr, zb - za, 0) + text((za + zb) / 2, rr + fs * 0.35, s);
  let out = `<defs><pattern id="d-sec-hatch" width="${Q3(fs * 0.55)}" height="${Q3(fs * 0.55)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${Q3(fs * 0.55)}" class="sec-hl" stroke-width="${Q3(fs * 0.05)}"/></pattern></defs>`;
  out += `<path d="${d}" class="pv-part" ${NS} stroke-width="1.25"/><path d="${d}" fill="url(#d-sec-hatch)" stroke="none"/>`;
  if (m.part.D) out += line(0, rootR, F, rootR, 'pv-od');                            // groove bottom
  if (bottom < 0) out += line(z0, 0, z1, 0, 'pv-c sec-axis');                        // the axis
  // the belt, centred on the face: on a pulley its land sits on the OD (teeth in the grooves), on an idler its back does
  const bw = Math.min(beltW(belt.key), F), bt = Math.max(0.3, beltThick(belt) - (b.idl ? 0 : belt.toothH)), bz = (F - bw) / 2;
  out += `<rect x="${X(bz)}" y="${Y(Ro + bt)}" width="${Q3(bw)}" height="${Q3(bt)}" class="sec-belt" ${NS} stroke-width="1"/>`;
  // dimensions: face width under the rims' top, rim height and thickness beside the top rim, wall angle, overall width
  const fr = r ? Math.max(Ro + bt + fs * 1.4, Math.min(Rr - fs * 0.4, Ro + bt + (Rr - Ro - bt) / 2 + fs * 0.4)) : Ro + bt + fs * 1.5;
  out += hdim(0, F, fr, `${fl(F, 1)}`, [Ro, Ro]);
  if (m.top) {
    const t = m.top, zh = m.zT + gap;
    out += line(m.zT, Rr, zh + fs * 0.4, Rr, 'ext') + line(F + fs * 0.2, Ro, zh + fs * 0.4, Ro, 'ext')
      + line(zh, Ro, zh, Rr, 'dim') + arrow(zh, Ro, 0, -1) + arrow(zh, Rr, 0, 1) + text(zh + fs * 0.45, (Ro + Rr) / 2 - fs * 0.35, `${fl(t.H, 1)}`, 'start');
    out += hdim(F + t.c, m.zT, Rr + gap, `${fl(t.t, 1)}`, [Rr, Rr]);
    if (t.c) {                                        // the wall angle, from the radial direction
      const rr = Math.min(t.H * 0.75, Math.max(fs * 1.6, t.H * 0.5)), cz = F, cr = t.R1, ang = t.ang;
      const ex = cz + rr * Math.sin(ang), er = cr + rr * Math.cos(ang), lr = rr + fs * 0.35;   // label: in the wedge, past the arc
      out += line(cz, cr, cz, cr + rr * 1.15, 'ext')
        + `<path d="M${X(cz)} ${Y(cr + rr)}A${Q3(rr)} ${Q3(rr)} 0 0 1 ${X(ex)} ${Y(er)}" class="dim" fill="none" ${NS} stroke-width="1"/>`
        + text(cz + lr * Math.sin(ang / 2) + fs * 0.15, cr + lr * Math.cos(ang / 2), `${f(t.a, 0)}°`, 'start', 'dimt sec-ang');
    }
  }
  if (m.bot || m.top) out += hdim(m.zB, m.zT, Rr + gap + fs * 2.1, `${fl(m.width, 1)}`, [Rr, Rr]);
  svg.innerHTML = out;
}
/* both STEP views of the current pulley */
function drawStepViews(b) {
  draw3DPulley($('d-3d'), b);
  drawRimSection($('d-sec'), b);
}

/* ---- pinned warnings: a STEP field out of range, with the nearest value that works ---- */
function rimProblems() {
  const out = [], multi = driveMulti();
  for (const j of multi ? DX.p.map((_, i) => i) : [roleIdx(0), roleIdx(1)]) {
    const st = dxfSettings(j), pv = DX.p[j], tag = pTag(pv);
    const fields = ['d-fw', ...(st.rims === 'none' ? [] : ['d-flh', 'd-fla', 'd-flt'])];
    for (const fid of fields) {
      const [lk, label] = RIM_FIELD[fid], v = { 'd-fw': st.fw, 'd-flh': st.flh, 'd-fla': st.fla, 'd-flt': st.flt }[fid], [lo, hi] = RIM_LIM[lk];
      if (Number.isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9) continue;
      const to = !Number.isFinite(v) ? { 'd-fw': faceWidthAuto(BELTS[DX.type]), 'd-flh': FLANGE_DEFAULT[DX.type], 'd-fla': RIM_A_DEF, 'd-flt': RIM_T_DEF }[fid] : v < lo ? lo : hi;
      const shown = fid === 'd-fla' ? `${to}°` : len(to, fid === 'd-fw' ? 0 : 1), id = `r${j}${fid}`;
      const msg = `${label} must be ${fid === 'd-fla' ? `0 – ${hi}°` : `${len(lo, 1)} – ${len(hi, 0)}`} for the STEP model.`;
      out.push({ id, dkey: `${id}|${v}`, title: `Pulley ${multi ? pv.name : tag} STEP · ${label.toLowerCase()} out of range`, msg,
        acts: j === DX.cur ? [setAct(id, fid, to, shown, `${label} set to ${shown}.`), ...tabAct('dxf', 'Pulley DXF & STEP')] : [['Fix in Pulley DXF →', `p:${j}`]] });
      break;
    }
  }
  return out;
}
