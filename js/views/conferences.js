import { esc, winPct } from '../util.js';
import { state, CONF, CONF_ORDER, apRank } from '../state.js';
import { teamLink, grid, sec, empty, chips, logo, group } from './components.js';
import { mineRow, isMine } from '../myteam.js';

export const rec = r => r ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : '–';

/* Conference win % (no conference games yet counts as .500), then games over .500 in conference, then overall, then point differential. */
const confPct = r => r && r.w + r.l + r.t ? winPct(r) : .5;
const over = r => r ? r.w - r.l : 0;
export const order = (a, b) => confPct(b.confRec) - confPct(a.confRec) || over(b.confRec) - over(a.confRec)
  || winPct(b.overall) - winPct(a.overall) || (b.diff ?? 0) - (a.diff ?? 0);

/* ---------- standings: list rows with the conference race ----------
   Each team is a row led by its conference record; a tap opens the rest (differential, streak, AP, FPI), which a wide
   list shows as columns instead. Ties share a place ("T3").
   The race: each team's chance to win the conference, from ESPN's FPI (it plays out the rest of the season), shown
   beside the record and coloring the row: contenders, in the hunt, long shots, out. The two best chances, the
   projected title game, get their odds in a solid pill. Without FPI, the race falls back to the standings: the top two (and anyone tied with
   second) in the title game spot, teams within a loss of second in the hunt, the rest out. */
const open = new Set();   // rows opened by a tap, kept across re-renders
const CHEV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TIERS = { title: 'Title game', hunt: 'In the hunt', out: 'Out of the race' };
const ODDS = [['title', 'Contender'], ['hunt', 'In the hunt'], ['long', 'Long shot'], ['out', 'Out']];
const oddsTier = p => p >= 10 ? 'title' : p >= 1 ? 'hunt' : p > 0 ? 'long' : 'out';
const oddsText = p => p >= 1 ? `${Math.round(p)}%` : p > 0 ? '<1%' : '–';
const same = (a, b) => a && b && a.w === b.w && a.l === b.l && (a.t || 0) === (b.t || 0);
function race(teams, id){
  if (CONF[id] === 'Independents' || teams.length < 3) return teams.map(() => null);
  const second = teams[1].confRec, L2 = second?.l ?? 0;
  return teams.map((t, i) => i < 2 || same(t.confRec, second) ? 'title' : (t.confRec?.l ?? 0) <= L2 + 1 ? 'hunt' : 'out');
}
function standingsTable(c){
  const teams = [...c.teams].sort(order);
  const odds = t => state.fpi?.byTeam[t.id]?.winConf;
  const withOdds = CONF[c.id] !== 'Independents' && teams.some(t => odds(t) > 0);
  const tier = withOdds ? teams.map(t => oddsTier(odds(t) || 0)) : race(teams, c.id);
  const favs = withOdds ? new Set([...teams].sort((a, b) => (odds(b) || 0) - (odds(a) || 0)).slice(0, 2).map(t => t.id)) : new Set();
  const head = `<div class="rw-head rw-conf${withOdds ? ' rw-odds' : ''}"><span class="c-n">#</span><span class="c-t">Team</span>${withOdds ? '<span class="c-od" title="Chance to win the conference (ESPN FPI)">Title</span>' : ''}<span class="c-cr">Conf</span><span class="c-ov">Overall</span>
    <span class="c-df">Diff</span><span class="c-st">Strk</span><span class="c-ap">AP</span><span class="c-fp">FPI</span><span class="c-x"></span></div>` +
    (withOdds ? `<div class="rw-key">${ODDS.map(([k, l]) => `<span class="t-${k}"><i></i>${l}</span>`).join('')}<span class="k-fav"><b>%</b>Projected title game</span><em>Odds: ESPN FPI</em></div>` : '');
  let place = 0;
  const rows = teams.map((t, i) => {
    if (i === 0 || !same(t.confRec, teams[i - 1].confRec)) place = i + 1;
    const tied = same(t.confRec, teams[i - 1]?.confRec) || same(t.confRec, teams[i + 1]?.confRec);
    const f = state.fpi?.byTeam[t.id], ap = apRank(t.id), key = 'c:' + t.id, o = open.has(key);
    const diff = t.diff == null ? '–' : `${t.diff > 0 ? '+' : ''}${t.diff}`, dc = t.diff > 0 ? 'pos' : t.diff < 0 ? 'neg' : '';
    const sc = /^W/.test(t.streak) ? 'pos' : /^L/.test(t.streak) ? 'neg' : '';
    const stat = (label, v, cls = '') => `<span class="rw-s ${cls}"><small>${label}</small><b>${v}</b></span>`;
    // Record-based race only: a label where each level starts (with odds the levels don't follow the order).
    const label = !withOdds && tier[i] && tier[i] !== tier[i - 1] ? `<div class="rw-tier t-${tier[i]}"><span>${TIERS[tier[i]]}</span></div>` : '';
    const p = odds(t) || 0;
    const od = withOdds ? `<span class="c-od${favs.has(t.id) ? ' fav' : ''}" title="${esc(t.name)}: ${p >= 1 ? p.toFixed(1) : p > 0 ? 'under 1' : '0'}% to win the conference (ESPN FPI)"><b>${oddsText(p)}</b><i style="--p:${Math.min(100, p)}%"></i></span>` : '';
    const mine = mineRow(t.id).replace('class="mine"', '');
    return `${label}<div class="rw-row rw-conf${withOdds ? ' rw-odds' : ''}${tier[i] ? ' t-' + tier[i] : ''}${isMine(t.id) ? ' rw-mine' : ''}"${mine} data-rwx="${key}"${o ? ' data-open' : ''}>
      <span class="c-n">${tied ? 'T' : ''}${place}</span>
      <span class="c-t">${logo(t.logo, 'logo sm')}${teamLink({ ...t, rank: ap })}</span>${od}
      <span class="c-cr">${rec(t.confRec)}</span><span class="c-ov">${rec(t.overall)}</span>
      <span class="c-df ${dc}">${diff}</span><span class="c-st ${sc}">${esc(t.streak || '–')}</span>
      <span class="c-ap">${ap ?? '–'}</span><span class="c-fp">${f?.rank ?? '–'}</span>
      <button class="rw-x" type="button" aria-expanded="${o}" aria-label="More about ${esc(t.name)}">${CHEV}</button>
      <div class="rw-more">${stat('Diff', diff, dc)}${stat('Streak', esc(t.streak || '–'), sc)}${stat('AP', ap ? '#' + ap : '–')}${stat('FPI', f?.rank ? '#' + f.rank : '–', 'fpi')}</div></div>`;
  });
  return `<div class="rw" data-rw="conf">${head}${rows.join('')}</div>`;
}
// A tap on a row (not on a link) opens or closes its details.
document.addEventListener('click', e => {
  const r = e.target.closest('.rw-row[data-rwx]'); if (!r || e.target.closest('a')) return;
  const k = r.dataset.rwx, on = !open.has(k);
  on ? open.add(k) : open.delete(k);
  r.toggleAttribute('data-open', on); r.querySelector('.rw-x')?.setAttribute('aria-expanded', on);
});

function games(id){
  const gs = state.games.filter(g => g.home.conf === id || g.away.conf === id);
  if (!gs.length) return empty('No games this week.');
  const inConf = gs.filter(g => g.home.conf === id && g.away.conf === id), non = gs.filter(g => !(g.home.conf === id && g.away.conf === id));
  return (inConf.length ? group('Conference', inConf.length, grid(inConf), CONF[id]) : '') +
    (non.length ? group('Non-conference', non.length, grid(non), CONF[id]) : '');
}

export function viewConferences(){
  const s = state.standings;
  const ids = CONF_ORDER.filter(id => s ? s.confs.some(c => c.id === id) : state.games.some(g => g.home.conf === id || g.away.conf === id));
  const shown = state.conf === 'all' || !ids.includes(Number(state.conf)) ? ids : [Number(state.conf)];
  const head = chips([['all', 'All'], ...ids.map(id => [id, CONF[id]])], state.conf, 'conf');
  const left = id => {
    if (!s) return state.standingsErr ? `<div class="err"><b>Couldn't load standings.</b> ${esc(state.standingsErr)}</div>` : '<div class="skeleton tall"></div>';
    const c = s.confs.find(x => x.id === id);
    return c ? standingsTable(c) : '';
  };
  const n = id => state.games.filter(g => g.home.conf === id || g.away.conf === id).length;
  return head + shown.map(id => `<section class="split">${sec(CONF[id], n(id))}
      <div>${left(id)}</div><div>${games(id)}</div></section>`).join('');
}
