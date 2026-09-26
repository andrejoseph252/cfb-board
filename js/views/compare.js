import { esc, pct } from '../util.js';
import { state } from '../state.js';
import { realMarket } from '../markets.js';
import { teamLink, sec, empty, logo, gameHref, barColors } from './components.js';

/* Poll-implied win prob: logistic on AP rank gap + home field (unranked treated as #35). */
export function pollP(g){
  if (!g.home.rank && !g.away.rank) return null;
  const x = 0.085 * ((g.away.rank ?? 35) - (g.home.rank ?? 35)) + (g.neutral ? 0 : 0.35);
  return 1 / (1 + Math.exp(-x));
}

const SRC = [
  ['poll', 'Poll', 'What the voters think. The AP rank gap plus home field, turned into a win chance.'],
  ['fpi', 'FPI', 'ESPN\'s computer model, built from each team\'s efficiency on every play.'],
  ['mkt', 'Market', 'Where the money is: Kalshi or Polymarket, or sportsbook odds with the bookmaker\'s cut removed.']
];
const NAME = Object.fromEntries(SRC.map(([k, l]) => [k, l]));

function build(g){
  const m = realMarket(g);
  const p = { poll: pollP(g), fpi: state.preds.get(g.id)?.pHome ?? null, mkt: m?.pHome ?? null };
  const have = SRC.filter(([k]) => p[k] != null).map(([k]) => k);
  if (have.length < 2 || (p.mkt == null && p.fpi == null)) return null;
  const vals = have.map(k => p[k]);
  const spread = Math.max(...vals) - Math.min(...vals);
  if (!(g.home.rank || g.away.rank) && spread < .1) return null;
  const done = g.state === 'post' && g.completed;
  const winner = done ? (g.home.winner ? 'home' : g.away.winner ? 'away' : null) : null;
  return { g, p, have, spread, winner, mktLabel: m?.source === 'Book' ? 'Sportsbook' : m?.source || 'Market' };
}

/* Plain-English read of who each source picks. */
function verdict(r){
  const g = r.g, pick = k => r.p[k] >= .5 ? 'home' : 'away';
  const groups = {};
  for (const k of r.have) (groups[pick(k)] ??= []).push(NAME[k]);
  const join = a => a.length === 1 ? a[0] : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a[0]}, ${a[1]} and ${a[2]}`;
  const sides = Object.entries(groups);
  if (sides.length === 1){
    const side = sides[0][0], t = g[side], all = r.have.length === 3 ? 'All three pick' : `${join(sides[0][1])} both pick`;
    const ps = r.have.map(k => side === 'home' ? r.p[k] : 1 - r.p[k]);
    return { split: false, text: `${all} ${t.name}, anywhere from ${pct(Math.min(...ps))}% to ${pct(Math.max(...ps))}% to win` };
  }
  return { split: true, text: sides.map(([side, who]) => `${join(who)} ${who.length > 1 ? 'pick' : 'picks'} ${g[side].name}`).join(' · ') };
}

function bar(r, k){
  const g = r.g, p = r.p[k];
  const label = k === 'mkt' ? r.mktLabel : NAME[k];
  if (p == null) return `<div class="fc-row none"><span class="fc-src"><i class="dot-${k}"></i>${esc(label)}</span><span class="fc-na">No forecast</span><span></span></div>`;
  const [ca, ch] = barColors(g), a = pct(1 - p), h = 100 - a;
  let mark = '';
  if (r.winner){ const right = (p >= .5 ? 'home' : 'away') === r.winner; mark = `<span class="fc-mark ${right ? 'pos' : 'neg'}" title="${right ? 'Called it' : 'Missed'}">${right ? '✓' : '✗'}</span>`; }
  return `<div class="fc-row"><span class="fc-src"><i class="dot-${k}"></i>${esc(label)}</span>
    <div class="fc-bar" role="img" aria-label="${esc(label)}: ${esc(g.away.name)} ${a}%, ${esc(g.home.name)} ${h}%">
      <span class="${a >= h ? 'lead' : ''}" style="width:${a}%;background:${esc(ca)}">${a}%</span><span class="${h > a ? 'lead' : ''}" style="width:${h}%;background:${esc(ch)}">${h}%</span></div>${mark}</div>`;
}

function card(r){
  const g = r.g, v = verdict(r), sp = Math.round(r.spread * 100);
  const status = r.winner ? `<span class="fc-final">Final: ${esc(g[r.winner].name)} won ${esc(g[r.winner].score)}-${esc(g[r.winner === 'home' ? 'away' : 'home'].score)}</span>`
    : g.state === 'in' ? '<span class="status live">Live</span>' : '';
  return `<article class="fc">
    <div class="fc-head">
      <div class="fc-teams">${logo(g.away.logo)}<span>${teamLink(g.away)} ${g.neutral ? 'vs' : 'at'} ${teamLink(g.home)}</span>${logo(g.home.logo)}</div>
      <a class="dlink" href="${gameHref(g.id)}">${g.state === 'pre' ? 'Preview' : 'Box score'}</a></div>
    <div class="fc-verdict ${v.split ? 'split' : ''}"><b>${v.split ? 'Split' : 'Agree'}</b>${esc(v.text)}</div>
    <div class="fc-bars"><div class="fc-row fc-axis"><span></span><div><span>${esc(g.away.abbr)}</span><span>${esc(g.home.abbr)}</span></div><span></span></div>
      ${SRC.map(([k]) => bar(r, k)).join('')}</div>
    <div class="fc-foot">${status}<span class="spacer"></span><span class="fc-gap" title="Biggest gap between any two forecasts">${sp} pt${sp === 1 ? '' : 's'} apart</span></div>
  </article>`;
}

function scorecard(rows){
  const done = rows.filter(r => r.winner);
  if (!done.length) return '';
  const cells = SRC.map(([k, l]) => {
    const called = done.filter(r => r.p[k] != null), right = called.filter(r => (r.p[k] >= .5 ? 'home' : 'away') === r.winner).length;
    return `<div class="stat"><div class="v">${called.length ? `${right}/${called.length}` : '–'}</div><div class="k"><i class="dot-${k}"></i>${l} called it</div></div>`;
  }).join('');
  return `<h3 class="sec sm">This week's scorecard<span class="n">${done.length} finished</span></h3><div class="stats fc-score">${cells}</div>`;
}

export function viewCompare(){
  const rows = state.games.map(build).filter(Boolean).sort((a, b) => b.spread - a.spread);
  const intro = `<p class="note">Three different ways to predict who wins each game. When they agree, the favorite is a safe bet. When they split, one of them sees something the others don't, which is where upsets and value hide.</p>
    <div class="fc-legend">${SRC.map(([k, l, d]) => `<div><b><i class="dot-${k}"></i>${l}</b><span>${d}</span></div>`).join('')}</div>`;
  if (!rows.length) return sec('Forecasts') + intro + empty('No games with enough forecasts yet. Markets usually open early in the week.');
  const split = rows.filter(r => verdict(r).split), agree = rows.filter(r => !verdict(r).split);
  return sec('Forecasts', rows.length) + intro + scorecard(rows) +
    (split.length ? `<h3 class="sec sm">They disagree on the winner<span class="n">${split.length}</span></h3><div class="fc-list">${split.map(card).join('')}</div>` : '') +
    (agree.length ? `<h3 class="sec sm">Same pick, different confidence<span class="n">${agree.length}</span></h3><p class="note">Sorted by how far apart the win chances are.</p><div class="fc-list">${agree.map(card).join('')}</div>` : '');
}
