/* The "Week N in review" banner: one line of headlines, tap to open the full recap cards. */
import { esc, pct, store } from '../util.js';
import { recap, showRecap } from '../recap.js';
import { weekLabel } from '../picks.js';
import { logo, gameHref, teamHref, barColors } from './components.js';

const CHEV = '<svg class="rc-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const rk = t => t.rank ? `#${t.rank} ` : '';
const score = (g, ws) => `${g[ws].score}-${g[ws === 'home' ? 'away' : 'home'].score}`;

/* Tiny in-game win-probability trace, colored halves like the full chart. */
function swingSpark(g, pts){
  const W = 220, H = 48, n = pts.length, [ca, ch] = barColors(g);
  const d = pts.map((p, i) => `${(i / (n - 1) * W).toFixed(1)},${((1 - p) * H).toFixed(1)}`).join(' ');
  return `<svg class="rc-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <rect width="${W}" height="${H / 2}" fill="${esc(ch)}" opacity=".18"/><rect y="${H / 2}" width="${W}" height="${H / 2}" fill="${esc(ca)}" opacity=".18"/>
    <polyline points="${d}" fill="none" stroke="var(--ink)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

const matchup = (g, ws) => { const ls = ws === 'home' ? 'away' : 'home';
  return `<div class="rc-match">${logo(g[ws].logo, 'logo')}<span><b>${esc(rk(g[ws]) + g[ws].name)}</b> over ${esc(rk(g[ls]) + g[ls].name)}</span><span class="rc-sc">${esc(score(g, ws))}</span></div>`; };

function cards(r){
  const out = [];
  const u = r.upsets[0];
  if (u) out.push(`<a class="rc-card" href="${gameHref(u.g.id)}"><span class="rc-kick">Upset of the week</span>${matchup(u.g, u.ws)}
    <p>${u.p != null ? `The market gave ${esc(u.g[u.ws].name)} <b>${pct(u.p)}%</b> at kickoff.` : `Unranked or lower-ranked team takes down ${esc(rk(u.g[u.ls]) + u.g[u.ls].name)}.`}</p>
    ${r.upsets.length > 1 ? `<ul class="rc-list">${r.upsets.slice(1, 4).map(x => `<li>${esc(x.g[x.ws].abbr)} over ${esc(rk(x.g[x.ls]) + x.g[x.ls].abbr)}${x.p != null ? ` <span class="muted">${pct(x.p)}%</span>` : ''}</li>`).join('')}</ul>` : ''}</a>`);
  if (r.classic){
    const c = r.classic, ws = c.g.home.winner ? 'home' : 'away';
    out.push(`<a class="rc-card" href="${gameHref(c.g.id)}"><span class="rc-kick">Game of the week</span>${matchup(c.g, ws)}${swingSpark(c.g, c.pts)}
      <p><b>${esc(c.label)}</b>: excitement ${c.index.toFixed(1)}, the favorite flipped ${c.flips} time${c.flips === 1 ? '' : 's'}.</p></a>`);
  } else if (r.classicLoading) out.push('<div class="rc-card rc-wait"><span class="rc-kick">Game of the week</span><p class="muted">Replaying the close ones…</p></div>');
  if (r.fallen.length) out.push(`<div class="rc-card"><span class="rc-kick">Ranked teams that fell</span><div class="rc-big">${r.fallen.length}</div>
    <ul class="rc-list">${r.fallen.slice(0, 5).map(({ g, ls }) => { const ws = ls === 'home' ? 'away' : 'home';
      return `<li><a href="${gameHref(g.id)}">${logo(g[ls].logo, 'logo sm')}#${g[ls].rank} ${esc(g[ls].name)}</a> <span class="muted">lost to ${esc(rk(g[ws]) + g[ws].abbr)} <span class="nw">${esc(score(g, ws))}</span></span></li>`; }).join('')}</ul></div>`);
  if (r.poll && (r.poll.up.length || r.poll.down.length)){
    const row = ({ t, d }) => `<li><a href="${teamHref(t.id)}">${logo(t.logo, 'logo sm')}#${t.rank} ${esc(t.name)}</a> <span class="mv ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span></li>`;
    out.push(`<div class="rc-card"><span class="rc-kick">New AP poll</span><ul class="rc-list">${r.poll.up.map(row).join('')}${r.poll.down.map(row).join('')}</ul>
      ${r.poll.debut.length ? `<p>New: ${r.poll.debut.map(t => `<a href="${teamHref(t.id)}">#${t.rank} ${esc(t.name)}</a>`).join(', ')}</p>` : ''}</div>`);
  }
  if (r.pk){
    const edge = r.pk.w - r.pk.exp;
    out.push(`<div class="rc-card"><span class="rc-kick">Your picks</span><div class="rc-big">${r.pk.w}–${r.pk.n - r.pk.w}</div>
      <p>${edge >= 0 ? '+' : '−'}${Math.abs(edge).toFixed(1)} wins vs. what the market expected.</p><button class="chipbtn" data-tab="picks">All picks</button></div>`);
  }
  return out.join('');
}

function headlines(r){
  const h = [];
  if (r.upsets[0]){ const u = r.upsets[0]; h.push(`${u.g[u.ws].abbr} over ${rk(u.g[u.ls])}${u.g[u.ls].abbr}${u.p != null ? ` (${pct(u.p)}%)` : ''}`); }
  if (r.fallen.length) h.push(`${r.fallen.length} ranked team${r.fallen.length === 1 ? '' : 's'} fell`);
  if (r.classic) h.push(`${r.classic.label}: ${r.classic.g.away.abbr}-${r.classic.g.home.abbr}`);
  if (r.pk) h.push(`Picks ${r.pk.w}–${r.pk.n - r.pk.w}`);
  return h.slice(0, 3);
}

export function recapBanner(){
  if (!showRecap()) return '';
  const r = recap();
  if (!r) return '';
  const title = `${weekLabel(r.w.st, r.w.week)} in review`;
  if (r.loading) return `<section class="rc"><div class="rc-bar"><span class="rc-tag">Recap</span><b class="rc-title">${esc(title)}</b><span class="rc-heads muted">Loading…</span></div></section>`;
  const key = `recap-${r.w.st}-${r.w.week}`, open = store.get(key, false);
  return `<details class="rc" data-recap="${esc(key)}"${open ? ' open' : ''}><summary class="rc-bar"><span class="rc-tag">Recap</span><b class="rc-title">${esc(title)}</b>
    <span class="rc-heads">${headlines(r).map(x => `<span>${esc(x)}</span>`).join('')}</span>${CHEV}</summary>
    <div class="rc-cards">${cards(r)}</div></details>`;
}
