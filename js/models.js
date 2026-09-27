/* Normalize ESPN payloads into the small shapes the views use. */
import { parseRecord } from './util.js';

const ml2p = m => {
  if (m == null) return null; if (/even/i.test(m)) m = 100; m = Number(m);
  if (!isFinite(m) || m === 0) return null; return m < 0 ? (-m) / (-m + 100) : 100 / (m + 100);
};
function parseBook(o){
  if (!o) return null;
  const hm = o.homeTeamOdds?.moneyLine ?? o.moneyline?.home?.close?.odds ?? o.moneyline?.home?.open?.odds;
  const am = o.awayTeamOdds?.moneyLine ?? o.moneyline?.away?.close?.odds ?? o.moneyline?.away?.open?.odds;
  const ph = ml2p(hm), pa = ml2p(am);
  return { pHome: (ph != null && pa != null) ? ph / (ph + pa) : null, details: o.details, ou: o.overUnder ?? null };
}

function team(tm, x){
  const rk = x.curatedRank?.current ?? x.rank;
  const score = x.score?.displayValue ?? x.score;
  return {
    id: tm.id, name: tm.location || tm.shortDisplayName || tm.displayName, short: tm.shortDisplayName,
    full: tm.displayName, abbr: tm.abbreviation || tm.shortDisplayName,
    logo: tm.logo || tm.logos?.[0]?.href,
    color: '#' + (tm.color || '8a948e'), alt: '#' + (tm.alternateColor || 'c5ccc7'),
    conf: tm.conferenceId != null ? Number(tm.conferenceId) : null,
    rank: (rk && rk <= 25) ? rk : null, score: score ?? null,
    record: x.records?.[0]?.summary ?? x.record?.[0]?.summary ?? null,
    winner: !!x.winner
  };
}

function game(e, c){
  const side = ha => team((c.competitors.find(k => k.homeAway === ha) || {}).team || {}, c.competitors.find(k => k.homeAway === ha) || {});
  const st = c.status?.type || e.status?.type || {};
  return {
    id: e.id, date: e.date, tbd: (e.timeValid ?? c.timeValid) === false, home: side('home'), away: side('away'),
    state: st.state, detail: st.shortDetail, completed: !!st.completed,
    neutral: !!c.neutralSite, confGame: !!c.conferenceCompetition, venue: c.venue?.fullName,
    tv: c.broadcasts?.[0]?.names?.[0] ?? c.broadcasts?.[0]?.media?.shortName,
    book: parseBook(c.odds?.[0]), sit: c.situation?.downDistanceText,
    liveWp: c.situation?.lastPlay?.probability?.homeWinPercentage ?? null,
    secsLeft: c.situation?.lastPlay?.probability?.secondsLeft ?? null, redZone: !!c.situation?.isRedZone,
    poss: c.situation?.possession ?? null,
    week: e.week?.number, st: e.seasonType?.type ?? e.season?.type
  };
}

export const parseEvent = e => game(e, e.competitions[0]);

export function parseSchedule(j){
  const t = j.team || {};
  return {
    team: { id: t.id, name: t.location, full: t.displayName, abbr: t.abbreviation, logo: t.logo || t.logos?.[0]?.href,
      color: '#' + (t.color || '8a948e'), record: t.recordSummary, standing: t.standingSummary,
      conf: t.groups?.isConference ? Number(t.groups.id) : null },
    season: j.requestedSeason?.year,
    games: (j.events || []).map(parseEvent).sort((a, b) => new Date(a.date) - new Date(b.date))
  };
}

export function parseStandings(j){
  const byTeam = {}, confs = [];
  for (const ch of j.children || []){
    const entries = ch.standings?.entries || ch.children?.flatMap(d => d.standings?.entries || []) || [];
    const teams = entries.map(e => {
      const s = {}; for (const x of e.stats || []) s[x.type] = x;
      const tm = e.team;
      const row = {
        id: tm.id, name: tm.location || tm.shortDisplayName, abbr: tm.abbreviation, logo: tm.logos?.[0]?.href,
        conf: Number(ch.id), overall: parseRecord(s.total?.summary), confRec: parseRecord(s.vsconf?.summary),
        pf: s.pointsfor?.value ?? null, pa: s.pointsagainst?.value ?? null,
        diff: s.pointdifferential?.value ?? null, streak: s.streak?.displayValue
      };
      const r = row.overall, gp = r ? r.w + r.l + r.t : 0;
      row.ppg = gp && row.pf != null ? row.pf / gp : null;
      byTeam[tm.id] = row; return row;
    });
    confs.push({ id: Number(ch.id), name: ch.name, short: ch.shortName || ch.abbreviation, teams });
  }
  return { confs, byTeam };
}

export function parseFpi(j){
  const byTeam = {};
  const cats = Object.fromEntries((j.categories || []).map(c => [c.name, c.names]));
  for (const t of j.teams || []){
    const v = {};
    for (const c of t.categories || []){ const names = cats[c.name] || []; names.forEach((n, i) => { v[c.name + '.' + n] = c.values?.[i]; }); }
    const tm = t.team;
    byTeam[tm.id] = {
      id: tm.id, name: tm.nickname || tm.shortDisplayName, abbr: tm.abbreviation, logo: tm.logos?.[0]?.href,
      fpi: v['fpi.fpi'], rank: v['fpi.fpirank'], projW: v['fpi.projectedw'], projL: v['fpi.projectedl'],
      playoff: v['fpi.probmakeplayoffs'], winConf: v['fpi.probwinconf'], title: v['fpi.probwintitle'],
      off: v['efficiencies.offefficiency'], def: v['efficiencies.defefficiency'],
      sosRank: v['resume.avgsosrank'], resumeRank: v['resume.accomplishmentrank'],
      ap: v['resume.APRank/CFPRank'] > 0 && v['resume.APRank/CFPRank'] <= 25 ? v['resume.APRank/CFPRank'] : null
    };
  }
  const list = Object.values(byTeam).filter(t => t.rank).sort((a, b) => a.rank - b.rank);
  return { byTeam, list, updated: j.lastUpdated };
}

export function parseRankings(j){
  const ap = (j.rankings || []).find(r => r.type === 'ap');
  if (!ap) return null;
  const row = x => ({
    id: x.team?.id, rank: x.current, prev: x.previous, trend: x.trend, points: x.points, fpv: x.firstPlaceVotes,
    record: x.recordSummary, name: x.team?.location || x.team?.nickname, abbr: x.team?.abbreviation,
    logo: x.team?.logo || x.team?.logos?.[0]?.href, conf: x.team?.groups?.isConference ? Number(x.team.groups.id) : null
  });
  return { title: ap.headline, ranks: (ap.ranks || []).map(row), others: (ap.others || []).map(row) };
}

export function parsePredictor(j){
  const stat = (side, n) => j[side]?.statistics?.find(s => s.name === n)?.value;
  const gp = stat('homeTeam', 'gameProjection');
  return {
    pHome: gp != null ? gp / 100 : null,
    mq: stat('homeTeam', 'matchupQuality') ?? null,
    margin: stat('homeTeam', 'teamPredPtDiff') ?? null
  };
}

/* ESPN's probability feeds have one-play glitches (e.g. around kickoffs); a 3-point median removes them without flattening real swings. */
function smooth(pts, keys){
  const med = (a, b, c) => a + b + c - Math.min(a, b, c) - Math.max(a, b, c);
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const q = { ...p };
    for (const k of keys) if (p[k] != null && pts[i - 1][k] != null && pts[i + 1][k] != null) q[k] = med(pts[i - 1][k], p[k], pts[i + 1][k]);
    return q;
  });
}

/* Core API per-play probabilities: win, cover (vs the spread) and over (vs the total), all from the home side's view. */
export function parseProbabilities(j){
  const pts = (j.items || []).map(x => ({
    seq: Number(x.sequenceNumber) || 0, pid: /\/plays\/(\d+)/.exec(x.play?.$ref || '')?.[1] ?? null,
    home: x.homeWinPercentage, cover: x.spreadCoverProbHome ?? null, over: x.totalOverProb ?? null
  })).filter(p => p.home != null).sort((a, b) => a.seq - b.seq);
  return smooth(pts, ['home', 'cover', 'over']);
}

export function parseSummary(j){
  const comp = j.header?.competitions?.[0] || {};
  const ev = { id: j.header?.id, date: comp.date, week: j.header?.week, season: { type: j.header?.season?.type } };
  const g = game(ev, comp);
  for (const cp of comp.competitors || []){
    const t = g[cp.homeAway]; if (!t) continue;
    t.lines = (cp.linescores || []).map(l => l.displayValue ?? l.value);
    if (!t.record) t.record = cp.record?.[0]?.summary ?? null;
  }
  const teamSide = id => String(id) === String(g.home.id) ? 'home' : String(id) === String(g.away.id) ? 'away' : null;
  const teamStats = {};
  for (const t of j.boxscore?.teams || []) teamStats[teamSide(t.team?.id)] = t.statistics || [];
  const players = {};
  for (const t of j.boxscore?.players || []) players[teamSide(t.team?.id)] = (t.statistics || []).map(c => ({
    name: c.name, title: c.text || c.name, labels: c.labels || [],
    rows: (c.athletes || []).map(a => ({ who: a.athlete?.shortName || a.athlete?.displayName, stats: a.stats || [] }))
  }));
  const scoring = (j.scoringPlays || []).map(p => ({
    q: p.period?.number, clock: p.clock?.displayValue, text: p.text, type: p.type?.abbreviation || p.type?.text,
    side: teamSide(p.team?.id), away: p.awayScore, home: p.homeScore
  }));
  const drive = d => ({
    side: teamSide(d.team?.id), desc: d.description, result: d.displayResult || d.result, isScore: !!d.isScore,
    q: d.start?.period?.number, start: d.start?.text, clock: d.start?.clock?.displayValue,
    plays: (d.plays || []).map(p => ({ id: p.id, text: p.text, clock: p.clock?.displayValue, q: p.period?.number, away: p.awayScore, home: p.homeScore }))
  });
  const drives = [...(j.drives?.previous || []).map(drive), ...(j.drives?.current && !j.drives.previous?.some(d => d.id === j.drives.current.id) ? [drive(j.drives.current)] : [])];
  const wp = smooth((j.winprobability || []).filter(p => p.homeWinPercentage != null).map(p => ({ pid: p.playId, home: p.homeWinPercentage })), ['home']);
  const pc = j.pickcenter?.[0];
  const pred = j.predictor ? { pHome: Number(j.predictor.homeTeam?.gameProjection) / 100 || null } : null;
  return {
    game: g, teamStats, players, scoring, drives, wp, pred,
    line: pc ? { details: pc.details, ou: pc.overUnder, spread: pc.spread ?? null, provider: pc.provider?.name } : null,
    venue: j.gameInfo?.venue?.fullName, city: [j.gameInfo?.venue?.address?.city, j.gameInfo?.venue?.address?.state].filter(Boolean).join(', '),
    weather: j.gameInfo?.weather?.temperature != null ? `${j.gameInfo.weather.temperature}°` : null,
    attendance: j.gameInfo?.attendance
  };
}
