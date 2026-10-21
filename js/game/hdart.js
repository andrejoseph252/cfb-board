/* Coach Andre's Bowl in HD (beta): the art for drawhd.js. A late-afternoon game at 10 pixels per yard: warm sun, a
   cool stadium shadow along the near sideline, mowed and worn grass, and players rasterised from small shape lists,
   then shaded (light from the top left), selectively outlined and dressed in any team's colors. Everything is
   procedural and built once (the field per matchup, each sprite the first time it's needed). */
import { FW, MID, HASH, clamp } from './sim.js';
import { ROWS } from './font.js';

export const S = 10;   // logical pixels per yard

/* ---------- color ---------- */
export const hex = c => { c = String(c || '#777').replace('#', ''); if (c.length === 3) c = [...c].map(x => x + x).join(''); const n = parseInt(c, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c, a = 1) => { const v = c.map(q => clamp(Math.round(q), 0, 255)).join(','); return a < 1 ? `rgba(${v},${a})` : `rgb(${v})`; };
const lum = c => { const [r, g, b] = hex(c); return (r * .299 + g * .587 + b * .114) / 255; };
const near = (a, b) => { const p = hex(a), q = hex(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 70; };
function rgb2hsl([r, g, b]){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn){ const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; }
  return [h, s, l];
}
function hsl2rgb(h, s, l){
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
const hueStep = (h, target, deg) => { const d = ((target - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), deg); };
/* Five tones per material: highlight, light, base, shadow, deep. Highlights drift warm (toward the late sun), shadows cool. */
function ramp(c){
  const base = hex(c), [h, s, l] = rgb2hsl(base), gray = s < .1;
  return [
    hsl2rgb(gray ? 46 : hueStep(h, 50, 14), gray ? .45 : s, l + (1 - l) * .5),
    hsl2rgb(gray ? 44 : hueStep(h, 50, 6), gray ? .22 : s, l + (1 - l) * .2),
    base,
    hsl2rgb(gray ? 222 : hueStep(h, 235, 10), gray ? .16 : Math.min(1, s * 1.05 + .04), l * .74),
    hsl2rgb(gray ? 232 : hueStep(h, 250, 20), gray ? .2 : Math.min(1, s * 1.1 + .08), l * .5)
  ];
}
const RAMPS = new Map();
const rampOf = c => { let r = RAMPS.get(c); if (!r){ r = ramp(c); RAMPS.set(c, r); } return r; };
/* Scene lighting, shared by the grass, the crowd and the players: warm sun, a cool blue stadium shadow at half strength. */
export const LIT = c => [c[0] * 1.04 + 7, c[1] * 1.01 + 3, c[2] * .9];
const SHD0 = c => [c[0] * .44 + 9, c[1] * .5 + 13, c[2] * .6 + 26];
export const SHD = c => mix(LIT(c), SHD0(c), .5);

/* ---------- noise ---------- */
export function hash2(i, j){ let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y){
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.03 + 17, y * 2.03 + 5) * .3 + vnoise(x * 4.1 + 3, y * 4.1 + 11) * .2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
export const bayer = (i, j) => BAYER[(j & 3) * 4 + (i & 3)];
export const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').imageSmoothingEnabled = false; return c; };

/* ---------- the stadium's shadow (world space) ----------
   The stands on the near sideline (y < 0) sit between the low sun and the field, so their roofline falls across it:
   scalloped by the roof trusses and pushed out a little by the press box. */
function shadowEdge(x){
  let e = 4.8 + Math.sin(x * .13) * .7 + (Math.floor((x + 200) / 6) % 2) * .45;
  e += clamp((x - 33) / 3, 0, 1) * clamp((63 - x) / 3, 0, 1) * 2.2;
  return e;
}
export function inShadow(x, y, i = 0, j = 0){
  const e = shadowEdge(x);
  if (Math.abs(y - e) < .12) return ((i + j) & 1) === 0;
  return y < e;
}

/* ---------- bitmap fonts ---------- */
/* Field numbers, 5x9 drawn at 2x (about two yards tall). */
const F9 = { 0: ['01110', '10001', '10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00001', '00010', '00100', '01000', '10000', '11111'],
  3: ['01110', '10001', '00001', '00001', '00110', '00001', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '10010', '11111', '00010', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '00001', '10001', '01110'] };
/* Jersey numbers: 4x6 for front and back, 3x5 from the side. */
const F4 = { 0: ['0110', '1001', '1001', '1001', '1001', '0110'], 1: ['0010', '0110', '0010', '0010', '0010', '0111'],
  2: ['0110', '1001', '0010', '0100', '1000', '1111'], 3: ['1110', '0001', '0110', '0001', '0001', '1110'],
  4: ['1001', '1001', '1111', '0001', '0001', '0001'], 5: ['1111', '1000', '1110', '0001', '0001', '1110'],
  6: ['0110', '1000', '1110', '1001', '1001', '0110'], 7: ['1111', '0001', '0010', '0100', '0100', '0100'],
  8: ['0110', '1001', '0110', '1001', '1001', '0110'], 9: ['0110', '1001', '1001', '0111', '0001', '0110'] };
const F3 = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
const glyph = ch => ROWS[ch] || ROWS['?'];
/* Letters the field can paint (the board's 5x7 font), anything else dropped. */
const paintable = s => String(s || '').toUpperCase().replace(/[^A-Z0-9& ]/g, '').replace(/\s+/g, ' ').trim();

/* =====================================================================================================
   PLAYERS
   A Grid holds a region letter and a "part" id per pixel. Shapes (ellipses, capsules, rects) are painted back to
   front; decals recolor pixels without changing their part. Rendering then shades each pixel from its own part's
   silhouette, creases where a part tucks behind a later one, and wraps the figure in a colored (not black) outline.
   Regions: H helmet, W helmet stripe, M facemask, K skin, E eyes, J jersey, T sleeve trim, N numbers, P pants,
   Q pants stripe, O socks, B shoes, G gloves.
   ===================================================================================================== */
class Grid {
  constructor(w, h){ this.w = w; this.h = h; this.reg = new Array(w * h).fill(null); this.part = new Int16Array(w * h).fill(-1); this.force = new Int8Array(w * h).fill(-1); this.flags = []; }
  newPart(f = {}){ this.flags.push(f); return this.flags.length - 1; }
  set(x, y, r, p){ if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = y * this.w + x; this.reg[i] = r; this.part[i] = p; this.force[i] = -1; }
  at(x, y){ return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.part[y * this.w + x]; }
  ell(p, r, cx, cy, rx, ry){
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++)
      if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1) this.set(x, y, r, p);
  }
  cap(p, r, x0, y0, x1, y1, rad){
    const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y0, y1) - rad - 1); y <= Math.max(y0, y1) + rad + 1; y++) for (let x = Math.floor(Math.min(x0, x1) - rad - 1); x <= Math.max(x0, x1) + rad + 1; x++){
      const px = x + .5, py = y + .5, t = clamp(((px - x0) * dx + (py - y0) * dy) / L, 0, 1), qx = x0 + dx * t - px, qy = y0 + dy * t - py;
      if (qx * qx + qy * qy <= rad * rad) this.set(x, y, r, p);
    }
  }
  rect(p, r, x0, y0, x1, y1){ for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, r, p); }
  decal(x, y, r, tone = -1){ x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = y * this.w + x; if (this.part[i] < 0) return; if (r) this.reg[i] = r; if (tone >= 0) this.force[i] = tone; }
  regAt(x, y){ return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.reg[y * this.w + x]; }
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* One arm: skin, a jersey sleeve over the top half with a trim stripe, a glove. */
function arm(g, sh, el, hd){
  const p = g.newPart();
  g.cap(p, 'K', sh[0], sh[1], el[0], el[1], 1.6); g.cap(p, 'K', el[0], el[1], hd[0], hd[1], 1.45);
  const sl = lerp2(sh, el, .62); g.cap(p, 'J', sh[0], sh[1], sl[0], sl[1], 2.05);
  const ty = Math.round(lerp2(sh, el, .5)[1] - .5);
  for (let xx = 0; xx < g.w; xx++) if (g.part[ty * g.w + xx] === p && g.reg[ty * g.w + xx] === 'J') g.decal(xx, ty, 'T');
  g.ell(p, 'G', hd[0], hd[1] + .2, 1.55, 1.45);
  return p;
}
function numberDecal(g, num, font, x0, y0, gap = 1){
  const ds = String(num).split(''), fw = font[0][0].length, fh = font[0].length;
  let x = Math.round(x0 - (ds.length * fw + (ds.length - 1) * gap) / 2);
  const pts = [];
  for (const d of ds){ const gl = font[d]; for (let r = 0; r < fh; r++) for (let c = 0; c < fw; c++) if (gl[r][c] === '1') pts.push([x + c, y0 + r]); x += fw + gap; }
  for (const [px, py] of pts) g.decal(px, py, 'N');
  // A one-pixel drop shadow down and right gives the numbers a stitched-on feel.
  for (const [px, py] of pts) if (g.regAt(px + 1, py + 1) && g.regAt(px + 1, py + 1) !== 'N') g.decal(px + 1, py + 1, null, 4);
}
/* A center stripe over the helmet (front and back), along its crown from the side. */
function helmetStripe(g, view, cx, top, lim){
  const D = (x, y) => { if (g.regAt(x, y) === 'H') g.decal(x, y, 'W'); };
  if (view === 'side'){ for (let x = 0; x < g.w; x++) for (let y = top; y < top + 3; y++) if (g.regAt(x, y) === 'H' && g.regAt(x, y - 1) !== 'H' && g.regAt(x, y - 1) !== 'W'){ D(x, y); break; } }
  else for (let y = top; y <= lim; y++){ D(cx - 1, y); D(cx, y); }
}

/* Front or back, standing set, running, throwing. 22x34, feet on row 32. */
function figFB(o){
  const g = new Grid(22, 34), cx = 11, back = o.view === 'back', run = o.run;
  // Running (8 frames a stride): the body rides a pixel higher off each push.
  const c = (o.c || 0) - (run != null && run % 4 >= 1 && run % 4 <= 2 ? 1 : 0), b = o.b || 0;
  const yHip = 21 + c, yKnee = 26.6 + c * .35;
  for (const s of [-1, 1]){
    const hipX = cx + s * 2.6; let kneeX = cx + s * (3.1 + c * .5), kneeY = yKnee, footX = cx + s * (3.3 + c * .4), footY = 31;
    if (run != null){
      // This leg's swing: it lifts while coming through (from behind, the sole shows) and plants while the other swings.
      const up = Math.max(0, Math.sin((run / 8 + (s > 0 ? 0 : .5)) * Math.PI * 2));
      kneeX = cx + s * (2.9 - up * .5); footX = cx + s * (3 - up * .9);
      kneeY = yKnee - up * (back ? 1.2 : 2.4); footY = 31 - up * (back ? 6.5 : 4);
    }
    const p = g.newPart();
    g.cap(p, 'P', hipX, yHip, kneeX, kneeY, 2.55);
    if (back && footY < 28){ g.cap(p, 'O', kneeX, kneeY + 1, footX, footY + .8, 1.9); g.ell(p, 'B', footX, footY + .3, 2.2, 1.6); }   // kicked up behind: the sole shows
    else { g.cap(p, 'O', kneeX, kneeY + 1.3, footX, footY - .6, 1.9); g.ell(p, 'B', footX + s * .35, footY + .55, 2.45, 1.3); }
    const sx = Math.round(hipX + s * 2.1 - .5); for (let y = Math.round(yHip - 1); y <= Math.round(kneeY - 1); y++) g.decal(sx, y, 'Q');
  }
  const armPose = s => {
    const sh = [cx + s * 7.3, 13.8 + c + b];
    let el = [cx + s * 8.1, 17.6 + c + b], hd = [cx + s * 7.7, 21 + c];
    if (o.arms === 'ready'){ el = [cx + s * 8.3, 17.8 + c + b]; hd = [cx + s * 5.4, 20.3 + c]; }
    if (o.arms === 'knees'){ el = [cx + s * 7.9, 18.2 + c]; hd = [cx + s * 4.6, yKnee - 1.6]; }
    if (o.arms === 'block'){ el = [cx + s * 7.6, 17 + c + b]; hd = [cx + s * 4.2, 16.5 + c]; }
    if (run != null){
      // Pumping, opposite the legs: the forward hand comes up across the chest, the back one drops past the hip.
      const sa = Math.sin((run / 8 + (s > 0 ? .5 : 0)) * Math.PI * 2);
      el = [cx + s * (8.3 + sa * .2), 17.6 + c - sa * 1.1]; hd = [cx + s * (7.2 - Math.max(0, sa) * 1.6), (back ? 19.4 - sa * 3 : 18.6 - sa * 4) + c];
    }
    if (o.arms === 'throw' && s === 1){ el = [cx + 9, 9.5 + c]; hd = [cx + 8.6, 4.6 + c]; }
    if (o.arms === 'throw' && s === -1){ el = [cx - 8.2, 17.5 + c]; hd = [cx - 5, 19.5 + c]; }
    return [sh, el, hd];
  };
  // From the back, arms reaching forward are hidden behind the body.
  const armsBehind = back && o.arms !== 'throw' && run == null;
  if (armsBehind) for (const s of [-1, 1]) arm(g, ...armPose(s));
  const pN = g.newPart(); g.rect(pN, 'K', 9, 9 + c + b, 12, 11 + c + b);
  // Pants, torso and shoulder pads as one part, so the numbers sit cleanly across it.
  const pB = g.newPart({ pad: true });
  g.rect(pB, 'P', 5, 19 + c, 16, yHip + 1);
  g.rect(pB, 'J', 5, 13 + c + b, 16, 19 + c);
  g.ell(pB, 'J', cx, 13.4 + c + b, 9.3, 3.4);
  if (!armsBehind) for (const s of [-1, 1]) arm(g, ...armPose(s));
  const hy = 5 + c + b;
  const pH = g.newPart({ gloss: true, hcx: cx, hcy: hy + .3, hrx: 5, hry: 4.6 });
  g.ell(pH, 'H', cx, hy + .3, 5.0, 4.6);
  if (!back){
    for (let y = hy; y <= hy + 3; y++) for (let x = cx - 3; x <= cx + 2; x++) g.decal(x, y, 'K', y === hy ? 4 : 3);
    g.decal(cx - 2, hy + 1, 'E'); g.decal(cx + 1, hy + 1, 'E');
    const pM = g.newPart({ mask: true });
    for (let x = cx - 4; x <= cx + 3; x++) g.set(x, hy + 2, 'M', pM);
    for (let x = cx - 3; x <= cx + 2; x++) g.set(x, hy + 4, 'M', pM);
    for (const x of [cx - 3, cx + 2]) g.set(x, hy + 3, 'M', pM);
  } else for (let x = cx - 3; x <= cx + 2; x++) g.decal(x, hy + 4, null, 3);
  if (o.stripe) helmetStripe(g, o.view, cx, hy - 4, back ? hy + 4 : hy - 1);
  numberDecal(g, o.num, F4, cx, 14 + c + b, String(o.num).length > 1 ? 2 : 1);
  return { g, ax: cx, ay: 32 };
}

/* Linemen in a three-point stance, from the front (defense) or the back (offense). 24x32, feet on row 30. */
function figLine(o){
  const g = new Grid(24, 32), cx = 12, b = o.b || 0, back = o.view === 'back';
  for (const s of [-1, 1]){
    const p = g.newPart();
    const hip = [cx + s * 3, back ? 22 : 21], knee = [cx + s * 7, 24.6], foot = [cx + s * 7, 29];
    g.cap(p, 'P', hip[0], hip[1], knee[0], knee[1], 2.6);
    g.cap(p, 'O', knee[0], knee[1] + 1.2, foot[0], foot[1] - .5, 1.95);
    g.ell(p, 'B', foot[0] + s * .3, foot[1] + .6, 2.45, 1.35);
    g.decal(Math.round(hip[0] + s * 1.6 - .5 + (s > 0 ? 1 : 0)), hip[1] + 1, 'Q'); g.decal(Math.round(knee[0] + s * 1.8 - .5 + (s > 0 ? 1 : 0)), knee[1] - 1, 'Q');
  }
  if (back){
    // Head down behind the pads, then the back, the pads, the seat of the pants.
    const pH = g.newPart({ gloss: true, hcx: cx, hcy: 9.8 + b, hrx: 4.6, hry: 4.2 }); g.ell(pH, 'H', cx, 9.8 + b, 4.6, 4.2);
    if (o.stripe) helmetStripe(g, 'back', cx, 5 + b, 13);
    arm(g, [cx - 7.8, 14 + b], [cx - 8.6, 18.6], [cx - 6.9, 22.2]);
    arm(g, [cx + 7.8, 14 + b], [cx + 8.4, 18.8], [cx + 6.4, 24.8]);
    const pB = g.newPart({ pad: true });
    g.ell(pB, 'J', cx, 15.6 + b, 7.6, 4.6);
    g.ell(pB, 'J', cx, 12.9 + b, 10, 2.9);
    g.ell(pB, 'P', cx, 20.8, 7.1, 3.5);
    numberDecal(g, o.num, F4, cx, 12 + b, String(o.num).length > 1 ? 2 : 1);
    for (let y = 19; y <= 22; y++){ g.decal(cx - 7, y, 'Q'); g.decal(cx + 6, y, 'Q'); }
  } else {
    arm(g, [cx - 7.6, 14.4 + b], [cx - 8.6, 19.2], [cx - 6.6, 22.6]);
    const pB = g.newPart({ pad: true });
    g.rect(pB, 'P', 7, 19, 16, 22);
    g.ell(pB, 'J', cx, 17.4 + b, 6.3, 4.1);
    g.ell(pB, 'J', cx, 13.6 + b, 10.4, 3.6);
    numberDecal(g, o.num, F4, cx, 14 + b, String(o.num).length > 1 ? 2 : 1);
    arm(g, [cx + 7.8, 14.6 + b], [cx + 8.3, 20.5], [cx + 7, 29.1]);
    const hy = 8 + b;
    const pH = g.newPart({ gloss: true, hcx: cx, hcy: hy + .3, hrx: 5, hry: 4.6 }); g.ell(pH, 'H', cx, hy + .3, 5, 4.6);
    for (let y = hy; y <= hy + 3; y++) for (let x = cx - 3; x <= cx + 2; x++) g.decal(x, y, 'K', y === hy ? 4 : 3);
    g.decal(cx - 2, hy + 1, 'E'); g.decal(cx + 1, hy + 1, 'E');
    const pM = g.newPart({ mask: true });
    for (let x = cx - 4; x <= cx + 3; x++) g.set(x, hy + 2, 'M', pM);
    for (let x = cx - 3; x <= cx + 2; x++) g.set(x, hy + 4, 'M', pM);
    for (const x of [cx - 3, cx + 2]) g.set(x, hy + 3, 'M', pM);
    if (o.stripe) helmetStripe(g, 'front', cx, hy - 4, hy - 1);
  }
  return { g, ax: cx, ay: 30 };
}

/* Side view, facing right: set or running. 24x34, feet on row 32. */
function figSide(o){
  const g = new Grid(24, 34), b = o.b || 0, run = o.run;
  let c = o.c || 0;
  const lean = run != null ? 1.6 : 0;
  let back = { hip: [9.6, 21 + c], knee: [8.6, 26.6 + c * .3], foot: [8.2, 31] }, front = { hip: [12.4, 21 + c], knee: [14.4, 26.4 + c * .3], foot: [14, 31] };
  if (run != null){
    // An 8-frame stride: each thigh swings about the hip, the knee folds as the leg comes through (the heel kicks up
    // behind), and the whole body drops to keep the lower foot on the turf, so it rises and falls with each step.
    const legAt = ph => {
      const a = ph * Math.PI * 2, th = .62 * Math.cos(a), bend = Math.sin(a) < 0 ? .25 + 1.45 * -Math.sin(a) : .22;
      const hip = [11.2, 21], knee = [hip[0] + 5.2 * Math.sin(th), hip[1] + 5.2 * Math.cos(th)], sa = th - bend;
      return { hip, knee, foot: [knee[0] + 5.4 * Math.sin(sa), knee[1] + 5.4 * Math.cos(sa)] };
    };
    front = legAt(run / 8); back = legAt(run / 8 + .5);
    c = 31 - Math.max(front.foot[1], back.foot[1]);
    for (const L of [front, back]) for (const k of ['hip', 'knee', 'foot']) L[k] = [L[k][0], L[k][1] + c];
  }
  const leg = L => { const p = g.newPart(); g.cap(p, 'P', L.hip[0], L.hip[1], L.knee[0], L.knee[1], 2.55);
    g.cap(p, 'O', L.knee[0], L.knee[1] + 1.1, L.foot[0], L.foot[1] - .6, 1.9); g.ell(p, 'B', L.foot[0] + 1, L.foot[1] + .5, 2.7, 1.3); };
  leg(back);
  const sh = [12.2 + lean, 13.8 + c + b];
  let aB = [[sh[0] - .8, sh[1]], [sh[0] + .4, 18 + c], [sh[0] + 2.6, 20 + c]], aF = [[sh[0] + 1.8, sh[1] + .2], [sh[0] + 3, 18 + c], [sh[0] + 5.2, 19.6 + c]];
  if (o.arms === 'knees') aF = [[sh[0] + 1.8, sh[1] + .2], [sh[0] + 2.2, 18.4 + c], [front.knee[0] + .6, front.knee[1] - 1.8]];
  if (o.arms === 'throw') aF = [[sh[0] + .2, sh[1]], [sh[0] - 1.6, 9.5 + c], [sh[0] - .6, 5 + c]];
  if (run != null){
    // Arms pump opposite the legs (the near arm with the far leg), elbows bent, hands driving forward and up.
    const armAt = ph => { const a = .95 * Math.cos(ph * Math.PI * 2), el = [sh[0] + 4 * Math.sin(a), sh[1] + 4 * Math.cos(a)], f = a + 1.5;
      return [[sh[0] + .3, sh[1] + .3], el, [el[0] + 3.4 * Math.sin(f), el[1] + 3.4 * Math.cos(f)]]; };
    aF = armAt(run / 8 + .5); aB = armAt(run / 8);
  }
  arm(g, ...aB);
  const pN = g.newPart(); g.rect(pN, 'K', 11 + Math.round(lean), 9 + c + b, 13 + Math.round(lean), 11 + c + b);
  const pB = g.newPart({ pad: true });
  g.rect(pB, 'P', 8, 19 + c, 14, 22 + c);
  g.ell(pB, 'J', 11 + lean * .6, 16.2 + c + b, 5.2, 5.6);
  g.ell(pB, 'J', 11.8 + lean, 13.6 + c + b, 5.2, 3.3);
  for (let y = 20 + c; y <= 22 + c; y++) g.decal(9, y, 'Q');
  numberDecal(g, o.num, F3, 9.6 + lean * .5, 14 + c + b, 1);
  leg(front);
  // Helmet with the face and mask on the right.
  const hy = 5 + c + b, hx = 12.4 + lean;
  const pH = g.newPart({ gloss: true, hcx: hx, hcy: hy + .4, hrx: 4.9, hry: 4.6 }); g.ell(pH, 'H', hx, hy + .4, 4.9, 4.6);
  const fx = Math.round(hx + 2.6);
  for (let y = hy + 1; y <= hy + 3; y++) for (let x = fx; x <= fx + 2; x++) g.decal(x, y, 'K', 3);
  g.decal(fx, hy + 1, 'E');
  if (o.stripe) helmetStripe(g, 'side', Math.round(hx), hy - 4, hy + 4);
  const pM = g.newPart({ mask: true });
  for (let y = hy + 1; y <= hy + 4; y++) g.set(fx + 3, y, 'M', pM);
  for (let x = fx + 1; x <= fx + 3; x++){ g.set(x, hy + 2, 'M', pM); g.set(x, hy + 4, 'M', pM); }
  g.set(fx + 2, hy + 5, 'M', pM);
  arm(g, ...aF);
  return { g, ax: 11, ay: 32 };
}

/* Side view, three-point stance facing right. 30x31, feet on row 29. */
function figSideLine(o){
  const g = new Grid(30, 31), b = o.b || 0;
  const leg = (hip, knee, foot) => { const p = g.newPart(); g.cap(p, 'P', ...hip, ...knee, 2.6); g.cap(p, 'O', knee[0] - .6, knee[1] + .9, ...foot, 1.9); g.ell(p, 'B', foot[0] + 1, foot[1] + .9, 2.7, 1.3); };
  leg([8.6, 16], [12.6, 21.8], [8.4, 27.4]);
  arm(g, [16.4, 13 + b], [15.6, 18.2], [14.4, 21.2]);
  const pB = g.newPart({ pad: true });
  g.cap(pB, 'J', 9.6, 14.6 + b * .5, 17, 12.8 + b, 4.3);
  g.ell(pB, 'J', 17.6, 12.6 + b, 4.6, 3.8);
  g.ell(pB, 'P', 8.2, 16.6, 3.6, 3.8);
  numberDecal(g, o.num, F3, 13, 11 + b, 1);
  leg([10.4, 17.4], [15, 22.4], [12.6, 27.6]);
  const pN = g.newPart(); g.rect(pN, 'K', 19, 10 + b, 21, 12 + b);
  const hy = 7 + b, hx = 22.2;
  const pH = g.newPart({ gloss: true, hcx: hx, hcy: hy + .4, hrx: 4.7, hry: 4.4 }); g.ell(pH, 'H', hx, hy + .4, 4.7, 4.4);
  const fx = Math.round(hx + 2.4);
  for (let y = hy + 1; y <= hy + 3; y++) for (let x = fx; x <= fx + 2; x++) g.decal(x, y, 'K', 3);
  g.decal(fx, hy + 1, 'E');
  if (o.stripe) helmetStripe(g, 'side', Math.round(hx), hy - 4, hy + 4);
  const pM = g.newPart({ mask: true });
  for (let y = hy + 1; y <= hy + 4; y++) g.set(fx + 3, y, 'M', pM);
  for (let x = fx + 1; x <= fx + 3; x++){ g.set(x, hy + 2, 'M', pM); g.set(x, hy + 4, 'M', pM); }
  arm(g, [19, 13.6 + b], [20.8, 19.6], [21.2, 27.4]);
  return { g, ax: 11, ay: 29 };
}

/* ---------- uniforms ---------- */
/* Teams whose real uniform the two-color rule below gets wrong, by ESPN id: only what differs, per home and road. */
const KITS = {
  // Florida State: gold helmet with a garnet facemask and stripe; garnet jersey with white numbers at home, white
  // with garnet numbers on the road; gold pants either way.
  52: { home: { H: '#ceb888', W: '#782f40', M: '#782f40', N: '#ffffff', T: '#ceb888', P: '#ceb888', Q: '#782f40', O: '#782f40', G: '#782f40' },
    away: { H: '#ceb888', W: '#782f40', M: '#782f40', N: '#782f40', T: '#782f40', P: '#ceb888', Q: '#782f40', O: '#f2f2ee', G: '#782f40' } }
};
/* A team's uniform from its two colors: at home the jersey in the team color, on the road white with color trim. */
export function uniform(t, away){
  const color = t.color || '#777', alt = t.alt && !near(t.alt, color) ? t.alt : (lum(color) > .6 ? '#222222' : '#ffffff');
  const shared = { H: color, W: alt, M: '#2a2d34', B: '#1a1a22', E: '#1a0f0c' };
  // Numbers need to read against the jersey: the alt color when it's clearly lighter or darker, else white or black.
  const contrast = (c, on) => Math.abs(lum(c) - lum(on)) > .3 ? c : lum(on) > .55 ? '#1c1c22' : '#f4f4f0';
  const u = away
    ? { ...shared, J: '#f2f2ee', T: color, N: contrast(color, '#f2f2ee'), P: lum(alt) > .7 ? '#d9d9d9' : '#e8e8e8', Q: color, O: '#f2f2ee', G: color }
    : { ...shared, J: color, T: alt, N: contrast(alt, color), P: lum(color) < .25 ? alt : '#f2f2f2', Q: color, O: color, G: alt };
  Object.assign(u, KITS[t.id]?.[away ? 'away' : 'home']);
  u.key = Object.values(u).join('');
  u.stripe = !near(u.W, u.H);
  return u;
}

/* Rasterise a Grid: per-part shading, creases, rim light, selective outline. lit = false: inside the stadium shadow. */
function renderGrid(g, uni, skin, lit){
  const { w, h } = g, cv = canvas(w, h), x = cv.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  const pal = r => rampOf(r === 'K' ? skin : uni[r]);
  const L = lit ? LIT : SHD, OUT = [20, 13, 32];
  const same = (i, j, p) => g.at(i, j) === p;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    const k = j * w + i, p = g.part[k]; if (p < 0) continue;
    const r = g.reg[k], f = g.flags[p];
    let tone;
    if (r === 'E') tone = 4;
    else if (g.force[k] >= 0) tone = g.force[k];
    else {
      const tl = !same(i - 1, j, p) || !same(i, j - 1, p), br = !same(i + 1, j, p) || !same(i, j + 1, p);
      tone = 2;
      if (br && !tl) tone = 3; else if (tl && !br) tone = 1;
      if (!br && (!same(i + 2, j, p) || !same(i + 1, j + 1, p)) && f.gloss) tone = Math.max(tone, (i + j) & 1 ? 3 : 2);
      // A crease where this part tucks behind a later one.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const q = g.at(i + dx, j + dy); if (q > p && !g.flags[q].mask){ tone = 4; break; } }
      if (f.gloss && f.hrx){
        const u = (i + .5 - f.hcx) / f.hrx, v = (j + .5 - f.hcy) / f.hry;
        if (lit && tone === 1 && u < .25 && v < .1) tone = 0;   // rim light along the lit edge
        if (Math.hypot(u + .38, v + .45) < .2) tone = lit ? 0 : 1;   // specular
        else if (Math.hypot(u + .38, v + .45) < .38 && tone === 2) tone = 1;
        if (u > .35 && v > .2 && tone === 2) tone = 3;
      }
      if (f.pad && tone === 1 && lit && j < g.h * .5 && i < w * .5) tone = 0;   // shoulder pad rim light
      if (r === 'N' && tone === 4) tone = 3;
      if (r === 'N' && tone === 0) tone = 1;
    }
    const col = L(pal(r)[tone]);
    d[k * 4] = col[0]; d[k * 4 + 1] = col[1]; d[k * 4 + 2] = col[2]; d[k * 4 + 3] = 255;
  }
  // Selective outline: the neighbour's darkest tone, lighter on the side facing the sun.
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    const k = j * w + i; if (g.part[k] >= 0) continue;
    let nb = null, lightSide = false;
    for (const [dx, dy, ls] of [[1, 0, true], [0, 1, true], [-1, 0, false], [0, -1, false]]){
      const ii = i + dx, jj = j + dy; if (g.at(ii, jj) >= 0 && (!nb || (!ls && lightSide))){ nb = g.reg[jj * w + ii]; lightSide = ls; }
    }
    if (!nb) continue;
    const col = L(mix(pal(nb === 'E' ? 'H' : nb)[4], OUT, lightSide ? .3 : .62));
    d[k * 4] = col[0]; d[k * 4 + 1] = col[1]; d[k * 4 + 2] = col[2]; d[k * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return cv;
}
const flipCanvas = c => { const f = canvas(c.width, c.height), x = f.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); return f; };
/* Lying on the turf: the side view turned on its back, head toward where he was going. */
const lieCanvas = c => { const f = canvas(c.height, c.width), x = f.getContext('2d'); x.translate(c.height, 0); x.rotate(Math.PI / 2); x.drawImage(c, 0, 0); return f; };
const silhouette = c => { const s = canvas(c.width, c.height), x = s.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); return s; };

/* One frame of one player, cached. o: { uni, view ('back' | 'front' | 'side'), pose ('set' | 'line'), c (crouch),
   arms, b (breath), run (0-3 or null), num, skin, flip, lit, down }. Returns { cv, sil, ax, ay }: the canvas, its
   silhouette (for the cast shadow) and the feet. */
const SPR = new Map();
export function getSprite(o){
  const key = `${o.uni.key}|${o.view}|${o.pose}|${o.c}|${o.arms}|${o.b}|${o.run}|${o.num}|${o.skin}|${o.flip}|${o.lit}|${o.down}`;
  let s = SPR.get(key); if (s) return s;
  if (SPR.size > 4000) SPR.clear();   // a long session's worth of jerseys and frames, then start over
  const fo = { ...o, stripe: o.uni.stripe };
  if (o.down){ fo.view = 'side'; fo.pose = 'set'; fo.c = 0; fo.arms = 'hang'; fo.run = null; fo.b = 0; }
  const fig = fo.pose === 'line' ? (fo.view === 'side' ? figSideLine(fo) : figLine(fo)) : fo.view === 'side' ? figSide(fo) : figFB(fo);
  let cv = renderGrid(fig.g, o.uni, o.skin, o.lit), ax = fig.ax, ay = fig.ay;
  if (o.down){ cv = lieCanvas(cv); ax = cv.width >> 1; ay = cv.height - 3; }
  if (o.flip){ cv = flipCanvas(cv); ax = cv.width - ax; }
  s = { cv, sil: silhouette(cv), ax, ay };
  SPR.set(key, s);
  return s;
}

/* The football: a shaded pixel ellipse with laces, per size, orientation and spin frame. */
const BALLS = new Map();
export function ballSprite(vertical, big, spin){
  const key = `${vertical}${big}${spin}`; let c = BALLS.get(key); if (c) return c;
  const L = big ? 9 : 7, Wd = big ? 5 : 4, w = (vertical ? Wd : L) + 2, h = (vertical ? L : Wd) + 2;
  c = canvas(w, h); const x = c.getContext('2d');
  const rx = (vertical ? Wd : L) / 2, ry = (vertical ? L : Wd) / 2, cx = w / 2, cy = h / 2;
  const inside = (i, j) => ((i + .5 - cx) / rx) ** 2 + ((j + .5 - cy) / ry) ** 2 <= 1.02;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    if (inside(i, j)){
      const u = (i + .5 - cx) / rx, v = (j + .5 - cy) / ry, l = -u * .6 - v * .8;
      x.fillStyle = l > .7 ? '#e0a060' : l > .15 ? '#a95f26' : l > -.5 ? '#86461b' : '#5c2d10';
      x.fillRect(i, j, 1, 1);
    } else if (inside(i - 1, j) || inside(i + 1, j) || inside(i, j - 1) || inside(i, j + 1)){ x.fillStyle = '#26110a'; x.fillRect(i, j, 1, 1); }
  }
  if (spin){
    x.fillStyle = '#f6f1e2';
    if (vertical){ const lx = Math.floor(cx) - (spin === 2 ? 1 : 0); for (let j = Math.floor(cy) - 2; j <= Math.floor(cy) + 1; j++) x.fillRect(lx, j, 1, 1); }
    else { const ly = Math.floor(cy) - 1; for (let i = Math.floor(cx) - 2; i <= Math.floor(cx) + 1; i++) x.fillRect(i, ly, 1, 1); }
  }
  BALLS.set(key, c); return c;
}

/* A soft contact shadow under the feet: a pixel ellipse with a dithered fringe. */
export const AO = (() => {
  const w = 22, h = 7, c = canvas(w, h), x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    const u = (i + .5 - w / 2) / (w / 2), v = (j + .5 - h / 2) / (h / 2), r = u * u + v * v;
    if (r > 1 || r >= .7 && (i + j) % 2) continue;
    x.fillStyle = r < .35 ? 'rgba(8,12,18,.5)' : r < .7 ? 'rgba(8,12,18,.3)' : 'rgba(8,12,18,.22)';
    x.fillRect(i, j, 1, 1);
  }
  return c;
})();

/* =====================================================================================================
   THE FIELD (world space, baked once per matchup): x along the texture, y down it, 10 px per yard. Walls behind
   both end lines, the far one in the home team's color with its name along it; the stands are separate (crowd()).
   ===================================================================================================== */
export const FX0 = -14, FX1 = 114, FY0 = -10, FY1 = 64;
const TW = (FX1 - FX0) * S, TH = (FY1 - FY0) * S;
const GRASS = ['#2a5120', '#335f26', '#3d6d2b', '#487c30', '#548a35', '#62983b'].map(hex);
const WORN = ['#45642a', '#557233', '#677d3e', '#7a8749'].map(hex);
const DIRT = hex('#7a6446');
const CHALK = ['#f2f0e4', '#e3e2d4', '#fbfaf1'].map(hex);
/* End zone paint: four depths of the team color (the grass shows through as a darker or lighter coat). */
const ezRamp = c => [.64, .76, .88, .98].map(f => hex(c).map(v => v * f));
/* Letters in an end zone: the team's other color if it stands out, else white. */
const letterColor = t => t.alt && !near(t.alt, t.color || '#777') ? t.alt : '#f2f0e4';

/* home: your team (its end zone behind you, its fans and wall); away: theirs. Returns { tex, mask }: the field, and
   where the stadium shadow falls on it (alpha). */
export function buildField(home, away){
  const tex = canvas(TW, TH), tx = tex.getContext('2d'), img = tx.createImageData(TW, TH), d = img.data;
  const mask = canvas(TW, TH), mx = mask.getContext('2d'), mimg = mx.createImageData(TW, TH), md = mimg.data;
  const paint = new Uint8Array(TW * TH);
  const P = (i, j, code) => { if (i >= 0 && j >= 0 && i < TW && j < TH) paint[j * TW + i] = code; };
  const ti = x => Math.round((x - FX0) * S), tj = y => Math.round((y - FY0) * S);
  const stamp = (gl, scale, map, code) => { for (let r = 0; r < gl.length; r++) for (let c = 0; c < gl[r].length; c++) if (gl[r][c] === '1')
    for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++){ const [i, j] = map(c * scale + a, r * scale + b); P(i, j, code); } };
  // Yard numbers, tops toward the nearer sideline, with the little arrows pointing at the nearer goal.
  for (let yd = 10; yd <= 90; yd += 10){
    const lab = String(yd <= 50 ? yd : 100 - yd), L = ti(yd);
    for (const far of [false, true]){
      const jTop = far ? tj(FW - 7.6) : tj(7.6);
      const map = far ? (lx, ly) => [L + 14 - lx, jTop - ly] : (lx, ly) => [L - 15 + lx, jTop + ly];
      stamp(F9[lab[0]], 2, map, 1);
      stamp(F9[lab[1]], 2, (a, b) => map(20 + a, b), 1);
      if (yd !== 50){
        const toZero = yd < 50, localLeft = far ? !toZero : toZero;
        for (let cc = 0; cc < 5; cc++) for (let rr = 3 - cc; rr <= 3 + cc; rr++){
          if (rr < 0) continue;
          const [i, j] = map(localLeft ? -7 + cc : 36 - cc, rr + 1); P(i, j, 1);
        }
      }
    }
  }
  // End zone names, upright in the portrait view: as big as fits across the field.
  const word = (txt, xc, code) => {
    const s = paintable(txt).slice(0, 16); if (!s) return;
    const sc = clamp(Math.floor(460 / (s.length * 6)), 3, 6);
    let wpx = 0; for (const ch of s) wpx += (ch === ' ' ? 4 : 6) * sc; wpx -= sc;
    const i0 = ti(xc) + Math.round(7 * sc / 2), j0 = tj(MID) - Math.round(wpx / 2);
    let off = 0;
    for (const ch of s){ if (ch !== ' ') stamp(glyph(ch), sc, (lx, ly) => [i0 - ly, j0 + off + lx], code); off += (ch === ' ' ? 4 : 6) * sc; }
  };
  word(home.name, -5, 4); word(away.name, 105, 6);
  // Outline the letters.
  for (const [a, b, code] of [[ti(-10) + 2, ti(0) - 1, 4], [ti(100) + 2, ti(110) - 1, 6]])
    for (let i = a; i < b; i++) for (let j = tj(0); j < tj(FW); j++){
      if (paint[j * TW + i] === code) continue;
      let hit = false;
      for (let u = -2; u <= 2 && !hit; u++) for (let v = -2; v <= 2; v++) if (paint[(j + v) * TW + i + u] === code){ hit = true; break; }
      if (hit) paint[j * TW + i] = code + 1;
    }
  // Padded walls behind both end lines; the far one carries the home team's name.
  const wallFar = [ti(112.3), ti(113.3)], wallNear = [ti(-13.3), ti(-12.3)];
  const wallTxt = paintable(home.name) || 'HOME';
  for (let jj = 0; jj < TH; jj += (wallTxt.length + 3) * 6){
    let off = 0;
    for (const ch of wallTxt){ if (ch !== ' ') stamp(glyph(ch), 1, (lx, ly) => [wallFar[1] - 2 - ly, jj + off + lx], 7); off += ch === ' ' ? 4 : 6; }
  }
  const homeEZ = ezRamp(home.color), awayEZ = ezRamp(away.color);
  const homeL = hex(letterColor(home)), awayL = hex(letterColor(away));
  const wallC = hex(home.color), wallT = hex(letterColor(home));
  const wallCol = (i, w) => paint[i] === 7 ? wallT : w === 0 ? mix(wallC, [255, 255, 255], .18) : w === 2 ? wallC.map(v => v * .45) : wallC.map(v => v * .7);

  for (let j = 0; j < TH; j++){
    const y = FY0 + (j + .5) / S;
    for (let i = 0; i < TW; i++){
      const x = FX0 + (i + .5) / S, k = j * TW + i, bay = bayer(i, j), hs = hash2(i, j);
      let col;
      const inPlay = x >= 0 && x <= 100 && y >= 0 && y <= FW, inBounds = x >= -10 && x <= 110 && y >= 0 && y <= FW;
      const side = y < -6.5 || y > FW + 6.5;   // past the sideline walls: the stands
      if (i >= wallFar[0] && i < wallFar[1] && !side) col = wallCol(k, i === wallFar[0] ? 0 : i === wallFar[1] - 1 ? 2 : 1);
      else if (i >= wallNear[0] && i < wallNear[1] && !side) col = wallCol(-1, i === wallNear[1] - 1 ? 0 : i === wallNear[0] ? 2 : 1);
      else if (i >= wallFar[1] || i < wallNear[0]) col = [36, 34, 42];
      else if (side) col = y < -7.5 || y > FW + 7.5 ? [36, 34, 42] : mix(wallC, [0, 0, 0], .45);
      else {
        // Grass: mow stripes every five yards, a faint cross-cut, clumps, blade streaks, ordered dither.
        let v = 2.45;
        if (inPlay) v += Math.floor(x / 5) % 2 ? .62 : -.42; else v -= .35;
        if (inBounds) v += Math.floor(y / (FW / 6)) % 2 ? .12 : -.12;
        v += (fbm(x * .2, y * .2) - .5) * 1.15;
        v += (vnoise(x * 3.4, y * .55) - .5) * .75;
        v += (hs - .5) * .95;
        let lvl = clamp(Math.floor(v + bay - .5), 0, 5);
        if (hs > .993) lvl = 5; else if (hs < .005) lvl = 0;
        col = GRASS[lvl];
        // Worn turf between the hashes, heaviest around midfield.
        if (inPlay){
          const m = Math.exp(-(((y - MID) / 7.2) ** 2)) * (.3 + .7 * Math.exp(-(((x - 50) / 24) ** 2)));
          const w = fbm(x * .45 + 7, y * .45 + 3) * m + (vnoise(x * 2.2, y * 2.2) - .5) * .06;
          if (w + (bay - .5) * .08 > .34) col = WORN[clamp(lvl - 1, 0, 3)];
          if (w > .44 && hs > .93) col = DIRT;
        }
        // Paint.
        const pc = paint[k];
        const ez = x > -10 && x < 0 ? homeEZ : x > 100 && x < 110 ? awayEZ : null;
        if (ez && y >= 0 && y <= FW){
          const lc = x < 0 ? homeL : awayL, code = x < 0 ? 4 : 6;
          col = pc === code ? mix(lc, GRASS[lvl], .08) : pc === code + 1 ? mix(mix(lc, ez[0], .55), [10, 10, 16], .35) : ez[clamp(lvl - 1, 0, 3)];
        }
        let chalk = pc === 1;
        if (!chalk){
          if (y >= 0 && y <= FW && x > -.05 && x < 100.05){
            const r5 = Math.round(x / 5) * 5, dx = Math.abs(x - r5);
            if (dx < .1 || ((r5 === 0 || r5 === 100) && dx < .2)) chalk = true;
            const r1 = Math.round(x);
            if (r1 % 5 && Math.abs(x - r1) < .1 && ((y > .6 && y < 1.3) || (y > FW - 1.3 && y < FW - .6) || Math.abs(y - HASH[0]) < .34 || Math.abs(y - HASH[1]) < .34)) chalk = true;
            if ((Math.abs(x - 97) < .1 || Math.abs(x - 3) < .1) && Math.abs(y - MID) < .5) chalk = true;
          }
          if (((x >= 110 && x < 110.4) || (x > -10.4 && x <= -10)) && y > -.4 && y < FW + .4) chalk = true;
          if (((y > -.4 && y <= 0) || (y >= FW && y < FW + .4)) && x > -10.4 && x < 110.4) chalk = true;
          if ((Math.abs(y + 2.1) < .1 || Math.abs(y - FW - 2.1) < .1) && x > 25 && x < 75 && Math.floor(x * 2) % 2 === 0) chalk = true;
        }
        if (chalk) col = hs < .05 ? mix(CHALK[1], col, .45) : hs > .8 ? CHALK[2] : hs < .3 ? CHALK[1] : CHALK[0];
      }
      const dark = inShadow(x, y, i, j);
      col = dark ? SHD(col) : LIT(col);
      d[k * 4] = col[0]; d[k * 4 + 1] = col[1]; d[k * 4 + 2] = col[2]; d[k * 4 + 3] = 255;
      if (dark) md[k * 4 + 3] = 255;
    }
  }
  tx.putImageData(img, 0, 0); mx.putImageData(mimg, 0, 0);
  return { tex, mask };
}

/* =====================================================================================================
   THE STANDS behind the far end zone (the only ones the camera ever sees), baked per orientation so the fans stand
   upright on screen: a canvas covering x 113.3..141.3 and y FY0..FY1, rows rising away from the wall. Home fans in
   the home colors, a visitors' section in theirs; a few fans get a towel to wave or a bob, plus four flags.
   ===================================================================================================== */
export const CX0 = 113.3, CDEPTH = 28;
const CROWD_SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e', '#a0662f'];
function pickW(list, r){ let tot = 0; for (const [, w] of list) tot += w; r *= tot; for (const [c, w] of list) if ((r -= w) < 0) return c; return list[0][0]; }
/* One fan, 5 px wide: shoulders lit from the left, a head with hair or a cap. */
export function person(x, px, py, shirt, skin, hat, lit, haze, hazeT, cut = true){
  const T = c => { const l = c[0] * .3 + c[1] * .59 + c[2] * .11; c = mix(c, [l, l, l], .3).map(q => q * .8); return mix(lit ? LIT(c) : SHD(c), haze, hazeT); };
  const sh = hex(shirt), sk = hex(skin);
  const set = (c, a, b, w = 1, h = 1) => { x.fillStyle = css(T(c)); x.fillRect(a, b, w, h); };
  set(mix(sh, [10, 8, 20], .35), px - 2, py - 4, 5, 4);
  set(sh, px - 2, py - 4, 4, 3); set(mix(sh, [255, 236, 190], .28), px - 2, py - 4, 2, 1); set(mix(sh, [255, 236, 190], .15), px - 2, py - 3, 1, 2);
  if (cut){ x.clearRect(px - 2, py - 4, 1, 1); x.clearRect(px + 2, py - 4, 1, 1); }   // rounded shoulders (only where the stand shows through)
  set(mix(sk, [10, 8, 20], .3), px - 1, py - 7, 3, 3); set(sk, px - 1, py - 7, 2, 2); set(mix(sk, [255, 236, 190], .3), px - 1, py - 7, 1, 1);
  if (hat) set(hex(hat), px - 1, py - 8, 3, 2); else set([40, 28, 22], px - 1, py - 8, 3, 1);
}
export function buildCrowd(portrait, home, away){
  const along = (FY1 - FY0) * S, depth = CDEPTH * S;
  const W = portrait ? along : depth, H = portrait ? depth : along;
  const c = canvas(W, H), x = c.getContext('2d');
  // Local pixel <-> world: in portrait the wall is along the bottom edge, in landscape along the left.
  const toWorld = (px, py) => portrait ? { x: CX0 + (H - py) / S, y: FY0 + px / S } : { x: CX0 + px / S, y: FY0 + py / S };
  const at = (s, base) => portrait ? [s, H - base] : [base, s];
  const rnd = (() => { let s = 1234567; return () => (s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0, (s >>> 0) / 4294967296); })();
  const hc = home.color || '#777', ha = letterColor(home), ac = away.color || '#777';
  const SHIRTS = [[hc, 26], [ha, 22], ['#f2f0ea', 11], ['#8f969c', 6], ['#1d1d22', 6], ['#3c5a86', 5], [ac, 4], ['#5a2d1c', 3], ['#2f4f2f', 2]];
  const towels = [], flags = [], bob = [], chop = [];
  const rows = 38, spacing = 6, rowH = 7;
  x.fillStyle = '#3d3a44'; x.fillRect(0, 0, W, H);
  const aisle = s => { const m = ((s + 40) % 122 + 122) % 122; return m < 8; };
  for (let d = rows; d >= 0; d--){
    const base = 3 + d * rowH, hz = clamp(d / rows, 0, 1);
    // Risers: a lit step nose and a shadowed riser.
    for (let s = 0; s < along; s++){
      const [px, py] = at(s, base), w = toWorld(px, py), lit = !inShadow(w.x, w.y);
      const haze = lit ? [214, 170, 120] : [52, 62, 90], T = col => mix(lit ? LIT(col) : SHD(col), haze, hz * .32);
      x.fillStyle = css(T(aisle(s) ? [120, 116, 124] : [96, 92, 104])); x.fillRect(px, py, 1, 1);
      x.fillStyle = css(T([44, 40, 50])); if (portrait) x.fillRect(px, py + 1, 1, 2); else x.fillRect(px - 2, py, 2, 1);
      if (aisle(s)){ x.fillStyle = css(T([104, 100, 110])); if (portrait) x.fillRect(px, py - 4, 1, 3); else x.fillRect(px + 2, py, 3, 1); }
    }
    let s = -4 + (d * 3) % 6;
    while (s < along + 4){
      const ss = s + Math.floor(rnd() * 3) - 1;
      s += spacing;
      if (aisle(ss) || aisle(ss + 2) || aisle(ss - 2) || rnd() < .06) continue;
      const [px, py] = portrait ? at(ss, base) : [base, ss + 4], w = toWorld(px, py), lit = !inShadow(w.x, w.y);
      const haze = lit ? [214, 170, 120] : [52, 62, 90];
      const visitors = ss > along * .74 + (vnoise(d * .35, 3.7) - .5) * 60 && d > 11 + vnoise(ss * .05, 9) * 5;
      const shirt = visitors && rnd() < .7 ? (rnd() < .8 ? ac : '#9aa3a9') : pickW(SHIRTS, rnd());
      const skin = CROWD_SKIN[Math.floor(rnd() * CROWD_SKIN.length)];
      const hat = rnd() < .16 ? (rnd() < .5 ? ha : visitors ? ac : hc) : null;
      person(x, px, py, shirt, skin, hat, lit, haze, hz * .42);
      const r = rnd();
      if (r < .05 && !visitors) towels.push({ px, py, col: rnd() < .7 ? ha : '#f4f2ea', ph: rnd() * 6, lit });
      else if (r < .09) bob.push({ px, py, shirt, skin, hat, lit, haze, hz, ph: rnd() * 6, sp: 3 + rnd() * 3 });
      // Home fans who chop with the rest when the moment calls for it (drawhd.js decides when): an arm in their light.
      else if (!visitors && r < .6) chop.push({ px, py, arm: css(mix(lit ? LIT(hex(skin)) : SHD(hex(skin)), haze, hz * .42)) });
    }
  }
  // Flags along the back of the lower bowl.
  for (let k = 0; k < 4; k++){
    const s = Math.round(along * (.14 + k * .24)), [px, py] = at(s, 250), w = toWorld(px, py);
    flags.push({ px, py, lit: !inShadow(w.x, w.y), k });
  }
  return { c, towels, flags, bob, chop, colors: { field: ha, band: hc } };
}

/* The midfield logo, painted on: posterized, a little grass showing through, in the late light. */
export function paintLogo(im){
  const n = 84, c = canvas(n, n), x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, n, n);
  try {
    const id = x.getImageData(0, 0, n, n), d = id.data;
    for (let k = 0; k < n * n; k++){
      const i = k % n, j = (k / n) | 0;
      if (d[k * 4 + 3] < 120){ d[k * 4 + 3] = 0; continue; }
      const h = hash2(i + 999, j + 77);
      let col = [d[k * 4], d[k * 4 + 1], d[k * 4 + 2]].map(v => Math.round(v / 24) * 24);
      col = LIT(mix(col, [70, 120, 50], .1 + (h < .1 ? .12 : 0)));
      d[k * 4] = col[0]; d[k * 4 + 1] = col[1]; d[k * 4 + 2] = col[2]; d[k * 4 + 3] = h < .025 ? 0 : 255;
    }
    x.putImageData(id, 0, 0);
  } catch { /* a logo without CORS headers can't be read back: keep the plain downscale */ }
  return c;
}
