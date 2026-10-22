import { esc } from '../util.js';
import { state, CONF, CONF_ORDER, apRank, teamConf } from '../state.js';
import { teamLink, sec, chips } from './components.js';
import { statTable, recCell, teamCell, rating, weekCols, dash } from './stattable.js';
import { mineRow } from '../myteam.js';
import { ballots, weeksOf, teamWeek, matchesPoll, rankText } from '../ballots.js';
import { boxPlot } from './ballots.js';

function trend(t){
  if (!t.prev) return '<span class="mv new">New</span>';
  const d = t.prev - t.rank;
  return d > 0 ? `<span class="mv up">▲${d}</span>` : d < 0 ? `<span class="mv dn">▼${-d}</span>` : '<span class="mv">–</span>';
}

const inConf = id => state.rkConf === 'all' || String(teamConf(id)) === state.rkConf;

/* The AP poll: rank and team pinned; "Poll" shows the movement, the record and where every voter has them (the
   ballots' spread, on the row itself); "This week" shows the game. With this week's ballots in, a row opens them. */
function apTable(){
  const r = state.rankings;
  if (!r) return '<div class="skeleton tall"></div>';
  const others = r.others.filter(t => inConf(t.id));
  const B = ballots(), bw = weeksOf(B).pop(), live = B && matchesPoll(B, bw);
  const rows = r.ranks.filter(t => inConf(t.id)).map(t => {
    const mr = mineRow(t.id), s = live ? teamWeek(B, bw, t.id) : null;
    const attrs = !live ? mr : (mr ? mr.replace('class="mine"', 'class="mine bx-row"') : ' class="bx-row"') + ` data-href="#ballots/${esc(t.id)}"`;
    return { ...t, s, attrs };
  });
  const name = t => (live ? `<a class="tlink" href="#ballots/${esc(t.id)}">${esc(t.name)}</a>` : teamLink({ id: t.id, name: t.name })) + (t.fpv ? ` <span class="sv-fpv">(${t.fpv})</span>` : '');
  const recd = t => { const m = /^(\d+)-(\d+)(?:-(\d+))?$/.exec(t.record || ''); return m ? recCell(m[1], m[2], m[3]) : esc(t.record || '–'); };
  const spread = t => t.s?.on
    ? `<a class="bxlink" href="#ballots/${esc(t.id)}" title="Every voter's ballot: ${rankText(t.s.hi)} to ${rankText(t.s.lo)}, median ${rankText(Math.round(t.s.med))}" aria-label="${esc(t.name)}: all AP ballots">${boxPlot(t.s)}<span>${rankText(t.s.hi).replace('#', '')}–${rankText(t.s.lo).replace('#', '')}</span></a>`
    : `<span class="sv-na small">${live ? '–' : 'Not in yet'}</span>`;
  return statTable('ap', [
    { h: 'AP', cls: 'num sv-rk', td: t => `<span class="sv-pos big">${t.rank}</span>` },
    { h: 'Team', cls: 'team', td: t => teamCell(t, name(t)) },
    { g: 'poll', h: '+/−', cls: 'num sv-mv', title: 'Movement from last week', td: trend },
    { g: 'poll', h: 'Record', cls: 'num strong', td: recd },
    { g: 'poll', h: 'Ballots', cls: 'sv-bx', title: 'Where the voters have them: best to worst, the box the middle half', td: spread },
    ...weekCols('week')
  ], rows, 'No ranked teams in this conference.') +
    (others.length ? `<p class="note sub"><b>Also receiving votes:</b> ${others.map(t => `${teamLink({ id: t.id, name: t.name })} ${live ? `<a class="bxpts" href="#ballots/${esc(t.id)}" title="See the ballots">${t.points}</a>` : t.points}`).join(', ')}</p>` : '');
}

/* FPI: "Power" (rating, record, AP), "Outlook" (projected record, playoff chance), "This week". */
function fpiTable(){
  const f = state.fpi;
  if (!f) return state.fpiErr ? `<div class="err"><b>Couldn't load ESPN FPI.</b> ${esc(state.fpiErr)}</div>` : '<div class="skeleton tall"></div>';
  const rows = f.list.filter(t => inConf(t.id)).map(t => ({ ...t, st: state.standings?.byTeam[t.id], attrs: mineRow(t.id) }));
  const po = p => p.toFixed(p < 1 && p > 0 ? 1 : 0);
  return statTable('fpi', [
    { h: 'FPI', cls: 'num sv-rk', td: t => `<span class="sv-pos big">${t.rank}</span>` },
    { h: 'Team', cls: 'team', td: t => teamCell(t, teamLink({ id: t.id, name: t.st?.name || t.name })) },
    { g: 'power', h: 'Rating', cls: 'num strong', title: 'Points better than an average FBS team, neutral field', td: t => rating(t.fpi) },
    { g: 'power', h: 'Record', cls: 'num', td: t => t.st?.overall ? recCell(t.st.overall.w, t.st.overall.l) : dash },
    { g: 'power', h: 'AP', cls: 'num', title: 'AP rank', td: t => apRank(t.id) ?? dash },
    { g: 'outlook', h: 'Proj', cls: 'num', title: 'Projected final record', td: t => t.projW != null ? recCell(t.projW.toFixed(1), t.projL.toFixed(1), 0, ' dec') : dash },
    { g: 'outlook', h: 'Playoff', cls: 'num sv-po', title: 'Chance to make the playoff', td: t => t.playoff != null ? `<span class="sv-bar" style="--p:${Math.min(100, t.playoff)}%"></span><span class="sv-pv">${po(t.playoff)}%</span>` : dash },
    ...weekCols('week')
  ], rows, 'No teams in this conference.');
}

export function viewRankings(){
  const ap = state.rk !== 'fpi';
  const confs = CONF_ORDER.filter(id => state.standings?.confs.some(c => c.id === id));
  const note = ap
    ? `${esc(state.rankings?.title?.replace(/^\d{4} NCAA Football Rankings - /, '') || 'AP Poll')}.${ballots() ? ' Tap a team to see every voter\'s ballot.' : ''}`
    : `ESPN's Football Power Index: how many points better than an average FBS team on a neutral field.${state.fpi?.updated ? ` Updated ${new Date(state.fpi.updated).toLocaleDateString(undefined, {month:'short', day:'numeric'})}.` : ''}`;
  return `<div class="rk-switch">${chips([['ap', 'AP Top 25'], ['fpi', 'FPI']], ap ? 'ap' : 'fpi', 'rk')}</div>` +
    chips([['all', 'All conferences'], ...confs.map(id => [String(id), CONF[id]])], state.rkConf, 'rkconf') +
    sec(ap ? 'AP Top 25' : 'FPI power rankings') + `<p class="note">${note}</p>` + (ap ? apTable() : fpiTable());
}
