/*
 The pregame score ("Hype", 0-100): how big a game this is, the ones everyone wants to watch and the ones that
 decide something, as an itemized sum so every point is explainable:
   Matchup quality  up to 40  ESPN's Matchup Quality (FPI-based: how good both teams are and how evenly matched)
   Close line       up to 20  how near the market price is to 50/50: a close game decides something even when it isn't
                              a headliner (Wake Forest–SMU), and it's the best sign the game will be worth watching
   Rankings         up to 15  how high the better team is ranked, and the other one too if it's ranked
   Stakes           up to 15  a conference race (both teams near the top of the conference), a conference game, both
                              teams with one loss or fewer
   Rivalry          up to 10  a traditional rivalry (js/rivals.js)
 Weights were set by replaying weeks 1-10 of 2026 (scripts/hype_backtest.mjs) against two things: how much money was
 traded on each game (attention) and how close and dramatic it turned out. These keep both about where the old
 formula had them (0.68 and 0.43 rank correlation) while catching rivalries and conference races it missed; giving
 quality more weight finds the most-bet games slightly better but makes the score blind to close games.
*/
import * as api from './api.js';
import { state, invalidateSoon } from './state.js';
import { primaryMarket, sourceLabel } from './markets.js';
import { parseRecord, pct } from './util.js';
import { isRivalry } from './rivals.js';

const cache = new Map();

/* Cutoffs set so the tiers keep their share of games: Must watch the top ~5% (two or three a week), Worth watching
   the next ~13%, Decent the next third. */
export const TIERS = [[62, 'Must watch', 'hi'], [48, 'Worth watching', 'mid'], [32, 'Decent', 'lo'], [0, 'Low stakes', 'min']];
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

/* In its conference's race: at least two conference wins and no more than one conference loss (or unbeaten in it). */
const inRace = t => { const r = parseRecord(t.confRecord); return !!r && r.l <= 1 && r.w >= (r.l ? 2 : 1); };
const nearRace = t => { const r = parseRecord(t.confRecord); return !!r && r.l <= 2 && r.w >= 2; };

export function excitement(g){
  const key = g.id;
  const hit = cache.get(key);
  if (hit && hit.v === state.version) return hit.r;

  const pred = state.preds.get(g.id);
  const parts = [];

  // 1. Matchup quality
  let mq = pred?.mq, mqNote;
  let mqShort = mq != null ? `ESPN rating ${mq.toFixed(0)}` : '';
  if (mq != null) mqNote = `ESPN Matchup Quality ${mq.toFixed(0)}/100`;
  else { mq = fpiQuality(g); mqNote = mq != null ? `Estimated from FPI ranks (ESPN rating unavailable): ${mq.toFixed(0)}/100` : null; mqShort = mq != null ? `FPI estimate ${mq.toFixed(0)}` : ''; }
  if (mq == null){ mq = 30; mqNote = 'No FPI or ESPN rating for these teams, assumed below average'; mqShort = 'No rating yet'; }
  // short: a few words for the card's key; why: the full sentence for the game drawer's Hype meter.
  parts.push({ k: 'Matchup quality', short: 'Matchup', pts: 0.4 * mq, max: 40, why: mqNote, note: mqShort });

  // 2. Close line
  const m = primaryMarket(g);
  let p = m?.pHome, pSrc = m ? sourceLabel(m.source) : null;
  if (p == null && pred?.pHome != null){ p = pred.pHome; pSrc = 'ESPN FPI projection'; }
  if (p != null){
    const fav = p >= .5 ? g.home : g.away, fp = Math.max(p, 1 - p);
    parts.push({ k: 'Close line', short: 'Close line', pts: 20 * (1 - Math.abs(2 * p - 1)), max: 20,
      why: `${pSrc}: ${fav.abbr} ${pct(fp)}%${fp < .6 ? ', near coin flip' : fp > .85 ? ', lopsided' : ''}`, note: `${fav.abbr} ${pct(fp)}%` });
  } else parts.push({ k: 'Close line', short: 'Close line', pts: 10, max: 20, why: 'No line or projection yet, scored as average', note: 'No line yet' });

  // 3. Rankings
  const rk = [g.away.rank, g.home.rank].filter(Boolean).sort((a, b) => a - b), at = r => (26 - r) / 25;
  const rkPts = rk.length ? 10 * at(rk[0]) + (rk[1] ? 5 * at(rk[1]) : 0) : 0;
  parts.push({ k: 'Rankings', short: 'Rankings', pts: rkPts, max: 15,
    why: rk.length === 2 ? `#${g.away.rank} vs #${g.home.rank}` : rk.length ? `#${rk[0]} against an unranked team` : 'Neither team ranked',
    note: rk.length === 2 ? `#${g.away.rank} vs #${g.home.rank}` : rk.length ? `#${rk[0]} vs unranked` : '' });

  // 4. Stakes
  let st = 0; const bits = [], few = [];
  if (g.confGame){
    const a = inRace(g.away), h = inRace(g.home);
    if (a && h){ st += 8; bits.push('conference race: both near the top'); few.push('Conf. race'); }
    else if ((a && nearRace(g.home)) || (h && nearRace(g.away))){ st += 4; bits.push('conference race: one contender'); few.push('Conf. contender'); }
    st += 3; bits.push('conference game'); if (!few.length) few.push('Conf. game');
  }
  const ra = parseRecord(g.away.record), rh = parseRecord(g.home.record);
  if (ra && rh && ra.l <= 1 && rh.l <= 1 && ra.w + rh.w > 0){ st += 4; bits.push('both teams 1 loss or fewer'); few.push('≤1 loss each'); }
  parts.push({ k: 'Stakes', short: 'Stakes', pts: st, max: 15, why: bits.length ? bits.join(', ') : 'Non-conference, nothing on the line', note: few.join(' · ') });

  // 5. Rivalry
  const rival = isRivalry(g);
  parts.push({ k: 'Rivalry', short: 'Rivalry', pts: rival ? 10 : 0, max: 10, why: rival ? 'A traditional rivalry' : 'Not a rivalry game', note: rival ? 'Traditional rivalry' : '' });

  const score = Math.round(parts.reduce((s, x) => s + x.pts, 0));
  const r = { score, tier: tierOf(score), parts, pending: pred === undefined, rival };
  cache.set(key, { v: state.version, r });
  return r;
}

/* Live: how worth switching to this game right now. Closeness (win prob near 50%) weighted up as the clock runs down,
   so a coin-flip fourth quarter beats a coin-flip first quarter. 0-1; 0.55+ is flagged "Watch now" (never at halftime). */
export function watchHeat(g){
  if (g.state !== 'in' || g.liveWp == null || /halftime/i.test(g.detail || '')) return 0;
  const close = 1 - Math.abs(2 * g.liveWp - 1);
  const t = g.secsLeft == null ? .5 : Math.min(1, Math.max(0, 1 - g.secsLeft / 3600));
  return close * (.35 + .65 * t) + (g.redZone && close > .4 ? .05 : 0);
}
export const isHot = g => watchHeat(g) >= .55;

/* In-game: total win-probability movement (sum of |ΔWP| across plays).
   Cutoffs from 2026 weeks 1-9 (622 FBS games): instant classics are the top ~3%, thrillers the next ~12%,
   one-sided the bottom ~40%. Kept fixed so a game's label doesn't drift as the season goes on. */
export const REALIZED_TIERS = [[4.1, 'Instant classic'], [3.1, 'Thriller'], [.9, 'Competitive'], [0, 'Mostly one-sided']];
export function realizedExcitement(wp){
  wp = wp?.map(p => typeof p === 'number' ? p : p.home);
  if (!wp || wp.length < 5) return null;
  let s = 0; for (let i = 1; i < wp.length; i++) s += Math.abs(wp[i] - wp[i - 1]);
  // Count a flip only when the favorite changes decisively (past 55/45), not wobbles around 50%.
  let flips = 0, side = wp[0] >= .5 ? 1 : -1;
  for (const p of wp){ if (side > 0 && p <= .45){ flips++; side = -1; } else if (side < 0 && p >= .55){ flips++; side = 1; } }
  return { index: s, flips, label: REALIZED_TIERS.find(([t]) => s >= t)[1] };
}

/* Finished games: the index the GitHub Action saved (data/excitement.json), the same number as the game drawer's. */
let finals = null, sorted = [];
export function loadFinalExcitement(){
  return api.finals().then(j => {
    if (j?.g === finals) return;
    finals = j?.g || {}; sorted = Object.values(finals).map(x => x[0]).sort((a, b) => a - b); invalidateSoon();
  }).catch(() => {});
}
/* Share of this season's finished games with a lower index, 0-100, or null before the file loads. */
export function seasonRank(index){
  if (!sorted.length) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi){ const m = (lo + hi) >> 1; if (sorted[m] < index) lo = m + 1; else hi = m; }
  return Math.round(lo / sorted.length * 100);
}
export function finalExcitement(g){
  const x = finals?.[g.id];
  return x ? { index: x[0], flips: x[1], label: REALIZED_TIERS.find(([t]) => x[0] >= t)[1] } : null;
}
