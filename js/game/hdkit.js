/* The game's interface: what every piece of it shares. The look is the CFB Board's own (frosted dark glass,
   rounded, Big Shoulders Display for numbers and headlines, Public Sans for words), with a Saturday-broadcast score
   bug, big moments and yellow primary buttons. Its rules are scoped under `.pb.hd` (the game root), over pixelbowl.js's base styles.
   Team colors drive the look; teamPaint() keeps any two teams apart and their text readable. */
import { inkOn } from '../views/preview.js';

export { inkOn };
export const YELLOW = '#ffd23f';

const rgb = c => { const n = parseInt(String(c || '#777').replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = c => { const [r, g, b] = rgb(c); return (r * .299 + g * .587 + b * .114) / 255; };
const dist = (a, b) => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

/* A team's fill, its accent (what reads on dark glass: the alt color when the main one is too dark) and its ink. */
export function teamTone(t){
  const c = t?.color || '#5a6470', a = t?.alt && dist(t.alt, c) > 60 ? t.alt : lum(c) > .6 ? '#222' : '#fff';
  const accent = lum(c) < .22 ? a : c;
  return { c, a, accent, k: inkOn(c) };
}
/* Both teams, kept apart: when their fills are too close, the second team switches to its alt (or a neutral). */
export function teamPaint(me, opp){
  const A = teamTone(me), B = teamTone(opp);
  if (dist(A.c, B.c) < 90){
    const alt = opp?.alt && dist(opp.alt, A.c) > 90 ? opp.alt : '#5b6270';
    Object.assign(B, { c: alt, k: inkOn(alt), accent: lum(alt) < .22 ? B.a : alt });
  }
  return { me: A, opp: B };
}
/* CSS custom properties for a team (--c fill, --a alt, --x accent, --k ink), for a style attribute. */
export const vars = (tone, p = '') => `--${p}c:${tone.c};--${p}a:${tone.a};--${p}x:${tone.accent};--${p}k:${tone.k}`;

export const CSS = `
.pb.hd{--hd-glass:rgba(16,18,22,.72);--hd-glass2:rgba(28,31,37,.86);--hd-line:rgba(255,255,255,.12);--hd-ink:#f4f5f7;--hd-mute:#a3abb6;
  --hd-yellow:${YELLOW};--hd-green:#3ddc84;--hd-red:#ff4d4f;--hd-amber:#ffb020;
  --hd-display:"Big Shoulders Display","Arial Narrow",Impact,sans-serif;--hd-body:"Public Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --hd-blur:blur(24px) saturate(160%);font-family:var(--hd-body)}
.pb.hd :where(button){font-family:var(--hd-body)}
`;
