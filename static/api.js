/* Belt & Chain Calculator — Python server client.
   The local Python server (backend/, not published) marks the page it serves with <meta name="calc-api">. Such a page
   sends its calculations and file exports to the server's API; anywhere else (GitHub Pages, file://), or while the
   server isn't answering, the page answers from static/calc.js and builds files itself, exactly as before.
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

const API = {
  base: (document.querySelector('meta[name="calc-api"]') || {}).content || null,
  state: 'off',                 // off: no server, the page computes · wait: asking · live: the server computes · down: it stopped answering
  cache: new Map(),             // request → answer (most recent last)
  pend: new Map(),              // request → its fetch
  want: new Map(),              // slot (one per results panel) → the request it shows now
  retry: 0,
  onChange: null,               // set by the page: re-render when the state changes
};
const API_PENDING = Object.freeze({ pending: true });   // the answer is on its way: keep showing the last one
const API_JS = Object.freeze({ js: true });              // the server couldn't take this request: answer it here
const API_CACHE_MAX = 60;
const apiLive = () => API.state === 'live';
const emph = t => String(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');   // **text** in server / calc.js messages
const plain = t => String(t).replace(/\*\*/g, '');
const apiNotes = list => (list || []).map(n => [n.level, emph(n.text)]);

function apiStart() {
  if (!API.base) { apiBadge(); return; }
  apiSet('wait');
  apiProbe();
}
async function apiProbe() {
  try {
    const r = await fetch(`${API.base}health`, { cache: 'no-store' });
    apiSet(r.ok ? 'live' : 'down');
  } catch { apiSet('down'); }
}
function apiSet(s) {
  if (API.state === s) return;
  API.state = s;
  clearInterval(API.retry);
  if (s === 'down') { API.cache.clear(); API.retry = setInterval(apiProbe, 4000); }   // reconnects by itself
  apiBadge();
  if (API.onChange && (s === 'live' || s === 'down')) API.onChange(s);
}
function apiBadge() {
  const b = $('api-badge');
  if (!b) return;
  b.hidden = !API.base;
  b.dataset.state = API.state;
  const [txt, tip] = {
    wait: ['Python', 'Connecting to the local Python server…'],
    live: ['Python', 'Calculations and DXF / STEP files come from the local Python server.'],
    down: ['Browser', 'The Python server isn’t answering — the page calculates by itself and reconnects when the server is back.'],
  }[API.state] || ['', ''];
  b.querySelector('span').textContent = txt;
  b.title = tip;
}

/* ms: give up after this long (a calculation takes a few ms; files can take seconds, so they don't set one) */
async function apiPost(path, body, ms = 0) {
  const ctl = ms ? new AbortController() : null, t = ms ? setTimeout(() => ctl.abort(), ms) : 0;
  try {
    return await fetch(`${API.base}${path}?unit=${UNIT}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl && ctl.signal });
  } catch { throw { offline: true }; }
  finally { clearTimeout(t); }
}
async function apiJSON(path, body) {
  const r = await apiPost(path, body, 1500);
  const j = r.ok || r.status === 422 ? await r.json().catch(() => null) : null;
  if (r.ok && j) return j;
  if (r.status === 422 && j && typeof j.error === 'string') return j;    // can't be done: a normal answer
  throw { status: r.status };                                           // anything else: this request is answered here
}
function apiKeep(key, v) {
  API.cache.set(key, v);
  if (API.cache.size > API_CACHE_MAX) API.cache.delete(API.cache.keys().next().value);
}

/* The answer to a calculation request, right now: from the server's cache, from calc.js while there is no server,
   or API_PENDING while the server works on it; again() runs when the answer arrives, if the panel still wants it. */
function apiCalc(slot, path, req, again) {
  if (!apiLive()) return CALC[path](req);
  const key = `${path}|${UNIT}|${JSON.stringify(req)}`;
  API.want.set(slot, key);
  if (API.cache.has(key)) {
    const v = API.cache.get(key);
    API.cache.delete(key); API.cache.set(key, v);
    return v === API_JS ? CALC[path](req) : v;
  }
  if (!API.pend.has(key)) {
    API.pend.set(key, apiJSON(path, req)
      .then(v => apiKeep(key, v), e => { if (e && e.offline) apiSet('down'); else apiKeep(key, API_JS); })
      .then(() => { API.pend.delete(key); if (apiLive() && API.want.get(slot) === key) again(); }));
  }
  return API_PENDING;
}

/* Save a file: built by the server while it's running, else here. build() → { name, text, n } | { error }.
   o.name: the page's own file name (else the server's), o.type: MIME type, o.saved(file) → the toast. */
async function apiSave(path, req, build, o = {}) {
  let file = apiLive() ? await apiFile(path, req, o.name) : null;
  if (!file) file = build();
  if (!file) return;
  if (file.error) { toast(plain(file.error)); return; }
  download(file.name, file.text, o.type || 'application/dxf');
  toast(o.saved ? o.saved(file) : `Saved ${file.name}`);
}
async function apiFile(path, req, name) {
  const slow = setTimeout(() => toast('Building the file on the Python server…'), 600);
  try {
    const r = await apiPost(path, req);
    if (r.status === 422) {
      const j = await r.json().catch(() => null);
      if (j && typeof j.error === 'string') return { error: j.error };
    }
    if (!r.ok) return null;                                             // answered here instead
    const m = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
    return { name: name || (m ? m[1] : 'download'), text: await r.text(), n: +r.headers.get('X-Solids') || 0 };
  } catch (e) {
    if (e && e.offline) apiSet('down');
    return null;
  } finally { clearTimeout(slow); }
}

/* the page's settings → API requests (numbers the page couldn't read go as null: the server refuses, calc.js answers) */
function partReq(st) {
  const flat = st.bore === 'd' || st.bore === 'dd';
  return { bore_preset: st.borePre, bore: st.bore === 'none' ? 'round' : st.bore, bore_size: st.bore === 'none' ? 0 : st.boreNom,
    bore_flat: flat ? st.flatNom : 0, clearance: st.clear, hole_preset: st.holePre, holes: st.holes, fit: st.fit, pitch_circle: !!st.pitch };
}
const pulleyReq = st => ({ ...partReq(st), flange: !!st.flange, flange_height: st.flh });
