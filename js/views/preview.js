/* Game drawer pieces with some broadcast flavor: the matchup banner, the line and its movement,
   a tale of the tape comparing the two teams and each team's recent form. */
import { esc, pct, fmtTime } from '../util.js';
import { state, CONF, apRank } from '../state.js';
import * as api from '../api.js';
import { parseSchedule } from '../models.js';
import { marketsFor, realMarket, sourceLabel } from '../markets.js';
import { lineFor } from '../lines.js';
import { upset, upsetWhy, BOLT } from '../upset.js';
import { useData } from '../resource.js';
import { weekLabel } from '../picks.js';
import { logo, panel, barColors, sideColors, ballClass, ballIcon, stepPath, teamHref, gameHref } from './components.js';

/* Black or white text, whichever reads better on a team color. */
export function inkOn(hex){
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  const lin = c => { c /= 255; return c <= .04 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  const L = .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
  return L > .4 ? '#111' : '#fff';
}
const day = t => new Date(t).toLocaleDateString(undefined, {weekday:'short'});
const other = s => s === 'home' ? 'away' : 'home';

/* ---------- matchup banner ---------- */
export function countdown(g){
  const ms = new Date(g.date) - Date.now();
  if (g.tbd) return 'Kickoff time TBD';
  if (ms <= 0) return 'Kickoff';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 3600e3) % 24, m = Math.floor(ms / 60e3) % 60;
  return 'Kickoff in ' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`);
}

const PIN = '<svg class="mh-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5s4.5-4.1 4.5-7.6a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.6 4.5 7.6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="6.9" r="1.6" fill="currentColor"/></svg>';
const SKY = '<svg class="mh-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 12.5h7a2.75 2.75 0 0 0 .3-5.48A4 4 0 0 0 4.1 8.1a2.2 2.2 0 0 0 .4 4.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
export function banner(g, s){
  const [ca, ch] = barColors(g), done = g.state === 'post';
  const side = k => {
    const t = g[k], ap = t.rank || apRank(t.id), conf = state.standings?.byTeam[t.id]?.confRec;
    const lost = done && !t.winner && g[other(k)].winner;
    const rec = [t.record, conf && g.confGame ? `${conf.w}-${conf.l} ${CONF[t.conf] || 'conf'}` : null].filter(Boolean).join(' · ');
    const disc = `<span class="mh-disc">${logo(t.logo, 'mh-logo on-light')}</span>`;
    return `<div class="mh-side ${k}${lost ? ' lost' : ''}">
      ${t.id ? `<a href="${teamHref(t.id)}" tabindex="-1" aria-hidden="true">${disc}</a>` : disc}
      <div class="mh-name${ballClass(g, t)}">${ap ? `<span class="mh-rank">#${ap}</span>` : ''}${t.id ? `<a class="tlink" href="${teamHref(t.id)}">${esc(t.name)}</a>` : esc(t.name)}${ballIcon(g, t)}</div>
      <div class="mh-rec">${esc(rec)}</div></div>`;
  };
  // Before kickoff the middle holds the kickoff itself (when it's set), on frosted glass like the score.
  const d = new Date(g.date), [, hm, ampm] = /^(.*?)\s*([AP]M)?$/i.exec(fmtTime(d)) || [, fmtTime(d), ''];
  const mid = g.state === 'pre' ? (g.tbd ? `<div class="mh-vs">${g.neutral ? 'vs' : 'at'}</div>`
      : `<div class="mh-kick"><span class="mh-at">${g.neutral ? 'vs' : 'at'}</span><b>${esc(hm)}${ampm ? `<small>${esc(ampm)}</small>` : ''}</b><span class="mh-day">${esc(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</span></div>`)
    : `<div class="mh-score"><span class="${done && g.home.winner ? 'dim' : ''}">${esc(g.away.score)}</span><i></i><span class="${done && g.away.winner ? 'dim' : ''}">${esc(g.home.score)}</span></div>
       <div class="mh-status${g.state === 'in' ? ' live' : ''}"${g.state === 'in' && g.syncDelay != null && !g.syncing ? ` data-sclk="${esc(g.id)}"` : ''}>${esc(g.detail || '')}</div>`;
  const up = upset(g);
  const strip = [
    up ? `<b class="mh-upset${up.big ? ' big' : ''}">${BOLT}${up.big ? 'Big upset' : 'Upset'}</b><span>${esc(upsetWhy(g, up))}</span>` : null,
    g.state === 'pre' ? `<b>${esc(countdown(g))}</b>` : null,
    g.state === 'pre' && g.tbd ? esc(d.toLocaleDateString(undefined, {weekday:'long', month:'short', day:'numeric'})) : g.state === 'in' && g.sit ? `<b>${esc(g.sit)}</b>` : null,
    g.tv ? `<span class="mh-tv">${esc(g.tv)}</span>` : null,
    // The place and its weather stay together, so a narrow screen wraps between items, never inside one.
    s.venue || (g.state === 'pre' && s.weather) ? `<span class="mh-where">${s.venue ? `<span>${PIN}${esc(s.venue + (s.city ? ', ' + s.city : ''))}</span>` : ''}${g.state === 'pre' && s.weather ? `<span class="mh-wx">${SKY}${esc(s.weather)}</span>` : ''}</span>` : null
  ].filter(Boolean);
  // The drawer bar's context line: the week, and what kind of game.
  const kind = g.confGame && CONF[g.home.conf] ? `${CONF[g.home.conf]} game` : g.neutral ? 'Neutral site' : 'Non-conference';
  const eyebrow = [g.week && g.st ? weekLabel(g.st, g.week) : null, kind].filter(Boolean).join(' · ');
  return `<header class="mh" data-title="${esc(`${g.away.name} ${g.neutral ? 'vs' : 'at'} ${g.home.name}`)}" data-eyebrow="${esc(eyebrow)}"
      style="--away:${esc(ca)};--home:${esc(ch)};--away-ink:${inkOn(ca)};--home-ink:${inkOn(ch)}">
    <div class="mh-field" aria-hidden="true"></div>${side('away')}<div class="mh-mid">${mid}</div>${side('home')}</header>
    <div class="mh-strip">${strip.map(x => `<span>${x}</span>`).join('')}</div>`;
}

/* ---------- the line ---------- */
/* Poll-implied win prob: logistic on AP rank gap + home field (unranked treated as #35). */
function pollP(g){
  if (!g.home.rank && !g.away.rank) return null;
  const x = 0.085 * ((g.away.rank ?? 35) - (g.home.rank ?? 35)) + (g.neutral ? 0 : 0.35);
  return 1 / (1 + Math.exp(-x));
}

const SRC_DOT = { Market: 'mkt', FPI: 'fpi', Poll: 'poll' };

function tugOfWar(g, p, label){
  const [ca, ch] = barColors(g), pa = pct(1 - p), ph = 100 - pa;
  return `<div class="tow" role="img" aria-label="${esc(label)}: ${esc(g.away.name)} ${pa}%, ${esc(g.home.name)} ${ph}%" style="--ca:${esc(ca)};--ch:${esc(ch)};--ia:${inkOn(ca)};--ih:${inkOn(ch)}">
    <span class="a${pa >= ph ? ' lead' : ''}" style="flex-basis:${pa}%"><b>${pa}</b><small>${esc(g.away.abbr)}</small></span>
    <span class="h${ph > pa ? ' lead' : ''}" style="flex-basis:${ph}%"><small>${esc(g.home.abbr)}</small><b>${ph}</b></span></div>`;
}

/* Where each forecast lands on one away-to-home axis. */
function forecastStrip(g, rows){
  if (rows.length < 2) return '';
  return `<div class="fstrip"><div class="fstrip-axis"><span>${esc(g.away.abbr)}</span><span>50</span><span>${esc(g.home.abbr)}</span></div>
    <div class="fstrip-track">${rows.map(([k, l, p]) => `<i class="dot-${SRC_DOT[k]}" style="left:${(p * 100).toFixed(1)}%" title="${esc(l)}: ${esc(g.home.abbr)} ${pct(p)}%"></i>`).join('')}</div>
    <div class="fstrip-key">${rows.map(([k, l, p]) => { const fav = p >= .5 ? g.home : g.away; return `<span><i class="dot-${SRC_DOT[k]}"></i>${esc(l)} <b>${esc(fav.abbr)} ${pct(Math.max(p, 1 - p))}%</b></span>`; }).join('')}</div></div>`;
}

/* Home win chance from the market's open to kickoff (or now), on the same home-on-top layout as the in-game chart. */
export function lineChart(g){
  const L = lineFor(g); if (!L) return '';
  const [ca, ch] = barColors(g), W = 600, H = 150;
  const t0 = L.pts[0][0], t1 = L.pts[L.pts.length - 1][0], x = t => (t - t0) / (t1 - t0 || 1) * 100;
  const ticks = [];
  for (let d = new Date(t0); ; ){ d.setHours(24, 0, 0, 0); if (+d >= t1) break; ticks.push(+d); }
  const every = Math.ceil(ticks.length / 7);
  const side = L.move >= 0 ? 'home' : 'away', n = Math.round(Math.abs(L.move) * 100), t = g[side];
  const flipped = (L.open - .5) * (L.now - .5) < 0;
  const fav = L.now >= .5 ? 'home' : 'away';
  const head = n < 1 ? `<b>Holding steady</b> at ${esc(g[fav].abbr)} ${pct(Math.max(L.now, 1 - L.now))}% since ${day(L.since)}`
    : `<b>${esc(t.abbr)} ▲${n}</b> since ${day(L.since)}: ${pct(side === 'home' ? L.open : 1 - L.open)}% → ${pct(side === 'home' ? L.now : 1 - L.now)}%${flipped ? `, now the favorite` : ''}`;
  const endLabel = L.closed ? 'Kickoff' : 'Now';
  return `<div class="lc">
    <div class="lc-head">${head}</div>
    <div class="lc-plot">
      <span class="wplab top" style="color:${esc(ch)}">${esc(g.home.abbr)}</span><span class="wplab bot" style="color:${esc(ca)}">${esc(g.away.abbr)}</span>
      <svg class="wp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <rect width="${W}" height="${H / 2}" fill="${esc(ch)}" opacity=".13"/><rect y="${H / 2}" width="${W}" height="${H / 2}" fill="${esc(ca)}" opacity=".13"/>
        ${ticks.map(tk => `<line x1="${x(tk) * W / 100}" x2="${x(tk) * W / 100}" y1="0" y2="${H}" stroke="var(--line)" vector-effect="non-scaling-stroke"/>`).join('')}
        <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--muted)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
        <path d="${stepPath(L.pts, W, H)}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <span class="lc-dot" style="left:0;top:${(1 - L.open) * 100}%"></span><span class="lc-dot end" style="left:100%;top:${(1 - L.now) * 100}%"></span>
    </div>
    <div class="wpc-ticks">${ticks.filter((_, i) => i % every === 0).map(tk => `<span style="left:${x(tk).toFixed(2)}%">${day(tk)}</span>`).join('')}<span class="end">${endLabel}</span></div>
    <p class="note">${esc(L.src)} price, one point each time it moved a full percent. Opened ${esc(g.home.abbr)} ${pct(L.open)}%.</p></div>`;
}

export function theLine(g, s){
  const m = realMarket(g), fp = state.preds.get(g.id)?.pHome ?? s.pred?.pHome ?? null, pp = pollP(g);
  const rows = [m && ['Market', m.source === 'Book' ? 'Sportsbook' : m.source, m.pHome], fp != null && ['FPI', 'ESPN FPI', fp], pp != null && ['Poll', 'Poll', pp]].filter(Boolean);
  const main = rows[0];
  const facts = [g.book?.details && `Spread <b>${esc(g.book.details)}</b>`, g.book?.ou && `Total <b>${esc(g.book.ou)}</b>`,
    m && `Source <b>${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(sourceLabel(m.source))}</a>` : esc(sourceLabel(m.source))}</b>`,
    ...marketsFor(g).slice(1).map(x => `${esc(x.source)} <b>${pct(x.pHome)}%</b> ${esc(g.home.abbr)}`)].filter(Boolean);
  if (!main) return panel('The line', '<p class="muted">No prices or projections yet. Markets usually open early in the week.</p>');
  return panel('The line', tugOfWar(g, main[2], main[1]) + forecastStrip(g, rows) + lineChart(g) +
    (facts.length ? `<div class="facts">${facts.map(x => `<span>${x}</span>`).join('')}</div>` : ''));
}

/* ---------- tale of the tape ---------- */
/* National percentile (0-1, 1 = best) of a value within all FBS teams. */
function pctile(v, all, lowerBetter){
  if (v == null || !all.length) return null;
  const worse = all.filter(x => lowerBetter ? x > v : x < v).length;
  return worse / Math.max(1, all.length - 1);
}
const nth = (v, all, lowerBetter) => 1 + all.filter(x => lowerBetter ? x < v : x > v).length;

/* How the two teams have played this season, as a compact comparison: one line per stat in plain words, each team's
   national rank in its own column, and the better side of each line marked with a pill in that team's color (no pill
   when they're within a few spots: even). A one-line verdict above says what it adds up to. Overall, offense and
   defense are ESPN's FPI ratings (adjusted for the opponents each team has played); points come from the standings. */
export function tape(g){
  const f = state.fpi, st = state.standings;
  if (!f && !st) return '';
  const fp = t => f?.byTeam[t.id], sd = t => st?.byTeam[t.id];
  const gp = r => r?.overall ? r.overall.w + r.overall.l + r.overall.t : 0;
  const ppg = r => r?.ppg ?? null, opp = r => r?.pa != null && gp(r) ? r.pa / gp(r) : null;
  const fpiAll = k => f ? f.list.map(t => t[k]).filter(v => v != null) : [];
  const stAll = fn => st ? Object.values(st.byTeam).map(fn).filter(v => v != null) : [];
  const rank = (v, all, lower) => v == null || !all.length ? null : nth(v, all, lower);
  const offAll = fpiAll('off'), defAll = fpiAll('def'), ppgAll = stAll(ppg), oppAll = stAll(opp);
  const of = t => { const x = fp(t), r = sd(t);
    return { overall: x?.rank ?? null, off: rank(x?.off, offAll, false), def: rank(x?.def, defAll, false), sos: x?.sosRank ?? null,
      ppg: ppg(r), ppgRk: rank(ppg(r), ppgAll, false), opp: opp(r), oppRk: rank(opp(r), oppAll, true) }; };
  const A = of(g.away), H = of(g.home);
  // [label, away rank, home rank, away figure, home figure]: lower rank is better; within 8 spots is even.
  const lines = [
    ['Overall', A.overall, H.overall],
    ['Offense', A.off, H.off],
    ['Defense', A.def, H.def],
    ['Points scored', A.ppgRk, H.ppgRk, A.ppg, H.ppg],
    ['Points allowed', A.oppRk, H.oppRk, A.opp, H.opp],
    ['Schedule faced', A.sos, H.sos]
  ].filter(([, ra, rh]) => ra != null && rh != null);
  if (!lines.length) return '';
  const better = (ra, rh) => Math.abs(ra - rh) < 8 ? null : ra < rh ? 'a' : 'h';
  const cell = (side, rk, fig, win) => `<span class="tot-c ${side}${win ? ' win' : ''}"><b>#${rk}</b>${fig != null ? `<small>${fig.toFixed(1)}</small>` : ''}</span>`;
  const rows = lines.map(([k, ra, rh, fa, fh]) => { const w = better(ra, rh);
    return `<div class="tot-row" role="row">${cell('a', ra, fa, w === 'a')}<span class="tot-k" role="rowheader">${esc(k)}</span>${cell('h', rh, fh, w === 'h')}</div>`; }).join('');

  // The verdict: who's stronger, and where the other side holds up.
  const ov = A.overall && H.overall ? better(A.overall, H.overall) : null;
  let verdict = '';
  if (A.overall && H.overall && !ov) verdict = 'Evenly matched on paper.';
  else if (ov){
    const [W, L, Wd, Ld] = ov === 'a' ? [g.away, g.home, A, H] : [g.home, g.away, H, A];
    const but = [];
    if (Ld.off && Wd.def && Ld.off <= Wd.def) but.push(`${L.name}'s offense matches up well with ${W.name}'s defense`);
    if (Ld.def && Wd.off && Ld.def <= Wd.off) but.push(`${L.name}'s defense can slow ${W.name}'s offense`);
    const leads = lines.filter(([, ra, rh]) => better(ra, rh) === ov).length;
    verdict = but.length ? `${W.name} is the stronger team, but ${but.join(' and ')}.` : `${W.name} is the stronger team, ahead in ${leads} of ${lines.length}.`;
  }
  const [ca, ch] = sideColors(g), ink = c => /^#[0-9a-f]{6}$/i.test(c) ? inkOn(c) : '#fff';
  const head = t => `<span class="tot-t">${logo(t.logo, 'logo sm')}<b>${esc(t.abbr)}</b></span>`;
  return panel('Tale of the tape', `<div class="tot" role="table" aria-label="Season comparison, national ranks" style="--ca:${esc(ca)};--ch:${esc(ch)};--ia:${ink(ca)};--ih:${ink(ch)}">
    ${verdict ? `<p class="tot-verdict">${esc(verdict)}</p>` : ''}
    <div class="tot-row tot-head" role="row">${head(g.away)}<span class="tot-k">National rank</span>${head(g.home)}</div>
    ${rows}</div>`);
}

/* ---------- recent form ---------- */
function formRow(g, side){
  const t = g[side];
  if (!t.id) return '';
  const e = useData('team:' + t.id, () => api.teamSchedule(t.id), parseSchedule);
  if (!e.data) return `<div class="form-row"><span class="form-team">${logo(t.logo, 'logo sm')}${esc(t.abbr)}</span><span class="muted small">${e.err ? 'Unavailable' : 'Loading…'}</span></div>`;
  const kick = new Date(g.date);
  const past = e.data.games.filter(x => x.state === 'post' && x.completed && x.id !== g.id && new Date(x.date) < kick).slice(-5);
  const tiles = past.map(x => {
    const me = String(x.home.id) === String(t.id) ? 'home' : 'away', o = x[other(me)];
    const won = x[me].winner || (!o.winner && Number(x[me].score) > Number(o.score));
    return `<a class="form-tile ${won ? 'W' : 'L'}" href="${gameHref(x.id)}" title="${won ? 'W' : 'L'} ${esc(x[me].score)}-${esc(o.score)} ${me === 'home' ? 'vs' : 'at'} ${esc(o.name)}">
      ${logo(o.logo, 'form-logo')}<small><span class="sr">${won ? 'Won' : 'Lost'} </span>${esc(x[me].score)}-${esc(o.score)}</small></a>`;
  }).join('');
  // The run in one line: record over these games and the average margin.
  const res = past.map(x => { const me = String(x.home.id) === String(t.id) ? 'home' : 'away'; return Number(x[me].score) - Number(x[other(me)].score); });
  const w = res.filter(m => m > 0).length, avg = res.length ? res.reduce((a, b) => a + b, 0) / res.length : 0;
  const sum = res.length ? `<span class="form-sum"><b>${w}-${res.length - w}</b> last ${res.length} · ${avg >= 0 ? '+' : '−'}${Math.abs(avg).toFixed(1)} avg margin</span>` : '';
  return `<div class="form-row"><span class="form-team">${logo(t.logo, 'logo sm')}${esc(t.abbr)}</span>${sum}<div class="form-tiles">${tiles || '<span class="muted small">No games yet</span>'}</div></div>`;
}

export const recentForm = g => panel('Recent form', formRow(g, 'away') + formRow(g, 'home') + '<p class="note tot-note">Last five, oldest first · tap one for the box score</p>');
