import { esc } from '../util.js';
import { state } from '../state.js';
import * as api from '../api.js';
import { parseSummary, parseProbabilities } from '../models.js';
import { loadPredictions } from '../data.js';
import { realizedExcitement } from '../excitement.js';
import { useData } from '../resource.js';
import { teamLink, logo, panel } from './components.js';
import { chartHTML } from './wpchart.js';
import { banner, theLine, lineChart, hype, tape, recentForm } from './preview.js';
import { threadsFor, searchUrl } from '../threads.js';
import { lineFor } from '../lines.js';

const liveIds = new Set();
export const isLive = id => liveIds.has(id) || state.byId[id]?.state === 'in';
const useDataFor = id => useData('game:' + id, () => api.summary(id, isLive(id)), parseSummary);

export function viewGame(id){
  const e = useDataFor(id);
  if (e.err && !e.data) return `<div class="err"><b>Couldn't load this game.</b> ${esc(e.err)}</div>`;
  if (!e.data) return '<div class="skeleton"></div><div class="skeleton tall"></div>';
  const s = e.data;
  // Prefer the scoreboard's copy (has odds + conference flags) merged over the summary's.
  const board = state.byId[id];
  const g = board ? { ...s.game, ...board, home: { ...s.game.home, ...board.home, lines: s.game.home.lines }, away: { ...s.game.away, ...board.away, lines: s.game.away.lines } } : s.game;
  if (!g.book && s.line) g.book = { pHome: null, details: s.line.details, ou: s.line.ou };
  g.state === 'in' ? liveIds.add(id) : liveIds.delete(id);

  let h = banner(g, s) + threadLinks(g);
  if (g.state === 'pre'){
    loadPredictions([g]);
    h += theLine(g, s) + hype(g) + tape(g) + recentForm(g);
  } else {
    // Finished and live games only show the pregame line when it actually moved.
    const pregame = Math.abs(lineFor(g)?.move ?? 0) >= .03 ? lineChart(g) : '';
    h += lineScore(g) + wpPanel(g, s) + scoring(g, s) + (pregame ? panel('How the line moved', pregame) : '') + teamStats(g, s) + drives(g, s) + players(g, s);
  }
  return h;
}

const REDDIT = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#FF4500"/><path fill="#fff" d="M16.7 10a1.5 1.5 0 0 0-2.5-1 7.2 7.2 0 0 0-3.8-1.2l.7-3 2.1.5a1 1 0 1 0 .1-.6l-2.4-.5a.3.3 0 0 0-.4.2l-.8 3.4a7.2 7.2 0 0 0-3.9 1.2 1.5 1.5 0 1 0-1.6 2.4 2.8 2.8 0 0 0 0 .5c0 2.2 2.6 4 5.8 4s5.8-1.8 5.8-4v-.5a1.5 1.5 0 0 0 .9-1.4zM6.7 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.6 2.7a3.7 3.7 0 0 1-2.3.7 3.7 3.7 0 0 1-2.3-.7.3.3 0 0 1 .4-.4 3.1 3.1 0 0 0 1.9.5 3.1 3.1 0 0 0 1.9-.5.3.3 0 1 1 .4.4zm-.1-1.7a1 1 0 1 1 1-1 1 1 0 0 1-1 1z"/></svg>';

/* r/CFB threads: game thread from about an hour before kickoff, postgame thread once it's final. */
function threadLinks(g){
  const list = useData('threads', api.threads, j => j.threads || []).data;
  const { game, post } = threadsFor(g, list);
  const soon = g.state === 'pre' && new Date(g.date) - Date.now() < 2 * 3600e3;
  const btn = (t, label) => `<a class="rbtn" href="${esc(t.url)}" target="_blank" rel="noopener">${REDDIT}<span>${label}</span></a>`;
  const find = (flair, label) => `<a class="rbtn ghost" href="${esc(searchUrl(g, flair))}" target="_blank" rel="noopener">${REDDIT}<span>${label}</span></a>`;
  // Matched threads link straight in; anything we couldn't match falls back to an r/CFB search for that matchup.
  const links = [
    game ? btn(game, 'Game thread') : (g.state !== 'pre' || soon) ? find('Game Thread', 'Find game thread') : '',
    post ? btn(post, 'Postgame thread') : g.state === 'post' ? find('Postgame Thread', 'Find postgame thread') : ''
  ].filter(Boolean);
  return links.length ? `<div class="rlinks">${links.join('')}</div>` : '';
}

const statTable = (g, rows) => `<table class="tbl compact vs"><thead><tr><th class="num">${esc(g.away.abbr)}</th><th></th><th class="num">${esc(g.home.abbr)}</th></tr></thead>
  <tbody>${rows.map(([k, a, h]) => `<tr><td class="num">${esc(a)}</td><td class="lbl">${esc(k)}</td><td class="num">${esc(h)}</td></tr>`).join('')}</tbody></table>`;

function lineScore(g){
  const n = Math.max(4, g.away.lines?.length || 0, g.home.lines?.length || 0);
  if (!g.away.lines?.length) return '';
  const q = i => i < 4 ? i + 1 : i === 4 ? 'OT' : `${i - 3}OT`;
  const row = t => `<tr><td>${teamLink({ ...t, rank: null }, { label: t.abbr })}</td>${Array.from({length: n}, (_, i) => `<td class="num">${esc(t.lines[i] ?? '')}</td>`).join('')}<td class="num strong">${esc(t.score)}</td></tr>`;
  return panel('', `<div class="tablewrap"><table class="tbl compact line"><thead><tr><th></th>${Array.from({length: n}, (_, i) => `<th class="num">${q(i)}</th>`).join('')}<th class="num">T</th></tr></thead>
    <tbody>${row(g.away)}${row(g.home)}</tbody></table></div>`);
}

function wpPanel(g, s){
  // Full per-play feed (win + cover + over/under); fall back to the summary's win-only series while it loads or if it fails.
  const pr = useData('prob:' + g.id, () => api.probabilities(g.id, isLive(g.id)), parseProbabilities).data;
  const pts = pr?.length >= 5 ? pr : s.wp;
  if (pts.length < 5) return '';
  const plays = new Map();
  for (const d of s.drives) for (const p of d.plays) if (p.id) plays.set(String(p.id), p);
  const chart = chartHTML(g, pts, plays, s.line);
  if (!chart) return '';
  const x = realizedExcitement(pts), live = g.state === 'in';
  return panel('Win probability', chart + `<div class="facts"><span>${live ? 'Excitement so far' : 'Excitement index'} <b>${x.index.toFixed(1)}</b> · ${x.label}</span>
    <span>Favorite flipped <b>${x.flips}</b> time${x.flips === 1 ? '' : 's'}</span></div>`);
}

function scoring(g, s){
  if (!s.scoring.length) return '';
  let q = 0;
  const items = s.scoring.map(p => {
    const hdr = p.q !== q ? `<li class="qhdr">${p.q <= 4 ? 'Quarter ' + p.q : 'Overtime'}</li>` : ''; q = p.q;
    const t = g[p.side];
    return hdr + `<li class="play">${logo(t?.logo, 'logo sm')}<span class="ptype">${esc(p.type || '')}</span><span class="ptext">${esc(p.text)}<span class="muted small"> ${esc(p.clock || '')}</span></span>
      <span class="pscore">${esc(p.away)}-${esc(p.home)}</span></li>`;
  }).join('');
  return panel('Scoring plays', `<ol class="plays">${items}</ol>`);
}

function teamStats(g, s){
  const a = s.teamStats.away || [], h = s.teamStats.home || [];
  if (!a.length && !h.length) return '';
  const hv = Object.fromEntries(h.map(x => [x.name, x.displayValue]));
  return panel('Team stats', statTable(g, a.map(x => [x.label, x.displayValue, hv[x.name] ?? '–'])));
}

function drives(g, s){
  if (!s.drives.length) return '';
  const items = s.drives.map((d, i) => [d, i]).reverse().map(([d, i]) => {
    const t = g[d.side];
    return `<li><details data-k="drive-${i}"><summary>${logo(t?.logo, 'logo sm')}<span class="dres ${d.isScore ? 'score' : ''}">${esc(d.result || '')}</span>
      <span class="ddesc">${esc(d.desc || '')}</span><span class="muted small">Q${esc(d.q ?? '')} ${esc(d.clock || '')}${d.start ? ' · from ' + esc(d.start) : ''}</span></summary>
      <ol class="dplays">${d.plays.map(p => `<li><span class="muted small">${esc(p.clock || '')}</span> ${esc(p.text)}</li>`).join('')}</ol></details></li>`;
  }).join('');
  return panel(`Drives (${s.drives.length})`, `<ol class="drives">${items}</ol><p class="note">Most recent first. Tap a drive to see every play.</p>`);
}

function players(g, s){
  if (!s.players.away && !s.players.home) return '';
  const cats = (s.players.away || s.players.home).map(c => c.name);
  const body = cats.map(name => {
    const tables = ['away', 'home'].map(side => {
      const c = s.players[side]?.find(x => x.name === name); if (!c || !c.rows.length) return '';
      return `<div class="tablewrap"><table class="tbl compact"><thead><tr><th>${esc(g[side].abbr)}</th>${c.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead>
        <tbody>${c.rows.map(r => `<tr><td>${esc(r.who)}</td>${r.stats.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }).join('');
    const title = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
    return `<details class="pcat" data-k="p-${esc(name)}"><summary>${esc(title)}</summary>${tables}</details>`;
  }).join('');
  return panel('Player stats', body);
}
