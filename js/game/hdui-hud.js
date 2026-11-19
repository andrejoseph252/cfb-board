/* The game's interface: the score bug, the down & distance tab, the play-by-play ticker, the buttons on the field (play call,
   timeout, pause, sound, JUKE / TRUCK, JUMP, replay) and the big moments (TOUCHDOWN and the other banners).
   The bug and the big moments are Saturday broadcast (a team-colored bug with logos and timeout pips, a down & distance
   tab that slides out from under it, a skewed TOUCHDOWN wipe in the scorer's colors); the buttons are the Board's
   frosted glass, with the primary action in broadcast yellow. pixelbowl.js asks this module for the markup. */
import { esc } from '../util.js';
import { logoUrl as boardLogo } from '../views/components.js';
import { teamTone, teamPaint, inkOn, vars, YELLOW } from './hdkit.js';
import * as W from './weather.js';

const logo = (src, px = 72) => boardLogo(src, px, 'light');
export const FSU = '52';
const isFSU = t => String(t?.id) === FSU;
const GARNET = '#782f40', GOLD = '#ceb888';

const BALL = '<svg class="hb-poss" viewBox="0 0 26 18" aria-label="Possession"><ellipse cx="13" cy="9" rx="12" ry="7.5" fill="#8a4b22" stroke="#fff" stroke-width="1.6"/><path d="M8 9h10M11 6.8v4.4M13 6.8v4.4M15 6.8v4.4" stroke="#fff" stroke-width="1.5"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* A spear (shaft, a leaf-shaped head, a wrap and feathers hanging from the binding), drawn pointing right. */
const SPEAR = `<svg class="hb-spear" viewBox="0 0 320 44" aria-hidden="true">
  <defs><linearGradient id="hbShaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e3b8"/><stop offset=".5" stop-color="${GOLD}"/><stop offset="1" stop-color="#8f7a4e"/></linearGradient>
  <linearGradient id="hbHead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset=".45" stop-color="#e9d39a"/><stop offset="1" stop-color="#9c8150"/></linearGradient></defs>
  <rect x="10" y="19" width="250" height="6" rx="3" fill="url(#hbShaft)" stroke="#3a1119" stroke-width="1.2"/>
  <path d="M256 22 L284 9 L318 22 L284 35 Z" fill="url(#hbHead)" stroke="#3a1119" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M262 22 L314 22" stroke="#9c8150" stroke-width="1.2"/>
  <rect x="236" y="16.5" width="16" height="11" rx="2" fill="${GARNET}" stroke="#3a1119" stroke-width="1.2"/>
  <path d="M240 17v10M244 17v10M248 17v10" stroke="${GOLD}" stroke-width="1.4"/>
  <g class="hb-feath" stroke="#3a1119" stroke-width="1"><path d="M240 27 C236 34 232 38 224 42 C232 36 236 32 238 27 Z" fill="${GARNET}"/>
  <path d="M246 27 C244 35 240 40 233 44 C240 37 242 32 243 27 Z" fill="${GOLD}"/><path d="M251 27 C251 34 249 38 244 43 C248 37 249 32 248 27 Z" fill="#f4f1ea"/></g>
  <path d="M10 22 L0 15 M10 22 L0 29" stroke="#8f7a4e" stroke-width="3" stroke-linecap="round"/></svg>`;

/* ---------- the score bug ---------- */
/* st: { me, opp, score, q, clock, running, poss: 'me' | 'opp' | '', tos, flash: [bool, bool] } */
export function bug(st){
  const P = teamPaint(st.me, st.opp);
  const tm = (t, tone, s, i) => `<div class="hb-tm${isFSU(t) ? ' fsu' : ''}" style="${vars(tone)};--ka:${inkOn(tone.a)}">
    <span class="hb-disc">${t.logo ? `<img src="${esc(logo(t.logo))}" alt="">` : ''}${st.poss === (i ? 'opp' : 'me') ? BALL : ''}</span>
    <span class="hb-nm"><b>${esc(t.abbr)}</b><span class="hb-pips">${i === 0 && st.tos != null ? [0, 1, 2].map(k => `<i class="${k < st.tos ? '' : 'used'}"></i>`).join('') : ''}</span></span>
    <span class="hb-sc${st.flash?.[i] ? ' flash' : ''}">${s}</span></div>`;
  return tm(st.me, P.me, st.score[0], 0) + tm(st.opp, P.opp, st.score[1], 1) + `<div class="hb-clk"><span>${esc(st.q)}</span><b>${clockInner(st)}</b></div>`;
}
/* ---------- the punt's drop gauge ----------
   A broadcast piece down the left edge: your team's cap (the bug's gradient, logo disc and accent stripe) over a glass
   tube, hash ticks either side, the timing bands blending one into the next, and the strike window (green, framed in
   white with a glow and pointers). The football (shaded leather, the college stripes, laces) falls down it nose
   first with a trail; what it has passed dims. At the bottom his cleat, in your colors, swings through on the kick,
   and the readout says how close you were. pixelbowl.js builds it once per punt and moves the ball. */
export const GAUGE_COLORS = { r: '#ff4d4f', a: '#ffb020', y: '#ffd23f', g: '#3ddc84' };
const FOOTBALL = `<svg class="hg-ball" viewBox="0 0 34 22" aria-hidden="true">
  <defs><radialGradient id="hgLeather" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#cf7d41"/><stop offset=".5" stop-color="#8e461f"/><stop offset="1" stop-color="#4b200b"/></radialGradient></defs>
  <path d="M1.5 11C1.5 4.6 9.6 1.2 17 1.2S32.5 4.6 32.5 11 24.4 20.8 17 20.8 1.5 17.4 1.5 11Z" fill="url(#hgLeather)" stroke="#250f04" stroke-width="1.1"/>
  <path d="M7.4 3.4C6.3 8 6.3 14 7.4 18.6M26.6 3.4C27.7 8 27.7 14 26.6 18.6" stroke="#fff" stroke-width="1.9" fill="none" stroke-linecap="round"/>
  <path d="M11 9.6H23" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12.6 8.1v3M15.2 8.1v3M17.8 8.1v3M20.4 8.1v3" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
  <ellipse cx="12.5" cy="5.6" rx="5.5" ry="1.6" fill="#fff" opacity=".22"/></svg>`;
const cleat = c => `<svg class="hg-cleat" viewBox="0 0 44 24" aria-hidden="true">
  <path d="M5 16.5C5 11.5 8 9.4 12 9.4H18L23.5 3.6C25 2.1 27.6 2.3 28.7 4L35 12.4C36.8 14.3 38 15.6 38 17.2V18.3H5Z" fill="#f2f4f7" stroke="#0b0d10" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M9.5 14.6C16 13.6 23 12.2 31.5 9.6" stroke="${c}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <path d="M22.5 7.6l2.4 1.6M24.3 5.8l2.4 1.6M26.1 4.2l2.2 1.5" stroke="#0b0d10" stroke-width="1" stroke-linecap="round"/>
  <rect x="4" y="18.2" width="35" height="3.2" rx="1.6" fill="#1b1e24"/>
  <path d="M7.5 21.4v2M13 21.4v2M24 21.4v2M30 21.4v2M35.5 21.4v2" stroke="#a3abb6" stroke-width="2.2" stroke-linecap="round"/></svg>`;
/* A kickoff's tee (bright orange, the ball standing on it, laces to the camera), at the bottom of its gauge. */
const TEE = `<svg class="hg-tee" viewBox="0 0 30 30" aria-hidden="true">
  <defs><radialGradient id="hgLeather2" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#cf7d41"/><stop offset=".5" stop-color="#8e461f"/><stop offset="1" stop-color="#4b200b"/></radialGradient></defs>
  <path d="M9.5 29 L12 20.5 H18 L20.5 29 Z" fill="#ff7a1a" stroke="#0b0d10" stroke-width="1.1" stroke-linejoin="round"/><path d="M12.6 22.6H17.4" stroke="#ffb27a" stroke-width="1"/>
  <g class="tb"><path d="M15 1.2C10.6 1.2 8.3 6 8.3 11S10.6 20.8 15 20.8 21.7 16 21.7 11 19.4 1.2 15 1.2Z" fill="url(#hgLeather2)" stroke="#250f04" stroke-width="1.1"/>
  <path d="M10 5.4C12.6 4.4 17.4 4.4 20 5.4M10 16.6C12.6 17.6 17.4 17.6 20 16.6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M15 7.6V14.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><path d="M13.6 8.8h2.8M13.6 11h2.8M13.6 13.2h2.8" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/></g></svg>`;
/* The frame (cap, an empty rail to measure, the cleat (or a kickoff's tee), the readout). */
export function gauge(team, ko = false){
  const t = teamTone(team);
  return `<div class="hg-cap" style="${vars(t)}"><span class="hg-disc">${team.logo ? `<img src="${esc(logo(team.logo, 48))}" alt="">` : ''}</span><b>${ko ? 'KICKOFF' : 'PUNT'}</b></div>
    <div class="hg-steps" aria-hidden="true">${(ko ? ['AIM', 'SET', 'KICK'] : ['AIM', 'SNAP', 'KICK']).map((l, i) => `<i data-s="${i}">${l}</i>`).join('')}</div>
    <div class="hg-rush" aria-hidden="true"><i></i>RUSH</div>
    <div class="hg-rail"></div>
    <div class="hg-foot">${ko ? TEE : cleat(t.c)}</div>
    <div class="hg-cue" aria-live="polite"></div>
    <div class="hg-res" aria-live="polite"></div>`;
}
/* The cue under the gauge, before the kick: let go (aiming), get ready (the snap / the set, with a bar filling to
   the drop), then KICK. */
const LIFT = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="15.5" r="2.6" fill="currentColor" opacity=".45"/><path d="M10 11.5V3.5M6.5 7L10 3.5 13.5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function gaugeCue(step, ko){
  if (step === 0) return `<span class="hg-lift">${LIFT}</span><b>LET GO</b><small>${ko ? 'TO START' : 'TO SNAP'}</small>`;
  if (step === 1) return `<b>READY</b><span class="hg-bar"><i></i></span>`;
  return `<b class="hg-now">KICK!</b>`;
}
/* The tube for a rail `h` pixels tall: zones are { c, a, b } fractions top to bottom. */
export function gaugeRail(zones, h, ko = false, color = '#fff'){
  const W = 56, x0 = 17, tw = 22, soft = 2.5 / h, stops = [];
  zones.forEach((z, i) => {
    const col = GAUGE_COLORS[z.c], op = z.c === 'g' ? 1 : z.c === 'r' ? .72 : .85;
    stops.push([i ? Math.min(z.a + soft, z.b) : 0, col, op], [i < zones.length - 1 ? Math.max(z.b - soft, z.a) : 1, col, op]);
  });
  const g = zones.find(z => z.c === 'g'), gy = g.a * h, gh = (g.b - g.a) * h;
  let ticks = '';
  for (let i = 1; i < 16; i++){
    const y = (i / 16 * h).toFixed(1), long = i % 4 === 0, a = long ? .5 : .28;
    ticks += `<path d="M${long ? 3 : 7} ${y}H12M${W - 12} ${y}H${long ? W - 3 : W - 7}" stroke="rgba(255,255,255,${a})" stroke-width="${long ? 1.4 : 1}"/>`;
  }
  return `<svg class="hg-tube" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" aria-hidden="true">
    <defs>
      <linearGradient id="hgZ" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c, op]) => `<stop offset="${o.toFixed(4)}" stop-color="${c}" stop-opacity="${op}"/>`).join('')}</linearGradient>
      <linearGradient id="hgSheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".28" stop-color="#fff" stop-opacity=".22"/>
        <stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
      <filter id="hgGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    ${ticks}
    <rect x="${x0 - 1.5}" y="-1.5" width="${tw + 3}" height="${h + 3}" rx="${(tw + 3) / 2}" fill="rgba(0,0,0,.55)"/>
    <rect x="${x0}" y="0" width="${tw}" height="${h}" rx="${tw / 2}" fill="url(#hgZ)"/>
    <rect x="${x0}" y="0" width="${tw}" height="${h}" rx="${tw / 2}" fill="url(#hgSheen)"/>
    <rect x="${x0 - 4}" y="${(gy - 3).toFixed(1)}" width="${tw + 8}" height="${(gh + 6).toFixed(1)}" rx="7" fill="none" stroke="#3ddc84" stroke-width="5" opacity=".7" filter="url(#hgGlow)"/>
    <rect x="${x0 - 4}" y="${(gy - 3).toFixed(1)}" width="${tw + 8}" height="${(gh + 6).toFixed(1)}" rx="7" fill="none" stroke="#fff" stroke-width="1.7"/>
    <path d="M1 ${(gy + gh / 2 - 5).toFixed(1)}L8 ${(gy + gh / 2).toFixed(1)}L1 ${(gy + gh / 2 + 5).toFixed(1)}Z M${W - 1} ${(gy + gh / 2 - 5).toFixed(1)}L${W - 8} ${(gy + gh / 2).toFixed(1)}L${W - 1} ${(gy + gh / 2 + 5).toFixed(1)}Z" fill="#fff"/>
    <rect x="${x0 + 3}" y="6" width="3" height="${h - 12}" rx="1.5" fill="#fff" opacity=".16"/>
  </svg>
  <div class="hg-spent"></div><div class="hg-trail"></div>${ko ? `<div class="hg-ball hg-runner">${cleat(color)}</div>` : FOOTBALL}<div class="hg-flash"></div>`;
}
/* The readout after the kick. */
export function gaugeResult(q, ms, early){
  const W = { perfect: ['PERFECT', 'g'], good: ['GOOD', 'y'], wobbler: ['WOBBLER', 'a'], shank: ['SHANKED', 'r'] }[q] || ['', 'y'];
  const sub = ms == null ? 'TOO LATE' : q === 'perfect' && ms < 20 ? 'DEAD ON' : `${ms} MS ${early ? 'EARLY' : 'LATE'}`;
  return `<b style="color:${GAUGE_COLORS[W[1]]}">${W[0]}</b><small>${sub}</small>`;
}
export const clockInner = st => `<i class="${st.running ? 'on' : ''}"></i><em>${esc(st.clock)}</em>`;

/* ---------- the down & distance tab (slides out from under the bug each time it changes) ---------- */
export function dd({ text, goal, spot, side, tell }){
  return `<div class="hb-dd"><span class="dn${goal ? ' goal' : ''}">${esc(text)}</span><span class="sp" style="--oc:${esc(side || '#888')}"><i></i>${esc(spot)}</span>${tell ? `<span class="tell">${esc(tell)}</span>` : ''}</div>`;
}

/* ---------- the conditions tab (weather.js): its mark, the temperature, the wind and which way it blows ---------- */
export const wx = (c, portrait) => `<div class="hb-wx" title="${esc(W.describe(c))}">${W.mark(c)}<b>${c.temp}°</b>${c.wind ? `<span><i style="--r:${W.windTurn(c, portrait)}deg">${W.ARROW}</i>${Math.abs(c.wind)}</span>` : ''}</div>`;

/* ---------- the bottom bar: the play call (yellow) and the glass chips ---------- */
export const callBtn = (name, sub = 'PLAY') => `<button type="button" data-pb="call" class="pb-call"><span><small>${esc(sub)}</small><b${name.length > 9 ? ' class="long"' : ''}>${esc(name)}</b></span><i class="chev">${CHEV}</i></button>`;
/* The dice beside the play: roll a different play. An icon over a word, the same height as the other chips. */
export const dice = icon => `<button type="button" data-pb="rollplay" class="hb-chip hb-dice" aria-label="Roll a random play">${icon}<small>RANDOM</small></button>`;
export const chip = (pb, label, sub = '', cls = '') => `<button type="button" data-pb="${pb}" class="hb-chip ${cls}"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;

/* ---------- play by play ---------- */
export const pbpVars = team => { const t = teamTone(team); return `--a2:${t.accent};--k2:${inkOn(t.accent)}`; };
export const pbp = (text, extra = '') => `<strong>LAST PLAY</strong><em>${esc(text)}${extra ? ` <u>· ${esc(extra)}</u>` : ''}</em>`;

/* ---------- the big moments ---------- */
/* The game's older palette (still passed in by its banner calls) mapped to this one; anything else is a team color. */
const TONES = { '#ffd84a': YELLOW, '#ff5a4e': '#ff4d4f', '#4cff7a': '#3ddc84', '#7df9ff': '#6fe3ff', '#fff': '#ffffff', '#c9d1d9': '#e9edf1', '#ff9f43': '#ffb020' };
const BIG = /^(TOUCHDOWN|TWO POINTS|PICK SIX)/;
/* Returns { html, cls } for .pb-banner. team: the scoring team when it's a big one. */
export function banner(text, sub, color, team){
  if (BIG.test(text) && team){
    const t = teamTone(team), fsu = isFSU(team), word = text.replace(/!$/, '');
    const letters = [...word].map((c, i) => `<i style="animation-delay:${(fsu ? .62 : .42) + i * .04}s">${c === ' ' ? '&nbsp;' : esc(c)}</i>`).join('');
    const subLine = sub ? `<div class="hb-bsub">${esc(sub)}</div>` : `<div class="hb-bsub">${esc((team.name || '').toUpperCase())}</div>`;
    return { cls: `hb-big${fsu ? ' fsu' : ''}`, html: `<div class="hb-bwrap" style="${vars(t)}">
      <div class="hb-band">${fsu ? '<div class="hb-chev"></div>' : ''}</div>
      ${fsu ? `<div class="hb-fly">${SPEAR}<div class="hb-trail"></div></div><div class="hb-spark">${Array.from({ length: 10 }, (_, i) => `<i style="--r:${i * 36}deg;--d:${34 + (i % 3) * 14}px"></i>`).join('')}</div>` : ''}
      ${team.logo ? `<div class="hb-blogo"><img src="${esc(logo(team.logo, 96))}" alt=""></div>` : ''}
      <div class="hb-word">${letters}</div>${fsu ? '<div class="hb-kick">GARNET &amp; GOLD</div>' : ''}${subLine}</div>` };
  }
  const c = TONES[String(color).toLowerCase()] || color || '#ffffff';
  return { cls: 'hb-slab', html: `<div class="hb-swrap" style="--bc:${esc(c)};--bk:${inkOn(c)}"><div class="hb-sw">${esc(text)}</div>${sub ? `<div class="hb-ss">${esc(sub)}</div>` : ''}</div>` };
}

const Q = 'calc(env(safe-area-inset-top,0px) + 10px)', B = 'env(safe-area-inset-bottom,0px)', L = 'calc(env(safe-area-inset-left,0px) + 10px)', Rt = 'calc(env(safe-area-inset-right,0px) + 10px)';
export const CSS = `
/* ---------- glass ---------- */
.pb.hd .pb-tools button,.pb.hd .pb-moves,.pb.hd .pb-jump,.pb.hd .pb-rp,.pb.hd .hb-chip,.pb.hd .pb-pbp,.pb.hd .pb-grade,.pb.hd .pb-bug{
  background:var(--hd-glass);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);border:1px solid var(--hd-line);
  box-shadow:0 10px 28px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)}

/* ---------- top left: score bug, down & distance, play by play ---------- */
.pb.hd .pb-hud{left:${L};top:${Q};transform:none;justify-items:start;gap:0;width:calc(100% - 78px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px));z-index:2}
.pb.hd .pb-bug{height:54px;border-radius:9px;overflow:hidden;align-items:stretch;padding:0;border-color:rgba(255,255,255,.14);position:relative;z-index:2}
.pb.hd .hb-tm{position:relative;display:flex;align-items:center;gap:6px;padding:0 0 0 6px;width:clamp(100px,31.5vw,128px);color:var(--k);
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 80%,#fff) 0%,var(--c) 46%,color-mix(in srgb,var(--c) 76%,#000) 100%)}
.pb.hd .hb-tm::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--a)}
.pb.hd .hb-tm+.hb-tm{border-left:1px solid rgba(0,0,0,.45)}
.pb.hd .hb-tm.fsu::before{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(206,184,136,.28) 45%,transparent 60%);background-size:300% 100%;animation:hbShimmer 5s ease-in-out infinite;pointer-events:none}
@keyframes hbShimmer{0%,60%{background-position:100% 0}100%{background-position:-100% 0}}
.pb.hd .hb-disc{position:relative;flex:none;width:28px;height:28px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.pb.hd .hb-disc img{width:22px;height:22px;object-fit:contain;image-rendering:auto}
.pb.hd .hb-poss{position:absolute;right:-8px;bottom:-4px;width:19px;height:13px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.7))}
.pb.hd .hb-nm{display:grid;gap:4px;min-width:0}
.pb.hd .hb-nm b{font:800 19px/1 var(--hd-display);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:clip}
.pb.hd .hb-pips{display:flex;gap:3px;height:4px}
.pb.hd .hb-pips i{width:10px;border-radius:1px;background:var(--k);opacity:.92}
.pb.hd .hb-pips i.used{opacity:.22}
.pb.hd .hb-sc{margin-left:auto;align-self:stretch;width:40px;flex:none;display:grid;place-items:center;background:rgba(0,0,0,.34);color:#fff;
  font:800 31px/1 var(--hd-display);font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.pb.hd .hb-sc.flash{animation:hbFlash 2.2s ease-out 1}
@keyframes hbFlash{0%,35%{background:var(--a);color:var(--ka);transform:scale(1)}10%{transform:scale(1.12)}100%{background:rgba(0,0,0,.34);color:#fff}}
.pb.hd .hb-clk{width:68px;flex:none;display:grid;align-content:center;justify-items:center;gap:2px;background:var(--hd-glass2)}
.pb.hd .hb-clk span{font:800 13px/1 var(--hd-display);letter-spacing:.12em;color:var(--hd-mute)}
.pb.hd .hb-clk b{display:flex;align-items:center;gap:5px;font:800 25px/1 var(--hd-display);font-variant-numeric:tabular-nums;color:#fff}
.pb.hd .hb-clk b em{font-style:normal}
.pb.hd .hb-clk b i{display:none;width:6px;height:6px;border-radius:50%;background:var(--hd-green);box-shadow:0 0 6px var(--hd-green);animation:pb-blink 1s steps(2) infinite}
.pb.hd .hb-clk b i.on{display:block}
/* practice and defense reuse the bug with their own cells */
.pb.hd .pb-bug .pb-tm{padding:0 12px 0 7px;gap:7px;color:var(--k);background:linear-gradient(180deg,color-mix(in srgb,var(--c) 80%,#fff) 0%,var(--c) 46%,color-mix(in srgb,var(--c) 76%,#000) 100%)}
.pb.hd .pb-bug .pb-tm img{display:block;width:30px;height:30px;padding:3px;border-radius:50%;background:#fff;image-rendering:auto;object-fit:contain}
.pb.hd .pb-bug .pb-tm b{font:800 19px/1 var(--hd-display);letter-spacing:.04em}
.pb.hd .pb-bug .pb-mid{min-width:62px;padding:0 8px;align-content:center;gap:2px;background:var(--hd-glass2);border-left:1px solid var(--hd-line)}
.pb.hd .pb-bug .pb-mid span{font:800 12px/1 var(--hd-display);letter-spacing:.12em;color:var(--hd-mute)}
.pb.hd .pb-bug .pb-mid b{font:800 23px/1 var(--hd-display);color:#fff;white-space:nowrap}

.pb.hd .pb-dd{display:block;background:none;border:0;padding:0 6px 6px 0;margin-top:-1px;overflow:hidden;font:inherit;position:relative;z-index:1}
.pb.hd .pb-dd:empty{display:none}
.pb.hd .hb-dd{display:flex;height:27px;border-radius:0 0 7px 7px;overflow:hidden;box-shadow:0 6px 14px rgba(0,0,0,.4);transform:translateY(-105%);animation:hbDdIn .45s cubic-bezier(.2,.9,.25,1.15) .15s forwards}
@keyframes hbDdIn{to{transform:none}}
.pb.hd .hb-dd>*{display:flex;align-items:center;padding:0 10px;font:700 16px/1 var(--hd-display);letter-spacing:.04em;white-space:nowrap;color:#fff}
.pb.hd .hb-dd .dn{background:#fff;color:#0b0d10;font-weight:800;font-size:17px}
.pb.hd .hb-dd .dn.goal{background:var(--hd-red);color:#fff}
.pb.hd .hb-dd .sp{background:var(--hd-glass2);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur)}
.pb.hd .hb-dd .sp i{width:8px;height:8px;border-radius:1px;background:var(--oc);margin-right:6px;box-shadow:0 0 0 1px rgba(255,255,255,.55)}
.pb.hd .hb-dd .tell{background:#6fe3ff;color:#04212b;font-size:14px;font-weight:800}
.pb.hd .pb-bugw{position:relative;z-index:2}
.pb.hd .pb-wxhud{position:absolute;right:0;top:100%;pointer-events:none}
.pb.hd .pb-hud:has(.hb-dd .tell) .pb-wxhud{display:none}
.pb.hd .hb-wx{display:flex;align-items:center;gap:5px;height:25px;padding:0 9px 0 6px;border-radius:0 0 7px 7px;background:var(--hd-glass2);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);
  box-shadow:0 6px 14px rgba(0,0,0,.4);color:#fff;transform:translateY(-105%);animation:hbDdIn .45s cubic-bezier(.2,.9,.25,1.15) .3s forwards}
.pb.hd .hb-wx .wxi{width:18px;height:18px}
.pb.hd .hb-wx b,.pb.hd .hb-wx span{font:700 15px/1 var(--hd-display);letter-spacing:.03em;font-variant-numeric:tabular-nums}
.pb.hd .hb-wx span{display:flex;align-items:center;gap:3px;padding-left:5px;border-left:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.85)}
.pb.hd .hb-wx i{display:block;width:12px;height:12px;color:var(--hd-cyan,#7dd8f0)}
.pb.hd .pb-dd>span{display:inline-flex;align-items:center;height:25px;margin:6px 6px 0 0;padding:0 10px;border-radius:13px;background:var(--hd-glass);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);
  border:1px solid var(--hd-line);font:700 14px/1 var(--hd-display);letter-spacing:.06em;color:#fff}

.pb.hd .pb-pbp{display:flex;align-items:stretch;gap:0;max-width:100%;height:28px;margin-top:4px;padding:0;border-radius:6px;overflow:hidden;text-align:left;text-shadow:none;
  opacity:0;transform:translateX(-18px);transition:opacity .3s,transform .4s cubic-bezier(.2,.9,.3,1)}
.pb.hd .pb-pbp:empty{display:none}
.pb.hd .pb-pbp.on{opacity:1;transform:none}
.pb.hd .pb-pbp strong{display:grid;place-items:center;flex:none;padding:0 8px;background:var(--a2,${YELLOW});color:var(--k2,#0b0d10);font:800 12px/1 var(--hd-display);letter-spacing:.1em}
.pb.hd .pb-pbp em{display:block;align-self:center;padding:0 10px;font:600 13.5px/1 var(--hd-body);font-style:normal;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pb.hd .pb-pbp u{text-decoration:none;color:var(--hd-green);font-weight:700}

/* ---------- top right: pause and sound ---------- */
.pb.hd .pb-tools{right:${Rt};top:${Q};flex-direction:column;gap:8px}
.pb.hd .pb-tools button{width:40px;height:40px;border-radius:50%;color:#fff;padding:0}
.pb.hd .pb-tools button:active{transform:scale(.94)}
.pb.hd .pb-tools svg{width:17px;height:17px}

/* ---------- bottom: play call (yellow), timeout and the other chips ---------- */
.pb.hd .pb-bar{left:calc(env(safe-area-inset-left,0px) + 12px);right:calc(env(safe-area-inset-right,0px) + 12px);bottom:calc(${B} + 14px);gap:8px;align-items:stretch;justify-content:stretch;flex-wrap:wrap-reverse}
.pb.hd .pb-bar button{pointer-events:auto;height:56px;border-radius:14px;padding:0 14px;font:800 19px/1 var(--hd-display);letter-spacing:.05em;color:#fff;-webkit-tap-highlight-color:transparent}
.pb.hd .pb-bar button:active{transform:translateY(2px)}
.pb.hd .pb-bar>button:not(.pb-call):not(.hb-chip){background:var(--hd-glass);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);border:1px solid var(--hd-line);box-shadow:0 8px 22px rgba(0,0,0,.4)}
.pb.hd .pb-bar .pb-call{flex:4 1 130px;min-width:0;display:flex;align-items:center;gap:10px;padding:0 10px 0 18px;text-align:left;color:#16130a;border:0;
  background:linear-gradient(180deg,#ffe172,var(--hd-yellow) 55%,#f2c21c);box-shadow:0 8px 22px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.6)}
.pb.hd .pb-call>span{flex:1;min-width:0;display:grid;gap:3px}
.pb.hd .pb-call small{font:700 11px/1 var(--hd-body);letter-spacing:.14em;opacity:.62}
.pb.hd .pb-call b{font:800 24px/1 var(--hd-display);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb.hd .pb-call b.long{font-size:19px;line-height:1.1}   /* a long name (Post-Corner · Pistol) steps down before it would cut off */
.pb.hd .pb-call .chev{flex:none;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.12);display:grid;place-items:center}
.pb.hd .pb-call .chev svg{width:17px;height:17px}
.pb.hd .hb-chip{display:grid;align-content:center;justify-items:center;gap:4px;flex:0 0 auto}
.pb.hd .hb-chip b{font:800 19px/1 var(--hd-display);letter-spacing:.05em}
.pb.hd .hb-chip small{font:700 10.5px/1 var(--hd-body);letter-spacing:.1em;color:var(--hd-mute)}
.pb.hd .hb-chip.go{background:#fff;color:#0b0d10;border:0}
.pb.hd .pb-bar:has(.pb-call) .hb-chip:not(.hb-dice):not([data-pb="timeout"]){flex:1 0 auto}   /* the late-game row over the play (spike, kneel, FG) shares the width evenly; the play keeps its room */
.pb.hd .pb-bar .hb-dice,.pb.hd .pb-bar:has(.pb-call) .hb-dice{flex:none;gap:5px;width:64px;padding:0;color:#fff}
.pb.hd .hb-dice .wxi{width:24px;height:24px}
.pb.hd .hb-dice small{font-size:9.5px;letter-spacing:.12em}
.pb.hd .hb-dice.roll .wxi{animation:hbRoll .55s cubic-bezier(.2,.8,.3,1.15) both}
@keyframes hbRoll{0%{transform:rotate(0) scale(1)}35%{transform:rotate(-200deg) scale(.7)}100%{transform:rotate(-360deg) scale(1)}}
@media (prefers-reduced-motion:reduce){.pb.hd .hb-dice.roll .wxi{animation:none}}
.pb.hd .hb-chip.go small{color:#4a525c}

/* ---------- the hint line ---------- */
.pb.hd .pb-hint{left:16px;right:16px;bottom:calc(${B} + 12px);font:600 12.5px/1.35 var(--hd-body);color:rgba(255,255,255,.94);text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 10px rgba(0,0,0,.75);opacity:1}
/* A light glass backing, so the hint reads over end zone paint and the crowd. */
.pb.hd .pb-hint:not(:empty){background:rgba(12,14,18,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:12px;padding:5px 10px}
.pb.hd .pb-bar:not(:empty)+.pb-hint{bottom:calc(${B} + 24px + var(--pb-barh, 56px))}   /* just above the bar, one row or two (setBar measures it) */
.pb.hd .pb-moves:not([hidden])~.pb-hint,.pb.hd .pb-jump:not([hidden])~.pb-hint{left:calc(env(safe-area-inset-left,0px) + 186px);text-align:left;bottom:calc(${B} + 20px)}
.pb.hd .pb-jump:not([hidden])~.pb-hint{left:calc(env(safe-area-inset-left,0px) + 120px)}

/* On a return the hint is a slim pill up top, under the bug, so the field down low (your returner, the landing spot,
   FAIR CATCH) is clear. */
.pb.hd.pb-hint-top .pb-hint,.pb.hd.pb-hint-top .pb-bar:not(:empty)+.pb-hint{top:calc(env(safe-area-inset-top,0px) + 136px);bottom:auto;left:50%;right:auto;transform:translateX(-50%);
  width:max-content;max-width:calc(100% - 32px);text-align:center;font-size:12px;padding:5px 12px;border-radius:999px}
.pb.hd.pb-hint-top .pb-moves:not([hidden])~.pb-hint{left:50%;bottom:auto}
/* ---------- JUKE / TRUCK, JUMP: round glass under the left thumb, yellow when it's time ---------- */
.pb.hd .pb-moves{left:calc(env(safe-area-inset-left,0px) + 12px);bottom:calc(${B} + 12px);gap:6px;padding:6px;border-radius:46px}
.pb.hd .pb-mv,.pb.hd .pb-jump{width:76px;height:76px;border-radius:50%;border:0;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);color:#fff;
  font:800 19px/1 var(--hd-display);letter-spacing:.06em;transition:background .15s,color .15s,box-shadow .15s,transform .08s}
.pb.hd .pb-mv:active,.pb.hd .pb-jump:active{transform:scale(.93);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
.pb.hd .pb-mv.hot,.pb.hd .pb-jump.hot{background:var(--hd-yellow);color:#16130a;box-shadow:0 0 0 3px rgba(255,210,63,.35),0 0 26px rgba(255,210,63,.65);animation:hbHot .5s ease-in-out infinite alternate}
@keyframes hbHot{to{box-shadow:0 0 0 7px rgba(255,210,63,.18),0 0 34px rgba(255,210,63,.85)}}
.pb.hd .pb-jump{left:calc(env(safe-area-inset-left,0px) + 12px);bottom:calc(${B} + 12px);width:92px;height:92px;font-size:22px;color:rgba(255,255,255,.55);
  background:var(--hd-glass);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);box-shadow:0 10px 28px rgba(0,0,0,.45),inset 0 0 0 1px var(--hd-line),inset 0 0 0 7px rgba(255,255,255,.06)}
.pb.hd .pb-jump.hot{color:#16130a}

/* ---------- the punt's drop gauge (left edge) ---------- */
.pb.hd .pb-gauge{position:absolute;left:calc(env(safe-area-inset-left,0px) + 12px);top:50%;transform:translateY(-50%);z-index:3;width:80px;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;
  border-radius:22px;overflow:hidden;background:var(--hd-glass);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);border:1px solid rgba(255,255,255,.14);
  box-shadow:0 14px 34px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08);animation:hgIn .38s cubic-bezier(.2,.9,.25,1.12) both;transition:box-shadow .2s,opacity .35s}
.pb.hd .pb-gauge[hidden]{display:none}
.pb.hd .pb-gauge.out{opacity:0}
.pb.hd .hg-cap{position:relative;width:100%;height:40px;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--k);
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 80%,#fff) 0%,var(--c) 46%,color-mix(in srgb,var(--c) 76%,#000) 100%)}
.pb.hd .hg-cap::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--a)}
.pb.hd .hg-disc{flex:none;width:22px;height:22px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.pb.hd .hg-disc img{width:17px;height:17px;object-fit:contain}
.pb.hd .hg-disc:empty{display:none}
.pb.hd .hg-cap b{font:800 17px/1 var(--hd-display);letter-spacing:.04em;padding-top:1px}
.pb.hd .hg-rush{height:0;margin-top:8px;display:flex;align-items:center;gap:4px;padding:0 7px;border-radius:999px;background:var(--hd-red);color:#fff;font:800 11px/1 var(--hd-display);letter-spacing:.12em;
  opacity:0;transform:scale(.6);transition:opacity .15s,transform .2s cubic-bezier(.2,.9,.25,1.4),height .15s}
.pb.hd .hg-rush i{width:0;height:0;border-left:5px solid #fff;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent;transform:rotate(90deg)}
.pb.hd .pb-gauge.rush .hg-rush{height:17px;opacity:1;transform:none;animation:hgRushChip .28s ease-in-out infinite alternate}
@keyframes hgRushChip{to{box-shadow:0 0 12px rgba(255,77,79,.9)}}
.pb.hd .hg-rail{position:relative;width:56px;height:min(33vh,224px);margin-top:10px}
.pb.hd .hg-tube{position:absolute;inset:0;display:block;overflow:visible}
.pb.hd .hg-spent{position:absolute;left:17px;width:22px;top:0;height:0;border-radius:11px 11px 0 0;background:rgba(10,12,16,.55)}
.pb.hd .hg-trail{position:absolute;left:25px;width:6px;top:0;height:0;border-radius:3px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.75));will-change:transform,height}
.pb.hd .hg-ball{position:absolute;left:11px;top:-11px;width:34px;height:22px;will-change:transform;filter:drop-shadow(0 3px 3px rgba(0,0,0,.6))}
.pb.hd .hg-flash{position:absolute;left:4px;top:-24px;width:48px;height:48px;border-radius:50%;opacity:0;pointer-events:none;
  background:radial-gradient(circle,rgba(255,255,255,.95) 0%,rgba(255,255,255,.5) 30%,rgba(255,255,255,0) 68%)}
.pb.hd .pb-gauge.hit .hg-flash{animation:hgFlash .45s ease-out both}
@keyframes hgFlash{0%{opacity:1;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}
.pb.hd .hg-foot{height:26px;margin-top:6px;display:grid;place-items:center}
.pb.hd .hg-cleat{width:44px;height:24px;transform-origin:12% 80%;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}
.pb.hd .pb-gauge.hit .hg-foot .hg-cleat{animation:hgSwing .42s cubic-bezier(.2,.9,.3,1) both}
.pb.hd .hg-runner{display:grid;place-items:center} .pb.hd .hg-runner .hg-cleat{width:36px;height:20px}
.pb.hd .hg-tee{width:30px;height:30px;overflow:visible;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}
.pb.hd .hg-tee .tb{transform-box:fill-box;transform-origin:50% 50%}
.pb.hd .pb-gauge.hit .hg-tee .tb{animation:hgLaunch .5s cubic-bezier(.2,.7,.3,1) both}
@keyframes hgLaunch{0%{transform:none;opacity:1}100%{transform:translate(16px,-30px) rotate(150deg) scale(.7);opacity:0}}
.pb.hd .pb-gauge.ko .hg-foot{height:32px}
.pb.hd .pb-gauge.ko .hg-cap{gap:4px} .pb.hd .pb-gauge.ko .hg-cap b{font-size:14px;letter-spacing:.02em} .pb.hd .pb-gauge.ko .hg-disc{width:19px;height:19px} .pb.hd .pb-gauge.ko .hg-disc img{width:14px;height:14px}
@keyframes hgSwing{0%{transform:rotate(0)}22%{transform:rotate(-38deg) translateY(-3px)}100%{transform:rotate(0)}}
.pb.hd .hg-steps{display:flex;gap:2px;margin-top:8px;max-width:100%}
.pb.hd .hg-steps i{font:800 8.5px/1 var(--hd-display);letter-spacing:.03em;font-style:normal;padding:3px 3.5px 2px;border-radius:999px;color:rgba(255,255,255,.35);background:rgba(255,255,255,.06);transition:background .2s,color .2s}
.pb.hd .hg-steps i.done{color:#1b1400;background:rgba(255,210,63,.75)}
.pb.hd .hg-steps i.on{color:#0b0d10;background:#fff;box-shadow:0 0 10px rgba(255,255,255,.45)}
.pb.hd .hg-cue{min-height:40px;width:100%;display:grid;align-content:center;justify-items:center;gap:3px;padding:4px 4px 9px}
.pb.hd .hg-cue:empty,.pb.hd .pb-gauge.hit .hg-cue{display:none}
.pb.hd .hg-cue b{font:800 16px/1 var(--hd-display);letter-spacing:.05em;color:#fff}
.pb.hd .hg-cue small{font:700 8.5px/1 var(--hd-body);letter-spacing:.1em;color:var(--hd-mute)}
.pb.hd .hg-lift{width:18px;height:18px;color:var(--hd-yellow);animation:hgLift 1s ease-in-out infinite}
@keyframes hgLift{0%,100%{transform:translateY(2px)}50%{transform:translateY(-3px)}}
.pb.hd .hg-bar{width:44px;height:5px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
.pb.hd .hg-bar i{display:block;height:100%;width:0;border-radius:3px;background:var(--hd-yellow);box-shadow:0 0 8px rgba(255,210,63,.7)}
.pb.hd .hg-now{color:var(--hd-yellow) !important;animation:hgNow .32s ease-in-out infinite alternate}
@keyframes hgNow{to{transform:scale(1.12);text-shadow:0 0 12px rgba(255,210,63,.8)}}
.pb.hd .pb-gauge:not(.hit) .hg-res{display:none}
.pb.hd .pb-gauge.aiming .hg-ball{animation:hgBob 1.2s ease-in-out infinite}
@keyframes hgBob{50%{margin-top:-7px}}
.pb.hd .hg-res{min-height:34px;width:100%;display:grid;align-content:center;justify-items:center;gap:3px;padding:4px 2px 9px;opacity:0;transform:translateY(4px);transition:opacity .2s,transform .25s cubic-bezier(.2,.9,.25,1.3)}
.pb.hd .pb-gauge.hit .hg-res{opacity:1;transform:none}
.pb.hd .hg-res b{font:800 16px/1 var(--hd-display);letter-spacing:.04em;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.pb.hd .hg-res small{font:700 8.5px/1.1 var(--hd-body);letter-spacing:.08em;color:var(--hd-mute);text-align:center}
.pb.hd .pb-gauge.hit-g{box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 2px rgba(61,220,132,.6),0 0 34px rgba(61,220,132,.65)}
.pb.hd .pb-gauge.hit-y{box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 2px rgba(255,210,63,.55),0 0 26px rgba(255,210,63,.5)}
.pb.hd .pb-gauge.hit-a{box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 2px rgba(255,176,32,.5),0 0 22px rgba(255,176,32,.45)}
.pb.hd .pb-gauge.hit-r{box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 2px rgba(255,77,79,.55),0 0 22px rgba(255,77,79,.5)}
@keyframes hgIn{from{transform:translate(-18px,-50%);opacity:0}}

/* ---------- replay ---------- */
.pb.hd .pb-rp{right:${Rt};bottom:calc(${B} + 14px);height:50px;padding:0 18px 0 14px;border-radius:25px;display:flex;align-items:center;gap:8px;color:#fff;font:800 18px/1 var(--hd-display);letter-spacing:.08em}
.pb.hd .pb-rp[hidden]{display:none}
.pb.hd .pb-rp::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--hd-red);box-shadow:0 0 8px var(--hd-red)}
.pb.hd .pb-rlabel{left:${L};top:calc(9vh + 10px);display:none;align-items:center;gap:7px;padding:6px 10px;border-radius:5px;background:rgba(10,12,16,.82);color:#fff;
  font:800 16px/1 var(--hd-display);letter-spacing:.16em;text-shadow:none;animation:none;z-index:2}
.pb.hd .pb-rlabel::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--hd-red);animation:pb-blink 1s steps(2) infinite}
.pb.hd.pb-replaying .pb-rlabel{display:flex}
.pb.hd.pb-replaying .pb-hud{opacity:0;transition:opacity .2s}

/* ---------- the grade pop-up ---------- */
.pb.hd .pb-grade{top:calc(env(safe-area-inset-top,0px) + 104px);width:min(330px,calc(100% - 24px));padding:12px 14px;border-radius:16px;gap:4px 12px;font-family:var(--hd-body);z-index:3}
.pb.hd .pb-gl{font:800 52px/.9 var(--hd-display);text-shadow:0 2px 12px rgba(0,0,0,.4);min-width:54px;text-align:center}
.pb.hd .pb-gw em{font:800 22px/1 var(--hd-display);letter-spacing:.03em;color:#fff}
.pb.hd .pb-gw span{font:600 12px/1.2 var(--hd-body);color:var(--hd-mute)}
.pb.hd .pb-gbars{gap:5px;margin-top:6px}
.pb.hd .pb-gb{grid-template-columns:72px 1fr;gap:8px;font:800 12px/1 var(--hd-display);letter-spacing:.1em;color:var(--hd-mute)}
.pb.hd .pb-gb i{height:7px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
.pb.hd .pb-gb i b{border-radius:4px}

/* ---------- the big moments ---------- */
.pb.hd .pb-banner{top:29%;transform:none;opacity:0;animation:none;transition:opacity .3s;gap:0;z-index:3}
.pb.hd .pb-banner.on{opacity:1;animation:none}
.pb.hd .pb-banner.hb-slab{top:33%}
/* the slab: FIRST DOWN, INTERCEPTED, FUMBLE, GOOD / NO GOOD, FLAG, TIMEOUT... */
.pb.hd .hb-swrap{display:grid;justify-items:center;gap:0}
.pb.hd .hb-sw{padding:8px 22px 6px;font:800 clamp(34px,11vw,54px)/1 var(--hd-display);letter-spacing:.02em;color:var(--bk);background:var(--bc);transform:skewX(-10deg);
  box-shadow:0 5px 0 rgba(0,0,0,.35),0 16px 34px rgba(0,0,0,.45);clip-path:inset(0 100% 0 0);animation:hbWipe .32s cubic-bezier(.7,0,.2,1) forwards;white-space:nowrap;max-width:94vw;overflow:hidden;text-overflow:ellipsis}
.pb.hd .hb-ss{margin:-2px 0 0 18px;padding:6px 12px;font:600 14px/1 var(--hd-body);background:#0b0d10;color:#e9edf1;opacity:0;animation:hbUp .3s ease-out .22s forwards;max-width:86vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@keyframes hbWipe{to{clip-path:inset(0 0 0 0)}}
@keyframes hbUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
/* the TOUCHDOWN wipe: a skewed band in the scorer's colors, the logo pops, the word slams in letter by letter */
.pb.hd .hb-bwrap{position:relative;width:100%;height:170px}
.pb.hd .hb-band{position:absolute;left:-20px;right:-20px;top:26px;height:116px;transform:skewY(-6deg);overflow:hidden;
  background:linear-gradient(100deg,color-mix(in srgb,var(--c) 68%,#000) 0%,var(--c) 42%,color-mix(in srgb,var(--c) 84%,#fff) 100%);
  box-shadow:0 -5px 0 var(--a),0 5px 0 var(--a),0 18px 40px rgba(0,0,0,.6);clip-path:inset(-60px 100% -60px -60px);animation:hbWipeB .5s cubic-bezier(.7,0,.2,1) .12s forwards}
@keyframes hbWipeB{to{clip-path:inset(-60px -60px -60px -60px)}}
.pb.hd .hb-band::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,transparent 0 28px,rgba(255,255,255,.06) 28px 56px)}
.pb.hd .hb-band::after{content:"";position:absolute;top:0;bottom:0;width:90px;left:-120px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);transform:skewX(-20deg);animation:hbShine 1s ease-in-out 1s forwards}
@keyframes hbShine{to{left:120%}}
.pb.hd .hb-word{position:absolute;left:0;right:0;top:44px;text-align:center;white-space:nowrap;font:800 clamp(58px,19.5vw,96px)/1 var(--hd-display);letter-spacing:.01em;color:var(--k);
  transform:skewY(-6deg) skewX(-8deg);text-shadow:0 3px 0 rgba(0,0,0,.3),0 0 30px rgba(0,0,0,.25)}
.pb.hd .hb-word i{display:inline-block;font-style:normal;opacity:0;transform:translateX(60px);animation:hbLetter .42s cubic-bezier(.2,.9,.3,1.25) forwards}
@keyframes hbLetter{to{opacity:1;transform:none}}
.pb.hd .hb-blogo{position:absolute;left:50%;top:-18px;width:66px;height:66px;margin-left:-33px;border-radius:50%;background:#fff;display:grid;place-items:center;
  box-shadow:0 0 0 4px var(--a),0 8px 20px rgba(0,0,0,.5);transform:scale(0);animation:hbPop .42s cubic-bezier(.3,1.6,.5,1) .78s forwards;z-index:1}
.pb.hd .hb-blogo img{width:52px;height:52px;object-fit:contain}
@keyframes hbPop{to{transform:none}}
.pb.hd .hb-bsub{position:absolute;left:50%;top:158px;text-transform:uppercase;transform:translateX(-50%);white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis;padding:7px 14px;border-radius:5px;
  background:rgba(10,12,16,.86);color:#fff;font:800 18px/1 var(--hd-display);letter-spacing:.08em;box-shadow:inset 3px 0 0 var(--a),0 8px 20px rgba(0,0,0,.45);opacity:0;animation:hbSub .4s ease-out 1s forwards}
@keyframes hbSub{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}

/* ---------- Florida State: garnet and gold, a spear flies through and sticks, sparks, the word in gold ---------- */
.pb.hd .hb-big.fsu .hb-band{--c:${GARNET};--a:${GOLD};background:linear-gradient(100deg,#3e0f1b 0%,${GARNET} 40%,#9a3d52 100%);
  box-shadow:0 -6px 0 ${GOLD},0 -9px 0 #3e0f1b,0 6px 0 ${GOLD},0 9px 0 #3e0f1b,0 18px 44px rgba(0,0,0,.65);animation:hbWipeB .5s cubic-bezier(.7,0,.2,1) .12s forwards,hbThunk .35s ease-out .62s 1}
.pb.hd .hb-big.fsu .hb-chev{position:absolute;inset:0;opacity:.16;background:
  repeating-linear-gradient(60deg,transparent 0 16px,${GOLD} 16px 19px,transparent 19px 38px),repeating-linear-gradient(-60deg,transparent 0 16px,${GOLD} 16px 19px,transparent 19px 38px);
  -webkit-mask:linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent);mask:linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent)}
@keyframes hbThunk{0%{transform:skewY(-6deg) translateY(0)}30%{transform:skewY(-6deg) translateY(5px)}65%{transform:skewY(-6deg) translateY(-2px)}100%{transform:skewY(-6deg)}}
.pb.hd .hb-big.fsu .hb-word{color:${GOLD};top:48px;filter:drop-shadow(0 3px 0 #2c0a13) drop-shadow(0 0 14px rgba(206,184,136,.35));text-shadow:none}
.pb.hd .hb-big.fsu .hb-word i{transform:translateY(-40px) scale(1.4);animation-name:hbSlam;
  background:linear-gradient(180deg,#fff3cf 0%,#e6cf98 45%,${GOLD} 55%,#a88c58 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
@keyframes hbSlam{60%{opacity:1;transform:translateY(3px) scale(.96)}to{opacity:1;transform:none}}
.pb.hd .hb-fly{position:absolute;left:0;right:0;top:12px;height:44px;transform:rotate(-6deg);pointer-events:none;z-index:2}
.pb.hd .hb-spear{position:absolute;left:50%;top:0;width:300px;height:42px;margin-left:-150px;transform:translateX(-140vw);animation:hbThrow .5s cubic-bezier(.3,.6,.35,1) .14s forwards;filter:drop-shadow(0 4px 4px rgba(0,0,0,.45))}
@keyframes hbThrow{80%{transform:translateX(4px)}90%{transform:translateX(-3px) rotate(-1deg)}to{transform:none}}
.pb.hd .hb-feath{transform-origin:244px 27px;animation:hbSway 1.1s ease-in-out .7s infinite alternate}
@keyframes hbSway{from{transform:rotate(-8deg)}to{transform:rotate(10deg)}}
.pb.hd .hb-trail{position:absolute;right:50%;top:17px;height:9px;width:0;margin-right:-130px;border-radius:5px;opacity:0;
  background:linear-gradient(90deg,transparent,rgba(255,170,60,.0) 10%,rgba(255,150,40,.75) 60%,#fff2b8);filter:blur(1.5px);animation:hbTrail .62s ease-out .14s forwards}
@keyframes hbTrail{0%{opacity:0;width:0}20%{opacity:1}60%{opacity:.9;width:70vw}100%{opacity:0;width:70vw}}
.pb.hd .hb-spark{position:absolute;left:calc(50% + 150px);top:34px;width:0;height:0;z-index:2}
.pb.hd .hb-spark i{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:#ffe9a8;box-shadow:0 0 8px #ffbf3c;opacity:0;
  transform:rotate(var(--r)) translateX(0);animation:hbSpark .6s ease-out .6s forwards}
@keyframes hbSpark{0%{opacity:1;transform:rotate(var(--r)) translateX(4px)}100%{opacity:0;transform:rotate(var(--r)) translateX(var(--d)) scale(.4)}}
.pb.hd .hb-big.fsu .hb-blogo{box-shadow:0 0 0 4px ${GOLD},0 0 0 7px ${GARNET},0 8px 24px rgba(0,0,0,.55);top:-26px;animation-delay:.9s}
.pb.hd .hb-kick{position:absolute;left:0;right:0;top:128px;text-align:center;font:800 13px/1 var(--hd-display);letter-spacing:.42em;color:${GOLD};text-shadow:0 1px 2px #000;opacity:0;animation:hbUp .4s ease-out 1.15s forwards;transform:skewY(-6deg)}
.pb.hd .hb-big.fsu .hb-bsub{top:158px;background:${GARNET};color:${GOLD};box-shadow:inset 0 0 0 1.5px ${GOLD},0 8px 20px rgba(0,0,0,.5);animation-delay:1.25s}
@media (max-width:360px){.pb.hd .hb-spear{width:250px;margin-left:-125px}.pb.hd .hb-spark{left:calc(50% + 125px)}}

@media (prefers-reduced-motion:reduce){.pb.hd .pb-banner *,.pb.hd .hb-dd,.pb.hd .hb-wx,.pb.hd .hb-sc,.pb.hd .pb-mv,.pb.hd .pb-jump,.pb.hd .hb-tm.fsu::before{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}

/* ---------- phones on their side: every pixel of height counts ----------
   The score bug a size down with the down & distance beside it rather than under it; the play button in the bottom
   right corner (under the right thumb) instead of across the whole width, the hint beside it. pixelbowl.js tells the
   renderer what these cover, so it frames the field in the band between. */
@media (orientation:landscape) and (max-height:520px){
  .pb.hd .pb-hud{display:flex;flex-wrap:wrap;align-items:flex-start;gap:0 6px;width:auto;max-width:calc(100% - 70px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px))}
  .pb.hd .pb-bug{height:42px;border-radius:8px}
  .pb.hd .hb-tm{width:clamp(86px,14vw,112px);gap:5px;padding-left:5px}
  .pb.hd .hb-disc{width:23px;height:23px} .pb.hd .hb-disc img{width:18px;height:18px}
  .pb.hd .hb-nm{gap:3px} .pb.hd .hb-nm b{font-size:16px}
  .pb.hd .hb-pips i{width:8px}
  .pb.hd .hb-sc{width:32px;font-size:25px}
  .pb.hd .hb-clk{width:54px} .pb.hd .hb-clk span{font-size:10.5px} .pb.hd .hb-clk b{font-size:20px}
  .pb.hd .pb-bug .pb-tm b{font-size:16px} .pb.hd .pb-bug .pb-tm img{width:26px;height:26px}
  .pb.hd .pb-bug .pb-mid b{font-size:19px} .pb.hd .pb-bug .pb-mid span{font-size:10px}
  .pb.hd .pb-dd{padding:0;margin:0}
  .pb.hd .hb-dd{height:42px;border-radius:8px;transform:translateX(-10px);opacity:0;animation:hbDdSide .4s cubic-bezier(.2,.9,.25,1.1) .12s forwards}
  .pb.hd .hb-dd>*{padding:0 9px;font-size:15px}
  .pb.hd .hb-dd .dn{font-size:16px}
  .pb.hd .pb-pbp{flex-basis:100%;height:24px}
  .pb.hd .pb-tools button{width:36px;height:36px}
  .pb.hd .pb-bar{left:auto;right:${Rt};width:min(340px,44vw);bottom:calc(${B} + 8px);gap:6px}
  .pb.hd .pb-bar button{height:46px;border-radius:12px;font-size:16px;padding:0 11px}
  .pb.hd .pb-bar .pb-call{padding:0 8px 0 14px}
  .pb.hd .pb-call small{font-size:9.5px} .pb.hd .pb-call b{font-size:20px}
  .pb.hd .pb-call .chev{width:30px;height:30px}
  .pb.hd .hb-chip b{font-size:16px} .pb.hd .hb-chip small{font-size:9.5px}
  .pb.hd .pb-hint,.pb.hd .pb-bar:not(:empty)+.pb-hint{left:${L};right:calc(min(340px,44vw) + 26px + env(safe-area-inset-right,0px));bottom:calc(${B} + 12px);text-align:left;font-size:11.5px;line-height:1.3}
  .pb.hd .pb-bar:empty+.pb-hint{right:${Rt}}
  .pb.hd.pb-hint-top .pb-hint,.pb.hd.pb-hint-top .pb-bar:not(:empty)+.pb-hint{top:calc(env(safe-area-inset-top,0px) + 98px);left:50%;right:auto;bottom:auto}
  .pb.hd .pb-gauge{top:calc(50% + 14px);width:66px}
  .pb.hd .hg-cap{height:32px} .pb.hd .hg-cap b{font-size:15px} .pb.hd .hg-disc{width:19px;height:19px} .pb.hd .hg-disc img{width:15px;height:15px}
  .pb.hd .hg-rail{height:min(38vh,140px);margin-top:7px}
  .pb.hd .hg-foot{margin-top:3px} .pb.hd .hg-res{min-height:28px;padding-bottom:6px} .pb.hd .hg-res b{font-size:14px}
}
@keyframes hbDdSide{to{transform:none;opacity:1}}
`;
