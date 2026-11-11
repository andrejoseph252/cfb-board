const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

const MIN = 60e3;
const cache = new Map();

/* Every request gives up after 10s, so one stalled request can't hold up the board (or every later refresh that
   would otherwise wait on it). */
export const TIMEOUT = 10e3;
export const withTimeout = () => AbortSignal.timeout ? { signal: AbortSignal.timeout(TIMEOUT) } : {};

/* Requests index.html started before any script loaded (the first screen's data), picked up here once. */
export function takeEarly(url){ const p = window.__early?.[url]; if (p) delete window.__early[url]; return p; }

/* Session cache: one entry per URL, shared in-flight promise so concurrent callers never double-fetch.
   priority: 'high' for what the first screen waits on, 'low' for what can fill in after.
   (What's kept between visits is kept by data.js and markets.js, as the small shapes the board uses, not here.) */
let busy = 0;
/* True when nothing the screen is waiting on is still downloading (requests marked 'low' fill in whenever). */
export const quiet = () => busy === 0;
async function getJSON(url, ttl, { priority = 'auto' } = {}){
  const hit = cache.get(url);
  if (hit && (hit.pending || Date.now() - hit.at < ttl)) return hit.pending || hit.data;
  const host = new URL(url, location.href).hostname;
  const pending = (takeEarly(url) || fetch(url, { priority, ...withTimeout() })).then(r => {
    if (!r.ok) throw new Error(`${host} returned ${r.status}`);
    return r.json();
  }, e => { throw e.name === 'TimeoutError' ? new Error(`${host} didn't answer within ${TIMEOUT / 1000}s`) : e; });
  cache.set(url, { pending, at: 0, data: hit?.data });
  if (priority !== 'low'){ busy++; const done = () => { busy--; }; pending.then(done, done); }
  return pending.then(data => { cache.set(url, { data, at: Date.now() }); return data; },
    e => { if (hit?.data){ cache.set(url, hit); return hit.data; } cache.delete(url); throw e; });
}
// Earlier versions kept ESPN's whole answers (5 MB) in the browser's Cache storage; that copy is no longer used.
try{ self.caches?.delete('cfb-data-v1').catch(() => {}); }catch{}
export const peek = url => cache.get(url)?.data;
/* Pull to refresh: mark every cached response stale so the next request for it goes to the network. The old copy
   stays as the fallback, so a refresh that fails still shows the last data. */
export function expireAll(){ for (const v of cache.values()) if (!v.pending) v.at = 0; }
/* When a URL's data was actually downloaded. A failed refresh hands back the previous copy, so this is how callers
   tell fresh data from a fallback. */
export const fetchedAt = url => cache.get(url)?.at || 0;

export function scoreboardUrl(week, st){
  const p = new URLSearchParams({groups:'80', limit:'400'});
  if (week){ p.set('week', week); p.set('seasontype', st); }
  return `${SITE}/scoreboard?${p}`;
}
export const scoreboard = (week, st, ttl = 20e3) => getJSON(scoreboardUrl(week, st), ttl, { priority: 'high' });
// This week's slate as the GitHub Action last saved it (scripts/slate.py); only for drawing a first visit early.
export const slate = () => getJSON(new URL('data/slate.json', location.href).href, 60 * MIN, { priority: 'high' });
export const scheduleUrl = (id, season) => `${SITE}/teams/${id}/schedule${season ? `?season=${season}` : ''}`;
export const teamSchedule = (id, season) => getJSON(scheduleUrl(id, season), 5 * MIN);
export const standings = () => getJSON('https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80', 10 * MIN, { priority: 'low' });
export const rankings = () => getJSON(`${SITE}/rankings`, 30 * MIN, { priority: 'low' });
export const powerIndex = () => getJSON('https://site.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?limit=200', 60 * MIN, { priority: 'low' });
export const summaryUrl = id => `${SITE}/summary?event=${id}`;
export const summary = (id, live) => getJSON(summaryUrl(id), live ? 8e3 : 10 * MIN);
export const probabilities = (id, live) => getJSON(`${CORE}/events/${id}/competitions/${id}/probabilities?limit=1000`, live ? 8e3 : 10 * 60e3);
// Same-origin file refreshed by the GitHub Action; the query string sidesteps GitHub Pages' 10-minute cache.
export const threads = () => getJSON(`data/threads.json?t=${Math.floor(Date.now() / 120e3)}`, 2 * MIN);
export const lines = () => getJSON(`data/lines.json?t=${Math.floor(Date.now() / 300e3)}`, 5 * MIN);
// Closing point spreads, saved by the GitHub Action before each kickoff (ESPN drops them at the final).
export const ballots = () => getJSON(`data/ballots.json?t=${Math.floor(Date.now() / 600e3)}`, 10 * MIN);
// Every committee ranking this season (scripts/cfp.py).
export const cfp = () => getJSON(`data/cfp.json?t=${Math.floor(Date.now() / 600e3)}`, 10 * MIN);
export const spreads = () => getJSON(`data/spreads.json?t=${Math.floor(Date.now() / 600e3)}`, 10 * MIN);
// Every team's colors, abbreviation and logo (scripts/teams.py); changes rarely.
export const teamColors = () => getJSON(new URL('data/teams.json', location.href).href, 24 * 60 * MIN);
// Each finished game's excitement index, worked out once by the GitHub Action from ESPN's per-play feed.
export const finals = () => getJSON(`data/excitement.json?t=${Math.floor(Date.now() / 600e3)}`, 10 * MIN);
export const news = team => getJSON(`${SITE}/news?limit=${team ? 12 : 30}${team ? `&team=${encodeURIComponent(team)}` : ''}`, 10 * MIN, { priority: 'low' });
// Every FBS team with its colors (for the game); changes about never, so it's kept for a day.
export const teamStats = id => getJSON(`${SITE}/teams/${id}/statistics`, 60 * MIN);
export const teams = () => getJSON(`${SITE}/teams?groups=80&limit=300`, 24 * 60 * MIN);
export const predictor = id => getJSON(`${CORE}/events/${id}/competitions/${id}/predictor`, 60 * MIN, { priority: 'low' });
