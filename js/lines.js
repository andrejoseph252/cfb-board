/* Pregame price history from data/lines.json (kept by the GitHub Action): how each game's line moved during the week. */
import * as api from './api.js';
import { invalidate } from './state.js';
import { nameMatch } from './markets.js';

const SRC = { K: 'Kalshi', P: 'Polymarket' };
let list = null;
const memo = new Map();

export function loadLines(){
  return api.lines().then(j => { if (j.m !== list){ list = j.m || []; memo.clear(); invalidate(); } }).catch(() => {});
}

/* A 3-point median drops one-snapshot spikes from thin markets without flattening real moves. */
const med = (a, b, c) => a + b + c - Math.min(a, b, c) - Math.max(a, b, c);

/* { pts: [[ms, pHome]], open, now, move (home's gain since open), src, since, closed } or null.
   Points after kickoff are dropped, so a finished game's last point is its closing line. */
export function lineFor(g){
  if (!list) return null;
  const key = g.id + ':' + g.date;
  if (memo.has(key)) return memo.get(key);
  const kick = new Date(g.date).getTime();
  let hit = null;
  for (const m of list){
    if (Math.abs(new Date(m.c) - kick) > 5 * 864e5) continue;
    const homeFirst = nameMatch(m.t[0], g.home) && nameMatch(m.t[1], g.away);
    if (!homeFirst && !(nameMatch(m.t[0], g.away) && nameMatch(m.t[1], g.home))) continue;
    if (!hit || m.h.length > hit.m.h.length) hit = { m, homeFirst };
  }
  let r = null;
  if (hit){
    const { m, homeFirst } = hit;
    let pts = m.h.map(([t, p]) => [t * 60e3, homeFirst ? p / 100 : 1 - p / 100]).filter(([t]) => t < kick);
    pts = pts.map((p, i) => i === 0 || i === pts.length - 1 ? p : [p[0], med(pts[i - 1][1], p[1], pts[i + 1][1])]);
    const end = Math.min((m.l ?? 0) * 60e3, kick, Date.now());
    if (pts.length && end > pts[pts.length - 1][0]) pts.push([end, pts[pts.length - 1][1]]);
    if (pts.length >= 2){
      const open = pts[0][1], now = pts[pts.length - 1][1];
      r = { pts, open, now, move: now - open, src: SRC[m.s] || 'Market', since: pts[0][0], closed: Date.now() >= kick };
    }
  }
  memo.set(key, r);
  return r;
}

/* The pregame price of one side at kickoff (or now, before it). */
export const closingP = (g, side) => { const l = lineFor(g); return l ? (side === 'home' ? l.now : 1 - l.now) : null; };
