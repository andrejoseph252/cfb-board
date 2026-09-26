import { $, store } from './util.js';

const MODES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
export const PALETTES = [['field', 'Field', '#1F6F43'], ['stadium', 'Stadium', '#C44E14'], ['paper', 'Paper', '#8A4B1C'], ['mono', 'Mono', '#111111']];

const settings = { mode: 'system', palette: 'field', ...store.get('settings', {}) };

function apply(){
  const root = document.documentElement;
  if (settings.mode === 'system') delete root.dataset.theme; else root.dataset.theme = settings.mode;
  if (settings.palette === 'field') delete root.dataset.palette; else root.dataset.palette = settings.palette;
}

function panelHTML(){
  const seg = (key, items) => `<div class="seg" role="group">${items.map(([v, l, c]) =>
    `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${settings[key] === v}">${c ? `<span class="sw" style="background:${c}"></span>` : ''}${l}</button>`).join('')}</div>`;
  return `<h3>Settings</h3>
    <div class="setgrp"><span>Appearance</span>${seg('mode', MODES)}</div>
    <div class="setgrp"><span>Theme</span>${seg('palette', PALETTES)}</div>`;
}

export function initSettings(){
  apply();
  const btn = $('#gear'), panel = $('#setpanel');
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    if (open) panel.innerHTML = panelHTML();
    panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  });
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    settings[b.dataset.set] = b.dataset.val; store.set('settings', settings); apply();
    for (const x of panel.querySelectorAll(`[data-set="${b.dataset.set}"]`)) x.setAttribute('aria-pressed', String(x === b));
  });
  document.addEventListener('click', e => { if (!panel.hidden && !e.target.closest('.settings')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden){ close(); btn.focus(); } });
}
