import { esc, pct, fmtTime } from '../util.js';
import { state, CONF, CONF_ORDER, apRank, teamConf } from '../state.js';
import { realMarket } from '../markets.js';
import { teamLink, sec, chips, logo, gameHref } from './components.js';
import { mineRow } from '../myteam.js';

function weekGame(id){
  for (const g of state.games){
    if (g.home.id === id) return [g, 'home'];
    if (g.away.id === id) return [g, 'away'];
  }
  return [];
}

/* "vs #14 Tennessee · W 29-23" or "@ USC · Sat 7:30 PM · 60%" */
function thisWeek(id){
  const [g, side] = weekGame(id);
  if (!g) return '<td class="grp muted">Bye</td>';
  const me = g[side], o = g[side === 'home' ? 'away' : 'home'];
  let tail;
  if (g.state === 'post' && g.completed) tail = `<span class="${me.winner ? 'pos' : 'neg'} strong">${me.winner ? 'W' : 'L'} ${esc(me.score)}-${esc(o.score)}</span>`;
  else if (g.state === 'in') tail = `<span class="status live">${esc(me.score)}-${esc(o.score)}</span>`;
  else {
    const m = realMarket(g), p = m?.pHome ?? state.preds.get(g.id)?.pHome;
    const d = new Date(g.date);
    tail = `<span class="muted">${g.tbd ? d.toLocaleDateString(undefined, {weekday:'short'}) : `${d.toLocaleDateString(undefined, {weekday:'short'})} ${fmtTime(d)}`}</span>` +
      (p != null ? ` <span class="wk-p" title="${m ? 'Market' : 'FPI'} win chance">${pct(side === 'home' ? p : 1 - p)}%</span>` : '');
  }
  return `<td class="grp"><a class="dlink" href="${gameHref(g.id)}">${g.neutral ? 'vs' : side === 'home' ? 'vs' : '@'}</a> ${teamLink(o)} <span class="wk-tail">${tail}</span></td>`;
}

function trend(t){
  if (!t.prev) return '<span class="mv new">New</span>';
  const d = t.prev - t.rank;
  return d > 0 ? `<span class="mv up">▲${d}</span>` : d < 0 ? `<span class="mv dn">▼${-d}</span>` : '<span class="mv">–</span>';
}

const inConf = id => state.rkConf === 'all' || String(teamConf(id)) === state.rkConf;

function apTable(){
  const r = state.rankings;
  if (!r) return '<div class="skeleton tall"></div>';
  const list = r.ranks.filter(t => inConf(t.id)), others = r.others.filter(t => inConf(t.id));
  const rows = list.map(t => {
    const f = state.fpi?.byTeam[t.id];
    return `<tr${mineRow(t.id)}><td class="num rk">${t.rank}</td><td class="num">${trend(t)}</td>
      <td class="team">${logo(t.logo, 'logo sm')}${teamLink({ id: t.id, name: t.name })}${t.fpv ? ` <span class="muted small">(${t.fpv})</span>` : ''}</td>
      <td class="num">${esc(t.record || '–')}</td><td class="num hide-sm">${t.points ?? '–'}</td><td class="num">${f?.rank ?? '–'}</td>${thisWeek(t.id)}</tr>`;
  }).join('');
  return `<div class="tablewrap"><table class="tbl">
    <thead><tr><th class="num">AP</th><th class="num"></th><th>Team</th><th class="num">Record</th><th class="num hide-sm">Pts</th><th class="num">FPI</th><th class="grp">This week</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="muted">No ranked teams in this conference.</td></tr>`}</tbody></table></div>` +
    (others.length ? `<p class="note sub"><b>Also receiving votes:</b> ${others.map(t => `${teamLink({ id: t.id, name: t.name })} ${t.points}`).join(', ')}</p>` : '');
}

function fpiTable(){
  const f = state.fpi;
  if (!f) return state.fpiErr ? `<div class="err"><b>Couldn't load ESPN FPI.</b> ${esc(state.fpiErr)}</div>` : '<div class="skeleton tall"></div>';
  const list = f.list.filter(t => inConf(t.id));
  return `<div class="tablewrap"><table class="tbl">
    <thead><tr><th class="num">FPI</th><th>Team</th><th class="num">Rating</th><th class="num">Record</th><th class="num">AP</th>
      <th class="num hide-sm">Proj</th><th class="num hide-sm">Playoff</th><th class="grp">This week</th></tr></thead>
    <tbody>${list.map(t => {
      const st = state.standings?.byTeam[t.id];
      return `<tr${mineRow(t.id)}><td class="num rk">${t.rank}</td>
        <td class="team">${logo(t.logo, 'logo sm')}${teamLink({ id: t.id, name: st?.name || t.name })}</td>
        <td class="num">${t.fpi?.toFixed(1) ?? '–'}</td>
        <td class="num">${st?.overall ? `${st.overall.w}-${st.overall.l}` : '–'}</td><td class="num">${apRank(t.id) ?? ''}</td>
        <td class="num hide-sm">${t.projW != null ? `${t.projW.toFixed(1)}-${t.projL.toFixed(1)}` : '–'}</td>
        <td class="num hide-sm">${t.playoff != null ? t.playoff.toFixed(t.playoff < 1 && t.playoff > 0 ? 1 : 0) + '%' : '–'}</td>${thisWeek(t.id)}</tr>`;
    }).join('')}</tbody></table></div>`;
}

export function viewRankings(){
  const ap = state.rk !== 'fpi';
  const confs = CONF_ORDER.filter(id => state.standings?.confs.some(c => c.id === id));
  const note = ap
    ? `${esc(state.rankings?.title?.replace(/^\d{4} NCAA Football Rankings - /, '') || 'AP Poll')}. Arrows show movement from last week; first-place votes in parentheses.`
    : `ESPN's Football Power Index: how many points better than an average FBS team on a neutral field.${state.fpi?.updated ? ` Updated ${new Date(state.fpi.updated).toLocaleDateString(undefined, {month:'short', day:'numeric'})}.` : ''}`;
  return `<div class="rk-switch">${chips([['ap', 'AP Top 25'], ['fpi', 'FPI']], ap ? 'ap' : 'fpi', 'rk')}</div>` +
    chips([['all', 'All conferences'], ...confs.map(id => [String(id), CONF[id]])], state.rkConf, 'rkconf') +
    sec(ap ? 'AP Top 25' : 'FPI power rankings') + `<p class="note">${note}</p>` + (ap ? apTable() : fpiTable());
}
