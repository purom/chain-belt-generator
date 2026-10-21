# Refactor plan: Python backend + shared animation & style files

**Done — split into `static/`** (classic `<script src>` files that share one global scope, so the page still works
from `file://`; load order matters and is set in `belt-chain-calculator.html`):

| File | What |
|---|---|
| `static/styles.css` | All CSS (tokens, layout, 31 `@keyframes`, motion rules) |
| `static/storage.js` | Browser storage + cookie mirror (`CK`, `LS`, `PS`) |
| `static/format.js` | `$`, number & length formatting (mm / in), icons, small HTML / SVG builders |
| `static/belt.js` | Belt data, C2C ⇄ length, pulley grooves, belt teeth, layouts, DXF writer — no DOM |
| `static/chain.js` | Chain data, sprockets, chain length, exact loop, plates, DXF drawings — no DOM |
| `static/step.js` | STEP (3D) writer — no DOM |
| `static/motion.js` | Every animation: motion preference, rolling numbers, glide, panels, morph, goo, pop, warning stack, toasts, downloads |
| `static/truesize.js` | Screen scale, reference objects, 1:1 drawing + ruler |
| `static/app.js` | The page: state, rendering, inputs, warnings, settings, start-up |

`belt.js`, `chain.js` and `step.js` are the parts to port to Python (steps 2–3 below); `motion.js` and
`styles.css` are the starting point for steps 5–6.

Goal: all calculation and file generation in a Python backend; the page becomes a thin front end
that loads one shared animation script and one shared stylesheet.

---

## 0. Decide first

- [ ] **Where Python runs.** GitHub Pages only serves static files, so it can't run a Python server.
  - **A. Python in the browser (Pyodide):** the site stays on GitHub Pages and keeps working offline once loaded. First load gets ~10 MB heavier and a few seconds slower.
  - **B. Real server** (FastAPI on Render / Fly.io / a VPS): fast page, but it needs hosting, is online-only, and every keystroke becomes a request (needs debouncing).
  - **C. Both:** one Python package, served by FastAPI *and* loadable in Pyodide.
- [ ] **Live previews.** The layout drawings and animations update every frame. Keep frame-rate drawing (belt/chain motion, tweens) in JS and only move the *geometry* (outlines, pin positions) to Python, sent once per change.
- [ ] **File names.** Agree on `index.html`, `static/motion.js`, `static/styles.css`, `backend/`.

## 1. Set up the Python project

- [ ] `backend/` package (`pyproject.toml`, Python 3.11+), formatter + linter (ruff), `pytest`.
- [ ] Modules: `belts.py`, `chains.py`, `geometry.py` (bulge polylines, arcs), `dxf.py`, `step.py`, `units.py`, `refs.py`.
- [ ] One JSON-friendly result type per calculation (dataclasses → dict), with an `error` field instead of exceptions for "can't solve".

## 2. Lock the current behaviour before moving anything

- [ ] Extract the three marked JS sections (`==MATH==`, `==CHAIN-MATH==`, `==STEP==`) and run them in Node to produce **golden files**: C2C, lengths, minimum teeth/links, pulley and sprocket outlines, DXF text and STEP text for ~50 cases (every belt type incl. MXL/XL/L/H, GT3; every chain incl. quadruplex; bores, holes, fit offsets).
- [ ] Python tests compare against these golden files (numbers to 1e-6 mm; DXF/STEP compared entity by entity).

## 3. Port the logic to Python (one module at a time, tests green after each)

- [ ] **Belt data:** `BELTS`, `STOCK`, widths, flange defaults, part numbers (metric and inch codes).
- [ ] **Belt math:** `beltLength`, `solveCenter`, `analyze`, `minTeethForPair`, `integerOptions`.
- [ ] **Pulley geometry:** `grooveBottom`, `pulleyOutline`, `borePoly`, `pulleyParts`, holes, flange.
- [ ] **Belt geometry:** `toothHalf`, `beltTooth`, `beltOutline`, `beltStrip`, `layoutDoc`, `beltDoc`.
- [ ] **Chain data & math:** `CHAINS`, `chainCenter`, `chainLinksAt`, `minLinksFor`, `chainAnalyze`, `chainLoopExact`.
- [ ] **Sprocket geometry:** `sprocketOutline`, `sprocketCalc`, `sprocketParts`.
- [ ] **Chain drawings:** `chainZ`, plates, side/top views, `chainDxfDoc`, `chainLayoutDoc`.
- [ ] **Writers:** DXF R12 (`toDXF`), STEP AP214 (`stepFile`, `chainBodies`, `sprocketBodies`).
- [ ] **Checks & warnings:** every "can't be generated" rule and its suggested fix (min teeth, min links, min C2C, teeth ranges, views off) → one `problems()` function the page just displays.
- [ ] **Units:** mm/in formatting stays in JS (display only); the backend always works in mm.

## 4. API between page and backend

- [ ] Endpoints/functions: `/belt/c2c`, `/belt/length`, `/belt/pulley`, `/belt/dxf`, `/chain/c2c`, `/chain/length`, `/chain/sprocket`, `/chain/dxf`, `/chain/step`, `/problems`.
- [ ] Request = the current form state (same shape as today's saved-settings snapshot); response = numbers + geometry (polylines with bulges) + problems.
- [ ] Debounce typing (~120 ms), cancel stale requests, show the last good result while waiting.
- [ ] Downloads: backend returns the file text; the goo-to-downloads animation stays in JS.

## 5. `static/motion.js`: one standard animation library

Collect every animation into one module with the same timing tokens:

- [ ] **Tokens:** durations (`fast 180`, `base 320`, `slow 560`), easings (`ease-out`, `glide`, soft `spring`), stagger step. Same names as the CSS variables.
- [ ] **Text:** `rollTo`, `rollNumbers`, `rollPrep`, `swapT`, `resetNumbers`, count-up (`animateHero`).
- [ ] **Highlights:** `glide` (tabs, page underline, toggles, belt-type cards).
- [ ] **Panels:** `enterPanel`, tab leave/enter, page switch, `morphSnap` (type cross-fade).
- [ ] **Goo:** `gooFly` (fix buttons, downloads), `popAlert`, `flipAlerts`, `ripple`.
- [ ] **Drawings:** tween helpers, play/pause spring, ruler sweep, outline draw-in (`drawOn(svg, k)`).
- [ ] **One switch:** `motion.enabled` (header Animations toggle + `prefers-reduced-motion`) checked in one place, not in every function.
- [ ] Each function documented with what it animates and how long it takes; no inline `setTimeout` timing in page code.

## 6. `static/styles.css`: one standard stylesheet

- [ ] Move the `<style>` block out; keep `:root` tokens (colours, radius, shadows, spacing) at the top, with dark mode in one place.
- [ ] Group by component: header, tabs, cards, fields/steppers, chips, segmented controls, results/kv grid, notes, alerts, consent, menus, previews, footer.
- [ ] All `@keyframes` and motion rules in one section, using the timing tokens from step 5.
- [ ] Remove dead rules (e.g. old `.rcol`, unused keyframes) and duplicate selectors; one naming scheme (no clashes like the old `.step` button class).

## 7. Slim the page

- [ ] `index.html` keeps only markup + small glue: read form → call backend → render results/drawings → hand animations to `motion.js`.
- [ ] Settings storage (browser storage + cookies, consent window) moves to its own `static/storage.js`.
- [ ] Remove the old in-page math once the backend matches the golden files.

## 8. Check & ship

- [ ] Golden tests pass in CI (GitHub Actions); add a smoke test that loads the page and switches every tab with no console errors.
- [ ] Visual check of every animation at normal and slowed speed (same checks as before).
- [ ] Update `README.md` (how to run the backend, project layout).
- [ ] Deploy: GitHub Pages for the front end (+ Pyodide bundle, or the backend URL).
