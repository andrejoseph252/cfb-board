import { esc, pct, fmtTime } from '../util.js';
import { picks } from '../picks.js';
import { teamLink, sec, empty, gameHref } from './components.js';

export function viewPicks(){
  const all = Object.entries(picks).map(([id, p]) => ({ id, ...p })).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!all.length) return sec('My picks') + empty('No picks yet. On any game that hasn\'t kicked off, tap a team\'s abbreviation to pick them. Picks lock at kickoff and grade themselves when the game ends.');
  const done = all.filter(p => p.result === 'W' || p.result === 'L'), w = done.filter(p => p.result === 'W').length;
  const priced = done.filter(p => (p.pClose ?? p.p) != null);
  const exp = priced.reduce((s, p) => s + (p.pClose ?? p.p), 0), act = priced.filter(p => p.result === 'W').length;
  const edge = act - exp, dogs = done.filter(p => p.result === 'W' && (p.p ?? 1) < .5).length;
  const pending = all.filter(p => !p.result).length;
  let h = sec('My picks') + `<div class="stats">
    <div class="stat"><div class="v">${w}–${done.length - w}</div><div class="k">Record${done.length ? `, ${pct(w / done.length)}% hit rate` : ''}</div></div>
    <div class="stat"><div class="v">${priced.length ? (edge >= 0 ? '+' : '−') + Math.abs(edge).toFixed(1) : '–'}</div><div class="k">Wins vs market expectation${priced.length ? ` (${act} won, ${exp.toFixed(1)} expected)` : ''}</div></div>
    <div class="stat"><div class="v">${dogs}</div><div class="k">Underdog picks that won</div></div>
    <div class="stat"><div class="v">${pending}</div><div class="k">Pending</div></div></div>
    <p class="note">Market expectation adds up each pick's win probability at the last price seen before kickoff. Beating it means you're finding value, not just picking favorites.</p>`;
  const groups = {};
  for (const p of all) (groups[p.wk || 'Earlier'] ??= []).push(p);
  for (const [wk, list] of Object.entries(groups)){
    h += `<h3 class="sec sm">${esc(wk)}<span class="n">${list.length}</span></h3><div class="plist">` + list.map(p => {
      const pp = p.pClose ?? p.p;
      return `<div class="prow"><span class="res ${p.result || ''}">${p.result || '·'}</span>
        <div class="main"><div>${teamLink({ id: p.teamId, name: p.team })} ${p.home ? 'vs' : 'at'} ${teamLink({ id: p.oppId, name: p.opp })}</div>
        <div class="meta"><a class="dlink" href="${gameHref(p.id)}">${p.final ? esc(p.final) : new Date(p.date).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'}) + ' ' + fmtTime(new Date(p.date))}</a></div></div>
        <div class="mp">${pp != null ? `Market ${pct(pp)}%` : 'No price'}${!p.result && new Date(p.date) > Date.now() ? `<br><button class="chipbtn" data-unpick="${esc(p.id)}">Remove</button>` : ''}</div></div>`;
    }).join('') + '</div>';
  }
  return h;
}
