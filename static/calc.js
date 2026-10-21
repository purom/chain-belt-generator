/* Belt & Chain Calculator — The calculations the page shows, as answers to requests: the same requests and the same
   JSON answers as the Python server's API (backend/beltchain/api.py). static/api.js sends a request to the server when
   the page is served by it, and answers it from here otherwise (GitHub Pages, file://, server stopped).
   A calculation that can't be done answers { error, code, … }; in messages, **text** is emphasised.
   Pure computing, no DOM. Loaded as a classic script (works from file:// too); top-level names are shared. */
'use strict';

/* ---- shared rules ---- */
const holesOK = H => !H || (H.n >= 1 && H.n <= 24 && H.d > 0 && H.pcd >= 0 && Number.isFinite(H.rot));
const kZOK = z => Number.isFinite(z) && z >= 6 && z <= 250;
const BORE_SET = { rev: ['hex', 5], rex: ['rex', 7], gbd: ['d', 6, 5.5], b14: ['round', 14] };
const HUB16 = { n: 4, d: 4.3, pcd: 22.627, rot: 45 };            // goBILDA 16 mm hub pattern (Sonic Hub / servo hub)
/* smallest tooth count above n that builds without an error (null if even the largest one fails) */
function minTeeth(build, n, max) {
  if (!(n >= 1) || build(max).error) return null;
  for (let k = Math.max(n + 1, 3); k <= max; k++) if (!build(k).error) return k;
  return null;
}
function beltChecks(belt, g) {
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

/* ---- file names and part documents ---- */
const BORE_TAG = { none: '', rev: '_rev5hex', rex: '_rex8', gbd: '_gbD6', b14: '_brg14' };
const SHAPE_TAG = { round: 'd', hex: 'hex', square: 'sq', rex: 'rex', d: 'D', dd: 'DD' };
function boreHoleTag(st) {
  const pre = BORE_TAG[st.borePre];
  const b = pre !== undefined ? pre : `_${SHAPE_TAG[st.bore]}${+st.boreNom.toFixed(3)}`;
  const H = st.holes, h = !H ? '' : st.holePre === 'custom' ? `_${H.n}x${+H.d.toFixed(2)}on${+H.pcd.toFixed(2)}` : '_gb16';
  return b + h;
}
const dxfName = (belt, N, st) => `pulley_${belt.key}_${N}T${boreHoleTag(st)}.dxf`;
const kSprName = (ch, z, st) => `sprocket_${chainTag(ch)}_${z}T${boreHoleTag(st)}`;
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

/* ---- answers ---- */
const calcFail = (error, code = 'input', extra = {}) => ({ error, code, ...extra });
function calcNotes(list, ok = true) {
  const out = list.map(([level, text]) => ({ level, text }));
  if (ok && !out.some(n => n.level === 'warn' || n.level === 'bad')) out.push({ level: 'ok', text: 'Geometry looks good.' });
  return out;
}
const calcClosest = rows => rows.reduce((a, r) => (!a || Math.abs(r.dC) < Math.abs(a.dC)) ? r : a, null);
const layersOf = ents => [...new Set(ents.map(e => e.layer))];
/* a part request (bore, holes, fit) → the settings the geometry uses */
function partSettings(q, pulley) {
  let kind = q.bore, size = q.bore_size, flat = q.bore_flat;
  const pre = BORE_SET[q.bore_preset];
  if (pre) { kind = pre[0]; size = pre[1]; if (pre[2] != null) flat = pre[2]; }
  const cl = q.clearance;
  const holes = q.hole_preset === 'none' ? null : q.hole_preset === 'custom' ? { ...(q.holes || { n: 4, d: 4.3, pcd: 22.627, rot: 0 }) } : { ...HUB16 };
  const st = { bore: q.bore_preset === 'none' ? 'none' : kind, borePre: q.bore_preset, holePre: q.hole_preset, boreNom: size,
    boreSize: size + 2 * cl, boreFlat: flat + 2 * cl, clear: cl, holes, fit: q.fit, pitch: q.pitch_circle };
  return pulley ? { ...st, flange: q.flange, flh: q.flange_height } : st;
}
function partCheck(st) {
  if (st.bore !== 'none' && !(st.boreSize > 0)) return calcFail('Enter a bore size, or pick “No bore”.');
  if (!holesOK(st.holes)) return calcFail('Check the mounting-hole fields (1–24 holes, size and bolt circle).');
  return null;
}
function calcSprockets(ch, z1, z2) {
  if (!kZOK(z1) || !kZOK(z2)) return calcFail('Enter sprocket teeth (6 – 250).');
  const s1 = sprocketOutline(ch, z1, 0), s2 = sprocketOutline(ch, z2, 0);
  if (s1.error || s2.error) return calcFail(s1.error || s2.error, 'sprocket');
  return { s1, s2 };
}
function calcDrive(ch, z1, z2, L) {               // the drive at a link count
  const s = calcSprockets(ch, z1, z2);
  if (s.error) return s;
  const C = chainCenter(ch, z1, z2, L), g = Number.isFinite(C) ? chainAnalyze(ch, z1, z2, C) : null;
  if (!g || !g.valid || !(g.gap > 0)) {
    const m = minLinksFor(ch, z1, z2);
    return calcFail(`${L} links of ${ch.label} chain can't go around ${z1}T + ${z2}T sprockets without them colliding. Shortest chain that clears: **${m} links**${m % 2 ? ` (${m + 1} for an even count)` : ''}.`,
      'too_short', { min_links: m, C, geometry: g && g.valid ? g : null });
  }
  return { C, g };
}

const CALC = {
  /* center distance for a belt of a given length */
  'belt/c2c'(q) {
    const belt = BELTS[q.type], p = belt.pitch;
    if (!(q.n1 >= 4 && q.n1 <= 1000 && q.n2 >= 4 && q.n2 <= 1000) || !(q.length > 0)) return calcFail('Enter pulley teeth (4 or more) and a belt length.');
    const W = q.width || W_DEF[belt.key], info = [];
    let teeth;
    if (q.length_unit === 'teeth') {
      teeth = Math.max(1, Math.round(q.length));
      if (teeth !== q.length) info.push(['info', `Belts have a whole number of teeth — using ${teeth}T.`]);
    } else {
      teeth = Math.max(1, Math.round(q.length / p));
      if (Math.abs(q.length / p - teeth) > 1e-6) info.push(['info', `${len(q.length, 2)} isn't a multiple of the ${lenR(p)} pitch — using the nearest real belt, ${teeth}T = ${lenR(teeth * p)}.`]);
    }
    const L = teeth * p, g0 = analyze(belt, q.n1, q.n2, NaN), C = solveCenter(L, g0.r1, g0.r2), g = analyze(belt, q.n1, q.n2, C);
    if (!g.valid || g.gap <= 0) {
      const m = minTeethForPair(belt, q.n1, q.n2);
      return calcFail(`A ${teeth}T (${lenR(L)}) ${belt.label} belt can't go around ${q.n1}T + ${q.n2}T pulleys without them colliding. Shortest belt that clears: **${m}T (${lenR(m * p)})**.`,
        'too_short', { min_teeth: m, min_length: m * p, teeth, length: L, C, geometry: g.valid ? g : null, notes: calcNotes(info, false) });
    }
    return { teeth, length: L, part_no: partNo(belt, L, W), C, C_set: C + (q.allowance || 0), geometry: g, notes: calcNotes([...info, ...beltChecks(belt, g)]) };
  },
  /* ideal belt length at a target C2C, whole-tooth belts around it and the nearest stock sizes */
  'belt/length'(q) {
    const belt = BELTS[q.type], p = belt.pitch, Ct = q.target_c;
    if (!(q.n1 >= 4 && q.n1 <= 1000 && q.n2 >= 4 && q.n2 <= 1000) || !(Ct > 0)) return calcFail('Enter pulley teeth (4 or more) and a target center distance.');
    const g = analyze(belt, q.n1, q.n2, Ct);
    if (!g.valid || g.gap <= 0) {
      const mn = (g.od1 + g.od2) / 2;
      return calcFail(`At ${len(Ct, 2)} the ${q.n1}T and ${q.n2}T pulleys collide — their outside diameters need at least **${len(mn, 2)}** between centers.`,
        'overlap', { min_c: mn, geometry: g.valid ? g : null });
    }
    const io = integerOptions(belt, q.n1, q.n2, Ct), okRows = io.rows.filter(r => r.ok);
    if (!okRows.length) return calcFail('No whole-tooth belt fits near this C2C.', 'none');
    const best = calcClosest(okRows);
    const list = [...new Set((q.stock ?? STOCK[q.type] ?? []).filter(v => v > 0))].sort((a, b) => a - b);
    const off = list.filter(L => Math.abs(L / p - Math.round(L / p)) > 1e-6);
    const stockAll = list.filter(L => !off.includes(L)).map(L => {
      const C = solveCenter(L, g.r1, g.r2), a = analyze(belt, q.n1, q.n2, C);
      return { t: Math.round(L / p), L, C, dC: C - Ct, ok: a.valid && a.gap > 0 };
    }).filter(r => r.ok);
    const stockRows = [...stockAll.filter(r => r.L <= io.Lx + 1e-6).slice(-2), ...stockAll.filter(r => r.L > io.Lx + 1e-6).slice(0, 2)];
    const sel = [...okRows, ...stockRows].find(r => r.L === q.selected) || best;
    const gs = analyze(belt, q.n1, q.n2, sel.C), notes = [];
    if (Math.abs(sel.dC) >= 0.005) {
      notes.push(['info', sel.dC < 0
        ? `This belt is shorter than ideal: set the pulleys **${len(-sel.dC, 2)} closer** (C2C ${len(sel.C, 3)}), otherwise it's too tight to fit.`
        : `This belt is longer than ideal: increase the C2C by **${len(sel.dC, 2)}** to ${len(sel.C, 3)}, or take up the slack with an idler / tensioner.`]);
    }
    notes.push(...beltChecks(belt, gs));
    if (off.length) notes.push(['info', `Ignored stock entries that aren't a multiple of the ${lenR(p)} pitch: ${off.join(', ')}.`]);
    return { ideal_length: io.Lx, ideal_teeth: io.tx, exact: Math.abs(best.dC) < 0.005, rows: io.rows, best, stock_rows: stockRows, stock_best: calcClosest(stockRows),
      selected: { ...sel, part_no: partNo(belt, sel.L, q.width || W_DEF[belt.key]) }, geometry: gs, notes: calcNotes(notes) };
  },
  /* the pulley: outline, bore, holes and sizes (or why it can't be built, and the smallest tooth count that works) */
  'belt/pulley'(q) {
    const belt = BELTS[q.type], st = partSettings(q, true);
    if (!(q.n >= 6 && q.n <= 400)) return calcFail('Enter between 6 and 400 teeth.');
    const bad = partCheck(st);
    if (bad) return bad;
    const doc = singleDoc(belt, q.n, st);
    if (doc.error) return calcFail(doc.error, 'build', { suggest_teeth: minTeeth(k => pulleyParts(belt, k, st), q.n, 400) });
    const part = doc.part, notes = [];
    if (part.rtClamped) notes.push(['info', `Tip radius reduced to ${len(part.rt, 3)} so the grooves aren't undercut on this small pulley.`]);
    if (q.n < belt.minT) notes.push(['warn', `${q.n}T is below the commonly recommended minimum for ${belt.label} (~${belt.minT}T).`]);
    return { name: dxfName(belt, q.n, st), part, flR: doc.flR, fx: doc.fx, layers: layersOf(doc.ents), notes: calcNotes(notes, false) };
  },
  /* center distance for a chain of a given length */
  'chain/c2c'(q) {
    const ch = CHAINS[q.type], p = ch.p;
    if (!kZOK(q.z1) || !kZOK(q.z2) || !(q.length > 0)) return calcFail('Enter sprocket teeth (6 – 250) and a chain length.');
    const L = q.length_unit === 'links' ? Math.round(q.length) : Math.round(q.length / p), info = [];
    if (q.length_unit === 'links' && L !== q.length) info.push(['info', `Chains have a whole number of links — using ${L}.`]);
    if (q.length_unit === 'mm' && Math.abs(q.length / p - L) > 1e-6) info.push(['info', `${len(q.length, 2)} isn't a multiple of the ${lenR(p)} pitch — using the nearest real chain, ${L} links = ${len(L * p, 2)}.`]);
    const d = calcDrive(ch, q.z1, q.z2, L);
    if (d.error) return { ...d, links: L, notes: calcNotes(info, false) };
    return { links: L, C: d.C, C_set: d.C + (q.allowance || 0), geometry: d.g, notes: calcNotes([...info, ...chainChecks(ch, q.z1, q.z2, d.g, L)]) };
  },
  /* ideal chain length at a target C2C and the whole-link chains around it */
  'chain/length'(q) {
    const ch = CHAINS[q.type], Ct = q.target_c;
    if (!kZOK(q.z1) || !kZOK(q.z2) || !(Ct > 0)) return calcFail('Enter sprocket teeth (6 – 250) and a target C2C.');
    const s = calcSprockets(ch, q.z1, q.z2);
    if (s.error) return s;
    const cmin = (s.s1.od + s.s2.od) / 2 + 0.5;
    if (Ct < cmin) return calcFail(`At ${len(Ct, 2)} the sprocket teeth overlap — use at least ${len(cmin, 1)} C2C.`, 'overlap', { min_c: cmin });
    const Lx = chainLinksAt(ch, q.z1, q.z2, Ct), Lmin = minLinksFor(ch, q.z1, q.z2), rows = [];
    for (let L = Math.max(Lmin, 2, Math.floor(Lx) - 3); L <= Math.ceil(Lx) + 3; L++) {
      const C = chainCenter(ch, q.z1, q.z2, L);
      if (Number.isFinite(C) && chainAnalyze(ch, q.z1, q.z2, C).gap > 0) rows.push({ L, C, dC: C - Ct, even: L % 2 === 0 });
    }
    if (!rows.length) return calcFail('Try a larger C2C.', 'none', { min_c: cmin });
    const evens = rows.filter(r => r.even), best = calcClosest(evens.length ? evens : rows);
    const sel = rows.find(r => r.L === q.selected) || best, g = chainAnalyze(ch, q.z1, q.z2, sel.C), notes = [];
    if (Math.abs(sel.dC) >= 0.005) {
      notes.push(['info', sel.dC < 0
        ? `This chain is shorter than ideal: set the sprockets **${len(-sel.dC, 2)} closer** (C2C ${len(sel.C, 3)}), otherwise it's too tight to fit.`
        : `This chain is longer than ideal: increase the C2C by **${len(sel.dC, 2)}** to ${len(sel.C, 3)}, or take up the slack with a tensioner / idler.`]);
    }
    notes.push(...chainChecks(ch, q.z1, q.z2, g, sel.L));
    return { ideal_links: Lx, exact: Math.abs(Lx - Math.round(Lx)) < 1e-6, min_c: cmin, rows, best, selected: sel, geometry: g, notes: calcNotes(notes) };
  },
  /* the sprocket (ANSI tooth form): outline, bore, holes and sizes */
  'chain/sprocket'(q) {
    const ch = CHAINS[q.type], st = partSettings(q);
    if (!kZOK(q.z)) return calcFail('Enter between 6 and 250 teeth.');
    const bad = partCheck(st);
    if (bad) return bad;
    const doc = sprocketDoc(ch, { ...st, z: q.z });
    if (doc.error) return calcFail(doc.error, 'build', { suggest_teeth: minTeeth(k => sprocketParts(ch, k, st), q.z, 250) });
    const part = doc.part, notes = [];
    if (q.z < 9) notes.push(['warn', `${q.z}T is below the 9-tooth minimum for roller chain.`]);
    if (part.pointed) notes.push(['info', 'Teeth would come to a point at the standard outside Ø, so the tips are trimmed to a short land.']);
    return { name: kSprName(ch, q.z, st), part, tooth_width: toothW(ch), layers: layersOf(doc.ents), notes: calcNotes(notes, false) };
  },
};
