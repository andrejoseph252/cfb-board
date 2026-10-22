/* Coach Andre's Bowl game logic, separate from drawing and the page. Like the arcade football games it's modeled on, you
   only play offense: the other team's drives are simulated between yours.

   Coordinates are in yards. x runs along the field from your goal line (0) to theirs (100), with end zones at
   -10..0 and 100..110; y runs across it, 0..53.33. You always drive toward x = 100. */

export const FW = 53.33, MID = FW / 2, HASH = [20, 33.33], GOAL_HALF = 3.08, BAR = 3.33;

export const DIFFS = {
  rookie: { name: 'Rookie', catchR: 2.1, lag: .42, defSpd: .93, rush: 4.6, tackle: .75, fool: .92, keyErr: .5, opp: .27, intMul: .5, react: .5, sweep: 2.0, blitz: .1, preview: true },
  pro:    { name: 'Pro', catchR: 1.85, lag: .32, defSpd: .955, rush: 3.7, tackle: .79, fool: .8, keyErr: .8, opp: .35, intMul: .75, react: .36, sweep: 1.55, blitz: .18, preview: true },
  allpro: { name: 'All-Pro', catchR: 1.6, lag: .26, defSpd: .97, rush: 3.3, tackle: .82, fool: .68, keyErr: 1.1, opp: .43, intMul: .72, react: .26, sweep: 1.2, blitz: .25, preview: false },
  legend: { name: 'Legend', catchR: 1.5, lag: .2, defSpd: .985, rush: 3.05, tackle: .85, fool: .55, keyErr: 1.4, opp: .51, intMul: .85, react: .18, sweep: 1.0, blitz: .32, preview: false }
};
export const LENGTHS = { quick: { name: 'Quick', q: 180 }, standard: { name: 'Standard', q: 300 }, long: { name: 'Long', q: 450 } };

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e', '#a0662f'];

/* ---------- the game ---------- */
export function newGame(me, opp, diffKey, lenKey){
  return {
    me, opp, diff: DIFFS[diffKey], diffKey, lenKey, qLen: LENGTHS[lenKey].q,
    quarter: 1, clock: LENGTHS[lenKey].q, score: [0, 0], timeouts: 3, runoff: 0,
    los: 25, y: MID, down: 1, toGo: 10, firstHalfReceiver: null, ot: 0, otFirst: null,
    twoPt: false, play: null, kick: null,
    stats: { comp: 0, att: 0, passYds: 0, passTD: 0, int: 0, rush: 0, rushYds: 0, rushTD: 0, sacks: 0, fgm: 0, fga: 0, plays: 0, longest: 0 },
    events: []
  };
}
const emit = (G, type, data = {}) => G.events.push({ type, ...data });

/* Season mode's game plan, practice and freshness (scout.js builds them); plain games have none. */
export const MD = { spd: 1, rec: 1, runBlock: 1, passPro: 1, latePro: 1, acc: 1, catchR: 0, paBite: 0, tempo: 1, cov: null, blitz: 1, fade: 1, cb: 1,
  drive: { q: 0, td: 1, fg: 1, to: 1, time: 1 } };
const mods = G => G.mods || MD;
/* Team strength from ESPN's FPI efficiencies (0-100, ~50 average), as a small multiplier around 1. */
const rate = v => (Number.isFinite(v) ? v : 50) - 50;

export function startDrive(G, x){
  Object.assign(G, { los: clamp(x, 1, 99), y: MID, down: 1, toGo: Math.min(10, 100 - clamp(x, 1, 99)), runoff: 0, twoPt: false });
}
export const fgDistance = G => Math.round(100 - G.los + 17);
export const inFgRange = G => fgDistance(G) <= 62;
export const lateInHalf = G => (G.quarter === 2 || G.quarter === 4) && G.clock <= 120;

/* Spends game clock across quarter breaks; returns false once the half (or regulation) runs out. */
export function useClock(G, sec){
  while (sec > 0 && !G.ot){
    const d = Math.min(sec, G.clock); G.clock -= d; sec -= d;
    if (G.clock > 0) continue;
    if (G.quarter === 1 || G.quarter === 3){ G.quarter++; G.clock = G.qLen; emit(G, 'quarter', { q: G.quarter }); }
    else return false;
  }
  return G.ot || G.clock > 0;
}

/* ---------- formations and routes ---------- */
export const ROUTES = {
  go: [[30, 0], [70, 0]], slant: [[2, 0], [9, 7], [40, 30]], post: [[11, 0], [28, 9], [60, 18]],
  corner: [[11, 0], [26, -10], [45, -18]], out: [[7, 0], [7, -18]], dig: [[12, 0], [12, 26]],
  curl: [[11, 0], [9, 1.5, 1]], comeback: [[15, 0], [12, -3, 1]], hitch: [[6, 0], [5, .5, 1]],
  seam: [[28, 0], [65, 3]], flat: [[2, -5], [4, -18]], drag: [[2, 1], [4, 30]], swing: [[-1, -5], [3, -18]],
  wheel: [[0, -6], [5, -11], [30, -12], [60, -12]], stick: [[6, 0], [6, .5, 1]], in: [[6, 0], [6, 20]],
  fade: [[20, -3], [55, -5]], block: []
};
export const ROUTE_NAMES = { go: 'Go', slant: 'Slant', post: 'Post', corner: 'Corner', out: 'Out', dig: 'Dig', curl: 'Curl', comeback: 'Comeback',
  hitch: 'Hitch', seam: 'Seam', flat: 'Flat', drag: 'Drag', swing: 'Swing', wheel: 'Wheel', stick: 'Stick', in: 'In', fade: 'Fade' };

/* Practice mode. Receivers come out in this order as you add them; concepts are classic pass patterns. */
export const PRACTICE_ROLES = ['X', 'Z', 'SL', 'TE', 'RB'];
export const ROLE_NAMES = { X: 'Left wideout', Z: 'Right wideout', SL: 'Slot', TE: 'Tight end', RB: 'Running back' };
export const CONCEPTS = {
  verts:   { name: 'Four Verts', tip: 'Stretch the safeties deep', routes: { X: 'go', Z: 'go', SL: 'seam', TE: 'seam', RB: 'flat' } },
  slants:  { name: 'Slants', tip: 'Quick and inside; beats the blitz', routes: { X: 'slant', Z: 'slant', SL: 'slant', TE: 'stick', RB: 'flat' } },
  smash:   { name: 'Smash', tip: 'Hitch under, corner over', routes: { X: 'hitch', Z: 'hitch', SL: 'corner', TE: 'corner', RB: 'swing' } },
  mesh:    { name: 'Mesh', tip: 'Crossers underneath', routes: { X: 'dig', Z: 'corner', SL: 'drag', TE: 'drag', RB: 'wheel' } },
  flood:   { name: 'Flood', tip: 'Three levels to one side', routes: { X: 'post', Z: 'fade', SL: 'out', TE: 'stick', RB: 'flat' } },
  curlflat:{ name: 'Curl-Flat', tip: 'Short and safe', routes: { X: 'curl', Z: 'curl', SL: 'flat', TE: 'flat', RB: 'swing' } },
  dagger:  { name: 'Dagger', tip: 'Seam clears out the dig', routes: { X: 'dig', Z: 'post', SL: 'seam', TE: 'stick', RB: 'flat' } },
  outs:    { name: 'Outs', tip: 'Timing throws to the sideline', routes: { X: 'out', Z: 'out', SL: 'out', TE: 'out', RB: 'flat' } }
};
/* In a game, the play called for this snap: null (random routes, the default), a concept above, 'custom' (one of
   your own plays, its routes in G.callRoutes), or 'run' (snap goes straight to
   the back; the receivers run short routes and turn into blockers). */
export const RUN_CALL = { name: 'Inside Zone', tip: 'Snap goes straight to the back', routes: { X: 'hitch', Z: 'hitch', SL: 'hitch', TE: 'hitch', RB: [[1, .5], [4, .8], [11, 1]] } };
/* Run plays. path: which way the back heads before you steer (along, across toward the play side). */
export const RUN_CALLS = {
  run: { ...RUN_CALL, path: [1, 0] },
  outside: { name: 'Outside Zone', tip: 'Stretch it to the edge, then cut up', routes: RUN_CALL.routes, path: [.5, .87] },
  power: { name: 'Power', tip: 'Downhill off tackle, behind the line', routes: RUN_CALL.routes, path: [.95, .3] },
  qbdraw: { name: 'QB Draw', tip: 'Show pass, then the quarterback runs', routes: { X: 'go', Z: 'go', SL: 'hitch', TE: 'hitch', RB: [[1, .5]] } },
  option: { name: 'Read Option', tip: 'Read the end: he takes the back, keep it', routes: RUN_CALL.routes }
};
export const FORMATIONS = { gun: 'Shotgun', pistol: 'Pistol', under: 'Under center', trips: 'Trips', empty: 'Empty' };

const POOL = {
  X: ['go', 'slant', 'post', 'corner', 'out', 'dig', 'curl', 'comeback', 'hitch', 'fade'],
  Z: ['go', 'slant', 'post', 'corner', 'out', 'dig', 'curl', 'comeback', 'hitch', 'fade'],
  SL: ['seam', 'slant', 'out', 'dig', 'drag', 'corner', 'curl', 'in'],
  TE: ['seam', 'flat', 'drag', 'stick', 'corner', 'out'],
  RB: ['flat', 'swing', 'wheel', 'block', 'in', 'flat']
};
const SPEED = { QB: 7.0, RB: 8.1, X: 8.35, Z: 8.35, SL: 8.2, TE: 7.3, OL: 5.0, DL: 6.9, LB: 7.6, CB: 8.4, S: 8.3 };
/* How fast each position can change speed or direction (yards per second, per second): skill players get to top
   speed in about half a second, linemen take longer, and nobody turns on a dime. Stopping is a bit quicker. */
const ACCEL = { QB: 15, RB: 21, X: 19, Z: 19, SL: 20, TE: 16, OL: 15, DL: 13, LB: 16, CB: 19, S: 17 };

function mk(role, team, x, y, spd, extra = {}){
  return { role, team, x, y, vx: 0, vy: 0, spd, hist: [], face: team === 'off' ? 1 : -1, step: 0, stun: 0, missCD: 0,
    eng: null, down: false, skin: pick(SKIN), juke: 0, dive: 0, stumble: 0, jukeCD: 0, mode: null, ...extra };
}

/* ---------- coverages ---------- */
export const COVERAGES = { c0: 'Cover 0', c1: 'Cover 1', c2: 'Cover 2', c3: 'Cover 3', c4: 'Cover 4', c2m: '2-Man' };
/* What the defense calls, by situation: man and pressure on short yardage, deep zones on third and long, man in the
   red zone, quarters to protect a lead late. Harder levels blitz more. */
function pickCoverage(G, L){
  const w = { c0: .03 + G.diff.blitz * .12, c1: .16 + G.diff.blitz * .4, c2: .2, c3: .3, c4: .15, c2m: .08 };
  const long = G.down >= 2 && G.toGo >= 8, short = G.toGo <= 2;
  if (long){ w.c3 += .12; w.c4 += .15; w.c0 *= .3; w.c1 *= .6; }
  if (short){ w.c0 += .08; w.c1 += .15; w.c4 *= .4; }
  if (L >= 80){ w.c1 += .1; w.c2m += .08; w.c3 *= .7; w.c4 *= .7; }
  if (G.quarter >= 4 && G.clock < 150 && G.score[1] > G.score[0]){ w.c4 += .35; w.c3 += .1; w.c0 = 0; }
  // Season mode: their scheme (what this defense is known for) and how much they blitz.
  const M = mods(G);
  if (M.cov) for (const k in w) w[k] *= (M.cov[k] ?? 1) * (k === 'c0' || k === 'c1' ? M.blitz : 1);
  let u = Math.random() * Object.values(w).reduce((a, x) => a + x, 0);
  for (const [k, v] of Object.entries(w)){ if ((u -= v) <= 0) return k; }
  return 'c3';
}
/* Who covers whom (man) or what (zone: center across the field, half-width, depth past the line, deep or not). */
function assignCoverage(cov, { lb, cb1, cb2, fs, ss }, o, L){
  const Z = (cy, hw, depth, deep = false) => ({ cy, hw, depth, deep });
  const flatL = Z(6, 7, 5), flatR = Z(FW - 6, 7, 5), curlL = Z(14, 6, 9), curlR = Z(FW - 14, 6, 9), hook = Z(MID, 6, 8), hookL = Z(MID - 7, 5, 8), hookR = Z(MID + 7, 5, 8);
  const man = (d, r) => { if (r) d.man = r; else d.spy = true; };
  const blitz = d => { d.blitz = true; d.x = L + 2; };
  switch (cov){
    case 'c0': man(cb1, o.x); man(cb2, o.z); man(ss, o.sl); man(lb[0], o.te); man(fs, o.rb); blitz(lb[1]); blitz(lb[2]); break;
    case 'c1': man(cb1, o.x); man(cb2, o.z); man(ss, o.sl); man(lb[0], o.te); man(lb[1], o.rb); blitz(lb[2]); fs.zone = Z(MID, FW / 2, 15, true); break;
    case 'c2': cb1.zone = flatL; cb2.zone = flatR; fs.zone = Z(FW * .25, FW / 4, 14, true); ss.zone = Z(FW * .75, FW / 4, 14, true);
      lb[0].zone = curlL; lb[1].zone = hook; lb[2].zone = curlR; break;
    case 'c3': cb1.zone = Z(FW / 6, FW / 6, 15, true); cb2.zone = Z(FW * 5 / 6, FW / 6, 15, true); fs.zone = Z(MID, FW / 6, 16, true);
      lb[0].zone = curlL; lb[1].zone = hookL; lb[2].zone = hookR; ss.zone = curlR; break;
    case 'c4': cb1.zone = Z(FW / 8, FW / 8, 13, true); fs.zone = Z(FW * 3 / 8, FW / 8, 13, true); ss.zone = Z(FW * 5 / 8, FW / 8, 13, true); cb2.zone = Z(FW * 7 / 8, FW / 8, 13, true);
      lb[0].zone = curlL; lb[1].zone = hook; lb[2].zone = curlR; break;
    default:   // 2-Man: man underneath, two deep halves over the top
      man(cb1, o.x); man(cb2, o.z); man(lb[0], o.te); man(lb[2], o.sl); man(lb[1], o.rb);
      fs.zone = Z(FW * .25, FW / 4, 15, true); ss.zone = Z(FW * .75, FW / 4, 15, true);
  }
  return cov;
}

/* Lines everyone up for the next snap and picks this play's routes and coverage (so they can be previewed). */
export function setupPlay(G){
  const L = G.los, b = clamp(G.y, HASH[0], HASH[1]), D = G.diff;
  const M = mods(G), fade = G.quarter >= 3 ? M.fade : (1 + M.fade) / 2;
  const oMul = (1 + rate(G.me.off) / 900) * M.spd * fade, dMul = D.defSpd * (1 + rate(G.opp.def) / 900);
  const off = [], def = [];
  [-3.2, -1.6, 0, 1.6, 3.2].forEach((dy, i) => off.push(mk('OL', 'off', L - .7, b + dy, SPEED.OL, { n: i })));
  // Formations. Shotgun (the default): the back offset beside the quarterback, toward the wide side, easy to tap
  // apart from him. Pistol: the back right behind a short shotgun. Under center: the quarterback at the center with
  // a deep back. Trips: three receivers to one side. Empty: the back split out wide (no handoff).
  const F = G.practice ? 'gun' : (G.formation || 'gun'), wide = b < MID ? 1 : -1;
  const qb = mk('QB', 'off', L - (F === 'under' ? 1.2 : F === 'pistol' ? 3.6 : 4.5), b, SPEED.QB * oMul);
  const rb = mk('RB', 'off', F === 'empty' ? L - 1.1 : L - (F === 'under' ? 5.5 : F === 'pistol' ? 6.2 : 5),
    F === 'empty' ? clamp(b - 12 * wide, 3, FW - 3) : F === 'pistol' || F === 'under' ? b : b + 2.6 * wide, SPEED.RB * oMul);
  const te = mk('TE', 'off', L - .9, b - 5, SPEED.TE * oMul * M.rec);
  const x = mk('X', 'off', L - .9, Math.max(3, b - 19), SPEED.X * oMul * M.rec);
  const z = mk('Z', 'off', L - .9, Math.min(FW - 3, b + 19), SPEED.Z * oMul * M.rec);
  const sl = mk('SL', 'off', L - 1.2, F === 'trips' ? Math.min(b + 13.5, z.y - 4) : Math.min(b + 10.5, z.y - 5), SPEED.SL * oMul * M.rec);
  if (F === 'trips'){ te.y = Math.min(b + 6.5, sl.y - 4); te.x = L - 1.2; }
  // Practice: only the receivers you asked for line up (the back always does, to block or take a handoff).
  const PR = G.practice, out = p => PR && p.role !== 'RB' && !PR.roles.includes(p.role);
  off.push(qb, rb, ...[te, x, z, sl].filter(p => !out(p)));

  // Routes: X and Z never run the same one; the back sometimes stays in to block. In practice, the routes you
  // picked (or a concept's), with the back blocking unless he's one of your receivers.
  const rec = [x, te, rb, sl, z].filter(p => !out(p) && !(PR && p.role === 'RB' && !PR.roles.includes('RB')));
  if (PR && !PR.roles.includes('RB')){ rb.routeName = 'block'; rb.route = []; rb.wp = 0; }
  const used = new Set();
  // Called plays (in a game) and picked routes (in practice) set the routes; anything unset is random.
  const plan = PR ? (PR.mode !== 'random' ? PR.routes : null)
    : RUN_CALLS[G.call] ? RUN_CALLS[G.call].routes : G.call === 'custom' ? G.callRoutes || null : CONCEPTS[G.call]?.routes || null;
  for (const p of rec){
    let r = plan?.[p.role];
    if (Array.isArray(r)) r = 'block';   // the back on a called run: he gets the ball at the snap
    if (p.role === 'RB' && F === 'empty' && (!r || r === 'block')) r = pick(POOL.SL);   // split out wide, he's a receiver
    if (p.role === 'RB' && G.pa && !PR) r = 'block';   // play action: he carries out the fake, then protects
    if (!r || !ROUTES[r]){ do { r = pick(POOL[p.role]); } while (used.has(r) && p.role !== 'RB' && Math.random() < .8); }
    used.add(r);
    // With a called play (or in practice) the back releases to his own side, matching the diagrams.
    const inside = p.role === 'RB' ? (plan ? (rb.y < b ? 1 : -1) : Math.random() < .5 ? 1 : -1) : p.y < b ? 1 : -1;
    p.routeName = r;
    p.route = ROUTES[r].map(([dx, dy, stop]) => ({ x: Math.min(109, p.x + dx), y: clamp(p.y + dy * inside, 1.2, FW - 1.2), stop: !!stop }));
    p.wp = 0;
  }
  rec.forEach((p, i) => { p.num = i + 1; });

  if (PR){   // no defense in practice
    G.play = { off, def, qb, rb, rec, all: [...off], t: 0, live: false, ball: { state: 'held', holder: qb, x: qb.x, y: qb.y, z: 1.6 },
      carrier: null, result: null, blitz: false, los: L, b, aim: null, thrown: false, handed: false, pops: [], fx: [] };
    for (const p of G.play.all) p.face = 1;
    // Target drill: one receiver is the man to hit this rep (never the same one three times running).
    if (PR.target){
      const open = rec.filter(r => r.routeName !== 'block'), recent = G.recentTargets || [];
      const fresh = open.filter(r => !(recent.length >= 2 && recent[0] === r.role && recent[1] === r.role));
      const t = pick(fresh.length ? fresh : open);
      if (t){ G.play.target = t; G.recentTargets = [t.role, ...recent].slice(0, 2); }
    }
    return;
  }

  // Defense: four down linemen, three backers, two corners, two safeties.
  const deep = L > 88 ? Math.min(L + 9, 108) : L + 13, press = L > 88 ? L + 3 : L + 6;
  [-4.3, -1.3, 1.3, 4.3].forEach(dy => def.push(mk('DL', 'def', L + .9, b + dy, SPEED.DL * dMul)));
  const lb = [-4.5, 0, 4.5].map(dy => mk('LB', 'def', Math.min(L + 4.5, 109), b + dy, SPEED.LB * dMul));
  const cb1 = mk('CB', 'def', Math.min(press, 109), x.y + 1, SPEED.CB * dMul), cb2 = mk('CB', 'def', Math.min(press, 109), z.y - 1, SPEED.CB * dMul);
  const fs = mk('S', 'def', deep, clamp(b - 9, 6, FW - 6), SPEED.S * dMul), ss = mk('S', 'def', deep, clamp(b + 9, 6, FW - 6), SPEED.S * dMul);
  def.push(...lb, cb1, cb2, fs, ss);
  // The coverage for this snap. Everyone lines up in the same two-high look either way; the coverage only shows
  // after the snap, when the zones drop and the safeties rotate.
  const cov = G.defDrill ? 'c2m' : pickCoverage(G, L);
  const backs = { x, z, sl, te, rb: rb.routeName === 'block' ? null : rb };
  assignCoverage(cov, { lb, cb1, cb2, fs, ss }, backs, L);
  const blitz = def.some(d => d.blitz);
  lb.forEach((d, i) => { d.gap = [-2.2, 0, 2.2][i]; });   // run fits: each backer fills a different gap

  // Each lineman gets an opponent; one rusher wins first, the rest a beat later.
  const dl = def.filter(p => p.role === 'DL'), first = Math.floor(rnd(4));
  dl.forEach((p, i) => { p.ol = off[Math.min(4, i + (i >= 2 ? 1 : 0))]; p.shed = D.rush + rnd(-.4, 1.2) + (i === first ? 0 : rnd(.8, 2.2)); });
  dl[0].edge = -1; dl[3].edge = 1;

  // You on defense (drills and key stops): their offense against your defense, one defender yours.
  if (G.defDrill?.kind === 'cover'){
    // Your corner on their left wideout. The drill is one on one: just the line, the quarterback and him on offense.
    // In a game (full) everyone plays, and the quarterback is coming to your man.
    if (!G.defDrill.full){
      const keep = off.filter(p => p.role === 'OL' || p === qb || p === x);
      off.length = 0; off.push(...keep); rec.length = 0; rec.push(x); x.num = 1;
      def.length = 0; def.push(cb1);
    }
    Object.assign(cb1, { user: true, spd: 8.6 * M.cb, man: x });
  } else if (G.defDrill?.kind === 'rush'){
    // You're the edge rusher; the rest of the line stays blocked, so the rush is all on you.
    const me = dl[3];
    for (const p of dl) p.shed = 99;
    Object.assign(me, { rusher: true, wait: true, spd: 7.6 });
  }

  G.play = { off, def, qb, rb, rec, all: [...off, ...def], t: 0, live: false, ball: { state: 'held', holder: qb, x: qb.x, y: qb.y, z: 1.6 },
    carrier: null, result: null, blitz, los: L, b, aim: null, thrown: false, handed: false, pops: [], fx: [],
    forceTarget: G.defDrill?.full ? x : null, coverage: COVERAGES[cov], formation: F, noHandoff: F === 'empty',
    pa: !!G.pa && !RUN_CALLS[G.call], paBite: .25 + M.paBite + .25 * Math.min(1, (G.stats.rush ? G.stats.rushYds / G.stats.rush : 3) / 5) };
  for (const p of G.play.all) p.face = p.team === 'off' ? 1 : -1;
}

/* ---------- the snap and the play ---------- */
export function snap(G){
  const P = G.play; P.live = true; P.t = 0;
  emit(G, 'sfx', { name: 'hike' });
}

const pop = (P, x, y, text, color = '#fff') => P.pops.push({ x, y, text, color, t: 0 });
const burst = (P, x, y, colors, n = 10, up = 1) => { for (let i = 0; i < n; i++) P.fx.push({ x, y, z: .5, vx: rnd(-2, 2), vy: rnd(-2, 2), vz: rnd(1, 4) * up, c: pick(colors), t: 0, life: rnd(.4, .9) }); };

function moveToward(p, tx, ty, spd, dt, gain = 7){
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  let vx = 0, vy = 0;
  if (d > .05){ const s = Math.min(spd, d * 6); vx = dx / d * s; vy = dy / d * s; }
  accelToward(p, vx, vy, dt, gain);
}
/* Changes a player's velocity toward (vx, vy), no faster than his position allows: momentum, so a defender who
   overcommits overruns a cut and a runner can't reverse in an instant. */
function accelToward(p, vx, vy, dt, gain = 7){
  const k = Math.min(1, gain * dt);
  let ax = (vx - p.vx) * k, ay = (vy - p.vy) * k;
  const slowing = vx * p.vx + vy * p.vy < p.vx * p.vx + p.vy * p.vy;
  const lim = (ACCEL[p.role] || 16) * (slowing ? 1.25 : 1) * dt, m = Math.hypot(ax, ay);
  if (m > lim){ ax *= lim / m; ay *= lim / m; }
  p.vx += ax; p.vy += ay;
}
function integrate(p, dt){
  p.x += p.vx * dt; p.y += p.vy * dt;
  const sp = Math.hypot(p.vx, p.vy); p.step += sp * dt;
  if (Math.abs(p.vx) > .4) p.face = Math.sign(p.vx);
}
const histAt = (p, lag) => p.hist[Math.max(0, p.hist.length - 1 - Math.round(lag * 60))] || p;

/* Where a chaser should aim to cut off a runner: the point where they'd meet if the runner keeps going. */
function lead(ch, r){
  let t = dist(ch, r) / Math.max(ch.spd, 1), p = r;
  for (let i = 0; i < 3; i++){ const k = Math.min(t, 2); p = { x: r.x + r.vx * k, y: r.y + r.vy * k }; t = dist(ch, p) / Math.max(ch.spd, 1); }
  return p;
}

export function step(G, dt, inp){
  const P = G.play; if (!P?.live || P.result) return;
  const D = G.diff, ball = P.ball, qb = P.qb;
  P.t += dt;
  reactToBall(G);
  for (const p of P.off){ p.hist.push({ x: p.x, y: p.y }); if (p.hist.length > 70) p.hist.shift(); }
  for (const p of P.all){ if (p.down && p.stun > 0 && p.stun - dt <= 0) p.down = false; p.stun = Math.max(0, p.stun - dt); p.missCD = Math.max(0, p.missCD - dt); p.jukeCD = Math.max(0, p.jukeCD - dt); }
  const carrier = P.carrier, running = !!carrier, holder = ball.state === 'held' ? ball.holder : null;

  // QB draw: after showing pass, the quarterback takes it himself. Read option: no give by the end of the mesh, keep.
  if (!running && holder === qb && ((P.draw && P.t >= P.draw) || (P.option && P.t >= .65))){
    P.handed = true; P.handT = P.t; becomeCarrier(P, qb);
    // The keep: outside, where the end crashed from. If he took the back, he's optioned off.
    if (P.option){ pop(P, qb.x, qb.y, 'KEEP!', '#ffd84a'); P.runPath = { x: .8, y: .6 * P.option.side }; if (P.option.crash && P.option.key) P.option.key.stun = .6; }
    if (P.draw) P.runPath = { x: 1, y: 0 };
    return;
  }

  /* ----- offense ----- */
  for (const p of P.off){
    if (p === carrier) continue;
    if (p.role === 'OL' && p.blockOn){
      const f = p.blockOn;
      moveToward(p, f.x - .6, f.y, p.spd * 1.3, dt, 9);
      if (!f.eng && dist(p, f) < 1.2 && f.stun <= 0){ f.eng = { by: p, until: P.t + rnd(.7, 1.5) }; p.blockOn = null; }
    } else if (p.role === 'OL'){
      const foe = P.def.find(d => d.ol === p && !d.free);
      if (foe){
        const tgt = running ? carrier : qb, dx = tgt.x - foe.x, dy = tgt.y - foe.y, d = Math.hypot(dx, dy) || 1;
        moveToward(p, foe.x + dx / d * .95, foe.y + dy / d * .95, p.spd * 1.4, dt, 12);
      } else moveToward(p, p.x + (running ? 1 : 0), p.y, 2, dt);
    } else if (p === qb){
      if (holder === qb && inp.qbMove) moveToward(p, inp.qbMove.x, inp.qbMove.y, p.spd * .75, dt, 10);
      else if (holder === qb && inp.qbKeys) moveToward(p, p.x + inp.qbKeys.x * 3, p.y + inp.qbKeys.y * 3, p.spd * .7, dt, 10);
      else if (P.pa && P.t < .7 && holder === qb) moveToward(p, p.x, p.y, 0, dt);   // play action: show the ball to the back
      else if (!P.draw && P.t < (P.formation === 'under' ? 1 : .6) && holder === qb) moveToward(p, P.los - (P.formation === 'under' ? 7.5 : 6), p.y, P.formation === 'under' ? 6 : 3, dt);   // the drop back
      else moveToward(p, p.x, p.y, 0, dt);
    } else if (p.blockOn){
      const f = p.blockOn;
      if (f.eng?.by === p){ moveToward(p, f.x - .9, f.y, p.spd, dt, 10); }
      else moveToward(p, f.x - .6, f.y, p.spd, dt, 9);
    } else if (p.mode === 'ball'){
      moveToward(p, ball.tx, ball.ty, p.spd, dt);
    } else if (p.route){
      if (p === P.rb && !running && ((P.pa && P.t < .7) || (P.option && P.t < .65))){
        moveToward(p, qb.x + .6, qb.y + (P.option ? P.option.side * .8 : 0), p.spd * .55, dt);   // the fake / the mesh
      } else if (p.routeName === 'block' && !running){
        const threat = P.def.find(d => d.free || d.blitz) ;
        moveToward(p, threat ? (threat.x + qb.x) / 2 : qb.x + 1, threat ? (threat.y + qb.y) / 2 : qb.y + 1.5, p.spd * .6, dt);
        if (threat && dist(p, threat) < 1 && !threat.eng && P.t > .3){ threat.eng = { by: p, until: P.t + rnd(1, 1.8) }; }
      } else {
        const w = p.route[p.wp];
        if (!w) moveToward(p, p.x, p.y, 0, dt);
        else {
          moveToward(p, w.x, w.y, p.spd, dt, 9);
          if (dist(p, w) < .7 && (!w.stop || p.wp < p.route.length - 1)) p.wp++;
        }
      }
    }
  }

  /* ----- defense ----- */
  const cover = P.def.filter(d => d.role !== 'DL' && !d.blitz);
  for (const d of P.def){
    if (d.stun > 0){ moveToward(d, d.x, d.y, 0, dt, 4); continue; }
    if (d.user){ userDefender(G, d, dt, inp); continue; }
    if (d.rusher && d.wait){ moveToward(d, d.x, d.y, 0, dt, 8); continue; }   // the rusher hasn't fired off the ball yet
    if (d.eng){
      if (P.t > d.eng.until || dist(d, d.eng.by) > 2.2) d.eng = null;
      else { const t = running ? carrier : qb; moveToward(d, t.x, t.y, d.spd * .22, dt); continue; }
    }
    let tx, ty, spd = d.spd;
    // Play action: backers and underneath zones bite on the fake (longer if you've been running the ball well).
    if (P.pa && !running && ball.state === 'held' && P.t < P.paBite && (d.role === 'LB' || d.zone && !d.zone.deep) && !d.blitz){
      moveToward(d, Math.max(P.los + 1, d.x - 1.5), d.y, d.spd * .6, dt, 7); continue;
    }
    // Read option: the end left unblocked either crashes on the back or sits on the quarterback.
    // (Crashing, he squeezes down the line inside, after the back; sitting, he stays wide on the quarterback.)
    if (d.optKey && !running){ moveToward(d, P.los + .6, P.option.crash ? qb.y - P.option.side * 1.5 : qb.y + P.option.side * 3, d.spd, dt, 7); continue; }
    if (running){
      const l = lead(d, carrier); tx = l.x; ty = l.y;
      // Pursuit: a man chasing from behind runs flat out to make up ground (one coming downhill doesn't need to).
      if ((d.x - carrier.x) * carrier.vx + (d.y - carrier.y) * carrier.vy < 0) spd = d.spd * 1.05;
      // Close to the runner, a defender breaks down: shorter steps, eyes on his hips, aiming at him rather than
      // a spot down the field. That's what lets a well-timed juke beat him.
      // (Only one coming at him: a pursuer from behind keeps running full tilt.)
      const cv = Math.hypot(carrier.vx, carrier.vy) || 1, ahead = ((d.x - carrier.x) * carrier.vx + (d.y - carrier.y) * carrier.vy) / cv > 0;
      if (ahead && dist(d, carrier) < 3.2){ tx = carrier.x + carrier.vx * .12; ty = carrier.y + carrier.vy * .12; spd = d.spd * .9; }
      // Linebackers read the play for a beat before they come downhill: they scrape sideways with the ball first,
      // which is what lets a runner find a hole or cut back.
      if (P.handed && d.role === 'LB' && P.t - P.handT < .6){ tx = d.x + .4; ty = carrier.y + (d.gap || 0); spd = d.spd * .55; }
      if (d.role === 'DL' && !d.free){
        // Run blocking: linemen hold their man until he sheds.
        if (P.t < d.shed * .45 * mods(G).runBlock + .5){ spd = d.spd * .25; } else d.free = true;
      }
    } else if (ball.state === 'air' && d.mode === 'ball'){
      tx = ball.tx; ty = ball.ty;
    } else if (ball.state === 'air' && (d.role === 'DL' || d.blitz)){
      tx = qb.x; ty = qb.y; spd = d.spd * .4;
    } else if (d.role === 'DL'){
      if (!d.free && P.t >= d.shed * mods(G).passPro * (G.quarter >= 3 ? mods(G).latePro : 1)) { d.free = true; }
      // Pass rush. The ends speed-rush: around the edge to a spot behind the quarterback, so stepping up in the pocket
      // gets away from them. The tackles bull-rush: they drive their blocker back, and the pocket shrinks.
      if (d.free){
        // (The turn comes from outside the spot behind him: that spot is ~2.9 yards off, so an end steering for it
        // until he was any closer than that would circle the pocket forever and never get home.)
        if (d.edge && dist(d, qb) > 4){ tx = qb.x - 1.6; ty = qb.y + d.edge * 2.4; } else { tx = qb.x; ty = qb.y; }
      } else { tx = qb.x; ty = qb.y; spd = d.edge ? .9 : 1.5; }
    } else if (d.blitz){
      tx = qb.x; ty = qb.y; spd = P.t < .35 ? 0 : d.spd * (P.t < 1.4 ? .55 : .9);
    } else if (d.man){
      const r = histAt(d.man, D.lag), cushion = P.t < .9 ? 2.4 : 1.1;
      tx = Math.min(r.x + cushion, 109.5); ty = r.y;
    } else if (d.zone){
      // Zone: drop to the landmark, then play whoever comes into it. Deep zones stay over the top of the deepest
      // man in the area ("keep everything in front"); underneath zones sit at their depth and mirror the nearest
      // threat, passing him on when he leaves the area.
      const z = d.zone, near = r => Math.abs(r.y - z.cy) <= z.hw + 1.5 && r.routeName !== 'block' && !r.down;
      const mine = P.rec.filter(near).map(r => histAt(r, D.lag));
      if (z.deep){
        const deepest = mine.sort((a, c) => c.x - a.x)[0];
        tx = Math.min(Math.max(P.los + z.depth, deepest ? deepest.x + 5 : 0), 109.5);
        ty = deepest ? z.cy + (deepest.y - z.cy) * .55 : z.cy;
      } else {
        const lm = P.los + z.depth, threat = mine.filter(r => r.x > P.los - 1).sort((a, c) => Math.hypot(a.x - lm, a.y - z.cy) - Math.hypot(c.x - lm, c.y - z.cy))[0];
        tx = threat ? clamp(threat.x + 1.3, P.los + 3, lm + 4) : lm;
        ty = threat ? z.cy + (threat.y - z.cy) * .92 : z.cy;
      }
    } else if (d.spy){ tx = P.los + 5.5; ty = qb.y; }
    else { tx = d.x; ty = d.y; }
    moveToward(d, tx, ty, spd, dt, d.role === 'DL' ? 5 : 7);
  }

  for (const p of P.all) if (p !== P.carrier) integrate(p, dt);   // the ball carrier moves in runCarrier
  // Engaged linemen: the blocker stays planted in front of his man.
  for (const d of P.def) if (d.role === 'DL' && !d.free && d.ol && !running){ const o = d.ol; const dx = qb.x - d.x, dy = qb.y - d.y, n = Math.hypot(dx, dy) || 1; o.x = d.x + dx / n * .95; o.y = d.y + dy / n * .95; }

  /* ----- the ball ----- */
  if (ball.state === 'held'){
    ball.x = ball.holder.x + .3; ball.y = ball.holder.y; ball.z = 1.5;
    if (holder === qb && !running){
      // Sacks: a free rusher reaches the quarterback before the throw.
      for (const d of P.def){
        if ((d.free || d.blitz) && !d.eng && d.stun <= 0 && dist(d, qb) < .9){
          if (Math.random() < .8){ return end(G, { type: 'sack', x: qb.x, y: qb.y, by: d }); }
          d.stun = .6; pop(P, qb.x, qb.y, 'SHED!', '#ffd84a');
        }
      }
      // A quarterback who takes off past the line is a runner.
      if (qb.x > P.los + .4) becomeCarrier(P, qb);
    }
  } else if (ball.state === 'air'){
    ball.t += dt;
    const s = Math.min(1, ball.t / ball.T);
    ball.x = ball.fx + (ball.tx - ball.fx) * s; ball.y = ball.fy + (ball.ty - ball.fy) * s;
    ball.z = 1.8 + (1.2 - 1.8) * s + 4 * ball.h * s * (1 - s);
    if (s >= 1) return resolvePass(G);
  }

  // Their quarterback decides after the sack check, so a throw and a sack can't both happen on one tick.
  if (G.youDefend && !P.result && ball.state === 'held' && ball.holder === qb && !P.carrier) cpuQB(G);
  if (P.carrier) runCarrier(G, dt, inp);
}

function becomeCarrier(P, p){
  P.carrier = p; P.carryT = P.t; p.mode = 'carry'; P.ball.state = 'held'; P.ball.holder = p;
  for (const d of P.def){ d.mode = null; if (d.role === 'DL' && !d.eng) d.free = d.free || false; }
  // On a handoff, receivers turn into blockers on the nearest defender in front of them; after a catch they just
  // ease up (downfield blocking on a pass play is the exception, not the rule).
  // Run blocking (handoffs, draws, keeps): the defensive line is held by the front, so the center and guards climb to
  // the linebackers (a pulling guard already has his man); the tight end and slot take the safeties or a backer
  // left over; the wideouts take the corners.
  if (P.handed){
    const lbs = P.def.filter(d => d.role === 'LB' && !d.blitz).sort((a, b) => a.y - b.y);
    const ol = P.off.filter(o => o.role === 'OL' && !o.blockOn).sort((a, b) => a.y - b.y).filter(o => o.n >= 1 && o.n <= 3);
    for (const d of lbs){ const o = ol.sort((a, b) => dist(a, d) - dist(b, d)).shift(); if (o && !P.off.some(x => x.blockOn === d)) o.blockOn = d; }
  }
  for (const o of P.off){
    if (o === p || o.role === 'OL' || o.role === 'QB') continue;
    o.mode = null; o.route = []; o.blockOn = null;
    if (!P.handed) continue;
    const fits = d => o.role === 'TE' || o.role === 'SL' ? d.role === 'S' || d.role === 'LB' : d.role === 'CB' || d.role === 'S';
    const near = P.def.filter(d => fits(d) && !d.eng && !P.off.some(x => x.blockOn === d) && d.x > o.x - 2).sort((a, b) => dist(a, o) - dist(b, o))[0];
    o.blockOn = near && dist(near, o) < 10 ? near : null;
  }
}

function runCarrier(G, dt, inp){
  const P = G.play, c = P.carrier, D = G.diff;
  // Practice has no one to tackle him: the whistle blows a moment after the catch or handoff.
  if (G.practice && P.t - P.carryT > (P.handed ? 1.8 : 1.1)) return end(G, { type: 'whistle', x: c.x, y: c.y });
  if (G.defDrill && !G.defDrill.full && P.t - P.carryT > 1) return end(G, { type: 'whistle', x: c.x, y: c.y });
  if (G.youDefend) inp = cpuRun(G, c);   // their ball carrier runs himself
  if (c.dive > 0){
    c.dive -= dt; c.vx = c.spd * 1.15; c.vy *= .9; integrate(c, dt);
    if (c.dive <= 0) return end(G, { type: 'dive', x: c.x, y: c.y });
    return checkBounds(G, c);
  }
  // Blocks: a blocker who reaches his man ties him up for a moment.
  for (const o of P.off){
    const f = o.blockOn;
    if (f && !f.eng && dist(o, f) < 1.2 && f.stun <= 0){ f.eng = { by: o, until: P.t + rnd(.8, 1.6) }; o.blockOn = null; }
  }
  // Carrying the ball costs a little speed, so pursuers with good angles can run him down.
  const base = c.spd * .97, slow = c.stumble > 0 ? .55 : c.truck > 0 ? .85 : 1;
  c.stumble = Math.max(0, c.stumble - dt); c.truck = Math.max(0, (c.truck || 0) - dt);
  const sp = Math.hypot(c.vx, c.vy), dir = sp > .5 ? { x: c.vx / sp, y: c.vy / sp } : { x: 1, y: 0 };
  const near = P.def.filter(d => !d.down && d.stun <= 0 && !d.eng).map(d => ({ d, dd: dist(d, c) })).sort((a, b) => a.dd - b.dd);

  /* Juke: a hard cut away from the nearest man closing in. It beats him only if it's timed as he arrives (about
     two yards away is the sweet spot) and only him; everyone else keeps coming. */
  if (inp.juke && c.jukeCD <= 0 && c.dive <= 0){
    const m = near.find(x => x.dd < 4.2 && (x.d.x - c.x) * dir.x + (x.d.y - c.y) * dir.y > -.5);
    const away = m ? Math.sign(c.y - m.d.y) || (inp.juke > 0 ? 1 : -1) : Math.sign(inp.juke) || 1;
    c.juke = .3; c.jukeCD = 1.1; c.jukeDir = away;
    emit(G, 'sfx', { name: 'juke' });
    if (m){
      const timing = clamp(1 - Math.abs(m.dd - 2.1) / 1.6, 0, 1);
      if (Math.random() < D.fool * timing * (1 + rate(G.me.off) / 250)){ m.d.stun = .75; m.d.missCD = 1; pop(P, m.d.x, m.d.y, 'JUKED!', '#7df9ff'); }
    }
  }
  /* Truck: lower the shoulder into the man in front (better odds of running through him, a little slower), or with
     nobody there, dive forward for the extra yard. */
  if (inp.truck && c.dive <= 0 && c.juke <= 0 && (c.truckCD || 0) <= 0){
    const m = near.find(x => x.dd < 2.4 && (x.d.x - c.x) * dir.x + (x.d.y - c.y) * dir.y > 0);
    if (m){ c.truck = .5; c.truckCD = 1.3; emit(G, 'sfx', { name: 'juke' }); }
    else { c.dive = .32; emit(G, 'sfx', { name: 'juke' }); return; }
  }
  c.truckCD = Math.max(0, (c.truckCD || 0) - dt);

  /* Steering: the runner goes where the stick points, as fast as it's pushed. No stick: he keeps running the way
     he's going. Momentum (accelToward) makes a hard cut cost speed. */
  let tvx, tvy;
  const st = inp.carStick, m = st ? Math.hypot(st.x, st.y) : 0;
  if (c.juke > 0){ c.juke -= dt; tvx = dir.x * base * .55; tvy = c.jukeDir * base * 1.05; }
  else if (m > .05){ const push = Math.min(1, m); tvx = st.x / m * base * slow * push; tvy = st.y / m * base * slow * push; }
  else if (P.runPath && P.t - P.carryT < .8){ tvx = P.runPath.x * base * slow; tvy = P.runPath.y * base * slow; }   // the called run's path
  else { tvx = (sp > 2 ? dir.x : 1) * base * slow; tvy = (sp > 2 ? dir.y : 0) * base * slow; }
  if (c.juke > 0){ c.vx += (tvx - c.vx) * Math.min(1, 14 * dt); c.vy += (tvy - c.vy) * Math.min(1, 14 * dt); }   // the cut itself is explosive
  else accelToward(c, tvx, tvy, dt, 10);
  integrate(c, dt);
  if (c.x >= 100) return end(G, { type: 'td', x: c.x, y: c.y });
  if (checkBounds(G, c)) return;

  /* Tackles. Each defender in reach gets one try, decided by the hit: head on is the surest, from the side less so,
     an arm tackle from behind least; closing speed helps; a second man arriving (gang tackle) or a runner already
     stumbling makes it likelier; a truck makes a frontal tackle harder. A tackled runner falls forward a little
     unless he's stood up head on, and a big hit can jar the ball loose. */
  const cs = Math.hypot(c.vx, c.vy), fwd = cs > .5 ? { x: c.vx / cs, y: c.vy / cs } : { x: 1, y: 0 };
  for (const d of P.def){
    if (d.stun > 0 || d.missCD > 0 || d.eng || d.down || d.role === 'DL' && !d.free && d.ol) continue;
    const dd = dist(d, c), rx = (d.x - c.x) / (dd || 1), ry = (d.y - c.y) / (dd || 1);
    const front = rx * fwd.x + ry * fwd.y, reach = front > -.3 ? 1.25 : 1.0;
    if (dd > reach) continue;
    const closing = Math.max(0, -((d.vx - c.vx) * rx + (d.vy - c.vy) * ry));
    const help = P.def.some(o => o !== d && !o.down && o.stun <= 0 && !o.eng && !(o.role === 'DL' && !o.free && o.ol) && dist(o, c) < 2.3);   // a blocked lineman can't help
    let p = D.tackle * (front > .35 ? .96 : front > -.35 ? .88 : .86);
    p += Math.min(.06, closing * .009);
    if (front <= .35) p -= Math.max(0, cs - 6.5) * .02;   // a runner at full speed is hard to grab from the side
    if (c.truck > 0 && front > .2) p *= .62;
    if (help) p += .1;
    if (c.stumble > 0) p += .14;
    p *= 1 + rate(G.opp.def) / 300 - rate(G.me.off) / 300;
    p = clamp(p, .35, .97);
    if (Math.random() < p){
      const big = closing > 6.5;
      if (Math.random() < .0025 + (big ? .01 : 0) + (front < -.35 ? .003 : 0)) return end(G, { type: 'fumble', x: c.x, y: c.y, by: d });
      if (big){ pop(P, c.x, c.y, 'BIG HIT!', '#ff5a4e'); emit(G, 'shake', { a: 4 }); emit(G, 'hitstop', { s: .1 }); }
      // Forward progress: a runner hit from the side or behind falls forward; one stood up head on doesn't.
      const fall = front > .35 ? Math.max(0, cs * .07 - closing * .05) : rnd(.5, 1.5);
      return end(G, { type: 'tackle', x: c.x + Math.max(0, fwd.x) * fall + .2, y: c.y, by: d });
    }
    d.missCD = 1.3; c.stumble = .32;
    if (c.truck > 0 && front > .2){ d.stun = .9; d.down = true; d.vx = d.vy = 0; pop(P, d.x, d.y, 'TRUCKED!', '#ffd84a'); }
    else if (front > -.35){ d.stun = .5; pop(P, c.x, c.y, pick(['BROKEN TACKLE!', 'SPIN!', 'STIFF ARM!']), '#ffd84a'); }
    else { d.stun = 1; d.down = true; d.vx = d.vy = 0; pop(P, d.x, d.y, 'SHAKEN OFF!', '#ffd84a'); }
    emit(G, 'sfx', { name: 'juke' });
  }
}

function checkBounds(G, c){
  if (c.y < 0 || c.y > FW){ end(G, { type: 'oob', x: c.x, y: clamp(c.y, 0, FW) }); return true; }
  return false;
}

/* ---------- you on defense ---------- */
/* The opposing quarterback: drops back, reads who's open (by separation, a little extra for depth), and throws to
   where that receiver will be when the ball arrives. Quicker and more accurate on harder levels; under pressure
   he gets rid of it early and wild. Drills can fix his release time (the pass rush). */
const CPU_QB = { rookie: { hold: [2.0, 2.8], err: 1.3, react: .55 }, pro: { hold: [1.8, 2.5], err: 1, react: .45 }, allpro: { hold: [1.6, 2.3], err: .8, react: .38 }, legend: { hold: [1.5, 2.1], err: .6, react: .3 } };
function cpuQB(G){
  const P = G.play, qb = P.qb, Q = CPU_QB[G.diffKey] || CPU_QB.pro;
  if (P.qbAt == null) P.qbAt = G.defDrill?.throwAt ?? rnd(...Q.hold);
  const heat = Math.min(99, ...P.def.filter(d => (d.free || d.blitz) && !d.eng).map(d => dist(d, qb)));
  // Pressure: once a rusher is close he needs a beat to feel it and get rid of the ball; a quick rush wins that race.
  if (heat < 3.5 && P.pressureAt == null){ P.pressured = true; P.pressureAt = P.t; }
  const bail = P.pressureAt != null && P.t - P.pressureAt >= Q.react;
  if (P.t < .9 || P.t < P.qbAt && !bail) return;
  // A cover play in a game: he's coming to your man, open or not.
  let best = P.forceTarget && !P.forceTarget.down ? P.forceTarget : null, bs = best ? Infinity : -Infinity;
  for (const r of best ? [] : P.rec){
    if (r.routeName === 'block') continue;
    const sep = Math.min(12, ...P.def.map(d => dist(d, r))), s = sep + (r.x - P.los) * .03;
    if (s > bs){ bs = s; best = r; }
  }
  if (!best) return;
  let T = .6, g;
  for (let i = 0; i < 5; i++){ g = ghostAt(best, T); T = trajectory(G, g.x, g.y).T; }
  const e = Q.err * (P.pressured ? 2.2 : 1), wob = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15 * e;
  P.aimedAt = best;
  throwTo(G, g.x + wob(), g.y + wob());
}
/* Their ball carrier: runs away from the nearest tackler in front of him and keeps off the sideline. */
function cpuRun(G, c){
  const ahead = G.play.def.filter(d => d.x > c.x - 1 && d.stun <= 0 && !d.down).sort((a, b) => dist(a, c) - dist(b, c))[0];
  let steer = ahead && dist(ahead, c) < 5 ? (ahead.y > c.y ? -1 : 1) : 0;
  if (c.y < 3) steer = 1; else if (c.y > FW - 3) steer = -1;
  const n = Math.hypot(1, steer * .6);
  return { carStick: { x: 1 / n, y: steer * .6 / n }, juke: 0, truck: false };
}
/* ---------- coach mode (season): your players run the call ---------- */
/* The input for a snap you're coaching rather than playing: the quarterback reads it out and throws (or throws it
   away), the option is read off the end, and the ball carrier picks his lane. */
const COACH_QB = { hold: [1.6, 2.5], err: 2.7, react: .4 };
export function coachInput(G){
  const P = G.play, none = { steer: 0, targetY: null, juke: 0, dive: false, truck: false, qbMove: null, qbKeys: null, carStick: null };
  if (!P?.live || P.result) return none;
  if (P.carrier) return { ...none, ...autoRun(G, P.carrier) };
  if (P.option && !P.handed){ if (!P.option.crash && P.t > .38) handoff(G); return none; }   // he sat on the quarterback: give
  if (P.draw || P.runCall) return none;
  if (canThrow(G)) autoQB(G);
  return none;
}
function autoQB(G){
  const P = G.play, qb = P.qb, Q = COACH_QB;
  if (P.qbAt == null) P.qbAt = rnd(...Q.hold) + (P.pa ? .35 : 0);
  const heat = Math.min(99, ...P.def.filter(d => (d.free || d.blitz) && !d.eng && d.stun <= 0).map(d => dist(d, qb)));
  if (heat < 3.5 && P.pressureAt == null){ P.pressured = true; P.pressureAt = P.t; }
  const bail = P.pressureAt != null && P.t - P.pressureAt >= Q.react;
  // About to be hit: some of the time he feels it and gets rid of it; the rest, he's sacked.
  if (heat < 1.8 && P.feel == null) P.feel = Math.random() < .55;
  const danger = heat < 1.8 && P.feel;
  if (P.t < .8 || P.t < P.qbAt && !bail && !danger) return;
  // His read: usually the most open man, sometimes his second look (he's good, not perfect).
  const reads = P.rec.filter(r => r.routeName !== 'block' && !r.down).map(r => {
    const g = ghostAt(r, .5); return { r, sc: Math.min(12, ...P.def.filter(d => d.role !== 'DL').map(d => dist(d, g))) + (r.x - P.los) * .04 };
  }).sort((a, b) => b.sc - a.sc);
  if (!reads.length) return;
  const pickd = reads[1] && Math.random() < .3 ? reads[1] : reads[0], best = pickd.r, bs = pickd.sc;
  // Nobody open: hang in a beat longer, then throw it away rather than force it into coverage.
  if (bs < 1.7 && P.t < P.qbAt + .9 && !bail && !danger) return;
  if (bs < 1.1 || danger && reads[0].sc < 2.4 && Math.random() < .7){ P.throwAway = true; P.aimedAt = null; return throwTo(G, P.los + 3, qb.y < MID ? -3 : FW + 3); }
  let T = .6, g;
  for (let i = 0; i < 5; i++){ g = ghostAt(best, T); T = trajectory(G, g.x, g.y).T; }
  const e = Q.err * (P.pressured ? 1.9 : 1) * mods(G).acc * (1 - rate(G.me.off) / 200), wob = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15 * e;
  P.aimedAt = best;
  throwTo(G, g.x + wob(), g.y + wob());
}
/* The ball carrier: four yards ahead, the lane farthest from anyone free (and off the sideline), following the
   called run's design for its first steps, with a juke as a man closes in. */
function autoRun(G, c){
  // A lineman still held by his blocker isn't a threat (that's the hole).
  const P = G.play, free = P.def.filter(d => d.x > c.x - 1 && !d.down && d.stun <= 0 && !d.eng && !(d.role === 'DL' && !d.free && d.ol));
  let best = 0, bs = -1e9;
  for (let dy = -6; dy <= 6; dy += 1.5){
    const px = c.x + 4, py = clamp(c.y + dy, 2, FW - 2);
    const sc = Math.min(12, ...free.map(d => Math.hypot(d.x - px, d.y - py))) - Math.abs(dy) * .25 - (py < 4 || py > FW - 4 ? 2.5 : 0);
    if (sc > bs){ bs = sc; best = dy; }
  }
  if (P.runPath && P.t - P.carryT < (P.runCall === 'outside' || c.role === 'QB' ? .8 : .45)) return { carStick: null };   // let the design develop (the stretch longer)
  const lat = clamp(best / 4, -1, 1), n = Math.hypot(1, lat * .7);
  const ahead = free.sort((a, b) => dist(a, c) - dist(b, c))[0], dd = ahead ? dist(ahead, c) : 99;
  return { carStick: { x: 1 / n, y: lat * .7 / n }, steer: lat, juke: dd < 2.5 && dd > 1.6 && (c.jukeCD || 0) <= 0 && Math.random() < .35 ? (Math.sign(lat) || 1) : 0 };
}

/* How close your defender has to be to where the ball comes down for a jump to get a hand on it (yards). */
export const JUMP_R = 2.2;
/* Your defender: runs the way you push the stick (a drag from where your finger went down) or the arrow keys
   point, at a speed set by how far you push, and jumps the route when you tap. */
function userDefender(G, d, dt, inp){
  d.jump = Math.max(0, (d.jump || 0) - dt); d.jumpCD = Math.max(0, (d.jumpCD || 0) - dt);
  if (inp.jump && d.jumpCD <= 0){ d.jump = .45; d.jumpCD = .9; emit(G, 'sfx', { name: 'juke' }); }
  let tx = d.x, ty = d.y, push = 1;
  const st = inp.defStick, m = st ? Math.hypot(st.x, st.y) : 0;
  if (m > 0){ tx = d.x + st.x / m * 3; ty = d.y + st.y / m * 3; push = m; }
  else if (inp.defKeys){ tx = d.x + inp.defKeys.x * 3; ty = d.y + inp.defKeys.y * 3; }
  moveToward(d, tx, ty, d.spd * push * (d.jump > 0 ? 1.1 : 1), dt, 10);
}
/* Ends the current play from outside (drills: the pass rush is over the moment the ball is out). */
export function stopPlay(G, r){ end(G, r); }

/* A key third down in an opponent's drive, played by you. Pass rush: a sack, or a pressure that forces an
   incompletion, stalls the drive there. Coverage: a pass broken up or incomplete stalls it there, a catch short of
   the sticks stalls it at the tackle (`gain` yards on), an interception turns it over at the pick (`x`, in the
   rep's coordinates), a touchdown is a touchdown, and a catch that moves the chains plays the rest of the drive
   out from where he was brought down. A stalled drive tries a field goal if in range, else punts. 'blocked' and
   'offside' leave the drive as simulated. Returns the adjusted drive. */
export function applyStop(G, r, k, how, { gain = 0, x = null } = {}){
  if (how === 'blocked' || how === 'offside') return { ...r, stop: how };
  if (how === 'converted'){
    const from = clamp(Math.round(r.path[k] - gain), 1, 99), rest = simDrive(G, from);
    const path = [...r.path.slice(0, k + 1), ...rest.path], plays = k + 1 + rest.plays;
    return { ...rest, path, plays, yards: r.path[0] - rest.endAt, time: Math.round((k + 1) * rnd(17, 24)) + rest.time, stop: how };
  }
  if (how === 'pressure' && Math.random() < .4) return { ...r, stop: 'pressure-converted' };
  const spot = r.path[k], plays = k + 1, time = Math.round(plays * rnd(17, 24));
  if (how === 'td'){
    const path = [...r.path.slice(0, k + 1), 0];
    return { ...r, path, plays, yards: r.path[0], stop: how, half: false, kind: 'td', points: Math.random() < .04 ? 6 : 7, myX: 25, endAt: 0, time };
  }
  if (how === 'int'){
    // Your ball where you picked it off, measured from your own goal line (in your end zone: a touchback).
    const at = x == null ? spot : 100 - x, myX = at <= 0 ? 20 : Math.min(95, Math.round(at));
    const path = [...r.path.slice(0, k + 1), clamp(Math.round(at), 0, 99)];
    return { ...r, path, plays, yards: r.path[0] - spot, stop: how, half: false, kind: 'int', points: 0, myX, endAt: spot, time };
  }
  const at = clamp(Math.round(spot + (how === 'sack' ? rnd(5, 9) : how === 'short' ? -gain : 0)), 1, 99);
  const path = [...r.path.slice(0, k + 1), at], out = { ...r, path, plays, yards: r.path[0] - at, stop: how, half: false };
  if (at <= 33){
    const good = Math.random() < clamp(.97 - at / 55, .35, .95);
    Object.assign(out, good ? { kind: 'fg', points: 3, myX: 25 } : { kind: 'missfg', points: 0, myX: Math.max(at + 7, 20) });
  } else {
    const land = at - Math.round(rnd(36, 46));
    Object.assign(out, { kind: G.ot ? 'downs' : 'punt', points: 0, myX: G.ot ? at : land <= 0 ? 20 : Math.max(1, land + Math.round(rnd(-2, 6))) });
  }
  out.time = time;
  return out;
}

/* ---------- passing ---------- */
export const canThrow = G => { const P = G.play; return P?.live && !P.result && P.ball.state === 'held' && P.ball.holder === P.qb && !P.carrier; };
export const canHandoff = G => { const P = G.play; return canThrow(G) && !P.handed && !P.noHandoff && P.t < (P.option ? .65 : 1.3); };

/* The ball's flight to a spot, set by how far it goes (so by how far you pull back), in three kinds of throw:
   a bullet (flat and quick) up to 22 yards, a touch throw (over the linebackers, under the safeties) to 36, and a
   deep ball (real air under it) beyond. Each picks up where the one before leaves off, so a slightly longer pull is
   only ever a slightly longer flight. Shared with the aim arc so what you see is what's thrown. */
export const TOUCH_AT = 22, DEEP_AT = 36;
const bullet = d => ({ T: .22 + d / 28, h: Math.max(.4, d * .085) });
export function trajectory(G, tx, ty){
  const qb = G.play.qb, d = Math.hypot(tx - qb.x, ty - qb.y) || 1;
  if (d <= TOUCH_AT) return { ...bullet(d), tier: 'bullet', loft: false };
  const b = bullet(TOUCH_AT);
  if (d <= DEEP_AT) return { T: b.T + (d - TOUCH_AT) / 19, h: b.h + (d - TOUCH_AT) * .23, tier: 'touch', loft: true };
  const T = b.T + (DEEP_AT - TOUCH_AT) / 19, h = b.h + (DEEP_AT - TOUCH_AT) * .23;
  return { T: T + (d - DEEP_AT) / 17, h: h + (d - DEEP_AT) * .3, tier: 'deep', loft: true };
}
/* How far your throw can stray from where you aimed (yards, about one standard deviation): more on longer throws,
   under pressure, on the run and backpedaling; less on easier levels and for better offenses. */
export function throwSpread(G, tx, ty){
  const P = G.play, qb = P.qb, d = Math.hypot(tx - qb.x, ty - qb.y);
  let s = .22 + d * .017;
  const rush = Math.min(9, ...P.def.filter(x => (x.free || x.blitz) && !x.eng && x.stun <= 0).map(x => dist(x, qb)));
  if (rush < 2.5) s *= 1.75; else if (rush < 4.5) s *= 1.3;
  const v = Math.hypot(qb.vx, qb.vy); if (v > 2.2) s *= 1 + Math.min(.6, (v - 2.2) * .14);
  if (qb.vx < -1.5) s *= 1.2;
  s *= ({ rookie: .55, pro: .75, allpro: 1, legend: 1.1 })[G.diffKey] ?? 1;
  s *= 1 - rate(G.me.off) / 300;
  if (G.practice) s *= .5;
  return s * mods(G).acc;
}
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
/* Your slingshot throw: lands near where you aimed, by the spread above. */
export function userThrow(G, tx, ty){
  const s = throwSpread(G, tx, ty);
  return throwTo(G, tx + gauss() * s, ty + gauss() * s);
}
export function throwTo(G, tx, ty){
  const P = G.play, qb = P.qb, ball = P.ball, D = G.diff;
  const fl = trajectory(G, tx, ty);
  Object.assign(ball, { state: 'air', fx: qb.x + .3, fy: qb.y, tx, ty, t: 0, T: fl.T, h: fl.h });
  P.airYds = tx - P.los;
  P.thrown = true; G.stats.att++;
  emit(G, 'sfx', { name: 'throw' });
  // The intended receiver works back to the ball; nearby defenders break on it after a beat.
  const land = { x: tx, y: ty };
  // Judged by where each receiver will be when the ball comes down, not where he is now.
  const T = ball.T, at = p => ({ x: p.x + p.vx * T, y: p.y + p.vy * T });
  const r = P.rec.sort((a, b) => dist(at(a), land) - dist(at(b), land))[0];
  P.rec.sort((a, b) => a.num - b.num);
  if (r && dist(at(r), land) < 7 && dist(r, land) < r.spd * T + 1.5) r.mode = 'ball';
  P.reactAt = P.t + D.react;
  for (const df of P.def) if (df.role !== 'DL' && dist(df, land) < 22) df.pendingBall = true;
  if (G.practice) P.grade = gradeThrow(P, land, T, P.target || P.aimedAt, !!P.target);
  P.aimedAt = null;
}

/* ---------- throw grading (practice) ---------- */
/* Where a receiver would be after T seconds if he just kept running his route: the same movement code the game
   uses, run on a copy of him. */
export function ghostAt(p, T){
  const g = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, wp: p.wp, route: p.route, spd: p.spd, step: 0, face: 1 };
  for (let t = 0; t < T; t += 1 / 60){
    const w = g.route[g.wp];
    if (!w) moveToward(g, g.x, g.y, 0, 1 / 60);
    else { moveToward(g, w.x, w.y, g.spd, 1 / 60, 9); if (dist(g, w) < .7 && (!w.stop || g.wp < g.route.length - 1)) g.wp++; }
    integrate(g, 1 / 60);
  }
  return g;
}
/* Grades a throw against the receiver it was meant for (the one whose path the ball lands nearest):
   timing = in stride along his path (a slight lead is ideal; behind him or too far ahead costs), accuracy = how far
   to the side of his path, release = how quickly it came out. 0-100 each.
   Misses fall off on a smooth curve, not a straight line: a yard or so off barely costs, each yard after that costs
   about a letter grade, and only a ball nowhere near him fails. Behind him counts more than ahead of him. */
const soft = (miss, half) => 100 / (1 + (miss / half) ** 2);   // 100 on target, 50 at `half` yards off
const releaseScore = t => clamp(100 - Math.max(0, t - 2.5) * 20, 30, 100);
export function gradeThrow(P, land, T, aimedAt, strict){
  // Target drill: a ball that clearly goes to someone else (lands nearer a decoy's path, and close to it) scores 0.
  if (strict){
    const near = P.rec.filter(r => r.routeName !== 'block').map(r => ({ r, d: dist(ghostAt(r, T), land) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.r !== aimedAt && near.d < 3.5)
      return { score: 0, timing: 0, accuracy: 0, release: Math.round(releaseScore(P.t)), word: 'WRONG RECEIVER', who: aimedAt.role, wrong: true };
  }
  // A throw at a named receiver (keys 1-5, or the target) is judged against him; otherwise against whoever it lands nearest.
  const cands = P.rec.filter(r => r.routeName !== 'block' && (!aimedAt || r === aimedAt)).map(r => ({ r, g: ghostAt(r, T) }));
  const best = cands.sort((a, b) => dist(a.g, land) - dist(b.g, land))[0];
  const rel = releaseScore(P.t);
  if (!best || !aimedAt && dist(best.g, land) > 7) return { score: Math.round(rel * .15), timing: 0, accuracy: 0, release: Math.round(rel), word: 'NO ONE THERE', who: null };
  const { r, g } = best, ex = land.x - g.x, ey = land.y - g.y, sp = Math.hypot(g.vx, g.vy);
  let along = 0, cross = Math.hypot(ex, ey), moving = sp > 2;
  if (moving){ const ux = g.vx / sp, uy = g.vy / sp; along = ex * ux + ey * uy; cross = Math.abs(ex * uy - ey * ux); }
  const timing = soft(along < -.6 ? -.6 - along : along > 1 ? (along - 1) * .8 : 0, 2.1);
  const accuracy = soft(Math.max(0, cross - .4), 1.9);
  const score = Math.round(timing * .45 + accuracy * .4 + rel * .15);
  // The verdict names the biggest problem, or the praise.
  let word;
  if (score >= 93 && timing >= 92 && accuracy >= 90) word = moving ? 'PERFECT' : 'RIGHT ON HIM';
  else if (timing < 85 && (100 - timing) >= (100 - accuracy)) word = along < 0 ? (along < -2 ? 'BEHIND HIM' : 'A HAIR BEHIND') : (along > 2.5 ? 'LED TOO FAR' : 'A BIT FAR');
  else if (accuracy < 80) word = 'OFF TARGET';
  else if (rel < 70) word = 'LATE RELEASE';
  else word = moving ? 'IN STRIDE' : 'ON THE SPOT';
  return { score, timing: Math.round(timing), accuracy: Math.round(accuracy), release: Math.round(rel), word, who: r.role, inStride: timing >= 85 && accuracy >= 70 };
}
/* Throwing to a numbered receiver (keyboard): leads him by his current velocity, with some error by difficulty. */
export function throwToReceiver(G, num){
  const P = G.play, r = P.rec.find(p => p.num === num); if (!r || !canThrow(G)) return false;
  const qb = P.qb; let T = .5;
  for (let i = 0; i < 4; i++){ T = trajectory(G, r.x + r.vx * T, r.y + r.vy * T).T; }
  const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
  const e = G.diff.keyErr * (.6 + Math.hypot(r.x - qb.x, r.y - qb.y) / 30);
  P.aimedAt = r;
  throwTo(G, r.x + r.vx * T + g() * e, r.y + r.vy * T + g() * e);
  return true;
}
/* Starts a called run at the snap: the handoff (with that run's blocking), or sets up a QB draw or a read option. */
export function startRun(G, call){
  const P = G.play, side = P.b < MID ? 1 : -1, R = RUN_CALLS[call]; if (!R) return;
  P.runCall = call; P.side = side;
  if (call === 'qbdraw'){ P.draw = .55; return; }
  if (call === 'option'){
    // The end on the back's side is left unblocked: he's the read.
    const os = Math.sign(P.rb.y - P.qb.y) || side, key = P.def.filter(d => d.role === 'DL' && d.edge === os)[0];
    if (key){ key.optKey = true; key.free = true; key.ol = null; }
    P.option = { side: os, crash: Math.random() < .5, key };
    return;
  }
  handoff(G);
  P.runPath = { x: R.path[0], y: R.path[1] * side };
}
export function handoff(G){
  const P = G.play; if (!canHandoff(G)) return false;
  P.handed = true; P.handT = P.t; becomeCarrier(P, P.rb);
  // The give: inside, away from the read. If the end sat on the quarterback, he's optioned off: out of the play.
  if (P.option){ P.runPath = { x: .92, y: -.4 * P.option.side }; if (!P.option.crash && P.option.key) P.option.key.stun = .55; }
  emit(G, 'sfx', { name: 'catch' });
  return true;
}

function resolvePass(G){
  const P = G.play, b = P.ball, land = { x: b.tx, y: b.ty }, D = G.diff;
  if (P.throwAway) return end(G, { type: 'inc', why: 'Thrown away' });
  if (b.ty < 0 || b.ty > FW || b.tx > 110 || b.tx < -10) return end(G, { type: 'inc', why: 'Out of bounds' });
  const recs = P.rec.filter(r => !r.down).sort((a, c) => dist(a, land) - dist(c, land));
  const defs = P.def.filter(d => d.role !== 'DL' && d.stun <= 0).sort((a, c) => dist(a, land) - dist(c, land));
  const r = recs[0], d = defs[0], rd = r ? dist(r, land) : 99, dd = d ? dist(d, land) : 99;
  const u = Math.random();
  const you = P.def.find(x => x.user); if (you && P.aimedAt) P.userSep = dist(you, P.aimedAt);   // how tight your coverage was at the catch point
  // Your defender jumping the route (tapped while the ball was in the air) gets first crack at it.
  const jd = P.def.find(x => x.user && x.jump > 0 && dist(x, land) < JUMP_R);
  if (jd){
    const q = 1 - dist(jd, land) / JUMP_R;
    if (u < .18 + .42 * q) return end(G, { type: 'int', x: jd.x, y: jd.y, by: jd });
    if (u < .55 + .4 * q) return end(G, { type: 'inc', why: 'Swatted away', by: jd });
  }
  // Deep balls are harder: a defender can contest from further away, and the catch itself is tougher.
  const air = Math.max(0, land.x - P.los), CR = 1.7 + Math.min(1.2, air / 25);
  if (rd <= (D.catchR || 1.6) + mods(G).catchR){
    let contest = dd < CR ? (CR - dd) / CR : 0;
    // Leverage, judged along the receiver's run: a defender trailing behind him is shielded out of the play; one on
    // top of him (over a go route, in front of a crosser) is in position to make it.
    if (contest && d && r){
      const v = Math.hypot(r.vx, r.vy) || 1, along = ((d.x - r.x) * r.vx + (d.y - r.y) * r.vy) / v;
      contest *= along < -.5 ? .65 : along > .4 ? 1.25 : 1;
    }
    const pCatch = clamp(.96 - rd * .07 - air * .004 - contest * .6 * (.6 + .4 * D.intMul) + rate(G.me.off) / 400, .1, .98);
    const pInt = contest && dd < rd ? .3 * D.intMul * contest : 0;
    if (u < pCatch){
      G.stats.comp++;
      r.x = land.x; r.y = land.y; r.mode = null;
      // Catching the ball costs a receiver his momentum (more in traffic): he has to secure it and turn upfield.
      const keep = contest > .2 ? .2 : .35; r.vx *= keep; r.vy *= keep;
      const who = G.me.names?.[r.role];
      emit(G, 'sfx', { name: 'catch' }); pop(P, r.x, r.y, contest > .3 ? 'GREAT CATCH!' : who ? who.toUpperCase() : 'CAUGHT', contest > .3 ? '#ffd84a' : '#fff');
      if (r.x >= 100) return end(G, { type: 'td', x: r.x, y: r.y, pass: true, rec: r });
      becomeCarrier(P, r); P.catchX = r.x;
      return;
    }
    if (u < pCatch + pInt) return end(G, { type: 'int', x: d.x, y: d.y, by: d });
    return end(G, { type: 'inc', why: contest ? 'Broken up' : 'Dropped', by: contest ? d : null });
  }
  if (dd <= 1.3 && u < (.55 - dd * .15) * D.intMul) return end(G, { type: 'int', x: d.x, y: d.y, by: d });
  return end(G, { type: 'inc', why: dd <= 1.3 ? 'Nearly picked' : 'Incomplete' });
}

/* Defenders breaking on a thrown ball (after their reaction time). */
export function reactToBall(G){
  const P = G.play; if (!P || P.ball.state !== 'air' || P.t < P.reactAt) return;
  for (const d of P.def) if (d.pendingBall){ d.pendingBall = false; d.mode = 'ball'; }
}

/* ---------- ending a play ---------- */
function end(G, r){
  const P = G.play; if (P.result) return;
  P.result = r; P.live = false; P.endT = 0;
  if (r.by){ r.by.vx = r.by.vy = 0; }
  const c = P.carrier;
  if (['tackle', 'sack', 'dive', 'fumble'].includes(r.type)){
    const who = r.type === 'sack' ? P.qb : c; if (who){ who.down = true; who.vx = who.vy = 0; }
    if (r.by){ r.by.down = Math.random() < .5; }
    // The pile: defenders arriving pile on.
    for (const d of P.def) if (d !== r.by && !d.down && Math.hypot(d.x - r.x, d.y - r.y) < 2.6 && Math.random() < .6){ d.down = true; d.x += (r.x - d.x) * .5; d.y += (r.y - d.y) * .5; }
    burst(P, r.x, r.y, ['#8a6a3c', '#5b8f3a', '#cfe8b0'], 12);
    emit(G, 'sfx', { name: 'tackle' }); emit(G, 'shake', { a: r.type === 'sack' ? 3 : 2 });
  }
  for (const p of P.all){ if (!p.down){ p.vx *= .3; p.vy *= .3; } }
  if (r.type === 'td'){
    burst(P, r.x, r.y, [G.me.color, G.me.alt || '#fff', '#ffd84a', '#fff'], 40, 2);
    // The celebration: the scorer and teammates nearby jump around (drawn with a bounce).
    for (const o of P.off) if (Math.hypot(o.x - r.x, o.y - r.y) < 9) o.celebrate = true;
  }
}

/* Applies a finished play to the game: score, downs, clock, stats. Returns what happens next:
   'next' (another snap), 'td', 'turnover' (other team's ball at G.turnoverX), 'safety', 'downs'. */
const byRole = (G, role) => (G.stats.by ||= {})[role] ||= { rec: 0, yds: 0, td: 0, car: 0, ryds: 0, rtd: 0 };
export function applyResult(G){
  const P = G.play, r = P.result, S = G.stats, L = P.los;
  S.plays++;
  const spot = r.x ?? L, gain = Math.round(spot - L);
  const rushing = P.carrier && !P.thrown;
  let clockRuns = false, out;
  G.lastPlay = { type: r.type, gain, text: '' };
  switch (r.type){
    case 'td':
      if (rushing) { S.rush++; S.rushYds += Math.round(100 - L); S.rushTD++; }
      else { S.passYds += Math.round(100 - L); S.passTD++; }
      { const who = r.rec?.role || P.carrier?.role, b = who && byRole(G, who);
        if (b && rushing){ b.car++; b.ryds += Math.round(100 - L); b.rtd++; } else if (b){ b.rec++; b.yds += Math.round(100 - L); b.td++; } }
      S.longest = Math.max(S.longest, Math.round(100 - L));
      G.lastPlay.text = `${Math.round(100 - L)}-yard ${rushing ? 'run' : 'pass'}`;
      out = 'td'; break;
    case 'int':
      S.int++; G.lastPlay.text = 'Intercepted';
      G.turnoverX = r.x >= 100 ? 80 : clamp(r.x - rnd(0, 14), 1, 99);
      if (Math.random() < .04 * G.diff.intMul){ G.lastPlay.pick6 = true; }
      out = 'turnover'; break;
    case 'fumble':
      G.lastPlay.text = 'Fumble! Recovered by the defense'; G.turnoverX = clamp(r.x, 1, 99); out = 'turnover'; break;
    case 'inc':
      G.lastPlay.text = r.why || 'Incomplete'; out = advance(G, L); break;
    case 'sack':
      S.sacks++; G.lastPlay.text = `Sacked, loss of ${Math.max(0, -gain)}`;
      if (spot <= 0){ out = 'safety'; break; }
      clockRuns = true; out = advance(G, spot); break;
    default: {   // tackle, dive, out of bounds
      if (spot <= 0){ out = 'safety'; break; }
      if (rushing){ S.rush++; S.rushYds += gain; } else { S.passYds += gain; }
      if (P.carrier){ const b = byRole(G, P.carrier.role); if (rushing){ b.car++; b.ryds += gain; } else { b.rec++; b.yds += gain; } }
      if (gain > S.longest) S.longest = gain;
      G.lastPlay.text = `${rushing ? 'Run' : 'Catch'} for ${gain} yard${Math.abs(gain) === 1 ? '' : 's'}${r.type === 'oob' ? ', out of bounds' : ''}`;
      clockRuns = r.type !== 'oob';
      out = advance(G, spot, r.y);
    }
  }
  if (out === 'next' && clockRuns){
    // The clock keeps running until the next snap (see tickRunoff); in the last two minutes first downs stop it briefly.
    G.runoff = lateInHalf(G) && G.down === 1 ? 6 : Math.round(26 * mods(G).tempo);
  } else G.runoff = 0;
  return out;
}

function advance(G, spot, y){
  const L = G.play.los, first = L + G.toGo;
  if (y != null) G.y = clamp(y, HASH[0], HASH[1]);
  G.los = clamp(spot, .5, 99.5);
  if (G.los >= first){
    G.down = 1; G.toGo = Math.min(10, 100 - G.los);
    G.lastPlay.first = true;
    return 'next';
  }
  G.down++; G.toGo = Math.max(1, Math.round(first - G.los));
  if (G.down > 4){ G.turnoverX = G.los; return 'downs'; }
  return 'next';
}

/* The clock runs between plays after an in-bounds play; snapping quickly saves time (hurry-up), a timeout stops it.
   Returns false when the half ran out. */
export function tickRunoff(G, dt){
  if (G.runoff <= 0 || G.ot) return true;
  const d = Math.min(G.runoff, dt * 9);
  G.runoff -= d;
  return useClock(G, d);
}

/* ---------- penalties ---------- */
/* After one of your plays, maybe a flag: holding on a gain (it comes back, touchdowns too), pass interference on a
   contested deep incompletion (first down at the spot, 15 yards at most, as in college), a face mask on a tackle
   (15 more), offside on the defense (5 yards, or a free play that wipes out a turnover; on a bigger gain you
   choose). Rare enough to feel like real football. */
export function callPenalty(G){
  const P = G.play, r = P.result; if (!r || G.practice || G.youDefend || G.twoPt || G.ot >= 3) return null;
  const gain = Math.round((r.x ?? P.los) - P.los), u = Math.random();
  if (r.type === 'tackle' && gain >= 0 && Math.random() < .006) return { kind: 'fm', name: 'FACE MASK, DEFENSE', desc: '15 more yards, first down' };
  if (['tackle', 'oob', 'td', 'dive'].includes(r.type) && gain > 3 && u < .025)
    return { kind: 'hold', name: 'HOLDING, OFFENSE', desc: r.type === 'td' ? 'Touchdown wiped out · 10 yards, replay the down' : '10 yards, replay the down' };
  if (r.type === 'inc' && P.thrown && (P.airYds || 0) >= 12 && r.by && u < .14)
    return { kind: 'dpi', name: 'PASS INTERFERENCE', desc: 'Automatic first down at the spot' };
  if (u > .988){
    const turnover = ['int', 'fumble'].includes(r.type);
    return { kind: 'offside', name: 'OFFSIDE, DEFENSE', desc: turnover ? 'Free play: the turnover doesn\'t count · 5 yards' : '5 yards, replay the down',
      choice: !turnover && !['inc', 'sack'].includes(r.type) && gain > 5 && r.type !== 'td' };
  }
  return null;
}
/* Enforces a flag in place of the play (except the face mask, added after it). Returns what applyResult would. */
export function enforcePenalty(G, pen){
  const P = G.play, L = P.los; G.runoff = 0;
  const firstDown = () => { G.down = 1; G.toGo = Math.min(10, Math.round(100 - G.los)); };
  if (pen.kind === 'hold'){ G.los = Math.max(1, L - 10); G.toGo = Math.min(Math.round(100 - G.los), G.toGo + Math.round(L - G.los)); return 'next'; }
  if (pen.kind === 'dpi'){ G.los = Math.min(99, Math.max(L + 1, Math.min(L + 15, P.ball.tx))); G.y = clamp(P.ball.ty, HASH[0], HASH[1]); firstDown(); return 'next'; }
  if (pen.kind === 'offside'){ G.los = Math.min(99, L + 5); if (G.toGo <= 5) firstDown(); else G.toGo -= 5; return 'next'; }
  if (pen.kind === 'fm'){
    const out = applyResult(G); if (out !== 'next') return out;
    G.los = Math.min(99, G.los + 15); firstDown(); G.runoff = 0; return 'next';
  }
  return 'next';
}

/* ---------- special plays ---------- */
export function spike(G){ G.runoff = 0; useClock(G, 2); G.down++; G.toGo = Math.max(1, G.toGo); return G.down > 4 ? 'downs' : 'next'; }
export function kneel(G){ G.los = Math.max(1, G.los - 1); G.toGo++; G.down++; G.runoff = 40; return G.down > 4 ? 'downs' : 'next'; }
export function punt(G){
  const net = Math.round(rnd(36, 47)), land = G.los + net;
  return { net, oppX: land >= 100 ? 80 : land, touchback: land >= 100 };
}

/* Field goals and extra points: tap to lock the aim (it sweeps side to side), tap to lock the power, then the
   kick flies under real-ish physics with a crosswind. */
export function startKick(G, kind){
  const spotX = kind === 'pat' ? 90 : G.los - 7, spotY = clamp(G.y, HASH[0], HASH[1]);
  G.kick = { kind, spotX, spotY, stage: 'aim', t: 0, aim: 0, power: 0, wind: Math.round(rnd(-12, 12)),
    center: Math.atan2(MID - spotY, 110 - spotX), ball: null, good: null, dist: Math.round(110 - spotX) };
}
export function kickTap(G){
  const K = G.kick; if (!K) return;
  if (K.stage === 'aim'){ K.stage = 'power'; K.t = 0; emit(G, 'sfx', { name: 'blip' }); }
  else if (K.stage === 'power'){
    K.stage = 'flight'; K.t = 0;
    // Overpowering it risks a hook.
    const R = 20 + K.power * 52, el = .62, g = 10.7, vh = Math.sqrt(R * g / (2 * Math.tan(el))), a = K.aim + (K.power > .92 ? rnd(-.05, .05) : 0);
    K.ball = { x: K.spotX, y: K.spotY, z: 0, vx: vh * Math.cos(a), vy: vh * Math.sin(a), vz: vh * Math.tan(el), crossed: false };
    emit(G, 'sfx', { name: 'kick' });
  }
}
export function stepKick(G, dt){
  const K = G.kick; if (!K) return;
  K.t += dt;
  const sweep = G.diff.sweep;
  if (K.stage === 'aim') K.aim = K.center + Math.sin(K.t * Math.PI * 2 / sweep) * .2;
  else if (K.stage === 'power') K.power = (1 - Math.cos(K.t * Math.PI * 2 / (sweep * .85))) / 2;
  else if (K.stage === 'flight'){
    const b = K.ball;
    b.vy += K.wind * .045 * dt; b.vz -= 10.7 * dt;
    const px = b.x; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (!b.crossed && px < 110 && b.x >= 110){
      b.crossed = true;
      K.good = Math.abs(b.y - MID) <= GOAL_HALF && b.z >= BAR;
      K.why = K.good ? null : b.z < BAR ? 'Short' : b.y < MID ? 'Wide left' : 'Wide right';
      emit(G, 'sfx', { name: K.good ? 'good' : 'miss' });
    }
    if (b.z <= 0 && K.t > .2){
      b.z = 0;
      if (K.good == null){ K.good = false; K.why = 'Short'; emit(G, 'sfx', { name: 'miss' }); }
      K.stage = 'done'; K.t = 0;
    }
  }
}

/* ---------- the other team's drives ---------- */
/* Simulates a drive by the opponent starting `ytg` yards from your goal line. Returns what happened and where you
   get the ball back (x from your goal line), plus the yard-line path for the drive-summary animation. */
/* `behind`: the drive picks up after a stop (an incompletion or a sack), so it's less likely to finish. */
export function simDrive(G, ytg, { needed = null, behind = false, dm = null } = {}){
  ytg = Math.round(clamp(ytg, 1, 99));
  // Season mode: your defensive game plan (M.drive) and this drive's call (dm) shade how it goes.
  const W = mods(G).drive, C = dm || { q: 0, td: 1, fg: 1, to: 1, time: 1 };
  const D = G.diff, q = clamp(D.opp + (rate(G.opp.off) - rate(G.me.def)) / 300 + W.q + C.q, .1, .8);
  let pTD = clamp((q * .82 + (70 - ytg) * .006) * W.td * C.td, .04, .9);
  let pFG = clamp((.17 + (ytg < 50 ? .08 : 0)) * W.fg * C.fg, 0, 1 - pTD);
  const pTO = .11 * (1.25 - q) * W.to * C.to, pMiss = .04;
  // Overtime: if a field goal won't do, they go for it.
  if (needed === 'td'){ pTD = clamp(pTD + pFG * .4, 0, .9); pFG = 0; }
  if (behind){ pTD *= .7; pFG *= .85; }
  const u = Math.random();
  let kind, endAt, points = 0, myX;
  if (u < pTD){ kind = 'td'; endAt = 0; points = 7; myX = rnd() < .85 ? 25 : Math.round(rnd(18, 40)); }
  else if (u < pTD + pFG){ kind = 'fg'; endAt = Math.round(rnd(4, 30)); points = 3; myX = 25; }
  else if (u < pTD + pFG + pMiss){ kind = 'missfg'; endAt = Math.round(rnd(18, 34)); myX = Math.max(endAt + 7, 20); }
  else if (u < pTD + pFG + pMiss + pTO){ kind = Math.random() < .6 ? 'int' : 'fumble'; endAt = Math.round(rnd(Math.min(ytg, 10), ytg)); myX = clamp(endAt + Math.round(rnd(0, 18)), 1, 95); }
  else if (ytg < 45 && Math.random() < .5){ kind = 'downs'; endAt = Math.round(rnd(Math.max(2, ytg - 25), ytg)); myX = endAt; }
  else { kind = 'punt'; endAt = Math.round(clamp(ytg - rnd(5, 32), 35, ytg)); const land = endAt - Math.round(rnd(36, 46)); myX = land <= 0 ? 20 : Math.max(1, land + Math.round(rnd(-2, 6))); }
  if (kind === 'td' && Math.random() < .04) points = 6;   // missed extra point
  if (G.ot && kind === 'punt') kind = 'downs';
  const yards = ytg - endAt, plays = Math.max(1, Math.round(yards / rnd(5, 8)) + Math.floor(rnd(0, 3)) + (kind === 'punt' ? 3 : 0));
  // A bit quicker than real life so you get the ball back more often (arcade pacing).
  let time = Math.round(plays * rnd(17, 24) * (G.quarter === 4 && G.score[1] > G.score[0] ? 1.35 : 1) * W.time * C.time);
  // Running out of time: the drive stops where it was, with a last-second field goal try if in range.
  let half = false;
  if (!G.ot){
    const left = clockLeftInHalf(G);
    if (time >= left){
      const f = left / time, at = Math.round(ytg - yards * f);
      time = left; half = true;
      if ((kind === 'td' || kind === 'fg') && at <= 35){
        const good = Math.random() < clamp(.95 - at / 60, .3, .95);
        kind = good ? 'fg' : 'missfg'; points = good ? 3 : 0; endAt = at;
      } else { kind = 'half'; points = 0; endAt = at; }
    }
  }
  const path = [ytg]; let x = ytg;
  for (let i = 1; i < plays; i++){ x = Math.max(endAt, x - (ytg - endAt) / plays * rnd(.4, 1.6)); path.push(Math.round(x)); }
  path.push(endAt);
  return { kind, points, plays, yards, time, myX, endAt, path, half };
}
export const clockLeftInHalf = G => G.clock + (G.quarter === 1 || G.quarter === 3 ? G.qLen : 0);

/* Overtime from the third period on: a single two-point try each. */
export const simTwoPoint = G => Math.random() < clamp(.38 + (G.diff.opp - .35) * .6, .25, .6);
