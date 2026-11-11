/* Loaders: fetch through api.js (cached), normalize, store on state, request a render. */
import * as api from './api.js';
import { parseEvent, parseStandings, parseFpi, parsePredictor, parseRankings } from './models.js';
import { state, invalidate, invalidateSoon } from './state.js';
import { loadMarkets } from './markets.js';
import { loadLines } from './lines.js';
import { loadSpreads } from './ats.js';
import { loadFinalExcitement } from './excitement.js';
import { pool, store } from './util.js';
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
  loadFinalExcitement();
  backfillPicks();
  refreshStandings();
  refreshFpi();
  refreshRankings();
}

/* A visit's first load draws something before ESPN's scoreboard arrives, if it can:
   - the board as this device last had it (under 12 hours old; see "kept between visits" below), which is on screen
     from the very first frame; "Updated" shows when it's from, and the fresh scoreboard replaces it a moment later;
   - or, for someone new, the slate the GitHub Action saved (data/slate.json, a ninth of ESPN's size and from the
     site's own server), but only when nothing can have changed since: no game under way, no kickoff since it was
     saved, and the week not over (ESPN may have moved on to the next one). On a game day that's rarely true, and
     the board simply waits for ESPN.
   If it arrives after ESPN's scoreboard it's dropped. */
async function drawFirst(board, markets, seq){
  const late = board.then(() => null, () => null);
  const s = await Promise.race([api.slate().catch(() => null), late]);
  if (!s || !settled(s)) return;
  await Promise.race([markets, late]);
  if (raw || seq !== boardSeq) return;
  apply(s.sb, true, true); state.updated = new Date(Date.parse(s.at)); invalidate('main', 'header');
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
  if (follow && !kept) keepAs('board', { cal: state.cal, season: state.season, week: state.week, st: state.st, games: raw }, 60e3);
  showGames(kept);
}

/* ---------- kept between visits ----------
   The current week's board, the standings, FPI and rankings as this device last had them, saved as the small shapes
   the views use (about 200 KB in all, in localStorage). They're read back before the first frame, so a return
   visit opens on the board it left, complete, and the fresh copies replace them as they download. (Until v3.9 the
   whole of ESPN's answers were kept instead, 5 MB that had to be parsed again before anything could be drawn.) */
const KEEP_MAX = 12 * 3600e3, keptAt = {};
function keptOf(name){
  if (window.__demo) return null;   // the demo's games aren't this week's
  const k = store.get('kept.' + name, null);
  return k && Date.now() - k.at < KEEP_MAX ? k : null;
}
function keepAs(name, v, every = 0){
  if (window.__demo || Date.now() - (keptAt[name] || 0) < every) return;
  keptAt[name] = Date.now(); store.set('kept.' + name, { at: keptAt[name], v });
}
const byId = confs => Object.fromEntries(confs.flatMap(c => c.teams).map(t => [t.id, t]));
function restore(){
  const b = keptOf('board'), s = keptOf('standings'), f = keptOf('fpi'), r = keptOf('rankings');
  if (s) state.standings = { confs: s.v, byTeam: byId(s.v) };
  if (f) state.fpi = f.v;
  if (r) state.rankings = r.v;
  if (!b?.v?.games?.length) return;
  Object.assign(state, { cal: b.v.cal || [], season: b.v.season, week: b.v.week, st: b.v.st, current: `${b.v.st}-${b.v.week}`, updated: new Date(b.at) });
  raw = b.v.games;
  showGames(true);
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
  return api.standings().then(j => { if (j !== standingsRaw){ standingsRaw = j; state.standings = parseStandings(j); state.standingsErr = null; keepAs('standings', state.standings.confs); invalidateSoon(); } })
    .catch(e => { if (!state.standings){ state.standingsErr = e.message; invalidate(); } });
}
let rankingsRaw;
export function refreshRankings(){
  return api.rankings().then(j => { if (j !== rankingsRaw){ rankingsRaw = j; state.rankings = parseRankings(j); keepAs('rankings', state.rankings); invalidateSoon(); } }).catch(() => {});
}
export function refreshFpi(){
  return api.powerIndex().then(j => { if (j !== fpiRaw){ fpiRaw = j; state.fpi = parseFpi(j); state.fpiErr = null; keepAs('fpi', state.fpi); invalidateSoon(); } })
    .catch(e => { if (!state.fpi){ state.fpiErr = e.message; invalidate(); } });
}

/* ESPN predictor per game (FPI win prob + Matchup Quality). One small request each, fetched once per session.

   They decide each card's excitement score and which games are "Best games to watch", so how they arrive is what
   the top of the board looks like while it loads:
   - they're kept on this device (a week), so the next visit has them from its first frame; one older than three
     hours is fetched again and the old number shows until the new one is in;
   - a batch lands all at once, not a few games at a time (which reshuffled Best games four times on the way in),
     upcoming games first; anything still out after four seconds stops holding up the rest. */
const PRED_FRESH = 3 * 3600e3, PRED_KEEP = 7 * 864e5;
const keptPreds = store.get('preds', {});   // game id -> [saved (ms), pHome, mq, margin]
for (const [id, [at, pHome, mq, margin]] of Object.entries(keptPreds)){
  if (Date.now() - at < PRED_KEEP) state.preds.set(id, { pHome, mq, margin }); else delete keptPreds[id];
}
const requested = new Set();
/* True while an upcoming game on the board is still waiting for its first prediction. */
export const predsPending = () => state.games.some(g => g.state === 'pre' && !state.preds.has(g.id));
export async function loadPredictions(games){
  const need = games.filter(g => !requested.has(g.id) && !(Date.now() - (keptPreds[g.id]?.[0] || 0) < PRED_FRESH));
  if (!need.length) return;
  need.forEach(g => requested.add(g.id));
  const batch = async list => {
    if (!list.length) return;
    const got = new Map();
    const land = () => {
      if (!got.size) return;
      for (const [id, p] of got){
        // A failed refresh keeps the number from last time.
        if (p || !state.preds.get(id)) state.preds.set(id, p);
        if (p) keptPreds[id] = [Date.now(), p.pHome, p.mq, p.margin];
      }
      got.clear(); store.set('preds', keptPreds);
      invalidateSoon('main', 'detail');
    };
    const giveUp = setTimeout(land, 4000);
    await pool(list, 16, async g => {
      try{ got.set(g.id, parsePredictor(await api.predictor(g.id))); }
      catch{ got.set(g.id, null); }
    });
    clearTimeout(giveUp); land();
  };
  await batch(need.filter(g => g.state === 'pre'));
  await batch(need.filter(g => g.state !== 'pre'));
}

// Last visit's board, on screen before anything is downloaded.
try{ restore(); }catch(e){ console.error(e); }
