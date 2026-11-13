/* Swipe between weeks, for touch screens: on the Week tab, swipe left for the next week, right for the one before.
   The board follows your finger a little while you drag; let go far or fast enough and it slides out, the week
   changes, and the new one slides in from the other side. At the first or last week it springs back.

   Left alone: swipes that start at the screen's edges (iPhone's back gesture), on anything that scrolls sideways
   (tables, strips), on form fields and menus, and whenever a game or the drawer is open. A mostly-downward drag is
   pull to refresh's (pull.js), never a swipe. */
import { state } from './state.js';
import { route } from './detail.js';
import { canStep, stepWeek } from './weekpicker.js';

const EDGE = 24;           // px at each screen edge left to the system's own gestures
const COMMIT = 80;         // px dragged that changes the week on release
const FLICK = .45;         // px/ms: a quick flick changes it sooner
const SKIP = 'input, textarea, select, button.chip, .setpanel, #wkpanel, .btabs, .wpc-plot, .ptr';
const view = document.getElementById('view');
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let s = null;

/* Whether the touch starts inside something that scrolls sideways (it keeps the drag for itself). */
function inSideScroller(t){
  for (let n = t; n && n !== view && n !== document.body; n = n.parentElement){
    if (n.scrollWidth > n.clientWidth + 1){
      const o = getComputedStyle(n).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}

function move(x, ms){
  view.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.8,.3,1),opacity ${ms}ms` : 'none';
  view.style.transform = x ? `translate3d(${x}px,0,0)` : '';
}
const clear = () => { view.style.transition = view.style.transform = view.style.opacity = view.style.willChange = ''; };

addEventListener('touchstart', e => {
  s = null;
  if (e.touches.length !== 1 || state.tab !== 'week' || route() || location.hash === '#play' || document.body.classList.contains('pb-open')) return;
  const t = e.touches[0];
  if (t.clientX < EDGE || t.clientX > innerWidth - EDGE || !view.contains(e.target) || e.target.closest(SKIP) || inSideScroller(e.target)) return;
  s = { x: t.clientX, y: t.clientY, t: performance.now(), on: false };
}, { passive: true });

addEventListener('touchmove', e => {
  if (!s) return;
  // A long-press peek (peek.js) took over this touch.
  if (document.body.classList.contains('peek-open')){ if (s.on){ move(0, 200); setTimeout(clear, 220); } s = null; return; }
  const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
  if (!s.on){
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    // Decide once: clearly sideways is a swipe; anything else is a scroll (or a pull) and is left alone.
    if (Math.abs(dx) < Math.abs(dy) * 1.6){ s = null; return; }
    s.on = true; view.style.willChange = 'transform';
  }
  // The board follows at a third of the finger, and only a little way when there's no week in that direction.
  const room = canStep(dx < 0 ? 1 : -1);
  move(Math.sign(dx) * Math.min(room ? 70 : 24, Math.abs(dx) * (room ? .33 : .12)));
}, { passive: true });

function end(e){
  if (!s?.on){ s = null; return; }
  const dx = (e.changedTouches[0]?.clientX ?? s.x) - s.x, v = Math.abs(dx) / Math.max(1, performance.now() - s.t);
  const d = dx < 0 ? 1 : -1;
  s = null;
  if (!(Math.abs(dx) > COMMIT || (Math.abs(dx) > 40 && v > FLICK)) || !canStep(d)){ move(0, 260); setTimeout(clear, 280); return; }
  if (still()){ clear(); stepWeek(d); return; }
  // Out the way the finger went, change the week, in from the other side.
  move(-d * 90, 140); view.style.opacity = '0';
  setTimeout(() => {
    stepWeek(d);
    move(d * 60, 0); view.offsetWidth;
    move(0, 240); view.style.opacity = '';
    setTimeout(clear, 260);
  }, 140);
}
addEventListener('touchend', end, { passive: true });
addEventListener('touchcancel', () => { if (s?.on){ move(0, 200); setTimeout(clear, 220); } s = null; }, { passive: true });
