import { $, esc, store } from './util.js';
import { invalidate } from './state.js';
import { myTeam, setMyTeam, STAR } from './myteam.js';

const MODES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
export const PALETTES = [['field', 'Field', '#1F6F43'], ['stadium', 'Stadium', '#C44E14'], ['paper', 'Paper', '#8A4B1C'], ['mono', 'Mono', '#111111']];

// Defaults are dark Mono; the pre-paint script in index.html and demo.html uses the same defaults.
const settings = { mode: 'dark', palette: 'mono', ...store.get('settings', {}) };

function apply(){
  const root = document.documentElement;
  if (settings.mode === 'system') delete root.dataset.theme; else root.dataset.theme = settings.mode;
  if (settings.palette === 'field') delete root.dataset.palette; else root.dataset.palette = settings.palette;
  // Match the phone's browser bar to the page background of whatever theme is showing.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  invalidate();   // my team's ring color is picked against the background
}
// With "System", follow the phone when it switches between light and dark.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (settings.mode === 'system') apply(); });

function panelHTML(){
  const seg = (key, items) => `<div class="seg seg-${key}" role="group">${items.map(([v, l, c]) =>
    `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${settings[key] === v}">${c ? `<span class="sw" style="background:${c}"></span>` : ''}${l}</button>`).join('')}</div>`;
  return `<h3>Settings</h3>
    <div class="setgrp"><span>Appearance</span>${seg('mode', MODES)}</div>
    <div class="setgrp"><span>Theme</span>${seg('palette', PALETTES)}</div>
    <div class="setgrp"><span>My team</span>${myTeam
      ? `<div class="mine-set"><b>${STAR}${esc(myTeam.name)}</b><button type="button" data-clearmine>Clear</button></div>`
      : '<p class="mine-hint">Open any team and tap <b>Make my team</b>. Its game is always pinned, with a ring in its color.</p>'}</div>`;
}

export function initSettings(){
  apply();
  const btn = $('#gear'), panel = $('#setpanel');
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    if (open) panel.innerHTML = panelHTML();
    panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    if (open){
      // Anchored to the gear's right edge; shift right if that pushes it off the left of a narrow screen.
      panel.style.right = '0px';
      const left = panel.getBoundingClientRect().left;
      if (left < 12) panel.style.right = `${left - 12}px`;
    }
  });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-clearmine]')){ setMyTeam(null); panel.innerHTML = panelHTML(); return; }
    const b = e.target.closest('[data-set]'); if (!b) return;
    settings[b.dataset.set] = b.dataset.val; store.set('settings', settings); apply();
    for (const x of panel.querySelectorAll(`[data-set="${b.dataset.set}"]`)) x.setAttribute('aria-pressed', String(x === b));
  });
  document.addEventListener('click', e => { if (!panel.hidden && !e.target.closest('.settings')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden){ close(); btn.focus(); } });
}
