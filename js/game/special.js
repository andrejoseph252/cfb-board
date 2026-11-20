/* Special teams for Tailgate. Phase one: returning their punt.

   Their punter kicks from behind the line; the ball flies under gravity, and the crosswind gusts while it's up, so
   the landing ring (where it'll come down, recomputed every frame from the wind blowing right now) drifts and you
   have to keep adjusting under it like a real returner. Before the kick you call the return: a wall left or right
   (your blockers peel back and line up along that sideline, the lane outside them), middle (two columns), or safe
   (fair catch). Under the ball you choose: catch it and run, signal a fair catch, or let it go.

   A ball no one catches bounces, and how it was spinning in the air tells you how: end over end it hops forward and
   rolls on (toward your goal line); a spiral takes one wild hop and dies. The kicking team downs it where it stops
   (or a gunner touches it), into the end zone is a touchback, out of bounds is your ball there. A muff is a live
   ball: theirs if they fall on it, yours (and you can run) if you get it back.

   Once you've caught it the play is a normal run: step() in sim.js takes over, with the same steering, jukes,
   trucks, tackling and pursuit as on offense; your blockers pick up the nearest cover man in front of you.
   Coordinates are yours as on offense: you return toward x = 100; they punt toward your goal line at x = 0. */
import { step, clamp, FW, MID, internals as I } from './sim.js';
const { mk, moveToward, accelToward, integrate, becomeCarrier, end, pop, burst, dist, rnd, SPEED } = I;

const GRAV = 10.7;            // yards per second per second (as the field goal's flight)
const WIND_K = .045;          // sideways acceleration per mph of crosswind (as the field goal's flight)
export const CATCH_R = 1.9;   // how close (yards) the returner's hands must be to the ball as it comes down
const CATCH_Z = 1.7;          // the ball's height at the catch
const SNAP_T = .6, KICK_T = 1.5;   // the long snap reaches the punter; his foot meets the ball

export const RET_CALLS = {
  left: { name: 'LEFT WALL', short: 'Get outside the wall', tip: 'Your blockers wall off the left sideline: get outside them' },
  middle: { name: 'MIDDLE', short: 'Hit the crease', tip: 'Two columns of blockers up the middle: hit the crease between them' },
  right: { name: 'RIGHT WALL', short: 'Get outside the wall', tip: 'Your blockers wall off the right sideline: get outside them' },
  safe: { name: 'FAIR CATCH', short: 'Safe: no return', tip: 'Everyone blocks; your returner signals for a fair catch' }
};

/* The wind right now: the game's crosswind plus slow gusts (stronger on a windy day), so the ball drifts while it's up. */
function windNow(R, t){
  return R.wind + R.gustAmp * (Math.sin(t * .9 + R.ph1) * .7 + Math.sin(t * 2.3 + R.ph2) * .3);
}
/* Where the ball comes down to catching height if the wind holds as it is now. */
function predict(b, wind){
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz;
  for (let i = 0; i < 400; i++){
    const dt = 1 / 30; vy += wind * WIND_K * dt; vz -= GRAV * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    if (vz < 0 && z <= CATCH_Z) break;
  }
  return { x, y };
}

/* Sets up their punt, from their line of scrimmage `los` (in your coordinates), and your return call. */
export function setupPuntReturn(G, los, call){
  const fx = I.wx(G), dMul = (G.diff.defSpd || 1) * fx.spd, oMul = fx.spd;
  const punterX = Math.min(los + 14, 108.5);
  // The kick they're trying for: about 38-47 yards past the line, a pooch from midfield (higher, to pin you deep),
  // and now and then a shank off the side of his foot.
  const u = Math.random();
  let landX = los - rnd(38, 47), landY = clamp(MID + rnd(-13, 13), 9, FW - 9), T = rnd(3.9, 4.7), spin = Math.random() < .35 ? 'end' : 'spiral', kind = 'punt';
  if (landX < 9){ landX = rnd(4, 11); T = rnd(4.2, 4.9); spin = Math.random() < .6 ? 'end' : 'spiral'; kind = 'pooch'; }
  if (u < .06){ landX = los - rnd(18, 28); landY = clamp(landY + rnd(-1, 1) * 16, 2, FW - 2); T = rnd(2.6, 3.2); spin = 'end'; kind = 'shank'; }

  const def = [], off = [];
  const snapper = mk('LB', 'def', los + .8, MID, SPEED.TE * dMul, { cov: true });
  const line = [-4.8, -3.2, -1.6, 1.6, 3.2, 4.8].map(dy => mk('LB', 'def', los + .8, MID + dy, SPEED.LB * dMul * rnd(.92, 1), { cov: true }));
  const gunners = [5, FW - 5].map(y => mk('CB', 'def', los + .9, y, SPEED.CB * dMul * 1.02, { cov: true, gunner: true }));
  const shield = mk('S', 'def', los + 5.5, MID, SPEED.S * dMul * .95, { cov: true, safety: true });
  const punter = mk('LB', 'def', punterX, MID, 6.2, { punter: true, safety: true });
  def.push(snapper, ...line, ...gunners, shield, punter);
  // Coverage lanes: spread across the field, centered on where the punt is going.
  const lanes = [snapper, ...line].sort((a, b) => a.y - b.y);
  lanes.forEach((d, i) => { d.laneDy = -15 + i * 30 / (lanes.length - 1); });
  gunners.forEach(g => { g.laneDy = g.y < MID ? -2.5 : 2.5; });

  const ret = mk('RB', 'off', los - 43, MID, SPEED.RB * oMul, { returner: true });
  const front = [-5, -3, -1, 1, 3, 5].map(dy => mk('TE', 'off', los - 1, MID + dy, SPEED.TE * oMul * 1.04));
  const jams = gunners.map(g => mk('SL', 'off', los - 1, g.y, SPEED.SL * oMul, { jam: g }));
  const ups = [-4, 4].map(dy => mk('TE', 'off', los - 13, MID + dy, SPEED.TE * oMul * 1.04));
  off.push(ret, ...front, ...jams, ...ups);
  for (const p of off) p.face = 1;
  for (const d of def) d.face = -1;

  const wind = I.gust(G.cond) || 0;
  G.play = { off, def, qb: punter, rb: ret, rec: [], all: [...off, ...def], t: 0, live: true, los, b: MID, pops: [], fx: [],
    carrier: null, result: null, handed: false, thrown: false, userCtl: true,
    ball: { state: 'snap', x: los + .5, y: MID, z: .8, vx: 0, vy: 0, vz: 0, tx: landX, ty: landY, spin, bounces: 0 },
    ret: { call, kind, returner: ret, punter, wind, gustAmp: Math.max(2.5, Math.abs(wind) * .5 + (G.cond?.sky === 'wind' ? 5 : 0)), ph1: rnd(6), ph2: rnd(6),
      aim: { x: landX, y: landY, T }, wall: [...front, ...ups], lane: null, fair: call === 'safe', touched: false, muffed: false, rest: 0, cam: null } };
  G.play.cam = { x: los - 8, y: MID };
  G.los = los; G.y = MID;
}

/* ---------- their kickoff (you return it) ----------
   Their kicker runs up from their 35 (your 65); the coverage runs with him and can't cross the ball before it's
   kicked. What's coming is theirs to choose (you find out when it's in the air): deep (into the end zone or near
   it, a touchback is the 25), a sky kick (high, short, the coverage there with it), a squib (low and skipping, for
   whoever's nearest), or, when they're behind late, an onside kick. College rules: a fair catch (or a kneel in the
   end zone) inside your 25 comes out to the 25; a kickoff out of bounds is your ball at your 35; a kickoff is a
   live ball, so one that's gone 10 yards is theirs if they fall on it first. */
export const KO_CALLS = {
  left: { name: 'LEFT WALL', short: 'Get outside the wall' }, middle: { name: 'MIDDLE', short: 'Hit the crease' },
  right: { name: 'RIGHT WALL', short: 'Get outside the wall' }, safe: { name: 'TOUCHBACK', short: 'Kneel or fair catch: the 25' }
};
const KO_T = .8, KO_X = 65;   // their approach; their tee, in your coordinates
export function setupKickReturn(G, call){
  const fx = I.wx(G), dMul = (G.diff.defSpd || 1) * fx.spd, oMul = fx.spd;
  const late = G.quarter >= 4 && G.clock < 240 && G.score[1] < G.score[0] && !G.stDrill, u = Math.random();
  const type = late && u < .6 ? 'onside' : u < .7 ? 'deep' : u < .85 ? 'sky' : 'squib';
  let landX, landY = clamp(MID + rnd(-12, 12), 8, FW - 8), T, spin = Math.random() < .5 ? 'end' : 'spiral';
  if (type === 'deep'){ landX = rnd(-6, 7); T = rnd(3.8, 4.4); }
  else if (type === 'sky'){ landX = rnd(14, 26); T = rnd(4.5, 4.9); }
  else if (type === 'squib'){ landX = rnd(22, 32); T = rnd(.9, 1.2); spin = 'squib'; }
  else { landX = KO_X - rnd(4, 5); landY = MID + (Math.random() < .5 ? -1 : 1) * rnd(1.5, 3); T = .3; spin = 'onside'; }

  const def = [], off = [];
  const kicker = mk('LB', 'def', KO_X + 7, MID, 6.4, { punter: true, safety: true });
  for (let i = 0; i < 10; i++){
    const y = 4 + i * (FW - 8) / 9, edge = i === 0 || i === 9;
    def.push(mk(edge ? 'CB' : i % 3 ? 'LB' : 'S', 'def', KO_X + 1 + (i % 2) * .4, y, (edge ? SPEED.CB * 1.02 : SPEED.LB * rnd(.95, 1.04)) * dMul, { cov: true, gunner: edge, laneDy: y - MID }));
  }
  def.push(kicker);
  const ret = mk('RB', 'off', 3, MID, SPEED.RB * oMul, { returner: true });
  const front = [-16, -8, 0, 8, 16].map(dy => mk('TE', 'off', KO_X - 11, MID + dy, SPEED.TE * oMul * 1.04, { hands: true }));
  const mid = [-10, 0, 10].map(dy => mk('TE', 'off', 38, MID + dy, SPEED.TE * oMul * 1.04));
  const ups = [-6, 6].map(dy => mk('SL', 'off', 16, MID + dy, SPEED.SL * oMul));
  off.push(ret, ...front, ...mid, ...ups);
  for (const p of off) p.face = 1;
  for (const d of def) d.face = -1;
  const wind = I.gust(G.cond) || 0;
  G.play = { off, def, qb: kicker, rb: ret, rec: [], all: [...off, ...def], t: 0, live: true, los: KO_X, b: MID, pops: [], fx: [],
    carrier: null, result: null, handed: false, thrown: false, userCtl: true,
    ball: { state: 'tee', x: KO_X - .3, y: MID, z: .3, vx: 0, vy: 0, vz: 0, tx: landX, ty: landY, spin, bounces: 0 },
    ret: { ko: true, tb: 25, kickX: KO_X, call, kind: type, returner: ret, punter: kicker, wind, gustAmp: Math.max(2.5, Math.abs(wind) * .5 + (G.cond?.sky === 'wind' ? 5 : 0)), ph1: rnd(6), ph2: rnd(6),
      aim: { x: landX, y: landY, T }, wall: [...mid, ...ups, ...front], lane: null, fair: false, touched: false, muffed: false, rest: 0 } };
  G.play.cam = { x: 48, y: MID };
  G.los = KO_X; G.y = MID;
}

/* Wall spots (and the lane outside them) for the call, laid out up the field from where the ball's coming down. */
function layWall(P){
  const R = P.ret, L = { x: P.ball.tx, y: P.ball.ty }, n = R.wall.length;
  if (R.call === 'safe'){ R.spots = null; R.lane = null; return; }
  if (R.call === 'middle'){
    R.spots = R.wall.map((p, i) => ({ x: L.x + 7 + Math.floor(i / 2) * 4.5, y: MID + (i % 2 ? 5 : -5) }));
    R.lane = { x0: L.x + 4, x1: L.x + 7 + (n / 2) * 4.5, y0: MID - 2.6, y1: MID + 2.6 };
  } else {
    const left = R.call === 'left', wy = left ? 14 : FW - 14;
    R.spots = R.wall.map((p, i) => ({ x: L.x + 5 + i * 3.4, y: wy + (left ? -1 : 1) * (i % 2) * .8 }));
    R.lane = { x0: L.x + 3, x1: L.x + 5 + n * 3.4, y0: left ? 3 : FW - 11, y1: left ? 11 : FW - 3 };
  }
  // Each blocker takes the nearest spot.
  const free = [...R.spots];
  for (const p of R.wall){ free.sort((a, b) => dist(a, p) - dist(b, p)); p.spot = free.shift(); }
}

/* After the catch: every blocker picks up the nearest cover man coming at the runner who isn't blocked yet. */
function pickBlocks(P){
  const c = P.carrier; if (!c) return;
  for (const o of P.off){
    if (o === c) continue;
    const f = o.blockOn;
    if (f && !f.down && f.stun <= 0 && (!f.eng || f.eng.by === o) && f.x > c.x - 3) continue;
    const taken = new Set(P.off.map(x => x !== o && x.blockOn).filter(Boolean));
    const near = P.def.filter(d => !d.down && !d.eng && !taken.has(d) && d.x > c.x - 2 && dist(d, o) < 14).sort((a, b) => dist(a, o) + dist(a, c) * .5 - dist(b, o) - dist(b, c) * .5)[0];
    o.blockOn = near || null;
    if (!near){ o.route = []; o.wp = 0; }
  }
}

/* ---------- blocking on kicks (either side) ----------
   A block is a lock: the cover man is held (his .eng names the blocker) for a beat while the blocker stays glued to
   him, between him and whatever he's protecting (the ball coming down, or the man with it). Before the catch a
   blocker sets up at his spot and takes on anyone who comes through his patch; after it, he goes and finds a man. */
function locked(P, o){
  const m = o.lockOn;
  if (m && m.eng?.by === o && !m.down && !o.down && o.stun <= 0) return m;
  o.lockOn = null; return null;
}
function lock(P, o, m, lo, hi){ m.eng = { by: o, until: P.t + rnd(lo, hi) }; o.lockOn = m; o.tgt = null; o.lockCD = .9; }
/* How long a block holds (seconds): a chip while the ball's in the air, a real block once someone's running with it. */
const CHIP = [.3, .55], DRIVE = [.35, .65], BUMP = [.15, .3];
function glue(o, m, pt, dt){
  const dx = pt.x - m.x, dy = pt.y - m.y, n = Math.hypot(dx, dy) || 1;
  moveToward(o, m.x + dx / n * .85, m.y + dy / n * .85, o.spd * 1.15, dt, 12);
}
/* One blocker's tick. foes: the cover men; pt: what he's protecting; home: where he sets up when no one's near;
   reach: how far from himself he'll go to pick someone up; taken: men another blocker already has. */
function wallBlock(P, o, foes, pt, dt, home, reach, taken, dur = CHIP){
  o.lockCD = Math.max(0, (o.lockCD || 0) - dt);
  const m = locked(P, o);
  if (m){ glue(o, m, pt, dt); return; }
  let f = o.tgt;
  if (!f || f.eng || f.down || dist(f, o) > reach * 1.4 || taken.has(f) && taken.get(f) !== o) f = null;
  if (!f){
    f = foes.filter(d => !d.eng && !d.down && d.stun <= 0 && !taken.has(d) && dist(d, o) < reach)
      .sort((a, b) => dist(a, o) + dist(a, pt) * .35 - dist(b, o) - dist(b, pt) * .35)[0] || null;
  }
  o.tgt = f;
  if (f){
    taken.set(f, o);
    glue(o, f, pt, dt);
    if (dist(o, f) < 1.15 && o.lockCD <= 0) lock(P, o, f, dur[0], dur[1]);
  } else if (home) moveToward(o, home.x, home.y, o.spd, dt, 9);
  else moveToward(o, o.x, o.y, 0, dt);
}
/* Who each blocker already has, so two don't double the same man while another runs free. */
function claims(list){
  const m = new Map();
  for (const o of list){ const f = o.lockOn?.eng?.by === o ? o.lockOn : o.tgt; if (f) m.set(f, o); }
  return m;
}

/* One tick of the return. inp: the same input as on offense (carStick steers the returner, juke, truck). */
export function stepReturn(G, dt, inp){
  const P = G.play, R = P.ret, b = P.ball, ret = R.returner;
  if (!P.live || P.result) return;
  // Caught and running: the engine's run game from here. Caught in the end zone, he can take a knee (a touchback).
  if (P.carrier){
    if (P.carrier.x < -9.5) return end(G, P.catchX <= 0 ? { type: 'touchback', x: R.tb || 20, y: MID } : { type: 'safety', x: 0, y: P.carrier.y });   // out the back of the end zone
    if (inp.kneel && P.carrier.x <= 0 && P.carrier === R.returner){ pop(P, P.carrier.x, P.carrier.y, 'TOUCHBACK', '#fff'); return end(G, { type: 'touchback', x: R.tb || 20, y: MID }); }
    if ((P.blockT = (P.blockT || 0) - dt) <= 0){ P.blockT = .25; pickBlocks(P); }
    return step(G, dt, inp);
  }
  P.t += dt;
  for (const p of P.all){ p.stun = Math.max(0, p.stun - dt); if (p.down && p.stun <= 0) p.down = false; }

  /* ----- the ball ----- */
  if (b.state === 'tee'){
    if (P.t >= KO_T) kick(G);
  } else if (b.state === 'snap'){
    const k = Math.min(1, P.t / SNAP_T);
    b.x = P.los + .5 + (R.punter.x - .4 - P.los - .5) * k; b.y = MID; b.z = .8 + Math.sin(k * Math.PI) * .4;
    if (k >= 1) b.state = 'punter';
  } else if (b.state === 'punter'){
    b.x = R.punter.x - .4; b.y = R.punter.y; b.z = 1.3;
    if (P.t >= KICK_T) kick(G);
  } else if (b.state === 'air'){
    const w = windNow(R, P.t);
    b.vy += w * WIND_K * dt; b.vz -= GRAV * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const p = predict(b, w); b.tx = p.x; b.ty = p.y;
    // The catch, as it comes down to his hands.
    if (b.vz < 0 && b.z <= CATCH_Z && b.z > .3 && Math.hypot(ret.x - b.x, ret.y - b.y) <= CATCH_R && !ret.down) return catchIt(G);
    // You called the touchback and it's sailing deep into the end zone: no need to wait for it to come down.
    if (R.ko && R.call === 'safe' && R.kind === 'deep' && b.tx < -1.5 && P.t - R.kickT > .9){ pop(P, ret.x, ret.y, 'TOUCHBACK', '#fff'); return end(G, { type: 'touchback', x: R.tb, y: MID }); }
    if (b.z <= 0) bounce(G);
  } else if (b.state === 'ground' || b.state === 'loose') loose(G, dt);
  if (P.result) return;

  /* ----- your returner ----- */
  const st = inp.carStick, m = st ? Math.hypot(st.x, st.y) : 0;
  if (ret.stun > 0) accelToward(ret, 0, 0, dt, 6);
  else if (m > .05){ const push = Math.min(1, m); accelToward(ret, st.x / m * ret.spd * push, st.y / m * ret.spd * push, dt, 10); }
  else accelToward(ret, 0, 0, dt, 8);
  if (inp.fair && !R.fair && (b.state === 'air' || b.state === 'tee')){ R.fair = true; pop(P, ret.x, ret.y, R.ko && ret.x <= 0 ? 'TAKING A KNEE' : 'FAIR CATCH', '#fff'); }
  // A returner who picks up a bouncing ball: riskier than a clean catch.
  if ((b.state === 'ground' || b.state === 'loose') && b.z < 1.3 && Math.hypot(ret.x - b.x, ret.y - b.y) < 1 && !ret.down){
    if (R.fair && !R.muffed){ b.state = 'held'; b.holder = ret; return end(G, { type: 'fair', x: fairSpot(R, ret.x), y: ret.y }); }   // signaled: he can't advance it
    const moving = Math.hypot(b.vx, b.vy) > 2 || b.z > .3;
    if (!R.muffed && Math.random() < (moving ? .28 : .06)) return muff(G);
    return run(G, R.muffed ? 'RECOVERED!' : 'SCOOPED!');
  }

  /* ----- your blockers ----- */
  const chase = R.ko && (b.state === 'ground' || b.state === 'loose' || R.kind === 'onside' && b.state === 'air')
    ? P.off.filter(o => o !== ret && !o.down).sort((a, c) => dist(a, b) - dist(c, b)).slice(0, 2) : [];
  const covers = P.def.filter(d => d.cov), taken = claims(P.off), kicked = b.state !== 'snap' && b.state !== 'punter' && b.state !== 'tee';
  for (const o of P.off){
    if (o === ret) continue;
    if (chase.includes(o)){ moveToward(o, b.x, b.y, o.spd, dt, 10); continue; }   // a kickoff on the ground: go get it
    if (o.jam){
      // On the gunner: shadow him between him and the returner, and lock on when he gets there.
      const g = o.jam, dx = ret.x - g.x, dy = ret.y - g.y, n = Math.hypot(dx, dy) || 1;
      moveToward(o, g.x + dx / n * .9, g.y + dy / n * .9, o.spd * (P.t < SNAP_T ? .3 : 1.05), dt, 10);
      if (!g.eng && (g.jamCD || 0) <= 0 && dist(o, g) < 1.1 && P.t > .2){ g.eng = { by: o, until: P.t + rnd(.7, 1.6) }; g.jamCD = 1.2; }
      continue;
    }
    const m = locked(P, o);
    if (m){ glue(o, m, ret, dt); continue; }
    if (o.spot && kicked){
      // The wall (set at the kick): get to your spot and take on whoever comes through your patch.
      wallBlock(P, o, covers, ret, dt, o.spot, dist(o, o.spot) < 4 ? 2.5 : 1.5, taken, BUMP);
    } else if ((R.call === 'safe' || !R.spots) && P.t > SNAP_T){
      // Fair catch called (or no wall yet): hold up whoever comes off the line at you.
      wallBlock(P, o, covers, ret, dt, null, 3, taken);
    } else moveToward(o, o.x, o.y, 0, dt);
  }

  /* ----- their coverage ----- */
  for (const d of P.def){
    d.jamCD = Math.max(0, (d.jamCD || 0) - dt);
    if (d.stun > 0){ moveToward(d, d.x, d.y, 0, dt, 4); continue; }
    if (d.eng){
      if (P.t > d.eng.until || dist(d, d.eng.by) > 2.2) d.eng = null;
      else { moveToward(d, d.x - 1, d.y, d.spd * .22, dt); continue; }
    }
    if (d.punter && b.state === 'tee'){ moveToward(d, KO_X + .4, d.y, 7.5, dt, 9); continue; }   // his approach
    if (d.punter){
      if (b.state === 'punter' || b.state === 'snap') moveToward(d, P.t > SNAP_T ? d.x - 1.2 : d.x, d.y, 2, dt);   // his steps into the kick
      else moveToward(d, b.tx + 22, MID, d.spd * .6, dt);   // the last line of defense, trailing
      continue;
    }
    let tx, ty, spd = d.spd;
    if (b.state === 'tee'){
      // Running with the kicker, but nobody crosses the ball before it's kicked.
      moveToward(d, Math.max(KO_X + .6, d.x - 4), d.y, d.spd * .6, dt, 7); continue;
    } else if (b.state === 'snap' || b.state === 'punter'){
      // Protect, then release: gunners go at the snap, the line just before the kick.
      if (!d.gunner && P.t < KICK_T - .65){ moveToward(d, d.x, d.y, 0, dt); continue; }
      tx = d.x - 10; ty = d.y + (d.gunner ? 0 : d.laneDy * .1);
    } else if (b.state === 'air'){
      // Down the field in their lanes, breaking down short of the returner; gunners straight at the ball.
      const left = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * GRAV * (b.z - CATCH_Z)))) / GRAV;   // seconds to the catch
      if (d.gunner){ tx = b.tx + 1.2; ty = b.ty + d.laneDy * .4; }
      else if (d.safety){ tx = b.tx + 16; ty = MID + (b.ty - MID) * .5; spd *= .8; }
      else { const close = left < 1.2; tx = b.tx + (close ? 2.5 : 6); ty = b.ty + d.laneDy * (close ? .35 : .8); }
      // A fair catch: no one can touch him; they pull up a yard and a half away.
      if (R.fair && Math.hypot(d.x - ret.x, d.y - ret.y) < 2.2){ tx = d.x; ty = d.y; }
    } else {
      // A ball on the ground: get to it and down it (or fall on a muff). Stay out of the end zone with it.
      tx = b.x + (b.vx || 0) * .25; ty = b.y + (b.vy || 0) * .25;
      if (d.safety) { tx = b.x + 10; ty = b.y; spd *= .7; }
    }
    moveToward(d, tx, ty, spd, dt, 7);
  }
  for (const p of P.all) integrate(p, dt);

  // A cover man who gets to a ball on the ground: downed (a punt no one's touched) or recovered (a muff).
  if (R.ko && (b.state === 'ground' || b.state === 'loose') && b.z < 1.1){
    // A kickoff is a live ball: theirs once it's gone 10 yards (or you've touched it), yours (and you can run) any time.
    for (const d of P.def){
      if (d.down || d.stun > 0 || Math.hypot(d.x - b.x, d.y - b.y) > .9 || !(R.touched || b.x <= R.kickX - 10)) continue;
      burst(P, b.x, b.y, ['#8a6a3c', '#cfe8b0'], 12); pop(P, d.x, d.y, R.kind === 'onside' ? 'THEY GOT IT' : 'RECOVERED BY THEM', '#ff5a4e');
      return end(G, { type: 'kickrec', x: b.x, y: b.y, by: d });
    }
    for (const o of P.off){
      if (o.down || o.stun > 0 || Math.hypot(o.x - b.x, o.y - b.y) > .9) continue;
      R.returner = o; return run(G, R.kind === 'onside' ? 'WE GOT IT!' : 'SCOOPED!');
    }
  } else if (b.state === 'ground' || b.state === 'loose'){
    for (const d of P.def){
      if (d.down || d.stun > 0 || d.punter || b.z > 1.1 || Math.hypot(d.x - b.x, d.y - b.y) > .9) continue;
      if (R.muffed){ burst(P, b.x, b.y, ['#8a6a3c', '#cfe8b0'], 10); pop(P, d.x, d.y, 'RECOVERED BY THEM', '#ff5a4e'); return end(G, { type: 'muff', x: b.x, y: b.y, by: d }); }
      if (b.x <= 0) return end(G, { type: 'touchback', x: R.tb || 20, y: MID });
      pop(P, b.x, b.y, `DOWNED AT THE ${Math.max(1, Math.round(b.x))}`, '#ffd84a');
      return end(G, { type: 'downed', x: b.x, y: b.y, by: d });
    }
    // One of yours falls on your muff.
    if (R.muffed) for (const o of P.off){
      if (o === ret || o.down || b.z > 1.1 || Math.hypot(o.x - b.x, o.y - b.y) > .9) continue;
      R.returner = o; return run(G, 'RECOVERED!');
    }
  }

  // The camera: on the punter for the snap, then following the ball down to where it'll land.
  if (b.state === 'tee') P.cam = { x: KO_X - 14, y: MID };
  else if (b.state === 'snap' || b.state === 'punter') P.cam = { x: R.punter.x - 10, y: MID };
  // In the air: your returner and where it's coming down, both in frame from the kick on (the ball drops into view).
  else if (b.state === 'air') P.cam = { x: b.tx * .55 + ret.x * .45, y: b.ty * .55 + ret.y * .45 };
  else P.cam = { x: (b.x + ret.x) / 2, y: (b.y + ret.y) / 2 };
}

/* The punt itself: toward his aim point with the hang he wanted (into the wind he aims to drift back on target). */
function kick(G){
  const P = G.play, R = P.ret, b = P.ball, A = R.aim;
  b.state = 'air';
  if (R.ko){ b.x = R.kickX - .3; b.y = MID; b.z = .3; } else { b.x = R.punter.x - .8; b.y = R.punter.y; b.z = 1.2; }
  b.vx = (A.x - b.x) / A.T; b.vy = (A.y - b.y) / A.T - R.wind * WIND_K * A.T / 2;
  b.vz = (CATCH_Z - b.z + .5 * GRAV * A.T * A.T) / A.T;
  if (R.ko && R.kind === 'onside'){ b.vy = (A.y - b.y) / A.T; b.vz = (0 - b.z + .5 * GRAV * A.T * A.T) / A.T; b.popup = Math.random() < .45; }
  R.kickT = P.t;
  const word = R.ko ? { deep: `${A.T.toFixed(1)}s HANG`, sky: 'SKY KICK', squib: 'SQUIB!', onside: 'ONSIDE!' }[R.kind]
    : R.kind === 'shank' ? 'SHANKED!' : R.kind === 'pooch' ? 'POOCH' : `${Math.round(A.T * 10) / 10}s HANG`;
  pop(P, b.x, b.y, word, R.kind === 'onside' || R.kind === 'shank' ? '#7df9ff' : '#fff');
  G.events.push({ type: 'sfx', name: 'kick' });
  const p = predict(b, windNow(R, P.t)); b.tx = p.x; b.ty = p.y;
  // On a kickoff the man nearest where it's coming down fields it (on a squib or onside, one of your up men): he's yours.
  if (R.ko){ const near = P.off.filter(o => !o.down).sort((a, c) => Math.hypot(a.x - b.tx, a.y - b.ty) - Math.hypot(c.x - b.tx, c.y - b.ty))[0]; if (near) R.returner = near; }
  layWall(P);
}

/* The catch: clean (then run, or a fair catch is dead there), or a muff that's a live ball. */
function catchIt(G){
  const P = G.play, R = P.ret, b = P.ball, ret = R.returner;
  const off = Math.hypot(ret.x - b.x, ret.y - b.y) / CATCH_R, spd = Math.hypot(ret.vx, ret.vy);
  const traffic = P.def.some(d => !d.eng && !d.down && dist(d, ret) < 2.2);
  const wet = Math.max(0, -I.wx(G).catchR) * .25;
  let pMuff = .02 + off * off * .12 + Math.max(0, spd - 2.5) * .03 + wet + (traffic && !R.fair ? .06 : 0);
  if (R.fair) pMuff *= .5;
  if (Math.random() < pMuff) return muff(G);
  b.state = 'held'; b.holder = ret;
  if (R.fair){ pop(P, ret.x, ret.y, R.ko && ret.x <= 0 ? 'TOUCHBACK' : 'FAIR CATCH', '#fff'); G.events.push({ type: 'sfx', name: 'whistle' }); return end(G, { type: 'fair', x: fairSpot(R, ret.x), y: ret.y }); }
  return run(G, null);
}
/* Where a fair catch puts the ball: there, except a kickoff caught inside your 25 (or in the end zone) is the 25. */
function fairSpot(R, x){ return R.ko && x < 25 ? 25 : x;
}
function muff(G){
  const P = G.play, R = P.ret, b = P.ball, ret = R.returner;
  R.muffed = true; R.touched = true;
  Object.assign(b, { state: 'loose', holder: null, x: ret.x, y: ret.y, z: 1.1, vx: ret.vx * .3 + rnd(-3, 3), vy: ret.vy * .3 + rnd(-3, 3), vz: 2.6, spin: 'end' });
  ret.stun = .45;
  pop(P, ret.x, ret.y, 'MUFFED!', '#ff5a4e'); G.events.push({ type: 'sfx', name: 'drop' }); G.events.push({ type: 'shake', a: 2 });
}
/* He has it: from here it's a run (step() in sim.js). */
function run(G, word){
  const P = G.play, R = P.ret, c = R.returner;
  becomeCarrier(P, c); P.catchX = c.x; R.caught = true; P.cam = null;
  if (word) pop(P, c.x, c.y, word, '#ffd84a');
  G.events.push({ type: 'sfx', name: 'catch' });
  for (const o of P.off) if (o !== c) o.route = [];
  pickBlocks(P);
}

/* A ball on the ground: it bounces by how it was spinning, then rolls out. */
function bounce(G){
  const P = G.play, b = P.ball, R = P.ret;
  b.state = 'ground'; b.z = 0;
  if (b.x <= 0 && !R.muffed) return end(G, { type: 'touchback', x: R.tb || 20, y: MID });
  hop(b, b.bounces++ === 0);
  G.events.push({ type: 'sfx', name: 'tackle' });
  if (b.bounces === 1 && b.spin !== 'squib' && b.spin !== 'onside') pop(P, b.x, b.y, b.spin === 'end' ? 'IT\'S ROLLING' : 'IT DIES', b.spin === 'end' ? '#ffd84a' : '#c9d1d9');
}
function hop(b, first){
  const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
  if (b.spin === 'squib'){
    // A squib skips on low and quick, a little off line each time.
    const a = rnd(-.35, .35);
    b.vx = (ux * Math.cos(a) - uy * Math.sin(a)) * sp * .74; b.vy = (ux * Math.sin(a) + uy * Math.cos(a)) * sp * .74;
    b.vz = Math.abs(b.vz) * .45 + (first ? 1.5 : 0);
    return;
  }
  if (b.spin === 'onside'){
    // An onside kick: the first hop pops up (high, if he hit it right), then it takes odd bounces anyone's guess.
    const a = rnd(-.4, .4);
    const keep = first ? (b.popup ? .45 : .55) : .5;
    b.vx = (ux * Math.cos(a) - uy * Math.sin(a)) * sp * keep; b.vy = (ux * Math.sin(a) + uy * Math.cos(a)) * sp * keep;
    b.vz = first ? (b.popup ? 7.5 : rnd(2, 3.5)) : Math.abs(b.vz) * .5;
    return;
  }
  if (b.spin === 'end'){
    // End over end: it kicks on forward, and keeps going.
    const keep = first ? .62 : .55, a = rnd(-.25, .25);
    b.vx = (ux * Math.cos(a) - uy * Math.sin(a)) * sp * keep; b.vy = (ux * Math.sin(a) + uy * Math.cos(a)) * sp * keep;
    b.vz = Math.abs(b.vz) * (first ? .42 : .35);
  } else {
    // A spiral on its nose: one hop anywhere, then it lies down.
    const a = rnd(-2, 2), keep = first ? .32 : .2;
    b.vx = (ux * Math.cos(a) - uy * Math.sin(a)) * sp * keep; b.vy = (ux * Math.sin(a) + uy * Math.cos(a)) * sp * keep;
    b.vz = Math.abs(b.vz) * (first ? .3 : .15);
  }
}
function loose(G, dt){
  const P = G.play, b = P.ball, R = P.ret;
  b.vz -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (b.z <= 0){
    b.z = 0;
    if (Math.abs(b.vz) > 1.2){ b.bounces++; hop(b, false); }
    else { b.vz = 0; const f = Math.max(0, 1 - (b.spin === 'end' ? 1.4 : 3.2) * dt); b.vx *= f; b.vy *= f; }
  }
  if (b.y < 0 || b.y > FW) return end(G, { type: 'oob', x: clamp(b.x, 1, 99), y: clamp(b.y, 0, FW), kick: true, untouched: !R.touched });
  if (b.x <= 0 && !R.muffed && b.z < .3) return end(G, { type: 'touchback', x: R.tb || 20, y: MID });
  if (b.x <= -9) return end(G, R.muffed ? { type: 'safety', x: 0, y: b.y } : { type: 'touchback', x: R.tb || 20, y: MID });
  // At rest and no one's on it: a punt is dead there (a kickoff stays live: someone has to fall on it).
  if (Math.hypot(b.vx, b.vy) < .3 && b.z === 0 && !R.ko){
    R.rest += dt;
    if (R.rest > .6 && !R.muffed){ pop(P, b.x, b.y, `DOWNED AT THE ${Math.max(1, Math.round(b.x))}`, '#ffd84a'); return end(G, { type: 'downed', x: b.x, y: b.y }); }
  } else R.rest = 0;
}

/* ---------- phase two: your punt ----------
   Fourth down, PUNT: pull back to aim (the arc shows where it lands and its hang: a shorter punt goes higher, so a
   pooch hangs longest), let go to snap. The ball comes back, the punter takes his steps and drops it, and the drop
   gauge down the left edge shows it falling toward his foot: tap KICK (or anywhere) while it's in the green. Right
   on it is a spiral with all the hang and distance he
   aimed for; a little off, a touch less; further off, a wobbler end over end (shorter, and it'll roll); way off, or
   no tap at all, a shank. Wait too long and their rush gets there: blocked. Then you watch the coverage: gunners
   fly down, the lanes fill, and their returner fields it, fair catches it, lets it go, or brings it back. */
const MY = { STEPS: 1.0, KO_SET: .5, PERFECT: .42, LATE: .62, PUNT_RATE: 1.15, KO_RATE: .75 };
export const PUNT_TIMING = MY;
/* The kick's timing bands, in seconds either side of the perfect moment: perfect, good, wobbler (past that a shank).
   Tighter on harder levels and with a wet ball. The drop gauge (pixelbowl.js) draws these same bands. */
const BANDS = [.05, .12, .2];
export function dropBands(G){
  const w = ({ rookie: 1.3, pro: 1, allpro: .85, legend: .72 })[G.diffKey] ?? 1, wet = G.cond?.sky === 'rain' ? .85 : G.cond?.sky === 'snow' ? .9 : 1;
  return BANDS.map(b => b * w * wet);
}
/* How far through the wait before the drop (or the run-up) starts, 0-1: the gauge's READY bar. */
export function readyFrac(G){
  const P = G.play, R = P.punt; if (!R) return 0;
  if (R.stage === 'snap' || R.stage === 'steps') return clamp(P.t / (R.ko ? MY.KO_SET : MY.STEPS), 0, 1);
  return R.stage === 'drop' ? 1 : 0;
}
/* Where the falling ball is on the gauge (0 = in his hands, 1 = at his foot), for a moment of the drop: it speeds up a
   little as it falls. */
export const dropPos = t => Math.pow(clamp(t / MY.LATE, 0, 1), 1.25);
/* Pull length (in world yards of drag) to the punt it aims: where it lands, past the line of scrimmage. */
/* Aiming a punt or a kickoff. frac (0-1) is how far back you've pulled, measured on the screen, so the whole range
   takes a good long pull; ang is the direction, softened, within what that kick allows. aimAt() is shared with the
   shaded area drawn while you aim (drawhd.js), so the shading is exactly where it can land. */
export function aimLimit(G){ const R = G.play.punt; return R.ko ? KICKS[R.type].ang : .5; }
export function aimAt(G, frac, ang){
  const R = G.play.punt;
  if (R.ko){
    const K = KICKS[R.type], dist = K.d[0] + clamp(frac, 0, 1) * (K.d[1] - K.d[0]);
    const x = Math.min(R.los + dist, 112), y = clamp(MID + Math.tan(ang) * (x - R.los), 3, FW - 3);
    return { x, y, dist: x - R.los, T: K.T(x - R.los) };
  }
  const dist = 22 + clamp(frac, 0, 1) * 32, x = Math.min(R.los + dist, 112), y = clamp(R.punter.y + Math.tan(ang) * (x - R.punter.x), 2, FW - 2);
  return { x, y, dist: x - R.los, T: puntHang(x - R.los) };
}
export function puntAim(G, pull, frac){
  const A = aimLimit(G), ang = clamp(Math.atan2(pull.y, Math.max(.6, pull.x)) * .7, -A, A);
  return aimAt(G, frac, ang);
}
/* Your kickoffs, from your 35: how far each can go (past the tee), how wide it can be aimed, and its hang. */
export const KICKS = {
  deep: { name: 'DEEP', short: 'Touchback, or pin them inside the 25', d: [50, 72], ang: .32, T: d => 3.7 + (d - 50) * .02, def: 64 },
  sky: { name: 'SKY', short: 'High and short: coverage gets there with it', d: [32, 48], ang: .4, T: () => 4.7, def: 40 },
  squib: { name: 'SQUIB', short: 'Low and skipping: no clean return', d: [26, 40], ang: .4, T: () => 1.05, def: 32 },
  onside: { name: 'ONSIDE', short: 'Risky: recover it and keep the ball', d: [10.5, 15], ang: 1.1, T: () => .5, def: 12 }
};
const puntHang = d => clamp(5.05 - (d - 22) * .022, 4.0, 5.05);   // shorter = higher

export function setupMyPunt(G){
  const fx = I.wx(G), oMul = fx.spd, dMul = (G.diff.defSpd || 1) * fx.spd, los = G.los, by = clamp(G.y, 20, FW - 20);
  const off = [], def = [];
  const punter = mk('QB', 'off', Math.max(los - 14, -8), by, 6.4, { punter: true });
  const snapper = mk('OL', 'off', los - .8, by, SPEED.TE * oMul, { n: 2, cov: true });
  const line = [-4.8, -3.2, -1.6, 1.6, 3.2, 4.8].map(dy => mk('TE', 'off', los - .8, by + dy, SPEED.LB * oMul * rnd(.92, 1), { cov: true }));
  const gunners = [5, FW - 5].map(y => mk('CB', 'off', los - .9, y, SPEED.CB * oMul * 1.02, { cov: true, gunner: true }));
  const shield = mk('S', 'off', los - 5.5, by, SPEED.S * oMul * .95, { cov: true, shield: true });
  off.push(punter, snapper, ...line, ...gunners, shield);
  const lanes = [snapper, ...line].sort((a, b) => a.y - b.y);
  lanes.forEach((d, i) => { d.laneDy = -15 + i * 30 / (lanes.length - 1); });
  gunners.forEach(g => { g.laneDy = g.y < MID ? -2.5 : 2.5; });

  const ret = mk('RB', 'def', Math.min(los + 44, 106), MID, SPEED.RB * dMul, { returner: true });
  const front = [-5, -3, -1, 1, 3, 5].map(dy => mk('LB', 'def', los + 1, by + dy, SPEED.LB * dMul));
  front[0].rush = front[5].rush = true;   // the edges come after the punter
  const jams = gunners.map(g => mk('CB', 'def', los + 1, g.y, SPEED.CB * dMul, { jam: g }));
  const ups = [-4, 4].map(dy => mk('S', 'def', los + 13, MID + dy, SPEED.S * dMul, { up: true }));
  front.forEach((d, i) => { d.front = true; d.hx = 8; d.wy = (i - 2.5) * 3; });
  ups.forEach(d => { d.hx = 4; d.wy = (d.y - MID) * 1.5; });
  for (const d of [...front, ...ups]) d.sx = d.x;
  def.push(ret, ...front, ...jams, ...ups);
  for (const p of off) p.face = 1;
  for (const d of def) d.face = -1;
  const wind = I.gust(G.cond) || 0;
  G.play = { off, def, qb: punter, rb: punter, rec: [], all: [...off, ...def], t: 0, live: true, los, b: by, pops: [], fx: [],
    carrier: null, result: null, handed: false, thrown: false, userCtl: true,
    ball: { state: 'set', x: los + .3, y: by, z: .3, vx: 0, vy: 0, vz: 0, tx: los + 44, ty: MID, spin: 'spiral', bounces: 0 },
    punt: { stage: 'aim', los, punter, returner: ret, wind, gustAmp: Math.max(2.5, Math.abs(wind) * .5 + (G.cond?.sky === 'wind' ? 5 : 0)), ph1: rnd(6), ph2: rnd(6),
      aim: null, dropT: 0, rest: 0, muffed: false, decided: null, runner: null } };
  G.play.cam = { x: los + 2, y: by };
}

/* Your kickoff: the tee at your 35, your kicker back for his run-up, ten in a line across the field; their front five
   ten yards off, three more behind them, two deep. */
export function setupMyKick(G, type){
  const fx = I.wx(G), oMul = fx.spd, dMul = (G.diff.defSpd || 1) * fx.spd, los = 35;
  const off = [], def = [];
  const kicker = mk('QB', 'off', los - 7, MID - 1.5, 6.4, { punter: true });
  for (let i = 0; i < 10; i++){
    const y = 4 + i * (FW - 8) / 9, edge = i === 0 || i === 9;
    off.push(mk(edge ? 'CB' : i % 3 ? 'TE' : 'S', 'off', los - .8 - (i % 2) * .4, y, (edge ? SPEED.CB * 1.02 : SPEED.LB * rnd(.95, 1.04)) * oMul, { cov: true, gunner: edge, laneDy: y - MID }));
  }
  off.push(kicker);
  const deep = [-7, 7].map(dy => mk('RB', 'def', 97, MID + dy, SPEED.RB * dMul, { deep: true }));
  const front = [-18, -9, 0, 9, 18].map(dy => mk('LB', 'def', los + 11, MID + dy, SPEED.LB * dMul, { front: true }));
  const mid = [-10, 0, 10].map(dy => mk('S', 'def', 62, MID + dy, SPEED.S * dMul, { up: true }));
  // Where each sets up once it's kicked (yards in front of where it's coming down, and across): front five deeper.
  front.forEach(d => { d.hx = 34; d.wy = (d.y - MID) * .6; d.sx = d.x; d.reach = 4.5; });
  mid.forEach(d => { d.hx = 21; d.wy = (d.y - MID) * .8; d.sx = d.x; d.reach = 4.5; });
  def.push(...deep, ...front, ...mid);
  for (const p of off) p.face = 1;
  for (const d of def) d.face = -1;
  const wind = I.gust(G.cond) || 0;
  G.play = { off, def, qb: kicker, rb: kicker, rec: [], all: [...off, ...def], t: 0, live: true, los, b: MID, pops: [], fx: [],
    carrier: null, result: null, handed: false, thrown: false, userCtl: true,
    ball: { state: 'tee', x: los + .3, y: MID, z: .3, vx: 0, vy: 0, vz: 0, tx: los + KICKS[type].def, ty: MID, spin: 'spiral', bounces: 0 },
    punt: { ko: true, type, reach: KICKS[type].d[1], stage: 'aim', los, kickX: los, tb: 75, punter: kicker, returner: deep[0], wind, gustAmp: Math.max(2.5, Math.abs(wind) * .5 + (G.cond?.sky === 'wind' ? 5 : 0)), ph1: rnd(6), ph2: rnd(6),
      aim: null, dropT: 0, rest: 0, muffed: false, decided: null, runner: null, hands: null, touched: false } };
  // The camera while aiming: between the tee and the far end of this kick's range (zoomed out: drawhd.js).
  G.play.cam = { x: los + KICKS[type].d[1] * .5 - 4, y: MID };
  G.los = los; G.y = MID;
}

/* Let go of the aim: the snap. (A tap with no pull punts it his usual 44 down the middle.) */
export function snapPunt(G, aim){
  const P = G.play, R = P.punt; if (R.stage !== 'aim') return;
  if (R.ko){
    // A kickoff has no snap: letting go starts his run-up, and the gauge is his approach to the ball.
    // (A plain tap: his usual. An onside's usual goes at the gap in their front, toward a sideline.)
    const K = KICKS[R.type], side = Math.random() < .5 ? -1 : 1;
    R.aim = aim || { x: R.los + K.def, y: R.type === 'onside' ? MID + side * 4.5 : MID, dist: K.def, T: K.T(K.def) };
    R.stage = 'steps'; R.dropT = 0; P.t = 0; R.from = { x: R.punter.x, y: R.punter.y }; P.cam = { x: R.los + 9, y: MID };   // SET: a beat, then the run-up
    return;
  }
  R.aim = aim || { x: Math.min(R.los + 44, 112), y: MID, dist: 44, T: puntHang(44) };
  R.stage = 'snap'; P.t = 0;
  G.events.push({ type: 'sfx', name: 'hike' });
}
/* KICK: how close to the closing ring decides the punt. */
export function kickTap(G){
  const P = G.play, R = P.punt; if (R.stage !== 'drop') return false;
  myKick(G, R.dropT - MY.PERFECT);
  return true;
}
function myKick(G, err){
  const P = G.play, R = P.punt, b = P.ball, A = R.aim, e = Math.abs(err), [B1, B2, B3] = dropBands(G);
  let q, dK, tK, sig, spin = 'spiral', word, col = '#ffd84a';
  R.tapT = R.dropT; R.tapErr = err;
  if (e < B1){ q = 'perfect'; dK = 1; tK = 1; sig = .8; word = R.ko ? 'PERFECT STRIKE' : 'PERFECT DROP'; }
  else if (e < B2){ q = 'good'; dK = .95; tK = .95; sig = 2; word = 'GOOD BALL'; col = '#fff'; }
  else if (e < B3){ q = 'wobbler'; dK = .84; tK = .82; sig = 4; spin = 'end'; word = 'WOBBLER'; col = '#c9d1d9'; }
  else { q = 'shank'; dK = rnd(.45, .6); tK = .6; sig = 8; spin = 'end'; word = 'SHANKED!'; col = '#ff5a4e'; }
  const gx = R.los + A.dist * dK, gy = clamp(A.y + (Math.random() + Math.random() + Math.random() - 1.5) * 1.15 * sig + (q === 'shank' ? (Math.random() < .5 ? -1 : 1) * rnd(6, 14) : 0), -3, FW + 3);
  let T = A.T * tK;
  R.stage = 'air'; R.q = q; R.kickT = P.t; R.T = T;
  if (R.ko){
    // Off the tee. A squib skips and an onside hops however it's struck (struck right, an onside pops up high);
    // a mishit deep kick hooks, and a shank can sail out of bounds.
    if (R.type === 'squib') spin = 'squib';
    else if (R.type === 'onside'){
      // Driven into the turf four or five yards out along his aim; that first contact is the hop (struck right, a pop-up).
      spin = 'onside'; b.popup = q === 'perfect' || q === 'good' && Math.random() < .4;
      const ux = A.x - R.los, uy = A.y - MID, n = Math.hypot(ux, uy) || 1, d0 = 3.5 + (A.dist - 10.5) * .35;
      R.ons = { x: R.los + ux / n * d0, y: MID + uy / n * d0 };
    }
    else if (q === 'shank') T = Math.max(1.6, T);
    Object.assign(b, { state: 'air', x: R.los + .3, y: MID, z: .3, spin });
  } else Object.assign(b, { state: 'air', x: R.punter.x + .8, y: R.punter.y, z: 1.2, spin });
  if (R.ons){ b.vx = (R.ons.x - b.x) / .3; b.vy = (R.ons.y - b.y) / .3; b.vz = (0 - b.z + .5 * GRAV * .09) / .3; const p0 = predict(b, 0); b.tx = p0.x; b.ty = p0.y; }
  else {
  b.vx = (gx - b.x) / T; b.vy = (gy - b.y) / T - R.wind * WIND_K * T / 2; b.vz = (CATCH_Z - b.z + .5 * GRAV * T * T) / T;
  const p = predict(b, windNow(R, P.t)); b.tx = p.x; b.ty = p.y;
  }
  pop(P, b.x, b.y, word, col);
  if (!R.ko || R.type === 'deep' || R.type === 'sky') pop(P, b.x + 2, b.y + 2.5, `${T.toFixed(1)}s HANG`, '#fff');
  G.events.push({ type: 'sfx', name: 'kick' });
  if (q === 'perfect') G.events.push({ type: 'shake', a: 1.5 });
  if (R.ko){
    // Who fields it for them: the deep man nearer where it's coming down (on a squib or onside, whoever's nearest).
    const near = P.def.filter(d => !d.down).sort((a, c) => Math.hypot(a.x - b.tx, a.y - b.ty) - Math.hypot(c.x - b.tx, c.y - b.ty))[0];
    if (near) R.returner = near;
    // An onside: you have the man nearest the spot (your hands team): steer him to it, DIVE to get on it.
    if (R.type === 'onside') R.hands = P.off.filter(o => o.cov).sort((a, c) => Math.hypot(a.x - b.tx, a.y - b.ty) - Math.hypot(c.x - b.tx, c.y - b.ty))[0];
  }
}

/* How fast to run your punt or kickoff: once it's off his foot and there's nothing for you to do but watch it come
   down (or roll), the game moves it along; back to real time when their man has it, or on an onside (you're
   steering your hands-team man). pixelbowl.js runs this many steps for each one. */
export function warp(G){
  const P = G.play, R = P?.punt;
  if (!R || P.result || R.runner || R.stage !== 'air' || R.ko && R.type === 'onside') return 1;
  return 1.6;
}

/* One tick of your punt. */
export function stepMyPunt(G, dt, inp = {}){
  const P = G.play, R = P.punt, b = P.ball, ret = R.returner;
  if (!P.live || P.result || R.stage === 'aim') return;
  P.t += dt;
  for (const p of P.all){ p.stun = Math.max(0, p.stun - dt); p.missCD = Math.max(0, (p.missCD || 0) - dt); if (p.down && p.stun <= 0) p.down = false; }

  /* ----- the ball ----- */
  if (R.stage === 'snap'){
    const k = Math.min(1, P.t / SNAP_T);
    b.x = R.los + .3 + (R.punter.x + .5 - R.los - .3) * k; b.y = R.punter.y; b.z = .8 + Math.sin(k * Math.PI) * .4;
    if (k >= 1){ R.stage = 'steps'; b.state = 'punter'; }
  } else if (R.stage === 'steps'){
    b.x = R.punter.x + .5; b.y = R.punter.y; b.z = 1.4;
    if (P.t >= MY.STEPS){ R.stage = 'drop'; R.dropT = 0; }
  } else if (R.stage === 'steps' && R.ko){
    if (P.t >= MY.KO_SET){ R.stage = 'drop'; R.dropT = 0; }
  } else if (R.stage === 'drop' && R.ko){
    // The run-up: the gauge's marker is his last steps; the green is his plant and strike. (Slower than a punt's drop.)
    R.dropT += dt * MY.KO_RATE;
    const k = Math.min(1, dropPos(R.dropT) / dropPos(MY.PERFECT));
    R.punter.x = R.from.x + (R.los - .6 - R.from.x) * k; R.punter.y = R.from.y + (MID - .6 - R.from.y) * k; R.punter.vx = 6; R.punter.vy = 0;
    if (R.dropT >= MY.LATE){ R.dropT = MY.LATE; myKick(G, 9); }
  } else if (R.stage === 'drop'){
    // Their rush closing in hurries him: the ball comes down faster, so the green goes by quicker.
    const near = Math.min(99, ...P.def.filter(d => d.rush && !d.eng).map(d => dist(d, R.punter)));
    R.hurry = 1 + clamp((4.5 - near) / 4.5, 0, 1) * .7;
    R.dropT += dt * R.hurry * MY.PUNT_RATE;   // a punt's drop is quicker than a kickoff's run-up (and their rush hurries it)
    b.x = R.punter.x + .6; b.y = R.punter.y; b.z = 1.4 - Math.min(1, R.dropT / MY.PERFECT) * .9;
    if (R.dropT >= MY.LATE){ R.dropT = MY.LATE; myKick(G, 9); }   // it got to the turf before his foot: a shank
  } else if (b.state === 'air'){
    const w = windNow(R, P.t);
    b.vy += w * WIND_K * dt; b.vz -= GRAV * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const p = predict(b, w); b.tx = p.x; b.ty = p.y;
    // An onside that's gone its 10 yards, caught on the fly by one of yours (your hands man has the bigger reach).
    const mine = R.ko && b.vz < 0 && b.z <= CATCH_Z && b.x >= R.kickX + 10 && P.off.find(o => o.cov && !o.down && Math.hypot(o.x - b.x, o.y - b.y) <= (o === R.hands ? CATCH_R : 1.1));
    if (mine){ pop(P, mine.x, mine.y, 'ONSIDE RECOVERED!', '#4cff7a'); burst(P, b.x, b.y, ['#ffd84a', '#ffffff', '#3ddc84'], 18); G.events.push({ type: 'shake', a: 2.5 }); return end(G, { type: 'recovered', x: b.x, y: b.y, by: mine }); }
    const contested = R.ko && R.type === 'onside' && P.off.some(o => o.cov && !o.down && Math.hypot(o.x - b.x, o.y - b.y) < Math.hypot(ret.x - b.x, ret.y - b.y) + .6);
    if (b.vz < 0 && b.z <= CATCH_Z && b.z > .3 && R.decided !== 'let' && Math.hypot(ret.x - b.x, ret.y - b.y) <= (R.ko && R.type === 'onside' ? 1.1 : CATCH_R) && !ret.down){
      // A jump ball on an onside: with one of yours right there it's a coin flip (it squirts loose either way).
      if (contested && Math.random() < .5){ b.vz = 3; b.vx = rnd(-2, 2); b.vy = rnd(-2, 2); b.state = 'loose'; R.touched = true; pop(P, b.x, b.y, 'TIPPED!', '#ffd84a'); }
      else { R.touched = true; theirCatch(G); if (P.result) return; }
    }
    else if (b.z <= 0){
      b.state = 'ground'; b.z = 0;
      if (b.x >= 100) return end(G, { type: 'touchback', x: R.tb || 80, y: MID });
      hop(b, b.bounces++ === 0);
      G.events.push({ type: 'sfx', name: 'tackle' });
      if (b.bounces === 1 && !R.ko) pop(P, b.x, b.y, b.spin === 'end' ? 'IT\'S ROLLING' : 'IT DIES', b.spin === 'end' ? '#ffd84a' : '#c9d1d9');
    }
  } else if (b.state === 'ground' || b.state === 'loose'){
    b.vz -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z <= 0){ b.z = 0; if (Math.abs(b.vz) > 1.2){ b.bounces++; hop(b, false); } else { b.vz = 0; const f = Math.max(0, 1 - (b.spin === 'end' ? 1.4 : 3.2) * dt); b.vx *= f; b.vy *= f; } }
    if (b.y < 0 || b.y > FW) return end(G, { type: 'oob', x: clamp(b.x, 1, 99), y: clamp(b.y, 0, FW), kick: true, untouched: !R.touched });
    if (b.x >= 100 && !R.muffed && b.z < .3) return end(G, { type: 'touchback', x: R.tb || 80, y: MID });
    if (b.x >= 109) return end(G, { type: 'touchback', x: R.tb || 80, y: MID });
    if (Math.hypot(b.vx, b.vy) < .3 && b.z === 0 && !R.muffed && !R.ko){ R.rest += dt; if (R.rest > .6){ pop(P, b.x, b.y, `DOWNED AT THE ${Math.max(1, Math.round(100 - b.x))}`, '#ffd84a'); return end(G, { type: 'downed', x: b.x, y: b.y }); } }
    else R.rest = 0;
  }
  if (P.result) return;

  /* ----- the block: their edge rushers get to a punter who held it too long ----- */
  if (['steps', 'drop'].includes(R.stage)){
    const rusher = P.def.find(d => d.rush && !d.eng && dist(d, R.punter) < 1.3);
    if (rusher){
      pop(P, R.punter.x, R.punter.y, 'BLOCKED!', '#ff5a4e'); G.events.push({ type: 'shake', a: 3 }); G.events.push({ type: 'sfx', name: 'tackle' });
      return end(G, { type: 'blocked', x: Math.max(1, R.punter.x + rnd(-4, 2)), y: R.punter.y, by: rusher });
    }
  }

  /* ----- their returner ----- */
  const runner = R.runner;
  if (runner) theirRun(G, dt);
  else {
    if (b.state === 'air'){
      // Under it; a beat out, his call: let a ball inside his 10 go, fair catch with your gunners on him, else catch it.
      const left = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * GRAV * (b.z - CATCH_Z)))) / GRAV;
      if (R.ko && !R.decided && left < 1.1){
        // A kickoff: into the end zone, kneel it (unless it's barely in and he likes his chances); inside the 25,
        // often a fair catch (the 25 either way); otherwise bring it out. A squib or onside is just a scramble.
        if (R.type === 'onside' || R.type === 'squib') R.decided = 'catch';
        else R.decided = b.tx >= 100 ? (b.tx < 103 && Math.random() < .3 ? 'catch' : 'let') : b.tx >= 75 && Math.random() < .5 ? 'fair' : 'catch';
        if (R.decided === 'fair') pop(P, ret.x, ret.y, 'FAIR CATCH SIGNAL', '#fff');
      }
      if (!R.decided && left < 1.1){
        const closeIn = P.off.some(o => o.cov && !o.eng && Math.hypot(o.x - b.tx, o.y - b.ty) < 5.5);
        R.decided = b.tx > 91 ? 'let' : closeIn ? 'fair' : 'catch';
        if (R.decided === 'catch' && P.off.some(o => o.cov && !o.eng && Math.hypot(o.x - b.tx, o.y - b.ty) < 8) && Math.random() < .5) R.decided = 'fair';
        if (R.decided === 'fair') pop(P, ret.x, ret.y, 'FAIR CATCH SIGNAL', '#fff');
      }
      if (R.decided === 'let') moveToward(ret, R.ko ? Math.min(b.tx + 3, 109) : Math.min(b.tx + 6, 99), b.ty + (ret.y < b.ty ? -4 : 4), ret.spd * .8, dt, 8);
      else if (R.ko && R.type === 'onside' && P.t - R.kickT < .5) moveToward(ret, ret.x, ret.y, 0, dt);   // the surprise: a beat to react
      else moveToward(ret, b.tx, b.ty, ret.spd * (R.ko && R.type === 'onside' ? .92 : 1), dt, 9);
    } else if (b.state === 'ground' || b.state === 'loose'){
      if (R.muffed || R.ko) moveToward(ret, b.x, b.y, ret.spd, dt, 9);
      else moveToward(ret, Math.max(b.x + 4, ret.x), ret.y, ret.spd * .5, dt, 8);   // he leaves it alone
    } else moveToward(ret, ret.x, ret.y, 0, dt);
  }

  /* ----- their front: edges rush, the rest hold up your coverage, then set a wall; jammers on your gunners ----- */
  const mine = P.off.filter(o => o.cov), taken = claims(P.def);
  for (const d of P.def){
    if (d === ret || d === runner) continue;
    if (d.stun > 0){ moveToward(d, d.x, d.y, 0, dt, 4); continue; }
    if (R.ko){
      if (R.stage === 'drop' || R.stage === 'aim'){ moveToward(d, d.x, d.y, 0, dt); continue; }
      // Their hands team goes for it (an onside's a surprise: a beat to react).
      if (!runner && (R.type === 'onside' || R.type === 'squib') && d.front){ if (R.type === 'onside' && P.t - R.kickT < .5){ moveToward(d, d.x, d.y, 0, dt); continue; } moveToward(d, b.x, b.y, d.spd * (R.type === 'onside' ? .92 : 1), dt, 9); continue; }
      if (d.deep){ const t = runner || ret; moveToward(d, t.x + 4, t.y + (d.y < t.y ? -3 : 3), d.spd * .8, dt, 8); continue; }
    }
    if (d.rush && ['snap', 'steps', 'drop'].includes(R.stage)){ moveToward(d, R.punter.x, R.punter.y, d.spd * (P.t < .5 ? .3 : .92), dt, 8); continue; }
    const tgt = runner || ret, pre = ['snap', 'steps', 'drop'].includes(R.stage);
    if (d.jam){
      // On your gunner from the snap: shadow him between him and the returner, and lock on when he gets there.
      const f = d.jam, dx = tgt.x - f.x, dy = tgt.y - f.y, n = Math.hypot(dx, dy) || 1;
      moveToward(d, f.x + dx / n * .9, f.y + dy / n * .9, d.spd * (R.stage === 'snap' ? .3 : 1), dt, 10);
      if (!f.eng && (f.jamCD || 0) <= 0 && dist(d, f) < 1.1 && P.t > .3){ f.eng = { by: d, until: P.t + rnd(.6, 1.2) }; f.jamCD = 1.2; }
      continue;
    }
    const m = locked(P, d);
    if (m){ glue(d, m, tgt, dt); continue; }
    if (pre){
      // At the line: the punt front holds up whoever releases at him; everyone else waits for the kick.
      if (d.front && !R.ko && R.stage === 'drop') wallBlock(P, d, mine, tgt, dt, null, 2.2, taken);
      else moveToward(d, d.x, d.y, 0, dt);
      continue;
    }
    // Kicked: drop back and set up in front of where it's coming down, taking on anyone who comes through; once he
    // has it, lead him up the field and go find a man coming at him.
    const home = runner ? { x: Math.min(d.x, runner.x - 3), y: clamp(runner.y + d.wy * .4, 3, FW - 3) } : { x: Math.max(d.sx, b.tx - d.hx), y: clamp(b.ty + d.wy, 3, FW - 3) };
    wallBlock(P, d, runner ? mine.filter(o => o.x < runner.x + 1 && o.x > d.x - 9) : mine, tgt, dt, home, runner ? 8 : d.reach || 2.5, taken, runner ? DRIVE : CHIP);
  }

  /* ----- your coverage ----- */
  for (const o of P.off){
    o.jamCD = Math.max(0, (o.jamCD || 0) - dt);
    if (o.stun > 0){ moveToward(o, o.x, o.y, 0, dt, 4); continue; }
    if (R.ko && o === R.hands && !runner && inp.carStick){
      // Your hands-team man on an onside: you steer him; DIVE throws him at the ball.
      const st = inp.carStick, m = Math.hypot(st.x, st.y) || 1;
      if (inp.dive && !(o.dive > 0)){ o.dive = .3; pop(P, o.x, o.y, 'DIVE!', '#ffd84a'); }
      accelToward(o, st.x / m * o.spd * Math.min(1, m) * (o.dive > 0 ? 1.5 : 1), st.y / m * o.spd * Math.min(1, m) * (o.dive > 0 ? 1.5 : 1), dt, 12);
      o.dive = Math.max(0, (o.dive || 0) - dt);
      continue;
    }
    if (R.ko && o.punter){ if (R.stage !== 'drop') moveToward(o, (runner || b).x - 20, MID, o.spd * .6, dt); continue; }
    if (o.punter){ if (R.stage === 'steps' || R.stage === 'drop') moveToward(o, o.x + 1, o.y, 1.6, dt); else if (b.state !== 'punter') moveToward(o, (runner || b).x - 18, MID, o.spd * .6, dt); else moveToward(o, o.x, o.y, 0, dt); continue; }
    if (o.eng){
      if (P.t > o.eng.until || dist(o, o.eng.by) > 2.2) o.eng = null;
      else { moveToward(o, o.x + 1, o.y, o.spd * .22, dt); continue; }
    }
    let tx, ty, spd = o.spd;
    if (R.ko && R.stage === 'drop'){ moveToward(o, Math.min(R.los - .4, o.x + 3), o.y, o.spd * .55, dt, 7); continue; }   // with the kicker, behind the ball
    if (R.ko && !runner && (R.type === 'onside' || R.type === 'squib') && b.state !== 'held'){ tx = b.x; ty = b.y; }   // everyone to the ball
    else if (['snap', 'steps', 'drop'].includes(R.stage)){
      if (!o.gunner && R.stage !== 'drop'){ moveToward(o, o.x, o.y, 0, dt); continue; }   // protect until the drop
      tx = o.x + 10; ty = o.y;
    } else if (runner){ const l = { x: runner.x + runner.vx * .4, y: runner.y + runner.vy * .4 }; tx = l.x; ty = l.y; }
    else if (b.state === 'air'){
      const left = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * GRAV * (b.z - CATCH_Z)))) / GRAV, close = left < 1.2;
      if (o.gunner){ tx = b.tx - 1.2; ty = b.ty + o.laneDy * .4; }
      else if (o.shield){ tx = b.tx - 16; ty = MID + (b.ty - MID) * .5; spd *= .8; }
      else { tx = b.tx - (close ? 2.5 : 6); ty = b.ty + o.laneDy * (close ? .35 : .8); }
      if (R.decided === 'fair' && Math.hypot(o.x - ret.x, o.y - ret.y) < 2.2){ tx = o.x; ty = o.y; }
    } else {
      // A ball on the ground: down it before it gets to the end zone (a gunner gets in front of it).
      tx = Math.min(b.x + (b.vx || 0) * .3, 99); ty = b.y + (b.vy || 0) * .3;
    }
    moveToward(o, tx, ty, spd, dt, 7);
  }
  for (const p of P.all) if (p !== runner) integrate(p, dt);

  // A kickoff on the ground is anyone's: yours once it's gone 10 yards (or they've touched it), theirs any time (and
  // they can run with it). Your diving hands-team man reaches a little further.
  if (R.ko && !runner && (b.state === 'ground' || b.state === 'loose') && b.z < 1.1){
    for (const o of P.off){
      const reach = o === R.hands && o.dive > 0 ? 1.5 : .9;
      if (o.down || o.stun > 0 || Math.hypot(o.x - b.x, o.y - b.y) > reach || !(R.touched || b.x >= R.kickX + 10)) continue;
      pop(P, o.x, o.y, R.type === 'onside' ? 'ONSIDE RECOVERED!' : 'WE GOT IT!', '#4cff7a'); burst(P, b.x, b.y, ['#ffd84a', '#ffffff', '#3ddc84'], 18); G.events.push({ type: 'shake', a: 2.5 });
      return end(G, { type: 'recovered', x: b.x, y: b.y, by: o });
    }
    for (const d of P.def){
      if (d.down || d.stun > 0 || Math.hypot(d.x - b.x, d.y - b.y) > .9) continue;
      R.touched = true; R.returner = d; pop(P, d.x, d.y, R.type === 'onside' ? 'THEY HAVE IT' : 'FIELDED', R.type === 'onside' ? '#ff5a4e' : '#fff'); startTheirRun(G); break;
    }
  } else if (!runner && (b.state === 'ground' || b.state === 'loose') && b.z < 1.1){
    for (const o of P.off){
      if (o.down || o.stun > 0 || o.punter || Math.hypot(o.x - b.x, o.y - b.y) > .9) continue;
      if (R.muffed){ pop(P, o.x, o.y, 'WE GOT IT!', '#4cff7a'); burst(P, b.x, b.y, ['#ffd84a', '#ffffff'], 14); return end(G, { type: 'recovered', x: b.x, y: b.y, by: o }); }
      if (b.x >= 100) return end(G, { type: 'touchback', x: 80, y: MID });
      pop(P, b.x, b.y, `DOWNED AT THE ${Math.max(1, Math.round(100 - b.x))}`, '#ffd84a');
      return end(G, { type: 'downed', x: b.x, y: b.y, by: o });
    }
    if (R.muffed && Math.hypot(ret.x - b.x, ret.y - b.y) < .9){ R.muffed = false; R.recovered = true; startTheirRun(G); }
  }

  // The camera: the snap and the kick, then the ball, then their runner.
  if (['aim', 'snap', 'steps', 'drop'].includes(R.stage)) P.cam = R.ko ? { x: R.los + 9, y: MID } : { x: R.los + 2, y: R.punter.y };
  // (While a kickoff's being aimed the camera sits between the tee and the far end of that kick's range: kickCam.)
  else if (runner) P.cam = { x: runner.x, y: runner.y };
  else if (b.state === 'air'){ const k = clamp(1 - b.vz / 25, 0, 1); P.cam = { x: b.x + (b.tx - b.x) * (.35 + .4 * k), y: b.y + (b.ty - b.y) * (.35 + .4 * k) }; }
  else P.cam = { x: b.x, y: b.y };
}

function theirCatch(G){
  const P = G.play, R = P.punt, b = P.ball, ret = R.returner;
  const traffic = P.off.some(o => o.cov && !o.eng && dist(o, ret) < 2.2), wet = Math.max(0, -I.wx(G).catchR) * .25;
  const pMuff = (.025 + wet + (traffic && R.decided !== 'fair' ? .08 : 0)) * (R.decided === 'fair' ? .5 : 1);
  if (Math.random() < pMuff){
    R.muffed = true;
    Object.assign(b, { state: 'loose', x: ret.x, y: ret.y, z: 1.1, vx: rnd(-3, 3), vy: rnd(-3, 3), vz: 2.6, spin: 'end' });
    ret.stun = .45; pop(P, ret.x, ret.y, 'MUFFED!', '#4cff7a'); G.events.push({ type: 'sfx', name: 'drop' }); G.events.push({ type: 'shake', a: 2 });
    return;
  }
  b.state = 'held'; b.holder = ret;
  if (R.decided === 'fair'){ pop(P, ret.x, ret.y, 'FAIR CATCH', '#fff'); G.events.push({ type: 'sfx', name: 'whistle' }); return end(G, { type: 'fair', x: R.ko && ret.x > 75 ? 75 : ret.x, y: ret.y }); }
  G.events.push({ type: 'sfx', name: 'catch' });
  startTheirRun(G);
}
function startTheirRun(G){
  const P = G.play, R = P.punt, ret = R.returner, b = P.ball;
  R.runner = ret; R.catchX = ret.x; b.state = 'held'; b.holder = ret;
  for (const d of P.def) if (d !== ret && !d.jam) d.blockOn = null;
}
/* Their returner brings it back (toward your goal line), cutting away from whoever's closest in front of him; your
   cover men tackle him (one try each), their blockers ride yours. */
function theirRun(G, dt){
  const P = G.play, R = P.punt, c = R.runner;
  const ahead = P.off.filter(o => !o.down && o.stun <= 0 && !o.eng && o.x < c.x + 1.5).sort((a, b) => dist(a, c) - dist(b, c));
  const near = ahead[0];
  let ty = c.y;
  if (near && dist(near, c) < 7) ty = c.y + (c.y >= near.y ? 1 : -1) * 4;
  if (ty < 4) ty = 4; if (ty > FW - 4) ty = FW - 4;
  moveToward(c, c.x - 5, ty, c.spd * .97, dt, 9);
  integrate(c, dt);
  const b = P.ball; b.x = c.x - .3; b.y = c.y; b.z = 1.2;   // the ball goes where he goes (and stays there when he's down)
  if (c.x <= 0){ pop(P, c.x, c.y, 'RETURN TOUCHDOWN', '#ff5a4e'); return end(G, { type: 'rettd', x: 0, y: c.y }); }
  if (c.y < 0 || c.y > FW) return end(G, { type: 'oob', x: c.x, y: clamp(c.y, 0, FW) });
  for (const o of P.off){
    if (o.down || o.stun > 0 || o.eng || o.missCD > 0 || dist(o, c) > 1.25) continue;
    const help = P.off.some(x => x !== o && !x.down && !x.eng && dist(x, c) < 2.4);
    if (Math.random() < (help ? .9 : .8)){
      o.stun = .6; c.down = true; c.vx = c.vy = 0;
      return end(G, { type: 'tackle', x: c.x, y: c.y, by: o });
    }
    o.missCD = 1.2; o.stun = .5; pop(P, c.x, c.y, 'MISSED TACKLE', '#ff5a4e');
  }
}
