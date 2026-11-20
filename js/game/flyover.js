/* The pregame flyover: a TV opening shot over the whole stadium and the campus around it, in four beats (a high
   establishing shot, a four-ship jet flyover, the swoop down, the landing over midfield).

   The camera can't just zoom out (the game's pixel buffer holds ~58 yards), so the stadium and its surroundings are baked
   once into a low-resolution OVERVIEW (OS px a yard, in world coordinates: x along the field, end zones -10..0 and 100..110,
   y across 0..53.33) a slice at a time (buildOverviewSteps, pumped by drawhd like the field), and paintFly just scales and
   pans that picture, with a few cheap animated touches (clouds, jets, cars, rain and snow). The real field texture is laid
   over it as the camera comes down, and drawhd crossfades into the live renderer at the end. */
import * as A from './hdart.js';
import { doakOverview } from './doak.js';
import { campusOverview } from './campus.js';

const { S, hash2, hex } = A;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const ease = u => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
export const OS = 3, X0 = -150, X1 = 250, Y0 = -135, Y1 = 188;   // the overview: px a yard, and the world it covers
const W = (X1 - X0) * OS, H = (Y1 - Y0) * OS;
const CX = 50, CY = 26.667, HX = 63.3;   // the field's middle; the pit's half-length (field and wall)
const SKIN = [[240, 200, 170], [210, 160, 120], [150, 104, 76], [96, 66, 50], [52, 40, 36]];
const NEUT = [[58, 52, 54], [150, 128, 104], [88, 74, 66], [40, 44, 60], [190, 186, 176], [110, 124, 140]];
const CARS = [[190, 40, 40], [40, 70, 150], [226, 226, 226], [30, 32, 36], [150, 154, 160], [70, 110, 80], [200, 170, 60], [120, 50, 40], [236, 236, 240], [60, 62, 70]];

/* Famous homes with a bake of their own (by ESPN team id): each gets the overview's frame and helpers and returns the
   same parts; every other team gets the generic bowl and its campus (campus.js). */
const STADIUMS = { 52: doakOverview };   // Florida State: Doak Campbell Stadium (doak.js)
/* Bakes the overview a slice at a time (a generator: drawhd pumps ~5 ms a frame). Returns the overview's parts. */
export function* buildOverviewSteps(home, away, cond, art, logo){
  const own = STADIUMS[home?.id];
  return yield* (own || campusOverview)({ A, OS, X0, Y0, W, H, CX, CY, CARS, SKIN, NEUT, pixText, makeClouds, makeJets, makeB2, makeGlow }, home, away, cond, art, logo);
}
/* A string as crisp pixel lettering (the display face, thresholded), on a small canvas. */
function pixText(s, h, col = '#f4f4f0'){
  const m = A.canvas(8, 8).getContext('2d'), font = `800 ${h}px "Big Shoulders Display","Arial Narrow",Impact,sans-serif`; m.font = font;
  const w = Math.ceil(m.measureText(s).width) + 2, t = A.canvas(w, h + 3), x = t.getContext('2d');
  x.font = font; x.textBaseline = 'top'; x.fillStyle = col; x.fillText(s, 1, 1);
  const im = x.getImageData(0, 0, w, h + 3), d = im.data; for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0; x.putImageData(im, 0, 0);
  return t;
}
/* A few pixel clouds (and their silhouettes, for shadows on the ground), tinted for the weather and the hour. */
function* makeClouds(cond){
  const night = cond.time === 'night', pal = night ? [[96, 106, 142], [66, 76, 112], [42, 50, 84]] : cond.sky === 'rain' ? [[182, 188, 200], [146, 152, 168], [108, 116, 134]] : cond.sky === 'fog' ? [[240, 242, 246], [220, 224, 232], [194, 200, 212]] : cond.sky === 'snow' ? [[244, 246, 252], [222, 228, 242], [190, 200, 224]] : [[255, 255, 255], [234, 239, 248], [182, 196, 224]];
  const out = [];
  for (let n = 0; n < 9; n++){
    const w = 72 + (n % 4) * 26, h = 40 + (n % 3) * 12, cv = A.canvas(w, h), x = cv.getContext('2d'), sh = A.canvas(w, h), s2 = sh.getContext('2d'), im = x.createImageData(w, h), d = im.data;
    const blobs = Array.from({ length: 7 }, (_, i) => [w * (.18 + hash2(n, i) * .64), h * (.36 + hash2(n, i + 9) * .26), w * (.1 + hash2(n, i + 20) * .12)]);
    const V = (i, j) => { let v = 0; for (const [bx, by, br] of blobs) v += Math.max(0, 1 - Math.hypot((i - bx) / 1.25, (j - by) * 1.45) / br); return v; };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){   // a crisp body, an ordered dither at the rim; lit up-left, shaded under
      const v = V(i, j), bz = A.bayer(i, j);
      if (v < .5 || (v < .64 && (v - .5) / .14 < bz)) continue;
      const vs = V(i + 4, j + 5), vl = V(i - 3, j - 4), shd = clamp((.75 - vs) / .3, 0, 1), hi = clamp((.7 - vl) / .2, 0, 1);
      const c = pal[shd > bz ? 2 : hi > bz ? 0 : 1], q = (j * w + i) * 4;
      d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
    }
    x.putImageData(im, 0, 0); s2.drawImage(cv, 0, 0); s2.globalCompositeOperation = 'source-in'; s2.fillStyle = '#0c1030'; s2.fillRect(0, 0, w, h);
    out.push({ c: cv, s: sh, w, h });
    yield;
  }
  return out;
}
/* The fighter jet, from above and pointing right (+x), a swept delta wing, in the home team's colors at the tips; its
   shadow silhouette too. One pixel is a third of a yard, like the overview. */
function makeJets(hc, ac, night){
  const w = 46, h = 38, cv = A.canvas(w, h), x = cv.getContext('2d'), im = x.createImageData(w, h), d = im.data, M = new Uint8Array(w * h), K = night ? .38 : 1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    const u = i / (w - 1), v = (j - (h - 1) / 2) / ((h - 1) / 2), av = Math.abs(v);
    const body = av < (u > .8 ? .13 * (1 - u) / .2 : .12 + .03 * Math.sin(u * 3)) && u > .06, wing = av > .08 && av <= .98 && u <= .64 - .38 * av && u >= .1 + .1 * av + .02;
    const tail = av > .06 && av < .46 && u > .03 && u < .22 - .12 * av, nose = u > .85 && av < .05 * (1 - u) / .15;
    if (body || wing || tail || nose) M[j * w + i] = 1;
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    if (!M[j * w + i]) continue;
    const u = i / (w - 1), v = (j - (h - 1) / 2) / ((h - 1) / 2), av = Math.abs(v), edge = !M[j * w + i - 1] || !M[j * w + i + 1] || !M[(j - 1) * w + i] || !M[(j + 1) * w + i];
    let c = [150, 158, 172];
    if (av < .1 && u > .5 && u < .76) c = [60, 110, 170];   // the canopy
    else if (av > .8 && u < .6) c = hc;   // wingtips
    else if (av < .09 && u < .14) c = [70, 74, 84];
    else if (v < 0 && av > .1) c = [172, 180, 194];
    else if (hash2(i, j) > .94) c = [128, 134, 148];
    if (edge) c = [34, 38, 50];
    const q = (j * w + i) * 4; d[q] = c[0] * K; d[q + 1] = c[1] * K; d[q + 2] = c[2] * K; d[q + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  const sh = A.canvas(w, h), s2 = sh.getContext('2d'); s2.drawImage(cv, 0, 0); s2.globalCompositeOperation = 'source-in'; s2.fillStyle = '#0a0e24'; s2.fillRect(0, 0, w, h);
  return { c: cv, s: sh, w, h };
}
/* The B-2: a black flying wing, 52 yards across (nose right), saw-toothed trailing edge. */
function makeB2(night){
  const w = 66, h = 160, cv = A.canvas(w, h), x = cv.getContext('2d'), im = x.createImageData(w, h), d = im.data, M = new Uint8Array(w * h);
  const TE = [[0, 0], [.2, .19], [.42, .02], [1, .15]];   // the trailing edge's double W: (span out, chord position from the tail)
  const te = av => { for (let k = 1; k < TE.length; k++) if (av <= TE[k][0]){ const [a0, u0] = TE[k - 1], [a1, u1] = TE[k]; return u0 + (u1 - u0) * (av - a0) / (a1 - a0); } return 1; }, le = av => 1 - .8 * av;
  const at = (i, j) => [(i + .5) / w, Math.abs(j + .5 - h / 2) / (h / 2), j + .5 < h / 2];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){ const [u, av] = at(i, j); if (av < .985 && u >= te(av) && u <= le(av)) M[j * w + i] = 1; }
  const K = night ? .6 : 1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    if (!M[j * w + i]) continue;
    const [u, av, up] = at(i, j), t0 = te(av), l0 = le(av), fwd = i + 1 >= w || !M[j * w + i + 1], aft = !M[j * w + i - 1], lat = !M[(j - 1) * w + i] || !M[(j + 1) * w + i];
    let v = 46 + (up ? 5 : 0);
    if (av < .15 && u > .3) v += 16 * (1 - av / .15) * Math.min(1, (u - .3) / .3);   // the centerbody's crest
    const eh = (av - .135) / .065; if (Math.abs(eh) < 1 && u > .36 && u < .66) v += 10 * (1 - eh * eh);   // the engine humps
    if (av > .08 && av < .19 && u > .61 && u < .65) v = 26;   // their intakes
    if (av > .085 && av < .185 && u > t0 + .02 && u < .34) v = Math.abs(eh) > .7 ? 70 : 86;   // the exhaust troughs (pale, heat-proof)
    if (Math.abs(u - (l0 - .07)) < .009 && av > .18) v -= 7;   // a panel line inside the leading edge
    if (av > .2 && Math.abs(u - (t0 + .075)) < .009) v -= 9;   // the elevons' hinge line
    if (av > .2 && u < t0 + .075 && [.36, .62, .8].some(q => Math.abs(av - q) < .007)) v -= 9;   // and their splits
    if (av < .045 && u > .82 && u < .9){ v = 22; if (Math.abs(u - .86) < .01) v = 40; if (up && av > .03 && u > .87) v = 120; }   // the cockpit's windows
    if (hash2(i, j) > .95) v += 3;
    if (fwd) v = up ? 96 : 72; else if (aft || lat) v = 22;
    const q = (j * w + i) * 4; d[q] = v * K; d[q + 1] = (v + 2) * K; d[q + 2] = (v + 7) * K; d[q + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  const sh = A.canvas(w, h), s2 = sh.getContext('2d'); s2.drawImage(cv, 0, 0); s2.globalCompositeOperation = 'source-in'; s2.fillStyle = '#0a0e24'; s2.fillRect(0, 0, w, h);
  return { c: cv, s: sh, w, h };
}
function makeGlow(){
  const g = A.canvas(64, 64), x = g.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,190,100,.55)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return g;
}

/* ---------- the shot ---------- */
export const FLY_T = 9.7, FLY_FADE = 8.3;   // total seconds, and when the crossfade into the live view begins
const T_JET = 2.35, V_JET = 175, JX0 = -190, T_OVER = T_JET + (CX - JX0) / V_JET, T_BREAK = T_OVER;   // the jets enter, their speed, when they're over the stadium (and break)
const T_B0 = 1.5, V_B = 80, T_B_OVER = T_B0 + (CX + 220) / V_B;   // the bomber: enters, speed, over the stadium
const T_DIVE = 4.0, DIVE = 4.2;   // the swoop starts as the jets split
const JXB = t => -220 + V_B * (t - T_B0);
/* The four jets: formation offset (ahead, beside), the heading they peel off at, and how they curl. */
const JETS = [[0, 0, -.55, -.5], [-8.5, -8, -2.2, -.5], [-8.5, 8, .55, .5], [-17, 0, 2.2, .5]], V2 = 85;
/* A jet's place and heading at time tau: straight in formation, then peeling away in a curl from the break. */
function jetAt(n, tau){
  const [fx, fy, th, cu] = JETS[n];
  if (tau < T_BREAK) return [JX0 + V_JET * (tau - T_JET) + fx, CY + fy + Math.sin(tau * 1.4 + n) * .5, 0];
  const xb = JX0 + V_JET * (T_BREAK - T_JET) + fx, yb = CY + fy + Math.sin(T_BREAK * 1.4 + n) * .5, q = tau - T_BREAK;
  return [xb + V2 * (Math.sin(th + cu * q) - Math.sin(th)) / cu, yb + V2 * (Math.cos(th) - Math.cos(th + cu * q)) / cu, th + cu * q];
}
export const cheerAt = v => v === 'b2' ? T_B_OVER + .3 : T_BREAK;
/* The crowd's level: quiet, a roar as the jets split (or, for the bomber, a hush then a roar once it's past). */
export const flyLevel = (t, v) => v === 'b2' ? (t < T_B_OVER ? .02 : t < 8.5 ? .3 : .15) : t < 2.2 ? .07 : t < 7.5 ? .07 + .24 * smooth((t - 2.2) / .9) * (1 - smooth((t - 5.5) / 2) * .4) : .14;
/* Where the camera is (scale in device px a yard, center in yards) at time t. */
export function camAt(t, cw, ch, portrait){
  const long = portrait ? ch : cw, short = portrait ? cw : ch, sEnd = Math.min(cw, ch) / 58;
  const s0 = Math.max(long / (X1 - X0) * 1.01, short / (Y1 - Y0) * 1.01, Math.min(short * .64 / 121, long * .64 / 182));
  const s1 = s0 * 1.12;
  let s, cx, cy;
  if (t < T_DIVE){ const u = t / T_DIVE; s = s0 * (1 + .12 * smooth(u)); cx = 26 + 34 * smooth(u); cy = CY + 8 - 8 * smooth(u); }
  else { const e = ease((t - T_DIVE) / DIVE), bow = Math.sin(Math.PI * e); s = s1 * Math.pow(sEnd / s1, e); cx = 60 + (50 - 60) * e + 32 * bow; cy = CY + 2 * bow * 0 + (CY - CY) * e; }
  // keep the view inside the overview
  const vw = (portrait ? ch : cw) / s, vh = (portrait ? cw : ch) / s;
  const lx = vw / 2 <= (X1 - X0) / 2 ? clamp(cx, X0 + vw / 2, X1 - vw / 2) : (X0 + X1) / 2, ly = vh / 2 <= (Y1 - Y0) / 2 ? clamp(cy, Y0 + vh / 2, Y1 - vh / 2) : (Y0 + Y1) / 2;
  return { s, cx: lx, cy: ly, sEnd };
}
/* Paints one frame of the flyover onto ctx (device px): o = { ov, cw, ch, portrait, k, t, alpha, art, logo, wind, title }. */
export function paintFly(c, o){
  const { ov, cw, ch, portrait, k, t, alpha } = o, cam = camAt(t, cw, ch, portrait), s = cam.s;
  const bump = o.variant === 'b2' ? 0 : Math.exp(-(((t - T_OVER) / .45) ** 2)) + .6 * Math.exp(-(((t - T_BREAK - .5) / .5) ** 2)), amp = 3.2 * k * bump, sx = amp ? Math.round((Math.random() - .5) * amp * 2) : 0, sy = amp ? Math.round((Math.random() - .5) * amp * 2) : 0;
  let M = portrait ? [0, -s, s, 0, cw / 2 - cam.cy * s + sx, ch / 2 + cam.cx * s + sy] : [s, 0, 0, s, cw / 2 - cam.cx * s + sx, ch / 2 - cam.cy * s + sy];
  // Driving left in landscape: the world mirrored (its lettering was baked pre-mirrored); the titles are drawn after, as is.
  if (o.mirror) M = [-M[0], M[1], -M[2], M[3], cw - M[4], M[5]];
  const toS = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const fall = 1 - smooth((t - 4.2) / 1.8);   // the clouds fall away as the camera dives
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false; c.globalAlpha = alpha;
  c.fillStyle = ov.bg; c.fillRect(0, 0, cw, ch);
  c.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
  c.drawImage(ov.c, X0, Y0, W / OS, H / OS);
  // The real field texture, laid over as the camera comes down to it.
  const ramp = smooth((s - cam.sEnd * .55) / (cam.sEnd * .3));
  if (ramp > 0 && o.art){
    c.save(); c.globalAlpha = alpha * ramp; c.beginPath(); c.rect(-13.3, -6.5, HX * 2, 66.33); c.clip();
    c.drawImage(o.art.tex, A.FX0, A.FY0, A.FX1 - A.FX0, A.FY1 - A.FY0);
    c.restore();
  }
  const lr = o.logo ? smooth((s - cam.sEnd * .3) / (cam.sEnd * .3)) : 0;   // the midfield logo stays upright on screen, as in the live view
  if (lr > 0){ const [X, Y] = toS(50, CY), f = s / S, lw = o.logo.width * f, lh = o.logo.height * f; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = alpha * lr * .93; c.drawImage(o.logo, Math.round(X - lw / 2), Math.round(Y - lh / 2), lw, lh); c.globalAlpha = alpha; c.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); }
  // Ground life (screen space, a pixel or two each): fans walking in to the gates, the band marching up the west road, smoke off the grills.
  if (ramp < 1){
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = alpha * (1 - ramp);
    const WK = ov.walk, q = Math.max(1, Math.round(s * .4)), h2 = q >> 1;
    for (let n = 0; n < WK.length; n += 7){ const f = (WK[n + 4] + t * WK[n + 5]) % 1, [X, Y] = toS(WK[n] + (WK[n + 2] - WK[n]) * f, WK[n + 1] + (WK[n + 3] - WK[n + 1]) * f); c.fillStyle = ov.wc[WK[n + 6]]; c.fillRect(Math.round(X) - h2, Math.round(Y) - h2, q, q); }
    const [b0, by] = ov.bandAt || [-112, CY - 2.7], bx = b0 + 4.4 * t, step = Math.floor(t * 4) & 1;   // the band: a drum major, the flags, then the ranks in the home color
    for (let rk = 0; rk < 12; rk++) for (let fl = 0; fl < 7; fl++){
      if (rk === 0 && fl !== 3) continue;
      const [X, Y] = toS(bx - rk * .95 - (rk === 0 ? -1.2 : 0), by + fl * .9 + ((rk + fl + step) & 1) * .08); c.fillStyle = ov.band[rk === 0 ? 1 : rk === 1 ? 2 : 0]; c.fillRect(Math.round(X) - h2, Math.round(Y) - h2, q, q);
      if (rk > 1 && s > 7){ c.fillStyle = ov.band[1]; c.fillRect(Math.round(X) - h2, Math.round(Y) - h2, Math.max(1, q >> 1), Math.max(1, q >> 1)); }   // plumes
    }
    const SM = ov.smoke; c.fillStyle = ov.smc;
    for (let n = 0; n < SM.length; n += 2) for (let p = 0; p < 3; p++){
      const a = (hash2(n, 5) + t * .4 + p / 3) % 1, [X, Y] = toS(SM[n] + .5 + a * 2.4 + Math.sin(a * 6 + n) * .3, SM[n + 1] - a * 1.6), z = Math.max(1, Math.round(s * (.35 + a * .75)));
      c.globalAlpha = alpha * (1 - ramp) * .5 * (1 - a); c.fillRect(Math.round(X - z / 2), Math.round(Y - z / 2), z, z);
    }
    c.globalAlpha = alpha; c.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
  }
  // Cloud shadows slide over the ground (clear days).
  const kp = 1.32, cl = ov.clouds, sky = ov.rain || ov.fog || ov.snow;
  const cpos = (n, par) => { const z = par ? kp : 1, vx = 5 + n * 1.3, bx = X0 + ((hash2(n, 71) * 520 + t * vx + (par ? 90 : 0)) % 520) - 60, by = Y0 + hash2(n, 72) * 300 - 20; return [bx, by, (1.0 + (n % 3) * .25) * (sky ? 2.4 : 1)]; };
  if (!ov.night && !sky && fall > 0){ c.globalAlpha = alpha * .16 * fall; for (let n = 0; n < cl.length; n++){ const [bx, by, sc] = cpos(n, false); c.drawImage(cl[n].s, bx + 16, by + 12, cl[n].w / OS * sc * 1.3, cl[n].h / OS * sc * 1.3); } }
  c.globalAlpha = alpha;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const tr = (px, py) => toS(px, py), J = ov.jets, B = ov.b2, bomber = o.variant === 'b2';
  const cloudLayer = (par, a, n0, n1) => {
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = alpha * a * fall;
    for (let n = n0; n < n1; n++){
      const q = cl[n % cl.length], [bx, by, sc] = cpos(n, par), ww = q.w / OS * sc * (par ? kp * 1.15 : 1), hh = q.h / OS * sc * (par ? kp * 1.15 : 1);
      const [X, Y] = toS(cam.cx + (bx - cam.cx) * (par ? kp : 1), cam.cy + (by - cam.cy) * (par ? kp : 1)), W2 = ww * s, H2 = hh * s;
      c.drawImage(q.c, X - W2 / 2, Y - H2 / 2, W2, H2);
    }
    c.globalAlpha = alpha;
  };
  if (fall > 0) cloudLayer(false, sky ? .9 : 1, 0, sky ? 9 : 4);   // clouds below the aircraft
  const live = bomber ? t > T_B0 + .5 && t < T_B0 + 10 : t > T_JET - .3 && t < 7.4, spr = bomber ? B : J;
  if (live){
    const [dx, dy] = ov.noon ? [3, 3] : bomber ? [26, 11] : [15, 6], pa = ov.night ? 0 : ov.noon ? .5 : sky ? .2 : .4;
    const draw = (spr2, x, y, ph) => { c.save(); c.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); c.imageSmoothingEnabled = false; c.translate(x, y); c.rotate(ph); c.drawImage(spr2, -spr.w / OS / 2, -spr.h / OS / 2, spr.w / OS, spr.h / OS); c.restore(); };
    const pos = n => bomber ? [JXB(t), CY - 1, 0] : jetAt(n, t), N = bomber ? 1 : 4;
    if (!ov.night) for (let n = 0; n < N; n++){ const [x, y, ph] = pos(n); c.globalAlpha = alpha * pa; draw(spr.s, x + dx, y + dy, ph); c.globalAlpha = alpha; }
    // trails: puffs of the jets' past positions, fading and swelling (a burst's curl smokes on and lingers)
    if (!bomber) for (let n = 0; n < 4; n++){
      const k0 = ov.snow ? .6 : ov.night ? .32 : ov.rain || ov.fog ? .45 : .85;
      for (let q = 1; q < 190; q++){
        const age = q * .0135, tau = t - age; if (tau < T_JET) break;
        const [x, y] = jetAt(n, tau), life = tau < T_BREAK ? 1.1 : 2.6, a = Math.pow(Math.max(0, 1 - age / life), 1.3) * k0 * .8; if (a <= .004) continue;
        const [X, Y] = tr(x - 4, y), p = Math.max(2, Math.round((.8 + age * (tau < T_BREAK ? .4 : 1.0)) * s));
        c.fillStyle = ov.night ? `rgba(190,205,240,${a})` : `rgba(250,252,255,${a})`; c.fillRect(Math.round(X - p / 2), Math.round(Y - p / 2), p, p);
      }
    } else for (let sgn = -1; sgn <= 1; sgn += 2) for (let q = 1; q < 24; q++){   // faint wingtip vortices
      const x = JXB(t) - 3 - q * 2.2, [X, Y] = tr(x, CY - 1 + sgn * 26), a = (1 - q / 24) * .22, p = Math.max(1, Math.round(.4 * s));
      c.fillStyle = `rgba(240,244,255,${a})`; c.fillRect(Math.round(X - 3), Math.round(Y - p / 2), 6, p);
    }
    for (let n = 0; n < N; n++){
      const [x, y, ph] = pos(n); draw(spr.c, x, y, ph);
      if (!bomber){
        const [X, Y] = tr(x - Math.cos(ph) * (J.w / OS / 2 + .5), y - Math.sin(ph) * (J.w / OS / 2 + .5)), gs = (3.2 + Math.sin(t * 40 + n) * .5) * s;
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * (ov.night ? 1 : .8); c.drawImage(ov.glow, X - gs, Y - gs, gs * 2, gs * 2); c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha;
      }
      if (ov.night){   // red and green wingtip lights, a white strobe
        const hs = bomber ? [26, 2] : [5.1, 4.2], cs = Math.cos(ph), sn = Math.sin(ph);
        const L = tr(x - cs * hs[1] + sn * hs[0], y - sn * hs[1] - cs * hs[0]), R2 = tr(x - cs * hs[1] - sn * hs[0], y - sn * hs[1] + cs * hs[0]);
        const on = ((t * 2.3 + n * .3) % 1) < .55, st = ((t * 1.6 + n * .2) % 1) < .1, r = Math.max(2, Math.round(.5 * s)), [Ax, Ay] = L, [Bx, By] = R2;
        c.fillStyle = on ? '#ff3030' : '#802020'; c.fillRect(Math.round(Ax - r / 2), Math.round(Ay - r / 2), r, r); c.fillStyle = on ? '#30ff60' : '#208040'; c.fillRect(Math.round(Bx - r / 2), Math.round(By - r / 2), r, r);
        if (st){ const [X, Y] = tr(x, y); c.fillStyle = '#fff'; c.fillRect(Math.round(X - r), Math.round(Y - r), r * 2, r * 2); }
      }
    }
  }
  // clouds above the jets in bad weather: they punch through the deck
  if (sky && fall > 0) cloudLayer(true, ov.rain ? .62 : .5, 3, 9);
  else if (!ov.night && fall > 0) cloudLayer(true, .97, 4, 9);
  else if (fall > 0) cloudLayer(true, .55, 4, 9);
  c.setTransform(1, 0, 0, 1, 0, 0);
  // Life: cars on the ring road, a blinking beacon, flashbulbs in the stands, birds.
  const road = ov.lanes;
  for (let n = 0; n < 16; n++){
    const L = road[n & 1], tot = L.cum[L.cum.length - 1], dir = n & 1 ? -1 : 1, pos = (((n * .137 + t * 7.5 * dir / tot) % 1) + 1) % 1 * tot;
    let lo = 0, hi = L.cum.length - 1; while (hi - lo > 1){ const m = (lo + hi) >> 1; if (L.cum[m] <= pos) lo = m; else hi = m; }
    const p = L.pts[lo], p2 = L.pts[Math.min(L.pts.length - 1, lo + 1)], f = (pos - L.cum[lo]) / Math.max(.01, L.cum[hi] - L.cum[lo]), x = p[0] + (p2[0] - p[0]) * f, y = p[1] + (p2[1] - p[1]) * f;
    const [X, Y] = toS(x, y), vert = Math.abs(p2[0] - p[0]) < Math.abs(p2[1] - p[1]) !== portrait ? false : true, cw2 = Math.max(2, Math.round(4.4 * s)), ch2 = Math.max(2, Math.round(2.2 * s));
    const q = CARS[n % CARS.length], hz = (Math.abs(p2[0] - p[0]) > Math.abs(p2[1] - p[1])) !== portrait;
    c.fillStyle = `rgb(${q[0] * (ov.night ? .5 : 1)},${q[1] * (ov.night ? .5 : 1)},${q[2] * (ov.night ? .55 : 1)})`;
    if (hz) c.fillRect(Math.round(X - cw2 / 2), Math.round(Y - ch2 / 2), cw2, ch2); else c.fillRect(Math.round(X - ch2 / 2), Math.round(Y - cw2 / 2), ch2, cw2);
    if (ov.night){ c.fillStyle = 'rgba(255,244,200,.95)'; const hx = Math.sign(p2[0] - p[0]) * (portrait ? -1 : 1), hy = Math.sign(p2[1] - p[1]); const sw = hz ? 1 : 0; c.fillRect(Math.round(X + (hz ? hx * cw2 / 2 : 0) - 1), Math.round(Y + (hz ? 0 : (portrait ? -Math.sign(p2[0] - p[0]) : hy) * cw2 / 2) - 1), 3, 3); c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * .4; const g2 = 2.5 * s; c.drawImage(ov.glow, X - g2, Y - g2, g2 * 2, g2 * 2); c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha; }
  }
  if (ov.flame){   // a lit torch (the Unconquered's spear at Doak): a flicker of fire and its glow
    const [X, Y] = toS(ov.flame[0], ov.flame[1]), f = .75 + .25 * Math.sin(t * 23) * Math.sin(t * 9.3 + 1), q = Math.max(2, Math.round(s * .5)), g2 = s * (ov.night ? 3.4 : 1.6) * f + 3;
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * (ov.night ? .9 : .5); c.drawImage(ov.glow, X - g2, Y - g2, g2 * 2, g2 * 2); c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha;
    c.fillStyle = '#ff8a24'; c.fillRect(Math.round(X - q / 2), Math.round(Y - q), q, q); c.fillStyle = '#ffe070'; c.fillRect(Math.round(X - q / 4), Math.round(Y - q * f), Math.max(1, q >> 1), Math.max(1, q >> 1));
  }
  const sp = ov.sparks, flashN = ov.night ? 9 : 4;
  for (let n = 0; n < flashN; n++){ const i = ((Math.floor(t * 18) * 7 + n * 53) % (sp.length / 2)) * 2, [X, Y] = toS(sp[i], sp[i + 1]); if (Math.random() < .55) continue; const q = Math.max(2, Math.round(.45 * s)); c.fillStyle = 'rgba(255,255,244,.95)'; c.fillRect(Math.round(X), Math.round(Y), q, q); if (s > 6){ c.fillRect(Math.round(X - q), Math.round(Y), q * 3, 1); c.fillRect(Math.round(X), Math.round(Y - q), 1, q * 3); } }
  if (ov.night){ const [X, Y] = toS(ov.tower[0], ov.tower[1]); if ((t % 1.2) < .35){ c.globalCompositeOperation = 'lighter'; const g2 = 3 * s * .5 + 4; c.drawImage(ov.glow, X - g2, Y - g2, g2 * 2, g2 * 2); c.globalCompositeOperation = 'source-over'; c.fillStyle = '#ff4040'; c.fillRect(Math.round(X) - 1, Math.round(Y) - 1, 3, 3); } }
  else if (!sky && t < 3.4){   // a flock crossing early
    c.fillStyle = 'rgba(30,34,44,.85)';
    for (let n = 0; n < 7; n++){ const [X, Y] = toS(-120 + t * 22 + n * 5 + (n & 1) * 3, CY - 52 + n * 3 + Math.sin(t * 2 + n) * 1.2), flap = (Math.floor(t * 9 + n) & 1) ? 2 : 1, q = Math.max(2, Math.round(s * .4)); c.fillRect(Math.round(X), Math.round(Y), q, q); c.fillRect(Math.round(X - q), Math.round(Y - flap), q, q); c.fillRect(Math.round(X + q), Math.round(Y - flap), q, q); }
  }
  // Weather in the air, fog thick up here and clearing as the camera comes down.
  if (ov.fog){ c.fillStyle = `rgba(222,226,232,${.12 + .5 * fall})`; c.fillRect(0, 0, cw, ch); }
  if (ov.rain){
    c.fillStyle = `rgba(90,98,118,${.18 * fall})`; c.fillRect(0, 0, cw, ch);
    c.strokeStyle = 'rgba(200,214,236,.42)'; c.lineWidth = Math.max(1, k * .8); c.beginPath();
    for (const [a, b, v] of ov.fx){ const X = ((a * 1.3 - b * .1 + t * .02) % 1.3 - .15) * cw, Y = ((b + t * v * 1.5) % 1) * ch; c.moveTo(X, Y); c.lineTo(X - 5 * k, Y + 15 * k); }
    c.stroke();
  }
  if (ov.snow){
    c.fillStyle = 'rgba(244,248,255,.85)';
    for (const [a, b, v, d] of ov.fx){ const X = ((a + Math.sin(t * .8 + d * 9) * .02 + t * .01 * (o.wind || 0) * .1) % 1) * cw, Y = ((b + t * v * .16) % 1) * ch, q = Math.max(2, Math.round(k * (1 + d))); c.fillRect(Math.round(X), Math.round(Y), q, q); }
  }
  // Letterbox vignette, the broadcast's lower third and the skip hint.
  const vg = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * .35, cw / 2, ch / 2, Math.hypot(cw, ch) * .55); vg.addColorStop(0, 'rgba(8,6,20,0)'); vg.addColorStop(1, 'rgba(8,6,20,.5)');
  c.fillStyle = vg; c.fillRect(0, 0, cw, ch);
  const fs = Math.max(12, Math.round(Math.min(cw, ch) * .036));
  if (o.match) matchup(c, o.match, cw, ch, t, alpha);
  if (t > 1) { c.globalAlpha = alpha * .55 * smooth((t - 1) / .8) * (1 - smooth((t - 8) / .8)); c.fillStyle = '#fff'; c.font = `700 ${Math.round(fs * .62)}px "Big Shoulders Display","Arial Narrow",Impact,sans-serif`; c.textBaseline = 'bottom'; c.textAlign = 'right'; c.fillText('TAP TO SKIP', cw - Math.round(cw * .04), ch - Math.round(ch * .03)); c.textAlign = 'left'; }
  c.restore();
}
/* The broadcast's matchup graphic over the establishing shot: the visitors' block slides in from the left, the home team's
   from the right, the AT badge pops between them, the conditions underneath; it all wipes back out before the jets. */
const DISP = '"Big Shoulders Display","Arial Narrow",Impact,sans-serif', TIMEN = { noon: 'NOON', afternoon: 'AFTERNOON', night: 'NIGHT' };
function matchup(c, m, cw, ch, t, alpha){
  const inn = ease((t - .3) / .5), out = ease((t - 1.95) / .4); if (inn <= 0 || out >= 1) return;
  const u = Math.min(cw, ch), Wt = Math.min(cw * .94, u * 1.5), Hh = Math.round(Math.max(40, u * .118)), bd = Math.round(Hh * .62), half = (Wt - bd) / 2, sl = Hh * .32;
  const cx = cw / 2, y0 = Math.round(ch - Hh - Math.max(ch * .08, Hh * .7)), slide = (1 - inn) + out;
  const team = (tm, sgn) => {   // sgn -1: the visitors on the left; +1: home on the right
    const col = hex(tm.color || '#556'), alt = hex(tm.alt || '#fff'), dx = sgn * slide * (half + cw * .2), xi = cx + sgn * bd / 2 + dx, xo = cx + sgn * (bd / 2 + half) + dx;
    c.save(); c.beginPath(); c.moveTo(xi - sgn * sl * .5, y0); c.lineTo(xo, y0); c.lineTo(xo, y0 + Hh); c.lineTo(xi + sgn * sl * .5, y0 + Hh); c.closePath(); c.clip();
    c.fillStyle = A.css(col); c.fillRect(Math.min(xi, xo) - sl, y0, half + sl * 2, Hh);
    c.fillStyle = A.css(A.mix(col, [0, 0, 0], .35)); c.fillRect(Math.min(xi, xo) - sl, y0 + Hh * .82, half + sl * 2, Hh * .18);
    c.fillStyle = A.css(alt); for (const k of [0, 1]){ const x = xo - sgn * Hh * (1.05 + k * .26); c.beginPath(); c.moveTo(x, y0); c.lineTo(x + Hh * .12, y0); c.lineTo(x + Hh * .12 - sl, y0 + Hh); c.lineTo(x - sl, y0 + Hh); c.fill(); }   // the slashes
    const lg = Hh * .78, lx = xo - sgn * Hh * .5 - lg / 2, ly = y0 + (Hh - lg) / 2 - Hh * .04;
    c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.arc(lx + lg / 2, ly + lg / 2, lg * .5, 0, 6.2832); c.fill();
    if (tm.img?.complete && tm.img.naturalWidth){ const q = lg * .78; c.drawImage(tm.img, lx + (lg - q) / 2, ly + (lg - q) / 2, q, q); }
    const room = half - Hh * 1.62 - sl * .6; let fz = Math.round(Hh * .44), nm = (tm.name || tm.abbr || '').toUpperCase();
    c.font = `800 ${fz}px ${DISP}`; let wd = c.measureText(nm).width; if (wd > room){ fz = Math.max(Math.round(Hh * .3), Math.floor(fz * room / wd)); c.font = `800 ${fz}px ${DISP}`; wd = c.measureText(nm).width; }
    if (wd > room && tm.abbr){ nm = tm.abbr.toUpperCase(); fz = Math.round(Hh * .44); c.font = `800 ${fz}px ${DISP}`; }
    c.textBaseline = 'middle'; c.textAlign = sgn < 0 ? 'left' : 'right'; const ty = y0 + Hh * .42;
    const xt = xo - sgn * Hh * 1.58;
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillText(nm, xt + 2, ty + 2); c.fillStyle = '#fff'; c.fillText(nm, xt, ty);
    c.restore(); c.textAlign = 'left';
  };
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = alpha;
  team(m.away, -1); team(m.home, 1);
  const pop = ease((t - .62) / .3) * (1 - ease((t - 1.9) / .25)), r = bd * .5 * (pop > 0 ? .7 + .3 * pop : 0);
  if (r > 0){   // the AT badge
    c.fillStyle = '#101218'; c.beginPath(); c.moveTo(cx, y0 + Hh / 2 - r * 1.25); c.lineTo(cx + r, y0 + Hh / 2); c.lineTo(cx, y0 + Hh / 2 + r * 1.25); c.lineTo(cx - r, y0 + Hh / 2); c.closePath(); c.fill();
    c.strokeStyle = '#ffd23f'; c.lineWidth = Math.max(2, r * .1); c.stroke();
    c.fillStyle = '#ffd23f'; c.font = `800 ${Math.round(r * .8)}px ${DISP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('AT', cx, y0 + Hh / 2 + r * .04);
  }
  const cd = m.cond || {}, line = [TIMEN[cd.time] || '', cd.temp != null ? `${Math.round(cd.temp)}°` : '', (cd.sky || '').toUpperCase()].filter(Boolean).join('  ·  ');
  const ca = ease((t - .8) / .3) * (1 - out), fz = Math.round(Hh * .24);
  if (ca > 0 && line){
    c.font = `700 ${fz}px ${DISP}`; const lw = c.measureText(line).width + fz * 1.6, yy = y0 + Hh + Math.round(Hh * .1);
    c.globalAlpha = alpha * ca; c.fillStyle = 'rgba(10,12,18,.82)'; c.fillRect(Math.round(cx - lw / 2), yy, Math.round(lw), Math.round(fz * 1.5));
    c.fillStyle = '#e8ecf2'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(line, cx, yy + fz * .78);
  }
  c.restore();
}
