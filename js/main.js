import { $, esc, store, fmtTime } from './util.js';
import { state, onRender, invalidate } from './state.js';
import { loadBoard, refreshStandings, refreshFpi, refreshRankings, anyLive, LIVE_POLL } from './data.js';
import { initSettings } from './settings.js';
import { initWeekPicker, renderWeekPicker } from './weekpicker.js';
import { picks, weekLabel, togglePin, setPick, removePick } from './picks.js';
import { renderDetail, initHistory, onHashChange, closeDrawer, back, route } from './detail.js';
import { openXc } from './views/components.js';
import { isMine, setMyTeam, myTeam } from './myteam.js';
import { viewWeek, weekList, viewTop25 } from './views/slate.js';
import { viewConferences } from './views/conferences.js';
import { viewRankings } from './views/rankings.js';
import { viewPicks } from './views/picks.js';
import { viewMyTeam, picking, pickList } from './views/teamtab.js';
import { news, hasUnseen, setNewsFilter, markRead, toggleStory } from './news.js';

const TABS = [
  ['week', 'This week', viewWeek, true], ['top25', 'Top 25', viewTop25, true], ['conf', 'Conferences', viewConferences, false],
  ['rankings', 'Rankings', viewRankings, false],
  ['team', 'My team', viewMyTeam, false], ['picks', 'My picks', viewPicks, false]
];
if (state.tab === 'standings') state.tab = 'conf';
if (state.tab === 'power') state.tab = 'rankings';
if (!TABS.some(([k]) => k === state.tab)) state.tab = 'week';

/* ---------- rendering ---------- */
let lastTabs = '', lastMain = '', firstPaint = false;
function renderHeader(){
  $('#wkTitle').textContent = state.week ? weekLabel(state.st, state.week) : 'This week';
  const gs = state.games, live = gs.filter(g => g.state === 'in').length, rr = gs.filter(g => g.home.rank && g.away.rank).length;
  $('#wkSub').textContent = state.loading && !gs.length ? 'Loading the slate…' :
    `${gs.length} FBS games · ${rr} ranked matchup${rr === 1 ? '' : 's'}${live ? ` · ${live} live` : ''}${state.updated ? ` · Updated ${fmtTime(state.updated)}` : ''}`;
  const counts = { week: gs.length, top25: gs.filter(g => g.home.rank || g.away.rank).length, picks: Object.values(picks).filter(p => !p.result).length || null };
  // The My team tab is labeled with the team once one is picked.
  const label = (k, l) => k === 'team' && myTeam ? esc(myTeam.name) : l;
  const tabs = TABS.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${label(k, l)}${counts[k] ? `<span class="n">${counts[k]}</span>` : ''}</button>`).join('');
  if (tabs !== lastTabs){ $('#tabs').innerHTML = tabs; lastTabs = tabs; }
  renderWeekPicker();
  renderStale();
  news();   // keeps the league feed fresh for the news button's dot
  $('#newsDot').hidden = !hasUnseen();
}

/* During live games, a chip under the tab bar says when the scores have stopped updating (three missed polls,
   or no connection), so an old score never passes for a current one. */
const staleEl = Object.assign(document.createElement('div'), { className: 'stale', hidden: true });
staleEl.setAttribute('role', 'status');
$('.tabs').append(staleEl);
function renderStale(){
  const age = state.updated ? Date.now() - state.updated : 0;
  const offline = navigator.onLine === false;
  const show = anyLive() && (offline || age > 3 * LIVE_POLL + 5e3);
  staleEl.hidden = !show;
  if (!show) return;
  const s = Math.round(age / 1000), ago = s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  staleEl.textContent = `${offline ? 'Offline' : 'Reconnecting'} · scores from ${ago}`;
}
// The chip's age has to count up even when no new data arrives.
setInterval(() => { if (anyLive() && !document.hidden) renderStale(); }, 5e3);
window.addEventListener('offline', renderStale);

function mainHTML(){
  const [, , fn, needsGames] = TABS.find(([k]) => k === state.tab);
  if (needsGames){
    if (state.err && !state.games.length) return `<div class="err"><b>Couldn't load games.</b> ${esc(state.err)}. Check your connection, then try again.<br><button id="retry">Try again</button></div>`;
    if (state.loading && !state.games.length) return `<div class="grid">${'<div class="skeleton"></div>'.repeat(6)}</div>`;
    if (!state.games.length) return '<div class="empty">No FBS games this week. Pick another week from the menu.</div>';
  }
  // Same for tabs: a bug in one shows an error there rather than taking down the page.
  try{ return fn(); }
  catch(e){ console.error(e); return `<div class="err"><b>Something went wrong showing this tab.</b> ${esc(e.message)}</div>`; }
}
function renderMain(){
  const html = mainHTML();
  if (html === lastMain) return;
  const v = $('#view'), fid = document.activeElement?.id, keep = fid === 'q' || fid === 'tq';
  v.innerHTML = html; lastMain = html;
  if (!firstPaint && state.games.length){ firstPaint = true; settle(); }
  const box = keep ? $('#' + fid) : null;
  if (box){ box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  // Team picker: put the cursor in its search box (desktop only; on phones that would pop the keyboard).
  else if ($('#tq') && matchMedia('(pointer: fine)').matches && !document.activeElement?.closest('#view')) $('#tq').focus({ preventScroll: true });
}
onRender({ header: renderHeader, main: () => { renderHeader(); renderMain(); }, detail: renderDetail });

/* ---------- events ---------- */
function setTab(k){
  state.tab = k; store.set('tab', k);
  invalidate('main'); window.scrollTo({ top: 0 });
}
document.addEventListener('click', e => {
  // Tapping a card anywhere except its links, buttons or the excitement dropdown opens the game.
  const c = e.target.closest('.game[data-id]');
  if (c && !e.target.closest('a, button, details')){ location.hash = '#game/' + c.dataset.id; return; }
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.tab) return setTab(d.tab);
  if (d.conf){ state.conf = d.conf; store.set('conf', d.conf); return invalidate('main'); }
  if (d.sort){ state.sort = d.sort; return invalidate('main'); }
  if (d.tier){ state.tier = d.tier; store.set('tier', d.tier); return invalidate('main'); }
  if (d.rk){ state.rk = d.rk; store.set('rk', d.rk); return invalidate('main'); }
  if (d.rkconf){ state.rkConf = d.rkconf; return invalidate('main'); }
  if (d.unpick) return removePick(d.unpick);
  if (d.mine){
    // From the picker: choose (tapping the current team just closes it). From a team page: toggle.
    const fromPicker = !!t.closest('.picker'), team = { id: d.mine, name: d.name, color: d.color, logo: d.logo };
    if (fromPicker){ Object.assign(picking, { on: false, q: '', conf: null }); window.scrollTo({ top: 0 }); return isMine(d.mine) ? invalidate('main') : setMyTeam(team); }
    return setMyTeam(isMine(d.mine) ? null : team);
  }
  if ('teamchange' in d){ Object.assign(picking, { on: true, q: '', conf: null }); return invalidate('main'); }
  if ('pickcancel' in d){ picking.on = false; return invalidate('main'); }
  if (d.pickconf){ Object.assign(picking, { conf: picking.conf === d.pickconf && !picking.q ? null : d.pickconf, q: '' }); return invalidate('main'); }
  if (t.id === 'newsBtn'){ location.hash = '#news'; return; }
  if (t.id === 'playBtn'){ return openGame(); }
  if (d.play){ return openGame(d.play.split(',')); }
  if (d.newsf) return setNewsFilter(d.newsf);
  if (d.newsopen){ setNewsFilter(d.newsopen); location.hash = '#news'; return; }
  if (t.id === 'retry') return loadBoard({ fresh: true });
  if (t.id === 'drawerClose' || t.id === 'scrim') return closeDrawer();
  if (t.id === 'drawerBack') return back();
  const g = state.byId[t.closest('.game')?.dataset.id]; if (!g) return;
  if ('pin' in d) togglePin(g.id);
  else if (d.pick) setPick(g, d.pick);
});
/* News stories: opening one on ESPN marks it read. On phones, tapping a story with a summary unfolds it instead;
   its "Read on ESPN" link opens it. */
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-read]'); if (!a) return;
  const it = a.closest('.news-item');
  if (a.classList.contains('news-main') && it && 'desc' in it.dataset && matchMedia('(max-width: 520px)').matches){
    e.preventDefault(); return toggleStory(it.dataset.story);
  }
  markRead(a.dataset.read);
});
document.addEventListener('input', e => {
  if (e.target.id === 'q'){ state.q = e.target.value; const l = $('#list'); if (l) l.innerHTML = weekList(); lastMain = ''; }
  if (e.target.id === 'tq'){ picking.q = e.target.value; const l = $('#pickList'); if (l) l.innerHTML = pickList(); $('.pick-confs')?.classList.toggle('searching', !!picking.q); lastMain = ''; }
});
document.addEventListener('toggle', e => {
  const rc = e.target.dataset?.recap; if (rc){ store.set(rc, e.target.open); lastMain = ''; return; }
  const id = e.target.dataset?.xc; if (!id) return;
  e.target.open ? openXc.add(id) : openXc.delete(id);
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && route()) closeDrawer();
  // Team picker: Enter picks the first match.
  if (e.key === 'Enter' && e.target.id === 'tq'){ e.preventDefault(); $('#pickList .pick-team')?.click(); }
});
window.addEventListener('hashchange', onHashChange);

/* ---------- Coach Andre's Bowl, the arcade game (loaded on demand, shown at #play) ---------- */
let pb = null, pbPrefill = null, pbPushed = false;
function openGame(prefill = null){ pbPrefill = prefill; pbPushed = true; location.hash = '#play'; }
function exitGame(){
  if (pbPushed){ pbPushed = false; history.back(); }
  else { history.replaceState(null, '', location.pathname + location.search); syncGame(); }
}
function syncGame(){
  const want = location.hash === '#play';
  if (want && !pb?.isOpen()) import('./game/pixelbowl.js').then(m => { pb = m; m.open({ prefill: pbPrefill, exit: exitGame }); pbPrefill = null; }).catch(e => console.error(e));
  else if (!want && pb?.isOpen()) pb.close();
}
window.addEventListener('hashchange', syncGame);
/* Week picker (see weekpicker.js). Picking the current week goes back to following ESPN's current week. */
function goWeek(v){
  if (!v || v === `${state.st}-${state.week}`) return;
  const [st, wk] = v.split('-'); state.st = st; state.week = wk; state.q = '';
  state.pickedWeek = v !== state.current;
  loadBoard();
}

/* ---------- boot ---------- */
/* Opened from the iPhone home screen, iOS sometimes paints the first frames before it has settled the scroll
   position under the translucent status bar, so the page sits shifted down until the first touch. Until you touch
   or scroll, nudge it into place whenever things settle (and don't let iOS restore an old scroll position). */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let touched = false;
const settle = () => {
  if (touched || location.hash || window.scrollY > 0) return;
  requestAnimationFrame(() => { window.scrollTo(0, 1); window.scrollTo(0, 0); });
};
for (const ev of ['touchstart', 'wheel', 'keydown']) window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true });
window.addEventListener('load', settle);
window.addEventListener('pageshow', settle);
document.addEventListener('visibilitychange', () => { if (!document.hidden){ touched = false; settle(); } });
for (const ms of [0, 250, 800, 2000]) setTimeout(settle, ms);

// Sticky group headers sit just below the sticky tab bar, whose height depends on font and screen size.
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--tabs-h', e.target.offsetHeight + 'px')).observe($('.tabs'));
initSettings();
initWeekPicker(goWeek);
syncGame();
initHistory();
invalidate();
loadBoard();
refreshFpi();
refreshStandings();
refreshRankings();
