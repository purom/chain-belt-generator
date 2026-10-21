/* Belt & Chain Calculator — Timing belts: belt data, C2C ⇄ length, pulley grooves, belt teeth, layouts and the DXF writer. Pure computing, no DOM.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

// ==MATH-START==
// Pulley groove: gD = depth below OD, gRb = bottom arc radius, gA = flank taper (deg), gRt = tooth-tip fillet (mm).
// Fitted to the groove polygons of the widely used parametric pulley script (HTD 5mm / GT2 2mm: < 0.015 mm deviation);
// HTD 3M and GT2 3mm are scaled from those to their published depth and opening width.
const BELTS = {
  HTD5M: { label: 'HTD 5M',  pitch: 5, pld: 0.5715, toothH: 2.06, thick: 3.8,  minT: 14, code: '5M',  gD: 2.199, gRb: 1.4254, gA: 4.75, gRt: 0.4310 },
  HTD3M: { label: 'HTD 3M',  pitch: 3, pld: 0.381,  toothH: 1.17, thick: 2.4,  minT: 10, code: '3M',  gD: 1.289, gRb: 0.8552, gA: 4.75, gRt: 0.2586 },
  GT2_2: { label: 'GT2 2mm', pitch: 2, pld: 0.254,  toothH: 0.75, thick: 1.38, minT: 12, code: '2GT', gD: 0.764, gRb: 0.5722, gA: 11,   gRt: 0.1584 },
  GT2_3: { label: 'GT2 3mm', pitch: 3, pld: 0.381,  toothH: 1.14, thick: 2.4,  minT: 12, code: '3GT', gD: 1.169, gRb: 0.8783, gA: 11,   gRt: 0.2431 },
  // GT3 (the newer, stronger GT): the 3 mm groove matches GT2 3mm; the 5 mm one is the 3 mm groove scaled by 5/3
  GT3_3: { label: 'GT3 3mm', pitch: 3, pld: 0.381,  toothH: 1.14, thick: 2.41, minT: 12, code: '3MGT', gD: 1.169, gRb: 0.8783, gA: 11,  gRt: 0.2431 },
  GT3_5: { label: 'GT3 5mm', pitch: 5, pld: 0.5715, toothH: 1.91, thick: 3.81, minT: 18, code: '5MGT', gD: 1.948, gRb: 1.4638, gA: 11,  gRt: 0.4052 },
  // ANSI / RMA inch-pitch trapezoidal belts (ISO 5296 belt, ISO 5294 pulley grooves): 40° teeth with flat tips.
  // gW = groove bottom width (sharp corners), gRb = its corner radius, tR = belt tooth tip corner radius.
  MXL: { label: 'MXL', pitch: 2.032,  pld: 0.254, toothH: 0.51, thick: 1.14, minT: 10, code: 'MXL', inch: true, gD: 0.69, gW: 0.84, gRb: 0.25, gA: 20, gRt: 0.13, tR: 0.13 },
  XL:  { label: 'XL',  pitch: 5.08,   pld: 0.254, toothH: 1.27, thick: 2.3,  minT: 10, code: 'XL',  inch: true, gD: 1.65, gW: 1.32, gRb: 0.41, gA: 20, gRt: 0.64, tR: 0.38 },
  L:   { label: 'L',   pitch: 9.525,  pld: 0.381, toothH: 1.91, thick: 3.6,  minT: 12, code: 'L',   inch: true, gD: 2.67, gW: 3.05, gRb: 1.19, gA: 20, gRt: 1.17, tR: 0.51 },
  H:   { label: 'H',   pitch: 12.7,   pld: 0.686, toothH: 2.29, thick: 4.3,  minT: 14, code: 'H',   inch: true, gD: 3.05, gW: 4.19, gRb: 1.60, gA: 20, gRt: 1.60, tR: 1.02 },
};
Object.keys(BELTS).forEach(k => { BELTS[k].key = k; });

// Typical closed-loop catalog lengths (mm). Editable in the UI.
const STOCK = {
  HTD5M: [225,255,270,280,295,300,305,330,340,350,375,400,410,425,450,460,475,500,520,535,550,565,575,600,610,635,640,665,670,700,710,740,750,800,835,850,890,900,950,1000,1050,1100,1125,1200,1270,1400,1500,1595,1800],
  HTD3M: [111,120,129,141,150,159,165,174,180,186,195,201,207,213,225,231,240,252,255,264,270,282,288,300,312,318,330,339,345,357,363,375,384,390,405,420,426,447,450,474,486,501,513,531,552,564,579,597,600,633,648,669,690,711,735,750,771,804,840,873,900,945,981,1002,1050],
  GT2_2: [100,110,112,120,122,130,140,148,150,158,160,170,180,188,200,202,210,220,232,240,250,260,270,280,288,300,310,320,330,348,350,360,376,380,400,420,440,450,480,488,500,520,550,560,600,610,640,650,700,750,800,852,900,1000],
  GT2_3: [150,168,180,195,201,210,225,240,252,255,270,285,300,330,345,360,390,405,420,450,480,501,540,570,600,630,690,720,750,801,840,900,960,1002],
  GT3_3: [150,168,180,195,201,210,225,240,252,255,270,285,300,330,345,360,390,405,420,450,480,501,540,570,600,630,690,720,750,801,840,900,960,1002],
  GT3_5: [225,255,280,300,325,350,375,400,425,450,475,500,535,565,600,635,670,700,740,800,850,900,950,1000,1050,1125,1200,1270,1420,1500],
};

const byTeeth = (k, teeth) => teeth.map(t => +(t * BELTS[k].pitch).toFixed(3));
STOCK.MXL = byTeeth('MXL', [45, 50, 55, 60, 64, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160, 170, 180, 190, 200, 220, 250, 300]);
STOCK.XL = byTeeth('XL', [60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500].map(c => c / 2));
STOCK.L = byTeeth('L', [33, 40, 44, 50, 54, 56, 60, 64, 68, 72, 76, 80, 86, 92, 98, 104, 108, 112, 120, 128, 136, 144, 160]);
STOCK.H = byTeeth('H', [240, 270, 300, 330, 360, 390, 420, 450, 480, 510, 540, 570, 600, 630, 660, 700, 750, 800, 850, 900, 1000].map(c => c / 5));

const pitchDia = (N, p) => N * p / Math.PI;
const partNo = (belt, L, W) => {
  if (belt.inch) {                                 // catalog width codes (3/16 → 019 but 3/8 → 037), else hundredths of an inch
    const wc = W && ({ 3.175: '012', 4.7625: '019', 6.35: '025', 7.9375: '031', 9.525: '037', 12.7: '050', 19.05: '075', 25.4: '100', 38.1: '150', 50.8: '200' }[+(+W).toFixed(4)]
      || String(Math.round(W / 0.254)).padStart(3, '0'));
    return `${Math.round(L / 2.54)}${belt.code}${wc || ''}`;
  }
  L = +(+L).toFixed(3);
  return W ? `${L}-${belt.code}-${W}` : `${L}-${belt.code}`;
};

/* Exact open-belt pitch length for center distance C and pitch radii r1, r2. */
function beltLength(C, r1, r2) {
  const d = Math.abs(r1 - r2);
  if (!(C > d)) return NaN;
  return 2 * Math.sqrt(C * C - d * d) + Math.PI * (r1 + r2) + 2 * d * Math.asin(d / C);
}

/* Inverse: center distance for pitch length L. L(C) is monotonic, so bisection is robust. */
function solveCenter(L, r1, r2) {
  const d = Math.abs(r1 - r2);
  if (!(L > 2 * Math.PI * Math.max(r1, r2))) return NaN;
  let lo = d, hi = Math.max(L / 2, 2 * d + 1);
  for (let k = 0; k < 60 && beltLength(hi, r1, r2) < L; k++) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-10; i++) {
    const m = 0.5 * (lo + hi);
    if (beltLength(m, r1, r2) < L) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

function analyze(belt, N1, N2, C) {
  const pd1 = pitchDia(N1, belt.pitch), pd2 = pitchDia(N2, belt.pitch);
  const r1 = pd1 / 2, r2 = pd2 / 2;
  const od1 = pd1 - 2 * belt.pld, od2 = pd2 - 2 * belt.pld;
  const valid = Number.isFinite(C) && C > Math.abs(r1 - r2);
  const beta = valid ? Math.asin((r1 - r2) / C) : NaN;
  const wrap1 = Math.PI + 2 * beta, wrap2 = Math.PI - 2 * beta;
  const tim1 = N1 * wrap1 / (2 * Math.PI), tim2 = N2 * wrap2 / (2 * Math.PI);
  const s1 = N1 <= N2;
  return {
    C, pd1, pd2, r1, r2, od1, od2, valid, wrap1, wrap2, tim1, tim2,
    span: valid ? Math.sqrt(C * C - (r1 - r2) ** 2) : NaN,
    gap: C - (od1 + od2) / 2,
    Nsmall: Math.min(N1, N2),
    wrapSmall: s1 ? wrap1 : wrap2,
    timSmall: s1 ? tim1 : tim2,
  };
}

/* Shortest whole-tooth belt whose pulleys don't collide. */
function minTeethForPair(belt, N1, N2) {
  const g = analyze(belt, N1, N2, NaN);
  const L = beltLength((g.od1 + g.od2) / 2, g.r1, g.r2);
  return Math.floor(L / belt.pitch + 1e-9) + 1;
}

/* Exact length at target C, plus whole-tooth belts around it and their real C2C. */
function integerOptions(belt, N1, N2, Ct) {
  const g = analyze(belt, N1, N2, Ct);
  const Lx = beltLength(Ct, g.r1, g.r2);
  const tx = Lx / belt.pitch;
  const rows = [];
  for (let t = Math.max(1, Math.floor(tx + 1e-9) - 2); t <= Math.ceil(tx - 1e-9) + 2; t++) {
    const L = t * belt.pitch;
    const C = solveCenter(L, g.r1, g.r2);
    const a = analyze(belt, N1, N2, C);
    rows.push({ t, L, C, dC: C - Ct, ok: a.valid && a.gap > 0 });
  }
  return { Lx, tx, rows };
}

/* ---- Pulley tooth profile ----
   Closed outline as [x, y, bulge] vertices, traversed CCW, groove 0 centred on +Y.
   Per groove: tip fillet → tapered flank → round bottom → flank → tip fillet, then an OD land arc.
   A positive fit offset grows the groove (deeper, wider) by `fit` on every side. */
/* bottom of a groove (or tip of a tooth) on axis +Y at y0, flanks at al from the axis:
   w == null → one arc of radius rb tangent to both flanks; else a flat of half-width w (sharp corners) with corner radius rb.
   Returns T (where the bottom meets the right flank) and the vertices / bulges from T across to −T. */
function grooveBottom(y0, al, rb, w) {
  const ca = Math.cos(al), sa = Math.sin(al);
  if (w == null) {
    const T = [rb * ca, y0 + rb - rb * sa];
    return { T, rb, mid: [[T[0], T[1], -Math.tan((Math.PI - 2 * al) / 4)]] };
  }
  const rc = Math.max(0.001, Math.min(rb, w * ca / (1 - sa) * 0.999)), cx = w - rc * (1 - sa) / ca, bc = -Math.tan((Math.PI / 2 - al) / 4);
  const T = [cx + rc * ca, y0 + rc - rc * sa];
  return { T, rb: rc, mid: [[T[0], T[1], bc], [cx, y0, 0], [-cx, y0, bc]] };
}
function pulleyOutline(belt, N, fit) {
  fit = fit || 0;
  const pd = pitchDia(N, belt.pitch), Ro = pd / 2 - belt.pld;
  const rb = belt.gRb + fit;
  if (!(rb > 0.05)) return { error: 'Fit offset is too negative for this profile.' };
  const al = belt.gA * Math.PI / 180, ca = Math.cos(al), sa = Math.sin(al);
  const bt = grooveBottom(Ro - belt.gD - fit, al, rb, belt.gW == null ? null : belt.gW / 2 + fit * (1 - sa) / ca);
  const T = bt.T;                                   // the bottom meets the right flank
  const nx = ca, ny = -sa, dx = sa, dy = ca;        // flank: material-side normal, outward direction
  // largest tip fillet that keeps the flank from turning into an undercut on small pulleys
  const rtMax = (Ro * Ro - (T[0] ** 2 + T[1] ** 2)) / (2 * (T[0] * nx + T[1] * ny + Ro));
  if (!(rtMax > 0.005)) return { error: `A ${N}T pulley is too small for the ${belt.label} groove — use more teeth.` };
  const rtWant = Math.max(0.02, belt.gRt - fit);
  const rt = Math.min(rtWant, rtMax);
  const P0 = [T[0] + rt * nx, T[1] + rt * ny], pdot = P0[0] * dx + P0[1] * dy;
  const s = Math.max(0, -pdot + Math.sqrt(Math.max(0, pdot * pdot - (P0[0] ** 2 + P0[1] ** 2) + (Ro - rt) ** 2)));
  const F = [P0[0] + s * dx, P0[1] + s * dy];       // tip fillet centre
  const Gp = [T[0] + s * dx, T[1] + s * dy];        // fillet meets the flank
  const k = Ro / (Ro - rt), qx = F[0] * k, qy = F[1] * k;   // fillet meets the OD
  const psi = Math.atan2(qx, qy);
  const step = 2 * Math.PI / N, land = step - 2 * psi;
  if (land < 1e-3) return { error: `Grooves overlap at ${N}T — use more teeth.` };
  const bf = Math.tan((Math.PI - al - Math.atan2(F[1], F[0])) / 4);
  const bl = Math.tan(land / 4);
  const local = [[qx, qy, bf], [Gp[0], Gp[1], 0], ...bt.mid, [-T[0], T[1], 0], [-Gp[0], Gp[1], bf], [-qx, qy, bl]];
  const raw = [];
  for (let i = 0; i < N; i++) {
    const a = i * step, c = Math.cos(a), s = Math.sin(a);
    for (const [x, y, b] of local) raw.push([x * c - y * s, x * s + y * c, b]);
  }
  // drop zero-length segments (the flank vanishes when the tip fillet had to be reduced)
  const verts = raw.filter((v, i) => {
    const w = raw[(i + 1) % raw.length];
    return Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-7;
  });
  return { verts, pd, od: 2 * Ro, D: belt.gD + fit, W: 2 * qx, rb: bt.rb, rt, rtClamped: rt < rtWant - 1e-9, land };
}

function borePoly(kind, s, f) {
  if (kind === 'none' || !(s > 0)) return null;
  if (kind === 'round') return { kind, s, r: s / 2, ext: s / 2 };
  if (kind === 'hex') {
    const R = s / Math.sqrt(3);
    return { kind, s, ext: R, verts: [0, 1, 2, 3, 4, 5].map(k => [R * Math.cos(k * Math.PI / 3), R * Math.sin(k * Math.PI / 3), 0]) };
  }
  if (kind === 'square') {
    const h = s / 2;
    return { kind, s, ext: h * Math.SQRT2, verts: [[h, h, 0], [-h, h, 0], [-h, -h, 0], [h, -h, 0]] };
  }
  if (kind === 'd' || kind === 'dd') {   // D: Ø s, flat f from the far side · double-D: two flats f apart
    const R = s / 2, a = kind === 'd' ? f - R : f / 2;
    if (!(a > 0.01 && a < R - 0.01)) return { kind, s, f, ext: R, bad: true };
    const h = Math.sqrt(R * R - a * a), al = Math.atan2(a, h);
    if (kind === 'd') return { kind, s, f, ext: R, verts: [[h, a, 0], [-h, a, Math.tan((Math.PI + 2 * al) / 4)]] };
    const b = Math.tan(al / 2);
    return { kind, s, f, ext: R, verts: [[h, a, 0], [-h, a, b], [-h, -a, 0], [h, -a, b]] };
  }
  if (kind === 'rex') {          // goBILDA REX: hex s across flats, corners rounded by a circle 1 mm larger (7 AF / Ø8)
    const a = s / 2, R = (s + 1) / 2, h = Math.sqrt(R * R - a * a), half = Math.atan2(h, a);
    const bl = Math.tan((Math.PI / 3 - 2 * half) / 4), verts = [];
    for (let k = 0; k < 6; k++) {
      const t = k * Math.PI / 3, c = Math.cos(t), sn = Math.sin(t);
      verts.push([a * c + h * sn, a * sn - h * c, 0], [a * c - h * sn, a * sn + h * c, bl]);
    }
    return { kind, s, ext: R, verts };
  }
  return null;
}

const MIN_WALL = 0.8;
function pulleyParts(belt, N, st) {
  const o = pulleyOutline(belt, N, st.fit);
  if (o.error) return o;
  const rootR = o.od / 2 - o.D, room = rootR - MIN_WALL;
  const bore = borePoly(st.bore, st.boreSize, st.boreFlat);
  if (bore && bore.bad) {
    return { error: bore.kind === 'd' ? 'D-shaft flat must be between half the diameter and the full diameter (measured from the flat to the far side).'
      : 'Double-D flats must be closer together than the diameter.' };
  }
  if (bore && bore.ext > room) {
    const max = { round: 2 * room, hex: Math.sqrt(3) * room, square: Math.SQRT2 * room, rex: 2 * room - 1, d: 2 * room, dd: 2 * room }[bore.kind];
    return { error: `Bore too large for a ${N}T ${belt.label} pulley — max ≈ ${len(Math.max(0, max), 1)} (keeps ${lenR(MIN_WALL)} of wall under the grooves).` };
  }
  const holes = [], H = st.holes;
  if (H) {
    const hr = H.d / 2, br = H.pcd / 2;
    if (br + hr > room) {
      const need = Math.ceil((br + hr + MIN_WALL + belt.pld + o.D) * 2 * Math.PI / belt.pitch);
      return { error: `Mounting holes reach into the grooves on a ${N}T ${belt.label} pulley — this pattern needs at least ${need} teeth.` };
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

function addBore(ents, bore, ox, oy) {
  if (!bore) return;
  if (bore.kind === 'round') ents.push({ type: 'circle', layer: 'BORE', c: [ox, oy], r: bore.r });
  else ents.push({ type: 'poly', layer: 'BORE', verts: bore.verts.map(([x, y, b]) => [x + ox, y + oy, b]) });
}
function addHoles(ents, holes, ox, oy, ang = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (const h of holes || []) ents.push({ type: 'circle', layer: 'HOLES', c: [ox + h.c[0] * c - h.c[1] * s, oy + h.c[0] * s + h.c[1] * c], r: h.r });
}
function addPulley(ents, part, ox, oy, st, layer) {
  ents.push({ type: 'poly', layer, verts: part.verts.map(([x, y, b]) => [x + ox, y + oy, b]), bound: [ox, oy, part.od / 2] });
  addBore(ents, part.bore, ox, oy);
  addHoles(ents, part.holes, ox, oy);
  if (st.pitch) ents.push({ type: 'circle', layer: 'PITCH', c: [ox, oy], r: part.pd / 2 });
}

function singleDoc(belt, N, st) {
  const part = pulleyParts(belt, N, st);
  if (part.error) return part;
  const ents = [];
  addPulley(ents, part, 0, 0, st, 'PULLEY');
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

function pairDoc(belt, N1, N2, C, st) {
  const p1 = pulleyParts(belt, N1, st);
  if (p1.error) return { error: `Pulley 1: ${p1.error}` };
  const p2 = pulleyParts(belt, N2, st);
  if (p2.error) return { error: `Pulley 2: ${p2.error}` };
  const ents = [];
  addPulley(ents, p1, 0, 0, st, 'PULLEY_1');
  addPulley(ents, p2, C, 0, st, 'PULLEY_2');
  const m1 = p1.od / 2 + 2, m2 = p2.od / 2 + 2;
  ents.push({ type: 'line', layer: 'CENTER', a: [-m1, 0], b: [C + m2, 0] });
  ents.push({ type: 'line', layer: 'CENTER', a: [0, -m1], b: [0, m1] });
  ents.push({ type: 'line', layer: 'CENTER', a: [C, -m2], b: [C, m2] });
  return { ents };
}

const LAYER_DEFS = {
  PULLEY:   { color: 7 }, PULLEY_1: { color: 7 }, PULLEY_2: { color: 7 },
  BORE:     { color: 1 }, FLANGE:   { color: 5 },
  PITCH:    { color: 4, ltype: 'DASHED' }, CENTER: { color: 8, ltype: 'DASHED' },
  BELT:     { color: 30 }, BELT_TOP: { color: 30 }, TEETH: { color: 8, ltype: 'DASHED' },
  HOLES:    { color: 3 }, TEXT: { color: 7 },
  SPROCKET: { color: 7 }, SPROCKET_1: { color: 7 }, SPROCKET_2: { color: 7 },
  PLATE_IN: { color: 8 }, PLATE_OUT: { color: 30 }, ROLLER: { color: 5, ltype: 'DASHED' }, PIN: { color: 7 },
};

/* drawing extents, with true arc bulges (a bulge arc can reach past its end points) */
function extentsOf(ents) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const e of ents) {
    if (e.type === 'circle') ext(e.c[0], e.c[1], e.r);
    else if (e.type === 'line') { ext(e.a[0], e.a[1]); ext(e.b[0], e.b[1]); }
    else if (e.type === 'text') { ext(e.p[0], e.p[1]); ext(e.p[0] + e.s.length * e.h * 0.72, e.p[1] + e.h); }
    else {
      const v = e.verts;
      for (let i = 0; i < v.length; i++) {
        const [xa, ya, b] = v[i], [xb, yb] = v[(i + 1) % v.length];
        ext(xa, ya);
        if (!b) continue;
        const th = 4 * Math.atan(b), c = Math.hypot(xb - xa, yb - ya);
        if (c < 1e-12) continue;
        const k = c / 2 / Math.tan(th / 2), cx = (xa + xb) / 2 - (yb - ya) / c * k, cy = (ya + yb) / 2 + (xb - xa) / c * k;
        const rr = Math.abs(c / (2 * Math.sin(th / 2))), a0 = Math.atan2(ya - cy, xa - cx);
        for (let q = -8; q <= 8; q++) {          // axis-extreme points inside the sweep
          const t = (q * Math.PI / 2 - a0) / th;
          if (t > 0 && t < 1) ext(cx + rr * Math.cos(q * Math.PI / 2), cy + rr * Math.sin(q * Math.PI / 2));
        }
      }
    }
  }
  return [x0, y0, x1, y1];
}

/* Minimal AutoCAD R12 ASCII DXF (mm). Polylines carry arcs as bulges. */
function toDXF(ents) {
  const out = [];
  const g = (c, v) => { out.push(String(c), String(v)); };
  const n = v => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
  const [x0, y0, x1, y1] = extentsOf(ents);
  const layers = [...new Set(ents.map(e => e.layer))];

  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, 4);
  g(9, '$MEASUREMENT'); g(70, 1);
  g(9, '$EXTMIN'); g(10, n(x0)); g(20, n(y0)); g(30, 0);
  g(9, '$EXTMAX'); g(10, n(x1)); g(20, n(y1)); g(30, 0);
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, 'Dashed __ __ __'); g(72, 65); g(73, 2); g(40, 1.5); g(49, 1.0); g(49, -0.5);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length + 1);
  g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
  for (const name of layers) {
    const d = LAYER_DEFS[name] || { color: 7 };
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, d.color); g(6, d.ltype || 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const e of ents) {
    if (e.type === 'circle') {
      g(0, 'CIRCLE'); g(8, e.layer); g(10, n(e.c[0])); g(20, n(e.c[1])); g(30, 0); g(40, n(e.r));
    } else if (e.type === 'line') {
      g(0, 'LINE'); g(8, e.layer); g(10, n(e.a[0])); g(20, n(e.a[1])); g(30, 0); g(11, n(e.b[0])); g(21, n(e.b[1])); g(31, 0);
    } else if (e.type === 'text') {
      g(0, 'TEXT'); g(8, e.layer); g(10, n(e.p[0])); g(20, n(e.p[1])); g(30, 0); g(40, n(e.h)); g(1, e.s);
    } else {
      g(0, 'POLYLINE'); g(8, e.layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
      for (const [x, y, b] of e.verts) {
        g(0, 'VERTEX'); g(8, e.layer); g(10, n(x)); g(20, n(y)); g(30, 0);
        if (b) g(42, Math.round(b * 1e9) / 1e9);
      }
      g(0, 'SEQEND'); g(8, e.layer);
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}
/* ---- Belt ----
   Pitch path of the open belt around pulley 1 (centre 0,0) and pulley 2 (centre C,0), traversed CCW:
   lower span → wrap on pulley 2 → upper span → wrap on pulley 1. */
function beltPath(r1, r2, C) {
  const d = r1 - r2, phi = Math.acos(Math.max(-1, Math.min(1, d / C)));
  const Ls = Math.sqrt(Math.max(0, C * C - d * d)), cp = Math.cos(phi), sp = Math.sin(phi);
  const segs = [
    { a: [r1 * cp, -r1 * sp], b: [C + r2 * cp, -r2 * sp], len: Ls },
    { c: [C, 0], r: r2, a0: -phi, len: 2 * phi * r2 },
    { a: [C + r2 * cp, r2 * sp], b: [r1 * cp, r1 * sp], len: Ls },
    { c: [0, 0], r: r1, a0: phi, len: (2 * Math.PI - 2 * phi) * r1 },
  ];
  let s0 = 0;
  for (const g of segs) {
    g.s0 = s0; s0 += g.len;
    if (g.a) g.t = g.len > 0 ? [(g.b[0] - g.a[0]) / g.len, (g.b[1] - g.a[1]) / g.len] : [1, 0];
  }
  return { segs, L: s0, phi, r1, r2, C };
}
/* point + unit tangent at pitch-path coordinate s */
function pathAt(bp, s) {
  s = ((s % bp.L) + bp.L) % bp.L;
  let i = 3;
  while (i > 0 && s < bp.segs[i].s0) i--;
  const g = bp.segs[i], q = s - g.s0;
  if (g.a) return { i, p: [g.a[0] + g.t[0] * q, g.a[1] + g.t[1] * q], t: g.t };
  const a = g.a0 + q / g.r, ca = Math.cos(a), sa = Math.sin(a);
  return { i, a, p: [g.c[0] + g.r * ca, g.c[1] + g.r * sa], t: [-sa, ca] };
}
/* closed loop offset outward from the pitch path by `off` (0 = pitch line) */
function loopVerts(bp, off) {
  const { r1, r2, C, phi } = bp, R1 = r1 + off, R2 = r2 + off, cp = Math.cos(phi), sp = Math.sin(phi);
  return [
    [R1 * cp, -R1 * sp, 0],
    [C + R2 * cp, -R2 * sp, Math.tan(phi / 2)],
    [C + R2 * cp, R2 * sp, 0],
    [R1 * cp, R1 * sp, Math.tan((Math.PI - phi) / 2)],
  ];
}

/* Right half of a round-bottom profile on axis +Y, from the land into the groove / tooth.
   R = land radius about the local origin (Infinity = straight land along y = 0). */
function toothHalf(R, D, rb, al, rfWant, w) {      // w: flat tip half-width (trapezoidal teeth), else a round tip
  const ca = Math.cos(al), sa = Math.sin(al), flat = !Number.isFinite(R);
  const yl = flat ? 0 : R, bt = grooveBottom(yl - D, al, rb, w);
  const T = bt.T, n = [ca, -sa], dv = [sa, ca];
  let rf, s, F, Q;
  if (flat) {
    rf = Math.max(0.001, Math.min(rfWant, (yl - T[1]) / (1 - sa)));
    s = (yl - T[1] - rf * (1 - sa)) / ca;
    F = [T[0] + rf * n[0] + s * dv[0], yl - rf];
    Q = [F[0], yl];
  } else {
    rf = Math.max(0.001, Math.min(rfWant, (R * R - T[0] * T[0] - T[1] * T[1]) / (2 * (T[0] * n[0] + T[1] * n[1] + R))));
    const P0 = [T[0] + rf * n[0], T[1] + rf * n[1]], pd = P0[0] * dv[0] + P0[1] * dv[1];
    s = Math.max(0, -pd + Math.sqrt(Math.max(0, pd * pd - P0[0] * P0[0] - P0[1] * P0[1] + (R - rf) ** 2)));
    F = [P0[0] + s * dv[0], P0[1] + s * dv[1]];
    const k = R / (R - rf);
    Q = [F[0] * k, F[1] * k];
  }
  return {
    Q, G: [T[0] + s * dv[0], T[1] + s * dv[1]], T, mid: bt.mid,
    bf: Math.tan((Math.PI - al - Math.atan2(Q[1] - F[1], Q[0] - F[0])) / 4),
  };
}
/* one tooth (or groove) as [x, y, bulge]: land → flank → tip / bottom → flank → land */
const toothVerts = h => [[h.Q[0], h.Q[1], h.bf], [h.G[0], h.G[1], 0], ...h.mid, [-h.T[0], h.T[1], 0], [-h.G[0], h.G[1], h.bf], [-h.Q[0], h.Q[1], 0]];

/* Belt tooth = pulley groove shrunk by the tip clearance (groove depth − tooth height) at the tip and by
   ~4 % of the pitch on the flanks (room to enter / leave the groove); its land rests on the pulley OD. */
function beltTooth(belt) {
  const c = Math.max(0, belt.gD - belt.toothH), cs = Math.max(c, 0.04 * belt.pitch), al = belt.gA * Math.PI / 180;
  // trapezoidal teeth: the groove's width at the tooth tip, less ~3 % of the pitch per flank for running clearance
  const w = belt.gW == null ? null : belt.gW / 2 + c * Math.tan(al) - 0.03 * belt.pitch / Math.cos(al);
  return { u: belt.pld, ht: belt.toothH, rTip: w == null ? belt.gRb - cs : belt.tR, w, al, rR: belt.gRt, back: belt.thick - belt.toothH - belt.pld };
}

/* Closed outlines of the toothed belt: outer = back, inner = teeth. `travel` (mm) slides the teeth along the loop. */
function beltOutline(belt, r1, r2, C, travel, bpIn) {
  const bp = bpIn || beltPath(r1, r2, C), tg = beltTooth(belt), { u, ht } = tg;
  const Nt = Math.max(3, Math.round(bp.L / belt.pitch)), pe = bp.L / Nt;
  const sOff = (((travel || 0) % pe) + pe) % pe;
  const rack = toothHalf(Infinity, ht, tg.rTip, tg.al, tg.rR, tg.w);
  const halves = [rack, toothHalf(r2 - u, ht, tg.rTip, tg.al, tg.rR, tg.w), rack, toothHalf(r1 - u, ht, tg.rTip, tg.al, tg.rR, tg.w)];
  const teeth = [];
  for (let k = 0; k < Nt; k++) {
    const s = sOff + k * pe, at = pathAt(bp, s), g = bp.segs[at.i], h = halves[at.i];
    let O, ey;
    if (g.a) { O = [at.p[0] - u * at.t[1], at.p[1] + u * at.t[0]]; ey = [at.t[1], -at.t[0]]; }
    else { O = g.c; ey = [Math.cos(at.a), Math.sin(at.a)]; }
    const ex = [ey[1], -ey[0]];
    const W = (x, y, b) => [O[0] + x * ex[0] + y * ey[0], O[1] + x * ex[1] + y * ey[1], b];
    teeth.push({
      s, off: g.a ? h.Q[0] : g.r * Math.atan2(h.Q[0], h.Q[1]),
      v: toothVerts(h).map(([x, y, b]) => W(x, y, b)),
    });
  }
  // land between teeth: pulley-OD arcs on the wraps, straight on the spans, split at the tangent points
  const inner = [];
  for (let k = 0; k < Nt; k++) {
    const A = teeth[k], B = teeth[(k + 1) % Nt];
    const sA = A.s + A.off, sB = B.s + (k + 1 === Nt ? bp.L : 0) - B.off;
    inner.push(...A.v);
    const run = [[A.v[A.v.length - 1], sA]], bs = [];
    for (let m = 0; m < 2; m++) for (const g of bp.segs) { const b = g.s0 + m * bp.L; if (b > sA + 1e-9 && b < sB - 1e-9) bs.push(b); }
    bs.sort((x, y) => x - y);
    for (const b of bs) {
      const at = pathAt(bp, b), v = [at.p[0] - u * at.t[1], at.p[1] + u * at.t[0], 0];
      inner.push(v); run.push([v, b]);
    }
    run.push([B.v[0], sB]);
    for (let j = 0; j + 1 < run.length; j++) {
      const [X, sx] = run[j], [Y, sy] = run[j + 1], g = bp.segs[pathAt(bp, (sx + sy) / 2).i];
      if (!g.c) { X[2] = 0; continue; }
      let sw = Math.atan2(Y[1] - g.c[1], Y[0] - g.c[0]) - Math.atan2(X[1] - g.c[1], X[0] - g.c[0]);
      sw -= 2 * Math.PI * Math.round(sw / (2 * Math.PI));
      X[2] = Math.tan(sw / 4);
    }
  }
  return { outer: loopVerts(bp, tg.back), inner, bp, Nt, pe, sOff, tg };
}

/* Rotation (rad, CCW) that centres a groove of pulley j (1 | 2) under the belt tooth nearest the middle of its wrap. */
function pulleyPhase(bo, j) {
  const g = bo.bp.segs[j === 1 ? 3 : 1];
  const k = Math.round((g.s0 + g.len / 2 - bo.sOff) / bo.pe);
  return g.a0 + (bo.sOff + k * bo.pe - g.s0) / g.r - Math.PI / 2;
}
const rotVerts = (verts, ang, ox = 0, oy = 0) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return verts.map(([x, y, b]) => [ox + x * c - y * s, oy + x * s + y * c, b]);
};

/* Layout export at centre distance C: 'assembly' (pulleys + belt, meshed), 'belt' or 'pulleys'. */
function layoutDoc(belt, N1, N2, C, st, what) {
  const r1 = pitchDia(N1, belt.pitch) / 2, r2 = pitchDia(N2, belt.pitch) / 2;
  const bo = beltOutline(belt, r1, r2, C, 0), ents = [], S2 = Array.isArray(st) ? st : [st, st];
  if (what !== 'belt') {
    const parts = [pulleyParts(belt, N1, S2[0]), pulleyParts(belt, N2, S2[1])];
    for (let j = 0; j < 2; j++) {
      const p = parts[j];
      if (p.error) return { error: `Pulley ${j + 1}: ${p.error}` };
      const ox = j ? C : 0, ang = pulleyPhase(bo, j + 1), m = p.od / 2 + 2;
      ents.push({ type: 'poly', layer: `PULLEY_${j + 1}`, verts: rotVerts(p.verts, ang, ox), bound: [ox, 0, p.od / 2] });
      if (p.bore && p.bore.kind === 'round') ents.push({ type: 'circle', layer: 'BORE', c: [ox, 0], r: p.bore.r });
      else if (p.bore) ents.push({ type: 'poly', layer: 'BORE', verts: rotVerts(p.bore.verts, ang, ox) });
      addHoles(ents, p.holes, ox, 0, ang);
      if (S2[j].pitch) ents.push({ type: 'circle', layer: 'PITCH', c: [ox, 0], r: p.pd / 2 });
      ents.push({ type: 'line', layer: 'CENTER', a: [ox, -m], b: [ox, m] });
    }
    ents.push({ type: 'line', layer: 'CENTER', a: [-parts[0].od / 2 - 2, 0], b: [C + parts[1].od / 2 + 2, 0] });
  }
  if (what !== 'pulleys') {
    ents.push({ type: 'poly', layer: 'BELT', verts: bo.outer, bounds: [[0, 0, r1 + bo.tg.back], [C, 0, r2 + bo.tg.back]] });
    ents.push({ type: 'poly', layer: 'BELT', verts: bo.inner });
    if (S2[0].pitch || S2[1].pitch) ents.push({ type: 'poly', layer: 'PITCH', verts: loopVerts(bo.bp, 0), bounds: [[0, 0, r1], [C, 0, r2]] });
  }
  return { ents, bo };
}
/* ---- straight belt views (Belt DXF tab) ---- */
/* unrolled side profile of n teeth: land on y = 0, teeth hang down to −ht, back at H − ht */
function beltStrip(belt, n) {
  const tg = beltTooth(belt), h = toothHalf(Infinity, tg.ht, tg.rTip, tg.al, tg.rR, tg.w);
  const p = belt.pitch, L = n * p, top = belt.thick - belt.toothH;
  const verts = [[0, top, 0], [L, top, 0], [L, 0, 0]];
  for (let k = n - 1; k >= 0; k--) {
    const c = (k + 0.5) * p;
    verts.push(...toothVerts(h).map(([x, y, b]) => [c + x, y, b]));
  }
  verts.push([0, 0, 0]);
  return { verts, L, top, qx: h.Q[0] };
}
const shiftEnts = (ents, dx, dy) => ents.map(e => {
  if (e.type === 'circle') return { ...e, c: [e.c[0] + dx, e.c[1] + dy] };
  if (e.type === 'line') return { ...e, a: [e.a[0] + dx, e.a[1] + dy], b: [e.b[0] + dx, e.b[1] + dy] };
  if (e.type === 'text') return { ...e, p: [e.p[0] + dx, e.p[1] + dy] };
  return { ...e, verts: e.verts.map(([x, y, b]) => [x + dx, y + dy, b]), bounds: e.bounds && e.bounds.map(([x, y, r]) => [x + dx, y + dy, r]),
    bound: e.bound && [e.bound[0] + dx, e.bound[1] + dy, e.bound[2]] };
});
/* belt drawing, views stacked top to bottom with titles:
   o = { loop: {r1, r2, C} | null, profile, top, seg (teeth shown in profile / top view, 0 = all), pitch } */
function beltDoc(belt, n, W, o) {
  const p = belt.pitch, part = partNo(belt, n * p, W), th = Math.max(2, p * 0.7), views = [];
  const m = o.seg > 0 ? Math.min(n, o.seg) : n;
  // o.std: standard thickness; backing above it goes on the preview-only OVER layer (never exported)
  const over = o.std > 0 && belt.thick > o.std + 1e-6 ? belt.thick - o.std : 0;
  if (o.loop) {
    const bo = beltOutline(belt, o.loop.r1, o.loop.r2, o.loop.C, 0);
    const e = [{ type: 'poly', layer: 'BELT', verts: bo.outer }, { type: 'poly', layer: 'BELT', verts: bo.inner }];
    if (over) e.push({ type: 'poly', layer: 'OVER', verts: loopVerts(bo.bp, bo.tg.back) }, { type: 'poly', layer: 'OVER', verts: loopVerts(bo.bp, bo.tg.back - over) });
    if (o.pitch) e.push({ type: 'poly', layer: 'PITCH', verts: loopVerts(bo.bp, 0) });
    views.push({ e, title: `BELT ${part}  LOOP AT C2C ${o.loop.C.toFixed(3)} MM` });
  }
  if (o.profile) {
    const s = beltStrip(belt, m), e = [{ type: 'poly', layer: 'BELT', verts: s.verts }];
    if (over) e.push({ type: 'poly', layer: 'OVER', verts: [[0, s.top - over, 0], [s.L, s.top - over, 0], [s.L, s.top, 0], [0, s.top, 0]] });
    if (o.pitch) e.push({ type: 'line', layer: 'PITCH', a: [0, belt.pld], b: [s.L, belt.pld] },
      { type: 'text', layer: 'PITCH', p: [s.L + th * 0.4, belt.pld - th * 0.25], h: th * 0.5, s: 'PITCH LINE' });
    views.push({ e, title: `TOOTH PROFILE  ${m}T x ${p} = ${+s.L.toFixed(3)} MM` });
  }
  if (o.top) {
    const s = beltStrip(belt, m), e = [{ type: 'poly', layer: 'BELT_TOP', verts: [[0, 0, 0], [s.L, 0, 0], [s.L, -W, 0], [0, -W, 0]] }];
    for (let k = 0; k < m; k++) {
      const c = (k + 0.5) * p;
      for (const x of [c - s.qx, c + s.qx]) e.push({ type: 'line', layer: 'TEETH', a: [x, 0], b: [x, -W] });
    }
    views.push({ e, title: `TOP VIEW  ${m}T x ${W} MM WIDE (TOOTH SIDE)` });
  }
  const ents = [];
  let y = 0;
  for (const v of views) {
    const b = extentsOf(v.e), dx = -b[0], dy = y - b[3];
    ents.push({ type: 'text', layer: 'TEXT', p: [0, y + th * 0.7], h: th, s: v.title }, ...shiftEnts(v.e, dx, dy));
    y = b[1] + dy - th * 3;
  }
  return { ents, part, m };
}
