/* The My team tab: header, this week's game, a season outlook built from ESPN's FPI win chance for every remaining
   game, the season timeline and the conference race. With no team set, it's the team picker. */
import { esc, pct, fmtTime } from '../util.js';
import { state, CONF, CONF_ORDER, apRank } from '../state.js';
import { loadPredictions } from '../data.js';
import { myTeam, mySide, mySchedule, myNextGame, myColor, mineRow, STAR } from '../myteam.js';
import { winnerSide } from '../picks.js';
import { upset, BOLT } from '../upset.js';
import { realMarket } from '../markets.js';
import { logo, card, sec, panel, gameHref, teamHref } from './components.js';
import { inkOn } from './preview.js';
import { order, rec } from './conferences.js';

const side = (g, id) => String(g.home.id) === String(id) ? 'home' : 'away';
const other = s => s === 'home' ? 'away' : 'home';
const dateShort = d => new Date(d).toLocaleDateString(undefined, {month:'short', day:'numeric'});
const chance = p => p < .005 ? '<1%' : p > .995 ? '>99%' : `${pct(p)}%`;

/* Home win chance for a game: live win probability while it's on, else ESPN FPI, else the market. */
function pHome(g){
  const board = state.byId[g.id];
  if (g.state === 'in' && board?.liveWp != null) return board.liveWp;
  return state.preds.get(g.id)?.pHome ?? (board ? realMarket(board)?.pHome : null) ?? null;
}

/* ---------- season outlook: exact distribution of final wins from each remaining game's win chance ---------- */
function outlook(games, id){
  let w = 0, l = 0;
  const rest = [];
  for (const g of games){
    const s = side(g, id);
    if (g.state === 'post' && g.completed){ const ws = winnerSide(g); if (ws === s) w++; else if (ws) l++; }
    else { const p = pHome(g); rest.push({ g, s, p: p == null ? null : s === 'home' ? p : 1 - p }); }
  }
  let dist = [1];   // dist[k] = chance of winning exactly k of the remaining games
  for (const r of rest){
    const p = r.p ?? .5, next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => { next[k] += q * (1 - p); next[k + 1] += q * p; });
    dist = next;
  }
  return { w, l, rest, dist, n: rest.length, total: w + l + rest.length, unknown: rest.filter(r => r.p == null).length };
}

function outlookPanel(o, color){
  if (!o.n) return panel('Season outlook', `<p class="muted">Regular season complete at ${o.w}–${o.l}.</p>`, ' data-tt="outlook"');
  const sum = from => o.dist.reduce((s, q, k) => s + (o.w + k >= from ? q : 0), 0);
  const exp = o.w + o.rest.reduce((s, r) => s + (r.p ?? .5), 0);
  const winning = Math.floor(o.total / 2) + 1;
  const done = (need, v) => o.w >= need ? 'Clinched' : o.w + o.n < need ? 'Out' : v;
  const cell = (v, k, sub) => `<div><b>${v}</b><span>${k}</span><small>${sub}</small></div>`;
  const strip = cell(`${Math.round(exp)}–${o.total - Math.round(exp)}`, 'Projected', `${exp.toFixed(1)} expected wins`) +
    cell(done(6, chance(sum(6))), 'Bowl eligible', '6+ wins') +
    cell(done(winning, chance(sum(winning))), 'Winning record', `${winning}+ wins`) +
    cell(chance(o.dist[o.n]), 'Win out', `${o.n} left`);

  // One bar per possible final record, in the team's color; the three likeliest carry their chance.
  const max = Math.max(...o.dist), top = [...o.dist.keys()].sort((a, b) => o.dist[b] - o.dist[a]).slice(0, 3);
  const bars = o.dist.map((q, k) => {
    const r = `${o.w + k}–${o.l + o.n - k}`;
    return `<div class="dist-col${o.w + k === 6 && o.w < 6 ? ' bowl-line' : ''}" tabindex="0" aria-label="${r}: ${chance(q)}">
      <span class="dist-lab">${top.includes(k) && q >= .005 ? chance(q) : ''}</span>
      <span class="dist-bar" style="height:${Math.max(2, q / max * 100).toFixed(1)}%"></span>
      <span class="dist-x">${r}</span><span class="dist-tip">Finish <b>${r}</b>: ${chance(q)}</span></div>`;
  }).join('');
  const bowlKey = o.w < 6 && o.w + o.n >= 6 ? '<span class="dist-key"><i></i>bowl eligible</span>' : '';
  return panel('Season outlook', `<div class="ol-strip">${strip}</div>
    <div class="dist-head"><span>Chance of each final record</span>${bowlKey}</div>
    <div class="dist" role="img" aria-label="Chance of each final record" style="--c:${esc(color)}">${bars}</div>
    <p class="tt-note">From ESPN's FPI win chance for each remaining game (live win probability during games)${o.unknown ? `; ${o.unknown} without one count as 50/50` : ''}.</p>`, ' data-tt="outlook"');
}

/* Win chance as a small pill, tinted from likely loss (red) through a gray toss-up to likely win (green). */
function chancePill(p, suffix = ''){
  if (p == null) return '<span class="wp-pill">–</span>';
  const lean = (p - .5) * 2, mix = Math.round(Math.abs(lean) * 38);
  const bg = `color-mix(in srgb,var(${lean >= 0 ? '--good' : '--bad'}) ${mix}%,var(--soft))`;
  return `<span class="wp-pill${Math.abs(p - .5) <= .1 ? ' swing' : ''}" style="background:${bg}" title="${Math.abs(p - .5) <= .1 ? 'Toss-up' : ''}">${pct(p)}%${suffix}</span>`;
}

/* ---------- the season, one row per game ---------- */
function timeline(games, id){
  const rows = games.map(g => {
    const s = side(g, id), me = g[s], o = g[other(s)], rk = o.rank || apRank(o.id);
    const opp = `<span class="tl-o">${logo(o.logo, 'logo sm')}<span class="muted">${g.neutral ? 'vs' : s === 'home' ? 'vs' : 'at'}</span> ${rk ? `<span class="rank">${rk}</span>` : ''}${esc(o.name)}</span>`;
    let res;
    if (g.state === 'post' && g.completed){
      const won = winnerSide(g) === s, m = Math.abs(Number(me.score) - Number(o.score)), u = upset(g);
      res = `<span class="tl-r ${won ? 'W' : 'L'}"><b>${won ? 'W' : 'L'}</b> ${esc(me.score)}–${esc(o.score)}</span>
        <span class="tl-m ${won ? 'W' : 'L'}"><i style="width:${Math.min(100, m / 35 * 100).toFixed(0)}%"></i></span>
        ${u ? `<span class="tl-u" title="${u.side === s ? 'Won as an underdog' : 'Lost as a favorite'}">${BOLT}${u.side === s ? 'Upset' : 'Upset loss'}</span>` : '<span></span>'}`;
    } else if (g.state === 'in'){
      const p = pHome(g);
      res = `<span class="tl-r live"><span class="status live">${esc(g.detail || 'Live')}</span> ${esc(me.score)}–${esc(o.score)}</span><span class="tl-m none"></span>
        <span class="tl-p">${chancePill(p == null ? null : s === 'home' ? p : 1 - p, ' live')}</span>`;
    } else {
      const p = pHome(g), d = new Date(g.date);
      res = `<span class="tl-r muted">${g.tbd ? 'TBD' : `${d.toLocaleDateString(undefined, {weekday:'short'})} ${fmtTime(d)}`}</span><span class="tl-m none"></span>
        <span class="tl-p">${chancePill(p == null ? null : s === 'home' ? p : 1 - p)}</span>`;
    }
    return `<a class="tl-row" href="${gameHref(g.id)}"><span class="tl-d">${esc(dateShort(g.date))}</span>${opp}${res}</a>`;
  }).join('');
  return panel('Season', `<div class="tl">${rows}</div>`, ' data-tt="season"');
}

/* ---------- conference race: the top two plus the teams around mine ---------- */
function race(id){
  const conf = state.standings?.byTeam[id]?.conf, c = state.standings?.confs.find(x => x.id === conf);
  if (!c) return '';
  const teams = [...c.teams].sort(order), i = teams.findIndex(t => String(t.id) === String(id));
  const keep = new Set([0, 1, i - 1, i, i + 1].filter(k => k >= 0 && k < teams.length));
  let last = -1, rows = '';
  for (const k of [...keep].sort((a, b) => a - b)){
    if (k > last + 1) rows += '<tr class="gap"><td colspan="4">…</td></tr>';
    const t = teams[k];
    rows += `<tr${mineRow(t.id)}><td class="num muted">${k + 1}</td><td class="team">${logo(t.logo, 'logo sm')}<a class="tlink" href="${teamHref(t.id)}">${esc(t.name)}</a></td>
      <td class="num strong">${rec(t.confRec)}</td><td class="num">${rec(t.overall)}</td></tr>`;
    last = k;
  }
  return panel(`${CONF[conf] || c.name} race`, `<div class="tablewrap"><table class="tbl compact race"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Conf</th><th class="num">Overall</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`, ' data-tt="race"');
}

/* ---------- team profile: each metric and where it ranks among FBS teams ---------- */
function profile(id){
  const f = state.fpi, st = state.standings;
  if (!f && !st) return '';
  const me = f?.byTeam[id], ms = st?.byTeam[id];
  const gp = t => t?.overall ? t.overall.w + t.overall.l + t.overall.t : 0;
  const perGame = (t, v) => v != null && gp(t) ? v / gp(t) : null;
  const fAll = k => f ? f.list.map(t => t[k]).filter(v => v != null) : [];
  const sAll = get => st ? Object.values(st.byTeam).map(get).filter(v => v != null) : [];
  const n = f?.list.length || Object.keys(st?.byTeam || {}).length;
  // [label, value, every FBS team's value, lower is better] or, for rank-only metrics, [label, null, rank]
  const groups = [
    ['Overall', [
      ['FPI rating', me?.fpi, fAll('fpi')],
      ['Margin / game', perGame(ms, ms?.diff), sAll(t => perGame(t, t.diff))],
      ['Schedule strength', null, me?.sosRank],
      ['Résumé', null, me?.resumeRank]]],
    ['Offense', [
      ['Efficiency', me?.off, fAll('off')],
      ['Points / game', ms?.ppg, sAll(t => t.ppg)]]],
    ['Defense', [
      ['Efficiency', me?.def, fAll('def')],
      ['Allowed / game', perGame(ms, ms?.pa), sAll(t => perGame(t, t.pa)), true]]]
  ];
  const row = ([k, v, all, lower]) => {
    let rank;
    if (Array.isArray(all)){ if (v == null || !all.length) return ''; rank = 1 + all.filter(x => lower ? x < v : x > v).length; }
    else { if (!all) return ''; rank = all; }
    const q = 1 - (rank - 1) / Math.max(1, n - 1);
    return `<div class="pf-row"><span class="pf-k">${esc(k)}</span><span class="pf-v">${v == null ? '' : (v > 0 && /^Margin/.test(k) ? '+' : '') + v.toFixed(1)}</span>
      <span class="pf-bar"><i style="width:${Math.max(3, q * 100).toFixed(0)}%"></i></span><span class="pf-r${rank <= 25 ? ' top' : ''}">${rank}</span></div>`;
  };
  const body = groups.map(([g, rows]) => { const r = rows.map(row).join(''); return r ? `<div class="pf-g">${g}</div>${r}` : ''; }).join('');
  if (!body) return '';
  return panel('Team profile', `<div class="pf"><div class="pf-row pf-head"><span></span><span></span><span></span><span>Rank</span></div>${body}</div>
    <p class="tt-note">Rank among ${n} FBS teams; the bar shows where that is, longer is better. Schedule strength: #1 is the hardest.</p>`, ' data-tt="profile"');
}

/* ---------- header ---------- */
function header(t, color){
  const ap = apRank(t.id), r = state.rankings?.ranks.find(x => String(x.id) === String(t.id));
  const move = r?.prev ? r.prev - r.rank : 0, f = state.fpi?.byTeam[t.id], st = state.standings?.byTeam[t.id];
  const facts = [t.record && `<b>${esc(t.record)}</b>`, st?.confRec && `${rec(st.confRec)} ${esc(CONF[st.conf] || 'conf')}`,
    ap && `AP <b>#${ap}</b>${move ? ` <span class="tt-move">${move > 0 ? '▲' : '▼'}${Math.abs(move)}</span>` : ''}`,
    f?.rank && `FPI <b>#${f.rank}</b>`].filter(Boolean);
  return `<header class="tt-head" style="--mt:${esc(color)};--mt-ink:${inkOn(color)}">
    <span class="mt-disc tt-disc">${logo(t.logo, 'logo')}</span>
    <div class="tt-main"><h2 title="${esc(t.full || t.name)}">${STAR}${esc(t.name || t.full)}</h2><div class="tt-facts">${facts.map(x => `<span>${x}</span>`).join('')}</div></div>
    <button class="tt-change" type="button" data-teamclear>Change team</button></header>`;
}

/* ---------- no team yet: pick one ---------- */
function picker(){
  const s = state.standings;
  if (!s) return sec('Pick your team') + (state.standingsErr ? `<div class="err">${esc(state.standingsErr)}</div>` : '<div class="skeleton tall"></div>');
  const confs = CONF_ORDER.map(id => s.confs.find(c => c.id === id)).filter(Boolean);
  return sec('Pick your team') + `<p class="note">Its game stays pinned every week, its cards get a ring in its color, and this tab follows its season.</p>` +
    confs.map(c => `<h3 class="sec sm">${esc(CONF[c.id] || c.name)}</h3><div class="pick-grid">${[...c.teams].sort((a, b) => a.name.localeCompare(b.name)).map(t =>
      `<button class="pick-team" type="button" data-mine="${esc(t.id)}" data-name="${esc(t.name)}" data-logo="${esc(t.logo || '')}">${logo(t.logo, 'logo')}<span>${esc(t.name)}</span></button>`).join('')}</div>`).join('');
}

export function viewMyTeam(){
  if (!myTeam) return picker();
  const s = mySchedule();
  if (s === undefined) return '<div class="skeleton"></div><div class="skeleton tall"></div>';
  // Games also on this week's board use the board's copy, which refreshes every 12s during games.
  const all = s.games.map(g => state.byId[g.id] ?? g);
  const games = all.filter(g => g.st == null || String(g.st) === '2' || g.state !== 'post');   // outlook: regular season
  loadPredictions(all);
  const color = myColor(), c = color.startsWith('#') ? color : s.team.color || '#555';
  const board = state.games.find(mySide), next = !board && myNextGame();
  const nextLine = next ? ` · Next: <a class="dlink" href="${gameHref(next.id)}">${esc(dateShort(next.date))} ${String(next.home.id) === String(s.team.id) ? 'vs' : 'at'} ${esc(next[String(next.home.id) === String(s.team.id) ? 'away' : 'home'].name)}</a>` : '';
  const week = panel('This week', board ? card(board) : `<p class="tt-bye">${state.pickedWeek ? 'No game in the week you picked' : 'Bye this week'}${nextLine}</p>`, ' data-tt="week"');
  // Wide screens: this week, profile and race on the left; outlook and season on the right. Phones: one column,
  // most-used first (order set in CSS).
  return `<div class="tt" style="--mine:${esc(color)}">${header(s.team, c)}<div class="tt-grid">
    <div class="tt-col">${week}${profile(s.team.id)}${race(s.team.id)}</div>
    <div class="tt-col">${outlookPanel(outlook(games, s.team.id), color)}${timeline(all, s.team.id)}</div></div></div>`;
}
