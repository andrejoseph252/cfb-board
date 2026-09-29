/* "My team": one team you follow. Its game is always in Pinned (first) and in Live now while it's on, and its
   cards and table rows carry a ring and tint in its color. Set from the team page; shown and cleared in settings.
   Saved in this browser only, like picks and pins. */
import { store } from './util.js';
import { state, invalidate } from './state.js';
import * as api from './api.js';
import { parseSchedule } from './models.js';

export let myTeam = store.get('myteam', null);   // { id, name, color, alt, logo }

export function setMyTeam(t){
  myTeam = t ? { id: String(t.id), name: t.name, color: t.color || null, alt: t.alt || null, logo: t.logo || null } : null;
  store.set('myteam', myTeam);
  invalidate();
}
export const isMine = id => !!myTeam && String(id) === myTeam.id;
/* 'home' or 'away' if my team plays in this game, else null. */
export const mySide = g => !myTeam ? null : isMine(g.home.id) ? 'home' : isMine(g.away.id) ? 'away' : null;

/* ---------- a team color that shows up on the current background ---------- */
const lum = hex => {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  if (!Number.isFinite(n)) return null;
  const c = v => { v /= 255; return v <= .04 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  return .2126 * c(n >> 16 & 255) + .7152 * c(n >> 8 & 255) + .0722 * c(n & 255);
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return x == null || y == null ? 0 : (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

/* The team's color, or its alternate when the main one would vanish against the page (e.g. black on dark Mono),
   or the page's ink as a last resort. Uses the latest colors from this week's games when the team is on the board. */
export function myColor(){
  if (!myTeam) return null;
  const onBoard = state.games.map(g => isMine(g.home.id) ? g.home : isMine(g.away.id) ? g.away : null).find(Boolean);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0D0D0D';
  for (const c of [onBoard?.color ?? myTeam.color, onBoard?.alt ?? myTeam.alt]) if (c && contrast(c, bg) >= 2) return c;
  return 'var(--ink)';
}

/* ---------- next game, for a week my team doesn't play ---------- */
let sched = null, schedFor = null, schedAt = 0;
export function myNextGame(){
  if (!myTeam) return null;
  if (schedFor !== myTeam.id || Date.now() - schedAt > 10 * 60e3){
    schedFor = myTeam.id; schedAt = Date.now();
    api.teamSchedule(myTeam.id).then(j => { sched = parseSchedule(j); invalidate('main'); }).catch(() => {});
  }
  if (!sched || String(sched.team.id) !== myTeam.id) return undefined;   // still loading
  return sched.games.find(g => g.state !== 'post' && new Date(g.date) > Date.now() - 4 * 3600e3) || null;
}

/* Attributes for a table row: tinted in my team's color when it's my team. */
export const mineRow = id => isMine(id) ? ` class="mine" style="--mine:${myColor()}"` : '';

/* Small inline star used next to my team's name. */
export const STAR = '<svg class="star" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .8l2.2 4.7 5.1.6-3.8 3.5 1 5.1L8 12.2l-4.5 2.5 1-5.1L.7 6.1l5.1-.6z" fill="currentColor"/></svg>';
