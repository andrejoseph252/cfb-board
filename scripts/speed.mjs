/* Speed test: how fast the board and the game load, as one Speed Score (0-100) and each measure as % faster or
   slower than the saved baseline. About 4 minutes; needs Node 22+, Chrome and openssl.

     node scripts/speed.mjs            # measure and compare with scripts/speed-baseline.json
     node scripts/speed.mjs --save     # measure and make this the new baseline
     node scripts/speed.mjs --trace    # one first visit on slow 4G: every download, when it ran and its size
     node scripts/speed.mjs --trace=4g # the same on 4G
     node scripts/speed.mjs --root DIR # measure another checkout (e.g. a git worktree of an older version)

   It serves the site the way GitHub Pages does (HTTP/2, gzip, every file cached for 10 minutes) and loads it in a
   fresh headless Chrome on a throttled phone connection, 3 runs per measure, keeping the median. ESPN is the real
   ESPN, so its own speed varies a little from run to run.

   The measures (milliseconds from the moment the page is requested):
     first visit       game cards on screen, nothing cached (someone new), on slow 4G and on 4G
     return visit      game cards on screen, coming back after the browser's 10-minute cache has run out, slow 4G
     game opens        the game's menu ready, after visiting the board, slow 4G
     sounds ready      from pressing Start until the game's sounds can play, 4G

   Speed Score: each measure scores 100 at its "instant" target (the bar McMaster-Carr sets) and proportionally less
   above it (twice the target = 50); the score is their weighted average. */
import { spawn, execFileSync } from 'node:child_process';
import { createSecureServer } from 'node:http2';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg > 0 ? process.argv[rootArg + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'speed-baseline.json');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const RUNS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NET = {
  slow4g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: .75e6 / 8 },
  '4g': { latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 }
};
// [key, label, target ms, weight]
const MEASURES = [
  ['firstSlow', 'First visit, slow 4G', 1000, 3],
  ['first4g', 'First visit, 4G', 400, 3],
  ['returnSlow', 'Return visit, slow 4G', 300, 2],
  ['gameSlow', 'Game opens, slow 4G', 800, 1],
  ['sound4g', 'Sounds ready, 4G', 500, 1]
];

/* ---------- a GitHub Pages stand-in: HTTP/2 over TLS, gzip, max-age=600 ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const certDir = mkdtempSync(join(tmpdir(), 'cfb-speed-cert-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
  '-keyout', join(certDir, 'k.pem'), '-out', join(certDir, 'c.pem')], { stdio: 'ignore' });
const gz = new Map();
const server = createSecureServer({ key: readFileSync(join(certDir, 'k.pem')), cert: readFileSync(join(certDir, 'c.pem')), allowHTTP1: true }, (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'https://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()){ res.writeHead(404); return res.end(); }
  const type = TYPES[extname(file)] || 'application/octet-stream', head = { 'content-type': type, 'cache-control': 'max-age=600' };
  let body = readFileSync(file);
  if (/text|json|javascript|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')){
    if (!gz.has(file)) gz.set(file, gzipSync(body)); body = gz.get(file); head['content-encoding'] = 'gzip';
  }
  res.writeHead(200, head); res.end(body);
});
await new Promise(r => server.listen(0, r));
const ORIGIN = `https://localhost:${server.address().port}`;

/* ---------- Chrome ---------- */
async function session(fn){
  const profile = mkdtempSync(join(tmpdir(), 'cfb-speed-')), port = 9300 + Math.floor(Math.random() * 600);
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=420,900', `--user-agent=${UA}`, '--ignore-certificate-errors', `--unsafely-treat-insecure-origin-as-secure=${ORIGIN}`,
    '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 75 && !tabs?.length; i++){ try{ tabs = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); }catch{} await sleep(200); }
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let seq = 0; const wait = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)){ wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}) => new Promise(r => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const run = async f => (await send('Runtime.evaluate', { expression: `(${f})()`, awaitPromise: true, returnByValue: true, timeout: 120e3 })).result?.result?.value;
  try{
    await send('Network.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
    return await fn(send, run);
  } finally { ch.kill('SIGKILL'); await sleep(400); try{ rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); }catch{} }
}
/* When something first appears, from the navigation's start: a watcher installed before the page's own scripts
   notes the moment the element is inserted and takes the time at the next frame, when it's painted. (Polling from
   outside would add the delay of a busy page to every number.) */
const WATCH = `window.__seen = {}; const __want = { cards: '.game[data-id]', menu: '[data-pb="start"]' };
  new MutationObserver(() => { for (const [k, sel] of Object.entries(__want)) if (!__seen[k] && document.querySelector(sel)){
    __seen[k] = -1; requestAnimationFrame(() => setTimeout(() => { __seen[k] = Math.round(performance.now()); })); } })
    .observe(document, { subtree: true, childList: true });`;
const seenAt = (run, k) => run(`async () => { for (let i = 0; i < 1200; i++){ const v = window.__seen?.['${k}']; if (v > 0) return v; await new Promise(r => setTimeout(r, 25)); } return null; }`);
const cardsAt = run => seenAt(run, 'cards');
async function visit(send, run, url){
  await send('Page.navigate', { url });
  for (let i = 0; i < 200; i++){ if ((await run(`() => location.href`).catch(() => ''))?.startsWith(ORIGIN)) break; await sleep(25); }
}

async function boardRun(net){
  return session(async (send, run) => {
    await send('Network.emulateNetworkConditions', { offline: false, ...NET[net] });
    await visit(send, run, ORIGIN + '/');
    const first = await cardsAt(run);
    if (net !== 'slow4g') return { first };
    // Coming back later: by then the service worker has installed and fetched what it keeps (up to 30s here).
    await run(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      if (!navigator.serviceWorker) return;
      for (let i = 0; i < 300; i++){ if (self.caches && (await caches.keys()).length && (await (await caches.open('cfb-files-v1')).keys()).some(k => k.url.includes('/game/pixelbowl.js'))) return; await w(100); }
    });
    // Coming back after GitHub Pages' 10-minute cache has run out: the browser's HTTP cache can't answer.
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await visit(send, run, ORIGIN + '/?again');
    const ret = await cardsAt(run);
    await send('Network.setCacheDisabled', { cacheDisabled: false });
    // The game, opened from the board.
    await visit(send, run, ORIGIN + '/#play');
    const game = await seenAt(run, 'menu');
    return { first, ret, game };
  });
}
async function soundRun(){
  return session(async (send, run) => {
    await send('Network.emulateNetworkConditions', { offline: false, ...NET['4g'] });
    await visit(send, run, ORIGIN + '/#play');
    return run(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 1200 && !document.querySelector('[data-pb="start"]'); i++) await w(25);
      const m = await import('./js/game/sfx.js');
      if (!m.audioStatus) return null;   // an older build without the status (its sounds were synthesized)
      const t0 = performance.now(); document.querySelector('[data-pb="start"]').click();
      // Ready: the sounds a play needs can play (older builds only had "everything loaded").
      for (let i = 0; i < 3000; i++){ const s = m.audioStatus?.(); if (s && (s.ready ?? s.done)) return Math.round(performance.now() - t0); await w(20); }
      return null;
    });
  });
}

/* ---------- trace: what a first visit downloads, and when ---------- */
const traceArg = process.argv.find(a => a.startsWith('--trace'));
if (traceArg){
  const rows = await session(async (send, run) => {
    await send('Network.emulateNetworkConditions', { offline: false, ...NET[traceArg.split('=')[1] || 'slow4g'] });
    const sizes = new Map(); let seq2 = 0;
    await visit(send, run, ORIGIN + '/');
    const cards = await cardsAt(run);
    await sleep(1500);
    const list = await run(async () => performance.getEntriesByType('resource').map(r => ({ n: r.name.replace(location.origin + '/', '').replace(/^https:\/\//, '').replace('site.api.espn.com/apis/site/v2/sports/football/college-football', 'SITE').replace('sports.core.api.espn.com/v2/sports/football/leagues/college-football', 'CORE').slice(0, 110),
      s: Math.round(r.startTime), e: Math.round(r.responseEnd), kb: Math.round((r.transferSize || r.encodedBodySize) / 102.4) / 10 })));
    return { cards, list };
  });
  console.log(`cards at ${rows.cards}ms\n`);
  for (const r of rows.list.sort((a, b) => a.s - b.s)) console.log(`${String(r.s).padStart(5)}–${String(r.e).padEnd(5)} ${String(r.kb || '?').padStart(6)} KB  ${r.n}`);
  const before = rows.list.filter(r => r.s < rows.cards);
  console.log(`\nstarted before the cards appeared: ${before.length} files, ${Math.round(before.reduce((s, r) => s + (r.kb || 0), 0))} KB (ESPN's sizes show as ?)`);
  server.close(); rmSync(certDir, { recursive: true, force: true }); process.exit(0);
}

/* ---------- measure ---------- */
const median = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const got = { firstSlow: [], first4g: [], returnSlow: [], gameSlow: [], sound4g: [] };
for (let i = 0; i < RUNS; i++){
  process.stdout.write(`run ${i + 1}/${RUNS}… `);
  const s = await boardRun('slow4g'); got.firstSlow.push(s.first); got.returnSlow.push(s.ret); got.gameSlow.push(s.game);
  got.first4g.push((await boardRun('4g')).first);
  got.sound4g.push(await soundRun());
  console.log(MEASURES.map(([k]) => got[k].at(-1)).join(' / '));
}
server.close(); rmSync(certDir, { recursive: true, force: true });

const now = Object.fromEntries(MEASURES.map(([k]) => [k, median(got[k])]));
const scoreOf = m => { const parts = MEASURES.filter(([k]) => m[k] != null); const w = parts.reduce((s, x) => s + x[3], 0);
  return Math.round(parts.reduce((s, [k, , t, wt]) => s + wt * Math.min(100, 100 * t / m[k]), 0) / w); };
const base = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, 'utf8')) : null;
const fmt = ms => ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
const pct = (b, n) => b == null || n == null ? '' : n <= b ? `${Math.round((1 - n / b) * 100)}% faster` : `${Math.round((n / b - 1) * 100)}% slower`;

console.log(`\n${'Measure'.padEnd(24)}${'Now'.padStart(9)}${base ? 'Baseline'.padStart(11) + '   Change' : ''}`);
for (const [k, label, target] of MEASURES)
  console.log(`${label.padEnd(24)}${fmt(now[k]).padStart(9)}${base ? fmt(base.m[k]).padStart(11) + '   ' + pct(base.m[k], now[k]) : ''}   (target ${fmt(target)})`);
const sc = scoreOf(now);
console.log(`\nSpeed Score: ${sc}/100${base ? `  (baseline ${scoreOf(base.m)}, ${base.label})` : ''}`);
if (process.argv.includes('--save')){
  const label = `v${JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).version} on ${new Date().toISOString().slice(0, 10)}`;
  writeFileSync(BASE_FILE, JSON.stringify({ label, m: now }, null, 1) + '\n');
  console.log(`Saved as the baseline (${label}).`);
}
process.exit(0);
