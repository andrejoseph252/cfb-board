/* Pull to refresh, for touch screens. The board blocks the browser's own (overscroll-behavior: none, and the
   home-screen app has none at all), so this draws its own: pull down from the top of the board or of an open
   game, past the line, and let go. Everything cached is marked stale, then the scoreboard (and the open game's
   box score) are fetched fresh. The page itself never moves; only the round indicator slides down.

   The indicator is a football: it lies on its side and stands up on the tee as you pull, spirals while the
   refresh runs, and turns into goalposts when it's done. */
import { sheetMode } from './sheet.js';
import * as api from './api.js';
import { invalidate } from './state.js';
import { loadBoard } from './data.js';
import { route } from './detail.js';

const TRIGGER = 64, MAX = 96, REST = 52;   // px the indicator travels: release point, farthest, while refreshing
// Places a downward drag means something else: the win-probability chart (drag to scrub), form fields, menus.
// Sideways scrollers are fine: a sideways drag is never taken for a pull.
const SKIP = 'input, textarea, select, .wpc-plot, .setpanel';

const el = Object.assign(document.createElement('div'), { className: 'ptr', hidden: true });
el.setAttribute('aria-hidden', 'true');
const BALL = 'M12 2.5C17.6 6 17.6 18 12 21.5 6.4 18 6.4 6 12 2.5Z';
el.innerHTML = `<svg viewBox="0 0 24 24"><defs><clipPath id="ptrClip"><path d="${BALL}"/></clipPath></defs>
  <g class="ptr-ball"><g class="ptr-wob"><path class="ptr-leather" d="${BALL}"/>
    <g clip-path="url(#ptrClip)"><path class="ptr-stripe" d="M7 6.4q5 1.8 10 0M7 17.6q5-1.8 10 0"/>
      <g class="ptr-laces"><path d="M12 8.6v6.8M10.7 9.9h2.6M10.7 11.4h2.6M10.7 12.9h2.6M10.7 14.4h2.6"/></g></g></g></g>
  <path class="ptr-ok" d="M12 21.5V14M5.5 14h13M5.5 14V3.5M18.5 14V3.5"/></svg>`;
document.body.append(el);
const live = Object.assign(document.createElement('div'), { className: 'sr' });
live.setAttribute('role', 'status');
document.body.append(live);

let start = null, dist = 0, busy = false;

function scrollerFor(t){
  if (location.hash === '#play' || t.closest(SKIP)) return null;
  const sheet = t.closest('#drawerScroll');
  if (sheet) return sheetMode() ? null : sheet;   // phones: pulling the sheet down closes it (sheet.js)
  return route() ? null : document.scrollingElement;   // drawer open: only its own content pulls
}
function show(d, state){
  dist = d; el.hidden = false;
  el.dataset.state = state;
  el.style.transform = `translate(-50%, ${d - 44}px)`;
  el.style.setProperty('--rot', `${-90 + Math.min(1, d / TRIGGER) * 90}deg`);   // on its side → up on the tee
  el.style.opacity = String(Math.min(1, d / 40));
}
function hide(){
  el.dataset.state = 'off'; el.style.transform = 'translate(-50%, -44px)'; el.style.opacity = '0';
  setTimeout(() => { if (!busy && !start) el.hidden = true; }, 220);
}

addEventListener('touchstart', e => {
  if (busy || e.touches.length !== 1) return;
  const sc = scrollerFor(e.target);
  if (!sc || sc.scrollTop > 0) return;
  start = { x: e.touches[0].clientX, y: e.touches[0].clientY, sc, pulling: false };
}, { passive: true });

addEventListener('touchmove', e => {
  if (!start) return;
  const dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y;
  if (!start.pulling){
    // Decide once: a mostly-sideways drag, an upward one, or a page that has scrolled since isn't a pull.
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (dy <= 0 || Math.abs(dx) > dy || start.sc.scrollTop > 0){ start = null; return; }
    start.pulling = true; el.classList.add('drag');
  }
  // Resistance: the indicator follows at half speed and slows further toward the end.
  const d = Math.min(MAX, dy * .5 * (1 - Math.min(dy, 400) / 1200));
  show(d, d >= TRIGGER ? 'ready' : 'pull');
}, { passive: true });

const end = () => {
  if (!start) return;
  const go = start.pulling && dist >= TRIGGER;
  start = null; el.classList.remove('drag');
  if (go) refresh(); else hide();
};
addEventListener('touchend', end, { passive: true });
addEventListener('touchcancel', end, { passive: true });

async function refresh(){
  busy = true; show(REST, 'busy'); live.textContent = 'Refreshing';
  api.expireAll();
  const r = route(), t0 = Date.now();
  await Promise.all([
    loadBoard({ silent: true, fresh: true }),
    r?.type === 'game' ? api.summary(r.id, true).catch(() => {}) : null
  ]);
  invalidate('main', 'header', 'detail');
  // Long enough to see the ball spiral even when the network is instant.
  await new Promise(res => setTimeout(res, Math.max(0, 700 - (Date.now() - t0))));
  show(REST, 'done'); live.textContent = 'Updated';
  setTimeout(() => { busy = false; hide(); }, 650);
}
