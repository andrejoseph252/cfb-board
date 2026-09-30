const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

const MIN = 60e3;
const cache = new Map();

/* Every request gives up after 10s, so one stalled request can't hold up the board (or every later refresh that
   would otherwise wait on it). */
export const TIMEOUT = 10e3;
export const withTimeout = () => AbortSignal.timeout ? { signal: AbortSignal.timeout(TIMEOUT) } : {};

/* Session cache: one entry per URL, shared in-flight promise so concurrent callers never double-fetch. */
async function getJSON(url, ttl){
  const hit = cache.get(url);
  if (hit && (hit.pending || Date.now() - hit.at < ttl)) return hit.pending || hit.data;
  const host = new URL(url, location.href).hostname;
  const pending = fetch(url, withTimeout()).then(r => {
    if (!r.ok) throw new Error(`${host} returned ${r.status}`);
    return r.json();
  }, e => { throw e.name === 'TimeoutError' ? new Error(`${host} didn't answer within ${TIMEOUT / 1000}s`) : e; });
  cache.set(url, { pending, at: 0, data: hit?.data });
  try{
    const data = await pending;
    cache.set(url, { data, at: Date.now() });
    return data;
  }catch(e){
    if (hit?.data) { cache.set(url, hit); return hit.data; }
    cache.delete(url); throw e;
  }
}
export const peek = url => cache.get(url)?.data;
/* When a URL's data was actually downloaded. A failed refresh hands back the previous copy, so this is how callers
   tell fresh data from a fallback. */
export const fetchedAt = url => cache.get(url)?.at || 0;

export function scoreboardUrl(week, st){
  const p = new URLSearchParams({groups:'80', limit:'400'});
  if (week){ p.set('week', week); p.set('seasontype', st); }
  return `${SITE}/scoreboard?${p}`;
}
export const scoreboard = (week, st, ttl = 20e3) => getJSON(scoreboardUrl(week, st), ttl);
export const scheduleUrl = (id, season) => `${SITE}/teams/${id}/schedule${season ? `?season=${season}` : ''}`;
export const teamSchedule = (id, season) => getJSON(scheduleUrl(id, season), 5 * MIN);
export const standings = () => getJSON('https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80', 10 * MIN);
export const rankings = () => getJSON(`${SITE}/rankings`, 30 * MIN);
export const powerIndex = () => getJSON('https://site.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?limit=200', 60 * MIN);
export const summaryUrl = id => `${SITE}/summary?event=${id}`;
export const summary = (id, live) => getJSON(summaryUrl(id), live ? 8e3 : 10 * MIN);
export const probabilities = (id, live) => getJSON(`${CORE}/events/${id}/competitions/${id}/probabilities?limit=1000`, live ? 8e3 : 10 * 60e3);
// Same-origin file refreshed by the GitHub Action; the query string sidesteps GitHub Pages' 10-minute cache.
export const threads = () => getJSON(`data/threads.json?t=${Math.floor(Date.now() / 120e3)}`, 2 * MIN);
export const lines = () => getJSON(`data/lines.json?t=${Math.floor(Date.now() / 300e3)}`, 5 * MIN);
export const news = team => getJSON(`${SITE}/news?limit=${team ? 12 : 30}${team ? `&team=${encodeURIComponent(team)}` : ''}`, 10 * MIN);
export const predictor = id => getJSON(`${CORE}/events/${id}/competitions/${id}/predictor`, 60 * MIN);
