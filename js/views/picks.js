import { esc, pct, fmtTime } from '../util.js';
import { picks } from '../picks.js';
import { grade, signed, money, betHow } from '../bets.js';
import { teamLink, sec, empty, gameHref } from './components.js';

const tone = n => n > .005 ? 'pos' : n < -.005 ? 'neg' : '';
const shortWk = wk => String(wk || '').replace(/^Week /, 'Wk ');

/* Net per week, oldest first: bars up (won) or down (lost) from a zero line, filling the card's width. The best and
   worst weeks carry their amounts; every bar's amount is in its tooltip and in the week headers below. */
const BAR_H = 54;
function weekBars(weeks){
  if (weeks.length < 2) return '';
  const max = Math.max(...weeks.map(w => Math.abs(w.net)), 1);
  const hi = weeks.reduce((a, b) => b.net > a.net ? b : a), lo = weeks.reduce((a, b) => b.net < a.net ? b : a);
  const col = w => {
    const h = Math.max(2, Math.round(Math.abs(w.net) / max * BAR_H)), lab = (w === hi && w.net > 0) || (w === lo && w.net < 0);
    const bar = `<b class="${w.net > 0 ? 'pos' : w.net < 0 ? 'neg' : 'zero'}" style="height:${w.net ? h : 2}px"></b>`, amt = lab ? `<i>${esc(signed(w.net))}</i>` : '';
    return `<div class="wb" title="${esc(w.wk)}: ${esc(signed(w.net))} on ${w.n} bet${w.n === 1 ? '' : 's'}">
      <div class="wb-up">${w.net > 0 ? amt + bar : ''}</div><div class="wb-dn">${w.net < 0 ? bar + amt : w.net ? '' : bar}</div>
      <span class="wb-x">${esc(shortWk(w.wk))}</span></div>`;
  };
  return `<section class="wkc"><h3>Week by week</h3>
    <div class="wbars" role="img" aria-label="Profit by week: ${esc(weeks.map(w => `${w.wk} ${signed(w.net)}`).join(', '))}">${weeks.map(col).join('')}</div></section>`;
}

function betCell(p, b){
  if (b.state === 'none') return `${money(b.amt)} ${b.type === 'ml' ? 'moneyline<br>No price' : 'spread<br>No line'}`;
  const how = esc(betHow(p, b, true));
  if (b.state === 'open') return `${money(b.amt)} to win <b>${money(b.toWin)}</b><br>${how}`;
  return `<b class="net ${tone(b.net)}">${signed(b.net)}</b><br>${money(b.amt)} · ${how}${b.result === 'P' ? ', push' : ''}`;
}

export function viewPicks(){
  const all = Object.entries(picks).map(([id, p]) => ({ id, ...p })).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!all.length) return sec('My picks') + empty('No picks yet. On any game that hasn\'t kicked off, tap a team\'s abbreviation to pick them. Open the game to set a bet. Picks lock at kickoff and grade themselves when the game ends.');
  for (const p of all) p.b = grade(p, p.id);

  const settled = all.filter(p => p.b.state === 'settled'), open = all.filter(p => p.b.state === 'open');
  const net = settled.reduce((t, p) => t + p.b.net, 0), risked = settled.reduce((t, p) => t + p.b.amt, 0);
  const w = settled.filter(p => p.b.result === 'W').length, l = settled.filter(p => p.b.result === 'L').length, pu = settled.length - w - l;
  const atRisk = open.reduce((t, p) => t + p.b.amt, 0), toWin = open.reduce((t, p) => t + p.b.toWin, 0);

  let h = sec('My picks') + `<div class="stats">
    <div class="stat"><div class="v ${tone(net)}">${settled.length ? signed(net) : '–'}</div><div class="k">Profit on ${settled.length} settled bet${settled.length === 1 ? '' : 's'}</div></div>
    <div class="stat"><div class="v ${tone(net)}">${risked ? `${net >= 0 ? '+' : '−'}${Math.abs(Math.round(net / risked * 100))}%` : '–'}</div><div class="k">Return${risked ? ` on ${money(risked)} risked` : ''}</div></div>
    <div class="stat"><div class="v">${w}–${l}${pu ? `–${pu}` : ''}</div><div class="k">Won–lost${pu ? '–push' : ''}${w + l ? `, ${pct(w / (w + l))}% hit rate` : ''}</div></div>
    <div class="stat"><div class="v">${open.length ? money(toWin) : '–'}</div><div class="k">${open.length ? `To win on ${open.length} open bet${open.length === 1 ? '' : 's'} (${money(atRisk)} riding)` : 'No open bets'}</div></div></div>`;

  const groups = {};
  for (const p of all) (groups[p.wk || 'Earlier'] ??= []).push(p);
  const weeks = Object.entries(groups).map(([wk, list]) => {
    const st = list.filter(p => p.b.state === 'settled');
    return { wk, list, n: st.length, net: st.reduce((t, p) => t + p.b.net, 0) };
  });
  h += weekBars(weeks.filter(x => x.n).reverse());


  for (const { wk, list, n, net: wn } of weeks){
    h += `<h3 class="sec sm">${esc(wk)}<span class="n">${list.length}</span>${n ? `<span class="wk-net ${tone(wn)}">${signed(wn)}</span>` : ''}</h3><div class="plist">` + list.map(p => {
      const b = p.b, res = b.state === 'settled' ? b.result : p.result, pre = !p.result && new Date(p.date) > Date.now();
      return `<div class="prow"><span class="res ${res || ''}">${res || '·'}</span>
        <div class="main"><div>${teamLink({ id: p.teamId, name: p.team })} ${p.home ? 'vs' : 'at'} ${teamLink({ id: p.oppId, name: p.opp })}</div>
        <div class="meta"><a class="dlink" href="${gameHref(p.id)}">${p.final ? esc(p.final) : new Date(p.date).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'}) + ' ' + fmtTime(new Date(p.date))}</a></div></div>
        <div class="mp">${betCell(p, b)}${pre ? `<br><a class="chipbtn" href="${gameHref(p.id)}">Edit bet</a> <button class="chipbtn" data-unpick="${esc(p.id)}">Remove</button>` : ''}</div></div>`;
    }).join('') + '</div>';
  }
  return h;
}
