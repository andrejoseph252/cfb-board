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

export function resolvePicks(games){
  let changed = false;
  for (const g of games){
    const pk = picks[g.id]; if (!pk) continue;
    if (g.state === 'pre'){ const m = primaryMarket(g); if (m){ pk.pClose = pk.side === 'home' ? m.pHome : 1 - m.pHome; changed = true; } }
    if (!pk.result && g.state === 'post' && g.completed){
      const opp = pk.side === 'home' ? 'away' : 'home';
      pk.result = g[pk.side].winner ? 'W' : g[opp].winner ? 'L' : 'P';
      pk.final = `${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}`; changed = true;
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
    if (!p.result && new Date(p.date) < Date.now() - 4 * 3600e3 && !(p.week == state.week && p.st == state.st)) need[p.st + '-' + p.week] = [p.st, p.week];
  let any = false;
  for (const [k, [st, wk]] of Object.entries(need)){
    if (backfilled.has(k)) continue; backfilled.add(k);
    try{ const j = await api.scoreboard(wk, st, 10 * 60e3); resolvePicks((j.events || []).map(parseEvent)); any = true; }catch{}
  }
  if (any) invalidate('main', 'header');
}
