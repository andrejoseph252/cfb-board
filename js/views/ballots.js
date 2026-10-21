/* A ranked team's AP ballots (#ballots/ID): how every voter has them this week, how much the voters agree, how
   that's moved over the season, and each ballot by name. */
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
      ${c ? `<path class="bar" d="M${x},${base}V${base - hgt + 3}q0,-3 3,-3h${bw - 6}q3,0 3,3V${base}Z"/><text class="cnt" x="${x + bw / 2}" y="${base - hgt - 4}">${c}</text>` : ''}</g>`;
  }).join('');
  const ticks = [1, 5, 10, 15, 20, 25, NR].map(r => `<text class="ax" x="${(r - 1) * (bw + 2) + bw / 2}" y="${H - 6}">${r >= NR ? 'NR' : r}</text>`).join('');
  return `<svg class="bhist" viewBox="0 0 ${W} ${H}" role="img" aria-label="How many voters ranked them at each spot"><line class="base" x1="0" x2="${W}" y1="${base + .5}" y2="${base + .5}"/>${bars}${ticks}</svg>`;
}

let shownId = null;
export function viewBallots(id){
  if (id !== shownId){ shownId = id; state.bWeek = null; }   // another team opens on the latest week
  const d = ballots();
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
    `${esc(t?.wk.label || `Week ${w}`)}${t?.wk.date ? ` · ${esc(t.wk.date)}` : ''}`
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
