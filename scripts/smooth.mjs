/* Smoothness test: how steady the board is while it loads and while you use it, as one Smoothness Score (0-100).
   The speed test (speed.mjs) says how soon things appear; this one says whether they then stay put. About a minute;
   needs Node 22+ and Chrome.

     node scripts/smooth.mjs            # measure and compare with scripts/smooth-baseline.json
     node scripts/smooth.mjs --save     # measure and make this the new baseline
     node scripts/smooth.mjs --record   # record ESPN's answers afresh first (do this when the tape is days old)
     node scripts/smooth.mjs --film DIR # also save a filmstrip of the first and return visits (contact sheets) in DIR
     node scripts/smooth.mjs --why      # list what moved, which pictures were late, what was rebuilt
     node scripts/smooth.mjs --root DIR # measure another checkout (e.g. a git worktree of an older version)

   How: the site is served locally and opened in headless Chrome as a phone (390x844, a 4x slower processor, 4G).
   Everything from outside the site (ESPN's data and logos) is played back from a recording (.cache/smooth/tape.json)
   with a fixed delay, so two runs see exactly the same data and a change in the numbers is a change in the code.

   What it measures:
     movement        how much of the screen jumps, like Chrome's Cumulative Layout Shift, but also counting content
                     that is thrown away and rebuilt in a different place (which CLS can't see)
     late pictures   logos and photos that show up after the frame their place did (a visible pop-in)
     rebuilt pictures  pictures on screen that were thrown away and created again without changing (a flicker risk)
     redraws         how many times the main view changed while loading (first and return visit, and a refresh
                     that brings nothing new)
     settle          from the first game cards to the last jump, late picture or rebuilt picture (values that
                     change in place, like a fresh score, aren't unsettled; they count as redraws)
     response        from a tap to the next frame (tabs, opening a game or a team)
     blocked         time the page couldn't respond while loading (long tasks beyond 50 ms) */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const has = k => process.argv.includes(k);
const ROOT = arg('--root') || join(HERE, '..');
const BASE_FILE = join(HERE, 'smooth-baseline.json');
const TAPE_FILE = join(HERE, '..', '.cache', 'smooth', 'tape.json');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILM = arg('--film');
const RECORD = has('--record') || !existsSync(TAPE_FILE);
const API_DELAY = 220, IMG_DELAY = 90;   // playback delay for ESPN's data and for its pictures

/* ---------- the site, served like GitHub Pages (gzip, max-age=600) ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const gz = new Map();
const server = createServer((req, res) => {
  // A recorded picture (see the playback below): served like ESPN serves it, kept by the browser for most of a day.
  if (req.url.startsWith('/__tape?')){
    const hit = tape.entries['GET ' + decodeURIComponent(req.url.slice(8))];
    if (!hit){ res.writeHead(404); return res.end(); }
    return setTimeout(() => { res.writeHead(hit.s, { 'content-type': hit.h.find(h => /^content-type$/i.test(h.name))?.value || 'image/png', 'cache-control': 'max-age=60000',
      'access-control-allow-origin': '*', 'timing-allow-origin': '*' }); res.end(Buffer.from(hit.b, 'base64')); }, IMG_DELAY);
  }
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(normalize(ROOT)) || !existsSync(file) || statSync(file).isDirectory()){ res.writeHead(404); return res.end(); }
  const type = TYPES[extname(file)] || 'application/octet-stream', head = { 'content-type': type, 'cache-control': 'max-age=600' };
  let body = readFileSync(file);
  if (/text|json|javascript|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')){
    if (!gz.has(file)) gz.set(file, gzipSync(body)); body = gz.get(file); head['content-encoding'] = 'gzip';
  }
  res.writeHead(200, head); res.end(body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://localhost:${server.address().port}`;

/* ---------- the tape: everything from outside the site ---------- */
let tape = { at: Date.now(), entries: {} };
if (!RECORD){
  tape = JSON.parse(readFileSync(TAPE_FILE, 'utf8'));
  const days = (Date.now() - tape.at) / 864e5;
  if (days > 2) console.log(`(the tape is ${Math.round(days)} days old; --record makes a new one)`);
}
const misses = new Set();

/* ---------- the watcher, installed in the page before its own scripts ---------- */
const WATCH = `(() => {
  const S = window.__sm = { shifts: [], long: [], rewrites: [], updates: [], pics: [], moves: [], churn: [] };
  const now = () => performance.now();
  const VH = () => innerHeight, VW = () => innerWidth;
  const desc = n => { if (!n) return '?'; if (n.nodeType !== 1) n = n.parentElement; if (!n) return '?';
    return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''); };
  try{ new PerformanceObserver(l => { for (const e of l.getEntries()){ const src = (e.sources || []).slice(0, 3).map(s => desc(s.node)); if (!src.some(x => x.includes('tlab'))) S.shifts.push({ t: e.startTime, v: e.value, src }); } }).observe({ type: 'layout-shift', buffered: true }); }catch{}
  try{ new PerformanceObserver(l => { for (const e of l.getEntries()) S.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); }catch{}

  /* Where each recognisable block is, so a rebuild that moves things shows up even though every node is new. */
  const ROOTS = ['#view', '#drawerBody'];
  const BLOCKS = '.game, tr, .panel, .panel > *, h2, h3, li, section > *';
  const onScreen = r => r.bottom > 0 && r.top < VH() && r.right > 0 && r.left < VW() && r.width > 0 && r.height > 0;
  function snapshot(){
    const m = new Map(), seen = new Map();
    const add = (el, key, base) => { const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
      const n = seen.get(key) || 0; seen.set(key, n + 1); const dy = base ? base.top : 0, dx = base ? base.left : 0;
      m.set(key + '|' + n, { top: r.top - dy, bottom: r.bottom - dy, left: r.left - dx, right: r.right - dx, vt: r.top, vb: r.bottom, on: onScreen(r) }); };
    for (const sel of ['.hero', '.tabs', '#view']){ const el = document.querySelector(sel); if (el && !el.classList.contains('enter')) add(el, sel); }
    for (const rs of ROOTS){ const root = document.querySelector(rs); if (!root || !root.checkVisibility?.()) continue;
      // Measured from the container's own top, so a sheet sliding in or a view easing in isn't taken for a jump.
      const base = root.getBoundingClientRect();
      // Only what's on or near the screen (a branch that's far off isn't walked), four levels down.
      // (Not the first cards of a view that's easing in: they're mid-animation, not where they'll rest.)
      const easing = root.classList.contains('enter');
      const vh = VH(), walk = (el, depth) => { let i = 0; for (const c of el.children){
        if (easing && i++ < 8 && el.classList.contains('grid')) continue;
        const r = c.getBoundingClientRect(); if (r.bottom < -vh || r.top > 2 * vh || (!r.width && !r.height)) continue;
        const block = c.matches(BLOCKS);
        if (depth < 2 || block) add(c, rs + ' ' + desc(c) + ' ' + (c.dataset.id || c.dataset.k || '') + ' ' + (block ? (c.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) : ''), base);
        if (depth < 4) walk(c, depth + 1); } };
      walk(root, 0); }
    return m;
  }
  let prev = null, prevScroll = 0, prevDrawerScroll = 0;
  function compare(){
    const cur = snapshot(), sy = scrollY, dsy = document.querySelector('#drawerScroll')?.scrollTop || 0;
    // Before the stylesheet is in, nothing has been painted: positions then are of a page nobody saw.
    if (!document.querySelector('link[rel="stylesheet"]')?.sheet){ prev = null; return; }
    if (S.expect){ S.expect = false; prev = null; }
    if (prev && sy === prevScroll && dsy === prevDrawerScroll){
      const spans = []; let maxd = 0; const who = [];
      for (const [k, a] of prev){ const b = cur.get(k); if (!b || !(a.on || b.on)) continue;
        const d = Math.max(Math.abs(a.top - b.top), Math.abs(a.left - b.left)); if (d < 3) continue;
        maxd = Math.max(maxd, d); if (who.length < 4) who.push(k.slice(0, 70) + ' ' + Math.round(b.top - a.top) + 'px');
        for (const r of [a, b]){ const t = Math.max(0, r.vt), bt = Math.min(VH(), r.vb); if (bt > t) spans.push([t, bt]); } }
      if (spans.length){
        spans.sort((x, y) => x[0] - y[0]); let cov = 0, end = -1;
        for (const [t, b] of spans){ if (b <= end) continue; cov += b - Math.max(t, end); end = b; }
        S.moves.push({ t: now(), v: (cov / VH()) * Math.min(1, maxd / VH()), who });
      }
    }
    prev = cur; prevScroll = sy; prevDrawerScroll = dsy;
  }

  /* Pictures: late = not ready in the frame its place appeared; rebuilt = an identical picture removed and re-added. */
  // (A picture that fades in once it arrives is still late, so opacity isn't checked.)
  const visible = el => { const r = el.getBoundingClientRect(); return onScreen(r) && (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : true); };
  /* Chrome reports when each picture was first painted (element timing; the playback adds the header that lets it
     say so for ESPN's). Late: painted after the first frame that followed its arrival in the page. */
  const pend = new Map(), DOT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
  let mark = null;
  /* The yardstick: a 2px dot added in the same step as the pictures, which paints in the very next frame. A picture
     painted more than two frames after its dot arrived after its surroundings did. */
  function marker(){
    if (mark && mark.at == null && now() - mark.t < 50) return mark;
    const el = Object.assign(new Image(), { src: DOT, className: '__smref' });
    el.setAttribute('elementtiming', 'smref'); el.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;z-index:99999;pointer-events:none';
    mark = { t: now(), at: null, el }; pend.set(el, mark); document.documentElement.append(el);
    return mark;
  }
  function track(img, t){
    if (!img.getAttribute('src') || img.className === '__smref') return;
    img.setAttribute('elementtiming', 'sm');
    const rec = { t, ref: marker(), src: img.getAttribute('src'), cls: img.className, had: false }; pend.set(img, rec);
    // Already in hand when its place was drawn (a view that eases in paints its pictures "late" along with its text).
    requestAnimationFrame(() => setTimeout(() => { rec.had = img.complete && img.naturalWidth > 0; }));
  }
  try{ new PerformanceObserver(l => { for (const e of l.getEntries()){
    const rec = pend.get(e.element); if (!rec) continue; pend.delete(e.element);
    const at = e.renderTime || e.loadTime;
    if (e.identifier === 'smref'){ rec.at = at; rec.el.remove(); continue; }
    const r = e.intersectionRect;
    if (r && r.width > 0 && r.height > 0 && !rec.had) S.pics.push({ t: rec.t, at, ref: rec.ref, src: rec.src, cls: rec.cls });
  } }).observe({ type: 'element', buffered: true }); }catch{}
  const lateOf = p => p.ref.at != null && p.at > p.ref.at + 34 ? p.at - p.ref.at : 0;
  Object.defineProperty(S, 'imgs', { get: () => S.pics.filter(lateOf).map(p => ({ t: p.t, src: p.src, cls: p.cls, vis: true, late: p.at - p.t })) });
  const imgsIn = n => n.nodeType !== 1 ? [] : n.tagName === 'IMG' ? [n] : [...n.querySelectorAll('img')];
  let queued = false;
  new MutationObserver(recs => {
    const t = now(), gone = new Map(), came = [];
    if (!S.cards && document.querySelector('.game[data-id]')){ S.cards = -1; requestAnimationFrame(() => setTimeout(() => { S.cards = Math.round(now()); })); }
    let inView = false, inDrawer = false;
    for (const r of recs){
      if ([...r.addedNodes, ...r.removedNodes].some(n => n.className === '__smref')) continue;
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      // Not redraws: the view's own ease-in class, and a picture arriving (counted as a late picture if it shows).
      if (el && !(r.type === 'attributes' && (el.id === 'view' || el.localName === 'img'))){ if (el.closest('#view')) inView = true; else if (el.closest('#drawerBody')) inDrawer = true; }
      if (r.type !== 'childList') continue;
      if ((r.target.id === 'view' || r.target.id === 'drawerBody') && r.addedNodes.length) S.rewrites.push({ t, id: r.target.id });
      for (const n of r.removedNodes) for (const i of imgsIn(n)){ const k = i.getAttribute('src'); gone.set(k, (gone.get(k) || 0) + 1); }
      for (const n of r.addedNodes) for (const i of imgsIn(n)){ came.push(i); track(i, t); }
    }
    let churn = 0;
    if (gone.size) for (const i of came){ const k = i.getAttribute('src'), n = gone.get(k); if (n && visible(i)){ gone.set(k, n - 1); churn++; } }
    if (churn && !S.expect) S.churn.push({ t, n: churn, who: came.slice(0, 4).map(i => i.className + ' ' + (i.getAttribute('src') || '').replace(/^.*img=/, '').slice(0, 40) + ' in ' + desc(i.parentElement?.parentElement)).join(' ; ') });
    if (inView || inDrawer){
      const txt = n => (n?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
      const who = [...new Set(recs.filter(r => !(r.type === 'attributes' && r.target.localName === 'img')).map(r => { const e = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        return e?.closest('#view, #drawerBody') ? r.type[0] + ':' + desc(e) + (r.attributeName ? '@' + r.attributeName : r.type === 'characterData' ? ' "' + txt(r.target) + '"' : ' -"' + txt(r.removedNodes[0]) + '" +"' + txt(r.addedNodes[0]) + '"') : ''; }).filter(Boolean))].slice(0, 7).join(' | ');
      if (inView) S.updates.push({ t, id: 'view', who }); if (inDrawer) S.updates.push({ t, id: 'drawerBody', who });
    }
    // (Not while a tap's response is being timed: measuring every block's place would be charged to the tap.)
    if (!queued && !S.hold){ queued = true; queueMicrotask(() => { queued = false; compare(); }); }
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener('scroll', () => { prev = null; }, { passive: true, capture: true });
  S.resnap = () => { prev = snapshot(); prevScroll = scrollY; prevDrawerScroll = document.querySelector('#drawerScroll')?.scrollTop || 0; };

  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  S.frame = frame; S.wait = wait;
  /* Quiet: nothing visible has changed for ms (rebuilds, shifts, moves, pictures arriving). */
  S.lastChange = () => Math.max(0, ...S.updates.map(x => x.t), ...S.shifts.map(x => x.t), ...S.moves.map(x => x.t), ...S.imgs.map(x => x.t + (x.late || 0)));
  S.quiet = async (ms = 1500, max = 20000) => { const t0 = now(); while (now() - t0 < max){ if (now() - Math.max(S.lastChange(), t0) > ms ) return; await wait(100); } };
  /* Everything recorded since t. */
  S.since = t => ({
    cls: S.shifts.filter(x => x.t >= t).reduce((s, x) => s + x.v, 0), moved: S.moves.filter(x => x.t >= t).reduce((s, x) => s + x.v, 0),
    rewrites: S.rewrites.filter(x => x.t >= t && x.id === 'view').length, drawerRewrites: S.rewrites.filter(x => x.t >= t && x.id === 'drawerBody').length,
    updates: S.updates.filter(x => x.t >= t && x.id === 'view').length, drawerUpdates: S.updates.filter(x => x.t >= t && x.id === 'drawerBody').length,
    late: S.imgs.filter(x => x.t >= t && x.vis).length, lateAll: S.imgs.filter(x => x.t >= t).length,
    churn: S.churn.filter(x => x.t >= t).reduce((s, x) => s + x.n, 0),
    blocked: Math.round(S.long.filter(x => x.t >= t).reduce((s, x) => s + Math.max(0, x.d - 50), 0)),
    last: Math.round(Math.max(0, ...S.churn.filter(x => x.t >= t).map(x => x.t), ...S.shifts.filter(x => x.t >= t).map(x => x.t), ...S.moves.filter(x => x.t >= t).map(x => x.t), ...S.imgs.filter(x => x.t >= t && x.vis).map(x => x.t + (x.late || 0)))),
    why: { shifts: S.shifts.filter(x => x.t >= t && x.v > .001).map(x => Math.round(x.t) + 'ms ' + x.v.toFixed(3) + ' ' + x.src.join(', ')),
      moves: S.moves.filter(x => x.t >= t).map(x => Math.round(x.t) + 'ms ' + x.v.toFixed(3) + ' ' + x.who.join(' ; ')),
      rebuilt: S.churn.filter(x => x.t >= t).map(x => Math.round(x.t) + 'ms ' + x.n + ' ' + x.who),
      late: S.imgs.filter(x => x.t >= t && x.vis).map(x => Math.round(x.t) + 'ms +' + Math.round(x.late || -1) + ' ' + x.cls + ' ' + x.src.replace(/^.*img=/, '').slice(0, 60)),
      updates: S.updates.filter(x => x.t >= t).map(x => Math.round(x.t) + ' ' + x.id + ' [' + x.who + ']') }
  });
  /* A tap: run fn, time to the frame after the one that drew its result, then wait for quiet. */
  S.act = async (fn, ready) => {
    await S.quiet(600, 6000); S.resnap();
    S.expect = true; S.hold = true; const t0 = now(); await fn();
    for (let i = 0; i < 400 && ready && !ready(); i++) await frame();
    await frame(); await frame();
    const paint = Math.round(now() - t0);
    S.hold = false; compare();
    await S.quiet(1200, 12000);
    return { paint, ...S.since(t0), settle: Math.max(0, S.since(t0).last - t0 - paint) };
  };
})();`;

/* ---------- Chrome ---------- */
const profile = mkdtempSync(join(tmpdir(), 'cfb-smooth-')), port = 9300 + Math.floor(Math.random() * 600);
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=390,844', `--user-agent=${UA}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const done = code => { try{ ch.kill('SIGKILL'); }catch{} server.close(); try{ rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); }catch{} process.exit(code); };
process.on('SIGINT', () => done(130));
setTimeout(() => { console.log('Took over 6 minutes; giving up.'); done(1); }, 360e3);

let tabs; for (let i = 0; i < 75 && !tabs?.length; i++){ try{ tabs = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); }catch{} await sleep(200); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let seq = 0; const wait = new Map(), frames = [], pageErrors = [];
let filming = false;
const send = (method, params = {}) => new Promise(r => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = async m => {
  const d = JSON.parse(m.data);
  if (d.id && wait.has(d.id)){ wait.get(d.id)(d); wait.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') pageErrors.push(d.params.exceptionDetails.exception?.description?.split('\n')[0] || d.params.exceptionDetails.text);
  if (process.env.DEBUG && d.method === 'Runtime.consoleAPICalled') console.log('console:', d.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (d.method === 'Page.screencastFrame'){
    if (filming) frames.push({ data: d.params.data, t: d.params.metadata.timestamp });
    send('Page.screencastFrameAck', { sessionId: d.params.sessionId });
  }
  if (d.method === 'Fetch.requestPaused'){
    const p = d.params, url = p.request.url, key = p.request.method + ' ' + url;
    if (RECORD){
      // Response stage: keep a copy, then let it through.
      if (p.responseStatusCode && ![301, 302, 303, 307, 308].includes(p.responseStatusCode) && p.request.method === 'GET'){
        const b = await send('Fetch.getResponseBody', { requestId: p.requestId });
        if (b.result?.body != null) tape.entries[key] = { s: p.responseStatusCode, h: (p.responseHeaders || []).filter(h => !/^(content-encoding|content-length|transfer-encoding)$/i.test(h.name)), b: b.result.base64Encoded ? b.result.body : Buffer.from(b.result.body).toString('base64') };
      }
      return send('Fetch.continueRequest', { requestId: p.requestId });
    }
    const hit = tape.entries[key];
    // Pictures come from this script's own server instead of being answered here: Chrome won't reuse an answer
    // injected this way from memory the first time, as it does a real one, and every logo would look late once.
    if (p.resourceType === 'Image' && hit) return send('Fetch.continueRequest', { requestId: p.requestId, url: `${ORIGIN}/__tape?${encodeURIComponent(url)}` });
    await sleep(p.resourceType === 'Image' ? IMG_DELAY : API_DELAY);
    if (!hit){ misses.add(url); return send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }); }
    return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: hit.s, responseHeaders: hit.h, body: hit.b });
  }
};
const run = async (f, a) => {
  const r = await send('Runtime.evaluate', { expression: `(${f})(${JSON.stringify(a ?? null)})`, awaitPromise: true, returnByValue: true, timeout: 120e3 });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.split('\n')[0] || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
// LIVE=1 (with PROBE): the real network, nothing intercepted or slowed, for checking the playback against real life.
if (!process.env.LIVE) await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: RECORD ? 'Response' : 'Request' }] });
if (!RECORD && !process.env.LIVE){
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
}

async function profileEnd(){
  const { nodes, timeDeltas, samples } = (await send('Profiler.stop')).result.profile, self = new Map(), by = new Map(nodes.map(n => [n.id, n]));
  samples.forEach((id, i) => { const f = by.get(id).callFrame, k = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + timeDeltas[i] / 1000); });
  console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([k, v]) => `${Math.round(v).toString().padStart(6)}ms  ${k}`).join('\n'));
}
async function visit(url){
  await send('Page.navigate', { url });
  for (let i = 0; i < 200; i++){ if ((await run(`() => location.href`).catch(() => ''))?.startsWith(ORIGIN) && await run(`() => !!window.__sm`).catch(() => false)) break; await sleep(25); }
}
async function film(name, fn){
  if (!FILM) return fn();
  frames.length = 0; filming = true;
  await send('Page.startScreencast', { format: 'jpeg', quality: 55, everyNthFrame: 1 });
  const out = await fn();
  await send('Page.stopScreencast'); filming = false;
  mkdirSync(FILM, { recursive: true });
  // A contact sheet of the frames that differ from the one before, with each one's time since the first.
  const uniq = frames.filter((f, i) => !i || f.data !== frames[i - 1].data), t0 = uniq[0]?.t || 0;
  const pick = uniq.length <= 28 ? uniq : uniq.filter((_, i) => i < 20 || i % Math.ceil((uniq.length - 20) / 8) === 0).slice(0, 28);
  const html = `<body style="margin:0;background:#333;font:12px monospace;color:#fff;display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:6px">${pick.map(f =>
    `<figure style="margin:0"><img src="data:image/jpeg;base64,${f.data}" style="width:100%;display:block"><figcaption>${Math.round((f.t - t0) * 1000)}ms</figcaption></figure>`).join('')}</body>`;
  const file = join(FILM, name + '.html'); writeFileSync(file, html);
  try{ execFileSync(CHROME, ['--headless=new', '--disable-gpu', `--screenshot=${join(FILM, name + '.png')}`, '--window-size=1500,' + (Math.ceil(pick.length / 7) * 480 + 12), '--hide-scrollbars', 'file://' + file], { stdio: 'ignore', timeout: 30e3 }); }catch{}
  return out;
}

/* A page load: when the cards came, then everything until it goes quiet. */
const loadStats = want => run(async want => {
  const S = window.__sm;
  let cards = null;
  for (let i = 0; i < 1200 && !(S.cards > 0); i++) await S.wait(25);
  if (want) for (let i = 0; i < 200 && !document.querySelector(want); i++) await S.wait(100);
  cards = S.cards;
  await S.quiet(2000, 25000);
  const s = S.since(0);
  return { cards, ...s, settle: Math.max(0, s.last - cards) };
}, want);

/* ---------- the visit ---------- */
const R = {};
try{
  if (process.env.PROFILE === 'load'){ await send('Profiler.enable'); await send('Profiler.start'); }   // PROFILE=load: script time during the first visit
  await visit(ORIGIN + '/');
  R.first = await film('first', () => loadStats());
  if (process.env.PROFILE === 'load'){ await profileEnd(); done(0); }

  // For digging into something: PROBE='async () => ...' runs in the page after the first load, prints, and stops.
  if (process.env.PROBE){
    if (process.env.PROFILE){ await send('Profiler.enable'); await send('Profiler.start'); }
    console.log(JSON.stringify(await run(process.env.PROBE), null, 1));
    if (process.env.PROFILE) await profileEnd();   // PROFILE=1: where the script time went during the probe
    done(0);
  }

  // A flick down the board and back: logos further down shouldn't pop in.
  R.scroll = await run(async () => {
    const S = window.__sm, t0 = performance.now();
    for (let i = 0; i < 10; i++){ scrollBy(0, innerHeight * .9); await S.wait(160); }
    await S.wait(600);
    const s = S.since(t0); scrollTo(0, 0); await S.wait(300);
    return s;
  });

  // Each tab, then back to the week.
  R.tabs = {};
  for (const k of ['conf', 'rankings', 'team', 'picks', 'week'])
    R.tabs[k] = await run(k => window.__sm.act(() => document.querySelector(`#btabs [data-tab="${k}"]`).click()), k);

  // Open a finished game, an upcoming one and a team; close each.
  const ids = await run(() => { const gs = window.__live.state.games, pre = gs.find(g => g.state === 'pre'), post = gs.find(g => g.state === 'post');
    return { pre: pre?.id, post: post?.id, team: (pre || post)?.home.id }; });
  R.open = {};
  for (const [k, hash] of [['pre', ids.pre && '#game/' + ids.pre], ['post', ids.post && '#game/' + ids.post], ['team', ids.team && '#team/' + ids.team]]){
    if (!hash) continue;
    R.open[k] = await run(hash => window.__sm.act(() => { location.hash = hash; }, () => document.querySelector('#drawerBody')?.children.length && !document.querySelector('#drawer').hidden), hash);
    await run(async () => { document.querySelector('#drawerClose').click(); await window.__sm.wait(500); });
  }

  // A refresh that brings nothing new should leave the screen alone.
  R.idle = await run(async () => {
    const S = window.__sm; await S.quiet(800, 6000); S.resnap();
    const t0 = performance.now(), m = await import('./js/data.js');
    await m.loadBoard({ silent: true, fresh: true }); await S.wait(1500);
    return S.since(t0);
  });

  // Coming back: the slate kept from this visit is drawn first, then replaced by the fresh one.
  await sleep(4500);   // let the service worker install, as it would have long before a real return
  await visit(ORIGIN + '/?again');
  R.ret = await film('return', () => loadStats());

  // Game day: the demo page, with six games in progress, and two refreshes.
  // Game day starts clean: nothing kept from the visits above (older builds counted a slate kept seconds ago as fresh).
  await run(async () => { await caches.delete('cfb-data-v1'); for (const k of Object.keys(localStorage)) if (/cfbboard\.(kept|snap)/.test(k)) localStorage.removeItem(k); });
  await visit(ORIGIN + '/demo.html');
  R.live = await film('live', () => loadStats('.game.is-live'));
  if (process.env.DEBUG) console.log('live:', await run(() => ({ live: window.__live.state.games.filter(g => g.state === 'in').length, n: window.__live.state.games.length, sub: document.querySelector('#wkSub').textContent, err: window.__live.state.err })), [...misses]);
  R.liveIdle = await run(async () => {
    const S = window.__sm; await S.quiet(800, 6000); S.resnap();
    const t0 = performance.now(), m = await import('./js/data.js');
    for (let i = 0; i < 2; i++){ await m.loadBoard({ silent: true, fresh: true }); await S.wait(1200); }
    return S.since(t0);
  });
}catch(e){ console.error('The run failed:', e.message); done(1); }

if (RECORD){
  mkdirSync(dirname(TAPE_FILE), { recursive: true });
  writeFileSync(TAPE_FILE, JSON.stringify(tape));
  console.log(`Recorded ${Object.keys(tape.entries).length} responses to ${TAPE_FILE}. Run again to measure against it.`);
  done(0);
}

/* ---------- the score ---------- */
const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const sum = (o, f) => Object.values(o).reduce((s, x) => s + f(x), 0);
const mv = s => s.cls + s.moved;
const now = {
  moveFirst: mv(R.first), moveReturn: mv(R.ret), moveLive: mv(R.live),
  moveUse: sum(R.tabs, mv) + sum(R.open, mv) + mv(R.idle) + mv(R.liveIdle),
  late: R.first.late + R.ret.late + R.live.late + R.scroll.late + sum(R.tabs, x => x.late) + sum(R.open, x => x.late),
  churn: R.first.churn + R.ret.churn + R.live.churn + R.idle.churn + R.liveIdle.churn + sum(R.tabs, x => x.churn) + sum(R.open, x => x.churn),
  updates: R.first.updates + R.ret.updates + R.idle.updates,
  settle: med([R.first.settle, R.ret.settle]),
  tab: med(Object.values(R.tabs).map(x => x.paint)), open: med(Object.values(R.open).map(x => x.paint)),
  blocked: R.first.blocked
};
// [key, label, kind, target or half-point, weight, format]. 'ratio': 100 at the target, half at twice it.
// 'count': 100 at zero, 50 at the half-point.
const MEASURES = [
  ['moveFirst', 'Movement, first visit', 'ratio', .02, 3], ['moveReturn', 'Movement, return visit', 'ratio', .02, 3],
  ['moveLive', 'Movement, game day', 'ratio', .02, 2], ['moveUse', 'Movement, in use', 'ratio', .03, 3],
  ['late', 'Late pictures', 'count', 6, 3], ['churn', 'Rebuilt pictures', 'count', 12, 3],
  ['updates', 'Redraws while loading', 'ratio', 5, 1], ['settle', 'Settle after cards', 'ratio', 400, 2],
  ['tab', 'Tab response', 'ratio', 120, 2], ['open', 'Open response', 'ratio', 120, 2], ['blocked', 'Blocked while loading', 'ratio', 200, 1]
];
const part = (kind, t, v) => kind === 'count' ? 100 / (1 + v / t) : Math.min(100, 100 * t / Math.max(v, 1e-9));
const scoreOf = m => { const ps = MEASURES.filter(([k]) => m[k] != null), w = ps.reduce((s, x) => s + x[4], 0);
  return Math.round(ps.reduce((s, [k, , kind, t, wt]) => s + wt * part(kind, t, m[k]), 0) / w); };
const fmt = (k, v) => v == null ? '—' : k.startsWith('move') ? v.toFixed(3) : ['settle', 'tab', 'open', 'blocked'].includes(k) ? `${Math.round(v)}ms` : String(v);
const base = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, 'utf8')) : null;

console.log(`\n${'Measure'.padEnd(26)}${'Now'.padStart(9)}${base ? 'Baseline'.padStart(11) : ''}${'Points'.padStart(9)}   Ideal`);
for (const [k, label, kind, t] of MEASURES)
  console.log(`${label.padEnd(26)}${fmt(k, now[k]).padStart(9)}${base ? fmt(k, base.m[k]).padStart(11) : ''}${String(Math.round(part(kind, t, now[k]))).padStart(9)}   ${kind === 'count' ? '0' : '≤ ' + fmt(k, t)}`);
const sc = scoreOf(now);
console.log(`\nSmoothness Score: ${sc}/100${base ? `  (baseline ${scoreOf(base.m)}, ${base.label})` : ''}`);
console.log(`cards: first ${R.first.cards}ms, return ${R.ret.cards}ms, game day ${R.live.cards}ms · tabs ${Object.entries(R.tabs).map(([k, x]) => `${k} ${x.paint}`).join(', ')} · open ${Object.entries(R.open).map(([k, x]) => `${k} ${x.paint}`).join(', ')}`);
if (misses.size) console.log(`(${misses.size} requests weren't on the tape, e.g. ${[...misses][0].slice(0, 100)}; --record to refresh it)`);
if (pageErrors.length) console.log(`Page errors: ${[...new Set(pageErrors)].slice(0, 5).join(' | ')}`);
if (has('--why')){
  const show = (name, s) => { if (!s) return; console.log(`\n== ${name}: cls ${s.cls.toFixed(3)} moved ${s.moved.toFixed(3)} late ${s.late} (${s.lateAll} incl. off screen) rebuilt pics ${s.churn} redraws ${s.updates}/${s.drawerUpdates} blocked ${s.blocked}ms${s.paint != null ? ` paint ${s.paint}ms` : ''}${s.settle != null ? ` settle ${s.settle}ms` : ''}`);
    for (const [k, v] of Object.entries(s.why)) if (v.length) console.log(`  ${k}: ${Array.isArray(v) ? '\n    ' + v.slice(0, 14).join('\n    ') : v}`); };
  show('first visit', R.first); show('scroll', R.scroll);
  for (const [k, s] of Object.entries(R.tabs)) show('tab ' + k, s);
  for (const [k, s] of Object.entries(R.open)) show('open ' + k, s);
  show('idle refresh', R.idle); show('return visit', R.ret); show('game day', R.live); show('game day refreshes', R.liveIdle);
}
if (has('--save')){
  const label = `v${JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).version} on ${new Date().toISOString().slice(0, 10)}`;
  writeFileSync(BASE_FILE, JSON.stringify({ label, m: now }, null, 1) + '\n');
  console.log(`Saved as the baseline (${label}).`);
}
done(0);
