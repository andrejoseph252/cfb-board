/* Stream sync, one game at a time: show a game as it is on your (delayed) stream, never ahead of it.

   Why play times, not refresh times: ESPN's feeds run 20 to 100 seconds behind the field, and how far behind
   swings from play to play. Holding updates back by a fixed time after they arrive would still let a quick one
   through early. A stream, though, runs a steady delay behind the field. So a synced game is rebuilt from ESPN's
   per-play feed, where every play carries when it actually happened (its wallclock), and each play is shown at
   that time plus the stream's delay, or when ESPN delivers it if that's later. Never early, at any refresh rate.

   Setting the delay: tap Mark the instant you read your stream's game clock, then enter what it said. The play
   times say when the game clock showed that on the field; the gap to your tap is the stream's delay. If ESPN
   hasn't caught up to that moment yet, it waits for it (a few seconds) before confirming.

   The per-play feed is small (the newest page is a few KB), so a synced game checks it every 5 seconds. */
import { store } from './util.js';

const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';
const POLL = 5e3, KEEP_PLAYS = 60, MAX_DELAY = 600, PENDING_FOR = 150e3;
const ORD = ['1st', '2nd', '3rd', '4th'];

/* id -> { delay (s) | null, pending: { at, period, clock, since } | null, error, plays: [], probs: Map, loaded } */
const games = new Map();
for (const [id, s] of Object.entries(store.get('syncs', {}))) if (Date.now() - s.at < 8 * 3600e3 && s.delay != null) games.set(id, fresh({ delay: s.delay }));
persist();

function fresh(o = {}){ return { delay: null, pending: null, error: null, plays: [], probs: new Map(), loaded: false, polling: false, ...o }; }
function persist(){
  const out = {}; for (const [id, s] of games) if (s.delay != null) out[id] = { delay: s.delay, at: Date.now() };
  store.set('syncs', out);
}

export const syncOf = id => games.get(String(id)) || null;

/* ---------- the per-play feed ---------- */
const get = async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('ESPN ' + r.status); return r.json(); };
const teamId = ref => /teams\/(\d+)/.exec(ref?.$ref || '')?.[1] ?? null;
const snapOf = text => { const m = /^\((\d+):(\d\d)\)/.exec(text || ''); return m ? +m[1] * 60 + +m[2] : null; };
function toPlay(p){
  const w = Date.parse(p.wallclock); if (!Number.isFinite(w)) return null;
  return { id: String(p.id), seq: Number(p.sequenceNumber) || 0, w, q: p.period?.number ?? null, c: p.clock?.value ?? null, snap: snapOf(p.text),
    home: p.homeScore, away: p.awayScore, type: p.type?.text || '', score: !!p.scoringPlay,
    sit: p.end?.downDistanceText || null, poss: teamId(p.end?.team), ytez: p.end?.yardsToEndzone ?? null };
}
async function pull(id){
  const s = games.get(id); if (!s || s.polling) return;
  s.polling = true;
  try{
    const base = `${CORE}/events/${id}/competitions/${id}`;
    const head = await get(`${base}/plays?limit=1`), n = head.count || 0, last = Math.max(1, Math.ceil(n / 10));
    // The newest page, plus the two before it the first time (about the last 30 plays: plenty for a stream's delay).
    const pages = (s.loaded ? [last, last - 1] : [last, last - 1, last - 2]).filter(p => p >= 1);
    const lists = await Promise.all(pages.map(p => get(`${base}/plays?limit=10&page=${p}`).catch(() => ({ items: [] }))));
    const by = new Map(s.plays.map(p => [p.id, p]));
    for (const l of lists) for (const it of l.items || []){ const p = toPlay(it); if (p) by.set(p.id, p); }
    s.plays = [...by.values()].sort((a, b) => a.seq - b.seq || a.w - b.w).slice(-KEEP_PLAYS);
    // Win % for those plays (the probabilities feed is paged the same way).
    const ph = await get(`${base}/probabilities?limit=1`).catch(() => null);
    if (ph?.count){
      const pl = await get(`${base}/probabilities?limit=10&page=${Math.ceil(ph.count / 10)}`).catch(() => ({ items: [] }));
      for (const it of pl.items || []){ const pid = /\/plays\/(\d+)/.exec(it.play?.$ref || '')?.[1]; if (pid && it.homeWinPercentage != null) s.probs.set(pid, it.homeWinPercentage); }
    }
    const first = !s.loaded; s.loaded = true;
    if (s.error === 'feed') s.error = null;
    if (s.pending) settle(id);
    if (first) notify();
  }catch{ if (!s.loaded) s.error = 'feed'; }
  finally{ s.polling = false; }
}

/* ---------- the game clock between plays ---------- */
/* A play's clock is where it stood when the play ended; its text starts with the clock at the snap. Between two
   plays the clock either ran (snap clock below the last play's) or sat still until the snap. */
const snapClock = (a, b) => b.snap != null && b.snap <= a.c ? b.snap : a.c;
function clockAt(plays, i, t){
  const a = plays[i], b = plays[i + 1];
  if (a.c == null) return null;
  if (!b || b.q !== a.q || b.c == null) return a.c;
  const s = snapClock(a, b), snapAt = b.w - Math.max(0, s - b.c) * 1000;
  if (t < snapAt) return s < a.c - 1 ? Math.max(s, a.c - (t - a.w) / 1000) : a.c;
  return Math.max(b.c, s - (t - snapAt) / 1000);
}
/* When did the clock show `clock` in `period` on the field? { t } (while running), or why not: stopped, wait
   (ESPN hasn't got there yet), early (before the plays the board has). */
function whenClock(plays, period, clock){
  if (!plays.length) return { wait: true };
  const first = plays[0], last = plays[plays.length - 1];
  if (period < first.q || (period === first.q && clock > (first.snap ?? first.c ?? 0) + 1)) return { early: true };
  for (let k = 0; k < plays.length - 1; k++){
    const a = plays[k], b = plays[k + 1];
    if (a.q !== period || b.q !== period || a.c == null || b.c == null) continue;
    const s = snapClock(a, b), snapAt = b.w - Math.max(0, s - b.c) * 1000;
    if (s < a.c - 1 && clock <= a.c && clock >= s) return { t: a.w + (a.c - clock) * 1000 };   // running between plays
    if (clock <= s && clock >= b.c && s > b.c) return { t: snapAt + (s - clock) * 1000 };       // during the next play
    if (Math.abs(clock - a.c) < 1) return { stopped: true };                                    // sat at that time
  }
  if (period > last.q || (period === last.q && clock <= (last.c ?? 0))) return { wait: true };
  return { early: true };
}

/* ---------- setting the delay ---------- */
/* Mark: the person tapped Mark at `at` while their stream's clock read `period` and `clock` (seconds left). */
export function mark(id, period, clock, at){
  id = String(id);
  const s = games.get(id) || fresh(); games.set(id, s);
  Object.assign(s, { pending: { at, period, clock, since: Date.now() }, error: null, delay: s.delay });
  start(id); settle(id); notify();
}
function settle(id){
  const s = games.get(id), p = s?.pending; if (!p || !s.loaded) return;
  const r = whenClock(s.plays, p.period, p.clock);
  if (r.t != null){
    const d = Math.round((p.at - r.t) / 500) / 2;   // to the half second
    if (d < 0) return fail(s, 'ahead');
    if (d > MAX_DELAY) return fail(s, 'far');
    Object.assign(s, { delay: d, pending: null, error: null, justSynced: Date.now() }); persist(); notify();
  } else if (r.stopped) fail(s, 'stopped');
  else if (r.early) fail(s, 'early');
  else if (Date.now() - p.since > PENDING_FOR) fail(s, 'timeout');
}
function fail(s, why){ s.pending = null; s.error = why; notify(); }
export function nudge(id, secs){
  const s = games.get(String(id)); if (s?.delay == null) return;
  s.delay = Math.max(0, Math.min(MAX_DELAY, s.delay + secs)); persist(); notify();
}
export function stop(id){ games.delete(String(id)); persist(); notify(); }
export const ERRORS = {
  ahead: "That would put your stream ahead of ESPN's play-by-play, so there's nothing to hold back. Check the quarter and the time.",
  far: 'That would put your stream more than 10 minutes behind. Check the quarter and the time.',
  stopped: "The clock was stopped at that time (a timeout or a break), so it can't pin the moment. Mark again while it's running.",
  early: "That's further back than the plays the board has. Check the quarter, or mark again.",
  timeout: "ESPN's play-by-play never reached that clock. Check the quarter and the time you entered.",
  feed: "Can't reach ESPN's play-by-play right now. It'll keep trying."
};

/* ---------- the game as your stream has it ---------- */
const fmt = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function at(s, now = Date.now()){
  const R = now - s.delay * 1000; let i = -1;
  for (let k = s.plays.length - 1; k >= 0; k--) if (s.plays[k].w <= R){ i = k; break; }
  return { i, R };
}
function detailOf(p, clock){
  if (/Half/i.test(p.type) || (/End Period/i.test(p.type) && p.q === 2)) return 'Halftime';
  if (/End Period|End of/i.test(p.type) && clock === 0) return p.q <= 4 ? `End of ${ORD[p.q - 1]}` : 'End of OT';
  return `${fmt(clock)} - ${p.q <= 4 ? ORD[p.q - 1] : 'OT'}`;
}
/* The board's copy of a game, as of your stream. Not synced: the game as is. Still matching, or no plays that old
   yet: `syncing`, and the card hides the score. */
export function view(g){
  const s = games.get(String(g.id)); if (!s || (g.state !== 'in' && g.state !== 'post')) return g;
  if (s.delay == null || !s.loaded) return { ...g, syncing: true, syncDelay: s.delay };
  const { i, R } = at(s);
  if (i < 0) return { ...g, syncing: true, syncDelay: s.delay };
  const p = s.plays[i], clock = clockAt(s.plays, i, R) ?? p.c ?? 0;
  const done = g.state === 'post' && i === s.plays.length - 1;
  let wp = null; for (let k = i; k >= 0 && wp == null; k--) wp = s.probs.get(s.plays[k].id) ?? null;
  const side = p.poss && String(p.poss) === String(g.home.id) ? 'home' : p.poss && String(p.poss) === String(g.away.id) ? 'away' : null;
  return { ...g, state: done ? 'post' : 'in', completed: done, detail: done ? g.detail : detailOf(p, clock), period: p.q, clock: Math.floor(clock),
    home: { ...g.home, score: String(p.home), winner: done && g.home.winner }, away: { ...g.away, score: String(p.away), winner: done && g.away.winner },
    sit: done ? null : p.sit, liveWp: done ? g.liveWp : wp ?? null, poss: side ? g[side].id : null, redZone: p.ytez != null && p.ytez <= 20,
    syncDelay: s.delay, syncAt: R };
}
/* For the drawer: the real time your stream is at, so its play-by-play can be cut there. */
export const streamTime = id => { const s = games.get(String(id)); return s?.delay != null ? Date.now() - s.delay * 1000 : null; };
/* The clock your stream should be showing right now (the sync panel's readout, and the synced card's status). */
export function streamClock(id){
  const s = games.get(String(id)); if (s?.delay == null || !s.loaded) return null;
  const { i, R } = at(s); if (i < 0) return null;
  const p = s.plays[i]; return detailOf(p, clockAt(s.plays, i, R) ?? p.c ?? 0);
}

/* ---------- polling, and the half-second tick ---------- */
const timers = new Map();
function start(id){
  if (timers.has(id)) return;
  pull(id);
  timers.set(id, setInterval(() => {
    if (!games.has(id)){ clearInterval(timers.get(id)); timers.delete(id); return; }
    if (!document.hidden) pull(id);
  }, POLL));
}
for (const id of games.keys()) start(id);

let listener = () => {};
export const onChange = fn => { listener = fn; };
function notify(){ listener(); }
/* Every half second: a synced game whose stream-time play changed re-renders; otherwise only its ticking clock
   (any element marked data-sclk) updates in place, so the board isn't redrawn every second. */
const lastPlay = new Map();
setInterval(() => {
  let changed = false;
  for (const [id, s] of games){
    if (s.pending){ settle(id); continue; }
    if (s.delay == null || !s.loaded) continue;
    const { i } = at(s), key = i >= 0 ? s.plays[i].id : '-';
    if (lastPlay.get(id) !== key){ lastPlay.set(id, key); changed = true; }
    const txt = streamClock(id);
    if (txt) for (const el of document.querySelectorAll(`[data-sclk="${CSS.escape(id)}"]`)) if (el.textContent !== txt) el.textContent = txt;
  }
  if (changed) notify();
}, 500);
