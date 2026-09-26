import { $, esc, store, fmtTime } from './util.js';
import { state, onRender, invalidate } from './state.js';
import { loadBoard, refreshStandings, refreshFpi, refreshRankings } from './data.js';
import { initSettings } from './settings.js';
import { picks, weekLabel, togglePin, setPick, removePick } from './picks.js';
import { renderDetail, initHistory, onHashChange, closeDrawer, back, route } from './detail.js';
import { openXc } from './views/components.js';
import { viewWeek, weekList, viewTop25 } from './views/slate.js';
import { viewConferences } from './views/conferences.js';
import { viewRankings } from './views/rankings.js';
import { viewCompare } from './views/compare.js';
import { viewPicks } from './views/picks.js';

const TABS = [
  ['week', 'This week', viewWeek, true], ['top25', 'Top 25', viewTop25, true], ['conf', 'Conferences', viewConferences, false],
  ['rankings', 'Rankings', viewRankings, false],
  ['compare', 'Forecasts', viewCompare, true], ['picks', 'My picks', viewPicks, false]
];
if (state.tab === 'mvp') state.tab = 'compare';
if (state.tab === 'standings') state.tab = 'conf';
if (state.tab === 'power') state.tab = 'rankings';
if (!TABS.some(([k]) => k === state.tab)) state.tab = 'week';

/* ---------- rendering ---------- */
let lastTabs = '', lastMain = '';
function renderHeader(){
  $('#wkTitle').textContent = state.week ? weekLabel(state.st, state.week) : 'This week';
  const gs = state.games, live = gs.filter(g => g.state === 'in').length, rr = gs.filter(g => g.home.rank && g.away.rank).length;
  $('#wkSub').textContent = state.loading && !gs.length ? 'Loading the slate…' :
    `${gs.length} FBS games · ${rr} ranked matchup${rr === 1 ? '' : 's'}${live ? ` · ${live} live` : ''}${state.updated ? ` · Updated ${fmtTime(state.updated)}` : ''}`;
  const counts = { week: gs.length, top25: gs.filter(g => g.home.rank || g.away.rank).length, picks: Object.values(picks).filter(p => !p.result).length || null };
  const tabs = TABS.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}${counts[k] ? `<span class="n">${counts[k]}</span>` : ''}</button>`).join('');
  if (tabs !== lastTabs){ $('#tabs').innerHTML = tabs; lastTabs = tabs; }
  buildWeekSelect();
}

let lastWeekOpts = '';
function buildWeekSelect(){
  const opts = [];
  for (const s of state.cal) for (const e of s.entries || []) opts.push([`${s.value}-${e.value}`, e.label + (s.value == 3 ? ' (post)' : '')]);
  if (!opts.length && state.week) opts.push([`${state.st}-${state.week}`, `Week ${state.week}`]);
  const html = opts.map(([v, l]) => `<option value="${esc(v)}"${v === `${state.st}-${state.week}` ? ' selected' : ''}>${esc(l)}</option>`).join('');
  if (html !== lastWeekOpts){ $('#week').innerHTML = html; lastWeekOpts = html; }
}

function mainHTML(){
  const [, , fn, needsGames] = TABS.find(([k]) => k === state.tab);
  if (needsGames){
    if (state.err && !state.games.length) return `<div class="err"><b>Couldn't load games.</b> ${esc(state.err)}. Check your connection, then try again.<br><button id="retry">Try again</button></div>`;
    if (state.loading && !state.games.length) return `<div class="grid">${'<div class="skeleton"></div>'.repeat(6)}</div>`;
    if (!state.games.length) return '<div class="empty">No FBS games this week. Pick another week from the menu.</div>';
  }
  return fn();
}
function renderMain(){
  const html = mainHTML();
  if (html === lastMain) return;
  const v = $('#view'), focused = document.activeElement?.id === 'q';
  v.innerHTML = html; lastMain = html;
  if (focused){ const q = $('#q'); if (q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
onRender({ header: renderHeader, main: () => { renderHeader(); renderMain(); }, detail: renderDetail });

/* ---------- events ---------- */
function setTab(k){
  state.tab = k; store.set('tab', k);
  invalidate('main'); window.scrollTo({ top: 0 });
}
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.tab) return setTab(d.tab);
  if (d.conf){ state.conf = d.conf; store.set('conf', d.conf); return invalidate('main'); }
  if (d.sort){ state.sort = d.sort; return invalidate('main'); }
  if (d.tier){ state.tier = d.tier; store.set('tier', d.tier); return invalidate('main'); }
  if (d.rk){ state.rk = d.rk; store.set('rk', d.rk); return invalidate('main'); }
  if (d.rkconf){ state.rkConf = d.rkconf; return invalidate('main'); }
  if (d.unpick) return removePick(d.unpick);
  if (t.id === 'retry') return loadBoard({ fresh: true });
  if (t.id === 'drawerClose' || t.id === 'scrim') return closeDrawer();
  if (t.id === 'drawerBack') return back();
  const g = state.byId[t.closest('.game')?.dataset.id]; if (!g) return;
  if ('pin' in d) togglePin(g.id);
  else if (d.pick) setPick(g, d.pick);
});
document.addEventListener('input', e => {
  if (e.target.id === 'q'){ state.q = e.target.value; const l = $('#list'); if (l) l.innerHTML = weekList(); lastMain = ''; }
});
document.addEventListener('toggle', e => {
  const id = e.target.dataset?.xc; if (!id) return;
  e.target.open ? openXc.add(id) : openXc.delete(id);
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && route()) closeDrawer(); });
window.addEventListener('hashchange', onHashChange);
$('#week').addEventListener('change', e => {
  const [st, wk] = e.target.value.split('-'); state.st = st; state.week = wk; state.q = '';
  state.pickedWeek = e.target.value !== state.current;
  loadBoard();
});

/* ---------- boot ---------- */
initSettings();
initHistory();
invalidate();
loadBoard();
refreshFpi();
refreshStandings();
refreshRankings();
