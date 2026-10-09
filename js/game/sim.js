/* Coach Andre's Bowl game logic, separate from drawing and the page. Like the arcade football games it's modeled on, you
   only play offense: the other team's drives are simulated between yours.

   Coordinates are in yards. x runs along the field from your goal line (0) to theirs (100), with end zones at
   -10..0 and 100..110; y runs across it, 0..53.33. You always drive toward x = 100. */

export const FW = 53.33, MID = FW / 2, HASH = [20, 33.33], GOAL_HALF = 3.08, BAR = 3.33;

export const DIFFS = {
  rookie: { name: 'Rookie', lag: .42, defSpd: .9, rush: 4.6, tackle: .7, fool: .92, keyErr: .5, opp: .27, intMul: .5, react: .5, sweep: 2.0, blitz: .1, preview: true },
  pro:    { name: 'Pro', lag: .32, defSpd: .955, rush: 3.7, tackle: .79, fool: .8, keyErr: .8, opp: .35, intMul: .75, react: .36, sweep: 1.55, blitz: .18, preview: true },
  allpro: { name: 'All-Pro', lag: .26, defSpd: .985, rush: 3.3, tackle: .83, fool: .68, keyErr: 1.1, opp: .43, intMul: .72, react: .26, sweep: 1.2, blitz: .25, preview: false },
  legend: { name: 'Legend', lag: .2, defSpd: 1.015, rush: 3.05, tackle: .87, fool: .55, keyErr: 1.4, opp: .51, intMul: .85, react: .18, sweep: 1.0, blitz: .32, preview: false }
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
/* In a game, a called play: null (random routes, the default), a concept above, or 'run' (snap goes straight to
   the back; the receivers run short routes and turn into blockers). */
export const RUN_CALL = { name: 'Inside Run', tip: 'Snap goes straight to the back', routes: { X: 'hitch', Z: 'hitch', SL: 'hitch', TE: 'hitch', RB: [[1, .5], [4, .8], [11, 1]] } };

const POOL = {
  X: ['go', 'slant', 'post', 'corner', 'out', 'dig', 'curl', 'comeback', 'hitch', 'fade'],
  Z: ['go', 'slant', 'post', 'corner', 'out', 'dig', 'curl', 'comeback', 'hitch', 'fade'],
  SL: ['seam', 'slant', 'out', 'dig', 'drag', 'corner', 'curl', 'in'],
  TE: ['seam', 'flat', 'drag', 'stick', 'corner', 'out'],
  RB: ['flat', 'swing', 'wheel', 'block', 'in', 'flat']
};
const SPEED = { QB: 7.0, RB: 8.1, X: 8.35, Z: 8.35, SL: 8.2, TE: 7.3, OL: 5.0, DL: 6.9, LB: 7.6, CB: 8.4, S: 8.3 };

function mk(role, team, x, y, spd, extra = {}){
  return { role, team, x, y, vx: 0, vy: 0, spd, hist: [], face: team === 'off' ? 1 : -1, step: 0, stun: 0, missCD: 0,
    eng: null, down: false, skin: pick(SKIN), juke: 0, dive: 0, stumble: 0, jukeCD: 0, mode: null, ...extra };
}

/* Lines everyone up for the next snap and picks this play's routes and coverage (so they can be previewed). */
export function setupPlay(G){
  const L = G.los, b = clamp(G.y, HASH[0], HASH[1]), D = G.diff;
  const oMul = 1 + rate(G.me.off) / 900, dMul = D.defSpd * (1 + rate(G.opp.def) / 900);
  const off = [], def = [];
  [-3.2, -1.6, 0, 1.6, 3.2].forEach((dy, i) => off.push(mk('OL', 'off', L - .7, b + dy, SPEED.OL, { n: i })));
  const qb = mk('QB', 'off', L - 4.5, b, SPEED.QB * oMul);
  // Offset shotgun: the back lines up beside the quarterback, toward the wide side of the field, so he's easy to
  // see (and tap) apart from the QB.
  const rb = mk('RB', 'off', L - 5, b + (b < MID ? 2.6 : -2.6), SPEED.RB * oMul);
  const te = mk('TE', 'off', L - .9, b - 5, SPEED.TE * oMul);
  const x = mk('X', 'off', L - .9, Math.max(3, b - 19), SPEED.X * oMul);
  const z = mk('Z', 'off', L - .9, Math.min(FW - 3, b + 19), SPEED.Z * oMul);
  const sl = mk('SL', 'off', L - 1.2, Math.min(b + 10.5, z.y - 5), SPEED.SL * oMul);
  // Practice: only the receivers you asked for line up (the back always does, to block or take a handoff).
  const PR = G.practice, out = p => PR && p.role !== 'RB' && !PR.roles.includes(p.role);
  off.push(qb, rb, ...[te, x, z, sl].filter(p => !out(p)));

  // Routes: X and Z never run the same one; the back sometimes stays in to block. In practice, the routes you
  // picked (or a concept's), with the back blocking unless he's one of your receivers.
  const rec = [x, te, rb, sl, z].filter(p => !out(p) && !(PR && p.role === 'RB' && !PR.roles.includes('RB')));
  if (PR && !PR.roles.includes('RB')){ rb.routeName = 'block'; rb.route = []; rb.wp = 0; }
  const used = new Set();
  // Called plays (in a game) and picked routes (in practice) set the routes; anything unset is random.
  const plan = PR ? (PR.mode !== 'random' ? PR.routes : null) : G.call === 'run' ? RUN_CALL.routes : CONCEPTS[G.call]?.routes || null;
  for (const p of rec){
    let r = plan?.[p.role];
    if (Array.isArray(r)) r = 'block';   // the back on a called run: he gets the ball at the snap
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
    return;
  }

  // Defense: four down linemen, three backers, two corners, two safeties.
  const deep = L > 88 ? Math.min(L + 9, 108) : L + 13, press = L > 88 ? L + 3 : L + 6;
  [-4.3, -1.3, 1.3, 4.3].forEach(dy => def.push(mk('DL', 'def', L + .9, b + dy, SPEED.DL * dMul)));
  const blitz = Math.random() < D.blitz;
  const lb = [-4.5, 0, 4.5].map(dy => mk('LB', 'def', Math.min(L + 4.5, 109), b + dy, SPEED.LB * dMul));
  const cb1 = mk('CB', 'def', Math.min(press, 109), x.y + 1, SPEED.CB * dMul), cb2 = mk('CB', 'def', Math.min(press, 109), z.y - 1, SPEED.CB * dMul);
  const fs = mk('S', 'def', deep, clamp(b - 9, 6, FW - 6), SPEED.S * dMul), ss = mk('S', 'def', deep, clamp(b + 9, 6, FW - 6), SPEED.S * dMul);
  def.push(...lb, cb1, cb2, fs, ss);
  cb1.man = x; cb2.man = z; lb[0].man = te; lb[2].man = sl; lb[1].man = rb.routeName === 'block' ? null : rb;
  if (blitz){
    // Cover 1: the strong safety takes the slot, a backer blitzes, the free safety plays the deep middle.
    lb[2].man = null; lb[2].blitz = true; lb[2].x = L + 2; ss.man = sl; fs.zone = [0, FW]; fs.y = b;
  } else { fs.zone = [0, b]; ss.zone = [b, FW]; }
  if (!lb[1].man) lb[1].spy = true;

  // Each lineman gets an opponent; one rusher wins first, the rest a beat later.
  const dl = def.filter(p => p.role === 'DL'), first = Math.floor(rnd(4));
  dl.forEach((p, i) => { p.ol = off[Math.min(4, i + (i >= 2 ? 1 : 0))]; p.shed = D.rush + rnd(-.4, 1.2) + (i === first ? 0 : rnd(.8, 2.2)); });

  G.play = { off, def, qb, rb, rec, all: [...off, ...def], t: 0, live: false, ball: { state: 'held', holder: qb, x: qb.x, y: qb.y, z: 1.6 },
    carrier: null, result: null, blitz, los: L, b, aim: null, thrown: false, handed: false, pops: [], fx: [] };
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
  const k = Math.min(1, gain * dt);
  p.vx += (vx - p.vx) * k; p.vy += (vy - p.vy) * k;
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

  /* ----- offense ----- */
  for (const p of P.off){
    if (p === carrier) continue;
    if (p.role === 'OL' && p.blockOn){
      const f = p.blockOn;
      moveToward(p, f.x - .6, f.y, p.spd * 1.3, dt, 9);
      if (!f.eng && dist(p, f) < 1 && f.stun <= 0){ f.eng = { by: p, until: P.t + rnd(.3, .9) }; p.blockOn = null; }
    } else if (p.role === 'OL'){
      const foe = P.def.find(d => d.ol === p && !d.free);
      if (foe){
        const tgt = running ? carrier : qb, dx = tgt.x - foe.x, dy = tgt.y - foe.y, d = Math.hypot(dx, dy) || 1;
        moveToward(p, foe.x + dx / d * .95, foe.y + dy / d * .95, p.spd * 1.4, dt, 12);
      } else moveToward(p, p.x + (running ? 1 : 0), p.y, 2, dt);
    } else if (p === qb){
      if (holder === qb && inp.qbMove) moveToward(p, inp.qbMove.x, inp.qbMove.y, p.spd * .75, dt, 10);
      else if (holder === qb && inp.qbKeys) moveToward(p, p.x + inp.qbKeys.x * 3, p.y + inp.qbKeys.y * 3, p.spd * .7, dt, 10);
      else if (P.t < .6 && holder === qb) moveToward(p, P.los - 6, p.y, 3, dt);   // the drop back
      else moveToward(p, p.x, p.y, 0, dt);
    } else if (p.blockOn){
      const f = p.blockOn;
      if (f.eng?.by === p){ moveToward(p, f.x - .9, f.y, p.spd, dt, 10); }
      else moveToward(p, f.x - .6, f.y, p.spd, dt, 9);
    } else if (p.mode === 'ball'){
      moveToward(p, ball.tx, ball.ty, p.spd, dt);
    } else if (p.route){
      if (p.routeName === 'block' && !running){
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
    if (d.eng){
      if (P.t > d.eng.until || dist(d, d.eng.by) > 2.2) d.eng = null;
      else { const t = running ? carrier : qb; moveToward(d, t.x, t.y, d.spd * .22, dt); continue; }
    }
    let tx, ty, spd = d.spd;
    if (running){
      const l = lead(d, carrier); tx = l.x; ty = l.y;
      // Linebackers read the play for a beat before they come downhill.
      if (P.handed && d.role === 'LB' && P.t - P.handT < .22){ spd = d.spd * .4; }
      if (d.role === 'DL' && !d.free){
        // Run blocking: linemen hold their man until he sheds.
        if (P.t < d.shed * .45 + .5){ spd = d.spd * .25; } else d.free = true;
      }
    } else if (ball.state === 'air' && d.mode === 'ball'){
      tx = ball.tx; ty = ball.ty;
    } else if (ball.state === 'air' && (d.role === 'DL' || d.blitz)){
      tx = qb.x; ty = qb.y; spd = d.spd * .4;
    } else if (d.role === 'DL'){
      if (!d.free && P.t >= d.shed) { d.free = true; }
      if (d.free){ tx = qb.x; ty = qb.y; }
      else { tx = qb.x; ty = qb.y; spd = .9; }
    } else if (d.blitz){
      tx = qb.x; ty = qb.y; spd = P.t < .35 ? 0 : d.spd * (P.t < 1.4 ? .55 : .9);
    } else if (d.man){
      const r = histAt(d.man, D.lag), cushion = P.t < .9 ? 2.4 : 1.1;
      tx = Math.min(r.x + cushion, 109.5); ty = r.y;
    } else if (d.zone){
      const [lo, hi] = d.zone, mine = P.rec.filter(r => r.y >= lo && r.y <= hi && r.routeName !== 'block');
      const deepest = mine.sort((a, b) => b.x - a.x)[0], c = (lo + hi) / 2;
      tx = Math.min(Math.max(P.los + 11, deepest ? deepest.x + 4 : P.los + 12), 109.5);
      ty = deepest ? c + (deepest.y - c) * .6 : c;
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
          if (Math.random() < .88){ return end(G, { type: 'sack', x: qb.x, y: qb.y, by: d }); }
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

  if (P.carrier) runCarrier(G, dt, inp);
}

function becomeCarrier(P, p){
  P.carrier = p; P.carryT = P.t; p.mode = 'carry'; P.ball.state = 'held'; P.ball.holder = p;
  for (const d of P.def){ d.mode = null; if (d.role === 'DL' && !d.eng) d.free = d.free || false; }
  // On a handoff, receivers turn into blockers on the nearest defender in front of them; after a catch they just
  // ease up (downfield blocking on a pass play is the exception, not the rule).
  for (const o of P.off){
    if (o === p || o.role === 'OL' || o.role === 'QB') continue;
    o.mode = null; o.route = []; o.blockOn = null;
    if (!P.handed) continue;
    // The tight end takes a linebacker; wideouts take the defensive backs.
    const fits = d => o.role === 'TE' ? d.role === 'LB' : d.role === 'CB' || d.role === 'S';
    const near = P.def.filter(d => fits(d) && !d.eng && !P.off.some(x => x.blockOn === d) && d.x > o.x - 2).sort((a, b) => dist(a, o) - dist(b, o))[0];
    o.blockOn = near && dist(near, o) < 8 ? near : null;
  }
}

function runCarrier(G, dt, inp){
  const P = G.play, c = P.carrier, D = G.diff;
  // Practice has no one to tackle him: the whistle blows a moment after the catch or handoff.
  if (G.practice && P.t - P.carryT > (P.handed ? 1.8 : 1.1)) return end(G, { type: 'whistle', x: c.x, y: c.y });
  if (c.dive > 0){
    c.dive -= dt; c.vx = c.spd * 1.15; c.vy *= .9; integrate(c, dt);
    if (c.dive <= 0) return end(G, { type: 'dive', x: c.x, y: c.y });
    return checkBounds(G, c);
  }
  // Blocks: a blocker who reaches his man ties him up for a moment.
  for (const o of P.off){
    const f = o.blockOn;
    if (f && !f.eng && dist(o, f) < 1 && f.stun <= 0){ f.eng = { by: o, until: P.t + rnd(.4, 1.1) }; o.blockOn = null; }
  }
  // Carrying the ball costs a little speed, so pursuers with good angles can run him down.
  let spd = c.spd * .97 * (c.stumble > 0 ? .55 : 1);
  c.stumble = Math.max(0, c.stumble - dt);
  if (inp.juke && c.jukeCD <= 0){
    c.juke = .28; c.jukeCD = 1; c.jukeDir = inp.juke;
    emit(G, 'sfx', { name: 'juke' });
    for (const d of P.def) if (d.stun <= 0 && dist(d, c) < 2.8 && Math.random() < D.fool){ d.stun = .8; d.missCD = .9; pop(P, d.x, d.y, 'JUKED!', '#7df9ff'); }
  }
  if (inp.dive && c.dive <= 0 && c.juke <= 0){ c.dive = .32; emit(G, 'sfx', { name: 'juke' }); return; }
  let vy;
  if (c.juke > 0){ c.juke -= dt; vy = c.jukeDir * spd * 1.15; }
  else if (inp.targetY != null) vy = clamp((inp.targetY - c.y) * 3.2, -spd * .62, spd * .62);
  else vy = (inp.steer || 0) * spd * .62;
  const vx = Math.sqrt(Math.max(spd * spd - vy * vy, (spd * .35) ** 2));
  const k = Math.min(1, 9 * dt); c.vx += (vx - c.vx) * k; c.vy += (vy - c.vy) * k;
  integrate(c, dt);
  if (c.x >= 100) return end(G, { type: 'td', x: c.x, y: c.y });
  if (checkBounds(G, c)) return;
  // Tackles: a defender who gets a hand on him gets one try; one a step or two away dives for him (worse odds,
  // and a miss leaves him sprawled on the turf).
  for (const d of P.def){
    if (d.stun > 0 || d.missCD > 0 || d.eng || d.down || d.role === 'DL' && !d.free && d.ol) continue;
    const dd = dist(d, c), reach = d.x > c.x - .8 ? 1.5 : 1.15;
    if (dd > reach) continue;
    const close = dd <= .95;
    let p = D.tackle * (c.juke > 0 ? .3 : 1) * (close ? 1 : .6) * (1 + rate(G.opp.def) / 300 - rate(G.me.off) / 300);
    if (d.x < c.x - .3) p *= .82;   // arm tackles from behind
    if (!close){ d.x += (c.x - d.x) * .65; d.y += (c.y - d.y) * .65; }
    if (Math.random() < p){
      if (Math.random() < .009) return end(G, { type: 'fumble', x: c.x, y: c.y, by: d });
      return end(G, { type: 'tackle', x: c.x + .4, y: c.y, by: d });
    }
    d.missCD = 1.4; c.stumble = .25;
    if (close){ d.stun = .45; pop(P, c.x, c.y, pick(['BROKEN TACKLE!', 'SPIN!', 'STIFF ARM!']), '#ffd84a'); }
    else { d.stun = 1.1; d.down = true; d.vx = d.vy = 0; pop(P, d.x, d.y, 'MISSED!', '#ffd84a'); }
    emit(G, 'sfx', { name: 'juke' });
  }
}

function checkBounds(G, c){
  if (c.y < 0 || c.y > FW){ end(G, { type: 'oob', x: c.x, y: clamp(c.y, 0, FW) }); return true; }
  return false;
}

/* ---------- passing ---------- */
export const canThrow = G => { const P = G.play; return P?.live && !P.result && P.ball.state === 'held' && P.ball.holder === P.qb && !P.carrier; };
export const canHandoff = G => { const P = G.play; return canThrow(G) && !P.handed && P.t < 1.3; };

export function throwTo(G, tx, ty){
  const P = G.play, qb = P.qb, ball = P.ball, D = G.diff;
  const d = Math.hypot(tx - qb.x, ty - qb.y);
  Object.assign(ball, { state: 'air', fx: qb.x + .3, fy: qb.y, tx, ty, t: 0, T: .3 + d / 24, h: Math.max(.6, d * .17) });
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
}
/* Throwing to a numbered receiver (keyboard): leads him by his current velocity, with some error by difficulty. */
export function throwToReceiver(G, num){
  const P = G.play, r = P.rec.find(p => p.num === num); if (!r || !canThrow(G)) return false;
  const qb = P.qb; let T = .5;
  for (let i = 0; i < 4; i++){ const tx = r.x + r.vx * T, ty = r.y + r.vy * T; T = .3 + Math.hypot(tx - qb.x, ty - qb.y) / 24; }
  const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
  const e = G.diff.keyErr * (.6 + Math.hypot(r.x - qb.x, r.y - qb.y) / 30);
  throwTo(G, r.x + r.vx * T + g() * e, r.y + r.vy * T + g() * e);
  return true;
}
export function handoff(G){
  const P = G.play; if (!canHandoff(G)) return false;
  P.handed = true; P.handT = P.t; becomeCarrier(P, P.rb);
  // The center climbs to the middle linebacker.
  const mike = P.def.filter(d => d.role === 'LB' && !d.blitz).sort((a, b) => Math.abs(a.y - P.b) - Math.abs(b.y - P.b))[0];
  if (mike) P.off.find(o => o.role === 'OL' && o.n === 2).blockOn = mike;
  emit(G, 'sfx', { name: 'catch' });
  return true;
}

function resolvePass(G){
  const P = G.play, b = P.ball, land = { x: b.tx, y: b.ty }, D = G.diff;
  if (b.ty < 0 || b.ty > FW || b.tx > 110 || b.tx < -10) return end(G, { type: 'inc', why: 'Out of bounds' });
  const recs = P.rec.filter(r => !r.down).sort((a, c) => dist(a, land) - dist(c, land));
  const defs = P.def.filter(d => d.role !== 'DL' && d.stun <= 0).sort((a, c) => dist(a, land) - dist(c, land));
  const r = recs[0], d = defs[0], rd = r ? dist(r, land) : 99, dd = d ? dist(d, land) : 99;
  const u = Math.random();
  if (rd <= 1.6){
    const contest = dd < 1.7 ? (1.7 - dd) / 1.7 : 0;
    const pCatch = clamp(.96 - rd * .07 - contest * .6 * (.6 + .4 * D.intMul) + rate(G.me.off) / 400, .1, .98);
    const pInt = contest && dd < rd ? .3 * D.intMul * contest : 0;
    if (u < pCatch){
      G.stats.comp++;
      r.x = land.x; r.y = land.y; r.mode = null;
      emit(G, 'sfx', { name: 'catch' }); pop(P, r.x, r.y, contest > .3 ? 'GREAT CATCH!' : 'CAUGHT', contest > .3 ? '#ffd84a' : '#fff');
      if (r.x >= 100) return end(G, { type: 'td', x: r.x, y: r.y, pass: true });
      becomeCarrier(P, r); P.catchX = r.x;
      return;
    }
    if (u < pCatch + pInt) return end(G, { type: 'int', x: d.x, y: d.y, by: d });
    return end(G, { type: 'inc', why: contest ? 'Broken up' : 'Dropped' });
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
    burst(P, r.x, r.y, ['#8a6a3c', '#5b8f3a', '#cfe8b0'], 12);
    emit(G, 'sfx', { name: 'tackle' }); emit(G, 'shake', { a: r.type === 'sack' ? 3 : 2 });
  }
  for (const p of P.all){ if (!p.down){ p.vx *= .3; p.vy *= .3; } }
  if (r.type === 'td'){ burst(P, r.x, r.y, [G.me.color, G.me.alt || '#fff', '#ffd84a', '#fff'], 40, 2); }
}

/* Applies a finished play to the game: score, downs, clock, stats. Returns what happens next:
   'next' (another snap), 'td', 'turnover' (other team's ball at G.turnoverX), 'safety', 'downs'. */
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
      if (gain > S.longest) S.longest = gain;
      G.lastPlay.text = `${rushing ? 'Run' : 'Catch'} for ${gain} yard${Math.abs(gain) === 1 ? '' : 's'}${r.type === 'oob' ? ', out of bounds' : ''}`;
      clockRuns = r.type !== 'oob';
      out = advance(G, spot, r.y);
    }
  }
  if (out === 'next' && clockRuns){
    // The clock keeps running until the next snap (see tickRunoff); in the last two minutes first downs stop it briefly.
    G.runoff = lateInHalf(G) && G.down === 1 ? 6 : 26;
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
export function simDrive(G, ytg, { needed = null } = {}){
  ytg = Math.round(clamp(ytg, 1, 99));
  const D = G.diff, q = clamp(D.opp + (rate(G.opp.off) - rate(G.me.def)) / 300, .12, .78);
  let pTD = clamp(q * .82 + (70 - ytg) * .006, .05, .88);
  let pFG = clamp(.17 + (ytg < 50 ? .08 : 0), 0, 1 - pTD);
  const pTO = .11 * (1.25 - q), pMiss = .04;
  // Overtime: if a field goal won't do, they go for it.
  if (needed === 'td'){ pTD = clamp(pTD + pFG * .4, 0, .9); pFG = 0; }
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
  let time = Math.round(plays * rnd(17, 24) * (G.quarter === 4 && G.score[1] > G.score[0] ? 1.35 : 1));
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
