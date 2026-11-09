/* Belt & Chain Calculator — The page backdrop, behind every tab:
   - a two-scale drafting grid that fades out toward the edges and lights up in the accent colour near the pointer,
     with a small crosshair snapped to the nearest grid node;
   - a ripple that runs across the grid on tab and page switches (and on a click on the bare background);
   - a faint "ghost" drive in the margins: a timing belt on two pulleys or a roller chain on two sprockets, drawn with
     the page's own geometry (true grooves, belt teeth, sprocket teeth, chain plates), meshed, with a C2C dimension,
     as SVG animated like the layout previews (wheels turned by a transform, the belt path or the chain links moved).
     Everything about it is picked at random on every load: belt or chain, its type, tooth counts, size, placement,
     direction and hub style, so no two visits look the same.
   The drive turns on the page's animation loop (app.js frame() → backdropFrame), so Play / Pause and the speed slider
   drive it like the layouts; with Animations off nothing moves. It sits "far behind" the cards: when the page scrolls it
   follows at a fraction of the speed (parallax), moved by the browser's own scrolling (a scroll-driven CSS animation),
   so it glides with the page instead of trailing it. Loaded after the geometry and motion files, before app.js.
   Top-level names are shared with the other static/*.js files. */
'use strict';

const BD = { el: null, svg: null, els: null, W: 0, H: 0, range: 0, d: null, lay: null, s: 0, raf: 0, parQ: 0,
  spot: { tx: 0, ty: 0, x: 0, y: 0, o: 0, to: 0 }, ring: null };
const BD_SPEED = 26;                                 // belt speed at 1×, screen px per second
const BD_DEPTH = 0.3;                                // scrolls at 30 % of the page speed (at most half a screen in all)
const BD_SCROLL_TL = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));

/* ---- a new drive, all at random ---- */
function bdRandom() {
  const r = Math.random, rnd = (a, b) => a + r() * (b - a), pick = a => a[Math.floor(r() * a.length)];
  const hub = () => ({ style: pick(['holes', 'spokes', 'spokes', 'plain']), n: pick([3, 4, 5, 6]), bore: pick(['round', 'hex', 'key']) });
  const d = {
    dir: r() < 0.5 ? 1 : -1,
    side: r() < 0.3,                                 // both wheels along one side margin, else across the page
    corner: Math.floor(r() * 4),                     // which corner the big wheel sits in (mirrors the layout)
    f: [rnd(0.02, 0.12), rnd(0.64, 0.86), rnd(0.03, 0.16), rnd(0.1, 0.3)],
    size: rnd(0.19, 0.28), hubs: [hub(), hub()],
  };
  if (r() < 0.5) {
    d.kind = 'belt';
    d.belt = BELTS[pick(['HTD5M', 'HTD5M', 'HTD3M', 'GT2_2', 'GT2_3', 'GT3_3', 'GT3_5', 'XL', 'L', 'H'])];
    d.n1 = Math.round(rnd(30, 62)); d.n2 = Math.max(d.belt.minT, Math.round(d.n1 * rnd(0.3, 0.7)));
    d.R1 = pitchDia(d.n1, d.belt.pitch) / 2; d.R2 = pitchDia(d.n2, d.belt.pitch) / 2;
    d.wheels = [pulleyOutline(d.belt, d.n1, 0), pulleyOutline(d.belt, d.n2, 0)];
    d.out = d.belt.thick;                            // how far the belt reaches past the pitch circles
    d.pitch = d.belt.pitch; d.r1 = d.R1; d.r2 = d.R2;   // the loop runs on the pitch circles
  } else {
    d.kind = 'chain';
    d.ch = CHAINS[pick(['A25', 'A35', 'A40', 'A40', 'A50', 'A60', 'B08', 'B10', 'M420', 'M520', 'K8'])];
    d.n1 = Math.round(rnd(28, 50)); d.n2 = Math.round(rnd(11, 21));
    d.R1 = sprR(d.ch.p, d.n1); d.R2 = sprR(d.ch.p, d.n2);
    d.wheels = [sprocketOutline(d.ch, d.n1, 0), sprocketOutline(d.ch, d.n2, 0)];
    d.out = d.ch.hO / 2;
    // rollers move one pitch of arc per tooth gap, so on the wraps they run on z·p / 2π (a hair inside the pitch circle,
    // where the chord would be p): they stay seated in the gaps while the sprockets turn smoothly, with no ticks
    d.pitch = d.ch.p; d.r1 = d.n1 * d.ch.p / (2 * Math.PI); d.r2 = d.n2 * d.ch.p / (2 * Math.PI);
  }
  return d.wheels.some(w => w.error) ? bdRandom() : d;
}
/* where the drive sits in this window: centres in px, scale k (px per mm), C2C in mm. The C2C is the one of a whole
   number n of belt teeth / chain links (the largest that fits), so every tooth meets a groove and nothing ticks. */
function bdLayout() {
  const d = BD.d, W = BD.W, H = BD.H, [a, b, c, e] = d.f;
  const mx = d.corner & 1, my = d.corner & 2, X = u => (mx ? 1 - u : u) * W, Y = v => (my ? 1 - v : v) * H;
  const P1 = d.side ? [X(a * 0.6), Y(b)] : [X(a), Y(b)];
  const Q = d.side ? [X(a * 0.6 + c * 0.25), Y(e)] : [X(1 - c), Y(e)];
  const dist = Math.hypot(Q[0] - P1[0], Q[1] - P1[1]), ang = Math.atan2(Q[1] - P1[1], Q[0] - P1[0]);
  const k = Math.max(0.05, Math.min(d.size * (d.side ? 0.7 : 1) * Math.min(W, H) / d.R1, (dist - 24) / (d.R1 + d.R2 + 2 * d.out)));
  const n = Math.floor(beltLength(dist / k, d.r1, d.r2) / d.pitch), C = n >= 3 ? solveCenter(n * d.pitch, d.r1, d.r2) : NaN;
  if (!(W > 40 && H > 40 && Number.isFinite(C))) return null;   // no window yet (e.g. a hidden frame): draw nothing
  return { P1, P2: [P1[0] + Math.cos(ang) * C * k, P1[1] + Math.sin(ang) * C * k], k, C, n, ang };
}
/* how far the drive moves up over the whole scroll: BD_DEPTH of the page's scroll, at most half a screen */
const bdRange = () => Math.round(Math.min(Math.max(0, document.documentElement.scrollHeight - innerHeight) * BD_DEPTH, BD.H * 0.5));

/* ---- drawing: SVG, animated the way the layout previews are. Model space (wheel 1 at the origin, wheel 2 at (C, 0),
   y up, mm) sits in one group scaled to the window; each wheel is built once and only turned (rotate) per frame, the
   belt is one path redrawn per frame, a chain is one element per link moved along the loop. Colours come from CSS. ---- */
const bdN = v => Math.round(v * 1000) / 1000;
function bdD(v) {                                    // closed [x, y, bulge] polyline → SVG path data (model space, no flip)
  let s = `M${bdN(v[0][0])} ${bdN(v[0][1])}`;
  for (let i = 0; i < v.length; i++) {
    const [x0, y0, b] = v[i], [x1, y1] = v[(i + 1) % v.length];
    if (!b) { s += `L${bdN(x1)} ${bdN(y1)}`; continue; }
    const th = 4 * Math.atan(Math.abs(b)), r = Math.hypot(x1 - x0, y1 - y0) / (2 * Math.sin(th / 2));
    s += `A${bdN(r)} ${bdN(r)} 0 ${th > Math.PI ? 1 : 0} ${b > 0 ? 1 : 0} ${bdN(x1)} ${bdN(y1)}`;
  }
  return s + 'Z';
}
const bdCircle = (r, x = 0, y = 0) => `M${bdN(x + r)} ${bdN(y)}A${bdN(r)} ${bdN(r)} 0 1 1 ${bdN(x - r)} ${bdN(y)}A${bdN(r)} ${bdN(r)} 0 1 1 ${bdN(x + r)} ${bdN(y)}Z`;
function bdHubD(R, h) {                              // hub, bore and lightening holes or spokes, inside the root circle
  const P = (r, t) => `${bdN(r * Math.cos(t))} ${bdN(r * Math.sin(t))}`;
  let s = bdCircle(R * 0.3);
  if (h.bore === 'hex') s += `M${[0, 1, 2, 3, 4, 5].map(i => P(R * 0.11, i * Math.PI / 3)).join('L')}Z`;
  else { s += bdCircle(R * 0.1); if (h.bore === 'key') s += `M${bdN(-R * 0.03)} ${bdN(R * 0.085)}h${bdN(R * 0.06)}v${bdN(R * 0.05)}h${bdN(-R * 0.06)}Z`; }
  if (h.style === 'holes') {
    for (let i = 0; i < h.n; i++) { const t = (i + 0.5) * 2 * Math.PI / h.n; s += bdCircle(R * 0.16 * Math.sqrt(4 / h.n), R * 0.57 * Math.cos(t), R * 0.57 * Math.sin(t)); }
  } else if (h.style === 'spokes') {                // windows between n spokes of constant width
    const ro = R * 0.72, ri = R * 0.4, w = R * 0.07, go = Math.asin(w / ro), gi = Math.asin(w / ri);
    for (let i = 0; i < h.n; i++) {
      const a0 = i * 2 * Math.PI / h.n, a1 = (i + 1) * 2 * Math.PI / h.n;
      s += `M${P(ro, a0 + go)}A${bdN(ro)} ${bdN(ro)} 0 0 1 ${P(ro, a1 - go)}L${P(ri, a1 - gi)}A${bdN(ri)} ${bdN(ri)} 0 0 0 ${P(ri, a0 + gi)}Z`;
    }
  }
  return s;
}
const bdLabel = () => {
  const d = BD.d, lay = BD.lay;
  return `${d.kind === 'belt' ? `${d.belt.label} · ${d.n1}T + ${d.n2}T · ${lay.n}T belt` : `${d.ch.code} · ${d.n1}T + ${d.n2}T · ${lay.n} links`} · C2C ${len(lay.C, 1)}`;
};
/* (re)build the drawing for this window: called on load, resize and a new parallax range */
function bdBuild() {
  const { svg, d, lay, W, H } = BD;
  svg.setAttribute('viewBox', `0 0 ${W} ${H + BD.range}`);
  BD.els = null;
  if (!d || !lay) { svg.innerHTML = ''; return; }
  const k = lay.k, deg = r => bdN(r * 180 / Math.PI), [x1, y1] = lay.P1, [x2, y2] = lay.P2;
  let a = lay.ang;
  if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;   // keep the label upright
  const wheel = (x, j, R) => `<g transform="translate(${bdN(x)} 0)"><g class="bd-spin"><path class="w" d="${bdD(d.wheels[j].verts)}${bdHubD(R, d.hubs[j])}"/></g></g>`;
  let links = '';
  if (d.kind === 'chain') {                          // inner links first, so the outer plates lie on top
    const ch = d.ch, pi = bdD(plateLoop(ch.p, ch.hI, null)), po = bdD(plateLoop(ch.p, ch.hO, null)), roll = bdCircle(ch.d1 / 2) + bdCircle(ch.d2 / 2);
    const link = i => `<g data-l="${i}"><path class="${i % 2 ? 'pi' : 'po'}" d="${i % 2 ? pi : po}"/><path class="r" d="${roll}"/></g>`;
    for (let i = 1; i < lay.n; i += 2) links += link(i);
    for (let i = 0; i < lay.n; i += 2) links += link(i);
  }
  svg.innerHTML = `<g transform="translate(${bdN(x1)} ${bdN(y1)}) rotate(${deg(lay.ang)}) scale(${bdN(k)} ${bdN(-k)})">`
    + wheel(0, 0, d.R1) + wheel(lay.C, 1, d.R2)
    + (d.kind === 'belt' ? '<path class="b"/>' : `<g class="bd-chain">${links}</g>`) + '</g>'
    + `<path class="c" d="M${bdN(x1)} ${bdN(y1)}L${bdN(x2)} ${bdN(y2)}"/>`
    + `<path class="m" d="${[lay.P1, lay.P2].map(([x, y]) => `M${bdN(x - 9)} ${bdN(y)}h18M${bdN(x)} ${bdN(y - 9)}v18`).join('')}"/>`
    + `<text transform="translate(${bdN((x1 + x2) / 2)} ${bdN((y1 + y2) / 2)}) rotate(${deg(a)})" y="-9" text-anchor="middle">${escT(bdLabel())}</text>`;
  BD.els = { spin: svg.querySelectorAll('.bd-spin'), belt: svg.querySelector('.b'), text: svg.querySelector('text'),
    links: [...svg.querySelectorAll('g[data-l]')].map(g => ({ el: g, k: +g.dataset.l })) };
  BD.psi = [NaN, NaN]; BD.psiS = null;                // wheel angles start over from the meshed ones
  bdTick();
}
/* one frame: the belt / chain at travel s mm along its loop, the wheels turned to mesh with it */
function bdTick() {
  const { d, lay, els } = BD;
  if (!els) return;
  const s = BD.s, deg = r => bdN(r * 180 / Math.PI);
  let bo;
  if (d.kind === 'belt') {
    bo = beltOutline(d.belt, d.r1, d.r2, lay.C, s);
    els.belt.setAttribute('d', bdD(bo.outer) + bdD(bo.inner));
  } else {
    // wrap over the whole loop, not one pitch: links alternate inner / outer, so a per-pitch wrap would hand every
    // link to its neighbour's place (and swap the plate layers) once per pitch
    const bp = beltPath(d.r1, d.r2, lay.C), L = lay.n * d.pitch, sOff = ((s % L) + L) % L, pins = new Array(lay.n);
    for (let i = 0; i < lay.n; i++) pins[i] = pathAt(bp, sOff + i * d.pitch).p;
    for (const { el, k } of els.links) {
      const p = pins[k], q = pins[(k + 1) % lay.n];
      el.setAttribute('transform', `translate(${bdN(p[0])} ${bdN(p[1])}) rotate(${deg(Math.atan2(q[1] - p[1], q[0] - p[0]))})`);
    }
    bo = { bp, pe: d.pitch, sOff };
  }
  // like the layout previews (sceneTick): carry each wheel on by the travel, then take the meshed angle nearest to that.
  // The meshed angle alone jumps a whole tooth whenever another tooth reaches mid-wrap: invisible on the teeth, but
  // the spokes, holes and keyway would jump with it.
  const ds = BD.psiS == null ? 0 : s - BD.psiS;
  BD.psiS = s;
  els.spin.forEach((el, j) => {
    const step = 2 * Math.PI / (j ? d.n2 : d.n1), A = pulleyPhase(bo, j + 1), prev = BD.psi[j];
    const pred = Number.isFinite(prev) ? prev + ds / (j ? d.r2 : d.r1) : A;
    BD.psi[j] = A + step * Math.round((pred - A) / step);
    el.setAttribute('transform', `rotate(${deg(BD.psi[j]) % 360})`);
  });
}
const backdropRedraw = () => { if (BD.els) BD.els.text.textContent = bdLabel(); };   // the label's unit (mm / in)

/* per animation frame (app.js frame()): move the belt / chain at the layouts' speed */
function backdropFrame(dt, speed) {
  if (!BD.els || !dt) return;
  BD.s += BD.d.dir * BD_SPEED * speed * dt / BD.lay.k;
  bdTick();
}

/* parallax: the drawing is taller than the window by BD.range and moves up by that much over the whole scroll. Where the
   browser has scroll-driven animations, CSS does it on the compositor (styles.css .bd-ghost); elsewhere, this. */
function bdParallax() {
  BD.parQ = 0;
  const max = document.documentElement.scrollHeight - innerHeight, y = reduceMotion || max <= 0 ? 0 : BD.range * Math.min(1, scrollY / max);
  BD.svg.style.transform = `translate3d(0, ${-Math.round(y * (devicePixelRatio || 1)) / (devicePixelRatio || 1)}px, 0)`;
}

/* ---- spotlight and ripple: their own short animation, only while they move ---- */
function bdLoop(ts) {
  const sp = BD.spot, st = BD.el.style;
  sp.x += (sp.tx - sp.x) * 0.14; sp.y += (sp.ty - sp.y) * 0.14; sp.o += (sp.to - sp.o) * 0.1;
  let more = Math.abs(sp.tx - sp.x) + Math.abs(sp.ty - sp.y) > 0.3 || Math.abs(sp.to - sp.o) > 0.002;
  st.setProperty('--x', `${sp.x.toFixed(1)}px`); st.setProperty('--y', `${sp.y.toFixed(1)}px`); st.setProperty('--o', sp.o.toFixed(3));
  BD.snap.style.transform = `translate(${Math.round(sp.tx / 24) * 24}px, ${Math.round(sp.ty / 24) * 24}px)`;
  const rg = BD.ring;
  if (rg) {                                          // a ring that grows to the far corner and fades out
    const t = Math.min(1, (ts - rg.t0) / 1250), r = rg.max * (1 - (1 - t) ** 3);
    st.setProperty('--rx', `${rg.x}px`); st.setProperty('--ry', `${rg.y}px`); st.setProperty('--rr', `${r.toFixed(1)}px`);
    st.setProperty('--ro', (t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5).toFixed(3));
    if (t >= 1) BD.ring = null; else more = true;
  }
  BD.raf = more ? requestAnimationFrame(bdLoop) : 0;
}
const bdKick = () => { if (BD.el && !BD.raf) BD.raf = requestAnimationFrame(bdLoop); };
/* a ripple from an element (a tab, a page button) or a point */
function backdropRipple(at) {
  if (!BD.el || reduceMotion || !at) return;
  let x = at.x, y = at.y;
  if (at.getBoundingClientRect) { const r = at.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  BD.ring = { x, y, t0: performance.now(), max: Math.hypot(Math.max(x, BD.W - x), Math.max(y, BD.H - y)) + 120 };
  bdKick();
}

/* ---- set-up ---- */
function bdSize() {
  BD.W = innerWidth; BD.H = innerHeight; BD.range = bdRange();
  BD.el.style.setProperty('--bd-range', `${BD.range}px`);
  BD.lay = BD.d && bdLayout();
  bdBuild();
  if (!BD_SCROLL_TL) bdParallax();
}
function backdropInit() {
  const el = document.createElement('div');
  el.className = 'backdrop'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="bd bd-grid"></div><svg class="bd bd-ghost"></svg><div class="bd bd-glow"></div>'
    + '<div class="bd bd-spot"></div><div class="bd bd-ring"></div><span class="bd-snap"></span>';
  document.body.prepend(el);
  document.documentElement.classList.add('has-backdrop');
  Object.assign(BD, { el, svg: el.querySelector('svg'), snap: el.querySelector('.bd-snap') });
  BD.d = bdRandom();
  bdSize();
  addEventListener('resize', bdSize);
  // the page grows or shrinks (another tab, more pulleys): a new parallax range, so the depth stays the same
  new ResizeObserver(() => { if (bdRange() !== BD.range) bdSize(); }).observe(document.body);
  if (!BD_SCROLL_TL) addEventListener('scroll', () => { if (!BD.parQ) BD.parQ = requestAnimationFrame(bdParallax); }, { passive: true });
  document.addEventListener('pointermove', e => {
    const sp = BD.spot;
    if (reduceMotion || e.pointerType === 'touch') { if (sp.to) { sp.to = 0; bdKick(); } return; }
    if (!sp.o) { sp.x = e.clientX; sp.y = e.clientY; }   // appear where the pointer is, not fly in from the last spot
    sp.tx = e.clientX; sp.ty = e.clientY; sp.to = 1; bdKick();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { BD.spot.to = 0; bdKick(); });
  document.addEventListener('pointerdown', e => {    // a click on the bare background (between and around the cards)
    if (e.button === 0 && (e.target === document.body || e.target.matches('.wrap, .page, .panel, .layout, .top, .brand'))) backdropRipple({ x: e.clientX, y: e.clientY });
  });
}
backdropInit();
