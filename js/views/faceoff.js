/* Best games to watch and Pinned: each card redrawn as a face-off (css/app.css, "Best games and Pinned: face-off cards").
     row 1  [logo  name / record · FPI]      day / kickoff      [name / FPI · record  logo]
     row 2  [UGA 59%] ──── the market line, its source or line move under it ──── [41% MISS]
     row 3  [rating ring  tier ⌄]                         [network · spread]  [pin]
   The card markup is the board's own (card() in components.js); this only tags it with the team colors and
   moves its parts into place, so every number, link and button keeps working. renderMain runs it right after it
   draws, before the browser paints, so the plain card never shows for a frame. The first Best game is the top game.
   Only games not yet started: a pinned game keeps the board's own card once it kicks off. */
import { state } from '../state.js';
import { barColors, sideColors } from './components.js';
import { inkOn } from './preview.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };

function card(c){
  const g = state.byId[c.dataset.id]; if (!g || g.state !== 'pre') return;
  c.dataset.fo = '1';
  const [ca, ch] = barColors(g), [la, lh] = sideColors(g), s = c.style;
  for (const [k, v] of [['--ca', ca], ['--ch', ch], ['--ia', inkOn(ca)], ['--ih', inkOn(ch)], ['--la', la], ['--lh', lh]]) s.setProperty(k, v);
  // The rating ring: its fill and color come from the excitement score and tier.
  const sc = c.querySelector('.xc-score');
  if (sc){
    const v = parseFloat(sc.textContent);
    if (isFinite(v)) s.setProperty('--xs', Math.max(0, Math.min(100, v)).toFixed(0));
    const tier = ['hi', 'mid', 'lo', 'min'].find(k => sc.classList.contains(k)) || 'lo';
    s.setProperty('--xt', `var(--x-${tier === 'min' ? 'lo' : tier})`);
  }
  const [a, h] = c.querySelectorAll(':scope > .row'); if (!a || !h) return;
  a.classList.add('r-away'); h.classList.add('r-home');

  // Middle: the kickoff as day over time ("SAT / 7:30 PM").
  const foot = c.querySelector(':scope > .foot'), st = foot?.querySelector(':scope > .status'), mid = el('div', 'fo-mid');
  if (st){
    const m = /^(\S+)\s+(.+)$/.exec(st.textContent);
    if (m){ st.textContent = ''; st.append(el('span', 'fo-day', m[1]), el('span', 'fo-time', m[2])); }
    mid.append(st);
  }
  a.after(mid);

  // Odds: [pick] [line + source] [pick].
  const odds = c.querySelector(':scope > .odds'), meter = c.querySelector(':scope > .meter');
  if (odds){
    const src = odds.querySelector(':scope > .src'), line = el('div', 'fo-line');
    if (src) src.before(line); else odds.append(line);
    if (meter) line.append(meter);
    if (src) line.append(src);
  }
  // The rating leads the footer.
  const xc = c.querySelector(':scope > .xc');
  if (xc && foot) foot.prepend(xc);

  // The favorite's number reads a step brighter, and the line gets its split point.
  const sp = c.querySelectorAll('.meter > span');
  if (sp.length === 2){
    const away = parseFloat(sp[0].style.width), home = parseFloat(sp[1].style.width);
    if (isFinite(away) && away !== home) c.querySelectorAll('.odds .opick, .odds > b').forEach((b, i) => b.classList.toggle('fav', i === (away > home ? 0 : 1)));
  }
}

export function faceoff(root){
  for (const grid of root.querySelectorAll('.grid.fo')){
    for (const c of grid.querySelectorAll(':scope > .game:not([data-fo])')) card(c);
    if (!grid.classList.contains('best')) continue;
    const top = grid.firstElementChild;
    if (top?.matches('.game[data-fo]') && !top.classList.contains('fo-hero')){
      top.classList.add('fo-hero');
      top.prepend(el('div', 'fo-eyebrow', '<span>Top game this week</span>'));
    }
  }
}
