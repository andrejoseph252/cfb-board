/* Hype backtest: how well the pregame score (js/excitement.js) picked this season's big games. About 5 minutes;
   needs Node 22+, Chrome and Python, and the network (ESPN and Kalshi).

     node scripts/hype_backtest.mjs          # every finished regular-season week so far
     node scripts/hype_backtest.mjs --weeks 6-10
     node scripts/hype_backtest.mjs --dump rows.json   # also save every game's parts, to try other weights

   It replays each finished week through the board's own code: the scoreboard as ESPN has it (with each game's own
   result taken back out of the teams' records, so nothing is known that wasn't known at kickoff) and ESPN's pregame
   projection and Matchup Quality. Old market prices aren't kept anywhere, so the close-line part uses ESPN's projection
   (it agrees with the closing spreads at 0.92 rank correlation).

   "Big" is measured by attention: the money traded on each game on Kalshi, against a typical game on the same kind
   of day (a Tuesday game is the only one on, so it draws several times a Saturday game's betting). It's a proxy with
   its own quirks: late-night games and the only game in a slot draw extra betting.

   Reported: rank correlation with attention (1 = perfect order), each tier's attention, how many of each week's six
   most-bet games the score put in its top 6 and top 10, and the cutoffs that would keep the tiers' share of games.
   For reference, the formula before v3.9.1 scored 0.69, 53% and 70% on weeks 1-10 of 2026. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SERVE = 8700 + Math.floor(Math.random() * 200), CDP = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'cfb-hype-'));
const kids = [spawn('python3', [join(ROOT, 'scripts/serve.py'), String(SERVE)], { stdio: 'ignore' }),
  spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, `--user-agent=${UA}`, 'about:blank'], { stdio: 'ignore' })];
const done = code => { for (const k of kids) try{ k.kill('SIGKILL'); }catch{} try{ rmSync(profile, { recursive: true, force: true }); }catch{} process.exit(code); };
process.on('SIGINT', () => done(130));

/* ---------- Kalshi: money traded on every settled game ---------- */
const kalshi = [];
for (let cursor = '', i = 0; i < 40; i++){
  const r = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXNCAAFGAME&status=settled&limit=1000${cursor ? '&cursor=' + cursor : ''}`, { headers: { 'user-agent': 'cfb-board-backtest' } });
  if (!r.ok){ console.error('Kalshi returned', r.status); done(1); }
  const j = await r.json(); kalshi.push(...(j.markets || [])); cursor = j.cursor; if (!cursor) break;
}
const events = {};
for (const m of kalshi){ const e = events[m.event_ticker] ??= { teams: [], vol: 0, t: m.expected_expiration_time }; e.teams.push(m.yes_sub_title); e.vol += Number(m.volume_fp || 0); }
console.log(`Kalshi: ${Object.keys(events).length} settled games`);

/* ---------- the board, in Chrome ---------- */
let tabs; for (let i = 0; i < 75 && !tabs?.length; i++){ try{ tabs = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter(t => t.type === 'page'); }catch{} await sleep(200); }
for (let i = 0; i < 50; i++){ try{ if ((await fetch(`http://127.0.0.1:${SERVE}/`)).ok) break; }catch{} await sleep(200); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let seq = 0; const wait = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)){ wait.get(d.id)(d); wait.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async (f, a) => { const r = await send('Runtime.evaluate', { expression: `(${f})(${JSON.stringify(a)})`, awaitPromise: true, returnByValue: true, timeout: 600e3 });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: `http://127.0.0.1:${SERVE}/` });
await sleep(5000);

const cur = await run(async () => { const api = await import('./js/api.js'); const j = await api.scoreboard(); return { week: j.week?.number, st: j.season?.type }; });
const wArg = process.argv.indexOf('--weeks'), [w0, w1] = wArg > 0 ? process.argv[wArg + 1].split('-').map(Number) : [1, (cur.st === 2 ? cur.week : 16) - 1];
const rows = [];
for (let wk = w0; wk <= (w1 || w0); wk++){
  const r = await run(async ({ wk, events }) => {
    const api = await import('./js/api.js'), M = await import('./js/models.js'), X = await import('./js/excitement.js'), S = (await import('./js/state.js')).state;
    const { pool, parseRecord } = await import('./js/util.js'), { nameMatch } = await import('./js/markets.js');
    for (let i = 0; i < 100 && !(S.fpi && S.standings); i++) await new Promise(r => setTimeout(r, 100));
    const sb = await api.scoreboard(String(wk), '2', 1e9);
    const games = (sb.events || []).map(M.parseEvent).filter(g => g.state === 'post' && g.completed);
    // Records as they stood at kickoff: take this game's result back out.
    const undo = (rec, won) => { const r = parseRecord(rec); if (!r) return rec; won ? r.w-- : r.l--; return `${Math.max(0, r.w)}-${Math.max(0, r.l)}`; };
    for (const g of games) for (const [side, other] of [['home', 'away'], ['away', 'home']]){
      const won = Number(g[side].score) > Number(g[other].score);
      g[side].record = undo(g[side].record, won);
      if (g.confGame) g[side].confRecord = undo(g[side].confRecord, won);
    }
    await pool(games, 12, async g => { try{ S.preds.set(g.id, M.parsePredictor(await api.predictor(g.id))); }catch{ S.preds.set(g.id, null); } });
    S.version++;
    const finals = await (await fetch('data/excitement.json')).json().catch(() => ({ g: {} }));
    return games.map(g => {
      const x = X.excitement(g), kick = Date.parse(g.date);
      const ev = Object.values(events).filter(e => e.teams.length === 2 && Math.abs(Date.parse(e.t) - kick) < 1.5 * 864e5
        && ((nameMatch(e.teams[0], g.home) && nameMatch(e.teams[1], g.away)) || (nameMatch(e.teams[0], g.away) && nameMatch(e.teams[1], g.home))));
      const et = new Date(kick - 5 * 3600e3);
      return { wk, id: g.id, name: `${g.away.abbr} at ${g.home.abbr}`, score: x.score, sat: et.getUTCDay() === 6,
        vol: ev.length ? Math.max(...ev.map(e => e.vol)) : null, drama: finals.g?.[g.id]?.[0] ?? null,
        parts: Object.fromEntries(x.parts.map(q => [q.k, q.pts / q.max])) };
    });
  }, { wk, events }).catch(e => { console.error(`week ${wk}:`, e.message.split('\n')[0]); return []; });
  console.log(`week ${wk}: ${r.length} games`); rows.push(...r);
}

// --dump FILE: every game's parts (each 0-1), attention and drama, for trying other weights offline.
const dumpArg = process.argv.indexOf('--dump');
/* ---------- the report ---------- */
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; o.forEach(([, i], j) => { r[i] = j; }); return r; };
const corr = (x, y) => { const a = rank(x), b = rank(y), n = a.length, ma = (n - 1) / 2;
  let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++){ s += (a[i] - ma) * (b[i] - ma); sa += (a[i] - ma) ** 2; sb += (b[i] - ma) ** 2; } return s / Math.sqrt(sa * sb); };
const V = rows.filter(r => r.vol > 0);
for (const r of V) r.lv = Math.log10(r.vol);
const typical = { true: median(V.filter(r => r.sat).map(r => r.lv)), false: median(V.filter(r => !r.sat).map(r => r.lv)) };
for (const r of V) r.att = r.lv - typical[r.sat];

if (dumpArg > 0) (await import('node:fs')).writeFileSync(process.argv[dumpArg + 1], JSON.stringify(rows));
const { TIERS } = await run(async () => { const X = await import('./js/excitement.js'); return { TIERS: X.TIERS }; });
console.log(`\n${V.length} of ${rows.length} games had a Kalshi market.`);
console.log(`Rank correlation with attention: ${corr(V.map(r => r.score), V.map(r => r.att)).toFixed(2)}`);
const D = rows.filter(r => r.drama != null);
console.log(`(with how dramatic the game turned out: ${corr(D.map(r => r.score), D.map(r => r.drama)).toFixed(2)})\n`);
console.log('Tier             Share   Attention vs a typical game');
TIERS.forEach(([cut, label], i) => {
  const hi = i ? TIERS[i - 1][0] : 1e9, t = V.filter(r => r.score >= cut && r.score < hi), share = rows.filter(r => r.score >= cut && r.score < hi).length / rows.length;
  console.log(`${label.padEnd(16)} ${(Math.round(share * 100) + '%').padStart(5)}   ${t.length ? (10 ** median(t.map(r => r.att))).toFixed(1) + 'x' : '—'}`);
});
let h6 = 0, h10 = 0, n = 0; const missed = [];
for (const wk of [...new Set(V.map(r => r.wk))]){
  const w = V.filter(r => r.wk === wk), truth = [...w].sort((a, b) => b.att - a.att).slice(0, 6), byScore = [...w].sort((a, b) => b.score - a.score);
  const top6 = new Set(byScore.slice(0, 6).map(r => r.id)), top10 = new Set(byScore.slice(0, 10).map(r => r.id));
  for (const r of truth){ n++; if (top6.has(r.id)) h6++; if (top10.has(r.id)) h10++; else missed.push(`wk${wk} ${r.name}`); }
}
console.log(`\nEach week's 6 most-bet games: ${Math.round(h6 / n * 100)}% in the score's top 6, ${Math.round(h10 / n * 100)}% in its top 10.`);
console.log(`Left out of the top 10: ${missed.join(', ') || 'none'}`);
const sorted = rows.map(r => r.score).sort((a, b) => b - a), at = p => sorted[Math.floor(p * sorted.length)];
console.log(`\nCutoffs that would make the tiers the top 5% / next 13% / next 33%: ${at(.05)} / ${at(.18)} / ${at(.51)} (now ${TIERS.slice(0, 3).map(t => t[0]).join(' / ')})`);
done(0);
