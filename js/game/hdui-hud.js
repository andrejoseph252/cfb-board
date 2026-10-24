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
export const clockInner = st => `<i class="${st.running ? 'on' : ''}"></i><em>${esc(st.clock)}</em>`;

/* ---------- the down & distance tab (slides out from under the bug each time it changes) ---------- */
export function dd({ text, goal, spot, side, tell }){
  return `<div class="hb-dd"><span class="dn${goal ? ' goal' : ''}">${esc(text)}</span><span class="sp" style="--oc:${esc(side || '#888')}"><i></i>${esc(spot)}</span>${tell ? `<span class="tell">${esc(tell)}</span>` : ''}</div>`;
}

/* ---------- the conditions tab (weather.js): its mark, the temperature, the wind and which way it blows ---------- */
export const wx = (c, portrait) => `<div class="hb-wx" title="${esc(W.describe(c))}">${W.mark(c)}<b>${c.temp}°</b>${c.wind ? `<span><i style="--r:${W.windTurn(c, portrait)}deg">${W.ARROW}</i>${Math.abs(c.wind)}</span>` : ''}</div>`;

/* ---------- the bottom bar: the play call (yellow) and the glass chips ---------- */
export const callBtn = name => `<button type="button" data-pb="call" class="pb-call"><span><small>PLAY</small><b>${esc(name)}</b></span><i class="chev">${CHEV}</i></button>`;
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
.pb.hd .pb-bar .pb-call{flex:1 1 150px;min-width:0;display:flex;align-items:center;gap:10px;padding:0 10px 0 18px;text-align:left;color:#16130a;border:0;
  background:linear-gradient(180deg,#ffe172,var(--hd-yellow) 55%,#f2c21c);box-shadow:0 8px 22px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.6)}
.pb.hd .pb-call>span{flex:1;min-width:0;display:grid;gap:3px}
.pb.hd .pb-call small{font:700 11px/1 var(--hd-body);letter-spacing:.14em;opacity:.62}
.pb.hd .pb-call b{font:800 24px/1 var(--hd-display);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb.hd .pb-call .chev{flex:none;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.12);display:grid;place-items:center}
.pb.hd .pb-call .chev svg{width:17px;height:17px}
.pb.hd .hb-chip{display:grid;align-content:center;justify-items:center;gap:4px;flex:0 0 auto}
.pb.hd .hb-chip b{font:800 19px/1 var(--hd-display);letter-spacing:.05em}
.pb.hd .hb-chip small{font:700 10.5px/1 var(--hd-body);letter-spacing:.1em;color:var(--hd-mute)}
.pb.hd .hb-chip.go{background:#fff;color:#0b0d10;border:0}
.pb.hd .hb-chip.go small{color:#4a525c}

/* ---------- the hint line ---------- */
.pb.hd .pb-hint{left:16px;right:16px;bottom:calc(${B} + 12px);font:600 12.5px/1.35 var(--hd-body);color:rgba(255,255,255,.94);text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 10px rgba(0,0,0,.75);opacity:1}
/* A light glass backing, so the hint reads over end zone paint and the crowd. */
.pb.hd .pb-hint:not(:empty){background:rgba(12,14,18,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:12px;padding:5px 10px}
.pb.hd .pb-bar:not(:empty)+.pb-hint{bottom:calc(${B} + 80px)}
.pb.hd .pb-moves:not([hidden])~.pb-hint,.pb.hd .pb-jump:not([hidden])~.pb-hint{left:calc(env(safe-area-inset-left,0px) + 186px);text-align:left;bottom:calc(${B} + 20px)}
.pb.hd .pb-jump:not([hidden])~.pb-hint{left:calc(env(safe-area-inset-left,0px) + 120px)}

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
`;
