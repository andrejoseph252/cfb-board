/* Coach Andre's Bowl: an arcade football game in the spirit of the retro mobile classics. Pick your team and an opponent
   (any FBS teams, in their colors, with strength from ESPN's FPI), then play offense: drag back and release to
   throw, hand off, juke and dive, kick field goals. The other team's drives are simulated between yours.
   Opened full screen at #play; loaded on demand so it costs nothing until then. */
import { esc, store } from '../util.js';
import { state } from '../state.js';
import * as api from '../api.js';
import { myTeam } from '../myteam.js';
import { logoUrl as boardLogo } from '../views/components.js';
// The game sets logos on white discs and team-color tiles: always the regular (light-background) versions.
const logoUrl = (src, px) => boardLogo(src, px, 'light');
import { inkOn } from '../views/preview.js';
import * as S from './sim.js';
import { attachNames } from './names.js';
import { weekChallenges, challengeById } from '../challenges.js';
import { createRenderer } from './draw.js';
import { initAudio, setSound, soundOn, sfx, resume, crowd } from './sfx.js';
import * as SV from './seasonview.js';
import * as SC from './scout.js';

const STEP = 1 / 60;
// Win-loss records live under `results` (an older `record` field also counted unfinished test games, so it's dropped).
const saved = { diff: 'pro', len: 'standard', sound: true, routes: true, ...store.get('pixelbowl', {}) };
delete saved.record; saved.results ||= {};
/* Every visit starts fresh: Rookie, Quick quarters, and a three-receiver random drill from your own 25 (sound and
   the route preview, and HD graphics, are the only choices kept). */
const PRACTICE_DEFAULTS = { count: 3, mode: 'random', concept: 'verts', routes: {}, spot: 25, session: 'quick', target: 'on', side: 'offense', ddrill: 'cover' };
/* A practice session is a set number of throws (handoffs don't count); finished sessions are saved to history. */
const SESSIONS = { quick: { name: 'Quick', n: 5 }, normal: { name: 'Normal', n: 10 }, long: { name: 'Long', n: 20 } };
saved.sessions = Array.isArray(saved.sessions) ? saved.sessions : [];
delete saved.lastPractice;
/* Your own plays (My Playbook): kept for good, unlike the per-visit settings. */
saved.plays = Array.isArray(saved.plays) ? saved.plays : [];
const findPlay = id => saved.plays.find(p => p.id === id);
// Your difficulty is kept from last time (Rookie the very first time); quarters and practice start fresh.
const freshSettings = () => { if (!S.DIFFS[saved.diff]) saved.diff = 'rookie'; saved.len = 'quick'; saved.practice = { ...PRACTICE_DEFAULTS, routes: {} }; };
freshSettings();
const save = () => store.set('pixelbowl', saved);
const coarse = () => matchMedia('(pointer: coarse)').matches;
const ord = n => ['1ST', '2ND', '3RD', '4TH'][n - 1] || `${n}TH`;
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const yardLine = x => { x = Math.round(x); return x === 50 ? 'MIDFIELD' : x < 50 ? `OWN ${x}` : `OPP ${100 - x}`; };
const hypot = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- teams ---------- */
/* Every team's colors, name and logo: from data/teams.json (scripts/teams.py), since ESPN's team list can't be read
   from a web page; straight from ESPN only if that file is missing. Without either, a team not on this week's slate
   would play in gray. */
let colors = null;
async function loadColors(){
  try{
    const r = await fetch('data/teams.json');
    if (r.ok){ colors = await r.json(); return; }
  }catch{}
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
/* The teams you can pick: FBS, from the standings (the color table also covers every other division, for opponents
   on a schedule, so it's the list only when the standings haven't loaded). */
function allTeams(){
  const ids = new Set(Object.keys(state.standings?.byTeam || {}).length ? Object.keys(state.standings.byTeam) : Object.keys(colors || {}));
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

/* The next step of the game's flow, a beat later: held while the game is paused (so nothing happens behind the pause
   menu), dropped if the game was left or restarted. */
function later(fn, ms){
  const g0 = G;
  setTimeout(function run(){ if (!root || G !== g0) return; if (paused) return setTimeout(run, 150); fn(); }, ms);
}

/* ---------- season mode (screens in seasonview.js) ---------- */
const seasonCtx = {
  saved, save: () => save(), icon: null,
  modal(html){ phase = 'setup'; paused = false; showHud(false); modal(html); },
  teamInfo: id => teamInfo(id), allTeams: () => allTeams(),
  /* The live field behind the season screens: your team against whoever's next. */
  backdrop(me, opp){
    const t = x => withImage(typeof x === 'string' ? teamInfo(x) : { ...x });
    const m = t(me); let o = opp ? t(opp) : null;
    if (!o){ const d = defaults(null).opp; o = withImage(teamInfo(d === m.id ? '61' : d)); }
    G = S.newGame(m, o, saved.diff, saved.len); S.setupPlay(G); R.snapCamera(G); phase = 'setup'; paused = false; showHud(false);
  },
  play(cfg){ closeModal(); startGame(cfg); },
  final(html, won){ phase = 'final'; showHud(true); sfx(won ? 'td' : 'boo'); if (won) G.cheer = 6; modal(html); },
  /* A game-week drill: a quick passing session or the cover drill; its grade goes back to game week. */
  drill(area, me, opp){
    initAudio(saved.sound);
    pick = { me: String(me), opp: String(opp) };
    saved.practice = { ...PRACTICE_DEFAULTS, routes: {}, session: 'quick', side: area === 'def' ? 'defense' : 'offense', ddrill: 'cover' };
    if (area === 'def') startDefDrill();
    else { G = S.newGame(withImage(teamInfo(me)), withImage(teamInfo(opp)), saved.diff, saved.len); startPractice(); }
    G.seasonDrill = { area };
  }
};
/* A finished game-week drill: one way out, back to practice with the grade. */
function seasonDrillCard(avg){
  G.seasonDrill.score = avg;
  for (const x of root.querySelectorAll('.pb-sess .pb-btns')) x.remove();
  const m = SC.drillMult(avg).toFixed(2);
  $('.pb-sess')?.insertAdjacentHTML('beforeend', `<p class="pb-sub">This week's ${G.seasonDrill.area === 'def' ? 'defense' : 'passing'} practice counts ×${m}</p><button class="pb-go" type="button" data-pb="sdrill">BACK TO GAME WEEK ▶</button>`);
}

/* ---------- open / close ---------- */
export function open({ prefill = null, exit = () => {} } = {}){
  onExit = exit; openPrefill = prefill; waitingData = !(state.standings && colors);
  if (!root) freshSettings();
  const chal = prefill?.challenge ? challengeById(prefill.challenge) : null;
  if (Array.isArray(prefill) === false) prefill = null;
  if (root){ if (chal) startChallenge(chal); else if (prefill && phase === 'setup'){ pick = defaults(prefill); setup(); } return; }
  seasonCtx.icon = ICON; SV.init(seasonCtx);
  if (!document.getElementById('pb-font')){
    const l = Object.assign(document.createElement('link'), { id: 'pb-font', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Big+Shoulders+Display:wght@700;800;900&display=swap' });
    document.head.append(l);
  }
  if (!document.getElementById('pb-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'pb-css', textContent: CSS + SV.CSS }));
  root = document.createElement('div');
  root.className = 'pb'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', "Coach Andre's Bowl");
  root.innerHTML = `<canvas class="pb-cv"></canvas>
    <div class="pb-hud" hidden><div class="pb-bug"></div><div class="pb-dd"></div><div class="pb-pbp" aria-live="polite"></div></div>
    <div class="pb-tools" hidden><button type="button" data-pb="pause" aria-label="Pause">${ICON.pause}</button><button type="button" data-pb="sound" aria-label="Sound">${saved.sound ? ICON.sound : ICON.mute}</button></div>
    <button class="pb-jump" type="button" hidden aria-label="Jump the route">JUMP</button>
    <button class="pb-rp" type="button" hidden aria-label="Watch the replay">▶ REPLAY</button><div class="pb-rlabel" aria-hidden="true">REPLAY</div>
    <div class="pb-moves" hidden><button class="pb-mv" type="button" data-mv="juke" aria-label="Juke">JUKE</button><button class="pb-mv" type="button" data-mv="truck" aria-label="Truck">TRUCK</button></div>
    <div class="pb-bar"></div><div class="pb-hint"></div><div class="pb-banner"></div><div class="pb-grade" aria-live="polite"></div><div class="pb-modal"></div>`;
  document.body.append(root); document.body.classList.add('pb-open');
  canvas = $('.pb-cv'); R = createRenderer(canvas); R.resize();
  if (saved.hd) useHD(true);
  // Re-measure whenever the canvas's displayed size changes (phone toolbars, rotation, a late first layout).
  if (window.ResizeObserver){ sizeWatch = new ResizeObserver(() => R?.resize()); sizeWatch.observe(canvas); }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel);
  // Its own button, so a press on the field only ever steers; a second thumb can hit it mid-drag.
  $('.pb-jump').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); resume(); jumpRoute(); });
  $('.pb-rp').addEventListener('click', e => { e.stopPropagation(); startReplay(); });
  canvas.addEventListener('pointerdown', () => { if (phase === 'replay') endReplay(); });   // tap to skip the replay
  // With the ball: moves on their own buttons, so a press on the field only ever steers.
  $('.pb-moves').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-mv]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); resume();
    if (!carrierLive()) return;
    if (b.dataset.mv === 'juke') input.juke = Math.sign(input.carStick?.y || 0) || 1; else input.truck = true;
  });
  root.addEventListener('click', onClick); root.addEventListener('input', onInput);
  window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize); window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  document.addEventListener('visibilitychange', onHide);
  pick = defaults(prefill);
  setup();
  // Opened from a game's "Play this moment": straight to that challenge once team colors are in.
  loadColors().then(() => { if (!root) return; if (chal) startChallenge(chal); else if (phase === 'setup' && !document.querySelector('.sz-hub,.sz-gw,.sz-new,.sz-load')) setup(); });
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

/* HD graphics (beta): a second renderer with the same interface (drawhd.js) and its interface (hdui.js: the `hd`
   class on the game restyles it, and the templates ask hdUI for the pieces that differ), loaded only once it's
   switched on and swapped in on the spot, mid-game included. */
let hdMod = null, hdUI = null;
const hdOn = () => !!(root?.classList.contains('hd') && hdUI);
async function useHD(on){
  if (on && !hdMod){ try{ [hdMod, hdUI] = await Promise.all([import('./drawhd.js'), import('./hdui.js')]); }catch{ return; } }
  if (!root) return;
  if (hdUI && !document.getElementById('pb-hd-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'pb-hd-css', textContent: hdUI.CSS }));
  root.classList.toggle('hd', on && !!hdMod);
  lastHud = '';   // redraw the HUD in the new style
  if (!!R?.hd === (on && !!hdMod)) return;
  R = (on ? hdMod.createRenderer : createRenderer)(canvas); R.resize();
  if (G) R.snapCamera(G);
}

/* Local testing only: lets a script advance the game without animation frames (which background tabs don't get). */
if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__pb = {
  get G(){ return G; }, get R(){ return R; }, get phase(){ return phase; }, get paused(){ return paused; }, input,
  tick(sec){ for (let i = 0; i < sec * 60; i++){ if (!paused && G){ update(STEP); drain(); } } hud(); }
};

function onResize(){ R?.resize(); }
function onHide(){ if (document.hidden && G && !paused && ['presnap', 'live', 'dead', 'kick'].includes(phase)) pause(); }

/* ---------- main loop ---------- */
let waitingData = true, freeze = 0;
function loop(ts){
  raf = requestAnimationFrame(loop);
  R.resize();   // cheap when nothing changed; catches any size change the observer missed
  // Opened straight to #play before the board's team data arrived: fill in the real teams once it does.
  if (waitingData && state.standings && colors){ waitingData = false; if (phase === 'setup' && !document.querySelector('.sz-hub,.sz-gw,.sz-new,.sz-load') && (G?.me.name === 'Team' || G?.me.color === '#5a6470')){ pick = defaults(openPrefill); setup(); } }
  const dt = Math.min(.05, last ? (ts - last) / 1000 : 0); last = ts;
  if (freeze > 0){ freeze -= dt; acc = 0; }
  else if (!paused && G){ acc += dt * (phase === 'live' && coaching() ? 1.5 : 1); while (acc >= STEP){ update(STEP); acc -= STEP; } }
  if (G && !paused && phase !== 'setup') crowd(crowdLevel()); else crowd(0);
  const cover = G?.youDefend && G.defDrill?.kind === 'cover';
  if (G) R.draw(G, paused ? 0 : dt, { aim: aim?.active ? aim.target : null, routes: phase === 'presnap' && saved.routes && !G.youDefend, rush: rushView(),
    stick: (cover || ptr?.mode === 'cstick') && ptr?.stick || null, landing: cover && phase === 'live' ? S.JUMP_R : 0,
    handoff: !aim?.active && !G.play?.target && !G.youDefend && (phase === 'presnap' && !G.kick && !G.play?.noHandoff || phase === 'live' && S.canHandoff(G)),
    readKey: phase === 'live' && G.play?.option && !G.play.carrier ? G.play.option.key : null });
  if (G) drain();
  hud(); syncJump(); syncMoves(); syncReplay();
}

function update(dt){
  G.cheer = Math.max(0, (G.cheer || 0) - dt);
  readKeys();
  if (phase === 'presnap'){
    if (!S.tickRunoff(G, dt)) clockOut();
  } else if (phase === 'dpre'){
    defPreSnap(dt);
  } else if (phase === 'live'){
    if (!G.ot && !G.practice && !G.youDefend) S.useClock(G, dt);
    if (G.youDefend) defLive(dt);
    S.step(G, dt, coaching() ? S.coachInput(G) : input);
    input.juke = 0; input.dive = false; input.jump = false; input.truck = false;
    if (!G.youDefend && !G.practice) recordFrame();
    if (G.youDefend && G.defDrill.kind === 'rush' && G.play.thrown && !G.play.result) S.stopPlay(G, { type: 'released' });
    if (aim && !S.canThrow(G)) aim = null;
    if (G.play.result) playOver();
  } else if (phase === 'replay'){
    replayStep(dt);
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
    else if (e.type === 'hitstop') freeze = Math.max(freeze, e.s);   // a big hit: the game holds for a beat
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
  const hp = hdOn() ? hdUI.cards.pair(me, opp) : null;   // HD: the two cards' colors kept apart
  const rec = saved.results[saved.diff], card = (t, who, act) => `<button class="pb-team" type="button" data-pb="${act}" data-tid="${esc(t.id)}" style="${hp ? hp[t === me ? 0 : 1] : `--c:${esc(t.color)};--k:${inkOn(t.color)}`}">
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
      <label><input type="checkbox" data-pb-opt="sound"${saved.sound ? ' checked' : ''}> Sound</label>
      <label><input type="checkbox" data-pb-opt="hd"${saved.hd ? ' checked' : ''}> HD graphics (beta)</label></div>
    ${SV.menuCard()}
    <button class="pb-go" type="button" data-pb="start">KICK OFF</button>
    <button class="pb-go pb-take" type="button" data-pb="challenges"><span>TAKE OVER</span><small>Replay this week's real late-game moments</small></button>
    <div class="pb-btns pb-menu2"><button class="pb-go alt" type="button" data-pb="practice">PRACTICE</button><button class="pb-go alt" type="button" data-pb="playbook">MY PLAYBOOK</button></div>
    ${rec ? `<p class="pb-rec">Your record on ${S.DIFFS[saved.diff].name}: ${rec.w}–${rec.l}</p>` : ''}
    <details class="pb-how"><summary>How to play</summary>${HOW}</details>
  </div>`);
  if (saved.hd && !hdOn()) waitHD();
}
/* HD's look arrives a moment after the menu first draws: redraw the menu once it's in, where it was scrolled to. */
let hdWait = 0;
function waitHD(){
  if (hdWait) return;
  let n = 0;
  hdWait = setInterval(() => { if (hdOn() || ++n > 50 || !root){ clearInterval(hdWait); hdWait = 0; if (hdOn()) hdRepaint(); } }, 100);
}
function hdRepaint(){
  if (!root || phase !== 'setup' || !$('.pb-match')) return;
  const y = $('.pb-setup')?.scrollTop || 0;
  setup();
  const el = $('.pb-setup'); if (el){ el.style.animation = 'none'; el.scrollTop = y; }
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
function startGame(cfg = null){
  if (!cfg){ saved.lastMe = pick.me; saved.lastOpp = pick.opp; save(); }
  initAudio(saved.sound);
  if (cfg){
    // A season game: your game plan, practice and freshness ride along (mods), and maybe coach mode.
    G = S.newGame(withImage({ ...cfg.me }), withImage({ ...cfg.opp }), cfg.diff, cfg.len);
    Object.assign(G, { season: { gid: cfg.gid }, seasonCfg: cfg, mods: cfg.mods, coach: !!cfg.coach, scout: cfg.scout, recommended: cfg.recommended, coachSnaps: 0, playSnaps: 0 });
    if (cfg.me.names) G.me.names = cfg.me.names;
  } else G = S.newGame(G.me, G.opp, saved.diff, saved.len);
  attachNames(G.me, G.opp);
  snaps = 0;
  showHud(true);
  // Coin toss.
  const meWins = Math.random() < .5;
  phase = 'modal';
  // A pixel gold coin, flipped end over end as it goes up, landing on the winner's face: you have heads, they have tails.
  const call = (t, side, win) => `<div class="pb-ccall${win ? ' win' : ''}" data-tid="${esc(t.id)}" style="--c:${esc(t.color)};--k:${inkOn(t.color)}">${t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="">` : ''}<b>${esc(t.abbr)}</b><small>${side}</small></div>`;
  modal(`<div class="pb-card pb-tosscard" style="--d:${meWins ? 1.6 : 1.76}s;--n:${meWins ? 5 : 5.5}"><h2>COIN TOSS</h2>
    <div class="pb-cstage"><div class="pb-cshad"></div><div class="pb-ccoin"><div class="pb-cspin">${pixelCoin('heads', 'h')}${pixelCoin('tails', 't')}</div><i class="pb-cshine"></i></div><i class="pb-cspark"></i></div>
    <div class="pb-ccalls">${call(G.me, 'HEADS', meWins)}${call(G.opp, 'TAILS', !meWins)}</div>
    <p class="pb-toss pb-wait">${meWins ? `${esc(G.me.name)} won the toss and will receive.` : `${esc(G.opp.name)} won the toss and will receive.`}</p>
    <button class="pb-go pb-wait" type="button" data-pb="toss">${meWins ? 'RECEIVE' : 'KICK OFF'}</button></div>`);
  sfx('kick');
  later(() => { for (const el of root.querySelectorAll('.pb-tosscard .pb-wait')) el.classList.remove('pb-wait'); sfx('whistle'); }, 1900);
  G.firstHalfReceiver = meWins ? 'me' : 'opp';
}
/* A 16x16 pixel gold coin: dark outline, a rim lit from the top left, a shaded face with a glint, and an emblem
   (a star for heads, a football for tails): raised parts (#) catch the light with a shadow under them, engraved
   lines (x) are cut dark. Runs of one color are merged into single rects. */
const EMBLEM = {
  heads: ['....##....', '....##....', '...####...', '##########', '.########.', '..######..', '..######..', '.###..###.', '.##....##.', '..........'],
  tails: ['..........', '..........', '..######..', '.##x#x#x#.', '#xxxxxxxx#', '.##x#x#x#.', '..######..', '..........', '..........', '..........']
};
function pixelCoin(face, cls){
  const E = EMBLEM[face], at = (x, y) => E[y - 3]?.[x - 3], c = 7.5, rows = [];
  for (let y = 0; y < 16; y++){
    const row = [];
    for (let x = 0; x < 16; x++){
      const d = Math.hypot(x - c, y - c), diag = (x - c) + (y - c), e = at(x, y);
      let col = null;
      if (d > 7.9) col = null;
      else if (d > 6.9) col = '#3d2803';
      else if (d > 5.9) col = diag < 0 ? '#ffe27a' : '#a8730f';
      else if (e === '#') col = '#fffbe0';
      else if (e === 'x') col = '#8a5a06';
      else if (at(x - 1, y - 1) === '#') col = '#9a6608';
      else col = (x - 5) ** 2 + (y - 4.5) ** 2 < 2.2 ? '#fffbe0' : diag > 4.5 ? '#d9a12a' : '#f5c542';
      row.push(col);
    }
    rows.push(row);
  }
  let rects = '';
  rows.forEach((row, y) => { for (let x = 0; x < 16;){ const col = row[x]; let w = 1; while (x + w < 16 && row[x + w] === col) w++; if (col) rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${col}"/>`; x += w; } });
  return `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${rects}</svg>`;
}
function afterToss(){
  closeModal();
  if (G.firstHalfReceiver === 'me') kickoffToMe(); else oppDrive(kickoffYtg());
}
const kickoffYtg = () => Math.random() < .8 ? 75 : Math.round(60 + Math.random() * 20);
function kickoffToMe(){ startMyDrive(Math.random() < .8 ? 25 : Math.round(18 + Math.random() * 22)); }

function startMyDrive(x){
  S.startDrive(G, x); newDrive(); R.snapCamera(G); presnap();
}
/* Your drive, play by play (with real names), shown at the top of the next card: the opponent's drive, halftime or
   the final. */
function newDrive(){ G.drive = { start: G.los, log: [], plays: 0, result: null }; }
function driveLog(line, play = false){ if (G.drive && line){ G.drive.log.push(line); if (play) G.drive.plays++; } }
function endDrive(result, endX = G.los){
  const d = G.drive; if (!d || d.result) return;
  d.result = result; d.yds = Math.round(endX - d.start); G.lastDrive = d;
}
function driveRecap(){
  const d = G.lastDrive; if (!d || d.shown || !d.log.length) return '';
  d.shown = true;
  return `<div class="pb-recap"><div class="pb-rh"><b>YOUR DRIVE</b><span>${d.plays} play${d.plays === 1 ? '' : 's'} · ${d.yds} yds · ${esc(d.result)}</span></div>
    <ol class="pb-rlist">${d.log.map(l => `<li>${esc(l)}</li>`).join('')}</ol></div>`;
}
/* Film study (season): before some snaps you can read what they're in. */
function filmTell(){
  const P = G.play; if (!P) return '';
  if (P.blitz) return 'FILM: BLITZ LOOK';
  return /0|1|Man/.test(P.coverage || '') ? 'FILM: MAN' : 'FILM: ZONE';
}
function presnap(){
  if (!G.ot && G.clock <= 0) return clockOut();
  G.call = null; G.callRoutes = null; G.pa = false;   // a called play is for one snap; every play starts back on Random (the formation stays)
  S.setupPlay(G); phase = 'presnap'; aim = null; resetInput();
  G.tellOn = !!G.mods?.tells && !G.twoPt && Math.random() < G.mods.tells;
  if (G.down === 4 && !G.twoPt) fourthDown();
}
function doSnap(){
  if (phase !== 'presnap') return;
  closeModal();
  // Now and then a lineman jumps: 5 yards back, no play.
  if (!G.practice && !G.twoPt && !G.challenge?.noFlags && Math.random() < .01){
    sfx('whistle'); banner('FLAG · FALSE START', '5 yards, replay the down', '#ffd84a', 1500); driveLog('Flag: false start, 5 yards');
    G.los = Math.max(1, G.los - 5); G.toGo = Math.min(Math.round(100 - G.los), G.toGo + 5); G.runoff = 0; S.setupPlay(G); return;
  }
  G.runoff = 0; snaps++;
  S.snap(G); phase = 'live';
  if (S.RUN_CALLS[G.call]) S.startRun(G, G.call);
}

function playOver(){
  const r = G.play.result;
  if (G.season && !G.youDefend){ if (G.coach && !G.play.userCtl) G.coachSnaps++; else G.playSnaps++; }
  phase = 'dead'; deadT = 0; aim = null; deadWait = 1.25;
  // Big plays get a replay button (touchdowns, turnovers, 20+ yards), and a little longer to tap it.
  const gain = (r.x ?? G.play.los) - G.play.los;
  G.replay = !G.youDefend && !G.practice && frames.length > 20 && (['td', 'int', 'fumble'].includes(r.type) || gain >= 20) ? frames.slice() : null;
  frames = [];
  if (G.practice) return practicePlayOver(r);
  if (G.youDefend) return defPlayOver(r);
  // After a pass, what they were in: learn to read the coverage.
  if (G.play.thrown && G.play.coverage) G.play.pops.push({ x: G.play.los + 6, y: S.MID, text: `VS ${G.play.coverage.toUpperCase()}`, color: '#9fc4ff', t: 0 });
  if (G.replay) deadWait = Math.max(deadWait, 3.2);
  if (r.type === 'td'){ sfx('band'); }
  if (r.type === 'td'){ const sc = G.me.names?.[G.play.carrier?.role]; banner(G.twoPt ? 'TWO POINTS!' : 'TOUCHDOWN!', G.twoPt ? '' : (sc ? `${sc} · ` : '') + G.me.name.toUpperCase(), G.me.color, 2300); sfx('td'); G.cheer = 3; deadWait = 2.5; }
  else if (r.type === 'int'){ banner('INTERCEPTED', '', '#ff5a4e', 1800); sfx('turnover'); deadWait = 2; }
  else if (r.type === 'fumble'){ banner('FUMBLE!', '', '#ff5a4e', 1800); sfx('turnover'); deadWait = 2; }
  else if (r.type === 'sack'){ G.play.pops.push({ x: r.x, y: r.y, text: 'SACKED', color: '#ff5a4e', t: 0 }); }
  else if (r.type === 'inc'){ sfx('drop'); G.play.pops.push({ x: G.play.ball.tx, y: G.play.ball.ty, text: (r.why || 'Incomplete').toUpperCase(), color: '#fff', t: 0 }); }
  else if (r.type === 'oob') G.play.pops.push({ x: r.x, y: r.y, text: 'OUT OF BOUNDS', color: '#fff', t: 0 });
}

function afterPlay(){
  phase = 'wait';
  if (G.practice) return practiceAfter();
  if (G.youDefend) return defAfter();
  // A flag on the play? Your call when declining is better for you (offside after a big gain).
  const pen = S.callPenalty(G);
  if (pen){
    sfx('whistle');
    if (pen.choice){
      phase = 'modal'; pendingPen = pen;
      return modal(`<div class="pb-card pb-flag"><h2>FLAG</h2><p class="pb-fl">${pen.name}</p><p>${pen.desc}. Or decline it and keep the ${Math.round(G.play.result.x - G.play.los)}-yard gain.</p>
        <div class="pb-btns"><button class="pb-go" type="button" data-pb="penacc">ACCEPT · 5 YDS</button><button class="pb-go alt" type="button" data-pb="pendec">DECLINE · KEEP THE PLAY</button></div></div>`);
    }
    return takePenalty(pen);
  }
  return applyPlay();
}
let pendingPen = null;
function takePenalty(pen){
  banner(`FLAG · ${pen.name}`, pen.desc, '#ffd84a', 2000);
  driveLog(`Flag: ${pen.name.toLowerCase()}`);
  const out = S.enforcePenalty(G, pen);
  if (out === 'next') return later(() => presnap(), 900);
  return applyOutcome(out);
}
function applyPlay(){ return applyOutcome(S.applyResult(G)); }
/* ---------- instant replay ---------- */
/* Every 2nd tick of your plays: where everyone (and the ball) was. A big play replays at half speed, letterboxed. */
let frames = [], tickN = 0, rp = null;
function recordFrame(){
  if (tickN++ % 2) return;
  const P = G.play;
  frames.push({ p: P.all.map(o => [o.x, o.y, o.vx, o.vy, o.face, o.down, o.step]), b: [P.ball.x, P.ball.y, P.ball.z, P.ball.state, P.ball.holder] });
  if (frames.length > 900) frames.shift();
}
function startReplay(){
  if (!G.replay || phase !== 'dead') return;
  rp = { f: G.replay, i: 0, keep: G.play.all.map(o => [o.x, o.y, o.vx, o.vy, o.face, o.down, o.step]), ball: { ...G.play.ball } };
  phase = 'replay'; root.classList.add('pb-replaying'); syncReplay();
}
function replayStep(dt){
  rp.i += dt * 15;   // half speed: frames were recorded at 30 a second
  const f = rp.f[Math.min(rp.f.length - 1, Math.floor(rp.i))], P = G.play;
  P.all.forEach((o, k) => { const s = f.p[k]; if (s) [o.x, o.y, o.vx, o.vy, o.face, o.down, o.step] = s; });
  [P.ball.x, P.ball.y, P.ball.z, P.ball.state, P.ball.holder] = f.b;
  if (rp.i >= rp.f.length + 15) endReplay();
}
function endReplay(){
  if (!rp) return;
  const P = G.play; P.all.forEach((o, k) => { const s = rp.keep[k]; if (s) [o.x, o.y, o.vx, o.vy, o.face, o.down, o.step] = s; }); Object.assign(P.ball, rp.ball);
  rp = null; G.replay = null; root.classList.remove('pb-replaying'); syncReplay();
  afterPlay();
}
function syncReplay(){
  const b = $('.pb-rp'); if (b) b.hidden = !(G?.replay && phase === 'dead');
}

/* The crowd: quiet between plays, louder on third and fourth down, in the red zone, late in a close game, and in a
   roar after a score (G.cheer). */
function crowdLevel(){
  if (!G || phase === 'modal' && $('.pb-modal').dataset.kind === 'pause') return 0;
  let l = .05;
  if (G.down >= 3) l += .04; if (G.los >= 80) l += .04;
  if (G.quarter >= 4 && Math.abs(G.score[0] - G.score[1]) <= 8) l += .04;
  return l + Math.min(.25, (G.cheer || 0) * .08);
}

/* One line of play-by-play under the scoreboard after each of your plays, with real names when they're in. */
let pbpTimer = 0;
function pbp(text){
  const el = $('.pb-pbp'); if (!el || !text) return;
  if (hdOn()){ el.innerHTML = hdUI.hud.pbp(text, G?.lastPlay?.first && !G.twoPt && !/touchdown/.test(text) ? '1st down' : ''); el.setAttribute('style', hdUI.hud.pbpVars(G.me)); }
  else el.textContent = text;
  el.classList.add('on'); clearTimeout(pbpTimer); pbpTimer = setTimeout(() => el.classList.remove('on'), 3200);
}
function playLine(){
  const P = G.play, r = P.result, n = G.me.names || {}, q = n.QB || 'QB', c = P.carrier, who = c ? n[c.role] || ({ RB: 'Back', QB: q, TE: 'Tight end' })[c.role] || 'Receiver' : null;
  const g = Math.round((r.x ?? P.los) - P.los), yd = x => `${x} yard${Math.abs(x) === 1 ? '' : 's'}`;
  if (r.type === 'td') return P.thrown ? `${q} to ${who}, ${Math.round(100 - P.los)}-yard touchdown` : `${who}, ${Math.round(100 - P.los)}-yard touchdown run`;
  if (r.type === 'int') return `${q} intercepted`;
  if (r.type === 'fumble') return `${who} fumbles, recovered by the defense`;
  if (r.type === 'sack') return `${q} sacked for a loss of ${Math.max(0, -g)}`;
  if (r.type === 'inc') return `${q} incomplete${r.why && r.why !== 'Incomplete' ? ` (${r.why.toLowerCase()})` : ''}`;
  if (!c) return '';
  const base = P.thrown ? `${q} to ${who} for ${yd(g)}` : g >= 0 ? `${who} for ${yd(g)}` : `${who}, loss of ${-g}`;
  return base + (r.type === 'oob' ? ', out of bounds' : '');
}
function applyOutcome(out){
  const lp = G.lastPlay, line = playLine();
  pbp(line);
  if (G.twoPt){
    G.twoPt = false;
    if (out === 'td'){ G.score[0] += 2; } else banner('NO GOOD', 'Two-point try fails', '#ff5a4e', 1300);
    driveLog(out === 'td' ? 'Two-point try is good' : 'Two-point try fails');
    return afterMyScore();
  }
  driveLog(line, true);
  switch (out){
    case 'next':
      if (lp.first){ sfx('first'); banner('FIRST DOWN', '', '#ffd84a', 900); }
      return presnap();
    case 'td': G.score[0] += 6; endDrive('TOUCHDOWN', 100); return extraPoint();
    case 'turnover':
      endDrive(lp.type === 'int' ? 'INTERCEPTED' : 'FUMBLE', G.play.los);
      if (lp.pick6 && !G.ot){ G.score[1] += 7; banner('PICK SIX', `${G.opp.name} scores`, '#ff5a4e', 1800); sfx('boo'); return later(() => kickoffToMe(), 1600); }
      return endMyPossession(G.turnoverX);
    case 'downs': endDrive('TURNOVER ON DOWNS'); banner('TURNOVER ON DOWNS', '', '#ff5a4e', 1500); sfx('turnover'); return later(() => endMyPossession(G.turnoverX), 1300);
    case 'safety': endDrive('SAFETY', 0); G.score[1] += 2; banner('SAFETY', '', '#ff5a4e', 1500); sfx('boo'); return later(() => endMyPossession(60), 1300);
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

/* The sideline's call on 4th down: short in their territory or chasing late, go; in range, kick; otherwise punt. */
function fourthAdvice(){
  const fg = S.inFgRange(G), d = S.fgDistance(G), behind = G.score[1] - G.score[0], late = G.quarter >= 4 && G.clock < 300;
  if (late && behind > 0 && (behind > 3 || !fg)) return ['GO FOR IT', 'you need points and time is short'];
  if (G.toGo <= 1 && G.los >= 35) return ['GO FOR IT', 'a yard to go'];
  if (G.toGo <= 2 && G.los >= 50) return ['GO FOR IT', 'short yardage in their territory'];
  if (G.toGo <= 4 && G.los >= 60 && G.los < 72 && d > 45) return ['GO FOR IT', 'too far to kick, too close to punt'];
  if (fg && d <= 52) return ['FIELD GOAL', `${d} yards is in range`];
  if (G.toGo <= 3 && G.los >= 55) return ['GO FOR IT', 'no man\'s land'];
  return ['PUNT', 'flip the field'];
}
function fourthDown(){
  const fg = S.inFgRange(G), dist = S.fgDistance(G), adv = fourthAdvice();
  phase = 'presnap';
  modal(`<div class="pb-card pb-4th"><h2>${ord(4)} & ${G.toGo >= 100 - G.los ? 'GOAL' : G.toGo}</h2><p>${yardLine(G.los)}</p>
    <p class="pb-advice">SIDELINE: ${adv[0]} · ${esc(adv[1])}</p>
    <div class="pb-btns"><button class="pb-go${adv[0] === 'GO FOR IT' ? ' pb-adv' : ''}" type="button" data-pb="goforit">GO FOR IT</button>
    ${G.ot ? '' : `<button class="pb-go alt${adv[0] === 'PUNT' ? ' pb-adv' : ''}" type="button" data-pb="punt">PUNT</button>`}
    ${fg ? `<button class="pb-go alt${adv[0] === 'FIELD GOAL' ? ' pb-adv' : ''}" type="button" data-pb="fg">FIELD GOAL · ${dist} YDS</button>` : ''}</div></div>`, true);
}
function doPunt(){
  closeModal(); phase = 'modal';
  const p = S.punt(G);
  sfx('kick'); banner(`PUNT · ${p.net} YDS`, p.touchback ? 'Touchback' : '', '#fff', 1400);
  driveLog(`Punt, ${p.net} yards${p.touchback ? ', touchback' : ''}`); endDrive('PUNT');
  later(() => endMyPossession(p.oppX), 1300);
}
function startKick(kind){
  closeModal(); G.play = null; S.startKick(G, kind); phase = 'kick'; kickT = 0;
}
function afterKick(){
  phase = 'wait';
  const K = G.kick; G.kick = null;
  if (K.kind === 'pat'){
    if (K.good){ G.score[0] += 1; banner('GOOD!', '', '#4cff7a', 900); } else banner('NO GOOD', K.why, '#ff5a4e', 1200);
    driveLog(K.good ? 'Extra point is good' : 'Extra point is no good');
    return afterMyScore();
  }
  G.stats.fga++;
  driveLog(`${K.dist}-yard field goal ${K.good ? 'is good' : 'is no good'}`); endDrive(K.good ? 'FIELD GOAL' : 'MISSED FIELD GOAL');
  if (K.good){ G.stats.fgm++; G.score[0] += 3; banner('IT\'S GOOD!', `${K.dist}-yard field goal`, '#4cff7a', 1500); G.cheer = 2; return later(() => afterMyScore(), 900); }
  banner('NO GOOD', K.why, '#ff5a4e', 1400);
  later(() => endMyPossession(Math.min(K.spotX, 80)), 900);
}

function clockOut(){
  phase = 'modal';
  if (G.drive && !G.drive.result && G.drive.log.length) endDrive(G.quarter <= 2 ? 'END OF HALF' : 'END OF GAME');
  if (G.quarter <= 2) return halftime();
  if (G.score[0] === G.score[1]) return startOT();
  final();
}
function halftime(){
  sfx('whistle');
  const st = G.stats;
  modal(`<div class="pb-card"><h2>HALFTIME</h2>${scoreLine()}${driveRecap()}
    <p class="pb-stat">${st.comp}/${st.att} passing · ${st.passYds} yds · ${st.passTD} TD${st.int ? ` · ${st.int} INT` : ''}<br>${st.rush} rushes · ${st.rushYds} yds</p>
    <button class="pb-go" type="button" data-pb="half">START 2ND HALF</button></div>`);
}
function secondHalf(){
  closeModal();
  Object.assign(G, { quarter: 3, clock: G.qLen, timeouts: 3, runoff: 0 });
  if (G.firstHalfReceiver === 'opp') kickoffToMe(); else oppDrive(kickoffYtg());
}

/* The other team's drive: a little animated summary while the ball moves down a strip of field. */
/* Season games: before each of their drives you make the defensive call (film study adds a read on what's coming). */
let pendingCall = null;
function oppDrive(ytg, opts = {}, then){
  if (!G.season || G.practice) return runOppDrive(ytg, opts, then);
  phase = 'modal'; aim = null; pendingCall = { ytg, opts, then };
  const late = G.quarter >= 4 && G.clock < 240 && G.score[0] > G.score[1];
  const read = G.mods?.tells >= .45 && G.scout ? SC.driveRead(G.scout, G) : '';
  const plan = SC.DEF_PLANS[G.seasonCfg?.plan?.def]?.name;
  modal(`<div class="pb-card pb-drive pb-dcall" style="--c:${esc(G.opp.color)}">${driveRecap()}
    <div class="pb-dh">${G.opp.logo ? `<img src="${esc(logoUrl(G.opp.logo, 72))}" alt="">` : ''}<b>${esc(G.opp.name)}</b><span>BALL AT THEIR ${Math.round(100 - ytg)}</span></div>
    <div class="pb-strip" style="--me:${esc(G.me.color)};--op:${esc(G.opp.color)}"><i class="pb-mark" style="left:${ytg}%"></i></div>
    <div class="pb-dres" style="color:#ffd84a;font-size:12px">YOUR DEFENSIVE CALL</div>
    ${read ? `<p class="pb-read"><b>FILM</b>${esc(read)}</p>` : ''}
    <div class="pb-dcalls">${Object.entries(SC.DCALLS).filter(([, c]) => !c.late || late).map(([k, c]) => `<button type="button" data-pb="dcall" data-v="${k}" class="${c.late ? 'late' : ''}"><b>${c.name}</b><small>${esc(c.tip)}</small></button>`).join('')}</div>
    ${plan ? `<p class="pb-sub">Game plan: ${esc(plan)}</p>` : ''}</div>`);
}
function pickDriveCall(k){
  const pc = pendingCall; pendingCall = null; if (!pc) return;
  closeModal();
  const dm = SC.driveMods(k, G.scout); G.dm = dm; G.dcall = k;
  runOppDrive(pc.ytg, { ...pc.opts, dm }, pc.then);
}
function runOppDrive(ytg, opts = {}, then){
  phase = 'modal'; aim = null;
  const r = S.simDrive(G, ytg, opts);
  if (!G.practice) return coverPrompt(r, opts, then);
  const k = pickStop(r);
  if (k >= 0) return keyStopPrompt(r, k, then);
  finishOppDrive(r, then);
}
function finishOppDrive(r, then){
  phase = 'modal';
  const ytg = r.path[0];
  if (!G.ot) S.useClock(G, r.time);
  const RES = { td: ['TOUCHDOWN', '#ff5a4e'], fg: ['FIELD GOAL', '#ff9f43'], missfg: ['MISSED FIELD GOAL', '#4cff7a'], punt: ['PUNT', '#c9d1d9'],
    int: ['INTERCEPTED!', '#4cff7a'], fumble: ['FUMBLE RECOVERED!', '#4cff7a'], downs: ['STOPPED ON DOWNS!', '#4cff7a'], half: [G.quarter >= 4 ? 'END OF GAME' : 'END OF HALF', '#c9d1d9'] };
  const [word, col] = RES[r.kind];
  const STOP = { sack: 'Your sack stalled the drive', pressure: 'Your pressure forced an incompletion', 'pressure-converted': 'You got pressure, but they converted', blocked: 'They picked up your rush', offside: 'Offside on you; they kept the drive going',
  };
  // What happened on your cover play earlier in the drive.
  const g = r.coverGain, COVER = { int: 'You picked it off', teamint: 'Your defense picked it off on your man', fumble: 'Your defense forced a fumble on your man',
    pbu: 'You broke up the pass to your man', teampbu: 'Your defense broke up the pass to your man', inc: 'The pass to your man fell incomplete', sack: 'They sacked him before he could throw',
    short: `You held your man to ${g} yard${g === 1 ? '' : 's'}`, catch: `Your man caught one for ${g} yards`, td: 'Your man beat you for the score' };
  const next = G.ot ? 'CONTINUE' : r.half || G.clock <= 0 ? 'CONTINUE' : `YOUR BALL · ${yardLine(r.myX)}`;
  modal(`<div class="pb-card pb-drive" style="--c:${esc(G.opp.color)}">
    <div class="pb-dh">${G.opp.logo ? `<img src="${esc(logoUrl(G.opp.logo, 72))}" alt="">` : ''}<b>${esc(G.opp.name)}</b><span>ON OFFENSE</span></div>
    <div class="pb-strip" style="--me:${esc(G.me.color)};--op:${esc(G.opp.color)}"><i class="pb-mark" style="left:${ytg}%"></i></div>
    <div class="pb-ticker" aria-live="polite"></div>
    <div class="pb-dres" style="color:${col}" hidden>${word}</div>
    <div class="pb-dsub" hidden>${r.plays} play${r.plays === 1 ? '' : 's'} · ${r.yards} yds${G.ot ? '' : ` · ${mmss(r.time)}`}</div>
    ${r.cover ? `<div class="pb-dsub pb-stopline" hidden>${esc(COVER[r.cover] || '')}</div>` : ''}
    ${r.stop ? `<div class="pb-dsub pb-stopline" hidden>${esc(STOP[r.stop] || '')}</div>` : ''}
    <button class="pb-go" type="button" data-pb="drive" hidden>${next}</button></div>`);
  let i = 0;
  const g0 = G;
  const tick = setInterval(() => {
    if (!root || G !== g0){ clearInterval(tick); return; }
    if (paused || !$('.pb-mark')) return;
    i++;
    if (i < r.path.length){
      $('.pb-mark').style.left = `${r.path[i]}%`; sfx('blip');
      const t = $('.pb-ticker'), line = driveLine(r.path[i - 1] - r.path[i]);
      if (t && line){ t.insertAdjacentHTML('beforeend', `<div>${esc(line)}</div>`); while (t.children.length > 3) t.firstElementChild.remove(); }
      return;
    }
    clearInterval(tick);
    G.score[1] += r.points;
    for (const el of root.querySelectorAll('.pb-dres, .pb-dsub, [data-pb="drive"]')) el.hidden = false;
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
/* The opponent's drive, a play at a time, with their real names when they're in: big gains are passes, the rest a
   mix of runs and short passes. */
function driveLine(gain){
  const n = G.opp.names || {}, q = n.QB || 'Their QB', rb = n.RB || 'their back', wr = [n.X, n.Z, n.SL, n.TE].filter(Boolean);
  const to = wr.length ? wr[Math.floor(Math.random() * wr.length)] : 'a receiver', yd = x => `${x} yard${Math.abs(x) === 1 ? '' : 's'}`;
  gain = Math.round(gain);
  if (gain < 0) return Math.random() < .5 ? `${q} sacked, loss of ${-gain}` : `${rb}, loss of ${-gain}`;
  if (gain === 0) return Math.random() < .6 ? `${q} incomplete` : `${rb}, no gain`;
  if (gain >= 12 || Math.random() < .45) return `${q} to ${to} for ${yd(gain)}`;
  return `${rb} for ${yd(gain)}`;
}

/* ---------- you on defense: cover drill, pass rush drill, key third downs ---------- */
/* The rush meter: its speed and green window by difficulty. The quarterback's release time too. */
const RUSH = { rookie: { period: 1.3, win: .3, release: [2.6, 3.2] }, pro: { period: 1.1, win: .24, release: [2.3, 2.9] },
  allpro: { period: .95, win: .19, release: [2.1, 2.6] }, legend: { period: .8, win: .15, release: [1.9, 2.4] } };
const DDRILLS = { cover: { name: 'Cover drill', tip: 'You are the corner, one on one with their receiver. Drag anywhere like a joystick to stay with him; when the ball goes up, get inside the yellow ring and hit JUMP.' },
  rush: { name: 'Pass rush', tip: 'You are the edge rusher. Tap the instant the ball is snapped (too early is offside), then tap in the green to beat the tackle, and race the quarterback.' } };
let keyCtx = null;   // a key third down inside a real game: { main, r, k, then }

function defSetupHTML(){
  const P = saved.practice, seg = (k, items) => `<div class="pb-seg">${items.map(([v, l]) => `<button type="button" data-pb="pset" data-k="${k}" data-v="${v}" aria-pressed="${String(P[k]) === String(v)}">${l}</button>`).join('')}</div>`;
  return `<div class="pb-opt"><span>Drill</span><div class="pb-ddrills">${Object.entries(DDRILLS).map(([k, d]) => `<button type="button" data-pb="pset" data-k="ddrill" data-v="${k}" aria-pressed="${P.ddrill === k}"><b>${d.name.toUpperCase()}</b><small>${esc(d.tip)}</small></button>`).join('')}</div></div>
    <div class="pb-opt"><span>Session</span>${seg('session', Object.entries(SESSIONS).map(([k, x]) => [k, `${x.name} · ${x.n}`]))}</div>
    <button class="pb-go" type="button" data-pb="pstart">START ${SESSIONS[P.session].name.toUpperCase()} SESSION</button>
    ${historyHTML('defense')}`;
}

function startDefDrill(){
  initAudio(saved.sound);
  const you = withImage(teamInfo(pick.me)), them = withImage(teamInfo(pick.opp)), kind = saved.practice.ddrill;
  closeModal();
  G = S.newGame(them, you, saved.diff, saved.len);   // their offense is "me" in the engine; you defend
  Object.assign(G, { youDefend: true, defDrill: { kind } });
  G.ds = { kind, reps: 0, n: SESSIONS[saved.practice.session]?.n || 5, session: saved.practice.session, scoreSum: 0, best: 0, streak: 0, bestStreak: 0,
    ints: 0, pbus: 0, stops: 0, comp: 0, yds: 0, tds: 0, sacks: 0, pressures: 0, blocked: 0, offside: 0, getOff: 0, getOffs: 0, last: '' };
  snaps = 0; showHud(true); defRep(true);
}
function defRep(snapCam, at = 30, toGo = 10){
  S.startDrive(G, at); G.toGo = toGo; G.y = S.MID;
  const kind = G.defDrill.kind, Rz = RUSH[G.diffKey] || RUSH.pro;
  if (kind === 'rush'){
    G.defDrill.throwAt = Rz.release[0] + Math.random() * (Rz.release[1] - Rz.release[0]);
    const c = .3 + Math.random() * .4;   // the green window moves around the bar from rep to rep
    G.rush = { snapAt: .9 + Math.random() * 1.4, tapAt: null, contactAt: null, mt: 0, lo: c - Rz.win / 2, hi: c + Rz.win / 2, won: false, recover: 0, flash: 0, misses: 0, period: Rz.period, said: 0 };
  } else G.rush = { snapAt: 1.1 };
  if (snapCam) R.snapCamera(G);
  S.setupPlay(G); phase = 'dpre'; G.dpreT = 0; aim = null; resetInput();
}
function defPreSnap(dt){
  const Rz = G.rush; G.dpreT += dt;
  if (G.defDrill.kind === 'rush' && !Rz.said){ Rz.said = 1; banner('SET…', '', '#fff', 700); }
  if (G.dpreT >= Rz.snapAt){ S.snap(G); phase = 'live'; if (G.defDrill.kind === 'rush') banner('HUT!', '', '#ffd84a', 500); }
}
function defLive(dt){
  const Rz = G.rush, P = G.play; if (G.defDrill.kind !== 'rush') return;
  const me = P.def.find(d => d.rusher); if (!me) return;
  if (Rz.tapAt == null && P.t > .7){ Rz.tapAt = P.t; Rz.late = true; me.wait = false; Rz.contactAt = P.t + .25; }   // a late get-off on his own
  if (Rz.contactAt != null && P.t >= Rz.contactAt && !Rz.won) Rz.mt += dt;
  Rz.recover = Math.max(0, Rz.recover - dt); Rz.flash = Math.max(0, Rz.flash - dt);
}
const meterPos = Rz => (1 - Math.cos(Rz.mt * Math.PI * 2 / Rz.period)) / 2;
function rushView(){
  const Rz = G?.rush; if (!G?.youDefend || G.defDrill?.kind !== 'rush' || !Rz || Rz.won || Rz.contactAt == null || phase !== 'live' || G.play.t < Rz.contactAt) return null;
  return { pos: meterPos(Rz), lo: Rz.lo, hi: Rz.hi, flash: Rz.flash > 0 };
}
function rushTap(){
  const Rz = G.rush, P = G.play; if (!Rz) return;
  if (phase === 'dpre'){ Rz.offside = true; S.stopPlay(G, { type: 'offside' }); return playOver(); }
  if (phase !== 'live' || P.result) return;
  const me = P.def.find(d => d.rusher);
  if (Rz.tapAt == null){ Rz.tapAt = P.t; me.wait = false; Rz.contactAt = P.t + .25; return; }
  if (Rz.won || P.t < Rz.contactAt || Rz.recover > 0) return;
  const pos = meterPos(Rz);
  if (pos >= Rz.lo && pos <= Rz.hi){ Rz.won = true; Rz.wonAt = P.t; me.free = true; P.pops.push({ x: me.x, y: me.y, text: 'BEAT HIM!', color: '#4cff7a', t: 0 }); sfx('juke'); }
  else { Rz.misses++; Rz.recover = .35; Rz.flash = .25; P.pops.push({ x: me.x, y: me.y, text: 'STONED', color: '#ff5a4e', t: 0 }); sfx('tackle'); }
}

/* Grades a defensive rep: { score, word, bars: [[label, value]...], kind } */
function defGrade(r){
  const P = G.play, kind = G.defDrill.kind;
  if (kind === 'rush'){
    const Rz = G.rush, me = P.def.find(d => d.rusher), qb = P.qb;
    const getOff = Rz.offside ? 0 : Rz.late ? 10 : Math.round(Math.max(20, Math.min(100, 100 - (Rz.tapAt - .12) * 160)));
    const win = Rz.offside ? 0 : Rz.won ? Math.max(20, 100 - Rz.misses * 30) : 0;
    let out = r.type === 'offside' ? 'offside' : r.type === 'sack' ? 'sack' : me?.free && Math.hypot(me.x - qb.x, me.y - qb.y) < 3.5 ? 'pressure' : 'blocked';
    const res = { sack: 100, pressure: 70, blocked: 25, offside: 0 }[out];
    const score = out === 'offside' ? 0 : Math.round(res * .6 + getOff * .2 + win * .2);
    return { kind, out, score, word: { sack: 'SACK!', pressure: 'PRESSURE', blocked: 'BLOCKED', offside: 'OFFSIDE' }[out], bars: [['GET-OFF', getOff], ['BEAT TACKLE', win], ['RESULT', res]], getOff: Rz.offside || Rz.late ? null : Rz.tapAt };
  }
  const gain = Math.round(Math.min(r.x ?? P.los, 100) - P.los), sep = P.userSep;
  const cover = sep == null ? 60 : Math.round(Math.max(0, Math.min(100, 100 - (sep - 1) * 30)));
  let out, ball, tackle = 100;
  if (r.type === 'int'){ out = 'int'; ball = 100; }
  else if (r.type === 'sack'){ out = 'sack'; ball = 80; }
  else if (r.type === 'fumble'){ out = 'fumble'; ball = 80; }
  else if (r.type === 'inc'){ out = /Swatted|Broken/.test(r.why || '') ? 'pbu' : 'inc'; ball = out === 'pbu' ? 90 : 70; }
  else if (r.type === 'td'){ out = 'td'; ball = 0; tackle = 0; }
  else { out = 'catch'; ball = 30; tackle = Math.max(0, Math.min(100, 100 - Math.max(0, gain - (P.catchX ? P.catchX - P.los : gain)) * 12)); }
  const score = Math.round(out === 'int' ? 100 : out === 'pbu' ? 90 : out === 'inc' || out === 'sack' || out === 'fumble' ? 72 : out === 'td' ? 0 : Math.max(5, 58 - gain * 2));
  return { kind, out, score, gain, x: r.x, mine: !r.by || !!r.by.user, word: { int: 'PICKED OFF!', sack: 'SACKED', fumble: 'FUMBLE!', pbu: 'BROKEN UP', inc: 'INCOMPLETE', td: 'TOUCHDOWN', catch: `CAUGHT · +${gain}` }[out], bars: [['COVERAGE', cover], ['BALL', ball], ['TACKLE', tackle]], sep };
}
function defPlayOver(r){
  phase = 'dead'; deadT = 0; deadWait = 1.3;
  const g = G.play.dgrade = defGrade(r);
  if (keyCtx) return;   // a key third down shows its result on the drive card instead
  showGrade({ score: g.score, word: g.word, bars: g.bars, who: null });
  if (g.out === 'sack'){ sfx('tackle'); R.shake(3); }
  else if (g.out === 'int'){ banner('INTERCEPTION!', '', '#4cff7a', 1100); sfx('good'); }
  else if (g.out === 'td'){ sfx('boo'); }
  else if (g.out === 'offside'){ banner('OFFSIDE', 'Wait for the snap', '#ff5a4e', 1100); sfx('whistle'); }
}
function defAfter(){
  const g = G.play.dgrade;
  if (keyCtx) return keyDone(g);
  const ds = G.ds; ds.reps++; ds.scoreSum += g.score; ds.best = Math.max(ds.best, g.score);
  const good = g.kind === 'rush' ? g.out === 'sack' : ['int', 'pbu', 'inc'].includes(g.out);
  ds.streak = good ? ds.streak + 1 : 0; ds.bestStreak = Math.max(ds.bestStreak, ds.streak);
  if (g.kind === 'rush'){ ds[{ sack: 'sacks', pressure: 'pressures', blocked: 'blocked', offside: 'offside' }[g.out]]++; if (g.getOff != null){ ds.getOff += g.getOff; ds.getOffs++; } }
  else { if (g.out === 'int') ds.ints++; if (g.out === 'pbu') ds.pbus++; if (['int', 'pbu', 'inc'].includes(g.out)) ds.stops++; if (g.out === 'catch' || g.out === 'td'){ ds.comp++; ds.yds += g.gain || 0; } if (g.out === 'td') ds.tds++; }
  ds.last = g.word;
  if (ds.reps >= ds.n) return finishDefSession();
  defRep(false);
}
function finishDefSession(){
  phase = 'modal'; clearTimeout(gradeTimer); $('.pb-grade')?.classList.remove('on');
  const ds = G.ds, avg = Math.round(ds.scoreSum / ds.reps), rush = ds.kind === 'rush';
  const rec = { id: String(Date.now()), at: Date.now(), side: 'defense', kind: ds.kind, session: ds.session, throws: ds.reps, avg, bestStreak: ds.bestStreak,
    drill: rush ? `Pass rush · ${ds.sacks} sack${ds.sacks === 1 ? '' : 's'}` : `Cover drill · ${ds.ints} INT · ${ds.comp} caught`,
    stat: rush ? `${ds.sacks} sacks · ${ds.pressures} pressures` : `${ds.stops}/${ds.reps} stopped`, inStride: Math.round((rush ? ds.sacks : ds.stops) / ds.reps * 100) };
  const prevBest = Math.max(0, ...saved.sessions.filter(x => x.side === 'defense' && x.kind === ds.kind).map(x => x.avg));
  saved.sessions = [rec, ...saved.sessions].slice(0, 80); save();
  const best = avg > prevBest && saved.sessions.filter(x => x.side === 'defense' && x.kind === ds.kind).length > 1;
  sfx(avg >= 80 ? 'good' : 'whistle');
  const cells = rush
    ? [[ds.sacks, 'Sacks'], [ds.pressures, 'Pressures'], [ds.blocked, 'Blocked'], [ds.getOffs ? `${(ds.getOff / ds.getOffs).toFixed(2)}s` : '–', 'Avg get-off']]
    : [[`${ds.stops}/${ds.reps}`, 'Stopped'], [ds.ints, 'Picks'], [ds.pbus, 'Break-ups'], [ds.yds, 'Yds allowed']];
  modal(`<div class="pb-card pb-sess">
    <span class="pb-sk">${esc(SESSIONS[ds.session]?.name || '')} ${rush ? 'pass rush' : 'cover'} session complete</span>
    <div class="pb-sg"><b style="color:${gradeColor(avg)}">${letter(avg)}</b><span>${avg}<small>/100</small></span></div>
    ${best ? '<p class="pb-pb">NEW PERSONAL BEST</p>' : ''}
    <div class="pb-ss">${cells.map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    <p class="pb-sub">Best streak ${ds.bestStreak} · saved to your history</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="dagain">GO AGAIN</button><button class="pb-go alt" type="button" data-pb="psetup">PRACTICE MENU</button></div>
    <div class="pb-btns"><button class="pb-go alt sm" type="button" data-pb="menu">MAIN MENU</button><button class="pb-go alt sm danger" type="button" data-pb="pdel" data-id="${rec.id}" data-long="1">DELETE THIS SESSION</button></div>
  </div>`);
  if (G.seasonDrill) seasonDrillCard(avg);
}
function defHud(){
  const hint = hintText(), Rz = G.rush;
  if (keyCtx){
    const key = ['K', hint, phase].join('|'); if (key === lastHud) return; lastHud = key;
    $('.pb-bug').innerHTML = `<div class="pb-tm" style="--c:${esc(G.opp.color)};--k:${inkOn(G.opp.color)}"><b>${G.defDrill.kind === 'cover' ? 'COVER HIM' : 'KEY 3RD DOWN'}</b></div><div class="pb-mid"><span>DOWN</span><b>${ord(G.down)} & ${G.toGo >= 100 - G.los ? 'GOAL' : G.toGo}</b></div>`;
    $('.pb-dd').innerHTML = `<span>${esc(G.me.name.toUpperCase())} AT YOUR ${Math.round(100 - G.los)}</span>`; $('.pb-bar').innerHTML = ''; $('.pb-hint').textContent = hint; return;
  }
  const ds = G.ds, avg = ds.reps ? Math.round(ds.scoreSum / ds.reps) : null, rush = ds.kind === 'rush';
  const btns = '';
  const key = ['D', ds.reps, ds.scoreSum, ds.streak, btns, hint].join('|'); if (key === lastHud) return; lastHud = key;
  $('.pb-bug').innerHTML = `<div class="pb-tm" style="--c:${esc(G.opp.color)};--k:${inkOn(G.opp.color)}">${G.opp.logo ? `<img src="${esc(logoUrl(G.opp.logo, 72))}" alt="">` : ''}<b>DEFENSE</b></div>
    ${rush ? `<div class="pb-mid"><span>SACKS</span><b>${ds.sacks}</b></div><div class="pb-mid"><span>PRESS</span><b>${ds.pressures}</b></div>`
      : `<div class="pb-mid"><span>STOPS</span><b>${ds.stops}/${ds.reps}</b></div><div class="pb-mid"><span>PICKS</span><b>${ds.ints}</b></div>`}
    <div class="pb-mid"><span>GRADE</span><b style="color:${avg == null ? '#fff' : gradeColor(avg)}">${avg == null ? '--' : letter(avg)}</b></div>`;
  $('.pb-dd').innerHTML = `<span>REP ${Math.min(ds.reps + 1, ds.n)}/${ds.n}</span>${ds.reps ? `<span>STREAK ${ds.streak}</span>` : ''}`;
  $('.pb-bar').innerHTML = btns; $('.pb-hint').textContent = hint;
}
function defHint(){
  const touch = coarse(), Rz = G.rush, P = G.play;
  if (G.defDrill?.kind === 'rush'){
    if (phase === 'dpre') return `Wait for the snap, then ${touch ? 'tap' : 'press Space'} the instant the ball moves`;
    if (phase !== 'live') return '';
    if (Rz.tapAt == null) return touch ? 'TAP!' : 'SPACE!';
    if (!Rz.won) return `${touch ? 'Tap' : 'Space'} when the marker is in the green to beat the tackle`;
    return 'Get to the quarterback!';
  }
  if (phase === 'dpre') return touch ? 'Get set: drag anywhere to steer · JUMP when the ball is up' : 'Arrows (or drag) to cover him · JUMP or Space when the ball is up';
  if (phase === 'live' && P.ball.state === 'air') return touch ? 'Get in the ring and hit JUMP!' : 'Get in the ring: JUMP or Space!';
  return phase === 'live' ? (touch ? 'Drag anywhere to steer · stay on his hip' : 'Arrows or drag to stay with him') : '';
}

/* Key third downs: about half of the opponent's drives, and nearly every close one late, pause on a third down
   for you to play: rush the passer, or cover their receiver one on one (a coin flip which). Not on drives that end
   the half, or that end in a turnover anyway. */
function pickStop(r, from = 0){
  const n = r.path.length - from;   // plays after your cover play, so a short drive never stops twice
  if (G.practice || r.half || ['int', 'fumble'].includes(r.kind) || n < 5) return -1;
  const late = G.quarter >= 4 && Math.abs(G.score[0] - G.score[1]) <= 8;
  if (Math.random() > Math.min(.95, (late ? .9 : .45) * (G.mods?.rushMoments || 1) * (G.dm?.rush || 1))) return -1;
  return from + Math.max(2, Math.min(n - 2, Math.round(n * .55)));
}
/* Every opponent drive: one early pass play where they go at your man, with the whole team out there. */
function coverPrompt(r, opts, then){
  phase = 'modal';
  const c = Math.floor(Math.random() * Math.min(3, r.path.length - 1)), at = r.path[c];
  const down = c === 0 || Math.random() < .4 ? 1 : 2, toGo = Math.min(at, down === 1 ? 10 : 3 + Math.floor(Math.random() * 8));
  keyPending = { r, k: c, then, toGo, down, opts, kind: 'cover' };
  modal(`<div class="pb-card pb-drive" style="--c:${esc(G.opp.color)}">${driveRecap()}
    <div class="pb-dh">${G.opp.logo ? `<img src="${esc(logoUrl(G.opp.logo, 72))}" alt="">` : ''}<b>${esc(G.opp.name)}</b><span>ON OFFENSE</span></div>
    <div class="pb-strip" style="--me:${esc(G.me.color)};--op:${esc(G.opp.color)}"><i class="pb-mark" style="left:${at}%"></i></div>
    <div class="pb-dres" style="color:#ffd84a">${ord(down)} & ${toGo >= at ? 'GOAL' : toGo} AT YOUR ${at}</div>
    <p class="pb-sub">They're throwing at your man. You're the corner: stay on his hip, and when the ball's up, get in the ring and hit JUMP.</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="keycover">COVER HIM</button>${G.coach ? '<button class="pb-go alt" type="button" data-pb="keyskip">LET IT PLAY</button>' : ''}</div></div>`);
}
function keyStopPrompt(r, k, then){
  phase = 'modal';
  const at = r.path[k], toGo = Math.min(at, 4 + Math.floor(Math.random() * 8));   // inside the 10 it's goal to go
  keyPending = { r, k, then, toGo, down: 3, kind: 'rush' };
  modal(`<div class="pb-card pb-drive" style="--c:${esc(G.opp.color)}">
    <div class="pb-dh">${G.opp.logo ? `<img src="${esc(logoUrl(G.opp.logo, 72))}" alt="">` : ''}<b>${esc(G.opp.name)}</b><span>ON OFFENSE</span></div>
    <div class="pb-strip" style="--me:${esc(G.me.color)};--op:${esc(G.opp.color)}"><i class="pb-mark" style="left:${at}%"></i></div>
    <div class="pb-dres" style="color:#ffd84a">3RD & ${toGo >= at ? 'GOAL' : toGo} AT YOUR ${at}</div>
    <p class="pb-sub">Key third down. You're the edge rusher: get a sack or pressure and the drive stalls.</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="keyrush">RUSH THE PASSER</button>${G.coach ? '<button class="pb-go alt" type="button" data-pb="keyskip">LET IT PLAY</button>' : ''}</div></div>`);
}
let keyPending = null;
function startKeyDef(){
  const kp = keyPending; keyPending = null; if (!kp) return;
  closeModal();
  const main = G;
  keyCtx = { main, ...kp };
  G = S.newGame(main.opp, main.me, main.diffKey, main.lenKey);
  Object.assign(G, { youDefend: true, defDrill: { kind: kp.kind, full: kp.kind === 'cover' } });
  if (main.mods) G.mods = { ...S.MD, cb: main.mods.cb };
  showHud(true); defRep(true, 100 - kp.r.path[kp.k], kp.toGo); G.down = kp.down;
}
/* Back to the real game with the rep's result applied to their drive. */
function keyDone(g){
  const { main, r, k, then, toGo, opts } = keyCtx; keyCtx = null;
  G = main; showHud(true); lastHud = '';
  if (g.kind === 'rush'){
    const words = { sack: ['SACK!', '#4cff7a'], pressure: ['PRESSURE!', '#4cff7a'], blocked: ['NO PRESSURE', '#c9d1d9'], offside: ['OFFSIDE', '#ff5a4e'] };
    banner(...words[g.out], 1000);
    return finishOppDrive(S.applyStop(G, r, k, g.out), then);
  }
  // Your cover play: a turnover or a touchdown ends the drive right there; anything else, the rest of the drive
  // plays out from where the play ended (a little less likely to finish after a stop).
  const out = g.out === 'int' && !g.mine ? 'teamint' : g.out === 'pbu' && !g.mine ? 'teampbu' : g.out === 'catch' ? (g.gain >= toGo ? 'catch' : 'short') : g.out;
  const words = { int: ['PICKED OFF!', '#4cff7a'], teamint: ['PICKED OFF!', '#4cff7a'], fumble: ['FUMBLE!', '#4cff7a'], pbu: ['BROKEN UP!', '#4cff7a'], teampbu: ['BROKEN UP!', '#4cff7a'], inc: ['INCOMPLETE', '#4cff7a'],
    sack: ['SACKED!', '#4cff7a'], short: [`HELD TO ${g.gain}`, '#4cff7a'], catch: [`CAUGHT · +${g.gain}`, '#ff5a4e'], td: ['TOUCHDOWN', '#ff5a4e'] };
  banner(...words[out], 1000);
  if (['int', 'teamint', 'fumble', 'td'].includes(out))
    return finishOppDrive({ ...S.applyStop(G, r, k, out === 'td' ? 'td' : 'int', { x: g.x }), stop: null, cover: out }, then);
  const from = Math.max(1, Math.min(99, Math.round(r.path[k] - (g.gain || 0))));
  const rest = S.simDrive(G, from, { ...opts, behind: ['pbu', 'teampbu', 'inc', 'sack'].includes(out) });
  const merged = { ...rest, path: [...r.path.slice(0, k + 1), ...rest.path], plays: k + 1 + rest.plays, yards: r.path[0] - rest.endAt,
    time: Math.round((k + 1) * (17 + Math.random() * 7)) + rest.time, cover: out, coverGain: g.gain };
  const k2 = pickStop(merged, k + 1);
  if (k2 >= 0) return keyStopPrompt(merged, k2, then);
  finishOppDrive(merged, then);
}

/* ---------- take over: real late-game moments (challenges.js) ---------- */
const chalDone = id => saved.challenges?.[id];
const chalTeam = t => { const ti = teamInfo(t.id); return withImage({ ...ti, name: ti.name === 'Team' ? t.name : ti.name, abbr: ti.abbr === 'TEAM' ? t.abbr : ti.abbr,
  logo: ti.logo || t.logo, color: ti.color === '#5a6470' && t.color ? t.color : ti.color }); };
const clockText = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function challengesScreen(){
  phase = 'setup';
  const shell = body => modal(`<div class="pb-setup pb-chal"><div class="pb-ph"><b>TAKE OVER</b><button class="pb-x" type="button" data-pb="menu" aria-label="Back">${ICON.x}</button></div>
    <p class="pb-sub">Real moments from this week's close games. Take over for the team that lost and win it from there.</p>${body}</div>`);
  shell('<p class="pb-sub pb-load">Finding this week\'s late-game moments…</p>');
  weekChallenges().then(list => {
    if (!root || !$('.pb-chal')) return;
    if (!list.length) return shell('<p class="pb-sub">No close finishes yet this week. Check back once Saturday\'s games wrap up.</p>');
    const logoTag = t => t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="">` : '';
    shell(`<div class="pb-chlist">${list.map(c => { const d = chalDone(c.id);
      return `<div class="pb-ch${d?.won ? ' won' : ''}" style="--c:${esc(c.me.color || '#5a6470')}"><div class="pb-chh">${logoTag(c.me)}<b>${esc(c.me.abbr)}</b><i>vs</i>${logoTag(c.opp)}<b>${esc(c.opp.abbr)}</b>
        <span class="pb-chtag">${esc(c.tag.toUpperCase())}</span></div><p>${esc(c.title)}</p>
        <div class="pb-chf"><small>${d?.won ? 'BEATEN' : d ? `${d.tries} ${d.tries === 1 ? 'TRY' : 'TRIES'}` : 'REAL: ' + esc(c.real.toUpperCase())}</small>
        <button class="pb-go" type="button" data-pb="chalgo" data-id="${esc(c.id)}">${d?.won ? 'PLAY AGAIN' : 'PLAY'}</button></div></div>`; }).join('')}</div>`);
  });
}
/* Sets the scene from the real moment (score, quarter, clock, spot, down and distance), then the normal game flow
   takes over: your drive, their simulated drives, overtime if it's tied. */
function startChallenge(c){
  closeModal(); initAudio(saved.sound);
  G = S.newGame(chalTeam(c.me), chalTeam(c.opp), saved.diff, saved.len);
  attachNames(G.me, G.opp);
  Object.assign(G, { quarter: c.quarter, clock: c.clock, score: [...c.score], challenge: c, firstHalfReceiver: 'opp' });
  snaps = 0; showHud(true);
  S.startDrive(G, c.x); G.down = c.down; G.toGo = c.toGo; newDrive(); R.snapCamera(G); S.setupPlay(G);
  phase = 'modal';
  const lead = c.score[0] - c.score[1];
  modal(`<div class="pb-card pb-chintro"><span class="pb-chtag">${esc(c.tag.toUpperCase())}</span><h2>TAKE OVER</h2>${scoreLine(true)}
    <p class="pb-chsit">Q4 · ${clockText(c.clock)} · ${ord(c.down)} & ${c.toGo >= 100 - c.x ? 'GOAL' : c.toGo} · ${yardLine(c.x)}</p>
    <p>${esc(c.title)}</p><p class="pb-sub">${lead > 0 ? 'Win the game: run out the clock or score again.' : lead === 0 ? 'Win the game. Tied at the end goes to overtime.' : 'Win the game. Score, then make it hold.'} In real life, ${esc(c.real)}.</p>
    <button class="pb-go" type="button" data-pb="chalplay">PLAY IT</button></div>`);
}
function challengeFinal(){
  phase = 'final'; showHud(true);
  const c = G.challenge, won = G.score[0] > G.score[1];
  const rec = saved.challenges = saved.challenges || {}, r = rec[c.id] || { won: false, tries: 0 };
  if (!G.recorded){ G.recorded = true; r.tries++; if (won) r.won = true; rec[c.id] = r; save(); }
  sfx(won ? 'td' : 'boo'); if (won) G.cheer = 6;
  const noles = won && hdOn() && hdUI.cards.isFSU(G.me);
  modal(`<div class="pb-card pb-final${won ? ' won' : ''}${noles ? ' pb-fsu' : ''}">${noles ? hdUI.cards.fsuWin() : ''}<h2 style="color:${won ? '#4cff7a' : '#ff5a4e'}">${won ? 'CHALLENGE BEATEN!' : 'NOT THIS TIME'}</h2>${scoreLine(true)}
    <p>${won ? `You did what ${esc(c.me.name)} couldn't.` : `Same story as real life: ${esc(c.real)}.`}</p>
    <p class="pb-rec">${r.won ? 'Beaten' : 'Not beaten yet'} · ${r.tries} ${r.tries === 1 ? 'try' : 'tries'}</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="chalretry">${won ? 'PLAY AGAIN' : 'TRY AGAIN'}</button><button class="pb-go alt" type="button" data-pb="challenges">CHALLENGES</button><button class="pb-go alt" type="button" data-pb="exit">EXIT</button></div></div>`);
}

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
  newDrive(); R.snapCamera(G); banner(G.ot === 1 ? 'OVERTIME' : `${G.ot}OT`, '', '#7df9ff', 1100);
  presnap();
}
function otOpp(){
  phase = 'modal';
  const mine = G.score[0] - G.otBase[0];
  if (G.ot >= 3){
    const ok = S.simTwoPoint(G);
    modal(`<div class="pb-card"><h2>${esc(G.opp.name.toUpperCase())}</h2><p>Two-point try…</p><div class="pb-dres" style="color:${ok ? '#ff5a4e' : '#4cff7a'}" hidden>${ok ? 'GOOD' : 'NO GOOD!'}</div>
      <button class="pb-go" type="button" data-pb="otnext" hidden>CONTINUE</button></div>`);
    later(() => { if (ok) G.score[1] += 2; $('.pb-dres') && ($('.pb-dres').hidden = false); $('[data-pb="otnext"]') && ($('[data-pb="otnext"]').hidden = false); sfx(ok ? 'boo' : 'good'); }, 1100);
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
let sheetTab = 'std', hotOpen = false;
function playSheet(){
  const m = $('.pb-modal');
  if (phase !== 'presnap' || G.practice || m.classList.contains('on') && m.dataset.kind !== 'call') return;   // (open already: redrawn in place)
  const all = S.PRACTICE_ROLES, current = G.call === 'custom' ? 'u:' + G.callId : G.call || '';
  const card = (v, name, tip, routes) => `<button type="button" data-pb="callpick" data-v="${esc(v)}" aria-pressed="${current === v}"${G.recommended?.has(v) ? ' class="pb-starred"' : ''}>
      ${formationSVG(all, routes, true)}<b>${esc(name)}</b><small>${esc(tip)}</small></button>`;
  const custom = sheetTab === 'custom', runs = sheetTab === 'runs';
  const cards = custom
    ? (saved.plays.length ? saved.plays.map(p => card('u:' + p.id, p.name, 'Your play', p.routes)).join('')
      : '<p class="pb-sub pb-empty">No plays yet. Make some in My Playbook on the main menu (or save routes from practice).</p>')
    : runs ? Object.entries(S.RUN_CALLS).map(([k, c]) => card(k, c.name, c.tip, c.routes)).join('')
    : card('', 'Random', 'Mix it up, like always', {}) + Object.entries(S.CONCEPTS).map(([k, c]) => card(k, c.name, c.tip, c.routes)).join('');
  const form = G.formation || 'gun', tab = (v, l) => `<button type="button" data-pb="calltab" data-v="${v}" aria-pressed="${sheetTab === v}">${l}</button>`;
  // Hot routes: change any receiver's route on this play (it becomes a one-off custom call).
  const rec = G.play?.rec.filter(r => r.routeName !== 'block' || r.role === 'RB') || [], cur = Object.fromEntries(rec.map(r => [r.role, r.routeName]));
  modal(`<div class="pb-card pb-calls"><div class="pb-ph"><b>CALL A PLAY</b><button class="pb-x" type="button" data-pb="callclose" aria-label="Close">${ICON.x}</button></div>
    <div class="pb-forms" role="group" aria-label="Formation">${Object.entries(S.FORMATIONS).map(([k, l]) => `<button type="button" data-pb="formpick" data-v="${k}" aria-pressed="${form === k}">${l.toUpperCase()}</button>`).join('')}</div>
    <div class="pb-seg pb-tabs">${tab('std', 'PASS')}${tab('runs', 'RUN')}${tab('custom', `CUSTOM (${saved.plays.length})`)}</div>
    <div class="pb-callrow">${cards}</div>
    ${runs ? '' : `<div class="pb-callopts"><button type="button" class="pb-pa" data-pb="patoggle" aria-pressed="${!!G.pa}">PLAY ACTION${G.pa ? ' ON' : ''}</button><span>Fake the handoff first: backers bite (more if you've run well)</span></div>
    <details class="pb-hot"${hotOpen ? ' open' : ''}><summary>HOT ROUTES</summary>${routeRows(rec.map(r => r.role), cur, 'hot')}</details>`}
    <p class="pb-sub">Your call is for this play only; the formation stays until you change it.</p></div>`, true, 'call');
  $('.pb-hot')?.addEventListener('toggle', e => { hotOpen = e.target.open; });
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

const sideSwitch = () => `<div class="pb-seg pb-side"><button type="button" data-pb="pside" data-v="offense" aria-pressed="${saved.practice.side !== 'defense'}">OFFENSE</button><button type="button" data-pb="pside" data-v="defense" aria-pressed="${saved.practice.side === 'defense'}">DEFENSE</button></div>`;
function practiceSetup(keepScroll){
  const prevScroll = keepScroll ? $('.pb-setup')?.scrollTop : 0;
  phase = 'setup'; paused = false; behind = null;
  if (!G || G.practice || G.youDefend){ G = S.newGame(withImage(teamInfo(pick.me)), withImage(teamInfo(pick.opp)), saved.diff, saved.len); S.setupPlay(G); R.snapCamera(G); }
  showHud(false);
  const P = saved.practice, roles = practiceRoles(), routes = practiceRoutes();
  if (P.side === 'defense'){
    modal(`<div class="pb-setup pb-practice">
      <div class="pb-ph"><b>PRACTICE</b><button class="pb-x" type="button" data-pb="back" aria-label="Back">${ICON.x}</button></div>
      ${sideSwitch()}
      <p class="pb-sub">Defense against ${esc(G.opp.name)}'s offense: you control one defender (gold), their quarterback reads and throws. Graded every rep.</p>
      ${defSetupHTML()}
    </div>`);
    if (prevScroll) $('.pb-setup').scrollTop = prevScroll;
    return;
  }
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

    ${sideSwitch()}
    <div class="pb-form">${drillPreview(roles, routes, G.me.color)}
      <p>${roles.length} receiver${roles.length === 1 ? '' : 's'} out · ${P.mode === 'concept' ? esc((P.concept?.startsWith('u:') ? findPlay(P.concept.slice(2))?.name : S.CONCEPTS[P.concept]?.name) || '') : P.mode === 'pick' ? 'Your routes' : 'Random routes'}</p></div>
    <div class="pb-opt"><span>Receivers out</span>${seg('count', [1, 2, 3, 4, 5].map(n => [n, n]))}</div>
    <div class="pb-opt"><span>Routes</span>${seg('mode', [['random', 'Random'], ['concept', 'Concepts'], ['pick', 'Pick routes']])}</div>
    ${routesUI}
    <div class="pb-opt"><span>Start at</span>${seg('spot', SPOTS)}</div>
    <div class="pb-opt"><span>Throw to</span>${seg('target', [['on', 'Called target'], ['off', 'Anyone']])}</div>
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
  G.practice = { roles: practiceRoles(), mode: saved.practice.mode, routes: practiceRoutes(), target: saved.practice.target === 'on' };
  G.ps = { att: 0, comp: 0, yds: 0, td: 0, long: 0, runs: 0, runYds: 0, last: '', gradeSum: 0, graded: 0, streak: 0, bestStreak: 0, best: 0,
    timing: 0, accuracy: 0, release: 0, inStride: 0, targeted: 0, hits: 0, n: SESSIONS[saved.practice.session]?.n || 5, session: saved.practice.session, drill: drillName() };
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
      if (P.target){ ps.targeted++; if (!g.wrong) ps.hits++; }
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
  return `${n} WR · ${routes} · ${SPOTS.find(([v]) => v === P.spot)?.[1] || ''}${P.target === 'on' ? ' · target' : ''}`;
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
    ${ps.targeted ? `<p class="pb-sub">Target hits: <b style="color:${gradeColor(Math.round(ps.hits / ps.targeted * 100))}">${ps.hits}/${ps.targeted}</b></p>` : ''}
    <div class="pb-gbars wide">${bar('TIMING', rec.timing)}${bar('ACCURACY', rec.accuracy)}${bar('RELEASE', rec.release)}</div>
    <p class="pb-sub">${esc(ps.drill)} · saved to your history</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="pagain">GO AGAIN</button><button class="pb-go alt" type="button" data-pb="psetup">PRACTICE MENU</button></div>
    <div class="pb-btns"><button class="pb-go alt sm" type="button" data-pb="menu">MAIN MENU</button><button class="pb-go alt sm danger" type="button" data-pb="pdel" data-id="${rec.id}" data-long="1">DELETE THIS SESSION</button></div>
  </div>`);
  if (G.seasonDrill) seasonDrillCard(avg);
}
/* Your saved sessions on the practice screen: newest first, best one starred, each deletable. */
function historyHTML(side = 'offense'){
  const list = saved.sessions.filter(x => (x.side || 'offense') === side);
  if (!list.length) return '<p class="pb-sub pb-nohist">Finish a session and it shows up here.</p>';
  const best = list.reduce((a, b) => b.avg > a.avg ? b : a, list[0]);
  const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<div class="pb-hist"><span class="pb-hh">Your sessions <small>${list.length} saved · best ${letter(best.avg)} (${best.avg})</small></span>
    ${list.slice(0, 12).map(x => `<div class="pb-hr${x === best ? ' best' : ''}"><b style="color:${gradeColor(x.avg)}">${letter(x.avg)}</b>
      <div><span>${x === best ? '<i class="pb-best">BEST</i>' : ''}${esc(SESSIONS[x.session]?.name || '')} · ${x.throws} ${side === 'defense' ? 'reps' : 'throws'} · ${x.avg}</span><small>${esc(day(x.at))} · ${esc(x.drill || '')} · ${side === 'defense' ? esc(x.stat || '') : `${x.inStride}% in stride`}</small></div>
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
    <div class="pb-gw"><em>${esc(g.word)}</em><span>${g.score}${g.who ? ` · ${G.play?.target ? 'target: ' : ''}${esc(S.ROLE_NAMES[g.who] || '')}` : ''}</span></div>
    <div class="pb-gbars">${(g.bars || [['TIMING', g.timing], ['ACCURACY', g.accuracy], ['RELEASE', g.release]]).map(([k, v]) => bar(k, v)).join('')}</div>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(gradeTimer); gradeTimer = setTimeout(() => el.classList.remove('on'), 2600);
  if (g.score >= 93) sfx('first');
}

function practiceHud(){
  const ps = G.ps, spot = SPOTS.find(([v]) => v === saved.practice.spot)?.[1] || yardLine(G.los);
  const btns = '';
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
  if (G.challenge) return challengeFinal();
  if (G.season){
    const complete = (G.ot > 0 || G.quarter >= 4 && G.clock <= 0) && G.score[0] !== G.score[1];
    if (complete && !G.recorded){ G.recorded = true; return SV.gameOver(G); }
  }
  phase = 'final'; showHud(true);
  const won = G.score[0] > G.score[1], st = G.stats;
  // Only a game played to the end counts, and only once.
  const rec = saved.results[G.diffKey] || { w: 0, l: 0 };
  const complete = (G.ot > 0 || G.quarter >= 4 && G.clock <= 0) && G.score[0] !== G.score[1];
  if (complete && !G.recorded){ G.recorded = true; won ? rec.w++ : rec.l++; saved.results[G.diffKey] = rec; save(); }
  sfx(won ? 'td' : 'boo');
  if (won) G.cheer = 6;
  const noles = won && hdOn() && hdUI.cards.isFSU(G.me);   // HD: Florida State's own final card
  modal(`<div class="pb-card pb-final${won ? ' won' : ''}${noles ? ' pb-fsu' : ''}">${noles ? hdUI.cards.fsuWin() : ''}<h2 style="color:${won ? '#4cff7a' : '#ff5a4e'}">${won ? 'VICTORY!' : 'FINAL'}</h2>${scoreLine(true)}${driveRecap()}
    <table class="pb-tbl"><tr><td>Passing</td><td>${st.comp}/${st.att}, ${st.passYds} yds, ${st.passTD} TD, ${st.int} INT</td></tr>
    <tr><td>Rushing</td><td>${st.rush} for ${st.rushYds} yds, ${st.rushTD} TD</td></tr>
    <tr><td>Kicking</td><td>${st.fgm}/${st.fga} FG</td></tr><tr><td>Longest play</td><td>${st.longest} yds</td></tr>
    <tr><td>Sacked</td><td>${st.sacks}</td></tr></table>
    <p class="pb-rec">${S.DIFFS[G.diffKey].name} record: ${rec.w}–${rec.l}</p>
    <div class="pb-btns"><button class="pb-go" type="button" data-pb="rematch">REMATCH</button><button class="pb-go alt" type="button" data-pb="menu">NEW GAME</button><button class="pb-go alt" type="button" data-pb="exit">EXIT</button></div></div>`);
}
function scoreLine(big){
  const hp = hdOn() ? hdUI.cards.pair(G.me, G.opp) : null;
  const t = (x, s) => `<div class="pb-sl" data-tid="${esc(x.id)}" style="${hp ? hp[x === G.me ? 0 : 1] : `--c:${esc(x.color)};--k:${inkOn(x.color)}`}">${x.logo ? `<img src="${esc(logoUrl(x.logo, 72))}" alt="">` : ''}<b>${esc(x.abbr)}</b><span>${s}</span></div>`;
  return `<div class="pb-score${big ? ' big' : ''}">${t(G.me, G.score[0])}${t(G.opp, G.score[1])}</div>`;
}

/* ---------- pause ---------- */
/* Pause works whatever's happening (a play, a kick, a drive card, a drill, a key defensive play): the menu sits over
   it and the game's flow waits (see later()). */
function pause(){
  if (!G || paused || phase === 'setup') return;
  paused = true;
  const drill = G.practice || G.youDefend && !keyCtx, main = keyCtx ? keyCtx.main : G, done = phase === 'final';
  const btn = (a, l, alt = true) => `<button class="pb-go${alt ? ' alt' : ''}" type="button" data-pb="${a}">${l}</button>`;
  const items = drill
    ? [btn('resume', 'RESUME', false), btn('endsess', G.seasonDrill ? 'BACK TO GAME WEEK' : 'END SESSION'), btn('menu', 'MAIN MENU'), btn('exit', 'EXIT TO BOARD')]
    : [btn('resume', 'RESUME', false), done ? '' : btn('restart', 'RESTART GAME'),
      main.season ? btn('s-hub', done ? 'SEASON HUB' : "SEASON HUB (GAME WON'T COUNT)") : btn('menu', 'MAIN MENU'), btn('exit', 'EXIT TO BOARD')];
  modal(`<div class="pb-card"><h2>PAUSED</h2>${drill || keyCtx ? '' : scoreLine()}<div class="pb-btns col">${items.join('')}</div></div>`, false, 'pause');
}
let behind = null;
function unpause(){ paused = false; closeModal('pause'); }

/* ---------- HUD, banners, modals ---------- */
let lastHud = '';
function showHud(on){ $('.pb-hud').hidden = !on; $('.pb-tools').hidden = !on; root.classList.toggle('pb-tools-on', on); if (!on){ $('.pb-bar').innerHTML = ''; $('.pb-hint').textContent = ''; } lastHud = ''; }
function hud(){
  if (!root || !G || $('.pb-hud').hidden) return;
  if (G.practice) return practiceHud();
  if (G.youDefend) return defHud();
  const q = G.ot ? (G.ot === 1 ? 'OT' : `${G.ot}OT`) : `Q${G.quarter}`;
  const dd = G.twoPt ? '2-POINT TRY' : `${ord(G.down)} & ${G.toGo >= 100 - G.los ? 'GOAL' : G.toGo}`;
  const late = S.lateInHalf(G), live = phase === 'presnap';
  const callName = (S.RUN_CALLS[G.call]?.name || (G.call === 'custom' ? G.callName : S.CONCEPTS[G.call]?.name || 'Random')) + (G.pa ? ' · PA' : '') + (G.formation && G.formation !== 'gun' ? ` · ${S.FORMATIONS[G.formation]}` : '');
  const sheetUp = $('.pb-modal').classList.contains('on');
  const H = hdOn() && hdUI.hud;   // HD: the broadcast bug and glass buttons (hdui-hud.js)
  const btns = !live || paused ? '' : [
    sheetUp ? '' : H ? H.callBtn(callName.toUpperCase()) : `<button type="button" data-pb="call" class="pb-call">PLAY: ${esc(callName.toUpperCase())} ▾</button>`,
    G.coach && !sheetUp ? (H ? H.chip('snap', 'SNAP ▶', '', 'go') : '<button type="button" data-pb="snap" class="pb-snapbtn">SNAP ▶</button>') : '',
    G.runoff > 0 && G.timeouts > 0 && !G.ot ? (H ? H.chip('timeout', 'TIMEOUT', `${G.timeouts} LEFT`) : `<button type="button" data-pb="timeout">TIMEOUT (${G.timeouts})</button>`) : '',
    late && G.runoff > 0 && G.down < 4 && !G.twoPt ? (H ? H.chip('spike', 'SPIKE') : '<button type="button" data-pb="spike">SPIKE</button>') : '',
    late && G.score[0] > G.score[1] && !G.twoPt && G.quarter === 4 ? (H ? H.chip('kneel', 'KNEEL') : '<button type="button" data-pb="kneel">KNEEL</button>') : '',
    S.inFgRange(G) && G.down < 4 && !G.twoPt && (late || G.ot) ? (H ? H.chip('fg', 'FG', `${S.fgDistance(G)} YDS`) : `<button type="button" data-pb="fg">FG · ${S.fgDistance(G)}</button>`) : ''
  ].join('');
  const hint = hintText();
  // HD: who has the ball (yours on your snaps and kicks, theirs while their drive plays out).
  const poss = !H ? '' : ['presnap', 'live', 'dead', 'kick', 'replay'].includes(phase) ? 'me' : $('.pb-modal .pb-drive') ? 'opp' : '';
  const key = [G.score, q, Math.ceil(G.clock), dd, G.los, G.timeouts, btns, hint, G.runoff > 0, live && G.tellOn ? filmTell() : '', poss, H ? phase : ''].join('|');
  if (key === lastHud) return; lastHud = key;
  if (H) return hudHD(H, dd, poss, live && G.tellOn && G.play ? filmTell() : '', btns, hint);
  const tm = (t, s) => `<div class="pb-tm" style="--c:${esc(t.color)};--k:${inkOn(t.color)}">${t.logo ? `<img src="${esc(logoUrl(t.logo, 72))}" alt="">` : ''}<b>${esc(t.abbr)}</b><span>${s}</span></div>`;
  $('.pb-bug').innerHTML = `${tm(G.me, G.score[0])}<div class="pb-mid"><span>${q}</span><b class="${G.runoff > 0 ? 'run' : ''}">${G.ot ? '--' : mmss(G.clock)}</b></div>${tm(G.opp, G.score[1])}`;
  const tell = live && G.tellOn && G.play ? filmTell() : '';
  $('.pb-dd').innerHTML = phase === 'kick' || !G.play && !G.kick ? '' : `<span>${dd}</span><span>${yardLine(G.los)}</span><span class="pb-to">${'●'.repeat(G.timeouts)}${'○'.repeat(3 - G.timeouts)}</span>${tell ? `<span class="pb-tell">${tell}</span>` : ''}`;
  $('.pb-bar').innerHTML = btns;
  $('.pb-hint').textContent = hint;
}
/* HD: the bug is redrawn only when the score, the quarter, the timeouts or the ball change (so its slide-ins and the
   score flash play once); the clock ticks in place; the down & distance tab slides out again on each new spot. */
let hdScore = null;
function hudHD(H, dd, poss, tell, btns, hint){
  const bug = $('.pb-bug'), ddEl = $('.pb-dd');
  const running = !G.ot && (G.runoff > 0 || phase === 'live');
  const st = { me: G.me, opp: G.opp, score: G.score, q: G.ot ? (G.ot === 1 ? 'OT' : `${G.ot}OT`) : ord(G.quarter), clock: G.ot ? '--' : mmss(G.clock), running, poss, tos: G.timeouts };
  const bk = [G.me.id, G.opp.id, G.score, st.q, poss, G.timeouts].join('|');
  if (bk !== bug.dataset.hk || !bug.querySelector('.hb-clk')){
    const prev = hdScore?.g === G ? hdScore.s : G.score;
    st.flash = [G.score[0] > prev[0], G.score[1] > prev[1]];
    hdScore = { g: G, s: [...G.score] };
    bug.innerHTML = H.bug(st); bug.dataset.hk = bk;
  } else {
    const c = bug.querySelector('.hb-clk b'); c.querySelector('em').textContent = st.clock; c.querySelector('i').classList.toggle('on', running);
  }
  let dk = '';
  if (!(phase === 'kick' || !G.play && !G.kick)){
    const x = Math.round(G.los), P = hdUI.kit.teamPaint(G.me, G.opp);
    dk = H.dd({ text: dd, goal: !G.twoPt && G.toGo >= 100 - G.los, spot: x === 50 ? 'MIDFIELD' : x < 50 ? `${G.me.abbr} ${x}` : `${G.opp.abbr} ${100 - x}`, side: x === 50 ? '#fff' : x < 50 ? P.me.c : P.opp.c, tell });
  }
  if (dk !== ddEl.dataset.hk || (dk ? !ddEl.querySelector('.hb-dd') : ddEl.innerHTML)){ ddEl.innerHTML = dk; ddEl.dataset.hk = dk; }
  $('.pb-bar').innerHTML = btns;
  $('.pb-hint').textContent = hint;
}
function hintText(){
  if (paused) return '';
  if (G?.youDefend) return defHint();
  const touch = coarse();
  if (phase === 'kick'){
    const st = G.kick?.stage;
    if (st === 'aim') return `${touch ? 'Tap' : 'Click or press Space'} to lock the aim · wind ${Math.abs(G.kick.wind)} mph ${G.kick.wind > 0 ? (R.portrait ? '→' : '↓') : G.kick.wind < 0 ? (R.portrait ? '←' : '↑') : ''}`;
    if (st === 'power') return `${touch ? 'Tap' : 'Click or press Space'} to set the power · red risks a hook`;
    return '';
  }
  if (snaps > 8 && saved.diff !== 'rookie' && !G.coach) return '';
  if (G.practice && G.play?.target && (phase === 'presnap' || phase === 'live' && S.canThrow(G))) return `Hit the gold target: the ${(S.ROLE_NAMES[G.play.target.role] || '').toLowerCase()} · press and pull back`;
  if (G.coach && phase === 'presnap' && !G.play?.userCtl) return touch ? 'Coach mode: call a play, then SNAP · touch the field to play this snap yourself' : 'Coach mode: call a play, then SNAP · click the field to play this snap yourself';
  if (G.coach && phase === 'live' && coaching()) return touch ? 'Touch the field to take over' : 'Click the field to take over';
  if (phase === 'presnap' && G.call === 'option') return touch ? 'Snap, then read the end (gold ring): he takes the back, keep it; he sits, tap the back' : 'Snap, then read the end (gold ring): he takes the back, keep it; he sits, H to give';
  if (phase === 'presnap' && G.call === 'qbdraw') return touch ? 'Tap to snap: show pass, then the quarterback runs it' : 'Space to snap: show pass, then the quarterback runs it';
  if (phase === 'presnap') return S.RUN_CALLS[G.call] ? (touch ? 'Tap to snap and run' : 'Click or press Space to snap and run') : touch ? 'Press and pull back to throw · tap the glowing back to run' : 'Press and pull back to throw · click the glowing back (or H) to run · Space snaps';
  if (phase === 'live'){
    if (G.play.carrier) return touch ? 'Drag to steer · JUKE as he closes in · TRUCK through him' : 'Arrows to steer · Space juke (time it as he closes) · X truck, or dive with no one in front';
    if (S.canThrow(G)) return touch ? 'Pull back to throw · tap a receiver for a quick throw · tap the glowing back to hand off' : 'Pull back and release to throw · 1–5 throw to a receiver · H hand off';
  }
  return '';
}
let bannerTimer = 0;
function banner(text, sub, color = '#fff', ms = 1200){
  const b = $('.pb-banner'); if (!b) return;
  if (typeof color === 'number'){ ms = color; color = sub; sub = ''; }   // banner(word, color, ms)
  if (hdOn()){
    // HD: the big ones (a touchdown, two points, a pick six) wipe in in the scoring team's colors; the rest are slabs.
    const team = !G ? null : /^PICK SIX/.test(text) || color !== G.me.color ? G.opp : G.me;
    const h = hdUI.hud.banner(text, sub, color, team);
    b.className = `pb-banner ${h.cls}`; b.innerHTML = h.html;
  } else { b.className = 'pb-banner'; b.innerHTML = `<b style="--bc:${esc(color)}">${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`; }
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('on'), ms);
}
function modal(html, light = false, kind = ''){
  const m = $('.pb-modal');
  if (kind !== 'pause' && paused) return;   // a game event never covers the pause menu
  if (kind === 'pause'){ behind = m.innerHTML ? { html: m.innerHTML, light: m.classList.contains('light') } : null; }
  // The same sheet redrawn in place (a formation or play-action switch on the play sheet): no entrance again, and
  // everything stays scrolled where it was, so a tap never makes it jump.
  const same = kind && kind === m.dataset.kind && m.classList.contains('on');
  const scrolls = same ? [...m.querySelectorAll('*')].map(el => [el.scrollTop, el.scrollLeft]) : null;
  m.innerHTML = html; m.classList.add('on'); m.classList.toggle('light', light); m.dataset.kind = kind;
  m.classList.toggle('stay', !!same);
  if (scrolls) [...m.querySelectorAll('*')].forEach((el, i) => { const s = scrolls[i]; if (s && (s[0] || s[1])){ el.scrollTop = s[0]; el.scrollLeft = s[1]; } });
  m.classList.toggle('fsu', hdOn() && hdUI.cards.isFSU(keyCtx ? keyCtx.main.me : G?.youDefend ? G.opp : G?.me));   // HD: garnet and gold when Florida State is yours
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
  if (a.startsWith('s-')){ if (paused){ paused = false; behind = null; } return SV.click(a, b); }
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
    case 'calltab': sheetTab = b.dataset.v; return playSheet();   // redrawn in place (modal() keeps it still)
    case 'formpick': G.formation = b.dataset.v; if (phase === 'presnap') S.setupPlay(G); return playSheet();   // redrawn in place (modal() keeps it still)
    case 'patoggle': G.pa = !G.pa; if (S.RUN_CALLS[G.call]) G.call = null; if (phase === 'presnap') S.setupPlay(G); return playSheet();   // redrawn in place (modal() keeps it still)
    case 'hot': {
      const cur = Object.fromEntries(G.play.rec.map(r => [r.role, r.routeName]));
      cur[b.dataset.role] = b.dataset.v || undefined;
      Object.assign(G, { call: 'custom', callId: null, callName: 'Hot routes', callRoutes: cur });
      if (phase === 'presnap') S.setupPlay(G); return playSheet();
    }
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
    case 'pstart': return saved.practice.side === 'defense' ? startDefDrill() : startPractice();
    case 'dagain': return startDefDrill();
    case 'keyrush': case 'keycover': return startKeyDef();
    case 'psetup': return practiceSetup();
    case 'pagain': return startPractice();
    case 'pside': saved.practice.side = b.dataset.v; return practiceSetup();
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
    case 'menu': paused = false; behind = null; keyCtx = null; closeModal(); return setup();
    case 'snap': return doSnap();
    case 'dcall': return pickDriveCall(b.dataset.v);
    case 'keyskip': { const kp = keyPending; keyPending = null; closeModal(); return kp && finishOppDrive(kp.r, kp.then); }
    case 'sdrill': { const d = G.seasonDrill; return d && SV.drillDone(d.area, d.score); }
    case 'resume': return unpause();
    case 'penacc': { closeModal(); const p = pendingPen; pendingPen = null; return takePenalty(p); }
    case 'pendec': { closeModal(); pendingPen = null; banner('DECLINED', 'Keep the play', '#c9d1d9', 900); return applyPlay(); }
    case 'endsess': { paused = false; behind = null; closeModal(); const d = G.seasonDrill; return d ? SV.drillDone(d.area, d.score) : practiceSetup(); }
    case 'restart': { paused = false; behind = null; closeModal(); if (keyCtx){ G = keyCtx.main; keyCtx = null; } return G.challenge ? startChallenge(G.challenge) : G.season ? startGame(G.seasonCfg) : startGame(); }
    case 'challenges': return challengesScreen();
    case 'chalgo': { const c = challengeById(b.dataset.id); return c && startChallenge(c); }
    case 'chalplay': closeModal(); return presnap();
    case 'chalretry': return startChallenge(G.challenge);
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
    if (k === 'hd') useHD(saved.hd).then(hdRepaint);
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
  if (ptr && ptr.id !== e.pointerId && ptr.mode === 'dstick') return;   // covering: one steering finger at a time
  try{ canvas.setPointerCapture(e.pointerId); }catch{}
  const p = local(e), w = R.toWorld(p.x, p.y), now = performance.now();
  // Coach mode: touching the field takes this snap yourself.
  if (coaching() && (phase === 'presnap' || phase === 'live')){ G.play.userCtl = true; if (phase === 'live') banner('YOU HAVE IT', '', '#7df9ff', 700); }
  ptr = { id: e.pointerId, x0: p.x, y0: p.y, mode: 'none', samples: [{ ...p, t: now }] };
  if (phase === 'kick'){ S.kickTap(G); return; }
  if (G.youDefend){   // on defense: rush taps, or steer your defender (the JUMP button goes for the ball)
    if (G.defDrill.kind === 'rush') return rushTap();
    // Steering is a stick, not "go where my finger is": the camera moves during the play, so a spot on the screen
    // isn't a fixed spot on the field, and a tap must never send him running somewhere.
    ptr.mode = 'dstick'; steerStick(p);
    return;
  }
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
  if (P.carrier){ ptr.mode = 'cstick'; steerStick(p, 'carStick'); return; }
  // Generous targets for fingers: the back (hand off) or the quarterback (scramble), whichever is nearer.
  const dRb = hypot(w, P.rb), dQb = hypot(w, P.qb);
  if (S.canHandoff(G) && dRb < 3.2 && dRb < dQb){ S.handoff(G); return; }
  if (S.canThrow(G)){
    if (dQb < 2.2 && !fresh){ ptr.mode = 'qb'; input.qbMove = w; }
    else {
      ptr.mode = 'aim'; aim = { active: false, target: null };
      // A quick tap on a receiver (no pull) throws to him; pressing and pulling back is the slingshot as always.
      if (!fresh){
        // Measured from the middle of his body, which stands taller in HD.
        const mid = R.figure ?? 8;
        const near = P.rec.filter(r => r.routeName !== 'block' && !r.down).map(r => { const [sx, sy] = R.toScreen(r.x, r.y); return { r, d: Math.hypot(sx - p.x, sy - mid - p.y) }; }).sort((a, b) => a.d - b.d)[0];
        if (near && near.d < Math.max(18, mid * 2)){ ptr.tapRec = near.r.num; ptr.t0 = now; }
      }
    }
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
  else if (ptr.mode === 'dstick') steerStick(p);
  else if (ptr.mode === 'cstick') steerStick(p, 'carStick');
  // A finger already down when the ball changes hands (a handoff tap, a catch) becomes the stick from here.
  else if (carrierLive() && (ptr.mode === 'none' || ptr.mode === 'aim')){ ptr.mode = 'cstick'; ptr.x0 = p.x; ptr.y0 = p.y; aim = null; steerStick(p, 'carStick'); }
}
function up(e){
  if (!ptr || ptr.id !== e.pointerId) return;
  if (ptr.mode === 'aim' && aim?.active && S.canThrow(G)) S.userThrow(G, aim.target.x, aim.target.y);
  else if (ptr.mode === 'aim' && ptr.tapRec && performance.now() - ptr.t0 < 400 && S.canThrow(G)) S.throwToReceiver(G, ptr.tapRec);
  aim = null; input.qbMove = null; input.targetY = null; input.defStick = null; input.carStick = null; ptr = null;
}
function cancel(){ aim = null; input.qbMove = null; input.targetY = null; input.defStick = null; input.carStick = null; ptr = null; }
function resetInput(){ Object.assign(input, { targetY: null, steer: 0, juke: 0, dive: false, truck: false, qbMove: null, qbKeys: null, defStick: null, carStick: null }); ptr = null; aim = null; }

/* With the ball (yours, not on defense): the JUKE and TRUCK buttons. JUKE glows gold when a defender is in the
   sweet spot for one (about two yards out); TRUCK reads DIVE when nobody's in front to run through. */
/* Coach mode: your players run the snap unless you've touched the field to take it. */
const coaching = () => G?.coach && !G.youDefend && !G.practice && G.play && !G.play.userCtl;
const carrierLive = () => G?.play?.carrier && !G.youDefend && phase === 'live' && !G.play.result && !coaching();
let movesState = '';
function syncMoves(){
  const box = $('.pb-moves'); if (!box) return;
  let st = 'off';
  if (carrierLive() && !paused && !$('.pb-modal').classList.contains('on')){
    const c = G.play.carrier, sp = Math.hypot(c.vx, c.vy) || 1;
    const ahead = G.play.def.filter(d => !d.down && d.stun <= 0 && !d.eng && ((d.x - c.x) * c.vx + (d.y - c.y) * c.vy) / sp > -.3).map(d => Math.hypot(d.x - c.x, d.y - c.y));
    const near = Math.min(99, ...ahead);
    st = `${near > 1.2 && near < 3.1 && (c.jukeCD || 0) <= 0 ? 'hot' : 'on'}|${near < 2.4 ? 'TRUCK' : 'DIVE'}`;
  }
  if (st === movesState) return; movesState = st;
  box.hidden = st === 'off'; if (st === 'off') return;
  const [heat, label] = st.split('|');
  box.querySelector('[data-mv="juke"]').classList.toggle('hot', heat === 'hot');
  box.querySelector('[data-mv="truck"]').textContent = label;
}

/* Jump the route: only while the ball is in the air (an early press would waste the jump's cooldown). */
const coverLive = () => G?.youDefend && G.defDrill?.kind === 'cover' && G.play;
function jumpRoute(){ if (coverLive() && phase === 'live' && G.play.ball.state === 'air') input.jump = true; }
/* The JUMP button shows on cover plays, dim until the ball is thrown, lit while it's in the air. */
let jumpState = '';
function syncJump(){
  const b = $('.pb-jump'); if (!b) return;
  const show = !!coverLive() && !paused && (phase === 'dpre' || phase === 'live') && !$('.pb-modal').classList.contains('on');
  const st = !show ? 'off' : phase === 'live' && G.play.ball.state === 'air' ? 'hot' : 'on';
  if (st === jumpState) return; jumpState = st;
  b.hidden = st === 'off'; b.classList.toggle('hot', st === 'hot');
}

/* The stick (your defender, or your ball carrier): the drag from where the finger went down sets direction, and how
   far (up to the ring) sets speed. */
function steerStick(p, key = 'defStick'){
  // The ring stays where the finger went down until it lifts; dragging past the edge just holds the knob on the rim
  // (full speed that way), so going back the other way is always the same short move.
  const r = Math.max(10, Math.round(Math.min(R.W, R.H) * .09)), dead = r * .18;
  let dx = p.x - ptr.x0, dy = p.y - ptr.y0, len = Math.hypot(dx, dy);
  if (len > r){ dx = dx / len * r; dy = dy / len * r; len = r; }
  ptr.stick = { ax: ptr.x0, ay: ptr.y0, kx: ptr.x0 + dx, ky: ptr.y0 + dy, r };
  if (len < dead){ input[key] = null; return; }
  const v = R.dragToWorld(dx, dy), n = Math.hypot(v.x, v.y) || 1, m = Math.min(1, (len - dead) / (r - dead));
  input[key] = { x: v.x / n * m, y: v.y / n * m };
}

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
    if (G.youDefend){ if (G.defDrill.kind === 'rush') return rushTap(); jumpRoute(); return; }
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
  if (phase !== 'live' || G.youDefend) return;   // offense keys (throws, handoff, dive) do nothing on defense
  if (/^[1-5]$/.test(k)){ e.preventDefault(); S.throwToReceiver(G, Number(k)); return; }
  if (k === 'h'){ e.preventDefault(); S.handoff(G); return; }
  if (k === 'x'){ e.preventDefault(); if (G.play.carrier) input.truck = true; }
}
function keyup(e){ const k = KEYMAP[e.key.toLowerCase()]; if (k) keys.delete(k); }
function readKeys(){
  const u = keys.has('up'), d = keys.has('down'), l = keys.has('left'), r = keys.has('right');
  const lat = R.portrait ? (r ? 1 : 0) - (l ? 1 : 0) : (d ? 1 : 0) - (u ? 1 : 0);
  const fwd = R.portrait ? (u ? 1 : 0) - (d ? 1 : 0) : (r ? 1 : 0) - (l ? 1 : 0);
  input.steer = lat;
  input.qbKeys = lat || fwd ? { x: fwd, y: lat } : null;
  input.defKeys = input.qbKeys;
  // Arrow keys steer the ball carrier like the stick (unless a finger is already steering).
  if (ptr?.mode !== 'cstick'){ const n = Math.hypot(fwd, lat); input.carStick = n ? { x: fwd / n, y: lat / n } : null; }
}

/* ---------- copy and styles ---------- */
const HOW = `<ul>
  <li><b>Pass:</b> press anywhere and drag <i>back</i> like a slingshot: the press snaps the ball, release throws. The arc shows where it lands; lead your receiver. The longer the pull, the longer the throw: white is a quick bullet, blue a touch throw over the linebackers, gold a deep ball. Colored tags show who's open (green), tight (yellow) or covered (red). Keys 1–5 throw to that receiver.</li>
  <li><b>Run:</b> tap the glowing running back (H on a keyboard) to snap and hand off in one go. A plain tap just snaps; press on the QB and drag to scramble.</li>
  <li><b>With the ball:</b> drag anywhere to steer (like a joystick: you can cut, stop and cut back). JUKE beats the man closing in if you time it as he arrives; the button glows when it's time. TRUCK lowers your shoulder into him, or dives for the extra yard when no one's in front. Keys: arrows or WASD, Space to juke, X to truck.</li>
  <li><b>Kicks:</b> tap to lock the aim, tap again for power. Mind the wind.</li>
  <li><b>Take over:</b> replay real late-game moments from this week's close games: the real score, clock, spot and teams. Win the game to beat the challenge.</li>
  <li><b>Defense:</b> every opponent drive has a pass play at your man (you're the gold-ringed corner): drag anywhere to steer, and when the ball's up get in the yellow ring and hit JUMP (Space). Key third downs make you the edge rusher: tap at the snap, then tap in the green.</li>
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
.pb-tools{position:absolute;z-index:6;right:calc(env(safe-area-inset-right,0px) + 8px);top:calc(env(safe-area-inset-top,0px) + 8px);display:flex;gap:6px}
/* Pause stays reachable over every card: cards start below it. */
.pb.pb-tools-on .pb-modal{padding-top:calc(env(safe-area-inset-top,0px) + 54px)}
.pb-tools button{width:34px;height:34px;display:grid;place-items:center;background:#101215;border:2px solid #000;box-shadow:0 0 0 2px #2c3138}
.pb-tools svg{width:16px;height:16px;image-rendering:pixelated}
.pb-bar{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 34px);display:flex;justify-content:center;gap:8px;pointer-events:none}
/* Cover plays: the JUMP button, bottom left (under the left thumb). Dim until the ball is thrown, gold and pulsing while it's up. */
.pb-jump{position:absolute;left:calc(env(safe-area-inset-left,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 64px);width:74px;height:74px;border-radius:50%;
  display:grid;place-items:center;background:#101215;border:2px solid #000;box-shadow:0 0 0 3px #3a4048,0 4px 0 #000;color:#7c848e;font-size:10px;letter-spacing:.06em;
  touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;transition:background .12s,color .12s}
.pb-jump[hidden]{display:none}
.pb-rp{position:absolute;right:calc(env(safe-area-inset-right,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 70px);padding:12px 14px;font-size:10px;
  background:#101215;color:#ffd84a;border:2px solid #000;box-shadow:0 0 0 2px #ffd84a,0 4px 0 #000}
.pb-rp[hidden]{display:none}
.pb-rlabel{position:absolute;left:16px;top:calc(env(safe-area-inset-top,0px) + 92px);font-size:12px;color:#ff5a4e;text-shadow:0 2px 0 #000;display:none;animation:pb-blink 1s steps(2) infinite}
.pb::before,.pb::after{content:"";position:absolute;left:0;right:0;height:0;background:#000;z-index:1;transition:height .25s;pointer-events:none}
.pb::before{top:0} .pb::after{bottom:0}
.pb.pb-replaying::before,.pb.pb-replaying::after{height:9vh}
.pb.pb-replaying .pb-rlabel{display:block}
@keyframes pb-blink{50%{opacity:.25}}
/* With the ball: JUKE and TRUCK, bottom left. JUKE glows when a defender is in the sweet spot. */
.pb-moves{position:absolute;left:calc(env(safe-area-inset-left,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 64px);display:flex;gap:12px}
.pb-moves[hidden]{display:none}
.pb-mv{width:70px;height:70px;border-radius:50%;display:grid;place-items:center;background:#101215;border:2px solid #000;box-shadow:0 0 0 3px #3a4048,0 4px 0 #000;
  color:#e8eaec;font-size:9px;letter-spacing:.04em;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.pb-mv:active{transform:translateY(3px);box-shadow:0 0 0 3px #3a4048,0 1px 0 #000}
.pb-mv.hot{background:#ffd84a;color:#101215;box-shadow:0 0 0 3px #fff3b0,0 4px 0 #000,0 0 16px rgba(255,216,74,.6)}
.pb-jump.hot{background:#ffd84a;color:#101215;box-shadow:0 0 0 3px #fff3b0,0 4px 0 #000,0 0 16px rgba(255,216,74,.6);animation:pb-jump .45s ease-in-out infinite alternate}
.pb-jump:active{transform:translateY(3px);box-shadow:0 0 0 3px #3a4048,0 1px 0 #000}
@keyframes pb-jump{to{box-shadow:0 0 0 5px #fff3b0,0 4px 0 #000,0 0 28px rgba(255,216,74,.9)}}
@media (prefers-reduced-motion:reduce){.pb-jump.hot{animation:none}}
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
/* The coin toss: a pixel gold coin tossed up toward you (rising and growing, so it stays inside the card),
   flipping sprite-style (full face, narrower, edge-on, the other face) and landing on the winner's side with a glint
   and a few sparkles; the winner's call lights up. --d is the toss, --n how many flips (ends on heads or tails). */
.pb-tosscard{text-align:center;gap:14px}
.pb-tosscard .pb-wait{visibility:hidden;pointer-events:none}   /* the result's room is kept from the start: the card never jumps */
.pb-cstage{position:relative;width:96px;height:96px;margin:14px auto 0;z-index:1}
.pb-cshad{position:absolute;left:50%;bottom:-10px;width:64px;height:8px;margin-left:-32px;background:rgba(0,0,0,.55);animation:pbCShad var(--d) linear both}
.pb-ccoin{position:absolute;inset:0;animation:pbCToss var(--d) linear both}
.pb-cspin{position:absolute;inset:0;animation:pbCSpin .32s steps(1,end) var(--n) both}
.pb-cspin svg{position:absolute;inset:0;width:100%;height:100%;shape-rendering:crispEdges;filter:drop-shadow(0 3px 0 rgba(0,0,0,.45))}
.pb-cspin .h{animation:pbCFaceH .32s steps(1,end) var(--n) both}
.pb-cspin .t{animation:pbCFaceT .32s steps(1,end) var(--n) both}
.pb-cshine{position:absolute;inset:6px;overflow:hidden;clip-path:circle(50%)}
.pb-cshine::before{content:"";position:absolute;top:-20%;bottom:-20%;left:-60%;width:22%;background:rgba(255,255,255,.75);transform:skewX(-20deg);animation:pbCShine .45s steps(6) calc(var(--d) + .05s) both}
.pb-cspark{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;opacity:0;
  box-shadow:-58px -30px 0 #fff6c2,56px -38px 0 #ffd84a,-50px 34px 0 #ffd84a,60px 28px 0 #fff6c2,0 -64px 0 #fff,-70px 2px 0 #ffd84a,72px -2px 0 #ffd84a;animation:pbCSpark .5s steps(4) var(--d) both}
.pb-ccalls{display:flex;justify-content:center;gap:8px}
.pb-ccall{display:flex;align-items:center;gap:7px;padding:7px 10px;background:#1b1f24;border:2px solid #000;box-shadow:0 3px 0 #000,inset 3px 0 0 var(--c);font-size:9px;color:#c9d1d9}
.pb-ccall img{width:20px;height:20px;object-fit:contain}
.pb-ccall b{font-weight:400}
.pb-ccall small{font-size:6.5px;color:#7c848e}
.pb-ccall.win{animation:pbCWin .3s steps(2) var(--d) both}
.pb-ccall:not(.win){animation:pbCLose .3s steps(2) var(--d) both}
@keyframes pbCToss{0%{transform:translateY(0) scale(1)}15%{transform:translateY(-24px) scale(1.12)}30%{transform:translateY(-40px) scale(1.24)}45%{transform:translateY(-46px) scale(1.3)}
  60%{transform:translateY(-40px) scale(1.24)}75%{transform:translateY(-22px) scale(1.12)}88%{transform:translateY(0) scale(1)}93%{transform:translateY(-8px) scale(1)}100%{transform:translateY(0) scale(1)}}
@keyframes pbCShad{0%,88%,100%{transform:scaleX(1);opacity:1}40%,50%{transform:scaleX(.35);opacity:.35}93%{transform:scaleX(.85)}}
@keyframes pbCSpin{0%{transform:scaleX(1)}12.5%{transform:scaleX(.62)}25%{transform:scaleX(.14)}37.5%{transform:scaleX(.62)}50%{transform:scaleX(1)}62.5%{transform:scaleX(.62)}75%{transform:scaleX(.14)}87.5%{transform:scaleX(.62)}100%{transform:scaleX(1)}}
@keyframes pbCFaceH{0%{opacity:1}25%{opacity:0}75%{opacity:1}100%{opacity:1}}
@keyframes pbCFaceT{0%{opacity:0}25%{opacity:1}75%{opacity:0}100%{opacity:0}}
@keyframes pbCShine{from{left:-60%}to{left:130%}}
@keyframes pbCSpark{0%{opacity:0;transform:scale(.4)}30%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.25)}}
@keyframes pbCWin{to{background:#ffd84a;color:#111;box-shadow:0 3px 0 #000,0 0 0 2px #fff3b0}}
@keyframes pbCLose{to{opacity:.45}}
.pb-ccall.win small{color:inherit}
@media (prefers-reduced-motion: reduce){ .pb-ccoin,.pb-cshad,.pb-cspark,.pb-cshine::before{animation:none} .pb-cspin,.pb-cspin svg{animation-duration:.01s} }
/* Your last drive, play by play, at the top of the next card. */
.pb-recap{margin:-2px 0 12px;padding:10px 12px;background:#0c0e11;border:2px solid #000;box-shadow:0 0 0 2px #2c3138;text-align:left}
.pb-rh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px}
.pb-rh b{font-size:9px;color:#ffd84a} .pb-rh span{font-size:7px;color:#c9d1d9;text-align:right}
.pb-rlist{margin:0;padding:0 0 0 18px;max-height:7.6em;overflow-y:auto;font:12px/1.35 'Public Sans',system-ui,sans-serif;color:#c9d1d9}
.pb-rlist li:last-child{color:#fff}
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
.pb-ticker{display:grid;gap:3px;min-height:3.9em;margin:8px 0 2px;font:12px/1.3 'Public Sans',system-ui,sans-serif;color:#c9d1d9;text-align:left}
.pb-ticker div:last-child{color:#fff}
.pb-pbp{font:12px/1.3 'Public Sans',system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000,0 0 6px #000;opacity:0;transition:opacity .3s;max-width:92vw;text-align:center}
.pb-pbp.on{opacity:1}
.pb-flag h2{color:#ffd84a} .pb-fl{font-size:11px;color:#ffd84a}
.pb-forms{display:flex;gap:4px;overflow-x:auto;margin-bottom:8px;scrollbar-width:none}
.pb-forms button{flex:none;padding:7px 9px;font-size:7px;background:#15181c;color:#c9d1d9;border:2px solid #000;box-shadow:0 0 0 2px #2c3138}
.pb-forms button[aria-pressed="true"]{background:#ffd84a;color:#111;box-shadow:0 0 0 2px #fff3b0}
.pb-callopts{display:flex;align-items:center;gap:10px;margin:8px 0 2px}
.pb-callopts span{font:11px/1.35 'Public Sans',system-ui,sans-serif;color:#9aa3ab}
.pb-pa{flex:none;padding:8px 10px;font-size:8px;background:#15181c;color:#c9d1d9;border:2px solid #000;box-shadow:0 0 0 2px #2c3138}
.pb-pa[aria-pressed="true"]{background:#7df9ff;color:#111}
.pb-hot{margin-top:8px} .pb-hot summary{cursor:pointer;font-size:9px;color:#ffd84a;padding:6px 0}
.pb-take{display:grid;gap:6px;background:#101215;color:#ffd84a !important;box-shadow:0 4px 0 #000,inset 0 0 0 2px #ffd84a}
.pb-take small{font-size:7px;color:#c9d1d9;letter-spacing:.02em}
.pb-chlist{display:grid;gap:10px;margin-top:6px}
.pb-ch{display:grid;gap:8px;padding:12px;background:#15181c;border:2px solid #000;box-shadow:0 0 0 2px #2c3138,inset 4px 0 0 var(--c)}
.pb-ch.won{box-shadow:0 0 0 2px #ffd84a,inset 4px 0 0 var(--c)}
.pb-chh{display:flex;align-items:center;gap:6px;font-size:9px}
.pb-chh img{width:22px;height:22px;object-fit:contain}
.pb-chh i{font-style:normal;color:#8a929c;font-size:7px}
.pb-chtag{margin-left:auto;padding:4px 6px;font-size:7px;background:#ffd84a;color:#111;white-space:nowrap}
.pb-ch p{margin:0;font:12px/1.45 'Public Sans',system-ui,sans-serif;color:#e8eaec}
.pb-chf{display:flex;align-items:center;justify-content:space-between;gap:10px}
.pb-chf small{font-size:7px;color:#8a929c;line-height:1.5}
.pb-ch.won .pb-chf small{color:#ffd84a}
.pb-chf .pb-go{padding:9px 14px;font-size:9px;flex:none}
.pb-chintro .pb-chtag{margin:0 auto 4px;display:inline-block}
.pb-chintro{text-align:center}
.pb-chsit{font-size:9px;color:#ffd84a}
.pb-chintro p{font-family:'Public Sans',system-ui,sans-serif;font-size:13px;line-height:1.45}
.pb-chintro .pb-chsit{font-family:inherit}
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
.pb-side button{font-size:9px;padding:10px 6px}
.pb-ddrills{display:grid;gap:6px}
.pb-ddrills button{display:grid;gap:5px;text-align:left;background:#1b1f24;border:2px solid #000;box-shadow:0 3px 0 #000;padding:9px 10px}
.pb-ddrills button b{font-weight:400;font-size:9px;color:#fff}
.pb-ddrills button small{font-size:6.5px;line-height:1.6;color:#9aa4ae}
.pb-ddrills button[aria-pressed="true"]{box-shadow:0 0 0 2px #ffd84a,0 3px 0 #000}
.pb-ddrills button[aria-pressed="true"] b{color:#ffd84a}
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
