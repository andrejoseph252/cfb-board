export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const pct = p => Math.round(p * 100);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const fmtTime = d => d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
export const fmtDay = d => new Date(d).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const norm = s => (s || '').toLowerCase().replace(/&/g,'and').replace(/\bstate\b/g,'st').replace(/\bst\./g,'st')
  .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

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
