/* Week picker in the header: ‹ [Week 5 ▾] ›. The button opens a panel of every week, styled like Settings; the
   arrows (or ← → keys) step to the neighboring week. */
import { $, esc } from './util.js';
import { state } from './state.js';
import { route } from './detail.js';

const CHEV = '<svg class="wk-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const now = () => `${state.st}-${state.week}`;

function weeks(){
  const out = [];
  for (const s of state.cal) for (const e of s.entries || [])
    out.push({ v: `${s.value}-${e.value}`, label: e.label, dates: e.detail || '', group: s.label || '' });
  if (!out.length && state.week) out.push({ v: now(), label: `Week ${state.week}`, dates: '', group: '' });
  return out;
}

function panelHTML(list){
  const groups = [...new Set(list.map(w => w.group))];
  return `<h3>${esc(state.season ? `${state.season} season` : 'Season')}</h3>` + groups.map(g => `<div class="setgrp">${groups.length > 1 && g ? `<span>${esc(g)}</span>` : ''}
    <div class="wk-grid">${list.filter(w => w.group === g).map(w => `<button type="button" class="wk-opt" data-wk="${esc(w.v)}" aria-pressed="${w.v === now()}">
      <b>${esc(w.label)}${w.v === state.current ? ' <i>Now</i>' : ''}</b>${w.dates ? `<small>${esc(w.dates)}</small>` : ''}</button>`).join('')}</div></div>`).join('');
}

let go = () => {}, lastBtn = '';
export function renderWeekPicker(){
  const list = weeks(), i = list.findIndex(w => w.v === now());
  const html = `<span>${esc(list[i]?.label || (state.week ? `Week ${state.week}` : 'Week'))}</span>${CHEV}`;
  if (html !== lastBtn){ $('#week').innerHTML = html; lastBtn = html; }
  $('#wkPrev').disabled = i <= 0; $('#wkNext').disabled = i < 0 || i >= list.length - 1;
}

function step(d){ const list = weeks(), i = list.findIndex(w => w.v === now()); if (i >= 0 && list[i + d]) go(list[i + d].v); }

export function initWeekPicker(goWeek){
  go = goWeek;
  const btn = $('#week'), panel = $('#wkpanel');
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    if (!panel.hidden) return close();
    panel.innerHTML = panelHTML(weeks()); panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    // Anchored to the control's left edge; on desktop, where the controls sit at the right of the header, shift left
    // so it ends at the header's right edge (the settings gear) instead of overhanging the page.
    // Never past 12px from either side of the screen.
    panel.style.left = '0px';
    const vw = document.documentElement.clientWidth, r = panel.getBoundingClientRect();
    const edge = Math.min(vw - 12, btn.closest('.ctrl').getBoundingClientRect().right);
    const shift = Math.max(Math.min(0, edge - r.right), 12 - r.left);
    panel.style.left = `${shift}px`;
    // Start scrolled to the week being shown.
    const sel = panel.querySelector('[aria-pressed="true"]');
    if (sel) panel.scrollTop = Math.max(0, sel.offsetTop - panel.clientHeight / 2 + sel.offsetHeight / 2);
  });
  panel.addEventListener('click', e => { const b = e.target.closest('[data-wk]'); if (b){ close(); go(b.dataset.wk); } });
  $('#wkPrev').addEventListener('click', () => step(-1));
  $('#wkNext').addEventListener('click', () => step(1));
  document.addEventListener('click', e => { if (!panel.hidden && !e.target.closest('.wkstep')) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden){ close(); btn.focus(); return; }
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || route() || document.body.classList.contains('pb-open')) return;
    if (e.target.closest?.('input, select, textarea, [role="tablist"], [contenteditable]')) return;
    step(e.key === 'ArrowLeft' ? -1 : 1);
  });
}
