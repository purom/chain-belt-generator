/* Belt & Chain Calculator — Timing belts on N pulleys: the belt as one closed loop round pulleys taken in list order
   (toothed pulleys and backside idlers), its pitch length, wraps and teeth in mesh, the toothed outline along the loop,
   the calculators' answers for such a drive and its DXF drawings. Pure computing, no DOM; built on belt.js and calc.js.
   With two toothed pulleys the page keeps using belt.js itself (driveSolve gives the same numbers there).
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

const DRIVE_MAX = 12;                                    // pulleys in one drive
const TWO_PI = 2 * Math.PI;
/* pitch line → belt back */
const beltBack = belt => belt.thick - belt.toothH - belt.pld;
/* what the belt touches: a toothed pulley's outside Ø, or a backside idler's smooth rim under the belt back.
   Every pulley's pitch radius is teeth × pitch / 2π; on a backside idler that is the radius of the belt's pitch line. */
const driveBodyR = (belt, N, side) => pitchDia(N, belt.pitch) / 2 - (side < 0 ? beltBack(belt) : belt.pld);

/* The belt round ps = [{ x, y, N, side, … }] in list order (side +1: the teeth wrap it · −1: a backside idler).
   Signed radius = side × pitch radius. The loop always runs CCW, like the 2-pulley path: a list whose centres go round
   CW (signed area of the centre polygon < 0) is walked backwards from the same first pulley, so the tangents stay on the
   right side and the belt doesn't flip while a pulley is moved; pulleys in a line (and any two) keep the list order.
   Span A → B: d = |B − A|, δ = rA − rB, length √(d² − δ²), contact normal m = (δ/d)·e − (span/d)·e⊥, tangent points
   = centre + signed radius × m. Wrap = the turn from the incoming to the outgoing normal, CCW on a toothed pulley and
   CW on a backside idler, in [0, 2π). segs follow beltPath: span, wrap on the next pulley, span, … (arcs carry dir ±1).
   bad = { pulleys, spans, why } lists what stops the loop: overlapping pulleys, no tangent, crossed spans,
   a span through another pulley, a backside idler wrapped more than half way (it sits inside the loop). */
function driveSolve(belt, psIn) {
  const n = psIn.length;
  const ps = psIn.map((p, i) => {                       // rp: a pitch radius given outright (layouts gliding between sizes)
    const r = p.rp > 0 ? p.rp : pitchDia(p.N, belt.pitch) / 2;
    return { ...p, i, r, R: r - (p.side < 0 ? beltBack(belt) : belt.pld) };
  });
  let A2 = 0, ext = 1;
  for (let i = 0; i < n; i++) {
    const a = ps[i], b = ps[(i + 1) % n];
    A2 += a.x * b.y - b.x * a.y;
    ext = Math.max(ext, Math.abs(a.x) + a.r, Math.abs(a.y) + a.r);
  }
  const rev = A2 < -1e-9 * ext * ext;
  const q = rev ? [ps[0], ...ps.slice(1).reverse()] : ps.slice();
  q.forEach((p, k) => { p.k = k; p.rs = p.side * p.r; });
  const bad = { pulleys: new Set(), spans: new Set(), why: [] };
  const flag = (why, pis, sks = []) => { bad.why.push(why); pis.forEach(i => bad.pulleys.add(i)); sks.forEach(k => bad.spans.add(k)); };

  let gap = Infinity, gapAt = null;
  ps.forEach(p => { if (!(p.R > 0.5)) flag({ kind: 'small', a: p.i }, [p.i]); });
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const g = Math.hypot(ps[j].x - ps[i].x, ps[j].y - ps[i].y) - ps[i].R - ps[j].R;
      if (g < gap) { gap = g; gapAt = [i, j]; }
      if (!(g > 0)) flag({ kind: 'overlap', a: i, b: j, by: -g }, [i, j]);
    }
  }

  const spans = q.map((A, k) => {
    const B = q[(k + 1) % n], Dx = B.x - A.x, Dy = B.y - A.y, d = Math.hypot(Dx, Dy), dl = A.rs - B.rs;
    if (!(d > 1e-9 && d * d - dl * dl > 1e-12)) { flag({ kind: 'span', a: A.i, b: B.i }, [A.i, B.i], [k]); return null; }
    const s = Math.sqrt(d * d - dl * dl), ex = Dx / d, ey = Dy / d, c = dl / d, sn = s / d;
    const m = [c * ex + sn * ey, c * ey - sn * ex];
    const a = [A.x + A.rs * m[0], A.y + A.rs * m[1]], b = [B.x + B.rs * m[0], B.y + B.rs * m[1]];
    return { k, from: A.i, to: B.i, m, a, b, len: s, t: s > 0 ? [(b[0] - a[0]) / s, (b[1] - a[1]) / s] : [-m[1], m[0]] };
  });

  const arcs = q.map((P, k) => {
    const si = spans[(k + n - 1) % n], so = spans[k];
    if (!si || !so) return null;
    const dir = P.side < 0 ? -1 : 1;
    const a0 = Math.atan2(dir * si.m[1], dir * si.m[0]), a1 = Math.atan2(dir * so.m[1], dir * so.m[0]);
    let sw = dir > 0 ? a1 - a0 : a0 - a1;
    sw = ((sw % TWO_PI) + TWO_PI) % TWO_PI;
    if (dir < 0 && sw > Math.PI + 1e-9) flag({ kind: 'inside', a: P.i }, [P.i]);
    return { k, pi: P.i, c: [P.x, P.y], r: P.r, a0, dir, sweep: sw, len: P.r * sw };
  });

  // crossed spans (a figure 8, or the pulleys in an order the belt can't follow)
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const eps = 1e-9 * ext * ext, opp = (u, v) => (u > eps && v < -eps) || (u < -eps && v > eps);
  for (let k = 0; k < n; k++) {
    for (let l = k + 1; l < n; l++) {
      const A = spans[k], B = spans[l];
      if (A && B && opp(orient(B.a, B.b, A.a), orient(B.a, B.b, A.b)) && opp(orient(A.a, A.b, B.a), orient(A.a, A.b, B.b))) {
        flag({ kind: 'cross', a: A.from, b: A.to, c: B.from, d: B.to }, [], [k, l]);
      }
    }
  }
  // a span running through a pulley it doesn't wrap
  spans.forEach((S, k) => {
    if (!S) return;
    const dx = S.b[0] - S.a[0], dy = S.b[1] - S.a[1], L2 = dx * dx + dy * dy;
    ps.forEach(p => {
      if (p.i === S.from || p.i === S.to) return;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - S.a[0]) * dx + (p.y - S.a[1]) * dy) / L2)) : 0;
      if (Math.hypot(S.a[0] + t * dx - p.x, S.a[1] + t * dy - p.y) < p.R - 1e-6) flag({ kind: 'through', a: p.i, b: S.from, c: S.to }, [p.i], [k]);
    });
  });

  let segs = null, L = NaN;
  if (spans.every(Boolean) && arcs.every(Boolean)) {
    segs = [];
    let s0 = 0;
    for (let k = 0; k < n; k++) {
      const S = spans[k], W = arcs[(k + 1) % n];
      segs.push({ a: S.a, b: S.b, len: S.len, t: S.t, s0, k });
      s0 += S.len;
      segs.push({ c: W.c, r: W.r, a0: W.a0, dir: W.dir, len: W.len, pi: W.pi, s0 });
      s0 += W.len;
    }
    L = s0;
  }
  const wrap = ps.map(p => arcs[p.k] ? arcs[p.k].sweep : NaN);
  return {
    drive: true, valid: !bad.why.length, n, ps, q, rev, spans, arcs, segs, L, gap, gapAt, bad, wrap,
    tim: ps.map((p, i) => wrap[i] / TWO_PI * p.N),
  };
}

/* point + unit tangent at pitch-path coordinate s (like pathAt, for any loop) */
function drivePathAt(g, s) {
  const segs = g.segs, L = g.L;
  s = ((s % L) + L) % L;
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].s0 <= s) lo = m; else hi = m - 1; }
  const sg = segs[lo], q = s - sg.s0;
  if (sg.a) return { i: lo, p: [sg.a[0] + sg.t[0] * q, sg.a[1] + sg.t[1] * q], t: sg.t };
  const a = sg.a0 + sg.dir * q / sg.r, ca = Math.cos(a), sa = Math.sin(a);
  return { i: lo, a, p: [sg.c[0] + sg.r * ca, sg.c[1] + sg.r * sa], t: [-sa * sg.dir, ca * sg.dir] };
}
/* closed loop offset from the pitch line towards the belt back by `off` (0 = pitch line); on a backside idler the back
   faces the idler, so its arc gets smaller */
function driveLoopVerts(g, off) {
  const v = [], n = g.n;
  g.spans.forEach((S, k) => {
    const W = g.arcs[(k + 1) % n];
    v.push([S.a[0] + off * S.m[0], S.a[1] + off * S.m[1], 0], [S.b[0] + off * S.m[0], S.b[1] + off * S.m[1], W.dir * Math.tan(W.sweep / 4)]);
  });
  return v;
}

/* Closed outlines of the toothed belt round the loop (outer = back, inner = teeth), as beltOutline does for two pulleys.
   `travel` (mm) slides the teeth along the loop. Teeth on a backside idler keep the straight-span shape. */
function driveOutline(belt, g, travel) {
  const tg = beltTooth(belt), { u, ht } = tg, segs = g.segs, L = g.L;
  const Nt = Math.max(3, Math.round(L / belt.pitch)), pe = L / Nt;
  const sOff = (((travel || 0) % pe) + pe) % pe;
  const rack = toothHalf(Infinity, ht, tg.rTip, tg.al, tg.rR, tg.w), byR = new Map();
  const halves = segs.map(sg => {
    if (sg.a || sg.dir < 0) return rack;
    if (!byR.has(sg.r)) byR.set(sg.r, toothHalf(sg.r - u, ht, tg.rTip, tg.al, tg.rR, tg.w));
    return byR.get(sg.r);
  });
  const teeth = [];
  for (let k = 0; k < Nt; k++) {
    const s = sOff + k * pe, at = drivePathAt(g, s), sg = segs[at.i], h = halves[at.i], flat = sg.a || sg.dir < 0;
    let O, ey;
    if (flat) { O = [at.p[0] - u * at.t[1], at.p[1] + u * at.t[0]]; ey = [at.t[1], -at.t[0]]; }
    else { O = sg.c; ey = [Math.cos(at.a), Math.sin(at.a)]; }
    const ex = [ey[1], -ey[0]];
    const W = (x, y, b) => [O[0] + x * ex[0] + y * ey[0], O[1] + x * ex[1] + y * ey[1], b];
    teeth.push({
      s, off: sg.a ? h.Q[0] : flat ? sg.r * h.Q[0] / (sg.r + u) : sg.r * Math.atan2(h.Q[0], h.Q[1]),
      v: toothVerts(h).map(([x, y, b]) => W(x, y, b)),
    });
  }
  // land between teeth: arcs on the wraps, straight on the spans, split where the path changes
  const inner = [];
  for (let k = 0; k < Nt; k++) {
    const A = teeth[k], B = teeth[(k + 1) % Nt];
    const sA = A.s + A.off, sB = B.s + (k + 1 === Nt ? L : 0) - B.off;
    inner.push(...A.v);
    const run = [[A.v[A.v.length - 1], sA]], bs = [];
    for (let m = 0; m < 2; m++) for (const sg of segs) { const b = sg.s0 + m * L; if (b > sA + 1e-9 && b < sB - 1e-9) bs.push(b); }
    bs.sort((x, y) => x - y);
    for (const b of bs) {
      const at = drivePathAt(g, b), v = [at.p[0] - u * at.t[1], at.p[1] + u * at.t[0], 0];
      inner.push(v); run.push([v, b]);
    }
    run.push([B.v[0], sB]);
    for (let j = 0; j + 1 < run.length; j++) {
      const [X, sx] = run[j], [Y, sy] = run[j + 1], sg = segs[drivePathAt(g, (sx + sy) / 2).i];
      if (!sg.c) { X[2] = 0; continue; }
      let sw = Math.atan2(Y[1] - sg.c[1], Y[0] - sg.c[0]) - Math.atan2(X[1] - sg.c[1], X[0] - sg.c[0]);
      sw -= TWO_PI * Math.round(sw / TWO_PI);
      X[2] = Math.tan(sw / 4);
    }
  }
  return { outer: driveLoopVerts(g, tg.back), inner, g, Nt, pe, sOff, tg };
}
/* rotation (rad, CCW) that centres a groove of toothed pulley i (list index) under the belt tooth nearest the middle of its wrap */
function drivePhase(bo, i) {
  const sg = bo.g.segs.find(x => x.c && x.pi === i);
  if (!sg) return 0;
  const k = Math.round((sg.s0 + sg.len / 2 - bo.sOff) / bo.pe);
  return sg.a0 + sg.dir * (bo.sOff + k * bo.pe - sg.s0) / sg.r - Math.PI / 2;
}

/* ---- the calculators' drive: role 1 sits at the origin, role 2 on +X at the centre distance C, the others where they
   were put (x, y in mm from role 1, +Y up) ---- */
function driveAt(belt, ps, C) {
  const g = driveSolve(belt, ps.map(p => p.role === 1 ? { ...p, x: 0, y: 0 } : p.role === 2 ? { ...p, x: C, y: 0 } : p));
  const p1 = g.ps.find(p => p.role === 1), p2 = g.ps.find(p => p.role === 2);
  return Object.assign(g, { C, r1: p1.r, r2: p2.r, pd1: 2 * p1.r, pd2: 2 * p2.r });
}
/* C from just clear of role 1 up to where any loop of length ≤ Lmax ends, sampled; the edges of each range where the
   loop can be built are found by bisection. L = NaN where it can't. */
function driveScan(belt, ps, Lmax) {
  const p1 = ps.find(p => p.role === 1), p2 = ps.find(p => p.role === 2);
  const lo = Math.max(1e-3, driveBodyR(belt, p1.N, p1.side) + driveBodyR(belt, p2.N, p2.side));
  const hi = Math.max(lo + 1, Lmax / 2 + pitchDia(p1.N, belt.pitch) + pitchDia(p2.N, belt.pitch) + 1), M = 240, pts = [];
  for (let k = 0; k <= M; k++) {
    const C = lo + (hi - lo) * k / M, g = driveAt(belt, ps, C);
    pts.push({ C, L: g.valid ? g.L : NaN });
  }
  const edges = [];
  for (let k = M; k >= 1; k--) {
    const a = pts[k - 1], b = pts[k], up = Number.isNaN(a.L);
    if (up === Number.isNaN(b.L)) continue;
    let x0 = a.C, x1 = b.C;                       // x0 on the side of a, x1 on the side of b
    for (let i = 0; i < 48; i++) { const m = 0.5 * (x0 + x1); if (driveAt(belt, ps, m).valid === up) x1 = m; else x0 = m; }
    const inC = up ? x1 : x0, g = driveAt(belt, ps, inC);
    edges.push({ in: inC, out: up ? x0 : x1, up });
    if (g.valid) pts.splice(k, 0, { C: inC, L: g.L });
  }
  return { lo, hi, pts, edges: edges.reverse() };
}
/* the smallest C at which the loop is Lt long */
function driveFindC(belt, ps, scan, Lt) {
  const P = scan.pts;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k];
    if (!(a.L <= Lt && b.L >= Lt)) continue;
    let lo = a.C, hi = b.C, ok = true;
    for (let i = 0; i < 200 && hi - lo > 1e-10; i++) {
      const m = 0.5 * (lo + hi), g = driveAt(belt, ps, m);
      if (!g.valid) { ok = false; break; }
      if (g.L < Lt) lo = m; else hi = m;
    }
    if (!ok) continue;
    const C = 0.5 * (lo + hi), g = driveAt(belt, ps, C);
    if (g.valid) return { C, g };
  }
  return null;
}
/* the first C ≥ C0 at which the loop can be built (null if none up to C0 + span) */
function driveNextValid(belt, ps, C0, span) {
  const M = 160;
  let prev = C0;
  if (driveAt(belt, ps, C0).valid) return C0;
  for (let k = 1; k <= M; k++) {
    const C = C0 + span * k / M;
    if (driveAt(belt, ps, C).valid) {
      let x0 = prev, x1 = C;
      for (let i = 0; i < 48; i++) { const m = 0.5 * (x0 + x1); if (driveAt(belt, ps, m).valid) x1 = m; else x0 = m; }
      return x1;
    }
    prev = C;
  }
  return null;
}

/* ---- words ---- */
const driveSet = ps => ps.map(p => `${p.N}T`).join(' + ');
const driveName = (g, i) => g.ps[i].name || `P${i + 1}`;
/* what is wrong with a loop, in a sentence */
function driveWhy(g) {
  const w = g.bad.why[0], N = i => driveName(g, i);
  if (!w) return '';
  const more = g.bad.why.length > 1 ? ` (+${g.bad.why.length - 1} more)` : '';
  const t = {
    overlap: () => `${N(w.a)} and ${N(w.b)} overlap by ${len(w.by, 2)}`,
    span: () => `${N(w.a)} and ${N(w.b)} are too close for the belt to run between them`,
    cross: () => `the belt crosses itself (${N(w.a)} → ${N(w.b)} and ${N(w.c)} → ${N(w.d)}) — check the pulley order and which pulleys are backside idlers`,
    through: () => `the belt from ${N(w.b)} to ${N(w.c)} runs through ${N(w.a)}`,
    inside: () => `backside idler ${N(w.a)} is on the wrong side of the belt — it has to press the belt inwards from outside the loop (or make it a toothed pulley)`,
    small: () => `${N(w.a)} is too small to carry the belt — use more teeth`,
  }[w.kind];
  return t() + more;
}
/* notes for a drive that works: clearances, teeth in mesh, small pulleys, idlers */
function driveChecks(belt, g) {
  const out = [];
  if (!g.valid) return out;
  if (g.gapAt && g.gap < 2 * belt.thick) {
    out.push(['warn', `Only ${len(g.gap, 2)} between ${driveName(g, g.gapAt[0])} and ${driveName(g, g.gapAt[1])} — flanges usually reach ~${len(belt.thick, 1)} past the OD, so flanged pulleys may touch.`]);
  }
  g.ps.forEach(p => {
    if (p.side < 0) return;
    const tim = g.tim[p.i];
    if (tim < 6) out.push(['warn', `Only ${f(tim, 1)} teeth in mesh on ${p.name} · ${p.N}T (${f(deg(g.wrap[p.i]), 0)}° wrap). Belt ratings assume 6 or more — capacity drops and tooth-skipping gets likelier.`]);
    if (p.N < belt.minT) out.push(['warn', `${p.name} · ${p.N}T is below the commonly recommended minimum for ${belt.label} (~${belt.minT}T); expect shorter belt life.`]);
  });
  const idl = g.ps.filter(p => p.side < 0);
  if (idl.length) {
    out.push(['info', `${idl.map(p => `${p.name} (Ø${fl(2 * p.R, 2)})`).join(', ')} ${idl.length > 1 ? 'are backside idlers' : 'is a backside idler'}: a smooth roller on the belt back, turning the other way. Its size comes from its tooth count (belt pitch line Ø = teeth × pitch / π).`]);
  }
  return out;
}

/* ---- answers for an N-pulley drive: the same requests and answers as CALC['belt/c2c'] and CALC['belt/length'], plus
   q.pulleys = [{ id, name, tag, N, side, x, y, role }] in belt order (role 1 / 2: the pair whose C2C is solved) ---- */
const driveTeethOK = ps => ps.length >= 2 && ps.every(p => p.N >= 4 && p.N <= 1000);
const DRIVE_CALC = {
  'belt/c2c'(q) {
    const belt = BELTS[q.type], p = belt.pitch, ps = q.pulleys;
    if (!driveTeethOK(ps) || !(q.length > 0)) return calcFail('Enter pulley teeth (4 or more) and a belt length.');
    const W = q.width || W_DEF[belt.key], info = [];
    let teeth;
    if (q.length_unit === 'teeth') {
      teeth = Math.max(1, Math.round(q.length));
      if (teeth !== q.length) info.push(['info', `Belts have a whole number of teeth — using ${teeth}T.`]);
    } else {
      teeth = Math.max(1, Math.round(q.length / p));
      if (Math.abs(q.length / p - teeth) > 1e-6) info.push(['info', `${len(q.length, 2)} isn't a multiple of the ${lenR(p)} pitch — using the nearest real belt, ${teeth}T = ${lenR(teeth * p)}.`]);
    }
    const L = teeth * p, scan = driveScan(belt, ps, L), hit = driveFindC(belt, ps, scan, L);
    if (!hit) {
      const valid = scan.pts.filter(x => !Number.isNaN(x.L)), Lmin = Math.min(...valid.map(x => x.L)), e0 = scan.edges.find(e => e.up);
      // what stops it: just short of the shortest loop that works, or (none works) the C with the fewest problems
      const g = valid.length ? driveAt(belt, ps, e0 ? e0.out : scan.lo)
        : scan.pts.filter((_, k) => k % 8 === 4).map(x => driveAt(belt, ps, x.C)).reduce((a, b) => (b.bad.why.length < a.bad.why.length ? b : a));
      if (!valid.length || !(Lmin > L)) {
        return calcFail(`These pulleys can't carry a belt: ${driveWhy(g) || 'the loop never closes'}.`, 'path', { teeth, length: L, C: NaN, geometry: g, notes: calcNotes(info, false) });
      }
      const m = Math.floor(Lmin / p + 1e-9) + 1;
      return calcFail(`A ${teeth}T (${lenR(L)}) ${belt.label} belt can't go around these ${ps.length} pulleys (${driveSet(ps)}) without them colliding. Shortest belt that fits: **${m}T (${lenR(m * p)})**.`,
        'too_short', { min_teeth: m, min_length: m * p, teeth, length: L, C: NaN, geometry: g, notes: calcNotes(info, false) });
    }
    return { teeth, length: L, part_no: partNo(belt, L, W), C: hit.C, C_set: hit.C + (q.allowance || 0), geometry: hit.g, notes: calcNotes([...info, ...driveChecks(belt, hit.g)]) };
  },
  'belt/length'(q) {
    const belt = BELTS[q.type], p = belt.pitch, Ct = q.target_c, ps = q.pulleys;
    if (!driveTeethOK(ps) || !(Ct > 0)) return calcFail('Enter pulley teeth (4 or more) and a target center distance.');
    const g = driveAt(belt, ps, Ct);
    if (!g.valid) {
      const p1 = ps.find(x => x.role === 1), p2 = ps.find(x => x.role === 2);
      const reach = ps.reduce((s, x) => s + Math.hypot(x.x, x.y) + pitchDia(x.N, p) * 2, 0);
      const mn = driveNextValid(belt, ps, Ct, Math.max(50, reach)), ov = g.bad.why.some(w => w.kind === 'overlap');
      return calcFail(`At ${len(Ct, 2)} C2C ${driveWhy(g)}.${mn ? ` The loop works from **${len(mn, 2)}** between ${p1.name} and ${p2.name}.` : ''}`,
        ov ? 'overlap' : 'path', { min_c: mn, geometry: g });
    }
    const Lx = g.L, tx = Lx / p, list = [...new Set((q.stock ?? STOCK[q.type] ?? []).filter(v => v > 0))].sort((a, b) => a - b);
    const off = list.filter(L => Math.abs(L / p - Math.round(L / p)) > 1e-6), whole = list.filter(L => !off.includes(L));
    const tHi = Math.ceil(tx - 1e-9) + 2, Lmax = Math.max(tHi * p, ...whole.filter(L => L > Lx).slice(0, 6));
    const scan = driveScan(belt, ps, Lmax), row = (t, L) => {
      const h = driveFindC(belt, ps, scan, L);
      return { t, L, C: h ? h.C : NaN, dC: h ? h.C - Ct : NaN, ok: !!h };
    };
    const rows = [];
    for (let t = Math.max(1, Math.floor(tx + 1e-9) - 2); t <= tHi; t++) rows.push(row(t, t * p));
    const okRows = rows.filter(r => r.ok);
    if (!okRows.length) return calcFail('No whole-tooth belt fits near this C2C.', 'none', { geometry: g });
    const best = calcClosest(okRows);
    const below = [], above = [];                    // nearest stock sizes that fit: two shorter, two longer
    for (let k = whole.length - 1; k >= 0 && below.length < 2; k--) { if (whole[k] > Lx + 1e-6) continue; const r = row(Math.round(whole[k] / p), whole[k]); if (r.ok) below.unshift(r); }
    for (let k = 0; k < whole.length && above.length < 2; k++) { if (whole[k] <= Lx + 1e-6) continue; const r = row(Math.round(whole[k] / p), whole[k]); if (r.ok) above.push(r); }
    const stockRows = [...below, ...above];
    const sel = [...okRows, ...stockRows].find(r => r.L === q.selected) || best;
    const gs = driveAt(belt, ps, sel.C), notes = [];
    if (Math.abs(sel.dC) >= 0.005) {
      notes.push(['info', sel.dC < 0
        ? `This belt is shorter than ideal: set the pulleys **${len(-sel.dC, 2)} closer** (C2C ${len(sel.C, 3)}), otherwise it's too tight to fit.`
        : `This belt is longer than ideal: increase the C2C by **${len(sel.dC, 2)}** to ${len(sel.C, 3)}, or take up the slack with an idler / tensioner.`]);
    }
    notes.push(...driveChecks(belt, gs));
    if (off.length) notes.push(['info', `Ignored stock entries that aren't a multiple of the ${lenR(p)} pitch: ${off.join(', ')}.`]);
    return { ideal_length: Lx, ideal_teeth: tx, exact: Math.abs(best.dC) < 0.005, rows, best, stock_rows: stockRows, stock_best: calcClosest(stockRows),
      selected: { ...sel, part_no: partNo(belt, sel.L, q.width || W_DEF[belt.key]) }, geometry: gs, notes: calcNotes(notes) };
  },
};
/* "Fit to belt": move pulley i of ps (placed, x / y absolute) along dir until the loop is Lt long; the closest such
   position to where it is now, or null */
function driveFit(belt, ps, i, dir, Lt) {
  const at = t => driveSolve(belt, ps.map((p, j) => j === i ? { ...p, x: p.x + t * dir[0], y: p.y + t * dir[1] } : p));
  const reach = Math.max(20, Lt / 2), M = 200, pts = [];
  for (let k = -M; k <= M; k++) { const t = reach * k / M, g = at(t); pts.push({ t, L: g.valid ? g.L : NaN }); }
  let best = null;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (Number.isNaN(a.L) || Number.isNaN(b.L) || (a.L - Lt) * (b.L - Lt) > 0) continue;
    let lo = a.t, hi = b.t, up = b.L > a.L;
    for (let n = 0; n < 200 && hi - lo > 1e-10; n++) { const m = 0.5 * (lo + hi), g = at(m); if (!g.valid) break; if ((g.L < Lt) === up) lo = m; else hi = m; }
    const t = 0.5 * (lo + hi), g = at(t);
    if (g.valid && Math.abs(g.L - Lt) < 1e-6 && (!best || Math.abs(t) < Math.abs(best.t))) best = { t, x: ps[i].x + t * dir[0], y: ps[i].y + t * dir[1], g };
  }
  return best;
}

/* ---- parts and drawings ---- */
/* backside idler: a smooth roller under the belt back, with the same bore / hole rules as a pulley */
function idlerParts(belt, N, st) {
  const r = pitchDia(N, belt.pitch) / 2, R = r - beltBack(belt), room = R - MIN_WALL;
  if (!(R > 1)) return { error: `A ${N}T backside idler is too small for the ${belt.label} belt — use more teeth.` };
  const bore = borePoly(st.bore, st.boreSize, st.boreFlat);
  if (bore && bore.bad) {
    return { error: bore.kind === 'd' ? 'D-shaft flat must be between half the diameter and the full diameter (measured from the flat to the far side).'
      : 'Double-D flats must be closer together than the diameter.' };
  }
  if (bore && bore.ext > room) {
    const max = { round: 2 * room, hex: Math.sqrt(3) * room, square: Math.SQRT2 * room, rex: 2 * room - 1, d: 2 * room, dd: 2 * room }[bore.kind];
    return { error: `Bore too large for a ${N}T ${belt.label} backside idler — max ≈ ${len(Math.max(0, max), 1)} (keeps ${lenR(MIN_WALL)} of wall).` };
  }
  const holes = [], H = st.holes;
  if (H) {
    const hr = H.d / 2, br = H.pcd / 2;
    if (br + hr > room) {
      const need = Math.ceil((br + hr + MIN_WALL + beltBack(belt)) * 2 * Math.PI / belt.pitch);
      return { error: `Mounting holes reach the rim of a ${N}T ${belt.label} backside idler — this pattern needs at least ${need} teeth.` };
    }
    if (bore && br - hr < bore.ext + MIN_WALL) {
      return { error: `Mounting holes cut into the bore — use a smaller bore or a bolt circle ≥ Ø${len(2 * (bore.ext + MIN_WALL + hr), 1)}.` };
    }
    if (H.n > 1 && 2 * br * Math.sin(Math.PI / H.n) < H.d + 0.4) return { error: 'Mounting holes overlap each other — use fewer or smaller holes, or a larger bolt circle.' };
    for (let k = 0; k < H.n; k++) {
      const a = (H.rot + k * 360 / H.n) * Math.PI / 180;
      holes.push({ c: [br * Math.cos(a), br * Math.sin(a)], r: hr });
    }
  }
  return { verts: [[R, 0, 1], [-R, 0, 1]], pd: 2 * r, od: 2 * R, D: 0, W: 0, rb: 0, rt: 0, rtClamped: false, rootR: R, bore, holes, idler: true };
}
/* one backside idler as a part drawing (like singleDoc): rim circle, bore, holes, pitch line, flange disc */
function idlerDoc(belt, N, st) {
  const part = idlerParts(belt, N, st);
  if (part.error) return part;
  const ents = [{ type: 'circle', layer: 'PULLEY', c: [0, 0], r: part.od / 2 }];
  addBore(ents, part.bore, 0, 0);
  addHoles(ents, part.holes, 0, 0);
  if (st.pitch) ents.push({ type: 'circle', layer: 'PITCH', c: [0, 0], r: part.pd / 2 });
  let flR = 0, fx = 0;
  if (st.flange && st.flh > 0) {
    flR = part.od / 2 + st.flh;
    fx = part.od / 2 + flR + 5;
    ents.push({ type: 'circle', layer: 'FLANGE', c: [fx, 0], r: flR });
    addBore(ents, part.bore, fx, 0);
    addHoles(ents, part.holes, fx, 0);
  }
  return { part, ents, flR, fx };
}
/* Layout export of the whole drive: 'assembly' (pulleys + belt, grooves turned under the belt teeth), 'belt' or 'pulleys'.
   sts[i] = part settings of list pulley i; layers PULLEY_<tag> follow the pulley names (P3 → PULLEY_3). */
function driveLayoutDoc(belt, g, sts, what) {
  const bo = driveOutline(belt, g, 0), ents = [];
  if (what !== 'belt') {
    for (const p of g.ps) {
      const st = sts[p.i], idl = p.side < 0, part = idl ? idlerParts(belt, p.N, st) : pulleyParts(belt, p.N, st);
      if (part.error) return { error: `Pulley ${p.tag}: ${part.error}` };
      const ang = idl ? 0 : drivePhase(bo, p.i), layer = `PULLEY_${p.tag}`, m = part.od / 2 + 2;
      if (idl) ents.push({ type: 'circle', layer, c: [p.x, p.y], r: part.od / 2 });
      else ents.push({ type: 'poly', layer, verts: rotVerts(part.verts, ang, p.x, p.y), bound: [p.x, p.y, part.od / 2] });
      if (part.bore && part.bore.kind === 'round') ents.push({ type: 'circle', layer: 'BORE', c: [p.x, p.y], r: part.bore.r });
      else if (part.bore) ents.push({ type: 'poly', layer: 'BORE', verts: rotVerts(part.bore.verts, ang, p.x, p.y) });
      addHoles(ents, part.holes, p.x, p.y, ang);
      if (st.pitch) ents.push({ type: 'circle', layer: 'PITCH', c: [p.x, p.y], r: part.pd / 2 });
      ents.push({ type: 'line', layer: 'CENTER', a: [p.x - m, p.y], b: [p.x + m, p.y] }, { type: 'line', layer: 'CENTER', a: [p.x, p.y - m], b: [p.x, p.y + m] });
    }
  }
  if (what !== 'pulleys') {
    ents.push({ type: 'poly', layer: 'BELT', verts: bo.outer, bounds: g.ps.map(p => [p.x, p.y, p.r + bo.tg.back]) });
    ents.push({ type: 'poly', layer: 'BELT', verts: bo.inner });
    if (sts.some(st => st && st.pitch)) ents.push({ type: 'poly', layer: 'PITCH', verts: driveLoopVerts(g, 0), bounds: g.ps.map(p => [p.x, p.y, p.r]) });
  }
  return { ents, bo };
}
/* belt drawing (Belt DXF tab) with the loop view round the whole drive: o.loop = { g } — else beltDoc as it is */
function driveBeltDoc(belt, n, W, o) {
  const rest = beltDoc(belt, n, W, { ...o, loop: null });
  if (!o.loop) return rest;
  const g = o.loop.g, th = Math.max(2, belt.pitch * 0.7), bo = driveOutline(belt, g, 0);
  const over = o.std > 0 && belt.thick > o.std + 1e-6 ? belt.thick - o.std : 0;
  const e = [{ type: 'poly', layer: 'BELT', verts: bo.outer }, { type: 'poly', layer: 'BELT', verts: bo.inner }];
  if (over) e.push({ type: 'poly', layer: 'OVER', verts: driveLoopVerts(g, bo.tg.back) }, { type: 'poly', layer: 'OVER', verts: driveLoopVerts(g, bo.tg.back - over) });
  if (o.pitch) e.push({ type: 'poly', layer: 'PITCH', verts: driveLoopVerts(g, 0) });
  const b = extentsOf(e), dx = -b[0], dy = -b[3];
  const ents = [{ type: 'text', layer: 'TEXT', p: [0, th * 0.7], h: th, s: `BELT ${rest.part}  LOOP ON ${g.n} PULLEYS AT C2C ${g.C.toFixed(3)} MM` }, ...shiftEnts(e, dx, dy)];
  return { ents: ents.concat(shiftEnts(rest.ents, 0, b[1] + dy - th * 3)), part: rest.part, m: rest.m };
}
