/* Live games, between refreshes: each game's win % so far (the live excitement index on cards, and a fallback for a
   missing win %) and the scoring plays that set off a card's touchdown graphic. Fed the board as it's shown (after any stream delay), so nothing
   here runs ahead of the stream. */
import * as api from './api.js';
import { state, invalidate } from './state.js';
import { parseProbabilities } from './models.js';

/* How far through regulation a live game is, 0 to 1, from its quarter and clock (overtime sits at 1). */
export function progress(g){
  if (g.period == null) return null;
  if (g.period > 4) return 1;
  return Math.min(1, Math.max(0, ((g.period - 1) * 900 + (900 - (g.clock ?? 900))) / 3600));
}

/* ---------- win % history ---------- */
const series = new Map();   // id -> { pts: [[progress, homeWp]], tried, seeded }
const SEED_RETRY = 60e3, RESEED = 120e3;   // the per-play feed again every 2 minutes: it has every play, refreshes miss some

export function momentum(g){
  const s = series.get(g.id), now = progress(g);
  if (!s || now == null) return null;
  // Never past the moment being shown (the per-play feed can be ahead of a delayed board).
  return s.pts.filter(([x]) => x <= now + 1e-6);
}

function append(g){
  const x = progress(g); if (x == null || g.liveWp == null) return;
  let s = series.get(g.id); if (!s) series.set(g.id, s = { pts: [], tried: 0, seeded: false });
  const last = s.pts[s.pts.length - 1];
  if (last && x < last[0]) return;
  if (last && x - last[0] < 1e-4) last[1] = g.liveWp; else s.pts.push([x, g.liveWp]);
}

/* The whole game so far, once per game: ESPN's per-play feed (the game drawer's chart uses the same request). */
function seed(g){
  let s = series.get(g.id); if (!s) series.set(g.id, s = { pts: [], tried: 0, seeded: false });
  if (Date.now() - s.tried < (s.seeded ? RESEED : SEED_RETRY)) return;
  s.tried = Date.now();
  api.probabilities(g.id, true).then(j => {
    const pts = parseProbabilities(j).filter(p => p.left != null).map(p => [Math.min(1, Math.max(0, 1 - p.left / 3600)), p.home]);
    if (!pts.length) return;
    const after = s.pts.filter(([x]) => x > pts[pts.length - 1][0]);   // refreshes newer than the feed
    s.pts = [...pts, ...after]; s.seeded = true;
    const g2 = state.byId[g.id];
    if (g2?.state === 'in' && g2.liveWp == null){ const m = momentum(g2); if (m?.length) g2.liveWp = m[m.length - 1][1]; }
    invalidate('main');
  }).catch(() => {});
}

/* ---------- scoring plays ---------- */
const events = new Map();   // id -> { side, kind, at, away, home }
const LENGTH = { td: 3600, fg: 2600, safety: 2600 };

/* The scoring graphic to show on a card right now, with how far into it we are (so a re-render picks it up mid-way). */
export function scored(g){
  const e = events.get(g.id); if (!e) return null;
  const t = Date.now() - e.at;
  if (t > LENGTH[e.kind]){ events.delete(g.id); return null; }
  return { ...e, elapsed: t, length: LENGTH[e.kind] };
}
export function fire(g, side, kind = 'td'){   // also used by the localhost preview key
  events.set(g.id, { side, kind, at: Date.now() });
  invalidate('main');
  setTimeout(() => invalidate('main'), LENGTH[kind] + 50);   // take the graphic down
}

/* After each change to the board as shown: note scores, extend each live game's history, fill a missing win %. */
export function track(prev, games){
  for (const g of games){
    if (g.state !== 'in') continue;
    const p = prev[g.id];
    if (p && (p.state === 'in' || p.state === 'pre')){
      for (const side of ['away', 'home']){
        const d = Number(g[side].score) - Number(p[side].score);
        if (d >= 6) fire(g, side, 'td'); else if (d === 3) fire(g, side, 'fg'); else if (d === 2 && p.state === 'in') fire(g, side, 'safety');
      }
    }
    // The scoreboard only attaches a win % to some plays: keep the last one rather than going blank, and for a game
    // that hasn't had one since the page opened, take it from the per-play feed (cut at the moment being shown).
    if (g.liveWp == null){
      const m = momentum(g), before = p?.liveWp;
      g.liveWp = before ?? (m?.length ? m[m.length - 1][1] : null);
    }
    append(g);
    seed(g);
  }
}
