/* Last week in review: upsets (by closing price), ranked teams that lost, the most dramatic game (by win-probability
   swing), poll movers and your picks. Shown all week at the top of This week, below any live games. */
import * as api from './api.js';
import { state, invalidate, CONF } from './state.js';
import { parseEvent, parseProbabilities } from './models.js';
import { realizedExcitement } from './excitement.js';
import { picks, winnerSide } from './picks.js';
import { upset } from './upset.js';
import { pool } from './util.js';

/* The week to recap: this week once every game is final, otherwise the one before it on ESPN's calendar. */
export function recapWeek(){
  if (state.pickedWeek || !state.current || !state.games.length) return null;
  if (state.games.every(g => g.state === 'post')) return { st: state.st, week: state.week, current: true };
  const all = [];
  for (const s of state.cal) for (const e of s.entries || []) all.push({ st: String(s.value), week: String(e.value), label: e.label });
  const i = all.findIndex(x => `${x.st}-${x.week}` === state.current);
  const prev = i > 0 ? all[i - 1] : null;
  if (!prev || prev.st === '1') return null;
  return { ...prev, current: false };
}

/* Shown all week; it's one line until tapped. */
export const showRecap = () => !!recapWeek();

const games = new Map(), swings = new Map();
let loading = null;

function loadWeek(w){
  const k = `${w.st}-${w.week}`;
  if (w.current) return state.games;
  if (games.has(k)) return games.get(k);
  if (loading !== k){
    loading = k;
    api.scoreboard(w.week, w.st, 30 * 60e3).then(j => { games.set(k, (j.events || []).map(parseEvent)); invalidate('main'); }).catch(() => { loading = null; });
  }
  return null;
}

/* Only close finishes between FBS teams can be the game of the week; fetch the per-play feed for the eight tightest,
   ranked matchups first among equally close games. */
let swingsFor = '';
const fbs = g => CONF[g.home.conf] && CONF[g.away.conf];
function loadSwings(k, finals){
  if (swingsFor === k) return;
  swingsFor = k;
  const close = finals.filter(fbs).sort((a, b) => (margin(a) > 8) - (margin(b) > 8) || ranked(b) - ranked(a) || margin(a) - margin(b)).slice(0, 8);
  pool(close, 3, async g => {
    const pts = parseProbabilities(await api.probabilities(g.id, false));
    const x = realizedExcitement(pts);
    if (x) swings.set(g.id, { ...x, pts: pts.map(p => p.home) });
  }).then(() => invalidate('main'));
}

const margin = g => Math.abs(Number(g.home.score) - Number(g.away.score));
const ranked = g => (g.home.rank ? 1 : 0) + (g.away.rank ? 1 : 0);

export function recap(){
  const w = recapWeek(); if (!w) return null;
  const list = loadWeek(w);
  if (!list) return { w, loading: true };
  const finals = list.filter(g => g.state === 'post' && g.completed);
  if (!finals.length) return null;
  loadSwings(`${w.st}-${w.week}`, finals);

  // Upsets by the same rule as the final cards (js/upset.js), least likely winner first.
  const upsets = finals.map(g => { const u = upset(g); return u && { g, u, ws: u.side, ls: u.side === 'home' ? 'away' : 'home', p: u.p }; })
    .filter(Boolean)
    .sort((a, b) => (a.p ?? .5) - (b.p ?? .5) || (a.g[a.ls].rank || 99) - (b.g[b.ls].rank || 99));

  const fallen = finals.map(g => ({ g, ls: winnerSide(g) === 'home' ? 'away' : 'home' })).filter(x => x.g[x.ls].rank)
    .sort((a, b) => a.g[a.ls].rank - b.g[b.ls].rank);

  // Drama first, with a nudge toward games involving ranked teams.
  const worth = ([id, x]) => x.index + .4 * ranked(finals.find(g => g.id === id));
  // Skip the top upset here; it already has its own card.
  const best = [...swings.entries()].filter(([id]) => finals.some(g => g.id === id) && id !== upsets[0]?.g.id).sort((a, b) => worth(b) - worth(a))[0];
  const classic = best ? { g: finals.find(g => g.id === best[0]), ...best[1] } : null;

  // The poll counts as new if ESPN has published the one for the week after the recap week.
  const r = state.rankings, pollWeek = Number(/Week (\d+)/i.exec(r?.title || '')?.[1]);
  const fresh = r && (w.st !== '2' || pollWeek > Number(w.week));
  const moves = fresh ? r.ranks.filter(t => t.prev).map(t => ({ t, d: t.prev - t.rank })) : [];
  const poll = fresh ? {
    up: moves.filter(m => m.d > 0).sort((a, b) => b.d - a.d).slice(0, 3),
    down: moves.filter(m => m.d < 0).sort((a, b) => a.d - b.d).slice(0, 3),
    debut: r.ranks.filter(t => !t.prev)
  } : null;

  const mine = Object.entries(picks).filter(([, p]) => String(p.week) === String(w.week) && String(p.st) === String(w.st) && (p.result === 'W' || p.result === 'L'));
  const pk = mine.length ? { w: mine.filter(([, p]) => p.result === 'W').length, n: mine.length,
    exp: mine.reduce((s, [, p]) => s + (p.pClose ?? p.p ?? .5), 0) } : null;

  return { w, finals, upsets, fallen, classic, classicLoading: !classic && swings.size === 0, poll, pk };
}
