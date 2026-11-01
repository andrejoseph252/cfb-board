/* Quarter summaries, with native disclosure controls for each quarter and each drive. */
import { esc } from '../util.js';
import { logo, visibleColor } from './components.js';
import { quarterRecaps } from '../drive-quarters.js';
import { playHTML } from '../plays.js';

const choices = new Map();
const period = q => q === 0 ? 'Other' : q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const tone = r => r.badge === 'INT' ? 'interception' : r.kind;

// Called before the browser changes `open`. Automatic refreshes aren't user choices.
export function rememberQuarter(details){
  const id = details.closest('.quarter-drives')?.dataset.game; if (!id) return;
  if (!choices.has(id)) choices.set(id, new Map());
  choices.get(id).set(Number(details.dataset.quarter), !details.open);
}


export function quarterDrives(g, s){
  if (!s.drives.length) return '';
  const id = String(g.id), quarters = quarterRecaps(g, s.drives), saved = choices.get(id);
  const tc = { away: visibleColor(g.away), home: visibleColor(g.home) };
  const badge = r => `<span class="qd-badge">${r.kind === 'live' ? '<i aria-hidden="true"></i>' : ''}${esc(r.badge)}</span>`;
  const rowHTML = row => {
    const { d, result: r, numbers: n } = row, team = g[d.side], opponent = d.side === 'away' ? g.home : d.side === 'home' ? g.away : null;
    const when = [period(d.q || row.q), d.clock].filter(Boolean).join(' · ');
    const description = d.desc || [n.plays == null ? '' : plural(n.plays, 'play'), n.yards == null ? '' : `${n.yards} yards`, n.elapsed || ''].filter(Boolean).join(' · ');
    return `<details class="qd-drive qd-${tone(r)}" data-k="drive-${esc(row.key)}"><summary>
      <span class="qd-drive-team">${logo(team?.logo, 'logo sm')}<small>${esc(team?.abbr || '?')}</small></span>
      <span class="qd-drive-body"><b>${esc(r.label)}</b>${r.conceded ? `<span class="qd-conceded">${esc(opponent?.abbr || 'Opponent')} ${r.badge === 'SAFETY' ? 'scores a safety' : 'scores on the return'}</span>` : ''}<small>${esc(description).replace(/, /g, ' · ')}</small></span>
      <span class="qd-drive-status">${badge(r)}<small>${esc(d.clock || period(row.q))}</small></span><i class="qd-chevron" aria-hidden="true"></i></summary>
      <p class="qd-drive-start">Started ${esc(when)}${d.start ? ` · from ${esc(d.start)}` : ''}${Number(d.q) !== row.q && d.q ? ` · finished in ${period(row.q)}` : ''}</p>
      <ol class="dplays">${d.plays.map(p => `<li>${playHTML(p, { clock: true, color: tc[p.side] || tc[d.side] })}</li>`).join('') || '<li class="qd-no-plays">Play-by-play is not available yet.</li>'}</ol>
    </details>`;
  };
  const teamScore = (side, points) => `<span class="qd-team-score">${logo(g[side].logo, 'logo sm')}<small>${esc(g[side].abbr)}</small><b>${points ?? '—'}</b></span>`;
  const cards = quarters.map(q => {
    const open = saved?.has(q.q) ? saved.get(q.q) : q.current;
    const status = q.current ? q.halftime ? 'At the half' : 'Live' : q.complete ? 'Complete' : 'Recap';
    const key = `quarter-${id}-${q.q}-${q.current ? 'current' : 'done'}`;
    const highlights = [...q.events].sort((a, b) => b.priority - a.priority || b.order - a.order).slice(0, 2).sort((a, b) => b.order - a.order);
    const moments = highlights.map(e => `<div class="qd-moment qd-${e.kind}">${badge({ kind: e.kind, badge: e.badge })}<span><b>${esc(g[e.side]?.abbr || '')}</b> ${esc(e.label)}</span>${e.clock ? `<time>${esc(e.clock)}</time>` : ''}</div>`).join('');
    const punts = q.rows.filter(row => row.result.kind === 'punt').length;
    const missed = q.rows.filter(row => row.result.kind === 'miss').length;
    const quiet = [punts ? plural(punts, 'punt') : '', missed ? `${missed} missed FG${missed === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    const td = q.events.filter(e => e.badge === 'TD' || e.badge === 'DEF TD').length;
    const fg = q.events.filter(e => e.badge === 'FG').length;
    const picks = q.events.filter(e => e.badge === 'INT' || /pick-six/.test(e.label)).length;
    const counts = [td ? `${td} TD` : '', fg ? `${fg} FG` : '', picks ? `${picks} INT` : ''].filter(Boolean).join(' · ');
    const half = q.q === 2 && (quarters.some(x => x.q >= 3) || q.halftime)
      ? '<div class="qd-half" role="separator" aria-label="Halftime"><span>Halftime</span></div>' : '';
    return `${half}<details class="qd-quarter" data-quarter="${q.q}" data-k="${esc(key)}"${open ? ' open' : ''}><summary>
      <div class="qd-top"><div class="qd-period"><b>${period(q.q)}</b><span class="${q.current ? 'qd-live' : ''}">${q.current && !q.halftime ? '<i aria-hidden="true"></i>' : ''}${status}</span></div>
        <div class="qd-score" aria-label="Quarter scoring: ${esc(g.away.abbr)} ${q.points.away ?? 'unavailable'}, ${esc(g.home.abbr)} ${q.points.home ?? 'unavailable'}">${teamScore('away', q.points.away)}<i>–</i>${teamScore('home', q.points.home)}</div></div>
      ${moments ? `<div class="qd-moments">${moments}</div>` : quiet ? `<p class="qd-quiet">${esc(quiet)}</p>` : ''}
      <div class="qd-explore"><span><span class="qd-show">Explore</span><span class="qd-hide">Hide</span> ${plural(q.rows.length, 'drive')}</span>${counts ? `<small>${counts}</small>` : ''}<i class="qd-chevron" aria-hidden="true"></i></div>
      </summary><div class="qd-drive-list">${[...q.rows].reverse().map(rowHTML).join('') || '<p class="qd-no-plays">Drive details are not available yet.</p>'}</div></details>`;
  }).join('');
  return `<section class="panel quarter-drives" data-game="${esc(id)}" aria-label="Quarter summaries"><header class="qd-head"><div><h3>Drives</h3></div><small>${plural(s.drives.length, 'drive')}<span>Latest first</span></small></header>
    <div class="qd-quarters">${cards}</div><p class="qd-footnote">Quarter scores include all points. Drives are grouped by where they finish.</p></section>`;
}
