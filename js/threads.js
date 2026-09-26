/* Match r/CFB game / postgame threads (collected by the GitHub Action into data/threads.json) to a game. */
import { norm } from './util.js';

const names = t => [t.name, t.short, t.full, t.abbr].filter(Boolean).map(norm);

/* 2 = exact name match, 1 = r/CFB name is a longer form ("Miami" vs "Miami Hurricanes"), 0 = no match */
function nameScore(side, t){
  const n = norm(side), ns = names(t);
  if (ns.includes(n)) return 2;
  return ns.some(v => v.length > 3 && v.startsWith(n + ' ')) ? 1 : 0;
}
function pairScore(teams, g){
  if (!teams) return 0;
  const [a, b] = teams;
  const s1 = Math.min(nameScore(a, g.away), nameScore(b, g.home)), s2 = Math.min(nameScore(a, g.home), nameScore(b, g.away));
  return Math.max(s1, s2);
}

const HOUR = 3600e3;
function best(list, g, kind, lo, hi){
  const k = new Date(g.date).getTime();
  let top = null, topScore = 0;
  for (const t of list){
    if (t.kind !== kind) continue;
    const d = new Date(t.published).getTime() - k;
    if (d < lo * HOUR || d > hi * HOUR) continue;
    const s = pairScore(t.teams, g);
    if (s > topScore){ top = t; topScore = s; }
  }
  return top;
}

export function threadsFor(g, list){
  if (!list?.length) return {};
  // Postgame threads link ESPN's box score, so the game id is exact; names are only a fallback.
  const post = list.find(t => t.kind === 'post' && t.gameId === String(g.id)) || best(list, g, 'post', 0, 10);
  const game = best(list, g, 'game', -5, 2);
  return { game, post };
}

export const searchUrl = g => `https://www.reddit.com/r/CFB/search/?q=${encodeURIComponent(`flair:"Game Thread" ${g.away.name} ${g.home.name}`)}&restrict_sr=1&sort=new`;
