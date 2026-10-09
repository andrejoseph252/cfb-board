/* Coach Andre's Bowl: an arcade football game in the spirit of the retro mobile classics. Pick your team and an opponent
   (any FBS teams, in their colors, with strength from ESPN's FPI), then play offense: drag back and release to
   throw, hand off, juke and dive, kick field goals. The other team's drives are simulated between yours.
   Opened full screen at #play; loaded on demand so it costs nothing until then. */
import { esc, store } from '../util.js';
import { state } from '../state.js';
import * as api from '../api.js';
import { myTeam } from '../myteam.js';
import { logoUrl } from '../views/components.js';
import { inkOn } from '../views/preview.js';
import * as S from './sim.js';
import { createRenderer } from './draw.js';
import { initAudio, setSound, soundOn, sfx, resume } from './sfx.js';

const STEP = 1 / 60;
// Win-loss records live under `results` (an older `record` field also counted unfinished test games, so it's dropped).
const saved = { diff: 'pro', len: 'standard', sound: true, routes: true, ...store.get('pixelbowl', {}) };
delete saved.record; saved.results ||= {};
/* Every visit starts fresh: Rookie, Quick quarters, and a three-receiver random drill from your own 25 (sound and
   the route preview are the only choices kept). */
const PRACTICE_DEFAULTS = { count: 3, mode: 'random', concept: 'verts', routes: {}, spot: 25, session: 'quick' };
/* A practice session is a set number of throws (handoffs don't count); finished sessions are saved to history. */
const SESSIONS = { quick: { name: 'Quick', n: 5 }, normal: { name: 'Normal', n: 10 }, long: { name: 'Long', n: 20 } };
saved.sessions = Array.isArray(saved.sessions) ? saved.sessions : [];
delete saved.lastPractice;
/* Your own plays (My Playbook): kept for good, unlike the per-visit settings. */
saved.plays = Array.isArray(saved.plays) ? saved.plays : [];
const findPlay = id => saved.plays.find(p => p.id === id);
const freshSettings = () => { saved.diff = 'rookie'; saved.len = 'quick'; saved.practice = { ...PRACTICE_DEFAULTS, routes: {} }; };
freshSettings();
const save = () => store.set('pixelbowl', saved);
const coarse = () => matchMedia('(pointer: coarse)').matches;
const ord = n => ['1ST', '2ND', '3RD', '4TH'][n - 1] || `${n}TH`;
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const yardLine = x => { x = Math.round(x); return x === 50 ? 'MIDFIELD' : x < 50 ? `OWN ${x}` : `OPP ${100 - x}`; };
const hypot = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- teams ---------- */
let colors = null;
async function loadColors(){
  try{
    const j = await api.teams();
    const list = j?.sports?.[0]?.leagues?.[0]?.teams || [];
    colors = Object.fromEntries(list.map(({ team: t }) => [String(t.id), {
      color: t.color ? '#' + t.color : null, alt: t.alternateColor ? '#' + t.alternateColor : null,
      name: t.location, abbr: t.abbreviation, logo: t.logos?.[0]?.href
    }]));
  }catch{ colors = colors || {}; }
}
function teamInfo(id){
  id = String(id);
  const s = state.standings?.byTeam[id], c = colors?.[id], f = state.fpi?.byTeam[id];
  const g = state.games.flatMap(x => [x.home, x.away]).find(t => String(t.id) === id);
  return {
    id, name: s?.name || c?.name || g?.name || 'Team', abbr: s?.abbr || c?.abbr || g?.abbr || 'TEAM', logo: s?.logo || c?.logo || g?.logo || null,
    color: c?.color || g?.color || '#5a6470', alt: c?.alt || g?.alt || '#ffffff', off: f?.off, def: f?.def, fpi: f?.fpi
  };
}
function allTeams(){
  const ids = new Set([...Object.keys(state.standings?.byTeam || {}), ...Object.keys(colors || {})]);
  return [...ids].map(teamInfo).sort((a, b) => a.name.localeCompare(b.name));
}
function withImage(t){
  if (t.logo){ t.img = new Image(); t.img.src = logoUrl(t.logo, 72); }
  return t;
}
function defaults(prefill){
  let me, opp;
  if (prefill?.length === 2){
    const [a, h] = prefill.map(String);
    me = myTeam && (a === myTeam.id || h === myTeam.id) ? myTeam.id : h; opp = me === a ? h : a;
  } else {
    me = myTeam?.id || saved.lastMe || state.rankings?.ranks?.[0]?.id || Object.keys(state.standings?.byTeam || {})[0] || '333';
    const g = state.games.find(x => String(x.home.id) === String(me) || String(x.away.id) === String(me));
    opp = g ? (String(g.home.id) === String(me) ? g.away.id : g.home.id) : saved.lastOpp;
    if (!opp || String(opp) === String(me)){
      const pool = state.rankings?.ranks?.map(r => r.id) || Object.keys(state.standings?.byTeam || {});
      opp = pool.filter(x => String(x) !== String(me))[Math.floor(Math.random() * Math.min(15, pool.length - 1))] || '61';
    }
  }
  return { me: String(me), opp: String(opp) };
}

/* ---------- state ---------- */
let root = null, canvas, R, sizeWatch = null, G = null, phase = 'setup', raf = 0, last = 0, acc = 0, paused = false;
let pick = { me: null, opp: null }, onExit = () => {}, snaps = 0, picking = null, openPrefill = null;
let input = { targetY: null, steer: 0, juke: 0, dive: false, qbMove: null, qbKeys: null };
let aim = null, ptr = null, deadT = 0, deadWait = 1.3, kickT = 0;
const keys = new Set();
const $ = s => root?.querySelector(s);

/* ---------- open / close ---------- */
export function open({ prefill = null, exit = () => {} } = {}){
  onExit = exit; openPrefill = prefill; waitingData = !(state.standings && colors);
  if (!root) freshSettings();
  if (root){ if (prefill && phase === 'setup'){ pick = defaults(prefill); setup(); } return; }
  if (!document.getElementById('pb-font')){
    const l = Object.assign(document.createElement('link'), { id: 'pb-font', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap' });
    document.head.append(l);
  }
  if (!document.getElementById('pb-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'pb-css', textContent: CSS }));
  root = document.createElement('div');
  root.className = 'pb'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', "Coach Andre's Bowl");
  root.innerHTML = `<canvas class="pb-cv"></canvas>
    <div class="pb-hud" hidden><div class="pb-bug"></div><div class="pb-dd"></div></div>
    <div class="pb-tools" hidden><button type="button" data-pb="pause" aria-label="Pause">${ICON.pause}</button><button type="button" data-pb="sound" aria-label="Sound">${saved.sound ? ICON.sound : ICON.mute}</button></div>
    <div class="pb-bar"></div><div class="pb-hint"></div><div class="pb-banner"></div><div class="pb-grade" aria-live="polite"></div><div class="pb-modal"></div>`;
  document.body.append(root); document.body.classList.add('pb-open');
  canvas = $('.pb-cv'); R = createRenderer(canvas); R.resize();
  // Re-measure whenever the canvas's displayed size changes (phone toolbars, rotation, a late first layout).
  if (window.ResizeObserver){ sizeWatch = new ResizeObserver(() => R?.resize()); sizeWatch.observe(canvas); }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel);
  root.addEventListener('click', onClick); root.addEventListener('input', onInput);
  window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize); window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  document.addEventListener('visibilitychange', onHide);
  pick = defaults(prefill);
  setup();
  loadColors().then(() => { if (root && phase === 'setup') setup(); });
  last = 0; raf = requestAnimationFrame(loop);
}
export function close(){
  if (!root) return;
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
  document.removeEventListener('visibilitychange', onHide);
  sizeWatch?.disconnect(); sizeWatch = null;
  root.remove(); root = null; document.body.classList.remove('pb-open');
  G = null; phase = 'setup'; paused = false; keys.clear();
}
export const isOpen = () => !!root;

/* Local testing only: lets a script advance the game without animation frames (which background tabs don't get). */
if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__pb = {
  get G(){ return G; }, get R(){ return R; }, get phase(){ return phase; }, get paused(){ return paused; }, input,
  tick(sec){ for (let i = 0; i < sec * 60; i++){ if (!paused && G){ update(STEP); drain(); } } hud(); }
};

function onResize(){ R?.resize(); }
function onHide(){ if (document.hidden && G && !paused && ['presnap', 'live', 'dead', 'kick'].includes(phase)) pause(); }

/* ---------- main loop ---------- */
let waitingData = true;
function loop(ts){
  raf = requestAnimationFrame(loop);
  R.resize();   // cheap when nothing changed; catches any size change the observer missed
  // Opened straight to #play before the board's team data arrived: fill in the real teams once it does.
  if (waitingData && state.standings && colors){ waitingData = false; if (phase === 'setup' && (G?.me.name === 'Team' || G?.me.color === '#5a6470')){ pick = defaults(openPrefill); setup(); } }
  const dt = Math.min(.05, last ? (ts - last) / 1000 : 0); last = ts;
  if (!paused && G){ acc += dt; while (acc >= STEP){ update(STEP); acc -= STEP; } }
  if (G) R.draw(G, paused ? 0 : dt, { aim: aim?.active ? aim.target : null, routes: phase === 'presnap' && saved.routes,
    handoff: !aim?.active && (phase === 'presnap' && !G.kick || phase === 'live' && S.canHandoff(G)) });
  if (G) drain();
  hud();
}

function update(dt){
  G.cheer = Math.max(0, (G.cheer || 0) - dt);
  readKeys();
  if (phase === 'presnap'){
    if (!S.tickRunoff(G, dt)) clockOut();
  } else if (phase === 'live'){
    if (!G.ot && !G.practice) S.useClock(G, dt);
    S.step(G, dt, input);
    input.juke = 0; input.dive = false;
    if (aim && !S.canThrow(G)) aim = null;
    if (G.play.result) playOver();
  } else if (phase === 'dead'){
    deadT += dt;
    for (const p of G.play.all){ if (!p.down){ p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92; } }
    if (deadT > deadWait) afterPlay();
  } else if (phase === 'kick'){
    S.stepKick(G, dt);
    if (G.kick.stage === 'done' && (kickT += dt) > 1.4) afterKick();
  }
}

function drain(){
  for (const e of G.events){
    if (e.type === 'sfx') sfx(e.name);
    else if (e.type === 'shake') R.shake(e.a);
    else if (e.type === 'quarter') banner(`${ord(e.q)} QUARTER`, '', '#7df9ff', 1300);
  }
  G.events.length = 0;
}

/* ---------- setup screen ---------- */
function setup(){
  phase = 'setup'; paused = false; behind = null;
  const me = withImage(teamInfo(pick.me)), opp = withImage(teamInfo(pick.opp));
  // The menu sits over a live picture of the matchup.
  G = S.newGame(me, opp, saved.diff, saved.len); S.setupPlay(G); R.snapCamera(G);
  showHud(false);
  const rec = saved.results[saved.diff], card = (t, who, act) => `<button class="pb-team" type="button" data-pb="${act}" style="--c:${esc(t.color)};--k:${inkOn(t.color)}">
      ${t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="">` : ''}<b>${esc(t.name)}</b><small>${who}</small>
      <span class="pb-rt">${Number.isFinite(t.off) ? `OFF ${Math.round(t.off)} · DEF ${Math.round(t.def)}` : 'Tap to change'}</span></button>`;
  const seg = (key, items) => `<div class="pb-seg">${items.map(([v, l]) => `<button type="button" data-pb="set" data-k="${key}" data-v="${v}" aria-pressed="${saved[key] === v}">${l}</button>`).join('')}</div>`;
  modal(`<div class="pb-setup">
    <button class="pb-x" type="button" data-pb="exit" aria-label="Close">${ICON.x}</button>
    <h1 class="pb-logo"><span>COACH ANDRE'S</span><span>BOWL</span></h1>
    <div class="pb-match">${card(me, 'YOU', 'pickme')}<button class="pb-vs" type="button" data-pb="swap" aria-label="Swap teams">VS<i>⇄</i></button>${card(opp, 'CPU', 'pickopp')}</div>
    <div class="pb-opt"><span>Difficulty</span>${seg('diff', Object.entries(S.DIFFS).map(([k, d]) => [k, d.name]))}</div>
    <div class="pb-opt"><span>Quarters</span>${seg('len', Object.entries(S.LENGTHS).map(([k, d]) => [k, `${d.name} ${mmss(d.q)}`]))}</div>
    <div class="pb-checks"><label><input type="checkbox" data-pb-opt="routes"${saved.routes ? ' checked' : ''}> Show routes before the snap</label>
      <label><input type="checkbox" data-pb-opt="sound"${saved.sound ? ' checked' : ''}> Sound</label></div>
    <button class="pb-go" type="button" data-pb="start">KICK OFF</button>
    <div class="pb-btns pb-menu2"><button class="pb-go alt" type="button" data-pb="practice">PRACTICE</button><button class="pb-go alt" type="button" data-pb="playbook">MY PLAYBOOK</button></div>
    ${rec ? `<p class="pb-rec">Your record on ${S.DIFFS[saved.diff].name}: ${rec.w}–${rec.l}</p>` : ''}
    <details class="pb-how"><summary>How to play</summary>${HOW}</details>
  </div>`);
}

function teamPicker(which){
  picking = which;
  const list = allTeams();
  modal(`<div class="pb-setup pb-picker">
    <div class="pb-ph"><b>${which === 'me' ? 'YOUR TEAM' : 'OPPONENT'}</b><button class="pb-x" type="button" data-pb="back" aria-label="Back">${ICON.x}</button></div>
    <input class="pb-q" type="search" placeholder="Search ${list.length} teams" autocomplete="off" data-pb-q>
    <div class="pb-list">${list.map(t => `<button type="button" data-pb="team" data-id="${esc(t.id)}" data-n="${esc(t.name.toLowerCase())} ${esc(t.abbr.toLowerCase())}" style="--c:${esc(t.color)}">
      ${t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="" loading="lazy">` : '<i></i>'}<span>${esc(t.name)}</span><em></em></button>`).join('')}</div></div>`);
  if (!coarse()) $('.pb-q')?.focus();
}

/* ---------- game flow ---------- */
function startGame(){
  saved.lastMe = pick.me; saved.lastOpp = pick.opp; save();
  initAudio(saved.sound);
  G = S.newGame(G.me, G.opp, saved.diff, saved.len);
  snaps = 0;
  showHud(true);
  // Coin toss.
  const meWins = Math.random() < .5;
  phase = 'modal';
  modal(`<div class="pb-card"><div class="pb-coin"><i></i></div><h2>COIN TOSS</h2><p class="pb-toss" hidden>${meWins ? `You won the toss and will receive.` : `${esc(G.opp.name)} won the toss and will receive.`}</p>
    <button class="pb-go" type="button" data-pb="toss" hidden>${meWins ? 'RECEIVE' : 'KICK OFF'}</button></div>`);
  setTimeout(() => { $('.pb-toss')?.removeAttribute('hidden'); $('[data-pb="toss"]')?.removeAttribute('hidden'); sfx('whistle'); }, 1200);
  G.firstHalfReceiver = meWins ? 'me' : 'opp';
}
function afterToss(){
  closeModal();
  if (G.firstHalfReceiver === 'me') kickoffToMe(); else oppDrive(kickoffYtg());
}
const kickoffYtg = () => Math.random() < .8 ? 75 : Math.round(60 + Math.random() * 20);
function kickoffToMe(){ startMyDrive(Math.random() < .8 ? 25 : Math.round(18 + Math.random() * 22)); }

function startMyDrive(x){
  S.startDrive(G, x); R.snapCamera(G); presnap();
}
function presnap(){
  if (!G.ot && G.clock <= 0) return clockOut();
  G.call = null; G.callRoutes = null;   // a called play is for one snap; every play starts back on Random
  S.setupPlay(G); phase = 'presnap'; aim = null; resetInput();
  if (G.down === 4 && !G.twoPt) fourthDown();
}
function doSnap(){
  if (phase !== 'presnap') return;
  closeModal();
  G.runoff = 0; snaps++;
  S.snap(G); phase = 'live';
  if (G.call === 'run') S.handoff(G);
}

function playOver(){
  const r = G.play.result;
  phase = 'dead'; deadT = 0; aim = null; deadWait = 1.25;
  if (G.practice) return practicePlayOver(r);
  if (r.type === 'td'){ banner(G.twoPt ? 'TWO POINTS!' : 'TOUCHDOWN!', G.twoPt ? '' : G.me.name.toUpperCase(), G.me.color, 2300); sfx('td'); G.cheer = 3; deadWait = 2.5; }
  else if (r.type === 'int'){ banner('INTERCEPTED', '', '#ff5a4e', 1800); sfx('turnover'); deadWait = 2; }
  else if (r.type === 'fumble'){ banner('FUMBLE!', '', '#ff5a4e', 1800); sfx('turnover'); deadWait = 2; }
  else if (r.type === 'sack'){ G.play.pops.push({ x: r.x, y: r.y, text: 'SACKED', color: '#ff5a4e', t: 0 }); }
  else if (r.type === 'inc'){ sfx('drop'); G.play.pops.push({ x: G.play.ball.tx, y: G.play.ball.ty, text: (r.why || 'Incomplete').toUpperCase(), color: '#fff', t: 0 }); }
  else if (r.type === 'oob') G.play.pops.push({ x: r.x, y: r.y, text: 'OUT OF BOUNDS', color: '#fff', t: 0 });
}

function afterPlay(){
  phase = 'wait';
  if (G.practice) return practiceAfter();
  const out = S.applyResult(G), lp = G.lastPlay;
  if (G.twoPt){
    G.twoPt = false;
    if (out === 'td'){ G.score[0] += 2; } else banner('NO GOOD', 'Two-point try fails', '#ff5a4e', 1300);
    return afterMyScore();
  }
  switch (out){
    case 'next':
      if (lp.first){ sfx('first'); banner('FIRST DOWN', '', '#ffd84a', 900); }
      return presnap();
    case 'td': G.score[0] += 6; return extraPoint();
    case 'turnover':
      if (lp.pick6 && !G.ot){ G.score[1] += 7; banner('PICK SIX', `${G.opp.name} scores`, '#ff5a4e', 1800); sfx('boo'); return setTimeout(() => G && kickoffToMe(), 1600); }
      return endMyPossession(G.turnoverX);
    case 'downs': banner('TURNOVER ON DOWNS', '', '#ff5a4e', 1500); sfx('turnover'); return setTimeout(() => G && endMyPossession(G.turnoverX), 1300);
    case 'safety': G.score[1] += 2; banner('SAFETY', '', '#ff5a4e', 1500); sfx('boo'); return setTimeout(() => G && endMyPossession(60), 1300);
  }
}

function extraPoint(){
  if (G.ot >= 3) return afterMyScore();
  phase = 'modal';
  modal(`<div class="pb-card"><h2>TOUCHDOWN!</h2><p>Kick the extra point or go for two?</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="pat">KICK PAT</button><button class="pb-go alt" type="button" data-pb="two">GO FOR 2</button></div></div>`);
}
function goForTwo(){ closeModal(); S.startDrive(G, 97); G.toGo = 3; G.twoPt = true; G.y = S.MID; presnap(); }
function afterMyScore(){ endMyPossession(kickoffYtg()); }

function endMyPossession(oppX){
  if (G.ot) return otOpp();
  if (G.clock <= 0) return clockOut();
  oppDrive(oppX);
}

function fourthDown(){
  const fg = S.inFgRange(G), dist = S.fgDistance(G);
  phase = 'presnap';
  modal(`<div class="pb-card pb-4th"><h2>${ord(4)} & ${G.toGo >= 100 - G.los ? 'GOAL' : G.toGo}</h2><p>${yardLine(G.los)}</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="goforit">GO FOR IT</button>
    ${G.ot ? '' : '<button class="pb-go alt" type="button" data-pb="punt">PUNT</button>'}
    ${fg ? `<button class="pb-go alt" type="button" data-pb="fg">FIELD GOAL · ${dist} YDS</button>` : ''}</div></div>`, true);
}
function doPunt(){
  closeModal(); phase = 'modal';
  const p = S.punt(G);
  sfx('kick'); banner(`PUNT · ${p.net} YDS`, p.touchback ? 'Touchback' : '', '#fff', 1400);
  setTimeout(() => G && endMyPossession(p.oppX), 1300);
}
function startKick(kind){
  closeModal(); G.play = null; S.startKick(G, kind); phase = 'kick'; kickT = 0;
}
function afterKick(){
  phase = 'wait';
  const K = G.kick; G.kick = null;
  if (K.kind === 'pat'){
    if (K.good){ G.score[0] += 1; banner('GOOD!', '', '#4cff7a', 900); } else banner('NO GOOD', K.why, '#ff5a4e', 1200);
    return afterMyScore();
  }
  G.stats.fga++;
  if (K.good){ G.stats.fgm++; G.score[0] += 3; banner('IT\'S GOOD!', `${K.dist}-yard field goal`, '#4cff7a', 1500); G.cheer = 2; return setTimeout(() => G && afterMyScore(), 900); }
  banner('NO GOOD', K.why, '#ff5a4e', 1400);
  setTimeout(() => G && endMyPossession(Math.min(K.spotX, 80)), 900);
}

function clockOut(){
  phase = 'modal';
  if (G.quarter <= 2) return halftime();
  if (G.score[0] === G.score[1]) return startOT();
  final();
}
function halftime(){
  sfx('whistle');
  const st = G.stats;
  modal(`<div class="pb-card"><h2>HALFTIME</h2>${scoreLine()}
    <p class="pb-stat">${st.comp}/${st.att} passing · ${st.passYds} yds · ${st.passTD} TD${st.int ? ` · ${st.int} INT` : ''}<br>${st.rush} rushes · ${st.rushYds} yds</p>
    <button class="pb-go" type="button" data-pb="half">START 2ND HALF</button></div>`);
}
function secondHalf(){
  closeModal();
  Object.assign(G, { quarter: 3, clock: G.qLen, timeouts: 3, runoff: 0 });
  if (G.firstHalfReceiver === 'opp') kickoffToMe(); else oppDrive(kickoffYtg());
}

/* The other team's drive: a little animated summary while the ball moves down a strip of field. */
function oppDrive(ytg, opts = {}, then){
  phase = 'modal'; aim = null;
  const r = S.simDrive(G, ytg, opts);
  if (!G.ot) S.useClock(G, r.time);
  const RES = { td: ['TOUCHDOWN', '#ff5a4e'], fg: ['FIELD GOAL', '#ff9f43'], missfg: ['MISSED FIELD GOAL', '#4cff7a'], punt: ['PUNT', '#c9d1d9'],
    int: ['INTERCEPTED!', '#4cff7a'], fumble: ['FUMBLE RECOVERED!', '#4cff7a'], downs: ['STOPPED ON DOWNS!', '#4cff7a'], half: [G.quarter >= 4 ? 'END OF GAME' : 'END OF HALF', '#c9d1d9'] };
  const [word, col] = RES[r.kind];
  const next = G.ot ? 'CONTINUE' : r.half || G.clock <= 0 ? 'CONTINUE' : `YOUR BALL · ${yardLine(r.myX)}`;
  modal(`<div class="pb-card pb-drive" style="--c:${esc(G.opp.color)}">
    <div class="pb-dh">${G.opp.logo ? `<img src="${esc(logoUrl(G.opp.logo, 72))}" alt="">` : ''}<b>${esc(G.opp.name)}</b><span>ON OFFENSE</span></div>
    <div class="pb-strip" style="--me:${esc(G.me.color)};--op:${esc(G.opp.color)}"><i class="pb-mark" style="left:${ytg}%"></i></div>
    <div class="pb-dres" style="color:${col}" hidden>${word}</div>
    <div class="pb-dsub" hidden>${r.plays} play${r.plays === 1 ? '' : 's'} · ${r.yards} yds${G.ot ? '' : ` · ${mmss(r.time)}`}</div>
    <button class="pb-go" type="button" data-pb="drive" hidden>${next}</button></div>`);
  let i = 0;
  const tick = setInterval(() => {
    if (!root || !$('.pb-mark')){ clearInterval(tick); return; }
    i++;
    if (i < r.path.length){ $('.pb-mark').style.left = `${r.path[i]}%`; sfx('blip'); return; }
    clearInterval(tick);
    G.score[1] += r.points;
    $('.pb-dres').hidden = false; $('.pb-dsub').hidden = false; $('[data-pb="drive"]').hidden = false;
    sfx(r.points ? 'boo' : ['int', 'fumble', 'downs', 'missfg'].includes(r.kind) ? 'good' : 'whistle');
  }, Math.max(90, Math.min(260, 1800 / r.path.length)));
  driveDone = () => {
    clearInterval(tick); closeModal();
    if (then) return then(r);
    if (r.half || G.clock <= 0) return clockOut();
    startMyDrive(r.myX);
  };
}
let driveDone = () => {};

/* ---------- overtime (college style) ---------- */
function startOT(){
  G.ot = 1; G.quarter = 5; G.runoff = 0;
  sfx('whistle');
  modal(`<div class="pb-card"><h2>OVERTIME</h2>${scoreLine()}<p>College rules: each team gets the ball at the 25. From the third overtime it's a two-point try each.</p>
    <button class="pb-go" type="button" data-pb="ot">YOUR BALL</button></div>`);
}
function myOT(){
  closeModal();
  G.otBase = [...G.score];
  if (G.ot >= 3){ S.startDrive(G, 97); G.toGo = 3; G.twoPt = true; }
  else S.startDrive(G, 75);
  R.snapCamera(G); banner(G.ot === 1 ? 'OVERTIME' : `${G.ot}OT`, '', '#7df9ff', 1100);
  presnap();
}
function otOpp(){
  phase = 'modal';
  const mine = G.score[0] - G.otBase[0];
  if (G.ot >= 3){
    const ok = S.simTwoPoint(G);
    modal(`<div class="pb-card"><h2>${esc(G.opp.name.toUpperCase())}</h2><p>Two-point try…</p><div class="pb-dres" style="color:${ok ? '#ff5a4e' : '#4cff7a'}" hidden>${ok ? 'GOOD' : 'NO GOOD!'}</div>
      <button class="pb-go" type="button" data-pb="otnext" hidden>CONTINUE</button></div>`);
    setTimeout(() => { if (!G) return; if (ok) G.score[1] += 2; $('.pb-dres') && ($('.pb-dres').hidden = false); $('[data-pb="otnext"]') && ($('[data-pb="otnext"]').hidden = false); sfx(ok ? 'boo' : 'good'); }, 1100);
    return;
  }
  oppDrive(25, { needed: mine >= 6 ? 'td' : null }, () => otCheck());
}
function otCheck(){
  closeModal();
  if (G.score[0] !== G.score[1]) return final();
  G.ot++; myOT();
}

/* ---------- play calling (in a game) ---------- */
/* A compact sheet of play cards before the snap. A call lasts one play; Random is the default. */
let sheetTab = 'std';
function playSheet(){
  if (phase !== 'presnap' || G.practice || $('.pb-modal').classList.contains('on')) return;
  const all = S.PRACTICE_ROLES, current = G.call === 'custom' ? 'u:' + G.callId : G.call || '';
  const card = (v, name, tip, routes) => `<button type="button" data-pb="callpick" data-v="${esc(v)}" aria-pressed="${current === v}">
      ${formationSVG(all, routes, true)}<b>${esc(name)}</b><small>${esc(tip)}</small></button>`;
  const custom = sheetTab === 'custom';
  const cards = custom
    ? (saved.plays.length ? saved.plays.map(p => card('u:' + p.id, p.name, 'Your play', p.routes)).join('')
      : '<p class="pb-sub pb-empty">No plays yet. Make some in My Playbook on the main menu (or save routes from practice).</p>')
    : card('', 'Random', 'Mix it up, like always', {}) + Object.entries(S.CONCEPTS).map(([k, c]) => card(k, c.name, c.tip, c.routes)).join('') + card('run', S.RUN_CALL.name, S.RUN_CALL.tip, S.RUN_CALL.routes);
  modal(`<div class="pb-card pb-calls"><div class="pb-ph"><b>CALL A PLAY</b><button class="pb-x" type="button" data-pb="callclose" aria-label="Close">${ICON.x}</button></div>
    <div class="pb-seg pb-tabs"><button type="button" data-pb="calltab" data-v="std" aria-pressed="${!custom}">PLAYBOOK</button><button type="button" data-pb="calltab" data-v="custom" aria-pressed="${custom}">CUSTOM (${saved.plays.length})</button></div>
    <div class="pb-callrow">${cards}</div>
    <p class="pb-sub">Your call is for this play only.</p></div>`, true, 'call');
  const row = $('.pb-callrow'), on = row.querySelector('[aria-pressed="true"]');
  if (on) row.scrollLeft += on.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - on.offsetWidth) / 2;
}

/* Route chips, one row per receiver (practice's Pick routes and the play designer). The back can also stay in to block. */
function routeRows(roles, routes, act){
  return roles.map(role => `<div class="pb-rrow"><span>${S.ROLE_NAMES[role]}</span><div class="pb-rchips">
    <button type="button" data-pb="${act}" data-role="${role}" data-v="" aria-pressed="${!routes[role]}"><b class="pb-rq">?</b><small>Random</small></button>
    ${role === 'RB' ? `<button type="button" data-pb="${act}" data-role="RB" data-v="block" aria-pressed="${routes.RB === 'block'}">${routeSVG('block')}<small>Block</small></button>` : ''}
    ${Object.entries(S.ROUTE_NAMES).map(([r, l]) => `<button type="button" data-pb="${act}" data-role="${role}" data-v="${r}" aria-pressed="${routes[role] === r}">${routeSVG(r)}<small>${l}</small></button>`).join('')}</div></div>`).join('');
}

/* Picking a route updates that row's highlight and the diagram in place, without re-rendering the screen, so every
   row of route chips stays scrolled where you left it and you can tap along a row comparing routes. */
function pickInPlace(btn, roles, routes){
  for (const c of btn.closest('.pb-rchips').querySelectorAll('button')) c.setAttribute('aria-pressed', String(c === btn));
  const svg = $('.pb-form svg'); if (svg) svg.outerHTML = drillPreview(roles, routes, G?.me?.color);
}

/* ---------- My Playbook: your own named plays ---------- */
let editing = null;   // { id?, name, routes, back: 'playbook' | 'practice' }
function playbookScreen(){
  phase = 'setup'; paused = false; behind = null; editing = null; showHud(false);
  const all = S.PRACTICE_ROLES;
  modal(`<div class="pb-setup pb-practice">
    <div class="pb-ph"><b>MY PLAYBOOK</b><button class="pb-x" type="button" data-pb="back" aria-label="Back">${ICON.x}</button></div>
    <p class="pb-sub">Design your own plays: pick a route for each receiver and name it. Call them in games from the play sheet's Custom tab, or rep them in practice.</p>
    <button class="pb-go" type="button" data-pb="pbnew">+ NEW PLAY</button>
    ${saved.plays.length ? `<div class="pb-pbl">${saved.plays.map(p => `<div class="pb-pbc">${formationSVG(all, p.routes, true)}<b>${esc(p.name)}</b>
      <div><button type="button" data-pb="pbedit" data-id="${esc(p.id)}">EDIT</button><button type="button" class="del" data-pb="pbdel" data-id="${esc(p.id)}">DELETE</button></div></div>`).join('')}</div>`
      : '<p class="pb-sub pb-nohist">No plays yet. Tap + New play to draw your first one.</p>'}
  </div>`);
}
function editPlay(play, back, keepScroll){
  const prevScroll = keepScroll ? $('.pb-setup')?.scrollTop : 0;
  phase = 'setup'; paused = false; behind = null; showHud(false);
  editing = play === editing && play ? editing : { id: play?.id || null, name: play?.name ?? `My play ${saved.plays.length + 1}`, routes: { ...(play?.routes || {}) }, back };
  const all = S.PRACTICE_ROLES;
  modal(`<div class="pb-setup pb-practice">
    <div class="pb-ph"><b>${editing.id ? 'EDIT PLAY' : 'NEW PLAY'}</b><button class="pb-x" type="button" data-pb="ecancel" aria-label="Cancel">${ICON.x}</button></div>
    <input class="pb-q pb-name" type="text" maxlength="20" value="${esc(editing.name)}" placeholder="Play name" aria-label="Play name" data-pb-name autocomplete="off">
    <div class="pb-form">${drillPreview(all, editing.routes, G?.me?.color)}<p>Unpicked receivers run a random route each time.</p></div>
    ${routeRows(all, editing.routes, 'eroute')}
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="esave">SAVE PLAY</button><button class="pb-go alt" type="button" data-pb="ecancel">CANCEL</button></div>
  </div>`);
  if (prevScroll) $('.pb-setup').scrollTop = prevScroll;
}
function savePlay(){
  const name = (editing?.name || '').trim().slice(0, 20);
  if (!name){ if (!$('.pb-ename-err')) $('.pb-name').insertAdjacentHTML('afterend', '<p class="pb-sub pb-ename-err">Give your play a name.</p>'); $('.pb-name').focus(); return; }
  const routes = Object.fromEntries(Object.entries(editing.routes).filter(([, v]) => v));
  if (editing.id){ const p = findPlay(editing.id); if (p) Object.assign(p, { name, routes }); }
  else { if (saved.plays.length >= 30) saved.plays.pop(); saved.plays.unshift({ id: Date.now().toString(36), name, routes }); }
  save();
  const back = editing.back; editing = null;
  if (back === 'practice'){ banner('PLAY SAVED', name, '#4cff7a', 1100); return practiceSetup(); }
  playbookScreen();
}

/* ---------- practice: no defense, no clock, same spot every rep ---------- */
const SPOTS = [[25, 'Own 25'], [50, 'Midfield'], [80, 'Red zone'], [95, 'Goal line']];
const practiceRoles = () => S.PRACTICE_ROLES.slice(0, saved.practice.count);
function practiceRoutes(){
  const P = saved.practice;
  if (P.mode === 'concept') return P.concept?.startsWith('u:') ? findPlay(P.concept.slice(2))?.routes || {} : S.CONCEPTS[P.concept]?.routes || {};
  if (P.mode === 'pick') return P.routes;
  return {};
}

/* Play diagrams. Field yards: lateral (y, + is to the right) and depth (x, + is downfield). Receivers on the left
   break inside to the right, as in the game. */
const FORM = { X: [-19, -.9, 1], TE: [-5, -.9, 1], SL: [10.5, -1.2, -1], Z: [19, -.9, -1], RB: [-2.6, -5, 1] };
/* Cuts a route where it leaves the diagram (long routes keep going downfield). */
function clipPath(pts, box){
  const [x0, y0, x1, y1] = box, inBox = ([x, y]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++){
    const a = out[out.length - 1], b = pts[i];
    if (inBox(b)){ out.push(b); continue; }
    let t = 1;
    for (const [k, lim] of [[0, x0], [0, x1], [1, y0], [1, y1]]){
      const d = b[k] - a[k]; if (!d) continue;
      const tt = (lim - a[k]) / d;
      if (tt > 0 && tt < t && inBox([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt])) t = tt;
    }
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    return { pts: out, cut: true };
  }
  return { pts: out, cut: false };
}
function routePath(name, sx, sy, inside, toPx, box){
  if (name === 'block'){   // stays in to block: a short stem and a bar
    const [x, y] = toPx(sx, sy), perYd = Math.abs(toPx(sx, sy + 1)[1] - y), [, y2] = toPx(sx, sy + Math.max(1.6, 9 / perYd));
    return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="1.6"/><line x1="${x - 3.5}" y1="${y2.toFixed(1)}" x2="${x + 3.5}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  const wps = Array.isArray(name) ? name : S.ROUTES[name] || [], last = wps[wps.length - 1];
  const field = [[sx, sy], ...wps.map(([dx, dy]) => [sx + dy * inside, sy + dx])];
  const { pts, cut } = clipPath(field, box);
  const px = pts.map(([x, y]) => toPx(x, y));
  let h = `<polyline points="${px.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (px.length > 1){
    const [x1, y1] = px[px.length - 2], [x2, y2] = px[px.length - 1], a = Math.atan2(y2 - y1, x2 - x1), L = 4;
    if (last?.[2] && !cut){   // a route that sits down: a bar, playbook style
      const nx = Math.cos(a + Math.PI / 2) * 3, ny = Math.sin(a + Math.PI / 2) * 3;
      h += `<line x1="${(x2 - nx).toFixed(1)}" y1="${(y2 - ny).toFixed(1)}" x2="${(x2 + nx).toFixed(1)}" y2="${(y2 + ny).toFixed(1)}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
    } else h += `<path d="M${x2.toFixed(1)},${y2.toFixed(1)} L${(x2 - L * Math.cos(a - .5)).toFixed(1)},${(y2 - L * Math.sin(a - .5)).toFixed(1)} L${(x2 - L * Math.cos(a + .5)).toFixed(1)},${(y2 - L * Math.sin(a + .5)).toFixed(1)}Z" fill="currentColor"/>`;
  }
  return h;
}
/* A single route for a route chip: a receiver on the left side of the formation. */
function routeSVG(name){
  const toPx = (x, y) => [9 + x * 1.15, 40 - y * 1.25];
  return `<svg viewBox="0 0 44 46" aria-hidden="true"><line x1="2" y1="41" x2="42" y2="41" class="los"/><circle cx="9" cy="40" r="2.4" class="dot"/>${routePath(name, 0, 0, 1, toPx, [-7, -3, 30, 29])}</svg>`;
}
/* The whole formation, with routes for the receivers who are out (or "?" for random). */
function formationSVG(roles, routes, small){
  const toPx = (x, y) => [100 + x * 3.9, 90 - y * 3.3];
  let h = `<svg viewBox="0 0 200 ${small ? 112 : 116}" aria-hidden="true"><line x1="4" y1="${toPx(0, 0)[1]}" x2="196" y2="${toPx(0, 0)[1]}" class="los"/>`;
  for (const dy of [-3.2, -1.6, 0, 1.6, 3.2]){ const [x, y] = toPx(dy, -.7); h += `<rect x="${x - 2.4}" y="${y - 2.4}" width="4.8" height="4.8" class="ol"/>`; }
  const [qx, qy] = toPx(0, -4.5); h += `<circle cx="${qx}" cy="${qy}" r="2.6" class="qb"/>`;
  for (const role of ['X', 'TE', 'RB', 'SL', 'Z']){
    const [lx, ly, inside] = FORM[role], [x, y] = toPx(lx, ly), on = roles.includes(role);
    if (!on && role !== 'RB') continue;
    if (on && routes[role]) h += `<g class="rt">${routePath(routes[role], lx, ly, inside, toPx, [-26, -8, 26, 25])}</g>`;
    h += `<circle cx="${x}" cy="${y}" r="3.2" class="${on ? 'dot' : 'qb'}"/>`;
    if (on && !routes[role]) h += `<text x="${x}" y="${y - 6}" class="q">?</text>`;
  }
  return h + '</svg>';
}

/* The drill at a glance: a short strip of field with your receivers in team color (labeled), empty spots as faint
   outlines, and the first stretch of each route ("?" when it's random). */
const ROLE_TAGS = { X: 'WR', Z: 'WR', SL: 'SLOT', TE: 'TE', RB: 'RB' };
function drillPreview(roles, routes, color){
  const W = 240, H = 92, LOS = 54, toPx = (x, y) => [W / 2 + x * 4.6, LOS - y * 2.9];
  const c = esc(color || '#ffd84a');
  // With no routes to draw (all random), crop to the formation itself.
  const top = roles.some(r => routes[r]) ? 0 : 28;
  let h = `<svg viewBox="0 ${top} ${W} ${H - top}" aria-hidden="true"><rect y="${top}" width="${W}" height="${H - top}" fill="#2f6e34"/>`;
  for (const yd of [5, 10, 15]){ const y = toPx(0, yd)[1]; h += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`; }
  h += `<line x1="0" y1="${LOS}" x2="${W}" y2="${LOS}" stroke="rgba(90,150,255,.9)" stroke-width="1.4"/>`;
  // routes first, so the players sit on top of them
  for (const role of ['X', 'TE', 'SL', 'Z', 'RB']){
    if (!roles.includes(role) || !routes[role]) continue;
    const [lx, ly, inside] = FORM[role];
    h += `<g class="rt" opacity=".95">${routePath(routes[role], lx, ly, inside, toPx, [-25, -6, 25, 17])}</g>`;
  }
  for (const dy of [-3.2, -1.6, 0, 1.6, 3.2]){ const [x, y] = toPx(dy, -.7); h += `<rect x="${x - 2.6}" y="${y - 2}" width="5.2" height="4" rx="1" fill="rgba(255,255,255,.28)"/>`; }
  const [qx, qy] = toPx(0, -4.5);
  h += `<circle cx="${qx}" cy="${qy}" r="3.2" fill="rgba(255,255,255,.45)"/><text x="${qx}" y="${qy + 10}" class="tag dim">QB</text>`;
  for (const role of ['X', 'TE', 'RB', 'SL', 'Z']){
    const [lx, ly] = FORM[role], [x, y] = toPx(lx, ly), on = roles.includes(role);
    if (!on){ if (role !== 'RB') h += `<circle cx="${x}" cy="${y}" r="3.6" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="2 1.6"/>`; continue; }
    h += `<circle cx="${x}" cy="${y}" r="4.6" fill="${c}" stroke="#fff" stroke-width="1.3"/><text x="${x}" y="${y + 12}" class="tag">${ROLE_TAGS[role]}</text>`;
    if (!routes[role]) h += `<circle cx="${x}" cy="${y - 10}" r="4.4" fill="#ffd84a" stroke="#000" stroke-width="1"/><text x="${x}" y="${y - 7.6}" class="tag q">?</text>`;
  }
  return h + '</svg>';
}

function practiceSetup(keepScroll){
  const prevScroll = keepScroll ? $('.pb-setup')?.scrollTop : 0;
  phase = 'setup'; paused = false; behind = null;
  if (!G || G.practice){ G = S.newGame(withImage(teamInfo(pick.me)), withImage(teamInfo(pick.opp)), saved.diff, saved.len); S.setupPlay(G); R.snapCamera(G); }
  showHud(false);
  const P = saved.practice, roles = practiceRoles(), routes = practiceRoutes();
  const seg = (k, items) => `<div class="pb-seg">${items.map(([v, l]) => `<button type="button" data-pb="pset" data-k="${k}" data-v="${v}" aria-pressed="${String(P[k]) === String(v)}">${l}</button>`).join('')}</div>`;
  let routesUI = '';
  const cc = (v, name, routes) => `<button type="button" data-pb="pset" data-k="concept" data-v="${esc(v)}" aria-pressed="${P.concept === v}">${formationSVG(roles, routes, true)}<span>${esc(name)}</span></button>`;
  if (P.mode === 'concept') routesUI = `<div class="pb-concepts">${Object.entries(S.CONCEPTS).map(([k, c]) => cc(k, c.name, c.routes)).join('')}</div>` +
    (saved.plays.length ? `<span class="pb-hh">Your plays</span><div class="pb-concepts">${saved.plays.map(p => cc('u:' + p.id, p.name, p.routes)).join('')}</div>` : '');
  else if (P.mode === 'pick') routesUI = routeRows(roles, P.routes, 'proute') +
    `<button class="pb-go alt sm" type="button" data-pb="pbsave">SAVE THESE ROUTES AS A PLAY</button>`;
  modal(`<div class="pb-setup pb-practice">
    <div class="pb-ph"><b>PRACTICE</b><button class="pb-x" type="button" data-pb="back" aria-label="Back">${ICON.x}</button></div>
    <p class="pb-sub">No defense, no clock: every rep starts from the same spot. Throwing for ${esc(G.me.name)}. Every throw is graded on timing (in stride), accuracy and release.</p>

    <div class="pb-form">${drillPreview(roles, routes, G.me.color)}
      <p>${roles.length} receiver${roles.length === 1 ? '' : 's'} out · ${P.mode === 'concept' ? esc((P.concept?.startsWith('u:') ? findPlay(P.concept.slice(2))?.name : S.CONCEPTS[P.concept]?.name) || '') : P.mode === 'pick' ? 'Your routes' : 'Random routes'}</p></div>
    <div class="pb-opt"><span>Receivers out</span>${seg('count', [1, 2, 3, 4, 5].map(n => [n, n]))}</div>
    <div class="pb-opt"><span>Routes</span>${seg('mode', [['random', 'Random'], ['concept', 'Concepts'], ['pick', 'Pick routes']])}</div>
    ${routesUI}
    <div class="pb-opt"><span>Start at</span>${seg('spot', SPOTS)}</div>
    <div class="pb-opt"><span>Session</span>${seg('session', Object.entries(SESSIONS).map(([k, x]) => [k, `${x.name} · ${x.n}`]))}</div>
    <button class="pb-go" type="button" data-pb="pstart">START ${SESSIONS[P.session].name.toUpperCase()} SESSION</button>
    ${historyHTML()}
  </div>`);
  if (prevScroll) $('.pb-setup').scrollTop = prevScroll;
}

function startPractice(){
  initAudio(saved.sound);
  const me = G.me, opp = G.opp;
  closeModal();
  G = S.newGame(me, opp, saved.diff, saved.len);
  G.practice = { roles: practiceRoles(), mode: saved.practice.mode, routes: practiceRoutes() };
  G.ps = { att: 0, comp: 0, yds: 0, td: 0, long: 0, runs: 0, runYds: 0, last: '', gradeSum: 0, graded: 0, streak: 0, bestStreak: 0, best: 0,
    timing: 0, accuracy: 0, release: 0, inStride: 0, n: SESSIONS[saved.practice.session]?.n || 5, session: saved.practice.session, drill: drillName() };
  snaps = 0; showHud(true);
  practiceRep(true);
}
function practiceRep(snapCam){
  S.startDrive(G, saved.practice.spot); G.y = S.MID;
  if (snapCam) R.snapCamera(G);
  S.setupPlay(G); phase = 'presnap'; aim = null; resetInput();
}
function practicePlayOver(r){
  const P = G.play, gain = Math.round(Math.min(r.x ?? P.los, 100) - P.los);
  if (P.grade) showGrade(P.grade);
  if (r.type === 'td'){ banner('TOUCHDOWN!', '', G.me.color, 1300); sfx('td'); G.cheer = 2; deadWait = 1.6; }
  else if (r.type === 'inc'){ sfx('drop'); P.pops.push({ x: P.ball.tx, y: P.ball.ty, text: (r.why || 'Incomplete').toUpperCase(), color: '#fff', t: 0 }); }
  else { sfx('whistle'); P.pops.push({ x: r.x, y: r.y, text: `${gain >= 0 ? '+' : ''}${gain} YDS`, color: gain >= 10 ? '#4cff7a' : '#fff', t: 0 }); }
}
function practiceAfter(){
  const P = G.play, r = P.result, ps = G.ps, gain = Math.round(Math.min(r.x ?? P.los, 100) - P.los);
  const who = P.carrier ? S.ROLE_NAMES[P.carrier.role] || 'QB' : '';
  if (P.thrown){
    ps.att++;
    if (P.grade){
      const g = P.grade; ps.gradeSum += g.score; ps.graded++; ps.best = Math.max(ps.best, g.score);
      ps.streak = g.inStride ? ps.streak + 1 : 0; ps.bestStreak = Math.max(ps.bestStreak, ps.streak);
      ps.timing += g.timing; ps.accuracy += g.accuracy; ps.release += g.release; if (g.inStride) ps.inStride++;
    }
    if (r.type !== 'inc'){ ps.comp++; ps.yds += gain; ps.long = Math.max(ps.long, gain); if (r.type === 'td') ps.td++; ps.last = `${who}: ${gain} yds${r.type === 'td' ? ', TD' : ''}`; }
    else ps.last = r.why || 'Incomplete';
  } else if (P.carrier){ ps.runs++; ps.runYds += gain; if (r.type === 'td') ps.td++; ps.last = `Run: ${gain} yds${r.type === 'td' ? ', TD' : ''}`; }
  if (ps.graded >= ps.n) return finishSession();
  practiceRep(false);
}
function drillName(){
  const P = saved.practice, n = practiceRoles().length;
  const routes = P.mode === 'concept' ? (P.concept?.startsWith('u:') ? findPlay(P.concept.slice(2))?.name : S.CONCEPTS[P.concept]?.name) : P.mode === 'pick' ? 'Your routes' : 'Random';
  return `${n} WR · ${routes} · ${SPOTS.find(([v]) => v === P.spot)?.[1] || ''}`;
}
/* The end of a session: save it to history and show the summary. */
function finishSession(){
  phase = 'modal'; aim = null;
  clearTimeout(gradeTimer); $('.pb-grade')?.classList.remove('on');
  const ps = G.ps, n = ps.graded, avg = Math.round(ps.gradeSum / n);
  const rec = { id: String(Date.now()), at: Date.now(), session: ps.session, throws: n, avg, comp: ps.comp, att: ps.att, yds: ps.yds, td: ps.td,
    inStride: Math.round(ps.inStride / n * 100), bestStreak: ps.bestStreak, timing: Math.round(ps.timing / n), accuracy: Math.round(ps.accuracy / n),
    release: Math.round(ps.release / n), drill: ps.drill };
  const prevBest = Math.max(0, ...saved.sessions.map(x => x.avg));
  saved.sessions = [rec, ...saved.sessions].slice(0, 50); save();
  const best = avg > prevBest && saved.sessions.length > 1;
  sfx(avg >= 80 ? 'good' : 'whistle');
  const bar = (k, v) => `<div class="pb-gb"><span>${k}</span><i><b style="width:${v}%;background:${gradeColor(v)}"></b></i><em>${v}</em></div>`;
  modal(`<div class="pb-card pb-sess">
    <span class="pb-sk">${esc(SESSIONS[ps.session]?.name || '')} session complete</span>
    <div class="pb-sg"><b style="color:${gradeColor(avg)}">${letter(avg)}</b><span>${avg}<small>/100</small></span></div>
    ${best ? '<p class="pb-pb">NEW PERSONAL BEST</p>' : ''}
    <div class="pb-ss"><div><b>${ps.comp}/${ps.att}</b><span>Completions</span></div><div><b>${ps.yds}</b><span>Yards</span></div>
      <div><b>${rec.inStride}%</b><span>In stride</span></div><div><b>${ps.bestStreak}</b><span>Best streak</span></div></div>
    <div class="pb-gbars wide">${bar('TIMING', rec.timing)}${bar('ACCURACY', rec.accuracy)}${bar('RELEASE', rec.release)}</div>
    <p class="pb-sub">${esc(ps.drill)} · saved to your history</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="pagain">GO AGAIN</button><button class="pb-go alt" type="button" data-pb="psetup">CHANGE DRILL</button></div>
    <div class="pb-btns"><button class="pb-go alt sm" type="button" data-pb="menu">MAIN MENU</button><button class="pb-go alt sm danger" type="button" data-pb="pdel" data-id="${rec.id}" data-long="1">DELETE THIS SESSION</button></div>
  </div>`);
}
/* Your saved sessions on the practice screen: newest first, best one starred, each deletable. */
function historyHTML(){
  const list = saved.sessions;
  if (!list.length) return '<p class="pb-sub pb-nohist">Finish a session and it shows up here.</p>';
  const best = list.reduce((a, b) => b.avg > a.avg ? b : a, list[0]);
  const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<div class="pb-hist"><span class="pb-hh">Your sessions <small>${list.length} saved · best ${letter(best.avg)} (${best.avg})</small></span>
    ${list.slice(0, 12).map(x => `<div class="pb-hr${x === best ? ' best' : ''}"><b style="color:${gradeColor(x.avg)}">${letter(x.avg)}</b>
      <div><span>${x === best ? '<i class="pb-best">BEST</i>' : ''}${esc(SESSIONS[x.session]?.name || '')} · ${x.throws} throws · ${x.avg}</span><small>${esc(day(x.at))} · ${esc(x.drill || '')} · ${x.inStride}% in stride</small></div>
      <button type="button" data-pb="pdel" data-id="${esc(x.id)}" aria-label="Delete this session">✕</button></div>`).join('')}
    ${list.length > 12 ? `<p class="pb-sub">Showing your 12 most recent.</p>` : ''}</div>`;
}

/* Throw report card: grade, verdict and three bars, under the scoreboard for a couple of seconds. */
const letter = n => n >= 97 ? 'A+' : n >= 93 ? 'A' : n >= 90 ? 'A-' : n >= 87 ? 'B+' : n >= 83 ? 'B' : n >= 80 ? 'B-' : n >= 77 ? 'C+' : n >= 73 ? 'C' : n >= 70 ? 'C-' : n >= 60 ? 'D' : 'F';
const gradeColor = n => n >= 90 ? '#4cff7a' : n >= 80 ? '#b8f05a' : n >= 70 ? '#ffd84a' : n >= 60 ? '#ff9f43' : '#ff5a4e';
let gradeTimer = 0;
function showGrade(g){
  const el = $('.pb-grade'); if (!el) return;
  const bar = (k, v) => `<div class="pb-gb"><span>${k}</span><i><b style="width:${v}%;background:${gradeColor(v)}"></b></i></div>`;
  el.innerHTML = `<b class="pb-gl" style="color:${gradeColor(g.score)}">${letter(g.score)}</b>
    <div class="pb-gw"><em>${esc(g.word)}</em><span>${g.score}${g.who ? ` · ${esc(S.ROLE_NAMES[g.who] || '')}` : ''}</span></div>
    <div class="pb-gbars">${bar('TIMING', g.timing)}${bar('ACCURACY', g.accuracy)}${bar('RELEASE', g.release)}</div>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(gradeTimer); gradeTimer = setTimeout(() => el.classList.remove('on'), 2600);
  if (g.score >= 93) sfx('first');
}

function practiceHud(){
  const ps = G.ps, spot = SPOTS.find(([v]) => v === saved.practice.spot)?.[1] || yardLine(G.los);
  const btns = phase === 'presnap' && !paused ? '<button type="button" data-pb="psetup">CHANGE DRILL</button>' : '';
  const hint = hintText();
  const key = ['P', ps.att, ps.comp, ps.yds, ps.td, ps.long, ps.runs, ps.last, ps.graded, ps.streak, btns, hint, spot].join('|');
  if (key === lastHud) return; lastHud = key;
  const pct = ps.att ? Math.round(ps.comp / ps.att * 100) : 0;
  const avg = ps.graded ? Math.round(ps.gradeSum / ps.graded) : null;
  $('.pb-bug').innerHTML = `<div class="pb-tm" style="--c:${esc(G.me.color)};--k:${inkOn(G.me.color)}">${G.me.logo ? `<img src="${esc(logoUrl(G.me.logo, 72))}" alt="">` : ''}<b>PRACTICE</b></div>
    <div class="pb-mid"><span>CMP</span><b>${ps.comp}/${ps.att}</b></div><div class="pb-mid"><span>YDS</span><b>${ps.yds}</b></div>
    <div class="pb-mid"><span>GRADE</span><b style="color:${avg == null ? '#fff' : gradeColor(avg)}">${avg == null ? '--' : letter(avg)}</b></div>`;
  $('.pb-dd').innerHTML = `<span>THROW ${Math.min(ps.graded + 1, ps.n)}/${ps.n}</span>${ps.graded ? `<span>STREAK ${ps.streak}</span>` : ''}${ps.att ? `<span>${pct}%</span>` : ''}`;
  $('.pb-bar').innerHTML = btns;
  $('.pb-hint').textContent = hint;
}

/* ---------- the end ---------- */
function final(){
  phase = 'final'; showHud(true);
  const won = G.score[0] > G.score[1], st = G.stats;
  // Only a game played to the end counts, and only once.
  const rec = saved.results[G.diffKey] || { w: 0, l: 0 };
  const complete = (G.ot > 0 || G.quarter >= 4 && G.clock <= 0) && G.score[0] !== G.score[1];
  if (complete && !G.recorded){ G.recorded = true; won ? rec.w++ : rec.l++; saved.results[G.diffKey] = rec; save(); }
  sfx(won ? 'td' : 'boo');
  if (won) G.cheer = 6;
  modal(`<div class="pb-card pb-final"><h2 style="color:${won ? '#4cff7a' : '#ff5a4e'}">${won ? 'VICTORY!' : 'FINAL'}</h2>${scoreLine(true)}
    <table class="pb-tbl"><tr><td>Passing</td><td>${st.comp}/${st.att}, ${st.passYds} yds, ${st.passTD} TD, ${st.int} INT</td></tr>
    <tr><td>Rushing</td><td>${st.rush} for ${st.rushYds} yds, ${st.rushTD} TD</td></tr>
    <tr><td>Kicking</td><td>${st.fgm}/${st.fga} FG</td></tr><tr><td>Longest play</td><td>${st.longest} yds</td></tr>
    <tr><td>Sacked</td><td>${st.sacks}</td></tr></table>
    <p class="pb-rec">${S.DIFFS[G.diffKey].name} record: ${rec.w}–${rec.l}</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="rematch">REMATCH</button><button class="pb-go alt" type="button" data-pb="menu">NEW GAME</button><button class="pb-go alt" type="button" data-pb="exit">EXIT</button></div></div>`);
}
function scoreLine(big){
  const t = (x, s) => `<div class="pb-sl" style="--c:${esc(x.color)};--k:${inkOn(x.color)}">${x.logo ? `<img src="${esc(logoUrl(x.logo, 72))}" alt="">` : ''}<b>${esc(x.abbr)}</b><span>${s}</span></div>`;
  return `<div class="pb-score${big ? ' big' : ''}">${t(G.me, G.score[0])}${t(G.opp, G.score[1])}</div>`;
}

/* ---------- pause ---------- */
function pause(){
  if (!G || !['presnap', 'live', 'dead', 'kick'].includes(phase)) return;
  paused = true;
  modal(`<div class="pb-card"><h2>PAUSED</h2>${scoreLine()}<div class="pb-btns col"><button class="pb-go" type="button" data-pb="resume">RESUME</button>
    <button class="pb-go alt" type="button" data-pb="restart">RESTART GAME</button><button class="pb-go alt" type="button" data-pb="menu">MAIN MENU</button>
    <button class="pb-go alt" type="button" data-pb="exit">EXIT TO BOARD</button></div></div>`, false, 'pause');
}
let behind = null;
function unpause(){ paused = false; closeModal('pause'); }

/* ---------- HUD, banners, modals ---------- */
let lastHud = '';
function showHud(on){ $('.pb-hud').hidden = !on; $('.pb-tools').hidden = !on; if (!on){ $('.pb-bar').innerHTML = ''; $('.pb-hint').textContent = ''; } lastHud = ''; }
function hud(){
  if (!root || !G || $('.pb-hud').hidden) return;
  if (G.practice) return practiceHud();
  const q = G.ot ? (G.ot === 1 ? 'OT' : `${G.ot}OT`) : `Q${G.quarter}`;
  const dd = G.twoPt ? '2-POINT TRY' : `${ord(G.down)} & ${G.toGo >= 100 - G.los ? 'GOAL' : G.toGo}`;
  const late = S.lateInHalf(G), live = phase === 'presnap';
  const callName = G.call === 'run' ? S.RUN_CALL.name : G.call === 'custom' ? G.callName : S.CONCEPTS[G.call]?.name || 'Random';
  const sheetUp = $('.pb-modal').classList.contains('on');
  const btns = !live || paused ? '' : [
    sheetUp ? '' : `<button type="button" data-pb="call" class="pb-call">PLAY: ${esc(callName.toUpperCase())} ▾</button>`,
    G.runoff > 0 && G.timeouts > 0 && !G.ot ? `<button type="button" data-pb="timeout">TIMEOUT (${G.timeouts})</button>` : '',
    late && G.runoff > 0 && G.down < 4 && !G.twoPt ? '<button type="button" data-pb="spike">SPIKE</button>' : '',
    late && G.score[0] > G.score[1] && !G.twoPt && G.quarter === 4 ? '<button type="button" data-pb="kneel">KNEEL</button>' : '',
    S.inFgRange(G) && G.down < 4 && !G.twoPt && (late || G.ot) ? `<button type="button" data-pb="fg">FG · ${S.fgDistance(G)}</button>` : ''
  ].join('');
  const hint = hintText();
  const key = [G.score, q, Math.ceil(G.clock), dd, G.los, G.timeouts, btns, hint, G.runoff > 0].join('|');
  if (key === lastHud) return; lastHud = key;
  const tm = (t, s) => `<div class="pb-tm" style="--c:${esc(t.color)};--k:${inkOn(t.color)}">${t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="">` : ''}<b>${esc(t.abbr)}</b><span>${s}</span></div>`;
  $('.pb-bug').innerHTML = `${tm(G.me, G.score[0])}<div class="pb-mid"><span>${q}</span><b class="${G.runoff > 0 ? 'run' : ''}">${G.ot ? '--' : mmss(G.clock)}</b></div>${tm(G.opp, G.score[1])}`;
  $('.pb-dd').innerHTML = phase === 'kick' || !G.play && !G.kick ? '' : `<span>${dd}</span><span>${yardLine(G.los)}</span><span class="pb-to">${'●'.repeat(G.timeouts)}${'○'.repeat(3 - G.timeouts)}</span>`;
  $('.pb-bar').innerHTML = btns;
  $('.pb-hint').textContent = hint;
}
function hintText(){
  if (paused) return '';
  const touch = coarse();
  if (phase === 'kick'){
    const st = G.kick?.stage;
    if (st === 'aim') return `${touch ? 'Tap' : 'Click or press Space'} to lock the aim · wind ${Math.abs(G.kick.wind)} mph ${G.kick.wind > 0 ? (R.portrait ? '→' : '↓') : G.kick.wind < 0 ? (R.portrait ? '←' : '↑') : ''}`;
    if (st === 'power') return `${touch ? 'Tap' : 'Click or press Space'} to set the power · red risks a hook`;
    return '';
  }
  if (snaps > 8 && saved.diff !== 'rookie') return '';
  if (phase === 'presnap') return G.call === 'run' ? (touch ? 'Tap to snap and run' : 'Click or press Space to snap and run') : touch ? 'Press and pull back to throw · tap the glowing back to run' : 'Press and pull back to throw · click the glowing back (or H) to run · Space snaps';
  if (phase === 'live'){
    if (G.play.carrier) return touch ? 'Drag to steer · flick sideways to juke · flick ahead to dive' : `${R.portrait ? '← →' : '↑ ↓'} steer · Space juke · X dive · or drag`;
    if (S.canThrow(G)) return touch ? 'Pull back and release to throw · tap the glowing back to hand off' : 'Pull back and release to throw · 1–5 throw to a receiver · H hand off';
  }
  return '';
}
let bannerTimer = 0;
function banner(text, sub, color = '#fff', ms = 1200){
  const b = $('.pb-banner'); if (!b) return;
  b.innerHTML = `<b style="--bc:${esc(color)}">${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('on'), ms);
}
function modal(html, light = false, kind = ''){
  const m = $('.pb-modal');
  if (kind !== 'pause' && paused) return;   // a game event never covers the pause menu
  if (kind === 'pause'){ behind = m.innerHTML ? { html: m.innerHTML, light: m.classList.contains('light') } : null; }
  m.innerHTML = html; m.classList.add('on'); m.classList.toggle('light', light); m.dataset.kind = kind;
}
function closeModal(kind){
  const m = $('.pb-modal'); if (!m) return;
  if (kind === 'pause' && behind){ m.innerHTML = behind.html; m.classList.toggle('light', behind.light); m.dataset.kind = ''; behind = null; return; }
  m.innerHTML = ''; m.classList.remove('on', 'light'); m.dataset.kind = '';
}

/* ---------- clicks ---------- */
function onClick(e){
  const b = e.target.closest('[data-pb]'); if (!b) return;
  resume();
  const a = b.dataset.pb;
  if (a !== 'sound') sfx('blip');
  switch (a){
    case 'exit': return onExit();
    case 'start': return startGame();
    case 'practice': saved.practice = { ...PRACTICE_DEFAULTS, routes: {} }; return practiceSetup();
    case 'call': return playSheet();
    case 'callpick': {
      const v = b.dataset.v || null, mine = v?.startsWith('u:') && findPlay(v.slice(2));
      if (mine) Object.assign(G, { call: 'custom', callId: mine.id, callName: mine.name, callRoutes: { ...mine.routes } });
      else G.call = v;
      closeModal(); if (phase === 'presnap') S.setupPlay(G); return;
    }
    case 'calltab': sheetTab = b.dataset.v; closeModal(); return playSheet();
    case 'playbook': return playbookScreen();
    case 'pbnew': return editPlay(null, 'playbook');
    case 'pbedit': return editPlay(findPlay(b.dataset.id), 'playbook');
    case 'pbsave': { const P = saved.practice; return editPlay({ routes: Object.fromEntries(practiceRoles().map(r => [r, P.routes[r]]).filter(([, v]) => v)) }, 'practice'); }
    case 'eroute': { editing.routes[b.dataset.role] = b.dataset.v || undefined; return pickInPlace(b, S.PRACTICE_ROLES, editing.routes); }
    case 'ecancel': return editing?.back === 'practice' ? practiceSetup() : playbookScreen();
    case 'esave': return savePlay();
    case 'pbdel': {
      if (b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = 'DELETE?'; return; }
      saved.plays = saved.plays.filter(p => p.id !== b.dataset.id); save(); return playbookScreen();
    }
    case 'callclose': return closeModal();
    case 'pset': { const k = b.dataset.k, v = b.dataset.v; saved.practice[k] = k === 'count' || k === 'spot' ? Number(v) : v; save(); return practiceSetup(true); }
    case 'proute': { saved.practice.routes[b.dataset.role] = b.dataset.v || undefined; save(); return pickInPlace(b, practiceRoles(), practiceRoutes()); }
    case 'pstart': return startPractice();
    case 'psetup': return practiceSetup();
    case 'pagain': return startPractice();
    case 'pdel': {
      // Two taps: the first arms the button, the second deletes.
      if (b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = b.dataset.long ? 'TAP AGAIN TO DELETE' : 'DELETE?'; return; }
      saved.sessions = saved.sessions.filter(x => x.id !== b.dataset.id); save();
      return b.dataset.long ? practiceSetup() : practiceSetup(true);
    }
    case 'swap': [pick.me, pick.opp] = [pick.opp, pick.me]; return setup();
    case 'pickme': return teamPicker('me');
    case 'pickopp': return teamPicker('opp');
    case 'back': return setup();
    case 'team': {
      const id = b.dataset.id, other = picking === 'me' ? 'opp' : 'me';
      if (id === pick[other]) pick[other] = pick[picking];
      pick[picking] = id; return setup();
    }
    case 'set': saved[b.dataset.k] = b.dataset.v; save(); return setup();
    case 'toss': return afterToss();
    case 'pat': return startKick('pat');
    case 'two': return goForTwo();
    case 'goforit': return closeModal();
    case 'punt': return doPunt();
    case 'fg': return startKick('fg');
    case 'half': return secondHalf();
    case 'drive': return driveDone();
    case 'ot': return myOT();
    case 'otnext': return otCheck();
    case 'rematch': { const me = G.me, opp = G.opp; closeModal(); G = S.newGame(me, opp, saved.diff, saved.len); return startGame(); }
    case 'menu': closeModal(); return setup();
    case 'resume': return unpause();
    case 'restart': { paused = false; behind = null; closeModal(); return startGame(); }
    case 'pause': return paused ? unpause() : pause();
    case 'sound': saved.sound = !soundOn(); setSound(saved.sound); save(); b.innerHTML = saved.sound ? ICON.sound : ICON.mute; return;
    case 'timeout': if (G.timeouts > 0 && G.runoff > 0){ G.timeouts--; G.runoff = 0; sfx('whistle'); banner('TIMEOUT', `${G.timeouts} left`, '#7df9ff', 900); } return;
    case 'spike': { const o = S.spike(G); banner('SPIKE', 'Clock stopped', '#fff', 800); return o === 'downs' ? endMyPossession(G.los) : presnap(); }
    case 'kneel': { const o = S.kneel(G); return o === 'downs' ? endMyPossession(G.los) : presnap(); }
  }
}
function onInput(e){
  if (e.target.matches('[data-pb-opt]')){
    const k = e.target.dataset.pbOpt; saved[k] = e.target.checked; save();
    if (k === 'sound') setSound(saved.sound);
  }
  if (e.target.matches('[data-pb-name]') && editing){ editing.name = e.target.value; $('.pb-ename-err')?.remove(); }
  if (e.target.matches('[data-pb-q]')){
    const q = e.target.value.trim().toLowerCase();
    for (const b of root.querySelectorAll('.pb-list [data-n]')) b.hidden = q && !b.dataset.n.includes(q);
  }
}

/* ---------- touch and mouse ---------- */
function local(e){
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * R.W / r.width, y: (e.clientY - r.top) * R.H / r.height };
}
function down(e){
  if (paused || !G || $('.pb-modal').classList.contains('on') && !$('.pb-modal').classList.contains('light')) return;
  resume();
  try{ canvas.setPointerCapture(e.pointerId); }catch{}
  const p = local(e), w = R.toWorld(p.x, p.y), now = performance.now();
  ptr = { id: e.pointerId, x0: p.x, y0: p.y, mode: 'none', samples: [{ ...p, t: now }] };
  if (phase === 'kick'){ S.kickTap(G); return; }
  // Before the snap, pressing the field snaps the ball and the same press goes on to aim a throw (or, on the
  // highlighted running back, hands off): one motion, no separate tap to snap.
  let fresh = false;
  if (phase === 'presnap'){
    if ($('.pb-modal').dataset.kind === 'call'){ closeModal(); ptr = null; return; }   // tap outside the play sheet closes it
    if ($('.pb-modal').classList.contains('on')) return;   // 4th-down choice still open
    doSnap(); fresh = true;
  }
  if (phase !== 'live') return;
  const P = G.play;
  if (P.carrier){ ptr.mode = 'steer'; input.targetY = w.y; return; }
  // Generous targets for fingers: the back (hand off) or the quarterback (scramble), whichever is nearer.
  const dRb = hypot(w, P.rb), dQb = hypot(w, P.qb);
  if (S.canHandoff(G) && dRb < 3.2 && dRb < dQb){ S.handoff(G); return; }
  if (S.canThrow(G)){
    if (dQb < 2.2 && !fresh){ ptr.mode = 'qb'; input.qbMove = w; }
    else { ptr.mode = 'aim'; aim = { active: false, target: null }; }
  }
}
function move(e){
  if (!ptr || ptr.id !== e.pointerId || !G?.play) return;
  const p = local(e), w = R.toWorld(p.x, p.y), now = performance.now();
  ptr.samples.push({ ...p, t: now }); while (ptr.samples.length > 2 && now - ptr.samples[0].t > 160) ptr.samples.shift();
  if (ptr.mode === 'aim' && aim && S.canThrow(G)){
    const pull = R.dragToWorld(ptr.x0 - p.x, ptr.y0 - p.y), len = Math.hypot(pull.x, pull.y), k = 2.6;
    aim.active = len > .9;
    const qb = G.play.qb, d = Math.min(62, len * k), n = len || 1;
    aim.target = { x: Math.min(112, qb.x + pull.x / n * d), y: qb.y + pull.y / n * d };
  } else if (ptr.mode === 'qb') input.qbMove = w;
  else if (ptr.mode === 'steer' || (G.play.carrier && ptr.mode === 'none' && phase === 'live')){ ptr.mode = 'steer'; input.targetY = w.y; }
}
function up(e){
  if (!ptr || ptr.id !== e.pointerId) return;
  if (ptr.mode === 'aim' && aim?.active && S.canThrow(G)) S.throwTo(G, aim.target.x, aim.target.y);
  if (ptr.mode === 'steer' && phase === 'live' && G.play.carrier){
    const s = ptr.samples, a = s[0], b = s[s.length - 1];
    if (b && a && b.t - a.t < 170 && Math.hypot(b.x - a.x, b.y - a.y) > 9){
      const v = R.dragToWorld(b.x - a.x, b.y - a.y);
      if (v.x > Math.abs(v.y) * 1.2) input.dive = true; else input.juke = Math.sign(v.y) || 1;
    }
  }
  aim = null; input.qbMove = null; input.targetY = null; ptr = null;
}
function cancel(){ aim = null; input.qbMove = null; input.targetY = null; ptr = null; }
function resetInput(){ Object.assign(input, { targetY: null, steer: 0, juke: 0, dive: false, qbMove: null, qbKeys: null }); ptr = null; aim = null; }

/* ---------- keyboard ---------- */
const KEYMAP = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
function keydown(e){
  if (!root || e.target.matches?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p'){ e.preventDefault(); if (phase === 'setup') return; return paused ? unpause() : pause(); }
  if (paused || !G || phase === 'setup') return;
  if (k === 'm'){ saved.sound = !soundOn(); setSound(saved.sound); save(); return; }
  if (KEYMAP[k]){ e.preventDefault(); keys.add(KEYMAP[k]); return; }
  if (k === ' ' || k === 'enter'){
    if ($('.pb-modal').classList.contains('on')) return;
    e.preventDefault(); resume();
    if (phase === 'presnap') return doSnap();
    if (phase === 'kick') return S.kickTap(G);
    if (phase === 'live' && G.play.carrier){
      const c = G.play.carrier, lat = input.steer || 0;
      const near = G.play.def.filter(d => !d.down).sort((a, b) => hypot(a, c) - hypot(b, c))[0];
      input.juke = lat || (near && near.y > c.y ? -1 : 1);
    }
    return;
  }
  if (k === 'c' && phase === 'presnap' && !G.practice){ e.preventDefault(); return $('.pb-modal').dataset.kind === 'call' ? closeModal() : playSheet(); }
  if (k === 'h' && phase === 'presnap' && !$('.pb-modal').classList.contains('on')){ e.preventDefault(); doSnap(); S.handoff(G); return; }
  if (phase !== 'live') return;
  if (/^[1-5]$/.test(k)){ e.preventDefault(); S.throwToReceiver(G, Number(k)); return; }
  if (k === 'h'){ e.preventDefault(); S.handoff(G); return; }
  if (k === 'x'){ e.preventDefault(); if (G.play.carrier) input.dive = true; }
}
function keyup(e){ const k = KEYMAP[e.key.toLowerCase()]; if (k) keys.delete(k); }
function readKeys(){
  const u = keys.has('up'), d = keys.has('down'), l = keys.has('left'), r = keys.has('right');
  const lat = R.portrait ? (r ? 1 : 0) - (l ? 1 : 0) : (d ? 1 : 0) - (u ? 1 : 0);
  const fwd = R.portrait ? (u ? 1 : 0) - (d ? 1 : 0) : (r ? 1 : 0) - (l ? 1 : 0);
  input.steer = lat;
  input.qbKeys = lat || fwd ? { x: fwd, y: lat } : null;
}

/* ---------- copy and styles ---------- */
const HOW = `<ul>
  <li><b>Pass:</b> press anywhere and drag <i>back</i> like a slingshot: the press snaps the ball, release throws. The arc shows where it lands; lead your receiver. Colored tags show who's open (green), tight (yellow) or covered (red). Keys 1–5 throw to that receiver.</li>
  <li><b>Run:</b> tap the glowing running back (H on a keyboard) to snap and hand off in one go. A plain tap just snaps; press on the QB and drag to scramble.</li>
  <li><b>With the ball:</b> drag to steer, flick sideways to juke, flick ahead to dive. Keys: arrows or WASD, Space to juke, X to dive.</li>
  <li><b>Kicks:</b> tap to lock the aim, tap again for power. Mind the wind.</li>
  <li>Between plays the clock runs; snap fast to save time, or call a timeout. The other team's drives are simulated.</li></ul>`;
const ICON = {
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10L5 10H2zM11 5h1v6h-1zM13 3h1v10h-1z" fill="currentColor"/></svg>',
  mute: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10L5 10H2zM11 6l1-1 1 1 1-1 1 1-1 1 1 1-1 1-1-1-1 1-1-1 1-1z" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4l1-1 4 4 4-4 1 1-4 4 4 4-1 1-4-4-4 4-1-1 4-4z" fill="currentColor"/></svg>'
};
const CSS = `
body.pb-open{overflow:hidden}
.pb{position:fixed;inset:0;z-index:1000;background:#0b0d10;color:#f4f4ee;font:10px/1.6 'Press Start 2P',ui-monospace,monospace;user-select:none;-webkit-user-select:none;overflow:hidden}
.pb button{font:inherit;color:inherit;cursor:pointer}
.pb-cv{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;touch-action:none;display:block}
.pb-hud{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);transform:translateX(-50%);display:grid;justify-items:center;gap:4px;pointer-events:none}
.pb-hud[hidden],.pb-tools[hidden]{display:none}
.pb-bug{display:flex;align-items:stretch;background:#101215;border:2px solid #000;box-shadow:0 0 0 2px #2c3138,0 4px 0 #000}
.pb-tm{display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--c);color:var(--k)}
.pb-tm img{width:18px;height:18px;image-rendering:pixelated;background:#fff;border-radius:50%;padding:1px}
.pb-tm b{font-size:10px}
.pb-tm span{font-size:14px;min-width:2ch;text-align:right;color:var(--k)}
.pb-mid{display:grid;justify-items:center;padding:3px 8px;min-width:64px;background:#000}
.pb-mid span{font-size:8px;color:#9aa4ae}
.pb-mid b{font-size:12px;font-weight:400}
.pb-mid b.run{color:#ffd84a}
.pb-dd{display:flex;gap:10px;background:rgba(0,0,0,.75);padding:4px 8px;font-size:8px;border:2px solid #000}
.pb-dd:empty{display:none}
.pb-to{color:#ffd84a;letter-spacing:1px}
.pb-tools{position:absolute;right:calc(env(safe-area-inset-right,0px) + 8px);top:calc(env(safe-area-inset-top,0px) + 8px);display:flex;gap:6px}
.pb-tools button{width:34px;height:34px;display:grid;place-items:center;background:#101215;border:2px solid #000;box-shadow:0 0 0 2px #2c3138}
.pb-tools svg{width:16px;height:16px;image-rendering:pixelated}
.pb-bar{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 34px);display:flex;justify-content:center;gap:8px;pointer-events:none}
.pb-bar button{pointer-events:auto;background:#101215;border:2px solid #000;box-shadow:0 0 0 2px #ffd84a,0 3px 0 #000;padding:8px 10px;font-size:9px;color:#ffd84a}
.pb-hint{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);text-align:center;font-size:8px;color:#fff;text-shadow:0 2px 0 #000,0 0 6px #000;pointer-events:none;opacity:.92}
.pb-banner{position:absolute;left:0;right:0;top:38%;display:grid;justify-items:center;gap:8px;pointer-events:none;opacity:0;transform:scale(.6)}
.pb-banner.on{animation:pbBan .35s steps(5) forwards}
.pb-banner b{font-size:clamp(20px,6vw,44px);font-weight:400;color:#fff;text-shadow:3px 3px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000;background:linear-gradient(transparent 20%,var(--bc) 20%,var(--bc) 80%,transparent 80%);padding:8px 18px;animation:pbBlink .5s steps(2) infinite}
.pb-banner span{font-size:10px;text-shadow:2px 2px 0 #000;background:#000;padding:4px 8px}
@keyframes pbBan{to{opacity:1;transform:none}}
@keyframes pbBlink{50%{filter:brightness(1.35)}}
/* Menus stay clear of the phone's status bar / notch and home bar (plus a little room), never under them. */
.pb{--pb-top:calc(env(safe-area-inset-top,0px) + 14px);--pb-bot:calc(env(safe-area-inset-bottom,0px) + 14px)}
.pb-modal{position:absolute;inset:0;display:none;place-items:center;background:rgba(5,7,10,.72);overflow:auto;
  padding:var(--pb-top) calc(env(safe-area-inset-right,0px) + 14px) var(--pb-bot) calc(env(safe-area-inset-left,0px) + 14px)}
.pb-modal.on{display:grid}
.pb-modal.light{background:transparent;pointer-events:none;align-items:end;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 70px)}
.pb-modal.light .pb-card{pointer-events:auto}
.pb-card,.pb-setup{background:#101215;border:2px solid #000;box-shadow:0 0 0 2px #2c3138,0 6px 0 #000;padding:18px;max-width:460px;width:100%;text-align:center;display:grid;gap:12px}
.pb-card h2{margin:0;font-size:18px;font-weight:400;color:#ffd84a;text-shadow:2px 2px 0 #000}
.pb-card p{margin:0;color:#c9d1d9;line-height:1.7}
.pb-btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.pb-btns.col{flex-direction:column}
.pb-go{background:#ffd84a;color:#111 !important;border:2px solid #000;box-shadow:0 4px 0 #000,inset -3px -3px 0 rgba(0,0,0,.2);padding:12px 16px;font-size:11px}
.pb-go:active{transform:translateY(3px);box-shadow:0 1px 0 #000}
.pb-go.alt{background:#2c3138;color:#f4f4ee !important}
.pb-go[hidden],.pb-dres[hidden],.pb-dsub[hidden],.pb-toss[hidden]{display:none}
.pb-setup{max-width:560px;text-align:left;position:relative;max-height:calc(100dvh - var(--pb-top) - var(--pb-bot));overflow:auto}
.pb-x{position:absolute;right:10px;top:10px;width:32px;height:32px;display:grid;place-items:center;background:#2c3138;border:2px solid #000}
.pb-x svg{width:14px;height:14px}
.pb-logo{margin:4px 0 2px;padding:0 36px;text-align:center;font-size:clamp(14px,4.4vw,30px);font-weight:400;line-height:1.05;display:grid;color:#ffd84a;text-shadow:3px 3px 0 #b5470f,6px 6px 0 #000}
.pb-logo span + span{color:#fff;font-size:1.7em;margin-top:6px;text-shadow:3px 3px 0 #2f6e34,6px 6px 0 #000}
.pb-match{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:stretch}
.pb-team{display:grid;justify-items:center;gap:6px;padding:12px 8px;background:var(--c);color:var(--k) !important;border:2px solid #000;box-shadow:0 4px 0 #000,inset 0 0 0 2px rgba(255,255,255,.15);text-align:center}
.pb-team img{width:44px;height:44px;background:#fff;border-radius:50%;padding:3px;image-rendering:auto}
.pb-team b{font-size:10px;font-weight:400;line-height:1.4}
.pb-team small{font-size:7px;opacity:.85;background:rgba(0,0,0,.35);color:#fff;padding:2px 5px}
.pb-rt{font-size:7px;opacity:.9}
.pb-vs{align-self:center;background:none;border:0;display:grid;justify-items:center;gap:4px;font-size:12px;color:#ffd84a !important}
.pb-vs i{font-style:normal;font-size:14px;color:#9aa4ae}
.pb-opt{display:grid;gap:6px}
.pb-opt > span{font-size:8px;color:#9aa4ae;text-transform:uppercase}
.pb-seg{display:flex;flex-wrap:wrap;gap:6px}
.pb-seg button{flex:1 1 0;min-width:max-content;background:#1b1f24;border:2px solid #000;box-shadow:0 3px 0 #000;padding:9px 8px;font-size:8px}
.pb-seg button[aria-pressed="true"]{background:#ffd84a;color:#111}
.pb-checks{display:grid;gap:8px;font-size:8px;color:#c9d1d9}
.pb-checks label{display:flex;align-items:center;gap:8px;cursor:pointer}
.pb-checks input{width:16px;height:16px;accent-color:#ffd84a}
.pb-setup .pb-go{justify-self:stretch;font-size:14px;padding:14px}
.pb-rec{text-align:center;font-size:8px;color:#9aa4ae;margin:0}
.pb-how{font-size:8px;color:#c9d1d9;line-height:1.9}
.pb-how summary{cursor:pointer;color:#ffd84a}
.pb-how ul{margin:8px 0 0;padding-left:16px;display:grid;gap:6px}
.pb-how b{color:#fff;font-weight:400}
.pb-picker{gap:10px}
.pb-ph{display:flex;align-items:center;justify-content:space-between;min-height:32px}
.pb-ph b{font-weight:400;font-size:12px;color:#ffd84a}
.pb-ph .pb-x{position:static}
.pb-q{font:inherit;font-size:16px;padding:10px;background:#0b0d10;color:#fff;border:2px solid #2c3138;width:100%;box-sizing:border-box;font-family:system-ui,sans-serif}
.pb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;max-height:min(55dvh,520px);overflow:auto;padding-right:2px}
.pb-list button{display:flex;align-items:center;gap:8px;padding:7px 8px;background:#1b1f24;border:2px solid #000;border-left:6px solid var(--c);text-align:left;font-size:8px;line-height:1.4}
.pb-list button[hidden]{display:none}
.pb-list img,.pb-list i{width:22px;height:22px;flex:none;image-rendering:auto}
.pb-coin{width:56px;height:56px;margin:0 auto;perspective:200px}
.pb-coin i{display:block;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3b0,#e2b33c 60%,#a8781c);border:3px solid #000;animation:pbFlip .3s linear 4}
@keyframes pbFlip{50%{transform:rotateY(90deg) translateY(-14px)}100%{transform:rotateY(180deg)}}
.pb-drive{text-align:center}
.pb-dh{display:flex;align-items:center;justify-content:center;gap:8px}
.pb-dh img{width:28px;height:28px;background:#fff;border-radius:50%;padding:2px}
.pb-dh b{font-weight:400;font-size:12px}
.pb-dh span{font-size:7px;color:#9aa4ae}
.pb-strip{position:relative;height:30px;border:2px solid #000;background:repeating-linear-gradient(90deg,#3d8b39 0 10%,#459a40 10% 20%);margin:4px 8%}
.pb-strip::before,.pb-strip::after{content:"";position:absolute;top:0;bottom:0;width:9%}
.pb-strip::before{right:100%;background:var(--me)} .pb-strip::after{left:100%;background:var(--op)}
.pb-mark{position:absolute;top:50%;width:10px;height:8px;margin:-4px 0 0 -5px;background:#8b4a1c;border:2px solid #000;border-radius:50%;transition:left .2s steps(3)}
.pb-dres{font-size:16px;text-shadow:2px 2px 0 #000}
.pb-dsub{font-size:8px;color:#9aa4ae}
.pb-score{display:flex;justify-content:center;gap:6px}
.pb-sl{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--c);color:var(--k);border:2px solid #000}
.pb-sl img{width:20px;height:20px;background:#fff;border-radius:50%;padding:1px}
.pb-sl b{font-weight:400}
.pb-sl span{font-size:16px}
.pb-score.big .pb-sl span{font-size:22px}
.pb-stat{font-size:8px}
.pb-tbl{width:100%;border-collapse:collapse;font-size:8px;text-align:left}
.pb-tbl td{padding:5px 4px;border-bottom:2px solid #1b1f24}
.pb-tbl td:first-child{color:#9aa4ae;white-space:nowrap}
.pb-4th{max-width:380px}
.pb-bar .pb-call{color:#fff;box-shadow:0 0 0 2px #7df9ff,0 3px 0 #000}
.pb-calls{max-width:620px;text-align:left;gap:8px;padding:12px}
.pb-calls .pb-sub{text-align:center}
.pb-callrow{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin;overscroll-behavior-x:contain}
.pb-callrow button{flex:none;width:132px;display:grid;gap:3px;align-content:start;padding:4px 4px 7px;background:#2f6e34;border:2px solid #000;color:#ffd84a;text-align:left}
.pb-callrow button b{font-weight:400;font-size:8px;color:#fff;padding:0 3px}
.pb-callrow button small{font-size:6px;line-height:1.5;color:#cfe8b0;padding:0 3px}
.pb-callrow button[aria-pressed="true"]{box-shadow:0 0 0 2px #ffd84a;background:#3d8b39}
.pb-callrow svg{display:block;width:100%;height:auto}
.pb-callrow .los{stroke:rgba(255,255,255,.45);stroke-width:1;stroke-dasharray:3 3}
.pb-callrow .dot{fill:#fff} .pb-callrow .ol{fill:#c9d1d9} .pb-callrow .qb{fill:#9aa4ae}
.pb-callrow .q{fill:#fff;font:7px 'Press Start 2P',monospace;text-anchor:middle}
.pb-grade{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 86px);transform:translate(-50%,-6px);display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center;
  min-width:220px;padding:8px 12px;background:rgba(16,18,21,.94);border:2px solid #000;box-shadow:0 0 0 2px #2c3138,0 4px 0 #000;pointer-events:none;opacity:0;transition:opacity .2s,transform .2s}
.pb-grade.on{opacity:1;transform:translate(-50%,0)}
.pb-gl{grid-row:1/3;font:400 26px/1 'Press Start 2P',monospace;text-shadow:2px 2px 0 #000}
.pb-gw{display:grid;gap:3px}
.pb-gw em{font-style:normal;font-size:9px;color:#fff}
.pb-gw span{font-size:7px;color:#9aa4ae}
.pb-gbars{grid-column:1/-1;display:grid;gap:3px;margin-top:2px}
.pb-gb{display:grid;grid-template-columns:62px 1fr;align-items:center;gap:6px;font-size:6px;color:#9aa4ae}
.pb-gb i{display:block;height:5px;background:#2c3138}
.pb-gb i b{display:block;height:100%}
.pb-lastp{color:#c9d1d9}
.pb-sess{max-width:400px;gap:10px}
.pb-sk{font-size:8px;color:#9aa4ae;text-transform:uppercase}
.pb-sg{display:flex;align-items:baseline;justify-content:center;gap:12px}
.pb-sg b{font:400 46px/1 'Press Start 2P',monospace;text-shadow:3px 3px 0 #000}
.pb-sg span{font-size:18px;color:#fff} .pb-sg small{font-size:8px;color:#9aa4ae}
.pb-pb{margin:0;color:#ffd84a !important;font-size:9px;animation:pbBlink .5s steps(2) infinite}
.pb-ss{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.pb-ss div{display:grid;gap:4px;background:#1b1f24;border:2px solid #000;padding:6px 2px}
.pb-ss b{font-weight:400;font-size:11px;color:#fff} .pb-ss span{font-size:6px;color:#9aa4ae}
.pb-gbars.wide .pb-gb{grid-template-columns:62px 1fr 22px;font-size:7px}
.pb-gb em{font-style:normal;color:#fff;text-align:right}
.pb-go.sm{font-size:8px;padding:9px 10px}
.pb-go.danger{color:#ff8a80 !important}
.pb-hist{display:grid;gap:4px;margin-top:4px}
.pb-hh{font-size:8px;color:#9aa4ae;text-transform:uppercase;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pb-hh small{text-transform:none;color:#c9d1d9;font-size:7px}
.pb-hr{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:8px;background:#1b1f24;border:2px solid #000;padding:6px 6px 6px 8px}
.pb-hr.best{box-shadow:inset 0 0 0 1px #ffd84a}
.pb-hr > b{font:400 13px/1 'Press Start 2P',monospace}
.pb-hr div{display:grid;gap:4px;min-width:0}
.pb-hr span{font-size:7.5px;color:#fff}
.pb-hr small{font-size:6px;color:#9aa4ae;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb-hr button{background:#2c3138;border:2px solid #000;color:#ff8a80;font-size:8px;padding:6px 7px;min-width:28px}
.pb-nohist{text-align:center}
.pb-best{font-style:normal;color:#111;background:#ffd84a;padding:1px 3px;margin-right:5px;font-size:6px}
.pb-menu2{flex-wrap:nowrap}
.pb-menu2 .pb-go{flex:1 1 0}
.pb-tabs button{font-size:7.5px;padding:8px 6px}
.pb-empty{padding:18px 8px;white-space:normal;text-align:center;flex:1}
.pb-name{font:inherit;font-size:16px;font-family:'Press Start 2P',monospace}
.pb-ename-err{color:#ff8a80 !important;margin-top:-6px}
.pb-pbl{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px}
.pb-pbc{display:grid;gap:5px;padding:4px 4px 6px;background:#2f6e34;border:2px solid #000;color:#ffd84a}
.pb-pbc b{font-weight:400;font-size:8px;color:#fff;padding:0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pb-pbc div{display:flex;gap:4px}
.pb-pbc div button{flex:1;background:#1b1f24;border:2px solid #000;font-size:7px;padding:6px 2px;color:#fff}
.pb-pbc div button.del{color:#ff8a80}
.pb-pbc svg,.pb-pbc .los{display:block;width:100%;height:auto}
.pb-pbc .los{stroke:rgba(255,255,255,.45);stroke-width:1;stroke-dasharray:3 3}
.pb-pbc .dot{fill:#fff} .pb-pbc .ol{fill:#c9d1d9} .pb-pbc .qb{fill:#9aa4ae}
.pb-pbc .q{fill:#fff;font:7px 'Press Start 2P',monospace;text-anchor:middle}
.pb-practice{gap:12px}
.pb-sub{margin:0;font-size:8px;color:#9aa4ae;line-height:1.8}
.pb-form{border:2px solid #000;color:#ffd84a;background:#101215}
.pb-form p{margin:0;padding:6px 8px;font-size:7.5px;color:#c9d1d9;border-top:2px solid #000}
.pb-form .tag{fill:#fff;font:5px 'Press Start 2P',monospace;text-anchor:middle}
.pb-form .tag.dim{fill:rgba(255,255,255,.55)}
.pb-form .tag.q{fill:#111;font-size:5.5px}
.pb-form svg,.pb-concepts svg{display:block;width:100%;height:auto}
.pb-form .los,.pb-concepts .los,.pb-rchips .los{stroke:rgba(255,255,255,.45);stroke-width:1;stroke-dasharray:3 3}
.pb-form .dot,.pb-concepts .dot,.pb-rchips .dot{fill:#fff}
.pb-form .ol,.pb-concepts .ol{fill:#c9d1d9}
.pb-form .qb,.pb-concepts .qb{fill:#9aa4ae}
.pb-form .q,.pb-concepts .q{fill:#fff;font:7px 'Press Start 2P',monospace;text-anchor:middle}
.pb-concepts{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
.pb-concepts button{display:grid;gap:4px;padding:4px 4px 6px;background:#2f6e34;border:2px solid #000;color:#ffd84a;font-size:8px}
.pb-concepts button span{color:#fff}
.pb-concepts button[aria-pressed="true"]{box-shadow:0 0 0 2px #ffd84a}
.pb-rrow{display:grid;gap:4px}
.pb-rrow > span{font-size:8px;color:#9aa4ae}
.pb-rchips{display:flex;gap:5px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin;overscroll-behavior-x:contain}
.pb-rchips button{flex:none;display:grid;justify-items:center;gap:2px;width:54px;padding:4px 2px;background:#2f6e34;border:2px solid #000;color:#ffd84a}
.pb-rchips button svg{width:40px;height:42px}
.pb-rchips button small{font-size:6.5px;color:#fff}
.pb-rchips button[aria-pressed="true"]{box-shadow:0 0 0 2px #ffd84a;background:#3d8b39}
.pb-rq{display:grid;place-items:center;width:40px;height:42px;font-size:16px;font-weight:400;color:#fff}
@media (max-width:440px){.pb-hud{left:calc(env(safe-area-inset-left,0px) + 8px);transform:none;justify-items:start}}
@media (max-width:520px){.pb-tm{padding:4px 6px}.pb-tm img{display:none}.pb-mid{min-width:54px}.pb-team b{font-size:8px}.pb-team img{width:36px;height:36px}.pb-hint{font-size:7px}}
`;
