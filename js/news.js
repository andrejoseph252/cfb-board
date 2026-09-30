/* ESPN's college football news feed, league-wide or for one team. The feed carries headlines, a thumbnail and a
   link out to espn.com, not the article text. */
import * as api from './api.js';
import { invalidate } from './state.js';
import { store } from './util.js';

const parse = j => (j.articles || []).map(a => ({
  headline: a.headline, desc: a.description, at: Date.parse(a.published) || 0, video: a.type === 'Media',
  img: a.images?.[0]?.url, href: a.links?.web?.href,
  teams: [...new Set((a.categories || []).filter(c => c.type === 'team').map(c => String(c.teamId ?? c.team?.id ?? '')).filter(Boolean))]
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
    }, e => {
      f.busy = false; f.retryAt = Date.now() + 60e3;
      if (!f.items){ f.err = e.message || 'Request failed'; invalidate(); }
    });
  }
  return f;
}

/* The header's news button shows a dot while the league feed has a story newer than the last one you saw. */
let seen = store.get('newsSeen', 0);
export const hasUnseen = () => (feeds.get('all')?.items?.[0]?.at ?? 0) > seen;
export function markSeen(){
  const top = feeds.get('all')?.items?.[0]?.at ?? 0;
  if (top > seen){ seen = top; store.set('newsSeen', top); invalidate('header'); }
}

/* Which feed the news drawer shows: everything or just my team. */
export let newsFilter = store.get('newsFilter', 'all');
export function setNewsFilter(f){ newsFilter = f; store.set('newsFilter', f); invalidate('detail'); }
