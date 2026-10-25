/* The pregame flyover: a TV opening shot over the whole stadium and the campus around it, in four beats (a high
   establishing shot, a four-ship jet flyover, the swoop down, the landing over midfield).

   The camera can't just zoom out (the game's pixel buffer holds ~58 yards), so the stadium and its surroundings are baked
   once into a low-resolution OVERVIEW (OS px a yard, in world coordinates: x along the field, end zones -10..0 and 100..110,
   y across 0..53.33) a slice at a time (buildOverviewSteps, pumped by drawhd like the field), and paintFly just scales and
   pans that picture, with a few cheap animated touches (clouds, jets, cars, rain and snow). The real field texture is laid
   over it as the camera comes down, and drawhd crossfades into the live renderer at the end. */
import * as A from './hdart.js';
import { doakOverview } from './doak.js';

const { S, hash2, hex } = A;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const ease = u => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
export const OS = 3, X0 = -150, X1 = 250, Y0 = -135, Y1 = 188;   // the overview: px a yard, and the world it covers
const W = (X1 - X0) * OS, H = (Y1 - Y0) * OS;
const CX = 50, CY = 26.667, HX = 63.3, HY = 33, RC = 4, BD = 28.2;   // the pit (field and wall) and the bowl's depth
const sd = (x, y) => { const qx = Math.abs(x - CX) - (HX - RC), qy = Math.abs(y - CY) - (HY - RC); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RC; };
const wx = x => Math.round((x - X0) * OS), wy = y => Math.round((y - Y0) * OS);
/* A point on the ring d yards out from the pit, at angle th (found along a ray from the center). */
const onRing = (th, d) => { const dx = Math.cos(th), dy = Math.sin(th); let lo = 0, hi = 400; for (let i = 0; i < 18; i++){ const m = (lo + hi) / 2; if (sd(CX + dx * m, CY + dy * m) < d) lo = m; else hi = m; } return [CX + dx * lo, CY + dy * lo]; };
const WHITE = [240, 238, 230];
const SKIN = [[240, 200, 170], [210, 160, 120], [150, 104, 76], [96, 66, 50], [52, 40, 36]];
const NEUT = [[58, 52, 54], [150, 128, 104], [88, 74, 66], [40, 44, 60], [190, 186, 176], [110, 124, 140]];
const CARS = [[190, 40, 40], [40, 70, 150], [226, 226, 226], [30, 32, 36], [150, 154, 160], [70, 110, 80], [200, 170, 60], [120, 50, 40], [236, 236, 240], [60, 62, 70]];

/* Famous homes with a bake of their own (by ESPN team id): each gets the overview's frame and helpers and returns the
   same parts; every other team gets the generic bowl below. */
const STADIUMS = { 52: doakOverview };   // Florida State: Doak Campbell Stadium (doak.js)
/* Bakes the overview a slice at a time (a generator: drawhd pumps ~5 ms a frame). Returns the overview's parts. */
export function* buildOverviewSteps(home, away, cond, art, logo){
  const own = STADIUMS[home?.id];
  if (own) return yield* own({ A, OS, X0, Y0, W, H, CX, CY, CARS, SKIN, NEUT, pixText, makeClouds, makeJets, makeB2, makeGlow }, home, away, cond, art, logo);
  const night = cond.time === 'night', noon = cond.time === 'noon', snow = cond.sky === 'snow', rain = cond.sky === 'rain', fog = cond.sky === 'fog';
  const cv = A.canvas(W, H), c = cv.getContext('2d');
  const TM = night ? [.27, 0, .32, 0, .52, 0] : noon ? [1.04, 4, 1.04, 4, 1.02, 4] : [1.04, 7, 1.01, 3, .9, 0];
  const tone = (r, g, b) => [r * TM[0] + TM[1], g * TM[2] + TM[3], b * TM[4] + TM[5]];
  const T = (q, k = 1) => A.css(tone(q[0] * k, q[1] * k, q[2] * k));
  const SD = noon ? [.6, .5] : [.93, .37], LSR = night ? 0 : noon ? 8 : 30, LSG = night ? 0 : noon ? 4 : 17;   // the sun's lean; how far the rim's shadow reaches
  const shv = ht => noon ? [.14 * ht * .9, .18 * ht * .9] : [.95 * ht * .85, .38 * ht * .85];
  const hc = hex(home.color), ac = hex(home.alt || '#f4f4f4'), oc = hex(away.color);
  let r = 0, g = 0, b = 0, em = false;
  const set = (q, k = 1) => { r = q[0] * k; g = q[1] * k; b = q[2] * k; };
  const GR = snow ? [[226, 232, 244], [216, 224, 240]] : [[76, 128, 58], [84, 138, 62]];
  const fan = (h, h2, zone) => {
    let q;
    if (zone === 1) q = h < .72 ? oc : h < .86 ? WHITE : NEUT[(h2 * 6) | 0];
    else if (zone === 2) q = h < .42 ? ac : h < .8 ? WHITE : hc;
    else q = h < .56 ? hc : h < .7 ? WHITE : h < .81 ? ac : NEUT[(h2 * 6) | 0];
    set(q, .86 + h2 * .28);
  };
  const shaded = (x, y, d) => {   // the west and north stands sit in the rim's shadow, the high rows out of it
    for (let t = 3; t <= LSR; t += 3.4) if (sd(x - SD[0] * t, y - SD[1] * t) > BD) return t < LSR * (1 - d / BD * .8);
    return false;
  };
  const bowl = (x, y, i, j, d, h) => {
    const ang = Math.atan2((y - CY) * 1.7, x - CX), a = (ang / 6.2832 + .5) * 72, af = a - Math.floor(a), h2 = hash2(j * 3 + 11, i * 5 + 7);
    const side = Math.abs(x - CX) < HX - RC, pb = side && y < CY && Math.abs(x - CX) < 24;   // a sideline; the press box over the north one's middle
    let lb = .8, zone = 0, k = 1;
    if (d < .8) set(hc, d < .3 ? 1.2 : .7);
    else if (d < 1.5) set([62, 62, 70]);
    else if (d < 10.8){   // the lower bowl: rows stepping up, stairs, a cross aisle and the tunnels up into it
      if (ang > 2.55 && x < CX) zone = 1; else if (x > CX + HX - 8 && Math.abs(y - CY) < 16) zone = 2; else if (y < CY && x > 14 && x < 46 && d < 6) zone = 3;
      const row = ((d - 1.5) * OS) | 0, rr = row % 3;
      if (d > 6.3 && d < 7.2){ set([150, 148, 142]); if (af > .45 && af < .55) set([40, 40, 48]); }
      else if (d > 4.3 && d < 6.3 && (a | 0) % 3 === 1 && af > .3 && af < .7) set(af < .35 || af > .65 ? [118, 116, 110] : d < 4.7 ? [66, 66, 72] : [22, 22, 28]);
      else if (af < .07) set(row & 1 ? [158, 156, 150] : [128, 126, 122]);
      else if (zone === 3){ if (((i >> 1) + (j >> 1)) & 1) set(h2 < .2 ? ac : WHITE); else set(hc, .9); }
      else if (rr === 2) set([40, 40, 50]);
      else if (rr === 0) { if (h < .8) set(SKIN[(h2 * 5) | 0]); else fan(h, h2, zone); }
      else fan(h, h2, zone);
      lb = .9 - d / 12 * .22;
      if (d > 8.4) k = 1 - (d - 8.4) / 2.4 * .45;   // under the upper deck's overhang
    } else if (d < 13.4 || (pb && d < 15.8)){   // the mezzanine: the press box, suites down the sidelines, the concourse round the ends
      if (pb){
        if (d < 11.8){ set([34, 46, 62]); if (i % 5 === 0) set([96, 100, 108]); else if (night){ set([255, 222, 156]); em = true; } else if (d < 11.2) set([110, 146, 172]); }
        else { set(d > 15.3 ? [112, 112, 118] : [182, 182, 186]); const u = i & 15, v = j & 7; if (d > 12.4 && d < 15 && hash2(i >> 4, j >> 3) > .5 && u > 3 && u < 11 && v > 1 && v < 6) set(u === 4 || v === 2 ? [206, 206, 210] : [132, 134, 142]); }
      } else if (side){
        const f = (a * 6) % 1;
        if (d < 11.7){ if (f < .1) set([92, 92, 100]); else if (night && h > .2){ set([255, 212, 130]); em = true; } else set(d < 11.1 ? [92, 122, 148] : [44, 54, 70]); }
        else if (d < 12.7) set(f < .1 ? [96, 96, 104] : [128, 128, 136]); else set([150, 148, 142]);
      } else { set([138, 136, 130]); if (d > 11.4 && d < 12.8 && (a | 0) % 2 === 0 && af > .35 && af < .65) set([28, 28, 34]); }
      lb = .6;
    } else if (d < 14.2){   // the upper deck's front: a band in the home color, banners hung over the rail
      const f = (ang * 40) % 1; set(d < 13.7 ? [40, 40, 48] : (f + 1) % 1 < .2 ? ac : hc, d < 13.7 ? 1 : .85);
    } else if (d < 24.6){   // the upper deck: steeper rows, stairs, a walkway halfway up
      const row = ((d - 14.2) * OS) | 0, rr = row % 3;
      if (af < .06) set(row & 1 ? [152, 150, 144] : [124, 122, 118]);
      else if (d > 19 && d < 19.7) set([150, 148, 142]);
      else if (rr === 2) set([46, 46, 56]);
      else if (rr === 0 && h < .55) set(SKIN[(h2 * 5) | 0], .92);
      else fan(h, h2, 0);
      lb = .62 + (d - 14.2) / 10.4 * .12;
    } else if (d < 27.2){
      const u = ang * 70, f = u - Math.floor(u);
      if (d < 24.9) set([30, 30, 36]); else if (f < .3) set(ac, 1.05); else set(hc, .95);
      if (night){ em = true; r *= 1.5; g *= 1.5; b *= 1.5; }
    } else { set(d < 27.9 ? [196, 192, 184] : [70, 70, 76]); if (af > .46 && af < .5 && d < 27.9) set([140, 136, 130]); lb = .9; }
    if (k < 1){ r *= k; g *= k; b *= k; }
    if (night && !em){ const f = 2.2 * lb; r *= f; g *= f; b *= f + .1; if (h > .997){ set([255, 255, 240]); em = true; } }
    if (LSR && !em && shaded(x, y, d)){ r *= .62; g *= .67; b *= .83; }
  };
  const ground = (x, y, i, j, d, h) => {
    const ang = Math.atan2((y - CY) * 1.7, x - CX), a = (ang / 6.2832 + .5) * 72, af = a - Math.floor(a);
    if (d < 46){   // the plaza: pavers and walkways
      const k = (((i >> 2) + (j >> 2)) & 1) ? 0 : 1;
      if (snow) set(k ? [214, 222, 236] : [224, 230, 242]); else set(k ? [162, 154, 141] : [172, 164, 150], .96 + h * .08);
      if (af < .05 || af > .95 && af < .96) set(snow ? [190, 198, 214] : [138, 132, 122]);
    } else if (d < 47 || (d > 53 && d < 54)) set(snow ? [188, 192, 200] : [150, 150, 152]);
    else if (d < 53){   // the ring road
      set(snow ? [92, 96, 106] : [58, 60, 66], .94 + h * .12);
      if (d > 49.7 && d < 50.4 && ((a * 6) % 1) < .55) set([228, 204, 96]);
    } else {   // campus lawn, mown in stripes
      const q = GR[((i + j) >> 3) & 1]; set(q, .95 + h * .1);
      if (h > .94) set(q, snow ? .9 : .8);
    }
    if (LSG && !em){ for (let k = 1; k <= 3; k++) if (sd(x - SD[0] * LSG * k / 3, y - SD[1] * LSG * k / 3) < BD){ r *= .62; g *= .67; b *= .83; break; } }
  };
  // Pass 1: the bowl, the plaza, the road and the lawn, pixel by pixel in bands.
  for (let j0 = 0; j0 < H; j0 += 6){
    const j1 = Math.min(H, j0 + 6), band = c.createImageData(W, j1 - j0), D = band.data;
    for (let j = j0; j < j1; j++){
      const y = Y0 + (j + .5) / OS;
      for (let i = 0; i < W; i++){
        const x = X0 + (i + .5) / OS, d = sd(x, y), h = hash2(i, j), q = ((j - j0) * W + i) * 4;
        em = false;
        if (d < 0){ r = 34; g = 36; b = 42; } else if (d < BD) bowl(x, y, i, j, d, h); else ground(x, y, i, j, d, h);
        if (em){ D[q] = r; D[q + 1] = g; D[q + 2] = b; }
        else { D[q] = r * TM[0] + TM[1]; D[q + 1] = g * TM[2] + TM[3]; D[q + 2] = b * TM[4] + TM[5]; }
        D[q + 3] = 255;
      }
    }
    c.putImageData(band, 0, j0);
    yield;
  }
  const rect = (x, y, w, h, col) => { c.fillStyle = col; const a = wx(x), b2 = wy(y); c.fillRect(a, b2, Math.max(1, wx(x + w) - a), Math.max(1, wy(y + h) - b2)); };
  const disc = (cx, cy, rad, col, cc = c) => { cc.fillStyle = col; const px = wx(cx), py = wy(cy), R = Math.max(1, Math.round(rad * OS)); for (let dy = -R; dy <= R; dy++){ const w = Math.floor(Math.sqrt(R * R - dy * dy + .25)); cc.fillRect(px - w, py + dy, 2 * w + 1, 1); } };
  // The field itself, from the real texture, and the logo at midfield.
  c.save(); c.beginPath(); c.rect(wx(-13.3), wy(-6.5), (HX * 2 - .1) * OS, (CY * 2 + 6.5 - -6.5 + .2 - 53.33 - 6.5 + 53.33 + 6.5) * OS * 0 + 66.33 * OS); c.clip();
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(art.tex, wx(A.FX0), wy(A.FY0), (A.FX1 - A.FX0) * OS, (A.FY1 - A.FY0) * OS);
  if (night){ c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(176,198,255)'; c.fillRect(0, 0, W, H); }
  c.restore(); c.imageSmoothingEnabled = false;
  {   // at this scale the worn middle reads as a smear: wash it back toward the clean stripes (sampled off the middle); in snow, the swept lines thin
    const sm = c.getImageData(wx(0), wy(5), 100 * OS, 1).data, at = x => { const q = Math.round(x * OS) * 4; return `rgb(${sm[q]},${sm[q + 1]},${sm[q + 2]})`; };
    const fw = 100 * OS, fh = Math.round(53.33 * OS), wv = A.canvas(fw, fh), w2 = wv.getContext('2d');
    for (let k = 0; k < 20; k++){ w2.fillStyle = at(k * 5 + 2.5); w2.fillRect(Math.round((k * 5 + .6) * OS), 0, Math.round(3.8 * OS), fh); }
    w2.globalCompositeOperation = 'destination-in'; w2.setTransform(1, 0, 0, .27, 0, fh / 2 * .73);
    const gr = w2.createRadialGradient(fw / 2, fh / 2, 0, fw / 2, fh / 2, fw * .44); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.7, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    w2.fillStyle = gr; w2.fillRect(0, -fh * 4, fw, fh * 9);
    c.globalAlpha = snow ? .7 : .86; c.drawImage(wv, wx(0), wy(0)); c.globalAlpha = 1;
    if (snow) for (let k = 0; k <= 20; k++){
      const X = wx(k * 5), sn = at(k ? k * 5 - 2.5 : 2.5); c.fillStyle = sn; c.fillRect(X - 2, wy(0), 5, fh);
      c.fillStyle = night ? 'rgb(120,140,138)' : 'rgb(176,204,178)'; c.fillRect(X, wy(0), 1, fh);
    }
  }
  yield;
  // The world outside, placed first so the shadows can be cast before anything is drawn: roads, lots (paved for cars and
  // RVs, or lawn given over to tailgating), the campus quad, then the buildings and trees.
  const solid = [], rects = (list, col) => { for (const [x, y, w, h] of list){ solid.push([x, y, x + w, y + h]); rect(x, y, w, h, col); } };
  const asph = snow ? T([196, 204, 216]) : T([64, 66, 72]), asph2 = snow ? T([92, 96, 106]) : T([56, 58, 64]);
  const roads = [[-150, CY - 3, 84, 6], [166, CY - 3, 84, 6], [47, -135, 6, 76], [47, 113, 6, 75]];
  const lots = [[-62, -100, 106, 36], [56, -100, 106, 36], [-62, 116, 106, 36], [56, 116, 106, 36], [-145, -55, 73, 76], [-145, 33, 73, 75], [172, -55, 73, 76], [172, 33, 73, 75]];
  const KIND = ['cars', 'cars', 'cars', 'rv', 'cars', 'grove', 'quad', 'field'], paved = n => KIND[n] === 'cars' || KIND[n] === 'rv';
  rects(roads, asph2); rects(lots.filter((_, n) => paved(n)), asph);
  lots.forEach((l, n) => { if (!paved(n)) solid.push([l[0], l[1], l[0] + l[2], l[1] + l[3]]); });
  for (const [x, y, w, h] of roads){ const hz = w > h; for (let k = 0; k < (hz ? w : h) / 6; k++) rect(hz ? x + k * 6 + 1 : x + w / 2 - .2, hz ? y + h / 2 - .2 : y + k * 6 + 1, hz ? 3 : .4, hz ? .4 : 3, T([230, 206, 100])); }
  yield;
  // Where everything goes: cars, tailgates (tents, grills, coolers and chairs, flags, people), RVs, the Grove's oaks.
  const cars = [], tents = [], lamps = [], rvs = [], folk = [], grills = [], flags = [], gear = [], oaks = [];
  let seed = 1;
  const gather = (x, y, w, h, n, vis) => { seed++; for (let k = 0; k < n; k++) folk.push([x + hash2(seed, k * 2) * w, y + hash2(seed, k * 2 + 1) * h, vis]); };
  const tailgate = (x, y, s, vis) => {
    tents.push([x, y, s, vis]); if (s < .3) tents.push([x + 3.5, y, s + .4, vis]);
    grills.push([x + (s < .3 ? 7.4 : 4), y + 1.4]); gear.push([x + .6, y + 3.8, s], [x + 2.2, y + 4.4, s + .3]);
    if (s < .14) gear.push([x + 1, y + 5.6, -1], [x + 4.6, y + 5.6, -1]);   // cornhole boards
    if (hash2(seed, 7) < .45) flags.push([x - .2, y - .3, vis]);
    gather(x - .4, y + 3.4, 8, 3.6, 5 + (s * 14 | 0), vis);
  };
  for (let n = 0; n < lots.length; n++){
    if (KIND[n] !== 'cars') continue;
    const [x, y, w, h] = lots[n], tg = n === 2 || n === 4 ? .5 : .18;
    for (let by = 0; by + 19.2 <= h + .5; by += 19.2) for (const ro of [0, 13.6]){
      const sy = y + by + ro + .4;
      for (let sx = x + 1; sx + 3 <= x + w - .5; sx += 3){
        const s = hash2(Math.round(sx * 7) + n * 131, Math.round(sy * 5)), far = Math.max(0, sd(sx, sy) - 58);
        c.fillStyle = snow ? T([210, 216, 228]) : T([190, 190, 190]); c.fillRect(wx(sx), wy(sy), 1, Math.round(5.2 * OS));
        if (s < .98 - far * .006 - hash2(Math.floor(sx / 13) + n * 31, Math.floor(sy)) * .32) cars.push([sx + .3, sy + .3, s * 16 | 0, s]);   // fuller near the stadium, gaps farther out
      }
      if (ro === 0) for (let sx = x + 2; sx + 10 <= x + w; sx += 10.5){   // tailgates in the aisle behind the cars
        const s = hash2(Math.round(sx) + n * 57, Math.round(sy) + 9); if (s < tg) tailgate(sx + hash2(n, sx | 0) * 1.5, sy + 5.9, s / tg * .5, n === 4 && sx > x + w * .6 && by < 20);
      }
    }
    for (let ly = y + 9.6; ly < y + h; ly += 19.2) for (let lx = x + 14; lx < x + w - 4; lx += 32) lamps.push([lx, ly]);
    yield;
  }
  {   // the RV lot: two rows nose to tail, awnings out
    const [x, y, w] = lots[3];
    for (const ry of [y + 1.4, y + 20.2]) for (let rx = x + 1.5; rx + 8 < x + w; rx += 7.6){
      const s = hash2(Math.round(rx * 3), Math.round(ry)); if (s < .1) continue;
      rvs.push([rx, ry, s]); gather(rx + 3, ry + 2, 3.4, 9, 3 + (s * 6 | 0), s > .86);
      if (s < .55) grills.push([rx + 4.6, ry + 10.6]); else gear.push([rx + 4, ry + 10.4, s]);
      if (s > .6) flags.push([rx + 2.6, ry - .4, s > .86]);
    }
    for (let lx = x + 14; lx < x + w - 4; lx += 32) lamps.push([lx, y + 17]);
  }
  {   // the Grove: old oaks, and tents packed in under them along brick walks
    const [x, y, w, h] = lots[5], mx = x + w / 2, my = y + h / 2;
    for (let gy = y + 5; gy < y + h - 3; gy += 10.5) for (let gx = x + 5; gx < x + w - 3; gx += 10.5){ const s = hash2(gx | 0, gy | 0); if (s < .8) oaks.push([gx + (hash2(gx | 0, 3) - .5) * 6, gy + (hash2(gy | 0, gx | 0) - .5) * 6, 3.8 + hash2(gx | 0, (gy | 0) + 1) * 2.4, .3 + s * .7]); }
    for (let ty = y + 1.2; ty < y + h - 4; ty += 4.3) for (let tx = x + 1.2; tx < x + w - 4; tx += 4.1){
      if (Math.abs(ty + 1.6 - my) < 2.6 || Math.abs(tx + 1.6 - mx) < 2.6 || oaks.some(o => Math.hypot(tx + 1.6 - o[0], ty + 1.6 - o[1]) < o[2] * .78)) continue;
      const s = hash2(Math.round(tx * 3) + 7, Math.round(ty * 3)); if (s > .82){ gather(tx, ty, 3.6, 3.6, 5, false); continue; }
      tents.push([tx + (hash2(tx | 0, 5) - .5) * .9, ty + (hash2(ty | 0, tx | 0) - .5) * .7, s, false]); if (s < .22) grills.push([tx + 3.5, ty + 3.4]); if (s > .74) flags.push([tx + 3.4, ty - .2, false]);
    }
    gather(x, my - 1.6, w, 3.2, 60, false); gather(mx - 1.6, y, 3.2, h, 60, false);
  }
  {   // the tailgate field: tents in rows, the visitors' block in one corner
    const [x, y, w, h] = lots[7];
    for (let r0 = 0, ty = y + 2; ty + 3.4 < y + h - 1; ty += 7.6, r0++) for (let k = 0, tx = x + 2; tx + 3.4 < x + w - 1; tx += 3.7, k++){
      const s = hash2(k + 300, r0 + 40), vis = k > 12 && r0 < 3;
      if (k === 9 || s > .84) continue;
      tents.push([tx + (hash2(k, r0) - .5) * .6, ty + (hash2(r0, k) - .5) * .5, s, vis]);
      if (s < .3) grills.push([tx + 1.6, ty + 4.4]); else if (s < .5) gear.push([tx + .8, ty + 4.2, s]);
      if (k % 4 === 0) flags.push([tx - .2, ty - .4, vis]);
      gather(tx - .3, ty + 3.6, 4, 3.6, 2 + (s * 5 | 0), vis);
    }
  }
  // The quad: brick halls round a lawn, crossed by walks, old trees, the bell tower at its foot.
  const QD = [188, -41, 39, 43];
  for (let n = 0; n < 4; n++){ const [x, y, w, h] = QD, cx = x + w * (n & 1 ? .76 : .24), cy = y + h * (n & 2 ? .76 : .24); oaks.push([cx + (n & 1 ? 2 : -2), cy, 4.2 + hash2(n, 61) * 1.2, .4 + n * .17]); }
  for (let n = 0; n < 5; n++) oaks.push([180 + n * 15.5, -38.5 + (n & 1) * .8, 2.4, .5 + n * .1]);
  // The plaza: the gates, each with lines at the turnstiles, a crowd and concession stands; the main gate's statue (west).
  const GATES = [[CX - HX - BD, CY, -1, 0, 1], [CX + HX + BD, CY, 1, 0, 0], [22, CY - HY - BD, 0, -1, 0], [78, CY - HY - BD, 0, -1, 0], [22, CY + HY + BD, 0, 1, 0], [78, CY + HY + BD, 0, 1, 0]];
  const stands = [], STAT = [CX - HX - BD - 10.5, CY];
  for (const [gx, gy, nx, ny, main] of GATES){
    const tx = -ny, ty = nx;
    for (let q = -3; q <= 3; q++){ const L = main ? 5 : 5 + hash2(gx | 0, q + 9) * 8; for (let s = .9; s < L; s += .66) folk.push([gx + nx * s + tx * q * 1.2, gy + ny * s + ty * q * 1.2, false]); }
    for (let k = 0; k < (main ? 120 : 60); k++){ const rr = 6 + Math.pow(hash2(k, gx | 0), 1.4) * 10, lat = (hash2(k + 50, gy | 0) - .5) * (10 + rr * 1.5); folk.push([gx + nx * rr + tx * lat, gy + ny * rr + ty * lat, false]); }
    for (const sg of [-1, 1]) stands.push([gx + nx * 4 + tx * sg * 8.5, gy + ny * 4 + ty * sg * 8.5, nx !== 0]);
  }
  for (let k = 0; k < 900; k++){   // fans all over the plaza, thickest near the gates
    const th = hash2(k, 401) * 6.2832, p = onRing(th, 29 + hash2(k, 402) * 16), dg = Math.min(...GATES.map(gt => Math.hypot(p[0] - gt[0], p[1] - gt[1])));
    if (hash2(k, 403) < .3 + .7 * Math.exp(-dg / 16)) folk.push([p[0], p[1], false]);
  }
  // People walking in from the lots, converging on the gates (animated in paintFly): x0, y0, x1, y1, phase, speed, color.
  const walk = [];
  for (let n = 0; n < 240; n++){
    const [gx, gy, nx, ny] = GATES[n % 6], tx = -ny, ty = nx, lat = (hash2(n, 1) - .5) * 56, dist = 30 + hash2(n, 2) * 26, l1 = lat * .1;
    walk.push(gx + nx * dist + tx * lat, gy + ny * dist + ty * lat, gx + nx * 7 + tx * l1, gy + ny * 7 + ty * l1, hash2(n, 3), .03 + hash2(n, 4) * .03, hash2(n, 6) < .5 ? 0 : hash2(n, 6) < .75 ? 1 : 2);
  }
  yield;
  // Drawing the ground level: walks on the lawns, cars, RVs, tents, the little things, the people.
  const path = (x0, y0, x1, y1, wd, col) => { c.fillStyle = col; const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * OS), z = Math.max(1, Math.round(wd * OS)); for (let k = 0; k <= n; k++){ const u = k / n; c.fillRect(wx(x0 + (x1 - x0) * u) - (z >> 1), wy(y0 + (y1 - y0) * u) - (z >> 1), z, z); } };
  const walkC = snow ? T([200, 204, 214]) : T([214, 206, 186]), brick = snow ? T([196, 190, 196]) : T([166, 104, 84]);
  { const [x, y, w, h] = lots[5]; path(x, y + h / 2, x + w, y + h / 2, 1.6, brick); path(x + w / 2, y, x + w / 2, y + h, 1.6, brick); }
  { const [x, y, w, h] = lots[7]; path(x + 2 + 9 * 3.7 + 1.8, y, x + 2 + 9 * 3.7 + 1.8, y + h, 2, walkC); }
  {   // the quad's walks: a loop, the diagonals, a fountain where they cross
    const [x, y, w, h] = QD, mx = x + w / 2, my = y + h / 2;
    path(x, y, x + w, y, 1.3, walkC); path(x, y + h, x + w, y + h, 1.3, walkC); path(x, y, x, y + h, 1.3, walkC); path(x + w, y, x + w, y + h, 1.3, walkC);
    path(x, y, x + w, y + h, 1.3, walkC); path(x + w, y, x, y + h, 1.3, walkC); path(mx, y + h, mx, y + h + 5, 2, walkC);
    disc(mx, my, 3.4, T([178, 172, 160])); disc(mx, my, 2.6, snow ? T([210, 224, 240]) : T([70, 128, 176])); disc(mx, my, .9, T([200, 196, 186]));
  }
  {   // the main gate's plaza: a paved circle, flower beds in the home colors, the statue on its plinth
    const [x, y] = STAT; disc(x, y, 6, T(snow ? [222, 226, 236] : [188, 180, 164])); disc(x, y, 5, T(snow ? [236, 240, 248] : ac)); disc(x, y, 4.3, T(snow ? [214, 220, 232] : hc, .9)); disc(x, y, 3.4, T(snow ? [222, 226, 236] : [188, 180, 164]));
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; const [dx, dy] = shv(4); for (let k = 0; k <= 4; k++) c.fillRect(wx(x + dx * k / 4) - 3, wy(y + dy * k / 4) - 3, 6, 6); }
    rect(x - 1.4, y - 1.4, 2.8, 2.8, T([150, 146, 140])); rect(x - 1, y - 1, 2, 2, T([186, 182, 174])); disc(x, y, .7, T([128, 92, 52])); c.fillStyle = T([176, 136, 80]); c.fillRect(wx(x) - 1, wy(y) - 1, 1, 1);
  }
  const mixw = (q, k) => [q[0] + (232 - q[0]) * (1 - k), q[1] + (238 - q[1]) * (1 - k), q[2] + (246 - q[2]) * (1 - k)];
  const carPx = (x, y, q, pl) => {
    const X = wx(x), Y = wy(y), cc = snow ? mixw(q, .15) : q;
    c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 1, Y + 1, 7, 14);
    c.fillStyle = T(cc); c.fillRect(X, Y, 7, 14);
    c.fillStyle = T(cc, 1.18); c.fillRect(X + 1, Y + 4, 5, 6);
    c.fillStyle = snow ? T([230, 236, 246]) : T(cc, 1.25); if (snow) c.fillRect(X + 1, Y + 3, 5, 8);
    c.fillStyle = T([30, 40, 56]); c.fillRect(X + 1, Y + (pl ? 11 : 1), 5, 2); c.fillRect(X + 1, Y + (pl ? 1 : 11), 5, 1);
  };
  let nc = 0;
  for (const [x, y, k, s] of cars){ carPx(x, y, CARS[k % CARS.length], s > .3); if ((++nc & 63) === 0) yield; }
  const LK = night ? 2.5 : 1, oa = hex(away.alt || '#f4f4f4');   // tents and RVs are lit from inside at night
  for (const [x, y, s] of rvs){   // an RV from above: roof, AC units, windshield; the awning out to its right, striped
    const X = wx(x), Y = wy(y), vis = s > .86, body = vis ? oc : s > .55 ? [236, 232, 222] : [212, 206, 194];
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 2, Y + 2, 9, 32); c.fillRect(X + 16, Y + 5, 2, 20); }
    for (let k = 0; k < 11; k++){ c.fillStyle = T(k & 1 ? WHITE : vis ? oa : hc, LK); c.fillRect(X + 9, Y + 4 + k * 2, 7, 2); }
    c.fillStyle = T(body, .82); c.fillRect(X, Y, 8, 32); c.fillStyle = T(body, 1.05); c.fillRect(X, Y, 7, 31);
    c.fillStyle = T(body, 1.2); c.fillRect(X + 1, Y + 1, 5, 1);
    c.fillStyle = T([150, 152, 158]); c.fillRect(X + 2, Y + 9, 3, 3); c.fillRect(X + 2, Y + 21, 3, 3);
    c.fillStyle = night ? 'rgb(255,214,140)' : T([40, 54, 72]); c.fillRect(X + 1, Y + 1, 5, 2); if (night){ c.fillRect(X + 7, Y + 8, 1, 2); c.fillRect(X + 7, Y + 16, 1, 2); }
    if (!vis){ c.fillStyle = T(hc); c.fillRect(X, Y + 28, 7, 1); }
  }
  yield;
  const TENT = [hc, hc, WHITE, ac, hc, [210, 210, 214]];
  const tentPx = (x, y, s, vis) => {   // a pop-up canopy from above: four faces round a peak, the sunlit ones lighter
    const X = wx(x), Y = wy(y), q = vis ? (s < .6 ? oc : oa) : TENT[(s * 60 | 0) % TENT.length], two = (s * 37) % 1 < .14, q2 = vis ? WHITE : q === WHITE ? hc : WHITE, q3 = two ? q2 : q;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(X + 2, Y + 1, 10, 10); }
    c.fillStyle = T(q3, .76 * LK); c.fillRect(X, Y, 10, 10);
    c.fillStyle = T(q, .86 * LK); for (let k = 0; k < 5; k++) c.fillRect(X + k + 1, Y + 9 - k, 8 - 2 * k, 1);
    c.fillStyle = T(q3, 1.02 * LK); for (let k = 0; k < 5; k++) c.fillRect(X + k, Y + k + 1, 1, 8 - 2 * k);
    c.fillStyle = T(q, 1.16 * LK); for (let k = 0; k < 5; k++) c.fillRect(X + k, Y + k, 10 - 2 * k, 1);
    c.fillStyle = T(q, 1.32 * LK); c.fillRect(X + 4, Y + 4, 2, 2);
  };
  let ntn = 0; for (const [x, y, s, vis] of tents){ tentPx(x, y, s, vis); if ((++ntn & 47) === 0) yield; }
  const GEAR = [[220, 40, 40], [40, 90, 200], WHITE, hc, ac, [60, 150, 80]];
  for (const [x, y, s] of gear){
    if (s < 0){ c.fillStyle = T(WHITE); c.fillRect(wx(x), wy(y), 2, 3); c.fillStyle = T(hc); c.fillRect(wx(x), wy(y) + 1, 2, 1); continue; }   // a cornhole board
    c.fillStyle = T(GEAR[(s * 97 | 0) % GEAR.length]); c.fillRect(wx(x), wy(y), 2, 1); c.fillStyle = T(WHITE); c.fillRect(wx(x), wy(y) + 1, 2, 1);   // a cooler
    c.fillStyle = T(GEAR[(s * 53 | 0) % GEAR.length], .8); c.fillRect(wx(x) + 3, wy(y), 1, 1); c.fillRect(wx(x) + 5, wy(y) + 1, 1, 1);   // folding chairs
  }
  for (const [x, y] of grills){ c.fillStyle = T([34, 34, 38]); c.fillRect(wx(x), wy(y), 2, 2); c.fillStyle = night ? '#ff9a40' : T([90, 88, 86]); c.fillRect(wx(x), wy(y), 1, 1); }
  const SH = [hc, hc, hc, WHITE, ac, hc, WHITE, ...NEUT], VSH = [oc, oc, oc, oa, WHITE, NEUT[0]], fcs = SH.map(q => T(q)), vcs = VSH.map(q => T(q)), sk = SKIN.map(q => T(q));
  for (let n = 0; n < folk.length; n++){
    const [x, y, vis] = folk[n], h = hash2(n, 77), X = wx(x), Y = wy(y);
    c.fillStyle = vis ? vcs[(h * vcs.length) | 0] : fcs[(h * fcs.length) | 0]; c.fillRect(X, Y, 1, 1);
    if (h > .7){ c.fillStyle = sk[(h * 50 | 0) % 5]; c.fillRect(X, Y - 1, 1, 1); }
    if ((n & 1023) === 1023) yield;
  }
  yield;
  // The buildings: roofs seen from above (a gable's two halves, parapets, rooftop units) and the bell tower.
  const ROOF = [[152, 84, 66], [96, 104, 118], [176, 160, 134], [92, 140, 120], [146, 146, 150], [124, 66, 54]];
  const blds = [[-140, -128, 46, 26, 14, 4], [-88, -126, 20, 40, 12, 0], [-62, -131, 16, 29, 10, 1], [-34, -132, 40, 24, 12, 2], [14, -130, 18, 26, 16, 3], [60, -131, 44, 22, 11, 0], [110, -130, 30, 26, 12, 4],
    [180, -128, 36, 26, 13, 2], [176, -96, 30, 24, 11, 0], [-140, 121, 40, 30, 13, 4], [-92, 124, 22, 40, 12, 0], [-30, 160, 36, 22, 11, 1], [20, 158, 24, 28, 13, 2], [80, 162, 40, 20, 10, 0], [180, 118, 30, 24, 12, 3], [124, 160, 30, 24, 11, 4]];
  blds.push([175, -55, 66, 11, 14, 5], [173, -40, 13, 40, 12, 0], [229, -40, 14, 40, 12, 5], [175, 5, 25, 13, 10, 0], [216, 5, 26, 13, 10, 5]);   // the quad's brick halls
  for (const [x, y, w, h] of blds) solid.push([x, y, x + w, y + h]);
  const TWR = [204.5, 6.5, 7]; solid.push([TWR[0] - 2, TWR[1] - 2, TWR[0] + 9, TWR[1] + 9]);
  const pond = [186, 134, 56, 40]; solid.push([pond[0] - 2, pond[1] - 2, pond[0] + pond[2] + 2, pond[1] + pond[3] + 2]);
  const trees = [];
  for (let n = 0; n < 4200; n++){
    const x = X0 + 4 + hash2(n, 91) * (X1 - X0 - 8), y = Y0 + 4 + hash2(n, 17) * (Y1 - Y0 - 8);
    if (sd(x, y) < 56 || inSolid(solid, x, y, 2.5)) continue;
    const dens = .12 + hash2(Math.floor(x / 20), Math.floor(y / 20) + 500) * .9;
    if (hash2(n, 33) > dens * .42) continue;
    trees.push([x, y, 1.9 + hash2(n, 5) * 2, hash2(n, 8)]);
  }
  trees.push(...oaks);
  const plazaTrees = [], lampsP = [];
  for (let k = 0; k < 150; k++){   // the plaza's trees: in loose clumps, kept clear of the gates
    const th = (k + hash2(k, 2) * .8) / 150 * 6.2832, cl = .5 + .5 * Math.sin(th * 5 + 1.3) * Math.cos(th * 2.1 + .4);
    if (hash2(k, 3) > cl * .8 + .12) continue;
    const p = onRing(th, 38 + hash2(k, 7) * 6.5); if (GATES.some(gt => Math.hypot(p[0] - gt[0], p[1] - gt[1]) < 16)) continue;
    plazaTrees.push([p[0], p[1], 1.3 + hash2(k, 4) * 1.2, hash2(k, 9)]);
  }
  for (let k = 0; k < 60; k++){ const th = (k + .5) / 60 * 6.2832; lampsP.push(onRing(th, 34.5)); }
  yield;
  // Shadows (afternoon and noon): everything cast onto one opaque layer, laid on the world once, kept off the field.
  if (!night){
    const sh = A.canvas(W, H), s2 = sh.getContext('2d'); s2.fillStyle = '#10142e';
    const box = (x, y, w, h, ht) => {
      const [dx, dy] = shv(ht), P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      s2.fillRect(wx(x), wy(y), wx(x + w) - wx(x), wy(y + h) - wy(y)); s2.fillRect(wx(x + dx), wy(y + dy), wx(x + w) - wx(x), wy(y + h) - wy(y));
      for (let e = 0; e < 4; e++){ const p = P[e], q = P[(e + 1) % 4]; s2.beginPath(); s2.moveTo(wx(p[0]), wy(p[1])); s2.lineTo(wx(q[0]), wy(q[1])); s2.lineTo(wx(q[0] + dx), wy(q[1] + dy)); s2.lineTo(wx(p[0] + dx), wy(p[1] + dy)); s2.fill(); }
    };
    for (const [x, y, w, h, ht] of blds) box(x, y, w, h, ht);
    box(TWR[0], TWR[1], 7, 7, 46);
    for (const [x, y, rad, s] of trees){ const [dx, dy] = shv(4 + rad * 2.2); for (let q = 0; q <= 3; q++) disc(x + dx * q / 3, y + dy * q / 3, rad * .9, '#10142e', s2); }
    for (const [x, y, rad] of plazaTrees){ const [dx, dy] = shv(6); for (let q = 0; q <= 2; q++) disc(x + dx * q / 2, y + dy * q / 2, rad * .9, '#10142e', s2); }
    const TW = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]){ const p = onRingDiag(sx, sy); TW.push(p); box(p[0] - 4, p[1] - 1.7, 8, 3.4, 24); }
    var towers = TW;
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.rect(wx(-13.3), wy(-6.5), (HX * 2) * OS, 66.33 * OS); c.clip('evenodd');
    c.globalAlpha = noon ? .3 : .36; c.drawImage(sh, 0, 0); c.restore();
    yield;
  } else towers = [-1, 1].flatMap(sx => [-1, 1].map(sy => onRingDiag(sx, sy)));
  const roof = (x, y, w, h, kind) => {
    const q = snow ? [232, 238, 248] : ROOF[kind], X = wx(x), Y = wy(y), pw = wx(x + w) - X, ph = wy(y + h) - Y, gable = kind === 0 || kind === 1 || kind === 2;
    c.fillStyle = T(q); c.fillRect(X, Y, pw, ph);
    if (gable){ const hz = w >= h; c.fillStyle = T(q, .8); if (hz) c.fillRect(X, Y + (ph >> 1), pw, ph - (ph >> 1)); else c.fillRect(X + (pw >> 1), Y, pw - (pw >> 1), ph); c.fillStyle = T(q, 1.25); if (hz) c.fillRect(X, Y + (ph >> 1), pw, 1); else c.fillRect(X + (pw >> 1), Y, 1, ph); }
    else { c.fillStyle = T(q, 1.14); c.fillRect(X + 2, Y + 2, pw - 4, ph - 4); c.fillStyle = T(q, .9); for (let k = 0; k < 3; k++){ c.fillRect(X + 4 + k * 12, Y + 4 + (k & 1) * 6, 7, 5); } }
    c.fillStyle = T(q, 1.3); c.fillRect(X, Y, pw, 1); c.fillRect(X, Y, 1, ph); c.fillStyle = T(q, .6); c.fillRect(X, Y + ph - 1, pw, 1); c.fillRect(X + pw - 1, Y, 1, ph);
    if (snow){ c.fillStyle = 'rgba(150,164,190,.5)'; c.fillRect(X, Y + ph - 2, pw, 1); }
  };
  let nb = 0; for (const [x, y, w, h, , kind] of blds){ roof(x, y, w, h, kind); if ((++nb & 3) === 0) yield; }
  {   // the bell tower: a pyramid roof in four lit and shaded faces, a spire
    const [tx, ty, sz] = TWR, X = wx(tx), Y = wy(ty), n = Math.round(sz * OS), q = snow ? [232, 238, 248] : [92, 140, 120];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++){
      const u = i - n / 2 + .5, v = j - n / 2 + .5, face = Math.abs(u) > Math.abs(v) ? (u < 0 ? 1.18 : .72) : (v < 0 ? 1.0 : .86), ring = Math.max(Math.abs(u), Math.abs(v)) / (n / 2);
      c.fillStyle = T(q, face * (.85 + (1 - ring) * .3)); c.fillRect(X + i, Y + j, 1, 1);
    }
    c.fillStyle = T([240, 232, 200]); c.fillRect(X + (n >> 1) - 1, Y + (n >> 1) - 1, 2, 2);
  }
  yield;
  {   // the pond
    const [x, y, w, h] = pond, P = [A.hex('#2f5f8e'), A.hex('#3d76a6')], cx = x + w / 2, cy = y + h / 2;
    for (let j = 0; j < h * OS; j++) for (let i = 0; i < w * OS; i++){
      const u = (i / OS - w / 2) / (w / 2), v = (j / OS - h / 2) / (h / 2), e = u * u + v * v;
      if (e > 1) continue;
      c.fillStyle = e > .88 ? T(snow ? [200, 214, 230] : [170, 160, 120]) : snow ? T([196, 214, 236]) : T(P[(hash2(i, j + 77) > .93 || ((i + j) >> 3) & 1 && hash2(i, j) > .8) ? 1 : 0]); c.fillRect(wx(x) + i, wy(y) + j, 1, 1);
    }
  }
  // Trees: clumps on the lawn (some turning for the fall) and the plaza's rows.
  const LEAF = snow ? [[236, 242, 250], [210, 222, 238], [150, 170, 196]] : [[52, 104, 48], [74, 130, 56], [104, 156, 70]], FALL = [[176, 112, 40], [208, 150, 48], [232, 190, 80]], EVG = [[30, 72, 52], [44, 98, 66], [70, 128, 84]];
  const tree = (x, y, rad, s) => {
    const pal = s < .2 ? EVG : s < .36 && !snow ? FALL : LEAF;
    disc(x, y, rad, T(pal[0])); disc(x - rad * .12, y - rad * .16, rad * .78, T(pal[1])); disc(x - rad * .28, y - rad * .3, rad * .42, T(pal[2]));
    c.fillStyle = T(pal[2], 1.1); for (let k = 0; k < 3; k++) c.fillRect(wx(x) - 2 + ((s * 97 * (k + 1)) | 0) % 5, wy(y) - 3 + ((s * 53 * (k + 2)) | 0) % 5, 1, 1);
  };
  let nt = 0; for (const t of trees){ tree(t[0], t[1], t[2], t[3]); if ((++nt & 31) === 0) yield; }
  for (const t of plazaTrees) tree(t[0], t[1], t[2], t[3] * .5 + .5);
  // The plaza's lamp posts, with the home team's banners hung from them.
  for (const [x, y] of lampsP){ rect(x - .35, y - .35, .7, .7, T([60, 60, 66])); c.fillStyle = T(hc); c.fillRect(wx(x) + 2, wy(y) - 1, 2, 4); }
  for (const [x, y] of lamps) rect(x - .3, y - .3, .6, .6, T([60, 60, 66]));
  // The gates (an opening in the wall under an awning), the concession stands, the main gate's banner, flags on poles.
  for (const [gx, gy, nx, ny, main] of GATES){
    const hw = main ? 6 : 4, a0 = nx ? [gx - (nx > 0 ? 1.8 : 0), gy - hw, 1.8, hw * 2] : [gx - hw, gy - (ny > 0 ? 1.8 : 0), hw * 2, 1.8];
    rect(...a0, T([26, 26, 32])); const aw = nx ? [gx + (nx > 0 ? 0 : -.9), gy - hw - .4, .9, hw * 2 + .8] : [gx - hw - .4, gy + (ny > 0 ? 0 : -.9), hw * 2 + .8, .9]; rect(...aw, T(hc, LK * .9));
    for (let q = -3; q <= 3; q++) rect(gx - nx * .9 + (nx ? 0 : q * 1.2) - .15, gy - ny * .9 + (ny ? 0 : q * 1.2) - .15, .3, .3, T([150, 150, 156]));   // turnstiles
  }
  for (const [x, y, vert] of stands){
    const w = vert ? 2.6 : 4.4, h = vert ? 4.4 : 2.6, X = wx(x - w / 2), Y = wy(y - h / 2), pw = Math.round(w * OS), ph = Math.round(h * OS);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 2, Y + 1, pw, ph); }
    for (let k = 0; k < (vert ? ph : pw); k += 2){ c.fillStyle = T(k & 2 ? WHITE : hc, LK); if (vert) c.fillRect(X, Y + k, pw, 2); else c.fillRect(X + k, Y, 2, ph); }
    c.fillStyle = T([60, 60, 66]); if (vert) c.fillRect(X, Y, 1, ph); else c.fillRect(X, Y, pw, 1);
    gather(x - w, y - h, w * 2, h * 2, 0, false);
  }
  {   // the big banner over the main gate, on the west end's facade
    const bx = CX - HX - BD + 1.8, X = wx(bx), Y = wy(CY - 12), bw = Math.round(3.1 * OS), bh = Math.round(24 * OS);
    c.fillStyle = T(ac, LK * .9); c.fillRect(X, Y - 1, bw, bh + 2); c.fillStyle = T(hc, LK * .9); c.fillRect(X + 1, Y + 1, bw - 2, bh - 2);
    c.fillStyle = T(hc, LK * .62); for (let k = 6; k < bh - 4; k += 9) c.fillRect(X + 1, Y + k, bw - 2, 1);   // its folds
  }
  for (const [x, y, vis] of flags){
    const X = wx(x), Y = wy(y), q = vis ? oc : hc;
    if (!night){ const [dx, dy] = shv(4); c.fillStyle = 'rgba(8,10,24,.32)'; for (let k = 1; k <= 6; k++) c.fillRect(X + Math.round(dx * OS * k / 6), Y + Math.round(dy * OS * k / 6), 1, 1); }
    c.fillStyle = T([200, 200, 206]); c.fillRect(X, Y, 1, 1); c.fillStyle = T(q, 1.05); c.fillRect(X + 1, Y - 1, 3, 2); c.fillStyle = T(vis ? oa : ac); c.fillRect(X + 1, Y, 3, 1);
  }
  yield;
  // The light towers off the four corners: a bank of lamps on a pole.
  for (const [x, y] of towers){
    const X = wx(x) - 12, Y = wy(y) - 5;
    c.fillStyle = 'rgba(8,10,24,.4)'; c.fillRect(X + 3, Y + 3, 24, 10);
    c.fillStyle = T([70, 74, 84]); c.fillRect(X, Y, 24, 10); c.fillStyle = T([110, 114, 124]); c.fillRect(X, Y, 24, 1);
    c.fillStyle = night ? '#fffbe8' : T([220, 222, 226]); for (let k = 0; k < 6; k++){ c.fillRect(X + 2 + k * 4, Y + 2, 2, 2); c.fillRect(X + 2 + k * 4, Y + 6, 2, 2); }
  }
  // The ribbon boards' team name along the fascia, and the home team's name on the sidelines' upper deck.
  const name = (home.name || 'HOME').toUpperCase().slice(0, 18), tx = pixText(name, 6);
  const fas = (x, y, rot) => { c.save(); c.translate(wx(x), wy(y)); c.rotate(rot); c.drawImage(tx, -tx.width >> 1, -tx.height >> 1); c.restore(); };
  for (const sx of [-14, 22, 58, 94]){ fas(sx + 6, CY - HY - 25.9, 0); fas(sx + 6, CY + HY + 25.9, Math.PI); }
  fas(CX + HX + 25.9, CY, Math.PI / 2); fas(CX - HX - 25.9, CY, -Math.PI / 2);
  yield;
  // The weather's grade over all of it (the game's own multiply).
  c.globalCompositeOperation = 'multiply';
  if (rain){ c.fillStyle = 'rgb(176,186,206)'; c.fillRect(0, 0, W, H); } else if (fog){ c.fillStyle = 'rgb(214,218,226)'; c.fillRect(0, 0, W, H); } else if (snow){ c.fillStyle = 'rgb(222,228,242)'; c.fillRect(0, 0, W, H); }
  c.globalCompositeOperation = 'source-over';
  yield;
  // Night: the lamps, windows' light, the towers' flare and beams, and the glow of the whole bowl over the dark.
  const glow = (X, Y, rad, a, col) => { const gr = c.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.35, `rgba(${col},${a * .35})`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(X - rad, Y - rad, rad * 2, rad * 2); };
  if (night){
    c.globalCompositeOperation = 'screen';
    for (let k = 0; k < 10; k++){ c.strokeStyle = `rgba(170,205,255,${.2 * Math.pow(1 - k / 10, 2)})`; c.lineWidth = 2.6 * OS; rr(c, k * 2.3 + 29, 2.3 * OS * 0 + 0); }
    for (const [x, y] of towers){
      const gx = wx(CX) - wx(x), gy = wy(CY) - wy(y), L = Math.hypot(gx, gy), nx = -gy / L, ny = gx / L, X = wx(x), Y = wy(y), R = 30 * OS;
      const gr = c.createLinearGradient(X, Y, X + gx * .9, Y + gy * .9); gr.addColorStop(0, 'rgba(215,232,255,.12)'); gr.addColorStop(1, 'rgba(215,232,255,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + gx * .9 + nx * R, Y + gy * .9 + ny * R); c.lineTo(X + gx * .9 - nx * R, Y + gy * .9 - ny * R); c.fill();
      glow(X, Y, 34 * OS, .85, '200,225,255');
    }
    for (const [x, y] of lamps) glow(wx(x), wy(y), 11 * OS, .42, '255,214,140');
    for (const [x, y] of lampsP) glow(wx(x), wy(y), 7 * OS, .34, '255,222,160');
    const wg = makeGlow(); c.globalAlpha = .5;   // lanterns under the tents, the gates and stands lit up
    for (let n = 0; n < tents.length; n += 2){ const [x, y] = tents[n], R = 5 * OS; c.drawImage(wg, wx(x + 1.6) - R, wy(y + 1.6) - R, R * 2, R * 2); }
    for (const [x, y] of stands){ const R = 6 * OS; c.drawImage(wg, wx(x) - R, wy(y) - R, R * 2, R * 2); }
    c.globalAlpha = 1; for (const [x, y] of GATES) glow(wx(x), wy(y), 14 * OS, .5, '255,220,160');
    for (const [x, y, w, h] of blds) glow(wx(x + w / 2), wy(y + h / 2), Math.max(w, h) * OS * .75, .16, '255,210,140');
    c.globalCompositeOperation = 'source-over';
    for (const [x, y] of lamps){ c.fillStyle = '#fff4cc'; c.fillRect(wx(x), wy(y), 2, 2); }
    for (const [x, y] of lampsP){ c.fillStyle = '#ffe9b8'; c.fillRect(wx(x), wy(y), 2, 2); }
    c.fillStyle = '#fffbe8'; for (const [x, y] of towers) for (let k = 0; k < 6; k++){ c.fillRect(wx(x) - 10 + k * 4, wy(y) - 3, 2, 2); c.fillRect(wx(x) - 10 + k * 4, wy(y) + 1, 2, 2); }
  }
  // The video boards, lit in the home team's colors (the far end's the big one).
  const board = (x, y, w, h, vert, big) => {
    const bc = A.canvas(Math.round((vert ? h : w) * OS), Math.round((vert ? w : h) * OS)), b2 = bc.getContext('2d'), bw = bc.width, bh = bc.height;
    b2.fillStyle = '#14141a'; b2.fillRect(0, 0, bw, bh);
    const gr = b2.createLinearGradient(0, 0, bw, bh); gr.addColorStop(0, A.css(hc.map(v => v * 1.15))); gr.addColorStop(1, A.css(hc.map(v => v * .55)));
    b2.fillStyle = gr; b2.fillRect(1, 1, bw - 2, bh - 2);
    b2.fillStyle = A.css(ac); b2.fillRect(1, 1, bw - 2, 2); b2.fillRect(1, bh - 3, bw - 2, 2);
    const bt = pixText(name.length > 12 ? name.slice(0, 12) : name, big ? 12 : 8); b2.drawImage(bt, (bw - bt.width) >> 1, (bh - bt.height) >> 1);
    b2.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < bh; k += 2) b2.fillRect(0, k, bw, 1);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.4)'; c.fillRect(wx(x + 1.6), wy(y + 1), Math.round(w * OS), Math.round(h * OS)); }
    c.fillStyle = '#2a2a30'; c.fillRect(wx(x) - 1, wy(y) - 1, Math.round(w * OS) + 2, Math.round(h * OS) + 2);
    c.save(); c.translate(wx(x + w / 2), wy(y + h / 2)); if (vert) c.rotate(x > CX ? Math.PI / 2 : -Math.PI / 2); c.drawImage(bc, -bw >> 1, -bh >> 1); c.restore();
  };
  board(CX + HX + 14.4, CY - 15, 6, 30, true, true); board(CX - HX - 20.4, CY - 9, 6, 18, true, false);
  yield;
  // Parts for the animated touches.
  const sparks = [];
  for (let n = 0; n < 4000 && sparks.length < 420; n++){ const x = X0 + hash2(n, 3) * (X1 - X0), y = Y0 + hash2(n, 6) * (Y1 - Y0), d = sd(x, y); if (d > 2 && d < 24) sparks.push(x, y); }
  yield;
  const lanes = [51.6, 48.4].map(dd => { const pts = [], cum = [0]; for (let k = 0; k <= 360; k++){ pts.push(onRing(k / 360 * 6.2832, dd)); if (k) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); } return { pts, cum }; });
  yield;
  const clouds = yield* makeClouds(cond);
  yield;
  const jets = makeJets(hc, ac, night), b2 = makeB2(night);
  yield;
  const ov = { c: cv, towers, lamps, lampsP, sparks, lanes, tower: [TWR[0] + 3.5, TWR[1] + 3.5], night, noon, snow, rain, fog, hc, ac, bg: T(snow ? [226, 232, 244] : [78, 130, 58]), name,
    clouds, jets, b2, glow: makeGlow(), walk: Float32Array.from(walk), smoke: Float32Array.from(grills.flat()), wc: [T(hc), T(WHITE), T(NEUT[0])],
    band: [T(hc, LK * .9), T(WHITE, LK * .9), T(ac, LK * .9)], smc: night ? 'rgb(120,124,140)' : 'rgb(226,226,230)', fx: Array.from({ length: 150 }, (_, i) => [hash2(i, 1), hash2(i, 2), .55 + hash2(i, 3) * .6, hash2(i, 4)]) };
  return ov;
  function rr(cc, dd){ const x = CX - HX - dd, y = CY - HY - dd, w = (HX + dd) * 2, h = (HY + dd) * 2; cc.beginPath(); if (cc.roundRect) cc.roundRect(wx(x), wy(y), w * OS, h * OS, (RC + dd) * OS); else cc.rect(wx(x), wy(y), w * OS, h * OS); cc.stroke(); }
  function onRingDiag(sx, sy){ const p = [CX + sx * (HX - RC), CY + sy * (HY - RC)], k = (RC + 30.5) / Math.SQRT2; return [p[0] + sx * k, p[1] + sy * k]; }
}
const inSolid = (list, x, y, m) => { for (const r of list) if (x > r[0] - m && x < r[2] + m && y > r[1] - m && y < r[3] + m) return true; return false; };
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
  const M = portrait ? [0, -s, s, 0, cw / 2 - cam.cy * s + sx, ch / 2 + cam.cx * s + sy] : [s, 0, 0, s, cw / 2 - cam.cx * s + sx, ch / 2 - cam.cy * s + sy];
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
