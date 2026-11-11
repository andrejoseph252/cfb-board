export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const pct = p => Math.round(p * 100);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/* Date formatters are built once: making one costs far more than using it, and every card on every redraw asks. */
const TIME = new Intl.DateTimeFormat([], {hour:'numeric', minute:'2-digit'});
const DAY = new Intl.DateTimeFormat(undefined, {weekday:'short', month:'short', day:'numeric'});
const WEEKDAY = new Intl.DateTimeFormat(undefined, {weekday:'short'});
export const fmtTime = d => TIME.format(d);
export const fmtDay = d => DAY.format(new Date(d));
export const fmtWeekday = d => WEEKDAY.format(new Date(d));
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* Team names in a plain form for matching. The same few hundred names are asked for tens of thousands of times
   (every game against every market), so each is worked out once. */
const normed = new Map();
export function norm(s){
  s ||= '';
  let n = normed.get(s);
  if (n === undefined){
    n = s.toLowerCase().replace(/&/g,'and').replace(/\bstate\b/g,'st').replace(/\bst\./g,'st').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    if (normed.size < 5000) normed.set(s, n);
  }
  return n;
}

export function parseRecord(s){
  const m = /^(\d+)-(\d+)(?:-(\d+))?/.exec(s || '');
  return m ? { w:+m[1], l:+m[2], t:+(m[3] || 0) } : null;
}
export const winPct = r => r && (r.w + r.l + r.t) ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0;

export const store = {
  get(k, d){ try{ const v = localStorage.getItem('cfbboard.' + k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem('cfbboard.' + k, JSON.stringify(v)); }catch{} }
};

/* run async fn over items with at most n in flight */
export async function pool(items, n, fn){
  const it = items[Symbol.iterator]();
  await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => {
    for (let x = it.next(); !x.done; x = it.next()) await fn(x.value).catch(() => {});
  }));
}

/* College football's slate is set in Eastern time (noon kickoffs, prime time, Friday night), so game days and
   kickoff windows are grouped by ET wherever you're watching; each card still shows the kickoff in your own time. */
const ET_ZONE = 'America/New_York';
const etClock = new Intl.DateTimeFormat('en-US', { timeZone: ET_ZONE, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
const ET_DAY = new Intl.DateTimeFormat(undefined, { timeZone: ET_ZONE, weekday: 'long', month: 'short', day: 'numeric' });
export const etDay = d => ET_DAY.format(new Date(d));
export function etMinutes(d){
  const p = Object.fromEntries(etClock.formatToParts(new Date(d)).map(x => [x.type, x.value]));
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}
/* True when this browser keeps Eastern time anyway (then there's no need to say "ET"). */
export const inET = () => Intl.DateTimeFormat().resolvedOptions().timeZone === ET_ZONE ||
  new Date().toLocaleString('en-US', { timeZone: ET_ZONE }) === new Date().toLocaleString('en-US');
