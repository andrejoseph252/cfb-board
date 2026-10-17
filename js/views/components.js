import { esc, pct, fmtTime, fmtDay, plural } from '../util.js';
import { state } from '../state.js';
import { marketsFor, sourceLabel } from '../markets.js';
import { pins, picks } from '../picks.js';
import { excitement, isHot, realizedExcitement } from '../excitement.js';
import { lineFor } from '../lines.js';
import { upset, upsetWhy, BOLT } from '../upset.js';
import { ats, atsWhy, fmtLine } from '../ats.js';
import { isMine, mySide, myColor, STAR } from '../myteam.js';
import { scored, momentum } from '../live.js';

export const teamHref = id => `#team/${encodeURIComponent(id)}`;
export const gameHref = id => `#game/${encodeURIComponent(id)}`;

/* ESPN's team logos are 500px originals; its image resizer serves them near display size instead (about 9x smaller).
   Big logos (drawer headers) get 180px, everything else 72px, both enough for 3x phone screens. */
const ESPN_LOGO = /^https:\/\/a\.espncdn\.com\/(i\/teamlogos\/[^?#]+\.png)$/;
export function logoUrl(src, px){
  const m = ESPN_LOGO.exec(src || '');
  return m ? `https://a.espncdn.com/combiner/i?img=/${m[1]}&w=${px}&h=${px}` : src;
}
export const logo = (src, cls = 'logo') => src ? `<img class="${cls}" src="${esc(logoUrl(src, /\b(lg|mh-logo)\b/.test(cls) ? 180 : 72))}" alt="" loading="lazy">` : `<span class="${cls}"></span>`;

/* Team name that opens the schedule drawer. Pass {logo:true} to include the logo inside the link. My team gets a star. */
export function teamLink(t, { rank = true, withLogo = false, label } = {}){
  if (!t?.id) return esc(label ?? t?.name ?? 'TBD');
  const star = isMine(t.id) ? `<span class="mine-star" title="Your team">${STAR}</span>` : '';
  return `<a class="tlink" href="${teamHref(t.id)}">${withLogo ? logo(t.logo, 'logo sm') : ''}${rank && t.rank ? `<span class="rank">${t.rank}</span>` : ''}${esc(label ?? t.name)}${star}</a>`;
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

/* The team with the ball in a live game: a small football after its name, like a TV scorebug (red inside the 20). */
export function ballClass(g, t){
  if (g.state !== 'in' || !g.poss || String(g.poss) !== String(t.id)) return '';
  return g.redZone ? ' has-ball rz' : ' has-ball';
}
export const ballIcon = (g, t) => !ballClass(g, t) ? '' : `<span class="poss${g.redZone ? ' rz' : ''}" title="${esc(t.name)} ball${g.redZone ? ', in the red zone' : ''}"><svg viewBox="0 0 20 12" aria-hidden="true"><path d="M1.2 6C4.4 .6 15.6 .6 18.8 6 15.6 11.4 4.4 11.4 1.2 6Z"/><path class="lace" d="M6.6 6h6.8M8.4 4.7v2.6M10 4.7v2.6M11.6 4.7v2.6"/></svg><span class="sr"> has the ball${g.redZone ? ', red zone' : ''}</span></span>`;

function teamRow(g, side, fx){
  const t = g[side], opp = g[side === 'home' ? 'away' : 'home'];
  const lose = g.state === 'post' && g.completed && !t.winner && opp.winner;
  const pk = picks[g.id], mine = pk && pk.side === side;
  const ball = ballClass(g, t);
  return `<div class="row${lose ? ' loser' : ''}${ball}">
    <span class="stripe" style="background:${esc(t.color)}"></span>
    ${t.id ? `<a href="${teamHref(t.id)}" tabindex="-1" aria-hidden="true">${logo(t.logo)}</a>` : logo(t.logo)}
    <span class="tname"><span class="tn">${teamLink(t)}</span>${ballIcon(g, t)}<span class="rec">${esc(t.record || '')}</span>${fpiTag(t.id)}</span>
    ${mine ? `<span class="mypick ${pk.result || ''}">${pk.result === 'W' ? 'Pick hit' : pk.result === 'L' ? 'Pick missed' : 'Your pick'}</span>` : '<span></span>'}
    <span class="score${fx?.side === side ? ' bump' : ''}"${fx?.side === side ? ` style="--d:-${Math.round(fx.elapsed)}ms"` : ''}>${g.state === 'pre' ? '' : g.syncing ? '–' : esc(t.score ?? '')}</span></div>`;
}

export function statusHTML(g, bare = false){
  if (g.state === 'in' && g.syncing) return '<span class="status live">Live</span>';   // matching a stream: the clock would run ahead
  // Synced to a stream: the clock is your stream's, ticking in place every half second (sync.js).
  if (g.state === 'in' && g.syncDelay != null) return `<span class="status live" data-sclk="${esc(g.id)}">${esc(g.detail)}</span>${g.sit && !bare ? `<span>${esc(g.sit)}</span>` : ''}`;
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

const dayName = t => new Date(t).toLocaleDateString(undefined, {weekday:'short'});

/* Step path through [ms, value] points scaled into a w x h box (values 0-1, 1 at the top unless lo/hi zoom it). */
export function stepPath(pts, w, h, lo = 0, hi = 1){
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const X = t => ((t - t0) / (t1 - t0 || 1) * w).toFixed(1), Y = v => (h - (v - lo) / (hi - lo || 1) * h).toFixed(1);
  return pts.map(([t, v], i) => i ? `H${X(t)}V${Y(v)}` : `M0,${Y(v)}`).join('');
}

/* Pregame only: a tiny trend of whichever side the market has moved toward, e.g. "ISU ▲20". Hidden under 3 points. */
export function lineMove(g){
  const L = g.state === 'pre' ? lineFor(g) : null;
  if (!L || Math.abs(L.move) < .03) return '';
  const side = L.move > 0 ? 'home' : 'away', t = g[side];
  const vals = L.pts.map(([x, p]) => [x, side === 'home' ? p : 1 - p]), vs = vals.map(v => v[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs), from = vs[0], to = vs[vs.length - 1];
  const tip = `${L.src} since ${dayName(L.since)}: ${t.name} ${pct(from)}% → ${pct(to)}%`;
  return `<span class="lm" title="${esc(tip)}"><svg viewBox="-1 -1 42 16" aria-hidden="true"><path d="${stepPath(vals, 40, 14, lo, hi)}"/></svg>
    <b>${esc(t.abbr)}</b> ▲${Math.round(Math.abs(L.move) * 100)}<span class="sr"> points since ${esc(dayName(L.since))}</span></span>`;
}

/* Live: ESPN's win probability as of the latest play, which arrives with every scoreboard poll. (Market prices come
   through the bot and can be hours old mid-game, so they're only shown before kickoff and after.) */
function liveOdds(g){
  if (g.syncing) return `<div class="odds syncing"><span class="mspin" aria-hidden="true"></span>Matching your stream…</div>`;
  if (g.liveWp == null) return '';
  const pa = pct(1 - g.liveWp), ph = 100 - pa;
  return `${meter(g, g.liveWp, 'ESPN live win probability')}
    <div class="odds"><b>${esc(g.away.abbr)} ${pa}%</b><span class="src">Live win %</span><b>${ph}% ${esc(g.home.abbr)}</b></div>`;
}

/* A scoring play just happened: the card wipes to the scoring team's color with their logo and the new score. A
   re-render mid-way picks up where it was (negative animation delay), so a refresh never restarts it. */
const inkOn = hex => { const c = String(hex || '#777').replace('#', ''), n = parseInt(c.length === 3 ? [...c].map(x => x + x).join('') : c, 16) || 0;
  return ((n >> 16 & 255) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) > 160 ? '#111' : '#fff'; };
function scoreFx(g, e){
  if (!e) return '';
  const t = g[e.side], o = g[e.side === 'home' ? 'away' : 'home'], a = Number(t.score), b = Number(o.score);
  const word = { td: 'Touchdown', fg: 'Field goal', safety: 'Safety' }[e.kind];
  const where = a > b ? `leads ${a}–${b}` : a < b ? `trails ${a}–${b}` : `ties it ${a}–${b}`;
  return `<div class="tdfx ${e.kind}" style="--tc:${esc(t.color)};--ti:${inkOn(t.color)};--d:-${Math.round(e.elapsed)}ms;--len:${e.length}ms" aria-hidden="true">
    <span class="tdfx-logo">${logo(t.logo, 'logo')}</span><span class="tdfx-t"><b>${word}</b><small>${esc(t.abbr)} ${where}</small></span></div>`;
}

/* Before kickoff the two percentages (or team abbreviations, with no line yet) are the pick buttons. */
function oddsBlock(g){
  if (g.state === 'in') return liveOdds(g);
  const mk = marketsFor(g), prim = mk[0], pre = g.state === 'pre', pk = picks[g.id]?.side;
  const pickBtn = (s, text) => `<button class="opick${pk === s ? ' mine' : ''}" data-pick="${s}" aria-pressed="${pk === s}" title="${pk === s ? 'Your pick. Tap to clear' : `Pick ${esc(g[s].name)}`}">${pk === s ? '✓ ' : ''}${text}</button>`;
  if (!prim) return pre ? `<div class="odds">${pickBtn('away', esc(g.away.abbr))}<span class="src">No line yet</span>${pickBtn('home', esc(g.home.abbr))}</div>` : '';
  const pa = pct(1 - prim.pHome), ph = 100 - pa, label = sourceLabel(prim.source);
  const alt = mk.slice(1).map(m => `${m.source} ${pct(1 - m.pHome)}/${pct(m.pHome)}`).join(', ');
  const side = (s, text) => pre ? pickBtn(s, text) : `<b>${text}</b>`;
  // A moving line takes the middle slot; the source is still one tap away in the game preview.
  const mid = lineMove(g) || (prim.url ? `<a href="${esc(prim.url)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label)) + (alt ? ` · ${esc(alt)}` : '');
  return `${meter(g, prim.pHome, label)}
    <div class="odds">${side('away', `${esc(g.away.abbr)} ${pa}%`)}
      <span class="src">${mid}</span>
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

/* Live: the excitement index so far, how much the win % has swung over the game (the game drawer's number), with
   its tier and what that means in plain words. */
const LIVE_XC = { 'Instant classic': ['hi', 'wild swings all game'], Thriller: ['hi', 'big momentum swings'],
  Competitive: ['mid', 'back and forth'], 'Mostly one-sided': ['lo', 'little drama so far'] };
function liveExcitement(g){
  if (g.syncing) return '';
  const x = realizedExcitement((momentum(g) || []).map(([, v]) => v));
  if (!x) return '<div class="xc xlive pending"><span class="xc-sum">Excitement so far <b>…</b></span></div>';
  const [cls, what] = LIVE_XC[x.label];
  const flips = x.flips ? `<span class="xl-flip" title="The favorite has flipped ${x.flips} time${x.flips === 1 ? '' : 's'}">⇄ ${x.flips}</span>` : '';
  return `<div class="xc xlive" title="Excitement index: the total swing in win probability so far. Under 1 is one-sided, 2.2 and up a thriller, 3.5 and up an instant classic.">
    <span class="xc-sum"><span class="xc-score ${cls}">${x.index.toFixed(1)}</span><b class="xc-label">${esc(x.label)}</b><span class="xc-tags">${esc(what)}</span>${flips}</span></div>`;
}

export function excitementBadge(g, { open = false } = {}){
  if (g.state === 'post') return '';
  if (g.state === 'in') return liveExcitement(g);
  const x = excitement(g);
  if (x.pending) return '<div class="xc pending"><span class="xc-sum">Excitement <b>…</b></span></div>';
  const [, label, cls] = x.tier;
  return `<details class="xc" data-xc="${esc(g.id)}"${open || openXc.has(g.id) ? ' open' : ''}><summary class="xc-sum" title="Excitement ${x.score}"><span class="xc-score ${cls}">${x.score}</span>
      <b class="xc-label">${esc(label)}</b><span class="xc-tags">${esc(drivers(x))}</span>${CHEV}</summary>
    <ul class="xc-parts">${x.parts.map(p => `<li><span class="xc-k">${esc(p.k)}</span>
      <span class="xc-bar"><i style="width:${(p.pts / p.max) * 100}%"></i></span>
      <span class="xc-pts">${p.pts.toFixed(0)}/${p.max}</span><span class="xc-why">${esc(p.why)}</span></li>`).join('')}</ul></details>`;
}

/* Final cards: a quiet tag when the winner had a low chance at kickoff, e.g. "Upset 22%". */
/* The underdog lost but beat the number: "closer than expected", the cover's answer to the upset bolt. */
function coverTag(g, a){
  if (!a?.dogCover) return '';
  return `<span class="cover" title="${esc(atsWhy(g, a))}">${esc(g[a.dog].abbr)} covers +${String(a.line).replace(/\.0$/, '')}</span>`;
}
/* "TROY −9.5 · covered" on a final, so you can see at a glance how the favorite did against the spread. */
const atsInfo = (g, a) => a ? `${g[a.fav].abbr} ${fmtLine(a.line)} · ${a.result === 'covered' ? 'covered' : a.result === 'push' ? 'push' : 'didn\'t cover'}` : null;
function upsetTag(g, u){
  if (!u) return '';
  return `<span class="upset${u.big ? ' big' : ''}" title="${esc(upsetWhy(g, u))}">${BOLT}${u.big ? 'Big upset' : 'Upset'}${u.p != null ? ` ${pct(u.p)}%` : ''}</span>`;
}

const SYNC_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="8.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6.8 5.4v3.7L9.9 7.25z" fill="currentColor"/></svg>';
export const fmtDelay = s => { const t = Math.round(s); return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `${t}s`; };

/* The whole card opens the game (see main.js); close, late live games get an orange outline. */
export function card(g){
  const live = g.state === 'in', hot = live && isHot(g), pinned = pins.has(g.id), up = upset(g), mine = mySide(g), a = ats(g), fx = live ? scored(g) : null;
  const info = [live && !g.syncing ? g.sit : null, g.tv, g.book?.details && g.state === 'pre' ? g.book.details : null, atsInfo(g, a), g.neutral ? 'Neutral site' : null].filter(Boolean);
  return `<article class="game${live ? ' is-live' : ''}${hot ? ' is-hot' : ''}${pinned ? ' is-pinned' : ''}${up ? ` is-upset${up.big ? ' is-big-upset' : ''}` : ''}${a?.dogCover ? ' is-cover' : ''}${mine ? ' is-mine' : ''}" data-id="${esc(g.id)}"${mine ? ` style="--mine:${esc(myColor())}"` : ''}>
    ${teamRow(g, 'away', fx)}${teamRow(g, 'home', fx)}${oddsBlock(g)}${excitementBadge(g)}${scoreFx(g, fx)}
    <div class="foot">${statusHTML(g, true)}${g.syncDelay != null && (live || g.state === 'post') ? `<span class="synctag" title="Shown as on your stream, ${fmtDelay(g.syncDelay)} behind live">${SYNC_ICON}Synced</span>` : ''}${upsetTag(g, up)}${coverTag(g, a)}<span class="finfo">${esc(info.join(' · '))}</span>
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
