/* Play money on your picks. Each pick carries its own bet, chosen in the game drawer until kickoff:
   { type: 'ml' | 'ats', amt }. Picks from before bets existed count as $10 on the moneyline.

   Moneyline pays at the market price when you picked (a $10 bet at 40¢ returns $25: $15 profit), so favorites pay
   little and underdogs pay a lot. Spread pays standard −110 (risk $11 to win $10) against the line when you picked,
   or the closing line when none was saved. A push returns the stake. No bets are placed and no fees are taken. */
import { store } from './util.js';
import { closingSpread } from './ats.js';

export const STAKES = [5, 10, 25, 100];
export const DEFAULT_BET = { type: 'ml', amt: 10 };
/* A new pick starts with the last bet you set, so a $25 habit doesn't need re-entering every game. */
export const lastBet = () => ({ ...DEFAULT_BET, ...store.get('lastBet', {}) });
export const rememberBet = b => store.set('lastBet', { type: b.type, amt: b.amt });
export const betOf = pk => ({ ...DEFAULT_BET, ...pk.bet });
export const cleanAmt = n => { n = Math.round(Number(n)); return Number.isFinite(n) && n >= 1 ? Math.min(n, 10000) : null; };

const JUICE = 100 / 110;
export const mlWin = (p, s) => s * (1 - p) / p;
export const atsWin = s => s * JUICE;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
/* "$4.20", or "$10" / "$1,250" when there are no cents or they stop mattering. */
export const money = n => { const a = Math.abs(n); return (a >= 1000 || Math.abs(a - Math.round(a)) < .005 ? usd0 : usd).format(a); };
/* "+$4.20" / "−$10" / "$0" with a real minus sign. */
export const signed = n => (Math.abs(n) < .005 ? '' : n > 0 ? '+' : '−') + money(n);

/* The picked team's price: when you picked, else the last price before kickoff. */
export const priceOf = pk => { const p = pk.p ?? pk.pClose ?? null; return p > 0 && p < 1 ? p : null; };

/* The picked team's spread (negative: they were favored): the line when you picked, else the closing line. */
export function lineOf(pk, id){
  if (Number.isFinite(pk.line)) return pk.line;
  const s = closingSpread(id);
  return s == null ? null : pk.home ? s : -s;
}

/* Picked team's final margin, from the stored "AWY 21, HOM 17". */
function marginOf(pk){
  const m = /^(.*) (\d+), (.*) (\d+)$/.exec(pk.final || ''); if (!m) return null;
  const a = +m[2], h = +m[4];
  return pk.home ? h - a : a - h;
}

/* A pick's bet: { type, amt, state: 'open' | 'settled' | 'none', result: 'W' | 'L' | 'P', net, toWin, price | line, by }.
   'none' means no price (moneyline) or no line (spread) to grade it against. */
export function grade(pk, id){
  const { type, amt } = betOf(pk), base = { type, amt };
  if (type === 'ml'){
    const p = priceOf(pk);
    if (p == null) return { ...base, state: 'none' };
    const toWin = mlWin(p, amt);
    if (pk.result !== 'W' && pk.result !== 'L') return { ...base, state: 'open', toWin, price: p };
    return { ...base, state: 'settled', result: pk.result, net: pk.result === 'W' ? toWin : -amt, toWin, price: p };
  }
  const line = lineOf(pk, id);
  if (line == null) return { ...base, state: 'none' };
  const toWin = atsWin(amt);
  if (pk.result !== 'W' && pk.result !== 'L') return { ...base, state: 'open', toWin, line };
  const mg = marginOf(pk); if (mg == null) return { ...base, state: 'none' };
  const d = mg + line, result = d > 0 ? 'W' : d < 0 ? 'L' : 'P';
  return { ...base, state: 'settled', result, net: result === 'W' ? toWin : result === 'L' ? -amt : 0, toWin, line, by: Math.abs(d) };
}

/* How a finished pick did as a bet: 'W' | 'L' | 'P' (push), or null before it's final. A spread pick wins or loses
   against the spread, not on the score, so the pick's straight-up result (pk.result) only decides a moneyline pick.
   Everything that shows a pick's result (cards, the recap, My picks) goes through this. */
export function outcome(pk, id){
  if (pk?.result !== 'W' && pk?.result !== 'L') return null;
  const b = grade(pk, id);
  return b.state === 'settled' ? b.result : pk.result;
}

/* The pick's spread as text, e.g. "−7.5" / "+3" / "PK". */
export const fmtSpread = l => l === 0 ? 'PK' : (l < 0 ? '−' : '+') + String(Math.abs(l)).replace(/\.0$/, '');
/* "Moneyline at 63¢" (short: "ML 63¢") / "OSU −3.5" for a graded bet. */
export const betHow = (pk, b, short) => b.type === 'ml'
  ? (short ? 'ML' : 'Moneyline') + (b.price ? `${short ? '' : ' at'} ${Math.round(b.price * 100)}¢` : '')
  : `${pk.abbr || ''} ${b.line != null ? fmtSpread(b.line) : ''}`.trim();
