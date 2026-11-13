/* Long-press a game card to peek, like holding something on an iPhone. Hold still for a moment: the card sinks a
   little, then a larger preview lifts out of it over a blurred board, with a menu beneath (Open game, Pin). Keep your
   finger down and slide onto something to use it on release, or let go anywhere else to close. Nothing scrolls,
   swipes or opens underneath while it's up.

   Before kickoff it's also the fastest way to pick: each team has a Win target (moneyline) and, with a line, a Cover
   target (the spread). Slide onto one and let go. Releasing on your current pick clears it. Picks are the same ones
   the Picks tab keeps (picks.js); the amount is your last bet's.

   The preview: both teams with rank and record, the score or kickoff, the win chance, a tale of the tape (FPI,
   scoring, defense, schedule), the down and distance and last play while live, your pick, and where to watch. */
import { esc, pct, fmtTime } from './util.js';
import { state } from './state.js';
import * as api from './api.js';
import { pins, picks, togglePin, setPick, setBet } from './picks.js';
import { marketsFor, sourceLabel } from './markets.js';
import { excitement } from './excitement.js';
import { outcome, fmtSpread, lastBet } from './bets.js';
import { logo, meter, statusHTML } from './views/components.js';

const HOLD = 430;          // ms of holding still before it opens
const SLOP = 9;            // px the finger may wander while holding
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let hold = null, open = null, swallowUntil = 0;

/* ---------- what it shows ---------- */
function chance(g){
  if (g.state === 'in') return g.liveWp == null ? null : { p: g.liveWp, label: 'Live win %' };
  const m = marketsFor(g)[0];
  if (m) return { p: m.pHome, label: sourceLabel(m.source) };
  const f = state.preds.get(g.id)?.pHome;
  return f == null ? null : { p: f, label: 'ESPN FPI' };
}
function lastPlay(j){
  const cur = j?.drives?.current?.plays, prev = j?.drives?.previous;
  return (cur?.length ? cur : prev?.[prev.length - 1]?.plays)?.at(-1)?.text || null;
}
const spreadOf = (g, s) => Number.isFinite(g.book?.spread) ? (s === 'home' ? g.book.spread : -g.book.spread) : null;

function team(g, s){
  const t = g[s], rk = t.rank && t.rank <= 25 ? t.rank : null, lose = g.state === 'post' && g.completed && !t.winner;
  const conf = state.standings?.byTeam[t.id]?.confRec;
  return `<div class="pk-team${lose ? ' lose' : ''}"><span class="pk-disc">${logo(t.logo, 'logo on-light')}</span>
    <b>${rk ? `<i>${rk}</i>` : ''}${esc(t.name)}</b><small>${esc([t.record, conf && `${conf.w}-${conf.l} conf`].filter(Boolean).join(' · '))}</small></div>`;
}

/* Pick targets, one column per team: Win, and Cover when there's a spread. */
function pickZone(g, c){
  const pk = picks[g.id], bet = pk?.bet ?? lastBet();
  const col = s => {
    const t = g[s], line = spreadOf(g, s), p = c ? (s === 'home' ? c.p : 1 - c.p) : null;
    const on = type => pk?.side === s && (pk.bet?.type ?? bet.type) === type;
    const btn = (type, top, sub) => `<div class="pk-pick${on(type) ? ' mine' : ''}" data-pk="pick" data-side="${s}" data-type="${type}" style="--tc:${esc(t.color || '#666')}">
      <b>${on(type) ? '✓ ' : ''}${top}</b><small>${sub}</small></div>`;
    return `<div class="pk-col">${btn('ml', 'Win', p == null ? esc(t.abbr) : `${pct(p)}%`)}${line != null ? btn('ats', `Cover ${fmtSpread(line)}`, esc(t.abbr)) : ''}</div>`;
  };
  return `<div class="pk-picks">${col('away')}${col('home')}</div>
    <div class="pk-hint">${pk ? `Your pick: <b>${esc(pk.abbr)} ${pk.bet?.type === 'ats' && pk.line != null ? fmtSpread(pk.line) : 'to win'}</b> · release on it to clear` : `Slide onto a pick and let go · $${bet.amt ?? 10} ${bet.type === 'ats' ? 'spread' : 'moneyline'} like your last`}</div>`;
}

/* Your pick on a game that's started or finished. */
function pickNote(g){
  const pk = picks[g.id]; if (!pk) return '';
  const how = pk.bet?.type === 'ats' && pk.line != null ? `${esc(pk.abbr)} ${fmtSpread(pk.line)}` : `${esc(pk.abbr)} to win`;
  const o = g.state === 'post' ? outcome(pk, g.id) : null;
  let now = '';
  if (g.state === 'in'){
    const me = Number(g[pk.side].score), them = Number(g[pk.side === 'home' ? 'away' : 'home'].score);
    const m = pk.bet?.type === 'ats' && pk.line != null ? me + pk.line - them : me - them;
    now = m > 0 ? '<em class="up">winning</em>' : m < 0 ? '<em class="down">losing</em>' : '<em>even</em>';
  } else if (o) now = o === 'W' ? '<em class="up">hit</em>' : o === 'L' ? '<em class="down">missed</em>' : '<em>push</em>';
  return `<div class="pk-mine">Your pick: <b>${how}</b>${now ? ` · ${now}` : ''}</div>`;
}

/* Tale of the tape: each team's number and the better one in bold. */
function tape(g){
  const f = state.fpi?.byTeam, s = state.standings?.byTeam, a = g.away.id, h = g.home.id;
  const gp = t => t?.overall ? t.overall.w + t.overall.l + (t.overall.t || 0) : 0;
  const per = (t, v) => v != null && gp(t) ? v / gp(t) : null;
  const rows = [
    ['FPI rank', f?.[a]?.rank, f?.[h]?.rank, true, v => `#${v}`],
    ['Points / game', s?.[a]?.ppg, s?.[h]?.ppg, false, v => v.toFixed(1)],
    ['Allowed / game', per(s?.[a], s?.[a]?.pa), per(s?.[h], s?.[h]?.pa), true, v => v.toFixed(1)],
    ['Schedule rank', f?.[a]?.sosRank, f?.[h]?.sosRank, true, v => `#${v}`]
  ].filter(r => r[1] != null && r[2] != null);
  if (!rows.length) return '';
  return `<div class="pk-tape">${rows.map(([k, x, y, low, fmt]) => {
    const ax = low ? x < y : x > y, hy = low ? y < x : y > x;
    return `<span class="${ax ? 'win' : ''}">${esc(fmt(x))}</span><small>${k}</small><span class="${hy ? 'win' : ''}">${esc(fmt(y))}</span>`;
  }).join('')}</div>`;
}

function body(g){
  const d = new Date(g.date), c = chance(g), pre = g.state === 'pre';
  const mid = pre
    ? `<div class="pk-mid"><b class="pk-time">${g.tbd ? 'TBD' : esc(fmtTime(d))}</b><small>${esc(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</small></div>`
    : `<div class="pk-mid"><b class="pk-score">${esc(g.away.score ?? '')}<span>–</span>${esc(g.home.score ?? '')}</b><small>${statusHTML(g, true)}</small></div>`;
  const x = pre ? excitement(g) : null;
  const info = [g.tv, g.venue].filter(Boolean).map(esc).join(' · ');
  return `<div class="pk-head">${team(g, 'away')}${mid}${team(g, 'home')}</div>
    ${pre ? pickZone(g, c) : c ? `<div class="pk-wp">${meter(g, c.p, c.label)}<div class="pk-wpl"><span><b>${pct(1 - c.p)}%</b> ${esc(g.away.abbr)}</span><span>${esc(c.label)}</span><span>${esc(g.home.abbr)} <b>${pct(c.p)}%</b></span></div></div>` : ''}
    ${pre ? '' : pickNote(g)}
    ${g.state === 'in' && g.sit ? `<div class="pk-sit">${esc(g.sit)}</div>` : ''}
    ${g.state === 'in' ? `<div class="pk-play" data-pk-play>${esc(lastPlay(api.peek(api.summaryUrl(g.id))) || '')}</div>` : ''}
    ${tape(g)}
    <div class="pk-info">${x && !x.pending ? `<span class="xc-score ${esc(x.tier[2])}">${x.score}</span><b>${esc(x.tier[1])}</b>` : ''}<span>${info}</span></div>`;
}

/* ---------- open, follow the finger, close ---------- */
function show(card, g){
  const r = card.getBoundingClientRect();
  card.classList.remove('pk-press');
  toastEl?.remove();
  const el = document.createElement('div');
  el.className = 'pk'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${g.away.name} at ${g.home.name}`);
  el.style.setProperty('--ca', g.away.color || '#555'); el.style.setProperty('--ch', g.home.color || '#555');
  const pinned = pins.has(g.id);
  el.innerHTML = `<div class="pk-scrim"></div><div class="pk-stack"><article class="pk-card">${body(g)}</article>
    <div class="pk-menu" role="menu"><div class="pk-act" role="menuitem" data-pk="open"><span>Open game</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="pk-act" role="menuitem" data-pk="pin"><span>${pinned ? 'Unpin' : 'Pin to top'}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 2h5l-.8 4.2 2.3 2.3H4l2.3-2.3zM8 8.5V14" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></div></div></div>`;
  document.body.append(el);
  document.body.classList.add('peek-open');

  // Place it over the card, kept on screen, then grow it out of the card's own spot.
  const stack = el.querySelector('.pk-stack'), sr = stack.getBoundingClientRect();
  const top = Math.max(16, Math.min(innerHeight - sr.height - 16, r.top + r.height / 2 - sr.height * .3));
  stack.style.top = `${top}px`;
  if (!still()){
    const pc = el.querySelector('.pk-card').getBoundingClientRect();
    const sx = r.width / pc.width, dx = r.left + r.width / 2 - (pc.left + pc.width / 2), dy = r.top - pc.top;
    stack.style.transformOrigin = '50% 0';
    stack.style.transform = `translate(${dx}px,${dy}px) scale(${sx})`;
    el.offsetWidth;
    stack.style.transform = '';
  }
  requestAnimationFrame(() => el.classList.add('on'));
  navigator.vibrate?.(8);

  // The last play, if the box score wasn't already downloaded.
  const play = el.querySelector('[data-pk-play]');
  if (play && !play.textContent) api.summary(g.id, true).then(j => { const t = lastPlay(j); if (t && play.isConnected) play.textContent = t; }).catch(() => {});

  open = { el, g, act: null };
  addEventListener('touchmove', block, { passive: false });
}
function block(e){ if (open) e.preventDefault(); }

/* Whatever the finger is over: a pick or a menu action. */
function target(x, y){
  const a = document.elementFromPoint(x, y)?.closest('[data-pk]');
  if (a === open.act) return;
  open.act?.classList.remove('hot');
  open.act = a; a?.classList.add('hot');
  if (a) navigator.vibrate?.(4);
}
function close(){
  if (!open) return;
  const { el } = open; open = null;
  removeEventListener('touchmove', block);
  document.body.classList.remove('peek-open');
  el.classList.remove('on'); el.classList.add('off');
  setTimeout(() => el.remove(), still() ? 0 : 200);
}

/* A pick made from the peek: the same pick the card's buttons make, then the bet type you slid onto. Releasing on the
   pick you already have clears it. */
function pickFrom(g, side, type){
  const pk = picks[g.id];
  if (pk?.side === side && (pk.bet?.type ?? 'ml') === type){ setPick(g, side); return toast(`Pick cleared`); }
  if (pk?.side !== side) setPick(g, side);
  setBet(g, { type });
  const line = spreadOf(g, side);
  toast(`✓ ${g[side].name} ${type === 'ats' && line != null ? fmtSpread(line) : 'to win'}`, g[side].color);
}
let toastEl = null;
function toast(text, color){
  toastEl?.remove();
  const t = toastEl = document.createElement('div');
  t.className = 'pk-toast'; t.setAttribute('role', 'status'); t.textContent = text;
  if (color) t.style.setProperty('--tc', color);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 250); }, 1700);
}

/* ---------- the gesture ---------- */
function cancelHold(){ if (!hold) return; clearTimeout(hold.timer); clearTimeout(hold.sink); hold.card.classList.remove('pk-press'); hold = null; }

addEventListener('touchstart', e => {
  if (open || e.touches.length !== 1 || document.body.classList.contains('pb-open')) return;
  const card = e.target.closest?.('.game[data-id]:not(.ghost)');
  if (!card || e.target.closest('button, details, input, select')) return;
  const g = state.byId[card.dataset.id]; if (!g) return;
  const t = e.touches[0];
  hold = { card, g, x: t.clientX, y: t.clientY,
    sink: setTimeout(() => hold?.card.classList.add('pk-press'), 120),
    timer: setTimeout(() => { if (!hold) return; const h = hold; hold = null; clearTimeout(h.sink); show(h.card, h.g); }, HOLD) };
}, { passive: true });

addEventListener('touchmove', e => {
  const t = e.touches[0];
  if (open) return target(t.clientX, t.clientY);
  if (hold && Math.hypot(t.clientX - hold.x, t.clientY - hold.y) > SLOP) cancelHold();
}, { passive: true });

addEventListener('touchend', e => {
  if (hold) return cancelHold();
  if (!open) return;
  // The release also makes a click on whatever is under the finger; don't let it open or pin anything.
  swallowUntil = performance.now() + 500;
  const t = e.changedTouches[0]; target(t.clientX, t.clientY);
  const a = open.act, g = open.g;
  close();
  if (!a) return;
  if (a.dataset.pk === 'open') location.hash = '#game/' + g.id;
  else if (a.dataset.pk === 'pin') togglePin(g.id);
  else if (a.dataset.pk === 'pick') pickFrom(g, a.dataset.side, a.dataset.type);
}, { passive: true });
addEventListener('touchcancel', () => { cancelHold(); close(); }, { passive: true });

addEventListener('click', e => { if (performance.now() < swallowUntil){ e.preventDefault(); e.stopPropagation(); } }, true);
/* The browser's own long-press menu (Android, and Chrome's phone emulation on a laptop) fires about half a second
   in, after ours has opened and over it. Left alone it takes the release, the touchend never comes, and the peek
   stays up invisibly blocking every scroll. So: no browser menu during a hold or a peek, or on a card. */
addEventListener('contextmenu', e => {
  if (hold || open || (e.target.closest?.('.game[data-id]') && matchMedia('(hover: none)').matches)) e.preventDefault();
}, true);
addEventListener('scroll', cancelHold, { passive: true, capture: true });

/* Safety nets, so a peek can never be left up: a new touch, the finger lifting without a touchend (pointerup still
   comes), leaving the page or the app. */
let ends = 0;
addEventListener('touchstart', () => { if (open) close(); }, { passive: true, capture: true });
addEventListener('touchend', () => { ends++; }, { passive: true, capture: true });
const lifted = () => { const n = ends; setTimeout(() => { if (open && ends === n) close(); }, 120); };
addEventListener('pointerup', lifted, { passive: true });
addEventListener('pointercancel', lifted, { passive: true });
const reset = () => { cancelHold(); close(); };
addEventListener('blur', reset);
document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
