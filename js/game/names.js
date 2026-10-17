/* Real names for Coach Andre's Bowl: each team's quarterback, running back and top four receivers, from the box
   score of its most recent game (ESPN's rosters are alphabetical, with no depth chart, so that's the honest way to
   know who actually plays). One schedule and one summary request per team, remembered on the device for 3 days. */
import * as api from '../api.js';
import { store } from '../util.js';

const KEEP = 3 * 864e5;
const cache = store.get('pbNames', {});
const pending = new Map();

/* { QB, RB, X, Z, SL, TE } as short names ("J. Sayin"), any of them possibly missing; null if none can be found. */
export function namesFor(id){
  id = String(id);
  const c = cache[id];
  if (c && Date.now() - c.at < KEEP) return Promise.resolve(c.n);
  if (pending.has(id)) return pending.get(id);
  const job = (async () => {
    const sched = await api.teamSchedule(id);
    const done = (sched.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed);
    const last = done[done.length - 1]; if (!last) return null;
    const sum = await api.summary(last.id);
    const side = (sum.boxscore?.players || []).find(t => String(t.team?.id) === id); if (!side) return null;
    const cat = k => side.statistics?.find(s => s.name === k)?.athletes || [];
    // "K. Russell": ESPN's short name, or made from the full one (initial + last name, keeping a Jr./III).
    const nm = a => { const x = a?.athlete; if (!x) return null; if (x.shortName) return x.shortName;
      const w = String(x.displayName || '').split(' '); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : w[0] || null; };
    const qb = cat('passing')[0], rb = cat('rushing').find(a => a.athlete?.id !== qb?.athlete?.id), rec = cat('receiving').slice(0, 4).map(nm);
    const n = { QB: nm(qb), RB: nm(rb), X: rec[0], Z: rec[1], SL: rec[2], TE: rec[3] };
    cache[id] = { at: Date.now(), n }; store.set('pbNames', cache);
    return n;
  })().catch(() => null).finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}
/* Fills team.names when they arrive (the game uses them where they're there, and plain labels until then). */
export function attachNames(...teams){
  for (const t of teams) if (t?.id && !t.names) namesFor(t.id).then(n => { if (n) t.names = n; });
}
