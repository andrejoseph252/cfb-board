/* Rankings › Playoff: the committee's latest rankings turned into the 12-team bracket "if the season ended today",
   then the bubble around the cut line. Styles: css/app.css, "Playoff bracket".

   The 2026-27 rules (checked Nov 2026; NCAA.com, Yahoo Sports):
   - Automatic bids: the ACC, Big Ten, Big 12 and SEC champions; the highest-ranked team from the American, Conference
     USA, MAC, Mountain West, Pac-12 and Sun Belt (it needn't be a champion); Notre Dame if it's in the top 12.
   - The rest are at-large, in ranking order. Seeds go straight by ranking, so an automatic bid ranked below 12 takes
     the last spot and bumps the lowest at-large team.
   - Seeds 1-4 get byes. First round on the higher seed's campus: 5-12, 6-11, 7-10, 8-9. Quarterfinals 1 v 8/9,
     4 v 5/12, 2 v 7/10, 3 v 6/11; semifinals the 1 and 4 quarters, the 2 and 3 quarters.
   Before the title games a league's champion is its highest-ranked team, the usual "if the season ended today" read. */
import { esc } from '../util.js';
import { state, CONF, teamConf } from '../state.js';
import { logo, teamHref, visibleColor, statusHTML } from './components.js';

const P4 = [1, 4, 5, 8], G6 = [151, 12, 15, 17, 9, 37], ND = '87';
const SHORT = { 151: 'American', 12: 'C-USA', 17: 'MWC', 37: 'Sun Belt' };
const confName = id => SHORT[id] || CONF[id] || '';
const fpi = id => state.fpi?.byTeam[id];

/* The field: 12 teams seeded, plus who's just out and who was bumped. */
export function field(c){
  const ranks = c.ranks.map(t => ({ ...t, conf: teamConf(t.id) ?? t.conf }));
  const bid = new Map();
  for (const id of P4){
    let t = ranks.find(x => x.conf === id);
    // A league with nobody ranked: its standings leader (rare, and only before the committee has to decide).
    if (!t){ const s = state.standings?.confs.find(x => x.id === id)?.teams[0]; if (s) ranks.push(t = { ...s, rank: null, record: s.overall ? `${s.overall.w}-${s.overall.l}` : '' }); }
    if (t) bid.set(t.id, { k: 'champ', label: `${confName(id)} champ` });
  }
  const g6 = ranks.find(x => G6.includes(x.conf));
  if (g6) bid.set(g6.id, { k: 'g6', label: 'Group of Six' });
  const nd = ranks.find(x => x.id === ND && x.rank && x.rank <= 12);
  if (nd) bid.set(nd.id, { k: 'nd', label: 'Top-12 bid' });

  const order = (a, b) => (a.rank ?? 99) - (b.rank ?? 99);
  const autos = ranks.filter(t => bid.has(t.id)), at = ranks.filter(t => !bid.has(t.id) && t.rank).sort(order);
  const seeds = [...autos, ...at.slice(0, Math.max(0, 12 - autos.length))].sort(order)
    .map((t, i) => ({ ...t, seed: i + 1, bid: bid.get(t.id) }));
  const inIds = new Set(seeds.map(t => t.id)), out = ranks.filter(t => t.rank && !inIds.has(t.id)).sort(order);
  return {
    seeds,
    lastIn: seeds.filter(t => !t.bid || t.bid.k === 'nd').slice(-4),
    firstOut: out.slice(0, 4),
    bumped: out.filter(t => t.rank <= 12),
    jumped: seeds.filter(t => t.bid && t.rank > 12)
  };
}

/* The chance the home side wins, from ESPN FPI ratings (points over an average team on a neutral field): the rating
   gap plus home field, spread like a real game's margin. An estimate, labeled as one. */
function homeWin(h, a){
  const fh = fpi(h.id)?.fpi, fa = fpi(a.id)?.fpi;
  if (fh == null || fa == null) return null;
  const z = (fh - fa + 2.5) / 13.5, t = 1 / (1 + .2316419 * Math.abs(z));
  const p = 1 - .3989423 * Math.exp(-z * z / 2) * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? p : 1 - p;
}
const pc = p => p < .01 ? '<1' : p > .99 ? '>99' : Math.round(p * 100);
const color = t => visibleColor({ color: t.color || state.standings?.byTeam[t.id]?.color, alt: t.alt });

const STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .8l2.2 4.7 5.1.6-3.8 3.5 1 5.1L8 12.2l-4.5 2.5 1-5.1L.7 6.1l5.1-.6z" fill="currentColor"/></svg>';
const TROPHY = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M15 6h18v9c0 6.2-3.6 11-9 11s-9-4.8-9-11V6z" fill="currentColor" opacity=".9"/><path d="M15 9H8.5c0 6 2.8 9.6 7.6 10.4M33 9h6.5c0 6-2.8 9.6-7.6 10.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M21 26h6v7h-6z" fill="currentColor" opacity=".75"/><path d="M15 35.5h18l1.5 6.5h-21z" fill="currentColor"/></svg>';

/* One team in the bracket. size: '' (first round), 'bye' (a quarterfinal host). */
function slot(t, { size = '', right = '' } = {}){
  const f = fpi(t.id), tag = t.bid ? `<span class="po-bid ${t.bid.k}" title="Automatic bid">${STAR}${esc(t.bid.label)}</span>` : '';
  const rk = t.rank !== t.seed ? `<span class="po-rk" title="Committee rank">${t.rank ? '#' + t.rank : 'NR'}</span>` : '';
  return `<a class="po-t${size ? ' ' + size : ''}" href="${teamHref(t.id)}" style="--tc:${color(t)}" aria-label="Seed ${t.seed}, ${esc(t.name)}${t.rank ? `, ranked ${t.rank}` : ''}">
    <span class="po-seed">${t.seed}</span>${logo(t.logo, 'logo po-logo')}
    <span class="po-nm"><b>${esc(t.name)}</b><span class="po-meta">${esc(t.record || '')}${rk}${tag}</span></span>
    ${right || (size === 'bye' && f?.title != null ? `<span class="po-r" title="Chance to win the title (ESPN FPI)"><b>${f.title < 1 ? '<1' : Math.round(f.title)}%</b><small>title</small></span>` : '')}</a>`;
}
/* A spot waiting on a game: the possible teams' logos, and who they are. */
const tbd = (ts, label) => `<div class="po-tbd"><span class="po-tl">${ts.map(t => logo(t.logo, 'logo po-mini')).join('')}</span><span>${label}</span></div>`;

/* A quarter of the bracket: the bye team on top, the first-round game on its campus feeding the spot below it. */
function pod(S, top){
  const a = S[8 - top], b = S[7 + top];   // 1: 8 v 9, 2: 7 v 10, 3: 6 v 11, 4: 5 v 12
  const bye = S[top - 1], p = homeWin(a, b);
  const fav = p == null ? null : p >= .5 ? [a, p] : [b, 1 - p];
  const odds = t => fav && fav[0] === t ? `<span class="po-r" title="Chance to win, from ESPN FPI ratings with home field"><b>${pc(fav[1])}%</b><small>to win</small></span>` : '<span class="po-r"></span>';
  return `<section class="po-pod" aria-label="Quarterfinal: ${esc(bye.name)} and the ${a.seed}-${b.seed} winner">
    <div class="po-h"><span>Quarterfinal</span><span class="po-bye">Bye</span></div>
    ${slot(bye, { size: 'bye' })}
    ${tbd([a, b], `Winner of ${a.seed}&thinsp;·&thinsp;${b.seed}`)}
    <div class="po-r1">
      <div class="po-h sub"><span>First round</span><span>at ${esc(a.name)}</span></div>
      ${slot(a, { right: odds(a) })}${slot(b, { right: odds(b) })}
    </div>
  </section>`;
}

/* A semifinal or the final: who could be there, one side against the other, and the FPI favorite among them. */
const quarter = q => S => [S[q - 1], S[8 - q], S[7 + q]];
function stage(name, sides, cls){
  const fav = sides.flat().map(t => [t, fpi(t.id)?.title]).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1])[0];
  const side = ts => `<span class="po-side">${ts.map((t, i) => `<a href="${teamHref(t.id)}" title="${t.seed} ${esc(t.name)}"${i ? ' class="dim"' : ''}>${logo(t.logo, 'logo po-mini')}</a>`).join('')}</span>`;
  return `<div class="po-stage ${cls}"><div class="po-sn">${name}</div>
    <div class="po-sl">${side(sides[0])}<span class="po-vs">vs</span>${side(sides[1])}</div>
    ${fav ? `<div class="po-fav" title="Highest chance to win the title (ESPN FPI)">FPI favorite <b>${esc(fav[0].name)}</b></div>` : ''}</div>`;
}

/* The week's game for a bubble team: opponent and kickoff, the live score, or the result. */
function thisWeek(id){
  const g = state.games.find(x => x.home.id === id || x.away.id === id);
  if (!g) return '<span class="po-wk off">Off this week</span>';
  const home = g.home.id === id, me = home ? g.home : g.away, op = home ? g.away : g.home;
  const vs = `${home ? 'vs' : 'at'} ${op.rank ? `<span class="po-orank">#${op.rank}</span>` : ''}${esc(op.name)}`;
  if (g.state === 'pre') return `<a class="po-wk" href="#game/${esc(g.id)}">${vs}<span class="po-when">${statusHTML(g)}</span></a>`;
  const s = `${me.score ?? 0}–${op.score ?? 0}`;
  if (g.state === 'in') return `<a class="po-wk live" href="#game/${esc(g.id)}"><b>${s}</b> ${vs}<span class="po-when">${statusHTML(g, true)}</span></a>`;
  const w = Number(me.score) > Number(op.score);
  return `<a class="po-wk ${w ? 'won' : 'lost'}" href="#game/${esc(g.id)}"><b>${w ? 'W' : 'L'} ${s}</b> ${vs}</a>`;
}

function bubbleRow(t, inside){
  const f = fpi(t.id), p = f?.playoff;
  const c = confName(t.conf);
  return `<li class="po-b${inside ? ' in' : ''}" style="--tc:${color(t)}">
    <span class="po-brk">${t.rank ?? 'NR'}</span>${logo(t.logo, 'logo po-logo')}
    <a class="po-bn" href="${teamHref(t.id)}"><b>${esc(t.name)}</b><span>${esc(t.record || '')}${c ? ` · ${esc(c)}` : ''}${inside ? ` · <em>${t.seed} seed</em>` : ''}</span></a>
    ${thisWeek(t.id)}
    ${p != null ? `<span class="po-pp" title="Chance to make the playoff (ESPN FPI)"><span class="po-ppbar"><i style="width:${Math.min(100, p)}%"></i></span><b>${p < 1 && p > 0 ? '<1' : Math.round(p)}%</b></span>` : '<span class="po-pp"></span>'}
  </li>`;
}

export function viewPlayoff(){
  const c = state.rankings?.cfp;
  if (!state.rankings) return '<div class="skeleton tall"></div>';
  if (!c) return `<div class="empty">The selection committee hasn't released its rankings yet. They start in early November and come out every Tuesday night, and the bracket fills in here.</div>`;
  const F = field(c), S = F.seeds;
  if (S.length < 12) return `<div class="empty">Not enough ranked teams to build the bracket yet.</div>`;
  const released = c.date ? new Date(c.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const half = (x, y, side) => `<div class="po-half ${side}">${pod(S, x)}${pod(S, y)}<i class="po-join" aria-hidden="true"></i>
    ${stage('Semifinal', [quarter(x)(S), quarter(y)(S)], 'semi')}</div>`;
  const story = [
    ...F.jumped.map(t => `<b>${esc(t.name)}</b> (#${t.rank}) gets in as the ${t.bid.k === 'g6' ? 'top-ranked Group of Six team' : esc(t.bid.label.replace(' champ', '')) + ' leader'}`),
  ];
  const bumpNote = F.jumped.length && F.bumped.length
    ? `<p class="po-story">${story.join(' and ')}, which ${F.bumped.length === 1 ? 'bumps' : 'bump'} ${F.bumped.map(t => `<b>#${t.rank} ${esc(t.name)}</b>`).join(' and ')} out of the field.</p>` : '';
  const champs = S.filter(t => t.bid?.k === 'champ').length;

  return `<div class="po">
    <header class="po-hero"><div class="po-hl">
      <div class="po-eyebrow">If the season ended today</div>
      <h2 class="po-title">The Playoff</h2>
      <p class="po-sub">${esc(c.title || 'CFP rankings')}${released ? ` · released ${esc(released)}` : ''} · new rankings every Tuesday night</p>
      <ul class="po-key"><li><span class="po-bid champ">${STAR}</span>${champs} projected champions + top Group of Six team get automatic bids</li><li><span class="po-kb">1–4</span>Byes, by ranking</li><li><span class="po-kb">5–12</span>First round on campus</li></ul></div>
      <ol class="po-field" aria-label="The field, by seed">${S.map(t => `<li style="--tc:${color(t)}"><a href="${teamHref(t.id)}" title="${t.seed} ${esc(t.name)}">${logo(t.logo, 'logo po-mini')}<span>${t.seed}</span></a></li>`).join('')}</ol>
    </header>
    <div class="po-bracket">
      ${half(1, 4, 'l')}
      <div class="po-final"><div class="po-cup">${TROPHY}</div>${stage('National Championship', [[S[0], S[3]], [S[1], S[2]]], 'title')}</div>
      ${half(2, 3, 'r')}
    </div>
    <h3 class="po-sec">On the bubble</h3>
    ${bumpNote}
    <ol class="po-bub">
      <li class="po-bh"><span>Last in</span></li>
      ${F.lastIn.map(t => bubbleRow(t, true)).join('')}
      <li class="po-cut" aria-label="Cut line"><span>Cut line</span></li>
      <li class="po-bh out"><span>First out</span></li>
      ${F.firstOut.map(t => bubbleRow(t, false)).join('')}
    </ol>
    <p class="note sub">Seeds follow the committee's ranking; automatic bids ranked below 12 take the last spots. A league's champion here is its highest-ranked team until the title games. Win and title chances are estimates from ESPN FPI.</p>
  </div>`;
}
