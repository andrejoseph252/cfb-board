/* Every AP voter's ballot (data/ballots.json, from scripts/ballots.py): for one team, how each voter ranked it, and
   what that says about how much the voters agree. A team left off a ballot counts as 26th ("not ranked"). */
import * as api from './api.js';
import { state, invalidate } from './state.js';

let data = null, busy = false, at = 0;
/* The file, loading it in the background the first time (and every 10 minutes after). */
export function ballots(){
  if (!busy && Date.now() - at > 10 * 60e3){
    busy = true;
    api.ballots().then(j => { if (j !== data){ data = j; invalidate('main'); invalidate('detail'); } })
      .catch(() => {}).finally(() => { busy = false; at = Date.now(); });
  }
  return data;
}
export const NR = 26;
export const weeksOf = d => Object.keys(d?.weeks || {}).map(Number).sort((a, b) => a - b);

/* Whether the newest week of ballots is the poll ESPN is showing now: its points add up to ESPN's for the top team.
   (On Sunday afternoon the new poll is out a while before its ballots are.) */
export function matchesPoll(d, w){
  const top = state.rankings?.ranks?.[0], wk = d?.weeks?.[w];
  if (!top || !wk) return false;
  return points(wk, String(top.id)) === top.points;
}
const points = (wk, id) => wk.voters.reduce((a, v) => { const i = v.b.indexOf(id); return a + (i < 0 ? 0 : 25 - i); }, 0);

/* One team in one week: each voter's rank for it (NR if left off), and the summary. */
export function teamWeek(d, w, id){
  const wk = d?.weeks?.[w]; if (!wk) return null;
  id = String(id);
  const votes = wk.voters.map(v => { const i = v.b.indexOf(id); return { n: v.n, o: v.o, r: i < 0 ? NR : i + 1 }; });
  const rs = votes.map(v => v.r).sort((a, b) => a - b), n = rs.length;
  const on = rs.filter(r => r < NR).length;
  if (!on) return { w, wk, votes, n, on: 0 };
  const q = p => { const x = (n - 1) * p, lo = Math.floor(x); return rs[lo] + (rs[Math.min(n - 1, lo + 1)] - rs[lo]) * (x - lo); };
  const avg = rs.reduce((a, r) => a + r, 0) / n, sd = Math.sqrt(rs.reduce((a, r) => a + (r - avg) ** 2, 0) / n);
  const med = q(.5), near = rs.filter(r => Math.abs(r - Math.round(med)) <= 2).length;
  const dist = Array(NR + 1).fill(0); for (const r of rs) dist[r]++;
  return { w, wk, votes, n, on, avg, sd, med, q1: q(.25), q3: q(.75), hi: rs[0], lo: rs[n - 1], near, dist, pts: points(wk, id), fpv: dist[1] };
}
export const rankText = r => r >= NR ? 'NR' : '#' + r;
