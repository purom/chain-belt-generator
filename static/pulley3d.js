/* Belt & Chain Calculator — Pulley STEP: the pulley as one exact solid (toothed body, rims, bore and holes through it) and
   the faces the 3D preview draws. Rims (flanges) sit on one or both ends of the teeth, set by their height above the OD,
   their wall angle (0° = a flat wall, more = the belt side flares out like a funnel) and their thickness at the rim edge.
   Pure computing, no DOM. Loaded as a classic script after step.js (works from file:// too); top-level names are shared
   with the other static/*.js files. */
'use strict';

// ==PULLEY3D-START==
const RIM_MODES = ['none', 'one', 'both'];
const RIM_LIM = { fw: [1, 300], h: [0.2, 60], a: [0, 60], t: [0.2, 30] };   // face width, rim height, angle (deg), thickness
const RIM_A_DEF = 45, RIM_T_DEF = 1.5;
const STEP_PULLEY = [0.85, 0.42, 0.13];

/* bulge polyline [x, y, bulge] → segments: { a, b, d (unit direction) } or { a, b, arc, c (centre), r, sweep (signed) } */
function bulgeSegs(v) {
  return v.map((a, i) => {
    const b = v[(i + 1) % v.length], bl = a[2];
    if (!bl) { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return { a, b, L, d: [dx / L, dy / L] }; }
    const th = 4 * Math.atan(bl), c = Math.hypot(b[0] - a[0], b[1] - a[1]), k = c / 2 / Math.tan(th / 2);
    const cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) / c * k, cy = (a[1] + b[1]) / 2 + (b[0] - a[0]) / c * k;
    return { a, b, arc: true, c: [cx, cy], r: (Math.hypot(a[0] - cx, a[1] - cy) + Math.hypot(b[0] - cx, b[1] - cy)) / 2, sweep: th };
  });
}
const dropShort = (v, eps = 2e-6) => v.filter((q, k) => { const w = v[(k + 1) % v.length]; return Math.hypot(w[0] - q[0], w[1] - q[1]) > eps; });

/* The solid's layout from a pulley part (pulleyParts / idlerParts: outline, OD, bore, holes) and its settings:
   st.fw = face width (teeth length along the axis), st.rims = 'none' | 'one' (top) | 'both', st.flh = rim height above
   the OD, st.fla = wall angle (deg), st.flt = thickness at the rim edge. The teeth run z = 0 … fw, a top rim sits
   above them, a bottom rim below; the bore and holes go through everything. */
function pulleyModel(part, st) {
  const F = st.fw, Ro = part.od / 2, rims = RIM_MODES.includes(st.rims) ? st.rims : 'none';
  const inR = (v, [lo, hi]) => Number.isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9;
  if (!inR(F, RIM_LIM.fw)) return { error: `Face width must be ${len(RIM_LIM.fw[0], 0)} – ${len(RIM_LIM.fw[1], 0)}.`, field: 'd-fw' };
  let rim = null;
  if (rims !== 'none') {
    const H = st.flh, a = st.fla, t = st.flt;
    if (!inR(H, RIM_LIM.h)) return { error: `Rim height must be ${len(RIM_LIM.h[0], 1)} – ${len(RIM_LIM.h[1], 0)} above the OD.`, field: 'd-flh' };
    if (!inR(a, RIM_LIM.a)) return { error: `Rim angle must be 0 – ${RIM_LIM.a[1]}°.`, field: 'd-fla' };
    if (!inR(t, RIM_LIM.t)) return { error: `Rim thickness must be ${len(RIM_LIM.t[0], 1)} – ${len(RIM_LIM.t[1], 0)}.`, field: 'd-flt' };
    // a sloped wall starts on a short flat land just above the OD (eps), so it never meets the tooth tips at a zero
    // angle: CAD kernels reject the knife-edge corners a cone starting right on the OD would leave in every groove end
    const ang = a * Math.PI / 180, eps = a < 0.01 ? 0 : Math.min(0.2, 0.15 * H), c = eps ? (H - eps) * Math.tan(ang) : 0;
    rim = { H, a, ang, t, c, eps, w: c + t, R1: c ? Ro + eps : Ro + H, Rr: Ro + H };   // c: axial reach of the slope, w: rim width
  }
  const top = rim, bot = rims === 'both' ? rim : null;
  const loops = [orient(part.verts, true)], bl = boreLoop(part.bore);
  if (bl) loops.push(orient(bl, false));
  for (const h of part.holes || []) loops.push(circleLoop(h.c[0], h.c[1], h.r, false));
  const zB = bot ? -bot.w : 0, zT = F + (top ? top.w : 0);
  return { F, Ro, rims, top, bot, zB, zT, width: zT - zB, Rr: rim ? rim.Rr : Ro, outline: loops[0], holes: loops.slice(1), part };
}

/* The pulley as one closed B-rep solid (STEP AP214). Every face is exact: planes, cylinders (lands, fillets, groove
   bottoms, rim edge, round bores) and cones (sloped rim walls). Each rim's belt-side wall is a flat ring from the teeth
   out to R1, then (sloped rims) a cone from R1 out to the rim edge. Full circles are split in two halves (no seams). */
function stepPulleySolid(W, name, m) {
  const A = W.add, R = W.R, F = m.F, Ro = m.Ro;
  const outl = dropShort(m.outline), so = bulgeSegs(outl);
  const holes = m.holes.map(h => dropShort(h)).filter(h => h.length >= 2), sh = holes.map(bulgeSegs);
  const vmap = new Map();
  const V = p => {
    const k = p.map(R).join(',');
    let id = vmap.get(k);
    if (!id) { id = A(`VERTEX_POINT('',#${W.pt(p[0], p[1], p[2])})`); vmap.set(k, id); }
    return id;
  };
  const lineE = (p, q) => {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]);
    const ln = A(`LINE('',#${W.pt(p[0], p[1], p[2])},#${A(`VECTOR('',#${W.dir(d[0] / L, d[1] / L, d[2] / L)},${R(L)})`)})`);
    return A(`EDGE_CURVE('',#${V(p)},#${V(q)},#${ln},.T.)`);
  };
  const arcE = (p, q, cx, cy, r, ccw) =>
    A(`EDGE_CURVE('',#${V(p)},#${V(q)},#${A(`CIRCLE('',#${W.ax3([cx, cy, p[2]], [0, 0, 1], [1, 0, 0])},${R(r)})`)},${ccw ? '.T.' : '.F.'})`);
  const segE = (s, z) => s.arc ? arcE([s.a[0], s.a[1], z], [s.b[0], s.b[1], z], s.c[0], s.c[1], s.r, s.sweep > 0)
    : lineE([s.a[0], s.a[1], z], [s.b[0], s.b[1], z]);
  const oe = ([e, f]) => A(`ORIENTED_EDGE('',*,*,#${e},${f ? '.T.' : '.F.'})`);
  const bound = (list, outer = true) => A(`${outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',#${A(`EDGE_LOOP('',(${list.map(x => '#' + oe(x)).join(',')}))`)},.T.)`);
  const faces = [];
  const face = (bs, surf, same = true) => faces.push(A(`ADVANCED_FACE('',(${bs.map(i => '#' + i).join(',')}),#${surf},${same ? '.T.' : '.F.'})`));
  const plane = (z, up) => A(`PLANE('',#${W.ax3([0, 0, z], [0, 0, up ? 1 : -1], [1, 0, 0])})`);
  const fwd = es => es.map(e => [e, 1]), rev = es => es.slice().reverse().map(e => [e, 0]);
  /* side walls of one loop (material on its left) between zlo and zhi; returns the edges at both ends */
  const wall = (v, segs, zlo, zhi) => {
    const lo = segs.map(s => segE(s, zlo)), hi = segs.map(s => segE(s, zhi));
    const up = v.map(q => lineE([q[0], q[1], zlo], [q[0], q[1], zhi]));
    segs.forEach((s, i) => {
      const j = (i + 1) % segs.length;
      const surf = s.arc ? A(`CYLINDRICAL_SURFACE('',#${W.ax3([s.c[0], s.c[1], zlo], [0, 0, 1], [1, 0, 0])},${R(s.r)})`)
        : A(`PLANE('',#${W.ax3([s.a[0], s.a[1], zlo], [s.d[1], -s.d[0], 0], [s.d[0], s.d[1], 0])})`);
      face([bound([[lo[i], 1], [up[j], 1], [hi[i], 0], [up[i], 0]])], surf, !s.arc || s.sweep > 0);
    });
    return { lo, hi };
  };
  const body = wall(outl, so, 0, F);
  const hw = holes.map((v, k) => wall(v, sh[k], m.zB, m.zT));
  const holesAt = top => hw.map(h => bound(top ? fwd(h.hi) : rev(h.lo), false));
  const Q = (a, r, z) => [r * Math.cos(a), r * Math.sin(a), z];
  const halves = (r, z) => [arcE(Q(0, r, z), Q(Math.PI, r, z), 0, 0, r, true), arcE(Q(Math.PI, r, z), Q(0, r, z), 0, 0, r, true)];
  const end = top => {
    const rim = top ? m.top : m.bot, z = top ? F : 0, E = top ? body.hi : body.lo;
    if (!rim) { face([bound(top ? fwd(E) : rev(E)), ...holesAt(top)], plane(z, top)); return; }
    const { c, t, Rr, R1 } = rim, s = top ? 1 : -1;
    const zRim = z + s * c, zCap = z + s * (c + t);         // the slope ends at zRim; the outer face is at zCap
    const E1 = halves(R1, z), ER = c ? halves(Rr, zRim) : E1, EC = halves(Rr, zCap);
    // belt-side wall: a flat ring from the teeth out to R1
    face([bound(top ? rev(E1) : fwd(E1)), bound(top ? fwd(E) : rev(E), false)], plane(z, !top));
    if (c) {                                          // sloped wall: a cone from R1 out to the rim edge, two halves
      const gen = [0, Math.PI].map(a => lineE(Q(a, R1, z), Q(a, Rr, zRim)));
      const cone = A(`CONICAL_SURFACE('',#${W.ax3([0, 0, z], [0, 0, s], [1, 0, 0])},${R(R1)},${R(Math.atan2(Rr - R1, c))})`);
      if (top) {
        face([bound([[E1[0], 1], [gen[1], 1], [ER[0], 0], [gen[0], 0]])], cone);
        face([bound([[E1[1], 1], [gen[0], 1], [ER[1], 0], [gen[1], 0]])], cone);
      } else {
        face([bound([[E1[0], 0], [gen[0], 1], [ER[0], 1], [gen[1], 0]])], cone);
        face([bound([[E1[1], 0], [gen[1], 1], [ER[1], 1], [gen[0], 0]])], cone);
      }
    }
    // rim edge: a cylinder at the rim Ø between the wall and the outer face, two halves
    const [zlo, zhi, Alo, Ahi] = top ? [zRim, zCap, ER, EC] : [zCap, zRim, EC, ER];
    const seam = [0, Math.PI].map(a => lineE(Q(a, Rr, zlo), Q(a, Rr, zhi)));
    const cyl = A(`CYLINDRICAL_SURFACE('',#${W.ax3([0, 0, zlo], [0, 0, 1], [1, 0, 0])},${R(Rr)})`);
    face([bound([[Alo[0], 1], [seam[1], 1], [Ahi[0], 0], [seam[0], 0]])], cyl);
    face([bound([[Alo[1], 1], [seam[0], 1], [Ahi[1], 0], [seam[1], 0]])], cyl);
    face([bound(top ? fwd(EC) : rev(EC)), ...holesAt(top)], plane(zCap, top));     // outer face
  };
  end(false);
  end(true);
  const shell = A(`CLOSED_SHELL('',(${faces.map(i => '#' + i).join(',')}))`);
  return A(`MANIFOLD_SOLID_BREP('${stepStr(name)}',#${shell})`);
}
/* the STEP file of one pulley (stepFile takes the body's own builder) */
function pulleyStepText(title, name, m) {
  return stepFile(title, [{ name, solid: W => stepPulleySolid(W, name, m), color: STEP_PULLEY }]);
}

/* Faces for the 3D preview, in model space (mm): { g: draw group, n: outward normal, loops: [[x, y, z]…] (first = outer,
   the rest = holes), rim: a rim face }. For a view from above, the groups are drawn in order and the faces inside a group
   back to front: 0 walls of the bore and holes, 1 bottom rim, 2 the floor between the teeth on a bottom rim,
   3 the teeth, 4 top rim, 5 top face. Faces that only ever look down are left out. */
function pulleyMesh(m) {
  const flat = (v, step) => {                          // bulge polyline → points
    const pts = [];
    bulgeSegs(dropShort(v)).forEach(s => {
      pts.push([s.a[0], s.a[1]]);
      if (!s.arc) return;
      const k = Math.max(1, Math.ceil(Math.abs(s.sweep) / step)), a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
      for (let j = 1; j < k; j++) { const a = a0 + s.sweep * j / k; pts.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); }
    });
    return pts;
  };
  const out = [], K = 96, Ro = m.Ro, F = m.F;
  const circ = (r, k = K) => Array.from({ length: k }, (_, i) => [r * Math.cos(2 * Math.PI * i / k), r * Math.sin(2 * Math.PI * i / k)]);
  const at = (pts, z) => pts.map(p => [p[0], p[1], z]);
  const walls = (pts, z0, z1, g, rim) => pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    if (L > 1e-9) out.push({ g, rim, n: [dy / L, -dx / L, 0], loops: [[[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]]] });
  });
  let outl = flat(m.outline, 0.3);
  const smooth = outl.length > 2400;                    // hundreds of teeth: draw the side as a plain cylinder
  if (smooth) outl = circ(Ro, 240);
  const holes = m.holes.map(h => flat(h, 0.2));
  holes.forEach(h => walls(h, m.zB, m.zT, 0));
  const rim = (r, top) => {
    const g = top ? 4 : 1, s = top ? 1 : -1, z = top ? F : 0, zR = z + s * r.c, zC = z + s * r.w;
    walls(circ(r.Rr), Math.min(zR, zC), Math.max(zR, zC), g, true);
    if (r.c > 0) {
      const dr = r.Rr - r.R1, nl = Math.hypot(r.c, dr);
      for (let i = 0; i < K; i++) {
        const a0 = 2 * Math.PI * i / K, a1 = 2 * Math.PI * (i + 1) / K, am = (a0 + a1) / 2;
        out.push({ g, rim: true, n: [r.c * Math.cos(am) / nl, r.c * Math.sin(am) / nl, -s * dr / nl], loops: [[
          [r.R1 * Math.cos(a0), r.R1 * Math.sin(a0), z], [r.Rr * Math.cos(a0), r.Rr * Math.sin(a0), zR],
          [r.Rr * Math.cos(a1), r.Rr * Math.sin(a1), zR], [r.R1 * Math.cos(a1), r.R1 * Math.sin(a1), z]]] });
      }
    }
  };
  if (m.bot) {
    rim(m.bot, false);
    out.push({ g: 2, rim: true, n: [0, 0, 1], loops: [at(circ(m.bot.R1), 0), ...holes.map(h => at(h, 0))] });
  }
  walls(outl, 0, F, 3);
  if (m.top) rim(m.top, true);
  out.push({ g: 5, rim: !!m.top, n: [0, 0, 1], loops: [at(m.top ? circ(m.top.Rr) : smooth ? outl : flat(m.outline, 0.3), m.zT), ...holes.map(h => at(h, m.zT))] });
  return out;
}

/* the half section through a tooth, in (z, r): the outer profile from the bottom face to the top face */
function pulleySection(m) {
  const pts = [];
  if (m.bot) pts.push([m.zB, m.bot.Rr], [-m.bot.c, m.bot.Rr], [0, m.bot.R1]);
  pts.push([0, m.Ro], [m.F, m.Ro]);
  if (m.top) pts.push([m.F, m.top.R1], [m.F + m.top.c, m.top.Rr], [m.zT, m.top.Rr]);
  return pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
}
// ==PULLEY3D-END==
