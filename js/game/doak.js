/* Doak Campbell Stadium (Bobby Bowden Field, Florida State's home) for the pregame flyover: the stadium's own bake of
   the overview, in place of the generic bowl when the Seminoles are at home (flyover.js STADIUMS).

   Laid out from the real thing (OpenStreetMap's footprints turned into the game's frame: the field runs north-west to
   south-east, so +x is the north end, -x the south end, -y the west side, +y the east side, and the afternoon sun
   comes from the south-west, as the game's shadows already have it), squeezed a little beyond the field so the
   neighbors fit: the bowl, both sidelines under tall upper decks, the press box atop the west side, skyboxes atop
   the east, the Champions Club's covered terrace over the south end, the big board over the north end; all of it
   wrapped in the University Center's red-brick collegiate gothic arcade (buildings A east, B south, C west and the
   Moore Athletic Center north). Out the south gate the Unconquered statue (Osceola on Renegade, his spear lit for a
   home game) on Williams Family Plaza at the head of Langford Green and its Fan Fest tents; Champions Way round the
   south half, Stadium Drive out west, Pensacola Street east, the practice field and Dick Howser Stadium to the north,
   live oaks hung with Spanish moss, lots full of garnet and gold. */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rr = (x, y, x0, x1, y0, y1, r) => { const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
const GAR = [120, 47, 64], GLD = [206, 184, 136], WHITE = [240, 238, 230];
const BRICK = [[150, 70, 50], [132, 60, 44], [168, 84, 60], [116, 52, 40]], STONE = [214, 198, 166], STONE2 = [178, 162, 134], GLASS = [44, 54, 72];
// The shapes (yards): the pit (field and wall), the bowl's outer edge, the University Center's outer face, its wings.
const PIT = [-13.3, 113.3, -6.33, 59.67, 4], BOWL = [-58, 146, -50, 103.3, 34], UC = [-74, 178, -78, 131.3, 24];
const WINGS = [[-30, 8, -94, -76], [86, 128, -94, -76], [-46, 6, 129, 146], [88, 140, 129, 146]];
const sdP = (x, y) => rr(x, y, ...PIT), sdB = (x, y) => rr(x, y, ...BOWL);
const sdU = (x, y) => { let d = rr(x, y, ...UC); for (const w of WINGS) d = Math.min(d, rr(x, y, w[0], w[1], w[2], w[3], 1)); return d; };
const STAT = [-100, 26.667], LG = [-112, -150, 4, 49.3], HOME = [206, 150];   // the statue; Langford Green (x from, to, y); home plate at Howser
const PX = [12, 88];   // the press box's run along the west rim

export function* doakOverview(K, home, away, cond, art){
  const { A, OS, X0, Y0, W, H, CX, CY } = K, { hash2 } = A;
  const night = cond.time === 'night', noon = cond.time === 'noon', snow = cond.sky === 'snow', rain = cond.sky === 'rain', fog = cond.sky === 'fog';
  const cv = A.canvas(W, H), c = cv.getContext('2d');
  const TM = night ? [.27, 0, .32, 0, .52, 0] : noon ? [1.04, 4, 1.04, 4, 1.02, 4] : [1.04, 7, 1.01, 3, .9, 0];
  const tone = (r, g, b) => [r * TM[0] + TM[1], g * TM[2] + TM[3], b * TM[4] + TM[5]];
  const T = (q, k = 1) => A.css(tone(q[0] * k, q[1] * k, q[2] * k));
  const SD = noon ? [.6, .5] : [.93, .37], LSR = night ? 0 : noon ? 9 : 34;
  const shv = ht => noon ? [.14 * ht * .9, .18 * ht * .9] : [.95 * ht * .85, .38 * ht * .85];
  const wx = x => Math.round((x - X0) * OS), wy = y => Math.round((y - Y0) * OS);
  const oc = A.hex(away.color), oa = A.hex(away.alt || '#f4f4f4');
  let r = 0, g = 0, b = 0, em = false;
  const set = (q, k = 1) => { r = q[0] * k; g = q[1] * k; b = q[2] * k; };
  const NEUT = K.NEUT, SKIN = K.SKIN;
  const fan = (h, h2, vis) => {   // a fan's shirt: garnet, gold, white, the odd neutral; the visitors in their own
    if (vis) set(h < .7 ? oc : h < .85 ? WHITE : NEUT[(h2 * 6) | 0], .86 + h2 * .28);
    else set(h < .5 ? GAR : h < .72 ? GLD : h < .84 ? WHITE : NEUT[(h2 * 6) | 0], .86 + h2 * .28);
  };
  // The sun over the rim: the stands nearest the west and south rims sit in its shadow (the sides' rims stand tallest).
  const shaded = (x, y, t, hr) => { for (let s = 2.5; s <= LSR * hr; s += 3.2) if (sdB(x - SD[0] * s, y - SD[1] * s) > 0) return s < LSR * hr * (1 - t * .85); return false; };
  // ---- the bowl
  const bowl = (x, y, i, j, d, dOut, h) => {
    const t = d / (d + dOut), qx = Math.abs(x - CX) - 59.3, qy = Math.abs(y - CY) - 29, sa = Math.atan2(Math.max(qy, 0), Math.max(qx, 0)) / 1.5708;
    const side = sa > .62, north = x > CX, h2 = hash2(j * 3 + 11, i * 5 + 7);
    // where the stairs fall: every 5.6 yd down the sides and across the ends, on rays through the corners
    const st = qx <= 0 ? ((x + 280) % 5.6) / 5.6 : qy <= 0 ? ((y + 280) % 5.6) / 5.6 : (Math.atan2(qy, qx) / 1.5708 * 8) % 1;
    const stair = st < .075, vis = !north && y < 8 && !side && x < -2;   // the visitors: the south end's west corner
    let lb = .82, k = 1, top = 1;
    const rows = (d0, step, dark) => {   // seat rows stepping up: risers, heads, shirts; the stairs between sections
      const row = ((d - d0) * OS) | 0, rq = row % 3;
      if (stair) set(row & 1 ? [160, 158, 152] : [128, 126, 122]);
      else if (rq === 2) set(dark);
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
  // ---- the University Center: the arcade's outer face folded down flat (the pixel-art elevation), then the roofs
  const cor = (sx, sy) => [(sx < 0 ? UC[0] + UC[4] : UC[1] - UC[4]) + sx * UC[4] * .707, (sy < 0 ? UC[2] + UC[4] : UC[3] - UC[4]) + sy * UC[4] * .707, sx * .71, sy * .71, 0];
  const GATES = [[UC[0], CY, -1, 0, 1], cor(-1, -1), cor(-1, 1), [47, UC[2], 0, -1, 0], [47, UC[3], 0, 1, 0], [UC[1], CY, 1, 0, 1], cor(1, -1), cor(1, 1)];
  const gateAt = (x, y) => { for (const gt of GATES) if (Math.abs((x - gt[0]) * gt[3] - (y - gt[1]) * gt[2]) < (gt[4] ? 5 : 3.6) && Math.hypot(x - gt[0], y - gt[1]) < 9) return true; return false; };
  const uc = (x, y, i, j, du, h) => {
    const dIn = sdB(x, y), gx = sdU(x + .3, y) - sdU(x - .3, y), gy = sdU(x, y + .3) - sdU(x, y - .3), al = Math.abs(gx) > Math.abs(gy) ? y : x;
    const f = (((al + 300) * OS) % 14 + 14) % 14, bay = Math.floor((al + 300) * OS / 14), sun = gx * SD[0] + gy * SD[1] < -.05;
    if (du < 3.4){   // the facade: brick, buttresses between tall pointed arches in cast stone, a cornice; gates as great arches
      const e = du / 3.4, gate = gateAt(x, y), bk = BRICK[(h * 4) | 0];
      if (e > .88) set(e > .96 && f % 4 < 2 ? STONE2 : STONE);   // the cornice and its crenellation
      else if (gate){   // a gate: a great pointed arch in stone, its iron gates thrown open on the dark passage
        const u = Math.abs(f - 7), w = e < .5 ? 5.5 : 5.5 * Math.sqrt(Math.max(0, 1 - ((e - .5) / .34) ** 2)), glass = x > BOWL[1] && Math.abs(y - CY) < 9 && e > .34;
        if (u < w && glass){ set([[150, 40, 56], [206, 170, 90], [60, 90, 150], [176, 60, 70]][((i >> 1) + (j >> 1) * 3) % 4], night ? 1.5 : 1); if (night) em = true; if (((i + j) & 3) === 0) set(STONE2); }   // the Moore building's stained glass window over its entrance
        else if (u < w && e > .04){ if (night){ set([255, 206, 130]); em = true; } else set(u > w - 1.2 && (j & 1) ? [70, 60, 58] : [30, 26, 30]); }
        else set(u < w + 1.4 ? STONE : bk);
      }
      else if (e < .1) set(STONE2);   // the base course
      else if (f < 3) set(BRICK[3], e > .3 && e < .34 || e > .62 && e < .66 ? 1.5 : 1);   // a buttress, its stone weatherings
      else {
        const u = f - 8, w = e < .55 ? 2.6 : 2.6 * (1 - (e - .55) / .24);   // the window: straight jambs, a pointed head
        if (Math.abs(u) < w && e > .16){ if (night && hash2(bay, (du > 1.7) + 3) > .3){ set([255, 210, 140], .9 + h * .1); em = true; } else set(Math.abs(u) < .8 && e > .2 ? [70, 84, 104] : GLASS); if (e > .38 && e < .41 && !em) set(STONE2); }
        else if (Math.abs(u) < w + 1 && e > .13 && e < .8) set(STONE);
        else { set(bk); if ((((e * 3.4 * OS) | 0) % 3) === 0) set(bk, .86); }   // brick courses
      }
      if (!em && !sun && !night && !noon){ r *= .74; g *= .76; b *= .86; }
      if (!em && night){ r *= 1.3; g *= 1.2; b *= 1.3; }
      return;
    }
    const wing = rr(x, y, ...UC) > 0;
    if (dIn < .7){ set([40, 38, 44]); return; }   // the gap where the bowl's rim stands up off the roofs
    if (du < 4.1 || dIn < 1.4) set(BRICK[1], du < 3.7 ? 1.25 : .9);   // the parapets
    else if (du < (wing ? 99 : 4.1 + (du + dIn - 4.1) * .64)){   // slate roofs pitched along the arcade, a gabled dormer over every other bay
      const rg = wing ? 8.6 : 4.1 + (du + dIn - 4.1) * .32, out = du < rg, lit = out === sun, dorm = (bay & 1) === 0 && f > 3 && f < 13 && du < 6.8 && Math.abs(f - 8) < (6.8 - du) * 2.2;
      if (snow) set([236, 240, 248], lit ? 1 : .86);
      else if (dorm) set(Math.abs(f - 8) < .6 ? STONE : f < 8 ? [104, 110, 124] : [80, 86, 98]);
      else { const row = (du * OS) | 0; set(row % 2 ? [98, 104, 120] : [76, 82, 96], .94 + h * .1); if (row % 2 && ((f | 0) + row * 2) % 5 === 0) set([70, 76, 90]); if (Math.abs(du - rg) < .2) set(STONE2); }   // slate courses, staggered joints, the ridge
      if (!snow && !dorm && !noon) { const k = lit ? 1.12 : .78; r *= k; g *= k; b *= k; }
    }
    else if (snow) set([232, 236, 246], .96 + h * .04);
    else {   // the flat roofs inward, over the concourses: membrane in panels, the units on it, skylights
      const moore = x > BOWL[1] - 1, sg = ((al + 300) % 38 + 38) % 38;
      set(moore ? [150, 140, 126] : [142, 142, 146], .93 + hash2(Math.floor((al + 300) / 38), 5) * .1 + h * .04);
      if (sg < .4){ set(BRICK[1]); return; }   // a firewall between two of the buildings
      const u = ((x + 300) / 4) % 1, v = ((y + 300) / 4) % 1;
      if ((u < .06 || v < .06) && h > .3) set(moore ? [150, 140, 124] : [152, 152, 152]);
      const cx = Math.floor((x + 300) / 9), cy = Math.floor((y + 300) / 9), uu = ((x + 300) / 9) % 1, vv = ((y + 300) / 9) % 1, k = hash2(cx, cy + 40);
      if (k > .66 && uu > .3 && uu < .62 && vv > .3 && vv < .6) set(uu < .36 || vv < .36 ? [212, 212, 214] : [124, 126, 134]);
      else if (k < .12 && uu > .15 && uu < .85 && vv > .44 && vv < .56){ set([120, 150, 170]); if (night){ set([255, 214, 150]); em = true; } }
    }
    if (night && !em){ r *= 1.15; g *= 1.1; b *= 1.2; if (h > .996){ set([255, 214, 150]); em = true; } }
  };
  // ---- the ground: pavers round the building, lawn beyond (St. Augustine grass, mown in stripes)
  const GR = snow ? [[226, 232, 244], [216, 224, 240]] : [[74, 124, 54], [82, 132, 58]];
  const ground = (x, y, i, j, dU, h) => {
    if (dU < 7.5){
      const k = (((i >> 2) + (j >> 2)) & 1) ? 0 : 1;
      if (snow) set(k ? [214, 222, 236] : [224, 230, 242]); else set(k ? [170, 160, 146] : [180, 170, 154], .96 + h * .08);
      if (dU > 6.4 && !snow) set([150, 82, 64]);   // a brick border
    } else { const q = GR[((i + j) >> 3) & 1]; set(q, .95 + h * .1); if (h > .94) set(q, snow ? .9 : .82); }
  };
  // The lettering first (reading a canvas back waits on everything drawn before it, so before there's anything).
  const TX = {};
  for (const [k, txt, z, col] of [['fs', 'FLORIDA STATE', 6, '#f4f0e0'], ['bb', 'BOBBY BOWDEN FIELD', 6, '#f4f0e0'], ['nb', 'SEMINOLES', 12, '#f4ead0'], ['sb', 'FLORIDA STATE', 8, '#f4ead0']]){ TX[k] = K.pixText(txt, z, col); yield; }
  // Pass 1, pixel by pixel in bands; a mask of the buildings for their shadows.
  const mask = A.canvas(W, H), mc = mask.getContext('2d');
  for (let j0 = 0; j0 < H; j0 += 4){
    const j1 = Math.min(H, j0 + 4), band = c.createImageData(W, j1 - j0), D = band.data, mb = mc.createImageData(W, j1 - j0), M = mb.data;
    for (let j = j0; j < j1; j++){
      const y = Y0 + (j + .5) / OS;
      for (let i = 0; i < W; i++){
        const x = X0 + (i + .5) / OS, q = ((j - j0) * W + i) * 4, h = hash2(i, j);
        em = false;
        const d = sdP(x, y);
        if (d < 0){ r = 34; g = 36; b = 42; }
        else {
          const dOut = -sdB(x, y);
          if (dOut > 0) bowl(x, y, i, j, d, dOut, h);
          else { const du = -sdU(x, y); if (du > 0){ uc(x, y, i, j, du, h); M[q + 3] = 255; } else ground(x, y, i, j, -du, h); }
        }
        if (em){ D[q] = r; D[q + 1] = g; D[q + 2] = b; } else { D[q] = r * TM[0] + TM[1]; D[q + 1] = g * TM[2] + TM[3]; D[q + 2] = b * TM[4] + TM[5]; }
        D[q + 3] = 255;
      }
    }
    c.putImageData(band, 0, j0); mc.putImageData(mb, 0, j0);
    yield;
  }
  const rect = (x, y, w, h, col) => { c.fillStyle = col; const a = wx(x), b2 = wy(y); c.fillRect(a, b2, Math.max(1, wx(x + w) - a), Math.max(1, wy(y + h) - b2)); };
  const disc = (cx, cy, rad, col, cc = c) => { cc.fillStyle = col; const px = wx(cx), py = wy(cy), R = Math.max(1, Math.round(rad * OS)); for (let dy = -R; dy <= R; dy++){ const w = Math.floor(Math.sqrt(R * R - dy * dy + .25)); cc.fillRect(px - w, py + dy, 2 * w + 1, 1); } };
  const path = (pts, wd, col, cc = c) => { cc.fillStyle = col; const z = Math.max(1, Math.round(wd * OS)); for (let n = 1; n < pts.length; n++){ const [x0, y0] = pts[n - 1], [x1, y1] = pts[n], m = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * OS); for (let k = 0; k <= m; k++){ const u = k / m; cc.fillRect(wx(x0 + (x1 - x0) * u) - (z >> 1), wy(y0 + (y1 - y0) * u) - (z >> 1), z, z); } } };
  // The field itself, from the real texture, washed toward clean stripes at this scale (as the generic bake).
  c.save(); c.beginPath(); c.rect(wx(-13.3), wy(-6.5), 126.6 * OS, 66.33 * OS); c.clip();
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(art.tex, wx(A.FX0), wy(A.FY0), (A.FX1 - A.FX0) * OS, (A.FY1 - A.FY0) * OS);
  if (night){ c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(176,198,255)'; c.fillRect(0, 0, W, H); }
  c.restore(); c.imageSmoothingEnabled = false;
  {
    const sm = c.getImageData(wx(0), wy(5), 100 * OS, 1).data, at = x => { const q = Math.round(x * OS) * 4; return `rgb(${sm[q]},${sm[q + 1]},${sm[q + 2]})`; };
    const fw = 100 * OS, fh = Math.round(53.33 * OS), wv = A.canvas(fw, fh), w2 = wv.getContext('2d');
    for (let k = 0; k < 20; k++){ w2.fillStyle = at(k * 5 + 2.5); w2.fillRect(Math.round((k * 5 + .6) * OS), 0, Math.round(3.8 * OS), fh); }
    w2.globalCompositeOperation = 'destination-in'; w2.setTransform(1, 0, 0, .27, 0, fh / 2 * .73);
    const gr = w2.createRadialGradient(fw / 2, fh / 2, 0, fw / 2, fh / 2, fw * .44); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.7, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    w2.fillStyle = gr; w2.fillRect(0, -fh * 4, fw, fh * 9);
    c.globalAlpha = snow ? .7 : .86; c.drawImage(wv, wx(0), wy(0)); c.globalAlpha = 1;
  }
  yield;
  // ---- the world outside: roads, lots, the green, the plaza, the ballpark, the practice field
  const solid = [], asph = snow ? T([196, 204, 216]) : T([64, 66, 72]), asph2 = snow ? T([92, 96, 106]) : T([56, 58, 64]), dash = T([230, 206, 100]);
  // Champions Way round the south half, running on as Stadium Drive up the west side and out to Pensacola Street east.
  const CW = [[250, -104], [140, -104], [-40, -104], [-64, -101], [-80, -90], [-87, -70], [-87, 123], [-80, 143], [-64, 154], [-40, 158], [96, 158], [116, 164], [128, 176], [134, 188]];
  const SDR = [[-150, -127], [250, -127]], PEN = [[-150, 181], [128, 181]];
  for (const [p, wd] of [[CW, 6], [SDR, 7], [PEN, 7]]) path(p, wd, asph2);
  for (const p of [CW, SDR, PEN]) for (let n = 1; n < p.length; n++){ const [x0, y0] = p[n - 1], [x1, y1] = p[n], L = Math.hypot(x1 - x0, y1 - y0); for (let s = 1; s < L - 2; s += 6) path([[x0 + (x1 - x0) * s / L, y0 + (y1 - y0) * s / L], [x0 + (x1 - x0) * (s + 3) / L, y0 + (y1 - y0) * (s + 3) / L]], .4, dash); }
  for (const [p, wd] of [[CW, 6], [SDR, 7], [PEN, 7]]) for (let n = 1; n < p.length; n++){ const [x0, y0] = p[n - 1], [x1, y1] = p[n]; solid.push([Math.min(x0, x1) - wd / 2, Math.min(y0, y1) - wd / 2, Math.max(x0, x1) + wd / 2, Math.max(y0, y1) + wd / 2]); }
  yield;
  const LOTS = [[-60, -122, 310, 13, 'cars'], [186, -101, 64, 56, 'cars'], [-150, -98, 56, 88, 'grove'], [-150, 62, 56, 88, 'rv'], [-60, 161, 154, 16, 'cars']];
  for (const [x, y, w, h, kind] of LOTS){ solid.push([x, y, x + w, y + h]); if (kind !== 'grove') rect(x, y, w, h, asph); }
  const cars = [], tents = [], lamps = [], rvs = [], folk = [], grills = [], flags = [], gear = [], oaks = [];
  let seed = 1;
  const gather = (x, y, w, h, n, vis) => { seed++; for (let k = 0; k < n; k++) folk.push([x + hash2(seed, k * 2) * w, y + hash2(seed, k * 2 + 1) * h, vis]); };
  const tailgate = (x, y, s, vis) => {
    tents.push([x, y, s, vis]); if (s < .3) tents.push([x + 3.5, y, s + .4, vis]);
    grills.push([x + (s < .3 ? 7.4 : 4), y + 1.4]); gear.push([x + .6, y + 3.8, s], [x + 2.2, y + 4.4, s + .3]);
    if (s < .14) gear.push([x + 1, y + 5.6, -1], [x + 4.6, y + 5.6, -1]);
    if (hash2(seed, 7) < .5) flags.push([x - .2, y - .3, vis]);
    gather(x - .4, y + 3.4, 8, 3.6, 5 + (s * 14 | 0), vis);
  };
  for (const [x, y, w, h, kind] of LOTS){
    if (kind !== 'cars') continue;
    for (let by = 0; by + 6 <= h; by += 19.2) for (const ro of [0, 13.6]){
      const sy = y + by + ro + .4; if (sy + 5.4 > y + h) continue;
      for (let sx = x + 1; sx + 3 <= x + w - .5; sx += 3){
        const s = hash2(Math.round(sx * 7), Math.round(sy * 5) + 31);
        c.fillStyle = snow ? T([210, 216, 228]) : T([190, 190, 190]); c.fillRect(wx(sx), wy(sy), 1, Math.round(5.2 * OS));
        if (s < .9 - hash2(Math.floor(sx / 13), Math.floor(sy)) * .25) cars.push([sx + .3, sy + .3, s * 16 | 0, s]);
      }
      if (ro === 0 && y + h - sy - 5.9 >= 5.5) for (let sx = x + 2; sx + 10 <= x + w; sx += 10.5){ const s = hash2(Math.round(sx), Math.round(sy) + 9); if (s < .3) tailgate(sx, sy + 5.9, s / .3 * .5, false); }
    }
    for (let lx = x + 14; lx < x + w - 4; lx += 32) lamps.push([lx, y + h / 2]);
    yield;
  }
  {   // the RV lot (south-east): two rows nose to tail, awnings out, garnet and gold flags
    const [x, y, w] = LOTS[3];
    for (const ry of [y + 2, y + 22, y + 46, y + 66]) for (let rx = x + 1.5; rx + 8 < x + w; rx += 7.6){
      const s = hash2(Math.round(rx * 3), Math.round(ry)); if (s < .1) continue;
      rvs.push([rx, ry, s]); gather(rx + 3, ry + 2, 3.4, 9, 3 + (s * 6 | 0), false);
      if (s < .55) grills.push([rx + 4.6, ry + 10.6]); else gear.push([rx + 4, ry + 10.4, s]);
      if (s > .5) flags.push([rx + 2.6, ry - .4, false]);
    }
  }
  {   // the south-west tailgate grove under the live oaks (tents along brick walks)
    const [x, y, w, h] = LOTS[2];
    for (let gy = y + 6; gy < y + h - 3; gy += 12) for (let gx = x + 6; gx < x + w - 3; gx += 12){ const s = hash2(gx | 0, gy | 0); if (s < .85) oaks.push([gx + (hash2(gx | 0, 3) - .5) * 6, gy + (hash2(gy | 0, gx | 0) - .5) * 6, 4.6 + hash2(gx | 0, (gy | 0) + 1) * 2.6, s]); }
    for (let ty = y + 1.2; ty < y + h - 4; ty += 4.4) for (let tx = x + 1.2; tx < x + w - 4; tx += 4.2){
      if (oaks.some(o => Math.hypot(tx + 1.6 - o[0], ty + 1.6 - o[1]) < o[2] * .72)) continue;
      const s = hash2(Math.round(tx * 3) + 7, Math.round(ty * 3)), vis = tx > x + w - 20 && ty < y + 16;
      if (s > .8){ gather(tx, ty, 3.6, 3.6, 5, vis); continue; }
      tents.push([tx, ty, s, vis]); if (s < .22) grills.push([tx + 3.5, ty + 3.4]); if (s > .7) flags.push([tx + 3.4, ty - .2, vis]);
    }
  }
  {   // Langford Green: the lawn as wide as the field, two rows of oaks down its edges, Fan Fest's tents and stage
    const [xa, xb, ya, yb] = LG;
    for (let x = xa - 2; x > xb - 6; x -= 9.5) for (const yy of [ya + 1, yb - 1]) oaks.push([x + (hash2(x | 0, yy | 0) - .5) * 2, yy + (hash2(yy | 0, x | 0) - .5) * 2, 4.4 + hash2(x | 0, 9) * 1.6, .5]);
    for (let tx = xa - 3; tx > xb; tx -= 4.4) for (let ty = ya + 6; ty < yb - 9; ty += 4.6){
      if (Math.abs(ty + 1.6 - CY) < 3.2) continue;   // the walk down the middle
      const s = hash2(Math.round(tx * 3), Math.round(ty * 3) + 5); if (s > .86) continue;
      tents.push([tx, ty, s, false]); if (s < .2) grills.push([tx + 3.4, ty + 3]); if (s > .76) flags.push([tx + 3.4, ty - .2, false]);
    }
    gather(xb, ya + 4, xa - xb, yb - ya - 8, 260, false);
  }
  // Dick Howser Stadium (the ballpark, north-east) and the practice field north of the Moore Athletic Center.
  solid.push([182, 126, 250, 188], [194, -40, 250, 86], [182, -18, 194, 78]);
  yield;
  // ---- drawing the ground level: the plaza, the green, the ballpark, the field, the lots' life
  const walkC = snow ? T([200, 204, 214]) : T([214, 206, 186]), brick = snow ? T([196, 190, 196]) : T([150, 86, 66]);
  {   // Langford Green's lawn, its center walk and the Fan Fest stage at the far end
    const [xa, xb, ya, yb] = LG;
    for (let x = xb; x < xa; x += 1 / OS){ const k = (Math.floor(x / 4) & 1); c.fillStyle = snow ? T([228, 234, 246]) : T(k ? [84, 136, 60] : [76, 128, 56]); c.fillRect(wx(x), wy(ya), 1, Math.round((yb - ya) * OS)); }
    rect(xb, CY - 1.6, xa - xb, 3.2, walkC); rect(xb, ya, xa - xb, .8, brick); rect(xb, yb - .8, xa - xb, .8, brick);
    rect(-149, CY - 9, 4, 18, T([40, 40, 46])); rect(-145.5, CY - 8, 1.2, 16, T([24, 24, 30])); rect(-149.5, CY - 9.5, 5, .6, T([150, 150, 156])); rect(-149.5, CY + 8.9, 5, .6, T([150, 150, 156]));   // the stage, its screen, truss
    gather(-144, CY - 10, 10, 20, 120, false);
  }
  {   // Williams Family Plaza: a ring of garnet and gold pavers, the walk in from the green, the statue's granite plinth
    const [x, y] = STAT;
    rect(x, CY - 2.4, UC[0] - 8 - x + 6, 4.8, walkC); rect(LG[0], CY - 1.6, x - LG[0], 3.2, walkC);
    disc(x, y, 9.4, T(snow ? [222, 226, 236] : [188, 180, 164])); disc(x, y, 8.4, T(snow ? [236, 240, 248] : GLD, .9)); disc(x, y, 7.4, T(snow ? [214, 220, 232] : GAR, .95)); disc(x, y, 6.6, T(snow ? [222, 226, 236] : [196, 188, 172]));
    for (let k = 0; k < 16; k++){ const a = k / 16 * 6.2832; path([[x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6], [x + Math.cos(a) * 6.4, y + Math.sin(a) * 6.4]], .34, T([168, 160, 146])); }
    disc(x, y, 3.2, T([150, 82, 64]));
    for (let k = 0; k < 8; k++){ const a = (k + .5) / 8 * 6.2832; disc(x + Math.cos(a) * 4.8, y + Math.sin(a) * 4.8, .7, T(snow ? [236, 240, 248] : [62, 104, 50])); }   // planters
  }
  {   // the practice field: lined turf, its own garnet end zones; the Bowden statue on Akers Plaza by the Moore building
    rect(194, -40, 56, 126, snow ? T([224, 230, 242]) : T([70, 122, 52]));
    for (let k = 0; k < 10; k++) rect(196, -27 + k * 10, 52, 5, snow ? T([214, 222, 236]) : T([78, 132, 58]));   // the mowing
    rect(196, -37, 52, 10, T(GAR, .9)); rect(196, 73, 52, 10, T(GAR, .9));
    for (let k = 0; k <= 10; k++) rect(196, -27 + k * 10 - .15, 52, .3, T([226, 230, 220]));
    for (const x of [196, 247.7]) rect(x, -37, .3, 120, T([226, 230, 220]));
    rect(185, -18, 9, 96, T(snow ? [224, 230, 242] : [176, 166, 150])); for (let yy = -18; yy < 78; yy += 6) rect(185, yy, 9, .34, T(snow ? [206, 212, 226] : [150, 86, 66]));   // Akers Plaza in brick-banded pavers
    for (let yy = -14; yy < 68; yy += 9.5) disc(189.5, yy + 4.5, 1.5, T(snow ? [236, 240, 248] : [70, 116, 54]));   // its planters
    disc(189.5, CY, 3, T(snow ? [222, 226, 236] : [196, 188, 172])); disc(189.5, CY, 2.2, T(GAR, .9)); rect(188.9, CY - .6, 1.2, 1.2, T([96, 70, 44]));   // and Bowden in bronze
  }
  yield;
  {   // Dick Howser Stadium: the grandstand wrapped round behind home plate, the infield dirt, the diamond, the outfield
    const [hx, hy] = HOME, N = 66 * OS, im = c.createImageData(N, N), d = im.data;
    for (let j = 0; j < N; j++){ if (j === N >> 1) yield; for (let i = 0; i < N; i++){
      const x = hx - 24 + (i + .5) / OS, y = hy - 24 + (j + .5) / OS; if (y > 188 || x > 250) continue;
      const u = x - hx, v = y - hy, rad = Math.hypot(u, v), th = Math.atan2(v, u), q = (j * N + i) * 4, hh = hash2(i + 900, j);
      let col = null;
      const DIRT = snow ? [222, 216, 220] : [176, 122, 80], TURF = snow ? [226, 232, 244] : (((u + v) / 4 | 0) & 1 ? [82, 140, 62] : [72, 128, 56]);
      if (u >= -1.2 && v >= -1.2){   // fair territory: the skinned infield arc round the mound, the grass square, the cutouts
        const mound = Math.hypot(u - 14.26, v - 14.26), sq = u > 3 && v > 3 && u < 27 && v < 27;
        col = mound < 31.7 && !sq ? DIRT : TURF;
        if (mound < 3 || rad < 4.3 || Math.hypot(u - 30, v) < 3.6 || Math.hypot(u - 30, v - 30) < 3.6 || Math.hypot(u, v - 30) < 3.6) col = DIRT;
        if ((Math.abs(u) < .2 && v > 0) || (Math.abs(v) < .2 && u > 0)) col = [236, 236, 228];
      } else if (rad > 8.6 && rad < 23 && (th < -.3 || th > 1.87)){   // the grandstand: rows of fans, a roofed middle, the brick back wall
        const k = ((rad - 8.6) * OS | 0) % 3, mid = th < -1.2 || th > 3.3;
        col = rad > 21.6 ? BRICK[1] : mid && rad > 15 ? (k ? GAR : [100, 38, 52]) : k === 2 ? [40, 40, 50] : hh < .5 ? GAR : hh < .72 ? GLD : hh < .85 ? WHITE : NEUT[(hh * 60 | 0) % 6];
      } else if (rad <= 8.6 && (u < -1.2 || v < -1.2)) col = rad > 8 ? [60, 60, 66] : DIRT;   // the backstop, the dirt behind the plate
      if (!col) continue;
      const tt = tone(...col); d[q] = tt[0]; d[q + 1] = tt[1]; d[q + 2] = tt[2]; d[q + 3] = 255;
    }}
    const tmp = A.canvas(N, N); tmp.getContext('2d').putImageData(im, 0, 0); c.drawImage(tmp, wx(hx - 24), wy(hy - 24));
    for (const [bx, by] of [[30, 0], [30, 30], [0, 30], [0, 0]]) rect(hx + bx - .4, hy + by - .4, .8, .8, T(WHITE));
    disc(hx + 15, hy + 15, .5, T([210, 200, 180]));
  }
  yield;
  const mixw = (q, k) => [q[0] + (232 - q[0]) * (1 - k), q[1] + (238 - q[1]) * (1 - k), q[2] + (246 - q[2]) * (1 - k)];
  const CARS = K.CARS;
  const carPx = (x, y, q, pl) => {
    const X = wx(x), Y = wy(y), cc = snow ? mixw(q, .15) : q;
    c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 1, Y + 1, 7, 14);
    c.fillStyle = T(cc); c.fillRect(X, Y, 7, 14); c.fillStyle = T(cc, 1.18); c.fillRect(X + 1, Y + 4, 5, 6);
    if (snow){ c.fillStyle = T([230, 236, 246]); c.fillRect(X + 1, Y + 3, 5, 8); }
    c.fillStyle = T([30, 40, 56]); c.fillRect(X + 1, Y + (pl ? 11 : 1), 5, 2); c.fillRect(X + 1, Y + (pl ? 1 : 11), 5, 1);
  };
  let nc = 0; for (const [x, y, k, s] of cars){ carPx(x, y, CARS[k % CARS.length], s > .3); if ((++nc & 63) === 0) yield; }
  const LK = night ? 2.5 : 1;
  for (const [x, y, s] of rvs){
    const X = wx(x), Y = wy(y), body = s > .55 ? [236, 232, 222] : [212, 206, 194];
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(X + 2, Y + 2, 9, 32); c.fillRect(X + 16, Y + 5, 2, 20); }
    for (let k = 0; k < 11; k++){ c.fillStyle = T(k & 1 ? (s > .5 ? GLD : WHITE) : GAR, LK); c.fillRect(X + 9, Y + 4 + k * 2, 7, 2); }
    c.fillStyle = T(body, .82); c.fillRect(X, Y, 8, 32); c.fillStyle = T(body, 1.05); c.fillRect(X, Y, 7, 31);
    c.fillStyle = T(body, 1.2); c.fillRect(X + 1, Y + 1, 5, 1); c.fillStyle = T([150, 152, 158]); c.fillRect(X + 2, Y + 9, 3, 3); c.fillRect(X + 2, Y + 21, 3, 3);
    c.fillStyle = night ? 'rgb(255,214,140)' : T([40, 54, 72]); c.fillRect(X + 1, Y + 1, 5, 2);
    c.fillStyle = T(GAR); c.fillRect(X, Y + 28, 7, 1);
  }
  yield;
  const TENT = [GAR, GAR, GLD, WHITE, GAR, GLD, [210, 210, 214]];
  const tentPx = (x, y, s, vis) => {
    const X = wx(x), Y = wy(y), q = vis ? (s < .6 ? oc : oa) : TENT[(s * 70 | 0) % TENT.length], two = (s * 37) % 1 < .18, q2 = vis ? WHITE : q === GAR ? GLD : GAR, q3 = two ? q2 : q;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.34)'; c.fillRect(X + 2, Y + 1, 10, 10); }
    c.fillStyle = T(q3, .76 * LK); c.fillRect(X, Y, 10, 10);
    c.fillStyle = T(q, .86 * LK); for (let k = 0; k < 5; k++) c.fillRect(X + k + 1, Y + 9 - k, 8 - 2 * k, 1);
    c.fillStyle = T(q3, 1.02 * LK); for (let k = 0; k < 5; k++) c.fillRect(X + k, Y + k + 1, 1, 8 - 2 * k);
    c.fillStyle = T(q, 1.16 * LK); for (let k = 0; k < 5; k++) c.fillRect(X + k, Y + k, 10 - 2 * k, 1);
    c.fillStyle = T(q, 1.32 * LK); c.fillRect(X + 4, Y + 4, 2, 2);
  };
  let ntn = 0; for (const [x, y, s, vis] of tents){ tentPx(x, y, s, vis); if ((++ntn & 47) === 0) yield; }
  const GEAR = [GAR, GLD, WHITE, [40, 90, 200], [220, 40, 40]];
  for (const [x, y, s] of gear){
    if (s < 0){ c.fillStyle = T(GLD); c.fillRect(wx(x), wy(y), 2, 3); c.fillStyle = T(GAR); c.fillRect(wx(x), wy(y) + 1, 2, 1); continue; }
    c.fillStyle = T(GEAR[(s * 97 | 0) % GEAR.length]); c.fillRect(wx(x), wy(y), 2, 1); c.fillStyle = T(WHITE); c.fillRect(wx(x), wy(y) + 1, 2, 1);
    c.fillStyle = T(GEAR[(s * 53 | 0) % GEAR.length], .8); c.fillRect(wx(x) + 3, wy(y), 1, 1); c.fillRect(wx(x) + 5, wy(y) + 1, 1, 1);
  }
  for (const [x, y] of grills){ c.fillStyle = T([34, 34, 38]); c.fillRect(wx(x), wy(y), 2, 2); c.fillStyle = night ? '#ff9a40' : T([90, 88, 86]); c.fillRect(wx(x), wy(y), 1, 1); }
  // The gates: lines at the turnstiles and a crowd at each; fans all round the plaza.
  for (const [gx, gy, nx, ny, main] of GATES){
    const tx = -ny, ty = nx;
    for (let q = -3; q <= 3; q++){ const L = 4 + hash2(gx | 0, q + 9) * (main ? 5 : 9); for (let s = 1; s < L; s += .66) folk.push([gx + nx * s + tx * q * 1.2, gy + ny * s + ty * q * 1.2, false]); }
    for (let k = 0; k < (main ? 140 : 70); k++){ const rr2 = 4 + Math.pow(hash2(k, gx | 0), 1.4) * 9, lat = (hash2(k + 50, gy | 0) - .5) * (10 + rr2 * 1.5); folk.push([gx + nx * rr2 + tx * lat, gy + ny * rr2 + ty * lat, false]); }
  }
  for (let k = 0; k < 160; k++){ const a = hash2(k, 31) * 6.2832, rad = 9.6 + hash2(k, 32) * 4; folk.push([STAT[0] + Math.cos(a) * rad, STAT[1] + Math.sin(a) * rad, false]); }
  for (let k = 0; k < 7000; k++){   // the walk round the building, busiest near the gates
    const x = X0 + hash2(k, 401) * (W / OS), y = Y0 + hash2(k, 402) * (H / OS), du = sdU(x, y);
    if (du < .5 || du > 7) continue;
    const dg = Math.min(...GATES.map(gt => Math.hypot(x - gt[0], y - gt[1]))); if (hash2(k, 403) < .25 + .75 * Math.exp(-dg / 14)) folk.push([x, y, false]);
  }
  // People walking in from the lots and the green (animated in paintFly): x0, y0, x1, y1, phase, speed, color.
  const walk = [];
  for (let n = 0; n < 260; n++){
    const [gx, gy, nx, ny] = GATES[n % GATES.length], tx = -ny, ty = nx, lat = (hash2(n, 1) - .5) * 40, dist = 14 + hash2(n, 2) * 22, l1 = lat * .1;
    walk.push(gx + nx * dist + tx * lat, gy + ny * dist + ty * lat, gx + nx * 3 + tx * l1, gy + ny * 3 + ty * l1, hash2(n, 3), .03 + hash2(n, 4) * .03, hash2(n, 6) < .5 ? 0 : hash2(n, 6) < .75 ? 1 : 2);
  }
  const SH = [GAR, GAR, GAR, GLD, GLD, WHITE, ...NEUT], fcs = SH.map(q => T(q)), vcs = [oc, oc, oa, WHITE].map(q => T(q)), sk = SKIN.map(q => T(q));
  for (let n = 0; n < folk.length; n++){
    const [x, y, vis] = folk[n], h = hash2(n, 77), X = wx(x), Y = wy(y);
    c.fillStyle = vis ? vcs[(h * vcs.length) | 0] : fcs[(h * fcs.length) | 0]; c.fillRect(X, Y, 1, 1);
    if (h > .7){ c.fillStyle = sk[(h * 50 | 0) % 5]; c.fillRect(X, Y - 1, 1, 1); }
    if ((n & 1023) === 1023) yield;
  }
  yield;
  // ---- buildings round about (campus brick, flat or gabled roofs) and the live oaks
  const ROOF = [[152, 84, 66], [96, 104, 118], [176, 160, 134], [146, 146, 150], [124, 66, 54]];
  const blds = [];
  for (const [x, y, w, h] of blds) solid.push([x, y, x + w, y + h]);
  const trees = [];
  for (let n = 0; n < 5200; n++){
    const x = X0 + 3 + hash2(n, 91) * (W / OS - 6), y = Y0 + 3 + hash2(n, 17) * (H / OS - 6);
    if (sdU(x, y) < 10 || inSolid(solid, x, y, 2.5) || Math.hypot(x - STAT[0], y - STAT[1]) < 13 || (x < LG[0] + 2 && y > LG[2] - 2 && y < LG[3] + 2)) continue;
    const dens = .2 + hash2(Math.floor(x / 22), Math.floor(y / 22) + 500) * .9; if (hash2(n, 33) > dens * .4) continue;
    trees.push([x, y, 2.6 + hash2(n, 5) * 3.4, hash2(n, 8)]);
  }
  trees.push(...oaks);
  yield;
  // The arcade's gothic towers, a pair flanking every gate (the main gates' taller, flying garnet flags).
  const towers = [];
  for (const [gx, gy, nx, ny, main] of GATES) for (const sg of [-1, 1]){ const z = main ? 3.4 : 2.7, l = main ? 9 : 7.4; towers.push([gx - nx * (z + .6) - ny * sg * l, gy - ny * (z + .6) + nx * sg * l, z, main]); }
  // ---- shadows (afternoon and noon): the arcade, the bowl's rim, the trees, the statue, all on one layer
  const SHC = '#10142e';
  if (!night){
    const sh = A.canvas(W, H), s2 = sh.getContext('2d'), [dx, dy] = shv(22);
    for (let k = 1; k <= 10; k++) s2.drawImage(mask, Math.round(dx * OS * k / 10), Math.round(dy * OS * k / 10));
    s2.globalCompositeOperation = 'source-in'; s2.fillStyle = SHC; s2.fillRect(0, 0, W, H); s2.globalCompositeOperation = 'source-over';
    yield;
    for (const [x, y, w, h, ht] of blds){ const [ex, ey] = shv(ht); s2.fillStyle = SHC; for (let k = 0; k <= 4; k++) s2.fillRect(wx(x + ex * k / 4), wy(y + ey * k / 4), Math.round(w * OS), Math.round(h * OS)); }
    let ns = 0; for (const [x, y, rad] of trees){ const [ex, ey] = shv(5 + rad * 2); for (let q = 0; q <= 3; q++) disc(x + ex * q / 3, y + ey * q / 3, rad * .9, SHC, s2); if ((++ns & 127) === 0) yield; }
    { const [x, y] = STAT, [ex, ey] = shv(10); s2.fillStyle = SHC; for (let k = 0; k <= 10; k++){ const u = k / 10, w = u < .55 ? 1.4 : .6; s2.fillRect(wx(x + ex * u - w), wy(y + ey * u - w * .7), Math.max(2, Math.round(w * 2 * OS)), Math.max(2, Math.round(w * 1.4 * OS))); } s2.fillRect(wx(x + ex * 1.1), wy(y + ey * 1.1 - 1.4), 2, Math.round(4 * OS)); }
    for (const [x, y, z, main] of towers){ const [ex, ey] = shv(main ? 16 : 11); s2.fillStyle = SHC; for (let k = 0; k <= 5; k++) s2.fillRect(wx(x - z * .6 + ex * k / 5), wy(y - z * .6 + ey * k / 5), Math.round(z * 1.2 * OS), Math.round(z * 1.2 * OS)); }
    yield;
    s2.globalCompositeOperation = 'destination-out'; s2.drawImage(mask, 0, 0); s2.globalCompositeOperation = 'source-over';
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.rect(wx(-13.3), wy(-6.5), 126.6 * OS, 66.33 * OS); c.clip('evenodd');
    c.globalAlpha = noon ? .3 : .38; c.drawImage(sh, 0, 0); c.restore();
    yield;
  }
  const roof = (x, y, w, h, kind) => {
    const q = snow ? [232, 238, 248] : ROOF[kind], X = wx(x), Y = wy(y), pw = wx(x + w) - X, ph = wy(y + h) - Y;
    c.fillStyle = T(q); c.fillRect(X, Y, pw, ph);
    if (kind === 0 || kind === 4){ const hz = w >= h; c.fillStyle = T(q, .8); if (hz) c.fillRect(X, Y + (ph >> 1), pw, ph - (ph >> 1)); else c.fillRect(X + (pw >> 1), Y, pw - (pw >> 1), ph); }
    c.fillStyle = T(q, 1.3); c.fillRect(X, Y, pw, 1); c.fillRect(X, Y, 1, ph); c.fillStyle = T(q, .6); c.fillRect(X, Y + ph - 1, pw, 1); c.fillRect(X + pw - 1, Y, 1, ph);
  };
  for (const [x, y, w, h, , kind] of blds) roof(x, y, w, h, kind);
  // Live oaks: broad dark crowns, lit up-left, Spanish moss hanging gray-green off their shaded side.
  const OAK = snow ? [[226, 232, 244], [206, 216, 232], [150, 166, 190]] : [[44, 72, 40], [60, 92, 48], [86, 118, 62]], MOSS = snow ? [196, 204, 220] : [150, 160, 136];
  const tree = (x, y, rad, s) => {
    disc(x, y, rad, T(OAK[0])); disc(x - rad * .14, y - rad * .16, rad * .8, T(OAK[1]));
    for (let k = 0; k < 3; k++){ const a = s * 40 + k * 2.1; disc(x - rad * .3 + Math.cos(a) * rad * .32, y - rad * .3 + Math.sin(a) * rad * .32, rad * .3, T(OAK[2])); }
    c.fillStyle = T(MOSS); const n = Math.round(rad * 2.2);
    for (let k = 0; k < n; k++){ const a = .2 + hash2(k, s * 1000 | 0) * 2.4, rd = rad * (.45 + hash2(k + 7, s * 997 | 0) * .5); c.fillRect(wx(x + Math.cos(a) * rd), wy(y + Math.sin(a) * rd), 1, 2 + (k & 1)); }
  };
  let nt = 0; for (const t of trees){ tree(t[0], t[1], t[2], t[3]); if ((++nt & 15) === 0) yield; }
  for (const [x, y] of lamps) rect(x - .3, y - .3, .6, .6, T([60, 60, 66]));
  for (const [x, y, vis] of flags){
    const X = wx(x), Y = wy(y), q = vis ? oc : GAR;
    if (!night){ const [ex, ey] = shv(4); c.fillStyle = 'rgba(8,10,24,.32)'; for (let k = 1; k <= 6; k++) c.fillRect(X + Math.round(ex * OS * k / 6), Y + Math.round(ey * OS * k / 6), 1, 1); }
    c.fillStyle = T([200, 200, 206]); c.fillRect(X, Y, 1, 1); c.fillStyle = T(q, 1.05); c.fillRect(X + 1, Y - 1, 3, 2); c.fillStyle = T(vis ? oa : GLD); c.fillRect(X + 1, Y, 3, 1);
  }
  yield;
  for (const [x, y, z, main] of towers){   // a tower from above: a pyramid roof in slate, four faces lit and shaded, a stone finial
    const X = wx(x - z), Y = wy(y - z), n = Math.round(z * 2 * OS), q = snow ? [232, 238, 248] : [96, 102, 116];
    c.fillStyle = T(STONE); c.fillRect(X - 1, Y - 1, n + 2, n + 2);
    const FC = [1.2, .7, 1.04, .84].map(fc => T(q, night ? fc * .9 : fc));
    for (let jj = 0; jj < n; jj++){ const v = jj - n / 2 + .5, a = Math.abs(v), l = Math.round(n / 2 - a); c.fillStyle = FC[v < 0 ? 2 : 3]; c.fillRect(X, Y + jj, n, 1); c.fillStyle = FC[0]; c.fillRect(X, Y + jj, Math.max(0, l), 1); c.fillStyle = FC[1]; c.fillRect(X + n - Math.max(0, l), Y + jj, Math.max(0, l), 1); }   // the four faces, row by row
    c.fillStyle = T(STONE); c.fillRect(X + (n >> 1) - 1, Y + (n >> 1) - 1, 2, 2);
    if (main){ c.fillStyle = T([200, 200, 206]); c.fillRect(X + (n >> 1), Y + (n >> 1) - 4, 1, 3); c.fillStyle = T(GAR); c.fillRect(X + (n >> 1) + 1, Y + (n >> 1) - 5, 4, 2); c.fillStyle = T(GLD); c.fillRect(X + (n >> 1) + 1, Y + (n >> 1) - 4, 4, 1); }
  }
  yield;
  {   // the Unconquered: Osceola on Renegade, rearing on his granite plinth, facing down the green, the spear raised (lit per frame)
    const [x, y] = STAT;
    rect(x - 2.6, y - 2.6, 5.2, 5.2, T([118, 114, 112])); rect(x - 2.1, y - 2.1, 4.2, 4.2, T([150, 146, 142])); rect(x - 1.6, y - 1.6, 3.2, 3.2, T([176, 172, 166])); rect(x - 1.6, y - 1.6, 3.2, .4, T([204, 200, 194]));
    rect(x - 2.6, y - .5, .4, 1, T(GLD));   // the plaque, toward the green
    const X = wx(x) - 6, Y = wy(y) - 3, BZ = { h: T([84, 58, 36]), B: T([132, 92, 54]), b: T([96, 66, 40]), L: T([176, 128, 74]), R: T([150, 108, 64]), t: T([62, 42, 28]) };
    const SPR = ['..hh........', '.hLBBb.....t', 'hBLBRRBBbbtt', '.hBBRRBBBb.t', '..bBBBBBb...', '...bb..bb...'];
    for (let r0 = 0; r0 < SPR.length; r0++) for (let k = 0; k < SPR[r0].length; k++){ const ch = SPR[r0][k]; if (ch !== '.'){ c.fillStyle = BZ[ch]; c.fillRect(X + k, Y + r0, 1, 1); } }
    c.fillStyle = T([120, 88, 58]); for (let k = 0; k < 7; k++) c.fillRect(X + 5 - k, Y + 1 - k, 1, 1);   // the spear, raised forward over Renegade's head
  }
  // ---- the press box, skyboxes, light rigs, the boards, signage
  {   // the press box over the west rim: nine floors up, glass to the field, a white roof with its gear
    const y0 = BOWL[2] - 6.5, y1 = BOWL[2] + 2.2;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.35)'; const [ex, ey] = shv(8); c.fillRect(wx(PX[0] + ex), wy(y0 + ey), Math.round((PX[1] - PX[0]) * OS), Math.round((y1 - y0) * OS)); }
    rect(PX[0], y0, PX[1] - PX[0], y1 - y0, T(snow ? [236, 240, 248] : [212, 212, 214])); rect(PX[0], y1 - 1.6, PX[1] - PX[0], 1.6, night ? 'rgb(255,214,140)' : T([60, 86, 112]));
    for (let x = PX[0] + 2; x < PX[1]; x += 2.4) rect(x, y1 - 1.6, .3, 1.6, T([120, 124, 132]));
    rect(PX[0], y0, PX[1] - PX[0], .5, T(GAR)); rect(PX[0], y0 + .5, PX[1] - PX[0], .3, T(GLD));
    for (let x = PX[0] + 5; x < PX[1] - 4; x += 11){ rect(x, y0 + 1.6, 3.2, 2.2, T([150, 152, 160])); rect(x + .4, y0 + 2, 2.4, 1.4, T([118, 120, 128])); }
    disc(PX[0] + 3, y0 + 2.4, 1, T([236, 236, 240])); disc(PX[1] - 3, y0 + 2.4, 1, T([236, 236, 240]));   // the broadcast dishes
    const ey = BOWL[3] - 2.2;   // the east skyboxes along the top of building A
    rect(20, ey, 60, 4, T(snow ? [236, 240, 248] : [196, 196, 200])); rect(20, ey, 60, 1.3, night ? 'rgb(255,214,140)' : T([60, 86, 112])); rect(20, ey + 3.6, 60, .4, T(GAR));
  }
  yield;
  const rigs = [];
  for (const x of [-8, 28, 72, 108]){ rigs.push([x, BOWL[2] + (x > PX[0] && x < PX[1] ? -5.4 : .4)], [x, BOWL[3] - .4]); }
  for (const [x, y] of rigs){
    const X = wx(x) - 12, Y = wy(y) - 4;
    if (!night){ c.fillStyle = 'rgba(8,10,24,.4)'; c.fillRect(X + 4, Y + 3, 24, 8); }
    c.fillStyle = T([70, 74, 84]); c.fillRect(X, Y, 24, 8); c.fillStyle = T([110, 114, 124]); c.fillRect(X, Y, 24, 1);
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
  // Night: the rigs' flare and beams, lamps, tents lit from inside, the plaza's glow, the bowl's halo over the dark.
  const glow = (X, Y, rad, a, col) => { const gr = c.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.35, `rgba(${col},${a * .35})`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(X - rad, Y - rad, rad * 2, rad * 2); };
  if (night){
    c.globalCompositeOperation = 'screen';
    for (let k = 0; k < 9; k++){ c.strokeStyle = `rgba(170,205,255,${.16 * Math.pow(1 - k / 9, 2)})`; c.lineWidth = 2.6 * OS; const dd = k * 2.6 + 2; c.beginPath(); if (c.roundRect) c.roundRect(wx(UC[0] - dd), wy(UC[2] - dd), (UC[1] - UC[0] + dd * 2) * OS, (UC[3] - UC[2] + dd * 2) * OS, (UC[4] + dd) * OS); else c.rect(wx(UC[0] - dd), wy(UC[2] - dd), (UC[1] - UC[0] + dd * 2) * OS, (UC[3] - UC[2] + dd * 2) * OS); c.stroke(); }
    for (const [x, y] of rigs){
      const gx = wx(CX) - wx(x), gy = wy(CY) - wy(y), L = Math.hypot(gx, gy), nx = -gy / L, ny = gx / L, X = wx(x), Y = wy(y), R = 22 * OS;
      const gr = c.createLinearGradient(X, Y, X + gx * .9, Y + gy * .9); gr.addColorStop(0, 'rgba(215,232,255,.1)'); gr.addColorStop(1, 'rgba(215,232,255,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + gx * .9 + nx * R, Y + gy * .9 + ny * R); c.lineTo(X + gx * .9 - nx * R, Y + gy * .9 - ny * R); c.fill();
      glow(X, Y, 24 * OS, .7, '200,225,255');
    }
    for (const [x, y] of lamps) glow(wx(x), wy(y), 11 * OS, .42, '255,214,140');
    const wg = K.makeGlow(); c.globalAlpha = .5;
    for (let n = 0; n < tents.length; n += 2){ const [x, y] = tents[n], R = 5 * OS; c.drawImage(wg, wx(x + 1.6) - R, wy(y + 1.6) - R, R * 2, R * 2); }
    c.globalAlpha = 1; for (const [x, y] of GATES) glow(wx(x), wy(y), 14 * OS, .5, '255,220,160');
    glow(wx(STAT[0]), wy(STAT[1]), 16 * OS, .45, '255,190,110');   // the plaza under the spear's fire
    glow(wx(-147), wy(CY), 12 * OS, .4, '200,170,255');   // Fan Fest's stage lights
    for (const [x, y, w, h] of blds) glow(wx(x + w / 2), wy(y + h / 2), Math.max(w, h) * OS * .75, .16, '255,210,140');
    c.globalCompositeOperation = 'source-over';
    for (const [x, y] of lamps){ c.fillStyle = '#fff4cc'; c.fillRect(wx(x), wy(y), 2, 2); }
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
  const lanes = [lane(-1.5), lane(1.5)];
  yield;
  const clouds = yield* K.makeClouds(cond);
  yield;
  const hc = GAR, ac = GLD;
  return { c: cv, sparks, lanes, tower: [50, BOWL[2] - 3], night, noon, snow, rain, fog, hc, ac, bg: T(snow ? [226, 232, 244] : [74, 124, 54]), name: 'FLORIDA STATE',
    clouds, jets: K.makeJets(hc, ac, night), b2: K.makeB2(night), glow: K.makeGlow(), walk: Float32Array.from(walk), smoke: Float32Array.from(grills.flat()), wc: [T(GAR), T(GLD), T(WHITE)],
    band: [T(GAR, LK * .9), T(WHITE, LK * .9), T(GLD, LK * .9)], bandAt: [-150, CY - 2.7], flame: [STAT[0] - 2.2, STAT[1] - 2.6],
    smc: night ? 'rgb(120,124,140)' : 'rgb(226,226,230)', fx: Array.from({ length: 150 }, (_, i) => [hash2(i, 1), hash2(i, 2), .55 + hash2(i, 3) * .6, hash2(i, 4)]) };
}
const inSolid = (list, x, y, m) => { for (const q of list) if (x > q[0] - m && x < q[2] + m && y > q[1] - m && y < q[3] + m) return true; return false; };
