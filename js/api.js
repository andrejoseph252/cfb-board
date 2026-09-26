const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

const MIN = 60e3;
const cache = new Map();

/* Session cache: one entry per URL, shared in-flight promise so concurrent callers never double-fetch. */
async function getJSON(url, ttl){
  const hit = cache.get(url);
  if (hit && (hit.pending || Date.now() - hit.at < ttl)) return hit.pending || hit.data;
  const pending = fetch(url).then(r => {
    if (!r.ok) throw new Error(`${new URL(url).hostname} returned ${r.status}`);
    return r.json();
  });
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

export function scoreboard(week, st, ttl = 20e3){
  const p = new URLSearchParams({groups:'80', limit:'400'});
  if (week){ p.set('week', week); p.set('seasontype', st); }
  return getJSON(`${SITE}/scoreboard?${p}`, ttl);
}
export const scheduleUrl = (id, season) => `${SITE}/teams/${id}/schedule${season ? `?season=${season}` : ''}`;
export const teamSchedule = (id, season) => getJSON(scheduleUrl(id, season), 5 * MIN);
export const standings = () => getJSON('https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80', 10 * MIN);
export const rankings = () => getJSON(`${SITE}/rankings`, 30 * MIN);
export const powerIndex = () => getJSON('https://site.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?limit=200', 60 * MIN);
export const summaryUrl = id => `${SITE}/summary?event=${id}`;
export const summary = (id, live) => getJSON(summaryUrl(id), live ? 25e3 : 10 * MIN);
export const predictor = id => getJSON(`${CORE}/events/${id}/competitions/${id}/predictor`, 60 * MIN);
