import { store } from './util.js';
import { state, invalidate } from './state.js';
import { primaryMarket } from './markets.js';
import { parseEvent } from './models.js';
import * as api from './api.js';

export const pins = new Set(store.get('pins', []));
export const picks = store.get('picks', {});

export function togglePin(id){
  pins.has(id) ? pins.delete(id) : pins.add(id);
  store.set('pins', [...pins]); invalidate();
}

export function weekLabel(st, wk){
  for (const s of state.cal) if (String(s.value) === String(st))
    for (const e of s.entries || []) if (String(e.value) === String(wk)) return e.label;
  return st == 3 ? 'Postseason' : `Week ${wk}`;
}

/* ESPN can flip a game to final a moment before it sets the winner flag, so fall back to the score,
   and treat a game with neither as not settled yet (college football has no ties). */
export function winnerSide(g){
  if (g.home.winner) return 'home';
  if (g.away.winner) return 'away';
  const h = Number(g.home.score), a = Number(g.away.score);
  return Number.isFinite(h) && Number.isFinite(a) && h !== a ? (h > a ? 'home' : 'away') : null;
}

/* Grades every time a finished game is seen, so a result recorded from incomplete data corrects itself. */
export function resolvePicks(games){
  let changed = false;
  for (const g of games){
    const pk = picks[g.id]; if (!pk) continue;
    if (g.state === 'pre'){ const m = primaryMarket(g); if (m){ pk.pClose = pk.side === 'home' ? m.pHome : 1 - m.pHome; changed = true; } }
    if (g.state === 'post' && g.completed){
      const w = winnerSide(g);
      const result = w ? (w === pk.side ? 'W' : 'L') : null;
      const final = `${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}`;
      if (pk.result !== result || (result && pk.final !== final)){ pk.result = result; pk.final = result ? final : pk.final; changed = true; }
    }
  }
  if (changed) store.set('picks', picks);
}

export function setPick(g, side){
  if (g.state !== 'pre') return;
  if (picks[g.id]?.side === side) delete picks[g.id];
  else {
    const m = primaryMarket(g), t = g[side], o = g[side === 'home' ? 'away' : 'home'];
    picks[g.id] = { side, team: t.name, teamId: t.id, abbr: t.abbr, opp: o.name, oppId: o.id, home: side === 'home',
      p: m ? (side === 'home' ? m.pHome : 1 - m.pHome) : null, src: m?.source, date: g.date,
      week: state.week, st: state.st, wk: weekLabel(state.st, state.week), result: null };
  }
  store.set('picks', picks); invalidate();
}

export function removePick(id){ delete picks[id]; store.set('picks', picks); invalidate(); }

const backfilled = new Set();
export async function backfillPicks(){
  const need = {};
  for (const p of Object.values(picks))
    // 'P' only ever came from grading a game before ESPN settled it; re-check those too.
    if ((!p.result || p.result === 'P') && new Date(p.date) < Date.now() - 4 * 3600e3 && !(p.week == state.week && p.st == state.st)) need[p.st + '-' + p.week] = [p.st, p.week];
  let any = false;
  for (const [k, [st, wk]] of Object.entries(need)){
    if (backfilled.has(k)) continue; backfilled.add(k);
    try{ const j = await api.scoreboard(wk, st, 10 * 60e3); resolvePicks((j.events || []).map(parseEvent)); any = true; }catch{}
  }
  if (any) invalidate('main', 'header');
}
