/* Season mode for Coach Andre's Bowl: your team's real schedule, week by week, in a world that's real where it has
   happened and simulated where it hasn't. Every other FBS game comes from ESPN's weekly scoreboards: a game already
   played in real life keeps its real score; one that hasn't is simulated from the teams' FPI when its week is done.
   Your games are always yours. Then conference title games (the top two in your world's standings), a 12-team
   playoff seeded from your world's poll, and a bowl for everyone else with six wins.
   Pure logic and storage here; the screens are in seasonview.js. */
import { scoreboardUrl, withTimeout } from '../api.js';
import { store } from '../util.js';
import { parseEvent } from '../models.js';

const KEY = 'pbSeason', HISTORY = 'pbSeasons';
export const REG_WEEKS = 14;
export const CCG_WEEK = 15, CFP_WEEK = 16, BOWL_WEEK = 16;

export const load = () => { const s = store.get(KEY, null); return s && s.v === 1 ? s : null; };
export const save = s => store.set(KEY, s);
export const clear = () => { try{ localStorage.removeItem('cfbboard.' + KEY); }catch{} };
export const history = () => store.get(HISTORY, []);

/* ---------- building a season ---------- */
/* Fetched straight (not through the board's cache): fourteen full FBS weeks are big, and only a compact copy is kept. */
async function week(w){
  for (let i = 0; i < 2; i++){
    try{ const r = await fetch(scoreboardUrl(w, 2), withTimeout()); if (r.ok) return await r.json(); }catch{}
  }
  return null;
}

/* fpi, standings: the board's parsed FPI and standings (for strength and conference names). onProgress(done, total). */
export async function create({ teamId, diff, len, year, fpi, standings, onProgress = () => {} }){
  const s = { v: 1, year, teamId: String(teamId), diff, len, created: Date.now(), teams: {}, confs: {}, games: {}, weeks: {}, mine: {},
    stage: 'reg', week: 1, fresh: 100, gw: {}, polls: {}, post: {}, stats: null, log: [] };
  let done = 0;
  const weeks = await Promise.all(Array.from({ length: REG_WEEKS }, (_, i) => week(i + 1).then(j => { onProgress(++done, REG_WEEKS); return j; })));
  if (weeks.filter(Boolean).length < REG_WEEKS - 2) throw new Error("Couldn't load the season's schedule");
  for (const c of standings?.confs || []) s.confs[c.id] = { name: c.name, short: c.short };
  weeks.forEach((j, i) => {
    const w = i + 1; s.weeks[w] = [];
    for (const e of j?.events || []){
      let g; try{ g = parseEvent(e); }catch{ continue; }
      if (!g.home?.id || !g.away?.id) continue;
      for (const t of [g.home, g.away]) addTeam(s, t, fpi, standings);
      const rec = { id: String(g.id), w, h: String(g.home.id), a: String(g.away.id), n: g.neutral ? 1 : 0, cg: g.confGame ? 1 : 0, date: g.date };
      if (g.completed && g.home.score != null) rec.real = [Number(g.home.score), Number(g.away.score)];
      if (Number.isFinite(g.book?.spread)) rec.sp = g.book.spread;
      s.games[rec.id] = rec; s.weeks[w].push(rec.id);
      if (rec.h === s.teamId || rec.a === s.teamId) (s.mine[w] ||= []).push(rec.id);
    }
    if (s.mine[w]) s.mine[w].sort((a, b) => new Date(s.games[a].date) - new Date(s.games[b].date));
  });
  if (!Object.keys(s.mine).length) throw new Error('No games found for that team');
  s.polls[0] = poll(s).top;
  return s;
}
function addTeam(s, t, fpi, standings){
  const id = String(t.id); if (s.teams[id]) return;
  const f = fpi?.byTeam?.[id], st = standings?.byTeam?.[id];
  s.teams[id] = { id, name: t.name, abbr: t.abbr, logo: t.logo, color: t.color, alt: t.alt, conf: st?.conf ?? t.conf ?? null,
    fbs: !!(st || f), fpi: Number.isFinite(f?.fpi) ? Math.round(f.fpi * 10) / 10 : null, off: f?.off ?? null, def: f?.def ?? null };
}

/* ---------- simulating games ---------- */
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) * Math.SQRT2; };
export const strength = t => Number.isFinite(t?.fpi) ? t.fpi : t?.fbs ? -6 : -22;
/* Expected margin, home minus away (points). The real spread when ESPN has one, otherwise FPI plus home field. */
export function expMargin(s, g){
  if (Number.isFinite(g.sp) && !g.post) return -g.sp;
  return strength(s.teams[g.h]) - strength(s.teams[g.a]) + (g.n ? 0 : 2.5);
}
export const winProb = m => 1 / (1 + Math.exp(-m / 7.6));
// Scores land on football numbers (no 2-1 finals): the nearest common total.
const SCORES = [0, 3, 6, 7, 10, 13, 14, 16, 17, 19, 20, 21, 23, 24, 26, 27, 28, 30, 31, 33, 34, 35, 37, 38, 40, 41, 42, 44, 45, 48, 49, 51, 52, 55, 56, 59, 62, 63, 66, 70];
const fb = n => SCORES.reduce((b, x) => Math.abs(x - n) < Math.abs(b - n) ? x : b, 0);
/* A simulated final [home, away]. shift: extra points for the home side (your plan and practice, in a simmed game). */
export function simScore(s, g, shift = 0){
  const H = s.teams[g.h], A = s.teams[g.a], e = (t, k) => Number.isFinite(t?.[k]) ? t[k] - 50 : (t?.fbs ? 0 : -18);
  const m = expMargin(s, g) + shift + gauss() * 13.5;
  const total = Math.max(17, Math.min(98, 51 + (e(H, 'off') + e(A, 'off')) * .3 - (e(H, 'def') + e(A, 'def')) * .22 + gauss() * 9));
  let hs = fb(Math.max(0, (total + m) / 2)), as = fb(Math.max(0, (total - m) / 2));
  if (hs === as){ if (m >= 0) hs += Math.random() < .5 ? 3 : 7; else as += Math.random() < .5 ? 3 : 7; }   // overtime
  return [hs, as];
}

/* ---------- real results ---------- */
/* Re-reads the weeks that have games played in real life since the season was built (only weeks up to `upto`). */
export async function refreshReal(s, upto){
  const now = Date.now(), todo = [];
  for (let w = 1; w <= Math.min(upto, REG_WEEKS); w++){
    if ((s.weeks[w] || []).some(id => { const g = s.games[id]; return !g.real && new Date(g.date).getTime() + 4 * 3600e3 < now; })) todo.push(w);
  }
  if (!todo.length) return false;
  let changed = false;
  await Promise.all(todo.map(async w => {
    const j = await week(w); if (!j) return;
    for (const e of j.events || []){
      let g; try{ g = parseEvent(e); }catch{ continue; }
      const rec = s.games[String(g.id)];
      if (rec && !rec.real && g.completed && g.home.score != null){ rec.real = [Number(g.home.score), Number(g.away.score)]; changed = true; }
    }
  }));
  return changed;
}

/* ---------- your games ---------- */
export const isMine = (s, g) => g.h === s.teamId || g.a === s.teamId;
export const myScore = (s, g, res = g.res) => res ? (g.h === s.teamId ? [res[0], res[1]] : [res[1], res[0]]) : null;
export const oppOf = (s, g) => s.teams[g.h === s.teamId ? g.a : g.h];
export const homeAway = (s, g) => g.n ? 'N' : g.h === s.teamId ? 'H' : 'A';
const blankStats = () => ({ gp: 0, pf: 0, pa: 0, comp: 0, att: 0, passYds: 0, passTD: 0, int: 0, rush: 0, rushYds: 0, rushTD: 0, sacks: 0, by: {} });

/* Your game is over: the score (yours first), how it was decided ('play', 'coach' or 'sim') and the box score. */
export function recordMine(s, gid, mine, how, st){
  const g = s.games[gid]; if (!g || g.res) return;
  g.res = g.h === s.teamId ? [mine[0], mine[1]] : [mine[1], mine[0]];
  g.how = how;
  const S = s.stats ||= blankStats();
  S.gp++; S.pf += mine[0]; S.pa += mine[1];
  if (st){
    for (const k of ['comp', 'att', 'passYds', 'passTD', 'int', 'rush', 'rushYds', 'rushTD', 'sacks']) S[k] += st[k] || 0;
    for (const [role, v] of Object.entries(st.by || {})){
      const b = S.by[role] ||= { rec: 0, yds: 0, td: 0, car: 0, ryds: 0, rtd: 0 };
      for (const k in b) b[k] += v[k] || 0;
    }
  }
}

/* ---------- records, standings, the poll ---------- */
export function table(s){
  const T = {};
  const row = id => T[id] ||= { id, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, games: [] };
  for (const g of Object.values(s.games)){
    if (!g.res) continue;
    const [hs, as] = g.res, H = row(g.h), A = row(g.a), hw = hs > as;
    H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
    if (hw){ H.w++; A.l++; } else { A.w++; H.l++; }
    if (g.cg && !g.post){ if (hw){ H.cw++; A.cl++; } else { A.cw++; H.cl++; } }
    H.games.push({ opp: g.a, won: hw, m: hs - as, w: g.w }); A.games.push({ opp: g.h, won: !hw, m: as - hs, w: g.w });
  }
  return T;
}
export const recOf = (T, id) => T[id] || { w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, games: [] };
const pct = r => r.w + r.l ? r.w / (r.w + r.l) : .5;

/* Your world's Top 25: what each team has done (wins worth more against good teams, losses hurt less) plus how good
   it is (FPI), which counts less as the season goes on. */
export function poll(s, T = table(s)){
  const score = {};
  for (const t of Object.values(s.teams)){
    if (!t.fbs) continue;
    const r = recOf(T, t.id), n = r.games.length;
    let res = 0;
    for (const x of r.games){
      const o = s.teams[x.opp], or = recOf(T, x.opp);
      const q = .55 * Math.max(0, Math.min(1.3, (strength(o) + 12) / 26)) + .45 * (or.w + 1) / (or.w + or.l + 2);
      res += (x.won ? .9 + q * .95 : -1.55 + q * .9) + Math.max(-24, Math.min(24, x.m)) / 90;
    }
    score[t.id] = res + strength(t) / 8 * Math.max(.3, 1.3 - .09 * n);
  }
  const order = Object.keys(score).sort((a, b) => score[b] - score[a]);
  return { order, top: order.slice(0, 25), score };
}
export const rankOf = (s, id, w = latestPoll(s)) => { const i = (s.polls[w] || []).indexOf(String(id)); return i < 0 ? null : i + 1; };
export const latestPoll = s => Math.max(...Object.keys(s.polls).map(Number));

/* Conference standings in your world: conference record, then overall, then the poll. */
export function standings(s, conf, T = table(s), P = poll(s, T)){
  return Object.values(s.teams).filter(t => t.fbs && String(t.conf) === String(conf))
    .map(t => ({ t, r: recOf(T, t.id) }))
    .sort((a, b) => (b.r.cw - b.r.cl) - (a.r.cw - a.r.cl) || pct(b.r) - pct(a.r) || (P.score[b.t.id] ?? -99) - (P.score[a.t.id] ?? -99));
}
const INDEPENDENT = 18;
export const confIds = s => [...new Set(Object.values(s.teams).filter(t => t.fbs && t.conf != null).map(t => String(t.conf)))];

/* ---------- moving the season along ---------- */
/* What's next on the hub: one of your games, a bye, or the rest of the world playing. */
export function next(s){
  if (s.stage === 'done') return { kind: 'done' };
  if (s.stage === 'reg'){
    const mine = (s.mine[s.week] || []).filter(id => !s.games[id].res);
    return mine.length ? { kind: 'game', id: mine[0], week: s.week } : { kind: 'bye', week: s.week };
  }
  const round = s.post[s.stage]?.round ?? 0;
  const ids = (s.post[s.stage]?.rounds?.[round] || s.post[s.stage]?.games || []).filter(id => !s.games[id].res);
  const mine = ids.find(id => isMine(s, s.games[id]));
  return mine ? { kind: 'game', id: mine, stage: s.stage } : { kind: 'sim', stage: s.stage };
}

/* Finishes the current step (after your game, or straight away on a bye / when you're not playing): plays out every
   other game, takes the poll, and sets up what comes next. Returns a recap: { label, games: [ids], before, after }. */
export function advance(s){
  const T0 = table(s), before = poll(s, T0).order;
  let label, ids;
  if (s.stage === 'reg'){
    const w = s.week; label = `Week ${w}`; ids = s.weeks[w] || [];
    for (const id of ids){ const g = s.games[id]; if (g.res) continue; g.res = g.real ? [...g.real] : simScore(s, g); g.sim = !g.real; }
    if (!s.mine[w]) s.fresh = Math.min(100, s.fresh + 15);   // a bye: rest
    s.week++;
    const P = poll(s); s.polls[w] = P.top;
    if (s.week > REG_WEEKS) setupCCG(s);
    return { label, games: ids, before, after: P.order, week: w };
  }
  if (s.stage === 'ccg'){
    label = 'Championship Week'; ids = s.post.ccg.games;
    for (const id of ids){ const g = s.games[id]; if (!g.res){ g.res = simScore(s, g); g.sim = true; } }
    const T = table(s), P = poll(s, T); s.polls[CCG_WEEK] = P.top;
    s.post.champs = {};
    for (const c of confIds(s)){
      const cg = ids.map(id => s.games[id]).find(g => g.conf === c);
      s.post.champs[c] = cg ? (cg.res[0] > cg.res[1] ? cg.h : cg.a) : standings(s, c, T, P)[0]?.t.id;
    }
    setupCFP(s, P);
    return { label, games: ids, before, after: P.order };
  }
  if (s.stage === 'cfp'){
    const C = s.post.cfp, r = C.round; ids = C.rounds[r]; label = CFP_ROUNDS[r];
    for (const id of ids){ const g = s.games[id]; if (!g.res){ g.res = simScore(s, g); g.sim = true; } }
    const winners = ids.map(id => winnerOf(s.games[id]));
    if (r < 3){ buildRound(s, r + 1, winners); C.round = r + 1; }
    else { C.champ = winners[0]; C.round = 4; finishPost(s); }
    return { label, games: ids, before, after: before };
  }
  if (s.stage === 'bowl'){
    label = s.post.bowl.name; ids = [s.post.bowl.id];
    finishPost(s);
    return { label, games: ids, before, after: before };
  }
  return { label: '', games: [], before, after: before };
}
const winnerOf = g => g.res[0] > g.res[1] ? g.h : g.a;
export const CFP_ROUNDS = ['Playoff First Round', 'Playoff Quarterfinals', 'Playoff Semifinals', 'National Championship'];
const QF_BOWLS = ['Rose Bowl', 'Sugar Bowl', 'Orange Bowl', 'Cotton Bowl'], SF_BOWLS = ['Peach Bowl', 'Fiesta Bowl'];

function postGame(s, id, w, h, a, extra = {}){
  s.games[id] = { id, w, h: String(h), a: String(a), n: 1, cg: 0, post: 1, ...extra };
  return id;
}
/* Conference title games: the top two in each conference's standings (independents have none). */
function setupCCG(s){
  const T = table(s), P = poll(s, T), games = [];
  for (const c of confIds(s)){
    if (Number(c) === INDEPENDENT) continue;
    const st = standings(s, c, T, P); if (st.length < 6) continue;
    games.push(postGame(s, `ccg-${c}`, CCG_WEEK, st[0].t.id, st[1].t.id, { conf: c, name: `${s.confs[c]?.short || s.confs[c]?.name || 'Conference'} Championship` }));
  }
  s.stage = 'ccg'; s.post.ccg = { games };
}
/* The 12-team playoff: the five best-ranked conference champions and the next seven, seeded straight by the poll.
   1–4 get byes; 5 hosts 12, 6 hosts 11, 7 hosts 10, 8 hosts 9. */
function setupCFP(s, P){
  const champs = new Set(Object.values(s.post.champs).filter(Boolean).map(String));
  const auto = P.order.filter(id => champs.has(id)).slice(0, 5);
  const field = [...auto]; for (const id of P.order){ if (field.length >= 12) break; if (!field.includes(id)) field.push(id); }
  const seeds = field.sort((a, b) => P.order.indexOf(a) - P.order.indexOf(b));
  s.post.cfp = { seeds, round: 0, rounds: [] };
  const r1 = [[4, 11], [5, 10], [6, 9], [7, 8]].map(([a, b], i) => postGame(s, `cfp-0-${i}`, CFP_WEEK, seeds[a], seeds[b], { n: 0, name: 'Playoff First Round', seeds: [a + 1, b + 1] }));
  s.post.cfp.rounds[0] = r1;
  const inField = seeds.includes(s.teamId);
  if (inField){ s.stage = 'cfp'; return; }
  // Not in the field: your bowl (six wins or more), then the playoff plays out.
  const T = table(s), me = recOf(T, s.teamId);
  if (me.w >= 6) setupBowl(s, P, seeds); else { simRestOfCFP(s); finishPost(s); }
}
function buildRound(s, r, winners){
  const C = s.post.cfp, seeds = C.seeds, seedOf = id => seeds.indexOf(id) + 1;
  let pairs;
  if (r === 1) pairs = [[seeds[0], winners[3]], [seeds[1], winners[2]], [seeds[2], winners[1]], [seeds[3], winners[0]]];   // 1 v 8/9, 2 v 7/10, 3 v 6/11, 4 v 5/12
  else if (r === 2) pairs = [[winners[0], winners[3]], [winners[1], winners[2]]];
  else pairs = [[winners[0], winners[1]]];
  C.rounds[r] = pairs.map(([a, b], i) => {
    const [h, x] = seedOf(a) <= seedOf(b) ? [a, b] : [b, a];
    const name = r === 1 ? QF_BOWLS[i] : r === 2 ? SF_BOWLS[i] : 'National Championship';
    return postGame(s, `cfp-${r}-${i}`, CFP_WEEK + r, h, x, { name, seeds: [seedOf(h), seedOf(x)] });
  });
}
export function simRestOfCFP(s){
  const C = s.post.cfp;
  while (C.round <= 3){
    const ids = C.rounds[C.round];
    for (const id of ids){ const g = s.games[id]; if (!g.res){ g.res = simScore(s, g); g.sim = true; } }
    const winners = ids.map(id => winnerOf(s.games[id]));
    if (C.round < 3) buildRound(s, C.round + 1, winners); else C.champ = winners[0];
    C.round++;
  }
}
const BOWLS = ['Citrus Bowl', 'ReliaQuest Bowl', 'Alamo Bowl', 'Holiday Bowl', 'Gator Bowl', 'Music City Bowl', 'Las Vegas Bowl', 'Pop-Tarts Bowl',
  'Sun Bowl', 'Liberty Bowl', 'Texas Bowl', 'Pinstripe Bowl', "Duke's Mayo Bowl", 'Armed Forces Bowl', 'Birmingham Bowl', 'Independence Bowl', 'Hawai\'i Bowl', 'Famous Idaho Potato Bowl'];
/* Your bowl: the best-ranked team near you (not in the playoff, not from your conference, bowl eligible). */
function setupBowl(s, P, seeds){
  const T = table(s), mine = P.order.indexOf(s.teamId), myConf = String(s.teams[s.teamId].conf);
  const ok = id => id !== s.teamId && !seeds.includes(id) && recOf(T, id).w >= 6 && String(s.teams[id].conf) !== myConf;
  const pool = P.order.filter(ok).sort((a, b) => Math.abs(P.order.indexOf(a) - mine) - Math.abs(P.order.indexOf(b) - mine));
  const opp = pool[0] || P.order.find(id => id !== s.teamId && !seeds.includes(id));
  const name = BOWLS[Math.min(BOWLS.length - 1, Math.max(0, Math.floor((mine - 12) / 4)))];
  const id = postGame(s, 'bowl', BOWL_WEEK, s.teamId, opp, { name });
  s.post.bowl = { id, name, games: [id] };
  s.stage = 'bowl';
}
function finishPost(s){
  if (s.post.cfp && s.post.cfp.round <= 3) simRestOfCFP(s);
  s.stage = 'done';
  const P = poll(s); s.polls[99] = P.top;
  archive(s);
}

/* ---------- the season's story ---------- */
/* How your season ended, in a line ("National champions", "Lost in the Rose Bowl", "Won the Gator Bowl", "6–6"). */
export function outcome(s){
  const T = table(s), r = recOf(T, s.teamId), C = s.post.cfp;
  if (C?.champ === s.teamId) return { line: 'National champions', big: true };
  if (C?.seeds?.includes(s.teamId)){
    for (let i = 0; i < (C.rounds || []).length; i++){
      const g = (C.rounds[i] || []).map(id => s.games[id]).find(g => isMine(s, g) && g.res);
      if (g && winnerOf(g) !== s.teamId) return { line: i === 3 ? 'Lost the national championship' : `Lost in the ${g.name}`, big: true };
    }
    return { line: 'Made the playoff', big: true };
  }
  const b = s.post.bowl && s.games[s.post.bowl.id];
  if (b?.res) return { line: winnerOf(b) === s.teamId ? `Won the ${b.name}` : `Lost the ${b.name}` };
  return { line: `${r.w}–${r.l}` };
}
function archive(s){
  const T = table(s), r = recOf(T, s.teamId), t = s.teams[s.teamId];
  const list = history().filter(x => x.created !== s.created);
  list.unshift({ created: s.created, year: s.year, team: { id: t.id, name: t.name, abbr: t.abbr, logo: t.logo, color: t.color }, w: r.w, l: r.l,
    rank: rankOf(s, s.teamId, 99), diff: s.diff, outcome: outcome(s).line, champ: s.post.cfp?.champ === s.teamId, at: Date.now() });
  store.set(HISTORY, list.slice(0, 30));
}

/* Your record next to the real one, for the games real life has played. */
export function realVsYours(s){
  let yw = 0, yl = 0, rw = 0, rl = 0, n = 0;
  for (const ids of Object.values(s.mine)) for (const id of ids){
    const g = s.games[id]; if (!g.res || !g.real) continue;
    n++; const y = myScore(s, g), r = myScore(s, g, g.real);
    y[0] > y[1] ? yw++ : yl++; r[0] > r[1] ? rw++ : rl++;
  }
  return { n, yours: [yw, yl], real: [rw, rl] };
}
/* The week's headlines in your world: upsets of ranked teams, ranked matchups, and your conference. */
export function headlines(s, ids, beforeOrder){
  const rank = id => { const i = beforeOrder.indexOf(id); return i >= 0 && i < 25 ? i + 1 : null; };
  return ids.map(id => s.games[id]).filter(g => g?.res && !isMine(s, g)).map(g => {
    const win = winnerOf(g), lose = win === g.h ? g.a : g.h, rw = rank(win), rl = rank(lose);
    const upset = rl && (!rw || rw > rl);
    const weight = (upset ? 60 - rl : 0) + (rw && rl ? 50 - rw - rl : 0) + (rw ? 20 - rw / 2 : 0) + (rl ? 25 - rl : 0);
    return { g, win, lose, rw, rl, upset, weight };
  }).filter(x => x.weight > 0).sort((a, b) => b.weight - a.weight);
}
