/* A ranked team's AP ballots (#ballots/ID): how every voter has them this week, how much the voters agree, how
   that's moved over the season, and each ballot by name. #ballots/poll: how sure the voters are as a group, week by
   week (the "stats" scripts/ballots.py works out). */
import { esc } from '../util.js';
import { state } from '../state.js';
import { ballots, weeksOf, teamWeek, matchesPoll, rankText, NR, rankSet, tiers } from '../ballots.js';
import { detailHead, panel, chips, visibleColor } from './components.js';

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

/* Where another panel of voters like these would put them: the rank's 95% confidence set on a 1-25 rail (longer when
   the set runs past 25), the printed rank as a dot, and the tier around it. */
function rankRange(d, w, id, color){
  const cs = rankSet(d, w, id); if (!cs) return '';
  const x = tiers(d, w)?.get(String(id)), max = Math.max(25, Math.ceil(cs.U / 5) * 5);
  const pos = r => ((r - 1) / (max - 1) * 100).toFixed(2) + '%';
  const ticks = [1, ...Array.from({ length: max / 5 }, (_, i) => (i + 1) * 5)].map(r => `<span style="left:${pos(r)}">${r}</span>`).join('');
  const rail = `<div class="csr" style="--m:${max - 1}${color ? `;--tc:${esc(color)}` : ''}"><div class="csr-rail">
      <i class="csr-set" style="left:${pos(cs.L)};width:calc(${pos(cs.U)} - ${pos(cs.L)})"></i><i class="csr-dot" style="left:${pos(cs.rank)}"></i></div>
    <div class="csr-ticks">${ticks}</div></div>`;
  const head = cs.L === cs.U ? `<b>Settled at #${cs.rank}.</b> Any panel of writers like these would put them here.`
    : `<b>Anywhere from #${cs.L} to #${cs.U}.</b> That's where another panel of ${cs.n} writers like these could put them.`;
  const pack = x && x.from !== x.to ? ` They're in a pack from #${x.from} to #${x.to} the voters can't separate.`
    : x && cs.L !== cs.U ? ' Taken together with the rest of the poll, though, the voters do set them apart.' : '';
  return panel('If others had voted', `${rail}<p class="bcons">${head}${pack}</p>
    <p class="note">95% confidence, treating the voters as a sample of AP-like writers (Mogstad et al., 2024). It's about how settled the poll's order is, not which team is better.</p>`);
}

/* Every ballot as a bar per rank (1st to 25th, then not ranked); the median rank is marked. */
function histogram(t){
  const W = 380, H = 150, top = 16, base = H - 22, bw = (W - 2 * (NR - 1)) / NR, max = Math.max(...t.dist.slice(1));
  const bars = t.dist.slice(1).map((c, i) => {
    const r = i + 1, x = i * (bw + 2), hgt = c ? Math.max(3, (base - top) * c / max) : 0, isMed = r === Math.round(t.med);
    const label = `${r >= NR ? 'Not ranked' : '#' + r}: ${plural(c, 'voter')}`;
    return `<g class="hb${isMed ? ' med' : ''}"><title>${label}</title><rect class="hit" x="${x}" y="${top - 12}" width="${bw}" height="${base - top + 12}"/>
      ${c ? `<path class="bar" d="M${x},${base}V${base - hgt + 3}q0,-3 3,-3h${bw - 6}q3,0 3,3V${base}Z"/><text class="cnt" x="${x + bw / 2}" y="${base - hgt - 4}">${c}</text>` : ''}</g>`;
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
  const W = 480, H = 160, L = 32, top = 22, base = H - 24, step = (W - L) / weeks.length;
  const x = wk => L + step * (weeks.indexOf(wk) + .5);
  const vals = weeks.map(wk => st[wk]?.[key]).filter(v => v != null);
  // Zoom consensus to this season's range, with padding and the same scale for every selected week.
  // Churn bars retain a zero baseline and their existing scale.
  const zoom = key === 'cons' && !bars;
  const pad = zoom ? Math.max(.25, (Math.max(...vals) - Math.min(...vals)) * .15) : 3;
  const lo = zoom ? Math.max(0, Math.floor(Math.min(...vals) - pad)) : bars ? 0 : Math.floor((Math.min(...vals) - 3) / 10) * 10;
  const hi = zoom ? Math.min(100, Math.ceil(Math.max(...vals) + pad)) : Math.ceil((Math.max(...vals) + 3) / 10) * 10;
  const y = v => base - (v - lo) / (hi - lo) * (base - top);
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line class="gr" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ay" x="${L - 5}" y="${y(v) + 3.5}">${f1(v)}</text>`).join('');
  const axis = weeks.map(wk => `<text class="ax${wk === w ? ' on' : ''}" x="${x(wk)}" y="${H - 5}">Wk ${wk}</text>`).join('');
  const pts = weeks.filter(wk => st[wk]?.[key] != null);
  let marks;
  if (bars){
    const bw = Math.max(4, Math.min(30, step - 8));
    marks = pts.map(wk => { const v = st[wk][key], bx = x(wk) - bw / 2, h = Math.max(3, base - y(v));
      return `<g class="hb${wk === w ? ' med' : ''}"><title>Week ${wk}: ${f1(v)}</title><rect class="hit" x="${x(wk) - step / 2}" y="${top - 12}" width="${step}" height="${base - top + 12}"/>
        <path class="bar" style="fill:${heat(v / hi)}" d="M${bx},${base}V${base - h + 3}q0,-3 3,-3h${bw - 6}q3,0 3,3V${base}Z"/><text class="cnt" x="${x(wk)}" y="${base - h - 4}">${f1(v)}</text></g>`; }).join('');
  } else {
    const path = pts.map((wk, i) => `${i ? 'L' : 'M'}${x(wk)},${y(st[wk][key])}`).join('');
    const shown = new Set([pts[0], pts[pts.length - 1], w]);
    marks = `<path class="pc-area" d="${path}L${x(pts[pts.length - 1])},${base}L${x(pts[0])},${base}Z"/><path class="ln" d="${path}"/>` + pts.map(wk => `<g class="pt${wk === w ? ' on' : ''}"><title>Week ${wk}: ${f1(st[wk][key])}${key === 'cons' && st[wk].gap != null ? ` · voters differ by ${f1(st[wk].gap)} places on average` : ''}</title>
      <rect class="hit" x="${x(wk) - step / 2}" y="${top - 12}" width="${step}" height="${base - top + 12}"/><circle cx="${x(wk)}" cy="${y(st[wk][key])}" r="${wk === w ? 5 : 4}"/>
      ${shown.has(wk) ? `<text class="cnt" x="${x(wk)}" y="${y(st[wk][key]) - 12}">${f1(st[wk][key])}</text>` : ''}</g>`).join('');
  }
  return `<svg class="bhist pchart ${bars ? 'churn' : 'cons'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${bars ? 'Churn' : 'Consensus'} by week: ${pts.map(wk => `week ${wk} ${f1(st[wk][key])}`).join(', ')}">${grid}${marks}${axis}</svg>`;
}

/* Every week (a row) by every spot on the ballot (1st to 25th): the darker, the more teams the voters split it among. */
function slotMap(st, weeks, w){
  const W = 480, L = 36, gap = 3, cw = (W - L - gap * 24) / 25, rh = 17, H = weeks.length * (rh + gap) + 22;
  const max = Math.max(...weeks.flatMap(wk => st[wk].slots));
  const rows = weeks.map((wk, i) => {
    const y = i * (rh + gap);
    return `${wk === w ? `<rect class="pc-map-selected" x="${L - 3}" y="${y - 2}" width="${W - L + 6}" height="${rh + 4}" rx="3"/>` : ''}<text class="ax rl${wk === w ? ' on' : ''}" x="0" y="${y + rh - 3}">Wk ${wk}</text>` + st[wk].slots.map((v, r) =>
      `<rect class="hc" x="${L + r * (cw + gap)}" y="${y}" width="${cw}" height="${rh}" rx="2" style="fill:${heat((v - 1) / Math.max(1, max - 1))}"><title>Week ${wk}, #${r + 1}: ${v === 1 ? 'unanimous' : `split like ${f1(v)} teams`}</title></rect>`).join('');
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
  const delta = p ? s.cons - p.cons : 0, changed = p && Math.abs(delta) >= .05;
  const soft = s.slots.indexOf(Math.max(...s.slots));
  const extreme = changed ? since(st, weeks, w, 'cons', delta < 0) : null;
  const context = !p ? 'The season starts here.' : !changed ? 'Agreement holds steady.'
    : extreme === 0 ? `${delta < 0 ? 'Lowest' : 'Highest'} agreement this season.`
    : `Voters agree ${delta < 0 ? 'less' : 'more'} than last week.`;
  const badge = p ? `<span class="pc-delta ${changed ? delta > 0 ? 'pos' : 'neg' : ''}">${changed ? `${delta > 0 ? '↑' : '↓'} ${f1(Math.abs(delta))}` : '—'} <span>vs. last week</span></span>`
    : '<span class="pc-delta">Opening poll</span>';
  const sectionHead = (n, title, meta = '') => `<div class="pc-section-head"><span class="pc-index">${n}</span><h3>${title}</h3>${meta ? `<span class="pc-section-meta">${meta}</span>` : ''}</div>`;
  const weekNav = weeks.length > 1 ? `<nav class="pc-weeks" aria-label="Poll week">${weeks.map(x =>
    `<button type="button" data-bweek="${x}" aria-pressed="${x === w}" aria-label="Week ${x}">Wk ${x}</button>`).join('')}</nav>` : '';
  const gap = s.gap != null ? `<div><dt>Places apart</dt><dd>${f1(s.gap)}</dd><span>Average voter difference</span></div>` : '';
  const churn = s.churn != null ? `<section class="pc-section pc-movement">
    ${sectionHead('02', 'Ballots in motion', esc(wk.label))}
    <div class="pc-movement-stats"><div><span class="pc-kicker">Churn index</span><b>${f1(s.churn)}</b><span>How much ballots changed</span></div>
      <div><span class="pc-kicker">New per ballot</span><b>${f1(s.new)}</b><span>Teams added on average</span></div></div>
    ${weekChart(st, weeks, w, 'churn', true)}
    <p class="pc-caption">Big moves can happen together. Churn measures change; consensus measures agreement.</p>
  </section>` : '';
  const who = ([n, o, m], i) => `<li><span class="pc-voter-num">${String(i + 1).padStart(2, '0')}</span><span class="pc-voter-name">${esc(n)}<small>${esc(o)}</small></span><b>${f1(m)}</b></li>`;
  const movers = s.most ? `<section class="pc-section pc-voters">${sectionHead('04', 'Behind the ballots', 'Churn index')}
    <div class="pc-voter-columns"><div><h4><i class="pc-dot warm"></i>Biggest changes</h4><ol>${s.most.map(who).join('')}</ol></div>
      <div><h4><i class="pc-dot"></i>Smallest changes</h4><ol>${s.least.map(who).join('')}</ol></div></div></section>` : '';

  return `<div class="poll-certainty" data-title="AP poll · voter certainty">
    <header class="pc-header"><div class="pc-kicker">AP Top 25 <span> / </span> ${esc(d.season)} season</div><h2>Voter consensus</h2>
      <p>${esc(wk.label)}${wk.date ? ` <span>·</span> ${esc(wk.date)}` : ''}<span>·</span> ${wk.voters.length} ballots</p></header>
    ${weekNav}
    <section class="pc-section pc-overview" aria-label="Consensus overview">
      <div class="pc-overview-top"><div class="pc-score"><span class="pc-kicker">Consensus index</span><div><strong>${f1(s.cons)}</strong><span>/ 100</span></div>${badge}</div>
        <dl class="pc-facts">${gap}<div><dt>Compared equally</dt><dd>25<span> teams</span></dd><span>Every spot carries equal weight</span></div></dl></div>
      <div class="pc-verdict"><span class="pc-dot"></span><p>${context}${extreme > 0 ? ` <span>${delta < 0 ? 'Lowest' : 'Highest'} since Week ${extreme}.</span>` : ''}</p></div>
      ${sectionHead('01', 'Agreement through the season', `${weeks.length} ${weeks.length === 1 ? 'poll' : 'polls'}`)}
      ${weekChart(st, weeks, w, 'cons')}
      <div class="pc-chart-foot"><span>Higher = more agreement</span><span>Zoomed scale · 0–100 index</span></div>
    </section>
    ${churn}
    <section class="pc-section pc-contested">${sectionHead(churn ? '03' : '02', 'Where opinion splits', 'Ballot position →')}
      <div class="pc-split-stats"><div><span class="pc-kicker">The top spot</span><b>${s.slots[0] === 1 ? 'Unanimous' : `${f1(s.slots[0])}<small> effective teams</small>`}</b></div>
        <div><span class="pc-kicker">Most contested</span><b>#${soft + 1}<small>${f1(s.slots[soft])} effective teams</small></b></div></div>
      <div class="pc-map">${slotMap(st, weeks, w)}</div>
      <p class="pc-caption">Neutral means agreement. Warmer means a spot is split among more teams.</p>
    </section>
    ${movers}
    <details class="pc-method" data-k="poll-method"><summary><span>How to read these numbers</span><span class="pc-kicker">Methodology</span></summary>
      <div><h4>Consensus · equal weight, all 25 teams</h4><p>For every team in the AP Top 25, average the difference in placement across all pairs of voters. A team left off counts as #26. Ties at #25 are included.</p>
        <p class="pc-formula">100 × (1 − average difference ÷ 25)</p><p>100 means identical placements for these teams. The chart zooms to this season's scores, using the same scale for every selected week.</p>
        <h4>Churn · movement from the previous poll</h4><p>Average change in each returning voter's ballot, using top-weighted rank-biased overlap. Zero means no change; movement near #1 counts most. It uses a different scale from consensus.</p>
        <h4>Effective teams · how split is a spot?</h4><p>The number of teams sharing a position, adjusted for how evenly votes are split (exponentiated entropy). One means unanimous; four means as split as four teams sharing it evenly. Hover a cell for its value.</p></div>
    </details>
    <footer class="pc-source">${wk.voters.length} AP ballots <span>·</span> Via CollegePollTracker</footer>
  </div>`;
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
    panel('How the voters see them', `<div class="btiles">${tiles}</div><p class="bcons">${consensus(t)}</p>`) + rankRange(d, w, id, g && visibleColor(g)) +
    panel('Every ballot', `${histogram(t)}<p class="note">Voters at each spot (NR: left off). Bright bar: the median.</p>`) +
    (season.length > 1 ? panel('Week by week', `<ul class="bseason">${seasonRows}</ul><div class="bscale"><span>#1</span><span>${smax >= NR ? 'NR' : '#' + smax}</span></div><p class="note">Line: best to worst ballot · box: middle half · tick: median.</p>`) : '') +
    outliers +
    `<details class="panel ball" data-k="ballots"><summary><h3>All ${t.n} ballots</h3><span>by rank</span></summary><div class="bgrps">${groups}</div></details>`;
}
