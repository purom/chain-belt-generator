/* Belt & Chain Calculator — The page backdrop, behind every tab:
   - a two-scale drafting grid that fades out toward the edges and lights up in the accent colour near the pointer,
     with a small crosshair snapped to the nearest grid node;
   - a ripple that runs across the grid on tab and page switches (and on a click on the bare background);
   - a faint "ghost" drive in the margins: a timing belt on two pulleys or a roller chain on two sprockets, drawn with
     the page's own geometry (true grooves, belt teeth, sprocket teeth, chain plates), meshed, with a C2C dimension.
     Everything about it is picked at random on every load: belt or chain, its type, tooth counts, size, placement,
     direction and hub style, so no two visits look the same.
   The drive turns on the page's animation loop (app.js frame() → backdropFrame), so Play / Pause and the speed slider
   drive it like the layouts; with Animations off nothing moves. It sits "far behind" the cards: when the page scrolls it
   follows at a fraction of the speed (parallax), moved by the browser's own scrolling (a scroll-driven CSS animation),
   so it glides with the page instead of trailing it. Loaded after the geometry and motion files, before app.js.
   Top-level names are shared with the other static/*.js files. */
'use strict';

const BD = { el: null, cv: null, g: null, dpr: 1, W: 0, H: 0, range: 0, d: null, lay: null, s: 0, raf: 0, drawQ: 0, parQ: 0,
  spot: { tx: 0, ty: 0, x: 0, y: 0, o: 0, to: 0 }, ring: null, plates: null };
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

/* ---- drawing (model space: wheel 1 at the origin, wheel 2 at (C, 0), y up, mm) ---- */
function bdTrace(g, v) {                             // closed [x, y, bulge] polyline → current path
  g.moveTo(v[0][0], v[0][1]);
  for (let i = 0; i < v.length; i++) {
    const [x0, y0, b] = v[i], [x1, y1] = v[(i + 1) % v.length];
    if (!b) { g.lineTo(x1, y1); continue; }
    const th = 4 * Math.atan(b), c = Math.hypot(x1 - x0, y1 - y0);
    if (c < 1e-9) continue;
    const k = c / 2 / Math.tan(th / 2), cx = (x0 + x1) / 2 - (y1 - y0) / c * k, cy = (y0 + y1) / 2 + (x1 - x0) / c * k;
    g.arc(cx, cy, Math.hypot(x0 - cx, y0 - cy), Math.atan2(y0 - cy, x0 - cx), Math.atan2(y1 - cy, x1 - cx), th < 0);
  }
  g.closePath();
}
function bdHub(g, R, h) {                            // hub, bore and lightening holes or spokes, inside the root circle
  const ring = (r, x = 0, y = 0) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, 2 * Math.PI); };
  ring(R * 0.3);
  if (h.bore === 'hex') { for (let i = 0; i <= 6; i++) { const t = i * Math.PI / 3, q = R * 0.11; i ? g.lineTo(q * Math.cos(t), q * Math.sin(t)) : g.moveTo(q, 0); } }
  else { ring(R * 0.1); if (h.bore === 'key') g.rect(-R * 0.03, R * 0.085, R * 0.06, R * 0.05); }
  if (h.style === 'holes') {
    for (let i = 0; i < h.n; i++) { const t = (i + 0.5) * 2 * Math.PI / h.n; ring(R * 0.16 * Math.sqrt(4 / h.n), R * 0.57 * Math.cos(t), R * 0.57 * Math.sin(t)); }
  } else if (h.style === 'spokes') {                // windows between n spokes of constant width
    const ro = R * 0.72, ri = R * 0.4, w = R * 0.07, go = Math.asin(w / ro), gi = Math.asin(w / ri);
    for (let i = 0; i < h.n; i++) {
      const a0 = i * 2 * Math.PI / h.n, a1 = (i + 1) * 2 * Math.PI / h.n;
      g.moveTo(ro * Math.cos(a0 + go), ro * Math.sin(a0 + go));
      g.arc(0, 0, ro, a0 + go, a1 - go);
      g.lineTo(ri * Math.cos(a1 - gi), ri * Math.sin(a1 - gi));
      g.arc(0, 0, ri, a1 - gi, a0 + gi, true);
      g.closePath();
    }
  }
}
function bdDraw() {
  BD.drawQ = 0;
  const { g, W, H, d, lay } = BD;
  if (!g || !d || !lay) return;
  const cs = getComputedStyle(document.documentElement), ink = cs.getPropertyValue('--ink').trim(), acc = cs.getPropertyValue('--accent').trim();
  const dark = matchMedia('(prefers-color-scheme: dark)').matches, k = lay.k, C = lay.C, s = BD.s;
  g.setTransform(BD.dpr, 0, 0, BD.dpr, 0, 0);
  g.clearRect(0, 0, W, H + BD.range);
  // the drive in model space; the belt / chain moves s mm along its loop, the wheels turn meshed with it
  let bo;
  if (d.kind === 'belt') bo = beltOutline(d.belt, d.r1, d.r2, C, s);
  else { const bp = beltPath(d.r1, d.r2, C), pe = d.pitch; bo = { bp, pe, n: lay.n, sOff: ((s % pe) + pe) % pe }; }
  g.save();
  g.translate(lay.P1[0], lay.P1[1]); g.rotate(lay.ang); g.scale(k, -k);
  g.lineWidth = 1 / k; g.lineJoin = 'round';
  g.strokeStyle = ink; g.globalAlpha = dark ? 0.1 : 0.12;
  [[0, d.R1], [C, d.R2]].forEach(([x, R], j) => {
    g.save(); g.translate(x, 0); g.rotate(pulleyPhase(bo, j + 1));
    g.beginPath(); bdTrace(g, d.wheels[j].verts); bdHub(g, R, d.hubs[j]); g.restore();
    g.stroke();
  });
  if (d.kind === 'belt') {
    g.beginPath(); bdTrace(g, bo.outer); bdTrace(g, bo.inner);
    g.fillStyle = acc; g.globalAlpha = dark ? 0.05 : 0.045; g.fill('evenodd');
    g.strokeStyle = acc; g.globalAlpha = dark ? 0.24 : 0.2; g.stroke();
  } else {
    const ch = d.ch, pins = [];
    for (let i = 0; i < bo.n; i++) pins.push(pathAt(bo.bp, bo.sOff + i * bo.pe).p);
    if (!BD.plates || BD.plates.ch !== ch) BD.plates = { ch, I: plateLoop(ch.p, ch.hI, null), O: plateLoop(ch.p, ch.hO, null) };
    const plates = odd => {                          // one plate per link, stretched to the pin-to-pin chord
      g.beginPath();
      for (let i = odd; i < pins.length; i += 2) {
        const a = pins[i], b = pins[(i + 1) % pins.length], dx = b[0] - a[0], dy = b[1] - a[1];
        g.save(); g.translate(a[0], a[1]); g.rotate(Math.atan2(dy, dx)); g.scale(Math.hypot(dx, dy) / ch.p, 1);
        bdTrace(g, odd ? BD.plates.I : BD.plates.O); g.restore();
      }
    };
    plates(1); g.strokeStyle = ink; g.globalAlpha = dark ? 0.12 : 0.14; g.stroke();
    g.beginPath();
    for (const [x, y] of pins) { g.moveTo(x + ch.d1 / 2, y); g.arc(x, y, ch.d1 / 2, 0, 2 * Math.PI); g.moveTo(x + ch.d2 / 2, y); g.arc(x, y, ch.d2 / 2, 0, 2 * Math.PI); }
    g.stroke();
    plates(0); g.strokeStyle = acc; g.globalAlpha = dark ? 0.24 : 0.2; g.stroke();
  }
  g.restore();
  // centre line, centre marks and the drive's name + C2C, sketch style, in screen space
  const [x1, y1] = lay.P1, [x2, y2] = lay.P2;
  g.save();
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1; g.globalAlpha = dark ? 0.1 : 0.12;
  g.setLineDash([12, 4, 2, 4]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
  g.beginPath(); for (const [x, y] of [lay.P1, lay.P2]) { g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); } g.stroke();
  let a = lay.ang;
  if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;   // keep the text upright
  g.translate((x1 + x2) / 2, (y1 + y2) / 2); g.rotate(a);
  g.globalAlpha = dark ? 0.2 : 0.22; g.font = '500 12px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = 'center';
  g.fillText(`${d.kind === 'belt' ? `${d.belt.label} · ${d.n1}T + ${d.n2}T · ${lay.n}T belt` : `${d.ch.code} · ${d.n1}T + ${d.n2}T · ${lay.n} links`} · C2C ${len(C, 1)}`, 0, -9);
  g.restore();
}
const backdropRedraw = () => { if (BD.g && !BD.drawQ) BD.drawQ = requestAnimationFrame(bdDraw); };

/* per animation frame (app.js frame()): move the belt / chain at the layouts' speed and redraw (~0.5 ms), every frame,
   so it moves evenly at any refresh rate */
function backdropFrame(dt, speed) {
  if (!BD.d || !BD.lay || !dt) return;
  BD.s += BD.d.dir * BD_SPEED * speed * dt / BD.lay.k;
  bdDraw();
}

/* parallax: the canvas is taller than the window by BD.range and moves up by that much over the whole scroll. Where the
   browser has scroll-driven animations, CSS does it on the compositor (styles.css .bd-ghost); elsewhere, this. */
function bdParallax() {
  BD.parQ = 0;
  const max = document.documentElement.scrollHeight - innerHeight, y = reduceMotion || max <= 0 ? 0 : BD.range * Math.min(1, scrollY / max);
  BD.cv.style.transform = `translate3d(0, ${-Math.round(y * BD.dpr) / BD.dpr}px, 0)`;
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
  BD.dpr = Math.min(1.5, devicePixelRatio || 1);
  BD.W = innerWidth; BD.H = innerHeight; BD.range = bdRange();
  BD.el.style.setProperty('--bd-range', `${BD.range}px`);
  BD.cv.width = Math.round(BD.W * BD.dpr); BD.cv.height = Math.round((BD.H + BD.range) * BD.dpr);
  BD.lay = BD.d && bdLayout();
  if (!BD_SCROLL_TL) bdParallax();
}
function backdropInit() {
  const el = document.createElement('div');
  el.className = 'backdrop'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="bd bd-grid"></div><canvas class="bd bd-ghost"></canvas><div class="bd bd-glow"></div>'
    + '<div class="bd bd-spot"></div><div class="bd bd-ring"></div><span class="bd-snap"></span>';
  document.body.prepend(el);
  document.documentElement.classList.add('has-backdrop');
  Object.assign(BD, { el, cv: el.querySelector('canvas'), snap: el.querySelector('.bd-snap') });
  BD.g = BD.cv.getContext('2d');
  BD.d = bdRandom();
  bdSize();
  addEventListener('resize', () => { bdSize(); bdDraw(); });
  // the page grows or shrinks (another tab, more pulleys): a new parallax range, so the depth stays the same
  new ResizeObserver(() => { if (bdRange() !== BD.range) { bdSize(); bdDraw(); } }).observe(document.body);
  if (!BD_SCROLL_TL) addEventListener('scroll', () => { if (!BD.parQ) BD.parQ = requestAnimationFrame(bdParallax); }, { passive: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', backdropRedraw);
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
  bdDraw();
}
backdropInit();
