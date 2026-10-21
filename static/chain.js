/* Belt & Chain Calculator — Roller chains: chain data, sprockets, chain length, the exact loop, plates and DXF drawings. Pure computing, no DOM.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

// ==CHAIN-MATH-START==
/* ---- Roller chains ----
   p pitch · d1 roller Ø (bushing Ø on the rollerless #25 / #35: bush) · b1 inner width · d2 pin Ø ·
   tI / tO inner / outer plate thickness · hI / hO inner / outer plate height · pt transverse pitch (0 = simplex only).
   ANSI (ISO 606 A series) and ISO 606 B series from ISO 606 and maker tables; motorcycle and bicycle chains are typical maker values. */
const CHAINS = {
  A25:  { code: 'ANSI 25', label: '#25',  fam: 'ansi', iso: '04C', p: 6.35,   d1: 3.30,  b1: 3.18,  d2: 2.31, tI: 0.76, tO: 0.76, hI: 6.03,  hO: 5.21,  pt: 6.40,  bush: true },
  A25H: { code: 'ANSI 25H', label: '#25H', fam: 'ansi', iso: '04C heavy', p: 6.35, d1: 3.30, b1: 3.18, d2: 2.31, tI: 1.00, tO: 1.00, hI: 6.03, hO: 5.21, pt: 0, bush: true },
  A35:  { code: 'ANSI 35', label: '#35',  fam: 'ansi', iso: '06C', p: 9.525,  d1: 5.08,  b1: 4.78,  d2: 3.58, tI: 1.27, tO: 1.27, hI: 9.05,  hO: 7.81,  pt: 10.13, bush: true },
  A40:  { code: 'ANSI 40', label: '#40',  fam: 'ansi', iso: '08A', p: 12.7,   d1: 7.92,  b1: 7.92,  d2: 3.96, tI: 1.52, tO: 1.52, hI: 12.07, hO: 10.41, pt: 14.38 },
  A41:  { code: 'ANSI 41', label: '#41',  fam: 'ansi', iso: '085', p: 12.7,   d1: 7.77,  b1: 6.35,  d2: 3.58, tI: 1.27, tO: 1.27, hI: 9.91,  hO: 8.51,  pt: 0 },
  A50:  { code: 'ANSI 50', label: '#50',  fam: 'ansi', iso: '10A', p: 15.875, d1: 10.16, b1: 9.53,  d2: 5.08, tI: 2.03, tO: 2.03, hI: 15.09, hO: 13.02, pt: 18.11 },
  A60:  { code: 'ANSI 60', label: '#60',  fam: 'ansi', iso: '12A', p: 19.05,  d1: 11.91, b1: 12.70, d2: 5.94, tI: 2.39, tO: 2.39, hI: 18.10, hO: 15.62, pt: 22.78 },
  A80:  { code: 'ANSI 80', label: '#80',  fam: 'ansi', iso: '16A', p: 25.4,   d1: 15.88, b1: 15.88, d2: 7.92, tI: 3.18, tO: 3.18, hI: 24.13, hO: 20.83, pt: 29.29 },
  A100: { code: 'ANSI 100', label: '#100', fam: 'ansi', iso: '20A', p: 31.75,  d1: 19.05, b1: 19.05, d2: 9.53, tI: 3.96, tO: 3.96, hI: 30.16, hO: 26.04, pt: 35.76 },
  B05:  { code: 'ISO 05B', label: '05B', fam: 'iso', iso: '05B', p: 8.0,    d1: 5.00,  b1: 3.00,  d2: 2.31, tI: 0.75, tO: 0.75, hI: 7.10,  hO: 7.10,  pt: 5.64 },
  B06:  { code: 'ISO 06B', label: '06B', fam: 'iso', iso: '06B', p: 9.525,  d1: 6.35,  b1: 5.72,  d2: 3.28, tI: 1.30, tO: 1.00, hI: 8.20,  hO: 8.20,  pt: 10.24 },
  B08:  { code: 'ISO 08B', label: '08B', fam: 'iso', iso: '08B', p: 12.7,   d1: 8.51,  b1: 7.75,  d2: 4.45, tI: 1.60, tO: 1.60, hI: 11.70, hO: 10.90, pt: 13.92 },
  B10:  { code: 'ISO 10B', label: '10B', fam: 'iso', iso: '10B', p: 15.875, d1: 10.16, b1: 9.65,  d2: 5.08, tI: 1.60, tO: 1.60, hI: 14.60, hO: 13.70, pt: 16.59 },
  B12:  { code: 'ISO 12B', label: '12B', fam: 'iso', iso: '12B', p: 19.05,  d1: 12.07, b1: 11.68, d2: 5.72, tI: 1.80, tO: 1.80, hI: 16.00, hO: 16.00, pt: 19.46 },
  B16:  { code: 'ISO 16B', label: '16B', fam: 'iso', iso: '16B', p: 25.4,   d1: 15.88, b1: 17.02, d2: 8.28, tI: 4.00, tO: 3.20, hI: 19.70, hO: 19.70, pt: 31.88 },
  M420: { code: 'MOTO 420', label: '420', fam: 'moto', p: 12.7,   d1: 7.75,  b1: 6.35, d2: 3.97, tI: 1.50, tO: 1.50, hI: 11.70, hO: 10.40, pt: 0 },
  M428: { code: 'MOTO 428', label: '428', fam: 'moto', p: 12.7,   d1: 8.51,  b1: 7.94, d2: 4.51, tI: 1.50, tO: 1.50, hI: 11.80, hO: 10.90, pt: 0 },
  M520: { code: 'MOTO 520', label: '520', fam: 'moto', p: 15.875, d1: 10.16, b1: 6.35, d2: 5.24, tI: 2.00, tO: 2.00, hI: 15.10, hO: 13.50, pt: 0 },
  M525: { code: 'MOTO 525', label: '525', fam: 'moto', p: 15.875, d1: 10.16, b1: 7.94, d2: 5.24, tI: 2.00, tO: 2.00, hI: 15.10, hO: 13.50, pt: 0 },
  M530: { code: 'MOTO 530', label: '530', fam: 'moto', p: 15.875, d1: 10.16, b1: 9.53, d2: 5.24, tI: 2.00, tO: 2.00, hI: 15.10, hO: 13.50, pt: 0 },
  K8:   { code: 'BIKE 1-2x1-8', label: '½″ × ⅛″',   fam: 'bike', sub: 'BMX / single speed', p: 12.7, d1: 7.75, b1: 3.30, d2: 3.66, tI: 1.20, tO: 1.20, hI: 9.90, hO: 9.90, pt: 0 },
  K332: { code: 'BIKE 1-2x3-32', label: '½″ × 3⁄32″', fam: 'bike', sub: 'derailleur',        p: 12.7, d1: 7.75, b1: 2.38, d2: 3.58, tI: 0.90, tO: 0.90, hI: 9.40, hO: 9.00, pt: 0 },
};
Object.keys(CHAINS).forEach(k => { CHAINS[k].key = k; });
const CHAIN_FAMS = [
  { v: 'ansi', t: 'ANSI', s: '#25 – #100' },
  { v: 'iso', t: 'ISO / BS', s: '05B – 16B' },
  { v: 'moto', t: 'Moto', s: '420 – 530' },
  { v: 'bike', t: 'Bicycle', s: '½″ pitch' },
];
const bushD = ch => ch.bush ? ch.d1 : Math.round((ch.d2 + 0.45 * (ch.d1 - ch.d2)) * 100) / 100;   // bushing OD
const sprR = (p, z) => p / (2 * Math.sin(Math.PI / z));                   // pitch radius
const toothW = ch => Math.round((ch.p <= 12.7 ? 0.93 : 0.95) * ch.b1 * 100) / 100;   // sprocket tooth width, ISO 606
const maxStrands = ch => ch.pt > 0 ? 4 : 1;

/* small 2D helpers for polylines with bulges [x, y, bulge] */
const sweepOf = (c, a, b) => {                      // signed minor-arc angle a → b around c
  const ax = a[0] - c[0], ay = a[1] - c[1], bx = b[0] - c[0], by = b[1] - c[1];
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
};
const rot2 = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const xformVerts = (verts, ang, ox, oy) => verts.map(([x, y, b]) => { const q = rot2([x, y], ang); return [q[0] + ox, q[1] + oy, b]; });
const circleLoop = (cx, cy, r, ccw = true) => [[cx + r, cy, ccw ? 1 : -1], [cx - r, cy, ccw ? 1 : -1]];
/* signed area of a bulge polyline (> 0 = CCW) */
function loopArea(v) {
  let A = 0;
  for (let i = 0; i < v.length; i++) {
    const [x0, y0, b] = v[i], [x1, y1] = v[(i + 1) % v.length];
    A += (x0 * y1 - x1 * y0) / 2;
    if (b) {
      const th = 4 * Math.atan(b), c = Math.hypot(x1 - x0, y1 - y0), r = c / (2 * Math.abs(Math.sin(th / 2)));
      A += r * r / 2 * (th - Math.sin(th));
    }
  }
  return A;
}
function reverseLoop(v) {
  const n = v.length, out = [];
  for (let i = n - 1; i >= 0; i--) out.push([v[i][0], v[i][1], -v[(i - 1 + n) % n][2]]);
  return out;
}
const orient = (v, ccw) => (loopArea(v) > 0) === ccw ? v : reverseLoop(v);

/* ---- Sprocket: ANSI B29.1 standard tooth form (Machinery's Handbook), any roller chain ----
   per tooth gap: seating curve R (centre = pitch point a), working curve E (centre c), straight line yz,
   topping curve F (centre b on the chord to the next pitch point) up to the outside Ø P(0.6 + cot 180°/N).
   The topping curve stays 0.07·Dr inside the circle swept by a roller pivoting on the next pin, so rollers can
   leave and enter the gaps freely. fit > 0 offsets the whole gap outward (looser).
   Tooth gap 0 sits on +Y; the outline runs CCW. */
const sprCache = new Map();
function sprocketOutline(ch, z, fit) {
  fit = fit || 0;
  const key = `${ch.key}|${z}|${fit}`;
  if (sprCache.has(key)) return sprCache.get(key);
  const res = sprocketCalc(ch, z, fit);
  if (sprCache.size > 80) sprCache.clear();
  sprCache.set(key, res);
  return res;
}
function sprocketCalc(ch, z, fit) {
  const P = ch.p, Dr = ch.d1, IN = 25.4, d = Math.PI / 180;
  if (!(z >= 6 && z <= 250)) return { error: 'Use 6 to 250 teeth.' };
  const Rp = sprR(P, z), step = 2 * Math.PI / z, hs = Math.PI / z;
  const R = 0.5025 * Dr + 0.0015 * IN + fit;                         // seating curve radius
  if (!(R > 0.4 * Dr)) return { error: 'Fit offset is too negative for this chain.' };
  const A = (35 + 60 / z) * d, B = (18 - 56 / z) * d, AB = A - B;
  const E = 1.3025 * Dr + 0.0015 * IN + fit;                         // working curve radius
  const F = Dr * (0.8 * Math.cos(B) + 1.4 * Math.cos((17 - 64 / z) * d) - 1.3025) - 0.0015 * IN - fit;   // topping curve
  if (!(F > 0.05 * Dr)) return { error: 'Fit offset is too large for this chain.' };
  // local frame of gap 0: pitch point a = (0,0), y radial outward, sprocket centre S = (0, -Rp)
  const c = [-0.8 * Dr * Math.cos(A), 0.8 * Dr * Math.sin(A)];       // working-curve centre (right flank)
  const b = [1.4 * Dr * Math.cos(hs), -1.4 * Dr * Math.sin(hs)];      // topping-curve centre, on the chord to the next pitch point
  const n = [Math.cos(AB), -Math.sin(AB)];                            // normal of the straight flank yz
  const xr = [R * Math.cos(A), -R * Math.sin(A)];
  const yr = [c[0] + E * n[0], c[1] + E * n[1]], zr = [b[0] - F * n[0], b[1] - F * n[1]];
  if ((zr[0] - yr[0]) * n[1] - (zr[1] - yr[1]) * n[0] > 1e-9) return { error: `Can't form ${ch.label} teeth on a ${z}T sprocket.` };
  const S = [0, -Rp], rOf = q => Math.hypot(q[0] - S[0], q[1] - S[1]);
  const angOf = q => Math.atan2(q[0] - S[0], q[1] - S[1]);           // angle from the gap's radial line, + toward the tooth
  if (!(angOf(xr) < hs && angOf(zr) < hs)) return { error: `A ${z}T sprocket is too small for ${ch.label} chain — use more teeth.` };
  let Ro = P * (0.6 + 1 / Math.tan(hs)) / 2;                          // ANSI outside radius
  const f0 = Math.atan2(zr[1] - b[1], zr[0] - b[0]);
  const X = (s, ps) => [b[0] + F * Math.cos(f0 + s * ps), b[1] + F * Math.sin(f0 + s * ps)];
  const sg = rOf(X(1, 1e-4)) > rOf(X(-1, 1e-4)) ? 1 : -1;            // direction that climbs the flank
  const first = (fn, hi) => {
    let a0 = 0;
    for (let i = 1; i <= 400; i++) {
      const b0 = hi * i / 400;
      if (fn(b0) >= 0) { let lo = a0, up = b0; for (let k = 0; k < 50; k++) { const m = (lo + up) / 2; if (fn(m) >= 0) up = m; else lo = m; } return up; }
      a0 = b0;
    }
    return NaN;
  };
  const lim = Math.PI;
  const psMid = first(ps => angOf(X(sg, ps)) - hs, lim);
  let psTip = first(ps => rOf(X(sg, ps)) - Ro, lim), pointed = false;
  if (!Number.isFinite(psTip) || (Number.isFinite(psMid) && psMid <= psTip)) {
    if (!Number.isFinite(psMid)) return { error: `Can't form ${ch.label} teeth on a ${z}T sprocket.` };
    pointed = true;
    Ro = rOf(X(sg, psMid)) - 0.02 * P;
    psTip = first(ps => rOf(X(sg, ps)) - Ro, psMid);
    if (!Number.isFinite(psTip)) return { error: `Can't form ${ch.label} teeth on a ${z}T sprocket.` };
  }
  const tr = X(sg, psTip);
  const m = q => [-q[0], q[1]];
  // to global (gap 0 on +Y); CCW traversal visits the +x (clockwise) side first
  const G = q => [q[0], q[1] + Rp], cG = [0, 0];
  const pts = { tR: G(tr), zR: G(zr), yR: G(yr), xR: G(xr), xL: G(m(xr)), yL: G(m(yr)), zL: G(m(zr)), tL: G(m(tr)) };
  const bR = G(b), bL = G(m(b)), cR = G(c), cL = G(m(c)), a = G([0, 0]);
  const tR1 = rot2(pts.tR, step);
  const bul = (cc, s, e) => Math.tan(sweepOf(cc, s, e) / 4);
  const gap = [
    [...pts.tR, bul(bR, pts.tR, pts.zR)], [...pts.zR, 0], [...pts.yR, bul(cR, pts.yR, pts.xR)], [...pts.xR, bul(a, pts.xR, pts.xL)],
    [...pts.xL, bul(cL, pts.xL, pts.yL)], [...pts.yL, 0], [...pts.zL, bul(bL, pts.zL, pts.tL)], [...pts.tL, bul(cG, pts.tL, tR1)],
  ];
  const verts = [];
  for (let k = 0; k < z; k++) for (const [x, y, bb] of gap) { const q = rot2([x, y], k * step); verts.push([q[0], q[1], bb]); }
  const land = Ro * sweepOf(cG, pts.tL, tR1);
  return { verts, z, pd: 2 * Rp, od: 2 * Ro, rootD: 2 * (Rp - R), ri: R, R: Rp, Ra: Ro, pointed, land, step, E, F,
    mop: z % 2 ? 2 * Rp * Math.cos(Math.PI / (2 * z)) + Dr : 2 * Rp + Dr };
}
/* sprocket + bore + mounting holes (same bore / hole rules as the pulleys) */
function sprocketParts(ch, z, st) {
  const o = sprocketOutline(ch, z, st.fit);
  if (o.error) return o;
  const rootR = o.rootD / 2, room = rootR - MIN_WALL;
  const bore = borePoly(st.bore, st.boreSize, st.boreFlat);
  if (bore && bore.bad) {
    return { error: bore.kind === 'd' ? 'D-shaft flat must be between half the diameter and the full diameter (measured from the flat to the far side).'
      : 'Double-D flats must be closer together than the diameter.' };
  }
  if (bore && bore.ext > room) {
    const max = { round: 2 * room, hex: Math.sqrt(3) * room, square: Math.SQRT2 * room, rex: 2 * room - 1, d: 2 * room, dd: 2 * room }[bore.kind];
    return { error: `Bore too large for a ${z}T ${ch.label} sprocket — max ≈ ${len(Math.max(0, max), 1)} (keeps ${lenR(MIN_WALL)} of wall under the teeth).` };
  }
  const holes = [], H = st.holes;
  if (H) {
    const hr = H.d / 2, br = H.pcd / 2;
    if (br + hr > room) {
      const need = br + hr + MIN_WALL + o.ri, zmin = Math.ceil(Math.PI / Math.asin(Math.min(1, ch.p / (2 * need))));
      return { error: `Mounting holes reach into the teeth on a ${z}T ${ch.label} sprocket — this pattern needs at least ${zmin} teeth.` };
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
  return { ...o, rootR, bore, holes };
}
/* bore as a polyline loop (round bores become two half circles) */
const boreLoop = bore => !bore ? null : bore.kind === 'round' ? circleLoop(0, 0, bore.r) : bore.verts.map(v => v.slice());

/* ---- drive geometry: pitch-circle tangent model (each tooth of wrap = one pitch) ---- */
function chainLinksAt(ch, z1, z2, C) {
  const p = ch.p, R1 = sprR(p, z1), R2 = sprR(p, z2), d = R2 - R1;
  if (!(C > Math.abs(d))) return NaN;
  const phi = Math.asin(d / C);
  return 2 * Math.sqrt(C * C - d * d) / p + (z1 * (Math.PI - 2 * phi) + z2 * (Math.PI + 2 * phi)) / (2 * Math.PI);
}
function chainCenter(ch, z1, z2, L) {
  const R1 = sprR(ch.p, z1), R2 = sprR(ch.p, z2);
  let lo = Math.abs(R2 - R1) * (1 + 1e-9) + 1e-9, hi = Math.max(lo * 2, L * ch.p, 1);
  if (!(chainLinksAt(ch, z1, z2, lo) <= L)) return NaN;
  while (chainLinksAt(ch, z1, z2, hi) < L) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-11; i++) {
    const m = (lo + hi) / 2;
    if (chainLinksAt(ch, z1, z2, m) < L) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
function chainAnalyze(ch, z1, z2, C) {
  const p = ch.p, R1 = sprR(p, z1), R2 = sprR(p, z2), d = R2 - R1;
  const s1 = sprocketOutline(ch, z1, 0), s2 = sprocketOutline(ch, z2, 0);
  const g = { R1, R2, pd1: 2 * R1, pd2: 2 * R2, od1: s1.od, od2: s2.od, valid: C > Math.abs(d) && !s1.error && !s2.error };
  if (!g.valid) return g;
  const phi = Math.asin(d / C);
  Object.assign(g, {
    C, phi, th1: Math.PI - 2 * phi, th2: Math.PI + 2 * phi, span: Math.sqrt(C * C - d * d),
    gap: C - (s1.od + s2.od) / 2, links: chainLinksAt(ch, z1, z2, C),
  });
  g.mesh1 = z1 * g.th1 / (2 * Math.PI); g.mesh2 = z2 * g.th2 / (2 * Math.PI);
  return g;
}
/* smallest link count whose centre distance keeps the sprocket tips apart */
function minLinksFor(ch, z1, z2) {
  const s1 = sprocketOutline(ch, z1, 0), s2 = sprocketOutline(ch, z2, 0);
  if (s1.error || s2.error) return NaN;
  return Math.ceil(chainLinksAt(ch, z1, z2, (s1.od + s2.od) / 2 + 0.5) - 1e-9);
}

/* ---- pin path for the animation: pitch-path segments measured in pitches (u) ----
   spans: length / p · wraps: teeth of wrap. Pins sit u = 1 apart, so on a wrap they land exactly on the tooth gaps. */
function chainPath(ch, z1, z2, C, r1, r2) {
  const p = ch.p, R1 = r1 || sprR(p, z1), R2 = r2 || sprR(p, z2), bp = beltPath(R1, R2, C);
  const zs = [0, z2, 0, z1], segs = bp.segs.map((g, i) => ({ g, z: zs[i], u: g.a ? g.len / p : zs[i] * (g.len / g.r) / (2 * Math.PI) }));
  let u0 = 0;
  for (const s of segs) { s.u0 = u0; u0 += s.u; }
  return { bp, segs, U: u0, p, z1, z2, R1, R2, C };
}
function chainAt(cp, u) {
  u = ((u % cp.U) + cp.U) % cp.U;
  let i = 3;
  while (i > 0 && u < cp.segs[i].u0) i--;
  const s = cp.segs[i], g = s.g, q = u - s.u0;
  if (g.a) { const m = q * cp.p; return { i, p: [g.a[0] + g.t[0] * m, g.a[1] + g.t[1] * m] }; }
  const a = g.a0 + q * 2 * Math.PI / s.z;
  return { i, a, p: [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)] };
}
/* rotation of sprocket j (1 | 2) that puts a tooth gap under the pin nearest the middle of its wrap */
function chainPhase(cp, sOff, du, j) {
  const s = cp.segs[j === 1 ? 3 : 1], k = Math.round((s.u0 + s.u / 2 - sOff) / du);
  return s.g.a0 + (sOff + k * du - s.u0) * 2 * Math.PI / s.z - Math.PI / 2;
}

/* ---- exact closed chain at centre distance C: every link exactly one pitch ----
   Pins on the wraps sit on the sprockets' pitch polygons; the upper span is taut, the lower one takes any slack
   as a shallow arc. The sprocket phases are searched so the chain fits. Returns pins in CCW order + phases. */
function chainLoopExact(ch, z1, z2, C, L) {
  const p = ch.p, R1 = sprR(p, z1), R2 = sprR(p, z2), s1 = 2 * Math.PI / z1, s2 = 2 * Math.PI / z2;
  const poly = (R, z, psi, cx) => { const o = []; for (let k = 0; k < z; k++) o.push([cx + R * Math.cos(psi + k * 2 * Math.PI / z), R * Math.sin(psi + k * 2 * Math.PI / z)]); return o; };
  const slope = (a, b) => (b[1] - a[1]) / (b[0] - a[0]);
  function bridge(P1, P2, sg) {
    let a = 0, b = 0;
    P1.forEach((q, i) => { if (sg * q[1] > sg * P1[a][1]) a = i; });
    P2.forEach((q, i) => { if (sg * q[1] > sg * P2[b][1]) b = i; });
    for (let it = 0; it < 60; it++) {
      let nb = b, best = -Infinity;
      P2.forEach((q, j) => { const s = sg * slope(P1[a], q); if (s > best + 1e-12) { best = s; nb = j; } });
      let na = a; best = -Infinity;
      P1.forEach((q, i) => { const s = -sg * slope(q, P2[nb]); if (s > best + 1e-12) { best = s; na = i; } });
      if (na === a && nb === b) break;
      a = na; b = nb;
    }
    return [a, b];
  }
  function cfg(psi1, psi2) {
    const P1 = poly(R1, z1, psi1, 0), P2 = poly(R2, z2, psi2, C);
    const up = bridge(P1, P2, 1), lo = bridge(P1, P2, -1);
    const k2 = ((up[1] - lo[1]) % z2 + z2) % z2 + 1, k1 = ((lo[0] - up[0]) % z1 + z1) % z1 + 1;
    const Lu = Math.hypot(P2[up[1]][0] - P1[up[0]][0], P2[up[1]][1] - P1[up[0]][1]);
    const Ll = Math.hypot(P2[lo[1]][0] - P1[lo[0]][0], P2[lo[1]][1] - P1[lo[0]][1]);
    return { psi1, psi2, P1, P2, up, lo, k1, k2, Lu, Ll, M: L - (k1 - 1) - (k2 - 1), topo: `${up}|${lo}` };
  }
  let best = null;
  const consider = c => {
    const mu = Math.round(c.Lu / p), ml = c.M - mu;
    if (Math.abs(c.Lu - mu * p) > 1e-6 * p || ml < 1) return;
    const slack = ml * p - c.Ll;
    if (slack < -1e-7) return;
    if (!best || slack < best.slack) best = { ...c, mu, ml, slack: Math.max(0, slack) };
  };
  const N1 = 12, N2 = 48;
  for (let a = 0; a < N1; a++) {
    const psi1 = a * s1 / N1;
    let prev = cfg(psi1, 0);
    for (let b = 1; b <= N2; b++) {
      const cur = cfg(psi1, b * s2 / N2);
      if (cur.topo === prev.topo) {
        const f0 = prev.Lu / p, f1 = cur.Lu / p, m = Math.ceil(Math.min(f0, f1) - 1e-12);
        if (m <= Math.max(f0, f1)) {
          let lo = prev.psi2, hi = cur.psi2;
          const sgn = Math.sign(f1 - f0);
          for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2, c = cfg(psi1, mid);
            if (c.topo !== prev.topo) break;
            if (sgn * (c.Lu / p - m) < 0) lo = mid; else hi = mid;
          }
          const c = cfg(psi1, (lo + hi) / 2);
          if (c.topo === prev.topo) consider(c);
        }
      }
      prev = cur;
    }
  }
  if (!best) return null;
  const { P1, P2, up, lo, k1, k2, mu, ml } = best;
  const pins = [];
  const span = (E0, E1, m) => {               // interior pins of a span from E0 to E1 with m links (CCW loop: interior on the left)
    const dx = E1[0] - E0[0], dy = E1[1] - E0[1], D = Math.hypot(dx, dy), out = [];
    if (m * p - D < 1e-9) { for (let k = 1; k < m; k++) out.push([E0[0] + dx * k / m, E0[1] + dy * k / m]); return out; }
    const fr = ph => Math.sin(m * ph / 2) / Math.sin(ph / 2) - D / p;
    let a = 1e-12, b = 2 * Math.PI / m - 1e-9;
    for (let k = 0; k < 100; k++) { const mid = (a + b) / 2; if (fr(mid) > 0) a = mid; else b = mid; }
    const ph = (a + b) / 2, rho = p / (2 * Math.sin(ph / 2)), nIn = [-dy / D, dx / D];
    const cc = [(E0[0] + E1[0]) / 2 + nIn[0] * rho * Math.cos(m * ph / 2), (E0[1] + E1[1]) / 2 + nIn[1] * rho * Math.cos(m * ph / 2)];
    const r0 = [E0[0] - cc[0], E0[1] - cc[1]], mid = rot2(r0, m * ph / 2);
    const sg = mid[0] * -nIn[0] + mid[1] * -nIn[1] > 0 ? 1 : -1;     // turn the way that bulges outward
    for (let k = 1; k < m; k++) { const q = rot2(r0, sg * k * ph); out.push([cc[0] + q[0], cc[1] + q[1]]); }
    return out;
  };
  pins.push(P1[lo[0]], ...span(P1[lo[0]], P2[lo[1]], ml));
  for (let k = 0; k < k2; k++) pins.push(P2[(lo[1] + k) % z2]);
  pins.push(...span(P2[up[1]], P1[up[0]], mu));
  for (let k = 0; k < k1 - 1; k++) pins.push(P1[(up[0] + k) % z1]);
  return { pins, psi: [best.psi1, best.psi2], slack: best.slack, mu, ml, k1, k2 };
}

/* ---- link plates ---- figure-eight plate: end arcs (height h) around the holes at x = 0 and x = p, concave waist.
   cut = ['L' | 'R', x] keeps the left / right part of the plate (the two halves of an offset link). */
function plateLoop(p, h, cut) {
  const re = h / 2, w = 0.42 * h, Rw = (p * p / 4 + w * w - re * re) / (2 * (re - w)), a = Math.atan2(w + Rw, p / 2);
  const T1 = [re * Math.cos(a), re * Math.sin(a)], B1 = [T1[0], -T1[1]], T2 = [p - T1[0], T1[1]], B2 = [p - T1[0], -T1[1]];
  const be = Math.tan((2 * Math.PI - 2 * a) / 4), cT = [p / 2, w + Rw], cB = [p / 2, -(w + Rw)];
  const bulge = (c, s, e) => Math.tan(sweepOf(c, s, e) / 4);
  if (!cut) return [[B1[0], B1[1], bulge(cB, B1, B2)], [B2[0], B2[1], be], [T2[0], T2[1], bulge(cT, T2, T1)], [T1[0], T1[1], be]];
  const xc = Math.min(T2[0] - 1e-3, Math.max(T1[0] + 1e-3, cut[1]));
  const yc = w + Rw - Math.sqrt(Rw * Rw - (xc - p / 2) ** 2), Mt = [xc, yc], Mb = [xc, -yc];
  if (cut[0] === 'L') return [[Mt[0], Mt[1], bulge(cT, Mt, T1)], [T1[0], T1[1], be], [B1[0], B1[1], bulge(cB, B1, Mb)], [Mb[0], Mb[1], 0]];
  return [[Mb[0], Mb[1], bulge(cB, Mb, B2)], [B2[0], B2[1], be], [T2[0], T2[1], bulge(cT, T2, Mt)], [Mt[0], Mt[1], 0]];
}

/* offset link = cranked plates, modelled as an inner-level half (around its first pin) and an outer-level half
   (around its second pin); each half stops short of the neighbouring plate on the same level */
const offsetCut = (ch, side) => side === 'L' ? ['L', ch.p - ch.hI / 2 - 0.04 * ch.p] : ['R', ch.hO / 2 + 0.04 * ch.p];
/* ---- chain layout from pin positions ----
   links alternate inner (even) / outer (odd); a closed chain with an odd count gets an offset link at the end. */
function chainLinks(pins, closed) {
  const n = pins.length, nl = closed ? n : n - 1, links = [];
  for (let k = 0; k < nl; k++) {
    const type = closed && n % 2 && k === nl - 1 ? 'X' : k % 2 ? 'O' : 'I';
    links.push({ k, a: pins[k], b: pins[(k + 1) % n], type });
  }
  const pos = pins.map((at, i) => {
    const adj = [];
    if (closed || i > 0) adj.push({ l: links[(i - 1 + nl) % nl], end: 'b' });
    if (closed || i < n - 1) adj.push({ l: links[i % nl], end: 'a' });
    // an offset link acts as inner at its start (a) and outer at its end (b)
    const kind = ({ l, end }) => l.type === 'X' ? (end === 'a' ? 'I' : 'O') : l.type;
    return { at, roller: adj.some(x => kind(x) === 'I'), pin: adj.some(x => kind(x) === 'O') };
  });
  return { links, pos };
}
/* z levels across the chain (pin axis), strand centres symmetric about 0 */
function chainZ(ch, n) {
  n = Math.max(1, Math.min(maxStrands(ch), n || 1));
  const g = 0.05, zs = [], inner = [], outer = [], bush = [], roller = [];
  for (let k = 0; k < n; k++) {
    const zc = (k - (n - 1) / 2) * (ch.pt || 0);
    zs.push(zc);
    inner.push([zc - ch.b1 / 2 - ch.tI, zc - ch.b1 / 2], [zc + ch.b1 / 2, zc + ch.b1 / 2 + ch.tI]);
    bush.push([zc - ch.b1 / 2 - ch.tI, zc + ch.b1 / 2 + ch.tI]);
    roller.push([zc - ch.b1 / 2 + 0.05, zc + ch.b1 / 2 - 0.05]);
  }
  const zo = zs[n - 1] + ch.b1 / 2 + ch.tI + g;
  outer.push([-zo - ch.tO, -zo], [zo, zo + ch.tO]);
  for (let k = 0; k + 1 < n; k++) { const m = (zs[k] + zs[k + 1]) / 2; outer.push([m - ch.tO / 2, m + ch.tO / 2]); }
  const pl = zo + ch.tO + Math.max(0.3, 0.35 * ch.d2);
  return { n, zs, inner, outer, bush, roller, pin: [-pl, pl], width: 2 * pl, innerW: ch.b1 + 2 * ch.tI };
}

/* ---- 2D drawings (DXF entities) ---- */
function linkPlates(ch, l) {            // plate outlines of one link in the side view: [{ inner, verts }]
  const ang = Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]), p = ch.p;
  const put = (v, inner) => ({ inner, verts: xformVerts(v, ang, l.a[0], l.a[1]) });
  if (l.type === 'I') return [put(plateLoop(p, ch.hI), true)];
  if (l.type === 'O') return [put(plateLoop(p, ch.hO), false)];
  return [put(plateLoop(p, ch.hI, offsetCut(ch, 'L')), true), put(plateLoop(p, ch.hO, offsetCut(ch, 'R')), false)];
}
function chainSideEnts(ch, pins, closed, o) {
  o = o || {};
  const { links, pos } = chainLinks(pins, closed), ents = [];
  for (const l of links) for (const pl of linkPlates(ch, l)) ents.push({ type: 'poly', layer: pl.inner ? 'PLATE_IN' : 'PLATE_OUT', verts: pl.verts });
  for (const q of pos) {
    if (q.roller) ents.push({ type: 'circle', layer: 'ROLLER', c: q.at, r: ch.d1 / 2 });
    if (q.pin) ents.push({ type: 'circle', layer: 'PIN', c: q.at, r: ch.d2 / 2 });
  }
  if (o.pitch) {
    if (closed) ents.push({ type: 'poly', layer: 'PITCH', verts: pins.map(q => [q[0], q[1], 0]) });
    else for (let i = 0; i + 1 < pins.length; i++) ents.push({ type: 'line', layer: 'PITCH', a: pins[i], b: pins[i + 1] });
  }
  return { ents, links, pos };
}
/* top view of a straight piece (looking at the plate edges), strands stacked in y */
function chainTopEnts(ch, n, strands) {
  const Z = chainZ(ch, strands), p = ch.p, ents = [], rect = (x0, x1, y0, y1, layer) => ents.push({ type: 'poly', layer, verts: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]] });
  const pins = Array.from({ length: n + 1 }, (_, i) => [i * p, 0]), { links, pos } = chainLinks(pins, false);
  for (const l of links) {
    const x = l.a[0];
    if (l.type === 'I') for (const [a, b] of Z.inner) rect(x - ch.hI / 2, x + p + ch.hI / 2, a, b, 'PLATE_IN');
    else for (const [a, b] of Z.outer) rect(x - ch.hO / 2, x + p + ch.hO / 2, a, b, 'PLATE_OUT');
  }
  pos.forEach(q => {
    const x = q.at[0];
    if (q.roller) for (const [a, b] of Z.roller) rect(x - ch.d1 / 2, x + ch.d1 / 2, a, b, 'ROLLER');
    if (q.pin) rect(x - ch.d2 / 2, x + ch.d2 / 2, Z.pin[0], Z.pin[1], 'PIN');
  });
  return { ents, Z };
}
/* flat patterns of the inner and outer plate, with their holes */
function plateShapeEnts(ch) {
  const p = ch.p, dB = bushD(ch), gap = Math.max(ch.hI, ch.hO) * 0.6, x2 = p + ch.hI / 2 + gap + ch.hO / 2;
  const ents = [
    { type: 'poly', layer: 'PLATE_IN', verts: plateLoop(p, ch.hI) },
    { type: 'circle', layer: 'HOLES', c: [0, 0], r: dB / 2 }, { type: 'circle', layer: 'HOLES', c: [p, 0], r: dB / 2 },
    { type: 'poly', layer: 'PLATE_OUT', verts: xformVerts(plateLoop(p, ch.hO), 0, x2, 0) },
    { type: 'circle', layer: 'HOLES', c: [x2, 0], r: ch.d2 / 2 }, { type: 'circle', layer: 'HOLES', c: [x2 + p, 0], r: ch.d2 / 2 },
  ];
  const th = Math.max(0.9, p * 0.09);
  ents.push({ type: 'text', layer: 'TEXT', p: [-ch.hI / 2, -ch.hI / 2 - th * 1.8], h: th, s: `INNER ${ch.tI} THK  HOLES D${dB}` },
    { type: 'text', layer: 'TEXT', p: [x2 - ch.hO / 2, -ch.hI / 2 - th * 1.8], h: th, s: `OUTER ${ch.tO} THK  HOLES D${ch.d2}` });
  return ents;
}
/* ---- DXF documents ---- */
const chainTag = ch => ch.code.replace(/[^A-Za-z0-9]+/g, '');
/* layout at C2C: 'assembly' (sprockets + chain, meshed), 'chain' or 'sprockets'. st2 = sprocket settings [S1, S2] */
function chainLayoutDoc(ch, z1, z2, C, L, st2, what) {
  const ex = chainLoopExact(ch, z1, z2, C, L);
  if (!ex) return { error: "The chain doesn't fit around the sprockets at this C2C." };
  const ents = [];
  if (what !== 'chain') {
    const parts = [sprocketParts(ch, z1, st2[0]), sprocketParts(ch, z2, st2[1])];
    for (let j = 0; j < 2; j++) {
      const pt = parts[j];
      if (pt.error) return { error: `Sprocket ${j + 1}: ${pt.error}` };
      const ox = j ? C : 0, ang = ex.psi[j] - Math.PI / 2, m = pt.od / 2 + 2;
      ents.push({ type: 'poly', layer: `SPROCKET_${j + 1}`, verts: xformVerts(pt.verts, ang, ox, 0), bound: [ox, 0, pt.od / 2] });
      if (pt.bore && pt.bore.kind === 'round') ents.push({ type: 'circle', layer: 'BORE', c: [ox, 0], r: pt.bore.r });
      else if (pt.bore) ents.push({ type: 'poly', layer: 'BORE', verts: xformVerts(pt.bore.verts, ang, ox, 0) });
      addHoles(ents, pt.holes, ox, 0, ang);
      if (st2[j].pitch) ents.push({ type: 'circle', layer: 'PITCH', c: [ox, 0], r: pt.pd / 2 });
      ents.push({ type: 'line', layer: 'CENTER', a: [ox, -m], b: [ox, m] });
    }
    ents.push({ type: 'line', layer: 'CENTER', a: [-parts[0].od / 2 - 2, 0], b: [C + parts[1].od / 2 + 2, 0] });
  }
  if (what !== 'sprockets') ents.push(...chainSideEnts(ch, ex.pins, true, { pitch: st2[0].pitch || st2[1].pitch }).ents);
  return { ents, ex };
}
/* chain drawing, views stacked top to bottom with titles.
   o = { loop: { pins, z1, z2, C } | null, side, top, plates, pitch, n (links in the straight views), strands } */
function chainDxfDoc(ch, o) {
  const p = ch.p, th = Math.max(1.6, p * 0.45), views = [], n = o.n, nm = `${ch.code}${o.strands > 1 ? '-' + o.strands : ''}`;
  if (o.loop) views.push({ e: chainSideEnts(ch, o.loop.pins, true, { pitch: o.pitch }).ents,
    title: `CHAIN ${nm} x ${o.loop.pins.length} LINKS  ${o.loop.z1}T + ${o.loop.z2}T AT C2C ${o.loop.C.toFixed(3)} MM` });
  if (o.side && n >= 1) {
    const pins = Array.from({ length: n + 1 }, (_, i) => [i * p, 0]);
    views.push({ e: chainSideEnts(ch, pins, false, { pitch: o.pitch }).ents, title: `SIDE VIEW  ${n} LINKS x ${p} = ${+(n * p).toFixed(3)} MM` });
  }
  if (o.top && n >= 1) {
    const t = chainTopEnts(ch, n, o.strands);
    views.push({ e: t.ents, title: `TOP VIEW  ${nm}  WIDTH OVER PINS ${t.Z.width.toFixed(2)} MM` });
  }
  if (o.plates) views.push({ e: plateShapeEnts(ch), title: `PLATES  INNER H${ch.hI}  OUTER H${ch.hO}  PITCH ${p}` });
  const ents = [];
  let y = 0;
  for (const v of views) {
    const b = extentsOf(v.e), dx = -b[0], dy = y - b[3];
    ents.push({ type: 'text', layer: 'TEXT', p: [0, y + th * 0.7], h: th, s: v.title }, ...shiftEnts(v.e, dx, dy));
    y = b[1] + dy - th * 3;
  }
  return { ents };
}
