/* Take over: real late-game moments from this week's close games, to replay in Coach Andre's Bowl.

   For each close final, the team that lost gets one challenge, taken from ESPN's per-play feed (every play carries
   its drive, the down, distance and spot at the snap, the score and the clock):
     - comeback: their last drive of the 4th, starting down 0 to 8 with 6 minutes or less left. Can you do it?
     - close it out: their last drive of the 4th, starting ahead by 1 to 8 with 6 minutes or less left. They let it
       slip; can you hold on?
   You win the challenge by winning the game from there. A final never changes, so each game's challenge (or that it
   has none) is remembered on the device and never fetched twice. */
import * as api from './api.js';
import { state } from './state.js';
import { parseEvent } from './models.js';
import { store } from './util.js';

const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';
const CLOSE = 8, LATE = 360, MAX_GAMES = 20;
const cache = store.get('challenges', {});   // game id -> challenge, or 0 for "none"
const byId = new Map(Object.values(cache).filter(Boolean).map(c => [c.id, c]));
const saveCache = () => store.set('challenges', cache);

export const challengeById = id => byId.get(id) || null;
export const isClose = g => g.state === 'post' && g.completed && Math.abs(Number(g.home.score) - Number(g.away.score)) <= CLOSE;
const team = t => ({ id: String(t.id), name: t.name, abbr: t.abbr, logo: t.logo, color: t.color, alt: t.alt });
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const spotText = (ytez, opp) => ytez === 50 ? 'midfield' : ytez > 50 ? `their own ${100 - ytez}` : `the ${opp} ${ytez}`;

async function playsOf(id){
  const base = `${CORE}/events/${id}/competitions/${id}/plays`;
  const head = await (await fetch(`${base}?limit=1`)).json(), n = head.count || 0, last = Math.max(1, Math.ceil(n / 60));
  const pages = await Promise.all([last - 1, last].filter(p => p >= 1).map(p => fetch(`${base}?limit=60&page=${p}`).then(r => r.json()).catch(() => ({ items: [] }))));
  return [...new Map(pages.flatMap(p => p.items || []).map(p => [p.id, p])).values()]
    .sort((a, b) => (Number(a.sequenceNumber) || 0) - (Number(b.sequenceNumber) || 0));
}

/* The moment for a finished game, or null. */
function findMoment(g, plays){
  const hs = Number(g.home.score), as = Number(g.away.score); if (hs === as) return null;
  const lose = hs < as ? 'home' : 'away', L = g[lose], W = g[lose === 'home' ? 'away' : 'home'];
  const teamOf = ref => /teams\/(\d+)/.exec(ref?.$ref || '')?.[1] ?? null;
  const driveOf = p => /drives\/(\d+)/.exec(p.drive?.$ref || '')?.[1] ?? null;
  let best = null, prev = null, lastDrive = null;
  for (const p of plays){
    const d = driveOf(p), start = p.start || {}, isNew = d && d !== lastDrive;
    if (isNew && start.down >= 1 && p.period?.number === 4 && String(teamOf(start.team)) === String(L.id) && !/kickoff|punt|extra point|end/i.test(p.type?.text || '')){
      const snap = /^\((\d+):(\d\d)\)/.exec(p.text || ''), clock = snap ? +snap[1] * 60 + +snap[2] : p.clock?.value;
      const before = prev || p, ls = Number(lose === 'home' ? before.homeScore : before.awayScore), ws = Number(lose === 'home' ? before.awayScore : before.homeScore);
      const diff = ls - ws, ytez = start.yardsToEndzone;
      if (clock != null && clock <= LATE && clock >= 20 && ytez > 0 && ytez < 100 && diff >= -CLOSE && diff <= CLOSE)
        best = { clock, diff, ytez, down: start.down, toGo: Math.min(start.distance || 10, ytez), ls, ws };
    }
    if (d && start.down >= 1) lastDrive = d;
    prev = p;
  }
  if (!best) return null;
  const kind = best.diff <= 0 ? 'comeback' : 'hold';
  const situation = best.diff < 0 ? `down ${-best.diff}` : best.diff === 0 ? 'tied' : `up ${best.diff}`;
  const title = kind === 'comeback'
    ? `${L.name} ${situation}, ${mmss(best.clock)} left, ball at ${spotText(best.ytez, W.abbr)}. Can you do it?`
    : `${L.name} ${situation} with ${mmss(best.clock)} left and the ball. They let it slip. Can you close it out?`;
  return {
    id: `${g.id}-${kind}`, gameId: String(g.id), kind, title, date: g.date,
    me: team(L), opp: team(W), score: [best.ls, best.ws], quarter: 4, clock: best.clock,
    x: 100 - best.ytez, down: Math.min(4, best.down || 1), toGo: best.toGo,
    real: `${L.name} lost ${Math.min(hs, as)}–${Math.max(hs, as)}`,
    tag: kind === 'comeback' ? (best.diff === 0 ? 'Win it' : 'Comeback') : 'Close it out'
  };
}

const pending = new Map();
/* The challenge for one game (a close final), from the device's cache or ESPN. */
export function challengeFor(g){
  const id = String(g.id);
  if (id in cache) return Promise.resolve(cache[id] || null);
  if (!isClose(g)) return Promise.resolve(null);
  if (pending.has(id)) return pending.get(id);
  const job = playsOf(id).then(plays => {
    const c = findMoment(g, plays);
    cache[id] = c || 0; if (c) byId.set(c.id, c); saveCache();
    return c;
  }).catch(() => null).finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}
/* Already known for this game (no fetch): the challenge, null for none, undefined if not looked up yet. */
export const knownFor = id => id in cache ? (cache[id] || null) : undefined;

/* This week's challenges, most dramatic first; early in the week (few finals yet) last week's fill in. */
export async function weekChallenges(){
  let games = state.games.filter(isClose);
  if (games.length < 3 && state.week && Number(state.week) > 1){
    try{ const j = await api.scoreboard(Number(state.week) - 1, state.st, 30 * 60e3); games = games.concat((j.events || []).map(parseEvent).filter(isClose)); }catch{}
  }
  games = games.sort((a, b) => Math.abs(a.home.score - a.away.score) - Math.abs(b.home.score - b.away.score)).slice(0, MAX_GAMES);
  const list = (await Promise.all(games.map(challengeFor))).filter(Boolean);
  // Most dramatic first: least time left, then the smallest margin.
  return list.sort((a, b) => a.clock - b.clock || Math.abs(a.score[0] - a.score[1]) - Math.abs(b.score[0] - b.score[1]));
}
