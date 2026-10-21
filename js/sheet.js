/* Phones: the detail drawer (a game, a team, AP ballots) is a sheet that rises from the bottom. Drag it down to close:
   by its bar any time, or by its content once that's scrolled to the top. A quick flick closes it too; a short drag
   springs back. (On wider screens it's the side panel and none of this applies.) */
import { closeDrawer } from './detail.js';

const narrow = matchMedia('(max-width:640px)');
export const sheetMode = () => narrow.matches;

const $ = s => document.querySelector(s);
let drag = null;

addEventListener('touchstart', e => {
  if (!sheetMode() || e.touches.length !== 1 || $('#drawer')?.hidden) return;
  const sheet = $('#drawer .sheet'); if (!sheet?.contains(e.target)) return;
  const sc = $('#drawerScroll'), onBar = !!e.target.closest('.sheet-bar');
  if (!onBar && (sc.scrollTop > 0 || e.target.closest('input, textarea, select'))) return;
  const y = e.touches[0].clientY;
  drag = { x: e.touches[0].clientX, y, onBar, sc, sheet, on: false, dy: 0, prev: { dy: 0, t: performance.now() }, last: { dy: 0, t: performance.now() } };
}, { passive: true });

addEventListener('touchmove', e => {
  if (!drag) return;
  const dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
  if (!drag.on){
    // Decide once: sideways (a scrolling table or chips) or upward is the content's, not ours.
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    if (dy <= 0 || Math.abs(dx) > dy || !drag.onBar && drag.sc.scrollTop > 0){ drag = null; return; }
    drag.on = true; drag.sheet.classList.remove('settle'); drag.sheet.classList.add('dragging');
  }
  if (e.cancelable) e.preventDefault();   // the sheet moves, the content doesn't scroll or bounce
  drag.dy = Math.max(0, dy);
  drag.prev = drag.last; drag.last = { dy: drag.dy, t: performance.now() };
  drag.sheet.style.transform = `translateY(${drag.dy}px)`;
  $('#scrim').style.opacity = String(Math.max(.15, 1 - drag.dy / (drag.sheet.offsetHeight * .9)));
}, { passive: false });

function end(){
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.on) return;
  d.sheet.classList.remove('dragging');
  const v = (d.last.dy - d.prev.dy) / Math.max(1, d.last.t - d.prev.t);   // px per ms, downward
  if (d.dy > d.sheet.offsetHeight * .22 || v > .55 && d.dy > 24){
    // Close from right where it is.
    d.sheet.style.setProperty('--dy', `${d.dy}px`);
    d.sheet.style.transform = ''; $('#scrim').style.opacity = '';
    closeDrawer();
    setTimeout(() => d.sheet.style.removeProperty('--dy'), 400);
  } else {
    d.sheet.classList.add('settle');
    d.sheet.style.transform = ''; $('#scrim').style.opacity = '';
    setTimeout(() => d.sheet.classList.remove('settle'), 350);
  }
}
addEventListener('touchend', end, { passive: true });
addEventListener('touchcancel', end, { passive: true });
