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

/* Kept on this device between visits: the board's slow-changing feeds and its last scoreboard, so the next visit can
   draw right away while fresh copies download. Each keeps the time it was downloaded, which is what "Updated" shows. */
const KEEP = 'cfb-data-v1', KEEP_MAX = 12 * 60 * MIN, KEEP_EVERY = 2 * MIN;
const keepable = url => url === scoreboardUrl() || /\/standings\?|\/rankings$|\/powerindex\?|\/data\/markets\.json$/.test(url);
const keptAt = new Map();
export function keep(url, text){
  if (!keepable(url) || !self.caches || Date.now() - (keptAt.get(url) || 0) < KEEP_EVERY) return;
  keptAt.set(url, Date.now());
  caches.open(KEEP).then(c => c.put(url, new Response(text, { headers: { 'x-at': String(Date.now()) } }))).catch(() => {});
}
const restoring = new Map();
const listed = (async () => {
  try{
    const c = await caches.open(KEEP);
    for (const req of await c.keys()) restoring.set(req.url, (async () => {
      const r = await c.match(req), at = +r.headers.get('x-at');
      if (!(Date.now() - at < KEEP_MAX)) return c.delete(req);
      if (!cache.has(req.url)) cache.set(req.url, { data: await r.json(), at, kept: true });
    })().catch(() => {}));
  }catch{}
})();
/* The copy kept from an earlier visit, if there is one ({ data, at }), once it's been read back. */
export async function kept(url){ await listed; await restoring.get(url); const h = cache.get(url); return h?.kept ? h : null; }

/* Session cache: one entry per URL, shared in-flight promise so concurrent callers never double-fetch.
   priority: 'high' for what the first screen waits on, 'low' for what can fill in after.
   swr: hand back a kept copy from an earlier visit right away and refresh it in the background (fine for standings
   or rankings, never for scores). */
async function getJSON(url, ttl, { priority = 'auto', swr = false } = {}){
  await listed; await restoring.get(url);
  const hit = cache.get(url);
  if (hit && (hit.pending || Date.now() - hit.at < ttl)) return hit.pending || hit.data;
  const host = new URL(url, location.href).hostname;
  const pending = (takeEarly(url) || fetch(url, { priority, ...withTimeout() })).then(r => {
    if (!r.ok) throw new Error(`${host} returned ${r.status}`);
    return r.text();
  }, e => { throw e.name === 'TimeoutError' ? new Error(`${host} didn't answer within ${TIMEOUT / 1000}s`) : e; })
    .then(text => { keep(url, text); return JSON.parse(text); });
  cache.set(url, { pending, at: 0, data: hit?.data });
  const done = pending.then(data => { cache.set(url, { data, at: Date.now() }); return data; },
    e => { if (hit?.data){ cache.set(url, hit); return hit.data; } cache.delete(url); throw e; });
  if (swr && hit?.kept){ done.catch(() => {}); return hit.data; }
  return done;
}
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
export const standings = () => getJSON('https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80', 10 * MIN, { priority: 'low', swr: true });
export const rankings = () => getJSON(`${SITE}/rankings`, 30 * MIN, { priority: 'low', swr: true });
export const powerIndex = () => getJSON('https://site.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?limit=200', 60 * MIN, { priority: 'low', swr: true });
export const summaryUrl = id => `${SITE}/summary?event=${id}`;
export const summary = (id, live) => getJSON(summaryUrl(id), live ? 8e3 : 10 * MIN);
export const probabilities = (id, live) => getJSON(`${CORE}/events/${id}/competitions/${id}/probabilities?limit=1000`, live ? 8e3 : 10 * 60e3);
// Same-origin file refreshed by the GitHub Action; the query string sidesteps GitHub Pages' 10-minute cache.
export const threads = () => getJSON(`data/threads.json?t=${Math.floor(Date.now() / 120e3)}`, 2 * MIN);
export const lines = () => getJSON(`data/lines.json?t=${Math.floor(Date.now() / 300e3)}`, 5 * MIN);
// Closing point spreads, saved by the GitHub Action before each kickoff (ESPN drops them at the final).
export const ballots = () => getJSON(`data/ballots.json?t=${Math.floor(Date.now() / 600e3)}`, 10 * MIN);
export const spreads = () => getJSON(`data/spreads.json?t=${Math.floor(Date.now() / 600e3)}`, 10 * MIN);
export const news = team => getJSON(`${SITE}/news?limit=${team ? 12 : 30}${team ? `&team=${encodeURIComponent(team)}` : ''}`, 10 * MIN, { priority: 'low' });
// Every FBS team with its colors (for the game); changes about never, so it's kept for a day.
export const teamStats = id => getJSON(`${SITE}/teams/${id}/statistics`, 60 * MIN);
export const teams = () => getJSON(`${SITE}/teams?groups=80&limit=300`, 24 * 60 * MIN);
export const predictor = id => getJSON(`${CORE}/events/${id}/competitions/${id}/predictor`, 60 * MIN, { priority: 'low' });
