/* AP poll movement: a bump chart of every team that's been ranked this season, one line per team, polls left to right.
   Every line is drawn faint; tapping a line, a label or a chip follows up to three teams in their colors, with each
   poll's rank on the line, a band for where the middle half of the voters had them, and below the chart what each
   team did between polls. Ranks come from the saved ballots (scripts/ballots.py), plus ESPN's newest poll when its
   ballots aren't saved yet. Columns are poll dates: the ballot file and ESPN number the weeks differently. */
import { esc, store } from '../util.js';
import { state, invalidate } from '../state.js';
import * as api from '../api.js';
import { parseSchedule } from '../models.js';
import { ballots, weeksOf, teamWeek } from '../ballots.js';
import { distinctColor, logo } from './components.js';
import { myTeam } from '../myteam.js';

const ROW = 19, OUT = 26.4, MAX = 3;      // px per rank; where unranked sits (in ranks); teams followed at once
const day = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
/* A ballot week's date ("Oct 18, 2026") as noon UTC that day: 8am Eastern on poll Sunday, after every Saturday game,
   in any time zone (local midnight in Europe would fall before Saturday's night games). */
const pollTime = s => { const d = new Date(s); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)); };
let model = null;

/* Each poll's ranks: [{ date, label, ranks: Map id -> rank, week (ballot week or null) }]. */
function polls(){
  const B = ballots(), out = [];
  for (const w of weeksOf(B)){
    const wk = B.weeks[w], pts = new Map();
    for (const v of wk.voters) v.b.forEach((id, i) => pts.set(id, (pts.get(id) || 0) + 25 - i));
    const order = [...pts].sort((a, b) => b[1] - a[1]), ranks = new Map();
    order.forEach(([id, p], i) => { const r = i && p === order[i - 1][1] ? ranks.get(order[i - 1][0]) : i + 1; if (r <= 25) ranks.set(id, r); });
    const date = pollTime(wk.date);
    out.push({ date, label: day(date), ranks, week: w });
  }
  const r = state.rankings;
  if (r?.date && (!out.length || new Date(r.date) > out.at(-1).date))
    out.push({ date: new Date(r.date), label: day(pollTime(r.date)), ranks: new Map(r.ranks.map(t => [String(t.id), t.rank])), week: null });
  return out;
}

/* A followed team's colors and its games, from its schedule (fetched once each). */
const scheds = new Map();
function sched(id){
  if (!scheds.has(id)){
    scheds.set(id, null);
    api.teamSchedule(id).then(j => { scheds.set(id, { ...parseSchedule(j), color: j.team?.color, alt: j.team?.alternateColor }); invalidate('main'); }).catch(() => {});
  }
  return scheds.get(id);
}

/* Every team's colors from data/teams.json, loaded when the chart first shows, so a followed team's line is drawn in
   its color straight away (its schedule, fetched on follow for the games list, would arrive a moment later). */
let teams, asked = false;
function teamData(){
  if (!asked){ asked = true; api.teamColors().then(j => { teams = j || {}; invalidate('main'); }, () => { teams = {}; invalidate('main'); }); }
  return teams;
}

const picked = () => { const p = store.get('rk.mv', null); return Array.isArray(p) ? p.map(String) : null; };

export function movementChart(inConf){
  const B = ballots(), T = teamData();
  if (!B || !T) return '<div class="skeleton tall"></div>';
  const P = polls(), n = P.length;
  if (n < 2) return '<p class="note">Movement shows once there are two polls.</p>';
  const ids = [...new Set(P.flatMap(p => [...p.ranks.keys()]))].filter(inConf);
  const last = P.at(-1).ranks, name = id => B.teams?.[id]?.name || state.rankings?.ranks.find(t => String(t.id) === id)?.name || 'Team';
  // Followed: the saved picks, else your team if it's been ranked, else this week's #1.
  let sel = (picked() || [myTeam?.id, ...[...last].sort((a, b) => a[1] - b[1]).map(([id]) => id)].filter(id => id && ids.includes(String(id))).slice(0, 1)).map(String).filter(id => ids.includes(id));
  const info = Object.fromEntries(sel.map(id => [id, sched(id)]));
  // Followed teams in colors that stay apart from each other (Miami and Texas are both orange).
  const colors = {};
  for (const id of sel){
    const t = T[id] || (info[id] && { color: info[id].color && '#' + info[id].color, alt: info[id].alt && '#' + info[id].alt });
    colors[id] = t ? distinctColor(t, Object.values(colors)) : 'var(--muted)';
  }
  const color = id => colors[id];
  model = { P, ids, sel };

  const x = i => (i / (n - 1) * 100).toFixed(3), y = r => ((r ?? OUT) - 1) / (OUT - 1 + .6) * 100;
  // A team's line, split where it's unranked for two polls running; leaving and (re)entering run to the "Out" level.
  const line = id => {
    const segs = []; let cur = [];
    P.forEach((p, i) => {
      const r = p.ranks.get(id), prev = i ? P[i - 1].ranks.get(id) : undefined;
      if (r == null){ if (prev != null){ cur.push(`${x(i)},${y(null).toFixed(2)}`); segs.push(cur); } cur = []; return; }
      if (!cur.length && i) cur.push(`${x(i - 1)},${y(null).toFixed(2)}`);
      cur.push(`${x(i)},${y(r).toFixed(2)}`);
    });
    if (cur.length > 1) segs.push(cur);
    return segs.map(s => s.join(' '));
  };
  const faint = ids.filter(id => !sel.includes(id)).flatMap(line).map(pts => `<polyline points="${pts}"/>`).join('');
  // The band: where the middle half of the voters ranked the team each week (the Poll table's brackets carry the
  // confidence sets for the rank itself).
  const band = id => {
    const pts = P.map((p, i) => p.week == null ? null : [i, teamWeek(B, p.week, id)]).filter(v => v && v[1]?.on);
    if (pts.length < 2) return '';
    const top = pts.map(([i, s]) => `${x(i)},${y(Math.min(s.q1, OUT)).toFixed(2)}`), bot = pts.reverse().map(([i, s]) => `${x(i)},${y(Math.min(s.q3, OUT)).toFixed(2)}`);
    // A soft fill with thin edges: the edges keep the band's shape readable over the gray lines.
    return `<g class="mv-band" style="--c:${esc(color(id))}"><polygon points="${[...top, ...bot].join(' ')}"/><polyline points="${top.join(' ')}"/><polyline points="${bot.join(' ')}"/></g>`;
  };
  const hot = sel.map(id => `${band(id)}${line(id).map(pts => `<polyline class="on" points="${pts}" stroke="${esc(color(id))}"/>`).join('')}`).join('');
  const dots = sel.flatMap(id => P.map((p, i) => p.ranks.has(id)
    ? `<span class="mv-dot" style="left:${x(i)}%;top:${y(p.ranks.get(id))}%;--c:${esc(color(id))}">${p.ranks.get(id)}</span>` : '')).join('');
  const labels = [...last].filter(([id]) => ids.includes(id)).map(([id, r]) => {
    const on = sel.includes(id), abbr = state.rankings?.ranks.find(t => String(t.id) === id)?.abbr || T[id]?.abbr || name(id).slice(0, 4).toUpperCase();
    return `<button type="button" class="mv-lab${on ? ' on' : ''}" data-mvt="${esc(id)}" style="top:${y(r)}%${on ? `;--c:${esc(color(id))}` : ''}" aria-pressed="${on}">${esc(abbr)}</button>`;
  }).join('');
  const grid = [1, 5, 10, 15, 20, 25].map(r => `<span class="mv-rk" style="top:${y(r)}%">${r}</span>`).join('');

  return `<div class="mv-chart">
    <div class="mv-cols">${P.map((p, i) => `<span${(n - 1 - i) % 2 ? ' class="alt"' : ''} style="left:${x(i)}%">${esc(p.label)}</span>`).join('')}</div>
    <div class="mv-body" style="height:${Math.round((OUT + .6) * ROW)}px">
      <div class="mv-ranks">${grid}<span class="mv-rk out" style="top:${y(null)}%">Out</span></div>
      <div class="mv-plot${sel.length ? ' sel' : ''}" role="img" aria-label="AP rank of every team ranked this season, poll by poll">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${P.map((p, i) => `<line class="mv-col" x1="${x(i)}" x2="${x(i)}" y1="0" y2="100"/>`).join('')}
          <line class="mv-out" x1="0" x2="100" y1="${y(null)}" y2="${y(null)}"/>
          <g class="mv-faint">${faint}</g>${hot}</svg>${dots}
      </div>
      <div class="mv-labs">${labels}</div>
    </div>
    <div class="mv-chips">${sel.map(id => `<button type="button" class="mv-chip" data-mvt="${esc(id)}" style="--c:${esc(color(id))}"><i></i>${esc(name(id))}<span aria-hidden="true">×</span></button>`).join('')}
      <span class="mv-hint">${sel.length < MAX ? `Tap a line or a team to ${sel.length ? 'compare' : 'follow it'}` : 'Following three teams: tap one to drop it'}</span></div>
    ${sel.length ? `<p class="mv-note">Shaded: where the middle half of the voters ranked each team that week. Wide means the voters were split.</p>` : ''}
    ${sel.map(id => story(id, P, color(id), name(id), info[id], T[id]?.logo)).join('')}
  </div>`;
}

/* What a followed team did between polls: rank, the move, and its games in that stretch. */
function story(id, P, color, name, s, logoSrc = s?.team?.logo){
  const rows = P.map((p, i) => {
    const r = p.ranks.get(id), prev = i ? P[i - 1].ranks.get(id) : undefined;
    const mv = !i ? '' : r == null && prev == null ? '' : r == null ? '<span class="mv-d dn">Out</span>' : prev == null ? '<span class="mv-d up">New</span>'
      : r < prev ? `<span class="mv-d up">▲${prev - r}</span>` : r > prev ? `<span class="mv-d dn">▼${r - prev}</span>` : '<span class="mv-d">–</span>';
    const from = i ? P[i - 1].date : new Date(p.date.getTime() - 9 * 864e5);
    const games = s?.games.filter(g => g.state === 'post' && new Date(g.date) > from && new Date(g.date) <= p.date).map(g => {
      const me = String(g.home.id) === id ? 'home' : 'away', t = g[me], o = g[me === 'home' ? 'away' : 'home'], won = Number(t.score) > Number(o.score);
      return `<span class="mv-g"><b class="${won ? 'w' : 'l'}">${won ? 'W' : 'L'}</b> ${esc(t.score)}–${esc(o.score)} ${me === 'home' ? 'vs' : '@'} ${esc(o.abbr)}</span>`;
    }) || [];
    return `<li><span class="mv-wk">${esc(p.label)}</span><span class="mv-r">${r ? '#' + r : '–'}</span>${mv}<span class="mv-gs">${s ? games.join('') || '<span class="muted">Bye</span>' : ''}</span></li>`;
  });
  return `<details class="mv-story" data-mvs="${esc(id)}" style="--c:${esc(color)}"${opened.has(id) ? ' open' : ''}><summary>${logoSrc ? logo(logoSrc, 'logo sm') : '<i class="mv-sw"></i>'}<b>${esc(name)}</b><span class="muted">poll by poll</span></summary><ol>${rows.reverse().join('')}</ol></details>`;
}

// Which poll-by-poll lists are expanded; the main view is rebuilt on every refresh.
const opened = new Set();
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('.mv-story')) d.open ? opened.add(d.dataset.mvs) : opened.delete(d.dataset.mvs); }, true);

function toggle(id){
  const cur = model?.sel || [];
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id].slice(-MAX);
  store.set('rk.mv', next); invalidate('main');
}
// A tap on the chart never focuses its buttons: they're replaced on the re-render, and a phone can scroll after them.
document.addEventListener('pointerdown', e => { if (e.target.closest('.mv-chart [data-mvt]')) e.preventDefault(); });
/* The line nearest a tap: the poll column under it, then the team ranked closest to that height. */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-mvt]'); if (t){ toggle(t.dataset.mvt); return; }
  const plot = e.target.closest('.mv-plot'); if (!plot || !model) return;
  const r = plot.getBoundingClientRect(), n = model.P.length;
  const i = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (n - 1));
  const rank = (e.clientY - r.top) / r.height * (OUT - 1 + .6) + 1;
  let best = null, bd = 1.2;
  for (const id of model.ids){ const v = model.P[i].ranks.get(id); if (v != null && Math.abs(v - rank) < bd){ bd = Math.abs(v - rank); best = id; } }
  if (best) toggle(best);
});
