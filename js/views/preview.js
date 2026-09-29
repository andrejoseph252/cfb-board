/* Game drawer pieces with some broadcast flavor: the matchup banner, the line and its movement, storylines,
   the hype gauge, a mirrored tale of the tape and each team's recent form. */
import { esc, pct, fmtTime, parseRecord } from '../util.js';
import { state, CONF, apRank } from '../state.js';
import * as api from '../api.js';
import { parseSchedule } from '../models.js';
import { marketsFor, realMarket, sourceLabel } from '../markets.js';
import { lineFor } from '../lines.js';
import { excitement } from '../excitement.js';
import { pollP } from './compare.js';
import { useData } from '../resource.js';
import { logo, panel, barColors, ballClass, stepPath, teamHref, gameHref } from './components.js';

/* Black or white text, whichever reads better on a team color. */
function inkOn(hex){
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  const lin = c => { c /= 255; return c <= .04 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  const L = .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
  return L > .4 ? '#111' : '#fff';
}
const day = t => new Date(t).toLocaleDateString(undefined, {weekday:'short'});
const other = s => s === 'home' ? 'away' : 'home';

/* ---------- matchup banner ---------- */
function countdown(g){
  const ms = new Date(g.date) - Date.now();
  if (g.tbd) return 'Kickoff time TBD';
  if (ms <= 0) return 'Kickoff';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 3600e3) % 24, m = Math.floor(ms / 60e3) % 60;
  return 'Kickoff in ' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`);
}

export function banner(g, s){
  const [ca, ch] = barColors(g), done = g.state === 'post';
  const side = k => {
    const t = g[k], ap = t.rank || apRank(t.id), conf = state.standings?.byTeam[t.id]?.confRec;
    const lost = done && !t.winner && g[other(k)].winner;
    const rec = [t.record, conf && g.confGame ? `${conf.w}-${conf.l} ${CONF[t.conf] || 'conf'}` : null].filter(Boolean).join(' · ');
    const disc = `<span class="mh-disc">${logo(t.logo, 'mh-logo')}</span>`;
    return `<div class="mh-side ${k}${lost ? ' lost' : ''}">
      ${t.id ? `<a href="${teamHref(t.id)}" tabindex="-1" aria-hidden="true">${disc}</a>` : disc}
      <div class="mh-name${ballClass(g, t)}">${ap ? `<span class="mh-rank">#${ap}</span>` : ''}${t.id ? `<a class="tlink" href="${teamHref(t.id)}">${esc(t.name)}</a>` : esc(t.name)}</div>
      <div class="mh-rec">${esc(rec)}</div></div>`;
  };
  const mid = g.state === 'pre' ? `<div class="mh-vs">${g.neutral ? 'vs' : 'at'}</div>`
    : `<div class="mh-score"><span class="${done && g.home.winner ? 'dim' : ''}">${esc(g.away.score)}</span><i></i><span class="${done && g.away.winner ? 'dim' : ''}">${esc(g.home.score)}</span></div>
       <div class="mh-status${g.state === 'in' ? ' live' : ''}">${esc(g.detail || '')}</div>`;
  const d = new Date(g.date);
  const strip = [
    g.state === 'pre' ? `<b>${esc(countdown(g))}</b>` : null,
    g.state === 'pre' ? esc(`${d.toLocaleDateString(undefined, {weekday:'long', month:'short', day:'numeric'})}${g.tbd ? '' : ' · ' + fmtTime(d)}`) : g.state === 'in' && g.sit ? `<b>${esc(g.sit)}</b>` : null,
    g.tv ? `<span class="mh-tv">${esc(g.tv)}</span>` : null,
    s.venue ? esc(s.venue + (s.city ? ', ' + s.city : '')) : null,
    g.state === 'pre' && s.weather ? esc(s.weather) : null
  ].filter(Boolean);
  return `<header class="mh" data-title="${esc(`${g.away.name} ${g.neutral ? 'vs' : 'at'} ${g.home.name}`)}"
      style="--away:${esc(ca)};--home:${esc(ch)};--away-ink:${inkOn(ca)};--home-ink:${inkOn(ch)}">
    <div class="mh-field" aria-hidden="true"></div>${side('away')}<div class="mh-mid">${mid}</div>${side('home')}</header>
    <div class="mh-strip">${strip.map(x => `<span>${x}</span>`).join('')}</div>`;
}

/* ---------- the line ---------- */
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

/* ---------- storylines ---------- */
function storylines(g){
  const out = [], A = g.away, H = g.home;
  const rk = t => t.rank || apRank(t.id), ra = rk(A), rh = rk(H);
  const nm = t => (rk(t) ? `#${rk(t)} ` : '') + t.name;
  const m = realMarket(g), p = m?.pHome ?? state.preds.get(g.id)?.pHome ?? null;
  const src = m ? (m.source === 'Book' ? 'the sportsbooks' : m.source) : 'ESPN\'s FPI';

  if (ra && rh) out.push(ra <= 10 && rh <= 10 ? ['Top-10 showdown', `${nm(A)} and ${nm(H)}, both in the top ten.`] : ['Ranked matchup', `${nm(A)} vs ${nm(H)}.`]);
  if (p != null){
    const favSide = p >= .5 ? 'home' : 'away', fav = g[favSide], dog = g[other(favSide)], dp = Math.min(p, 1 - p);
    if (dp >= .45) out.push(['Coin flip', `${src} can't separate them: ${pct(1 - dp)}-${pct(dp)}.`]);
    else if (dp >= .28 && (rk(fav) || dp >= .35)) out.push(['Upset watch', `${src} gives ${dog.name} a ${pct(dp)}% shot at ${nm(fav)}.`]);
    else if (dp < .1) out.push(['Heavy favorite', `${fav.name} wins this ${pct(1 - dp)}% of the time, per ${src}.`]);
  }
  const L = lineFor(g);
  if (L && g.state === 'pre' && Math.abs(L.move) >= .05){
    const t = g[L.move > 0 ? 'home' : 'away'], flipped = (L.open - .5) * (L.now - .5) < 0;
    out.push(['Line moving', `The ${L.src} price has moved ${Math.round(Math.abs(L.move) * 100)} points toward ${t.name} since ${day(L.since)}${flipped ? ', flipping the favorite' : ''}.`]);
  }
  const fp = state.preds.get(g.id)?.pHome;
  if (m && fp != null && (m.pHome - .5) * (fp - .5) < 0){
    const ms = m.pHome >= .5 ? H : A, fs = fp >= .5 ? H : A;
    out.push(['Split decision', `The market likes ${ms.name} (${pct(Math.max(m.pHome, 1 - m.pHome))}%); ESPN's FPI likes ${fs.name} (${pct(Math.max(fp, 1 - fp))}%).`]);
  }
  const ca = parseRecord(A.record), chr = parseRecord(H.record), unbeaten = r => r && !r.l && r.w >= 3;
  if (unbeaten(ca) && unbeaten(chr)) out.push(['Unbeatens collide', `${A.name} (${A.record}) and ${H.name} (${H.record}). One of them leaves with a loss.`]);
  else for (const t of [A, H]) if (unbeaten(parseRecord(t.record))) out.push(['Perfect season on the line', `${t.name} is ${t.record}.`]);
  const sa = state.standings?.byTeam[A.id], sh = state.standings?.byTeam[H.id];
  if (g.confGame && sa?.confRec?.w && sh?.confRec?.w && !sa.confRec.l && !sh.confRec.l)
    out.push(['Conference race', `Both are unbeaten in ${CONF[H.conf] || 'conference'} play. Only one stays that way.`]);
  const fa = state.fpi?.byTeam[A.id], fh = state.fpi?.byTeam[H.id];
  if ((fa?.playoff ?? 0) >= 15 || (fh?.playoff ?? 0) >= 15)
    out.push(['Playoff stakes', `FPI playoff odds: ${A.abbr} ${(fa?.playoff ?? 0).toFixed(0)}%, ${H.abbr} ${(fh?.playoff ?? 0).toFixed(0)}%.`]);
  for (const [t, st] of [[A, sa], [H, sh]]){
    const k = /^([WL])(\d+)$/.exec(st?.streak || '');
    if (k && k[1] === 'W' && +k[2] >= 4) out.push(['Hot streak', `${t.name} has won ${k[2]} straight.`]);
    if (k && k[1] === 'L' && +k[2] >= 3) out.push(['Skid', `${t.name} has lost ${k[2]} in a row.`]);
  }
  const ou = Number(g.book?.ou);
  if (ou >= 62) out.push(['Shootout alert', `The total is ${ou}. Expect points.`]);
  else if (ou && ou <= 42) out.push(['Defensive grind', `The total is only ${ou}.`]);
  return out.slice(0, 5);
}

export function storylinesPanel(g){
  const list = storylines(g);
  if (!list.length) return '';
  return panel('Storylines', `<ul class="story">${list.map(([k, t]) => `<li><b>${esc(k)}</b><span>${esc(t)}</span></li>`).join('')}</ul>`);
}

/* ---------- hype gauge ---------- */
export function hype(g){
  const x = excitement(g);
  if (x.pending) return panel('Hype meter', '<p class="muted">Scoring this matchup…</p>');
  const [, label, cls] = x.tier, a = Math.PI * (1 - x.score / 100);
  const R = 80, cx = 100, cy = 92, px = cx + R * Math.cos(a), py = cy - R * Math.sin(a);
  const arc = (from, to, c) => {
    const f = Math.PI * (1 - from / 100), t = Math.PI * (1 - to / 100);
    return `<path d="M${cx + R * Math.cos(f)},${cy - R * Math.sin(f)} A${R},${R} 0 0 1 ${cx + R * Math.cos(t)},${cy - R * Math.sin(t)}" stroke="${c}" />`;
  };
  const gauge = `<svg class="gauge" viewBox="0 0 200 104" role="img" aria-label="Excitement ${x.score} of 100, ${esc(label)}">
    <g fill="none" stroke-width="14">${arc(0, 44.5, 'var(--x-lo)')}${arc(45.5, 64.5, 'var(--x-mid)')}${arc(65.5, 79.5, 'color-mix(in srgb,var(--x-hi) 70%,var(--x-mid))')}${arc(80.5, 100, 'var(--x-hi)')}</g>
    <g fill="none" stroke="var(--surface)" stroke-width="16" opacity=".55">${x.score < 100 ? arc(Math.min(99.5, x.score + .5), 100, 'var(--surface)') : ''}</g>
    <line x1="${cx}" y1="${cy}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="7" fill="var(--ink)"/></svg>`;
  const parts = `<ul class="xc-parts">${x.parts.map(p => `<li><span class="xc-k">${esc(p.k)}</span>
      <span class="xc-bar"><i style="width:${(p.pts / p.max) * 100}%"></i></span>
      <span class="xc-pts">${p.pts.toFixed(0)}/${p.max}</span><span class="xc-why">${esc(p.why)}</span></li>`).join('')}</ul>`;
  return panel('Hype meter', `<div class="hype"><div class="hype-g">${gauge}<div class="hype-n"><b>${x.score}</b><span class="hype-l ${cls}">${esc(label)}</span></div></div>${parts}</div>`);
}

/* ---------- tale of the tape ---------- */
/* National percentile (0-1, 1 = best) of a value within all FBS teams. */
function pctile(v, all, lowerBetter){
  if (v == null || !all.length) return null;
  const worse = all.filter(x => lowerBetter ? x > v : x < v).length;
  return worse / Math.max(1, all.length - 1);
}
const nth = (v, all, lowerBetter) => 1 + all.filter(x => lowerBetter ? x < v : x > v).length;

export function tape(g){
  const f = state.fpi, st = state.standings;
  const fpiAll = k => f ? f.list.map(t => t[k]).filter(v => v != null) : [];
  const stAll = k => st ? Object.values(st.byTeam).map(k).filter(v => v != null) : [];
  const allowed = t => t?.pa != null && t.overall ? t.pa / Math.max(1, t.overall.w + t.overall.l + t.overall.t) : null;
  const rows = [
    ['FPI rating', t => f?.byTeam[t.id]?.fpi, fpiAll('fpi'), false, 1],
    ['Offense efficiency', t => f?.byTeam[t.id]?.off, fpiAll('off'), false, 1],
    ['Defense efficiency', t => f?.byTeam[t.id]?.def, fpiAll('def'), false, 1],
    ['Points per game', t => st?.byTeam[t.id]?.ppg, stAll(t => t.ppg), false, 1],
    ['Allowed per game', t => allowed(st?.byTeam[t.id]), stAll(allowed), true, 1]
  ].map(([k, get, all, lower, dp]) => {
    const va = get(g.away), vh = get(g.home);
    if (va == null && vh == null) return '';
    const qa = pctile(va, all, lower), qh = pctile(vh, all, lower);
    const edge = va != null && vh != null && va !== vh ? ((lower ? va < vh : va > vh) ? 'a' : 'h') : '';
    const cell = (v, q, s) => `<span class="tp-v${edge === s ? ' edge' : ''}">${v == null ? '–' : v.toFixed(dp)}${v != null && all.length ? `<small>#${nth(v, all, lower)}</small>` : ''}</span>`;
    return `<div class="tp-row">${cell(va, qa, 'a')}<span class="tp-bar a"><i style="width:${((qa ?? 0) * 100).toFixed(0)}%"></i></span>
      <span class="tp-k">${esc(k)}</span><span class="tp-bar h"><i style="width:${((qh ?? 0) * 100).toFixed(0)}%"></i></span>${cell(vh, qh, 'h')}</div>`;
  }).join('');
  if (!rows) return '';
  const [ca, ch] = barColors(g);
  return panel('Tale of the tape', `<div class="tape" style="--ca:${esc(ca)};--ch:${esc(ch)}">
    <div class="tp-row tp-head"><span>${logo(g.away.logo, 'logo sm')}${esc(g.away.abbr)}</span><span></span><span></span><span></span><span>${esc(g.home.abbr)}${logo(g.home.logo, 'logo sm')}</span></div>${rows}</div>
    <p class="note">Bars show where each team ranks nationally (longer is better); the small number is its FBS rank.</p>`);
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
      <b>${won ? 'W' : 'L'}</b>${logo(o.logo, 'form-logo')}<small>${esc(x[me].score)}-${esc(o.score)}</small></a>`;
  }).join('');
  return `<div class="form-row"><span class="form-team">${logo(t.logo, 'logo sm')}${esc(t.abbr)}</span><div class="form-tiles">${tiles || '<span class="muted small">No games yet</span>'}</div></div>`;
}

export const recentForm = g => panel('Recent form', formRow(g, 'away') + formRow(g, 'home') + '<p class="note">Last five games, oldest first. Tap one for the box score.</p>');
