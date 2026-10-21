/* Belt & Chain Calculator — Remembered settings: browser storage, mirrored in cookies (either one brings them back).
   Loaded as a classic script (works from file:// too); top-level names are shared with the other static/*.js files. */
'use strict';

/* remembered settings live in browser storage and are mirrored in cookies, so either one brings them back
   (cookies don't work on file:// pages, browser storage can be cleared on its own). Long values are split over
   several cookies (k.0, k.1 … with the count in k.n) to stay under the ~4 KB cookie limit. */
const CK = {
  ok: (() => { try { document.cookie = '__ck=1; path=/; SameSite=Lax'; const y = document.cookie.includes('__ck=1'); document.cookie = '__ck=; max-age=0; path=/'; return y; } catch (_) { return false; } })(),
  get(k) { if (!this.ok) return null; const m = document.cookie.match(new RegExp(`(?:^|; )${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)); return m ? decodeURIComponent(m[1]) : null; },
  set(k, v) { if (this.ok) document.cookie = `${k}=${encodeURIComponent(v)}; max-age=31536000; path=/; SameSite=Lax`; },
  del(k) { if (this.ok) document.cookie = `${k}=; max-age=0; path=/; SameSite=Lax`; },
};

const LS = (() => { try { const k = '__belt_t'; localStorage.setItem(k, k); localStorage.removeItem(k); return localStorage; } catch (_) { return null; } })();

const PS = {
  getItem(k) {
    const v = LS && LS.getItem(k);
    if (v != null) return v;
    const n = +CK.get(`${k}.n`);
    if (!(n > 0)) return CK.get(k);
    let out = '';
    for (let i = 0; i < n; i++) { const p = CK.get(`${k}.${i}`); if (p == null) return null; out += p; }
    return out;
  },
  setItem(k, v) {
    v = String(v);
    try { if (LS) LS.setItem(k, v); } catch (_) { /* full */ }
    if (!CK.ok) return;
    this.dropCookies(k);
    if (v.length <= 1000) { CK.set(k, v); return; }
    const parts = v.match(/[\s\S]{1,1000}/g);
    parts.forEach((p, i) => CK.set(`${k}.${i}`, p));
    CK.set(`${k}.n`, parts.length);
  },
  removeItem(k) { try { if (LS) LS.removeItem(k); } catch (_) { /* blocked */ } this.dropCookies(k); },
  dropCookies(k) { const n = +CK.get(`${k}.n`) || 0; for (let i = 0; i < n; i++) CK.del(`${k}.${i}`); CK.del(`${k}.n`); CK.del(k); },
};
