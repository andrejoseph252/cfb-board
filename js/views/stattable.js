/* A table that fits a phone: rank and team pinned on the left, the other columns split into named groups, and a
   segmented control above it picking which group fills the rest (a sideways swipe or the arrow keys step through them
   too). When the table has the room (a container query in app.css), every group shows at once and the control goes
   away. The chosen group is remembered per kind of table. Used by the Rankings tab. */
import { esc, pct, store } from '../util.js';
import { state } from '../state.js';
import { realMarket } from '../markets.js';
import { teamLink, logo, gameHref } from './components.js';

export const GROUPS = {
  ap: [['poll', 'Poll'], ['week', 'This week']],
  fpi: [['power', 'Power'], ['outlook', 'Outlook'], ['week', 'This week']]
};
const viewOf = kind => { const v = store.get('sv.' + kind, null), i = GROUPS[kind].findIndex(([k]) => k === v); return i < 0 ? 0 : i; };

/* cols: [{ g: group key (none = pinned on the left), h: header, cls, title, td: row => inner html }];
   rows: [{ attrs: ' class=… data-href=…', …whatever the columns read }]. */
export function statTable(kind, cols, rows, emptyMsg){
  const groups = GROUPS[kind], i = viewOf(kind);
  const gi = c => groups.findIndex(([k]) => k === c.g);
  const pinned = cols.filter(c => !c.g).length;
  const cellCls = (c, k) => [c.cls, c.g ? `g${gi(c)}` : 'pin', c.g && cols.findIndex(x => x.g === c.g) === k ? 'gs' : ''].filter(Boolean).join(' ');
  const seg = `<div class="sv-seg" role="tablist" aria-label="Columns">${groups.map(([, l], n) =>
    `<button type="button" role="tab" data-sv="${kind}" data-svi="${n}" aria-selected="${n === i}">${esc(l)}</button>`).join('')}<span class="sv-thumb" aria-hidden="true"></span></div>`;
  const span = groups.map(([k, l], n) => { const c = cols.filter(x => x.g === k).length; return c ? `<th class="g${n} gs sv-gh" colspan="${c}">${esc(l)}</th>` : ''; }).join('');
  const head = cols.map((c, k) => `<th class="${cellCls(c, k)}"${c.title ? ` title="${esc(c.title)}"` : ''}>${c.h}</th>`).join('');
  const body = rows.length ? rows.map(r => `<tr${r.attrs || ''}>${cols.map((c, k) => `<td class="${cellCls(c, k)}">${c.td(r)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="muted sv-empty">${emptyMsg}</td></tr>`;
  return `<div class="sv sv-${kind}" data-svk="${kind}" data-i="${i}" style="--n:${groups.length};--i:${i}">${seg}
    <div class="sv-wrap"><table class="tbl sv-tbl"><thead><tr class="sv-groups"><th colspan="${pinned}" class="pin"></th>${span}</tr><tr>${head}</tr></thead>
    <tbody>${body}</tbody></table></div></div>`;
}

/* ---------- cells ---------- */
export const dash = '<span class="sv-na">–</span>';
/* A W-L record with its dash lined up down the column. */
export const recCell = (w, l, t, cls = '') => w == null ? dash : `<span class="r${cls}"><i>${w}</i>-<i>${l}${t ? '-' + t : ''}</i></span>`;
export const teamCell = (t, nameHTML) => `<span class="sv-team">${logo(t.logo, 'logo sm')}<span class="sv-nm">${nameHTML}</span></span>`;
/* FPI rating, signed with a true minus, negatives in red. */
export const rating = v => v == null ? dash : `<span class="${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}</span>`;

function weekGame(id){
  for (const g of state.games){
    if (g.home.id === id) return [g, 'home'];
    if (g.away.id === id) return [g, 'away'];
  }
  return [];
}
const day = d => d.toLocaleDateString(undefined, { weekday: 'short' });
const clock = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/:00/, '').replace(/\s?([AP])M/i, (m, a) => a.toLowerCase());
/* This week's game in three columns: opponent ("@ ⓛ USC", the full name when there's room), result / live score /
   kickoff, and the win chance (the market's, else FPI's). */
const opp = r => {
  const [g, side] = weekGame(r.id); if (!g) return '<span class="sv-bye">Bye</span>';
  const o = g[side === 'home' ? 'away' : 'home'];
  return `<span class="sv-opp"><a class="dlink" href="${gameHref(g.id)}">${g.neutral || side === 'home' ? 'vs' : '@'}</a>${logo(o.logo, 'logo xs')}<span class="ab">${teamLink(o, { label: o.abbr || o.name })}</span><span class="fn">${teamLink(o)}</span></span>`;
};
const result = r => {
  const [g, side] = weekGame(r.id); if (!g) return '';
  const me = g[side], o = g[side === 'home' ? 'away' : 'home'];
  if (g.state === 'post' && g.completed) return `<a class="sv-res ${me.winner ? 'pos' : 'neg'}" href="${gameHref(g.id)}"><b>${me.winner ? 'W' : 'L'}</b> ${esc(me.score)}-${esc(o.score)}</a>`;
  if (g.state === 'in') return `<a class="sv-res" href="${gameHref(g.id)}" title="${esc(g.detail || '')}"><span class="status live">${esc(me.score)}-${esc(o.score)}</span></a>`;
  if (g.state === 'post') return `<span class="muted">${esc(g.detail || 'Final')}</span>`;
  const d = new Date(g.date);
  return `<span class="sv-kick">${day(d)}${g.tbd ? '' : ` <span>${clock(d)}</span>`}</span>`;
};
const winChance = r => {
  const [g, side] = weekGame(r.id); if (!g || g.state !== 'pre') return '';
  const m = realMarket(g), p = m?.pHome ?? state.preds.get(g.id)?.pHome; if (p == null) return '';
  return `<span class="sv-wp" title="${m ? 'Market' : 'FPI'} win chance">${pct(side === 'home' ? p : 1 - p)}%</span>`;
};
export const weekCols = g => [
  { g, h: 'Opp', cls: 'sv-oppc', td: opp },
  { g, h: 'Result', cls: 'num', td: result },
  { g, h: 'Win', cls: 'num', title: 'Win chance (market, else FPI)', td: winChance }
];

/* ---------- switching ---------- */
function setView(kind, i, from){
  const n = GROUPS[kind].length; i = (i + n) % n;
  store.set('sv.' + kind, GROUPS[kind][i][0]);
  for (const el of document.querySelectorAll(`.sv[data-svk="${kind}"]`)){
    el.style.setProperty('--dir', i > Number(el.dataset.i) ? 1 : -1);
    el.dataset.i = i; el.style.setProperty('--i', i);
    for (const b of el.querySelectorAll('.sv-seg button')) b.setAttribute('aria-selected', String(Number(b.dataset.svi) === i));
    el.classList.remove('switching'); void el.offsetWidth; el.classList.add('switching');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('switching'), 400);
  }
  from?.focus?.({ preventScroll: true });
}
document.addEventListener('click', e => { const b = e.target.closest('.sv-seg button[data-sv]'); if (b) setView(b.dataset.sv, Number(b.dataset.svi), b); });
document.addEventListener('keydown', e => {
  const b = e.target.closest?.('.sv-seg button[data-sv]'); if (!b || !/^Arrow(Left|Right)$/.test(e.key)) return;
  e.preventDefault(); setView(b.dataset.sv, Number(b.dataset.svi) + (e.key === 'ArrowRight' ? 1 : -1));
  b.parentNode.querySelector('[aria-selected="true"]')?.focus();
});
// A sideways swipe across a narrow table steps to the next or previous group.
let touch = null;
document.addEventListener('touchstart', e => { const sv = e.target.closest?.('.sv'); touch = sv && e.touches.length === 1 ? { sv, x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!touch) return;
  const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y, sv = touch.sv; touch = null;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.6 || getComputedStyle(sv.querySelector('.sv-seg')).display === 'none') return;
  setView(sv.dataset.svk, Number(sv.dataset.i) + (dx < 0 ? 1 : -1));
}, { passive: true });
