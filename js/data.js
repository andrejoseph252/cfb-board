/* Loaders: fetch through api.js (cached), normalize, store on state, request a render. */
import * as api from './api.js';
import { parseEvent, parseStandings, parseFpi, parsePredictor, parseRankings } from './models.js';
import { state, invalidate } from './state.js';
import { loadMarkets, loadKeptMarkets } from './markets.js';
import { loadLines } from './lines.js';
import { loadSpreads } from './ats.js';
import { pool } from './util.js';
import { resolvePicks, backfillPicks } from './picks.js';
import * as sync from './sync.js';
import * as live from './live.js';

/* Board refresh: every 12s while games are live (ESPN refreshes its data every 5-7s), every 5 minutes otherwise. */
export const LIVE_POLL = 12e3;
const IDLE_POLL = 5 * 60e3;

let boardSeq = 0;
export async function loadBoard({ silent = false, fresh = false } = {}){
  // Numbered so a slow response can't overwrite a newer one, e.g. a background refresh landing after you pick a week.
  const seq = ++boardSeq;
  if (!silent){ state.loading = true; invalidate('main', 'header'); }
  // Unless a week was picked from the menu, ask ESPN for "current" every time so an open tab rolls into the next week.
  const follow = !state.pickedWeek;
  const markets = loadMarkets(fresh).catch(() => {});   // runs alongside the scoreboard, not after it
  const wk = follow ? null : state.week, st = follow ? null : state.st;
  const board = api.scoreboard(wk, st, fresh ? 0 : 8e3);
  board.catch(() => {});
  if (!raw && follow) await drawFirst(board, markets, seq);
  let j, err, fetchedAt = 0;
  try{
    j = await board;
    // If ESPN didn't answer, api.js hands back the last copy; "updated" must say when that copy is from.
    fetchedAt = api.fetchedAt(api.scoreboardUrl(wk, st));
    await markets;
  }catch(e){ err = e; }
  if (seq !== boardSeq) return;
  if (j){
    apply(j, follow);
    state.updated = new Date(fetchedAt || Date.now()); state.err = null;
  } else state.err = err?.message || 'Could not load games';
  state.loading = false;
  // 'detail' too: an open game drawer refreshes on the same tick, so its box score matches the board's score.
  invalidate('main', 'header', 'detail');
  schedulePoll();
  loadPredictions(state.games);
  loadLines();
  loadSpreads();
  backfillPicks();
  refreshStandings();
  refreshFpi();
  refreshRankings();
}

/* A visit's first load draws something before ESPN's scoreboard arrives, if it can:
   - the slate kept on this device from the last visit (under 12 hours old), with its kept standings, FPI and
     rankings; "Updated" shows when it's from, and the fresh scoreboard replaces it a moment later;
   - or, for someone new, the slate the GitHub Action saved (data/slate.json, a ninth of ESPN's size and from the
     site's own server), but only when nothing can have changed since: no game under way, no kickoff since it was
     saved, and the week not over (ESPN may have moved on to the next one). On a game day that's rarely true, and
     the board simply waits for ESPN.
   Whichever of these arrives after ESPN's scoreboard is dropped. */
async function drawFirst(board, markets, seq){
  const late = board.then(() => null, () => null);
  const [k] = await Promise.all([api.kept(api.scoreboardUrl()), loadKeptMarkets()]);
  let first = k && { sb: k.data, at: k.at };
  if (!first){
    const s = await Promise.race([api.slate().catch(() => null), late]);
    if (s && settled(s)){ await Promise.race([markets, late]); first = { sb: s.sb, at: Date.parse(s.at) }; }
  }
  if (!first || raw || seq !== boardSeq) return;
  apply(first.sb, true, true); state.updated = new Date(first.at); invalidate('main', 'header');
  if (k){ refreshStandings(); refreshFpi(); refreshRankings(); }   // their kept copies, so the cards are complete
}
function settled(s){
  const now = Date.now(), ev = s.sb?.events || [], stateOf = e => e.competitions?.[0]?.status?.type?.state;
  return now - Date.parse(s.at) < 36 * 3600e3 && ev.some(e => stateOf(e) === 'pre')
    && ev.every(e => stateOf(e) === 'post' || stateOf(e) === 'pre' && Date.parse(e.date) > now);
}

function apply(j, follow, kept = false){
  state.cal = j.leagues?.[0]?.calendar || state.cal;
  state.season = j.season?.year ?? state.season;
  if (follow){ state.week = String(j.week?.number); state.st = String(j.season?.type); state.current = `${state.st}-${state.week}`; }
  raw = (j.events || []).map(parseEvent).sort((a, b) => new Date(a.date) - new Date(b.date));
  showGames(kept);
}

// From the newest data, so a delayed board still refreshes at the live pace.
export const anyLive = () => (raw || state.games).some(g => g.state === 'in');

/* The board as shown: the newest scoreboard, with any game synced to a stream swapped for its copy as of that
   stream (sync.js). Runs on every refresh and whenever a synced game reaches its next play. */
let raw = null;
let fromKept = false;
export function showGames(kept = false){
  if (!raw) return false;
  // Scores that changed since a kept copy aren't new plays: don't celebrate them as touchdowns.
  const prev = fromKept && !kept ? {} : state.byId;
  fromKept = kept;
  state.games = raw.map(sync.view);
  state.byId = Object.fromEntries(state.games.map(g => [g.id, g]));
  live.track(prev, state.games);
  resolvePicks(state.games);
  return true;
}
sync.onChange(() => { if (showGames()) invalidate('main', 'header', 'detail'); });

let timer;
function schedulePoll(){
  clearTimeout(timer);
  timer = setTimeout(() => { if (!document.hidden) loadBoard({ silent: true }); else schedulePoll(); }, anyLive() ? LIVE_POLL : IDLE_POLL);
}
// Coming back to the tab (or back online): refresh right away if the board is more than a poll behind.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.updated && Date.now() - state.updated > (anyLive() ? LIVE_POLL : 60e3)) loadBoard({ silent: true });
});
window.addEventListener('online', () => loadBoard({ silent: true }));

/* Called on every board load; api.js TTLs (10 min standings, 60 min FPI) decide whether anything is actually fetched. */
let standingsRaw, fpiRaw;
export function refreshStandings(){
  return api.standings().then(j => { if (j !== standingsRaw){ standingsRaw = j; state.standings = parseStandings(j); state.standingsErr = null; invalidate(); } })
    .catch(e => { if (!state.standings){ state.standingsErr = e.message; invalidate(); } });
}
let rankingsRaw;
export function refreshRankings(){
  return api.rankings().then(j => { if (j !== rankingsRaw){ rankingsRaw = j; state.rankings = parseRankings(j); invalidate(); } }).catch(() => {});
}
export function refreshFpi(){
  return api.powerIndex().then(j => { if (j !== fpiRaw){ fpiRaw = j; state.fpi = parseFpi(j); state.fpiErr = null; invalidate(); } })
    .catch(e => { if (!state.fpi){ state.fpiErr = e.message; invalidate(); } });
}

/* ESPN predictor per game (FPI win prob + Matchup Quality). One small request each, fetched once per session. */
let predBatch = 0;
const requested = new Set();
export async function loadPredictions(games){
  const need = games.filter(g => !requested.has(g.id));
  if (!need.length) return;
  need.forEach(g => requested.add(g.id));
  const batch = ++predBatch;
  let sinceRender = 0;
  await pool(need, 6, async g => {
    try{ state.preds.set(g.id, parsePredictor(await api.predictor(g.id))); }
    catch{ state.preds.set(g.id, null); }
    if (++sinceRender >= 15 && batch === predBatch){ sinceRender = 0; invalidate('main'); }
  });
  invalidate('main', 'detail');
}
