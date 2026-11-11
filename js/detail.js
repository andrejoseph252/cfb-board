/* Drawer for team schedules, game detail, AP ballots and news, driven by the URL hash (#team/ID, #game/ID, #ballots/ID, #news)
   so browser back/forward pages through the teams and games you've opened. */
import { $, esc } from './util.js';
import { morph } from './morph.js';
import { hint } from './sheet.js';
import { viewTeam } from './views/team.js';
import { viewGame, isLive } from './views/game.js';
import { viewNews } from './views/news.js';
import { viewBallots } from './views/ballots.js';
import { state, invalidate } from './state.js';

export function route(){
  if (location.hash === '#news') return { type: 'news', id: '' };
  const m = /^#(team|game|ballots)\/(.+)$/.exec(location.hash);
  return m ? { type: m[1], id: decodeURIComponent(m[2]) } : null;
}

/* depth = how many drawer entries sit on top of the page's own history entry */
let depth = 0;
export function initHistory(){
  if (route()) history.replaceState({ d: 0 }, '');
}
export function onHashChange(){
  if (!route()) depth = 0;
  else if (history.state?.d == null){ depth += 1; history.replaceState({ d: depth }, ''); }
  else depth = history.state.d;
  invalidate('detail');
}
export function closeDrawer(){
  if (depth > 0) history.go(-depth);
  else { history.replaceState(null, '', location.pathname + location.search); depth = 0; invalidate('detail'); }
}
export function back(){ depth > 1 ? history.back() : closeDrawer(); }

let lastKey = null, lastHtml = '', restoreFocus = null;
export function renderDetail(){
  const r = route(), el = $('#drawer'), body = $('#drawerBody');
  if (!r){
    if (!el.hidden && !el.classList.contains('closing')){
      // Slide out, then hide (reopened in the meantime: it stays).
      el.classList.add('closing'); document.body.classList.remove('drawer-open');
      setTimeout(() => { if (!route()){ el.hidden = true; } el.classList.remove('closing'); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
      restoreFocus?.isConnected && restoreFocus.focus({ preventScroll: true });
    }
    lastKey = null; lastHtml = ''; return;
  }
  const key = r.type + ':' + r.id;
  el.classList.remove('closing');
  if (el.hidden){ restoreFocus = document.activeElement; el.hidden = false; document.body.classList.add('drawer-open'); hint(); }
  // Typing a clock time into the stream sync panel: hold refreshes until they're done, so the boxes keep what they typed.
  if (key === lastKey && document.activeElement?.matches?.('#drawerBody .syncp input')) return;
  // A bug in one view shows an error in the drawer instead of leaving it stuck on its loading skeleton.
  let html;
  try{ html = r.type === 'news' ? viewNews() : r.type === 'team' ? viewTeam(r.id) : r.type === 'ballots' ? viewBallots(r.id) : viewGame(r.id); }
  catch(e){ console.error(e); html = `<div class="err"><b>Something went wrong showing this.</b> ${esc(e.message)}</div>`; }
  if (html !== lastHtml || key !== lastKey){
    // The same drawer refreshing changes only what's different (morph.js keeps its open fold-outs as they are).
    if (key === lastKey) morph(body, html); else body.innerHTML = html;
    lastHtml = html;
  }
  $('#drawerBack').hidden = depth < 2;
  const head = body.querySelector('[data-title]');
  $('#drawerTitle').textContent = head?.dataset.title || (r.type === 'team' ? 'Team schedule' : r.type === 'ballots' ? 'AP ballots' : r.type === 'news' ? 'News' : 'Game');
  // A small line of context above the title (the view's own, or what kind of page this is).
  $('#drawerEyebrow').textContent = head?.dataset.eyebrow ?? ({ team: 'Schedule', ballots: 'AP poll', news: 'College football' })[r.type] ?? '';
  if (key !== lastKey){ $('#drawerScroll').scrollTop = 0; $('#drawerClose').focus({ preventScroll: true }); lastKey = key; scrolled(); }
}

/* The bar sits flush with the page until the content scrolls under it; then a hairline separates them. */
const scrolled = () => $('.sheet-bar').classList.toggle('scrolled', $('#drawerScroll').scrollTop > 2);
$('#drawerScroll').addEventListener('scroll', scrolled, { passive: true });

/* Live games on this week's board refresh with each board poll (see loadBoard). One opened from elsewhere, like
   a team schedule while you're viewing another week, refreshes on its own at the same pace. */
setInterval(() => {
  const r = route();
  if (r?.type === 'game' && isLive(r.id) && !state.byId[r.id] && !document.hidden) invalidate('detail');
}, 12e3);
