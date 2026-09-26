/* Render-time data hook for detail views: returns what's cached now, fetches in the background,
   and re-renders the drawer only when the payload actually changed. */
import { invalidate } from './state.js';

const entries = new Map();

export function useData(key, fetcher, parse){
  let e = entries.get(key);
  if (!e){ e = { raw: null, data: null, err: null, busy: false, retryAt: 0 }; entries.set(key, e); }
  if (!e.busy && Date.now() >= e.retryAt){
    e.busy = true;
    fetcher().then(raw => {
      e.busy = false;
      if (raw !== e.raw){ e.raw = raw; e.data = parse(raw); e.err = null; invalidate('detail'); }
    }, err => {
      e.busy = false; e.retryAt = Date.now() + 15e3;
      if (!e.data){ e.err = err.message || 'Request failed'; invalidate('detail'); }
    });
  }
  return e;
}
