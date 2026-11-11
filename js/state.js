import { store } from './util.js';
import { quiet } from './api.js';

export const state = {
  tab: store.get('tab', 'week'), conf: store.get('conf', 'all'), tier: store.get('tier', 'p4'), q: '',
  week: null, st: null, season: null, cal: [],
  games: [], byId: {}, updated: null, loading: true, err: null,
  standings: null, fpi: null, rankings: null,
  rk: store.get('rk', 'cfp'), rkConf: 'all', bWeek: null,
  preds: new Map(),
  version: 0
};

/* Batch render requests into one frame; 'main' = tab view, 'detail' = drawer. */
const dirty = new Set();
let frame = 0, renderers = {};
export function onRender(r){ renderers = r; }
export function invalidate(...parts){
  state.version++;
  for (const p of parts.length ? parts : ['main', 'detail']) dirty.add(p);
  if (!frame) frame = requestAnimationFrame(() => {
    frame = 0; const todo = [...dirty]; dirty.clear();
    for (const p of todo) renderers[p]?.();
  });
}

/* For data that fills in behind the board (standings, FPI, line history, last week's recap...): pieces that land
   within a moment of each other are drawn together, one redraw instead of one each. Scores and anything the reader
   did go through invalidate() and are drawn on the next frame. */
const soon = new Set();
let soonTimer = 0, soonFirst = 0;
export function invalidateSoon(...parts){
  state.version++;
  for (const p of parts.length ? parts : ['main', 'detail']) soon.add(p);
  if (!soonTimer){ soonFirst = performance.now(); soonTimer = setTimeout(flushSoon, 90); }
}
/* Drawn once the downloads still under way have landed too (so the board fills in in one step, not five), but
   never more than a second and a quarter after the first piece arrived. */
function flushSoon(){
  if (!quiet() && performance.now() - soonFirst < 1250){ soonTimer = setTimeout(flushSoon, 50); return; }
  soonTimer = 0; const ps = [...soon]; soon.clear(); invalidate(...ps);
}

export const CONF = {1:'ACC',4:'Big 12',5:'Big Ten',8:'SEC',9:'Pac-12',151:'American',17:'Mountain West',37:'Sun Belt',15:'MAC',12:'Conference USA',18:'Independents'};
export const CONF_ORDER = [8,5,4,1,9,151,17,37,15,12,18];

/* AP/CFP rank for a team: FPI feed carries it for every team; fall back to this week's slate. */
export function apRank(id){
  const poll = state.rankings?.ranks.find(t => t.id === id)?.rank;
  if (poll) return poll;
  const r = state.fpi?.byTeam[id]?.ap;
  if (r) return r;
  for (const g of state.games){ if (g.home.id === id) return g.home.rank; if (g.away.id === id) return g.away.rank; }
  return null;
}
export const teamConf = id => state.standings?.byTeam[id]?.conf ?? null;
