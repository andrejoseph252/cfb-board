/* Smoke test: loads the board in a real (headless) Chrome and checks the basics still work, so a broken build
   can't be committed by accident. About a minute; no dependencies beyond Node 22+, Chrome and Python.

     node scripts/smoke.mjs            # run it
     SKIP_SMOKE=1 git commit ...       # skip it once (the pre-commit hook honors this)

   Checks: the board renders games; every tab renders without an error; game cards open with their details; the
   news drawer opens; the game plays a Quick game to the final whistle; practice runs a session; My Playbook opens.
   Any uncaught error or console.error on the page fails the run. If ESPN can't be reached (offline), the checks
   that need its data are skipped with a warning instead of failing, since that isn't the code's fault. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const SERVE = 8600 + Math.floor(Math.random() * 300), CDP = 9600 + Math.floor(Math.random() * 300);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'cfb-smoke-'));
const kids = [];
const cleanup = () => { for (const k of kids) try{ k.kill('SIGKILL'); }catch{} try{ rmSync(profile, { recursive: true, force: true }); }catch{} };
const results = [];
const pass = (name, detail = '') => results.push({ ok: true, name, detail });
const fail = (name, detail = '') => results.push({ ok: false, name, detail });
const skip = (name, detail = '') => results.push({ ok: null, name, detail });

function finish(code){
  for (const r of results) console.log(`${r.ok === true ? '  ✓' : r.ok === false ? '  ✗' : '  –'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  const failed = results.filter(r => r.ok === false).length;
  console.log(failed ? `\nSmoke test FAILED: ${failed} check${failed === 1 ? '' : 's'}.` : '\nSmoke test passed.');
  cleanup(); process.exit(code ?? (failed ? 1 : 0));
}
setTimeout(() => { fail('finished in time', 'took over 4 minutes'); finish(1); }, 240e3);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

/* ---------- start the local server and Chrome ---------- */
kids.push(spawn('python3', [join(ROOT, 'scripts/serve.py'), String(SERVE)], { stdio: 'ignore' }));
kids.push(spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
  '--window-size=1200,800', `--user-agent=${UA}`, 'about:blank'], { stdio: 'ignore' }));

let tabs;
for (let i = 0; i < 75 && !tabs?.length; i++){ try{ tabs = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter(t => t.type === 'page'); }catch{} await sleep(200); }
for (let i = 0; i < 50; i++){ try{ if ((await fetch(`http://127.0.0.1:${SERVE}/`)).ok) break; }catch{} await sleep(200); }
if (!tabs?.length){ fail('start headless Chrome', CHROME); finish(1); }

const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const waiting = new Map(), pageErrors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)){ waiting.get(d.id)(d); waiting.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') pageErrors.push(d.params.exceptionDetails.exception?.description?.split('\n')[0] || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') pageErrors.push('console.error: ' + d.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async (fn, arg) => {
  const r = await send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true, timeout: 120e3 });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.split('\n')[0] || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
const load = async url => {
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++){ const v = await run(`() => location.href + '|' + document.readyState`).catch(() => ''); if (v?.startsWith('http') && v.endsWith('complete')) return; await sleep(150); }
};

/* ---------- the board ---------- */
// Background pages get no animation frames, and the board renders on them; keep this one in the foreground.
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await send('Page.bringToFront').catch(() => {});
await load(`http://127.0.0.1:${SERVE}/`);
const board = await run(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s);
  for (let i = 0; i < 150 && !$('.game[data-id]') && !$('.err'); i++) await w(200);
  return { games: document.querySelectorAll('.game[data-id]').length, err: $('.err')?.textContent.trim() || null, title: $('#wkTitle')?.textContent };
}).catch(e => ({ games: 0, err: e.message }));
const online = board.games > 0;
if (online) pass('board renders games', `${board.games} on ${board.title}`);
else if (/Couldn't load games|didn't answer|Failed to fetch|returned/i.test(board.err || '')) skip('board renders games', `ESPN unreachable: ${board.err}`);
else fail('board renders games', board.err || 'no game cards appeared');

if (online){
  const tabsOut = await run(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s), out = [];
    for (const b of [...document.querySelectorAll('#tabs [data-tab]')]){
      b.click(); await w(900);
      out.push({ tab: b.dataset.tab, broken: /Something went wrong/.test($('#view').textContent), empty: !$('#view').textContent.trim() });
    }
    document.querySelector('#tabs [data-tab="week"]').click(); await w(600);
    return out;
  });
  const bad = tabsOut.filter(t => t.broken || t.empty);
  bad.length ? fail('every tab renders', bad.map(t => t.tab + (t.broken ? ' shows an error' : ' is empty')).join(', ')) : pass('every tab renders', tabsOut.map(t => t.tab).join(', '));

  const cards = await run(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s), out = [];
    const all = () => [...document.querySelectorAll('.game[data-id]')];
    for (const k of [0, Math.floor(all().length / 2), all().length - 1]){
      const c = all()[k]; if (!c) continue;
      c.click();
      let i = 0; for (; i < 100 && !(!$('#drawer').hidden && $('#drawerBody .rlinks, #drawerBody .err')); i++) await w(150);
      out.push({ id: c.dataset.id, open: !$('#drawer').hidden, title: $('#drawerTitle').textContent, err: $('#drawerBody .err')?.textContent.trim() || null, play: !!$('#drawerBody [data-play]') });
      $('#drawerClose').click(); for (let j = 0; j < 20 && !$('#drawer').hidden; j++) await w(100);
    }
    return out;
  });
  const badCards = cards.filter(c => !c.open || c.err || !c.play);
  badCards.length ? fail('game cards open with details', badCards.map(c => `${c.id}: ${c.err || (c.open ? 'no details' : 'drawer did not open')}`).join('; '))
    : pass('game cards open with details', cards.map(c => c.title).join(' · '));

  const news = await run(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s);
    $('#newsBtn').click();
    // Wait for the news drawer itself (the drawer keeps the last view's contents until it re-renders).
    for (let i = 0; i < 100 && !($('#drawerTitle').textContent === 'News' && $('#drawerBody .news-item, #drawerBody .err')); i++) await w(150);
    const r = { items: document.querySelectorAll('#drawerBody .news-item').length, err: $('#drawerBody .err')?.textContent.trim() || null };
    $('#drawerClose').click(); await w(400); return r;
  });
  news.items ? pass('news drawer opens', `${news.items} stories`) : /Couldn't load news/.test(news.err || '') ? skip('news drawer opens', news.err) : fail('news drawer opens', news.err || 'no stories');
}

/* ---------- the game ---------- */
await load(`http://127.0.0.1:${SERVE}/#play`);
const game = await run(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s);
  const vis = s => { const b = $(s); return b && !b.hidden && b.offsetParent !== null ? b : null; };
  const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  for (let i = 0; i < 100 && !(window.__pb && $('[data-pb="start"]')); i++) await w(200);
  if (!window.__pb) return { err: 'the game did not open' };
  const P = window.__pb, out = {};
  // A Quick game, start to finish, pressing buttons and keys the way a player would.
  $('[data-pb="start"]').click();
  let steps = 0;
  while (steps++ < 30000 && !vis('[data-pb="rematch"]')){
    if (['modal', 'wait'].includes(P.phase)) await w(25); else if (steps % 40 === 0) await w(0);
    P.tick(.1);
    let clicked = false;
    for (const a of ['toss', 'drive', 'half', 'ot', 'otnext', 'pat', 'fg', 'goforit']){ const el = vis(`.pb-modal [data-pb="${a}"]`); if (el){ el.click(); clicked = true; break; } }
    if (clicked){ await w(20); continue; }
    if (P.phase === 'presnap' && !$('.pb-modal.on')) key(' ');
    else if (P.phase === 'kick'){ const K = P.G.kick; if (K.stage === 'aim' && Math.abs(K.aim - K.center) < .02 || K.stage === 'power' && K.power > .8) key(' '); }
    else if (P.phase === 'live' && !P.G.play.carrier && P.G.play.t > 1.4) key(String(1 + Math.floor(Math.random() * 5)));
  }
  out.final = vis('[data-pb="rematch"]') ? `final ${P.G.score.join('-')}${P.G.ot ? ` (${P.G.ot}OT)` : ''}, ${P.G.stats.plays} plays` : null;
  out.recorded = Object.values(JSON.parse(localStorage.getItem('cfbboard.pixelbowl') || '{}').results || {}).reduce((s, r) => s + r.w + r.l, 0);
  // Practice: a Quick session to its summary.
  $('[data-pb="menu"]').click(); await w(200); $('[data-pb="practice"]').click(); await w(200);
  $('[data-pb="pstart"]').click(); await w(200);
  for (let rep = 0; rep < 30 && P.phase !== 'modal'; rep++){ key(' '); P.tick(1.3); key('1'); P.tick(5); await w(10); }
  out.practice = $('.pb-sess') ? $('.pb-sess .pb-sg').textContent.replace(/\s+/g, ' ').trim() : null;
  // My Playbook opens and its designer renders.
  $('[data-pb="menu"]').click(); await w(200); $('[data-pb="playbook"]').click(); await w(200);
  $('[data-pb="pbnew"]').click(); await w(200);
  out.designer = document.querySelectorAll('.pb-rrow').length;
  return out;
}).catch(e => ({ err: e.message }));
if (game.err) fail('game opens', game.err);
else {
  game.final ? pass('game plays to the final', game.final) : fail('game plays to the final', 'never reached the final screen');
  game.recorded === 1 ? pass('a finished game counts once', '1 result saved') : fail('a finished game counts once', `${game.recorded} results saved`);
  game.practice ? pass('practice session completes', `grade ${game.practice}`) : fail('practice session completes', 'no summary');
  game.designer === 5 ? pass('My Playbook designer opens', '5 receiver rows') : fail('My Playbook designer opens', `${game.designer} receiver rows`);
}

/* ---------- page errors anywhere along the way ---------- */
const real = pageErrors.filter(e => !/net::ERR|Failed to load resource|favicon/i.test(e));
real.length ? fail('no page errors', [...new Set(real)].slice(0, 5).join(' | ')) : pass('no page errors');
finish();
