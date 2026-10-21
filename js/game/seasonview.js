/* Season mode's screens: starting a season, the hub (your team, what's next, schedule, poll, conference, around the
   country, stats, the playoff), game week (scouting, game plan, practice, kickoff), and the result of each game.
   pixelbowl.js owns the game itself and hands this module what it needs through init(ctx). */
import { esc, store } from '../util.js';
import { state } from '../state.js';
import * as api from '../api.js';
import { parseFpi, parseStandings } from '../models.js';
import { myTeam } from '../myteam.js';
import { logoUrl } from '../views/components.js';
import { inkOn } from '../views/preview.js';
import * as SN from './season.js';
import * as SC from './scout.js';
import { DIFFS, LENGTHS, CONCEPTS, RUN_CALLS } from './sim.js';
import { namesFor } from './names.js';

let ctx = null, s = null, tab = 'sched', recapOpen = false, lastReal = 0;
const prof = {};   // team id -> scouting profile, this session
export function init(c){ ctx = c; }
export const current = () => s || (s = SN.load());
const persist = () => SN.save(s);

/* ---------- little pieces ---------- */
// Logos on the dark lists use the dark-background versions; the white discs (cls on-light / sz-idl) the regular ones.
const logo = (t, size = 72, cls = '') => t?.logo ? `<img class="${cls}" src="${esc(logoUrl(t.logo, size, /on-light|sz-idl/.test(cls) ? 'light' : undefined))}" alt="" loading="lazy">` : `<i class="sz-nologo ${cls}" style="--c:${esc(t?.color || '#5a6470')}">${esc((t?.abbr || '?').slice(0, 3))}</i>`;
const rec = r => `${r.w}–${r.l}`;
const ordw = w => w >= 99 ? 'Final' : w === SN.CCG_WEEK ? 'Champ. week' : `Week ${w}`;
const pip = (n, max, cls = '') => `<span class="sz-pips ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const meter = (label, v, color = '#ffd84a', note = '') => `<div class="sz-meter"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%;background:${color}"></b></i><em>${note}</em></div>`;
const PX = {
  ground: ['........', '..##....', '..###...', '########', '########', '..###...', '..##....', '........'],
  air: ['....####', '......##', '.....#.#', '....#..#', '...#....', '..#.....', '.#......', '#.......'],
  balanced: ['...##...', '########', '#..##..#', '#..##..#', '##.##.##', '...##...', '...##...', '..####..'],
  tempo: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'],
  run: ['########', '#..#..##', '########', '##..#..#', '########', '#..#..##', '########', '........'],
  deep: ['.######.', '#......#', '#.####.#', '#.#..#.#', '#.#..#.#', '.#....#.', '..#..#..', '...##...'],
  pressure: ['#......#', '.#....#.', '..#..#..', '...##...', '...##...', '..#..#..', '.#....#.', '#......#'],
  bend: ['#.......', '#.......', '.#......', '.#......', '..##....', '....##..', '......##', '........'],
  trophy: ['.######.', '########', '#.####.#', '#.####.#', '.######.', '..####..', '...##...', '..####..'],
  ball: ['........', '..####..', '.#.##.#.', '#.####.#', '#.####.#', '.#.##.#.', '..####..', '........']
};
const glyph = (k, c = 'currentColor') => `<svg class="sz-px" viewBox="0 0 8 8" aria-hidden="true">${(PX[k] || []).flatMap((row, y) => [...row].map((ch, x) => ch === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')).join('')}</svg>`.replace('<svg', `<svg fill="${c}"`);
const tm = id => s.teams[id] || { id, name: 'TBD', abbr: 'TBD' };
const rankTag = id => { const r = SN.rankOf(s, id); return r ? `<b class="sz-rk">${r}</b>` : ''; };
const T = () => SN.table(s);

/* The real game's date, or its real result, for one of your games. */
function realLine(g){
  if (!g || g.post) return '';
  if (g.real){ const r = SN.myScore(s, g, g.real), won = r[0] > r[1]; return `In real life: ${esc(tm(s.teamId).abbr)} ${won ? 'won' : 'lost'} ${Math.max(...r)}–${Math.min(...r)}`; }
  const d = new Date(g.date);
  return Number.isFinite(d.getTime()) ? `Real game: ${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}` : '';
}

/* ---------- starting a season ---------- */
let setupPick = null;
export function setupScreen(){
  const saved = ctx.saved, have = SN.load();
  setupPick ||= { team: String(myTeam?.id || saved.lastMe || '84'), diff: saved.diff || 'pro', len: 'quick' };
  const t = ctx.teamInfo(setupPick.team);
  ctx.backdrop(setupPick.team, null);
  const seg = (k, items) => `<div class="pb-seg">${items.map(([v, l]) => `<button type="button" data-pb="s-set" data-k="${k}" data-v="${v}" aria-pressed="${setupPick[k] === v}">${l}</button>`).join('')}</div>`;
  const hist = SN.history();
  ctx.modal(`<div class="pb-setup sz-new">
    <button class="pb-x" type="button" data-pb="${have ? 's-hub' : 'menu'}" aria-label="Back">${ctx.icon.x}</button>
    <div class="sz-kicker">SEASON MODE</div>
    <h1 class="sz-title">YOUR ${esc(String(state.season || new Date().getFullYear()))}<br><span>SEASON</span></h1>
    <p class="sz-lead">Play your team's real schedule, week by week. Scout every opponent, set the game plan, run the week's practice, then play it or coach it. The rest of the country plays out around you: real results where they've happened, simulated where they haven't. Win your conference, make the playoff.</p>
    <button class="sz-pickteam" type="button" data-pb="s-teams" style="--c:${esc(t.color)};--k:${inkOn(t.color)}">${logo(t, 96, 'on-light')}<span><small>YOUR TEAM</small><b>${esc(t.name)}</b><em>Tap to change</em></span></button>
    <div class="pb-opt"><span>Difficulty</span>${seg('diff', Object.entries(DIFFS).map(([k, d]) => [k, d.name]))}</div>
    <div class="pb-opt"><span>Game length</span>${seg('len', Object.entries(LENGTHS).map(([k, d]) => [k, `${d.name} ${Math.floor(d.q / 60)}:${String(d.q % 60).padStart(2, '0')}`]))}</div>
    ${have ? `<p class="sz-warn">Starting a new season ends your current one (${esc(have.teams[have.teamId]?.name || '')}, ${rec(SN.recOf(SN.table(have), have.teamId))}).</p>` : ''}
    <button class="pb-go" type="button" data-pb="s-begin"${have ? ' data-confirm="1"' : ''}>BEGIN SEASON</button>
    ${hist.length ? `<div class="sz-hist"><div class="sz-h">PAST SEASONS</div>${hist.slice(0, 6).map(h => `<div class="sz-hrow${h.champ ? ' champ' : ''}">${logo(h.team, 40)}<b>${esc(h.year)} ${esc(h.team.abbr)}</b><span>${h.w}–${h.l}${h.rank ? ` · #${h.rank}` : ''}</span><em>${esc(h.outcome)}</em></div>`).join('')}</div>` : ''}
  </div>`);
}
function teamList(){
  const list = ctx.allTeams();
  ctx.modal(`<div class="pb-setup pb-picker">
    <div class="pb-ph"><b>YOUR TEAM</b><button class="pb-x" type="button" data-pb="s-new" aria-label="Back">${ctx.icon.x}</button></div>
    <input class="pb-q" type="search" placeholder="Search ${list.length} teams" autocomplete="off" data-pb-q>
    <div class="pb-list">${list.map(t => `<button type="button" data-pb="s-team" data-id="${esc(t.id)}" data-n="${esc(t.name.toLowerCase())} ${esc(t.abbr.toLowerCase())}" style="--c:${esc(t.color)}">
      ${t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="" loading="lazy">` : '<i></i>'}<span>${esc(t.name)}</span><em></em></button>`).join('')}</div></div>`);
}
async function begin(){
  const name = ctx.teamInfo(setupPick.team).name;
  const draw = (done, total) => ctx.modal(`<div class="pb-card sz-load"><div class="sz-kicker">BUILDING YOUR SEASON</div>
    <div class="sz-spin">${glyph('ball', '#c9772b')}</div>
    <p>${esc(name)}'s schedule and every FBS game, week by week…</p>
    <div class="sz-lbar"><i style="width:${Math.round(done / total * 100)}%"></i></div><small>WEEK ${Math.min(total, done + 1)} OF ${total}</small></div>`);
  draw(0, SN.REG_WEEKS);
  try{
    const fpi = state.fpi || parseFpi(await api.powerIndex());
    const standings = state.standings || parseStandings(await api.standings());
    const next = await SN.create({ teamId: setupPick.team, diff: setupPick.diff, len: setupPick.len, year: state.season || new Date().getFullYear(), fpi, standings, onProgress: draw });
    s = next; persist(); tab = 'sched';
    ctx.saved.diff = setupPick.diff; ctx.save();
    hub();
  }catch(e){
    ctx.modal(`<div class="pb-card"><h2>NO SEASON</h2><p>${esc(e.message || 'Something went wrong loading the schedule.')}</p>
      <div class="pb-btns"><button class="pb-go" type="button" data-pb="s-begin">TRY AGAIN</button><button class="pb-go alt" type="button" data-pb="s-new">BACK</button></div></div>`);
  }
}

/* ---------- the hub ---------- */
export function hub(){
  s = SN.load();
  if (!s) return setupScreen();
  const n = SN.next(s), g = n.id ? s.games[n.id] : null, me = tm(s.teamId);
  ctx.backdrop(teamFor(s.teamId), g ? teamFor(SN.oppOf(s, g).id) : null);
  const keep = document.querySelector('.sz-hub')?.scrollTop || 0;
  ctx.modal(`<div class="pb-setup sz-hub">${hero()}${nextUp(n)}${recapOpen ? recapCard() : ''}${tabs()}</div>`);
  const el = document.querySelector('.sz-hub'); if (el && keep) el.scrollTop = keep;
  // Real results that have come in since the season was built (quietly, then redraw).
  const upto = Math.min(Number(state.week) || SN.REG_WEEKS, SN.REG_WEEKS);
  if (Date.now() - lastReal > 10 * 60e3) lastReal = Date.now(), SN.refreshReal(s, upto).then(ch => { if (ch && document.querySelector('.sz-hub')){ persist(); hub(); } }).catch(() => {});
  if (!prof[s.teamId]) SC.getProfile(me).then(p => { prof[s.teamId] = p; });
}
function hero(){
  const me = tm(s.teamId), Tb = T(), r = SN.recOf(Tb, s.teamId), rk = SN.rankOf(s, s.teamId);
  const prevW = Object.keys(s.polls).map(Number).sort((a, b) => b - a)[1];
  const prev = prevW != null ? SN.rankOf(s, s.teamId, prevW) : null, mv = rk && prev ? prev - rk : rk && !prev && prevW != null ? 26 - rk : 0;
  const conf = s.confs[me.conf]?.short || s.confs[me.conf]?.name || '';
  const rv = SN.realVsYours(s);
  const fresh = s.fresh;
  return `<header class="sz-hero" style="--c:${esc(me.color)};--k:${inkOn(me.color)};--a:${esc(me.alt || '#fff')}">
    <div class="sz-hbg">${logo(me, 300, 'sz-hbgl')}</div>
    <div class="sz-htop"><span>${esc(s.year)} SEASON · ${esc(DIFFS[s.diff]?.name.toUpperCase() || '')}</span>
      <span class="sz-hbtns"><button type="button" data-pb="menu" class="sz-ib" aria-label="Main menu">MENU</button><button type="button" data-pb="exit" class="sz-ib" aria-label="Close">${ctx.icon.x}</button></span></div>
    <div class="sz-id">${logo(me, 120, 'sz-idl')}<div class="sz-idt"><h1>${esc(me.name.toUpperCase())}</h1>
      <p><b>${rec(r)}</b>${conf ? ` · ${esc(conf)} ${r.cw}–${r.cl}` : ''}</p></div>
      <div class="sz-rank${rk ? '' : ' nr'}"><small>RANK</small><b>${rk ? '#' + rk : 'NR'}</b>${mv ? `<i class="${mv > 0 ? 'up' : 'dn'}">${mv > 0 ? '▲' : '▼'}${Math.abs(mv) > 25 ? '' : Math.abs(mv)}</i>` : ''}</div></div>
    <div class="sz-hstrip">
      <div class="sz-fresh" title="Freshness"><span>FRESHNESS</span>${pip(Math.round(fresh / 10), 10, fresh < 65 ? 'low' : '')}<b>${fresh}</b></div>
      ${rv.n ? `<div class="sz-rvy" title="The games real life has played too"><span>REAL WORLD</span><b>${rec({ w: rv.real[0], l: rv.real[1] })}</b><span>YOUR WORLD</span><b>${rec({ w: rv.yours[0], l: rv.yours[1] })}</b></div>` : ''}
    </div></header>`;
}
function nextUp(n){
  if (n.kind === 'done') return doneCard();
  if (n.kind === 'bye') return `<section class="sz-next bye"><div class="sz-nl">${ordw(n.week).toUpperCase()} · BYE</div>
    <p class="sz-nb">No game this week. Rest up: <b>+15 freshness</b>. The rest of the country plays on.</p>
    <button class="pb-go" type="button" data-pb="s-adv">SIM TO NEXT WEEK ▶</button></section>`;
  if (n.kind === 'sim'){
    const lbl = s.stage === 'ccg' ? "You're not in a title game this year. Championship week plays out without you."
      : s.stage === 'cfp' ? (s.post.cfp.seeds.includes(s.teamId) && !alive() ? "You're out. The playoff rolls on." : `You have a bye: ${SN.CFP_ROUNDS[s.post.cfp.round]} plays out.`) : '';
    const what = s.stage === 'ccg' ? 'CHAMPIONSHIP WEEK' : SN.CFP_ROUNDS[s.post.cfp?.round]?.toUpperCase() || 'NEXT';
    return `<section class="sz-next bye"><div class="sz-nl">${what}</div><p class="sz-nb">${lbl}</p>
      <div class="sz-ctas"><button class="pb-go" type="button" data-pb="s-adv">SIM ${what} ▶</button>${s.stage === 'cfp' && !alive() ? '<button class="pb-go alt" type="button" data-pb="s-simall">SIM TO THE END</button>' : ''}</div></section>`;
  }
  const g = s.games[n.id], opp = SN.oppOf(s, g), me = tm(s.teamId), ha = SN.homeAway(s, g), Tb = T();
  const label = g.post ? esc(g.name || 'Postseason').toUpperCase() + (g.seeds ? ` · #${g.seeds[g.h === s.teamId ? 0 : 1]} SEED` : '') : `${ordw(g.w).toUpperCase()} · NEXT UP`;
  const exp = SN.expMargin(s, g) * (g.h === s.teamId ? 1 : -1), wp = Math.max(1, Math.min(99, Math.round(SN.winProb(exp) * 100)));
  const side = (t, you) => `<div class="sz-side${you ? ' you' : ''}" style="--c:${esc(t.color)}">${logo(t, 120)}<b>${rankTag(t.id)}${esc(t.abbr)}</b><small>${rec(SN.recOf(Tb, t.id))}</small></div>`;
  const done = s.gw[g.id]?.step;
  return `<section class="sz-next" style="--c:${esc(opp.color)};--m:${esc(me.color)}">
    <div class="sz-nl">${label}</div>
    <div class="sz-vs">${side(me, true)}<div class="sz-at"><span>${ha === 'H' ? 'VS' : ha === 'A' ? '@' : 'VS'}</span><small>${ha === 'N' ? 'NEUTRAL' : ha === 'H' ? 'HOME' : 'AWAY'}</small></div>${side(opp)}</div>
    <div class="sz-odds"><span>WIN CHANCE</span><i><b style="width:${wp}%"></b></i><em>${wp}%</em></div>
    ${realLine(g) ? `<p class="sz-real">${realLine(g)}</p>` : ''}
    <div class="sz-ctas"><button class="pb-go" type="button" data-pb="s-gw">${done ? 'CONTINUE GAME WEEK ▶' : 'GAME WEEK ▶'}</button></div></section>`;
}
const alive = () => { const C = s.post.cfp; if (!C?.seeds.includes(s.teamId)) return false;
  for (const ids of C.rounds) for (const id of ids || []){ const g = s.games[id]; if (g.res && SN.isMine(s, g) && (g.res[0] > g.res[1] ? g.h : g.a) !== s.teamId) return false; }
  return true; };
function doneCard(){
  const o = SN.outcome(s), r = SN.recOf(T(), s.teamId), rk = SN.rankOf(s, s.teamId, 99), champ = s.post.cfp?.champ;
  return `<section class="sz-next sz-done${o.big ? ' big' : ''}">
    <div class="sz-trophy">${glyph('trophy', s.post.cfp?.champ === s.teamId ? '#ffd84a' : '#9aa4ae')}</div>
    <div class="sz-nl">SEASON COMPLETE</div><h2>${esc(o.line.toUpperCase())}</h2>
    <p class="sz-nb">${rec(r)}${rk ? ` · finished #${rk}` : ''}${champ && champ !== s.teamId ? ` · ${esc(tm(champ).name)} won it all` : ''}</p>
    <div class="sz-ctas"><button class="pb-go" type="button" data-pb="s-again">PLAY ANOTHER SEASON</button></div></section>`;
}
function tabs(){
  const list = [['sched', 'SCHEDULE'], ['poll', 'TOP 25'], ['conf', 'CONFERENCE'], ['around', 'AROUND'], ['stats', 'STATS']];
  if (s.post.cfp) list.splice(1, 0, ['cfp', 'PLAYOFF']);
  if (!list.some(([k]) => k === tab)) tab = 'sched';
  const body = { sched: schedTab, poll: pollTab, conf: confTab, around: aroundTab, stats: statsTab, cfp: cfpTab }[tab]();
  return `<nav class="sz-tabs">${list.map(([k, l]) => `<button type="button" data-pb="s-tab" data-v="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</nav><div class="sz-body">${body}</div>`;
}
function schedTab(){
  const rows = [], n = SN.next(s);
  for (let w = 1; w <= SN.REG_WEEKS; w++){
    const ids = s.mine[w];
    if (!ids){ rows.push(`<li class="sz-g bye${w === s.week && s.stage === 'reg' ? ' cur' : ''}"><span class="wk">W${w}</span><span class="nm">BYE</span></li>`); continue; }
    for (const id of ids) rows.push(gameRow(s.games[id], n.id === id));
  }
  for (const id of Object.values(s.games).filter(g => g.post && SN.isMine(s, g)).map(g => g.id)) rows.push(gameRow(s.games[id], n.id === id));
  return `<ol class="sz-sched">${rows.join('')}</ol><p class="sz-foot">Real scores beside yours, once real life has played the game.</p>`;
}
function gameRow(g, cur){
  const opp = SN.oppOf(s, g), ha = SN.homeAway(s, g), mine = SN.myScore(s, g), real = g.real && !g.post ? SN.myScore(s, g, g.real) : null;
  const res = mine ? `<span class="res ${mine[0] > mine[1] ? 'w' : 'l'}">${mine[0] > mine[1] ? 'W' : 'L'} ${mine[0]}–${mine[1]}${g.how === 'sim' ? '<sup>SIM</sup>' : g.how === 'coach' ? '<sup>COACHED</sup>' : ''}</span>` : cur ? '<span class="res nx">NEXT</span>' : '<span class="res"></span>';
  const rl = real ? `<span class="real ${real[0] > real[1] ? 'w' : 'l'}">REAL ${real[0] > real[1] ? 'W' : 'L'} ${real[0]}–${real[1]}</span>` : '';
  const flip = mine && real && (mine[0] > mine[1]) !== (real[0] > real[1]);
  return `<li class="sz-g${mine ? ' done' : ''}${cur ? ' cur' : ''}${flip ? ' flip' : ''}"><span class="wk">${g.post ? 'POST' : 'W' + g.w}</span>${logo(opp, 48)}
    <span class="nm">${g.post ? `<small>${esc(g.name || '')}</small>` : ''}${ha === 'A' ? '@ ' : ha === 'N' ? 'vs ' : ''}${rankTag(opp.id)}${esc(opp.name)}</span>${res}${rl}</li>`;
}
function pollTab(){
  const w = SN.latestPoll(s), top = s.polls[w] || [], prevW = Object.keys(s.polls).map(Number).filter(x => x < w).sort((a, b) => b - a)[0], prev = s.polls[prevW] || [], Tb = T();
  return `<div class="sz-h">YOUR WORLD'S TOP 25 · ${esc(w === 0 ? 'PRESEASON' : ordw(w).toUpperCase())}</div><ol class="sz-poll">${top.map((id, i) => {
    const t = tm(id), p = prev.indexOf(id), mv = p < 0 ? (prevW != null ? 'new' : 0) : p - i;
    return `<li class="${id === s.teamId ? 'me' : ''}" style="--c:${esc(t.color)}"><b>${i + 1}</b><i class="mv ${mv === 'new' ? 'nw' : mv > 0 ? 'up' : mv < 0 ? 'dn' : ''}">${mv === 'new' ? 'NEW' : mv > 0 ? '▲' + mv : mv < 0 ? '▼' + -mv : '–'}</i>${logo(t, 48)}<span>${esc(t.name)}</span><em>${rec(SN.recOf(Tb, id))}</em></li>`;
  }).join('')}</ol>`;
}
function confTab(){
  const c = String(tm(s.teamId).conf), Tb = T(), st = SN.standings(s, c, Tb);
  const champ = s.post.champs?.[c];
  return `<div class="sz-h">${esc((s.confs[c]?.name || 'CONFERENCE').toUpperCase())}</div>
    <table class="sz-conf"><thead><tr><th></th><th>TEAM</th><th>CONF</th><th>ALL</th></tr></thead><tbody>${st.map(({ t, r }, i) =>
      `<tr class="${t.id === s.teamId ? 'me' : ''}${i === 1 ? ' cut' : ''}"><td>${i + 1}</td><td>${logo(t, 40)}<span>${rankTag(t.id)}${esc(t.name)}</span>${champ === t.id ? '<em class="sz-ch">CHAMP</em>' : ''}</td><td>${r.cw}–${r.cl}</td><td>${r.w}–${r.l}</td></tr>`).join('')}</tbody></table>
    <p class="sz-foot">The top two meet in the championship game.</p>`;
}
function aroundTab(){
  const R = s.lastRecap;
  if (!R) return '<p class="sz-empty">Results from around the country show up here after each week.</p>';
  const H = SN.headlines(s, R.games, R.before).slice(0, 12);
  return `<div class="sz-h">${esc(R.label.toUpperCase())} · AROUND THE COUNTRY</div>${H.length ? `<ul class="sz-news">${H.map(headline).join('')}</ul>` : '<p class="sz-empty">A quiet week at the top.</p>'}`;
}
function headline(h){
  const g = h.g, W = tm(h.win), L = tm(h.lose), ws = Math.max(...g.res), ls = Math.min(...g.res);
  const tag = h.upset ? '<em class="t up">UPSET</em>' : h.rw && h.rl ? '<em class="t big">TOP 25</em>' : '';
  const src = g.sim ? '<em class="t sim">SIM</em>' : g.post ? '' : '<em class="t real">REAL</em>';
  return `<li>${logo(W, 48)}<span><b>${h.rw ? `<i>#${h.rw}</i> ` : ''}${esc(W.name)}</b> ${h.upset ? 'stun' : 'beat'}${h.upset ? 's' : ''} ${h.rl ? `<i>#${h.rl}</i> ` : ''}${esc(L.name)} <strong>${ws}–${ls}</strong></span>${tag}${src}</li>`;
}
function statsTab(){
  const st = s.stats, me = tm(s.teamId), n = me.names || {};
  if (!st?.gp) return '<p class="sz-empty">Season stats build up as you play.</p>';
  const played = Object.values(s.games).filter(g => SN.isMine(s, g) && g.res && g.how !== 'sim').length;
  const by = st.by || {}, nm = r => esc(n[r] || { QB: 'Quarterback', RB: 'Running back', X: 'Left wideout', Z: 'Right wideout', SL: 'Slot', TE: 'Tight end' }[r] || r);
  const recs = Object.entries(by).filter(([, v]) => v.rec).sort((a, b) => b[1].yds - a[1].yds).slice(0, 4);
  const rush = Object.entries(by).filter(([, v]) => v.car).sort((a, b) => b[1].ryds - a[1].ryds).slice(0, 2);
  const rk = SN.rankOf(s, s.teamId), heis = st.passTD >= 18 && rk && rk <= 8 ? 'FRONT-RUNNER' : st.passTD >= 12 && rk && rk <= 15 ? 'IN THE MIX' : null;
  return `<div class="sz-h">SEASON STATS · ${played} PLAYED${st.gp > played ? ` · ${st.gp - played} SIMMED` : ''}</div>
    <div class="sz-tiles"><div><b>${(st.pf / st.gp).toFixed(1)}</b><span>PTS / GAME</span></div><div><b>${(st.pa / st.gp).toFixed(1)}</b><span>ALLOWED</span></div>
      <div><b>${st.passYds + st.rushYds}</b><span>TOTAL YDS</span></div><div><b>${st.passTD + st.rushTD}</b><span>TOUCHDOWNS</span></div></div>
    <div class="sz-lead2">
      <div class="sz-ldr"><small>PASSING</small><b>${nm('QB')}</b><span>${st.comp}/${st.att} · ${st.passYds} yds · ${st.passTD} TD · ${st.int} INT</span>${heis ? `<em class="sz-heis">HEISMAN ${heis}</em>` : ''}</div>
      ${rush.map(([r, v]) => `<div class="sz-ldr"><small>RUSHING</small><b>${nm(r)}</b><span>${v.car} car · ${v.ryds} yds · ${v.rtd} TD · ${(v.ryds / Math.max(1, v.car)).toFixed(1)} avg</span></div>`).join('')}
      ${recs.map(([r, v]) => `<div class="sz-ldr"><small>RECEIVING</small><b>${nm(r)}</b><span>${v.rec} rec · ${v.yds} yds · ${v.td} TD</span></div>`).join('')}
    </div><p class="sz-foot">Player stats count the games you play or coach; simmed games add to the team totals only.</p>`;
}
function cfpTab(){
  const C = s.post.cfp; if (!C) return '';
  const seedOf = id => C.seeds.indexOf(id) + 1;
  const game = id => { const g = s.games[id]; if (!g) return ''; const row = (t, sc, won) => `<div class="${t === s.teamId ? 'me' : ''}${won ? ' w' : ''}"><i>${seedOf(t)}</i>${logo(tm(t), 40)}<span>${esc(tm(t).abbr)}</span><b>${sc ?? ''}</b></div>`;
    const w = g.res ? (g.res[0] > g.res[1] ? g.h : g.a) : null;
    return `<div class="sz-bg"><small>${esc(g.name || '')}</small>${row(g.h, g.res?.[0], w === g.h)}${row(g.a, g.res?.[1], w === g.a)}</div>`; };
  const byes = C.seeds.slice(0, 4).map(id => `<div class="sz-bye${id === s.teamId ? ' me' : ''}"><i>${seedOf(id)}</i>${logo(tm(id), 40)}<span>${esc(tm(id).abbr)}</span><em>BYE</em></div>`).join('');
  return `<div class="sz-h">THE PLAYOFF</div><div class="sz-bracket">
    <div class="sz-rd"><h4>FIRST ROUND</h4>${byes}${C.rounds[0].map(game).join('')}</div>
    ${[1, 2, 3].map(r => C.rounds[r] ? `<div class="sz-rd"><h4>${['', 'QUARTERFINALS', 'SEMIFINALS', 'CHAMPIONSHIP'][r]}</h4>${C.rounds[r].map(game).join('')}</div>` : '').join('')}
    ${C.champ ? `<div class="sz-champ">${glyph('trophy', '#ffd84a')}<b>${esc(tm(C.champ).name.toUpperCase())}</b><span>NATIONAL CHAMPIONS</span></div>` : ''}</div>`;
}
function recapCard(){
  const R = s.lastRecap; if (!R) return '';
  const H = SN.headlines(s, R.games, R.before).slice(0, 3);
  if (!H.length) return '';
  return `<section class="sz-recap"><div class="sz-h">${esc(R.label.toUpperCase())} · AROUND THE COUNTRY<button type="button" data-pb="s-tab" data-v="around">ALL ▸</button></div><ul class="sz-news">${H.map(headline).join('')}</ul></section>`;
}

/* ---------- game week ---------- */
const STEPS = ['scout', 'plan', 'practice', 'kickoff'];
function gwOf(g){
  const x = s.gw[g.id] ||= { step: 'scout', plan: { off: null, def: null }, prac: { pass: 0, run: 0, def: 0, film: 0 }, drill: {}, mode: ctx.saved.seasonMode || 'play' };
  return x;
}
async function profiles(g){
  const opp = SN.oppOf(s, g), me = tm(s.teamId);
  const [a, b] = await Promise.all([prof[me.id] || SC.getProfile(me), prof[opp.id] || SC.getProfile(opp)]);
  prof[me.id] = a; prof[opp.id] = b;
  return { me: a, opp: b };
}
async function gameWeek(step){
  const n = SN.next(s); if (n.kind !== 'game') return hub();
  const g = s.games[n.id], W = gwOf(g); if (step) W.step = step; persist();
  const opp = SN.oppOf(s, g);
  ctx.backdrop(teamFor(s.teamId), teamFor(opp.id));
  if (!prof[opp.id] || !prof[s.teamId]){
    ctx.modal(`<div class="pb-card sz-load"><div class="sz-kicker">SCOUTING ${esc(opp.name.toUpperCase())}</div><div class="sz-spin">${glyph('ball', '#c9772b')}</div><p>Pulling their season stats…</p></div>`);
    await profiles(g);
    if (!opp.names) namesFor(opp.id).then(x => { if (x) opp.names = x; });
  }
  const P = { me: prof[s.teamId], opp: prof[opp.id] };
  const body = { scout: scoutStep, plan: planStep, practice: practiceStep, kickoff: kickoffStep }[W.step](g, W, P);
  const keep = document.querySelector('.sz-gw')?.scrollTop || 0;
  ctx.modal(`<div class="pb-setup sz-gw">${gwHead(g, W)}${body}</div>`);
  const el = document.querySelector('.sz-gw'); if (el && keep && step == null) el.scrollTop = keep;
}
function gwHead(g, W){
  const opp = SN.oppOf(s, g), i = STEPS.indexOf(W.step);
  const can = k => k === 'scout' || k === 'plan' || (k === 'practice' && W.plan.off && W.plan.def) || (k === 'kickoff' && W.plan.off && W.plan.def);
  return `<div class="sz-gwh" style="--c:${esc(opp.color)}"><button class="sz-ib" type="button" data-pb="s-hub" aria-label="Back to the hub">◂ HUB</button>
    <span>${g.post ? esc((g.name || '').toUpperCase()) : `WEEK ${g.w}`} · ${SN.homeAway(s, g) === 'A' ? '@' : 'VS'} ${esc(opp.abbr)}</span></div>
    <ol class="sz-steps">${STEPS.map((k, j) => `<li class="${j < i ? 'done' : j === i ? 'on' : ''}"><button type="button" data-pb="s-step" data-v="${k}"${can(k) ? '' : ' disabled'}><i>${j + 1}</i>${k.toUpperCase()}</button></li>`).join('')}</ol>`;
}
function scoutStep(g, W, P){
  const opp = SN.oppOf(s, g), o = P.opp, r = SN.recOf(T(), opp.id), raw = o.raw, f1 = x => Number.isFinite(x) ? x.toFixed(1) : '–';
  const film = W.prac.film >= 2, mix = SC.coverageMix(o);
  const star = opp.names?.QB ? `<div class="sz-star"><small>WATCH OUT FOR</small><b>${esc(opp.names.QB)}</b><span>QB${opp.names.X ? ` · and ${esc(opp.names.X)} out wide` : ''}</span></div>` : '';
  return `<div class="sz-opp" style="--c:${esc(opp.color)};--k:${inkOn(opp.color)}">${logo(opp, 120, 'on-light')}<div><small>SCOUTING REPORT</small><h2>${rankTag(opp.id)}${esc(opp.name.toUpperCase())}</h2>
      <p>${rec(r)} · FPI ${Number.isFinite(opp.fpi) ? (opp.fpi > 0 ? '+' : '') + opp.fpi : 'n/a'}</p></div></div>
    <div class="sz-cols">
      <section class="sz-unit"><h3>THEIR OFFENSE</h3><b class="sz-tag">${esc(o.off.style)}</b>
        <div class="sz-split"><i style="width:${Math.round(o.off.runRate * 100)}%"><span>RUN ${Math.round(o.off.runRate * 100)}%</span></i><i><span>PASS ${Math.round(100 - o.off.runRate * 100)}%</span></i></div>
        ${meter('BIG PLAYS', o.off.explosive, '#ff9f43', f1(raw.ypa) + ' YPA')}${meter('EFFICIENCY', o.off.eff, '#ffd84a', f1(raw.ppg) + ' PPG')}</section>
      <section class="sz-unit"><h3>THEIR DEFENSE</h3><b class="sz-tag d">${esc(o.def.scheme)}</b>
        ${meter('PASS RUSH', o.def.pressure, '#ff5a4e', f1(raw.sacks) + ' SACKS')}${meter('VS THE RUN', o.def.runD, '#7df9ff')}${meter('VS THE PASS', o.def.passD, '#7df9ff')}${meter('TAKEAWAYS', o.def.ballhawk, '#4cff7a', f1(raw.ints) + ' INT')}</section>
    </div>
    ${star}
    <ul class="sz-notes">${SC.notes(o, opp.name).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="sz-film${film ? '' : ' locked'}"><div class="sz-h">COVERAGE TENDENCIES${film ? '' : ' · LOCKED'}</div>
      ${film ? mix.slice(0, 4).map(([k, p]) => meter({ c0: 'COVER 0', c1: 'COVER 1', c2: 'COVER 2', c3: 'COVER 3', c4: 'COVER 4', c2m: '2-MAN' }[k], p / 60, '#9fc4ff', p + '%')).join('')
        : '<p>Put 2+ hours into film study this week to see what they play, and to read their coverage before the snap.</p>'}</div>
    <button class="pb-go" type="button" data-pb="s-step" data-v="plan">SET THE GAME PLAN ▶</button>`;
}
function planStep(g, W, P){
  const opp = SN.oppOf(s, g), edge = SN.strength(tm(s.teamId)) - SN.strength(opp);
  const card = (side, k, p, fit) => { const gr = SC.grade(fit), on = W.plan[side] === k;
    return `<button type="button" class="sz-plan${on ? ' on' : ''}" data-pb="s-plan" data-side="${side}" data-v="${k}" aria-pressed="${on}">
      <span class="sz-pi">${glyph(k === 'run' ? 'run' : k)}</span><b>${p.name}</b><em class="sz-gr" style="--g:${SC.gradeColor(gr)}">${gr}</em>
      <small class="pro">+ ${esc(p.pro)}</small><small class="con">− ${esc(p.con)}</small></button>`; };
  return `<p class="sz-sub">Grades are how each plan fits <b>this</b> matchup: your personnel against their tendencies.</p>
    <div class="sz-h">OFFENSE</div><div class="sz-plans">${Object.entries(SC.OFF_PLANS).map(([k, p]) => card('off', k, p, SC.fitOff(k, P.me, P.opp, edge))).join('')}</div>
    <div class="sz-h">DEFENSE</div><div class="sz-plans">${Object.entries(SC.DEF_PLANS).map(([k, p]) => card('def', k, p, SC.fitDef(k, P.opp))).join('')}</div>
    <button class="pb-go" type="button" data-pb="s-step" data-v="practice"${W.plan.off && W.plan.def ? '' : ' disabled'}>${W.plan.off && W.plan.def ? 'ON TO PRACTICE ▶' : 'PICK BOTH SIDES'}</button>`;
}
function practiceStep(g, W){
  const used = SC.hoursUsed(W.prac), left = SC.HOURS - used, after = SC.freshAfter(s.fresh, W.prac);
  const row = (k, a) => { const h = W.prac[k] || 0, d = W.drill[k];
    return `<div class="sz-prow"><div class="sz-ph2"><b>${a.name}</b><small>${esc(a.tip)}</small></div>
      <div class="sz-pc"><button type="button" data-pb="s-hr" data-k="${k}" data-d="-1"${h ? '' : ' disabled'} aria-label="Less">−</button>${pip(h, SC.AREA_MAX, 'big')}<button type="button" data-pb="s-hr" data-k="${k}" data-d="1"${left > 0 && h < SC.AREA_MAX ? '' : ' disabled'} aria-label="More">+</button></div>
      ${a.drill ? `<div class="sz-drill">${Number.isFinite(d) ? `<em style="--g:${SC.gradeColor(letter(d))}">DRILL ${letter(d)} · ×${SC.drillMult(d).toFixed(2)}</em>` : ''}<button type="button" class="sz-db" data-pb="s-drill" data-k="${k}"${h ? '' : ' disabled'}>${Number.isFinite(d) ? 'REDO DRILL' : 'RUN A DRILL'} ▶</button></div>` : ''}
      ${k === 'film' && h >= 2 ? `<div class="sz-drill"><em style="--g:#9fc4ff">PRE-SNAP READS ON ${Math.round(SC.filmTells(h) * 100)}% OF SNAPS</em></div>` : ''}</div>`; };
  return `<div class="sz-hours"><div><small>HOURS LEFT</small><b>${left}<span>/${SC.HOURS}</span></b></div>
      <div class="sz-fprev"><small>FRESHNESS</small><b>${s.fresh} <i>→</i> <span class="${after < s.fresh ? 'dn' : 'up'}">${after}</span></b>${pip(Math.round(after / 10), 10, after < 65 ? 'low' : '')}</div></div>
    <p class="sz-sub">Practice sharpens you for Saturday but wears the team down; a light week recovers. Run a drill and its grade scales that area: an A counts about 1.45×, a D or worse counts for less than skipping it.</p>
    ${Object.entries(SC.AREAS).map(([k, a]) => row(k, a)).join('')}
    <button class="pb-go" type="button" data-pb="s-step" data-v="kickoff">ON TO GAME DAY ▶</button>`;
}
const letter = v => v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : v >= 60 ? 'D' : 'F';
function kickoffStep(g, W, P){
  const opp = SN.oppOf(s, g), me = tm(s.teamId), M = buildMods(g, W, P), after = SC.freshAfter(s.fresh, W.prac);
  const po = SC.OFF_PLANS[W.plan.off], pd = SC.DEF_PLANS[W.plan.def];
  const exp = SN.expMargin(s, g) * (g.h === s.teamId ? 1 : -1) + SC.simShift(M, W.prac), wp = Math.max(1, Math.min(99, Math.round(SN.winProb(exp) * 100)));
  const mode = (k, t, d) => `<button type="button" class="sz-mode${W.mode === k ? ' on' : ''}" data-pb="s-mode" data-v="${k}" aria-pressed="${W.mode === k}"><b>${t}</b><small>${d}</small></button>`;
  const side = (t, you) => `<div class="sz-side${you ? ' you' : ''}" style="--c:${esc(t.color)}">${logo(t, 120)}<b>${rankTag(t.id)}${esc(t.abbr)}</b></div>`;
  return `<div class="sz-kick" style="--c:${esc(opp.color)};--m:${esc(me.color)}"><div class="sz-vs">${side(me, true)}<div class="sz-at"><span>${SN.homeAway(s, g) === 'A' ? '@' : 'VS'}</span><small>GAME DAY</small></div>${side(opp)}</div></div>
    <div class="sz-sum">
      <div><small>OFFENSE</small><b>${po.name}</b><em class="sz-gr" style="--g:${SC.gradeColor(SC.grade(M.fit.off))}">${SC.grade(M.fit.off)}</em></div>
      <div><small>DEFENSE</small><b>${pd.name}</b><em class="sz-gr" style="--g:${SC.gradeColor(SC.grade(M.fit.def))}">${SC.grade(M.fit.def)}</em></div>
      <div><small>PRACTICE</small><b>PASS ${W.prac.pass} · RUN ${W.prac.run} · DEF ${W.prac.def} · FILM ${W.prac.film}</b></div>
      <div><small>FRESHNESS</small><b>${after}</b>${pip(Math.round(after / 10), 10, after < 65 ? 'low' : '')}</div>
    </div>
    <div class="sz-odds"><span>PROJECTED</span><i><b style="width:${wp}%"></b></i><em>${wp}%</em></div>
    <div class="sz-h">HOW DO YOU WANT TO PLAY IT?</div>
    <div class="sz-modes">${mode('play', 'PLAY IT', "You're on the field: every throw, run and cover play.")}${mode('coach', 'COACH IT', 'You call every play; your players run it. Touch the field on any snap to take over.')}</div>
    <div class="sz-ctas"><button class="pb-go" type="button" data-pb="s-kick">KICK OFF ▶</button><button class="pb-go alt" type="button" data-pb="s-sim">SIM GAME</button></div>`;
}
function buildMods(g, W, P){
  const opp = SN.oppOf(s, g), edge = SN.strength(tm(s.teamId)) - SN.strength(opp);
  return SC.mods({ plan: W.plan, prac: W.prac, drill: W.drill, fresh: SC.freshAfter(s.fresh, W.prac), me: P.me, opp: P.opp, edge, home: SN.homeAway(s, g) === 'H' });
}

/* ---------- playing, simming, and the result ---------- */
function kick(sim){
  const n = SN.next(s); if (n.kind !== 'game') return hub();
  const g = s.games[n.id], W = gwOf(g), P = { me: prof[s.teamId], opp: prof[SN.oppOf(s, g).id] };
  if (!P.me || !P.opp) return gameWeek();
  const M = buildMods(g, W, P);
  if (sim){
    const shift = SC.simShift(M, W.prac) * (g.h === s.teamId ? 1 : -1), res = SN.simScore(s, g, shift);
    const before = SN.rankOf(s, s.teamId);
    s.fresh = SC.freshAfter(s.fresh, W.prac);
    SN.recordMine(s, g.id, SN.myScore(s, g, res), 'sim', null);
    return afterGame(g, before, null);
  }
  ctx.saved.seasonMode = W.mode; ctx.save();
  ctx.play({ gid: g.id, me: teamFor(s.teamId), opp: teamFor(SN.oppOf(s, g).id), diff: s.diff, len: s.len, mods: M, coach: W.mode === 'coach', scout: P.opp, plan: { ...W.plan }, recommended: SC.recommended(P.opp) });
}
const teamFor = id => { const t = tm(id), i = ctx.teamInfo(id); return { ...i, id: String(id), name: t.name || i.name, abbr: t.abbr || i.abbr, logo: t.logo || i.logo, color: i.color !== '#5a6470' ? i.color : t.color, alt: i.alt || t.alt, off: i.off ?? t.off, def: i.def ?? t.def, names: t.names }; };

/* Called by the game when a season game is played to the end. */
export function gameOver(G){
  s = SN.load(); const g = s?.games[G.season.gid];
  if (!g || g.res) return hub();
  const W = gwOf(g), before = SN.rankOf(s, s.teamId);
  s.fresh = SC.freshAfter(s.fresh, W.prac);
  SN.recordMine(s, g.id, [G.score[0], G.score[1]], G.coachSnaps > G.playSnaps ? 'coach' : 'play', G.stats);
  if (G.me.names) tm(s.teamId).names = G.me.names;
  afterGame(g, before, G);
}
function afterGame(g, before, G){
  // The rest of the week (or round) plays out once all your games in it are done.
  let recap = null;
  const morethisWeek = s.stage === 'reg' && (s.mine[s.week] || []).some(id => !s.games[id].res);
  if (!morethisWeek) recap = SN.advance(s);
  if (recap){ s.lastRecap = { label: recap.label, games: recap.games, before: recap.before.slice(0, 30) }; recapOpen = true; }
  persist();
  const mine = SN.myScore(s, g), won = mine[0] > mine[1], opp = SN.oppOf(s, g), after = SN.rankOf(s, s.teamId);
  const real = g.real && !g.post ? SN.myScore(s, g, g.real) : null, st = G?.stats, n = G?.me.names || {};
  const flip = real && (real[0] > real[1]) !== won;
  const H = recap ? SN.headlines(s, recap.games, recap.before).slice(0, 3) : [];
  const champ = s.stage === 'done' && s.post.cfp?.champ === s.teamId;
  const line = st ? `<table class="pb-tbl"><tr><td>${esc(n.QB || 'Passing')}</td><td>${st.comp}/${st.att}, ${st.passYds} yds, ${st.passTD} TD${st.int ? `, ${st.int} INT` : ''}</td></tr>
      <tr><td>Rushing</td><td>${st.rush} for ${st.rushYds} yds, ${st.rushTD} TD</td></tr></table>` : '<p class="sz-sub">Simulated from the matchup, your game plan, practice and freshness.</p>';
  ctx.final(`<div class="pb-card pb-final sz-result${won ? ' won' : ''}">
    ${champ ? `<div class="sz-trophy">${glyph('trophy', '#ffd84a')}</div><h2 style="color:#ffd84a">NATIONAL CHAMPIONS!</h2>` : `<h2 style="color:${won ? '#4cff7a' : '#ff5a4e'}">${won ? 'VICTORY!' : 'DEFEAT'}</h2>`}
    <div class="pb-score big">${scoreSide(tm(s.teamId), mine[0])}${scoreSide(opp, mine[1])}</div>
    ${g.how === 'sim' ? '<span class="sz-chip">SIMULATED</span>' : ''}
    <div class="sz-rmove"><span>RANK</span><b>${before ? '#' + before : 'NR'}</b><i>→</i><b class="${after && (!before || after < before) ? 'up' : after && before && after > before ? 'dn' : ''}">${after ? '#' + after : 'NR'}</b></div>
    ${line}
    ${real ? `<p class="sz-real${flip ? ' flip' : ''}">${flip ? (won ? 'You changed history: ' : 'Real life went better: ') : 'Same as real life: '}${esc(tm(s.teamId).abbr)} ${real[0] > real[1] ? 'won' : 'lost'} ${Math.max(...real)}–${Math.min(...real)} for real.</p>` : g.post ? '' : `<p class="sz-real">${realLine(g)}</p>`}
    ${H.length ? `<div class="sz-mini"><div class="sz-h">AROUND THE COUNTRY</div><ul class="sz-news">${H.map(headline).join('')}</ul></div>` : ''}
    <button class="pb-go" type="button" data-pb="s-hub">CONTINUE ▶</button></div>`, won);
}
const scoreSide = (t, sc) => `<div class="pb-sl" style="--c:${esc(t.color)};--k:${inkOn(t.color)}">${t.logo ? `<img src="${esc(logoUrl(t.logo, 72, 'light'))}" alt="">` : ''}<b>${esc(t.abbr)}</b><span>${sc}</span></div>`;

/* A practice drill finished during game week: its grade scales that area's practice. */
export function drillDone(area, score){
  s = SN.load(); const n = SN.next(s); if (n.kind !== 'game') return hub();
  const g = s.games[n.id], W = gwOf(g); if (Number.isFinite(score)) W.drill[area] = score; W.step = 'practice'; persist();
  gameWeek('practice');
}

/* ---------- clicks ---------- */
export function click(a, b){
  s = s || SN.load();
  switch (a){
    case 's-hub': recapOpen = recapOpen && document.querySelector('.sz-result') != null; return hub();
    case 's-new': return setupScreen();
    case 's-teams': return teamList();
    case 's-team': setupPick.team = b.dataset.id; return setupScreen();
    case 's-set': setupPick[b.dataset.k] = b.dataset.v; return setupScreen();
    case 's-begin':
      if (b.dataset.confirm === '1' && b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = 'TAP AGAIN TO START OVER'; return; }
      return begin();
    case 's-again': setupPick = null; return setupScreen();
    case 's-tab': tab = b.dataset.v; if (tab === 'around') recapOpen = false; return hub();
    case 's-adv': {
      const before = SN.poll(s).order;
      const R = SN.advance(s); s.lastRecap = { label: R.label, games: R.games, before: (R.before || before).slice(0, 30) }; recapOpen = true; persist(); return hub();
    }
    case 's-simall': {
      while (s.stage === 'cfp'){ const R = SN.advance(s); s.lastRecap = { label: R.label, games: R.games, before: R.before.slice(0, 30) }; }
      persist(); tab = 'cfp'; return hub();
    }
    case 's-gw': return gameWeek();
    case 's-step': return gameWeek(b.dataset.v);
    case 's-plan': { const n = SN.next(s), W = gwOf(s.games[n.id]); W.plan[b.dataset.side] = b.dataset.v; persist(); return gameWeek(); }
    case 's-hr': {
      const n = SN.next(s), W = gwOf(s.games[n.id]), k = b.dataset.k, d = Number(b.dataset.d);
      const v = (W.prac[k] || 0) + d; if (v < 0 || v > SC.AREA_MAX || d > 0 && SC.hoursUsed(W.prac) >= SC.HOURS) return;
      W.prac[k] = v; persist(); return gameWeek();
    }
    case 's-drill': { const n = SN.next(s), g = s.games[n.id]; return ctx.drill(b.dataset.k, s.teamId, SN.oppOf(s, g).id); }
    case 's-mode': { const n = SN.next(s), W = gwOf(s.games[n.id]); W.mode = b.dataset.v; persist(); return gameWeek(); }
    case 's-kick': return kick(false);
    case 's-sim': return kick(true);
  }
}

/* ---------- the menu card on the main screen ---------- */
export function menuCard(){
  const x = SN.load();
  if (!x) return `<button class="pb-go sz-menu" type="button" data-pb="s-new"><span>SEASON MODE</span><small>Your real schedule, week by week: scout, plan, practice, play or coach</small></button>`;
  const r = SN.recOf(SN.table(x), x.teamId), t = x.teams[x.teamId], n = SN.next(x), g = n.id ? x.games[n.id] : null;
  const what = n.kind === 'done' ? 'Season complete' : g ? `Next: ${g.post ? esc(g.name || '') : `Week ${g.w}`} ${SN.homeAway(x, g) === 'A' ? '@' : 'vs'} ${esc(SN.oppOf(x, g).abbr)}` : n.kind === 'bye' ? `Week ${n.week}: bye` : 'The postseason rolls on';
  return `<button class="pb-go sz-menu" type="button" data-pb="s-hub" style="--c:${esc(t.color)}"><span>${t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="">` : ''}YOUR SEASON · ${rec(r)}</span><small>${what}</small></button>`;
}

export const CSS = `
.sz-px{width:100%;height:100%;display:block;shape-rendering:crispEdges}
.sz-nologo{display:inline-grid;place-items:center;background:var(--c);color:#fff;font-style:normal;font-size:7px;border-radius:50%}
.sz-menu{display:grid !important;gap:6px;text-align:left;background:#101215 !important;color:#ffd84a !important;box-shadow:0 4px 0 #000,inset 0 0 0 2px #ffd84a,inset 6px 0 0 var(--c,#ffd84a) !important;padding:14px 14px 14px 20px !important}
.sz-menu span{display:flex;align-items:center;gap:8px;font-size:12px}
.sz-menu img{width:22px;height:22px;object-fit:contain}
.sz-menu small{font-size:7px;color:#c9d1d9;line-height:1.6}
.sz-kicker{font-size:8px;color:#7df9ff;letter-spacing:.08em}
.sz-title{margin:0;font-size:clamp(18px,5.5vw,28px);font-weight:400;line-height:1.1;color:#fff;text-shadow:3px 3px 0 #000}
.sz-title span{color:#ffd84a;font-size:1.25em}
.sz-lead{margin:0;font:13px/1.5 'Public Sans',system-ui,sans-serif;color:#c9d1d9}
.sz-new{gap:14px}
.sz-pickteam{display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--c);color:var(--k) !important;border:2px solid #000;box-shadow:0 4px 0 #000,inset 0 0 0 2px rgba(255,255,255,.18);text-align:left}
.sz-pickteam img{width:56px;height:56px;object-fit:contain;background:#fff;border-radius:50%;padding:4px}
.sz-pickteam span{display:grid;gap:5px}
.sz-pickteam small{font-size:7px;opacity:.85}.sz-pickteam b{font-weight:400;font-size:14px}.sz-pickteam em{font-style:normal;font-size:7px;opacity:.8}
.sz-warn{margin:0;font:12px/1.4 'Public Sans',system-ui,sans-serif;color:#ff9f43}
.sz-hist{display:grid;gap:5px}
.sz-h{font-size:8px;color:#9aa4ae;letter-spacing:.06em;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0 2px}
.sz-h button{background:none;border:0;color:#7df9ff;font-size:8px;padding:2px}
.sz-hrow{display:grid;grid-template-columns:22px auto 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center;background:#15181c;border:2px solid #000;padding:6px 8px;font-size:8px}
.sz-hrow img{grid-row:1/3;width:22px;height:22px;object-fit:contain}
.sz-hrow span{color:#c9d1d9;text-align:right}.sz-hrow em{grid-column:2/4;font-style:normal;font:11px 'Public Sans',system-ui,sans-serif;color:#9aa4ae}
.sz-hrow.champ{box-shadow:inset 0 0 0 1px #ffd84a}.sz-hrow.champ em{color:#ffd84a}
.sz-load{gap:14px;justify-items:center}
.sz-load p{font:13px/1.45 'Public Sans',system-ui,sans-serif}
.sz-load small{font-size:7px;color:#9aa4ae}
.sz-spin{width:48px;height:48px;animation:szSpin 1.1s steps(8) infinite}
@keyframes szSpin{to{transform:rotate(360deg)}}
.sz-lbar{width:100%;height:12px;background:#0b0d10;border:2px solid #000;box-shadow:0 0 0 2px #2c3138}
.sz-lbar i{display:block;height:100%;background:repeating-linear-gradient(90deg,#ffd84a 0 8px,#e0b52e 8px 10px);transition:width .25s steps(4)}

/* The hub */
.sz-hub,.sz-gw{max-width:620px;padding:0;gap:0;overflow-x:hidden}
.sz-hero{position:relative;overflow:hidden;background:var(--c);color:var(--k);padding:12px 14px 12px;border-bottom:2px solid #000;
  background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.06) 0 6px,transparent 6px 14px),linear-gradient(180deg,transparent 40%,rgba(0,0,0,.35))}
.sz-hbg{position:absolute;right:-40px;top:-30px;width:210px;height:210px;opacity:.16;pointer-events:none;filter:grayscale(.2)}
.sz-hbg img{width:100%;height:100%;object-fit:contain}
.sz-htop{position:relative;display:flex;justify-content:space-between;align-items:center;font-size:7px;letter-spacing:.06em;opacity:.95}
.sz-hbtns{display:flex;gap:6px}
.sz-ib{display:grid;place-items:center;min-width:32px;height:28px;padding:0 8px;background:rgba(0,0,0,.45);color:#fff !important;border:2px solid #000;font-size:7px}
.sz-ib svg{width:12px;height:12px}
.sz-id{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;margin:12px 0 10px}
.sz-idl{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:50%;padding:5px;border:2px solid #000;box-shadow:0 3px 0 #000}
.sz-idt h1{margin:0;font-size:clamp(14px,4.6vw,22px);font-weight:400;line-height:1.15;text-shadow:2px 2px 0 rgba(0,0,0,.45)}
.sz-idt p{margin:6px 0 0;font-size:8px;opacity:.92}.sz-idt p b{font-weight:400;font-size:13px}
.sz-rank{display:grid;justify-items:center;gap:3px;background:#101215;color:#ffd84a;border:2px solid #000;box-shadow:0 3px 0 #000;padding:6px 10px;min-width:58px}
.sz-rank small{font-size:6px;color:#9aa4ae}.sz-rank b{font-weight:400;font-size:18px}
.sz-rank.nr b{color:#9aa4ae;font-size:14px}
.sz-rank i{font-style:normal;font-size:7px}.sz-rank i.up{color:#4cff7a}.sz-rank i.dn{color:#ff5a4e}
.sz-hstrip{position:relative;display:flex;flex-wrap:wrap;gap:8px}
.sz-fresh,.sz-rvy{display:flex;align-items:center;gap:7px;background:rgba(0,0,0,.5);color:#fff;border:2px solid #000;padding:5px 8px;font-size:6.5px}
.sz-fresh b{font-weight:400;font-size:9px}
.sz-rvy b{font-weight:400;font-size:9px;color:#ffd84a;margin-right:4px}
.sz-pips{display:inline-flex;gap:2px}
.sz-pips i{width:5px;height:9px;background:rgba(255,255,255,.18)}
.sz-pips i.on{background:#4cff7a}.sz-pips.low i.on{background:#ff9f43}
.sz-pips.big i{width:11px;height:16px;background:#22272d;box-shadow:inset 0 -2px 0 rgba(0,0,0,.4)}
.sz-pips.big i.on{background:#ffd84a}

.sz-next{margin:12px 12px 4px;padding:12px;background:#15181c;border:2px solid #000;box-shadow:0 0 0 2px #2c3138,0 4px 0 #000;display:grid;gap:10px;
  background-image:linear-gradient(90deg,color-mix(in srgb,var(--m,#2c3138) 22%,transparent),transparent 40%,transparent 60%,color-mix(in srgb,var(--c,#2c3138) 22%,transparent))}
.sz-nl{font-size:8px;color:#ffd84a;letter-spacing:.06em;text-align:center}
.sz-vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.sz-side{display:grid;justify-items:center;gap:6px;text-align:center}
.sz-side img,.sz-side .sz-nologo{width:64px;height:64px;object-fit:contain;filter:drop-shadow(0 3px 0 rgba(0,0,0,.6))}
.sz-side b{font-weight:400;font-size:11px;display:flex;align-items:center;gap:4px}
.sz-side small{font-size:7px;color:#9aa4ae}
.sz-at{display:grid;justify-items:center;gap:4px}.sz-at span{font-size:16px;color:#fff;text-shadow:2px 2px 0 #000}.sz-at small{font-size:6px;color:#9aa4ae}
.sz-rk{display:inline-block;font-weight:400;font-size:.75em;color:#111;background:#ffd84a;padding:1px 3px;margin-right:4px;line-height:1.2;vertical-align:1px}
.sz-odds{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;font-size:7px;color:#9aa4ae}
.sz-odds i{display:block;height:10px;background:color-mix(in srgb,var(--c,#ff5a4e) 70%,#000);border:2px solid #000}
.sz-odds i b{display:block;height:100%;background:color-mix(in srgb,var(--m,#4cff7a) 85%,#fff);box-shadow:2px 0 0 #000}
.sz-odds em{font-style:normal;color:#fff;font-size:9px}
.sz-real{margin:0;text-align:center;font:12px/1.4 'Public Sans',system-ui,sans-serif;color:#9aa4ae}
.sz-real.flip{color:#ffd84a}
.sz-ctas{display:flex;gap:8px}.sz-ctas .pb-go{flex:1}.sz-ctas .pb-go.alt{flex:0 0 auto}
.sz-nb{margin:0;text-align:center;font:13px/1.45 'Public Sans',system-ui,sans-serif;color:#c9d1d9}.sz-nb b{color:#4cff7a;font-weight:600}
.sz-done{justify-items:center;text-align:center}
.sz-done h2{margin:0;font-size:16px;font-weight:400;color:#fff;text-shadow:2px 2px 0 #000}
.sz-done.big h2{color:#ffd84a}
.sz-trophy{width:56px;height:56px;margin:0 auto;animation:szBob 1.2s steps(2) infinite}
@keyframes szBob{50%{transform:translateY(-3px)}}

.sz-recap{margin:10px 12px 0;padding:8px 10px;background:#0f1215;border:2px solid #000;box-shadow:0 0 0 2px #2c3138}
.sz-tabs{position:sticky;top:0;z-index:2;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:10px 12px 8px;background:#101215;border-bottom:2px solid #000}
.sz-tabs button{flex:none;padding:8px 9px;font-size:7.5px;background:#1b1f24;border:2px solid #000;box-shadow:0 3px 0 #000;color:#c9d1d9}
.sz-tabs button[aria-pressed="true"]{background:#ffd84a;color:#111}
.sz-body{padding:10px 12px 16px;display:grid;gap:6px}
.sz-foot,.sz-empty{margin:4px 0 0;font:11px/1.45 'Public Sans',system-ui,sans-serif;color:#7c848e;text-align:center}
.sz-empty{padding:24px 8px}

.sz-sched{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.sz-g{display:grid;grid-template-columns:30px 24px 1fr auto;grid-template-areas:"wk lg nm res" "wk lg nm real";align-items:center;column-gap:8px;row-gap:2px;padding:7px 8px;background:#15181c;border:2px solid #000}
.sz-g .wk{grid-area:wk;font-size:7px;color:#7c848e}
.sz-g img,.sz-g .sz-nologo{grid-area:lg;width:24px;height:24px;object-fit:contain}
.sz-g .nm{grid-area:nm;font:13px/1.25 'Public Sans',system-ui,sans-serif;color:#e8eaec;min-width:0;overflow:hidden;text-overflow:ellipsis}
.sz-g .nm small{display:block;font:7px 'Press Start 2P',monospace;color:#ffd84a;margin-bottom:3px}
.sz-g .res{grid-area:res;font-size:9px;text-align:right;white-space:nowrap}
.sz-g .res.w{color:#4cff7a}.sz-g .res.l{color:#ff5a4e}.sz-g .res.nx{color:#111;background:#ffd84a;padding:3px 5px;font-size:7px}
.sz-g .res sup{font-size:5.5px;color:#9aa4ae;margin-left:4px;vertical-align:3px}
.sz-g .real{grid-area:real;font-size:6.5px;text-align:right;color:#7c848e}
.sz-g.flip .real{color:#ffd84a}
.sz-g.cur{box-shadow:0 0 0 2px #ffd84a}
.sz-g.bye{grid-template-areas:"wk nm nm nm";opacity:.6}.sz-g.bye .nm{font:8px 'Press Start 2P',monospace;color:#7c848e}
.sz-g.bye.cur{opacity:1}
.sz-g:not(.done):not(.cur):not(.bye){opacity:.72}

.sz-poll{list-style:none;margin:0;padding:0;display:grid;gap:3px}
.sz-poll li{display:grid;grid-template-columns:22px 30px 22px 1fr auto;align-items:center;gap:8px;padding:5px 8px;background:#15181c;border:2px solid #000;box-shadow:inset 3px 0 0 var(--c)}
.sz-poll li b{font-weight:400;font-size:10px;text-align:right}
.sz-poll .mv{font-style:normal;font-size:6.5px;color:#7c848e}.sz-poll .mv.up{color:#4cff7a}.sz-poll .mv.dn{color:#ff5a4e}.sz-poll .mv.nw{color:#7df9ff}
.sz-poll img{width:22px;height:22px;object-fit:contain}
.sz-poll span{font:13px 'Public Sans',system-ui,sans-serif;color:#e8eaec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sz-poll em{font-style:normal;font-size:8px;color:#9aa4ae}
.sz-poll li.me{background:#2a2410;box-shadow:inset 3px 0 0 #ffd84a}
.sz-conf tr.me td{background:#2a2410}.sz-conf tr.me td:first-child{box-shadow:inset 3px 0 0 #ffd84a}

.sz-conf{width:100%;border-collapse:separate;border-spacing:0 3px;font-size:8px}
.sz-conf th{font-weight:400;font-size:6.5px;color:#7c848e;text-align:left;padding:0 6px}
.sz-conf td{background:#15181c;padding:6px;border-top:2px solid #000;border-bottom:2px solid #000}
.sz-conf td:first-child{color:#7c848e;width:16px;border-left:2px solid #000}.sz-conf td:last-child{border-right:2px solid #000}
.sz-conf td:nth-child(2){display:flex;align-items:center;gap:7px;font:13px 'Public Sans',system-ui,sans-serif;color:#e8eaec}
.sz-conf td:nth-child(2) img{width:20px;height:20px;object-fit:contain}
.sz-conf tr.cut td{border-bottom-color:#ffd84a}
.sz-ch{font-style:normal;font:6px 'Press Start 2P',monospace;background:#ffd84a;color:#111;padding:2px 4px}

.sz-news{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.sz-news li{display:grid;grid-template-columns:24px 1fr auto auto;align-items:center;gap:8px;padding:6px 8px;background:#15181c;border:2px solid #000}
.sz-news img{width:24px;height:24px;object-fit:contain}
.sz-news span{font:12.5px/1.35 'Public Sans',system-ui,sans-serif;color:#c9d1d9}
.sz-news span b{color:#fff;font-weight:600}.sz-news span i{font-style:normal;color:#ffd84a;font-weight:600}.sz-news strong{color:#fff;white-space:nowrap}
.sz-news .t{font-style:normal;font-size:5.5px;padding:3px 4px;border:1px solid currentColor}
.t.up{color:#ff5a4e}.t.big{color:#ffd84a}.t.sim{color:#7df9ff}.t.real{color:#9aa4ae}

.sz-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.sz-tiles div{display:grid;gap:5px;justify-items:center;background:#15181c;border:2px solid #000;padding:8px 2px}
.sz-tiles b{font-weight:400;font-size:12px;color:#fff}.sz-tiles span{font-size:5.5px;color:#9aa4ae}
.sz-lead2{display:grid;gap:4px}
.sz-ldr{display:grid;gap:4px;padding:8px 10px;background:#15181c;border:2px solid #000;position:relative}
.sz-ldr small{font-size:6px;color:#7c848e}.sz-ldr b{font-weight:400;font-size:10px;color:#fff}.sz-ldr span{font:12px 'Public Sans',system-ui,sans-serif;color:#c9d1d9}
.sz-heis{position:absolute;right:8px;top:8px;font-style:normal;font-size:6px;color:#111;background:#ffd84a;padding:3px 5px}

.sz-bracket{display:grid;gap:10px}
.sz-rd{display:grid;gap:4px}.sz-rd h4{margin:0;font-weight:400;font-size:7px;color:#7df9ff}
.sz-bg{display:grid;gap:2px;background:#15181c;border:2px solid #000;padding:5px 6px}
.sz-bg small{font-size:6px;color:#7c848e}
.sz-bg div,.sz-bye{display:grid;grid-template-columns:14px 20px 1fr auto;align-items:center;gap:7px;font-size:8px;color:#9aa4ae}
.sz-bg div.w{color:#fff}.sz-bg div.me,.sz-bye.me{color:#ffd84a}
.sz-bg i,.sz-bye i{font-style:normal;font-size:6.5px;color:#7c848e}
.sz-bg img,.sz-bye img{width:20px;height:20px;object-fit:contain}
.sz-bg b{font-weight:400}
.sz-bye{background:#15181c;border:2px solid #000;padding:5px 6px}.sz-bye em{font-style:normal;font-size:6px;color:#7c848e}
.sz-champ{display:grid;justify-items:center;gap:6px;padding:12px;background:#1d1a0c;border:2px solid #000;box-shadow:0 0 0 2px #ffd84a}
.sz-champ svg{width:40px;height:40px}.sz-champ b{font-weight:400;font-size:12px;color:#ffd84a}.sz-champ span{font-size:7px;color:#c9d1d9}

/* Game week */
.sz-gwh{display:flex;align-items:center;gap:10px;padding:10px 12px;background:color-mix(in srgb,var(--c) 30%,#101215);border-bottom:2px solid #000;font-size:8px;color:#fff}
.sz-steps{list-style:none;margin:0;padding:10px 12px;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;border-bottom:2px solid #000}
.sz-steps button{width:100%;display:grid;justify-items:center;gap:5px;padding:7px 2px;background:#15181c;border:2px solid #000;color:#7c848e;font-size:6.5px}
.sz-steps i{font-style:normal;width:16px;height:16px;display:grid;place-items:center;background:#22272d;color:#9aa4ae;font-size:8px}
.sz-steps li.on button{color:#ffd84a;box-shadow:0 0 0 2px #ffd84a}.sz-steps li.on i{background:#ffd84a;color:#111}
.sz-steps li.done button{color:#c9d1d9}.sz-steps li.done i{background:#4cff7a;color:#111}
.sz-steps button:disabled{opacity:.4;cursor:default}
.sz-gw > :not(.sz-gwh):not(.sz-steps){margin-left:12px;margin-right:12px}
.sz-gw > .pb-go,.sz-gw > .sz-ctas{margin-top:12px;margin-bottom:14px}
.sz-gw .sz-h{margin-top:12px}
.sz-sub{margin:10px 0 0;font:12.5px/1.45 'Public Sans',system-ui,sans-serif;color:#9aa4ae}.sz-sub b{color:#fff}
.sz-opp{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:12px;margin-top:12px;padding:12px;background:var(--c);color:var(--k);border:2px solid #000;box-shadow:0 4px 0 #000;
  background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 6px,transparent 6px 14px)}
.sz-opp img,.sz-opp .sz-nologo{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:50%;padding:5px;border:2px solid #000}
.sz-opp small{font-size:6.5px;opacity:.85}.sz-opp h2{margin:5px 0;font-weight:400;font-size:clamp(12px,4vw,17px)}.sz-opp p{margin:0;font-size:7.5px;opacity:.9}
.sz-cols{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
@media (max-width:460px){.sz-cols{grid-template-columns:1fr}}
.sz-unit{display:grid;gap:7px;align-content:start;padding:10px;background:#15181c;border:2px solid #000}
.sz-unit h3{margin:0;font-weight:400;font-size:7px;color:#9aa4ae}
.sz-tag{justify-self:start;font-weight:400;font-size:8px;color:#111;background:#ff9f43;padding:4px 6px}.sz-tag.d{background:#7df9ff}
.sz-split{display:flex;height:16px;border:2px solid #000;font-size:6px}
.sz-split i{display:flex;align-items:center;padding:0 4px;background:#3d8b39;color:#fff;font-style:normal;white-space:nowrap;overflow:hidden}
.sz-split i + i{flex:1;background:#2f5d8a;justify-content:flex-end}
.sz-meter{display:grid;grid-template-columns:74px 1fr 54px;align-items:center;gap:6px;font-size:6.5px;color:#9aa4ae}
.sz-meter i{display:block;height:8px;background:#22272d}.sz-meter i b{display:block;height:100%}
.sz-meter em{font-style:normal;text-align:right;color:#c9d1d9;white-space:nowrap}
.sz-star{display:grid;gap:4px;margin-top:6px;padding:8px 10px;background:#15181c;border:2px solid #000;box-shadow:inset 3px 0 0 #ff5a4e}
.sz-star small{font-size:6px;color:#ff5a4e}.sz-star b{font-weight:400;font-size:10px;color:#fff}.sz-star span{font:11px 'Public Sans',system-ui,sans-serif;color:#9aa4ae}
.sz-notes{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:5px}
.sz-notes li{font:12.5px/1.45 'Public Sans',system-ui,sans-serif;color:#e8eaec;padding-left:14px;position:relative}
.sz-notes li::before{content:"";position:absolute;left:2px;top:.55em;width:5px;height:5px;background:#ffd84a}
.sz-film{display:grid;gap:6px;margin-top:6px;padding:10px;background:#0f1418;border:2px solid #000;box-shadow:inset 0 0 0 1px #9fc4ff33}
.sz-film .sz-h{margin:0;color:#9fc4ff}
.sz-film.locked p{margin:0;font:12px/1.45 'Public Sans',system-ui,sans-serif;color:#7c848e}
.sz-plans{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sz-plan{position:relative;display:grid;grid-template-columns:22px 1fr;align-items:center;column-gap:8px;row-gap:5px;padding:10px 9px;background:#15181c;border:2px solid #000;box-shadow:0 3px 0 #000;text-align:left;color:#e8eaec}
.sz-plan .sz-pi{width:22px;height:22px;color:#9aa4ae}.sz-plan b{font-weight:400;font-size:7.5px;line-height:1.4;padding-right:22px}
.sz-plan small{grid-column:1/-1;font:11px/1.35 'Public Sans',system-ui,sans-serif}
.sz-plan .pro{color:#9be7a8}.sz-plan .con{color:#f2a49b}
.sz-plan.on{background:#24210f;box-shadow:0 0 0 2px #ffd84a,0 3px 0 #000}.sz-plan.on .sz-pi{color:#ffd84a}
.sz-gr{font-style:normal;display:inline-grid;place-items:center;width:20px;height:20px;font-size:10px;color:#111;background:var(--g);border:2px solid #000}
.sz-plan .sz-gr{position:absolute;right:6px;top:6px}
.sz-hours{display:grid;grid-template-columns:auto 1fr;gap:10px;margin-top:12px}
.sz-hours > div{display:grid;gap:5px;padding:9px 10px;background:#15181c;border:2px solid #000}
.sz-hours small{font-size:6px;color:#9aa4ae}.sz-hours b{font-weight:400;font-size:16px;color:#ffd84a}.sz-hours b span{font-size:9px;color:#7c848e}
.sz-fprev b{font-size:12px;color:#fff}.sz-fprev b i{font-style:normal;color:#7c848e}.sz-fprev .dn{color:#ff9f43}.sz-fprev .up{color:#4cff7a}
.sz-prow{display:grid;gap:8px;margin-top:6px;padding:10px;background:#15181c;border:2px solid #000}
.sz-ph2{display:grid;gap:4px}.sz-ph2 b{font-weight:400;font-size:9px;color:#fff}.sz-ph2 small{font:11.5px 'Public Sans',system-ui,sans-serif;color:#9aa4ae}
.sz-pc{display:flex;align-items:center;gap:10px}
.sz-pc button{width:34px;height:34px;background:#2c3138;border:2px solid #000;box-shadow:0 3px 0 #000;font-size:14px;color:#fff}
.sz-pc button:disabled{opacity:.35}
.sz-drill{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sz-drill em{font-style:normal;font-size:6.5px;color:var(--g)}
.sz-db{margin-left:auto;background:#101215;border:2px solid #000;box-shadow:0 0 0 2px #7df9ff;color:#7df9ff;font-size:7px;padding:7px 8px}
.sz-db:disabled{opacity:.35;box-shadow:0 0 0 2px #2c3138;color:#7c848e}
.sz-kick{margin-top:12px;padding:12px;background:#15181c;border:2px solid #000;background-image:linear-gradient(90deg,color-mix(in srgb,var(--m) 25%,transparent),transparent 45%,transparent 55%,color-mix(in srgb,var(--c) 25%,transparent))}
.sz-sum{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px}
.sz-sum div{position:relative;display:grid;gap:4px;padding:8px;background:#15181c;border:2px solid #000}
.sz-sum small{font-size:6px;color:#9aa4ae}.sz-sum b{font-weight:400;font-size:7.5px;color:#fff;line-height:1.5;padding-right:20px}
.sz-sum .sz-gr{position:absolute;right:6px;top:6px}
.sz-gw .sz-odds{margin-top:10px}
.sz-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sz-mode{display:grid;gap:6px;padding:10px;text-align:left;background:#15181c;border:2px solid #000;box-shadow:0 3px 0 #000;color:#e8eaec}
.sz-mode b{font-weight:400;font-size:10px}.sz-mode small{font:11.5px/1.4 'Public Sans',system-ui,sans-serif;color:#9aa4ae}
.sz-mode.on{background:#0f2224;box-shadow:0 0 0 2px #7df9ff,0 3px 0 #000}.sz-mode.on b{color:#7df9ff}
.sz-result .pb-tbl{margin-top:2px}
.sz-chip{justify-self:center;font-size:6.5px;color:#7df9ff;border:1px solid #7df9ff;padding:3px 6px}
.sz-rmove{display:flex;justify-content:center;align-items:center;gap:10px;font-size:8px;color:#9aa4ae}
.sz-rmove b{font-weight:400;font-size:16px;color:#fff}.sz-rmove b.up{color:#4cff7a}.sz-rmove b.dn{color:#ff5a4e}.sz-rmove i{font-style:normal}
.sz-mini{text-align:left}
.sz-result.won{box-shadow:0 0 0 2px #4cff7a,0 6px 0 #000}
/* In the game: the coach's snap button, film reads, the drive call */
.pb-bar .pb-snapbtn{color:#111;background:#7df9ff;box-shadow:0 0 0 2px #000,0 3px 0 #000;font-size:10px;padding:9px 14px}
.pb-tell{color:#111;background:#9fc4ff;padding:0 4px;animation:pbBlink .6s steps(2) 3}
.pb-dcall{max-width:460px}
.pb-dcalls{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.pb-dcalls button{display:grid;gap:5px;padding:10px 8px;background:#1b1f24;border:2px solid #000;box-shadow:0 3px 0 #000;text-align:left}
.pb-dcalls button b{font-weight:400;font-size:9px;color:#ffd84a}.pb-dcalls button small{font:11px/1.35 'Public Sans',system-ui,sans-serif;color:#9aa4ae}
.pb-dcalls button.late{grid-column:1/-1;box-shadow:0 0 0 2px #7df9ff,0 3px 0 #000}
.pb-read{margin:0;padding:7px 9px;font:12px/1.4 'Public Sans',system-ui,sans-serif !important;color:#cfe3ff !important;background:#0f1418;border:2px solid #000;text-align:left}
.pb-read b{font:7px 'Press Start 2P',monospace;color:#9fc4ff;margin-right:6px}
.pb-advice{font-size:8px;color:#7df9ff !important}
.pb-starred{position:relative}
.pb-starred::after{content:"★ BEATS THEIR D";position:absolute;right:4px;top:4px;font-size:5.5px;color:#111;background:#ffd84a;padding:2px 3px}
`;
