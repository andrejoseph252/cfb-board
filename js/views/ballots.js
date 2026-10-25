/* A ranked team's AP ballots (#ballots/ID): how every voter has them this week, how much the voters agree, how
   that's moved over the season, and each ballot by name. #ballots/poll: how sure the voters are as a group, week by
   week (the "stats" scripts/ballots.py works out). */
import { esc } from '../util.js';
import { state } from '../state.js';
import { ballots, weeksOf, teamWeek, matchesPoll, rankText, NR } from '../ballots.js';
import { detailHead, panel, chips } from './components.js';

const f1 = x => x.toFixed(1).replace(/\.0$/, '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* A small box plot of one team's ballots on a 1-25 (then NR) scale: the line runs from the best ballot to the
   worst, the box is the middle half of the voters, the tick is the median. */
export function boxPlot(t, { w = 100, h = 12, cls = 'bx', max = NR } = {}){
  const x = r => 2 + (Math.min(r, max) - 1) / (max - 1) * (w - 4), y = h / 2;
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <line class="trk" x1="2" x2="${w - 2}" y1="${y}" y2="${y}"/>
    <line class="wh" x1="${x(t.hi)}" x2="${x(t.lo)}" y1="${y}" y2="${y}"/>
    <rect class="iq" x="${x(t.q1)}" y="${y - 3.5}" width="${Math.max(2, x(t.q3) - x(t.q1))}" height="7" rx="1.5"/>
    <line class="md" x1="${x(t.med)}" x2="${x(t.med)}" y1="${y - 5}" y2="${y + 5}"/></svg>`;
}

/* How much they agree, in words. */
function consensus(t){
  const share = t.near / t.n, m = Math.round(t.med);
  if (m >= NR) return `Most voters leave them off; ${plural(t.on, 'ballot')} of ${t.n} have them.`;
  const word = share >= .85 ? 'Near-unanimous' : share >= .65 ? 'Clear consensus' : share >= .45 ? 'Some disagreement' : 'Split';
  return `<b>${word}:</b> ${t.near} of ${t.n} voters (${Math.round(share * 100)}%) have them within two spots of #${m}.`;
}

/* Every ballot as a bar per rank (1st to 25th, then not ranked); the median rank is marked. */
function histogram(t){
  const W = 380, H = 150, top = 16, base = H - 22, bw = (W - 2 * (NR - 1)) / NR, max = Math.max(...t.dist.slice(1));
  const bars = t.dist.slice(1).map((c, i) => {
    const r = i + 1, x = i * (bw + 2), hgt = c ? Math.max(3, (base - top) * c / max) : 0, isMed = r === Math.round(t.med);
    const label = `${r >= NR ? 'Not ranked' : '#' + r}: ${plural(c, 'voter')}`;
    return `<g class="hb${isMed ? ' med' : ''}"><title>${label}</title><rect class="hit" x="${x}" y="${top - 12}" width="${bw}" height="${base - top + 12}"/>
      ${c ? `<path class="bar" style="fill:${heat(v / hi)}" d="M${x},${base}V${base - hgt + 3}q0,-3 3,-3h${bw - 6}q3,0 3,3V${base}Z"/><text class="cnt" x="${x + bw / 2}" y="${base - hgt - 4}">${c}</text>` : ''}</g>`;
  }).join('');
  const ticks = [1, 5, 10, 15, 20, 25, NR].map(r => `<text class="ax" x="${(r - 1) * (bw + 2) + bw / 2}" y="${H - 6}">${r >= NR ? 'NR' : r}</text>`).join('');
  return `<svg class="bhist" viewBox="0 0 ${W} ${H}" role="img" aria-label="How many voters ranked them at each spot"><line class="base" x1="0" x2="${W}" y1="${base + .5}" y2="${base + .5}"/>${bars}${ticks}</svg>`;
}

/* How contested, as a color: plain (settled) warming through amber to red (contested), t from 0 to 1. Bent so the
   ordinary middle stays plain and only what stands out warms up. */
const heat = t => (t = Math.max(0, t) ** 1.7) <= .5 ? `color-mix(in oklab,var(--heat-mid) ${Math.round(t * 200)}%,var(--soft))`
  : `color-mix(in oklab,var(--heat-hi) ${Math.round((t - .5) * 200)}%,var(--heat-mid))`;

/* The poll as a whole: a line (consensus) or bars (churn) per week, one x position per week so the two line up.
   The chosen week is drawn solid; hover a week for its number. */
function weekChart(st, weeks, w, key, bars){
  const W = 380, H = 130, L = 26, top = 18, base = H - 20, step = (W - L) / weeks.length;
  const x = wk => L + step * (weeks.indexOf(wk) + .5);
  const vals = weeks.map(wk => st[wk]?.[key]).filter(v => v != null);
  const lo = bars ? 0 : Math.floor((Math.min(...vals) - 3) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 3) / 10) * 10;   // tens, so the middle line is a round number
  const y = v => base - (v - lo) / (hi - lo) * (base - top);
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line class="gr" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ay" x="${L - 5}" y="${y(v) + 3.5}">${f1(v)}</text>`).join('');
  const axis = weeks.map(wk => `<text class="ax${wk === w ? ' on' : ''}" x="${x(wk)}" y="${H - 5}">Wk ${wk}</text>`).join('');
  const pts = weeks.filter(wk => st[wk]?.[key] != null);
  const label = wk => `${esc(st[wk].label || 'Week ' + wk)}: ${f1(st[wk][key])}`;
  let marks;
  if (bars){
    const bw = Math.min(28, step - 8);
    marks = pts.map(wk => { const v = st[wk][key], bx = x(wk) - bw / 2, h = Math.max(3, base - y(v));
      return `<g class="hb${wk === w ? ' med' : ''}"><title>Week ${wk}: ${f1(v)}</title><rect class="hit" x="${x(wk) - step / 2}" y="${top - 12}" width="${step}" height="${base - top + 12}"/>
        <path class="bar" style="fill:${heat(v / hi)}" d="M${bx},${base}V${base - h + 3}q0,-3 3,-3h${bw - 6}q3,0 3,3V${base}Z"/><text class="cnt" x="${x(wk)}" y="${base - h - 4}">${f1(v)}</text></g>`; }).join('');
  } else {
    const path = pts.map((wk, i) => `${i ? 'L' : 'M'}${x(wk)},${y(st[wk][key])}`).join('');
    const shown = new Set([pts[0], pts[pts.length - 1], w]);
    marks = `<path class="ln" d="${path}"/>` + pts.map(wk => `<g class="pt${wk === w ? ' on' : ''}"><title>Week ${wk}: ${f1(st[wk][key])}</title>
      <rect class="hit" x="${x(wk) - step / 2}" y="${top - 12}" width="${step}" height="${base - top + 12}"/><circle cx="${x(wk)}" cy="${y(st[wk][key])}" r="${wk === w ? 5 : 4}"/>
      ${shown.has(wk) ? `<text class="cnt" x="${x(wk)}" y="${y(st[wk][key]) - 9}">${f1(st[wk][key])}</text>` : ''}</g>`).join('');
  }
  return `<svg class="bhist pchart ${bars ? 'churn' : 'cons'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${bars ? 'Churn' : 'Consensus'} by week: ${pts.map(wk => `week ${wk} ${f1(st[wk][key])}`).join(', ')}">${grid}${marks}${axis}</svg>`;
}

/* Every week (a row) by every spot on the ballot (1st to 25th): the darker, the more teams the voters split it among. */
function slotMap(st, weeks, w){
  const W = 380, L = 36, gap = 2, cw = (W - L - gap * 24) / 25, rh = 14, H = weeks.length * (rh + gap) + 16;
  const max = Math.max(...weeks.flatMap(wk => st[wk].slots));
  const rows = weeks.map((wk, i) => {
    const y = i * (rh + gap);
    return `<text class="ax rl${wk === w ? ' on' : ''}" x="0" y="${y + rh - 3}">Wk ${wk}</text>` + st[wk].slots.map((v, r) =>
      `<rect class="hc" x="${L + r * (cw + gap)}" y="${y}" width="${cw}" height="${rh}" rx="2" style="fill:${heat((v - 1) / (max - 1))}"><title>Week ${wk}, #${r + 1}: ${v === 1 ? 'unanimous' : `split like ${f1(v)} teams`}</title></rect>`).join('');
  }).join('');
  const ticks = [1, 5, 10, 15, 20, 25].map(r => `<text class="ax" x="${L + (r - 1) * (cw + gap) + cw / 2}" y="${H - 3}">${r}</text>`).join('');
  return `<svg class="bhist pmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="How split the voters are at each spot, week by week">${rows}${ticks}</svg>
    <div class="pkey"><span>Settled</span><i></i><span>Contested (${f1(max)} teams)</span></div>`;
}

/* The latest earlier week at least as extreme as this one ("lowest since Week 3"), or none: the extreme of the season. */
function since(st, weeks, w, key, low){
  const v = st[w][key], earlier = weeks.filter(x => x < w && st[x][key] != null);
  for (let i = earlier.length - 1; i >= 0; i--) if (low ? st[earlier[i]][key] <= v : st[earlier[i]][key] >= v) return earlier[i];
  return earlier.length ? 0 : null;
}

function viewPoll(d){
  const st = d.stats, weeks = weeksOf(d).filter(x => st?.[x]);
  if (!weeks.length) return panel('', '<p class="muted">No ballots yet this season.</p>');
  const w = weeks.includes(state.bWeek) ? state.bWeek : weeks[weeks.length - 1], s = st[w], wk = d.weeks[w], p = st[weeks[weeks.indexOf(w) - 1]];
  const head = detailHead({ title: 'How sure are the voters?', label: 'AP poll · voter certainty',
    sub: [`${esc(wk.label)}${wk.date ? ` · ${esc(wk.date)}` : ''}`, `<b>${wk.voters.length}</b> ballots`].map(x => `<span>${x}</span>`).join('') });
  const weekChips = weeks.length > 1 ? chips(weeks.map(x => [x, `Wk ${x}`]), w, 'bweek') : '';

  const soft = s.slots.indexOf(Math.max(...s.slots));
  const delta = p ? s.cons - p.cons : 0;
  const tiles = [
    [f1(s.cons), 'Consensus', p && Math.abs(delta) >= .1 ? `<small class="${delta > 0 ? 'up' : 'dn'}">${delta > 0 ? '▲' : '▼'}${f1(Math.abs(delta))}</small>` : ''],
    [s.churn != null ? f1(s.churn) : '–', 'Churn', ''],
    [f1(s.slots[0]), 'Teams at #1', ''],
    [s.new != null ? f1(s.new) : '–', 'New per ballot', '']
  ].map(([v, k, x]) => `<div><b>${v}${x}</b><span>${k}</span></div>`).join('');

  // In words: this week's agreement and churn against the rest of the season so far.
  const words = [];
  if (!p) words.push('The first poll, when voters have the least to go on.');
  else {
    const lo = since(st, weeks, w, 'cons', true), hi = since(st, weeks, w, 'cons', false);
    words.push(delta < 0 ? `Voters agree <b>less</b> than the week before${lo === 0 ? ', the least all season' : lo ? `, the least since Week ${lo}` : ''}.`
      : `Voters agree <b>more</b> than the week before${hi === 0 ? ', the most all season' : hi ? `, the most since Week ${hi}` : ''}.`);
    const ch = since(st, weeks, w, 'churn', false);
    if (s.churn != null) words.push(ch === 0 ? `They reworked their own ballots more than in any week yet.` : `The average voter added ${f1(s.new)} new team${s.new === 1 ? '' : 's'}.`);
  }
  words.push(s.slots[0] <= 1.05 ? 'The top spot is unanimous.' : s.slots[0] < 1.5 ? 'The top spot is all but settled.' : `#1 is contested: split like ${f1(s.slots[0])} teams.`);
  words.push(`Softest spot: <b>#${soft + 1}</b>.`);

  const who = ([n, o, m]) => `<li><b>${f1(m)}</b><span>${esc(n)}<small> · ${esc(o)}</small></span></li>`;
  const movers = s.most ? panel(`Who changed most · Week ${w}`, `<div class="bout">
      <div><h4>Reworked their ballot</h4><ul>${s.most.map(who).join('')}</ul></div>
      <div><h4>Stood pat</h4><ul>${s.least.map(who).join('')}</ul></div></div>`) : '';

  return head + weekChips +
    panel('', `<div class="btiles b4">${tiles}</div><p class="bcons">${words.join(' ')}</p>`) +
    panel('Consensus', `${weekChart(st, weeks, w, 'cons')}<p class="note">How alike two voters' ballots are, on average over every pair of voters (100: identical). Agreeing on the top counts most: the top 10 carry most of the weight.</p>`) +
    (weeks.length > 1 ? panel('Churn', `${weekChart(st, weeks, w, 'churn', true)}<p class="note">How much each voter changed their own ballot from the week before, averaged (0: no change, on the same scale as consensus).</p>`) : '') +
    panel('Where the poll is soft', `${slotMap(st, weeks, w)}<p class="note">For each spot on the ballot, how many teams the voters split it among, counted as if evenly (1: every voter has the same team there). Hover a square for its number.</p>`) +
    movers;
}

let shownId = null;
export function viewBallots(id){
  if (id !== shownId){ shownId = id; state.bWeek = null; }   // another team opens on the latest week
  const d = ballots();
  if (id === 'poll') return d ? viewPoll(d) : '<div class="skeleton"></div><div class="skeleton tall"></div>';
  const r = state.rankings, ap = r?.ranks.find(x => String(x.id) === String(id)) || r?.others?.find(x => String(x.id) === String(id));
  const name = ap?.name || d?.teams?.[id]?.name || 'Team';
  if (!d) return '<div class="skeleton"></div><div class="skeleton tall"></div>';
  const weeks = weeksOf(d), latest = weeks[weeks.length - 1];
  const w = weeks.includes(state.bWeek) ? state.bWeek : latest, t = teamWeek(d, w, id);
  const g = state.games.flatMap(x => [x.home, x.away]).find(x => String(x.id) === String(id));
  const color = g?.color && g.color !== '#8a948e' ? g.color : null;
  const fresh = w === latest && matchesPoll(d, latest);
  const sub = [
    ap?.rank && w === latest && fresh && `AP <b>#${ap.rank}</b>`,
    t?.on && `<b>${t.pts.toLocaleString()}</b> points`,
    t?.fpv && `<b>${t.fpv}</b> first-place vote${t.fpv === 1 ? '' : 's'}`,
    `${esc(t?.wk.label || `Week ${w}`)}${t?.wk.date ? ` · ${esc(t.wk.date)}` : ''}`,
    `<a class="dlink" href="#team/${esc(id)}">Team schedule ›</a>`
  ].filter(Boolean).map(x => `<span>${x}</span>`).join('');
  const head = detailHead({ title: esc(name), label: `${name} · AP ballots`, sub, logoSrc: ap?.logo, color });
  const weekChips = weeks.length > 1 ? chips(weeks.map(x => [x, `Wk ${x}`]), w, 'bweek') : '';
  const stale = w === latest && !fresh && r ? '<p class="note">This week\'s ballots aren\'t out yet: these are from the poll before.</p>' : '';
  if (!t?.on) return head + weekChips + stale + panel('', `<p class="muted">Not on any of the ${t?.n || ''} ballots in ${esc(t?.wk.label || 'this week')}.</p>`);

  const tiles = [
    [f1(t.avg), 'Average'], [t.med >= NR ? 'NR' : f1(t.med), 'Median'],
    [`${rankText(t.hi)}–${rankText(t.lo).replace('#', '')}`, 'High–low'], [`±${f1(t.sd)}`, 'Spread'],
    [`${t.on}/${t.n}`, 'Ballots'], [t.fpv, '1st place']
  ].map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');

  // The season: their ballots each week, on the same scale.
  // (On one scale for every week, zoomed to the worst ballot they've had, so the spread is easy to see.)
  const season = weeks.map(x => teamWeek(d, x, id)).filter(x => x?.on);
  const smax = Math.min(NR, Math.max(10, Math.ceil((Math.max(...season.map(s => s.lo)) + 1) / 5) * 5));
  const seasonRows = season.map(s => `<li class="${s.w === w ? 'on' : ''}"><button type="button" data-bweek="${s.w}">Wk ${s.w}</button>
    ${boxPlot(s, { w: 200, h: 14, cls: 'bx wide', max: smax })}<span>${s.med >= NR ? 'NR' : '#' + f1(s.med)}<small> ±${f1(s.sd)}</small></span></li>`).join('');

  // Who's highest and lowest on them, against the median.
  const m = Math.round(t.med), byRank = [...t.votes].sort((a, b) => a.r - b.r || a.n.localeCompare(b.n));
  const highs = byRank.filter(v => m - v.r >= 3).slice(0, 4), lows = byRank.filter(v => v.r - m >= 3).reverse().slice(0, 4);
  const who = v => `<li><b>${rankText(v.r)}</b><span>${esc(v.n)}<small> · ${esc(v.o)}</small></span></li>`;
  const outliers = highs.length || lows.length ? panel('Outliers', `<div class="bout">
      ${highs.length ? `<div><h4>Highest on them</h4><ul>${highs.map(who).join('')}</ul></div>` : ''}
      ${lows.length ? `<div><h4>Lowest on them</h4><ul>${lows.map(who).join('')}</ul></div>` : ''}</div>`) : '';

  // Every ballot, grouped by the rank it gave them (tucked away: open it to read names).
  const groups = [...new Set(byRank.map(v => v.r))].map(rk => { const vs = byRank.filter(v => v.r === rk);
    return `<div class="bgrp${Math.abs(rk - m) >= 3 ? ' off' : ''}"><b>${rk >= NR ? 'NR' : '#' + rk}</b><i>${vs.length}</i><p>${vs.map(v => `<span title="${esc(v.o)}">${esc(v.n)}</span>`).join('')}</p></div>`; }).join('');
  return head + weekChips + stale +
    panel('How the voters see them', `<div class="btiles">${tiles}</div><p class="bcons">${consensus(t)}</p>`) +
    panel('Every ballot', `${histogram(t)}<p class="note">Voters at each spot (NR: left off). Bright bar: the median.</p>`) +
    (season.length > 1 ? panel('Week by week', `<ul class="bseason">${seasonRows}</ul><div class="bscale"><span>#1</span><span>${smax >= NR ? 'NR' : '#' + smax}</span></div><p class="note">Line: best to worst ballot · box: middle half · tick: median.</p>`) : '') +
    outliers +
    `<details class="panel ball" data-k="ballots"><summary><h3>All ${t.n} ballots</h3><span>by rank</span></summary><div class="bgrps">${groups}</div></details>`;
}
