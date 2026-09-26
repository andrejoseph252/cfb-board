import { esc, norm } from '../util.js';
import { state } from '../state.js';
import { pins } from '../picks.js';
import { excitement } from '../excitement.js';
import { grid, sec, empty, chips } from './components.js';

const ranked = g => g.home.rank || g.away.rank;
const bestRank = g => Math.min(g.home.rank || 99, g.away.rank || 99);

export function viewWeek(){
  const gs = state.games;
  const live = gs.filter(g => g.state === 'in' && (ranked(g) || pins.has(g.id))).sort((a, b) => bestRank(a) - bestRank(b));
  const pinned = gs.filter(g => pins.has(g.id));
  const must = gs.filter(g => g.state === 'pre' && !excitement(g).pending)
    .map(g => [g, excitement(g).score]).filter(([, s]) => s >= 65).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g);
  let h = '';
  if (live.length) h += sec('Live now', live.length) + '<p class="note">Top 25 and pinned games in progress. Scores refresh every 30 seconds.</p>' + grid(live);
  if (must.length) h += sec('Best games to watch', must.length) + grid(must);
  h += sec('Pinned', pinned.length);
  h += pinned.length ? grid(pinned) : empty('Tap the pin on any game to keep it here and in the live strip.');
  h += sec('Games', null) + `<div class="filters"><input class="search" id="q" type="search" placeholder="Search all teams" value="${esc(state.q)}" aria-label="Search games by team">
    ${chips(TIERS.map(([k, l, f]) => [k, `${l} ${gs.filter(f).length}`]), state.tier, 'tier')}
    ${chips([['time', 'By time'], ['xc', 'Most exciting']], state.sort || 'time', 'sort')}</div><div id="list">${weekList()}</div>`;
  return h;
}

/* Notre Dame (87) plays with the Power 4 in everything but name. */
const P4 = new Set([1, 4, 5, 8]);
const isP4 = t => P4.has(t.conf) || t.id === '87';
const TIERS = [['p4', 'Power 4', g => isP4(g.home) || isP4(g.away) || ranked(g)], ['ranked', 'Ranked', ranked], ['all', 'All', () => true]];

function kickoffWindow(g){
  if (g.tbd) return 'Time TBD';
  const d = new Date(g.date), m = d.getHours() * 60 + d.getMinutes();
  return m < 14 * 60 ? 'Early' : m < 18 * 60 ? 'Afternoon' : m < 21 * 60 + 30 ? 'Prime time' : 'Late night';
}

export function weekList(){
  const q = norm(state.q);
  const tier = (TIERS.find(([k]) => k === state.tier) || TIERS[0])[2];
  // A search looks across every game so a filter never hides the team you asked for.
  const gs = state.games.filter(g => q ? [g.home.full, g.away.full, g.home.abbr, g.away.abbr].some(s => norm(s).includes(q)) : tier(g));
  if (!gs.length) return empty(q ? 'No games match that team name.' : 'No games in this group this week.');
  if (state.sort === 'xc'){
    const score = g => g.state === 'post' ? -1 : excitement(g).score;
    return grid([...gs].sort((a, b) => score(b) - score(a)));
  }
  const days = {};
  for (const g of gs){ const k = new Date(g.date).toLocaleDateString(undefined, {weekday:'long', month:'short', day:'numeric'}); (days[k] ??= []).push(g); }
  return Object.entries(days).map(([d, list]) => {
    let body;
    if (list.length > 8){
      const win = {};
      for (const g of list) (win[kickoffWindow(g)] ??= []).push(g);
      body = Object.entries(win).map(([w, l]) => `<div class="kwin"><span>${esc(w)}</span><span class="n">${l.length}</span></div>${grid(l)}`).join('');
    } else body = grid(list);
    return `<h3 class="sec sm">${esc(d)}<span class="n">${list.length}</span></h3>${body}`;
  }).join('');
}

export function viewTop25(){
  const gs = state.games.filter(ranked).sort((a, b) => bestRank(a) - bestRank(b));
  if (!gs.length) return empty('No ranked teams on this week\'s slate. Rankings usually appear from week 1.');
  const both = gs.filter(g => g.home.rank && g.away.rank), rest = gs.filter(g => !(g.home.rank && g.away.rank));
  let h = '';
  if (both.length) h += sec('Ranked vs ranked', both.length) + grid(both);
  h += sec('Everyone else in the poll', rest.length) + (rest.length ? grid(rest) : empty('No other ranked teams play this week.'));
  return h;
}
