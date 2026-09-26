import { esc, pct } from '../util.js';
import { state, CONF, CONF_ORDER, apRank, teamConf } from '../state.js';
import { realMarket } from '../markets.js';
import { pollP } from './compare.js';
import { teamLink, sec, chips, logo, gameHref } from './components.js';

function weekGame(id){
  for (const g of state.games){
    if (g.home.id === id) return [g, 'home'];
    if (g.away.id === id) return [g, 'away'];
  }
  return [];
}
const forSide = (p, side) => p == null ? null : side === 'home' ? p : 1 - p;
const pcell = p => p == null ? '<td class="num muted">–</td>' : `<td class="num">${pct(p)}%</td>`;

export function viewPower(){
  const f = state.fpi;
  if (!f) return state.fpiErr ? `<div class="err"><b>Couldn't load ESPN FPI.</b> ${esc(state.fpiErr)}</div>` : '<div class="skeleton tall"></div>';
  const filter = state.powerFilter || 'all';
  let list = f.list;
  if (filter === 'ap') list = list.filter(t => apRank(t.id));
  else if (filter !== 'all') list = list.filter(t => String(teamConf(t.id)) === filter);
  const confs = CONF_ORDER.filter(id => f.list.some(t => teamConf(t.id) === id));
  return sec('Power rankings', list.length, 'team') +
    `<p class="note">ESPN's Football Power Index: expected point margin against an average FBS team on a neutral field. "This week" compares three views of each team's next game: the AP-rank model, FPI's own projection, and the market price.${f.updated ? ` FPI updated ${new Date(f.updated).toLocaleDateString(undefined, {month:'short', day:'numeric'})}.` : ''}</p>` +
    chips([['all', 'All FBS'], ['ap', 'AP Top 25'], ...confs.map(id => [String(id), CONF[id]])], filter, 'power') +
    `<div class="tablewrap"><table class="tbl power">
      <thead><tr><th class="num">FPI</th><th>Team</th><th class="num">Rating</th><th class="num">AP</th><th class="num">Record</th>
        <th class="num hide-sm">Proj</th><th class="num hide-sm">Playoff</th>
        <th class="grp">This week</th><th class="num">Poll</th><th class="num">FPI</th><th class="num">Market</th></tr></thead>
      <tbody>${list.map(t => {
        const ap = apRank(t.id), st = state.standings?.byTeam[t.id];
        const [g, side] = weekGame(t.id);
        let wk = '<td class="grp muted">No game</td><td></td><td></td><td></td>';
        if (g){
          const o = g[side === 'home' ? 'away' : 'home'];
          const m = realMarket(g);
          const result = g.state === 'post' && g.completed ? ` <span class="${g[side].winner ? 'pos' : 'neg'}">${g[side].winner ? 'W' : 'L'} ${esc(g[side].score)}-${esc(o.score)}</span>` : '';
          wk = `<td class="grp"><a class="dlink" href="${gameHref(g.id)}">${side === 'home' ? 'vs' : '@'}</a> ${teamLink(o)}${result}</td>
            ${pcell(forSide(pollP(g), side))}${pcell(forSide(state.preds.get(g.id)?.pHome, side))}${pcell(forSide(m?.pHome, side))}`;
        }
        return `<tr><td class="num strong">${t.rank}</td>
          <td class="team">${logo(t.logo, 'logo sm')}${teamLink({ id: t.id, name: st?.name || t.name })}</td>
          <td class="num">${t.fpi?.toFixed(1) ?? '–'}</td><td class="num">${ap ?? ''}</td>
          <td class="num">${st?.overall ? `${st.overall.w}-${st.overall.l}` : '–'}</td>
          <td class="num hide-sm">${t.projW != null ? `${t.projW.toFixed(1)}-${t.projL.toFixed(1)}` : '–'}</td>
          <td class="num hide-sm">${t.playoff != null ? t.playoff.toFixed(t.playoff < 1 && t.playoff > 0 ? 1 : 0) + '%' : '–'}</td>${wk}</tr>`;
      }).join('')}</tbody></table></div>`;
}
