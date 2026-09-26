/*
 Pregame excitement, 0-100, as an itemized sum so every point is explainable:
   Matchup quality  up to 55  ESPN's Matchup Quality (FPI-based: how good both teams are and how evenly matched)
   Competitiveness  up to 25  closeness of the market price to 50/50
   Scoring pace     up to 10  sportsbook over/under, else both teams' points per game
   Stakes           up to 10  ranked teams, conference game, both teams with 1 loss or fewer
*/
import { state } from './state.js';
import { primaryMarket, sourceLabel } from './markets.js';
import { clamp, parseRecord, pct } from './util.js';

const cache = new Map();

export const TIERS = [[80, 'Must watch', 'hi'], [65, 'Worth watching', 'mid'], [45, 'Decent', 'lo'], [0, 'Low stakes', 'min']];
export const tierOf = s => TIERS.find(([t]) => s >= t);

function fpiQuality(g){
  const f = state.fpi?.byTeam, a = f?.[g.away.id], h = f?.[g.home.id];
  if (!a && !h) return null;
  const n = state.fpi.list.length || 136;
  const str = t => t?.rank ? 1 - (t.rank - 1) / (n - 1) : 0.05;
  const s = (str(a) + str(h)) / 2;
  const p = state.preds.get(g.id)?.pHome;
  const bal = p != null ? 1 - Math.abs(2 * p - 1) : 0.5;
  return 100 * s * (0.6 + 0.4 * bal);
}

export function excitement(g){
  const key = g.id;
  const hit = cache.get(key);
  if (hit && hit.v === state.version) return hit.r;

  const pred = state.preds.get(g.id);
  const parts = [];

  // 1. Matchup quality
  let mq = pred?.mq, mqNote;
  if (mq != null) mqNote = `ESPN Matchup Quality ${mq.toFixed(0)}/100`;
  else { mq = fpiQuality(g); mqNote = mq != null ? `Estimated from FPI ranks (ESPN rating unavailable): ${mq.toFixed(0)}/100` : null; }
  if (mq == null){ mq = 30; mqNote = 'No FPI or ESPN rating for these teams, assumed below average'; }
  parts.push({ k: 'Matchup quality', pts: 0.55 * mq, max: 55, why: mqNote });

  // 2. Competitiveness
  const m = primaryMarket(g);
  let p = m?.pHome, pSrc = m ? sourceLabel(m.source) : null;
  if (p == null && pred?.pHome != null){ p = pred.pHome; pSrc = 'ESPN FPI projection'; }
  if (p != null){
    const fav = p >= .5 ? g.home : g.away, fp = Math.max(p, 1 - p);
    parts.push({ k: 'Competitiveness', pts: 25 * (1 - Math.abs(2 * p - 1)), max: 25,
      why: `${pSrc}: ${fav.abbr} ${pct(fp)}%${fp < .6 ? ', near coin flip' : fp > .85 ? ', lopsided' : ''}` });
  } else parts.push({ k: 'Competitiveness', pts: 12.5, max: 25, why: 'No line or projection yet, scored as average' });

  // 3. Scoring pace
  let total = g.book?.ou, tSrc = 'Over/under';
  if (total == null){
    const s = state.standings?.byTeam, pa = s?.[g.away.id]?.ppg, ph = s?.[g.home.id]?.ppg;
    if (pa != null && ph != null){ total = pa + ph; tSrc = `Combined scoring avg (${g.away.abbr} ${pa.toFixed(1)}, ${g.home.abbr} ${ph.toFixed(1)})`; }
  }
  if (total != null) parts.push({ k: 'Scoring pace', pts: 10 * clamp((total - 40) / 30, 0, 1), max: 10,
    why: `${tSrc}: ${Number(total).toFixed(1)} pts${total >= 60 ? ', shootout potential' : total < 45 ? ', defensive game' : ''}` });
  else parts.push({ k: 'Scoring pace', pts: 5, max: 10, why: 'No total or scoring data, scored as average' });

  // 4. Stakes
  let st = 0; const bits = [];
  if (g.home.rank && g.away.rank){ st += 5; bits.push(`#${g.away.rank} vs #${g.home.rank}`); }
  else if (g.home.rank || g.away.rank){ st += 2; bits.push('one ranked team'); }
  if (g.confGame){ st += 3; bits.push('conference game'); }
  const ra = parseRecord(g.away.record), rh = parseRecord(g.home.record);
  if (ra && rh && ra.l <= 1 && rh.l <= 1 && ra.w + rh.w > 0){ st += 2; bits.push('both teams 1 loss or fewer'); }
  parts.push({ k: 'Stakes', pts: st, max: 10, why: bits.length ? bits.join(', ') : 'Unranked, non-conference' });

  const score = Math.round(parts.reduce((s, x) => s + x.pts, 0));
  const r = { score, tier: tierOf(score), parts, pending: pred === undefined };
  cache.set(key, { v: state.version, r });
  return r;
}

/* In-game: total win-probability movement (sum of |ΔWP| across plays).
   Calibrated on 2026 week 3: blowouts < 0.5, competitive 1-2, thrillers 2.2+, instant classics 3.5+. */
export const REALIZED_TIERS = [[3.5, 'Instant classic'], [2.2, 'Thriller'], [1, 'Competitive'], [0, 'Mostly one-sided']];
export function realizedExcitement(wp){
  if (!wp || wp.length < 5) return null;
  let s = 0; for (let i = 1; i < wp.length; i++) s += Math.abs(wp[i] - wp[i - 1]);
  // Count a flip only when the favorite changes decisively (past 55/45), not wobbles around 50%.
  let flips = 0, side = wp[0] >= .5 ? 1 : -1;
  for (const p of wp){ if (side > 0 && p <= .45){ flips++; side = -1; } else if (side < 0 && p >= .55){ flips++; side = 1; } }
  return { index: s, flips, label: REALIZED_TIERS.find(([t]) => s >= t)[1] };
}
