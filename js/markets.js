import { norm } from './util.js';

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2/markets';
const POLY = 'https://gamma-api.polymarket.com/events';

function kPrice(m){
  const n = x => (x == null || x === '') ? null : Number(x);
  const bid = n(m.yes_bid_dollars) ?? (m.yes_bid != null ? m.yes_bid / 100 : null);
  const ask = n(m.yes_ask_dollars) ?? (m.yes_ask != null ? m.yes_ask / 100 : null);
  const last = n(m.last_price_dollars) ?? (m.last_price != null ? m.last_price / 100 : null);
  // A quote wider than 15c is an empty order book, not a price (same rule as scripts/fetch_markets.py).
  if (ask > 0 && ask <= 1) return ask - (bid || 0) <= .15 ? ((bid || 0) + ask) / 2 : null;
  return last > 0 ? last : null;
}
async function fetchKalshi(){
  let cursor = '', all = [];
  for (let i = 0; i < 5; i++){
    const r = await fetch(`${KALSHI}?series_ticker=KXNCAAFGAME&status=open&limit=1000${cursor ? '&cursor=' + cursor : ''}`);
    if (!r.ok) throw new Error('Kalshi ' + r.status);
    const j = await r.json(); all.push(...(j.markets || [])); cursor = j.cursor; if (!cursor) break;
  }
  const by = {};
  for (const m of all)
    (by[m.event_ticker] ??= { source:'Kalshi', title:m.title, close: m.expected_expiration_time || m.close_time, teams:[],
      url:'https://kalshi.com/markets/kxncaafgame' }).teams.push({ name: m.yes_sub_title || m.subtitle || '', p: kPrice(m) });
  // Each team is its own market; when only one side has a real quote, the other is its complement.
  return Object.values(by).filter(ev => {
    const [a, b] = ev.teams; if (!b) return false;
    if (a.p == null && b.p != null) a.p = 1 - b.p; else if (b.p == null && a.p != null) b.p = 1 - a.p;
    return a.p != null;
  });
}
async function fetchPoly(){
  for (const tag of ['cfb','ncaaf','college-football']){
    try{
      const r = await fetch(`${POLY}?tag_slug=${tag}&closed=false&limit=500`); if (!r.ok) continue;
      const out = [];
      for (const ev of (await r.json()) || []) for (const m of ev.markets || []){
        let oc = m.outcomes, pr = m.outcomePrices;
        try{ oc = typeof oc === 'string' ? JSON.parse(oc) : oc; pr = typeof pr === 'string' ? JSON.parse(pr) : pr; }catch{ continue; }
        const q = m.question || ev.title || '';
        if (!oc || oc.length !== 2 || /^(yes|no)$/i.test(oc[0]) || /spread|o\/u|total|over|under|\(/i.test(q)) continue;
        out.push({ source:'Polymarket', title:q, close: m.gameStartTime || m.endDate || ev.endDate,
          teams: oc.map((nm, i) => ({ name:nm, p:Number(pr[i]) })), url:'https://polymarket.com/event/' + ev.slug });
      }
      if (out.length) return out;
    }catch{}
  }
  return [];
}

let data = null, loadedAt = 0;
const matchCache = new Map();

export async function loadMarkets(force){
  if (!force && Date.now() - loadedAt < 5 * 60e3) return false;
  matchCache.clear();
  try{
    const r = await fetch('data/markets.json', {cache:'no-store'});
    if (r.ok){
      const j = await r.json();
      if ((j.kalshi?.length || 0) + (j.polymarket?.length || 0) > 0){
        data = j; loadedAt = Date.now();
        return true;
      }
    }
  }catch{}
  const out = { kalshi:[], polymarket:[] };
  await Promise.all([
    fetchKalshi().then(x => out.kalshi = x).catch(() => {}),
    fetchPoly().then(x => out.polymarket = x).catch(() => {})
  ]);
  data = out; loadedAt = Date.now();
  return true;
}

export function nameMatch(mName, t){
  const n = norm(mName); if (!n) return false;
  return [t.name, t.short, t.full, t.abbr].filter(Boolean).map(norm)
    .some(k => k === n || (k.length > 3 && n.startsWith(k + ' ')) || (n.length > 3 && k.startsWith(n + ' ')));
}

/* All prices found for a game, prediction markets first, sportsbook no-vig last. Keyed on game id + book so refreshed lines re-match. */
export function marketsFor(g){
  const key = g.id + ':' + (g.book?.pHome ?? '');
  if (matchCache.has(key)) return matchCache.get(key);
  const found = [];
  for (const src of [data?.kalshi || [], data?.polymarket || []]){
    for (const m of src){
      if (!m.teams || m.teams.length < 2) continue;
      if (m.close && Math.abs(new Date(m.close) - new Date(g.date)) > 15 * 864e5) continue;
      const h = m.teams.find(t => nameMatch(t.name, g.home)), a = m.teams.find(t => nameMatch(t.name, g.away));
      if (h && a && h !== a && h.p + a.p > 0){ found.push({ source: m.source, pHome: h.p / (h.p + a.p), url: m.url }); break; }
    }
  }
  if (!found.length && g.book?.pHome != null) found.push({ source:'Book', pHome: g.book.pHome });
  matchCache.set(key, found);
  return found;
}
export const primaryMarket = g => marketsFor(g)[0] || null;
export const realMarket = g => { const ms = marketsFor(g); return ms.find(x => x.source !== 'Book') || ms[0] || null; };
export const sourceLabel = s => s === 'Book' ? 'Sportsbook (no-vig)' : s;
