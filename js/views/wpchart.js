/* Scrubbable probability chart for the game drawer: drag, hover, tap or use arrow keys to see each play. */
import { esc, pct } from '../util.js';
import { state, invalidate } from '../state.js';
import { barColors } from './components.js';

const charts = new Map();
const W = 600, H = 140;

export const MODES = [['win', 'Win'], ['cover', 'Cover'], ['total', 'Over/under']];

const fmtLine = n => n > 0 ? `+${n}` : String(n);

/* pts: [{pid, home, cover?, over?}], plays: Map pid -> {q, clock, text, away, home} */
export function chartHTML(g, pts, plays, line){
  const modes = MODES.filter(([m]) => m === 'win' || (m === 'cover' ? line?.spread != null : line?.ou != null) && pts.some(p => p[m === 'cover' ? 'cover' : 'over'] != null));
  const mode = modes.some(([m]) => m === state.wpMode) ? state.wpMode : 'win';
  const key = mode === 'win' ? 'home' : mode === 'cover' ? 'cover' : 'over';
  const [ca, ch] = barColors(g);

  // Carry the last known game situation forward for points without a matching play (timeouts, reviews).
  let last = { q: 1, clock: '15:00', text: 'Kickoff', away: 0, home: 0 };
  const series = pts.filter(p => p[key] != null).map(p => {
    const pl = plays.get(p.pid);
    if (pl) last = { q: pl.q ?? last.q, clock: pl.clock ?? last.clock, text: pl.text || last.text, away: pl.away ?? last.away, home: pl.home ?? last.home };
    return { v: p[key], ...last, fresh: !!pl };
  });
  if (series.length < 2) return '';

  const hl = line?.spread, top = mode === 'win' ? g.home.abbr : mode === 'cover' ? `${g.home.abbr} ${fmtLine(hl)}` : `Over ${line.ou}`;
  const bot = mode === 'win' ? g.away.abbr : mode === 'cover' ? `${g.away.abbr} ${fmtLine(-hl)}` : `Under ${line.ou}`;
  const [cTop, cBot] = mode === 'total' ? ['var(--accent)', 'var(--muted)'] : [ch, ca];
  charts.set(g.id, { series, g, mode, top, bot, cTop, cBot });

  const n = series.length, x = i => i / (n - 1) * W;
  const path = series.map((p, i) => `${x(i).toFixed(1)},${((1 - p.v) * H).toFixed(1)}`).join(' ');
  const ticks = [];
  for (let i = 1; i < n; i++) if (series[i].q !== series[i - 1].q) ticks.push([i, series[i].q]);
  const qlab = q => q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`;

  return `<div class="wpc" data-gid="${esc(g.id)}">
    ${modes.length > 1 ? `<div class="seg wpc-modes" role="group" aria-label="Chart type">${modes.map(([m, l]) => `<button type="button" data-wpmode="${m}" aria-pressed="${m === mode}">${l}</button>`).join('')}</div>` : ''}
    <div class="wpc-read" aria-live="polite">${readout(g.id, n - 1)}</div>
    <div class="wpc-plot" tabindex="0" role="slider" aria-label="Scrub through the game" aria-valuemin="0" aria-valuemax="${n - 1}" aria-valuenow="${n - 1}">
      <span class="wplab top" style="color:${esc(cTop)}">${esc(top)}</span><span class="wplab bot" style="color:${esc(cBot)}">${esc(bot)}</span>
      <svg class="wp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="${W}" height="${H / 2}" fill="${esc(cTop)}" opacity=".13"/><rect x="0" y="${H / 2}" width="${W}" height="${H / 2}" fill="${esc(cBot)}" opacity=".13"/>
        ${ticks.map(([i]) => `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${H}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('')}
        <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <polyline points="${path}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <span class="wpc-cursor" style="left:100%"></span><span class="wpc-dot" style="left:100%;top:${(1 - series[n - 1].v) * 100}%"></span>
    </div>
    <div class="wpc-ticks">${['Q1', ...ticks.map(([i, q]) => [i, qlab(q)])].map(t => typeof t === 'string' ? `<span style="left:0">${t}</span>` : `<span style="left:${(t[0] / (n - 1) * 100).toFixed(2)}%">${t[1]}</span>`).join('')}</div>
  </div>`;
}

function readout(gid, i){
  const c = charts.get(gid); if (!c) return '';
  const p = c.series[i], g = c.g, up = p.v >= .5, v = up ? p.v : 1 - p.v;
  const who = up ? c.top : c.bot, color = up ? c.cTop : c.cBot;
  const what = c.mode === 'win' ? 'to win' : c.mode === 'cover' ? 'to cover' : '';
  const when = i === 0 && !p.fresh ? 'Pregame' : `${p.q <= 4 ? 'Q' + p.q : 'OT'} ${esc(p.clock)}`;
  return `<div class="wpc-big"><i style="background:${esc(color)}"></i><b>${esc(who)}</b> <span class="wpc-pct">${(v * 100).toFixed(1)}%</span> <span class="muted">${what}</span></div>
    <div class="wpc-sit"><span>${when}</span><span>${esc(g.away.abbr)} ${esc(p.away)} – ${esc(g.home.abbr)} ${esc(p.home)}</span></div>
    <div class="wpc-play">${esc(i === 0 && !p.fresh ? 'Before kickoff' : p.text.replace(/^\(\d+:\d+\)\s*/, ''))}</div>`;
}

function scrubTo(plot, i){
  const wrap = plot.closest('.wpc'), c = charts.get(wrap?.dataset.gid); if (!c) return;
  const n = c.series.length; i = Math.max(0, Math.min(n - 1, i));
  const left = `${(i / (n - 1) * 100).toFixed(3)}%`;
  plot.querySelector('.wpc-cursor').style.left = left;
  const dot = plot.querySelector('.wpc-dot'); dot.style.left = left; dot.style.top = `${(1 - c.series[i].v) * 100}%`;
  plot.setAttribute('aria-valuenow', i); plot.dataset.i = i;
  wrap.querySelector('.wpc-read').innerHTML = readout(wrap.dataset.gid, i);
}
const idxAt = (plot, clientX) => {
  const r = plot.getBoundingClientRect(), c = charts.get(plot.closest('.wpc').dataset.gid);
  return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (c.series.length - 1));
};
const reset = plot => scrubTo(plot, charts.get(plot.closest('.wpc').dataset.gid).series.length - 1);

document.addEventListener('pointerdown', e => {
  const plot = e.target.closest('.wpc-plot'); if (!plot) return;
  plot.dataset.active = '1'; scrubTo(plot, idxAt(plot, e.clientX));
});
document.addEventListener('pointermove', e => {
  const plot = e.target.closest('.wpc-plot'); if (!plot) return;
  if (e.pointerType === 'mouse' || plot.dataset.active) scrubTo(plot, idxAt(plot, e.clientX));
});
document.addEventListener('pointerup', e => { const plot = e.target.closest('.wpc-plot'); if (plot) delete plot.dataset.active; });
document.addEventListener('pointerout', e => {
  const plot = e.target.closest('.wpc-plot');
  if (plot && e.pointerType === 'mouse' && !plot.contains(e.relatedTarget)) reset(plot);
});
document.addEventListener('keydown', e => {
  const plot = e.target.closest?.('.wpc-plot'); if (!plot) return;
  const i = Number(plot.dataset.i ?? plot.getAttribute('aria-valuemax')), step = e.shiftKey ? 10 : 1;
  if (e.key === 'ArrowLeft'){ scrubTo(plot, i - step); e.preventDefault(); }
  else if (e.key === 'ArrowRight'){ scrubTo(plot, i + step); e.preventDefault(); }
  else if (e.key === 'Home'){ scrubTo(plot, 0); e.preventDefault(); }
  else if (e.key === 'End'){ reset(plot); e.preventDefault(); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-wpmode]'); if (!b) return;
  state.wpMode = b.dataset.wpmode; invalidate('detail');
});
