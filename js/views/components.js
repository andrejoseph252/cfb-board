import { esc, pct, fmtTime, fmtDay, plural } from '../util.js';
import { state } from '../state.js';
import { marketsFor, sourceLabel } from '../markets.js';
import { pins, picks } from '../picks.js';
import { excitement, isHot } from '../excitement.js';

export const teamHref = id => `#team/${encodeURIComponent(id)}`;
export const gameHref = id => `#game/${encodeURIComponent(id)}`;

export const logo = (src, cls = 'logo') => src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">` : `<span class="${cls}"></span>`;

/* Team name that opens the schedule drawer. Pass {logo:true} to include the logo inside the link. */
export function teamLink(t, { rank = true, withLogo = false, label } = {}){
  if (!t?.id) return esc(label ?? t?.name ?? 'TBD');
  return `<a class="tlink" href="${teamHref(t.id)}">${withLogo ? logo(t.logo, 'logo sm') : ''}${rank && t.rank ? `<span class="rank">${t.rank}</span>` : ''}${esc(label ?? t.name)}</a>`;
}

export const sec = (title, n, unit = 'game') => `<h2 class="sec">${esc(title)}${n != null ? `<span class="n">${plural(n, unit)}</span>` : ''}</h2>`;
/* A titled run of cards whose header sticks under the tabs while you scroll through it. */
export const group = (label, n, body, ctx = '') => `<section class="kgroup"><div class="kgroup-h"><span class="kpill">${esc(label)}</span>${ctx ? `<span class="kctx">${esc(ctx)}</span>` : ''}<span class="kn">${n}</span></div>${body}</section>`;
export const empty = msg => `<div class="empty">${msg}</div>`;
export const chips = (items, active, attr) => `<div class="chips" role="group">${items.map(([v, l]) =>
  `<button class="chip" data-${attr}="${esc(v)}" aria-pressed="${String(active) === String(v)}">${esc(l)}</button>`).join('')}</div>`;

function hex2rgb(h){ h = h.replace('#',''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const cdist = (a, b) => { const p = hex2rgb(a), q = hex2rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
export function barColors(g){ const a = g.away.color; let h = g.home.color; if (cdist(a, h) < 90){ h = g.home.alt; if (cdist(a, h) < 90) h = '#9aa39d'; } return [a, h]; }

const PIN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 3l5 5-3 1-3.5 3.5L15 17l-2 2-4-4-5 5-1-1 5-5-4-4 2-2 4.5.5L13 5l3-2z"/></svg>';

const fpiTag = id => { const f = state.fpi?.byTeam[id]; return f?.rank ? `<span class="fpi" title="ESPN FPI rank">FPI ${f.rank}</span>` : ''; };

/* The team with the ball in a live game glows (red inside the 20). */
export function ballClass(g, t){
  if (g.state !== 'in' || !g.poss || String(g.poss) !== String(t.id)) return '';
  return g.redZone ? ' has-ball rz' : ' has-ball';
}

function teamRow(g, side){
  const t = g[side], opp = g[side === 'home' ? 'away' : 'home'];
  const lose = g.state === 'post' && g.completed && !t.winner && opp.winner;
  const pk = picks[g.id], mine = pk && pk.side === side;
  const ball = ballClass(g, t);
  return `<div class="row${lose ? ' loser' : ''}${ball}"${ball ? ` title="${esc(t.name)} ball${g.redZone ? ', red zone' : ''}"` : ''}>
    <span class="stripe" style="background:${esc(t.color)}"></span>
    ${t.id ? `<a href="${teamHref(t.id)}" tabindex="-1" aria-hidden="true">${logo(t.logo)}</a>` : logo(t.logo)}
    <span class="tname"><span class="tn">${teamLink(t)}</span>${ball ? '<span class="sr"> has the ball</span>' : ''}<span class="rec">${esc(t.record || '')}</span>${fpiTag(t.id)}</span>
    ${mine ? `<span class="mypick ${pk.result || ''}">${pk.result === 'W' ? 'Pick hit' : pk.result === 'L' ? 'Pick missed' : 'Your pick'}</span>` : '<span></span>'}
    <span class="score">${g.state === 'pre' ? '' : esc(t.score ?? '')}</span></div>`;
}

export function statusHTML(g, bare = false){
  if (g.state === 'in') return `<span class="status live">${esc(g.detail)}</span>${g.sit && !bare ? `<span>${esc(g.sit)}</span>` : ''}`;
  if (g.state === 'post') return `<span class="status">${esc(g.detail || 'Final')}</span>`;
  const d = new Date(g.date);
  return `<span class="status">${d.toLocaleDateString(undefined, {weekday:'short'})} ${fmtTime(d)}</span>`;
}

export function meter(g, p, label){
  const [ca, ch] = barColors(g), pa = pct(1 - p), ph = 100 - pa;
  return `<div class="meter" role="img" aria-label="${esc(label)}: ${esc(g.away.name)} ${pa}%, ${esc(g.home.name)} ${ph}%">
    <span style="width:${pa}%;background:${esc(ca)}"></span><span style="width:${ph}%;background:${esc(ch)}"></span></div>`;
}

/* Before kickoff the two percentages (or team abbreviations, with no line yet) are the pick buttons. */
function oddsBlock(g){
  const mk = marketsFor(g), prim = mk[0], pre = g.state === 'pre', pk = picks[g.id]?.side;
  const pickBtn = (s, text) => `<button class="opick${pk === s ? ' mine' : ''}" data-pick="${s}" aria-pressed="${pk === s}" title="${pk === s ? 'Your pick. Tap to clear' : `Pick ${esc(g[s].name)}`}">${pk === s ? '✓ ' : ''}${text}</button>`;
  if (!prim) return pre ? `<div class="odds">${pickBtn('away', esc(g.away.abbr))}<span class="src">No line yet</span>${pickBtn('home', esc(g.home.abbr))}</div>` : '';
  const pa = pct(1 - prim.pHome), ph = 100 - pa, label = sourceLabel(prim.source);
  const alt = mk.slice(1).map(m => `${m.source} ${pct(1 - m.pHome)}/${pct(m.pHome)}`).join(', ');
  const side = (s, text) => pre ? pickBtn(s, text) : `<b>${text}</b>`;
  return `${meter(g, prim.pHome, label)}
    <div class="odds">${side('away', `${esc(g.away.abbr)} ${pa}%`)}
      <span class="src">${prim.url ? `<a href="${esc(prim.url)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label)}${alt ? ` · ${esc(alt)}` : ''}</span>
      ${side('home', `${ph}% ${esc(g.home.abbr)}`)}</div>`;
}

/* Remember which breakdowns are expanded so live re-renders don't collapse them. */
export const openXc = new Set();

/* Two-word drivers for the collapsed excitement row: what's pushing the score up (or down). */
function drivers(x){
  const r = k => { const p = x.parts.find(q => q.k === k); return p ? p.pts / p.max : 0; };
  const t = [];
  if (r('Matchup quality') >= .75) t.push('Top teams');
  if (r('Competitiveness') >= .75) t.push('Close odds'); else if (r('Competitiveness') <= .3) t.push('Lopsided');
  if (r('Scoring pace') >= .7) t.push('Shootout'); else if (r('Scoring pace') <= .2) t.push('Low scoring');
  if (r('Stakes') >= .8) t.push('Big stakes');
  return t.slice(0, 2).join(' · ');
}
const CHEV = '<svg class="xc-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function excitementBadge(g, { open = false } = {}){
  if (g.state === 'post') return '';
  const x = excitement(g);
  if (x.pending) return '<div class="xc pending"><span class="xc-sum">Excitement <b>…</b></span></div>';
  const [, label, cls] = x.tier;
  return `<details class="xc" data-xc="${esc(g.id)}"${open || openXc.has(g.id) ? ' open' : ''}><summary class="xc-sum" title="Excitement ${x.score}"><span class="xc-score ${cls}">${x.score}</span>
      <b class="xc-label">${esc(label)}</b><span class="xc-tags">${esc(drivers(x))}</span>${CHEV}</summary>
    <ul class="xc-parts">${x.parts.map(p => `<li><span class="xc-k">${esc(p.k)}</span>
      <span class="xc-bar"><i style="width:${(p.pts / p.max) * 100}%"></i></span>
      <span class="xc-pts">${p.pts.toFixed(0)}/${p.max}</span><span class="xc-why">${esc(p.why)}</span></li>`).join('')}</ul></details>`;
}

/* The whole card opens the game (see main.js); close, late live games get an orange outline. */
export function card(g){
  const live = g.state === 'in', hot = live && isHot(g), pinned = pins.has(g.id);
  const info = [live ? g.sit : null, g.tv, g.book?.details && g.state === 'pre' ? g.book.details : null, g.neutral ? 'Neutral site' : null].filter(Boolean);
  return `<article class="game${live ? ' is-live' : ''}${hot ? ' is-hot' : ''}${pinned ? ' is-pinned' : ''}" data-id="${esc(g.id)}">
    ${teamRow(g, 'away')}${teamRow(g, 'home')}${oddsBlock(g)}${excitementBadge(g)}
    <div class="foot">${statusHTML(g, true)}<span class="finfo">${esc(info.join(' · '))}</span>
      <button class="pinbtn" data-pin aria-pressed="${pinned}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${esc(g.away.name)} at ${esc(g.home.name)}" title="${pinned ? 'Unpin' : 'Pin'}">${PIN}</button></div>
  </article>`;
}
export const grid = gs => `<div class="grid">${gs.map(g => card(g)).join('')}</div>`;

/* Shared header for detail drawers (team schedule + game). */
export function detailHead({ title, label, sub, logoSrc, color, right = '' }){
  return `<header class="dhead" data-title="${esc(label || '')}" style="--team:${esc(color || 'var(--accent)')}">
    ${logoSrc ? logo(logoSrc, 'logo lg') : ''}
    <div class="dhead-main"><h2>${title}</h2>${sub ? `<div class="dsub">${sub}</div>` : ''}</div>${right}</header>`;
}
export const panel = (title, body, extra = '') => `<section class="panel"${extra}>${title ? `<h3>${esc(title)}</h3>` : ''}${body}</section>`;
export const dateShort = d => fmtDay(new Date(d));
