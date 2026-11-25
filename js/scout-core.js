/* Team scouting, shared by the scout page (scout.html) and the game drawer's Matchup panel (views/matchup.js).
   Reads data/players/<team id>.json (scripts/players.py and scripts/plays.py): every player and unit graded against
   all of FBS, run directions, penalties and injuries on the play. From the box scores it works out who's been
   playing, who has stopped (ESPN has no college injury reports) and the depth chart. No imports, so the standalone
   scout page can load it as is. */

// Teams with a scout page (the Power 4 and Notre Dame), as a Set of ESPN ids. scripts/players.py writes the list with
// the team files; fetched once, and the same Set comes back on every call.
let list = null;
export const scoutList = () => list ||= fetch('data/players/scout.json').then(r => r.ok ? r.json() : { teams: [] })
  .then(j => new Set((j.teams || []).map(String)), () => { list = null; return new Set(); });

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const fmt = n => Number(n || 0).toLocaleString();
export const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
export const shot = (id, w = 160) => `https://a.espncdn.com/combiner/i?img=/i/headshots/college-football/players/full/${id}.png&w=${w}&h=${Math.round(w * .73)}&scale=crop`;
export const img = (p, w) => `<img src="${shot(p.id, w)}" alt="" loading="lazy" onerror="this.remove()">`;
export const face = (p, w = 120) => `<span class="f"><span class="nof">${esc(p.no ?? '')}</span>${img(p, w)}</span>`;
export function inkOn(hex){
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  const lin = c => { c /= 255; return c <= .04 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  return .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255) > .4 ? '#111' : '#fff';
}
export const md = d => new Date(d).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
export const ord = n => n == null ? '' : `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({1: 'st', 2: 'nd', 3: 'rd'}[n % 10] || 'th')}`;

/* ---------------- how good: 0-99 = share of FBS beaten; one red → gold → green scale ---------------- */
export const STOPS = [[229, 72, 77], [212, 166, 60], [31, 157, 85]];
export function gcol(g){
  if (g == null) return '#8a948e';
  const t = Math.max(0, Math.min(1, g / 99)), [a, b, u] = t < .5 ? [STOPS[0], STOPS[1], t / .5] : [STOPS[1], STOPS[2], (t - .5) / .5];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',')})`;
}
export const gword = g => g == null ? 'Not rated' : g >= 85 ? 'Elite' : g >= 65 ? 'Strong' : g >= 35 ? 'Average' : g >= 15 ? 'Weak' : 'Poor';
// Bar from the FBS average out to this value: right and green when better, left and red when worse.
export function dv(g){
  if (g == null) return '<span class="dv"></span>';
  const w = Math.max(2, Math.abs(g - 49.5) / 49.5 * 50);
  return `<span class="dv" style="--g:${gcol(g)}"><i style="${g >= 49.5 ? `left:50%` : `right:50%`};width:${w.toFixed(1)}%"></i></span>`;
}
export const gnum = g => `<b class="gn" style="--g:${gcol(g)}">${g ?? '–'}</b>`;

/* ---------------- depth: who plays most, last 3 games counting double ---------------- */
export const g0 = (s, c, k) => s?.[c]?.[k] || 0;
export const USE = {
  QB: s => g0(s, 'passing', 'att') + g0(s, 'rushing', 'car') * .3,
  RB: s => g0(s, 'rushing', 'car') + g0(s, 'receiving', 'rec') * .5,
  WR: s => g0(s, 'receiving', 'rec') + g0(s, 'receiving', 'yds') / 15,
  TE: s => g0(s, 'receiving', 'rec') + g0(s, 'receiving', 'yds') / 15 + .5,
  DL: s => g0(s, 'defensive', 'tot') + 3 * g0(s, 'defensive', 'sacks') + 1.5 * g0(s, 'defensive', 'tfl') + g0(s, 'defensive', 'qbh'),
  LB: s => g0(s, 'defensive', 'tot') + 2 * g0(s, 'defensive', 'sacks') + g0(s, 'defensive', 'tfl'),
  DB: s => g0(s, 'defensive', 'tot') + 4 * g0(s, 'interceptions', 'int') + 2 * g0(s, 'defensive', 'pd'),
  PK: s => g0(s, 'kicking', 'fga') + g0(s, 'kicking', 'xpa'),
  P: s => g0(s, 'punting', 'no'),
  RET: s => g0(s, 'kickReturns', 'no') + g0(s, 'puntReturns', 'no'),
  OL: () => 0, LS: () => 0
};
export const CLASS = {GR: 5, SR: 4, JR: 3, SO: 2, FR: 1};
export const UNITS = {
  offense: {label: 'Offense', rooms: ['QB', 'RB', 'WR', 'TE', 'OL']},
  defense: {label: 'Defense', rooms: ['DL', 'LB', 'DB']},
  special: {label: 'Special teams', rooms: ['PK', 'P', 'RET', 'LS']}
};
export const ROOM_NAME = {QB: 'Quarterbacks', RB: 'Running backs', WR: 'Receivers', TE: 'Tight ends', OL: 'Offensive line', DL: 'Defensive line',
  LB: 'Linebackers', DB: 'Secondary', PK: 'Kickers', P: 'Punters', LS: 'Long snappers', RET: 'Returners'};
export const ROOM_UNIT = {QB: 'QB', RB: 'RB', WR: 'WR', TE: 'WR', OL: 'OL', DL: 'DL', LB: 'LB', DB: 'DB', PK: 'ST', P: 'ST', RET: 'ST', LS: 'ST'};
export const UNIT_ROOM = {QB: ['offense', 'QB'], RB: ['offense', 'RB'], WR: ['offense', 'WR'], OL: ['offense', 'OL'], DL: ['defense', 'DL'], LB: ['defense', 'LB'], DB: ['defense', 'DB'], ST: ['special', 'PK']};
export const SHORT = {QB: 'Passing', RB: 'Run game', WR: 'Receivers', OL: 'O-line', DL: 'D-line', LB: 'Run defense', DB: 'Secondary', ST: 'Special teams'};

/* Formations: [room, depth index, x, y] in % of the field. Shotgun offense, 4-3 defense. */
export const FORM = {
  offense: {los: 30, fd: 7, spots: [['WR', 0, 6, 30], ['WR', 1, 94, 30], ['WR', 2, 18, 50], ['OL', 0, 32, 30], ['OL', 1, 41, 30], ['OL', 2, 50, 30], ['OL', 3, 59, 30], ['OL', 4, 68, 30],
      ['TE', 0, 79, 36], ['QB', 0, 44, 60], ['RB', 0, 60, 60]]},
  defense: {los: 17, spots: [['DL', 0, 29, 29], ['DL', 1, 43, 29], ['DL', 2, 57, 29], ['DL', 3, 71, 29], ['LB', 0, 30, 55], ['LB', 1, 50, 55], ['LB', 2, 70, 55],
      ['DB', 0, 6, 29], ['DB', 1, 94, 29], ['DB', 2, 36, 80], ['DB', 3, 64, 80]]},
  special: {los: 22, spots: [['LS', 0, 50, 32], ['PK', 0, 38, 58], ['P', 0, 62, 58], ['RET', 0, 30, 82], ['RET', 1, 70, 82]]}
};
export const SPOTS = {};
for (const f of Object.values(FORM)) for (const [r] of f.spots) SPOTS[r] = (SPOTS[r] || 0) + 1;

/* ---------------- load, then work out who's missing and the depth chart ---------------- */
export async function loadTeam(id, base = 'data/players/'){
  const r = await fetch(`${base}${id}.json`);
  if (!r.ok) throw new Error(`No player file for team ${id}`);
  return prepare(await r.json());
}
// Works out who's missing and the depth chart from a team file. Changes it in place, so call it once per file.
export function prepare(d){
  d.n = d.games.length;
  for (const p of d.players){
    p.gp = Object.keys(p.g).length; p.starts = 0;
    // Not playing lately: was getting real work (3+ touches, catches, kicks or tackles a game) and has dropped out of
    // the box scores. Skill players after one missed game; defenders after two, since a defender can play without a stat.
    const gis = Object.keys(p.g).map(Number).sort((a, b) => a - b);
    if (gis.length >= 2 && USE[p.pos]){
      const per = gis.reduce((t, gi) => t + USE[p.pos](p.g[gi]), 0) / gis.length;
      const last = gis[gis.length - 1], gone = d.n - 1 - last, def = ['DL', 'LB', 'DB'].includes(p.pos);
      if (per >= 3 && gone >= (def ? 2 : 1)) p.miss = {n: gone, g: d.games[last]};
    }
  }
  d.games.forEach((g, gi) => {   // QB starts: whoever threw the most passes that game
    let best = null;
    for (const p of d.players){ const a = p.g[gi]?.passing?.att || 0; if (a > (best?.a || 0)) best = {p, a}; }
    if (best) best.p.starts++;
  });
  d.R = rooms(d);
  return d;
}
export const gone = p => p.out || p.miss ? 1 : 0;
export function usage(p, room, n){ let u = 0; for (const [gi, s] of Object.entries(p.g)) u += USE[room](s) * (+gi >= n - 3 ? 2 : 1); return u; }
export function rooms(d){
  const out = {};
  for (const r of Object.keys(USE)){
    const list = r === 'RET' ? d.players.filter(p => (p.tot.kickReturns?.no || 0) + (p.tot.puntReturns?.no || 0) > 0) : d.players.filter(p => p.pos === r);
    for (const p of list) (p.uu ||= {})[r] = usage(p, r, d.n);
    const byWork = (a, b) => (b.uu[r] - a.uu[r]) || ((CLASS[b.cls] || 0) - (CLASS[a.cls] || 0)) || (num(b.wt) - num(a.wt));
    // A starter: among the top players at his spot in most of the games he played there.
    const k = SPOTS[r] || 1;
    for (let gi = 0; gi < d.n; gi++){
      const on = list.filter(p => p.g[gi] && USE[r](p.g[gi]) > 0).sort((a, b) => USE[r](b.g[gi]) - USE[r](a.g[gi]));
      on.forEach((p, i) => { const c = ((p.sg ||= {})[r] ||= [0, 0]); c[1]++; if (i < k) c[0]++; });
    }
    const usual = (r === 'OL' || r === 'LS') ? [...list].sort(byWork).slice(0, k)
      : list.filter(p => p.sg?.[r] && p.sg[r][0] >= 2 && p.sg[r][0] >= p.sg[r][1] / 2).sort(byWork);
    list.sort((a, b) => (gone(a) - gone(b)) || byWork(a, b));
    const now = list.filter(p => !gone(p)).slice(0, k);
    const lost = usual.filter(gone), fresh = now.filter(p => !usual.includes(p));
    if (r !== 'RET') for (const p of usual) p.usual = true;
    fresh.forEach((p, i) => { if (lost[i]) (p.fills ||= {})[r] = lost[i]; });
    out[r] = list;
  }
  return out;
}

/* ---------------- what a player is about, in one line ---------------- */
export function line(p, room = p.pos){
  const t = p.tot, b = [], pass = t.passing, rush = t.rushing, rec = t.receiving, def = t.defensive, int = t.interceptions;
  if (room === 'QB' && pass){ b.push(`${fmt(pass.yds)} pass yds`, `${pass.td} TD`, `${pass.int} INT`); if (rush?.yds >= 150) b.push(`${fmt(rush.yds)} rush`); }
  else if (room === 'RB' && rush) b.push(`${fmt(rush.yds)} yds`, `${(rush.yds / Math.max(rush.car, 1)).toFixed(1)} ypc`, `${rush.td} TD`);
  else if ((room === 'WR' || room === 'TE') && rec) b.push(`${rec.rec} rec`, `${fmt(rec.yds)} yds`, `${rec.td} TD`);
  else if (['DL', 'LB', 'DB'].includes(room) && (def || int)){
    if (def?.tot) b.push(`${def.tot} tkl`); if (def?.sacks) b.push(`${def.sacks} sk`);
    if (def?.tfl && room !== 'DB') b.push(`${def.tfl} TFL`); if (int?.int) b.push(`${int.int} INT`); if (def?.pd && room === 'DB') b.push(`${def.pd} PD`);
  }
  else if (room === 'PK' && t.kicking) b.push(`FG ${t.kicking.fgm}/${t.kicking.fga}`, `long ${t.kicking.long}`);
  else if (room === 'P' && t.punting) b.push(`${t.punting.no} punts`, `${(t.punting.yds / Math.max(t.punting.no, 1)).toFixed(1)} avg`);
  else if (room === 'RET'){ const k = t.kickReturns, pr = t.puntReturns; if (k) b.push(`${k.no} KR · ${(k.yds / k.no).toFixed(1)}`); if (pr) b.push(`${pr.no} PR · ${(pr.yds / pr.no).toFixed(1)}`); }
  return b.join(' · ');
}
export function tiles(p, room){
  const t = p.tot, T = (v, k) => v != null && v !== false ? [v, k] : null;
  const m = {
    QB: [T(t.passing && fmt(t.passing.yds), 'Pass yds'), T(t.passing && `${t.passing.td}/${t.passing.int}`, 'TD/INT'), T(t.passing && `${Math.round(100 * t.passing.cmp / Math.max(t.passing.att, 1))}%`, 'Comp'), T(t.rushing && fmt(t.rushing.yds), 'Rush yds')],
    RB: [T(t.rushing && fmt(t.rushing.yds), 'Rush yds'), T(t.rushing && (t.rushing.yds / Math.max(t.rushing.car, 1)).toFixed(1), 'Per carry'), T(t.rushing && t.rushing.td, 'TD'), T(t.receiving && t.receiving.rec, 'Rec')],
    WR: [T(t.receiving && t.receiving.rec, 'Rec'), T(t.receiving && fmt(t.receiving.yds), 'Yds'), T(t.receiving && t.receiving.td, 'TD'), T(t.receiving && t.receiving.long, 'Long')],
    DEF: [T(t.defensive && t.defensive.tot, 'Tackles'), T(t.defensive && t.defensive.tfl, 'TFL'), T(t.defensive && t.defensive.sacks, 'Sacks'), T(t.interceptions ? t.interceptions.int : t.defensive && t.defensive.pd, t.interceptions ? 'INT' : 'PD')],
    PK: [T(t.kicking && `${t.kicking.fgm}/${t.kicking.fga}`, 'FG'), T(t.kicking && t.kicking.long, 'Long'), T(t.kicking && t.kicking.pts, 'Pts')],
    P: [T(t.punting && t.punting.no, 'Punts'), T(t.punting && (t.punting.yds / t.punting.no).toFixed(1), 'Avg'), T(t.punting && t.punting.in20, 'Inside 20')],
    RET: [T(t.kickReturns && t.kickReturns.no, 'Kick ret'), T(t.kickReturns && (t.kickReturns.yds / t.kickReturns.no).toFixed(1), 'KR avg'), T(t.puntReturns && t.puntReturns.no, 'Punt ret'), T(t.puntReturns && (t.puntReturns.yds / t.puntReturns.no).toFixed(1), 'PR avg')]
  };
  return (m[room] || m[room === 'TE' ? 'WR' : ['DL', 'LB', 'DB'].includes(room) ? 'DEF' : ''] || []).filter(Boolean);
}
export const METRIC = {QB: ['passing', 'yds', 'Passing yards'], RB: ['rushing', 'yds', 'Rushing yards'], WR: ['receiving', 'yds', 'Receiving yards'], TE: ['receiving', 'yds', 'Receiving yards'],
  DL: ['defensive', 'tot', 'Tackles'], LB: ['defensive', 'tot', 'Tackles'], DB: ['defensive', 'tot', 'Tackles'], PK: ['kicking', 'pts', 'Points'], P: ['punting', 'no', 'Punts'], RET: ['kickReturns', 'yds', 'Kick return yards']};
export const bio = p => [`#${p.no ?? '–'}`, p.pos, p.cls, p.ht && p.wt ? `${p.ht.replace(/\s/g, '')}, ${p.wt.replace(' lbs', '')}` : ''].filter(Boolean).join(' · ');
export const since = p => p.out ? 'Out per ESPN' : p.miss ? `last played ${md(p.miss.g.date)} ${p.miss.g.home ? 'vs' : '@'} ${p.miss.g.opp.abbr}` : '';
export const missed = p => p.out ? 'Out' : p.miss ? (p.miss.n === 1 ? 'Missed last game' : `Missed ${p.miss.n} games`) : '';

export const gameName = g => `${g.home ? 'vs' : '@'} ${g.opp.abbr}`;
export const QTR = q => q > 4 ? 'OT' : `Q${q}`;
// Hurt on the play: the last time the play-by-play says so, as 'Hurt @ MIA, Q2'.
export const hurtAt = (d, p) => { const x = p.inj?.[p.inj.length - 1]; return x && d.games[x.gi] ? `Hurt ${gameName(d.games[x.gi])}, ${QTR(x.q)}` : ''; };
// Still playing, but went down on a play in the last game.
export const shaken = (d, p) => !gone(p) && p.inj?.some(x => x.gi === d.n - 1);
export const flags = p => Object.values(p.pen || {}).reduce((a, b) => a + b, 0);
export const flagLine = p => Object.entries(p.pen || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k.toLowerCase()}${n > 1 && !/s$/.test(k) && !/holding|interference|conduct|roughness/i.test(k) ? 's' : ''}`).join(', ');

