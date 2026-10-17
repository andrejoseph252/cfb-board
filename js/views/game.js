import { esc } from '../util.js';
import { state, invalidate } from '../state.js';
import * as api from '../api.js';
import { parseSummary, parseProbabilities } from '../models.js';
import { loadPredictions } from '../data.js';
import { realizedExcitement } from '../excitement.js';
import { useData } from '../resource.js';
import { teamLink, logo, panel, fmtDelay } from './components.js';
import { chartHTML } from './wpchart.js';
import { banner, theLine, lineChart, hype, tape, recentForm } from './preview.js';
import { threadsFor, searchUrl } from '../threads.js';
import { lineFor } from '../lines.js';
import { ats, atsWhy, fmtLine } from '../ats.js';
import { picks } from '../picks.js';
import { primaryMarket } from '../markets.js';
import { STAKES, grade, betOf, betHow, money, signed, fmtSpread } from '../bets.js';
import { syncOf, mark, nudge, stop, ERRORS } from '../sync.js';
import { challengeFor, knownFor, isClose } from '../challenges.js';

const liveIds = new Set();
export const isLive = id => liveIds.has(id) || state.byId[id]?.state === 'in';
const useDataFor = id => useData('game:' + id, () => api.summary(id, isLive(id)), parseSummary);

export function viewGame(id){
  const e = useDataFor(id);
  if (e.err && !e.data) return `<div class="err"><b>Couldn't load this game.</b> ${esc(e.err)}</div>`;
  if (!e.data) return '<div class="skeleton"></div><div class="skeleton tall"></div>';
  // Prefer the scoreboard's copy (has odds + conference flags) merged over the summary's. Synced to a stream, the
  // summary is cut back to the moment the board is showing.
  const board = state.byId[id], s = board ? cutToBoard(board, e.data) : e.data;
  const g = board ? { ...s.game, ...board, home: { ...s.game.home, ...board.home, lines: s.game.home.lines }, away: { ...s.game.away, ...board.away, lines: s.game.away.lines } } : s.game;
  if (!g.book && s.line) g.book = { pHome: null, details: s.line.details, ou: s.line.ou };
  g.state === 'in' ? liveIds.add(id) : liveIds.delete(id);

  // Matching a stream: the header goes without the score, clock and down until it's set, so nothing gets spoiled.
  const masked = g.syncing ? { ...g, detail: 'Live', sit: null, home: { ...g.home, score: '–' }, away: { ...g.away, score: '–' } } : g;
  let h = banner(masked, s) + threadLinks(g);
  if (g.state === 'in' || g.syncDelay != null || syncOf(g.id)) h += syncPanel(g);
  if (g.syncing) return h;
  if (g.state === 'pre'){
    loadPredictions([g]);
    h += theLine(g, s) + betPanel(g) + hype(g) + tape(g) + recentForm(g);
  } else {
    // Finished and live games only show the pregame line when it actually moved.
    const pregame = Math.abs(lineFor(g)?.move ?? 0) >= .03 ? lineChart(g) : '';
    if (s.synced) h += '<p class="note">Synced to your stream: team and player stats are hidden, since they would run ahead of it.</p>';
    h += atsNote(g, s) + betPanel(g) + lineScore(g) + wpPanel(g, s) + scoring(g, s) + (pregame ? panel('How the line moved', pregame) : '') + teamStats(g, s) + drives(g, s) + players(g, s);
  }
  return h;
}

/* ---------- stream sync (sync.js) ---------- */
/* A synced game's summary is cut to the moment your stream is at: plays and drives by when they happened, scoring
   by the shown quarter, clock and score, the win % chart to those plays, and the line score rebuilt from the shown
   score. The cumulative box score can't be wound back, so it's left out. */
const clockSecs = c => { const [m, x] = String(c || '0:00').split(':').map(Number); return (m || 0) * 60 + (x || 0); };
function cutToBoard(b, s){
  if (b.syncDelay == null || b.syncing || b.syncAt == null) return s;
  const R = b.syncAt, P = b.period, C = b.clock ?? 0, ha = Number(b.home.score), aa = Number(b.away.score);
  const byClock = p => (p.q < P || (p.q === P && clockSecs(p.clock) >= C)) && (p.home == null || p.home <= ha) && (p.away == null || p.away <= aa);
  const keep = p => p.w ? p.w <= R : byClock(p);
  const ids = new Set();
  const drives = s.drives.map(d => {
    const plays = d.plays.filter(keep); if (!plays.length) return null;
    plays.forEach(p => ids.add(String(p.id)));
    const open = plays.length < d.plays.length;
    return open ? { ...d, plays, result: 'In progress', isScore: false, desc: `${plays.length} play${plays.length === 1 ? '' : 's'} so far` } : d;
  }).filter(Boolean);
  const lines = side => {
    const before = (s.game[side].lines || []).slice(0, Math.min(P, 5) - 1).map(Number), sum = before.reduce((a, x) => a + (x || 0), 0);
    return [...before, Number(b[side].score) - sum];
  };
  return { ...s, drives, scoring: s.scoring.filter(byClock), wp: s.wp.filter(p => ids.has(String(p.pid))), keep: ids, teamStats: {}, players: {}, synced: true,
    game: { ...s.game, home: { ...s.game.home, lines: lines('home') }, away: { ...s.game.away, lines: lines('away') } } };
}

/* The sync panel. Steps: Mark (tap the instant you read your stream's clock), then enter what it said; while ESPN's
   play-by-play catches up to that moment it shows "Matching"; once set, a live readout of the clock your stream
   should be showing, to check against the TV, with early/late nudges. */
const ui = { open: null, step: 'mark', at: 0, q: 1, m: 0, s: 0, expanded: new Set() };   // synced panels start collapsed
const BETA = '<span class="beta" title="Still working out some kinks">Beta</span>';
const CHEV_SYNC = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_TV = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="12.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20.5h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 8v5.5l4.6-2.75z" fill="currentColor"/></svg>';
const ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.3l3 3 6-6.4" fill="none" stroke="var(--surface)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const atTime = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
function syncPanel(g){
  const sy = syncOf(g.id), id = esc(g.id), open = ui.open === g.id;
  const head = (title, sub = '') => `<div class="sp-head"><span class="sp-ico">${ICON_TV}</span><div><h3>${title} ${BETA}</h3>${sub ? `<p>${sub}</p>` : ''}</div>
    <button type="button" class="sp-x" data-syncclose aria-label="Close">×</button></div>`;
  // Synced: collapsed to one row (its ticking clock) unless opened; open, what your stream should be showing plus nudges.
  if (sy?.delay != null && !sy.pending && !open){
    const just = Date.now() - (sy.justSynced || 0) < 5000;
    if (!ui.expanded.has(g.id)) return `<section class="panel syncp synced mini${just ? ' just' : ''}" data-gid="${id}">
      <button type="button" class="sp-mini" data-synctoggle aria-expanded="false" aria-label="Stream sync: show controls">
        <span class="sp-ok">${ICON_OK}</span><span class="sm-t"><span class="sm-h">Synced ${BETA}</span><small>Stream ${fmtDelay(sy.delay)} behind${sy.error ? ' · re-sync failed' : ''}</small></span>
        <b class="sm-clk" data-sclk="${id}">${g.syncing ? '…' : esc(g.detail || '')}</b><span class="sm-chev">${CHEV_SYNC}</span></button></section>`;
    return `<section class="panel syncp synced${just ? ' just' : ''}" data-gid="${id}">
      <div class="sp-head"><span class="sp-ok">${ICON_OK}</span><div><h3>Synced to your stream ${BETA}</h3><p>Your stream is <b>${fmtDelay(sy.delay)}</b> behind live. This game is shown as you're seeing it.</p></div>
        <button type="button" class="sp-x sp-col" data-synctoggle aria-expanded="true" aria-label="Collapse">${CHEV_SYNC}</button></div>
      ${sy.error ? `<p class="sp-err" role="alert">Re-sync didn't work: ${esc(ERRORS[sy.error] || '')} Still using ${fmtDelay(sy.delay)}.</p>` : ''}
      <div class="sp-now"><span>Your stream should be at</span><b data-sclk="${id}">${g.syncing ? '…' : esc(g.detail || '')}</b><em>${esc(g.away.abbr)} ${esc(g.away.score)} – ${esc(g.home.abbr)} ${esc(g.home.score)}</em></div>
      <p class="sp-hint">Watch the clock above against your TV for a few seconds. If the board changes before your stream does, it's early.</p>
      <div class="sp-nudge"><button type="button" data-syncnudge="1"><b>Board's early</b><small>wait 1s more</small></button><button type="button" data-syncnudge="-1"><b>Board's late</b><small>1s less</small></button></div>
      <div class="sp-foot"><button type="button" class="chipbtn" data-syncopen>Re-sync</button><button type="button" class="chipbtn" data-syncstop>Stop syncing</button></div></section>`;
  }
  // Matching: waiting for ESPN's play-by-play to reach the marked moment.
  if (sy?.pending) return `<section class="panel syncp" data-gid="${id}">${head('Matching your stream…')}
    <div class="sp-wait"><span class="mspin" aria-hidden="true"></span><p>Finding when the clock read <b>Q${sy.pending.period} ${Math.floor(sy.pending.clock / 60)}:${String(sy.pending.clock % 60).padStart(2, '0')}</b> on the field. ESPN's play-by-play runs a little behind, so this can take up to a minute.</p></div>
    <div class="sp-foot"><button type="button" class="chipbtn" data-syncstop>Cancel</button></div></section>`;
  if (!open){
    const err = sy?.error ? `<p class="sp-err" role="alert">${esc(ERRORS[sy.error] || '')}</p>` : '';
    return `<div class="syncbar${err ? ' err' : ''}" data-gid="${id}"><span class="sp-ico">${ICON_TV}</span><span class="sb-t"><b>Watching on a delay?</b> ${BETA}<br>Sync this game to your stream.</span>
      <button type="button" class="sb-go" data-syncopen>${sy?.error ? 'Try again' : 'Sync'}</button>${err}</div>`;
  }
  // Step 1: mark.
  if (ui.step === 'mark') return `<section class="panel syncp" data-gid="${id}">${head('Sync to your stream', 'Two quick steps. Have the game on in front of you.')}
    <ol class="sp-steps"><li class="on"><b>1</b><span>Look at the game clock on your stream</span></li><li class="on"><b>2</b><span>Tap <strong>Mark</strong> the instant you read it</span></li><li><b>3</b><span>Enter the time you saw</span></li></ol>
    <button type="button" class="sp-mark" data-syncmark><span>Mark</span><small>tap as you read the clock</small></button>
    <p class="sp-hint">Best while the clock is running (not during a timeout or a break).</p></section>`;
  // Step 2: what did it say?
  const qs = [1, 2, 3, 4].map(q => `<button type="button" data-syncq="${q}" aria-pressed="${ui.q === q}">${q <= 4 ? 'Q' + q : 'OT'}</button>`).join('');
  return `<section class="panel syncp" data-gid="${id}">${head('What did the clock say?', `You marked at ${atTime(ui.at)}.`)}
    <div class="sp-enter"><div class="sp-q" role="group" aria-label="Quarter">${qs}</div>
      <div class="sp-clock"><input id="syncM" type="number" inputmode="numeric" min="0" max="15" value="${ui.m}" aria-label="Minutes"><b>:</b><input id="syncS" type="number" inputmode="numeric" min="0" max="59" value="${String(ui.s).padStart(2, '0')}" aria-label="Seconds"></div></div>
    <button type="button" class="sp-go" data-syncgo>Sync</button>
    <div class="sp-foot"><button type="button" class="chipbtn" data-syncremark>Mark again</button></div></section>`;
}
/* Mark is timed from the press itself (not the release), the closest thing to the moment they read the clock. The
   time box starts at the board's clock for the game: the live one, or your stream's if it's already synced. */
let pressAt = 0;
export const syncPress = () => { pressAt = Date.now(); };
function marked(gid){
  const g = state.byId[gid], c = g?.clock ?? 0, at = Date.now() - pressAt < 2000 ? pressAt : Date.now();
  Object.assign(ui, { open: gid, step: 'enter', at, q: Math.min(4, Math.max(1, g?.period || 1)), m: Math.floor(c / 60), s: c % 60 });
}
export function syncAction(d, gid){
  if ('syncopen' in d){ Object.assign(ui, { open: gid, step: 'mark' }); const sy = syncOf(gid); if (sy) sy.error = null; }
  else if ('syncremark' in d) ui.step = 'mark';
  else if ('syncclose' in d){ ui.open = null; const sy = syncOf(gid); if (sy?.error) sy.error = null; }
  else if ('syncstop' in d){ stop(gid); ui.open = null; }
  else if (d.syncnudge) nudge(gid, Number(d.syncnudge));
  else if (d.syncq) ui.q = Number(d.syncq);
  else if ('syncmark' in d) marked(gid);
  else if ('syncgo' in d){ mark(gid, ui.q, ui.m * 60 + ui.s, ui.at); ui.open = null; ui.expanded.add(gid); }   // open after syncing, for the confirmation
  else if ('synctoggle' in d) ui.expanded.has(gid) ? ui.expanded.delete(gid) : ui.expanded.add(gid);
}
export function syncInput(el){
  if (el.id === 'syncM') ui.m = Math.max(0, Math.min(15, Number(el.value) || 0));
  if (el.id === 'syncS') ui.s = Math.max(0, Math.min(59, Number(el.value) || 0));
}

/* Finished games: the closing line and who covered (ESPN's summary keeps the line even when the board's file doesn't). */
function atsNote(g, s){
  const a = ats(g, s.line); if (!a) return '';
  const D = g[a.dog], F = g[a.fav];
  const verdict = a.result === 'push' ? 'Push' : a.result === 'covered' ? `${F.name} covered` : `${D.name} covered`;
  return `<p class="ats-note${a.dogCover ? ' dog' : ''}"><b>Closing line ${esc(F.abbr)} ${fmtLine(a.line)}</b> · ${esc(verdict)} · ${esc(atsWhy(g, a))}</p>`;
}

/* Your pick and its bet. Before kickoff: the two sides are pick buttons, and once you've picked, the bet type and
   amount can be set until kickoff. After: what the bet won or lost. */
function betPanel(g){
  const pk = picks[g.id];
  if (g.state === 'pre' && state.byId[g.id]){
    const m = primaryMarket(g), sp = Number.isFinite(g.book?.spread) ? g.book.spread : null;
    const side = sd => {
      const mine = pk?.side === sd;
      const p = mine && pk.p != null ? pk.p : m ? (sd === 'home' ? m.pHome : 1 - m.pHome) : null;
      const line = sp == null ? null : sd === 'home' ? sp : -sp;
      return `<button type="button" class="bp-side${mine ? ' mine' : ''}" data-pick="${sd}" aria-pressed="${mine}">
        <span class="bp-team">${mine ? '✓ ' : ''}${esc(g[sd].abbr)}<small>${mine ? 'Your pick · tap to clear' : `Pick ${esc(g[sd].name)}`}</small></span>
        <span class="bp-row"><span>Moneyline</span><em>${p != null ? `${Math.round(p * 100)}¢` : '–'}</em></span>
        <span class="bp-row"><span>Spread</span><em>${line != null ? fmtSpread(line) : '–'}</em></span></button>`;
    };
    let bet = '<p class="note">Pick a side, then choose moneyline or spread and how much.</p>';
    if (pk){
      const b = grade(pk, g.id), { type, amt } = betOf(pk), custom = !STAKES.includes(amt);
      const seg = (v, l, off) => `<button type="button" data-bettype="${v}" aria-pressed="${type === v}"${off ? ' disabled title="No spread posted yet"' : ''}>${l}</button>`;
      bet = `<div class="bp-bet">
        <div class="betseg" role="group" aria-label="Bet type">${seg('ml', 'Moneyline')}${seg('ats', 'Spread', !Number.isFinite(pk.line))}</div>
        <div class="betseg" role="group" aria-label="Amount">${STAKES.map(v => `<button type="button" data-betamt="${v}" aria-pressed="${amt === v}">$${v}</button>`).join('')}
          <label class="stake-in${custom ? ' on' : ''}">$<input id="betAmt" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${custom ? amt : ''}" placeholder="Other" aria-label="Other amount"></label></div>
        <p class="bp-sum">${b.state === 'none' ? 'No price to bet the moneyline yet.' : `<b>${money(amt)}</b> on ${esc(betHow(pk, b))} wins <b class="pos">${money(b.toWin)}</b>`}</p></div>
        <p class="note">Your bet locks at kickoff.${type === 'ml' ? ' Moneyline pays at the price when you picked.' : ' Spread pays −110 against the line when you picked.'} Play money only.</p>`;
    }
    return `<section class="panel betp" data-gid="${esc(g.id)}"><h3>Your pick</h3><div class="bp-sides">${side('away')}${side('home')}</div>${bet}</section>`;
  }
  if (!pk) return '';
  const b = grade(pk, g.id);
  const v = b.state === 'none' ? `<b class="muted">No ${b.type === 'ml' ? 'price' : 'line'}</b>`
    : b.state === 'open' ? `<b>To win ${money(b.toWin)}</b>`
    : `<b class="${b.net > 0 ? 'pos' : b.net < 0 ? 'neg' : ''}">${b.result === 'P' ? 'Push, $0' : signed(b.net)}</b>`;
  const how = b.state === 'none' ? (b.type === 'ml' ? 'moneyline' : 'spread') : esc(betHow(pk, b)) + (b.type === 'ats' && b.state === 'settled' && b.result !== 'P' ? `, ${b.result === 'W' ? 'covered' : 'missed'} by ${String(b.by).replace(/\.0$/, '')}` : '');
  return `<section class="panel betp"><h3>Your pick: ${esc(pk.team)}</h3><div class="bp-done">
    <span class="bp-row"><span><em>${money(b.amt)}</em> on ${how}</span>${v}</span></div></section>`;
}

const PAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.3 2.1L13.5 14h-3l-1.2 1.6A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4zM7.5 10.5v3M6 12h3M15.5 11.5h.01M17.5 13.5h.01"/></svg>';
const REDDIT = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#FF4500"/><path fill="#fff" d="M16.7 10a1.5 1.5 0 0 0-2.5-1 7.2 7.2 0 0 0-3.8-1.2l.7-3 2.1.5a1 1 0 1 0 .1-.6l-2.4-.5a.3.3 0 0 0-.4.2l-.8 3.4a7.2 7.2 0 0 0-3.9 1.2 1.5 1.5 0 1 0-1.6 2.4 2.8 2.8 0 0 0 0 .5c0 2.2 2.6 4 5.8 4s5.8-1.8 5.8-4v-.5a1.5 1.5 0 0 0 .9-1.4zM6.7 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.6 2.7a3.7 3.7 0 0 1-2.3.7 3.7 3.7 0 0 1-2.3-.7.3.3 0 0 1 .4-.4 3.1 3.1 0 0 0 1.9.5 3.1 3.1 0 0 0 1.9-.5.3.3 0 1 1 .4.4zm-.1-1.7a1 1 0 1 1 1-1 1 1 0 0 1-1 1z"/></svg>';

/* r/CFB threads: game thread from about an hour before kickoff, postgame thread once it's final. */
function threadLinks(g){
  const list = useData('threads', api.threads, j => j.threads || []).data;
  const { game, post } = threadsFor(g, list);
  const soon = g.state === 'pre' && new Date(g.date) - Date.now() < 2 * 3600e3;
  const btn = (t, label) => `<a class="rbtn" href="${esc(t.url)}" target="_blank" rel="noopener">${REDDIT}<span>${label}</span></a>`;
  const find = (flair, label) => `<a class="rbtn ghost" href="${esc(searchUrl(g, flair))}" target="_blank" rel="noopener">${REDDIT}<span>${label}</span></a>`;
  // Matched threads link straight in; anything we couldn't match falls back to an r/CFB search for that matchup.
  const links = [
    game ? btn(game, 'Game thread') : (g.state !== 'pre' || soon) ? find('Game Thread', 'Find game thread') : '',
    post ? btn(post, 'Postgame thread') : g.state === 'post' ? find('Postgame Thread', 'Find postgame thread') : '',
    // Coach Andre's Bowl, the arcade game: take over the real late-game moment of a close final, or play the matchup.
    takeOver(g),
    `<button class="rbtn ghost" type="button" data-play="${esc(g.away.id)},${esc(g.home.id)}">${PAD}<span>Play this matchup</span></button>`
  ].filter(Boolean);
  return `<div class="rlinks">${links.join('')}</div>`;
}

/* A close final's real late-game moment, as a challenge in the arcade game (looked up once, then kept on the device). */
function takeOver(g){
  if (g.state !== 'post' || !isClose(g)) return '';
  const c = knownFor(g.id);
  if (c === undefined){ challengeFor(g).then(x => { if (x) invalidate('detail'); }); return ''; }
  return c ? `<button class="rbtn take" type="button" data-challenge="${esc(c.id)}" title="${esc(c.title)}">${PAD}<span>Play this moment</span></button>` : '';
}

const statTable = (g, rows) => `<table class="tbl compact vs"><thead><tr><th class="num">${esc(g.away.abbr)}</th><th></th><th class="num">${esc(g.home.abbr)}</th></tr></thead>
  <tbody>${rows.map(([k, a, h]) => `<tr><td class="num">${esc(a)}</td><td class="lbl">${esc(k)}</td><td class="num">${esc(h)}</td></tr>`).join('')}</tbody></table>`;

function lineScore(g){
  const n = Math.max(4, g.away.lines?.length || 0, g.home.lines?.length || 0);
  if (!g.away.lines?.length) return '';
  const q = i => i < 4 ? i + 1 : i === 4 ? 'OT' : `${i - 3}OT`;
  const row = t => `<tr><td>${teamLink({ ...t, rank: null }, { label: t.abbr })}</td>${Array.from({length: n}, (_, i) => `<td class="num">${esc(t.lines[i] ?? '')}</td>`).join('')}<td class="num strong">${esc(t.score)}</td></tr>`;
  return panel('', `<div class="tablewrap"><table class="tbl compact line"><thead><tr><th></th>${Array.from({length: n}, (_, i) => `<th class="num">${q(i)}</th>`).join('')}<th class="num">T</th></tr></thead>
    <tbody>${row(g.away)}${row(g.home)}</tbody></table></div>`);
}

function wpPanel(g, s){
  // Full per-play feed (win + cover + over/under); fall back to the summary's win-only series while it loads or if it fails.
  const all = useData('prob:' + g.id, () => api.probabilities(g.id, isLive(g.id)), parseProbabilities).data;
  const pr = all && s.keep ? all.filter(p => s.keep.has(String(p.pid))) : all;
  const pts = pr?.length >= 5 ? pr : s.wp;
  if (pts.length < 5) return '';
  const plays = new Map();
  for (const d of s.drives) for (const p of d.plays) if (p.id) plays.set(String(p.id), p);
  const chart = chartHTML(g, pts, plays, s.line);
  if (!chart) return '';
  const x = realizedExcitement(pts), live = g.state === 'in';
  return panel('Win probability', chart + `<div class="facts"><span>${live ? 'Excitement so far' : 'Excitement index'} <b>${x.index.toFixed(1)}</b> · ${x.label}</span>
    <span>Favorite flipped <b>${x.flips}</b> time${x.flips === 1 ? '' : 's'}</span></div>`);
}

function scoring(g, s){
  if (!s.scoring.length) return '';
  let q = 0;
  const items = s.scoring.map(p => {
    const hdr = p.q !== q ? `<li class="qhdr">${p.q <= 4 ? 'Quarter ' + p.q : 'Overtime'}</li>` : ''; q = p.q;
    const t = g[p.side];
    return hdr + `<li class="play">${logo(t?.logo, 'logo sm')}<span class="ptype">${esc(p.type || '')}</span><span class="ptext">${esc(p.text)}<span class="muted small"> ${esc(p.clock || '')}</span></span>
      <span class="pscore">${esc(p.away)}-${esc(p.home)}</span></li>`;
  }).join('');
  return panel('Scoring plays', `<ol class="plays">${items}</ol>`);
}

function teamStats(g, s){
  const a = s.teamStats.away || [], h = s.teamStats.home || [];
  if (!a.length && !h.length) return '';
  const hv = Object.fromEntries(h.map(x => [x.name, x.displayValue]));
  return panel('Team stats', statTable(g, a.map(x => [x.label, x.displayValue, hv[x.name] ?? '–'])));
}

function drives(g, s){
  if (!s.drives.length) return '';
  const items = s.drives.map((d, i) => [d, i]).reverse().map(([d, i]) => {
    const t = g[d.side];
    return `<li><details data-k="drive-${i}"><summary>${logo(t?.logo, 'logo sm')}<span class="dres ${d.isScore ? 'score' : ''}">${esc(d.result || '')}</span>
      <span class="ddesc">${esc(d.desc || '')}</span><span class="muted small">Q${esc(d.q ?? '')} ${esc(d.clock || '')}${d.start ? ' · from ' + esc(d.start) : ''}</span></summary>
      <ol class="dplays">${d.plays.map(p => `<li><span class="muted small">${esc(p.clock || '')}</span> ${esc(p.text)}</li>`).join('')}</ol></details></li>`;
  }).join('');
  return panel(`Drives (${s.drives.length})`, `<ol class="drives">${items}</ol><p class="note">Most recent first. Tap a drive to see every play.</p>`);
}

function players(g, s){
  if (!s.players.away && !s.players.home) return '';
  const cats = (s.players.away || s.players.home).map(c => c.name);
  const body = cats.map(name => {
    const tables = ['away', 'home'].map(side => {
      const c = s.players[side]?.find(x => x.name === name); if (!c || !c.rows.length) return '';
      return `<div class="tablewrap"><table class="tbl compact"><thead><tr><th>${esc(g[side].abbr)}</th>${c.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead>
        <tbody>${c.rows.map(r => `<tr><td>${esc(r.who)}</td>${r.stats.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }).join('');
    const title = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
    return `<details class="pcat" data-k="p-${esc(name)}"><summary>${esc(title)}</summary>${tables}</details>`;
  }).join('');
  return panel('Player stats', body);
}
