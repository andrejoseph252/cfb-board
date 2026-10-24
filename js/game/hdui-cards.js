/* The game's interface: every card as a bottom sheet (coin toss, 4th down, drives, the defensive call, the flag, halftime, the
   final, practice summaries, challenge intros), the play-call sheet, and the menus (setup, practice, playbook), plus
   season mode's screens. Board-native: frosted dark glass sheets with a grabber, big thumb buttons, Big Shoulders
   Display for headlines and numbers, Public Sans for words. The primary button is the broadcast's yellow.
   Florida State (id 52) gets garnet and gold: its team cards, the sheet's edge when it's your team, and its own
   final card when the Seminoles win. */
import { teamPaint, vars } from './hdkit.js';

export const FSU = '52';
export const isFSU = t => String(t?.id) === FSU;

/* Two teams' style attributes for HD (fills kept apart, readable ink, the alt for a trim line). */
export function pair(me, opp){
  const P = teamPaint(me, opp);
  return [vars(P.me), vars(P.opp)];
}

/* A spear, drawn here (not a logo): long shaft, a leaf-shaped head, two feathers tied near the butt. */
export const SPEAR = `<svg class="pb-spear" viewBox="0 0 240 28" aria-hidden="true"><defs><linearGradient id="pbsg" x1="0" x2="1"><stop offset="0" stop-color="#8a6a3c"/><stop offset="1" stop-color="#e6d3a3"/></linearGradient></defs>
  <rect x="14" y="12.5" width="190" height="3" rx="1.5" fill="url(#pbsg)"/>
  <path d="M202 14 L222 6.5 Q236 14 222 21.5 Z" fill="#ceb888" stroke="#5c4a24" stroke-width="1"/><path d="M204 14 L230 14" stroke="#fff3cf" stroke-width="1" opacity=".7"/>
  <rect x="196" y="10.5" width="7" height="7" rx="1.5" fill="#782f40"/><rect x="40" y="11" width="6" height="6" rx="1.5" fill="#782f40"/>
  <path d="M42 15 Q30 25 14 26 Q26 20 34 15 Z" fill="#782f40"/><path d="M42 13 Q30 3 14 2 Q26 8 34 13 Z" fill="#ceb888"/></svg>`;

/* The final card's crown when Florida State wins. */
export const fsuWin = (title = 'SEMINOLES WIN') => `<div class="pb-fsuwin">${SPEAR}<b>${title}</b><small>GARNET &amp; GOLD</small></div>`;

const SPEAR_URL = `data:image/svg+xml,${encodeURIComponent(SPEAR.replace('class="pb-spear" ', 'xmlns="http://www.w3.org/2000/svg" '))}`;
const FLAG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 21V4' stroke='%231a1205' stroke-width='2.4' stroke-linecap='round'/%3E%3Cpath d='M6 4h12l-3 4.5L18 13H6z' fill='%231a1205'/%3E%3C/svg%3E";
const SIDELINE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233ddc84' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 12l5 5L20 6'/%3E%3C/svg%3E";

export const CSS = `
/* ---------- the sheet: every card and menu rises from the bottom ---------- */
.pb.hd{--hd-pill:#f2f2f2;--hd-pill-ink:#0d0d0d;--hd-chip:rgba(255,255,255,.09);--hd-chip2:rgba(255,255,255,.06);--hd-cyan:#7dd8f0;--fsu-g:#782f40;--fsu-y:#ceb888}
.pb.hd .pb-modal{background:linear-gradient(to bottom,rgba(0,0,0,.08) 0%,rgba(0,0,0,.45) 55%,rgba(0,0,0,.62) 100%);font:15px/1.4 var(--hd-body);-webkit-font-smoothing:antialiased;
  padding:var(--pb-top) calc(env(safe-area-inset-right,0px) + 8px) calc(env(safe-area-inset-bottom,0px) + 8px) calc(env(safe-area-inset-left,0px) + 8px)}
.pb.hd .pb-modal.on{display:flex;flex-direction:column}
.pb.hd .pb-modal > *{margin:auto auto 0;flex:none}
/* Light sheets (4th down, the play call) stop above the bottom bar, so a timeout stays in reach. */
.pb.hd .pb-modal.light{background:linear-gradient(to bottom,transparent 55%,rgba(0,0,0,.35));padding-bottom:calc(env(safe-area-inset-bottom,0px) + 80px)}
.pb.hd.pb-tools-on .pb-modal{padding-top:calc(env(safe-area-inset-top,0px) + 60px)}
.pb.hd :is(.pb-card,.pb-setup){position:relative;width:100%;max-width:460px;padding:26px 18px 18px;gap:14px;text-align:left;color:var(--hd-ink);
  background:rgba(22,24,29,.88);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);border:1px solid var(--hd-line);border-radius:34px;
  box-shadow:0 -10px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);animation:hdSheet .32s cubic-bezier(.2,.9,.25,1) both}
.pb.hd .pb-setup{grid-auto-rows:max-content;align-content:start;max-width:520px;max-height:calc(100dvh - var(--pb-top) - env(safe-area-inset-bottom,0px) - 8px);overscroll-behavior:contain;scrollbar-width:none}
.pb.hd :is(.pb-card,.pb-setup)::before{content:"";position:absolute;top:8px;left:50%;width:38px;height:5px;margin-left:-19px;border-radius:3px;background:rgba(255,255,255,.22)}
@keyframes hdSheet{from{transform:translateY(40px);opacity:0}}
@media (prefers-reduced-motion:reduce){.pb.hd :is(.pb-card,.pb-setup){animation:none}}
.pb.hd .pb-modal.stay :is(.pb-card,.pb-card *,.pb-setup,.pb-setup *){animation:none}
.pb.hd .pb-card h2{margin:0;font:800 36px/.92 var(--hd-display);letter-spacing:.005em;text-transform:uppercase;color:#fff;text-shadow:none}
.pb.hd .pb-card p{margin:0;color:rgba(255,255,255,.72);font-size:14px;line-height:1.45}
.pb.hd .pb-sub{margin:0;font:400 13px/1.45 var(--hd-body);color:rgba(255,255,255,.6)}
.pb.hd .pb-sub b{color:#fff}
.pb.hd .pb-x{position:absolute;right:14px;top:16px;width:34px;height:34px;border:0;border-radius:50%;background:var(--hd-chip);color:#fff;z-index:2}
.pb.hd .pb-x svg{width:14px;height:14px;image-rendering:auto}
.pb.hd .pb-ph{min-height:34px;gap:10px}
.pb.hd .pb-ph b{flex:1;font:800 30px/.95 var(--hd-display);color:#fff;letter-spacing:.005em}
.pb.hd .pb-ph .pb-x{position:static}

/* buttons: the broadcast's yellow for the call to make, glass for the rest */
.pb.hd .pb-go{position:relative;min-height:56px;padding:12px 18px;border:0;border-radius:28px;background:var(--hd-yellow);color:#1b1400 !important;
  font:800 22px/1 var(--hd-display);letter-spacing:.04em;text-wrap:balance;box-shadow:0 6px 20px rgba(255,210,63,.22),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.12);transition:transform .12s}
.pb.hd .pb-go:active{transform:scale(.97);box-shadow:0 2px 8px rgba(255,210,63,.2)}
.pb.hd .pb-go.alt{background:var(--hd-chip);color:var(--hd-ink) !important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.pb.hd .pb-go.sm{min-height:44px;font-size:17px;padding:8px 14px}
.pb.hd .pb-go.danger{color:#ff8a80 !important}
.pb.hd .pb-btns{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px}
.pb.hd .pb-btns.col{grid-auto-flow:row}
.pb.hd .pb-setup .pb-go{font-size:22px;padding:12px 18px}

/* segmented controls, chips, switches */
.pb.hd .pb-seg{flex-wrap:nowrap;gap:3px;padding:4px;border-radius:22px;background:var(--hd-chip2)}
.pb.hd .pb-seg button{flex:1 1 0;min-width:0;height:38px;padding:0 6px;border:0;border-radius:19px;background:none;box-shadow:none;
  font:600 13.5px/1 var(--hd-body);color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb.hd .pb-seg button[aria-pressed="true"]{background:var(--hd-pill);color:var(--hd-pill-ink)}
.pb.hd .pb-opt{gap:7px}
.pb.hd .pb-opt > span{font:700 10.5px/1 var(--hd-body);letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);padding-left:4px}
.pb.hd .pb-checks{gap:0;border-radius:20px;background:var(--hd-chip2);overflow:hidden;font:500 14.5px/1.2 var(--hd-body);color:var(--hd-ink)}
.pb.hd .pb-checks label{flex-direction:row-reverse;justify-content:space-between;gap:10px;min-height:46px;padding:0 12px 0 16px}
.pb.hd .pb-checks label + label{box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.pb.hd .pb-checks input{-webkit-appearance:none;appearance:none;flex:none;margin:0;width:46px;height:28px;border-radius:14px;cursor:pointer;
  background:radial-gradient(circle at 14px 50%,#fff 0 10.5px,transparent 11px),rgba(255,255,255,.18);transition:background-color .15s}
.pb.hd .pb-checks input:checked{background:radial-gradient(circle at 32px 50%,#fff 0 10.5px,transparent 11px),var(--hd-green)}
.pb.hd .pb-checks input:focus-visible{outline:2px solid var(--hd-yellow);outline-offset:2px}

/* ---------- the main menu ---------- */
.pb.hd .pb-setup:has(.pb-logo){gap:12px}
.pb.hd .pb-logo{margin:2px 0 4px;padding:0 44px 0 2px;text-align:left;display:block;font:800 22px/.95 var(--hd-display);letter-spacing:.03em;color:rgba(255,255,255,.72);text-shadow:none}
.pb.hd .pb-logo span{display:block}
.pb.hd .pb-logo span + span{margin-top:0;font-size:64px;line-height:.84;color:#fff;letter-spacing:0;text-shadow:none}
.pb.hd .pb-match{grid-template-columns:1fr 40px 1fr;gap:6px;align-items:center}
.pb.hd .pb-team{display:grid;justify-items:start;align-content:start;gap:3px;min-height:132px;padding:12px 12px 11px;border:0;border-radius:26px;text-align:left;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.15),inset 0 -3px 0 var(--a,transparent);transition:transform .12s}
.pb.hd .pb-team:active{transform:scale(.97)}
.pb.hd .pb-team img{order:0;width:44px;height:44px;margin-bottom:5px;padding:5px;object-fit:contain;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.pb.hd .pb-team small{order:1;padding:0;background:none;color:inherit;font:700 10px/1 var(--hd-body);letter-spacing:.12em;opacity:.7}
.pb.hd .pb-team b{order:2;font:800 21px/1 var(--hd-display);overflow-wrap:anywhere}
.pb.hd .pb-rt{order:3;margin-top:3px;font:600 11px/1.2 var(--hd-body);opacity:.75}
.pb.hd .pb-vs{width:40px;height:40px;border-radius:50%;place-items:center;align-content:center;gap:0;background:rgba(255,255,255,.16);color:#fff !important;font:800 14px/1 var(--hd-display)}
.pb.hd .pb-vs i{font-size:12px;line-height:1;opacity:.65;color:#fff}
.pb.hd [data-pb="start"]{min-height:62px;font-size:28px;letter-spacing:.06em}
.pb.hd .pb-take{display:grid;place-items:center;gap:4px;background:var(--hd-chip);color:#fff !important;box-shadow:inset 0 0 0 1.5px rgba(255,210,63,.45)}
.pb.hd .pb-take small{font:500 12px/1.2 var(--hd-body);letter-spacing:0;color:rgba(255,255,255,.6)}
.pb.hd .pb-menu2 .pb-go{font-size:19px}
.pb.hd .pb-rec{font:500 12.5px var(--hd-body);color:rgba(255,255,255,.55)}
/* ---------- game conditions: the weather icons (weather.js), the menu's Conditions row, its sheet, the coin toss chip ---------- */
.pb.hd .wxi{display:block;flex:none;overflow:visible}
.pb.hd .wxi .ws,.pb.hd .wxi .wk{fill:#ffc93c}
.pb.hd .wxi .wr{fill:none;stroke:#ffc93c;stroke-width:2.4;stroke-linecap:round}
.pb.hd .wxi .wm{fill:#ffd76a}
.pb.hd .wxi .wc{fill:#eef2f7;stroke:rgba(10,12,16,.5);stroke-width:1.4}
.pb.hd .wxi .wd{fill:none;stroke:#5cc8ff;stroke-width:2.6;stroke-linecap:round}
.pb.hd .wxi .wf{fill:none;stroke:#a6e3ff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.pb.hd .wxi .ww{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}
.pb.hd .wxi .wx{fill:none;stroke:currentColor;stroke-width:2.2}
.pb.hd .wxi .wp{fill:currentColor}
.pb.hd .wxa{display:block;width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(var(--r,0deg))}
.pb.hd .pb-wxar{display:inline-grid;flex:none;width:14px;height:14px;color:var(--hd-cyan)}
/* Time and weather together: the time's mark, the weather's on its corner in a small disc. */
.pb.hd .pb-wxic{position:relative;flex:none;width:40px;height:40px}
.pb.hd .pb-wxic > .wxi{width:31px;height:31px}
.pb.hd .pb-wxic.solo > .wxi{width:36px;height:36px;margin:2px}
.pb.hd .pb-wxic > .wxi.sm{position:absolute;right:-2px;bottom:-2px;width:20px;height:20px;padding:2.5px;border-radius:50%;background:#2a2e35;box-shadow:0 0 0 2px rgba(22,24,29,.95)}
/* The row: like a toggle row; the whole row opens the sheet, the dice rerolls in place. */
.pb.hd .pb-wxrow{position:relative;border-radius:20px;background:var(--hd-chip2)}
.pb.hd .pb-wxopen{display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:0 92px 0 12px;border:0;border-radius:20px;background:none;color:var(--hd-ink);text-align:left}
.pb.hd .pb-wxopen:active{background:rgba(255,255,255,.04)}
.pb.hd .pb-wxtx{display:grid;gap:5px;min-width:0}
.pb.hd .pb-wxtx b{display:block;font:600 15px/1.1 var(--hd-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb.hd .pb-wxtx small{display:flex;align-items:center;gap:10px;font:600 12.5px/1 var(--hd-body);color:rgba(255,255,255,.6);font-variant-numeric:tabular-nums;white-space:nowrap}
.pb.hd .pb-wxtx small span{display:inline-flex;align-items:center;gap:4px}
.pb.hd .pb-wxtx em{padding:3px 6px 2px;border-radius:6px;background:rgba(255,210,63,.15);color:var(--hd-yellow);font:800 9.5px/1 var(--hd-body);font-style:normal;letter-spacing:.1em;text-transform:uppercase}
.pb.hd .pb-wxchev{position:absolute;right:12px;top:50%;width:16px;height:16px;margin-top:-8px;color:rgba(255,255,255,.38);pointer-events:none}
.pb.hd .pb-wxchev svg{display:block;width:100%;height:100%}
.pb.hd .pb-dice{position:absolute;right:36px;top:50%;width:42px;height:42px;margin-top:-21px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:var(--hd-chip);color:#fff;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:transform .12s}
.pb.hd .pb-dice:active{transform:scale(.9)}
.pb.hd .pb-dice .wxi{width:22px;height:22px}
/* A new roll: the readout flips in, the dice tumbles. (Past the in-place redraw's no-animation rule on purpose.) */
.pb.hd .pb-modal .pb-wxrow.pb-new :is(.pb-wxic,.pb-wxtx),.pb.hd .pb-modal .pb-wxcast.pb-new > *{animation:wxIn .42s cubic-bezier(.2,.9,.25,1.2) both}
.pb.hd .pb-modal .pb-wxrow.pb-new .pb-wxtx,.pb.hd .pb-modal .pb-wxcast.pb-new > :nth-child(n+2){animation-delay:.05s}
.pb.hd .pb-modal .pb-wxrow.pb-new .pb-dice .wxi,.pb.hd .pb-modal .pb-wxsheet:has(.pb-wxcast.pb-new) .pb-reroll .wxi{animation:wxRoll .5s cubic-bezier(.2,.8,.3,1) both}
@keyframes wxIn{from{opacity:0;transform:perspective(200px) rotateX(-75deg) translateY(4px)}}
@keyframes wxRoll{from{transform:rotate(-300deg) scale(.6)}}
/* The sheet: a broadcast weather board, its line on play, the two pickers. */
.pb.hd .pb-wxsheet{gap:12px;max-height:calc(100dvh - var(--pb-top,0px) - env(safe-area-inset-bottom,0px) - 8px);overflow:auto;overscroll-behavior:contain;scrollbar-width:none}
/* Phones on their side: the board and its line on the left, the pickers on the right. */
@media (max-height:520px) and (min-width:640px){
  .pb.hd .pb-wxsheet{max-width:860px;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);grid-template-areas:"h h" "c k" "f w" "b b";column-gap:16px;row-gap:10px;padding:20px 18px 16px;align-items:start}
  .pb.hd .pb-wxsheet h2{grid-area:h;font-size:28px}
  .pb.hd .pb-wxsheet .pb-wxcast{grid-area:c;padding:12px 14px 12px 12px}
  .pb.hd .pb-wxsheet .pb-wxfx{grid-area:f}
  .pb.hd .pb-wxsheet .pb-wxk{grid-area:k}
  .pb.hd .pb-wxsheet .pb-wxw{grid-area:w}
  .pb.hd .pb-wxsheet .pb-btns{grid-area:b}
  .pb.hd .pb-wxsheet .pb-go{min-height:48px}
  .pb.hd .pb-wxsheet .pb-wx button{height:48px}
}
.pb.hd .pb-wxcast{position:relative;isolation:isolate;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:16px 16px 16px 14px;border-radius:24px;overflow:hidden;
  color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 0 0 1px rgba(255,255,255,.08),0 8px 22px rgba(0,0,0,.35)}
.pb.hd .pb-wxcast::before{content:"";position:absolute;inset:0;z-index:-1}
.pb.hd .pb-wxcast::after{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:0 3px 3px 0;background:var(--hd-yellow)}
.pb.hd .pb-wxcast.t-noon{background:linear-gradient(135deg,#3a8ee0 0%,#1f5aa0 55%,#132c55 100%)}
.pb.hd .pb-wxcast.t-afternoon{background:linear-gradient(135deg,#e88f3e 0%,#a44c5c 52%,#2d2552 100%)}
.pb.hd .pb-wxcast.t-night{background:radial-gradient(1px 1px at 72% 22%,#fff 50%,transparent),radial-gradient(1px 1px at 86% 64%,rgba(255,255,255,.7) 50%,transparent),radial-gradient(1.5px 1.5px at 58% 80%,rgba(255,255,255,.6) 50%,transparent),
  linear-gradient(135deg,#25356f 0%,#141d45 55%,#0a0f26 100%)}
.pb.hd .pb-wxcast.s-rain::before{background:linear-gradient(180deg,rgba(30,38,50,.5),rgba(20,26,36,.62))}
.pb.hd .pb-wxcast.s-snow::before{background:linear-gradient(180deg,rgba(190,210,230,.22),rgba(60,74,92,.38))}
.pb.hd .pb-wxcast.s-fog::before{background:linear-gradient(180deg,rgba(150,160,172,.42),rgba(80,88,98,.5))}
.pb.hd .pb-wxcast.s-wind::before{background:repeating-linear-gradient(170deg,transparent 0 18px,rgba(255,255,255,.05) 18px 20px)}
.pb.hd .pb-wxbig .wxi{width:54px;height:54px;color:#fff;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}
.pb.hd .pb-wxtemp{font:800 54px/.8 var(--hd-display);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.pb.hd .pb-wxwho{display:grid;gap:5px;min-width:0}
.pb.hd .pb-wxwho b{font:800 23px/.9 var(--hd-display);letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb.hd .pb-wxwho small{font:600 12px/1.15 var(--hd-body);color:rgba(255,255,255,.75)}
.pb.hd .pb-wxwind{display:grid;justify-items:center;gap:3px;padding-left:12px;border-left:1px solid rgba(255,255,255,.22)}
.pb.hd .pb-wxwind .pb-wxar{width:18px;height:18px;color:#fff}
.pb.hd .pb-wxwind b{font:800 24px/.9 var(--hd-display);font-variant-numeric:tabular-nums}
.pb.hd .pb-wxwind small{font:700 9.5px/1 var(--hd-body);letter-spacing:.12em;color:rgba(255,255,255,.7)}
.pb.hd .pb-wxfx{display:flex;align-items:baseline;gap:9px;margin:0;padding:10px 14px;border-radius:16px;background:rgba(255,210,63,.08);box-shadow:inset 0 0 0 1px rgba(255,210,63,.22);font:600 13.5px/1.3 var(--hd-body);color:#fff}
.pb.hd .pb-wxfx::before{content:"IN PLAY";flex:none;font:800 10px/1 var(--hd-body);letter-spacing:.12em;color:var(--hd-yellow)}
.pb.hd .pb-wx button{display:grid;place-items:center;align-content:center;gap:4px;height:54px;padding:0 2px;font-size:11.5px;border-radius:17px}
.pb.hd .pb-wx .wxi{width:22px;height:22px}
.pb.hd .pb-wx button[aria-pressed="true"] .wxi .wc{fill:#fff;stroke:#2a2f36;stroke-width:1.8}
.pb.hd .pb-wx button[aria-pressed="true"] .wxi :is(.ws,.wk){fill:#f2a900}
.pb.hd .pb-wx button[aria-pressed="true"] .wxi .wr{stroke:#f2a900}
.pb.hd .pb-wx button[aria-pressed="true"] .wxi .wm{fill:#e9a800}
.pb.hd .pb-wx button[aria-pressed="true"] .wxi .wd{stroke:#1a95dc}
.pb.hd .pb-wx button[aria-pressed="true"] .wxi .wf{stroke:#1a95dc}
.pb.hd .pb-reroll{display:flex;align-items:center;justify-content:center;gap:9px}
.pb.hd .pb-reroll .wxi{width:22px;height:22px}
/* The coin toss: one broadcast chip. */
.pb.hd .pb-wxchip{justify-self:center;display:flex;align-items:center;gap:10px;max-width:100%;padding:5px 14px 5px 7px;border-radius:999px;background:rgba(0,0,0,.32);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);font:700 13.5px/1 var(--hd-body);color:rgba(255,255,255,.85);white-space:nowrap;font-variant-numeric:tabular-nums}
.pb.hd .pb-wxchip .pb-wxic{width:32px;height:32px}
.pb.hd .pb-wxchip .pb-wxic > .wxi{width:25px;height:25px}
.pb.hd .pb-wxchip .pb-wxic.solo > .wxi{width:28px;height:28px}
.pb.hd .pb-wxchip .pb-wxic > .wxi.sm{width:17px;height:17px;padding:2px}
.pb.hd .pb-wxchip b{font:800 16px/1 var(--hd-display);letter-spacing:.04em;text-transform:uppercase;color:#fff;overflow:hidden;text-overflow:ellipsis}
.pb.hd .pb-wxchip span{display:inline-flex;align-items:center;gap:4px}
.pb.hd .pb-wxchip span::before{content:"";width:1px;height:14px;margin-right:6px;background:rgba(255,255,255,.22)}
.pb.hd .pb-how{padding:2px 4px;font:400 13px/1.5 var(--hd-body);color:rgba(255,255,255,.72)}
.pb.hd .pb-how summary{font-weight:600;color:var(--hd-yellow)}
.pb.hd .pb-how b{font-weight:700}
/* the team picker */
.pb.hd .pb-q{height:46px;padding:0 16px;border:0;border-radius:23px;background:var(--hd-chip);color:#fff;font:500 16px var(--hd-body);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.pb.hd .pb-q:focus{outline:none;box-shadow:inset 0 0 0 2px var(--hd-yellow)}
.pb.hd .pb-list{gap:6px;max-height:min(62dvh,560px);grid-template-columns:repeat(auto-fill,minmax(160px,1fr));scrollbar-width:none}
.pb.hd .pb-list button{min-height:46px;gap:10px;padding:6px 10px 6px 6px;border:0;border-radius:16px;background:var(--hd-chip2);font:600 13.5px/1.2 var(--hd-body);color:#fff;
  box-shadow:inset 4px 0 0 var(--c)}
.pb.hd .pb-list img,.pb.hd .pb-list i{width:32px;height:32px;padding:3px;border-radius:50%;background:#fff;object-fit:contain;margin-left:6px}
.pb.hd .pb-list button:active{background:rgba(255,255,255,.14)}
.pb.hd .pb-glist{display:block;margin:0 -6px;padding:0 6px 4px}
.pb.hd .pb-cgrp + .pb-cgrp{margin-top:14px}
.pb.hd .pb-cgrp:not(:has(button:not([hidden]))){display:none}
.pb.hd .pb-cgrp h3{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:10px;margin:0 -6px 6px;padding:9px 10px 7px;border-radius:12px;
  background:rgba(32,35,40,.94);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);font:700 10.5px/1 var(--hd-body);letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.55)}
.pb.hd .pb-cgrp h3::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.1)}
.pb.hd .pb-cteams{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.pb.hd .pb-glist:not(:has(button:not([hidden])))::after{content:"No team matches.";display:block;padding:18px 4px;font:500 14px var(--hd-body);color:rgba(255,255,255,.5)}

/* ---------- coin toss ---------- */
.pb.hd .pb-tosscard{text-align:center;gap:12px}
.pb.hd .pb-tosscard h2{font-size:30px;color:rgba(255,255,255,.9)}
.pb.hd .pb-cstage{margin:34px auto 4px;width:104px;height:104px}
.pb.hd .pb-cstage::before{content:"";position:absolute;left:-50px;right:-50px;top:-20px;bottom:-20px;background:radial-gradient(closest-side,rgba(245,197,66,.28),transparent)}
.pb.hd .pb-cshad{border-radius:50%;background:rgba(0,0,0,.45);filter:blur(2px)}
.pb.hd .pb-ccalls{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pb.hd .pb-ccall{gap:10px;padding:10px 12px;border:0;border-radius:22px;background:var(--hd-chip2);box-shadow:none;color:#fff;text-align:left;font:800 22px/1 var(--hd-display)}
.pb.hd .pb-ccall img{width:36px;height:36px;padding:4px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.pb.hd .pb-ccall small{display:block;margin-left:auto;font:700 10.5px/1 var(--hd-body);letter-spacing:.08em;color:inherit;opacity:.7}
.pb.hd .pb-ccall.win{animation:hdCWin .35s ease-out var(--d) both}
.pb.hd .pb-ccall:not(.win){animation:hdCLose .35s ease-out var(--d) both}
@keyframes hdCWin{to{background:var(--c);color:var(--k,#fff);box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 0 0 2px rgba(255,255,255,.85)}}
@keyframes hdCLose{to{opacity:.5}}
.pb.hd .pb-toss{font-size:15px;color:#fff}
.pb.hd .pb-tosscard .pb-go{width:100%}

/* ---------- scores, recaps, tables ---------- */
.pb.hd .pb-score{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pb.hd .pb-sl{gap:9px;min-width:0;padding:8px 14px 8px 8px;border:0;border-radius:24px;box-shadow:inset 0 1px 0 rgba(255,255,255,.15),inset 0 -3px 0 var(--a,transparent)}
.pb.hd .pb-sl + .pb-sl{flex-direction:row-reverse;padding:8px 8px 8px 14px}
.pb.hd .pb-sl img{width:34px;height:34px;padding:3px;object-fit:contain;flex:none}
.pb.hd .pb-sl b{font:800 18px/1 var(--hd-display);letter-spacing:.02em}
.pb.hd .pb-sl span{margin-left:auto;font:800 34px/.9 var(--hd-display);font-variant-numeric:tabular-nums}
.pb.hd .pb-sl + .pb-sl span{margin:0 auto 0 0}
.pb.hd .pb-score.big .pb-sl span{font-size:46px}
.pb.hd .pb-recap{margin:0;padding:11px 14px;border:0;border-radius:20px;background:var(--hd-chip2);box-shadow:none}
.pb.hd .pb-rh b{font:700 11px/1 var(--hd-body);letter-spacing:.1em;color:rgba(255,255,255,.6)}
.pb.hd .pb-rh span{font:700 12.5px/1.2 var(--hd-body);color:#fff}
.pb.hd .pb-rlist{font:400 12.5px/1.5 var(--hd-body);color:rgba(255,255,255,.72);scrollbar-width:none}
.pb.hd .pb-rlist li::marker{color:rgba(255,255,255,.35);font-size:11px}
.pb.hd .pb-stat{font-size:14px !important;color:#fff !important;text-align:center}
.pb.hd .pb-tbl{font:400 14px/1.3 var(--hd-body)}
.pb.hd .pb-tbl td{padding:8px 2px;border:0;border-top:1px solid rgba(255,255,255,.08)}
.pb.hd .pb-tbl tr:first-child td{border-top:0}
.pb.hd .pb-tbl td:first-child{color:rgba(255,255,255,.58);width:36%}
.pb.hd .pb-tbl td:last-child{font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.pb.hd .pb-rec{text-align:center}
.pb.hd .pb-final h2,.pb.hd .pb-card:has(> .pb-score) > h2{text-align:center}

/* ---------- 4th down: the sideline's call is the yellow one ---------- */
.pb.hd .pb-4th{grid-template-columns:auto 1fr;column-gap:12px;row-gap:12px;align-items:baseline;padding-top:24px}
.pb.hd .pb-4th h2{font-size:46px;line-height:.85;white-space:nowrap}
.pb.hd .pb-4th > p:not(.pb-advice){font-weight:600;font-size:15px;color:rgba(255,255,255,.65)}
.pb.hd .pb-4th > .pb-advice,.pb.hd .pb-4th > .pb-btns{grid-column:1/-1}
.pb.hd .pb-advice{display:flex;align-items:center;gap:12px;padding:8px 14px 8px 52px;border-radius:18px;position:relative;min-height:46px;
  background:rgba(61,220,132,.11);box-shadow:inset 0 0 0 1px rgba(61,220,132,.3);font:600 13px/1.3 var(--hd-body) !important;color:rgba(255,255,255,.85) !important}
.pb.hd .pb-advice::before{content:"";position:absolute;left:10px;top:50%;width:30px;height:30px;margin-top:-15px;border-radius:50%;background:rgba(61,220,132,.2) url("${SIDELINE}") center/16px no-repeat}
.pb.hd .pb-4th .pb-btns{margin-top:4px}
.pb.hd .pb-4th .pb-go{min-height:58px;padding:8px 10px;font-size:19px;line-height:1.02;background:var(--hd-chip);color:var(--hd-ink) !important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.pb.hd .pb-4th .pb-go.pb-adv{background:var(--hd-yellow);color:#1b1400 !important;box-shadow:0 6px 20px rgba(255,210,63,.22),inset 0 1px 0 rgba(255,255,255,.55)}
.pb.hd .pb-4th .pb-go.pb-adv::after{content:"SIDELINE'S CALL";position:absolute;top:-9px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:4px 8px;border-radius:999px;background:var(--hd-green);color:#06210f;
  font:800 10px/1 var(--hd-body);letter-spacing:.08em;box-shadow:0 2px 6px rgba(0,0,0,.4)}

/* ---------- the opponent's drive, the defensive call, your key plays ---------- */
.pb.hd .pb-drive{text-align:left}
.pb.hd .pb-dh{justify-content:flex-start;gap:12px}
.pb.hd .pb-dh img{width:42px;height:42px;padding:4px;object-fit:contain;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.pb.hd .pb-dh b{flex:1;font:800 26px/1 var(--hd-display)}
.pb.hd .pb-dh span{font:700 11px/1.2 var(--hd-body);letter-spacing:.09em;color:rgba(255,255,255,.58);text-align:right}
.pb.hd .pb-strip{height:30px;margin:2px 9%;border:0;border-radius:0;overflow:visible;
  background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(255,255,255,.22) calc(10% - 1px) 10%),linear-gradient(#3f6b35,#355d2c);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.pb.hd .pb-strip::before{border-radius:15px 0 0 15px;width:10%}
.pb.hd .pb-strip::after{border-radius:0 15px 15px 0;width:10%}
.pb.hd .pb-mark{width:20px;height:12px;margin:-6px 0 0 -10px;border:0;border-radius:50%;background:#c98a3f;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.5);transition:left .2s ease-out;z-index:1}
.pb.hd .pb-dres{font:800 40px/.92 var(--hd-display);text-transform:uppercase;text-shadow:none}
.pb.hd .pb-dsub{margin-top:-6px;font:600 14px/1.35 var(--hd-body);color:rgba(255,255,255,.7)}
.pb.hd .pb-stopline{display:flex;gap:8px;align-items:center;margin-top:0;font-weight:500;color:rgba(255,255,255,.88)}
.pb.hd .pb-stopline::before{content:"";width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.55);flex:none}
.pb.hd .pb-stopline[hidden]{display:none}
.pb.hd .pb-ticker{gap:4px;min-height:4.4em;margin:0;font:400 13px/1.35 var(--hd-body);color:rgba(255,255,255,.55)}
.pb.hd .pb-ticker div:last-child{color:#fff}
.pb.hd .pb-drive .pb-go{width:100%}
.pb.hd .pb-dcall .pb-dres{font:700 11px/1 var(--hd-body) !important;letter-spacing:.1em;color:var(--hd-amber) !important}
.pb.hd .pb-dcalls{gap:8px}
.pb.hd .pb-dcalls button{min-height:76px;align-content:start;gap:5px;padding:12px 14px;border:0;border-radius:20px;background:rgba(255,255,255,.07);box-shadow:none;color:#fff}
.pb.hd .pb-dcalls button:active{background:rgba(255,255,255,.14)}
.pb.hd .pb-dcalls button b{font:800 20px/1 var(--hd-display);letter-spacing:.02em;color:#fff}
.pb.hd .pb-dcalls button small{font:400 12px/1.3 var(--hd-body);color:rgba(255,255,255,.6)}
.pb.hd .pb-dcalls button.late{min-height:0;box-shadow:inset 0 0 0 1px rgba(255,176,32,.45)}
.pb.hd .pb-dcalls button.late b{color:var(--hd-amber)}
.pb.hd .pb-read{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:0;border-radius:16px;background:rgba(125,216,240,.09);font:400 13px/1.35 var(--hd-body) !important;color:rgba(255,255,255,.85) !important}
.pb.hd .pb-read b{flex:none;margin:0;padding-top:2px;font:700 10.5px/1.3 var(--hd-body);letter-spacing:.1em;color:var(--hd-cyan)}

/* ---------- the flag ---------- */
.pb.hd .pb-flag{grid-template-columns:auto 1fr;column-gap:14px;align-items:center}
.pb.hd .pb-flag::after{content:"";grid-row:1/3;grid-column:1;width:48px;height:48px;border-radius:50%;background:var(--hd-yellow) url("${FLAG}") center/24px no-repeat;box-shadow:0 0 0 4px rgba(255,210,63,.18)}
.pb.hd .pb-flag h2{grid-column:2;grid-row:1;font:700 11px/1 var(--hd-body);letter-spacing:.14em;color:var(--hd-yellow)}
.pb.hd .pb-fl{grid-column:2;grid-row:2;font:800 30px/.95 var(--hd-display) !important;color:#fff !important;text-transform:uppercase}
.pb.hd .pb-flag > p:not(.pb-fl),.pb.hd .pb-flag .pb-btns{grid-column:1/-1}
.pb.hd .pb-flag .pb-go{font-size:19px}

/* ---------- halftime, overtime, pause, the final ---------- */
.pb.hd .pb-card:not(.pb-drive):not(.pb-flag):not(.pb-4th):not(.pb-calls) > .pb-go{width:100%}
.pb.hd .pb-final{gap:12px}
.pb.hd .pb-final h2{font-size:48px}
.pb.hd .pb-final .pb-btns{grid-template-columns:1.3fr 1.1fr .9fr;grid-auto-columns:unset}
.pb.hd .pb-final .pb-btns .pb-go{font-size:19px;padding:12px 6px;white-space:nowrap}
.pb.hd .pb-final .pb-btns:has(> :nth-child(2):last-child){grid-template-columns:1.4fr 1fr}
/* Florida State: garnet and gold at the edge of every sheet when they're your team */
.pb.hd .pb-modal.fsu :is(.pb-card,.pb-setup){border-color:rgba(206,184,136,.32);box-shadow:0 -10px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(206,184,136,.35),inset 0 3px 0 -1px rgba(120,47,64,.6)}
.pb.hd .pb-modal.fsu :is(.pb-card,.pb-setup)::before{background:linear-gradient(90deg,var(--fsu-g) 50%,var(--fsu-y) 50%)}
.pb.hd .pb-modal.fsu .pb-logo span + span{background:linear-gradient(180deg,#fff 0 58%,var(--fsu-y) 58%);-webkit-background-clip:text;background-clip:text;color:transparent}
.pb.hd :is(.pb-team,.pb-sl)[data-tid="52"]{background:linear-gradient(135deg,#8a3549 0%,var(--fsu-g) 55%,#5a2230 100%) !important;color:#fff !important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.15),inset 0 0 0 2px rgba(206,184,136,.55),inset 0 -4px 0 var(--fsu-y) !important}
.pb.hd .pb-team[data-tid="52"]{position:relative;overflow:hidden}
.pb.hd .pb-team[data-tid="52"]::after{content:"";position:absolute;right:-34px;bottom:5px;width:140px;height:16px;opacity:.5;transform:rotate(-12deg);background:url("${SPEAR_URL}") center/contain no-repeat;pointer-events:none}
.pb.hd .pb-list [data-id="52"]{box-shadow:inset 4px 0 0 var(--fsu-g),inset 0 0 0 1px rgba(206,184,136,.5);background:linear-gradient(90deg,rgba(120,47,64,.35),rgba(206,184,136,.08))}
.pb.hd .pb-ccall[data-tid="52"].win{animation-name:hdCWinFSU}
@keyframes hdCWinFSU{to{background:var(--fsu-g);color:#fff;box-shadow:inset 0 -3px 0 var(--fsu-y),0 0 0 2px var(--fsu-y)}}
.pb.hd .pb-fsuwin{position:relative;display:grid;justify-items:center;gap:2px;margin:-12px -8px 0;padding:18px 18px 16px;border-radius:26px;overflow:hidden;text-align:center;
  background:radial-gradient(120% 90% at 50% 0%,rgba(206,184,136,.28),transparent 60%),linear-gradient(160deg,#8a3549,var(--fsu-g) 55%,#4a1b27);box-shadow:inset 0 -3px 0 var(--fsu-y)}
.pb.hd .pb-fsuwin::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(-55deg,rgba(255,255,255,.06) 0 14px,transparent 14px 30px)}
.pb.hd .pb-fsuwin > *{position:relative}
.pb.hd .pb-fsuwin .pb-spear{width:min(240px,70%);height:auto;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45));animation:hdSpear .7s cubic-bezier(.2,.9,.25,1) .15s both}
.pb.hd .pb-fsuwin b{font:800 44px/.9 var(--hd-display);letter-spacing:.02em;color:var(--fsu-y);text-shadow:0 2px 0 rgba(0,0,0,.35)}
.pb.hd .pb-fsuwin small{font:700 10.5px/1 var(--hd-body);letter-spacing:.24em;color:rgba(255,255,255,.75)}
@keyframes hdSpear{from{transform:translateX(-120%);opacity:0}}
@media (prefers-reduced-motion:reduce){.pb.hd .pb-fsuwin .pb-spear{animation:none}}
.pb.hd .pb-fsu.pb-final > h2{font-size:30px;color:#fff !important}
.pb.hd .pb-fsu .pb-go:not(.alt){background:linear-gradient(180deg,#e2d1a4,var(--fsu-y));color:#2a0f16 !important;box-shadow:0 6px 20px rgba(206,184,136,.25),inset 0 1px 0 rgba(255,255,255,.55)}
.pb.hd .pb-modal.fsu .sz-result.won{box-shadow:0 -10px 40px rgba(0,0,0,.5),inset 0 0 0 2px rgba(206,184,136,.45),inset 0 4px 0 var(--fsu-g)}
.pb.hd .pb-modal.fsu .sz-result.won::after{content:"";position:absolute;right:18px;top:24px;width:96px;height:12px;opacity:.85;
  background:url("${SPEAR_URL}") center/contain no-repeat}

/* ---------- practice and drill summaries ---------- */
.pb.hd .pb-sess{text-align:center;justify-items:stretch;gap:12px}
.pb.hd .pb-sk{font:700 11px/1 var(--hd-body);letter-spacing:.12em;color:rgba(255,255,255,.55)}
.pb.hd .pb-sg{gap:14px;align-items:baseline}
.pb.hd .pb-sg b{font:800 84px/.82 var(--hd-display);text-shadow:none}
.pb.hd .pb-sg span{font:800 32px/1 var(--hd-display)}
.pb.hd .pb-sg small{font:600 13px var(--hd-body);color:rgba(255,255,255,.5)}
.pb.hd .pb-pb{justify-self:center;padding:5px 12px;border-radius:999px;background:var(--hd-yellow);color:#1b1400 !important;font:800 13px/1 var(--hd-body) !important;letter-spacing:.08em;animation:none}
.pb.hd .pb-ss{gap:6px}
.pb.hd .pb-ss div{gap:5px;padding:10px 4px;border:0;border-radius:16px;background:var(--hd-chip2)}
.pb.hd .pb-ss b{font:800 24px/1 var(--hd-display);color:#fff}
.pb.hd .pb-ss span{font:600 10.5px/1.2 var(--hd-body);color:rgba(255,255,255,.55)}
.pb.hd .pb-sess .pb-gbars{gap:7px;padding:12px 14px;border-radius:18px;background:var(--hd-chip2)}
.pb.hd .pb-sess .pb-gb{grid-template-columns:76px 1fr 28px;gap:10px;font:700 10.5px/1 var(--hd-body);letter-spacing:.08em;color:rgba(255,255,255,.6)}
.pb.hd .pb-sess .pb-gb i{height:7px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
.pb.hd .pb-sess .pb-gb i b{border-radius:4px}
.pb.hd .pb-sess .pb-gb em{font:800 15px/1 var(--hd-display);letter-spacing:0}
.pb.hd .pb-sess .pb-btns + .pb-btns{margin-top:-4px}
.pb.hd .pb-sess .pb-go{font-size:19px;white-space:nowrap;padding:10px 8px}
.pb.hd .pb-sess .pb-go.sm{font-size:16px}

/* ---------- practice, the playbook and the play designer ---------- */
.pb.hd .pb-practice{gap:12px}
.pb.hd .pb-side button{font:800 17px/1 var(--hd-display);letter-spacing:.06em;height:40px}
.pb.hd .pb-form{border:0;border-radius:20px;overflow:hidden;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.pb.hd .pb-form p{padding:8px 12px;border:0;border-top:1px solid rgba(255,255,255,.07);font:500 12.5px/1.35 var(--hd-body);color:rgba(255,255,255,.7)}
.pb.hd :is(.pb-form,.pb-concepts,.pb-callrow,.pb-pbc) .q{font:700 8px var(--hd-body)}
.pb.hd .pb-form .tag{font:700 5.5px var(--hd-body)}
.pb.hd .pb-concepts{gap:8px;grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
.pb.hd .pb-concepts button{gap:6px;padding:6px 6px 9px;border:0;border-radius:18px;background:var(--hd-chip2);font:600 13px/1.2 var(--hd-body)}
.pb.hd .pb-concepts button svg{border-radius:12px;background:rgba(70,110,60,.3)}
.pb.hd .pb-concepts button[aria-pressed="true"]{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 2px var(--hd-pill)}
.pb.hd .pb-rrow{gap:6px}
.pb.hd .pb-rrow > span{font:700 10.5px/1 var(--hd-body);letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);padding-left:4px}
.pb.hd .pb-rchips{gap:6px;scrollbar-width:none}
.pb.hd .pb-rchips button{width:60px;gap:3px;padding:6px 3px 7px;border:0;border-radius:16px;background:var(--hd-chip2)}
.pb.hd .pb-rchips button small{font:600 10.5px/1.1 var(--hd-body);color:rgba(255,255,255,.75)}
.pb.hd .pb-rchips button[aria-pressed="true"]{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 2px var(--hd-pill)}
.pb.hd .pb-rq{font:800 24px/1 var(--hd-display)}
.pb.hd .pb-name{font:800 26px/1 var(--hd-display) !important;letter-spacing:.02em}
.pb.hd .pb-ename-err{font-size:13px}
.pb.hd .pb-ddrills{gap:8px}
.pb.hd .pb-ddrills button{gap:6px;padding:12px 14px;border:0;border-radius:20px;background:var(--hd-chip2);box-shadow:none}
.pb.hd .pb-ddrills button b{font:800 20px/1 var(--hd-display);letter-spacing:.02em}
.pb.hd .pb-ddrills button small{font:400 12.5px/1.4 var(--hd-body);color:rgba(255,255,255,.6)}
.pb.hd .pb-ddrills button[aria-pressed="true"]{background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 2px var(--hd-yellow)}
.pb.hd .pb-ddrills button[aria-pressed="true"] b{color:var(--hd-yellow)}
.pb.hd .pb-hist{gap:6px;margin-top:2px}
.pb.hd .pb-hh{align-items:baseline;font:700 10.5px/1 var(--hd-body);letter-spacing:.1em;color:rgba(255,255,255,.5);padding:0 4px}
.pb.hd .pb-hh small{font:500 12px var(--hd-body);letter-spacing:0;color:rgba(255,255,255,.6)}
.pb.hd .pb-hr{grid-template-columns:42px 1fr auto;gap:10px;padding:8px 8px 8px 12px;border:0;border-radius:18px;background:var(--hd-chip2)}
.pb.hd .pb-hr.best{box-shadow:inset 0 0 0 1px rgba(255,210,63,.5)}
.pb.hd .pb-hr > b{font:800 26px/1 var(--hd-display)}
.pb.hd .pb-hr span{font:600 13px/1.2 var(--hd-body)}
.pb.hd .pb-hr small{font:400 11.5px/1.2 var(--hd-body);color:rgba(255,255,255,.55)}
.pb.hd .pb-hr button{width:34px;height:34px;min-width:0;padding:0;border:0;border-radius:50%;background:var(--hd-chip);color:#ff8a80;font:600 12px var(--hd-body)}
.pb.hd .pb-hr button[data-armed="1"]{width:auto;padding:0 10px;border-radius:17px}
.pb.hd .pb-best{padding:3px 6px;border-radius:999px;background:var(--hd-yellow);color:#1b1400;font:800 9.5px/1 var(--hd-body);letter-spacing:.06em;vertical-align:1px}
.pb.hd .pb-nohist{text-align:center}
.pb.hd .pb-pbl{gap:8px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.pb.hd .pb-pbc{gap:7px;padding:6px 6px 8px;border:0;border-radius:20px;background:var(--hd-chip2)}
.pb.hd .pb-pbc svg{border-radius:14px;background:rgba(70,110,60,.3)}
.pb.hd .pb-pbc b{font:700 14px/1.2 var(--hd-body);padding:0 4px}
.pb.hd .pb-pbc div{gap:6px}
.pb.hd .pb-pbc div button{height:34px;padding:0 4px;border:0;border-radius:17px;background:var(--hd-chip);font:700 12px/1 var(--hd-body);letter-spacing:.04em}

/* ---------- the play-call sheet ---------- */
.pb.hd .pb-calls{max-width:620px;gap:12px;padding:24px 16px 16px}
.pb.hd .pb-forms{gap:6px;margin:0 -16px;padding:0 16px;scrollbar-width:none}
.pb.hd .pb-forms button{height:34px;padding:0 14px;border:0;border-radius:17px;background:var(--hd-chip);box-shadow:none;font:600 13px/34px var(--hd-body);color:rgba(255,255,255,.8);white-space:nowrap}
.pb.hd .pb-forms button[aria-pressed="true"]{background:var(--hd-pill);color:var(--hd-pill-ink);box-shadow:none}
.pb.hd .pb-tabs button{font:700 13.5px/1 var(--hd-body);letter-spacing:.04em}
.pb.hd .pb-callrow{gap:8px;margin:0 -16px;padding:2px 16px 4px;scrollbar-width:none;scroll-padding:0 16px}
.pb.hd .pb-callrow button{width:140px;gap:0;padding:6px 6px 10px;border:0;border-radius:20px;background:var(--hd-chip2);color:var(--hd-yellow)}
.pb.hd .pb-callrow button svg{border-radius:14px;background:rgba(70,110,60,.32)}
.pb.hd .pb-callrow button b{margin:8px 6px 2px;padding:0;font:700 15px/1.15 var(--hd-body);color:#fff}
.pb.hd .pb-callrow button small{margin:0 6px;padding:0;font:400 12px/1.3 var(--hd-body);color:rgba(255,255,255,.58)}
.pb.hd .pb-callrow button[aria-pressed="true"]{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 2px var(--hd-pill)}
.pb.hd .pb-callrow .pb-empty{font-size:13px}
.pb.hd .pb-starred::after{top:12px;right:12px;padding:4px 7px;border-radius:999px;background:var(--hd-amber);color:#1a1205;font:800 9.5px/1 var(--hd-body);letter-spacing:.05em}
.pb.hd .pb-callopts{gap:12px;margin:0}
.pb.hd .pb-callopts span{font:400 12.5px/1.35 var(--hd-body);color:rgba(255,255,255,.58)}
.pb.hd .pb-pa{height:36px;padding:0 14px;border:0;border-radius:18px;background:var(--hd-chip);box-shadow:none;font:700 12.5px/1 var(--hd-body);letter-spacing:.04em;color:#fff}
.pb.hd .pb-pa[aria-pressed="true"]{background:var(--hd-cyan);color:#04212b}
.pb.hd .pb-hot{margin:0;padding:0 14px;border-radius:18px;background:var(--hd-chip2)}
.pb.hd .pb-hot summary{padding:12px 0;font:700 12px/1 var(--hd-body);letter-spacing:.1em;color:var(--hd-yellow)}
.pb.hd .pb-hot[open]{padding-bottom:12px;display:grid;gap:10px}
.pb.hd .pb-calls > .pb-sub{text-align:center;font-size:12px}

/* ---------- take over: challenges ---------- */
.pb.hd .pb-chlist{gap:10px}
.pb.hd .pb-ch{gap:10px;padding:14px 14px 14px 18px;border:0;border-radius:22px;background:var(--hd-chip2);box-shadow:inset 4px 0 0 var(--c)}
.pb.hd .pb-ch.won{box-shadow:inset 4px 0 0 var(--c),inset 0 0 0 1px rgba(255,210,63,.5)}
.pb.hd .pb-chh{gap:8px;font:800 18px/1 var(--hd-display)}
.pb.hd .pb-chh img{width:30px;height:30px;padding:3px;border-radius:50%;background:#fff;object-fit:contain}
.pb.hd .pb-chh i{font:600 12px var(--hd-body);color:rgba(255,255,255,.5)}
.pb.hd .pb-chtag{padding:5px 9px;border-radius:999px;background:var(--hd-yellow);color:#1b1400;font:800 10px/1 var(--hd-body);letter-spacing:.07em}
.pb.hd .pb-ch p{font:400 14px/1.45 var(--hd-body);color:#fff}
.pb.hd .pb-chf small{font:700 10.5px/1.3 var(--hd-body);letter-spacing:.08em;color:rgba(255,255,255,.5)}
.pb.hd .pb-ch.won .pb-chf small{color:var(--hd-yellow)}
.pb.hd .pb-chf .pb-go{min-height:44px;padding:8px 22px;font-size:18px}
.pb.hd .pb-chintro{text-align:center;justify-items:stretch}
.pb.hd .pb-chintro .pb-chtag{justify-self:center;margin:0}
.pb.hd .pb-chintro h2{margin-top:-4px}
.pb.hd .pb-chsit{font:800 20px/1.1 var(--hd-display) !important;letter-spacing:.03em;color:var(--hd-yellow) !important}
.pb.hd .pb-chintro p:not(.pb-chsit):not(.pb-sub){font-size:15px;color:#fff}
.pb.hd .pb-load{text-align:center;padding:20px 0}

/* ---------- season mode ---------- */
.pb.hd .sz-menu{display:grid !important;gap:4px;padding:12px 14px 12px 18px !important;border-radius:22px !important;background:rgba(255,255,255,.07) !important;color:#fff !important;
  box-shadow:inset 4px 0 0 var(--c,var(--hd-yellow)) !important;text-align:left;min-height:0}
.pb.hd .sz-menu span{font:800 19px/1 var(--hd-display);letter-spacing:.03em;gap:10px}
.pb.hd .sz-menu img{width:30px;height:30px;padding:3px;border-radius:50%;background:#fff}
.pb.hd .sz-menu small{font:400 12.5px/1.35 var(--hd-body);letter-spacing:0;color:rgba(255,255,255,.6)}
.pb.hd .sz-kicker{font:700 11px/1 var(--hd-body);letter-spacing:.12em;color:var(--hd-cyan)}
.pb.hd .sz-title{font:800 26px/.92 var(--hd-display);color:rgba(255,255,255,.75);text-shadow:none;padding-right:44px}
.pb.hd .sz-title span{display:inline-block;font-size:2.4em;line-height:.85;color:#fff}
.pb.hd .sz-lead,.pb.hd .sz-load p{font:400 14px/1.5 var(--hd-body);color:rgba(255,255,255,.72)}
.pb.hd .sz-pickteam{gap:14px;padding:12px 16px 12px 12px;border:0;border-radius:26px;box-shadow:inset 0 1px 0 rgba(255,255,255,.15),inset 0 -3px 0 rgba(0,0,0,.2)}
.pb.hd .sz-pickteam img{width:56px;height:56px;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.pb.hd .sz-pickteam small{font:700 10px/1 var(--hd-body);letter-spacing:.12em;opacity:.7}
.pb.hd .sz-pickteam b{font:800 26px/1 var(--hd-display)}
.pb.hd .sz-pickteam em{font:600 11.5px/1 var(--hd-body)}
.pb.hd .pb-modal.fsu .sz-pickteam{background:linear-gradient(135deg,#8a3549,var(--fsu-g) 55%,#5a2230);color:#fff !important;box-shadow:inset 0 0 0 2px rgba(206,184,136,.55),inset 0 -4px 0 var(--fsu-y)}
.pb.hd .sz-warn{font:500 13px/1.4 var(--hd-body);color:var(--hd-amber)}
.pb.hd .sz-h{font:700 10.5px/1 var(--hd-body);letter-spacing:.1em;color:rgba(255,255,255,.5)}
.pb.hd .sz-h button{font:700 11px var(--hd-body);color:var(--hd-cyan)}
.pb.hd :is(.sz-hrow,.sz-g,.sz-poll li,.sz-news li,.sz-tiles div,.sz-ldr,.sz-bg,.sz-bye,.sz-unit,.sz-star,.sz-prow,.sz-hours > div,.sz-sum div,.sz-plan,.sz-mode){border:0;border-radius:16px;background:var(--hd-chip2)}
.pb.hd .sz-hrow{padding:8px 12px;font:600 13px var(--hd-body)}
.pb.hd .sz-hrow b{font:800 16px/1 var(--hd-display)}
.pb.hd .sz-hrow em{font:400 12px var(--hd-body)}
.pb.hd .sz-load small{font:700 11px var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-lbar{height:10px;border:0;border-radius:5px;background:rgba(255,255,255,.1);box-shadow:none;overflow:hidden}
.pb.hd .sz-lbar i{border-radius:5px;background:var(--hd-yellow);transition:width .25s ease-out}
.pb.hd .sz-spin{animation-timing-function:linear}
/* the hub */
.pb.hd :is(.sz-hub,.sz-gw){max-width:620px;padding:0}
.pb.hd :is(.sz-hub,.sz-gw)::before{z-index:3;background:rgba(255,255,255,.4)}
.pb.hd .sz-hero{border:0;padding:22px 16px 14px;border-radius:34px 34px 0 0;box-shadow:inset 0 -3px 0 var(--a,transparent)}
.pb.hd .pb-modal.fsu .sz-hero{background-color:var(--fsu-g);box-shadow:inset 0 -4px 0 var(--fsu-y)}
.pb.hd .sz-htop{font:700 10.5px/1 var(--hd-body);letter-spacing:.1em}
.pb.hd .sz-ib{height:32px;min-width:34px;padding:0 12px;border:0;border-radius:16px;background:rgba(0,0,0,.35);font:700 11px var(--hd-body);letter-spacing:.06em}
.pb.hd .sz-idl{width:66px;height:66px;border:0;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.pb.hd .sz-idt h1{font:800 30px/.95 var(--hd-display);text-shadow:none}
.pb.hd .sz-idt p{font:600 12.5px var(--hd-body)}
.pb.hd .sz-idt p b{font:800 20px/1 var(--hd-display)}
.pb.hd .sz-rank{min-width:64px;padding:8px 10px;border:0;border-radius:18px;background:rgba(10,10,10,.6);box-shadow:none;color:#fff}
.pb.hd .sz-rank small{font:700 9.5px/1 var(--hd-body);letter-spacing:.1em;color:rgba(255,255,255,.55)}
.pb.hd .sz-rank b{font:800 28px/1 var(--hd-display)}
.pb.hd .sz-rank i{font:700 11px var(--hd-body)}
.pb.hd :is(.sz-fresh,.sz-rvy){padding:6px 11px;border:0;border-radius:999px;background:rgba(0,0,0,.4);font:700 10px/1 var(--hd-body);letter-spacing:.07em}
.pb.hd :is(.sz-fresh,.sz-rvy) b{font:800 15px/1 var(--hd-display)}
.pb.hd .sz-pips i{border-radius:2px}
.pb.hd .sz-next{margin:12px 12px 4px;padding:14px;border:0;border-radius:24px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);background-color:rgba(255,255,255,.05)}
.pb.hd .sz-nl{font:700 11px/1 var(--hd-body);letter-spacing:.1em;color:var(--hd-yellow)}
.pb.hd .sz-side b{font:800 20px/1 var(--hd-display)}
.pb.hd .sz-side small,.pb.hd .sz-at small{font:600 11px var(--hd-body);color:rgba(255,255,255,.55)}
.pb.hd .sz-side img,.pb.hd .sz-side .sz-nologo{filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}
.pb.hd .sz-at span{font:800 24px/1 var(--hd-display);text-shadow:none}
.pb.hd .sz-rk{padding:2px 5px;border-radius:6px;background:var(--hd-yellow);color:#1b1400;font:800 .8em/1.1 var(--hd-display)}
.pb.hd .sz-odds{font:600 11px var(--hd-body)}
.pb.hd .sz-odds i{height:10px;border:0;border-radius:5px;overflow:hidden}
.pb.hd .sz-odds i b{box-shadow:none}
.pb.hd .sz-odds em{font:800 16px/1 var(--hd-display)}
.pb.hd :is(.sz-real,.sz-nb,.sz-sub,.sz-foot,.sz-empty){font-family:var(--hd-body)}
.pb.hd .sz-ctas .pb-go{min-height:52px}
.pb.hd .sz-done h2{font:800 30px/1 var(--hd-display);text-shadow:none}
.pb.hd .sz-recap{margin:10px 12px 0;padding:10px 12px;border:0;border-radius:20px;background:var(--hd-chip2);box-shadow:none}
.pb.hd .sz-tabs{gap:6px;padding:10px 12px;border:0;background:rgba(22,24,29,.94);-webkit-backdrop-filter:var(--hd-blur);backdrop-filter:var(--hd-blur);box-shadow:0 1px 0 rgba(255,255,255,.07)}
.pb.hd .sz-tabs button{height:34px;padding:0 14px;border:0;border-radius:17px;background:var(--hd-chip);box-shadow:none;font:600 13px/1 var(--hd-body);color:rgba(255,255,255,.8)}
.pb.hd .sz-tabs button[aria-pressed="true"]{background:var(--hd-pill);color:var(--hd-pill-ink)}
.pb.hd .sz-body{gap:6px;padding:12px 12px 18px}
.pb.hd .sz-g{padding:9px 12px;column-gap:10px}
.pb.hd .sz-g .wk{font:700 11px var(--hd-body);color:rgba(255,255,255,.45)}
.pb.hd .sz-g .nm{font:600 14px/1.25 var(--hd-body)}
.pb.hd .sz-g .nm small{font:700 10px/1 var(--hd-body);letter-spacing:.08em;color:var(--hd-yellow)}
.pb.hd .sz-g .res{font:800 17px/1 var(--hd-display)}
.pb.hd .sz-g .res.nx{padding:4px 8px;border-radius:999px;background:var(--hd-yellow);color:#1b1400;font:800 11px/1 var(--hd-body);letter-spacing:.06em}
.pb.hd .sz-g .res sup{font:600 9px var(--hd-body)}
.pb.hd .sz-g .real{font:500 11px var(--hd-body);color:rgba(255,255,255,.45)}
.pb.hd .sz-g.flip .real{color:var(--hd-yellow)}
.pb.hd .sz-g.cur{box-shadow:inset 0 0 0 2px var(--hd-yellow)}
.pb.hd .sz-g.bye .nm{font:600 13px var(--hd-body);color:rgba(255,255,255,.5)}
.pb.hd .sz-poll li{padding:7px 12px;gap:10px;box-shadow:inset 4px 0 0 var(--c)}
.pb.hd .sz-poll li b{font:800 17px/1 var(--hd-display)}
.pb.hd .sz-poll .mv{font:700 10.5px var(--hd-body)}
.pb.hd .sz-poll span{font:600 14px var(--hd-body)}
.pb.hd .sz-poll em{font:600 12px var(--hd-body)}
.pb.hd .sz-poll li.me,.pb.hd .sz-conf tr.me td{background:rgba(255,210,63,.12)}
.pb.hd .sz-poll li.me{box-shadow:inset 4px 0 0 var(--hd-yellow)}
.pb.hd .sz-conf{border-spacing:0 4px;font:600 13px var(--hd-body)}
.pb.hd .sz-conf th{font:700 10px var(--hd-body);letter-spacing:.08em;color:rgba(255,255,255,.45)}
.pb.hd .sz-conf td{padding:8px;border:0;background:var(--hd-chip2)}
.pb.hd .sz-conf td:first-child{border:0;border-radius:12px 0 0 12px;color:rgba(255,255,255,.45)}
.pb.hd .sz-conf td:last-child{border:0;border-radius:0 12px 12px 0}
.pb.hd .sz-conf td:nth-child(2){font:600 14px var(--hd-body)}
.pb.hd .sz-conf tr.cut td{box-shadow:inset 0 -2px 0 var(--hd-yellow)}
.pb.hd .sz-ch{padding:3px 6px;border-radius:999px;background:var(--hd-yellow);color:#1b1400;font:800 9.5px/1 var(--hd-body)}
.pb.hd .sz-news li{padding:8px 12px}
.pb.hd .sz-news span{font:400 13.5px/1.4 var(--hd-body)}
.pb.hd .sz-news .t{padding:3px 6px;border-radius:999px;font:700 9.5px/1 var(--hd-body);letter-spacing:.06em}
.pb.hd .sz-tiles{gap:6px}
.pb.hd .sz-tiles div{padding:10px 4px}
.pb.hd .sz-tiles b{font:800 22px/1 var(--hd-display)}
.pb.hd .sz-tiles span{font:600 10px/1.2 var(--hd-body);color:rgba(255,255,255,.55)}
.pb.hd .sz-ldr{padding:10px 14px}
.pb.hd .sz-ldr small{font:700 10px var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-ldr b{font:800 20px/1 var(--hd-display)}
.pb.hd .sz-ldr span{font:400 13px var(--hd-body)}
.pb.hd .sz-heis{padding:4px 8px;border-radius:999px;background:var(--hd-yellow);color:#1b1400;font:800 9.5px/1 var(--hd-body)}
.pb.hd .sz-rd h4{font:700 11px var(--hd-body);letter-spacing:.1em;color:var(--hd-cyan)}
.pb.hd .sz-bg{padding:8px 10px}
.pb.hd .sz-bg small,.pb.hd .sz-bye em{font:600 10px var(--hd-body)}
.pb.hd :is(.sz-bg div,.sz-bye){font:600 13px var(--hd-body)}
.pb.hd .sz-bg b{font:800 16px/1 var(--hd-display)}
.pb.hd :is(.sz-bg i,.sz-bye i){font:600 10.5px var(--hd-body)}
.pb.hd .sz-bye{padding:8px 10px}
.pb.hd .sz-champ{border:0;border-radius:22px;background:rgba(255,210,63,.1);box-shadow:inset 0 0 0 1px rgba(255,210,63,.5)}
.pb.hd .sz-champ b{font:800 22px/1 var(--hd-display)}
.pb.hd .sz-champ span{font:600 12px var(--hd-body)}
/* game week */
.pb.hd .sz-gwh{padding:24px 16px 12px;border:0;border-radius:34px 34px 0 0;font:700 11px/1.2 var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-steps{gap:6px;padding:8px 12px 12px;border:0;box-shadow:0 1px 0 rgba(255,255,255,.07)}
.pb.hd .sz-steps button{gap:6px;padding:9px 2px;border:0;border-radius:16px;background:var(--hd-chip2);font:700 10.5px/1 var(--hd-body);letter-spacing:.06em}
.pb.hd .sz-steps i{width:22px;height:22px;border-radius:50%;font:800 13px/1 var(--hd-display)}
.pb.hd .sz-steps li.on button{box-shadow:inset 0 0 0 2px var(--hd-yellow);color:var(--hd-yellow)}
.pb.hd .sz-opp{gap:14px;padding:14px;border:0;border-radius:24px;box-shadow:inset 0 1px 0 rgba(255,255,255,.15)}
.pb.hd .sz-opp img,.pb.hd .sz-opp .sz-nologo{border:0;box-shadow:0 2px 6px rgba(0,0,0,.35)}
.pb.hd .sz-opp small{font:700 10px var(--hd-body);letter-spacing:.1em}
.pb.hd .sz-opp h2{font:800 26px/1 var(--hd-display)}
.pb.hd .sz-opp p{font:500 12.5px var(--hd-body)}
.pb.hd .sz-unit{padding:12px}
.pb.hd .sz-unit h3{font:700 10.5px var(--hd-body);letter-spacing:.1em;color:rgba(255,255,255,.5)}
.pb.hd .sz-tag{padding:4px 9px;border-radius:999px;font:800 11px/1 var(--hd-body);letter-spacing:.05em}
.pb.hd .sz-split{height:18px;border:0;border-radius:9px;overflow:hidden;font:700 9.5px var(--hd-body)}
.pb.hd .sz-meter{font:600 10.5px var(--hd-body);grid-template-columns:86px 1fr 60px}
.pb.hd .sz-meter i{height:7px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.1)}
.pb.hd .sz-star{padding:10px 12px}
.pb.hd .sz-star small{font:700 10px var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-star b{font:800 18px/1 var(--hd-display)}
.pb.hd .sz-star span{font:400 12.5px var(--hd-body)}
.pb.hd .sz-notes li{font-family:var(--hd-body)}
.pb.hd .sz-notes li::before{border-radius:50%}
.pb.hd .sz-film{padding:12px;border:0;border-radius:18px;background:rgba(125,216,240,.08);box-shadow:none}
.pb.hd .sz-plans{gap:8px}
.pb.hd .sz-plan{padding:12px;box-shadow:none}
.pb.hd .sz-plan b{font:800 16px/1.05 var(--hd-display);letter-spacing:.02em}
.pb.hd .sz-plan small{font:400 12px/1.35 var(--hd-body)}
.pb.hd .sz-plan.on{background:rgba(255,210,63,.1);box-shadow:inset 0 0 0 2px var(--hd-yellow)}
.pb.hd .sz-gr{border:0;border-radius:50%;width:24px;height:24px;font:800 13px/1 var(--hd-display)}
.pb.hd .sz-hours > div{padding:10px 12px}
.pb.hd .sz-hours small{font:700 10px var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-hours b{font:800 26px/1 var(--hd-display)}
.pb.hd .sz-hours b span{font:600 12px var(--hd-body)}
.pb.hd .sz-fprev b{font:800 18px/1 var(--hd-display)}
.pb.hd .sz-prow{padding:12px}
.pb.hd .sz-ph2 b{font:800 17px/1 var(--hd-display)}
.pb.hd .sz-ph2 small{font:400 12.5px var(--hd-body)}
.pb.hd .sz-pc button{width:40px;height:40px;border:0;border-radius:50%;background:var(--hd-chip);box-shadow:none;font:700 18px var(--hd-body)}
.pb.hd .sz-drill em{font:700 11px var(--hd-body)}
.pb.hd .sz-db{height:34px;padding:0 14px;border:0;border-radius:17px;background:rgba(125,216,240,.14);box-shadow:none;color:var(--hd-cyan);font:700 12px var(--hd-body);letter-spacing:.04em}
.pb.hd .sz-db:disabled{background:var(--hd-chip2);box-shadow:none}
.pb.hd .sz-kick{padding:14px;border:0;border-radius:22px}
.pb.hd .sz-sum b{font:600 12.5px/1.35 var(--hd-body)}
.pb.hd .sz-sum small{font:700 10px var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-mode{padding:12px;box-shadow:none}
.pb.hd .sz-mode b{font:800 18px/1 var(--hd-display)}
.pb.hd .sz-mode.on{background:rgba(125,216,240,.1);box-shadow:inset 0 0 0 2px var(--hd-cyan)}
.pb.hd .sz-result{text-align:center}
.pb.hd .sz-result.won{box-shadow:0 -10px 40px rgba(0,0,0,.5),inset 0 0 0 1px rgba(61,220,132,.45)}
.pb.hd .sz-chip{padding:4px 9px;border-radius:999px;font:700 10px var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-rmove{font:700 11px var(--hd-body);letter-spacing:.08em}
.pb.hd .sz-rmove b{font:800 26px/1 var(--hd-display)}
.pb.hd .sz-trophy{width:64px;height:64px}
`;
