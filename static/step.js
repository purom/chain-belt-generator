/* Belt & Chain Calculator — STEP (ISO 10303-21, AP214) writer for chains and sprockets. Pure computing, no DOM.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

// ==STEP-START==
/* ---- STEP export (ISO 10303-21, AP214, millimetres) ----
   Every roller-chain part is an extrusion along the pin axis (Z): link plates, rollers, bushings, pins — and the
   sprockets. Each one becomes a closed B-rep solid: planar top / bottom faces and a planar (straight edge) or
   cylindrical (arc) side face per profile segment. Full circles are split in two halves, so no seam edges are needed. */
function stepWriter() {
  const out = [];
  let n = 0;
  const add = s => { out.push(`#${++n}=${s};`); return n; };
  const R = v => { const s = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6).replace(/0+$/, ''); return s === '-0.' ? '0.' : s; };
  const dirs = new Map();
  const dir = (x, y, z) => {
    const k = `${R(x)},${R(y)},${R(z)}`;
    let id = dirs.get(k);
    if (!id) { id = add(`DIRECTION('',(${k}))`); dirs.set(k, id); }
    return id;
  };
  const pt = (x, y, z) => add(`CARTESIAN_POINT('',(${R(x)},${R(y)},${R(z)}))`);
  const ax3 = (o, zd, xd) => { const a = pt(o[0], o[1], o[2]), b = dir(zd[0], zd[1], zd[2]), c = dir(xd[0], xd[1], xd[2]); return add(`AXIS2_PLACEMENT_3D('',#${a},#${b},#${c})`); };
  return { add, R, dir, pt, ax3, out, n: () => n };
}
const stepStr = s => String(s).replace(/[^\x20-\x7e]/g, '').replace(/'/g, "''");
/* one extruded solid: loops[0] = outer outline, the rest = holes (any orientation; fixed here) */
function stepExtrude(W, name, loopsIn, z0, z1) {
  const loops = loopsIn.map((v, i) => orient(v.filter((q, k) => {
    const w = v[(k + 1) % v.length];
    return Math.hypot(w[0] - q[0], w[1] - q[1]) > 1e-7;
  }), i === 0)).filter(v => v.length >= 2);
  const segs = loops.map(v => v.map((a, i) => {
    const b = v[(i + 1) % v.length], bl = a[2];
    if (!bl) { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); return { a, b, len, d: [dx / len, dy / len] }; }
    const th = 4 * Math.atan(bl), c = Math.hypot(b[0] - a[0], b[1] - a[1]), k = c / 2 / Math.tan(th / 2);
    const cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) / c * k, cy = (a[1] + b[1]) / 2 + (b[0] - a[0]) / c * k;
    return { a, b, arc: true, c: [cx, cy], r: (Math.hypot(a[0] - cx, a[1] - cy) + Math.hypot(b[0] - cx, b[1] - cy)) / 2, sweep: th };
  }));
  const vtx = (x, y, z) => W.add(`VERTEX_POINT('',#${W.pt(x, y, z)})`);
  const VB = loops.map(v => v.map(q => vtx(q[0], q[1], z0))), VT = loops.map(v => v.map(q => vtx(q[0], q[1], z1)));
  const edge = (s, z, v0, v1) => {
    const curve = s.arc
      ? W.add(`CIRCLE('',#${W.ax3([s.c[0], s.c[1], z], [0, 0, 1], [1, 0, 0])},${W.R(s.r)})`)
      : W.add(`LINE('',#${W.pt(s.a[0], s.a[1], z)},#${W.add(`VECTOR('',#${W.dir(s.d[0], s.d[1], 0)},${W.R(s.len)})`)})`);
    return W.add(`EDGE_CURVE('',#${v0},#${v1},#${curve},${!s.arc || s.sweep > 0 ? '.T.' : '.F.'})`);
  };
  const EB = segs.map((ss, li) => ss.map((s, i) => edge(s, z0, VB[li][i], VB[li][(i + 1) % ss.length])));
  const ET = segs.map((ss, li) => ss.map((s, i) => edge(s, z1, VT[li][i], VT[li][(i + 1) % ss.length])));
  const EV = loops.map((v, li) => v.map((q, i) => W.add(`EDGE_CURVE('',#${VB[li][i]},#${VT[li][i]},#${
    W.add(`LINE('',#${W.pt(q[0], q[1], z0)},#${W.add(`VECTOR('',#${W.dir(0, 0, 1)},${W.R(z1 - z0)})`)})`)},.T.)`)));
  const oe = (e, f) => W.add(`ORIENTED_EDGE('',*,*,#${e},${f ? '.T.' : '.F.'})`);
  const eloop = ids => W.add(`EDGE_LOOP('',(${ids.map(i => '#' + i).join(',')}))`);
  const bound = (lp, outer) => W.add(`${outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',#${lp},.T.)`);
  const plane = (o, nrm, ref) => W.add(`PLANE('',#${W.ax3(o, nrm, ref)})`);
  const face = (bs, surf, same) => W.add(`ADVANCED_FACE('',(${bs.map(i => '#' + i).join(',')}),#${surf},${same ? '.T.' : '.F.'})`);
  const faces = [];
  faces.push(face(ET.map((es, li) => bound(eloop(es.map(e => oe(e, true))), li === 0)), plane([0, 0, z1], [0, 0, 1], [1, 0, 0]), true));
  faces.push(face(EB.map((es, li) => bound(eloop(es.slice().reverse().map(e => oe(e, false))), li === 0)), plane([0, 0, z0], [0, 0, -1], [1, 0, 0]), true));
  segs.forEach((ss, li) => ss.forEach((s, i) => {
    const j = (i + 1) % ss.length;
    const lp = eloop([oe(EB[li][i], true), oe(EV[li][j], true), oe(ET[li][i], false), oe(EV[li][i], false)]);
    const surf = s.arc ? W.add(`CYLINDRICAL_SURFACE('',#${W.ax3([s.c[0], s.c[1], z0], [0, 0, 1], [1, 0, 0])},${W.R(s.r)})`)
      : plane([s.a[0], s.a[1], z0], [s.d[1], -s.d[0], 0], [s.d[0], s.d[1], 0]);
    faces.push(face([bound(lp, true)], surf, !s.arc || s.sweep > 0));
  }));
  const shell = W.add(`CLOSED_SHELL('',(${faces.map(i => '#' + i).join(',')}))`);
  return W.add(`MANIFOLD_SOLID_BREP('${stepStr(name)}',#${shell})`);
}
/* the whole file: one part with one solid per body, each coloured */
function stepFile(title, bodies) {
  const W = stepWriter(), A = W.add;
  const ac = A("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  A(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${ac})`);
  const pc = A(`PRODUCT_CONTEXT('',#${ac},'mechanical')`), t = stepStr(title);
  const prod = A(`PRODUCT('${t}','${t}','',(#${pc}))`);
  A(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#${prod}))`);
  const pdf = A(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const pdc = A(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ac},'design')`);
  const pd = A(`PRODUCT_DEFINITION('design','',#${pdf},#${pdc})`);
  const pds = A(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
  const lu = A('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const au = A('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const su = A('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const um = A(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${lu},'distance_accuracy_value','confusion accuracy')`);
  const ctx = A(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${um}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lu},#${au},#${su}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
  const solids = bodies.map(b => ({ id: stepExtrude(W, b.name, b.loops, b.z0, b.z1), color: b.color }));
  const origin = W.ax3([0, 0, 0], [0, 0, 1], [1, 0, 0]);
  const rep = A(`ADVANCED_BREP_SHAPE_REPRESENTATION('${t}',(#${origin},${solids.map(s => '#' + s.id).join(',')}),#${ctx})`);
  A(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
  const styles = new Map(), styled = [];
  for (const s of solids) {
    if (!s.color) continue;
    const key = s.color.join(',');
    if (!styles.has(key)) {
      const c = A(`COLOUR_RGB('',${s.color.map(W.R).join(',')})`);
      const fac = A(`FILL_AREA_STYLE_COLOUR('',#${c})`), fa = A(`FILL_AREA_STYLE('',(#${fac}))`), sfa = A(`SURFACE_STYLE_FILL_AREA(#${fa})`);
      const ssd = A(`SURFACE_SIDE_STYLE('',(#${sfa}))`), ssu = A(`SURFACE_STYLE_USAGE(.BOTH.,#${ssd})`);
      styles.set(key, A(`PRESENTATION_STYLE_ASSIGNMENT((#${ssu}))`));
    }
    styled.push(A(`STYLED_ITEM('color',(#${styles.get(key)}),#${s.id})`));
  }
  if (styled.length) A(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.map(i => '#' + i).join(',')}),#${ctx})`);
  const stamp = new Date().toISOString().slice(0, 19);
  return ['ISO-10303-21;', 'HEADER;', `FILE_DESCRIPTION(('${t}'),'2;1');`,
    `FILE_NAME('${t}.stp','${stamp}',(''),(''),'Timing Belt Calculator - chain generator','','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;', ...W.out, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}
const STEP_COL = { inner: [0.36, 0.38, 0.42], outer: [0.62, 0.64, 0.68], pin: [0.82, 0.83, 0.85], bush: [0.5, 0.52, 0.55], roller: [0.28, 0.29, 0.32], sprocket: [0.85, 0.42, 0.13] };
/* bodies of a chain through the given pins (pins lie in the XY plane, pin axis = Z) */
function chainBodies(ch, pins, closed, strands) {
  const { links, pos } = chainLinks(pins, closed), Z = chainZ(ch, strands), dB = bushD(ch), p = ch.p, out = [];
  const plate = (l, h, rh, cut, zz, name, color) => {
    const ang = Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]), loops = [plateLoop(p, h, cut)];
    if (!cut || cut[0] === 'L') loops.push(circleLoop(0, 0, rh, false));
    if (!cut || cut[0] === 'R') loops.push(circleLoop(p, 0, rh, false));
    const lp = loops.map(v => xformVerts(v, ang, l.a[0], l.a[1]));
    zz.forEach(([z0, z1], i) => out.push({ name: `${name} ${i + 1}`, loops: lp, z0, z1, color, kind: color === STEP_COL.inner ? 'in' : 'out' }));
  };
  for (const l of links) {
    const nm = `Link ${l.k + 1}`;
    if (l.type === 'I') plate(l, ch.hI, dB / 2, null, Z.inner, `${nm} inner plate`, STEP_COL.inner);
    else if (l.type === 'O') plate(l, ch.hO, ch.d2 / 2, null, Z.outer, `${nm} outer plate`, STEP_COL.outer);
    else {
      plate(l, ch.hI, dB / 2, offsetCut(ch, 'L'), Z.inner, `${nm} offset plate inner end`, STEP_COL.inner);
      plate(l, ch.hO, ch.d2 / 2, offsetCut(ch, 'R'), Z.outer, `${nm} offset plate outer end`, STEP_COL.outer);
    }
  }
  pos.forEach((q, i) => {
    const [x, y] = q.at;
    if (q.roller) {
      Z.bush.forEach(([z0, z1], s) => out.push({ name: `${ch.bush ? 'Bushing' : 'Bush'} ${i + 1}.${s + 1}`, loops: [circleLoop(x, y, dB / 2), circleLoop(x, y, ch.d2 / 2)], z0, z1, color: ch.bush ? STEP_COL.roller : STEP_COL.bush, kind: ch.bush ? 'roll' : 'bush' }));
      if (!ch.bush) Z.roller.forEach(([z0, z1], s) => out.push({ name: `Roller ${i + 1}.${s + 1}`, loops: [circleLoop(x, y, ch.d1 / 2), circleLoop(x, y, dB / 2)], z0, z1, color: STEP_COL.roller, kind: 'roll' }));
    }
    if (q.pin) out.push({ name: `Pin ${i + 1}`, loops: [circleLoop(x, y, ch.d2 / 2)], z0: Z.pin[0], z1: Z.pin[1], color: STEP_COL.pin, kind: 'pin' });
  });
  return out;
}
/* a sprocket (one tooth row per strand), turned by `ang`, centred at (ox, 0) */
function sprocketBodies(ch, z, st, strands, ox, ang, name) {
  const part = sprocketParts(ch, z, st);
  if (part.error) return part;
  const Z = chainZ(ch, strands), bf = toothW(ch), loops = [xformVerts(part.verts, ang, ox, 0)];
  const bl = boreLoop(part.bore);
  if (bl) loops.push(xformVerts(bl, ang, ox, 0));
  for (const hh of part.holes) loops.push(xformVerts(circleLoop(hh.c[0], hh.c[1], hh.r), ang, ox, 0));
  return { part, bodies: Z.zs.map((zc, i) => ({ name: Z.n > 1 ? `${name} row ${i + 1}` : name, loops, z0: zc - bf / 2, z1: zc + bf / 2, color: STEP_COL.sprocket, kind: 'spr' })) };
}
