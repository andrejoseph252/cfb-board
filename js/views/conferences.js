import { esc, winPct } from '../util.js';
import { state, CONF, CONF_ORDER, apRank } from '../state.js';
import { teamLink, grid, sec, empty, chips, logo, group } from './components.js';
import { mineRow } from '../myteam.js';

export const rec = r => r ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : '–';

/* Conference win % (no conference games yet counts as .500), then games over .500 in conference, then overall, then point differential. */
const confPct = r => r && r.w + r.l + r.t ? winPct(r) : .5;
const over = r => r ? r.w - r.l : 0;
export const order = (a, b) => confPct(b.confRec) - confPct(a.confRec) || over(b.confRec) - over(a.confRec)
  || winPct(b.overall) - winPct(a.overall) || (b.diff ?? 0) - (a.diff ?? 0);

function standingsTable(c){
  const teams = [...c.teams].sort(order);
  return `<div class="tablewrap"><table class="tbl">
    <thead><tr><th class="num">#</th><th>Team</th><th class="num">Conf</th><th class="num">Overall</th><th class="num">Diff</th><th class="num hide-sm">Strk</th><th class="num">AP</th><th class="num">FPI</th></tr></thead>
    <tbody>${teams.map((t, i) => {
      const f = state.fpi?.byTeam[t.id], ap = apRank(t.id);
      return `<tr${mineRow(t.id)}><td class="num muted">${i + 1}</td>
        <td class="team">${logo(t.logo, 'logo sm')}${teamLink({ ...t, rank: null })}</td>
        <td class="num strong">${rec(t.confRec)}</td><td class="num">${rec(t.overall)}</td>
        <td class="num ${t.diff > 0 ? 'pos' : t.diff < 0 ? 'neg' : ''}">${t.diff > 0 ? '+' : ''}${t.diff ?? '–'}</td>
        <td class="num hide-sm">${esc(t.streak || '–')}</td><td class="num">${ap ?? ''}</td><td class="num">${f?.rank ?? ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

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
