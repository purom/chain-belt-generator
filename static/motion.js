/* Belt & Chain Calculator — Animations: motion preference, rolling numbers, gliding highlights, panel / type transitions, goo drop, balloon pop, warning stack, toasts and downloads.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

const sysReduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

let motionPref = null;

try { if (PS.getItem('belt-consent') === 'yes') motionPref = PS.getItem('belt-motion'); } catch (_) { /* storage blocked */ }

let reduceMotion = motionPref ? motionPref === 'off' : sysReduce;   // the header switch overrides the OS setting

const ease = t => 1 - Math.pow(1 - t, 4);

const lerp = (a, b, t) => a + (b - a) * t;

/* ---- rolling digits: each changed digit spins to its new value, odometer style ---- */
const LH_OK = !!(window.CSS && CSS.supports && CSS.supports('height', '1lh'));
let ROLL = !reduceMotion && LH_OK;
let motionTouched = false;
function setMotion(on, save) {
  reduceMotion = !on; ROLL = on && LH_OK;
  document.documentElement.classList.toggle('no-motion', !on);
  const cb = $('motion-on'); if (cb) cb.checked = on;
  if (save) { motionTouched = true; saveMotionPref(on); setPlaying(on); }
}
/* rolling digits and word swaps are built from <nf-c> (an unknown, inline element), not <span>, so page rules such as
   ".seg-opt span { display: block; padding … }" can't restyle them wherever a value rolls */
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10).join('\n');
const isNumTok = t => /^\d/.test(t);
const escT = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function wheel(o, n, trend, i) {
  if (o === n) return n;
  if (o === undefined) return `<nf-c class="nf-w nf-in">${n}</nf-c>`;
  const a = +o, b = +n;
  let end = 10 + b;
  if (trend > 0 && b < a) end += 10;            // keep rolling in the direction the value moved
  if (trend < 0 && b > a) end -= 10;
  return `<nf-c class="nf-w"><nf-c class="nf-ph">${n}</nf-c><nf-c class="nf-s" aria-hidden="true" style="--y:${10 + a};--i:${i}" data-y="${end}">${STRIP}</nf-c></nf-c>`;
}
/* put rolling wheels into el (from → to); returns commit() to run after one forced layout, or null */
const swapT = (a, b) => `<nf-c class="nf-x" aria-hidden="true"><nf-c class="nf-xo">${escT(a)}</nf-c><nf-c class="nf-xn">${escT(b)}</nf-c></nf-c>`;
function rollPrep(el, from, to) {
  const tok = s => s.match(/\d+(?:\.\d+)?|\D+/g) || [];
  const A = tok(from), B = tok(to);
  if (!A.length && !B.length) return null;
  // the part of two strings that differs: [common start, old middle, new middle, common end]
  const mid = (x, y) => {
    let p = 0, q = 0;
    while (p < x.length && p < y.length && x[p] === y[p]) p++;
    while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
    return [x.slice(0, p), x.slice(p, x.length - q), y.slice(p, y.length - q), x.slice(x.length - q)];
  };
  const sameShape = A.length === B.length && A.every((t, i) => isNumTok(t) === isNumTok(B[i]));
  // mostly new text (e.g. the page subtitle) swaps as one piece — even a digit both happen to share moves with it;
  // a small change (mm → in) keeps the rest in place and only the changed letters swap
  const changed = sameShape ? A.reduce((n, t, i) => n + (isNumTok(t) || t === B[i] ? 0 : Math.max(mid(t, B[i])[1].length, mid(t, B[i])[2].length)), 0) : Infinity;
  const whole = changed > 0.4 * Math.max(from.length, to.length);
  let html = whole ? swapT(from, to) : '', w = 0;
  if (!whole) B.forEach((t, i) => {
    if (t === A[i]) { html += escT(t); return; }
    if (!isNumTok(t)) { const [p0, o, n, q0] = mid(A[i], t); html += escT(p0) + swapT(o, n) + escT(q0); return; }
    const trend = Math.sign(parseFloat(t) - parseFloat(A[i])) || 1;
    const [ai, af = ''] = A[i].split('.'), [bi, bf = ''] = t.split('.');
    for (let j = 0; j < bi.length; j++) html += wheel(ai[ai.length - bi.length + j], bi[j], trend, w++);
    if (t.includes('.')) html += '.';
    for (let j = 0; j < bf.length; j++) html += wheel(af[j], bf[j], trend, w++);
  });
  clearTimeout(el._rt);
  el.innerHTML = html;
  el._rolling = true; el._txt = to;
  const hero = el.classList.contains('num') ? el.closest('.hero') : null;
  el.classList.remove('nf-hot');
  if (hero) hero.classList.remove('bump');
  return () => {
    el.querySelectorAll('.nf-s').forEach(s => s.style.setProperty('--y', s.dataset.y));
    el.classList.add('nf-hot');
    if (hero) hero.classList.add('bump');
    el._rt = setTimeout(() => { el._rolling = false; if (el.isConnected) el.textContent = to; }, 1000);
  };
}
/* after a results re-render: roll every [data-k] leaf whose text changed since the last render */
function rollNumbers(root) {
  const prev = root._nf || new Map(), next = new Map(), commits = [], now = performance.now();
  const live = root._live || (root._live = new Map());           // rolls just started: key → { from, to, t0 }
  root.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k, to = el.textContent, r = live.get(k);
    let from = prev.get(k), carry = false;
    // the same result drawn again a moment after it changed (one change often renders twice): keep that roll going
    if (from === to && r && r.to === to && now - r.t0 < 150) { from = r.from; carry = true; }
    next.set(k, to);
    if (ROLL && from !== undefined && from !== to) {
      const c = rollPrep(el, from, to);
      if (c) { commits.push(c); if (!carry) live.set(k, { from, to, t0: now }); }
    }
  });
  root._nf = next;
  if (root._fresh && root.querySelector('.kv') && !reduceMotion) {        // back from an error box: rows cascade in
    root._fresh = false;
    root.classList.remove('rows-in'); void root.offsetWidth; root.classList.add('rows-in');
    clearTimeout(root._ri); root._ri = setTimeout(() => root.classList.remove('rows-in'), 900);
  }
  if (commits.length) { void root.offsetWidth; commits.forEach(c => c()); }
}
/* an error box replaced the numbers: the next good result counts up from zero (like a first visit) instead of
   appearing at once or rolling from values that are no longer on screen */
const resetNumbers = root => { root._live = null; root._shown = 0; root._fresh = true; queueMicrotask(() => rollNumbers(root)); return ''; };
/* set one element's text, rolling the digits that changed */
function rollTo(el, text) {
  const from = el._rolling ? el._txt : el.textContent;
  if (from === text) return;
  const c = ROLL && from ? rollPrep(el, from, text) : null;
  if (!c) { clearTimeout(el._rt); el._rolling = false; el.textContent = text; return; }
  void el.offsetWidth;
  c();
}

/* ---- gliding selection indicators for segmented controls ---- */
const INDS = [];
function addInd(box, pick, cls) {
  const ind = document.createElement('span');
  ind.className = cls;
  ind.setAttribute('aria-hidden', 'true');
  box.appendChild(ind);
  INDS.push({ box, ind, pick: typeof pick === 'function' ? pick : b => b.querySelector(pick) });
}
function updateInds() {
  for (const { box, pick, ind } of INDS) {
    const t = pick(box);
    if (!t || !t.offsetWidth) continue;
    glide(ind, t.offsetLeft, t.offsetTop, t.offsetWidth, t.offsetHeight);
    if (!box.classList.contains('has-ind')) {
      box.classList.add('has-ind');
      requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.add('ready')));
    }
  }
}
/* number inputs: the new value slides in from the direction it moved */
function nudge(el, dir) {
  if (reduceMotion || !dir) return;
  el.classList.remove('nudge-up', 'nudge-dn');
  void el.offsetWidth;
  el.classList.add(dir > 0 ? 'nudge-up' : 'nudge-dn');
}

/* first visit to a panel: the hero number counts up from 0 (later changes roll instead) */
function animateHero(res) {
  const el = res.querySelector('.hero-value .num');
  if (!el) return;
  cancelAnimationFrame(res._raf);
  if (res._shown !== 0 || reduceMotion) { res._shown = 1; return; }
  res._shown = 1;
  const to = parseFloat(el.dataset.v), dec = +el.dataset.d, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 750);
    el.textContent = (to * ease(k)).toFixed(dec);
    if (k < 1) res._raf = requestAnimationFrame(step);
  };
  el.textContent = (0).toFixed(dec);
  res._raf = requestAnimationFrame(step);
}

/* ---------------- tabs, panels & export menus ---------------- */
/* sliding indicator under the selected tab of each page's tab bar */
/* gliding highlights (tabs, page switch, toggles, belt-type cards): the leading edge runs ahead and the trailing edge
   catches up, so the highlight stretches a little on its way, then settles with a soft glow */
function glide(ind, x, y, w, h) {
  const live = ind.getAnimations().filter(a => a.playState === 'running');
  let p = ind._g;
  if (live.length && p) {                            // mid-glide: start from where it is on screen right now
    const cs = getComputedStyle(ind), m = new DOMMatrixReadOnly(cs.transform);
    p = { x: m.e, y: m.f, w: parseFloat(cs.width), h: h == null ? null : parseFloat(cs.height) };
  }
  live.forEach(a => a.cancel());
  ind._g = { x, y, w, h };
  ind.style.transform = `translate(${x}px, ${y}px)`; ind.style.width = `${w}px`; if (h != null) ind.style.height = `${h}px`;
  if (!p || reduceMotion || !ind.classList.contains('ready')) return;
  if (Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5 && Math.abs(p.w - w) < 0.5 && (h == null || Math.abs(p.h - h) < 0.5)) return;
  const lag = (a, b, f) => a + (b - a) * f, fx = x + w / 2 >= p.x + p.w / 2;
  const box = (bx, by, bw, bh) => Object.assign({ transform: `translate(${bx}px, ${by}px)`, width: `${bw}px` }, h == null ? {} : { height: `${bh}px` });
  const L = lag(p.x, x, fx ? 0.18 : 0.72), Rt = lag(p.x + p.w, x + w, fx ? 0.72 : 0.18);
  let mid = box(L, y, Rt - L);
  if (h != null) {
    const fy = y + h / 2 >= p.y + p.h / 2, T = lag(p.y, y, fy ? 0.18 : 0.72), B = lag(p.y + p.h, y + h, fy ? 0.72 : 0.18);
    mid = box(L, T, Rt - L, B - T);
  }
  ind.animate([{ ...box(p.x, p.y, p.w, p.h), easing: 'cubic-bezier(.45,0,.8,.4)' }, { ...mid, offset: 0.4, easing: 'cubic-bezier(.2,.7,.25,1)' }, box(x, y, w, h)],
    { duration: 480 });
  const glow = getComputedStyle(document.documentElement).getPropertyValue('--glow').trim() || 'rgba(226,86,11,.26)';
  ind.animate([{ boxShadow: `0 0 0 0 ${glow}` }, { boxShadow: `0 0 0 6px ${glow}`, offset: 0.55 }, { boxShadow: getComputedStyle(ind).boxShadow }],
    { duration: 900, easing: 'ease-out' });
}

function enterPanel(p, dir = 0) {
  if (!p || reduceMotion) return;
  p.style.setProperty('--dx', `${dir * 28}px`);
  p.style.setProperty('--dy', dir ? '0px' : '14px');
  p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter');
  clearTimeout(p._et); p._et = setTimeout(() => p.classList.remove('enter'), 1200);
  const res = p.querySelector('.results');
  if (res && !res._seen) { res._seen = true; res._shown = 0; animateHero(res); }
}

/* type switch: every drawing in view cross-fades — a snapshot of the old one fades out over the new one, which on the
   layouts also glides from the old geometry to the new */
function morphSnap() {
  if (reduceMotion) return;
  document.querySelectorAll('.page:not([hidden]) .panel:not([hidden]) .viz svg').forEach(svg => {
    const r = svg.getBoundingClientRect();
    if (svg.closest('button') || r.width < 60 || r.height < 30) return;
    const par = svg.parentElement, pr = par.getBoundingClientRect();
    if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
    const ghost = svg.cloneNode(true);
    ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { position: 'absolute', margin: '0', pointerEvents: 'none', left: `${r.left - pr.left - par.clientLeft + par.scrollLeft}px`,
      top: `${r.top - pr.top - par.clientTop + par.scrollTop}px`, width: `${r.width}px`, height: `${r.height}px`, maxHeight: 'none' });
    par.appendChild(ghost);
    ghost.animate([{ opacity: 1, filter: 'none' }, { opacity: 0, filter: 'blur(2px)' }], { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
      .onfinish = () => ghost.remove();
  });
}

/* rebuild a chip row, rolling the labels that changed (e.g. 15 mm → 0.5906 in) */
function setChips(box, html) {
  const key = (c, i) => c.dataset.tw ?? c.dataset.th ?? c.dataset.rdiag ?? i;
  const old = new Map([...box.querySelectorAll('.chip')].map((c, i) => [key(c, i), c._rolling ? c._txt : c.textContent]));
  box.innerHTML = html;
  box.querySelectorAll('.chip').forEach((c, i) => {
    const o = old.get(key(c, i)), to = c.textContent;
    if (o != null && o !== to) { c.textContent = o; rollTo(c, to); }
  });
}

/* Gooey flight: the button melts while a drop pulls out of it; the drop only ever speeds up along a curve,
   its tail stretching with the speed, and hits the target box at full speed. The impact carries on as inertia: the box
   (and the blob inside it) is knocked along the direction of travel and springs back. A blur + alpha-threshold filter
   makes touching shapes flow together. land() runs at the impact (that is when the value changes); the target rect is
   re-read every frame, so the drop follows the box if the page scrolls. */
function gooFly(fromEl, target, land) {
  const a = fromEl instanceof Element ? fromEl.getBoundingClientRect() : fromEl;    // an element, or a rect remembered earlier
  if (reduceMotion || !a || !a.width || !target) { land(); return; }
  const real = target instanceof Element;                                          // else a point off the page (downloads)
  if (real && (target.getBoundingClientRect().bottom < 0 || target.getBoundingClientRect().top > innerHeight)) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = '<svg class="goo-fly" aria-hidden="true"><defs><filter id="goo-f" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
    + '<feGaussianBlur in="SourceGraphic" stdDeviation="6"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter></defs>'
    + '<g filter="url(#goo-f)"><rect class="gb" data-g="src"/><rect class="gb" data-g="dst"/>'
    + [0, 1, 2, 3, 4, 5].map(i => `<circle class="gb" data-g="d${i}"/>`).join('') + '</g></svg>';
  const svg = wrap.firstChild, G = k => svg.querySelector(`[data-g="${k}"]`);
  document.body.appendChild(svg);
  const st = real ? target.closest('.stepper') || target : null, b0 = target.getBoundingClientRect();
  const S = [a.left + a.width / 2, a.top + a.height / 2], r0 = Math.max(20, a.height * 0.7);
  const L0 = Math.hypot(b0.left + b0.width / 2 - S[0], b0.top + b0.height / 2 - S[1]);
  // timeline (ms): the drop leaves at T0, accelerates for F and hits at TI; the spring rings for ~0.6 s after
  const T0 = 40, F = Math.max(200, Math.min(360, 170 + L0 * 0.13)), TI = T0 + F, TF = TI + 260, TEND = TI + 560;
  const cl = v => Math.max(0, Math.min(1, v)), out = k => 1 - (1 - k) ** 3, ACC = 2.3;   // u = k^ACC: speeds up all the way
  // damped spring for the impact: a kick along the travel direction that rings out
  const ring = t => t < 0 ? 0 : Math.exp(-t / 120) * Math.sin(t / 1000 * 2 * Math.PI / 0.21);
  const setRect = (el, cx, cy, w, h, rx) => {
    el.setAttribute('x', cx - w / 2); el.setAttribute('y', cy - h / 2);
    el.setAttribute('width', Math.max(0, w)); el.setAttribute('height', Math.max(0, h)); el.setAttribute('rx', Math.max(0, Math.min(rx, h / 2, w / 2)));
  };
  let landed = false, dir = [0, 1], kick = 0, tc = null, P = null;
  const t0 = performance.now();
  const step = now => {
    const t = now - t0, b = target.getBoundingClientRect(), E = [b.left + b.width / 2, b.top + b.height / 2];
    // a curve that bows away from the straight line, so the drop swings across rather than sliding
    const dx = E[0] - S[0], dy = E[1] - S[1], L = Math.hypot(dx, dy) || 1, bow = Math.min(150, L * 0.26);
    const C1 = [S[0] + dx * 0.2 - dy / L * bow, S[1] + dy * 0.2 + dx / L * bow], C2 = [S[0] + dx * 0.7 - dy / L * bow * 0.45, S[1] + dy * 0.7 + dx / L * bow * 0.45];
    const at = u => { const v = 1 - u; return [0, 1].map(i => v ** 3 * S[i] + 3 * v * v * u * C1[i] + 3 * v * u * u * C2[i] + u ** 3 * E[i]); };
    const speed = u => { const v = 1 - u; return Math.hypot(...[0, 1].map(i => 3 * v * v * (C1[i] - S[i]) + 6 * v * u * (C2[i] - C1[i]) + 3 * u * u * (E[i] - C2[i]))) || 1; };
    // 1 · the button melts: it shrinks to its centre while the drop pulls out of it (the slow start makes the neck)
    const m = out(cl(t / 180));
    setRect(G('src'), S[0], S[1], a.width * (1 - m) + r0 * 0.9 * m, a.height * (1 - 0.55 * m), a.height / 2);
    if (t > 200) G('src').setAttribute('width', 0);
    // 2 · flight: u = k^ACC, so speed only grows; the tail spacing grows with it (it stretches) but stays under the
    //     drops' radii, so they never break apart. After the hit the head is inside the box and the tail pours in after it.
    const k = cl((t - T0) / F), u = k ** ACC, v = k;                         // v: normalised speed (dU/dk ∝ k^(ACC−1) ≈ k)
    const rr = r0 * (1 - 0.18 * v);
    const pour = cl((t - TI) / 80);                                          // tail catching up after the hit
    const gap = rr * (0.4 + 0.75 * v) * (1 - pour) / speed(Math.max(u, 0.02));
    const sink = out(cl((t - TI - 20) / 160));                                // drops shrink into the box
    [0, 1, 2, 3, 4, 5].forEach(i => {                                         // six drops tapering off: a smoother, longer tail
      const [x, y] = at(cl(u - i * gap * 0.72)), ri = t > T0 * 0.6 ? rr * [1, 0.9, 0.8, 0.69, 0.58, 0.47][i] * (1 - sink) : 0;
      const el = G(`d${i}`);
      el.setAttribute('cx', x + dir[0] * kick); el.setAttribute('cy', y + dir[1] * kick); el.setAttribute('r', Math.max(0, ri));
    });
    // the hit knocks the box along the travel direction
    // 3 · the box blob appears only when the drop touches the box, and spreads from that point to fill it
    const head = at(u);
    if (tc == null && Math.abs(head[0] - E[0]) <= b.width / 2 + rr * 0.6 && Math.abs(head[1] - E[1]) <= b.height / 2 + rr * 0.6) { tc = t; P = head; }
    const g = tc == null ? 0 : out(cl((t - tc) / 130)), f = cl((t - TF + 160) / 160);
    if (t >= TI - 1) { const tg = [E[0] - C2[0], E[1] - C2[1]], tl = Math.hypot(...tg) || 1; if (!landed) dir = [tg[0] / tl, tg[1] / tl]; }
    kick = Math.min(14, 5 + L * 0.008) * ring(t - TI);
    const sq = 0.07 * ring(t - TI);                                           // squash along the hit, bulge across it
    const sx = 1 + sq * (Math.abs(dir[1]) - Math.abs(dir[0])), sy = 1 + sq * (Math.abs(dir[0]) - Math.abs(dir[1]));
    const cx = P ? P[0] + (E[0] - P[0]) * g : E[0], cy = P ? P[1] + (E[1] - P[1]) * g : E[1], w0 = rr * 1.6;
    setRect(G('dst'), cx + dir[0] * kick, cy + dir[1] * kick, tc == null ? 0 : (w0 + (b.width - w0) * g) * sx, tc == null ? 0 : (w0 + (b.height - w0) * g) * sy, 10);
    svg.style.opacity = String(1 - f);
    // the real box rides the same spring, so the hit carries through to the page
    if (st) st.style.transform = t >= TI ? `translate(${(dir[0] * kick).toFixed(2)}px, ${(dir[1] * kick).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` : '';
    if (!landed && t >= TI) {
      landed = true;
      land();
      if (st) { st.classList.add('goo-hit'); setTimeout(() => st.classList.remove('goo-hit'), 900); }
    }
    if (t >= TF) svg.style.display = 'none';
    if (t < TEND) requestAnimationFrame(step); else { svg.remove(); if (st) st.style.transform = ''; }
  };
  requestAnimationFrame(step);
}

/* Closing a warning pops it like a balloon: it swells for a moment, vanishes, and teardrop streaks burst out from
   its outline (thin end inward, round head outward); each streak shoots out, then its tail catches up and it shrinks
   to a dot and is gone. The warnings below then slide up into the gap. */
function popAlert(el) {
  if (reduceMotion || !el.isConnected) { el.remove(); return; }
  el.classList.add('popping');
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const INFLATE = 110, BURST = 440;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035, 1.09)' }], { duration: INFLATE, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
  setTimeout(() => {
    // the skin is gone at once…
    el.animate([{ opacity: 1, transform: 'scale(1.035, 1.09)' }, { opacity: 0, transform: 'scale(1.1, 1.18)' }], { duration: 60, easing: 'ease-out', fill: 'forwards' });
    // …and the gap closes behind it
    const h = r.height;
    el.animate([{ height: `${h}px`, marginBottom: '0px', paddingTop: getComputedStyle(el).paddingTop, paddingBottom: getComputedStyle(el).paddingBottom },
      { height: '0px', marginBottom: '-10px', paddingTop: '0px', paddingBottom: '0px' }],
      { duration: 300, delay: 90, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).onfinish = () => el.remove();
    burst();
  }, INFLATE);
  function burst() {
    const NS2 = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS2, 'svg');
    svg.setAttribute('class', 'pop-burst'); svg.setAttribute('aria-hidden', 'true');
    document.body.appendChild(svg);
    const hw = r.width / 2, hh = r.height / 2;
    const edge = a => Math.min(Math.abs(hw / (Math.cos(a) || 1e-9)), Math.abs(hh / (Math.sin(a) || 1e-9)));   // centre → outline
    const N = 11, parts = [];
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * 2 * Math.PI + (Math.random() - 0.5) * 0.45, e = edge(a);
      const big = i % 3 === 0;                                         // a few long, thick streaks among shorter ones
      parts.push({ el: document.createElementNS(NS2, 'path'), a, from: e * 0.82, to: e + (big ? 34 : 16) + Math.random() * 18,
        w: big ? 3.6 : 2.2 + Math.random() * 1.2, dur: BURST * (0.75 + Math.random() * 0.3), delay: Math.random() * 40 });
    }
    for (let i = 0; i < 6; i++) {                                      // loose specks between the streaks
      const a = Math.random() * 2 * Math.PI, e = edge(a);
      parts.push({ el: document.createElementNS(NS2, 'circle'), a, dot: true, from: e * 0.9, to: e + 8 + Math.random() * 14,
        w: 1.6 + Math.random() * 1.2, dur: BURST * 0.6, delay: 30 + Math.random() * 60 });
    }
    parts.forEach(p => svg.appendChild(p.el));
    const out = k => 1 - (1 - k) ** 3, t0 = performance.now();
    const step = now => {
      let live = false;
      for (const p of parts) {
        const k = Math.max(0, Math.min(1, (now - t0 - p.delay) / p.dur)), ca = Math.cos(p.a), sa = Math.sin(p.a);
        if (k < 1) live = true;
        const head = p.from + (p.to - p.from) * out(k), w = p.w * (1 - k ** 2.4);
        if (p.dot) { p.el.setAttribute('cx', cx + ca * head); p.el.setAttribute('cy', cy + sa * head); p.el.setAttribute('r', Math.max(0, w)); continue; }
        const tail = p.from + (p.to - p.from) * Math.min(1, k ** 1.7 * 1.05);   // the tail lags, then catches up: long → dot
        const Hx = cx + ca * head, Hy = cy + sa * head, Tx = cx + ca * tail, Ty = cy + sa * tail, nx = -sa * w, ny = ca * w;
        p.el.setAttribute('d', w <= 0.05 ? '' : head - tail < w
          ? `M${Hx + nx} ${Hy + ny}A${w} ${w} 0 1 0 ${Hx - nx} ${Hy - ny}A${w} ${w} 0 1 0 ${Hx + nx} ${Hy + ny}Z`
          : `M${Tx} ${Ty}L${Hx + nx} ${Hy + ny}A${w} ${w} 0 0 0 ${Hx - nx} ${Hy - ny}Z`);
      }
      if (live) requestAnimationFrame(step); else svg.remove();
    };
    requestAnimationFrame(step);
  }
}

const alertTops = () => new Map([...$('alerts').querySelectorAll('.alert:not(.popping):not(.out)')].map(a => [a, a.getBoundingClientRect().top]));

function flipAlerts(before) {                        // FLIP: each warning glides from where it was to its new place
  if (reduceMotion) return;
  before.forEach((top, a) => {
    if (!a.isConnected || a.classList.contains('out') || a.classList.contains('popping')) return;
    const d = top - a.getBoundingClientRect().top;
    if (Math.abs(d) > 1) a.animate([{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', composite: 'add' });
  });
}

let toastT;
function toast(msg) {
  if (dlHold) { dlToasts.push(msg); return; }      // a download is still on its way
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
}
/* downloads: a blob of the pressed button flows up to the browser's downloads button (just above the page's top-right
   corner) and the file is saved when it gets there; "Saved …" toasts wait for it */
const DL_TARGET = { getBoundingClientRect: () => ({ left: innerWidth - 92, top: -70, width: 44, height: 44 }) };
let lastPress = null, dlHold = 0;
const dlToasts = [];
document.addEventListener('pointerdown', e => {      // remembered before a menu closes and its button disappears
  const b = e.target instanceof Element && e.target.closest('button, a, [role="menuitem"]');
  lastPress = b ? { r: b.getBoundingClientRect(), t: performance.now() } : null;
}, true);
function download(name, text, type = 'application/dxf') {
  const save = () => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (--dlHold === 0) dlToasts.splice(0).forEach(m => toast(m));
  };
  const act = document.activeElement;
  const from = lastPress && performance.now() - lastPress.t < 2000 ? lastPress.r
    : act && act !== document.body && act.getBoundingClientRect ? act.getBoundingClientRect() : null;
  lastPress = null;
  dlHold++;
  gooFly(from, DL_TARGET, save);
}
