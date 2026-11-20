/* The generic home, for the pregame flyover: the bowl every team without a bake of its own plays in (doak.js is the
   one that has one) and, round it, a college campus on game day. flyover.js hands this the overview's frame and
   helpers, as it does doak.js, and gets back the same parts.

   The ground is painted pixel by pixel like the bowl itself: every surface (lawn, asphalt, concrete, brick, slate,
   copper, membrane) is a shape with a material, found through a coarse grid of bins, lit by the same late-afternoon
   sun from the south-west and run through the same tone curve, so the campus and the stadium read as one picture.
   Whatever stands up off the ground (the buildings, the ramps, the trees, the light towers) throws one shared shadow
   layer; the cars, tents and people are little sprites, the trees' crowns are lit sprites baked here.

   The plan (yards; the field runs along x, -y is north). The opening shot sees the west and east ends and the corners
   best, so that's where the most is going on:
     west   the Walk, a brick promenade up the middle of a divided boulevard to the main gate (the band marches up it);
            the Grove north of it (tents packed in under old oaks); the library, its plaza and the quad south of it,
            the bell tower at the plaza's corner
     sw     Fan Fest in the lawn off the stadium's corner, food trucks along the south side
     east   the practice field north of the east road, the big lot and the RVs south of it
     ne     the TV compound; se: the visitors' tailgate under the trees
     north  the parking deck, the indoor practice facility, the dorms (mostly above the opening shot)
     south  the street of houses past the stadium's south side
   The same campus for every team; only the colors change. */

const WHITE = [240, 238, 230];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const HX = 63.3, HY = 33, RC = 4, BD = 28.2;   // the pit (field and wall) and the bowl's depth
const PL = 46, RD0 = 47, RD1 = 53, SW1 = 56.6, TL1 = 59;   // the plaza's edge; the ring road; its sidewalk; its tree lawn
const BRICK = [[150, 82, 62], [160, 92, 70], [140, 76, 58], [166, 98, 74]];
// Cars as a real lot has them: mostly white, black, gray and silver, a few colors.
const CARC = [[234, 234, 230], [222, 224, 224], [28, 30, 34], [42, 44, 48], [132, 134, 138], [172, 174, 178], [152, 154, 158], [38, 54, 92], [148, 34, 32], [88, 92, 98], [50, 72, 58], [192, 182, 156], [66, 100, 142], [118, 26, 30]];
// Cars from above, 6 px across, nose up: b body, B its sunlit side, d its shaded side, r the roof, R roof rails, g glass, G a glint, k a truck bed.
const CART = {
  sedan: ['.bbbb.', 'Bbbbbd', 'Bbbbbd', 'Bbbbbd', 'GggggG', '.gggg.', 'Brrrrd', 'Brrrrd', 'Brrrrd', '.gggg.', 'Bbbbbd', 'Bbbbbd', '.bbbb.'],
  suv: ['.bbbb.', 'Bbbbbd', 'Bbbbbd', 'GggggG', '.gggg.', 'BRrrRd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'BRrrRd', '.gggg.', 'Bbbbbd', '.bbbb.'],
  pickup: ['.bbbb.', 'Bbbbbd', 'Bbbbbd', 'Bbbbbd', 'GggggG', '.gggg.', 'Brrrrd', '.gggg.', 'Bkkkkd', 'Bkkkkd', 'Bkkkkd', 'Bkkkkd', 'bbbbbd'],
  van: ['.bbbb.', 'Bbbbbd', 'GggggG', '.gggg.', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', '.gggg.', '.bbbb.']
};
const CARK = ['sedan', 'sedan', 'sedan', 'suv', 'suv', 'suv', 'pickup', 'pickup', 'van'];
// Tree crowns: five tones each, dark to lit. Fall is coming on: mostly green, some gold and rust.
const PAL = {
  oak: [[28, 46, 30], [38, 60, 36], [50, 76, 42], [66, 94, 50], [88, 114, 60]],
  green: [[32, 54, 30], [44, 72, 36], [58, 90, 42], [78, 110, 50], [102, 132, 62]],
  pine: [[20, 38, 34], [28, 52, 42], [40, 68, 52], [56, 86, 62], [76, 104, 74]],
  gold: [[74, 58, 26], [104, 82, 32], [140, 110, 42], [174, 140, 56], [200, 172, 84]],
  rust: [[66, 32, 24], [96, 46, 30], [126, 64, 38], [154, 88, 50], [180, 118, 70]],
  amber: [[80, 44, 22], [116, 64, 26], [150, 90, 34], [182, 120, 48], [204, 152, 74]],
  snow: [[150, 160, 182], [178, 188, 208], [204, 212, 228], [224, 230, 242], [242, 246, 252]]
};

export function* campusOverview(K, home, away, cond, art){
  const { A, OS, X0, Y0, W, H, CX, CY, SKIN, NEUT } = K, { hash2, hex } = A;
  const X1 = X0 + W / OS, Y1 = Y0 + H / OS;
  const night = cond.time === 'night', noon = cond.time === 'noon', snow = cond.sky === 'snow', rain = cond.sky === 'rain', fog = cond.sky === 'fog';
  const cv = A.canvas(W, H), c = cv.getContext('2d');
  const TM = night ? [.27, 0, .32, 0, .52, 0] : noon ? [1.04, 4, 1.04, 4, 1.02, 4] : [1.04, 7, 1.01, 3, .9, 0];
  const tone = (r, g, b) => [r * TM[0] + TM[1], g * TM[2] + TM[3], b * TM[4] + TM[5]];
  const T = (q, k = 1) => A.css(tone(q[0] * k, q[1] * k, q[2] * k));
  const SD = noon ? [.6, .5] : [.93, .37], LSR = night ? 0 : noon ? 8 : 30, LSG = night ? 0 : noon ? 4 : 17;   // the sun's lean; how far the rim's shadow reaches
  const shv = ht => noon ? [.14 * ht * .9, .18 * ht * .9] : [.95 * ht * .85, .38 * ht * .85];
  // Toward the sun: flat (for roof faces) and in 3D (for domes, vaults and the trees' crowns).
  const LL = Math.hypot(SD[0], SD[1]), LX = -SD[0] / LL, LY = -SD[1] / LL, FS = night ? .07 : noon ? .1 : .2;
  const LZ = noon ? 2.4 : 1.05, L3n = Math.hypot(SD[0], SD[1], LZ), L3 = [-SD[0] / L3n, -SD[1] / L3n, LZ / L3n];
  const wx = x => Math.round((x - X0) * OS), wy = y => Math.round((y - Y0) * OS);
  const sd = (x, y) => { const qx = Math.abs(x - CX) - (HX - RC), qy = Math.abs(y - CY) - (HY - RC); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RC; };
  const onRing = (th, d) => { const dx = Math.cos(th), dy = Math.sin(th); let lo = 0, hi = 400; for (let i = 0; i < 18; i++){ const m = (lo + hi) / 2; if (sd(CX + dx * m, CY + dy * m) < d) lo = m; else hi = m; } return [CX + dx * lo, CY + dy * lo]; };
  const onRingDiag = (sx, sy) => { const p = [CX + sx * (HX - RC), CY + sy * (HY - RC)], k = (RC + 30.5) / Math.SQRT2; return [p[0] + sx * k, p[1] + sy * k]; };
  const vn = (x, y) => {   // value noise
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = hash2(i, j), b2 = hash2(i + 1, j), c2 = hash2(i, j + 1), d2 = hash2(i + 1, j + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b2 - a) * ux + (c2 - a) * uy + (a - b2 - c2 + d2) * ux * uy;
  };
  const hc = hex(home.color), ac = hex(home.alt || '#f4f4f4'), oc = hex(away.color), oa = hex(away.alt || '#f4f4f4');
  let r = 0, g = 0, b = 0, em = false;
  const set = (q, k = 1) => { r = q[0] * k; g = q[1] * k; b = q[2] * k; };
  const mul = k => { r *= k; g *= k; b *= k; };

  // The lettering first (reading a canvas back waits on everything drawn before it, so before there's anything).
  const name = (home.name || 'HOME').toUpperCase().slice(0, 18), TX = { fas: K.pixText(name, 6), nums: {} };
  yield;
  TX.b12 = K.pixText(name.length > 12 ? name.slice(0, 12) : name, 12); yield;
  TX.b8 = K.pixText(name.length > 12 ? name.slice(0, 12) : name, 8); yield;
  for (const n of ['10', '20', '30', '40', '50']){ TX.nums[n] = K.pixText(n, 6, T(snow ? [200, 208, 220] : [232, 234, 226])); yield; }

  // ---------------------------------------------------------------- the bowl (as it always was)
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

  // ---------------------------------------------------------------- materials (into r, g, b, before the tone curve)
  const lawn = (x, y, h, wear = 0) => {   // mown in stripes, patchy as real grass is; wear browns it where the tents have stood all day
    const n = vn(x * .13 + 50, y * .13 + 50), m = vn(x * .45 + 7, y * .45 - 3);
    if (snow){ set([226, 232, 244], .95 + n * .05 + h * .04); if (wear && m > .62) set([200, 206, 218], .96 + h * .06); return; }
    const w = wear * clamp((m - .4) * 3, 0, 1);
    r = 70 + n * 14 + w * 30; g = 120 + n * 16 - w * 10; b = 50 + n * 6 + w * 10;
    mul(((Math.floor((x + 600) / 2.67) & 1) ? 1.03 : .97) * (.94 + h * .1));
    if (h > .978) mul(.84);
  };
  const asph = (x, y, h, lotty = 0) => {   // aggregate speckle, patches of newer and older seal
    if (snow){ if (lotty) set([196, 204, 216], .95 + h * .06); else set([98, 102, 112], .92 + vn(x * .4, y * .4) * .14 + h * .05); return; }
    set([62, 64, 70], .9 + vn(x * .35 + 9, y * .35) * .14 + h * .07);
    if (rain) mul(.84);
    if (h > .988) set([102, 102, 106]); else if (h < .01) set([40, 42, 46]);
  };
  const conc = (h, ja, jb = 1, k = 1) => {   // poured slabs, the joints scored every five feet
    if (snow){ set([222, 228, 240], .96 + h * .04); if (ja % 5 === 0 || jb % 5 === 0) mul(.94); return; }
    set([178, 174, 166], k * (.95 + hash2(Math.floor(ja / 5) + 77, Math.floor(jb / 5)) * .06 + h * .04));
    if (ja % 5 === 0 || jb % 5 === 0) mul(.87);
  };
  const brk = (h, i, j, k = 1) => {   // brick pavers in herringbone (too small to lay one by one: the grain of it)
    if (snow){ set([204, 198, 204], .95 + h * .06); return; }
    set(BRICK[(h * 3.99) | 0], k * (((i + (j >> 1)) & 3) < 2 ? 1.02 : .95));
  };
  const curb = h => set(snow ? [212, 216, 226] : [196, 192, 184], .95 + h * .06);
  const granite = (h, k = 1) => set(snow ? [216, 222, 234] : [176, 170, 160], k * (.94 + h * .08));
  const bed = (x, y, h) => {   // mulch and the shrubs in it
    if (snow){ set([214, 220, 234], .94 + h * .06); return; }
    const n = vn(x * 1.3, y * 1.3);
    if (n > .54){ const lit = vn(x * 1.3 + SD[0] * .5, y * 1.3 + SD[1] * .5) < n; set([48, 84, 44], (lit ? 1.12 : .8) * (.92 + h * .1)); }
    else set([80, 58, 44], .88 + h * .16);
  };
  const water = (x, y, i, j, e, h) => {
    if (e < .45){ granite(h, e < .2 ? 1.08 : .92); return; }
    if (snow){ set([200, 216, 236], .95 + h * .05); return; }
    set([42, 82, 118], (e < .9 ? .82 : 1) * (.94 + vn(x * .9, y * .9) * .1));
    if (h > .975 || ((((i + j * 2) >> 2) & 3) === 0 && h > .88)) set([100, 150, 186]);
  };
  const gravel = (x, y, h) => { if (snow){ set([218, 224, 236], .95 + h * .05); return; } set([132, 126, 116], .86 + h * .22 + (vn(x * .5, y * .5) - .5) * .12); };

  // ---------------------------------------------------------------- shapes, found through a grid of bins
  const SHP = [], CELL = 6, NBX = Math.ceil((X1 - X0) / CELL), NBY = Math.ceil((Y1 - Y0) / CELL), bins = Array.from({ length: NBX * NBY }, () => []);
  const shape = (x0, y0, x1, y1, f, p, o) => {
    const s = { f, p, ...o }, id = SHP.push(s) - 1;
    for (let by = Math.max(0, Math.floor((y0 - Y0) / CELL)); by <= Math.min(NBY - 1, Math.floor((y1 - Y0) / CELL)); by++)
      for (let bx = Math.max(0, Math.floor((x0 - X0) / CELL)); bx <= Math.min(NBX - 1, Math.floor((x1 - X0) / CELL)); bx++) bins[by * NBX + bx].push(id);
    return s;
  };
  const rrd = (x, y, x0, y0, x1, y1, rad) => { const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - rad), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - rad); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad; };
  // o.out: kept that far out from the bowl (the ring road and its sidewalk run round everything); o.r: rounded corners
  const box = (x0, y0, x1, y1, p, o = {}) => { const rad = o.r || 0, out = o.out;
    return shape(x0, y0, x1, y1, out ? (x, y, d) => Math.max(rrd(x, y, x0, y0, x1, y1, rad), out - d) : (x, y) => rrd(x, y, x0, y0, x1, y1, rad), p, { kind: 'lawn', ...o, x0, y0, x1, y1 }); };
  const circ = (cx, cy, R, p, o = {}) => shape(cx - R, cy - R, cx + R, cy + R, (x, y) => Math.hypot(x - cx, y - cy) - R, p, { kind: 'lawn', ...o, cx, cy, R, x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R });
  const seg = (xa, ya, xb, yb, hw, p, o = {}) => { const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    return shape(Math.min(xa, xb) - hw, Math.min(ya, yb) - hw, Math.max(xa, xb) + hw, Math.max(ya, yb) + hw, (x, y) => { const t = clamp((x - xa) * ux + (y - ya) * uy, 0, L); return Math.hypot(x - xa - ux * t, y - ya - uy * t) - hw; }, p, { kind: 'path', ...o, xa, ya, ux, uy, L, hw }); };
  const poly = (pts, hw, p, o) => { for (let n = 1; n < pts.length; n++) seg(pts[n - 1][0], pts[n - 1][1], pts[n][0], pts[n][1], hw, p, o); };
  const at = (x, y) => {   // what's on top at a point: 'ring' inside the ring's tree lawn, a shape, or null for open lawn
    const d = sd(x, y); if (d < TL1) return 'ring';
    const bx = Math.floor((x - X0) / CELL), by = Math.floor((y - Y0) / CELL); if (bx < 0 || by < 0 || bx >= NBX || by >= NBY) return 'edge';
    const cell = bins[by * NBX + bx]; for (let k = cell.length - 1; k >= 0; k--){ const s = SHP[cell[k]]; if (s.f(x, y, d) < 0) return s; }
    return null;
  };
  const isLawn = s => s === null || (s !== 'ring' && s !== 'edge' && s.kind === 'lawn');
  const open = (x, y, rad) => isLawn(at(x, y)) && isLawn(at(x + rad, y)) && isLawn(at(x - rad, y)) && isLawn(at(x, y + rad)) && isLawn(at(x, y - rad));

  // ---------------------------------------------------------------- painters for the shapes: (x, y, i, j, e = how far in from its edge, h, d, S)
  const lawnP = (x, y, i, j, e, h, d, S) => lawn(x, y, h, S.wear || 0);
  const brickWalk = (x, y, i, j, e, h) => { if (e < .3) curb(h); else brk(h, i, j); };
  const concWalk = (x, y, i, j, e, h) => { if (e < .25) curb(h); else conc(h, i, j); };
  const plazaP = (x, y, i, j, e, h) => {   // granite pavers in a running bond, a brick border
    if (e < .4) return granite(h, 1.06);
    if (e < 1.3) return brk(h, i, j);
    if (snow){ set([222, 228, 240], .95 + h * .05); return; }
    const ii = i + ((j >> 2) & 1) * 3; set([186, 180, 168], .95 + hash2((ii / 6) | 0, (j >> 2) + 900) * .06 + h * .03);
    if (j % 4 === 0 || ii % 6 === 0) mul(.9);
  };
  const gravelP = (x, y, i, j, e, h) => { if (e < .3){ set([110, 114, 118], ((i + j) & 1) ? 1.15 : .7); return; } gravel(x, y, h); };   // with its chain-link fence
  function streetP(x, y, i, j, e, h, d, S){
    const v = Math.abs(S.ax ? y - S.c0 : x - S.c0), al = S.ax ? x : y;
    if (v < S.hw){
      asph(x, y, h);
      if (d < SW1 + .4){ if ((v * 1.5 | 0) & 1) set([226, 226, 222], snow ? .9 : .97); return; }   // the crosswalk where it meets the ring
      if (S.mark && v > .17 && v < .5) set([222, 188, 76], snow ? .75 : .95);   // a double yellow
      else if (v > S.hw - .55 && v < S.hw - .22) set([214, 214, 208], snow ? .8 : .9);
      return;
    }
    if (v < S.hw + .34) return curb(h);
    if (v < S.hw + .34 + S.tl) return lawn(x, y, h, 0);
    conc(h, Math.floor(al * OS), 1);
  }
  const street = (ax, c0, a0, a1, o) => {   // ax 1: runs along x at y = c0; 0: along y at x = c0
    const hw = o.hw, tl = o.tl ?? 2.2, sw = o.sw ?? 2.6, tw = hw + .34 + tl + sw;
    return ax ? box(a0, c0 - tw, a1, c0 + tw, streetP, { out: RD1, kind: 'street', ax, c0, hw, tl, sw, tw, mark: o.mark ?? 1 })
      : box(c0 - tw, a0, c0 + tw, a1, streetP, { out: RD1, kind: 'street', ax, c0, hw, tl, sw, tw, mark: o.mark ?? 1 });
  };
  const cross = (A2, B2) => {   // where a street along x (A2) crosses one along y (B2)
    const xc = B2.c0, yc = A2.c0;
    box(xc - B2.tw, yc - A2.tw, xc + B2.tw, yc + A2.tw, (x, y, i, j, e, h) => {
      const vA = Math.abs(y - yc), vB = Math.abs(x - xc), onA = vA < A2.hw, onB = vB < B2.hw;
      if (onA || onB){ asph(x, y, h); if (onA !== onB && (((onA ? vA : vB) * 1.5) | 0) & 1 && (onA ? vB - B2.hw : vA - A2.hw) > .6) set([226, 226, 222], snow ? .9 : .97); return; }
      if (vA < A2.hw + .34 || vB < B2.hw + .34) curb(h); else conc(h, i, j);
    }, { kind: 'street' });
  };
  // Roofs. Gabled: slate (or shingle) in courses, the sunlit face lighter, a ridge cap, gutters, stone parapets on
  // the gable ends, dormers, chimneys.
  function gableRoof(x, y, i, j, e, h, d, S){
    const ax = S.ax ?? (S.x1 - S.x0 >= S.y1 - S.y0 ? 1 : 0), hw = ax ? (S.y1 - S.y0) / 2 : (S.x1 - S.x0) / 2;
    const cw = ax ? y - (S.y0 + S.y1) / 2 : x - (S.x0 + S.x1) / 2, aw = Math.abs(cw), u = ax ? x - S.x0 : y - S.y0, L = ax ? S.x1 - S.x0 : S.y1 - S.y0;
    const lit = ax ? (cw < 0 ? -LY : LY) : (cw < 0 ? -LX : LX);
    if (S.par && (u < .6 || L - u < .6)){ set(snow ? [236, 240, 248] : [196, 190, 178], u < .3 || L - u < .3 ? 1.08 : .9); return; }
    for (const [cu, cs] of S.chim || []){   // a chimney, its cap, its shadow down the roof
      const pu = u - cu, pw = cw - cs * hw * .5;
      if (Math.abs(pu) < .55 && Math.abs(pw) < .45){ set(Math.abs(pu) < .3 && Math.abs(pw) < .2 ? [60, 46, 42] : BRICK[1], Math.abs(pu) < .3 && Math.abs(pw) < .2 ? 1 : 1.05); return; }
      const [sx, sy] = shv(1.6), qu = pu - (ax ? sx : sy), qw = pw - (ax ? sy : sx);
      if (!night && Math.abs(qu) < .55 && Math.abs(qw) < .45 && Math.sign(qw) * Math.sign(pw) >= 0){ set(S.mat, .66 + lit * FS); return; }
    }
    if (S.dorm && aw > hw * .3 && aw < hw * .82){   // a dormer: a little gable out of the slope, its window to the eave
      const p = ((u - 2) % S.dorm + S.dorm) % S.dorm - S.dorm / 2;
      if (Math.abs(p) < 1.1 && u > 2 && L - u > 2){
        if (aw > hw * .74){ if (night && hash2(u | 0, cw > 0) > .4){ set([255, 212, 140], .9); em = true; } else set([46, 54, 66]); return; }
        const l2 = ax ? (p < 0 ? -LX : LX) : (p < 0 ? -LY : LY);
        set(snow ? [236, 240, 248] : S.mat, Math.abs(p) < .22 ? 1.1 : (1 + l2 * FS) * (.96 + h * .06)); return;
      }
    }
    if (aw < .3){ set(snow ? [240, 242, 250] : S.mat, 1.25); return; }   // the ridge cap
    if (e < .28){ set(snow ? [206, 212, 226] : [70, 70, 76]); return; }   // the gutter
    if (snow){ set([234, 238, 246], .92 + lit * .08 + h * .04); return; }
    const row = Math.floor((hw - aw) * OS), jt = ((Math.floor(u * OS) + (row & 1) * 2) & 3) === 0;
    set(S.mat, (1 + lit * FS) * ((row & 1) ? 1 : .93) * (jt ? .9 : 1) * (.95 + h * .08));
  }
  function hipRoof(x, y, i, j, e, h, d, S){   // four faces; the hips and the ridge capped
    const dl = x - S.x0, dr = S.x1 - x, dt = y - S.y0, db = S.y1 - y, m = Math.min(dl, dr, dt, db);
    const nx = m === dl ? -1 : m === dr ? 1 : 0, ny = nx ? 0 : m === dt ? -1 : 1, lit = nx * LX + ny * LY;
    const s2 = [dl, dr, dt, db].sort((p, q) => p - q);
    if (s2[1] - s2[0] < .24 && e > .3){ set(snow ? [240, 242, 250] : S.mat, 1.22); return; }
    if (e < .28){ set(snow ? [206, 212, 226] : [70, 70, 76]); return; }
    if (S.lit && m > Math.min(S.x1 - S.x0, S.y1 - S.y0) / 2 - .6){ set([210, 204, 190], 1.1); if (night){ set([255, 220, 160]); em = true; } return; }   // a lantern on top
    if (snow){ set([234, 238, 246], .92 + lit * .08 + h * .04); return; }
    const row = Math.floor(m * OS), jt = ((Math.floor((nx ? y : x) * OS) + (row & 1) * 2) & 3) === 0;
    set(S.mat, (1 + lit * FS * 1.1) * ((row & 1) ? 1 : .93) * (jt ? .9 : 1) * (.95 + h * .08));
  }
  // Flat: membrane in panels inside a coped parapet, the rooftop units (and their shadows), skylights lit at night.
  function flatRoof(x, y, i, j, e, h, d, S){
    const base = snow ? [234, 238, 246] : S.mat || [176, 176, 180];
    if (e < .45){ set(snow ? [236, 240, 248] : S.cop || [192, 186, 176], e < .18 ? 1.12 : 1); return; }
    if (e < .75){ set(base, .74); return; }
    const u = x - S.x0, w = y - S.y0;
    set(base, .95 + h * .05 + (vn(u * .3 + S.seed, w * .3) - .5) * .06);
    if (!snow && ((u * OS) | 0) % 15 === 0) mul(.95);
    const gx = Math.floor(u / 7), gy = Math.floor(w / 7), k = hash2(gx + S.seed, gy + 40), fu = u - gx * 7, fw = w - gy * 7;
    const inU = (p, q) => p > 2 && p < 5.2 && q > 2.4 && q < 4.6;
    if (e < 1.6) return;
    if (k > .6){
      if (inU(fu, fw)){ set(snow ? [214, 220, 232] : [150, 154, 160], (fu < 2.35 || fw < 2.75 ? 1.16 : 1) * (.95 + h * .06)); const qx = fu - 3.6, qy = fw - 3.5; if (qx * qx + qy * qy < .45) set([40, 42, 48]); return; }
      const [sx, sy] = shv(1.6); if (!night && inU(fu - sx, fw - sy)) mul(.7);
    } else if (k < .17 && S.sky !== false && fw > 2.6 && fw < 4.4 && fu > .8 && fu < 6.2){ if (night){ set([255, 214, 150], .8); em = true; } else set([104, 136, 158], .95 + h * .1); }
  }
  function domeP(x, y, i, j, e, h, d, S){   // a ribbed copper dome on its drum, the lantern on top
    const dx = (x - S.cx) / S.R, dy = (y - S.cy) / S.R, rr = Math.hypot(dx, dy);
    if (rr > .9){ set(snow ? [236, 240, 248] : [198, 192, 180], rr > .96 ? .84 : 1.06); return; }
    if (rr < .15){ set([214, 208, 194], rr < .08 ? 1.18 : .86); if (night && rr < .08){ set([255, 220, 160]); em = true; } return; }
    const q = rr / .9, nz = Math.sqrt(Math.max(0, 1 - q * q)), sh = dx / .9 * L3[0] + dy / .9 * L3[1] + nz * L3[2];
    const th = Math.atan2(dy, dx), rib = ((th / 6.2832 * 24) % 1 + 1) % 1 < .12;
    set(snow ? [236, 240, 248] : S.mat, Math.round((.58 + sh * .58) * 9) / 9 * (rib ? .84 : 1) * (.97 + h * .05));
  }
  function vaultP(x, y, i, j, e, h, d, S){   // a barrel vault along x in standing-seam metal, a skylight ribbon down its crown
    if (e < .35){ set([150, 150, 156], .92); return; }
    const hw = (S.y1 - S.y0) / 2, w = (y - (S.y0 + S.y1) / 2) / hw, nz = Math.sqrt(Math.max(.05, 1 - w * w * .7)), sh = w * .84 * L3[1] + nz * L3[2];
    if (Math.abs(w) < .05){ if (night){ set([255, 214, 150], .7); em = true; } else set([200, 214, 222]); return; }
    if (snow){ set([234, 238, 246], .82 + sh * .22); return; }
    set(S.mat, Math.round((.66 + sh * .44) * 10) / 10 * ((((x - S.x0) * OS) | 0) % 3 === 0 ? 1.08 : .97) * (.97 + h * .04));
  }
  function stageP(x, y, i, j, e, h, d, S){   // the stage's black roof on its truss, the LED wall along its front
    if (x > S.x1 - 1){ set(hc, night ? 1.6 : 1.1); if (((i + j) & 1) === 0) mul(.82); if (night) em = true; return; }
    set([40, 40, 46], .95 + h * .1); if ((i % 6 === 0 || j % 6 === 0) && e > .4) set([96, 98, 106]);
  }
  // Parking: asphalt (or the deck's concrete), stalls painted in back-to-back rows, oil down the middle of the stalls,
  // planted islands at the row ends; S.u0..S.u1 the stalls across, S.m0 where the rows start, 19.2 yd a module.
  function lotP(x, y, i, j, e, h, d, S){
    if (e < .34){ if (S.deck) set(snow ? [236, 240, 248] : [190, 188, 182], e < .15 ? 1.1 : .92); else curb(h); return; }
    const w = y - S.m0, wm = ((w % 19.2) + 19.2) % 19.2, inRow = w >= 0 && w < S.rows * 19.2 - .4 && (wm < 5.2 || (wm > 13.6 && wm < 18.8));
    if (inRow && ((x > S.x0 + 6.4 && x < S.u0 - .6) || (x > S.u1 + .6 && x < S.u1 + 4.6)) && !S.deck){   // an island
      const ex = Math.min(Math.abs(x - (x < S.u0 ? S.x0 + 6.4 : S.u1 + .6)), Math.abs(x - (x < S.u0 ? S.u0 - .6 : S.u1 + 4.6))), ey = Math.min(wm < 5.2 ? wm : wm - 13.6, wm < 5.2 ? 5.2 - wm : 18.8 - wm);
      if (Math.min(ex, ey) < .34) curb(h); else lawn(x, y, h, 0); return;
    }
    if (S.deck){ if (snow) set([228, 232, 242], .95 + h * .05); else { set([150, 148, 144], .94 + h * .08); if ((((x - S.x0) * OS) | 0) % 30 === 0) mul(.9); } }
    else asph(x, y, h, 1);
    if (inRow && x >= S.u0 && x <= S.u1){
      const u = x - S.u0, su = u % 3;
      if (su < 1 / OS) set([214, 214, 208], snow ? .82 : .9);
      else if (!snow && Math.abs(su - 1.5) < .5){ const half = wm < 5.2 ? 0 : 1, row = Math.floor(w / 19.2); if (hash2(Math.floor(u / 3) + row * 97 + S.x0, half + 11) > .5 && Math.abs(half ? wm - 16.2 : wm - 2.6) < 1.1) mul(.86); }
    }
  }
  function fieldP(x, y, i, j, e, h, d, S){   // the practice field: lined turf, the team's end zones, its windscreen fence
    if (e < .4){ set([38, 60, 44], ((i + j) & 1) ? .95 : .8); return; }
    const F = S.F, inF = x > F[0] && x < F[2] && y > F[1] && y < F[3];
    if (snow){ set([226, 232, 244], .95 + h * .05); if (inF && Math.abs(((y - F[1]) % 5 + 5) % 5) < .3) set([196, 204, 220]); return; }
    set(Math.floor((y - F[1]) / 5) & 1 ? [74, 132, 56] : [66, 122, 52], .95 + h * .07 + (vn(x * .3, y * .3) - .5) * .05);
    if (!inF) return;
    const ez = y < F[1] + 10 || y > F[3] - 10, yl = ((y - F[1]) % 5 + 5) % 5;
    if (ez) set(hc, .78 * (.95 + h * .08));
    if (x < F[0] + .4 || x > F[2] - .4 || (!ez && yl < .34) || Math.abs(y - F[1] - 10) < .2 || Math.abs(F[3] - 10 - y) < .2) set([232, 234, 226], .95);
    else if (!ez && (Math.abs(x - (F[0] + F[2]) / 2 - 3.1) < .3 || Math.abs(x - (F[0] + F[2]) / 2 + 3.1) < .3) && ((y - F[1]) % 1 + 1) % 1 < .34) set([232, 234, 226], .9);
  }
  function rampP(x, y, i, j, e, h, d, S){   // a spiral ramp from above: its parapet, the deck winding down, the open core
    const dx = x - S.cx, dy = y - S.cy, rr = Math.hypot(dx, dy) / S.R, th = Math.atan2(dy, dx);
    if (rr < .3){ set([30, 32, 38]); return; }
    if (rr < .38 || rr > .9){ set(snow ? [236, 240, 248] : [200, 196, 188], rr > .95 ? .82 : 1.04); return; }
    const sh = -(dx * LX + dy * LY) / (rr * S.R + .01);   // the inner wall faces away from where the sun comes in
    set(snow ? [228, 232, 242] : [168, 164, 156], (.9 + sh * .08) * (((th * 8 / 6.2832 + rr * 2.2) % 1 + 1) % 1 < .07 ? .82 : 1) * (.95 + h * .06));
  }
  const RAMPS = [[-2, CY - HY - 36.5], [102, CY - HY - 36.5], [-2, CY + HY + 36.5], [102, CY + HY + 36.5]];
  const LT = [-1, 1].flatMap(sx => [-1, 1].map(sy => onRingDiag(sx, sy)));   // the light towers off the four corners
  const STAT = [CX - HX - BD - 10.5, CY];   // the statue at the main gate
  const GATES = [[CX - HX - BD, CY, -1, 0, 1], [CX + HX + BD, CY, 1, 0, 0], [22, CY - HY - BD, 0, -1, 0], [78, CY - HY - BD, 0, -1, 0], [22, CY + HY + BD, 0, 1, 0], [78, CY + HY + BD, 0, 1, 0]];
  let gMain = 0;
  const gateLat = (x, y) => {   // how far to the side of the nearest gate's axis (out to the ring road beyond it)
    let best = 99; gMain = 0;
    for (const [gx, gy, nx, ny, mn] of GATES){ const a = (x - gx) * nx + (y - gy) * ny; if (a < -3 || a > 30) continue; const l = Math.abs((x - gx) * ny - (y - gy) * nx); if (l < best){ best = l; gMain = mn; } }
    return best;
  };
  const ringS = (x, y, d) => { const qx = Math.abs(x - CX) - (HX - RC), qy = Math.abs(y - CY) - (HY - RC); return qx <= 0 ? x : qy <= 0 ? y : Math.atan2(qy, qx) * (RC + d); };
  const isBed = (x, y, v, s) => {
    if (v < 11.4 || v > 16.4 || ((s + 1000) % 20) < 3.4 || gateLat(x, y) < 15 || Math.hypot(x - STAT[0], y - STAT[1]) < 14) return false;
    for (const [px, py] of RAMPS) if (Math.hypot(x - px, y - py) < 9) return false;
    for (const [px, py] of LT) if (Math.hypot(x - px, y - py) < 7) return false;
    return true;
  };
  // The plaza round the bowl: an apron at the wall's foot, bands of brick, stone pavers, planted beds round the outside.
  const plaza = (x, y, i, j, d, h) => {
    const v = d - BD, s = ringS(x, y, d), sP = Math.floor(s * OS), dP = Math.floor(d * OS);
    if (v < 1.3) return conc(h, sP, dP, 1.03);
    if (x < CX && Math.abs(y - CY) < 4.4){ if (Math.abs(y - CY) < .4) granite(h); else brk(h, i, j); return; }   // the Walk, on in to the statue
    if (v > 17.2) return granite(h, v > 17.5 ? .9 : 1.06);
    if (isBed(x, y, v, s)){ const m = (s + 1000) % 20, ev = Math.min(v - 11.4, 16.4 - v, m - 3.4, 20 - m); if (ev < .34) granite(h); else bed(x, y, h); return; }
    if (v < 2.1 || (v > 9.2 && v < 9.9)) return brk(h, i, j);
    if (snow){ set([222, 228, 240], .95 + h * .05); if ((sP & 3) === 0 || (dP & 3) === 0) mul(.94); return; }
    set([184, 176, 162], (gateLat(x, y) < 15 ? 1.04 : 1) * (.95 + hash2((sP >> 2) + 3000, dP >> 2) * .07 + h * .03));
    if ((sP & 3) === 0 || (dP & 3) === 0) mul(.9);
  };
  const ringRoad = (x, y, i, j, d, h) => {
    asph(x, y, h);
    const gl = gateLat(x, y);
    if (gl < (gMain ? 4.6 : 3.2)){ if ((d * 1.5 | 0) & 1) set([226, 226, 222], snow ? .9 : .97); return; }   // the crosswalk in front of each gate
    if (d > 49.7 && d < 50.4){ if (((ringS(x, y, d) / 3) % 2 + 2) % 2 < 1.1) set([226, 200, 92], snow ? .7 : .95); }
    else if ((d > 47.35 && d < 47.68) || (d > 52.32 && d < 52.65)) set([212, 212, 206], snow ? .8 : .88);
  };
  const ground = (x, y, i, j, d, h) => {
    if (d < PL) return plaza(x, y, i, j, d, h);
    if (d < RD0 || (d >= RD1 && d < RD1 + 1)) return curb(h);
    if (d < RD1) return ringRoad(x, y, i, j, d, h);
    if (d < SW1) return conc(h, Math.floor(ringS(x, y, d) * OS), 1);
    lawn(x, y, h, d < TL1 ? 0 : .1);
  };

  // ---------------------------------------------------------------- the plan, bottom layer first
  let seedN = 1;
  const bld = (x0, y0, x1, y1, p, o) => box(x0, y0, x1, y1, p, { kind: 'bld', seed: (seedN++) * 37, ...o });
  const SLATE = [96, 104, 118], SLATE2 = [84, 90, 100], SHING = [108, 100, 94], TILE = [160, 90, 64], COPPER = [92, 142, 122], MEMB = [184, 184, 186], GRAVR = [150, 146, 138];
  // Zones of lawn: the Grove, Fan Fest, the visitors' grove, the quad.
  const GROVE = box(-151, -68, 6, CY - 15, lawnP, { out: TL1, wear: .75 });
  const FANF = box(-62, 58, 44, 124.3, lawnP, { out: TL1, wear: .85 });
  const VGRV = box(110, 38, 170.5, 124.3, lawnP, { out: TL1, wear: .6 });
  const QUAD = box(-130, 76, -82, 117, lawnP, { wear: 0 });
  // Lots, the field, the compound.
  const LOTSE = box(172, 40, 248, 92, lotP, { out: TL1, kind: 'lot' });
  const RVLOT = box(172, 95.5, 248, 124.3, (x, y, i, j, e, h) => { if (e < .34) curb(h); else gravel(x, y, h); }, { kind: 'lot' });
  const PFLD = box(181, -117, 247, 14.5, fieldP, { kind: 'field', F: [187.33, -110, 240.67, 10] });
  const TVC = box(118, -66, 177, -18, gravelP, { out: TL1, kind: 'lot' });
  const LOTN = box(-140, -101, -6, -90.5, lotP, { kind: 'lot' });
  for (const L of [LOTSE, LOTN]){ L.u0 = L.x0 + 11; L.u1 = L.u0 + Math.floor((L.x1 - 11 - L.u0) / 3) * 3; L.m0 = L.y0 + (L === LOTN ? 2.6 : 6); L.rows = Math.max(1, Math.floor((L.y1 - L.m0 - 2) / 19.2 + .08)); }
  LOTN.rows = 1; LOTN.m0 = LOTN.y0 + 2.6;
  // The library's plaza and its reflecting pool; Fan Fest's paved square; the quad's walks and fountain; the Grove's paths.
  box(-136, 41.6, -72.4, 54, plazaP, { kind: 'plaza' });
  box(-119, 44.2, -89, 49.6, water, { kind: 'water' });
  const QW = [[-128, 78], [-84, 78], [-84, 115], [-128, 115]];
  poly([...QW, QW[0]], .9, concWalk);
  seg(-128, 78, -84, 115, .9, concWalk); seg(-84, 78, -128, 115, .9, concWalk); seg(-104, 70, -104, 78, 1.2, concWalk);
  circ(-106, 96.5, 4.4, concWalk, { kind: 'path' }); circ(-106, 96.5, 3.1, water, { kind: 'water' });
  for (const [x, y] of [[-141, 76], [-141, 117]]) seg(x, y, x, y + 3, .8, concWalk);
  poly([[-120, CY + 15], [-96, -6.5], [-49, -42]], 1.15, brickWalk);
  poly([[-96, -68], [-96, -6.5]], 1.15, brickWalk); seg(-150, -36, -96, -6.5, 1.15, brickWalk);
  circ(-96, -6.5, 3.6, brickWalk, { kind: 'path' });
  poly([[-14, 120], [8, 116], [30, 120]], .9, concWalk);
  // Streets: the boulevard and the Walk; the east road; the north and south streets and the avenues off the ring.
  box(-151, CY - 15, -58, CY + 15, (x, y, i, j, e, h, d) => {
    const v = Math.abs(y - CY);
    if (v < 4.4){
      if (v < .4) return granite(h);
      brk(h, i, j);
      const u = (x + 600) % 6;   // bronze plaques down the Walk, a pair every six yards
      if (v > 1.5 && v < 2.7 && u > 2.4 && u < 3.6) set(snow ? [196, 190, 182] : [118, 90, 54], u < 2.75 || v < 1.8 ? 1.22 : 1);
      return;
    }
    if (v < 4.75) return granite(h);
    if (v < 6.9) return lawn(x, y, h, 0);
    if (v < 7.24) return curb(h);
    if (v < 12.1){ asph(x, y, h); if (d < SW1 + .3){ if ((v * 1.5 | 0) & 1) set([226, 226, 222], snow ? .9 : .97); } else if (Math.abs(v - 9.67) < .17 && ((x + 600) % 4) < 2) set([212, 212, 206], snow ? .8 : .9); return; }
    if (v < 12.45) return curb(h);
    conc(h, Math.floor(x * OS), 1);
  }, { out: RD1, kind: 'street' });
  const EST = street(1, CY, 160, 251, { hw: 4.2 });
  const NST = street(1, -78, -151, 166, { hw: 4.4 });
  const SST = street(1, 134, -151, 251, { hw: 4.4 });
  const NAV = street(0, 50, -136, -50, { hw: 4.2 }), SAV = street(0, 50, 105, 189, { hw: 4.2 });
  cross(NST, NAV); cross(SST, SAV);
  circ(166, -78, 10.2, (x, y, i, j, e, h) => { if (e > 2.6) asph(x, y, h); else if (e > 2.26) curb(h); else conc(h, i, j); }, { kind: 'street' });   // the bus loop
  box(156, -82.4, 166, -73.6, (x, y, i, j, e, h) => { const v = Math.abs(y + 78); if (v < 4.4) asph(x, y, h); else if (v < 4.74) curb(h); else conc(h, i, j); }, { kind: 'street' });
  // Buildings. ht in yards for the shadows; the per-pixel pass marks them in the mask so shadows stay off their roofs.
  const blds = [];
  const B = (x0, y0, x1, y1, p, o) => { const s = bld(x0, y0, x1, y1, p, o); blds.push(s); return s; };
  // the library: a copper dome on a stone drum, a pedimented portico to the plaza, slate wings, the bell tower by the plaza
  const LIB = [-104, 65];
  B(-130, 58, -111, 72, gableRoof, { ht: 13, mat: SLATE, par: 1, dorm: 4.2, chim: [[3, -1], [15, 1]] });
  B(-97, 58, -78, 72, gableRoof, { ht: 13, mat: SLATE, par: 1, dorm: 4.2, chim: [[4, 1], [16, -1]] });
  B(-109.5, 51.2, -98.5, 57, gableRoof, { ht: 12, mat: [196, 190, 176], ax: 0 });
  const DRUM = circ(LIB[0], LIB[1], 10.2, flatRoof, { kind: 'bld', ht: 14, mat: [190, 184, 170], seed: 5, sky: false });
  const DOME = circ(LIB[0], LIB[1], 8.6, domeP, { kind: 'bld', ht: 22, mat: COPPER });
  blds.push(DRUM, DOME);
  const TWR = B(-81.5, 44, -75.5, 50, hipRoof, { ht: 44, mat: COPPER, lit: 1 });
  // the quad's halls
  B(-148, 78, -134, 96, gableRoof, { ht: 12, mat: SLATE, par: 1, dorm: 3.6, chim: [[3, 1], [14, -1]] });
  B(-148, 100, -134, 117, gableRoof, { ht: 12, mat: SLATE2, par: 1, dorm: 3.6, chim: [[9, 1]] });
  B(-80, 80, -67.6, 98, gableRoof, { ht: 12, mat: SLATE2, par: 1, dorm: 3.6, chim: [[4, -1]] });
  B(-80, 102, -66.5, 117, hipRoof, { ht: 11, mat: SLATE });
  // past the south street: a science building, a lecture hall, and the houses along it, each a hip or a gable with a drive
  B(-148, 146, -110, 176, flatRoof, { ht: 16, mat: MEMB });
  B(-102, 148, -70, 170, gableRoof, { ht: 13, mat: SLATE, par: 1, dorm: 4, chim: [[5, 1], [26, -1]] });
  const HOUSES = [];
  for (let x0 = -60; x0 < 240; x0 += 24){
    if (Math.abs(x0 + 12 - 50) < 16) continue;
    const k = hash2(x0 | 0, 31), wv = 13 + (k * 4 | 0);
    const mat = [SHING, SLATE, TILE, [120, 112, 104], [92, 96, 104]][(k * 50 | 0) % 5];
    B(x0 + 3, 151, x0 + 3 + wv, 162 + (k > .5 ? 4 : 0), k > .45 ? hipRoof : gableRoof, { ht: 9, mat, chim: k < .45 ? [[3, 1]] : null });
    box(x0 + 3 + wv + .8, 143.6, x0 + 3 + wv + 4, 158, concWalk, { kind: 'path' });   // the drive
    seg(x0 + 3 + wv / 2, 143.6, x0 + 3 + wv / 2, 151, .55, concWalk);   // the front walk
    HOUSES.push([x0, wv]);
  }
  // the north: dorms, the parking deck, the indoor practice facility, the football building
  B(-142, -132, -96, -106, flatRoof, { ht: 15, mat: MEMB });
  B(-86, -132, -40, -106, flatRoof, { ht: 15, mat: GRAVR });
  const DECK = B(4, -133, 39, -91, lotP, { ht: 12, kind: 'bld', deck: 1 });
  DECK.u0 = DECK.x0 + 2; DECK.u1 = DECK.u0 + Math.floor((DECK.x1 - 2 - DECK.u0) / 3) * 3; DECK.m0 = DECK.y0 + 1.6; DECK.rows = 2;
  B(60, -134, 156, -93, vaultP, { ht: 18, mat: [176, 182, 190] });
  B(186, -134, 248, -121, flatRoof, { ht: 10, mat: MEMB });
  // Fan Fest's stage; the TV compound's tents and trucks are sprites
  B(-61, 106, -52, 114, stageP, { ht: 6 });
  // the plaza's own: the spiral ramps (and the bridges up to the bowl), the ticket booths at the gates
  for (const [rx, ry] of RAMPS){
    const s = circ(rx, ry, 5.4, rampP, { kind: 'bld', ht: 20 }); blds.push(s);
    const sg = ry < CY ? 1 : -1, y0 = ry + sg * 4.6, y1 = CY - sg * (HY + BD - .4);
    blds.push(bld(rx - 1.2, Math.min(y0, y1), rx + 1.2, Math.max(y0, y1), flatRoof, { ht: 18, mat: [176, 172, 164], sky: false }));
  }
  for (const [gx, gy, nx, ny, mn] of GATES) for (const sg of [-1, 1]){
    const l = mn ? 13.5 : 11.5, a = 2.6, cx = gx + nx * a - ny * sg * l, cy = gy + ny * a + nx * sg * l, hw = nx ? .9 : 1.4, hh = nx ? 1.4 : .9;
    blds.push(bld(cx - hw, cy - hh, cx + hw, cy + hh, flatRoof, { ht: 3, mat: [214, 212, 206], cop: hc, sky: false }));
  }
  yield;

  // ---------------------------------------------------------------- pass 1: everything on the ground, pixel by pixel
  const mask = A.canvas(W, H), mc = mask.getContext('2d');
  for (let j0 = 0; j0 < H; j0 += 4){
    const j1 = Math.min(H, j0 + 4), band = c.createImageData(W, j1 - j0), D = band.data, mb = mc.createImageData(W, j1 - j0), M = mb.data;
    for (let j = j0; j < j1; j++){
      const y = Y0 + (j + .5) / OS, brow = Math.min(NBY - 1, ((y - Y0) / CELL) | 0) * NBX;
      for (let i = 0; i < W; i++){
        const x = X0 + (i + .5) / OS, d = sd(x, y), h = hash2(i, j), q = ((j - j0) * W + i) * 4;
        em = false;
        if (d < 0){ r = 34; g = 36; b = 42; }
        else if (d < BD) bowl(x, y, i, j, d, h);
        else {
          let hit = null;
          const cell = bins[brow + Math.min(NBX - 1, ((x - X0) / CELL) | 0)];
          for (let k = cell.length - 1; k >= 0; k--){ const s = SHP[cell[k]], e = -s.f(x, y, d); if (e > 0){ hit = s; s.p(x, y, i, j, e, h, d, s); break; } }
          if (!hit) ground(x, y, i, j, d, h);
          if (hit && hit.ht) M[q + 3] = 255;
          else if (LSG && !em && d < BD + LSG + 2){ for (let k = 1; k <= 3; k++) if (sd(x - SD[0] * LSG * k / 3, y - SD[1] * LSG * k / 3) < BD){ r *= .62; g *= .67; b *= .83; break; } }   // the rim's shadow
        }
        if (em){ D[q] = r; D[q + 1] = g; D[q + 2] = b; }
        else { D[q] = r * TM[0] + TM[1]; D[q + 1] = g * TM[2] + TM[3]; D[q + 2] = b * TM[4] + TM[5]; }
        D[q + 3] = 255;
      }
    }
    c.putImageData(band, 0, j0); mc.putImageData(mb, 0, j0);
    yield;
  }
  const rect = (x, y, w, h, col) => { c.fillStyle = col; const a = wx(x), b2 = wy(y); c.fillRect(a, b2, Math.max(1, wx(x + w) - a), Math.max(1, wy(y + h) - b2)); };
  const disc = (cx, cy, rad, col, cc = c) => { cc.fillStyle = col; const px = wx(cx), py = wy(cy), R = Math.max(1, Math.round(rad * OS)); for (let dy = -R; dy <= R; dy++){ const w = Math.floor(Math.sqrt(R * R - dy * dy + .25)); cc.fillRect(px - w, py + dy, 2 * w + 1, 1); } };
  // The field itself, from the real texture, and the logo at midfield.
  c.save(); c.beginPath(); c.rect(wx(-13.3), wy(-6.5), (HX * 2 - .1) * OS, 66.33 * OS); c.clip();
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(art.tex, wx(A.FX0), wy(A.FY0), (A.FX1 - A.FX0) * OS, (A.FY1 - A.FY0) * OS);
  if (night){ c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(176,198,255)'; c.fillRect(0, 0, W, H); }
  c.restore(); c.imageSmoothingEnabled = false;
  {   // at this scale the worn middle reads as a smear: wash it back toward the clean stripes (sampled off the middle); in snow, the swept lines thin
    const sm = c.getImageData(wx(0), wy(5), 100 * OS, 1).data, at2 = x => { const q = Math.round(x * OS) * 4; return `rgb(${sm[q]},${sm[q + 1]},${sm[q + 2]})`; };
    const fw = 100 * OS, fh = Math.round(53.33 * OS), wv = A.canvas(fw, fh), w2 = wv.getContext('2d');
    for (let k = 0; k < 20; k++){ w2.fillStyle = at2(k * 5 + 2.5); w2.fillRect(Math.round((k * 5 + .6) * OS), 0, Math.round(3.8 * OS), fh); }
    w2.globalCompositeOperation = 'destination-in'; w2.setTransform(1, 0, 0, .27, 0, fh / 2 * .73);
    const gr = w2.createRadialGradient(fw / 2, fh / 2, 0, fw / 2, fh / 2, fw * .44); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.7, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    w2.fillStyle = gr; w2.fillRect(0, -fh * 4, fw, fh * 9);
    c.globalAlpha = snow ? .7 : .86; c.drawImage(wv, wx(0), wy(0)); c.globalAlpha = 1;
    if (snow) for (let k = 0; k <= 20; k++){
      const X = wx(k * 5), sn = at2(k ? k * 5 - 2.5 : 2.5); c.fillStyle = sn; c.fillRect(X - 2, wy(0), 5, fh);
      c.fillStyle = night ? 'rgb(120,140,138)' : 'rgb(176,204,178)'; c.fillRect(X, wy(0), 1, fh);
    }
  }
  {   // the practice field's numbers, read from each sideline
    const F = PFLD.F;
    for (let k = 1; k < 10; k++){
      const n = String(k <= 5 ? k * 10 : (10 - k) * 10), y = F[1] + 10 + k * 10, tx = TX.nums[n];
      for (const [x, rot] of [[F[0] + 7.5, -Math.PI / 2], [F[2] - 7.5, Math.PI / 2]]){ c.save(); c.translate(wx(x), wy(y)); c.rotate(rot); c.drawImage(tx, -tx.width >> 1, -tx.height >> 1); c.restore(); }
    }
  }
  yield;

  // ---------------------------------------------------------------- where everything goes
  const cars = [], tents = [], lamps = [], lampsP = [], rvs = [], folk = [], grills = [], flags = [], gear = [], trees = [], buses = [], trucks = [], rails = [];
  let seed = 1;
  const gather = (x, y, w, h, n, vis) => { seed++; for (let k = 0; k < n; k++) folk.push([x + hash2(seed, k * 2) * w, y + hash2(seed, k * 2 + 1) * h, vis]); };
  const carPick = s => { let k = hash2(s * 7919 | 0, 3) * 33, n = 0; while (k >= CARW[n]) k -= CARW[n++]; return n; };
  const CARW = [5, 4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1];
  const tailgate = (x, y, s, vis) => {
    tents.push([x, y, s, vis]); if (s < .3) tents.push([x + 3.5, y, s + .4, vis]);
    grills.push([x + (s < .3 ? 7.4 : 4), y + 1.4]); gear.push([x + .6, y + 3.8, s], [x + 2.2, y + 4.4, s + .3]);
    if (s < .14) gear.push([x + 1, y + 5.6, -1], [x + 4.6, y + 5.6, -1]);   // cornhole boards
    if (hash2(seed, 7) < .45) flags.push([x - .2, y - .3, vis]);
    gather(x - .4, y + 3.4, 8, 3.6, 5 + (s * 14 | 0), vis);
  };
  // Trees: [x, y, radius, kind, palette]. Fall's coming on.
  const leafPal = (s, kind) => kind === 'pine' ? 'pine' : s < .1 ? 'gold' : s < .18 ? 'rust' : s < .24 ? 'amber' : kind === 'oak' ? 'oak' : 'green';
  const tree = (x, y, R, kind, s = hash2(x * 13 | 0, y * 7 | 0)) => trees.push([x, y, R, kind, leafPal(s, kind), s]);
  // the lots: cars nose-in, tailgates in the aisles behind them, light poles on the islands
  for (const L of [LOTSE, LOTN, DECK]){
    for (let row = 0; row < L.rows; row++) for (const off of [0, 13.6]){
      const sy = L.m0 + row * 19.2 + off; if (sy + 5.2 > L.y1 - .5) continue;
      for (let sx = L.u0; sx + 3 <= L.u1 + .01; sx += 3){
        const s = hash2(Math.round(sx * 7) + L.x0, Math.round(sy * 5)), far = Math.max(0, sd(sx, sy) - 60);
        if (s < .98 - far * .0016 - hash2(Math.floor(sx / 12) + L.y0, Math.floor(sy)) * .09) cars.push([sx + 1.5, sy + 2.6, carPick(s), CARK[(s * 977 | 0) % CARK.length], 1, off ? 0 : 1]);
      }
      if (!L.deck && L !== LOTN) for (let sx = L.u0 + 1; sx + 10 <= L.u1; sx += 10.5){ const s = hash2(Math.round(sx) + L.x0, Math.round(sy) + 9); if (s < .58) tailgate(sx + (hash2(sx | 0, 2) - .5) * 1.4, off ? sy - 3.9 : sy + 5.9, s / .58 * .5, false); }
      if (!L.deck && (off === 0 ? 1 : 0)){ lamps.push([L.x0 + 8.4, sy + 2.6]); lamps.push([L.u1 + 2.6, sy + 2.6]); tree(L.x0 + 8.4, sy + (off ? 2.6 : 4.4), 2.6, 'round'); tree(L.u1 + 2.6, sy + (off ? 2.6 : 4.4), 2.4, 'round'); }
    }
    yield;
  }
  // the RV lot: two rows nose to tail, awnings out
  for (const ry of [96.6, 111.6]) for (let rx = 174; rx + 8 < 247; rx += 7.6){
    const s = hash2(Math.round(rx * 3), Math.round(ry)); if (s < .08) continue;
    rvs.push([rx, ry, s]); gather(rx + 3, ry + 2, 3.4, 9, 3 + (s * 6 | 0), false);
    if (s < .55) grills.push([rx + 4.6, ry + 10.6]); else gear.push([rx + 4, ry + 10.4, s]);
    if (s > .6) flags.push([rx + 2.6, ry - .4, false]);
  }
  // street parking on game day, both curbs of the north, south and east streets
  for (const [S2, a0, a1] of [[NST, -146, 110], [SST, -146, 246], [EST, 172, 246]]) for (const side of [-1, 1]) for (let x = a0; x < a1; x += 6.2){
    const cy = S2.c0 + side * (S2.hw - 1.3), s = hash2(Math.round(x * 3), Math.round(cy * 5) + 400);
    if (Math.abs(x - 50) < 12 || s > .82 || !(at(x, cy) === S2)) continue;
    cars.push([x, cy, carPick(s), CARK[(s * 977 | 0) % CARK.length], 0, side > 0 ? 1 : 0]);
  }
  // the team buses in the loop at the north street's end
  for (let k = 0; k < 3; k++) buses.push([116 + k * 14.5, -81.9, k === 2]);
  yield;
  // The Grove: old oaks on a loose grid, tents packed in under and between them, a crowd on its walks.
  for (let gy = -64; gy < CY - 17; gy += 12.5) for (let gx = -146; gx < 4; gx += 12.5){
    const x = gx + (hash2(gx | 0, gy | 0) - .5) * 6, y = gy + (hash2(gy | 0, gx | 0) - .5) * 6, s = hash2(x * 5 | 0, y * 3 | 0);
    if (s > .86 || sd(x, y) < TL1 + 3 || !(at(x, y) === GROVE)) continue;
    tree(x, y, 5 + hash2(x | 0, y | 0) * 2.4, 'oak', s * 2.2);
  }
  for (let ty = -66; ty < CY - 19; ty += 4.4) for (let tx = -149; tx < 4; tx += 4.2){
    const x = tx + (hash2(tx | 0, 5) - .5) * .9, y = ty + (hash2(ty | 0, tx | 0) - .5) * .7, s = hash2(Math.round(tx * 3) + 7, Math.round(ty * 3));
    if (!(at(x, y) === GROVE && at(x + 3.3, y + 3.3) === GROVE)) continue;
    const cl = vn(x * .085 + 3, y * .085 - 2);   // tailgates cluster (a group's tents side by side), lawn open between
    if (cl < .4 || s > .82){ if (hash2(tx | 0, ty | 0) < .3) gather(x, y, 3.6, 3.6, 3, false); continue; }
    tents.push([x, y, s, false]); gather(x - .6, y - .6, 4.6, 4.6, 3 + (s * 5 | 0), false);
    if (s < .2) grills.push([x + 3.5, y + 3.4]); else if (s < .45) gear.push([x + .4, y + 3.6, s]);
    if (s > .62) flags.push([x + 3.4, y - .2, false]);
  }
  gather(-118, -60, 10, 70, 90, false); gather(-150, -40, 56, 34, 60, false);
  // Fan Fest: sponsor tents round the edge, the crowd packed in front of the stage, food trucks along the south walk.
  for (let ty = 58; ty < 122; ty += 5.4) for (let tx = -62; tx < 44; tx += 5.6){
    const x = tx + (hash2(tx | 0, ty | 0) - .5) * 1.2, y = ty + (hash2(ty | 0, tx | 0) - .5) * 1.2, s = hash2(Math.round(tx * 3) + 41, Math.round(ty * 3));
    if (s > .62 || Math.hypot(x + 2.3 + 51, y + 2.3 - 110) < 13 || !(at(x, y) === FANF && at(x + 4.7, y + 4.7) === FANF && at(x + 4.7, y) === FANF)) continue;
    tents.push([x, y, s, false, s < .42 ? 1 : 0]); gather(x - .8, y + 4.4, 6, 2.4, 6, false);
  }
  for (let k = 0; k < 520; k++){ const a = hash2(k, 61) * 2.2 - 1.6, rr = 3 + Math.pow(hash2(k, 62), .7) * 13, x = -51 + Math.cos(a) * rr, y = 110 + Math.sin(a) * rr; if (at(x, y) === FANF) folk.push([x, y, false]); }
  for (let x = -6; x < 40; x += 7.4) trucks.push([x, 119.4, 'food', hash2(x | 0, 77)]);
  gather(-8, 116, 50, 3, 70, false);
  // The visitors' grove: their colors under the trees off the south-east corner.
  for (let gy = 42; gy < 124; gy += 11) for (let gx = 112; gx < 170; gx += 11){
    const x = gx + (hash2(gx | 0, gy | 0 + 3) - .5) * 5, y = gy + (hash2(gy | 0, gx | 0) - .5) * 5, s = hash2(x * 3 | 0, y * 5 | 0);
    if (s > .7 || sd(x, y) < TL1 + 3 || !(at(x, y) === VGRV)) continue;
    tree(x, y, 4 + hash2(x | 0, 3) * 2, 'oak', s * 2.6);
  }
  for (let ty = 40; ty < 122; ty += 4.6) for (let tx = 112; tx < 168; tx += 4.4){
    const s = hash2(Math.round(tx * 3) + 5, Math.round(ty * 3) + 1);
    if (s > .62 || !(at(tx, ty) === VGRV && at(tx + 3.3, ty + 3.3) === VGRV)) continue;
    const vis = s < .5; tents.push([tx, ty, s, vis]); if (s < .12) grills.push([tx + 3.4, ty + 3]); if (s > .5) flags.push([tx + 3.4, ty - .2, vis]);
    gather(tx - .4, ty + 3.2, 4.4, 2.6, 2 + (s * 6 | 0), vis);
  }
  // The quad: an allée round its walks, a few tailgates on the lawn by the halls.
  for (let k = 0; k < QW.length; k++){ const [xa, ya] = QW[k], [xb, yb] = QW[(k + 1) % 4], L = Math.hypot(xb - xa, yb - ya); for (let s = 4; s < L - 2; s += 7.4){ const u = s / L, x = xa + (xb - xa) * u, y = ya + (yb - ya) * u, ox = yb === ya ? 0 : xa < -100 ? 2.6 : -2.6, oy = xb === xa ? 0 : ya < 90 ? 2.6 : -2.6; tree(x + ox, y + oy, 3.2 + hash2(k, s | 0) * .8, 'round', hash2(k + 9, s | 0) * 1.3); } }
  for (let k = 0; k < 16; k++){ const x = -124 + hash2(k, 21) * 38, y = 82 + hash2(k, 22) * 30; if (at(x, y) === QUAD && at(x + 3.3, y + 3.3) === QUAD && Math.abs(x + 106) + Math.abs(y - 96.5) > 10){ tents.push([x, y, hash2(k, 23), false]); gather(x - .5, y + 3.4, 4, 2.4, 4, false); } }
  // The TV compound: production trailers in a row, the uplink trucks, a catering tent, generators; then the practice field's tower and goalposts.
  for (const [x, y] of [[134, -65], [152, -65], [140, -61], [158, -61]]) trucks.push([x, y, 'trailer', 0]);
  trucks.push([158, -51, 'uplink', 0], [164, -45, 'uplink', 1], [168, -37, 'gen', 0]);
  tents.push([169.5, -56, .5, false, 2]); tents.push([169.5, -52.4, .5, false, 2]);
  gather(146, -60, 28, 16, 40, false);
  // The practice field: the band running its pregame show in a block at midfield, sleds down the far sideline.
  const bandBlk = [];
  for (let rw = 0; rw < 10; rw++) for (let cl = 0; cl < 15; cl++) bandBlk.push([209.5 + rw * .95, -57 + cl * .95, rw < 1]);
  const sleds = [[237.6, -86], [237.6, -24]];
  gather(186, -60, 2, 20, 14, false);   // the staff along the near sideline
  // The library's plaza: trees in its corners, a crowd round the pool.
  for (const [x, y] of [[-132, 45.2], [-132, 50.6], [-86.5, 45.2], [-86.5, 50.6]]) tree(x, y, 2.3, 'round', .5);
  gather(-134, 42.4, 58, 11, 110, false);
  // Along the streets and the boulevard: trees in the tree lawns, lamps between them.
  for (let x = -146; x < -62; x += 9){ for (const sg of [-1, 1]){ tree(x + 1, CY + sg * 5.8, 2.8 + hash2(x | 0, sg + 3) * .4, 'round', hash2(x | 0, sg) * .5 + .3); lampsP.push([x + 5.5, CY + sg * 5.8]); } }
  for (const S2 of [NST, SST, EST, NAV, SAV]) for (let a = -150; a < 250; a += 10){
    for (const sg of [-1, 1]){ const v = S2.hw + .34 + S2.tl / 2, x = S2.ax ? a : S2.c0 + sg * v, y = S2.ax ? S2.c0 + sg * v : a; if (at(x, y) !== S2 || sd(x, y) < TL1 + 2) continue; tree(x, y, 2.6 + hash2(a, sg) * .5, 'round', hash2(a + 3, sg) * .45 + .2); }
  }
  // Round the ring's tree lawn: street trees every ten yards, lamps between.
  for (let th = 0, last = -99, acc = 0, prev = onRing(0, (SW1 + TL1) / 2); th < 6.2832; th += .004){
    const p = onRing(th, (SW1 + TL1) / 2); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
    if (acc - last < 10) continue; last = acc;
    const s = at(p[0], p[1]), any = SHP.some(S2 => S2.kind === 'street' && S2.f(p[0], p[1], sd(p[0], p[1])) < 1.5);
    if (any) continue;
    if (Math.round(acc / 10) & 1) tree(p[0], p[1], 2.7, 'round', hash2(acc | 0, 1) * .4 + .2); else lamps.push(p);
  }
  yield;
  // The plaza: trees in the beds, lamp posts with banners, the gates' rails and canopies and crowds, fans everywhere.
  for (let th = 0, last = -99, acc = 0, prev = onRing(0, BD + 13.9); th < 6.2832; th += .004){
    const p = onRing(th, BD + 13.9); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
    if (acc - last < 6.6) continue;
    const d = sd(p[0], p[1]); if (!isBed(p[0], p[1], d - BD, ringS(p[0], p[1], d))) continue;
    last = acc; tree(p[0], p[1], 2.3 + hash2(acc | 0, 5) * .6, 'round', hash2(acc | 0, 2) * .6 + .1);
  }
  for (let k = 0; k < 60; k++){ const th = (k + .5) / 60 * 6.2832, p = onRing(th, BD + 6.3); if (gateLat(p[0], p[1]) > 5 && Math.hypot(p[0] - STAT[0], p[1] - STAT[1]) > 8) lampsP.push(p); }
  const stands = [];
  for (const [gx, gy, nx, ny, main] of GATES){
    const tx = -ny, ty = nx;
    if (main){ for (const sg of [-1, 1]) for (let q = 0; q < 3; q++) tents.push([gx + nx * 2.6 + tx * sg * (6.5 + q * 3.4) - 1.6, gy + ny * 2.6 + ty * sg * (6.5 + q * 3.4) - 1.6, .5, false, 3]); }
    else {
      for (let q = -2; q <= 2; q++) tents.push([gx + nx * 9.5 + tx * q * 3.3 - 1.6, gy + ny * 9.5 + ty * q * 3.3 - 1.6, .5, false, 3]);
      for (let q = -3; q <= 3; q++) rails.push([gx + nx * 12 + tx * q * 2.3, gy + ny * 12 + ty * q * 2.3, nx, ny, 5]);
    }
    for (let q = -3; q <= 3; q++){ const L = main ? 5 : 5 + hash2(gx | 0, q + 9) * 7; for (let s = main ? 1 : 12.4; s < (main ? 1 : 12.4) + L; s += .66) folk.push([gx + nx * s + tx * q * 1.15, gy + ny * s + ty * q * 1.15, false]); }
    for (let k = 0; k < (main ? 140 : 70); k++){ const rr = 4 + Math.pow(hash2(k, gx | 0), 1.4) * 14, lat = (hash2(k + 50, gy | 0) - .5) * (10 + rr * 1.5); folk.push([gx + nx * rr + tx * lat, gy + ny * rr + ty * lat, false]); }
    for (const sg of [-1, 1]) stands.push([gx + nx * 6.5 + tx * sg * 14, gy + ny * 6.5 + ty * sg * 14, nx !== 0]);
  }
  for (let k = 0; k < 1500; k++){   // fans all over the plaza, thickest near the gates
    const th = hash2(k, 401) * 6.2832, p = onRing(th, 29.5 + hash2(k, 402) * 15.5), dg = Math.min(...GATES.map(gt => Math.hypot(p[0] - gt[0], p[1] - gt[1])));
    const d = sd(p[0], p[1]); if (isBed(p[0], p[1], d - BD, ringS(p[0], p[1], d))) continue;
    if (hash2(k, 403) < .3 + .7 * Math.exp(-dg / 16)) folk.push([p[0], p[1], false]);
  }
  for (let k = 0; k < 700; k++){ const x = -150 + hash2(k, 501) * 92, y = CY + (hash2(k, 502) - .5) * 24; if (Math.abs(y - CY) > 4.6 || hash2(k, 503) < .5) folk.push([x, y, false]); }   // down the boulevard toward the gate
  // People walking in to the gates (animated in paintFly): x0, y0, x1, y1, phase, speed, color.
  const walk = [];
  for (let n = 0; n < 260; n++){
    const [gx, gy, nx, ny, main] = GATES[n % 6], tx = -ny, ty = nx, lat = (hash2(n, 1) - .5) * (main ? 22 : 40), dist = 22 + hash2(n, 2) * 30, l1 = lat * .1;
    walk.push(gx + nx * dist + tx * lat, gy + ny * dist + ty * lat, gx + nx * 7 + tx * l1, gy + ny * 7 + ty * l1, hash2(n, 3), .03 + hash2(n, 4) * .03, hash2(n, 6) < .5 ? 0 : hash2(n, 6) < .75 ? 1 : 2);
  }
  // Fill: trees wherever there's open lawn, in clumps (and never on top of anything).
  for (let n = 0; n < 9000; n++){
    const x = X0 + 3 + hash2(n, 91) * (X1 - X0 - 6), y = Y0 + 3 + hash2(n, 17) * (Y1 - Y0 - 6);
    const dens = .1 + hash2(Math.floor(x / 18), Math.floor(y / 18) + 500) * .9; if (hash2(n, 33) > dens * .3) continue;
    const R = 2.6 + hash2(n, 5) * 3, s = at(x, y);
    if (s === GROVE || s === FANF || s === VGRV || s === QUAD || !open(x, y, R * .7)) continue;
    tree(x, y, R, hash2(n, 6) < .18 ? 'pine' : 'oak', hash2(n, 8) * 1.6);
  }
  // The houses' front lawns: a tent or two, the porch crowd.
  for (const [x0, wv] of HOUSES){ const s = hash2(x0, 71); if (s < .7){ tents.push([x0 + 4 + s * 6, 144.6, s, false]); gather(x0 + 3, 144, 12, 5, 8, false); } tree(x0 + 1.5, 147, 3, 'round', s * 1.2); tree(x0 + 12, 178, 4.6, 'oak', hash2(x0, 72) * 1.5); }
  yield;

  // ---------------------------------------------------------------- sprites
  const LK = night ? 2.5 : 1;   // tents and RVs are lit from inside at night
  // the tree crowns: clumps of foliage as a heightfield, each lit as a sphere from the sun, leafy noise, creases between them
  const atlas = new Map();
  const treeSprite = (kind, R, pal, v) => {
    const key = `${kind}${R}${pal}${v}`; let t = atlas.get(key); if (t) return t;
    const n = Math.ceil(R * OS) * 2 + 2, half = n / 2, cv2 = A.canvas(n, n), x2 = cv2.getContext('2d'), im = x2.createImageData(n, n), D = im.data;
    const sv = A.canvas(n, n), s2c = sv.getContext('2d'), si = s2c.createImageData(n, n), SDt = si.data;
    const P = PAL[pal].map(q => tone(...q)), PS = snow ? PAL.snow.map(q => tone(...q)) : null, sd0 = v * 131 + (R * 10 | 0) * 7 + pal.length;
    const cl = [];
    if (kind !== 'pine'){
      const N = 4 + Math.round(R * (kind === 'oak' ? 1.5 : 1.1));
      cl.push([0, 0, R * .6]);
      for (let k = 1; k < N; k++){ const a = hash2(sd0, k) * 6.2832, rc = R * (.32 + hash2(sd0, k + 90) * .2), m = Math.min(R * (.3 + hash2(sd0, k + 50) * .4), R - rc); cl.push([Math.cos(a) * m, Math.sin(a) * m, rc]); }
    }
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++){
      const x = (px + .5 - half) / OS, y = (py + .5 - half) / OS, q = (py * n + px) * 4, hh = hash2(px + sd0 * 3, py + 7);
      let nx = 0, ny = 0, nz = 1, crease = 0;
      if (kind === 'pine'){
        const rr = Math.hypot(x, y), th = Math.atan2(y, x), lim = R * (.8 + .2 * Math.abs(Math.cos(th * 3.5 + v))) * (.92 + hash2(Math.floor((th + 4) * 8), sd0) * .1);
        if (rr > lim) continue;
        const s = rr / lim; nx = x / (rr + .01) * .6; ny = y / (rr + .01) * .6; nz = .8;
        crease = Math.abs(Math.cos(th * 7 + rr * 1.4 + v)) < .25 ? .16 : 0; if (s > .82 && hh < .3) continue;
      } else {
        let z1 = -1, z2 = -1;
        for (const [cx, cy, rc] of cl){ const dx = x - cx, dy = y - cy, qq = 1 - (dx * dx + dy * dy) / (rc * rc); if (qq <= 0) continue; const z = rc * Math.sqrt(qq) + R * .28 * (1 - Math.hypot(cx, cy) / R); if (z > z1){ z2 = z1; z1 = z; nx = dx / rc; ny = dy / rc; nz = Math.sqrt(qq); } else if (z > z2) z2 = z; }
        if (z1 < 0 || (nz < .28 && hh < .4)) continue;   // a ragged, leafy edge
        if (z2 > 0 && z1 - z2 < R * .1) crease = .2;
      }
      const sh = nx * L3[0] + ny * L3[1] + nz * L3[2];
      const lv = sh * .62 + .36 + (hash2((px >> 1) + sd0, (py >> 1) + 3) - .5) * .34 + (hh - .5) * .14 - crease - (nz < .3 ? .1 : 0);
      const ix = clamp(Math.floor(lv * 5), 0, 4), col = PS && nz > .5 && sh > .15 && hh > .2 ? PS[clamp(ix, 1, 4)] : P[ix];
      D[q] = col[0]; D[q + 1] = col[1]; D[q + 2] = col[2]; D[q + 3] = 255; SDt[q] = 16; SDt[q + 1] = 20; SDt[q + 2] = 46; SDt[q + 3] = 255;
    }
    x2.putImageData(im, 0, 0); s2c.putImageData(si, 0, 0);
    t = { c: cv2, s: sv, n }; atlas.set(key, t); return t;
  };
  const sprOf = t => treeSprite(t[3], Math.round(t[2] * 2) / 2, t[4], (t[5] * 4 | 0) & 3);
  for (let k = 0, made = atlas.size; k < trees.length; k++){ sprOf(trees[k]); if (atlas.size - made >= 6){ made = atlas.size; yield; } }
  // cars: each kind in each color, both ways up and both ways across
  const carAtlas = new Map();
  const carSprite = (kind, ci, vert, flip) => {
    const key = `${kind}${ci}${vert}${flip}`; let t = carAtlas.get(key); if (t) return t;
    const tp = CART[kind], L = tp.length, w = vert ? 6 : L, h = vert ? L : 6, cv2 = A.canvas(w, h), x2 = cv2.getContext('2d'), im = x2.createImageData(w, h), D = im.data;
    const q = CARC[ci], snowy = snow ? [236, 240, 248] : null;
    const COL = { b: q, B: q.map(v => v * 1.14 + 6), d: q.map(v => v * .74), r: snowy || q.map(v => v * 1.07 + 4), R: [70, 72, 78], g: [34, 42, 54], G: [90, 108, 128], k: q.map(v => v * .5) };
    for (let rr = 0; rr < L; rr++) for (let cc = 0; cc < 6; cc++){
      const ch = tp[flip ? L - 1 - rr : rr][cc]; if (ch === '.') continue;
      let col = COL[ch]; if (snowy && (ch === 'b' || ch === 'B') && hash2(rr, cc + ci) > .3) col = snowy;
      const tc = tone(...col), px = vert ? cc : (flip ? rr : L - 1 - rr), py = vert ? rr : cc, o = (py * w + px) * 4;
      D[o] = tc[0]; D[o + 1] = tc[1]; D[o + 2] = tc[2]; D[o + 3] = 255;
    }
    x2.putImageData(im, 0, 0); t = { c: cv2, w, h }; carAtlas.set(key, t); return t;
  };
  const [csx, csy] = shv(1.3).map(v => Math.round(v * OS));
  let nc = 0;
  for (const [x, y, ci, kind, vert, flip] of cars){
    const t = carSprite(kind, ci, vert, flip), X = Math.round(wx(x) - t.w / 2), Y = Math.round(wy(y) - t.h / 2);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(X + csx, Y + csy, t.w, t.h); }
    c.drawImage(t.c, X, Y); if ((++nc & 127) === 0) yield;
  }
  for (const [x, y, s] of rvs){   // an RV from above: roof, AC units, windshield; the awning out to its right, striped
    const X = wx(x), Y = wy(y), body = s > .55 ? [236, 232, 222] : [212, 206, 194];
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 3, Y + 1, 8, 32); c.fillRect(X + 16, Y + 5, 2, 20); }
    const aw = [hc, hc, [52, 92, 150], [70, 120, 84], [186, 160, 116], [150, 64, 52]][(s * 71 | 0) % 6], solid = (s * 13) % 1 < .3;
    for (let k = 0; k < 11; k++){ c.fillStyle = T(k & 1 && !solid ? WHITE : aw, LK * (solid && k & 1 ? .92 : 1)); c.fillRect(X + 9, Y + 4 + k * 2, 7, 2); }
    c.fillStyle = T(body, .82); c.fillRect(X, Y, 8, 32); c.fillStyle = T(body, 1.05); c.fillRect(X, Y, 7, 31);
    c.fillStyle = T(body, 1.2); c.fillRect(X + 1, Y + 1, 5, 1);
    c.fillStyle = T([150, 152, 158]); c.fillRect(X + 2, Y + 9, 3, 3); c.fillRect(X + 2, Y + 21, 3, 3);
    c.fillStyle = night ? 'rgb(255,214,140)' : T([40, 54, 72]); c.fillRect(X + 1, Y + 1, 5, 2); if (night){ c.fillRect(X + 7, Y + 8, 1, 2); c.fillRect(X + 7, Y + 16, 1, 2); }
    c.fillStyle = T(hc); c.fillRect(X, Y + 27, 7, 1);
  }
  for (const [x, y, home2] of buses){   // a team bus: a long white roof (the home team's in its color), AC pods, the windshield
    const X = wx(x), Y = wy(y), body = home2 ? hc : [228, 228, 224], L = Math.round(13 * OS), Wd = Math.round(3.2 * OS);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.36)'; c.fillRect(X + 4, Y + 2, L, Wd); }
    c.fillStyle = T(body, .8); c.fillRect(X, Y, L, Wd); c.fillStyle = T(body, 1.04); c.fillRect(X, Y, L, Wd - 1); c.fillStyle = T(body, 1.16); c.fillRect(X, Y, L, 1);
    c.fillStyle = T([150, 152, 158]); c.fillRect(X + 8, Y + 2, 6, Wd - 4); c.fillRect(X + 22, Y + 2, 6, Wd - 4);
    c.fillStyle = night ? 'rgb(255,214,140)' : T([40, 54, 72]); c.fillRect(X + L - 2, Y + 1, 2, Wd - 2);
  }
  for (const [x, y, kind, s] of trucks){
    const X = wx(x), Y = wy(y);
    if (kind === 'trailer'){   // a production trailer: a long white box, roof seams, AC units, the cable trays off its end
      const L = Math.round(16 * OS), Wd = Math.round(3 * OS);
      if (!night){ c.fillStyle = 'rgba(8,10,24,.36)'; c.fillRect(X + 4, Y + 2, L, Wd); }
      c.fillStyle = T([226, 226, 222], .82); c.fillRect(X, Y, L, Wd); c.fillStyle = T([232, 232, 228]); c.fillRect(X, Y, L - 1, Wd - 1);
      c.fillStyle = T([200, 200, 198]); for (let k = 4; k < L; k += 4) c.fillRect(X + k, Y, 1, Wd - 1);
      c.fillStyle = T([150, 152, 158]); c.fillRect(X + 6, Y + 2, 4, Wd - 5); c.fillRect(X + 30, Y + 2, 4, Wd - 5);
      c.fillStyle = T([40, 40, 44]); c.fillRect(X + L, Y + (Wd >> 1), 6, 1);
    } else if (kind === 'uplink'){   // a satellite truck: cab, box, the dish tipped up to the sky
      const L = Math.round(9 * OS), Wd = Math.round(2.8 * OS);
      if (!night){ c.fillStyle = 'rgba(8,10,24,.36)'; c.fillRect(X + 4, Y + 2, L, Wd); }
      c.fillStyle = T([232, 232, 228]); c.fillRect(X, Y, L, Wd); c.fillStyle = T([40, 54, 72]); c.fillRect(X + L - 3, Y + 1, 1, Wd - 2);
      disc(x + 3.4, y + 1.4, 1.9, T([206, 206, 204])); disc(x + 3.1, y + 1.2, 1.4, T([236, 236, 234])); c.fillStyle = T([60, 60, 66]); c.fillRect(wx(x + 3.4), wy(y + 1.4), 1, 1);
    } else if (kind === 'gen'){
      c.fillStyle = 'rgba(8,10,24,.36)'; c.fillRect(X + 3, Y + 1, 12, 6); c.fillStyle = T([60, 66, 60]); c.fillRect(X, Y, 12, 6); c.fillStyle = T([90, 98, 90]); c.fillRect(X, Y, 12, 1);
    } else {   // a food truck: a short colored box, its roof vents, the awning out over the serving window
      const L = Math.round(6.2 * OS), Wd = Math.round(2.4 * OS), body = [[200, 56, 44], [236, 186, 60], [56, 120, 176], [236, 236, 230], [70, 150, 96], [40, 40, 44]][(s * 60 | 0) % 6];
      if (!night){ c.fillStyle = 'rgba(8,10,24,.36)'; c.fillRect(X + 3, Y + 1, L, Wd); }
      c.fillStyle = T(body, .84); c.fillRect(X, Y, L, Wd); c.fillStyle = T(body, 1.05); c.fillRect(X, Y, L - 1, Wd - 1);
      c.fillStyle = T([170, 172, 176]); c.fillRect(X + 4, Y + 2, 3, 2); c.fillRect(X + 10, Y + 2, 2, 2);
      for (let k = 0; k < L - 4; k += 2){ c.fillStyle = T(k & 2 ? WHITE : body, LK * .95); c.fillRect(X + 2 + k, Y - 2, 2, 2); }
      c.fillStyle = night ? 'rgb(255,214,140)' : T([40, 54, 72]); c.fillRect(X + L - 2, Y + 1, 1, Wd - 2);
    }
  }
  yield;
  // tents: a canopy from above, four faces round a peak, the sunlit ones lighter, a valance round the edge
  const TENT = [hc, hc, WHITE, ac, hc, [210, 210, 214], [52, 52, 58]];
  const tentPx = (x, y, s, vis, sp) => {
    const big = sp === 1, n = big ? 14 : 10, hn = n >> 1, X = wx(x), Y = wy(y);
    const q = sp === 2 || sp === 3 ? WHITE : big ? [WHITE, hc, [210, 210, 214], ac][(s * 40 | 0) % 4] : vis ? (s < .3 ? oc : s < .44 ? WHITE : s < .52 ? oa : oc) : TENT[(s * 60 | 0) % TENT.length];
    const q3 = q, val = !sp && (s * 37) % 1 < .3 ? (q === WHITE ? (vis ? oc : hc) : WHITE) : null;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(X + 3, Y + 1, n, n); }
    c.fillStyle = T(q3, .74 * LK); c.fillRect(X, Y, n, n);
    c.fillStyle = T(q, .86 * LK); for (let k = 0; k < hn; k++) c.fillRect(X + k + 1, Y + n - 1 - k, n - 2 - 2 * k, 1);
    c.fillStyle = T(q3, 1.02 * LK); for (let k = 0; k < hn; k++) c.fillRect(X + k, Y + k + 1, 1, n - 2 - 2 * k);
    c.fillStyle = T(q, 1.16 * LK); for (let k = 0; k < hn; k++) c.fillRect(X + k, Y + k, n - 2 * k, 1);
    c.fillStyle = T(q, 1.3 * LK); c.fillRect(X + hn - 1, Y + hn - 1, 2, 2);
    if (big){ c.fillStyle = T(q === WHITE ? hc : WHITE, LK); c.fillRect(X, Y + n - 1, n, 1); }   // its printed valance
    else if (val){ c.fillStyle = T(val, .95 * LK); c.fillRect(X, Y + n - 1, n, 1); c.fillRect(X + n - 1, Y, 1, n); }
  };
  let ntn = 0; for (const [x, y, s, vis, sp] of tents){ tentPx(x, y, s, vis, sp); if ((++ntn & 63) === 0) yield; }
  const GEAR = [[220, 40, 40], [40, 90, 200], WHITE, hc, ac, [60, 150, 80]];
  for (const [x, y, s] of gear){
    if (s < 0){ c.fillStyle = T(WHITE); c.fillRect(wx(x), wy(y), 2, 3); c.fillStyle = T(hc); c.fillRect(wx(x), wy(y) + 1, 2, 1); continue; }
    c.fillStyle = T(GEAR[(s * 97 | 0) % GEAR.length]); c.fillRect(wx(x), wy(y), 2, 1); c.fillStyle = T(WHITE); c.fillRect(wx(x), wy(y) + 1, 2, 1);
    c.fillStyle = T(GEAR[(s * 53 | 0) % GEAR.length], .8); c.fillRect(wx(x) + 3, wy(y), 1, 1); c.fillRect(wx(x) + 5, wy(y) + 1, 1, 1);
  }
  for (const [x, y] of grills){ c.fillStyle = T([34, 34, 38]); c.fillRect(wx(x), wy(y), 2, 2); c.fillStyle = night ? '#ff9a40' : T([90, 88, 86]); c.fillRect(wx(x), wy(y), 1, 1); }
  for (const [x, y, nx, ny, L] of rails){ c.fillStyle = T([150, 152, 158]); for (let s = 0; s < L; s += .66) c.fillRect(wx(x + nx * s), wy(y + ny * s), 1, 1); }   // the queue rails
  for (const [x, y, vert] of stands){   // the concession stands, striped awnings
    const w = vert ? 2.6 : 4.4, h = vert ? 4.4 : 2.6, X = wx(x - w / 2), Y = wy(y - h / 2), pw = Math.round(w * OS), ph = Math.round(h * OS);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 3, Y + 1, pw, ph); }
    for (let k = 0; k < (vert ? ph : pw); k += 2){ c.fillStyle = T(k & 2 ? WHITE : hc, LK); if (vert) c.fillRect(X, Y + k, pw, 2); else c.fillRect(X + k, Y, 2, ph); }
    c.fillStyle = T([60, 60, 66]); if (vert) c.fillRect(X, Y, 1, ph); else c.fillRect(X, Y, pw, 1);
    gather(x - w, y - h, w * 2, h * 2, 10, false);
  }
  {   // the main gate's plaza: a paved circle, flower beds in the home colors, the statue's plinth
    const [x, y] = STAT; disc(x, y, 6, T(snow ? [222, 226, 236] : [188, 180, 164])); disc(x, y, 5, T(snow ? [236, 240, 248] : ac)); disc(x, y, 4.3, T(snow ? [214, 220, 232] : hc, .9)); disc(x, y, 3.4, T(snow ? [222, 226, 236] : [188, 180, 164]));
    for (let k = 0; k < 160; k++){ const a = hash2(k, 31) * 6.2832, rad = 6.6 + hash2(k, 32) * 4; folk.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad, false]); }
  }
  const SH = [hc, hc, hc, WHITE, ac, hc, WHITE, ...NEUT], VSH = [oc, oc, oc, oa, WHITE, NEUT[0]], fcs = SH.map(q => T(q)), vcs = VSH.map(q => T(q)), sk = SKIN.map(q => T(q));
  for (let n = 0; n < folk.length; n++){
    const [x, y, vis] = folk[n], h = hash2(n, 77), X = wx(x), Y = wy(y);
    c.fillStyle = vis ? vcs[(h * vcs.length) | 0] : fcs[(h * fcs.length) | 0]; c.fillRect(X, Y, 1, 1);
    if (h > .7){ c.fillStyle = sk[(h * 50 | 0) % 5]; c.fillRect(X, Y - 1, 1, 1); }
    if ((n & 1023) === 1023) yield;
  }
  for (const [x, y, lead] of bandBlk){ const X = wx(x), Y = wy(y); c.fillStyle = T(lead ? WHITE : hc); c.fillRect(X, Y, 1, 1); if (!lead){ c.fillStyle = T(WHITE); c.fillRect(X - 1, Y, 1, 1); } }   // uniforms, plumes
  for (const [x, y] of sleds){   // a five-man sled: the frame, its pads in the team's color
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(wx(x - .6) + 3, wy(y - 2.2) + 1, Math.round(1.2 * OS), Math.round(4.4 * OS)); }
    rect(x - .6, y - 2.2, 1.2, 4.4, T([60, 62, 68])); for (let k = 0; k < 3; k++) rect(x - 1.1, y - 1.9 + k * 1.45, .8, .9, T(hc));
  }
  yield;

  // ---------------------------------------------------------------- shadows: one layer for everything that stands up
  const SHC = '#10142e', poles = [...lamps.map(p => [p[0], p[1], 7]), ...lampsP.map(p => [p[0], p[1], 5])];
  const GOALS = [[PFLD.F[1], 1], [PFLD.F[3], -1]], FTWR = [184.2, -50];
  if (!night){
    const sh = A.canvas(W, H), s2 = sh.getContext('2d'); s2.fillStyle = SHC;
    const ext = (x, y, w, h, ht) => {   // a box's shadow: its footprint swept along the sun to the roof's height
      const [dx, dy] = shv(ht), P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      s2.fillRect(wx(x), wy(y), wx(x + w) - wx(x), wy(y + h) - wy(y)); s2.fillRect(wx(x + dx), wy(y + dy), wx(x + w) - wx(x), wy(y + h) - wy(y));
      for (let e = 0; e < 4; e++){ const p = P[e], q = P[(e + 1) % 4]; s2.beginPath(); s2.moveTo(wx(p[0]), wy(p[1])); s2.lineTo(wx(q[0]), wy(q[1])); s2.lineTo(wx(q[0] + dx), wy(q[1] + dy)); s2.lineTo(wx(p[0] + dx), wy(p[1] + dy)); s2.fill(); }
    };
    for (const S2 of blds){
      if (S2.R){ const [dx, dy] = shv(S2.ht), n = Math.ceil(Math.hypot(dx, dy) * 2); for (let k = 0; k <= n; k++) disc(S2.cx + dx * k / n, S2.cy + dy * k / n, S2.R * (S2 === DOME ? 1 - k / n * .55 : 1), SHC, s2); }
      else if (S2 === TWR){ ext(S2.x0, S2.y0, S2.x1 - S2.x0, S2.y1 - S2.y0, S2.ht - 6); const [dx, dy] = shv(S2.ht); s2.beginPath(); const [ex, ey] = shv(S2.ht - 6); s2.moveTo(wx(S2.x0 + ex), wy(S2.y0 + ey)); s2.lineTo(wx(S2.x1 + ex), wy(S2.y0 + ey)); s2.lineTo(wx((S2.x0 + S2.x1) / 2 + dx), wy((S2.y0 + S2.y1) / 2 + dy)); s2.lineTo(wx(S2.x0 + ex), wy(S2.y1 + ey)); s2.fill(); }   // the spire's point
      else ext(S2.x0, S2.y0, S2.x1 - S2.x0, S2.y1 - S2.y0, S2.ht);
    }
    yield;
    for (let k = 0; k < trees.length; k++){
      const t = trees[k], spr = sprOf(t), [dx, dy] = shv(2 + t[2] * 1.3), X = wx(t[0]) - spr.n / 2, Y = wy(t[1]) - spr.n / 2;
      for (let q = 1; q <= 3; q++) s2.drawImage(spr.s, Math.round(X + dx * OS * q / 3), Math.round(Y + dy * OS * q / 3));
      if ((k & 127) === 127) yield;
    }
    for (const [x, y, ht] of poles){ const [dx, dy] = shv(ht), n = Math.ceil(Math.hypot(dx, dy) * OS); for (let k = 0; k <= n; k++) s2.fillRect(wx(x + dx * k / n), wy(y + dy * k / n), 1, 1); }
    for (const [x, y] of LT){   // the light towers: a long thin pole's shadow, the lamp bank's at its end
      const [dx, dy] = shv(46), n = Math.ceil(Math.hypot(dx, dy) * OS); for (let k = 0; k <= n; k++) s2.fillRect(wx(x + dx * k / n), wy(y + dy * k / n), 2, 2);
      s2.fillRect(wx(x + dx) - 12, wy(y + dy) - 5, 24, 10);
    }
    for (const [gy, sg] of GOALS){ const [dx, dy] = shv(10), x0 = (PFLD.F[0] + PFLD.F[2]) / 2; for (let k = 0; k <= 30; k++){ s2.fillRect(wx(x0 - 3.1 + dx * k / 30), wy(gy + dy * k / 30), 1, 1); s2.fillRect(wx(x0 + 3.1 + dx * k / 30), wy(gy + dy * k / 30), 1, 1); } const [ex, ey] = shv(3.3); s2.fillRect(wx(x0 - 3.1 + ex), wy(gy + ey), Math.round(6.2 * OS), 1); }
    { const [dx, dy] = shv(9); ext(FTWR[0] - 1.2, FTWR[1] - 1.2, 2.4, 2.4, 9); s2.fillRect(wx(FTWR[0] + dx) - 4, wy(FTWR[1] + dy) - 4, 8, 8); }
    yield;
    s2.globalCompositeOperation = 'destination-out'; s2.drawImage(mask, 0, 0); s2.globalCompositeOperation = 'source-over';
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.rect(wx(-13.3), wy(-6.5), (HX * 2) * OS, 66.33 * OS); c.clip('evenodd');
    c.globalAlpha = noon ? .3 : .37; c.drawImage(sh, 0, 0); c.restore();
    yield;
  }
  // ---------------------------------------------------------------- what stands over the ground
  for (let k = 0; k < trees.length; k++){ const t = trees[k], spr = sprOf(t); c.drawImage(spr.c, wx(t[0]) - spr.n / 2, wy(t[1]) - spr.n / 2); if ((k & 127) === 127) yield; }
  // lamp posts (the plaza's and the boulevard's fly the home team's banners), flags
  for (const [x, y] of lampsP){ rect(x - .35, y - .35, .7, .7, T([60, 60, 66])); c.fillStyle = T(hc); c.fillRect(wx(x) + 2, wy(y) - 1, 2, 4); c.fillStyle = T(ac); c.fillRect(wx(x) + 2, wy(y) - 1, 2, 1); }
  for (const [x, y] of lamps) rect(x - .3, y - .3, .6, .6, T([60, 60, 66]));
  for (const [x, y, vis] of flags){
    const X = wx(x), Y = wy(y), q = vis ? oc : hc;
    if (!night){ const [dx, dy] = shv(4); c.fillStyle = 'rgba(8,10,24,.32)'; for (let k = 1; k <= 6; k++) c.fillRect(X + Math.round(dx * OS * k / 6), Y + Math.round(dy * OS * k / 6), 1, 1); }
    c.fillStyle = T([200, 200, 206]); c.fillRect(X, Y, 1, 1); c.fillStyle = T(q, 1.05); c.fillRect(X + 1, Y - 1, 3, 2); c.fillStyle = T(vis ? oa : ac); c.fillRect(X + 1, Y, 3, 1);
  }
  {   // the practice field's goalposts and its filming tower
    const x0 = (PFLD.F[0] + PFLD.F[2]) / 2;
    for (const [gy] of GOALS){ c.fillStyle = T([236, 200, 60]); c.fillRect(wx(x0 - 3.1), wy(gy), Math.round(6.2 * OS), 1); c.fillRect(wx(x0) - 1, wy(gy) - 1, 2, 3); }
    rect(FTWR[0] - 1.2, FTWR[1] - 1.2, 2.4, 2.4, T([110, 112, 118])); rect(FTWR[0] - .9, FTWR[1] - .9, 1.8, 1.8, T([150, 152, 158])); c.fillStyle = T([40, 40, 46]); c.fillRect(wx(FTWR[0]), wy(FTWR[1]), 1, 1);
  }
  {   // the statue on its plinth, in bronze, looking down the Walk
    const [x, y] = STAT;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; const [dx, dy] = shv(4); for (let k = 0; k <= 4; k++) c.fillRect(wx(x + dx * k / 4) - 3, wy(y + dy * k / 4) - 3, 6, 6); }
    rect(x - 1.4, y - 1.4, 2.8, 2.8, T([150, 146, 140])); rect(x - 1, y - 1, 2, 2, T([186, 182, 174])); disc(x, y, .7, T([128, 92, 52])); c.fillStyle = T([176, 136, 80]); c.fillRect(wx(x) - 1, wy(y) - 1, 1, 1);
  }
  // The gates (an opening in the wall under an awning, the turnstiles) and the big banner over the main one.
  for (const [gx, gy, nx, ny, main] of GATES){
    const hw = main ? 6 : 4, a0 = nx ? [gx - (nx > 0 ? 1.8 : 0), gy - hw, 1.8, hw * 2] : [gx - hw, gy - (ny > 0 ? 1.8 : 0), hw * 2, 1.8];
    rect(...a0, T([26, 26, 32])); const aw = nx ? [gx + (nx > 0 ? 0 : -.9), gy - hw - .4, .9, hw * 2 + .8] : [gx - hw - .4, gy + (ny > 0 ? 0 : -.9), hw * 2 + .8, .9]; rect(...aw, T(hc, LK * .9));
    for (let q = -3; q <= 3; q++) rect(gx - nx * .9 + (nx ? 0 : q * 1.2) - .15, gy - ny * .9 + (ny ? 0 : q * 1.2) - .15, .3, .3, T([150, 150, 156]));
  }
  {
    const bx = CX - HX - BD + 1.8, X = wx(bx), Y = wy(CY - 12), bw = Math.round(3.1 * OS), bh = Math.round(24 * OS);
    c.fillStyle = T(ac, LK * .9); c.fillRect(X, Y - 1, bw, bh + 2); c.fillStyle = T(hc, LK * .9); c.fillRect(X + 1, Y + 1, bw - 2, bh - 2);
    c.fillStyle = T(hc, LK * .62); for (let k = 6; k < bh - 4; k += 9) c.fillRect(X + 1, Y + k, bw - 2, 1);
  }
  yield;
  // The light towers off the four corners: a bank of lamps on a pole.
  for (const [x, y] of LT){
    const X = wx(x) - 12, Y = wy(y) - 5;
    c.fillStyle = 'rgba(8,10,24,.4)'; c.fillRect(X + 3, Y + 3, 24, 10);
    c.fillStyle = T([70, 74, 84]); c.fillRect(X, Y, 24, 10); c.fillStyle = T([110, 114, 124]); c.fillRect(X, Y, 24, 1);
    c.fillStyle = night ? '#fffbe8' : T([220, 222, 226]); for (let k = 0; k < 6; k++){ c.fillRect(X + 2 + k * 4, Y + 2, 2, 2); c.fillRect(X + 2 + k * 4, Y + 6, 2, 2); }
  }
  // The ribbon boards' team name along the fascia.
  const tx = TX.fas;
  const fas = (x, y, rot) => { c.save(); c.translate(wx(x), wy(y)); c.rotate(rot); c.drawImage(tx, -tx.width >> 1, -tx.height >> 1); c.restore(); };
  for (const sx of [-14, 22, 58, 94]){ fas(sx + 6, CY - HY - 25.9, 0); fas(sx + 6, CY + HY + 25.9, Math.PI); }
  fas(CX + HX + 25.9, CY, Math.PI / 2); fas(CX - HX - 25.9, CY, -Math.PI / 2);
  yield;
  // The weather's grade over all of it (the game's own multiply).
  c.globalCompositeOperation = 'multiply';
  if (rain){ c.fillStyle = 'rgb(176,186,206)'; c.fillRect(0, 0, W, H); } else if (fog){ c.fillStyle = 'rgb(214,218,226)'; c.fillRect(0, 0, W, H); } else if (snow){ c.fillStyle = 'rgb(222,228,242)'; c.fillRect(0, 0, W, H); }
  c.globalCompositeOperation = 'source-over';
  yield;
  // Night: the lamps, the windows' light spilling out, the stage, the compound, the towers' flare and beams, the bowl's glow.
  const glow = (X, Y, rad, a, col) => { const gr = c.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.35, `rgba(${col},${a * .35})`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(X - rad, Y - rad, rad * 2, rad * 2); };
  if (night){
    c.globalCompositeOperation = 'screen';
    for (let k = 0; k < 10; k++){ c.strokeStyle = `rgba(170,205,255,${.2 * Math.pow(1 - k / 10, 2)})`; c.lineWidth = 2.6 * OS; ringLine(c, k * 2.3 + 29); }
    for (const [x, y] of LT){
      const gx = wx(CX) - wx(x), gy = wy(CY) - wy(y), L = Math.hypot(gx, gy), nx = -gy / L, ny = gx / L, X = wx(x), Y = wy(y), R = 30 * OS;
      const gr = c.createLinearGradient(X, Y, X + gx * .9, Y + gy * .9); gr.addColorStop(0, 'rgba(215,232,255,.12)'); gr.addColorStop(1, 'rgba(215,232,255,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + gx * .9 + nx * R, Y + gy * .9 + ny * R); c.lineTo(X + gx * .9 - nx * R, Y + gy * .9 - ny * R); c.fill();
      glow(X, Y, 34 * OS, .85, '200,225,255');
    }
    for (const [x, y] of lamps) glow(wx(x), wy(y), 10 * OS, .4, '255,214,140');
    for (const [x, y] of lampsP) glow(wx(x), wy(y), 7 * OS, .34, '255,222,160');
    const wg = K.makeGlow(); c.globalAlpha = .5;   // lanterns under the tents, the stands and trucks lit up
    for (let n = 0; n < tents.length; n += 2){ const [x, y] = tents[n], R = 5 * OS; c.drawImage(wg, wx(x + 1.6) - R, wy(y + 1.6) - R, R * 2, R * 2); }
    for (const [x, y] of stands){ const R = 6 * OS; c.drawImage(wg, wx(x) - R, wy(y) - R, R * 2, R * 2); }
    for (const [x, y] of trucks){ const R = 6 * OS; c.drawImage(wg, wx(x + 3) - R, wy(y + 1) - R, R * 2, R * 2); }
    c.globalAlpha = 1; for (const [x, y] of GATES) glow(wx(x), wy(y), 14 * OS, .5, '255,220,160');
    for (const S2 of blds){ if (S2.ht < 6) continue; const x = S2.R ? S2.cx : (S2.x0 + S2.x1) / 2, y = S2.R ? S2.cy : (S2.y0 + S2.y1) / 2, w = S2.R ? S2.R * 2 : Math.max(S2.x1 - S2.x0, S2.y1 - S2.y0); glow(wx(x), wy(y), w * OS * .72, .15, '255,210,140'); }
    glow(wx(-52), wy(110), 16 * OS, .5, '200,170,255');   // Fan Fest's stage lights
    glow(wx(140), wy(-44), 18 * OS, .32, '220,230,255');   // the compound's work lights
    c.globalCompositeOperation = 'source-over';
    for (const [x, y] of lamps){ c.fillStyle = '#fff4cc'; c.fillRect(wx(x), wy(y), 2, 2); }
    for (const [x, y] of lampsP){ c.fillStyle = '#ffe9b8'; c.fillRect(wx(x), wy(y), 2, 2); }
    c.fillStyle = '#fffbe8'; for (const [x, y] of LT) for (let k = 0; k < 6; k++){ c.fillRect(wx(x) - 10 + k * 4, wy(y) - 3, 2, 2); c.fillRect(wx(x) - 10 + k * 4, wy(y) + 1, 2, 2); }
  }
  // The video boards, lit in the home team's colors (the far end's the big one).
  const board = (x, y, w, h, vert, big) => {
    const bc = A.canvas(Math.round((vert ? h : w) * OS), Math.round((vert ? w : h) * OS)), b2 = bc.getContext('2d'), bw = bc.width, bh = bc.height;
    b2.fillStyle = '#14141a'; b2.fillRect(0, 0, bw, bh);
    const gr = b2.createLinearGradient(0, 0, bw, bh); gr.addColorStop(0, A.css(hc.map(v => v * 1.15))); gr.addColorStop(1, A.css(hc.map(v => v * .55)));
    b2.fillStyle = gr; b2.fillRect(1, 1, bw - 2, bh - 2);
    b2.fillStyle = A.css(ac); b2.fillRect(1, 1, bw - 2, 2); b2.fillRect(1, bh - 3, bw - 2, 2);
    const bt = big ? TX.b12 : TX.b8; b2.drawImage(bt, (bw - bt.width) >> 1, (bh - bt.height) >> 1);
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
  const clouds = yield* K.makeClouds(cond);
  yield;
  const jets = K.makeJets(hc, ac, night), b2 = K.makeB2(night);
  yield;
  return { c: cv, towers: LT, lamps, lampsP, sparks, lanes, tower: [(TWR.x0 + TWR.x1) / 2, (TWR.y0 + TWR.y1) / 2], night, noon, snow, rain, fog, hc, ac, bg: T(snow ? [226, 232, 244] : [76, 126, 56]), name,
    clouds, jets, b2, glow: K.makeGlow(), walk: Float32Array.from(walk), smoke: Float32Array.from(grills.flat()), wc: [T(hc), T(WHITE), T(NEUT[0])],
    band: [T(hc, LK * .9), T(WHITE, LK * .9), T(ac, LK * .9)], smc: night ? 'rgb(120,124,140)' : 'rgb(226,226,230)', fx: Array.from({ length: 150 }, (_, i) => [hash2(i, 1), hash2(i, 2), .55 + hash2(i, 3) * .6, hash2(i, 4)]) };
  function ringLine(cc, dd){ const x = CX - HX - dd, y = CY - HY - dd, w = (HX + dd) * 2, h = (HY + dd) * 2; cc.beginPath(); if (cc.roundRect) cc.roundRect(wx(x), wy(y), w * OS, h * OS, (RC + dd) * OS); else cc.rect(wx(x), wy(y), w * OS, h * OS); cc.stroke(); }
}
