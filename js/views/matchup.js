/* Matchup: the game drawer's pregame look at where the game gets decided, from the scouting files
   (data/players/<id>.json, read through scout-core.js). Each offense's run game, passing game and line against the
   defense that faces it, drawn as a tug of war with both national ranks; the run lane worth watching; then links to
   each team's scout page (scout.html). Shown for games of teams with a scout page (scout.json: the Power 4 and Notre Dame). */
import { esc } from '../util.js';
import { useData } from '../resource.js';
import { panel, logo, sideColors } from './components.js';
import { scoutList, prepare, gcol, ord, SHORT } from '../scout-core.js';

const files = new Map();   // one fetch per team file; useData refetches each render and needs the same object back
const load = id => {
  if (!files.has(id)) files.set(id, fetch(`data/players/${id}.json`).then(r => r.ok ? r.json() : Promise.reject(new Error('No scouting file'))));
  return files.get(id);
};
const team = t => t?.id ? useData('scout:' + t.id, () => load(String(t.id)), prepare).data : null;

// Offense unit against the defense unit that stops it.
const PAIRS = [['RB', 'LB'], ['QB', 'DB'], ['OL', 'DL']];
const EDGE = 20;   // grade points apart before one side gets the edge

const BALL = '<svg viewBox="0 0 20 12" aria-hidden="true"><path d="M1.2 6C4.4 .6 15.6 .6 18.8 6 15.6 11.4 4.4 11.4 1.2 6Z"/></svg>';
const LABEL = { RB: 'Running', QB: 'Passing', OL: 'Up front' };

/* A tug of war for each matchup, one line each: away team on the left, home on the right (as in the tale of the
   tape), each side's national rank at its end, and a bar pulled from the middle toward whichever side has the edge,
   in that team's color (faint when it's close). */
export function matchup(g){
  const SCOUT = useData('scout:list', scoutList, x => x).data;
  if (!SCOUT || (!SCOUT.has(String(g.home.id)) && !SCOUT.has(String(g.away.id)))) return '';
  const D = { away: team(g.away), home: team(g.home) };
  if (!D.away && !D.home) return '';
  const [ca, ch] = sideColors(g), C = { away: ca, home: ch };
  const scout = s => SCOUT.has(String(g[s].id)) && D[s] ? `<a class="mu-scout" href="scout.html?team=${esc(g[s].id)}&game=${esc(g.id)}">${logo(g[s].logo, 'logo sm')}<span class="tx"><small>Scout</small><b>${esc(g[s].name)}</b></span><span aria-hidden="true">›</span></a>` : '';
  const links = `<div class="mu-scouts">${scout('away')}${scout('home')}</div>`;
  if (!D.away || !D.home) return panel('Matchup', links);

  const other = s => s === 'home' ? 'away' : 'home';
  const edges = { away: 0, home: 0 };
  const rk = u => `<b class="mu-rk" style="color:${gcol(u.grade)}">${ord(u.rank)}</b>`;
  const group = off => {
    const def = other(off), o = D[off], d = D[def];
    const rows = PAIRS.map(([ok, dk]) => {
      const a = o.units[ok], b = d.units[dk]; if (!a || !b) return '';
      const diff = a.grade - b.grade, lean = diff > 0 ? off : def, win = Math.abs(diff) < EDGE ? null : lean;
      if (win) edges[win]++;
      const w = Math.min(50, Math.abs(diff) / 80 * 50).toFixed(1);
      const U = { [off]: a, [def]: b };
      const tip = `${g[off].abbr} ${SHORT[ok].toLowerCase()} ${ord(a.rank)} vs ${g[def].abbr} ${SHORT[dk].toLowerCase()} ${ord(b.rank)} of ${a.of}`;
      return `<div class="mu-r" title="${esc(tip)}"><span class="mu-l">${LABEL[ok]}</span>${rk(U.away)}<span class="mu-bar"><i class="${lean === 'away' ? 'l' : 'r'}${win ? '' : ' faint'}" style="width:${w}%;background:${esc(C[lean])}"></i></span>${rk(U.home)}</div>`;
    }).join('');
    return `<div class="mu-gh">${logo(g[off].logo, 'logo sm')}${esc(g[off].abbr)} ball ${BALL}<span>${laneNote(o, d, g[off], g[def])}</span></div>${rows}`;
  };
  const body = group('away') + group('home');
  const head = s => `<span class="mu-tm ${s}">${logo(g[s].logo, 'logo sm')}<b>${esc(g[s].abbr)}</b><span class="n" style="color:${esc(C[s])}">${edges[s]}</span></span>`;
  return panel('Matchup', `<div class="mu-head">${head('away')}<span class="mu-ek">edges</span>${head('home')}</div>${body}${links}`);
}

/* The run lane worth watching, in a few words: this offense's best direction hits a soft side of that defense. */
function laneNote(o, d, ot, dt){
  const off = o.runs?.off, def = d.runs?.def; if (!off || !def) return '';
  const best = ['left', 'middle', 'right'].filter(k => off[k]?.ypc && def[k]?.ypc && def[k].grade < 35 && off[k].grade >= 35)
    .sort((x, y) => (off[y].grade - def[y].grade) - (off[x].grade - def[x].grade))[0];
  if (!best) return '';
  const tip = `${ot.abbr} runs ${best}: ${off[best].ypc} a carry. ${dt.abbr} allows ${def[best].ypc} there (${ord(def[best].rank)} of ${def[best].of}).`;
  return `<em class="mu-lane" title="${esc(tip)}">${['↖', '↑', '↗'][['left', 'middle', 'right'].indexOf(best)]} best runs ${best === 'middle' ? 'inside' : best}, at ${esc(dt.abbr)}'s weak ${best === 'middle' ? 'middle' : 'side'}</em>`;
}
