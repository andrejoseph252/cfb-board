/* Against the spread: did the favorite cover? One rule for the cards and the game drawer, like upsets.

   The closing spread comes from, in order: data/spreads.json (the GitHub Action saves each game's line right up to
   kickoff, since ESPN's scoreboard drops it at the final), the scoreboard's own line while it still has one, or a
   line passed in by the caller (the game drawer has ESPN's summary, which keeps it). */
import * as api from './api.js';
import { invalidate } from './state.js';
import { upset } from './upset.js';

let map = null;
export function loadSpreads(){
  return api.spreads().then(j => { if (j?.g !== map){ map = j?.g || {}; invalidate(); } }).catch(() => {});
}

/* The home team's closing spread (negative: home favored) and ESPN's text for it, or null. */
export function spreadFor(g, fallback){
  const m = map?.[g.id];
  if (m && Number.isFinite(m.s)) return { home: m.s, details: m.d };
  if (g.book?.spread != null) return { home: g.book.spread, details: g.book.details };
  if (fallback?.spread != null) return { home: Number(fallback.spread), details: fallback.details };
  return null;
}

/* For a finished game: { fav, dog, line, by, result: 'covered' | 'missed' | 'push', dogCover, details } or null.
   by = how many points past the number (for whoever beat it). dogCover = the underdog lost but covered, the
   "closer than expected" case (an underdog that won outright is an upset instead). */
export function ats(g, fallback){
  if (g.state !== 'post' || !g.completed) return null;
  const sp = spreadFor(g, fallback); if (!sp || !sp.home) return null;   // no line, or a pick'em
  const hs = Number(g.home.score), as = Number(g.away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  const fav = sp.home < 0 ? 'home' : 'away', dog = fav === 'home' ? 'away' : 'home', line = Math.abs(sp.home);
  const favMargin = fav === 'home' ? hs - as : as - hs, over = favMargin - line;
  const result = over > 0 ? 'covered' : over < 0 ? 'missed' : 'push';
  return { fav, dog, line, by: Math.abs(over), result, favMargin, details: sp.details, dogCover: result === 'missed' && favMargin > 0 && !upset(g) };
}

/* "−9.5" style, with a real minus sign. */
export const fmtLine = n => `−${String(n).replace(/\.0$/, '')}`;

/* One sentence for a tooltip or the drawer, e.g. "Southern Miss lost by 7 as 9.5-point underdogs." */
export function atsWhy(g, a){
  const F = g[a.fav], D = g[a.dog], n = String(a.line).replace(/\.0$/, '');
  if (a.result === 'push') return `${F.name} won by exactly ${n} as ${n}-point favorites: a push.`;
  if (a.result === 'covered') return `${F.name} won by ${a.favMargin}, covering ${fmtLine(a.line)} by ${String(a.by).replace(/\.0$/, '')}.`;
  if (a.favMargin > 0) return `${D.name} lost by ${a.favMargin} as ${n}-point underdogs.`;
  return a.favMargin === 0 ? `${D.name} tied as ${n}-point underdogs.` : `${D.name} won outright as ${n}-point underdogs.`;
}
