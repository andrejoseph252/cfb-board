/* The "my team" bar under the recap on This week: one line in the team's color with this week's game, live score
   or result, or the next game on a bye. Tapping it opens the game (or the team's schedule on a bye). */
import { esc, pct, fmtTime } from '../util.js';
import { state, apRank } from '../state.js';
import { realMarket } from '../markets.js';
import { myTeam, mySide, myNextGame, myColor, STAR } from '../myteam.js';
import { upset } from '../upset.js';
import { winnerSide } from '../picks.js';
import { logo, gameHref, teamHref } from './components.js';
import { inkOn, countdown } from './preview.js';

/* ESPN's logo address follows the team id, for a team saved before logos were remembered. */
const espnLogo = id => `https://a.espncdn.com/i/teamlogos/ncaa/500/${encodeURIComponent(id)}.png`;
const CHEV = '<svg class="mt-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const when = d => `${d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'})}`;
const vsName = (g, side) => { const o = g[side === 'home' ? 'away' : 'home'], r = o.rank || apRank(o.id);
  return `${g.neutral ? 'vs' : side === 'home' ? 'vs' : 'at'} ${r ? `#${r} ` : ''}${o.name}`; };

export function myTeamBar(){
  if (!myTeam) return '';
  const g = state.games.find(mySide), side = g && mySide(g), t = g?.[side];
  // Same rule as the card ring: the alternate color when the main one would vanish against the page (Iowa's black on
  // dark Mono becomes gold). If neither shows, keep the main color; the bar's edge still outlines it.
  const pick = myColor(), color = pick.startsWith('#') ? pick : t?.color || myTeam.color || '#555', ink = inkOn(color);
  let line = [], right = '', href = teamHref(myTeam.id);

  if (!g){
    const next = myNextGame();
    line.push(state.pickedWeek ? 'No game this week' : 'Bye this week');
    if (next){ const ns = String(next.home.id) === myTeam.id ? 'home' : 'away'; line.push(`Next: ${when(new Date(next.date))} ${vsName(next, ns)}`); }
  } else {
    href = gameHref(g.id);
    const o = g[side === 'home' ? 'away' : 'home'];
    if (g.state === 'pre'){
      const d = new Date(g.date), m = realMarket(g), fp = state.preds.get(g.id)?.pHome, p = m?.pHome ?? fp;
      line.push(vsName(g, side), g.tbd ? when(d) : `${when(d)} · ${fmtTime(d)}`);
      if (g.tv) line.push(g.tv);
      if (!g.tbd) line.push(countdown(g));
      if (p != null) right = `<b>${pct(side === 'home' ? p : 1 - p)}%</b><small>to win</small>`;
    } else if (g.state === 'in'){
      line.push(vsName(g, side), g.detail, g.sit);
      right = `<b>${esc(t.score)}–${esc(o.score)}</b>${g.liveWp != null ? `<small>${pct(side === 'home' ? g.liveWp : 1 - g.liveWp)}% live</small>` : ''}`;
    } else {
      const won = winnerSide(g) === side, u = upset(g);
      line.push(`${won ? 'Beat' : 'Lost to'} ${vsName(g, side).replace(/^(vs|at) /, '')}`);
      if (u && u.side === side) line.push(`Upset${u.p != null ? ` · ${pct(u.p)}% at kickoff` : ''}`);
      const next = myNextGame();
      if (next){ const ns = String(next.home.id) === myTeam.id ? 'home' : 'away'; line.push(`Next: ${when(new Date(next.date))} ${vsName(next, ns)}`); }
      right = `<b>${won ? 'W' : 'L'} ${esc(t.score)}–${esc(o.score)}</b>`;
    }
  }
  const live = g?.state === 'in';
  return `<a class="mt${live ? ' live' : ''}" href="${href}" style="--mt:${esc(color)};--mt-ink:${ink}">
    <span class="mt-disc">${logo(t?.logo || myTeam.logo || espnLogo(myTeam.id), 'mt-logo')}</span>
    <span class="mt-main"><b class="mt-name">${STAR}${esc(myTeam.name)}</b><span class="mt-line">${line.filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</span></span>
    ${right ? `<span class="mt-right">${right}</span>` : ''}${CHEV}</a>`;
}
