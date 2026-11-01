/* Scrubbable probability chart for the game drawer: drag, hover, tap or use arrow keys to see each play. */
import { esc, pct } from '../util.js';
import { state, invalidate } from '../state.js';
import { sideColors } from './components.js';
import { playHTML, readPlay } from '../plays.js';
import { rememberQuarter } from './drives.js';

const charts = new Map();
const W = 600, H = 140;

export const MODES = [['win', 'Win'], ['cover', 'Cover'], ['total', 'Over/under']];

const fmtLine = n => n > 0 ? `+${n}` : String(n);

/* pts: [{pid, home, cover?, over?}], plays: Map pid -> {q, clock, text, away, home} */
export function chartHTML(g, pts, plays, line){
  const modes = MODES.filter(([m]) => m === 'win' || (m === 'cover' ? line?.spread != null : line?.ou != null) && pts.some(p => p[m === 'cover' ? 'cover' : 'over'] != null));
  const mode = modes.some(([m]) => m === state.wpMode) ? state.wpMode : 'win';
  const key = mode === 'win' ? 'home' : mode === 'cover' ? 'cover' : 'over';
  const [ca, ch] = sideColors(g);

  // Carry the last known game situation forward for points without a matching play (timeouts, reviews).
  let last = { q: 1, clock: '15:00', play: null, away: 0, home: 0 };
  const series = pts.filter(p => p[key] != null).map(p => {
    const pl = plays.get(p.pid);
    if (pl) last = { q: pl.q ?? last.q, clock: pl.clock ?? last.clock, play: pl.text ? pl : last.play, away: pl.away ?? last.away, home: pl.home ?? last.home };
    return { v: p[key], ...last, fresh: !!pl };
  });
  if (series.length < 2) return '';

  const hl = line?.spread, top = mode === 'win' ? g.home.abbr : mode === 'cover' ? `${g.home.abbr} ${fmtLine(hl)}` : `Over ${line.ou}`;
  const bot = mode === 'win' ? g.away.abbr : mode === 'cover' ? `${g.away.abbr} ${fmtLine(-hl)}` : `Under ${line.ou}`;
  const [cTop, cBot] = mode === 'total' ? ['var(--accent)', 'var(--muted)'] : [ch, ca];
  const marks = keyMarks(g, series, mode, { away: ca, home: ch });
  const short = mode === 'total' ? ['Over', 'Under'] : [g.home.abbr, g.away.abbr];
  const moments = marks.filter(m => Math.abs(m.d) >= .06).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5).sort((a, b) => a.i - b.i);
  for (const m of moments) m.key = true;
  charts.set(g.id, { series, g, mode, top, bot, cTop, cBot, ca, ch, marks });

  const n = series.length, x = i => i / (n - 1) * W;
  const path = series.map((p, i) => `${x(i).toFixed(1)},${((1 - p.v) * H).toFixed(1)}`).join(' ');
  const ticks = [];
  for (let i = 1; i < n; i++) if (series[i].q !== series[i - 1].q) ticks.push([i, series[i].q]);
  const qlab = q => q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`;

  return `<div class="wpc" data-gid="${esc(g.id)}">
    ${modes.length > 1 ? `<div class="seg wpc-modes" role="group" aria-label="Chart type">${modes.map(([m, l]) => `<button type="button" data-wpmode="${m}" aria-pressed="${m === mode}">${l}</button>`).join('')}</div>` : ''}
    <div class="wpc-plot" tabindex="0" role="slider" aria-label="Scrub through the game" aria-valuemin="0" aria-valuemax="${n - 1}" aria-valuenow="${n - 1}">
      <span class="wplab top" style="color:${esc(cTop)}">${esc(top)}</span><span class="wplab bot" style="color:${esc(cBot)}">${esc(bot)}</span>
      <svg class="wp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="${W}" height="${H / 2}" fill="${esc(cTop)}" class="wpc-band"/><rect x="0" y="${H / 2}" width="${W}" height="${H / 2}" fill="${esc(cBot)}" class="wpc-band"/>
        ${ticks.map(([i]) => `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${H}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('')}
        <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <polyline points="${path}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      ${marks.map(m => `<span class="wpc-mk ${m.kind}${m.key ? ' key' : ''}" data-i="${m.i}" style="left:${(m.i / (n - 1) * 100).toFixed(3)}%;top:${((1 - series[m.i].v) * 100).toFixed(2)}%;--mc:${esc(m.color)}"></span>`).join('')}
      <span class="wpc-cursor" style="left:100%"></span><span class="wpc-dot" style="left:100%;top:${(1 - series[n - 1].v) * 100}%"></span>
    </div>
    <div class="wpc-ticks">${['Q1', ...ticks.map(([i, q]) => [i, qlab(q)])].map(t => typeof t === 'string' ? `<span style="left:0">${t}</span>` : `<span style="left:${(t[0] / (n - 1) * 100).toFixed(2)}%">${t[1]}</span>`).join('')}</div>
    <div class="wpc-read">
      <div class="wpc-head" aria-live="polite">${readout(g.id, n - 1)}</div>
      <div class="wpc-play">${playBox(g.id, n - 1)}</div>
    </div>
    ${moments.length ? `<div class="wpc-moments"><span class="wpc-mlab">Key moments</span>${moments.map(m => {
      const up = m.d > 0, p = series[m.i];
      return `<button type="button" class="wpc-km" data-wpi="${m.i}"><i style="background:${esc(up ? cTop : cBot)}"></i><span class="muted">${p.q <= 4 ? 'Q' + p.q : 'OT'} ${esc(p.clock)}</span> <b>${esc(m.label)}</b> <span class="wpc-kd" style="color:${esc(up ? cTop : cBot)}">${esc(short[up ? 0 : 1])} +${Math.round(Math.abs(m.d) * 100)}%</span></button>`;
    }).join('')}</div>` : ''}
    <div class="wpc-key"><span><i class="wpc-mk score"></i>Score</span><span><i class="wpc-mk to"></i>Turnover</span>${moments.length ? '<span><i class="wpc-mk key"></i>Biggest swings</span>' : ''}</div>
  </div>`;
}

/* Plays worth a marker on the line: scores (in the scoring team's color), turnovers and missed or blocked kicks,
   plus any play that moved the chart 6+ points. d is the change from the previous point, from the top side's view. */
function keyMarks(g, series, mode, color){
  const out = [];
  for (let i = 1; i < series.length; i++){
    const p = series[i], prev = series[i - 1];
    if (!p.fresh || !p.play) continue;
    const d = p.v - prev.v, tags = readPlay(p.play).tags.map(t => t[1]), has = l => tags.includes(l);
    const pts = p.home - prev.home + p.away - prev.away;  // a lone extra point isn't a moment
    const scorer = pts < 2 ? null : p.home > prev.home ? 'home' : 'away';
    let kind = null, label = null;
    if (scorer){
      kind = 'score';
      label = `${g[scorer].abbr} ${has('TOUCHDOWN') ? 'TD' : has('SAFETY') ? 'safety' : has('GOOD') ? 'FG' : 'score'}`;
    } else if (has('INT') || has('FUMBLE') || has('ON DOWNS') || has('TURNOVER') || has('BLOCKED') || has('NO GOOD')){
      kind = 'to';
      label = has('INT') ? 'Interception' : has('FUMBLE') ? 'Fumble lost' : has('ON DOWNS') ? 'Stop on downs' : has('BLOCKED') ? 'Blocked kick' : has('NO GOOD') ? 'Missed FG' : 'Turnover';
    } else if (Math.abs(d) >= .06){
      kind = 'swing';
      const yds = readPlay(p.play).yds;
      label = yds != null && Math.abs(yds) >= 10 ? `${Math.abs(yds)}-yd ${yds > 0 ? 'gain' : 'loss'}` : /^4th/.test(p.play.dd || '') ? '4th-down play' : 'Big play';
    }
    if (!kind) continue;
    const side = scorer || (d >= 0 ? 'home' : 'away');
    out.push({ i, d, kind, label, color: kind === 'score' ? color[scorer] : mode === 'total' ? 'var(--ink)' : color[side] });
  }
  return out;
}

/* The readout: who leads and the situation, then the play on one line of fixed height, so nothing moves while
   scrubbing. Only the description gives way to an ellipsis; down, tags and yards stay. The full text is in the
   tooltip and in the drive below. */
function readout(gid, i){
  const c = charts.get(gid); if (!c) return '';
  const p = c.series[i], g = c.g, up = p.v >= .5, v = up ? p.v : 1 - p.v;
  const who = up ? c.top : c.bot, color = up ? c.cTop : c.cBot;
  const what = c.mode === 'win' ? 'to win' : c.mode === 'cover' ? 'to cover' : '';
  const when = i === 0 && !p.fresh ? 'Pregame' : `${p.q <= 4 ? 'Q' + p.q : 'OT'} ${esc(p.clock)}`;
  const pre = i === 0 && !p.fresh || !p.play;
  return `<div class="wpc-big"><i style="background:${esc(color)}"></i><b>${esc(who)}</b> <span class="wpc-pct">${(v * 100).toFixed(1)}%</span> <span class="muted">${what}</span></div>
    <div class="wpc-sit"><span>${when}</span><span>${esc(g.away.abbr)} ${esc(p.away)} – ${esc(g.home.abbr)} ${esc(p.home)}</span>${pre || !p.play.id ? '' : `<button type="button" class="wpc-drive" data-wpdrive="${esc(p.play.id)}">Show drive <span aria-hidden="true">↓</span></button>`}</div>`;
}
function playLine(c, p){
  const pl = p.play, r = readPlay(pl), color = pl.side === 'home' ? c.ch : pl.side === 'away' ? c.ca : null;
  if (r.kind === 'break') return `<span class="wpc-pl-main muted">${r.line}</span>`;
  const dot = color ? `<i class="pl-dot" style="background:${esc(color)}"></i>` : '';
  const down = pl.dd && r.kind !== 'kick' ? `<b class="wpc-pl-dd">${esc(pl.dd)}</b>` : '';
  const tags = r.tags.map(([k, l]) => `<span class="pl-tag ${k}">${l}</span>`).join('');
  const yd = r.yds == null ? '' : `<span class="pl-yd ${r.yds > 0 ? 'up' : r.yds < 0 ? 'down' : ''}">${r.yds > 0 ? '+' : r.yds < 0 ? '−' : ''}${Math.abs(r.yds)}</span>`;
  return `${dot}${down}<span class="wpc-pl-main" title="${esc(pl.text || '')}">${r.line}</span>${tags}${yd}`;
}
function playBox(gid, i){
  const c = charts.get(gid), p = c.series[i];
  return `<div class="wpc-pl"${p.play?.side ? ` style="--tc:${esc(p.play.side === 'home' ? c.ch : c.ca)}"` : ''}>${i === 0 && !p.fresh || !p.play ? '<span class="wpc-pl-main muted">Before kickoff</span>' : playLine(c, p)}</div>`;
}

function scrubTo(plot, i){
  const wrap = plot.closest('.wpc'), c = charts.get(wrap?.dataset.gid); if (!c) return;
  const n = c.series.length; i = Math.max(0, Math.min(n - 1, i));
  const left = `${(i / (n - 1) * 100).toFixed(3)}%`;
  plot.querySelector('.wpc-cursor').style.left = left;
  const dot = plot.querySelector('.wpc-dot'); dot.style.left = left; dot.style.top = `${(1 - c.series[i].v) * 100}%`;
  plot.setAttribute('aria-valuenow', i); plot.dataset.i = i;
  wrap.querySelector('.wpc-head').innerHTML = readout(wrap.dataset.gid, i);
  wrap.querySelector('.wpc-play').innerHTML = playBox(wrap.dataset.gid, i);
  for (const el of wrap.querySelectorAll('.wpc-mk[data-i], .wpc-km')) el.classList.toggle('on', Number(el.dataset.i ?? el.dataset.wpi) === i);
}
/* Scrubbing within a few pixels of a marked play lands on it, so key moments are easy to hit with a finger. */
const idxAt = (plot, clientX) => {
  const r = plot.getBoundingClientRect(), c = charts.get(plot.closest('.wpc').dataset.gid), n = c.series.length;
  const i = Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (n - 1)), px = r.width / (n - 1);
  let best = null;
  for (const m of c.marks) if (Math.abs(m.i - i) * px <= 8 && (!best || Math.abs(m.i - i) < Math.abs(best.i - i))) best = m;
  return best ? best.i : i;
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
/* "Show drive": open the play's quarter and drive below the chart, bring the play into view and flash it. */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-wpdrive]'); if (!b) return;
  const li = b.closest('#drawerBody, body').querySelector(`.quarter-drives li[data-pid="${CSS.escape(b.dataset.wpdrive)}"]`); if (!li) return;
  // Open without the expand animation, so the play's final position is known before scrolling to it.
  const qd = li.closest('.quarter-drives'); qd.classList.add('qd-instant');
  setTimeout(() => qd.classList.remove('qd-instant'), 300);
  for (let d = li.closest('details'); d; d = d.parentElement.closest('details')) if (!d.open){
    if (d.matches('.qd-quarter')) rememberQuarter(d);
    d.open = true;
  }
  li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
});
document.addEventListener('click', e => {
  const k = e.target.closest('.wpc-km');
  if (k){ const plot = k.closest('.wpc').querySelector('.wpc-plot'); scrubTo(plot, Number(k.dataset.wpi)); return; }
  const b = e.target.closest('[data-wpmode]'); if (!b) return;
  state.wpMode = b.dataset.wpmode; invalidate('detail');
});
