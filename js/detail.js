/* Drawer for team schedules and game detail, driven by the URL hash (#team/ID, #game/ID)
   so browser back/forward pages through the teams and games you've opened. */
import { $ } from './util.js';
import { viewTeam } from './views/team.js';
import { viewGame, isLive } from './views/game.js';
import { state, invalidate } from './state.js';

export function route(){
  const m = /^#(team|game)\/(.+)$/.exec(location.hash);
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
    if (!el.hidden){
      el.hidden = true; document.body.classList.remove('drawer-open');
      restoreFocus?.isConnected && restoreFocus.focus({ preventScroll: true });
    }
    lastKey = null; lastHtml = ''; return;
  }
  const key = r.type + ':' + r.id;
  if (el.hidden){ restoreFocus = document.activeElement; el.hidden = false; document.body.classList.add('drawer-open'); }
  const html = r.type === 'team' ? viewTeam(r.id) : viewGame(r.id);
  if (html !== lastHtml || key !== lastKey){
    const open = key === lastKey ? [...body.querySelectorAll('details[open][data-k]')].map(d => d.dataset.k) : [];
    body.innerHTML = html; lastHtml = html;
    for (const k of open) body.querySelector(`details[data-k="${CSS.escape(k)}"]`)?.setAttribute('open', '');
  }
  $('#drawerBack').hidden = depth < 2;
  $('#drawerTitle').textContent = body.querySelector('[data-title]')?.dataset.title || (r.type === 'team' ? 'Team schedule' : 'Game');
  if (key !== lastKey){ $('#drawerScroll').scrollTop = 0; $('#drawerClose').focus({ preventScroll: true }); lastKey = key; }
}

/* Live games on this week's board refresh with each board poll (see loadBoard). One opened from elsewhere, like
   a team schedule while you're viewing another week, refreshes on its own at the same pace. */
setInterval(() => {
  const r = route();
  if (r?.type === 'game' && isLive(r.id) && !state.byId[r.id] && !document.hidden) invalidate('detail');
}, 12e3);
