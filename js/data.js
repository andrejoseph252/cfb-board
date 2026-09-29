/* Loaders: fetch through api.js (cached), normalize, store on state, request a render. */
import * as api from './api.js';
import { parseEvent, parseStandings, parseFpi, parsePredictor, parseRankings } from './models.js';
import { state, invalidate } from './state.js';
import { loadMarkets } from './markets.js';
import { loadLines } from './lines.js';
import { pool } from './util.js';
import { resolvePicks, backfillPicks } from './picks.js';

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
  let j, err, fetchedAt = 0;
  try{
    const markets = loadMarkets(fresh).catch(() => {});   // runs alongside the scoreboard, not after it
    const wk = follow ? null : state.week, st = follow ? null : state.st;
    j = await api.scoreboard(wk, st, fresh ? 0 : 8e3);
    // If ESPN didn't answer, api.js hands back the last copy; "updated" must say when that copy is from.
    fetchedAt = api.fetchedAt(api.scoreboardUrl(wk, st));
    await markets;
  }catch(e){ err = e; }
  if (seq !== boardSeq) return;
  if (j){
    state.cal = j.leagues?.[0]?.calendar || state.cal;
    state.season = j.season?.year ?? state.season;
    if (follow){ state.week = String(j.week?.number); state.st = String(j.season?.type); state.current = `${state.st}-${state.week}`; }
    state.games = (j.events || []).map(parseEvent).sort((a, b) => new Date(a.date) - new Date(b.date));
    state.byId = Object.fromEntries(state.games.map(g => [g.id, g]));
    resolvePicks(state.games);
    state.updated = new Date(fetchedAt || Date.now()); state.err = null;
  } else state.err = err?.message || 'Could not load games';
  state.loading = false;
  // 'detail' too: an open game drawer refreshes on the same tick, so its box score matches the board's score.
  invalidate('main', 'header', 'detail');
  schedulePoll();
  loadPredictions(state.games);
  loadLines();
  backfillPicks();
  refreshStandings();
  refreshFpi();
  refreshRankings();
}

export const anyLive = () => state.games.some(g => g.state === 'in');

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
