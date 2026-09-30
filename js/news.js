/* ESPN's college football news feed, league-wide or for one team. The feed carries headlines, a thumbnail and a
   link out to espn.com, not the article text. */
import * as api from './api.js';
import { invalidate } from './state.js';
import { store } from './util.js';

/* Stories keep ESPN's own order in `rank` (mostly newest first, with editors moving the big ones up), which picks
   the lead story; everything else is shown newest first. */
const web = u => typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
const list = x => Array.isArray(x) ? x : [];
const parse = j => list(j?.articles).map((a, rank) => ({
  id: String(a.id ?? a.links?.web?.href), rank, headline: a.headline, desc: a.description === a.headline ? '' : a.description || '',
  at: Date.parse(a.published) || 0, video: a.type === 'Media', img: web(a.images?.[0]?.url), href: web(a.links?.web?.href),
  teams: [...new Set(list(a.categories).filter(c => c?.type === 'team').map(c => String(c.teamId ?? c.team?.id ?? '')).filter(Boolean))]
})).filter(a => a.headline && a.href).sort((a, b) => b.at - a.at);

/* Render-time hook: returns what's loaded so far and refreshes in the background (api.js caches for 10 minutes). */
const feeds = new Map();   // 'all' or a team id -> { items, err, raw, busy, retryAt }
export function news(team){
  const key = team ? String(team) : 'all';
  let f = feeds.get(key);
  if (!f){ f = { items: null, err: null, raw: null, busy: false, retryAt: 0 }; feeds.set(key, f); }
  if (!f.busy && Date.now() >= f.retryAt){
    f.busy = true;
    api.news(team).then(raw => {
      f.busy = false;
      if (raw !== f.raw){ f.raw = raw; f.items = parse(raw); f.err = null; invalidate(); }
    }).catch(e => {
      f.busy = false; f.retryAt = Date.now() + 60e3;
      if (!f.items){ f.err = e.message || 'Request failed'; invalidate(); }
    });
  }
  return f;
}

/* The header's news button shows a dot while the league feed has a story newer than the last one you saw.
   `lastVisit` is what "seen" was when the news drawer was first opened this session: the "Last visit" line. */
let seen = Number(store.get('newsSeen', 0)) || 0, lastVisit = null;
export const hasUnseen = () => (feeds.get('all')?.items?.[0]?.at ?? 0) > seen;
export function markSeen(){
  if (lastVisit == null) lastVisit = seen;
  const top = feeds.get('all')?.items?.[0]?.at ?? 0;
  if (top > seen){ seen = top; store.set('newsSeen', top); invalidate('header'); }
}
export const lastVisitAt = () => lastVisit;

/* Stories you've opened on ESPN (the newest 300), shown faded. */
const read = new Set(list(store.get('newsRead', [])).map(String));
export const isRead = id => read.has(String(id));
export function markRead(id){
  id = String(id); if (read.has(id)) return;
  read.add(id); store.set('newsRead', [...read].slice(-300)); invalidate();
}

/* Phones: tapping a story unfolds its summary (one at a time) instead of opening it. */
export let openStory = null;
export function toggleStory(id){ openStory = openStory === id ? null : id; invalidate(); }

/* Which feed the news drawer shows: everything or just my team. */
export let newsFilter = store.get('newsFilter', 'all');
export function setNewsFilter(f){ newsFilter = f; store.set('newsFilter', f); invalidate('detail'); }
