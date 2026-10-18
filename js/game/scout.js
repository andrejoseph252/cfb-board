/* Game week in season mode: the scouting report (each opponent's real tendencies, from ESPN's season stats and FPI),
   your game plan, practice, the defensive call on each of their drives, and what all of it does on the field.
   Everything here comes together as one `mods` object the engine reads (sim.js), kept small on purpose: a good plan is
   an edge, not a win. */
import * as api from '../api.js';
import { store } from '../util.js';

const cache = store.get('pbScout', {}), KEEP = 12 * 3600e3;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
// Where a stat sits among FBS teams: .1 at the 10th percentile, .9 at the 90th (sampled from this season).
const norm = (x, p10, p90) => Number.isFinite(x) ? clamp(.1 + .8 * (x - p10) / (p90 - p10)) : .5;

/* ---------- the scouting report ---------- */
/* team: { id, fpi, off, def } (season.js's team). j: ESPN's team statistics. */
export function profile(team, j){
  const cats = j?.results?.stats?.categories || [];
  const v = (c, n) => Number(cats.find(x => x.name === c)?.stats?.find(s => s.name === n)?.value);
  const gp = v('general', 'gamesPlayed') || v('rushing', 'teamGamesPlayed') || 0, per = x => gp ? x / gp : NaN;
  const offEff = Number.isFinite(team.off) ? team.off / 100 : team.fbs ? .5 : .2, defEff = Number.isFinite(team.def) ? team.def / 100 : team.fbs ? .5 : .2;
  const ra = v('rushing', 'rushingAttempts'), pa = v('passing', 'passingAttempts'), sk = v('passing', 'sacks') || 0;
  const raw = {
    gp, runRate: ra + pa ? ra / (ra + pa + sk) : NaN, ypa: v('passing', 'yardsPerPassAttempt'), ypc: v('rushing', 'yardsPerRushAttempt'),
    ppg: v('scoring', 'totalPointsPerGame'), third: v('miscellaneous', 'thirdDownConvPct'),
    sacks: per(v('defensive', 'sacks')), tfl: per(v('defensive', 'tacklesForLoss')), stuffs: per(v('defensive', 'stuffs')),
    pd: per(v('defensive', 'passesDefended')), ints: per(v('defensiveInterceptions', 'interceptions')), ff: per(v('general', 'fumblesForced'))
  };
  // Early in the season (or with no stats) the numbers lean on the ratings.
  const trust = clamp(gp / 5, 0, 1), mix = (stat, prior) => trust * stat + (1 - trust) * prior;
  const runRate = Number.isFinite(raw.runRate) ? mix(raw.runRate, .52) : .52;
  const explosive = mix(.7 * norm(raw.ypa, 6.6, 9.1) + .3 * norm(raw.ypc, 3.8, 5.7), offEff);
  const pressure = mix(.65 * norm(raw.sacks, 1.17, 2.71) + .35 * norm(raw.tfl, 2.83, 5.67), defEff);
  const runD = mix(.55 * norm(raw.stuffs, 6, 9.14) + .45 * norm(raw.tfl, 2.83, 5.67), defEff) * .6 + defEff * .4;
  const ballhawk = mix(.6 * norm(raw.ints, .29, 1.29) + .4 * norm(raw.pd, 2.14, 4.57), defEff);
  const passD = ballhawk * .55 + defEff * .45;
  const off = {
    runRate, explosive, eff: offEff,
    style: runRate >= .57 ? 'GROUND GAME' : runRate <= .45 && explosive >= .55 ? 'VERTICAL PASSING' : runRate <= .47 ? 'AIR RAID' : explosive >= .64 ? 'EXPLOSIVE' : 'BALANCED'
  };
  // Their defense's scheme: what they're known for decides the coverage mix the engine plays.
  let scheme, cov, blitz;
  if (pressure >= .6){ scheme = 'PRESSURE · COVER 1'; cov = { c0: 2.2, c1: 1.8, c2: .6, c3: .8, c4: .5, c2m: 1 }; blitz = 1.5; }
  else if (ballhawk >= .6){ scheme = 'COVER 3 · BALL HAWKS'; cov = { c0: .5, c1: .8, c2: 1.1, c3: 2.1, c4: 1, c2m: .7 }; blitz = .85; }
  else if (defEff >= .62){ scheme = 'QUARTERS'; cov = { c0: .4, c1: .7, c2: 1.3, c3: .9, c4: 2.3, c2m: 1 }; blitz = .75; }
  else if (pressure <= .35){ scheme = 'SOFT ZONE'; cov = { c0: .3, c1: .6, c2: 1.5, c3: 1.6, c4: 1.4, c2m: .8 }; blitz = .6; }
  else { scheme = 'MULTIPLE'; cov = { c0: 1, c1: 1, c2: 1, c3: 1, c4: 1, c2m: 1 }; blitz = 1; }
  const def = { pressure, runD, passD, ballhawk, eff: defEff, scheme, cov, blitz };
  return { off, def, raw, trust };
}
/* The report for a team (cached on the device for 12 hours). */
export async function getProfile(team){
  const c = cache[team.id];
  if (c && Date.now() - c.at < KEEP) return profile(team, c.j);
  let j = null;
  try{ j = await api.teamStats(team.id); }catch{}
  if (j){ cache[team.id] = { at: Date.now(), j: { results: { stats: { categories: (j.results?.stats?.categories || []).map(c => ({ name: c.name, stats: c.stats.map(s => ({ name: s.name, value: s.value })) })) } } } }; trimCache(); }
  return profile(team, j);
}
function trimCache(){
  const ids = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at);
  for (const id of ids.slice(24)) delete cache[id];
  store.set('pbScout', cache);
}

/* The lines on the report. */
export function notes(p, name){
  const r = p.raw, out = [], f1 = x => Number.isFinite(x) ? x.toFixed(1) : null;
  if (Number.isFinite(r.runRate)) out.push(p.off.runRate >= .57 ? `Runs it ${Math.round(r.runRate * 100)}% of the time${f1(r.ypc) ? `, ${f1(r.ypc)} a carry` : ''}. Win up front or it's a long day.`
    : p.off.runRate <= .46 ? `Throws it ${Math.round((1 - r.runRate) * 100)}% of the time${f1(r.ypa) ? `, ${f1(r.ypa)} yards an attempt` : ''}.`
    : `Balanced: ${Math.round(r.runRate * 100)}% runs${f1(r.ypc) ? `, ${f1(r.ypc)} a carry` : ''}${f1(r.ypa) ? `, ${f1(r.ypa)} a throw` : ''}.`);
  if (p.off.explosive >= .65) out.push('Explosive: they hit big plays. Keep a safety deep.');
  else if (p.off.explosive <= .3) out.push("Not a big-play offense. Make them drive the length of the field.");
  if (Number.isFinite(r.sacks)) out.push(p.def.pressure >= .6 ? `Their defense gets home: ${f1(r.sacks)} sacks a game. Expect blitzes on passing downs.`
    : p.def.pressure <= .35 ? `Little pass rush (${f1(r.sacks)} sacks a game). You'll have time to throw.` : `${f1(r.sacks)} sacks and ${f1(r.tfl)} tackles for loss a game.`);
  if (p.def.ballhawk >= .62 && Number.isFinite(r.ints)) out.push(`Ball hawks: ${f1(r.ints)} picks a game. Don't force it.`);
  if (p.def.runD <= .38) out.push('Soft against the run. Lean on it.');
  else if (p.def.runD >= .66) out.push('Stout against the run. You may have to throw to set it up.');
  if (!p.trust) out.unshift(`No stats yet for ${name}: this report leans on their ratings.`);
  return out.slice(0, 4);
}
/* The coverage mix the engine will roll from (before down and distance), as percentages: film study reveals it. */
export function coverageMix(p){
  const base = { c0: .054, c1: .24, c2: .2, c3: .3, c4: .15, c2m: .08 };   // pickCoverage's weights at a typical blitz rate
  const w = Object.fromEntries(Object.entries(base).map(([k, x]) => [k, x * (p.def.cov[k] ?? 1) * (k === 'c0' || k === 'c1' ? p.def.blitz : 1)])), sum = Object.values(w).reduce((a, x) => a + x, 0);
  return Object.entries(w).map(([k, x]) => [k, Math.round(x / sum * 100)]).sort((a, b) => b[1] - a[1]);
}

/* ---------- the game plan ---------- */
export const OFF_PLANS = {
  ground: { name: 'GROUND & POUND', icon: 'run', pro: 'Run blocking +25%, play action bites harder', con: 'Pass protection −8%' },
  balanced: { name: 'BALANCED', icon: 'bal', pro: 'Play action at its best, a little of everything', con: 'No big edge anywhere' },
  air: { name: 'AIR RAID', icon: 'air', pro: 'Pass protection +15%, receivers a step quicker', con: 'Run blocking −12%' },
  tempo: { name: 'TEMPO', icon: 'tempo', pro: 'Less clock between snaps; their rush tires late', con: 'A stalled drive hands them time' }
};
export const DEF_PLANS = {
  run: { name: 'STOP THE RUN', icon: 'wall', pro: 'Crush run-heavy offenses', con: 'Exposed to big passing plays' },
  deep: { name: 'TAKE AWAY DEEP', icon: 'deep', pro: 'Fewer touchdowns from explosive offenses', con: 'They dink and dunk for field goals' },
  pressure: { name: 'BRING PRESSURE', icon: 'blitz', pro: 'More sacks, takeaways and pass-rush downs for you', con: 'Big plays when it misses' },
  bend: { name: "BEND, DON'T BREAK", icon: 'bend', pro: 'Field goals instead of touchdowns', con: 'Long drives eat the clock' }
};
/* How well a plan fits this matchup, −1 to 1. me/opp: profiles; edge: your FPI minus theirs. */
export function fitOff(k, me, opp, edge = 0){
  const f = {
    ground: .65 * (.5 - opp.def.runD) * 2 + .35 * (me.off.runRate - .5) * 3,
    air: .65 * (.5 - opp.def.passD) * 2 + .35 * (.5 - me.off.runRate) * 3 + .2 * (.5 - opp.def.pressure),
    balanced: .12 + .35 * (opp.def.pressure - .5) - .25 * Math.abs(opp.def.runD - opp.def.passD) * 2,
    tempo: .3 * clamp(edge / 12, -1, 1) + .5 * (opp.def.pressure - .5) * 2 + .2 * (me.off.explosive - .5) * 2
  }[k];
  return clamp(f ?? 0, -1, 1);
}
export function fitDef(k, opp){
  const o = opp.off;
  const f = {
    run: (o.runRate - .5) * 2 * .9 - (o.explosive - .5) * .7,
    deep: (o.explosive - .5) * 2 * .85 + (.5 - o.runRate) * .5,
    pressure: (.5 - o.eff) * 1.3 + (.5 - o.explosive) * .7 + (.5 - o.runRate) * .3,
    bend: (o.eff - .5) * 1.3 + .08
  }[k];
  return clamp(f ?? 0, -1, 1);
}
export const grade = f => f >= .45 ? 'A' : f >= .2 ? 'B' : f >= -.05 ? 'C' : f >= -.3 ? 'D' : 'F';
export const gradeColor = g => ({ A: '#4cff7a', B: '#b6f36a', C: '#ffd84a', D: '#ff9f43', F: '#ff5a4e' })[g] || '#c9d1d9';

/* ---------- practice ---------- */
export const HOURS = 10, AREA_MAX = 6;
export const AREAS = {
  pass: { name: 'PASSING', tip: 'Tighter throws, surer hands', drill: 'pass' },
  run: { name: 'RUNNING', tip: 'Better run blocking, a quicker back' },
  def: { name: 'DEFENSE', tip: 'Their drives stall more; a quicker corner', drill: 'def' },
  film: { name: 'FILM STUDY', tip: 'Read their coverage before the snap, and their drives before you call' }
};
export const hoursUsed = pr => Object.values(pr || {}).reduce((a, x) => a + (x || 0), 0);
/* Freshness after this week's practice: heavy weeks wear the team down, light ones (and byes) recover. */
export const freshAfter = (fresh, pr) => Math.round(clamp(fresh + 12 - 2.2 * hoursUsed(pr), 40, 100));
// A drill's grade scales that area's practice: a C leaves it as is, an A makes it count 1.45x, a D about 0.8x.
export const drillMult = score => Number.isFinite(score) ? clamp(1 + (score - 75) * .0225, .5, 1.5) : 1;
export const filmTells = h => h >= 2 ? Math.min(.85, .2 + .13 * h) : 0;

/* ---------- on the field ---------- */
export const NOMODS = { spd: 1, rec: 1, runBlock: 1, passPro: 1, latePro: 1, acc: 1, catchR: 0, paBite: 0, tempo: 1, cov: null, blitz: 1, fade: 1, cb: 1, tells: 0,
  drive: { q: 0, td: 1, fg: 1, to: 1, time: 1 }, rushMoments: 1 };
/* Everything for one game: { plan: { off, def }, prac: { pass, run, def, film }, drill: { pass, def }, fresh, me, opp (profiles), edge } */
export function mods({ plan = {}, prac = {}, drill = {}, fresh = 100, me, opp, edge = 0, home = false }){
  const M = structuredClone(NOMODS);
  const fo = me && opp ? fitOff(plan.off, me, opp, edge) : 0, fd = opp ? fitDef(plan.def, opp) : 0;
  switch (plan.off){
    case 'ground': M.runBlock *= 1.25; M.passPro *= .92; M.paBite += .1; break;
    case 'balanced': M.paBite += .14; M.spd *= 1.01; break;
    case 'air': M.passPro *= 1.15; M.runBlock *= .88; M.rec *= 1.02; break;
    case 'tempo': M.tempo = .6; M.latePro = 1.12; break;
  }
  // The fit itself: the right plan is a step quicker and a little sharper.
  M.spd *= 1 + .02 * fo; M.acc *= 1 - .06 * fo;
  switch (plan.def){
    case 'deep': M.drive.td *= .92; M.drive.fg *= 1.1; break;
    case 'pressure': M.drive.to *= 1.3; M.drive.td *= 1.05; M.rushMoments = 1.6; break;
    case 'bend': M.drive.td *= .86; M.drive.fg *= 1.25; M.drive.time *= 1.1; break;
  }
  M.drive.q -= .05 * fd;
  const p = h => Math.min(AREA_MAX, prac[h] || 0), dp = drillMult(drill.pass), dd = drillMult(drill.def);
  M.acc *= 1 - .025 * p('pass') * dp; M.catchR += .03 * p('pass') * dp;
  M.runBlock *= 1 + .03 * p('run'); M.spd *= 1 + .003 * p('run');
  M.drive.q -= .007 * p('def') * dd; M.cb *= 1 + .006 * p('def') * dd;
  M.tells = filmTells(p('film'));
  // Tired legs: slower in the second half (half as much in the first) and their drives a little easier.
  M.fade = 1 - (100 - fresh) * .0012; M.drive.q += (100 - fresh) * .0006;
  if (home) M.drive.q -= .01;
  if (opp){ M.cov = opp.def.cov; M.blitz = opp.def.blitz; }
  M.fit = { off: fo, def: fd };
  return M;
}
/* A simmed game: how many points your plan, practice and freshness are worth (added to your side of the spread). */
export function simShift(M, prac){
  const work = ['pass', 'run', 'def'].reduce((a, k) => a + Math.min(AREA_MAX, prac?.[k] || 0), 0);
  return 3 * (M.fit?.off || 0) + 3 * (M.fit?.def || 0) + .35 * work - (1 - M.fade) * 60;
}

/* ---------- the call on each of their drives ---------- */
export const DCALLS = {
  blitz: { name: 'BLITZ', tip: 'Sacks and takeaways, or a big play' },
  man: { name: 'MAN', tip: 'Lock up their receivers' },
  zone: { name: 'ZONE', tip: 'Keep it in front of you' },
  box: { name: 'STACK THE BOX', tip: 'Eight up to stop the run' },
  prevent: { name: 'PREVENT', tip: 'Nothing deep; let the clock run', late: true }
};
/* What this drive's call does against their offense (and the situation). */
export function driveMods(call, opp){
  const o = opp?.off || { runRate: .5, explosive: .5, eff: .5 }, d = { q: 0, td: 1, fg: 1, to: 1, time: 1, rush: 1 };
  switch (call){
    case 'blitz': d.to = 1.35; d.td = 1 + .45 * (o.explosive - .35); d.rush = 1.6; d.q = -.02 * (.6 - o.eff) * 2; break;
    case 'man': d.td = 1 + .2 * (o.explosive - .5); d.q = -.015; break;
    case 'zone': d.td = .93 + .25 * (o.runRate - .5); d.fg = 1.08; d.to = .95; break;
    case 'box': d.q = -.09 * (o.runRate - .5) * 2 + .04 * (o.explosive - .5) * 2; d.td = 1 + .3 * (.5 - o.runRate); break;
    case 'prevent': d.td = .55; d.fg = 1.3; d.time = 1.4; d.to = .8; break;
  }
  return d;
}
/* Film study's read on their next drive. */
export function driveRead(opp, G){
  const o = opp.off, late = G.quarter >= 4 && G.score[1] < G.score[0];
  if (late) return 'They need points: expect them to throw.';
  if (o.runRate >= .55) return `They'll run it about ${Math.round(o.runRate * 100)}% of the time.`;
  if (o.runRate <= .47) return o.explosive >= .55 ? 'Pass-first, and they take shots deep.' : 'Pass-first: quick, short throws.';
  return o.explosive >= .6 ? 'Balanced, with a big-play arm.' : 'Balanced. Watch for play action.';
}

/* ---------- play-call help ---------- */
/* The concepts that beat their scheme (starred on the play sheet). */
export function recommended(opp){
  const s = opp?.def?.scheme || '', out = new Set();
  if (/PRESSURE|COVER 1/.test(s)) ['slants', 'mesh', 'verts'].forEach(k => out.add(k));
  if (/COVER 3/.test(s)) ['flood', 'smash', 'curlflat'].forEach(k => out.add(k));
  if (/QUARTERS/.test(s)) ['smash', 'mesh', 'outs'].forEach(k => out.add(k));
  if (/SOFT/.test(s)) ['dagger', 'curlflat', 'verts'].forEach(k => out.add(k));
  if (/MULTIPLE/.test(s)) ['mesh', 'flood'].forEach(k => out.add(k));
  if ((opp?.def?.runD ?? .5) <= .45) ['run', 'power', 'outside'].forEach(k => out.add(k));
  else if ((opp?.def?.pressure ?? .5) >= .6) ['qbdraw'].forEach(k => out.add(k));
  return out;
}
