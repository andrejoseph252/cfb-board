/* Doak Campbell Stadium (Bobby Bowden Field, Florida State's home) for the pregame flyover: the stadium's own bake of
   the overview, in place of the generic campus when the Seminoles are at home (flyover.js STADIUMS).

   Laid out from the real thing, turned into the game's frame (the field runs north-west to south-east, so +x is the
   north end, -x the south end, -y the west side, +y the east side; the afternoon sun comes from the south-west, as the
   game's shadows have it) and squeezed a little beyond the field so the neighbors fit.

   The stadium: the bowl, both sidelines under tall upper decks, the press box atop the west side, skyboxes atop the
   east, the Champions Club's covered terrace over the south end, the big board over the north end; all of it wrapped in
   the University Center's red-brick collegiate gothic arcade (its outer face folded down flat, the pixel-art
   elevation: buttresses, pointed windows, the legends' banners, great arched gates between battlemented towers).

   Round it, painted pixel by pixel like the bowl (every surface a shape with a material, lit by the same sun, run
   through the same tone curve): the plaza at the arcade's foot, its beds of sabal palms and crape myrtles; Champions
   Way looping round the south half; out the south gate the Unconquered (Osceola on Renegade, his spear lit) on its
   plaza at the head of Langford Green, Fan Fest on the green, the Marching Chiefs coming up its walk; tailgates under
   the live oaks and their Spanish moss to the south-west, the RV lot south-east; lots down both sides; north of the
   Moore Athletic Center the Bowden statue, the practice field, the Sod Cemetery, the Dunlap indoor practice facility,
   the TV compound, and Dick Howser Stadium off the north-east corner. */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rr = (x, y, x0, x1, y0, y1, r) => { const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
const GAR = [120, 47, 64], GLD = [206, 184, 136], WHITE = [240, 238, 230];
const BRICK = [[150, 70, 50], [132, 60, 44], [168, 84, 60], [116, 52, 40]], STONE = [214, 198, 166], STONE2 = [178, 162, 134], GLASS = [44, 54, 72];
const PAVE = [[150, 82, 62], [160, 92, 70], [140, 76, 58], [166, 98, 74]];
const SLATE = [96, 104, 118], SLATE2 = [84, 90, 100], TILE = [156, 84, 60], MEMB = [184, 184, 186];
// The shapes (yards): the pit (field and wall), the bowl's outer edge, the University Center's outer face, its wings.
const PIT = [-13.3, 113.3, -6.33, 59.67, 4], BOWL = [-58, 146, -50, 103.3, 34], UC = [-74, 178, -78, 131.3, 24];
const WINGS = [[-30, 8, -94, -76], [86, 128, -94, -76], [-46, 6, 129, 146], [88, 140, 129, 146]];
const sdP = (x, y) => rr(x, y, ...PIT), sdB = (x, y) => rr(x, y, ...BOWL);
const sdU = (x, y) => { let d = rr(x, y, ...UC); for (const w of WINGS) d = Math.min(d, rr(x, y, w[0], w[1], w[2], w[3], 1)); return d; };
// How far along the arcade (for the plaza's beds): x down the sides, y across the ends, arc length round the corners.
const UCX = (UC[0] + UC[1]) / 2, UCY = (UC[2] + UC[3]) / 2, UHX = (UC[1] - UC[0]) / 2 - UC[4], UHY = (UC[3] - UC[2]) / 2 - UC[4];
const ucS = (x, y, d) => { const qx = Math.abs(x - UCX) - UHX, qy = Math.abs(y - UCY) - UHY; return qx <= 0 ? x : qy <= 0 ? y : Math.atan2(qy, qx) * (UC[4] + d); };
const STAT = [-104, 26.667], HOME = [206, 150], PX = [12, 88];   // the Unconquered; home plate at Howser; the press box's run
const LG = [-150, -8, -116, 61];   // Langford Green (x0, y0, x1, y1)
// Champions Way: up the west side from Stadium Drive, round the south end, down the east side to Pensacola Street.
const CW = [[176, -131], [176, -113], [173, -107], [167, -104], [-60, -104], [-72, -101], [-81, -94], [-87, -82], [-87, 135], [-81, 147], [-72, 155], [-60, 158], [148, 158], [158, 160], [165, 166], [168, 174], [168, 188]];
// Cars as a real lot has them: mostly white, black, gray and silver, a few colors.
const CARC = [[234, 234, 230], [222, 224, 224], [28, 30, 34], [42, 44, 48], [132, 134, 138], [172, 174, 178], [152, 154, 158], [38, 54, 92], [148, 34, 32], [88, 92, 98], [50, 72, 58], [192, 182, 156], [66, 100, 142], [118, 26, 30]];
const CARW = [5, 4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1];
// Cars from above, 6 px across, nose up: b body, B its sunlit side, d its shaded side, r the roof, R roof rails, g glass, G a glint, k a truck bed.
const CART = {
  sedan: ['.bbbb.', 'Bbbbbd', 'Bbbbbd', 'Bbbbbd', 'GggggG', '.gggg.', 'Brrrrd', 'Brrrrd', 'Brrrrd', '.gggg.', 'Bbbbbd', 'Bbbbbd', '.bbbb.'],
  suv: ['.bbbb.', 'Bbbbbd', 'Bbbbbd', 'GggggG', '.gggg.', 'BRrrRd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'BRrrRd', '.gggg.', 'Bbbbbd', '.bbbb.'],
  pickup: ['.bbbb.', 'Bbbbbd', 'Bbbbbd', 'Bbbbbd', 'GggggG', '.gggg.', 'Brrrrd', '.gggg.', 'Bkkkkd', 'Bkkkkd', 'Bkkkkd', 'Bkkkkd', 'bbbbbd'],
  van: ['.bbbb.', 'Bbbbbd', 'GggggG', '.gggg.', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', 'Brrrrd', '.gggg.', '.bbbb.']
};
const CARK = ['sedan', 'sedan', 'sedan', 'suv', 'suv', 'suv', 'pickup', 'pickup', 'van'];
// North Florida's trees, five tones each, dark to lit: live oaks (evergreen, dusky), longleaf pines, sabal palms,
// magnolias (dark and glossy), crape myrtles, the odd sweetgum turning.
const PAL = {
  live: [[30, 44, 30], [40, 58, 36], [52, 72, 42], [68, 90, 50], [90, 110, 62]],
  pine: [[22, 40, 32], [30, 54, 40], [42, 70, 48], [58, 88, 58], [80, 108, 70]],
  palm: [[42, 68, 32], [60, 92, 38], [82, 116, 46], [108, 140, 56], [146, 170, 76]],
  mag: [[16, 36, 26], [24, 50, 34], [34, 66, 42], [50, 86, 54], [84, 118, 80]],
  myrtle: [[40, 62, 34], [54, 80, 40], [70, 98, 46], [92, 118, 56], [116, 138, 70]],
  green: [[32, 54, 30], [44, 72, 36], [58, 90, 42], [78, 110, 50], [102, 132, 62]],
  gum: [[78, 34, 26], [110, 48, 30], [146, 70, 38], [176, 100, 52], [204, 140, 76]],
  gold: [[74, 58, 26], [104, 82, 32], [140, 110, 42], [174, 140, 56], [200, 172, 84]],
  snow: [[150, 160, 182], [178, 188, 208], [204, 212, 228], [224, 230, 242], [242, 246, 252]]
};
const MOSS = [[78, 88, 72], [98, 108, 90], [120, 128, 106], [140, 146, 122]];
// The Unconquered from the side (pixel-art elevation, as the arcade is): Osceola on Renegade rearing, the spear raised.
// T the spear's point (its fire is lit per frame), S the shaft, F the feathers, h/L/B/b bronze from lit to dark.
const UNC = [
  '.....T..............',
  '......S...F.........',
  '.......S.bh.........',
  '...hb...SBb.........',
  '..hBBb...Lb.........',
  '.hBb.Bb.LBBb........',
  '.b...LBbLBBBb.......',
  '.....LLBBBBBBBb.....',
  '..Lb.bLLBBBBBBBBb...',
  '.LB...bLBBBBBBBBBbb.',
  '.b.....bBBBBBBBBb.Bb',
  '........bBb...bBb..b',
  '.........Bb....Bb...',
  '........bB.....bB...',
  '........Bb......Bb..',
  '.......bBB.....bBB..'
];

export function* doakOverview(K, home, away, cond, art){
  const { A, OS, X0, Y0, W, H, CX, CY } = K, { hash2 } = A;
  const X1 = X0 + W / OS, Y1 = Y0 + H / OS;
  const night = cond.time === 'night', noon = cond.time === 'noon', snow = cond.sky === 'snow', rain = cond.sky === 'rain', fog = cond.sky === 'fog';
  const cv = A.canvas(W, H), c = cv.getContext('2d');
  const TM = night ? [.27, 0, .32, 0, .52, 0] : noon ? [1.04, 4, 1.04, 4, 1.02, 4] : [1.04, 7, 1.01, 3, .9, 0];
  const tone = (r, g, b) => [r * TM[0] + TM[1], g * TM[2] + TM[3], b * TM[4] + TM[5]];
  const T = (q, k = 1) => A.css(tone(q[0] * k, q[1] * k, q[2] * k));
  const SD = noon ? [.6, .5] : [.93, .37], LSR = night ? 0 : noon ? 9 : 34;
  const shv = ht => noon ? [.14 * ht * .9, .18 * ht * .9] : [.95 * ht * .85, .38 * ht * .85];
  // Toward the sun: flat (roof faces) and in 3D (domes, vaults, the trees' crowns).
  const LL = Math.hypot(SD[0], SD[1]), LX = -SD[0] / LL, LY = -SD[1] / LL, FS = night ? .07 : noon ? .1 : .2;
  const LZ = noon ? 2.4 : 1.05, L3n = Math.hypot(SD[0], SD[1], LZ), L3 = [-SD[0] / L3n, -SD[1] / L3n, LZ / L3n];
  const wx = x => Math.round((x - X0) * OS), wy = y => Math.round((y - Y0) * OS);
  const oc = A.hex(away.color), oa = A.hex(away.alt || '#f4f4f4');
  let r = 0, g = 0, b = 0, em = false, tall = false;
  const set = (q, k = 1) => { r = q[0] * k; g = q[1] * k; b = q[2] * k; };
  const mul = k => { r *= k; g *= k; b *= k; };
  const NEUT = K.NEUT, SKIN = K.SKIN;
  const vn = (x, y) => {   // value noise
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = hash2(i, j), b2 = hash2(i + 1, j), c2 = hash2(i, j + 1), d2 = hash2(i + 1, j + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b2 - a) * ux + (c2 - a) * uy + (a - b2 - c2 + d2) * ux * uy;
  };

  // The lettering first (reading a canvas back waits on everything drawn before it, so before there's anything).
  const TX = { nums: {} };
  for (const [k, txt, z, col] of [['fs', 'FLORIDA STATE', 6, '#f4f0e0'], ['bb', 'BOBBY BOWDEN FIELD', 6, '#f4f0e0'], ['nb', 'SEMINOLES', 12, '#f4ead0'], ['sb', 'FLORIDA STATE', 8, '#f4ead0']]){ TX[k] = K.pixText(txt, z, col); yield; }
  TX.ez = K.pixText('SEMINOLES', 6, '#d8c48e'); yield;
  for (const n of ['10', '20', '30', '40', '50']){ TX.nums[n] = K.pixText(n, 6, T(snow ? [200, 208, 220] : [232, 234, 226])); yield; }

  // ---------------------------------------------------------------- the bowl
  const fan = (h, h2, vis) => {   // a fan's shirt: garnet, gold, white, the odd neutral; the visitors in their own
    if (vis) set(h < .7 ? oc : h < .85 ? WHITE : NEUT[(h2 * 6) | 0], .86 + h2 * .28);
    else set(h < .5 ? GAR : h < .72 ? GLD : h < .84 ? WHITE : NEUT[(h2 * 6) | 0], .86 + h2 * .28);
  };
  // The sun over the rim: the stands nearest the west and south rims sit in its shadow (the sides' rims stand tallest).
  const shaded = (x, y, t, hr) => { for (let s = 2.5; s <= LSR * hr; s += 3.2) if (sdB(x - SD[0] * s, y - SD[1] * s) > 0) return s < LSR * hr * (1 - t * .85); return false; };
  const bowl = (x, y, i, j, d, dOut, h) => {
    const t = d / (d + dOut), qx = Math.abs(x - CX) - 59.3, qy = Math.abs(y - CY) - 29, sa = Math.atan2(Math.max(qy, 0), Math.max(qx, 0)) / 1.5708;
    const side = sa > .62, north = x > CX, h2 = hash2(j * 3 + 11, i * 5 + 7);
    // where the stairs fall: every 5.6 yd down the sides and across the ends, on rays through the corners
    const st = qx <= 0 ? ((x + 280) % 5.6) / 5.6 : qy <= 0 ? ((y + 280) % 5.6) / 5.6 : (Math.atan2(qy, qx) / 1.5708 * 8) % 1;
    const stair = st < .075, vis = !north && y < 8 && !side && x < -2;   // the visitors: the south end's west corner
    const chiefs = !north && !side && y > 44 && x < -4 && t < .36;   // the Marching Chiefs, in a block across the way
    let lb = .82, k = 1, top = 1;
    const rows = (d0, step, dark) => {   // seat rows stepping up: risers, heads, shirts; the stairs between sections
      const row = ((d - d0) * OS) | 0, rq = row % 3;
      if (stair) set(row & 1 ? [160, 158, 152] : [128, 126, 122]);
      else if (rq === 2) set(dark);
      else if (chiefs){ if (rq === 0 && (i & 1)) set(WHITE, .95); else set((i + (row >> 1)) & 1 ? GAR : GLD, .92 + h2 * .16); }   // garnet uniforms, gold capes, white plumes
      else if (rq === 0 && h < step) set(SKIN[(h2 * 5) | 0], .95);
      else fan(h, h2, vis);
    };
    if (d < .8) set(GAR, d < .3 ? 1.25 : .75);   // the padded wall
    else if (d < 1.5) set([62, 62, 70]);
    else if (side){
      if (t < .4){   // the lower bowl, a cross aisle a third of the way up with its tunnels
        if (t > .2 && t < .235){ set([150, 148, 142]); if (st > .46 && st < .54) set([40, 40, 48]); }
        else if (t > .13 && t < .2 && ((qx <= 0 ? (x + 280) / 5.6 : 0) | 0) % 3 === 1 && st > .3 && st < .7) set(st < .36 || st > .64 ? [118, 116, 110] : [22, 22, 28]);
        else rows(1.5, .8, [40, 40, 50]);
        lb = .9 - t * .3; if (t > .33) k = 1 - (t - .33) / .07 * .4;   // under the club level's overhang
      } else if (t < .53){   // the club level: its concourse, the suites' glass (lit at night), their roof
        const f = (((qx <= 0 ? x : y) + 280) % 1.6) / 1.6;
        if (t < .43) set([150, 148, 142]);
        else if (t < .5){ if (f < .12) set([92, 92, 100]); else if (night && h > .15){ set([255, 214, 140]); em = true; } else set(t < .465 ? [96, 126, 150] : [46, 56, 72]); }
        else set(f < .12 ? [96, 96, 104] : [132, 130, 136]);
        lb = .62;
      } else if (t < .575){   // the upper deck's fascia: a garnet band, gold pinstripes, the ribbon board in it
        set(t < .535 || t > .568 ? GLD : GAR, t < .535 || t > .568 ? .9 : 1); if (night){ em = true; r *= 1.25; g *= 1.2; b *= 1.25; }
      } else if (t < .965){   // the upper deck: steeper rows, a walkway halfway up
        if (t > .76 && t < .78) set([150, 148, 142]); else rows(0, .55, [46, 46, 56]);
        lb = .64 + (t - .575) * .3; top = 1.25;
      } else { set(t > .985 ? STONE : [96, 92, 90]); lb = .9; }   // the rim's cast-stone cap
    } else if (north){
      if (t < .86){   // the north end: one tall tier up to the board
        if (t > .44 && t < .47) set([150, 148, 142]); else rows(1.5, .75, [40, 40, 50]);
        lb = .86 - t * .2;
      } else { set(t < .9 ? [60, 60, 68] : t < .95 ? [150, 148, 142] : STONE); lb = .8; }
    } else {
      if (t < .62){   // the south end's lower bowl
        if (t > .38 && t < .41) set([150, 148, 142]); else rows(1.5, .75, [40, 40, 50]);
        lb = .86 - t * .2;
      } else if (t < .74){   // the Champions Club: a glass rail, its garnet chairbacks
        if (t < .635) set([170, 196, 210]); else { const row = ((d * OS) | 0) % 3; if (row === 2) set(GAR, .7); else if (h < .55) fan(h, h2, false); else set(GAR, .95); }
        if (night && t < .635){ set([255, 226, 170]); em = true; }
        lb = .7;
      } else {   // its rooftop terrace: cabanas under square sail canopies (each a peak, lit and shaded), garnet trim
        const u = (((qy <= 0 ? y : Math.atan2(qy, qx) * 40) + 300) % 4.6) / 4.6, v = (t - .74) / .26, cab = v > .12 && v < .86 && u > .1 && u < .9;
        if (v > .9 || v < .06) set(v > .9 ? GAR : GLD, .9); else if (!cab) set([168, 162, 152]);
        else { const pu = (u - .5) / .4, pv = (v - .49) / .37, face = Math.abs(pu) > Math.abs(pv) ? (pu < 0 ? 1.06 : .84) : (pv < 0 ? 1.12 : .9); set(hash2(Math.floor((y + 300) / 4.6), 7) < .25 ? GAR : [242, 238, 228], face); }
        if (night && cab && hash2(Math.floor((y + 300) / 4.6), 9) < .6){ set([255, 214, 150], .7 + (r > 200 ? .25 : 0)); em = true; }   // lanterns under some
        lb = night ? .42 : .8; top = 1.1;
      }
    }
    if (k < 1){ r *= k; g *= k; b *= k; }
    if (night && !em){ const f = 2.2 * lb; r *= f; g *= f; b *= f + .1; if (h > .997){ set([255, 255, 240]); em = true; } }
    if (LSR && !em && shaded(x, y, t, side ? 1.35 : north ? .9 : .75 * top)){ r *= .62; g *= .67; b *= .83; }
  };

  // ---------------------------------------------------------------- the University Center
  // Its outer face folded down flat (the pixel-art elevation), then the roofs: slate pitched along the arcade, flat inward.
  const cor = (sx, sy) => [(sx < 0 ? UC[0] + UC[4] : UC[1] - UC[4]) + sx * UC[4] * .707, (sy < 0 ? UC[2] + UC[4] : UC[3] - UC[4]) + sy * UC[4] * .707, sx * .71, sy * .71, 0];
  const GATES = [[UC[0], CY, -1, 0, 1], cor(-1, -1), cor(-1, 1), [47, UC[2], 0, -1, 0], [47, UC[3], 0, 1, 0], [UC[1], CY, 1, 0, 1], cor(1, -1), cor(1, 1)];
  const gateAt = (x, y) => { for (const gt of GATES) if (Math.abs((x - gt[0]) * gt[3] - (y - gt[1]) * gt[2]) < (gt[4] ? 5 : 3.6) && Math.hypot(x - gt[0], y - gt[1]) < 9) return true; return false; };
  const wingD = (x, y) => rr(x, y, ...UC) > -2;
  const gateD = (x, y) => { let m = 99; for (const gt of GATES) m = Math.min(m, Math.hypot(x - gt[0], y - gt[1])); return m; };
  const uc = (x, y, i, j, du, h) => {
    const dIn = sdB(x, y), gx = sdU(x + .3, y) - sdU(x - .3, y), gy = sdU(x, y + .3) - sdU(x, y - .3), al = Math.abs(gx) > Math.abs(gy) ? y : x;
    const f = (((al + 300) * OS) % 14 + 14) % 14, bay = Math.floor((al + 300) * OS / 14), sun = gx * SD[0] + gy * SD[1] < -.05;
    if (du < 3.4){   // the facade: brick, buttresses between tall pointed arches in cast stone, a cornice; gates as great arches
      const e = du / 3.4, gate = gateAt(x, y), bk = BRICK[(h * 4) | 0], gn = gateD(x, y);
      if (e > .88) set(e > .96 && f % 4 < 2 ? STONE2 : STONE);   // the cornice and its crenellation
      else if (gate){   // a gate: a great pointed arch in stone, its iron gates thrown open on the dark passage
        const u = Math.abs(f - 7), w = e < .5 ? 5.5 : 5.5 * Math.sqrt(Math.max(0, 1 - ((e - .5) / .34) ** 2)), glass = x > BOWL[1] && Math.abs(y - CY) < 9 && e > .34;
        if (u < w && glass){ set([[150, 40, 56], [206, 170, 90], [60, 90, 150], [176, 60, 70]][((i >> 1) + (j >> 1) * 3) % 4], night ? 1.5 : 1); if (night) em = true; if (((i + j) & 3) === 0) set(STONE2); }   // the Moore building's stained glass over its entrance
        else if (u < w && e > .04){ if (night){ set([255, 206, 130]); em = true; } else set(u > w - 1.2 && (j & 1) ? [70, 60, 58] : [30, 26, 30]); }
        else if (u < w + .7) set(STONE, 1.1);
        else if (u < w + 1.4) set(STONE2);
        else set(bk);
      }
      else if (e < .1) set(STONE2, (i & 3) === 0 ? .86 : 1);   // the base course, its joints
      else if (f < 3) set(BRICK[3], e > .3 && e < .34 || e > .62 && e < .66 ? 1.5 : 1);   // a buttress, its stone weatherings
      else if (gn > 12 && gn < 40 && hash2(bay, 77) < .34 && e > .17 && e < .84 && f > 3.6 && f < 12.4){   // a legend's banner between the buttresses
        const bu = f - 8, bv = (e - .17) / .67;
        if (f < 4.4 || f > 11.6 || bv > .93) set(GLD, 1.02);
        else if (bv < .06) set(GLD, .8);
        else {
          set(GAR, 1.02 - bv * .1);
          const hd = Math.hypot(bu, (bv - .7) * 9);   // the player: head and shoulders in white, a number under
          if (hd < 1.25 || (bv > .38 && bv < .58 && Math.abs(bu) < 2.6 - (.58 - bv) * 4)) set(WHITE, .96);
          else if (bv > .16 && bv < .3 && Math.abs(bu) < 1.4 && ((i + j) & 1)) set(GLD);
        }
        if (night){ r *= 1.5; g *= 1.4; b *= 1.4; }
      }
      else {
        const u = f - 8, w = e < .55 ? 2.6 : 2.6 * (1 - (e - .55) / .24);   // the window: straight jambs, a pointed head
        if (Math.abs(u) < w && e > .16){ if (night && hash2(bay, (du > 1.7) + 3) > .3){ set([255, 210, 140], .9 + h * .1); em = true; } else set(Math.abs(u) < .8 && e > .2 ? [70, 84, 104] : GLASS); if (e > .38 && e < .41 && !em) set(STONE2); if (!em && Math.abs(u) < .3) set(STONE2, .9); }   // tracery: the mullion, the transom
        else if (Math.abs(u) < w + 1 && e > .13 && e < .8) set(STONE, Math.abs(u) < w + .5 ? 1 : .9);
        else { set(bk); if ((((e * 3.4 * OS) | 0) % 3) === 0) set(bk, .86); }   // brick courses
      }
      if (!em && !sun && !night && !noon){ r *= .74; g *= .76; b *= .86; }
      if (!em && night){ const up = Math.max(0, 1 - e * 1.5); r *= 1.3 + up * 1.5; g *= 1.2 + up * 1.05; b *= 1.3 + up * .45; }   // the uplights along its foot
      return;
    }
    const wing = rr(x, y, ...UC) > 0;
    if (dIn < .7){ set([40, 38, 44]); return; }   // the gap where the bowl's rim stands up off the roofs
    if (du < 4.1 || dIn < 1.4) set(BRICK[1], du < 3.7 ? 1.25 : .9);   // the parapets
    else if (du < (wing ? 99 : 4.1 + (du + dIn - 4.1) * .64)){   // slate roofs pitched along the arcade, a gabled dormer over every other bay
      const T2 = du + dIn, rg = wing ? 8.6 : 4.1 + (T2 - 4.1) * .32, out = du < rg, lit = out === sun, sd = noon ? 1 : lit ? 1.16 : .72;
      const dorm = !wing && (bay & 1) === 0 && du < 7.6 && Math.abs(f - 8) < 4.2, u8 = Math.abs(f - 8);
      if (snow){ set([236, 240, 248], lit ? 1 : .86); if (dorm && du < 4.9 && u8 < 1.6) set([46, 54, 66]); }
      else if (dorm && du < 5){   // a dormer's face: stone round its window (lit at night)
        if (u8 < 1.8 && du > 4.3){ if (night && hash2(bay, 9) > .3){ set([255, 212, 140], .95); em = true; } else set(u8 < .5 ? [70, 84, 104] : GLASS); }
        else set(STONE, noon ? 1 : sun ? 1.08 : .8);
      }
      else if (dorm && u8 < 4.2 - (du - 5) * 1.6){   // its little gable, the ridge in stone, one face to the sun
        const dl = (f < 8) === (gx + gy > 0);
        set(u8 < .5 ? STONE : SLATE, u8 < .5 ? 1.05 : (noon ? 1 : dl ? 1.12 : .74) * ((((du * OS) | 0) & 1) ? 1 : .92));
      }
      else {   // slate in courses, every slate its own shade, the joints staggered; copper cresting along the ridge
        const row = (du * OS) | 0, sf = f + (row & 1) * 2.5, hv = hash2(Math.floor(sf / 5) + bay * 3, row + 7);
        set([[98, 104, 120], [90, 96, 112], [104, 102, 116], [86, 94, 104], [96, 100, 108]][(hv * 5) | 0], (row % 2 ? 1 : .88) * (.96 + h * .06));
        if (sf % 5 < .9) mul(.84);
        if (dorm) mul(.84);   // tucked in beside a dormer
        if (Math.abs(du - rg) < .26){ set([92, 140, 120], 1); if ((f | 0) % 7 === 0) set([150, 196, 172]); }
        mul(sd);
      }
    }
    else if (snow) set([232, 236, 246], .96 + h * .04);
    else {   // the flat roofs inward, over the concourses: membrane in panels, a clerestory down the middle, the units (their shadows), skylights
      const moore = x > BOWL[1] - 1, sg = ((al + 300) % 38 + 38) % 38, T2 = du + dIn, e0 = 4.1 + (T2 - 4.1) * .64, pf = (du - e0) / Math.max(1, T2 - e0);
      set(moore ? [150, 140, 126] : [142, 142, 146], .93 + hash2(Math.floor((al + 300) / 38), 5) * .1 + h * .04);
      const u = ((x + 300) / 4) % 1, v = ((y + 300) / 4) % 1;
      const cx = Math.floor((x + 300) / 9), cy = Math.floor((y + 300) / 9), uu = ((x + 300) / 9) % 1, vv = ((y + 300) / 9) % 1, k = hash2(cx, cy + 40);
      if (sg < .4) set(BRICK[1], 1.1);   // a firewall between two of the buildings
      else if (sg > 3 && sg < 35 && pf > .3 && pf < .54 && !wingD(x, y)){   // the clerestory: a raised standing-seam roof, glass down both sides
        if (pf < .345 || pf > .495){ if (night){ set([255, 214, 150], .85); em = true; } else set([96, 128, 150], pf < .345 === sun ? 1.15 : .8); }
        else set([176, 178, 184], ((((al + 300) * OS) | 0) % 3 === 0 ? 1.07 : .96) * (noon ? 1 : (pf < .42) === sun ? 1.1 : .84));
      }
      else if (!night && sg > 3 && sg < 35 && pf > .54 && pf < .6 && !wingD(x, y)) mul(.74);   // the clerestory's shadow
      else if (k > .66 && uu > .3 && uu < .62 && vv > .3 && vv < .6){ set(uu < .36 || vv < .36 ? [212, 212, 214] : [124, 126, 134]); const q2 = Math.hypot(uu - .46, vv - .45); if (q2 < .08) set([60, 62, 68]); }
      else if (k > .66 && !night && uu > .62 && uu < .74 && vv > .38 && vv < .68) mul(.72);   // the unit's shadow
      else if (k < .12 && uu > .15 && uu < .85 && vv > .44 && vv < .56){ set([120, 150, 170]); if (night){ set([255, 214, 150]); em = true; } }
      else if ((u < .06 || v < .06) && h > .3) set(moore ? [150, 140, 124] : [152, 152, 152]);
    }
    if (night && !em){ r *= 1.15; g *= 1.1; b *= 1.2; if (h > .996){ set([255, 214, 150]); em = true; } }
  };

  // ---------------------------------------------------------------- materials (into r, g, b, before the tone curve)
  const lawn = (x, y, h, wear = 0) => {   // St. Augustine, mown in stripes, patchy as real grass is; worn where the tents have stood all day
    const n = vn(x * .13 + 50, y * .13 + 50), m = vn(x * .45 + 7, y * .45 - 3);
    if (snow){ set([226, 232, 244], .95 + n * .05 + h * .04); if (wear && m > .62) set([200, 206, 218], .96 + h * .06); return; }
    const w = wear * clamp((m - .4) * 3, 0, 1);
    r = 70 + n * 14 + w * 30; g = 122 + n * 16 - w * 10; b = 50 + n * 6 + w * 10;
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
    set(PAVE[(h * 3.99) | 0], k * (((i + (j >> 1)) & 3) < 2 ? 1.02 : .95));
  };
  const curb = h => set(snow ? [212, 216, 226] : [196, 192, 184], .95 + h * .06);
  const granite = (h, k = 1) => set(snow ? [216, 222, 234] : [176, 170, 160], k * (.94 + h * .08));
  const bed = (x, y, h) => {   // pine straw and the shrubs in it (azaleas, a few in bloom)
    if (snow){ set([214, 220, 234], .94 + h * .06); return; }
    const n = vn(x * 1.3, y * 1.3);
    if (n > .54){ const lit = vn(x * 1.3 + SD[0] * .5, y * 1.3 + SD[1] * .5) < n; set([48, 84, 44], (lit ? 1.12 : .8) * (.92 + h * .1)); if (h > .93 && lit) set([206, 84, 120]); }
    else set([128, 84, 50], .82 + h * .2);
  };
  const gravel = (x, y, h) => { if (snow){ set([218, 224, 236], .95 + h * .05); return; } set([132, 126, 116], .86 + h * .22 + (vn(x * .5, y * .5) - .5) * .12); };
  const pavers = (h, i, j, k = 1) => {   // stone pavers in a running bond
    if (snow){ set([222, 228, 240], .95 + h * .05); return; }
    const ii = i + ((j >> 2) & 1) * 3; set([186, 178, 164], k * (.95 + hash2((ii / 6) | 0, (j >> 2) + 900) * .06 + h * .03));
    if (j % 4 === 0 || ii % 6 === 0) mul(.9);
  };

  // ---------------------------------------------------------------- shapes, found through a grid of bins
  const SHP = [], CELL = 6, NBX = Math.ceil((X1 - X0) / CELL), NBY = Math.ceil((Y1 - Y0) / CELL), bins = Array.from({ length: NBX * NBY }, () => []);
  const shape = (x0, y0, x1, y1, f, p, o) => {
    const s = { f, p, ...o }, id = SHP.push(s) - 1;
    for (let by = Math.max(0, Math.floor((y0 - Y0) / CELL)); by <= Math.min(NBY - 1, Math.floor((y1 - Y0) / CELL)); by++)
      for (let bx = Math.max(0, Math.floor((x0 - X0) / CELL)); bx <= Math.min(NBX - 1, Math.floor((x1 - X0) / CELL)); bx++) bins[by * NBX + bx].push(id);
    return s;
  };
  const rrd = (x, y, x0, y0, x1, y1, rad) => rr(x, y, x0, x1, y0, y1, rad);
  // o.out: kept that far out from the arcade (its plaza runs round everything); o.r: rounded corners
  const box = (x0, y0, x1, y1, p, o = {}) => { const rad = o.r || 0, out = o.out;
    return shape(x0, y0, x1, y1, out ? (x, y, d) => Math.max(rrd(x, y, x0, y0, x1, y1, rad), out - d) : (x, y) => rrd(x, y, x0, y0, x1, y1, rad), p, { kind: 'lawn', ...o, x0, y0, x1, y1 }); };
  const circ = (cx, cy, R, p, o = {}) => shape(cx - R, cy - R, cx + R, cy + R, (x, y) => Math.hypot(x - cx, y - cy) - R, p, { kind: 'lawn', ...o, cx, cy, R, x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R });
  const seg = (xa, ya, xb, yb, hw, p, o = {}) => { const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    return shape(Math.min(xa, xb) - hw, Math.min(ya, yb) - hw, Math.max(xa, xb) + hw, Math.max(ya, yb) + hw, (x, y) => { const t = clamp((x - xa) * ux + (y - ya) * uy, 0, L); return Math.hypot(x - xa - ux * t, y - ya - uy * t) - hw; }, p, { kind: 'path', ...o, xa, ya, ux, uy, L, hw }); };
  const poly = (pts, hw, p, o) => { for (let n = 1; n < pts.length; n++) seg(pts[n - 1][0], pts[n - 1][1], pts[n][0], pts[n][1], hw, p, o); };
  const at = (x, y) => {   // what's on top at a point: 'uc' inside the arcade or its plaza, a shape, or null for open lawn
    const d = sdU(x, y); if (d < 9) return 'uc';
    const bx = Math.floor((x - X0) / CELL), by = Math.floor((y - Y0) / CELL); if (bx < 0 || by < 0 || bx >= NBX || by >= NBY) return 'edge';
    const cell = bins[by * NBX + bx]; for (let k = cell.length - 1; k >= 0; k--){ const s = SHP[cell[k]]; if (s.f(x, y, d) < 0) return s; }
    return null;
  };
  const isLawn = s => s === null || (s !== 'uc' && s !== 'edge' && s.kind === 'lawn');
  const open = (x, y, rad) => isLawn(at(x, y)) && isLawn(at(x + rad, y)) && isLawn(at(x - rad, y)) && isLawn(at(x, y + rad)) && isLawn(at(x, y - rad));

  // Roads: a polyline of segments, each painted from whichever of its neighbors is nearest (so the bends join clean),
  // and a road crossing another keeps the other's asphalt where they meet.
  const roads = [];
  const road = (pts, rw, o = {}) => {
    const R = { pts, rw, sw: o.sw ?? 2.4, mark: o.mark ?? 1, segs: [], joins: [] }, hw = rw + .34 + R.sw;
    for (let n = 1; n < pts.length; n++){ const [xa, ya] = pts[n - 1], [xb, yb] = pts[n], L = Math.hypot(xb - xa, yb - ya); R.segs.push({ xa, ya, ux: (xb - xa) / L, uy: (yb - ya) / L, L }); }
    R.near = (x, y, n0 = 0, n1 = R.segs.length - 1) => {
      let bv = 1e9, bt = 0;
      for (let n = Math.max(0, n0); n <= Math.min(R.segs.length - 1, n1); n++){ const s = R.segs[n], t = (x - s.xa) * s.ux + (y - s.ya) * s.uy, tt = clamp(t, 0, s.L), v = Math.hypot(x - s.xa - s.ux * tt, y - s.ya - s.uy * tt); if (v < bv){ bv = v; bt = t >= 0 && t <= s.L ? 1 : 0; } }
      return [bv, bt];
    };
    R.on = (x, y) => R.near(x, y)[0] < rw;
    R.segs.forEach((s, n) => {
      const [xb, yb] = [s.xa + s.ux * s.L, s.ya + s.uy * s.L];
      shape(Math.min(s.xa, xb) - hw, Math.min(s.ya, yb) - hw, Math.max(s.xa, xb) + hw, Math.max(s.ya, yb) + hw, (x, y) => R.near(x, y, n - 1, n + 1)[0] - hw, (x, y, i, j, e, h) => {
        const [v, inner] = R.near(x, y, n - 1, n + 1), s2 = R.segs[n], t = (x - s2.xa) * s2.ux + (y - s2.ya) * s2.uy;
        if (v < rw){
          asph(x, y, h);
          if (R.mark && inner){ if (v > .28 && v < .62) set([222, 188, 76], snow ? .75 : .95); else if (v > rw - .55 && v < rw - .22) set([214, 214, 208], snow ? .8 : .9); }
          return;
        }
        for (const J of R.joins) if (J.on(x, y)){ asph(x, y, h); return; }
        if (v < rw + .34) return curb(h);
        conc(h, Math.floor((t + 600) * OS), 1);
      }, { kind: 'street', road: R });
    });
    roads.push(R); return R;
  };
  const xwalk = (xc, yc, ax, hl, hw) => box(ax ? xc - hl : xc - hw, ax ? yc - hw : yc - hl, ax ? xc + hl : xc + hw, ax ? yc + hw : yc + hl, (x, y, i, j, e, h) => {   // a crosswalk over a road along x (ax 1) or y
    asph(x, y, h); if (((((ax ? y - yc : x - xc) + 9) * 1.5) | 0) & 1 && e > .25) set([226, 226, 222], snow ? .9 : .97);
  }, { kind: 'street' });

  // ---------------------------------------------------------------- painters for the shapes: (x, y, i, j, e = how far in from its edge, h, d, S)
  const lawnP = (x, y, i, j, e, h, d, S) => lawn(x, y, h, S.wear || 0);
  const brickWalk = (x, y, i, j, e, h) => { if (e < .3) curb(h); else brk(h, i, j); };
  const concWalk = (x, y, i, j, e, h) => { if (e < .25) curb(h); else conc(h, i, j); };
  const gravelP = (x, y, i, j, e, h) => { if (e < .3){ set([110, 114, 118], ((i + j) & 1) ? 1.15 : .7); return; } gravel(x, y, h); };   // with its chain-link fence
  // Roofs. Gabled: slate or clay tile in courses, the sunlit face lighter, a ridge cap, gutters, stone parapets on the
  // gable ends, dormers, chimneys.
  function gableRoof(x, y, i, j, e, h, d, S){
    const ax = S.ax ?? (S.x1 - S.x0 >= S.y1 - S.y0 ? 1 : 0), hw = ax ? (S.y1 - S.y0) / 2 : (S.x1 - S.x0) / 2;
    const cw = ax ? y - (S.y0 + S.y1) / 2 : x - (S.x0 + S.x1) / 2, aw = Math.abs(cw), u = ax ? x - S.x0 : y - S.y0, L = ax ? S.x1 - S.x0 : S.y1 - S.y0;
    const lit = ax ? (cw < 0 ? -LY : LY) : (cw < 0 ? -LX : LX);
    if (S.par && (u < .6 || L - u < .6)){ set(snow ? [236, 240, 248] : STONE, u < .3 || L - u < .3 ? 1.08 : .9); return; }
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
    if (S.mat === TILE && (Math.floor(u * OS) & 1)) mul(.92);   // the barrel tiles' ribs
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
  // A barrel vault in standing-seam metal (S.ax 1: its crown along x; 0: along y), a skylight ribbon down the crown,
  // garnet trim at the eaves: the indoor practice facility.
  function vaultP(x, y, i, j, e, h, d, S){
    if (e < .35){ set(S.trim || [150, 150, 156], .92); return; }
    const ax = S.ax ?? 1, hw = ax ? (S.y1 - S.y0) / 2 : (S.x1 - S.x0) / 2, w = (ax ? y - (S.y0 + S.y1) / 2 : x - (S.x0 + S.x1) / 2) / hw;
    const nz = Math.sqrt(Math.max(.05, 1 - w * w * .7)), sh = w * .84 * (ax ? L3[1] : L3[0]) + nz * L3[2];
    if (Math.abs(w) < .035){ if (night){ set([255, 214, 150], .7); em = true; } else set([200, 214, 222]); return; }
    if (Math.abs(Math.abs(w) - .55) < .012){ set([200, 214, 222], .9); return; }   // the side skylights
    if (snow){ set([234, 238, 246], .82 + sh * .22); return; }
    set(S.mat, Math.round((.66 + sh * .44) * 12) / 12 * (((((ax ? x - S.x0 : y - S.y0)) * OS) | 0) % 3 === 0 ? 1.08 : .97) * (.97 + h * .04));
    if (Math.abs(w) > .965) set(GAR, .9);
  }
  function stageP(x, y, i, j, e, h, d, S){   // the stage's black roof on its truss, the LED wall along its front (the spear on garnet)
    if (e < .45 && x < S.x1 - 1.7){ set([150, 152, 160], ((i + j) & 1) ? 1.1 : .8); return; }
    if (x > S.x1 - 1.7){ set(GAR, night ? 1.6 : 1.1); if (Math.abs(y - (S.y0 + S.y1) / 2 + (x - S.x1 + .85) * 6) < .7 || x > S.x1 - .3 || x < S.x1 - 1.55) set(GLD, night ? 1.5 : 1.1); if (((i + j) & 1) === 0) mul(.86); if (night) em = true; return; }
    set([40, 40, 46], .95 + h * .1); if ((i % 6 === 0 || j % 6 === 0) && e > .4) set([96, 98, 106]);
  }
  // Parking: asphalt, stalls painted in a row along x with a planted island every bay, oil down the middle of the
  // stalls, a curb round it. S.R: the stall rows [y0, y1]; S.u0 where the bays start; S.ns stalls a bay.
  function lotP(x, y, i, j, e, h, d, S){
    if (e < .34) return curb(h);
    asph(x, y, h, 1);
    for (const [r0, r1] of S.R){
      if (y < r0 || y >= r1 || x < S.u0) continue;
      const bay = 4.2 + S.ns * 3, u = x - S.u0, k = u % bay, nb = Math.floor(u / bay);
      if (S.u0 + (nb + 1) * bay > S.x1 - .5 && k >= 4.2) return;
      if (k < 4.2){ if (k < .34 || k > 3.86 || y - r0 < .34 || r1 - y < .34) curb(h); else if (snow) set([214, 220, 234], .94 + h * .06); else lawn(x, y, h, 0); return; }   // the island
      const su = (k - 4.2) % 3;
      if (su < 1 / OS) set([214, 214, 208], snow ? .82 : .9);
      else if (!snow && Math.abs(su - 1.5) < .5 && Math.abs((S.nose < 0 ? y - r0 : r1 - y) - 1.6) < 1.1 && hash2(Math.floor(u / 3) + 97, r0 | 0) > .5) mul(.86);   // oil where the engines sit
      return;
    }
  }
  function fieldP(x, y, i, j, e, h, d, S){   // the practice field: lined turf, garnet end zones, its windscreen fence
    if (e < .4){ set([38, 60, 44], ((i + j) & 1) ? .95 : .8); return; }
    const F = S.F, inF = x > F[0] && x < F[2] && y > F[1] && y < F[3];
    if (snow){ set([226, 232, 244], .95 + h * .05); if (inF && Math.abs(((y - F[1]) % 5 + 5) % 5) < .3) set([196, 204, 220]); return; }
    set(Math.floor((y - F[1]) / 5) & 1 ? [74, 132, 56] : [66, 122, 52], .95 + h * .07 + (vn(x * .3, y * .3) - .5) * .05);
    if (!inF) return;
    const ez = y < F[1] + 10 || y > F[3] - 10, yl = ((y - F[1]) % 5 + 5) % 5;
    if (ez) set(GAR, .9 * (.95 + h * .08));
    if (x < F[0] + .4 || x > F[2] - .4 || (!ez && yl < .34) || Math.abs(y - F[1] - 10) < .2 || Math.abs(F[3] - 10 - y) < .2) set([232, 234, 226], .95);
    else if (!ez && (Math.abs(x - (F[0] + F[2]) / 2 - 3.1) < .3 || Math.abs(x - (F[0] + F[2]) / 2 + 3.1) < .3) && ((y - F[1]) % 1 + 1) % 1 < .34) set([232, 234, 226], .9);
  }
  // The Sod Cemetery: inside its iron fence and brick piers, rows of little headstones (a piece of every big road
  // win's turf is buried here), a brick walk down the middle to the monument.
  function sodP(x, y, i, j, e, h, d, S){
    const cx = (S.x0 + S.x1) / 2;
    if (e < .3){ const u = ((S.y1 - S.y0 > 0 ? x + y : x) * 1 + 600) % 3; set(u < .6 ? BRICK[0] : [34, 34, 40], u < .6 ? 1.05 : 1); if (Math.abs(x - cx) < 1.6 && Math.abs(y - S.y1) < .4) lawn(x, y, h); return; }
    if (Math.abs(x - cx) < .9) return brk(h, i, j);
    if (Math.abs(x - cx) < 2.6 && y - S.y0 < 3.6){ granite(h, y - S.y0 < 1 ? .86 : 1.08); return; }   // the monument
    lawn(x, y, h); if (!snow) set([r * .96, g * 1.06, b * .96]);
    const fu = ((x - S.x0 - 1.2) % 1.5 + 1.5) % 1.5, fv = ((y - S.y0 - 1.4) % 1.7 + 1.7) % 1.7, row = Math.floor((y - S.y0 - 1.4) / 1.7);
    if (e > 1 && hash2(Math.floor((x - S.x0 - 1.2) / 1.5), row + 50) < .86){
      if (fu < .62 && fv < .36) set(snow ? [236, 240, 248] : [204, 200, 192], fv < .14 ? 1.12 : .94);
      else if (!night && fu > .2 && fu < .9 && fv > .36 && fv < .62) mul(.74);   // its shadow
    }
  }
  // The Unconquered's plaza: rings of garnet and gold, pavers laid in circles, beds for the palms, the spear inlaid in
  // gold pointing to the gate.
  function statP(x, y, i, j, e, h, d, S){
    const u = x - S.cx, v = y - S.cy, rad = Math.hypot(u, v), th = Math.atan2(v, u);
    if (rad > S.R - .4) return granite(h, 1.06);
    if (rad > S.R - 1.3) return brk(h, i, j);
    if (rad > S.R - 1.9) return set(snow ? [236, 240, 248] : GLD, .95 + h * .06);
    if (rad > S.R - 2.6) return set(snow ? [222, 226, 236] : GAR, .95 + h * .06);
    for (let k = 0; k < 4; k++){ const a = (k + .5) * 1.5708, bx = Math.cos(a) * 6.4, by = Math.sin(a) * 6.4, bd = Math.hypot(u - bx, v - by); if (bd < 1.9){ if (bd > 1.6) granite(h); else bed(x, y, h); return; } }
    if (rad < 3.8) return granite(h, rad > 3.4 ? .86 : 1);
    if (u > 0 && Math.abs(v) < .3 + (u > S.R - 4 ? (S.R - 2.6 - u) * .3 : 0)) return set(snow ? [236, 240, 248] : GLD, 1.05);   // the spear
    if (snow){ set([222, 228, 240], .95 + h * .05); return; }
    const ring = Math.floor(rad * OS / 3), sp = Math.floor((th + 3.1416) * rad * OS / 4.5 + ring * 1.5);
    set([188, 180, 166], .95 + hash2(ring, sp) * .07 + h * .03);
    if (((rad * OS) | 0) % 3 === 0 || ((th + 3.1416) * rad * OS / 4.5 + ring * 1.5) % 1 < .2) mul(.9);
  }
  // Dick Howser Stadium, pixel by pixel round home plate: fair territory mown in a checkerboard, the skinned infield,
  // the chalk; the grandstand wrapped round behind the plate (rows of fans, the aisles, the roof over the middle, the
  // brick back wall), the dugouts.
  function howserP(x, y, i, j, e, h){
    const u = x - HOME[0], v = y - HOME[1], rad = Math.hypot(u, v);
    let a = Math.atan2(v, u) + 2.356; if (a > Math.PI) a -= 6.2832;   // 0 straight back from the plate
    const DIRT = snow ? [222, 216, 220] : [178, 120, 76];
    const turf = () => { if (snow){ set([226, 232, 244], .95 + h * .05); return; } set(((Math.floor((u - v) / 4.4) + Math.floor((u + v) / 4.4)) & 1) ? [82, 140, 60] : [70, 126, 54], .95 + h * .07); };
    const dirt = k => set(DIRT, k * (.93 + h * .1 + (vn(x * .8, y * .8) - .5) * .08));
    if (u >= -1.2 && v >= -1.2 && rad > 4.3){
      const mound = Math.hypot(u - 14.26, v - 14.26), sq = u > 2.4 && v > 2.4 && u < 27.6 && v < 27.6;
      if (mound < 3){ dirt(mound < 1 ? 1.1 : 1.04); if (mound < .3) set(WHITE); return; }
      if ((Math.abs(u) < .2 && v > 0) || (Math.abs(v) < .2 && u > 0)) return set([236, 236, 228]);
      for (const [bx, by] of [[30, 0], [30, 30], [0, 30]]){ const bd = Math.hypot(u - bx, v - by); if (bd < 3.6){ if (Math.abs(u - bx) < .3 && Math.abs(v - by) < .3) set(WHITE); else dirt(1); return; } }
      if ((mound < 31.7 && !sq) || (Math.abs(v) < 1.1 && u < 30) || (Math.abs(u) < 1.1 && v < 30)) return dirt(1);
      return turf();
    }
    if (rad <= 4.3){ dirt(1); if (rad < .4) set(WHITE); else if ((Math.abs(Math.abs(u + v) / 1.414 - 1.1) < .1 && Math.abs(u - v) / 1.414 < 1.4)) set([236, 236, 228], .95); return; }
    if (rad < 8.6) return dirt(.96);
    if (Math.abs(a) < 2.0 && rad < 23.6){
      if (rad < 9.2){ set([44, 74, 54]); return; }   // the backstop's padded wall
      if (Math.abs(a) > 1.55 && Math.abs(a) < 1.9 && rad < 12){ set(rad < 9.6 ? [40, 74, 54] : [28, 28, 34]); if (rad > 11.4) set(GAR); tall = true; return; }   // a dugout, its roof's garnet lip
      if (Math.abs(a) < .78 && rad > 14.2 && rad < 22.6){   // the roof over the middle: standing seam, a garnet fascia
        tall = true;
        if (rad < 14.7){ set(GAR, 1.05); return; }
        if (snow){ set([234, 238, 246], .92 + h * .06); return; }
        set([168, 170, 174], (((a * rad * OS / 2) | 0) & 1 ? 1.04 : .94) * (.95 + h * .06) * (a < 0 ? 1.05 : .9));
        if (rad > 22.1) set([120, 120, 126]);
        return;
      }
      if (rad > 21.4){ set(rad > 22.8 ? BRICK[1] : [150, 148, 142], rad > 22.8 ? 1.1 : 1); if (rad > 22.8) tall = true; return; }
      if (rad > 15.2 && rad < 15.9){ set([150, 148, 142]); return; }   // the cross aisle
      const st = ((a * rad / 6.5) % 1 + 1) % 1, row = ((rad - 9.2) * OS) | 0, h2 = hash2(j * 3 + 11, i * 5 + 7);
      if (st < .09) set(row & 1 ? [160, 158, 152] : [128, 126, 122]);
      else if (row % 3 === 2) set([40, 40, 50]);
      else if (row % 3 === 0 && h < .7) set(SKIN[(h2 * 5) | 0], .95);
      else fan(h, h2, false);
      if (night){ mul(1.9); }
      return;
    }
    if (snow){ set([226, 232, 244], .95 + h * .05); return; }
    turf();
  }
  // The south end's apron and every gate's: the arcade's own plaza round its foot (granite drip strip, brick, stone
  // pavers), the beds between the gates; then lawn.
  const ground = (x, y, i, j, dU, h) => {
    if (dU < 9){
      if (dU < .8) return granite(h, .92);
      if (dU < 1.7) return brk(h, i, j);
      if (dU > 8.6) return granite(h, 1.06);
      if (dU > 7.6) return brk(h, i, j);
      if (dU > 3.2 && dU < 6.8 && gateD(x, y) > 13){ const m = ((ucS(x, y, dU) + 1000) % 16 + 16) % 16; if (m > 2.6 && m < 13.4){ if (Math.min(dU - 3.2, 6.8 - dU, m - 2.6, 13.4 - m) < .34) granite(h); else bed(x, y, h); return; } }
      return pavers(h, i, j, gateD(x, y) < 14 ? 1.04 : 1);
    }
    lawn(x, y, h, 0);
  };

  // ---------------------------------------------------------------- the plan, bottom layer first
  let seedN = 1;
  const blds = [];
  const B = (x0, y0, x1, y1, p, o) => { const s = box(x0, y0, x1, y1, p, { kind: 'bld', seed: (seedN++) * 37, ...o }); blds.push(s); return s; };
  // Lawns: the tailgate grove (south-west), Langford Green, the RV lot.
  const GROVE = box(-150, -124.4, -66, -10, lawnP, { wear: .75, out: 9 });
  const LGR = box(LG[0], LG[1], LG[2], LG[3], lawnP, { wear: .45 });
  const RVL = box(-150, 64, -95, 152, (x, y, i, j, e, h) => {   // the RV lot: mown grass, gravel lanes between the rows
    if (e < .34) return curb(h);
    const ry = ((y - 64) % 21.5 + 21.5) % 21.5;
    if (ry > 13.4 && ry < 19.6) gravel(x, y, h); else lawn(x, y, h, .7);
  }, { kind: 'lot' });
  // Lots down both sides: a row of stalls nose-in off the road, the aisle behind for the tailgates.
  const LOTW = box(-60, -124.3, 166, -110.6, lotP, { kind: 'lot', R: [[-124, -118.8]], u0: -59.6, ns: 8, nose: -1 });
  const LOTE = box(-56, 164.4, 146, 178.6, lotP, { kind: 'lot', R: [[173.4, 178.6]], u0: -55.6, ns: 8, nose: 1 });
  const TVC = box(128, -98, 164, -84, gravelP, { kind: 'lot' });
  // North of the Moore building: the practice field, the Sod Cemetery, Howser.
  const PFLD = box(190, -40, 250, 90, fieldP, { kind: 'field', F: [194.7, -34, 248, 86] });
  const SOD = box(200, -60, 224, -45, sodP, { kind: 'field' });
  const HOW = box(182, 126, 250, 188, howserP, { kind: 'field' });
  // Walks: brick through the grove and down Langford Green, concrete round the fields.
  poly([[-150, -78], [-118, -52], [-96, -18]], 1.15, brickWalk); poly([[-120, -124], [-118, -52]], 1.15, brickWalk); seg(-150, -30, -96, -18, 1.15, brickWalk);
  circ(-118, -52, 3.4, brickWalk, { kind: 'path' });
  box(-142, CY - 3.4, -114, CY + 3.4, (x, y, i, j, e, h) => { const v = Math.abs(y - CY); if (v > 3.05) return granite(h); if (v < .35) return granite(h, 1.04); brk(h, i, j); }, { kind: 'path' });
  for (const yy of [LG[1] + 1.6, LG[3] - 1.6]) box(LG[0], yy - .9, LG[2] + 1, yy + .9, concWalk, { kind: 'path' });
  seg(-133, LG[1] + 1.6, -133, LG[3] - 1.6, .9, concWalk);
  box(186, -62, 250, -59.6, concWalk, { kind: 'path' }); seg(187, -61, 187, 124, .9, concWalk); seg(226, -60.8, 226, -44, .9, concWalk);
  box(182, 92.4, 250, 94.4, concWalk, { kind: 'path' });
  const STP = circ(STAT[0], STAT[1], 11.5, statP, { kind: 'plaza' });
  // Roads: Champions Way, then Stadium Drive along the west and Pensacola Street along the east, over it where they meet.
  const RCW = road(CW, 3.4);
  const RSD = road([[-150, -131], [250, -131]], 3.6), RPN = road([[-150, 185], [168, 185]], 3.6);
  RSD.joins.push(RCW); RPN.joins.push(RCW); RCW.joins.push(RSD, RPN);
  xwalk(-87, CY, 0, 4.6, 3.4); xwalk(47, -104, 1, 3.4, 3.4); xwalk(47, 158, 1, 3.4, 3.4); xwalk(-87, -52, 0, 1.6, 3.4); xwalk(-87, 104, 0, 1.6, 3.4);
  // Buildings. ht in yards for the shadows.
  const IPF = B(188, -124, 250, -64, vaultP, { ht: 24, mat: [178, 184, 192], ax: 0, trim: [150, 152, 158] });   // the Dunlap indoor practice facility
  B(194, 97, 240, 120, gableRoof, { ht: 12, mat: SLATE, par: 1, dorm: 4.4, chim: [[6, 1], [24, -1], [40, 1]] });   // the football offices off Moore's corner
  B(-146, 157, -121, 177, gableRoof, { ht: 13, mat: TILE, par: 1, dorm: 4, chim: [[4, 1], [21, -1]] });
  B(-116, 160, -97, 177, hipRoof, { ht: 11, mat: SLATE2 });
  B(-58, -96.5, -36, -93, flatRoof, { ht: 3, mat: [214, 212, 206], cop: GAR, sky: false });   // the ticket office by the west wing
  const STAGE = B(-150, CY - 11, -142, CY + 11, stageP, { ht: 6 });
  yield;

  // ---------------------------------------------------------------- pass 1: everything on the ground, pixel by pixel
  // Masks: the arcade (its shadow is cast from it), the tall things painted here (the grandstand's roof), and what no
  // shadow falls on (the arcade, the bowl and the roofs).
  const mask = A.canvas(W, H), mc = mask.getContext('2d'), mmid = A.canvas(W, H), mm = mmid.getContext('2d'), mno = A.canvas(W, H), mn = mno.getContext('2d');
  for (let j0 = 0; j0 < H; j0 += 4){
    const j1 = Math.min(H, j0 + 4), band = c.createImageData(W, j1 - j0), D = band.data, mb = mc.createImageData(W, j1 - j0), M = mb.data, m2 = mm.createImageData(W, j1 - j0), M2 = m2.data, m3 = mn.createImageData(W, j1 - j0), M3 = m3.data;
    for (let j = j0; j < j1; j++){
      const y = Y0 + (j + .5) / OS, brow = Math.min(NBY - 1, ((y - Y0) / CELL) | 0) * NBX;
      for (let i = 0; i < W; i++){
        const x = X0 + (i + .5) / OS, q = ((j - j0) * W + i) * 4, h = hash2(i, j);
        em = false; tall = false;
        const d = sdP(x, y);
        if (d < 0){ r = 34; g = 36; b = 42; M3[q + 3] = 255; }
        else {
          const dOut = -sdB(x, y);
          if (dOut > 0){ bowl(x, y, i, j, d, dOut, h); M3[q + 3] = 255; }
          else {
            const du = -sdU(x, y);
            if (du > 0){ uc(x, y, i, j, du, h); M[q + 3] = 255; M3[q + 3] = 255; }
            else {
              const dU = -du; let hit = null;
              const cell = bins[brow + Math.min(NBX - 1, ((x - X0) / CELL) | 0)];
              for (let k = cell.length - 1; k >= 0; k--){ const s = SHP[cell[k]], e = -s.f(x, y, dU); if (e > 0){ hit = s; s.p(x, y, i, j, e, h, dU, s); break; } }
              if (!hit) ground(x, y, i, j, dU, h);
              if (hit && hit.ht) M3[q + 3] = 255;
              if (tall){ M2[q + 3] = 255; M3[q + 3] = 255; }
            }
          }
        }
        if (em){ D[q] = r; D[q + 1] = g; D[q + 2] = b; }
        else { D[q] = r * TM[0] + TM[1]; D[q + 1] = g * TM[2] + TM[3]; D[q + 2] = b * TM[4] + TM[5]; }
        D[q + 3] = 255;
      }
    }
    c.putImageData(band, 0, j0); mc.putImageData(mb, 0, j0); mm.putImageData(m2, 0, j0); mn.putImageData(m3, 0, j0);
    yield;
  }
  const rect = (x, y, w, h, col) => { c.fillStyle = col; const a = wx(x), b2 = wy(y); c.fillRect(a, b2, Math.max(1, wx(x + w) - a), Math.max(1, wy(y + h) - b2)); };
  const disc = (cx, cy, rad, col, cc = c) => { cc.fillStyle = col; const px = wx(cx), py = wy(cy), R = Math.max(1, Math.round(rad * OS)); for (let dy = -R; dy <= R; dy++){ const w = Math.floor(Math.sqrt(R * R - dy * dy + .25)); cc.fillRect(px - w, py + dy, 2 * w + 1, 1); } };
  // The field itself, from the real texture, washed toward clean stripes at this scale (as the generic bake).
  c.save(); c.beginPath(); c.rect(wx(-13.3), wy(-6.5), 126.6 * OS, 66.33 * OS); c.clip();
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(art.tex, wx(A.FX0), wy(A.FY0), (A.FX1 - A.FX0) * OS, (A.FY1 - A.FY0) * OS);
  if (night){ c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(176,198,255)'; c.fillRect(0, 0, W, H); }
  c.restore(); c.imageSmoothingEnabled = false;
  {
    // the stripes' colors, sampled off the texture through a strip of its own (reading the big canvas back would wait on everything drawn to it)
    const tx2 = art.tex, sx = tx2.width / (A.FX1 - A.FX0), sy = tx2.height / (A.FY1 - A.FY0), strip = A.canvas(100 * OS, 1), sc = strip.getContext('2d');
    sc.imageSmoothingEnabled = true; sc.drawImage(tx2, (0 - A.FX0) * sx, (5 - A.FY0) * sy, 100 * sx, Math.max(1, sy / OS), 0, 0, 100 * OS, 1);
    if (night){ sc.globalCompositeOperation = 'multiply'; sc.fillStyle = 'rgb(176,198,255)'; sc.fillRect(0, 0, 100 * OS, 1); }
    const sm = sc.getImageData(0, 0, 100 * OS, 1).data, at2 = x => { const q = Math.round(x * OS) * 4; return `rgb(${sm[q]},${sm[q + 1]},${sm[q + 2]})`; };
    const fw = 100 * OS, fh = Math.round(53.33 * OS), wv = A.canvas(fw, fh), w2 = wv.getContext('2d');
    for (let k = 0; k < 20; k++){ w2.fillStyle = at2(k * 5 + 2.5); w2.fillRect(Math.round((k * 5 + .6) * OS), 0, Math.round(3.8 * OS), fh); }
    w2.globalCompositeOperation = 'destination-in'; w2.setTransform(1, 0, 0, .27, 0, fh / 2 * .73);
    const gr = w2.createRadialGradient(fw / 2, fh / 2, 0, fw / 2, fh / 2, fw * .44); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.7, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    w2.fillStyle = gr; w2.fillRect(0, -fh * 4, fw, fh * 9);
    c.globalAlpha = snow ? .7 : .86; c.drawImage(wv, wx(0), wy(0)); c.globalAlpha = 1;
  }
  {   // the practice field's numbers, read from each sideline
    const F = PFLD.F;
    for (let k = 1; k < 10; k++){
      const n = String(k <= 5 ? k * 10 : (10 - k) * 10), y = F[1] + 10 + k * 10, tx = TX.nums[n];
      for (const [x, rot] of [[F[0] + 7.5, -Math.PI / 2], [F[2] - 7.5, Math.PI / 2]]){ c.save(); c.translate(wx(x), wy(y)); c.rotate(rot); c.drawImage(tx, -tx.width >> 1, -tx.height >> 1); c.restore(); }
    }
    for (const [y, rot] of [[F[1] + 5, Math.PI], [F[3] - 5, 0]]){ const tx = TX.ez; c.save(); c.translate(wx((F[0] + F[2]) / 2), wy(y)); c.rotate(rot); c.drawImage(tx, -tx.width >> 1, -tx.height >> 1); c.restore(); }
  }
  yield;
  // ---------------------------------------------------------------- where everything goes
  const cars = [], tents = [], lamps = [], lampsP = [], rvs = [], folk = [], grills = [], flags = [], gear = [], trees = [], trucks = [], rails = [], stands = [], poles = [], fpoles = [];
  let seed = 1;
  const gather = (x, y, w, h, n, vis) => { seed++; for (let k = 0; k < n; k++) folk.push([x + hash2(seed, k * 2) * w, y + hash2(seed, k * 2 + 1) * h, vis]); };
  const carPick = s => { let k = hash2(s * 7919 | 0, 3) * 33, n = 0; while (k >= CARW[n]) k -= CARW[n++]; return n; };
  const tailgate = (x, y, s, vis, up) => {   // a tent (or two side by side), the grill, chairs and a cooler, cornhole, a flag, the crowd round it
    tents.push([x, y, s, vis]); if (s < .3) tents.push([x + 3.5, y, s + .4, vis]);
    const gy = up ? y - 1 : y + 3.8;
    grills.push([x + (s < .3 ? 7.4 : 4), y + 1.4]); gear.push([x + .6, gy, s], [x + 2.2, gy + (up ? -.6 : .6), s + .3]);
    if (s < .14) gear.push([x + 1, gy + (up ? -1.8 : 1.8), -1], [x + 4.6, gy + (up ? -1.8 : 1.8), -1]);   // cornhole boards
    if (hash2(seed, 7) < .5) flags.push([x - .2, y - .3, vis]);
    gather(x - .4, up ? y - 3.6 : y + 3.4, 8, 3.4, 5 + (s * 14 | 0), vis);
  };
  // Trees: [x, y, radius, kind, palette, seed].
  const leafPal = (kind, s) => kind === 'round' ? (s < .06 ? 'gum' : s < .1 ? 'gold' : 'green') : kind;
  const tree = (x, y, R, kind, s = hash2(x * 13 | 0, y * 7 | 0)) => trees.push([x, y, R, kind, leafPal(kind, s), s]);
  const onUC = (th, dd) => { const dx = Math.cos(th), dy = Math.sin(th); let lo = 70, hi = 170; for (let i = 0; i < 14; i++){ const m = (lo + hi) / 2; if (sdU(UCX + dx * m, UCY + dy * m) < dd) lo = m; else hi = m; } return [UCX + dx * lo, UCY + dy * lo]; };
  // The lots: cars nose-in, a live oak and a light on every island, tailgates in the aisle (the visitors' toward the north end of the east lot).
  for (const L of [LOTW, LOTE]){
    const bay = 4.2 + L.ns * 3, [r0, r1] = L.R[0], cy = (r0 + r1) / 2;
    for (let nb = 0; L.u0 + (nb + 1) * bay <= L.x1 - .5; nb++){
      const bx = L.u0 + nb * bay;
      tree(bx + 2.1, cy, 2.9 + hash2(nb, L.u0 | 0) * .7, nb % 3 === 1 ? 'mag' : 'live'); lamps.push([bx + 2.1, L.nose < 0 ? r1 - .6 : r0 + .6]);
      for (let s = 0; s < L.ns; s++){ const sx = bx + 4.2 + s * 3 + 1.5, sv = hash2(Math.round(sx * 7), (r0 | 0) + 31); if (sv < .94) cars.push([sx, cy + (L.nose < 0 ? .2 : -.2), carPick(sv), CARK[(sv * 977 | 0) % CARK.length], 1, L.nose < 0 ? 0 : 1]); }
      for (let tx = bx + 4.6; tx + 8 < bx + bay; tx += 10.5){ const s = hash2(Math.round(tx * 3), (r0 | 0) + 9); if (s < .72) tailgate(tx, L.nose < 0 ? r1 + .5 : r0 - 4, s / .72 * .5, L === LOTE && tx > 70 && s < .4, L !== LOTW); }
    }
    yield;
  }
  // The RV lot: rows nose to tail, awnings out, live oaks in the lanes.
  for (let k = 0; k < 4; k++){ const ry = 65.5 + k * 21.5; for (let rx = -148.5; rx + 8 < -95; rx += 7.6){
    const s = hash2(Math.round(rx * 3), Math.round(ry)); if (s < .08) continue;
    rvs.push([rx, ry, s]); gather(rx + 3, ry + 2, 3.4, 9, 3 + (s * 6 | 0), false);
    if (s < .55) grills.push([rx + 4.6, ry + 10.6]); else gear.push([rx + 4, ry + 10.4, s]);
    if (s > .55) flags.push([rx + 2.6, ry - .4, false]);
  } }
  for (const [x, y] of [[-140, 81], [-112, 102.5], [-128, 124], [-104, 145]]) tree(x, y, 4.4, 'live');
  // The grove: old live oaks on a loose grid, tents packed in under and between them, a crowd on its walks.
  for (let gy = -118; gy < -12; gy += 12.5) for (let gx = -146; gx < -66; gx += 12.5){
    const x = gx + (hash2(gx | 0, gy | 0) - .5) * 6, y = gy + (hash2(gy | 0, gx | 0) - .5) * 6, s = hash2(x * 5 | 0, y * 3 | 0);
    if (s > .88 || !(at(x, y) === GROVE)) continue;
    tree(x, y, 5.4 + hash2(x | 0, y | 0) * 2.6, 'live', s);
  }
  for (let ty = -122; ty < -13; ty += 4.4) for (let tx = -149; tx < -68; tx += 4.2){
    const x = tx + (hash2(tx | 0, 5) - .5) * .9, y = ty + (hash2(ty | 0, tx | 0) - .5) * .7, s = hash2(Math.round(tx * 3) + 7, Math.round(ty * 3));
    if (!(at(x, y) === GROVE && at(x + 3.3, y + 3.3) === GROVE)) continue;
    const cl = vn(x * .085 + 3, y * .085 - 2);   // tailgates cluster (a group's tents side by side), lawn open between
    if (cl < .38 || s > .84){ if (hash2(tx | 0, ty | 0) < .3) gather(x, y, 3.6, 3.6, 3, false); continue; }
    const vis = x > -96 && y < -96 && s < .5;   // a visitors' corner by the road
    tents.push([x, y, s, vis]); gather(x - .6, y - .6, 4.6, 4.6, 3 + (s * 5 | 0), vis);
    if (s < .2) grills.push([x + 3.5, y + 3.4]); else if (s < .45) gear.push([x + .4, y + 3.6, s]);
    if (s > .62) flags.push([x + 3.4, y - .2, vis]);
  }
  gather(-121, -120, 2.5, 66, 60, false); gather(-150, -80, 40, 4, 40, false);
  yield;
  // Langford Green: live oaks down both edges, Fan Fest (sponsors' big tents along the walk, tailgates, a giant helmet,
  // a bounce house, food trucks), the crowd packed in at the stage.
  for (let x = -147; x < -117; x += 9.4) for (const yy of [LG[1] + 4.6, LG[3] - 4.6]) tree(x + (hash2(x | 0, yy | 0) - .5) * 1.6, yy + (hash2(yy | 0, x | 0) - .5) * 1.2, 4.2 + hash2(x | 0, 9) * 1.2, 'live');
  for (const x of [-139, -132.5, -126]) for (const yy of [CY - 8.6, CY + 3.9]) tents.push([x, yy, hash2(x | 0, yy | 0), false, 1]);
  for (let tx = -141; tx < -117; tx += 4.6) for (const ty of [6, 10.6, 37.6, 42.2]){
    const s = hash2(Math.round(tx * 3), Math.round(ty * 3) + 5); if (s > .78 || Math.hypot(tx + 1.6 + 121.5, ty + 1.6 - (ty < CY ? 10 : 43)) < 5.4) continue;
    tents.push([tx, ty, s, false]); gather(tx - .5, ty + 3.4, 4.2, 1.2, 3, false); if (s < .2) grills.push([tx + 3.4, ty + 3]); if (s > .62) flags.push([tx + 3.4, ty - .2, false]);
  }
  for (let x = -146; x < -122; x += 7.4) trucks.push([x, 50.6, 'food', hash2(x | 0, 77)]);
  gather(-146, 47.4, 26, 2.6, 60, false);
  for (let k = 0; k < 420; k++){ const a = (hash2(k, 61) - .5) * 2.6, rad = 1.6 + Math.pow(hash2(k, 62), .7) * 12, x = -142 + Math.cos(a) * rad, y = CY + Math.sin(a) * rad * 1.3; if (x < -141.6 || Math.abs(y - CY) < 3.4) continue; folk.push([x, y, false]); }
  gather(LG[0], LG[1] + 1, LG[2] - LG[0], LG[3] - LG[1] - 2, 180, false);
  const HELM = [-121.5, 10], BNC = [-121.5, 43];
  // The Unconquered's plaza: sabal palms in its beds, flagpoles either side of the walk in, a crowd round it.
  for (let k = 0; k < 4; k++){ const a = (k + .5) * 1.5708; tree(STAT[0] + Math.cos(a) * 6.4, STAT[1] + Math.sin(a) * 6.4, 2.6, 'palm', k * .23 + .1); }
  for (const sg of [-1, 1]) fpoles.push([STAT[0] - 12.6, STAT[1] + sg * 4.8, sg < 0 ? 0 : 1]);
  for (let k = 0; k < 170; k++){ const a = hash2(k, 31) * 6.2832, rad = 4.4 + hash2(k, 32) * 6.4; folk.push([STAT[0] + Math.cos(a) * rad, STAT[1] + Math.sin(a) * rad, false]); }
  // The arcade's plaza: palms and crape myrtles in the beds, banner lamps round the edge, crowds at every gate (lines
  // through the security tents and the turnstiles), concession stands either side of the gates, fans all round.
  for (let th = 0, last = -99, acc = 0, prev = onUC(0, 5); th < 6.2832; th += .003){
    const p = onUC(th, 5); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
    if (acc - last < 5.4) continue;
    const m = ((ucS(p[0], p[1], 5) + 1000) % 16 + 16) % 16; if (gateD(p[0], p[1]) < 14 || m < 3.6 || m > 12.4) continue;
    last = acc; const k = Math.round(acc / 5.4); tree(p[0], p[1], k % 2 ? 1.9 : 2.5, k % 2 ? 'myrtle' : 'palm', hash2(k, 3));
  }
  yield;
  for (let th = 0, last = -99, acc = 0, prev = onUC(0, 8.1); th < 6.2832; th += .003){
    const p = onUC(th, 8.1); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
    if (acc - last < 11 || gateD(p[0], p[1]) < 9) continue; last = acc; lampsP.push(p);
  }
  yield;
  for (const [gx, gy, nx, ny, main] of GATES){
    const tx = -ny, ty = nx, out = main ? (nx < 0 ? 3.6 : 9.4) : 7.6, corner = nx && ny;
    for (let q = -2; q <= 2; q++){ if ((main && q === 0) || corner) continue; tents.push([gx + nx * out + tx * q * 3.3 - 1.6, gy + ny * out + ty * q * 3.3 - 1.6, .5, false, 3]); }
    if (!corner) for (let q = -3; q <= 3; q++) rails.push([gx + nx * (out + 2.6) + tx * q * 2.2, gy + ny * (out + 2.6) + ty * q * 2.2, nx, ny, 4]);
    for (let q = -3; q <= 3; q++){ const L = 3 + hash2(gx | 0, q + 9) * 6; for (let s = .8; s < out - 3.4; s += .66) folk.push([gx + nx * s + tx * q * 1.1, gy + ny * s + ty * q * 1.1, false]); for (let s = out + 3; s < out + 3 + L; s += .66) folk.push([gx + nx * s + tx * q * 1.15, gy + ny * s + ty * q * 1.15, false]); }
    for (let k = 0; k < (main ? 120 : 60); k++){ const rd = 3 + Math.pow(hash2(k, gx | 0), 1.4) * 12, lat = (hash2(k + 50, gy | 0) - .5) * (10 + rd * 1.6); folk.push([gx + nx * rd + tx * lat, gy + ny * rd + ty * lat, false]); }
    for (const sg of [-1, 1]) stands.push([gx + nx * 4.4 + tx * sg * (main ? 12 : 10.5), gy + ny * 4.4 + ty * sg * (main ? 12 : 10.5), nx !== 0 && ny === 0]);
  }
  for (let k = 0; k < 2600; k++){   // the walk round the building, busiest near the gates
    const p = onUC(hash2(k, 401) * 6.2832, .8 + hash2(k, 402) * 7.6), dU = sdU(p[0], p[1]), m = ((ucS(p[0], p[1], dU) + 1000) % 16 + 16) % 16, dg = gateD(p[0], p[1]);
    if (dU > 3.2 && dU < 6.8 && dg > 13 && m > 2.6 && m < 13.4) continue;
    if (hash2(k, 403) < .22 + .78 * Math.exp(-dg / 14)) folk.push([p[0], p[1], false]);
  }
  yield;
  // The Bowden statue in front of the Moore building, its planters; the walk out to the practice field.
  const BOW = [183.4, CY];
  for (const sg of [-1, 1]) for (let k = 1; k <= 3; k++) tree(183.6, CY + sg * (k * 13 + 4), 2, 'myrtle', k * .3);
  gather(180, CY - 12, 7, 24, 70, false);
  // Along the roads: live oaks and magnolias in the lawns, lamps on the sidewalks.
  for (const R of roads){
    const hw = R.rw + .34 + R.sw;
    for (const s of R.segs) for (let a = 4; a < s.L - 2; a += 11){
      const x = s.xa + s.ux * a, y = s.ya + s.uy * a;
      for (const sg of [-1, 1]){
        const nx = -s.uy * sg, ny = s.ux * sg, tx = x + nx * (hw + 2.4), ty = y + ny * (hw + 2.4);
        if (open(tx, ty, 2.4)) tree(tx, ty, 2.8 + hash2(a | 0, sg + 5) * 1.2, hash2(a | 0, sg + 11) < .25 ? 'mag' : 'live');
        if (((a / 11) | 0) % 2 === 0){ const lx = x + nx * (R.rw + .9), ly = y + ny * (R.rw + .9); if (sdU(lx, ly) > 1) lamps.push([lx, ly]); }
      }
    }
  }
  yield;
  // North: the practice field (the Marching Chiefs running their pregame show at midfield, sleds, the filming tower),
  // the Sod Cemetery's live oaks, the TV compound, Howser's light standards.
  const F = PFLD.F, bandBlk = [];
  for (let rw = 0; rw < 11; rw++) for (let cl = 0; cl < 16; cl++) bandBlk.push([214.4 + rw * .95, CY - 7.2 + cl * .95, rw < 1 ? 1 : rw === 10 ? 2 : 0]);
  gather(195, -30, 2, 110, 26, false);
  const sleds = [[244.6, -4], [244.6, 56]], FTWR = [192.2, -20];
  for (const [x, y] of [[197, -51], [228.6, -55], [197, -68.6]]) if (open(x, y, 2)) tree(x, y, 3.4, 'live');
  gather(203, -46, 18, 2, 20, false);
  for (const [x, y] of [[130, -96.6], [147.4, -96.6], [130, -92.4]]) trucks.push([x, y, 'trailer', 0]);
  trucks.push([150, -91.6, 'uplink', 0], [157.6, -91.6, 'uplink', 1], [160, -87.6, 'gen', 0]);
  tents.push([136, -88.6, .5, false, 2], [139.6, -88.6, .5, false, 2]);
  gather(132, -90, 30, 5, 30, false);
  for (const p of [[221, 128.8], [184.6, 165], [247, 129.6], [187, 185.6]]) poles.push(p);
  gather(184, 127, 30, 3, 40, false);
  // Fill: trees wherever there's open lawn, in clumps (and never on top of anything).
  for (let n = 0; n < 9000; n++){
    const x = X0 + 3 + hash2(n, 91) * (X1 - X0 - 6), y = Y0 + 3 + hash2(n, 17) * (Y1 - Y0 - 6);
    const dens = .15 + hash2(Math.floor(x / 18), Math.floor(y / 18) + 500) * .9; if (hash2(n, 33) > dens * .32) continue;
    const kk = hash2(n, 6), kind = kk < .5 ? 'live' : kk < .74 ? 'pine' : kk < .84 ? 'mag' : 'round', R = (kind === 'live' ? 3.4 : 2.4) + hash2(n, 5) * 2.6, s = at(x, y);
    if (s === GROVE || s === LGR || !open(x, y, R * .7) || Math.hypot(x - HELM[0], y - HELM[1]) < 6 || Math.hypot(x - BNC[0], y - BNC[1]) < 6) continue;
    tree(x, y, R, kind, hash2(n, 8));
  }
  // People walking in to the gates (animated in paintFly): x0, y0, x1, y1, phase, speed, color.
  const walk = [];
  for (let n = 0; n < 280; n++){
    const [gx, gy, nx, ny, main] = GATES[n % GATES.length], tx = -ny, ty = nx, lat = (hash2(n, 1) - .5) * (main ? 22 : 34), dist = 16 + hash2(n, 2) * 26, l1 = lat * .1;
    walk.push(gx + nx * dist + tx * lat, gy + ny * dist + ty * lat, gx + nx * 4 + tx * l1, gy + ny * 4 + ty * l1, hash2(n, 3), .03 + hash2(n, 4) * .03, hash2(n, 6) < .5 ? 0 : hash2(n, 6) < .75 ? 1 : 2);
  }
  yield;

  // ---------------------------------------------------------------- sprites
  const LK = night ? 2.5 : 1;   // tents and RVs are lit from inside at night
  // The trees' crowns: clumps of foliage as a heightfield, each lit as a sphere from the sun, leafy noise, creases
  // between; Spanish moss in the live oaks' creases and hanging off their shaded side; palms as a star of arching
  // fronds; crape myrtles in bloom; magnolias' glossy leaves catching the light.
  const atlas = new Map();
  const treeSprite = (kind, R, pal, v) => {
    const key = `${kind}${R}${pal}${v}`; let t = atlas.get(key); if (t) return t;
    const n = Math.ceil(R * OS * 1.1) * 2 + 2, half = n / 2, cv2 = A.canvas(n, n), x2 = cv2.getContext('2d'), im = x2.createImageData(n, n), D = im.data;
    const sv = A.canvas(n, n), s2c = sv.getContext('2d'), si = s2c.createImageData(n, n), SDt = si.data, cr = new Uint8Array(n * n);
    const P = PAL[pal].map(q => tone(...q)), PS = snow ? PAL.snow.map(q => tone(...q)) : null, MS = MOSS.map(q => tone(...q)), sd0 = v * 131 + (R * 10 | 0) * 7 + pal.length + kind.length * 17;
    const BLO = [[150, 50, 92], [196, 78, 128], [226, 118, 164], [244, 170, 200]].map(q => tone(...q)), GLS = tone(150, 178, 140), BOOT = tone(92, 76, 52);
    const cl = [];
    if (kind !== 'pine' && kind !== 'palm'){
      const N = 4 + Math.round(R * (kind === 'live' ? 1.8 : 1.1));
      cl.push([0, 0, R * .6]);
      for (let k = 1; k < N; k++){ const a = hash2(sd0, k) * 6.2832, rc = R * (.3 + hash2(sd0, k + 90) * .2), m = Math.min(R * (.3 + hash2(sd0, k + 50) * .45), R - rc); cl.push([Math.cos(a) * m, Math.sin(a) * m, rc]); }
    }
    const rot = v * .41 + sd0 * .013, NF = 9, sector = 6.2832 / NF;
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++){
      const x = (px + .5 - half) / OS, y = (py + .5 - half) / OS, q = (py * n + px) * 4, hh = hash2(px + sd0 * 3, py + 7);
      let nx = 0, ny = 0, nz = 1, crease = 0, col = null;
      if (kind === 'palm'){
        const rad = Math.hypot(x, y); if (rad > R) continue;
        const th = Math.atan2(y, x) - rot, k = Math.round(th / sector), dth = th - k * sector, fa = k * sector + rot, len = R * (.8 + hash2(sd0, k + 20) * .2);
        if (rad > len) continue;
        const across = rad * Math.sin(dth), w = R * .16 * Math.sin(Math.PI * Math.min(1, rad / len)) + .12;
        if (Math.abs(across) > w) continue;
        if (Math.abs(across) > w * .55 && (((rad * OS * 1.6) | 0) & 1) && hh < .6) continue;   // the leaflets
        if (rad < R * .14) col = BOOT;
        const sl = rad / len; nx = Math.cos(fa) * sl * .85; ny = Math.sin(fa) * sl * .85; nz = Math.sqrt(Math.max(.05, 1 - nx * nx - ny * ny));
        crease = Math.abs(across) < .12 ? -.14 : 0;
      } else if (kind === 'pine'){
        const rad = Math.hypot(x, y), th = Math.atan2(y, x), lim = R * (.8 + .2 * Math.abs(Math.cos(th * 3.5 + v))) * (.92 + hash2(Math.floor((th + 4) * 8), sd0) * .1);
        if (rad > lim) continue;
        const s = rad / lim; nx = x / (rad + .01) * .6; ny = y / (rad + .01) * .6; nz = .8;
        crease = Math.abs(Math.cos(th * 7 + rad * 1.4 + v)) < .25 ? .16 : 0; if (s > .82 && hh < .3) continue;
      } else {
        let z1 = -1, z2 = -1;
        for (const [cx, cy, rc] of cl){ const dx = x - cx, dy = y - cy, qq = 1 - (dx * dx + dy * dy) / (rc * rc); if (qq <= 0) continue; const z = rc * Math.sqrt(qq) + R * .28 * (1 - Math.hypot(cx, cy) / R); if (z > z1){ z2 = z1; z1 = z; nx = dx / rc; ny = dy / rc; nz = Math.sqrt(qq); } else if (z > z2) z2 = z; }
        if (z1 < 0 || (nz < .28 && hh < .4)) continue;   // a ragged, leafy edge
        if (z2 > 0 && z1 - z2 < R * .1) crease = .2;
      }
      const sh = nx * L3[0] + ny * L3[1] + nz * L3[2];
      const lv = sh * .62 + .36 + (hash2((px >> 1) + sd0, (py >> 1) + 3) - .5) * .34 + (hh - .5) * .14 - crease - (nz < .3 ? .1 : 0);
      const ix = clamp(Math.floor(lv * 5), 0, 4);
      if (!col){
        col = PS && nz > .5 && sh > .15 && hh > .2 ? PS[clamp(ix, 1, 4)] : P[ix];
        if (!PS && kind === 'live' && crease > 0 && hash2(px + sd0, py * 5) < .45) col = MS[clamp(ix - 1, 0, 3)];
        else if (!PS && kind === 'myrtle' && hh > .55 && hash2((px >> 1) + sd0, (py >> 1) + 9) > .35) col = BLO[clamp(ix - 1, 0, 3)];
        else if (!PS && kind === 'mag' && sh > .5 && hh > .82) col = GLS;
      }
      D[q] = col[0]; D[q + 1] = col[1]; D[q + 2] = col[2]; D[q + 3] = 255; SDt[q] = 16; SDt[q + 1] = 20; SDt[q + 2] = 46; SDt[q + 3] = 255; cr[py * n + px] = 1;
    }
    if (kind === 'live' && !snow) for (let py = 2; py < n; py++) for (let px = 1; px < n; px++){   // the moss hanging off the shaded side
      const o = py * n + px; if (cr[o] || !(cr[o - n - 1] || cr[o - 2 * n]) || hash2(px + sd0, py * 3) > .28 || (px - half) * SD[0] + (py - half) * SD[1] < 0) continue;
      const col = MS[hash2(px, py + sd0) < .5 ? 0 : 1], q = o * 4; D[q] = col[0]; D[q + 1] = col[1]; D[q + 2] = col[2]; D[q + 3] = 255;
    }
    x2.putImageData(im, 0, 0); s2c.putImageData(si, 0, 0);
    t = { c: cv2, s: sv, n }; atlas.set(key, t); return t;
  };
  const sprOf = t => treeSprite(t[3], Math.round(t[2] * 2) / 2, t[4], (t[5] * 4 | 0) & 3);
  for (let k = 0, made = atlas.size; k < trees.length; k++){ sprOf(trees[k]); if (atlas.size - made >= 6){ made = atlas.size; yield; } }
  // Cars: each kind in each color, both ways up and both ways across.
  const carAtlas = new Map();
  const carSprite = (kind, ci, vert, flip) => {
    const key = `${kind}${ci}${vert}${flip}`; let t = carAtlas.get(key); if (t) return t;
    const tp = CART[kind], L = tp.length, w = vert ? 6 : L, h = vert ? L : 6, cv2 = A.canvas(w, h), x2 = cv2.getContext('2d'), im = x2.createImageData(w, h), D = im.data;
    const q = CARC[ci], snowy = snow ? [236, 240, 248] : null;
    const COL = { b: q, B: q.map(v => v * 1.14 + 6), d: q.map(v => v * .74), r: snowy || q.map(v => v * 1.07 + 4), R: [70, 72, 78], g: [34, 42, 54], G: [90, 108, 128], k: q.map(v => v * .5) };
    for (let r0 = 0; r0 < L; r0++) for (let cc = 0; cc < 6; cc++){
      const ch = tp[flip ? L - 1 - r0 : r0][cc]; if (ch === '.') continue;
      let col = COL[ch]; if (snowy && (ch === 'b' || ch === 'B') && hash2(r0, cc + ci) > .3) col = snowy;
      const tc = tone(...col), px = vert ? cc : (flip ? r0 : L - 1 - r0), py = vert ? r0 : cc, o = (py * w + px) * 4;
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
  for (const [x, y, s] of rvs){   // an RV from above: roof, AC units, windshield; the awning out to its right, striped garnet and gold
    const X = wx(x), Y = wy(y), body = s > .55 ? [236, 232, 222] : [212, 206, 194];
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 3, Y + 1, 8, 32); c.fillRect(X + 16, Y + 5, 2, 20); }
    const aw = [GAR, GAR, GAR, GLD, [52, 92, 150], [186, 160, 116]][(s * 71 | 0) % 6], solid = (s * 13) % 1 < .3;
    for (let k = 0; k < 11; k++){ c.fillStyle = T(k & 1 && !solid ? (aw === GAR ? GLD : WHITE) : aw, LK * (solid && k & 1 ? .92 : 1)); c.fillRect(X + 9, Y + 4 + k * 2, 7, 2); }
    c.fillStyle = T(body, .82); c.fillRect(X, Y, 8, 32); c.fillStyle = T(body, 1.05); c.fillRect(X, Y, 7, 31);
    c.fillStyle = T(body, 1.2); c.fillRect(X + 1, Y + 1, 5, 1);
    c.fillStyle = T([150, 152, 158]); c.fillRect(X + 2, Y + 9, 3, 3); c.fillRect(X + 2, Y + 21, 3, 3);
    c.fillStyle = night ? 'rgb(255,214,140)' : T([40, 54, 72]); c.fillRect(X + 1, Y + 1, 5, 2); if (night){ c.fillRect(X + 7, Y + 8, 1, 2); c.fillRect(X + 7, Y + 16, 1, 2); }
    c.fillStyle = T(GAR); c.fillRect(X, Y + 27, 7, 1); c.fillStyle = T(GLD); c.fillRect(X, Y + 28, 7, 1);
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
      const L = Math.round(6.6 * OS), Wd = Math.round(2.8 * OS);
      if (!night){ c.fillStyle = 'rgba(8,10,24,.36)'; c.fillRect(X + 4, Y + 2, L, Wd); }
      c.fillStyle = T([232, 232, 228]); c.fillRect(X, Y, L, Wd); c.fillStyle = T([40, 54, 72]); c.fillRect(X + L - 3, Y + 1, 1, Wd - 2);
      disc(x + 2.8, y + 1.4, 1.7, T([206, 206, 204])); disc(x + 2.5, y + 1.2, 1.2, T([236, 236, 234])); c.fillStyle = T([60, 60, 66]); c.fillRect(wx(x + 2.8), wy(y + 1.4), 1, 1);
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
  // Fan Fest's giant inflatable helmet (garnet, the gold stripe, the facemask) and the bounce house.
  {
    const [hx, hy] = HELM, R = 3.4, n = Math.round(R * 2 * OS), X = wx(hx - R), Y = wy(hy - R);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; const [dx, dy] = shv(4); disc(hx + dx, hy + dy, R * .95, 'rgba(8,10,24,.34)'); }
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++){
      const u = (px + .5) / n * 2 - 1, v = (py + .5) / n * 2 - 1, q = u * u + v * v; if (q > 1) continue;
      const nz = Math.sqrt(1 - q), sh = u * L3[0] + v * L3[1] + nz * L3[2], k = (.55 + sh * .6) * LK * .7 + (night ? .2 : 0);
      let col = GAR; if (Math.abs(v) < .1) col = GLD; else if (Math.abs(v) < .16) col = WHITE;
      if (u > .62 && Math.abs(v) < .7 && (((v + 1) * n / 3) | 0) % 2 === 0) col = [210, 210, 214];   // the facemask's bars
      c.fillStyle = T(col, Math.round(k * 8) / 8); c.fillRect(X + px, Y + py, 1, 1);
    }
    const [bx, by] = BNC, bw = Math.round(4.4 * OS), bxp = wx(bx - 2.2), byp = wy(by - 2.2);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(bxp + 4, byp + 2, bw, bw); }
    for (let k = 0; k < bw; k++){ c.fillStyle = T([GAR, GLD, WHITE][((k / 2) | 0) % 3], LK * .9); c.fillRect(bxp + k, byp, 1, 2); c.fillRect(bxp + k, byp + bw - 2, 1, 2); c.fillRect(bxp, byp + k, 2, 1); c.fillRect(bxp + bw - 2, byp + k, 2, 1); }
    c.fillStyle = T([40, 90, 170], LK * .8); c.fillRect(bxp + 2, byp + 2, bw - 4, bw - 4); c.fillStyle = T([60, 120, 200], LK * .8); c.fillRect(bxp + 3, byp + 3, bw - 7, 2);
    for (let k = 0; k < 4; k++){ c.fillStyle = T([GLD, GAR][k & 1], LK); c.fillRect(bxp - 1 + (k & 1) * (bw - 1), byp - 1 + (k >> 1) * (bw - 1), 3, 3); }   // the turrets at its corners
    gather(bx - 3, by - 3, 6, 6, 12, false);
  }
  // Tents: a canopy from above, four faces round a peak, the sunlit ones lighter, a valance round the edge.
  // sp: 1 a sponsor's big tent, 2 white catering, 3 the security tents at the gates.
  const TENT = [GAR, GAR, WHITE, GLD, GAR, [210, 210, 214], [52, 52, 58]];
  const tentPx = (x, y, s, vis, sp) => {
    const big = sp === 1, n = big ? 14 : 10, hn = n >> 1, X = wx(x), Y = wy(y);
    const q = sp === 2 || sp === 3 ? WHITE : big ? [WHITE, GAR, WHITE, GLD][(s * 40 | 0) % 4] : vis ? (s < .3 ? oc : s < .44 ? WHITE : s < .52 ? oa : oc) : TENT[(s * 60 | 0) % TENT.length];
    const val = big ? (q === GAR ? GLD : GAR) : !sp && (s * 37) % 1 < .34 ? (q === WHITE ? (vis ? oc : GAR) : q === GAR ? GLD : WHITE) : null;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(X + 3, Y + 1, n, n); }
    c.fillStyle = T(q, .74 * LK); c.fillRect(X, Y, n, n);
    c.fillStyle = T(q, .86 * LK); for (let k = 0; k < hn; k++) c.fillRect(X + k + 1, Y + n - 1 - k, n - 2 - 2 * k, 1);
    c.fillStyle = T(q, 1.02 * LK); for (let k = 0; k < hn; k++) c.fillRect(X + k, Y + k + 1, 1, n - 2 - 2 * k);
    c.fillStyle = T(q, 1.16 * LK); for (let k = 0; k < hn; k++) c.fillRect(X + k, Y + k, n - 2 * k, 1);
    c.fillStyle = T(q, 1.3 * LK); c.fillRect(X + hn - 1, Y + hn - 1, 2, 2);
    if (val){ c.fillStyle = T(val, .95 * LK); c.fillRect(X, Y + n - 1, n, 1); c.fillRect(X + n - 1, Y, 1, n); if (big){ c.fillRect(X, Y, n, 1); c.fillRect(X, Y, 1, n); } }
  };
  let ntn = 0; for (const [x, y, s, vis, sp] of tents){ tentPx(x, y, s, vis, sp); if ((++ntn & 63) === 0) yield; }
  const GEAR = [[220, 40, 40], [40, 90, 200], WHITE, GAR, GLD, [60, 150, 80]];
  for (const [x, y, s] of gear){
    if (s < 0){ c.fillStyle = T(GLD); c.fillRect(wx(x), wy(y), 2, 3); c.fillStyle = T(GAR); c.fillRect(wx(x), wy(y) + 1, 2, 1); continue; }
    c.fillStyle = T(GEAR[(s * 97 | 0) % GEAR.length]); c.fillRect(wx(x), wy(y), 2, 1); c.fillStyle = T(WHITE); c.fillRect(wx(x), wy(y) + 1, 2, 1);
    c.fillStyle = T(GEAR[(s * 53 | 0) % GEAR.length], .8); c.fillRect(wx(x) + 3, wy(y), 1, 1); c.fillRect(wx(x) + 5, wy(y) + 1, 1, 1);
  }
  for (const [x, y] of grills){ c.fillStyle = T([34, 34, 38]); c.fillRect(wx(x), wy(y), 2, 2); c.fillStyle = night ? '#ff9a40' : T([90, 88, 86]); c.fillRect(wx(x), wy(y), 1, 1); }
  for (const [x, y, nx, ny, L] of rails){ c.fillStyle = T([150, 152, 158]); for (let s = 0; s < L; s += .66) c.fillRect(wx(x + nx * s), wy(y + ny * s), 1, 1); }   // the queue rails
  for (const [x, y, vert] of stands){   // the concession stands, striped awnings
    const w = vert ? 2.6 : 4.4, h = vert ? 4.4 : 2.6, X = wx(x - w / 2), Y = wy(y - h / 2), pw = Math.round(w * OS), ph = Math.round(h * OS);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 3, Y + 1, pw, ph); }
    for (let k = 0; k < (vert ? ph : pw); k += 2){ c.fillStyle = T(k & 2 ? GLD : GAR, LK); if (vert) c.fillRect(X, Y + k, pw, 2); else c.fillRect(X + k, Y, 2, ph); }
    c.fillStyle = T([60, 60, 66]); if (vert) c.fillRect(X, Y, 1, ph); else c.fillRect(X, Y, pw, 1);
    gather(x - w, y - h, w * 2, h * 2, 10, false);
  }
  const SH = [GAR, GAR, GAR, GLD, GLD, WHITE, GAR, ...NEUT], VSH = [oc, oc, oc, oa, WHITE, NEUT[0]], fcs = SH.map(q => T(q)), vcs = VSH.map(q => T(q)), sk = SKIN.map(q => T(q));
  for (let n = 0; n < folk.length; n++){
    const [x, y, vis] = folk[n], h = hash2(n, 77), X = wx(x), Y = wy(y);
    c.fillStyle = vis ? vcs[(h * vcs.length) | 0] : fcs[(h * fcs.length) | 0]; c.fillRect(X, Y, 1, 1);
    if (h > .7){ c.fillStyle = sk[(h * 50 | 0) % 5]; c.fillRect(X, Y - 1, 1, 1); }
    if ((n & 1023) === 1023) yield;
  }
  for (const [x, y, k] of bandBlk){ const X = wx(x), Y = wy(y); c.fillStyle = T(k === 1 ? WHITE : k === 2 ? GLD : GAR); c.fillRect(X, Y, 1, 1); if (!k){ c.fillStyle = T(WHITE); c.fillRect(X - 1, Y, 1, 1); } }   // the Chiefs: garnet, white plumes, the drum line in gold
  for (const [x, y] of sleds){   // a five-man sled: the frame, its pads
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(wx(x - .6) + 3, wy(y - 2.2) + 1, Math.round(1.2 * OS), Math.round(4.4 * OS)); }
    rect(x - .6, y - 2.2, 1.2, 4.4, T([60, 62, 68])); for (let k = 0; k < 3; k++) rect(x - 1.1, y - 1.9 + k * 1.45, .8, .9, T(GAR));
  }
  yield;

  // ---------------------------------------------------------------- the arcade's towers: battlements round a slate pyramid
  const towers = [];
  for (const [gx, gy, nx, ny, main] of GATES) for (const sg of [-1, 1]){ const z = main ? 3.4 : 2.7, l = main ? 9 : 7.4; towers.push([gx - nx * (z + .6) - ny * sg * l, gy - ny * (z + .6) + nx * sg * l, z, main]); }
  const twAtlas = new Map();
  const towerSpr = z => {
    let t = twAtlas.get(z); if (t) return t;
    const n = Math.round(z * 2 * OS) + 2, half = n / 2, cv2 = A.canvas(n, n), x2 = cv2.getContext('2d'), im = x2.createImageData(n, n), D = im.data, nm = Math.max(3, Math.round(n / 4)) | 1;
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++){
      const u = (px + .5 - half) / half, v = (py + .5 - half) / half, au = Math.abs(u), av = Math.abs(v), m = Math.max(au, av), o = (py * n + px) * 4, hh = hash2(px + 70, py + n);
      const nx = au >= av ? Math.sign(u) : 0, ny = au >= av ? 0 : Math.sign(v), lit = nx * LX + ny * LY;
      let col, k = 1;
      if (m > .8){   // the battlement: merlons and crenels round the parapet
        const p = au >= av ? v : u, mer = (((p + 1) / 2 * nm) | 0) & 1;
        if (m > .94){ col = STONE; k = lit > 0 ? 1.12 : .8; }
        else if (mer){ col = snow ? [236, 240, 248] : STONE; k = lit > 0 ? 1.05 : .9; }
        else { col = STONE2; k = .6; }
      } else if (m > .7){ col = [74, 68, 66]; k = 1; }   // the wall-walk, in the parapet's shadow
      else if (m < .12){ col = STONE; k = 1.2; }   // the finial
      else if (Math.abs(au - av) < .06){ col = snow ? [240, 242, 250] : STONE2; k = 1.05; }   // the hips
      else { col = snow ? [234, 238, 246] : SLATE; const row = ((.7 - m) * half * 1.5) | 0; k = (1 + lit * .3) * (row & 1 ? 1 : .9) * (.95 + hh * .08); }
      if (night){ k *= m > .7 ? 1.9 : 1.3; }
      const tc = tone(col[0] * k, col[1] * k, col[2] * k); D[o] = tc[0]; D[o + 1] = tc[1]; D[o + 2] = tc[2]; D[o + 3] = 255;
    }
    x2.putImageData(im, 0, 0); t = { c: cv2, n }; twAtlas.set(z, t); return t;
  };

  // ---------------------------------------------------------------- shadows: one layer for everything that stands up
  const SHC = '#10142e';
  const allPoles = [...lamps.map(p => [p[0], p[1], 7]), ...lampsP.map(p => [p[0], p[1], 5]), ...poles.map(p => [p[0], p[1], 30]), ...fpoles.map(p => [p[0], p[1], 13])];
  const GOALS = [[F[1], 1], [F[3], -1]];
  if (!night){
    const sh = A.canvas(W, H), s2 = sh.getContext('2d'); s2.fillStyle = SHC;
    { const [dx, dy] = shv(22); for (let k = 1; k <= 12; k++) s2.drawImage(mask, Math.round(dx * OS * k / 12), Math.round(dy * OS * k / 12)); }
    yield;
    { const [dx, dy] = shv(7); for (let k = 1; k <= 5; k++) s2.drawImage(mmid, Math.round(dx * OS * k / 5), Math.round(dy * OS * k / 5)); }
    s2.globalCompositeOperation = 'source-in'; s2.fillRect(0, 0, W, H); s2.globalCompositeOperation = 'source-over';
    yield;
    const ext = (x, y, w, h, ht) => {   // a box's shadow: its footprint swept along the sun to the roof's height
      const [dx, dy] = shv(ht), P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      s2.fillRect(wx(x), wy(y), wx(x + w) - wx(x), wy(y + h) - wy(y)); s2.fillRect(wx(x + dx), wy(y + dy), wx(x + w) - wx(x), wy(y + h) - wy(y));
      for (let e = 0; e < 4; e++){ const p = P[e], q = P[(e + 1) % 4]; s2.beginPath(); s2.moveTo(wx(p[0]), wy(p[1])); s2.lineTo(wx(q[0]), wy(q[1])); s2.lineTo(wx(q[0] + dx), wy(q[1] + dy)); s2.lineTo(wx(p[0] + dx), wy(p[1] + dy)); s2.fill(); }
    };
    for (const S2 of blds) ext(S2.x0, S2.y0, S2.x1 - S2.x0, S2.y1 - S2.y0, S2 === IPF ? S2.ht * .8 : S2.ht);
    yield;
    for (let k = 0; k < trees.length; k++){
      const t = trees[k], spr = sprOf(t), palm = t[3] === 'palm', [dx, dy] = shv(palm ? 9 + t[2] : 2 + t[2] * 1.3), X = wx(t[0]) - spr.n / 2, Y = wy(t[1]) - spr.n / 2;
      if (palm){ const m = Math.ceil(Math.hypot(dx, dy) * OS); for (let q = 0; q <= m; q++) s2.fillRect(wx(t[0] + dx * q / m), wy(t[1] + dy * q / m), 1, 1); s2.drawImage(spr.s, Math.round(X + dx * OS), Math.round(Y + dy * OS)); }
      else for (let q = 1; q <= 3; q++) s2.drawImage(spr.s, Math.round(X + dx * OS * q / 3), Math.round(Y + dy * OS * q / 3));
      if ((k & 127) === 127) yield;
    }
    for (const [x, y, ht] of allPoles){ const [dx, dy] = shv(ht), m = Math.ceil(Math.hypot(dx, dy) * OS); for (let k = 0; k <= m; k++) s2.fillRect(wx(x + dx * k / m), wy(y + dy * k / m), ht > 20 ? 2 : 1, 1); if (ht > 20) s2.fillRect(wx(x + dx) - 6, wy(y + dy) - 4, 12, 8); }
    for (const [x, y, z, main] of towers){ const [dx, dy] = shv(main ? 18 : 13), m = 8; for (let k = 0; k <= m; k++){ const zz = z * (1 - k / m * .45); s2.fillRect(wx(x - zz + dx * k / m), wy(y - zz + dy * k / m), Math.round(zz * 2 * OS), Math.round(zz * 2 * OS)); } }
    { const [x, y] = STAT; ext(x - 3.3, y - 3.3, 6.6, 6.6, 4); const [dx, dy] = shv(11); for (let k = 0; k <= 10; k++){ const u = k / 10, w = u < .6 ? 1.6 : .7; s2.fillRect(wx(x + dx * (.45 + u * .55) - w), wy(y + dy * (.45 + u * .55) - w * .7), Math.max(2, Math.round(w * 2 * OS)), Math.max(2, Math.round(w * 1.4 * OS))); } }
    { const [x, y] = BOW; ext(x - .9, y - .9, 1.8, 1.8, 4); }
    for (const [gy] of GOALS){ const [dx, dy] = shv(10), x0 = (F[0] + F[2]) / 2; for (let k = 0; k <= 30; k++){ s2.fillRect(wx(x0 - 3.1 + dx * k / 30), wy(gy + dy * k / 30), 1, 1); s2.fillRect(wx(x0 + 3.1 + dx * k / 30), wy(gy + dy * k / 30), 1, 1); } const [ex, ey] = shv(3.3); s2.fillRect(wx(x0 - 3.1 + ex), wy(gy + ey), Math.round(6.2 * OS), 1); }
    { const [dx, dy] = shv(9); ext(FTWR[0] - 1.2, FTWR[1] - 1.2, 2.4, 2.4, 9); s2.fillRect(wx(FTWR[0] + dx) - 4, wy(FTWR[1] + dy) - 4, 8, 8); }
    { ext(210, -45.4, .9, .9, 4); ext(213.4, -45.4, .9, .9, 4); }   // the Sod Cemetery's gate piers
    { const [hx, hy] = HELM, [dx, dy] = shv(5); for (let k = 0; k <= 4; k++) disc(hx + dx * k / 4, hy + dy * k / 4, 3.3, SHC, s2); }
    yield;
    s2.globalCompositeOperation = 'destination-out'; s2.drawImage(mno, 0, 0); s2.globalCompositeOperation = 'source-over';
    c.globalAlpha = noon ? .3 : .38; c.drawImage(sh, 0, 0); c.globalAlpha = 1;
    yield;
  }

  // ---------------------------------------------------------------- what stands over the ground
  for (let k = 0; k < trees.length; k++){ const t = trees[k], spr = sprOf(t); c.drawImage(spr.c, wx(t[0]) - spr.n / 2, wy(t[1]) - spr.n / 2); if ((k & 127) === 127) yield; }
  // lamp posts (the plaza's fly garnet and gold banners), flags
  for (const [x, y] of lampsP){ rect(x - .35, y - .35, .7, .7, T([40, 40, 46])); c.fillStyle = T(GAR, LK * .9); c.fillRect(wx(x) + 2, wy(y) - 1, 2, 4); c.fillStyle = T(GLD, LK * .9); c.fillRect(wx(x) + 2, wy(y) - 1, 2, 1); c.fillRect(wx(x) + 2, wy(y) + 3, 2, 1); }
  for (const [x, y] of lamps) rect(x - .3, y - .3, .6, .6, T([60, 60, 66]));
  for (const [x, y, vis] of flags){
    const X = wx(x), Y = wy(y), q = vis ? oc : GAR;
    if (!night){ const [dx, dy] = shv(4); c.fillStyle = 'rgba(8,10,24,.32)'; for (let k = 1; k <= 6; k++) c.fillRect(X + Math.round(dx * OS * k / 6), Y + Math.round(dy * OS * k / 6), 1, 1); }
    c.fillStyle = T([200, 200, 206]); c.fillRect(X, Y, 1, 1); c.fillStyle = T(q, 1.05); c.fillRect(X + 1, Y - 1, 4, 2); c.fillStyle = T(vis ? oa : GLD); c.fillRect(X + 1, Y, 4, 1); if (!vis){ c.fillStyle = T(WHITE); c.fillRect(X + 3, Y - 1, 1, 1); }
  }
  for (const [x, y, k] of fpoles){   // the plaza's flagpoles: Old Glory and the garnet and gold
    const X = wx(x), Y = wy(y); c.fillStyle = T([210, 210, 214]); c.fillRect(X, Y, 1, 1); c.fillStyle = T([236, 236, 240]); c.fillRect(X, Y - 1, 1, 1);
    if (k === 0){ for (let r0 = 0; r0 < 4; r0++){ c.fillStyle = T(r0 & 1 ? WHITE : [178, 34, 52]); c.fillRect(X + 1, Y - 3 + r0, 7, 1); } c.fillStyle = T([40, 56, 120]); c.fillRect(X + 1, Y - 3, 3, 2); }
    else { c.fillStyle = T(GAR); c.fillRect(X + 1, Y - 3, 7, 4); c.fillStyle = T(GLD); c.fillRect(X + 2, Y - 2, 5, 1); c.fillRect(X + 6, Y - 3, 1, 1); }
  }
  {   // the practice field's goalposts, its filming tower; the Sod Cemetery's gate
    const x0 = (F[0] + F[2]) / 2;
    for (const [gy] of GOALS){ c.fillStyle = T([236, 200, 60]); c.fillRect(wx(x0 - 3.1), wy(gy), Math.round(6.2 * OS), 1); c.fillRect(wx(x0) - 1, wy(gy) - 1, 2, 3); }
    rect(FTWR[0] - 1.2, FTWR[1] - 1.2, 2.4, 2.4, T([110, 112, 118])); rect(FTWR[0] - .9, FTWR[1] - .9, 1.8, 1.8, T([150, 152, 158])); c.fillStyle = T([40, 40, 46]); c.fillRect(wx(FTWR[0]), wy(FTWR[1]), 1, 1);
    rect(210, -45.4, .9, .9, T(BRICK[2])); rect(213.4, -45.4, .9, .9, T(BRICK[2])); rect(210.9, -45.1, 2.5, .3, T([30, 30, 36])); rect(211.6, -45.7, 1.1, .5, T(GAR)); c.fillStyle = T(STONE); c.fillRect(wx(210), wy(-45.4), 3, 1); c.fillRect(wx(213.4), wy(-45.4), 3, 1);
  }
  for (const [x, y] of poles){   // Howser's light standards
    const X = wx(x) - 6, Y = wy(y) - 3;
    c.fillStyle = T([70, 74, 84]); c.fillRect(X, Y, 12, 6); c.fillStyle = T([110, 114, 124]); c.fillRect(X, Y, 12, 1);
    c.fillStyle = night ? '#fffbe8' : T([220, 222, 226]); for (let k = 0; k < 3; k++){ c.fillRect(X + 1 + k * 4, Y + 2, 2, 2); }
  }
  yield;
  for (const [x, y, z] of towers){ const t = towerSpr(z); c.drawImage(t.c, wx(x) - (t.n >> 1), wy(y) - (t.n >> 1)); }
  for (const [x, y, z, main] of towers){ if (!main) continue; const X = wx(x), Y = wy(y); c.fillStyle = T([200, 200, 206]); c.fillRect(X, Y - 4, 1, 4); c.fillStyle = T(GAR, LK * .9); c.fillRect(X + 1, Y - 5, 5, 3); c.fillStyle = T(GLD, LK * .9); c.fillRect(X + 1, Y - 4, 5, 1); }
  yield;
  {   // the Unconquered: Osceola on Renegade on the granite plinth, the plaque toward the green, all in bronze
    const [x, y] = STAT;
    for (const [z, k] of [[3.3, .74], [2.7, .9], [2.1, 1.04]]){ rect(x - z, y - z, z * 2, z * 2, T([176, 170, 162], k)); rect(x - z, y - z, z * 2, .34, T([214, 208, 198], k)); rect(x - z, y - z, .34, z * 2, T([206, 200, 190], k)); }
    rect(x - 3.3, y - .6, .45, 1.2, T(GLD, 1.1));
    const BZ = { h: T([200, 150, 90]), L: T([170, 122, 70]), B: T([128, 88, 52]), b: T([88, 60, 38]), S: T([110, 80, 54]), F: T([62, 42, 28]), T: T([214, 214, 220]) };
    const X = wx(x) - 10, Y = wy(y) - 12;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.3)'; for (let r0 = 0; r0 < UNC.length; r0++) for (let k = 0; k < UNC[r0].length; k++) if (UNC[r0][k] !== '.') c.fillRect(X + k + 2, Y + r0 + 1, 1, 1); }
    for (let r0 = 0; r0 < UNC.length; r0++) for (let k = 0; k < UNC[r0].length; k++){ const ch = UNC[r0][k]; if (ch !== '.'){ c.fillStyle = BZ[ch]; c.fillRect(X + k, Y + r0, 1, 1); } }
  }
  {   // Bobby Bowden on his plinth before the Moore building
    const [x, y] = BOW; rect(x - .9, y - .9, 1.8, 1.8, T([170, 166, 158])); rect(x - .9, y - .9, 1.8, .3, T([204, 200, 192]));
    c.fillStyle = T([136, 96, 56]); c.fillRect(wx(x) - 1, wy(y) - 2, 2, 3); c.fillStyle = T([176, 130, 76]); c.fillRect(wx(x) - 1, wy(y) - 3, 1, 1); c.fillRect(wx(x) - 1, wy(y) - 2, 1, 2);
  }
  // ---- the press box, skyboxes, light rigs, the boards, signage
  {   // the press box over the west rim: glass to the field, a white roof with its units, dishes and a mast; garnet and gold trim
    const y0 = BOWL[2] - 6.5, y1 = BOWL[2] + 2.2, L = PX[1] - PX[0];
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; const [dx, dy] = shv(9); c.fillRect(wx(PX[0] + dx), wy(y0 + dy), Math.round(L * OS), Math.round((y1 - y0) * OS)); }
    rect(PX[0], y0, L, y1 - y0, T(snow ? [236, 240, 248] : [214, 214, 216]));
    if (!snow) for (let x = PX[0] + 3; x < PX[1]; x += 3) rect(x, y0, .25, y1 - y0 - 1.6, T([196, 196, 200]));
    rect(PX[0], y1 - 1.7, L, 1.7, night ? 'rgb(255,214,140)' : T([60, 86, 112])); rect(PX[0], y1 - .5, L, .5, night ? 'rgb(255,232,190)' : T([110, 140, 166]));
    for (let x = PX[0] + 1.2; x < PX[1]; x += 2.4) rect(x, y1 - 1.7, .3, 1.7, T([120, 124, 132]));
    rect(PX[0], y0, L, .5, T(GAR)); rect(PX[0], y0 + .5, L, .3, T(GLD)); rect(PX[0], y0, .4, y1 - y0, T([176, 176, 180])); rect(PX[1] - .4, y0, .4, y1 - y0, T([150, 150, 156]));
    for (let x = PX[0] + 6; x < PX[1] - 5; x += 10){ if (!night){ c.fillStyle = 'rgba(8,10,24,.3)'; c.fillRect(wx(x + .8), wy(y0 + 1.8), Math.round(3.2 * OS), Math.round(2.2 * OS)); } rect(x, y0 + 1.6, 3.2, 2.2, T([150, 152, 160])); rect(x + .4, y0 + 2, 2.4, 1.4, T([118, 120, 128])); disc(x + 1.6, y0 + 2.7, .5, T([60, 62, 68])); }
    for (const [dx0, rd] of [[3, 1.1], [L - 3.4, 1.1], [L / 2 + 1.4, .8]]){ const cx = PX[0] + dx0, cy = y0 + 2.6; if (!night) disc(cx + .9, cy + .4, rd, 'rgba(8,10,24,.3)'); disc(cx, cy, rd, T([206, 206, 210])); disc(cx - .2, cy - .2, rd * .7, T([240, 240, 244])); c.fillStyle = T([60, 60, 66]); c.fillRect(wx(cx), wy(cy), 1, 1); }
    { const mx = PX[0] + L / 2 - 2; rect(mx, y0 + 1.2, .3, .3, T([60, 60, 66])); if (!night){ const [dx, dy] = shv(8); c.fillStyle = 'rgba(8,10,24,.35)'; for (let k = 0; k <= 20; k++) c.fillRect(wx(mx + dx * k / 20), wy(y0 + 1.3 + dy * k / 20), 1, 1); } }   // the mast
    const ey = BOWL[3] - 2.2;   // the east skyboxes along the top of building A
    rect(20, ey, 60, 4, T(snow ? [236, 240, 248] : [196, 196, 200])); rect(20, ey, 60, 1.3, night ? 'rgb(255,214,140)' : T([60, 86, 112])); rect(20, ey + 3.3, 60, .3, T(GLD)); rect(20, ey + 3.6, 60, .4, T(GAR));
    for (let x = 21; x < 80; x += 2.4) rect(x, ey, .3, 1.3, T([120, 124, 132]));
  }
  yield;
  const rigs = [];
  for (const x of [-8, 28, 72, 108]){ rigs.push([x, BOWL[2] + (x > PX[0] && x < PX[1] ? -5.4 : .4)], [x, BOWL[3] - .4]); }
  for (const [x, y] of rigs){   // a light rig on the rim: the frame, the catwalk, six by two lamps
    const X = wx(x) - 12, Y = wy(y) - 4;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.4)'; c.fillRect(X + 5, Y + 3, 24, 8); }
    c.fillStyle = T([62, 66, 76]); c.fillRect(X, Y, 24, 8); c.fillStyle = T([110, 114, 124]); c.fillRect(X, Y, 24, 1); c.fillStyle = T([44, 46, 54]); c.fillRect(X, Y + 7, 24, 1);
    c.fillStyle = T([140, 142, 150]); c.fillRect(X - 1, Y + 3, 1, 3); c.fillRect(X + 24, Y + 3, 1, 3);
    c.fillStyle = night ? '#fffbe8' : T([220, 222, 226]); for (let k = 0; k < 6; k++){ c.fillRect(X + 2 + k * 4, Y + 2, 2, 2); c.fillRect(X + 2 + k * 4, Y + 5, 2, 1); }
  }
  yield;
  // The fascias' signage, facing the field: FLORIDA STATE down the west side, BOBBY BOWDEN FIELD down the east.
  const fas = (tx, x, y, rot) => { c.save(); c.translate(wx(x), wy(y)); c.rotate(rot); c.drawImage(tx, -tx.width >> 1, -tx.height >> 1); c.restore(); };
  const fy = t => [-6.33 - t * 43.67, 59.67 + t * 43.63];
  fas(TX.fs, 28, fy(.552)[0], 0); fas(TX.fs, 72, fy(.552)[0], 0); fas(TX.bb, 50, fy(.552)[1], Math.PI);
  yield;
  // The weather's grade (the game's own multiply).
  c.globalCompositeOperation = 'multiply';
  if (rain){ c.fillStyle = 'rgb(176,186,206)'; c.fillRect(0, 0, W, H); } else if (fog){ c.fillStyle = 'rgb(214,218,226)'; c.fillRect(0, 0, W, H); } else if (snow){ c.fillStyle = 'rgb(222,228,242)'; c.fillRect(0, 0, W, H); }
  c.globalCompositeOperation = 'source-over';
  yield;
  // Night: the rigs' flare and beams, the arcade's uplights, the lamps, tents lit from inside, the plaza's glow, the bowl's halo.
  const glow = (X, Y, rad, a, col) => { const gr = c.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.35, `rgba(${col},${a * .35})`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(X - rad, Y - rad, rad * 2, rad * 2); };
  if (night){
    c.globalCompositeOperation = 'screen';
    for (let k = 0; k < 9; k++){ c.strokeStyle = `rgba(170,205,255,${.16 * Math.pow(1 - k / 9, 2)})`; c.lineWidth = 2.6 * OS; const dd = k * 2.6 + 2; c.beginPath(); if (c.roundRect) c.roundRect(wx(UC[0] - dd), wy(UC[2] - dd), (UC[1] - UC[0] + dd * 2) * OS, (UC[3] - UC[2] + dd * 2) * OS, (UC[4] + dd) * OS); else c.rect(wx(UC[0] - dd), wy(UC[2] - dd), (UC[1] - UC[0] + dd * 2) * OS, (UC[3] - UC[2] + dd * 2) * OS); c.stroke(); }
    for (let th = 0, last = -99, acc = 0, prev = onUC(0, -.5); th < 6.2832; th += .004){ const p = onUC(th, -.5); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; if (acc - last < 7) continue; last = acc; glow(wx(p[0]), wy(p[1]), 5 * OS, .34, '255,196,130'); }   // the uplights washing the brick
    for (const [x, y] of rigs){
      const gx = wx(CX) - wx(x), gy = wy(CY) - wy(y), L = Math.hypot(gx, gy), nx = -gy / L, ny = gx / L, X = wx(x), Y = wy(y), R = 22 * OS;
      const gr = c.createLinearGradient(X, Y, X + gx * .9, Y + gy * .9); gr.addColorStop(0, 'rgba(215,232,255,.1)'); gr.addColorStop(1, 'rgba(215,232,255,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + gx * .9 + nx * R, Y + gy * .9 + ny * R); c.lineTo(X + gx * .9 - nx * R, Y + gy * .9 - ny * R); c.fill();
      glow(X, Y, 24 * OS, .7, '200,225,255');
    }
    for (const [x, y] of poles){ glow(wx(x), wy(y), 16 * OS, .6, '200,225,255'); }
    glow(wx(HOME[0] + 16), wy(HOME[1] + 16), 30 * OS, .22, '200,225,255');   // Howser lit up
    for (const [x, y] of lamps) glow(wx(x), wy(y), 10 * OS, .4, '255,214,140');
    for (const [x, y] of lampsP) glow(wx(x), wy(y), 7 * OS, .34, '255,222,160');
    const wg = K.makeGlow(); c.globalAlpha = .5;
    for (let n = 0; n < tents.length; n += 2){ const [x, y] = tents[n], R = 5 * OS; c.drawImage(wg, wx(x + 1.6) - R, wy(y + 1.6) - R, R * 2, R * 2); }
    for (const [x, y] of stands){ const R = 6 * OS; c.drawImage(wg, wx(x) - R, wy(y) - R, R * 2, R * 2); }
    for (const [x, y] of trucks){ const R = 6 * OS; c.drawImage(wg, wx(x + 3) - R, wy(y + 1) - R, R * 2, R * 2); }
    c.globalAlpha = 1; for (const [x, y] of GATES) glow(wx(x), wy(y), 14 * OS, .5, '255,220,160');
    glow(wx(STAT[0]), wy(STAT[1]), 16 * OS, .45, '255,190,110');   // the plaza under the spear's fire
    glow(wx(-143), wy(CY), 13 * OS, .45, '200,170,255');   // Fan Fest's stage lights
    glow(wx(146), wy(-91), 16 * OS, .3, '220,230,255');   // the compound's work lights
    for (const S2 of blds){ if (S2.ht < 6) continue; glow(wx((S2.x0 + S2.x1) / 2), wy((S2.y0 + S2.y1) / 2), Math.max(S2.x1 - S2.x0, S2.y1 - S2.y0) * OS * .7, .15, '255,210,140'); }
    c.globalCompositeOperation = 'source-over';
    for (const [x, y] of lamps){ c.fillStyle = '#fff4cc'; c.fillRect(wx(x), wy(y), 2, 2); }
    for (const [x, y] of lampsP){ c.fillStyle = '#ffe9b8'; c.fillRect(wx(x), wy(y), 2, 2); }
    c.fillStyle = '#fffbe8'; for (const [x, y] of rigs) for (let k = 0; k < 6; k++){ c.fillRect(wx(x) - 10 + k * 4, wy(y) - 2, 2, 2); c.fillRect(wx(x) - 10 + k * 4, wy(y) + 1, 2, 1); }
  }
  // The video boards: the big one over the north end, the smaller over the Champions Club; both lit garnet and gold.
  const board = (x, y, w, h, bt) => {
    const bw = Math.round(h * OS), bh = Math.round(w * OS), bc = A.canvas(bw, bh), b2 = bc.getContext('2d');
    b2.fillStyle = '#14141a'; b2.fillRect(0, 0, bw, bh);
    const gr = b2.createLinearGradient(0, 0, bw, bh); gr.addColorStop(0, 'rgb(150,62,82)'); gr.addColorStop(1, 'rgb(70,22,34)'); b2.fillStyle = gr; b2.fillRect(1, 1, bw - 2, bh - 2);
    b2.fillStyle = A.css(GLD); b2.fillRect(1, 1, bw - 2, 2); b2.fillRect(1, bh - 3, bw - 2, 2);
    b2.drawImage(bt, (bw - bt.width) >> 1, (bh - bt.height) >> 1);
    b2.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < bh; k += 2) b2.fillRect(0, k, bw, 1);
    if (!night){ c.fillStyle = 'rgba(8,10,24,.4)'; c.fillRect(wx(x + 2.4), wy(y + 1), Math.round(w * OS), Math.round(h * OS)); }
    c.fillStyle = '#2a2a30'; c.fillRect(wx(x) - 1, wy(y) - 1, Math.round(w * OS) + 2, Math.round(h * OS) + 2);
    c.save(); c.translate(wx(x + w / 2), wy(y + h / 2)); c.rotate(x > CX ? Math.PI / 2 : -Math.PI / 2); c.drawImage(bc, -bw >> 1, -bh >> 1); c.restore();
  };
  board(BOWL[1] - 5.5, CY - 20, 6.5, 40, TX.nb); board(BOWL[0] - 1, CY - 12.5, 5, 25, TX.sb);
  yield;
  // Parts for the animated touches: flashbulbs in the stands, Champions Way's two lanes, the grills' smoke.
  const sparks = [];
  for (let n = 0; n < 6000 && sparks.length < 460; n++){ const x = X0 + hash2(n, 3) * (W / OS), y = Y0 + hash2(n, 6) * (H / OS); if (sdP(x, y) > 2 && sdB(x, y) < -1.5) sparks.push(x, y); }
  const lane = off => { const pts = []; for (let n = 1; n < CW.length; n++){ const [x0, y0] = CW[n - 1], [x1, y1] = CW[n], L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L; for (let s = 0; s < L; s += 2) pts.push([x0 + (x1 - x0) * s / L + nx * off, y0 + (y1 - y0) * s / L + ny * off]); } const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); return { pts, cum }; };
  const lanes = [lane(-1.6), lane(1.6)];
  yield;
  const clouds = yield* K.makeClouds(cond);
  yield;
  const hc = GAR, ac = GLD;
  // the spear's point, where its fire burns
  let fx = 0, fy2 = 0; UNC.forEach((row, r0) => { const k = row.indexOf('T'); if (k >= 0){ fx = STAT[0] + (k - 10 + .5) / OS; fy2 = STAT[1] + (r0 - 12 + .5) / OS; } });
  return { c: cv, towers: towers.map(t => [t[0], t[1]]), lamps, lampsP, sparks, lanes, tower: [50, BOWL[2] - 3], night, noon, snow, rain, fog, hc, ac, bg: T(snow ? [226, 232, 244] : [74, 124, 54]), name: 'FLORIDA STATE',
    clouds, jets: K.makeJets(hc, ac, night), b2: K.makeB2(night), glow: K.makeGlow(), walk: Float32Array.from(walk), smoke: Float32Array.from(grills.flat()), wc: [T(GAR), T(GLD), T(WHITE)],
    band: [T(GAR, LK * .9), T(WHITE, LK * .9), T(GLD, LK * .9)], bandAt: [-146, CY - 2.7], flame: [fx, fy2],
    smc: night ? 'rgb(120,124,140)' : 'rgb(226,226,230)', fx: Array.from({ length: 150 }, (_, i) => [hash2(i, 1), hash2(i, 2), .55 + hash2(i, 3) * .6, hash2(i, 4)]) };

}
