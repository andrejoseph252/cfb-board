/* Loaders: fetch through api.js (cached), normalize, store on state, request a render. */
import * as api from './api.js';
import { parseEvent, parseStandings, parseFpi, parsePredictor, parseRankings } from './models.js';
import { state, invalidate } from './state.js';
import { loadMarkets } from './markets.js';
import { pool } from './util.js';
import { resolvePicks, backfillPicks } from './picks.js';

export async function loadBoard({ silent = false, fresh = false } = {}){
  if (!silent){ state.loading = true; invalidate('main', 'header'); }
  try{
    // Unless a week was picked from the menu, ask ESPN for "current" every time so an open tab rolls into the next week.
    const follow = !state.pickedWeek;
    const j = await api.scoreboard(follow ? null : state.week, follow ? null : state.st, fresh ? 0 : 20e3);
    state.cal = j.leagues?.[0]?.calendar || state.cal;
    state.season = j.season?.year ?? state.season;
    if (follow){ state.week = String(j.week?.number); state.st = String(j.season?.type); state.current = `${state.st}-${state.week}`; }
    await loadMarkets(fresh);
    state.games = (j.events || []).map(parseEvent).sort((a, b) => new Date(a.date) - new Date(b.date));
    state.byId = Object.fromEntries(state.games.map(g => [g.id, g]));
    resolvePicks(state.games);
    state.updated = new Date(); state.err = null;
  }catch(e){ state.err = e.message || 'Could not load games'; }
  state.loading = false;
  invalidate('main', 'header');
  schedulePoll();
  loadPredictions(state.games);
  backfillPicks();
  refreshStandings();
  refreshFpi();
  refreshRankings();
}

let timer;
function schedulePoll(){
  clearTimeout(timer);
  const live = state.games.some(g => g.state === 'in');
  timer = setTimeout(() => { if (!document.hidden) loadBoard({ silent: true }); else schedulePoll(); }, live ? 30e3 : 5 * 60e3);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.updated && Date.now() - state.updated > 60e3) loadBoard({ silent: true });
});

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
