import { esc, pct, fmtTime } from '../util.js';
import { state, CONF, apRank } from '../state.js';
import * as api from '../api.js';
import { parseSchedule } from '../models.js';
import { loadPredictions } from '../data.js';
import { realMarket } from '../markets.js';
import { useData } from '../resource.js';
import { teamLink, logo, detailHead, panel, gameHref } from './components.js';
import { isMine, STAR } from '../myteam.js';

export function viewTeam(id){
  const e = useData('team:' + id, () => api.teamSchedule(id), parseSchedule);
  if (e.err && !e.data) return `<div class="err"><b>Couldn't load this schedule.</b> ${esc(e.err)}</div>`;
  if (!e.data) return '<div class="skeleton"></div><div class="skeleton tall"></div>';
  const { team: t, games } = e.data;

  const upcoming = games.filter(g => g.state === 'pre');
  if (upcoming.length) loadPredictions(upcoming);

  const st = state.standings?.byTeam[t.id], f = state.fpi?.byTeam[t.id], ap = apRank(t.id);
  const conf = t.conf ?? st?.conf;
  const facts = [
    t.record && `<b>${esc(t.record)}</b> overall`,
    st?.confRec && `<b>${st.confRec.w}-${st.confRec.l}</b> ${esc(CONF[conf] || 'conf')}`,
    t.standing && esc(t.standing),
    f?.rank && `FPI <b>#${f.rank}</b> (${f.fpi.toFixed(1)})`,
    f?.projW != null && `Proj <b>${f.projW.toFixed(1)}-${f.projL.toFixed(1)}</b>`,
    f?.playoff != null && `Playoff <b>${f.playoff.toFixed(0)}%</b>`
  ].filter(Boolean).map(x => `<span>${x}</span>`).join('');

  let w = 0, l = 0;
  const rows = games.map(g => {
    const side = String(g.home.id) === String(t.id) ? 'home' : 'away';
    const me = g[side], o = g[side === 'home' ? 'away' : 'home'];
    const where = g.neutral ? 'vs' : side === 'home' ? 'vs' : '@';
    let res, cls = '';
    if (g.state === 'post' && g.completed){
      const won = me.winner || (!o.winner && Number(me.score) > Number(o.score));
      won ? w++ : l++; cls = won ? 'W' : 'L';
      res = `<a class="res-link" href="${gameHref(g.id)}"><b class="${cls}">${cls}</b> ${esc(me.score)}-${esc(o.score)}</a>`;
    } else if (g.state === 'in'){
      res = `<a class="res-link live" href="${gameHref(g.id)}"><span class="status live">${esc(g.detail)}</span> ${esc(me.score)}-${esc(o.score)}</a>`;
    } else {
      const d = new Date(g.date), tbd = /TBD/i.test(g.detail || '');
      const pr = state.preds.get(g.id)?.pHome, m = realMarket(g);
      const pw = m?.pHome ?? pr;
      const win = pw != null ? `<span class="swin">${m ? 'Market' : 'FPI'} ${pct(side === 'home' ? pw : 1 - pw)}%</span>` : '';
      res = `<a class="res-link" href="${gameHref(g.id)}">${tbd ? 'TBD' : fmtTime(d)}</a>${win}`;
    }
    const running = cls ? `${w}-${l}` : '';
    const d = new Date(g.date);
    return `<li class="srow${g.state === 'in' ? ' is-live' : ''}">
      <span class="sdate"><span class="wd">${d.toLocaleDateString(undefined, {weekday:'short'})} </span>${d.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
      <span class="sopp"><span class="muted">${where}</span> ${o.id ? `<a href="#team/${esc(o.id)}" tabindex="-1" aria-hidden="true">${logo(o.logo, 'logo sm')}</a>` : ''}${teamLink(o)}</span>
      <span class="sres">${res}</span><span class="srec">${running}</span></li>`;
  }).join('');

  const rankTag = ap ? `<span class="rank">${ap}</span>` : '';
  const mine = isMine(t.id);
  const myBtn = `<button class="mine-btn" type="button" data-mine="${esc(t.id)}" data-name="${esc(t.name)}" data-color="${esc(t.color || '')}" data-logo="${esc(t.logo || '')}" aria-pressed="${mine}"
    title="${mine ? 'Your team. Tap to unset' : 'Follow this team: always pinned, with a ring in its color'}">${STAR}<span>${mine ? 'My team' : 'Make my team'}</span></button>`;
  return detailHead({ title: rankTag + esc(t.full), label: t.full, sub: facts, logoSrc: t.logo, color: t.color, right: myBtn }) +
    panel(`${e.data.season || ''} schedule`, `<div class="shead"><span>Date</span><span>Opponent</span><span>Result</span><span>Record</span></div><ol class="sched">${rows}</ol>`) +
    `<p class="note">Tap any opponent to jump to their schedule, or a result for the box score. Back returns to the previous team.</p>`;
}
