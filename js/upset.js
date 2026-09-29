/* Upsets: a finished game whose winner was given a low chance at kickoff. One rule for the cards, the game drawer
   and the recap, so they always agree.

   The chance comes from, in order:
     1. the market's last pregame price (data/lines.json, kept 10 days after each game; ESPN drops odds at the final)
     2. ESPN's pregame FPI projection (ESPN keeps it after the game, so older weeks still work)
     3. no number at all: an unranked team beating a ranked one, or a lower-ranked team beating a higher-ranked one */
import { state } from './state.js';
import { lineFor } from './lines.js';
import { winnerSide } from './picks.js';
import { pct } from './util.js';

export const UPSET = .35, BIG_UPSET = .15;

/* Lightning bolt used wherever an upset is marked (an SVG, so it looks the same on every device). */
export const BOLT = '<svg class="bolt" viewBox="0 0 12 16" aria-hidden="true"><path d="M7.5 0 0 9h4.5L3 16l9-10H7L7.5 0z" fill="currentColor"/></svg>';

const other = s => s === 'home' ? 'away' : 'home';

/* { side, p, src, big } for the winner of an upset, or null. p is null for a ranking-only upset. */
export function upset(g){
  if (g.state !== 'post' || !g.completed) return null;
  const side = winnerSide(g); if (!side) return null;
  const L = lineFor(g), fp = state.preds.get(g.id)?.pHome;
  let p = null, src = null;
  if (L){ p = side === 'home' ? L.now : 1 - L.now; src = L.src; }
  else if (fp != null){ p = side === 'home' ? fp : 1 - fp; src = 'ESPN FPI'; }
  if (p != null) return p <= UPSET ? { side, p, src, big: p <= BIG_UPSET } : null;
  const w = g[side], l = g[other(side)];
  return l.rank && (!w.rank || w.rank > l.rank) ? { side, p: null, src: 'AP poll', big: false } : null;
}

/* One sentence explaining it, e.g. "Kalshi gave Wake Forest 19% at kickoff." */
export function upsetWhy(g, u){
  const w = g[u.side], l = g[other(u.side)];
  if (u.p == null) return `${w.rank ? `#${w.rank}` : 'Unranked'} ${w.name} beat #${l.rank} ${l.name}.`;
  return `${u.src === 'ESPN FPI' ? 'ESPN\'s FPI' : u.src} gave ${w.name} ${pct(u.p)}% ${u.src === 'ESPN FPI' ? 'before' : 'at'} kickoff.`;
}
