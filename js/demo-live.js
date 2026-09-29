/* Live-games demo, published at /demo.html (nothing on the board links to it): replays last week's real games as if
   six of them were live right now. Loaded by demo.html before the app; index.html never loads it. It wraps fetch and rewrites three ESPN responses:
     - the current scoreboard becomes last week's games moved to today: six live, a batch already final, the rest tonight
     - each live game's summary is cut off at the chosen play (score, line score, drives, scoring plays, win probability)
     - the per-play probability feed is cut off at the same play
   Everything else (FPI, standings, rankings, markets, threads) passes through untouched. If last week can't be
   replayed (week 1, bowl season, an ESPN hiccup) the demo quietly shows the real board instead. */

const realFetch = window.fetch.bind(window);
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

/* Which games to put in progress, and how far through their plays to stop. 'half' stops at halftime;
   'clutch' stops at the last 4th-quarter play where the win probability was still between 30% and 70%. */
const LIVE = [
  ['Louisville Cardinals', 'clutch'],   // late 4th while it's still a coin flip: gets the orange "hot" outline
  ['Iowa Hawkeyes', 'clutch'],
  ['Florida Gators', .62],         // 3rd quarter
  ['Oregon Ducks', 'half'],        // halftime
  ['Wisconsin Badgers', .33],      // 2nd quarter
  ['Texas Longhorns', .1]          // 1st quarter
];

const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
const get = async url => (await realFetch(url)).json();
const ord = n => ['1st', '2nd', '3rd', '4th'][n - 1] || 'OT';
const secs = c => { const [m, s] = String(c || '0:00').split(':').map(Number); return m * 60 + (s || 0); };

const cuts = new Map();   // game id -> { idx, play, drive, halftime }
let boardPromise = null;

/* Flatten every play with the drive it belongs to. */
const playsOf = sum => (sum.drives?.previous || []).flatMap(d => (d.plays || []).map(p => ({ p, d })));

function cutPoint(sum, when){
  const all = playsOf(sum);
  if (!all.length) return null;
  let idx;
  if (when === 'half'){
    idx = all.findLastIndex(x => x.p.period?.number <= 2);
  } else if (when === 'clutch'){
    const wp = new Map((sum.winprobability || []).map(w => [String(w.playId), w.homeWinPercentage]));
    idx = all.findLastIndex((x, i) => i < all.length - 1 && x.p.period?.number === 4 && Math.abs((wp.get(String(x.p.id)) ?? 0) - .5) <= .2);
    if (idx < 0) idx = Math.floor(.9 * all.length);
  } else idx = Math.min(all.length - 2, Math.floor(when * all.length));
  const { p, d } = all[idx], next = all[idx + 1]?.p;
  return { idx, play: p, drive: d, next, halftime: when === 'half' };
}

function fieldText(start, abbr){
  if (!start?.down) return null;
  const ytez = start.yardsToEndzone, own = abbr[start.team?.id] , opp = Object.entries(abbr).find(([id]) => id !== String(start.team?.id))?.[1];
  const spot = ytez === 50 ? 'the 50' : ytez < 50 ? `${opp} ${ytez}` : `${own} ${100 - ytez}`;
  return `${ord(start.down)} & ${start.distance >= ytez ? 'Goal' : start.distance} at ${spot}`;
}

async function buildBoard(){
  const now = await get(`${SITE}/scoreboard?groups=80&limit=400`);
  const prevWeek = Number(now.week?.number) - 1;
  const past = await get(`${SITE}/scoreboard?groups=80&limit=400&week=${prevWeek}&seasontype=${now.season?.type ?? 2}`);
  const events = (past.events || []).filter(e => e.status?.type?.completed);
  if (!(prevWeek >= 1) || events.length < 10) throw new Error('no finished week to replay');
  const t = Date.now();
  const byName = name => events.find(e => e.competitions[0].competitors.some(c => c.team.displayName === name));

  // Live games: cut each real game at its chosen play and dress the scoreboard entry to match.
  const live = [];
  for (const [name, when] of LIVE){
    const e = byName(name); if (!e || live.includes(e)) continue;
    const sum = await get(`${SITE}/summary?event=${e.id}`);
    const cut = cutPoint(sum, when); if (!cut) continue;
    cuts.set(String(e.id), { ...cut, sum });
    const c = e.competitions[0], p = cut.play, period = p.period.number;
    const abbr = Object.fromEntries(c.competitors.map(x => [x.team.id, x.team.abbreviation]));
    const home = c.competitors.find(x => x.homeAway === 'home'), away = c.competitors.find(x => x.homeAway === 'away');
    home.score = String(p.homeScore); away.score = String(p.awayScore); home.winner = away.winner = false;
    const wp = sum.winprobability?.find(w => String(w.playId) === String(p.id))?.homeWinPercentage;
    const left = cut.halftime ? 1800 : (4 - period) * 900 + secs(p.clock?.displayValue);
    const status = cut.halftime
      ? { clock: 0, displayClock: '0:00', period: 2, type: { id: '23', name: 'STATUS_HALFTIME', state: 'in', completed: false, description: 'Halftime', detail: 'Halftime', shortDetail: 'Halftime' } }
      : { clock: secs(p.clock?.displayValue), displayClock: p.clock?.displayValue, period,
          type: { id: '2', name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress', detail: `${p.clock?.displayValue} - ${ord(period)} Quarter`, shortDetail: `${p.clock?.displayValue} - ${ord(period)}` } };
    e.status = c.status = status;
    const start = cut.next?.start;
    c.situation = cut.halftime ? { lastPlay: { probability: { homeWinPercentage: wp, secondsLeft: left } } } : {
      possession: String(start?.team?.id ?? cut.drive.team?.id), downDistanceText: fieldText(start, abbr),
      isRedZone: start?.yardsToEndzone != null && start.yardsToEndzone <= 20,
      lastPlay: { text: p.text, probability: { homeWinPercentage: wp, secondsLeft: left } }
    };
    // Kickoff time consistent with how far along the game is (about 3.5 hours for a full game).
    e.date = c.date = new Date(t - (1 - left / 3600) * 3.3 * 3600e3).toISOString();
    live.push(e);
  }

  // Everything else: the earlier half already final today, the later half kicking off tonight.
  const rest = events.filter(e => !live.includes(e)).sort((a, b) => a.date.localeCompare(b.date));
  const split = Math.floor(rest.length * .45);
  rest.forEach((e, i) => {
    const c = e.competitions[0];
    if (i < split){
      e.date = c.date = new Date(t - (5 * 3600e3) + i * 60e3).toISOString();
    } else {
      const k = new Date(t + (40 + (i - split) * 7) * 60e3);
      k.setMinutes(Math.round(k.getMinutes() / 30) * 30, 0, 0);
      e.date = c.date = k.toISOString();
      const when = k.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      e.status = c.status = { clock: 0, displayClock: '0:00', period: 0,
        type: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', detail: when, shortDetail: when } };
      for (const x of c.competitors){ x.score = '0'; x.winner = false; }
    }
  });

  if (!live.length) throw new Error('none of the demo games were played last week');
  now.events = [...live, ...rest];
  return now;
}
const board = () => (boardPromise ??= buildBoard());

/* A live game's box score as of the cut: line score, drives, scoring plays and win probability up to that play. */
function cutSummary(cut){
  const sum = structuredClone(cut.sum), p = cut.play, period = p.period.number, clock = secs(p.clock?.displayValue);
  const before = x => { const q = x.period?.number ?? 0; return q < period || (q === period && secs(x.clock?.displayValue) >= clock); };
  const comp = sum.header.competitions[0];
  comp.status = cut.halftime
    ? { type: { id: '23', name: 'STATUS_HALFTIME', state: 'in', completed: false, description: 'Halftime', detail: 'Halftime', shortDetail: 'Halftime' } }
    : { type: { id: '2', name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress', detail: `${p.clock?.displayValue} - ${ord(period)} Quarter`, shortDetail: `${p.clock?.displayValue} - ${ord(period)}` } };
  for (const c of comp.competitors){
    const score = c.homeAway === 'home' ? p.homeScore : p.awayScore;
    c.score = String(score); c.winner = false;
    const lines = (c.linescores || []).slice(0, period);
    const earlier = lines.slice(0, -1).reduce((s, l) => s + Number(l.displayValue ?? l.value ?? 0), 0);
    if (lines.length) lines[lines.length - 1] = { displayValue: String(score - earlier) };
    c.linescores = lines;
  }
  // Drives: everything before the cut drive, plus the cut drive trimmed to the cut play (shown as the current drive).
  const prev = sum.drives.previous, di = prev.indexOf(prev.find(d => d.id === cut.drive.id));
  const current = { ...prev[di], plays: prev[di].plays.filter(x => before(x) && playsOf(sum).findIndex(y => y.p.id === x.id) <= cut.idx),
    result: '', displayResult: '', shortDisplayResult: '', isScore: false };
  sum.drives = { previous: prev.slice(0, di), current };
  sum.scoringPlays = (sum.scoringPlays || []).filter(before);
  const wi = (sum.winprobability || []).findIndex(w => String(w.playId) === String(p.id));
  if (wi >= 0) sum.winprobability = sum.winprobability.slice(0, wi + 1);
  return sum;
}

/* The replayed board, or null if it couldn't be built (then every request goes to ESPN as normal). */
const demoBoard = () => board().catch(e => { console.warn('Demo unavailable, showing the real board:', e.message); return null; });

window.fetch = async (input, init) => {
  const url = String(input?.url ?? input);
  if (url.includes('/scoreboard') && !url.includes('week=')){
    const b = await demoBoard();
    return b ? json(structuredClone(b)) : realFetch(input, init);
  }
  const sm = /\/summary\?event=(\d+)/.exec(url);
  if (sm){ await demoBoard(); const cut = cuts.get(sm[1]); if (cut) return json(cutSummary(cut)); }
  const pm = /\/events\/(\d+)\/competitions\/\d+\/probabilities/.exec(url);
  if (pm){
    await demoBoard(); const cut = cuts.get(pm[1]);
    if (cut){
      const j = await (await realFetch(input, init)).json();
      const i = (j.items || []).findIndex(x => (x.play?.$ref || '').includes(`/plays/${cut.play.id}`));
      j.items = i >= 0 ? j.items.slice(0, i + 1) : j.items.slice(0, Math.round(j.items.length * cut.idx / playsOf(cut.sum).length));
      return json(j);
    }
  }
  return realFetch(input, init);
};

// Local only: a floating theme switcher for trying palettes. The file isn't published, so this never runs on the site.
if (['localhost', '127.0.0.1'].includes(location.hostname)) import('./theme-lab.js').catch(() => {});
