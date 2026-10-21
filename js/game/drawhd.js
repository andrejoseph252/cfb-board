/* Coach Andre's Bowl in HD (beta): the same renderer interface as draw.js, drawn in hdart.js's late-afternoon style,
   with a camera that zooms: in close before the snap and with the ball carrier, out wide while the quarterback can
   throw (and for kicks).

   Two layers. The field, players and shadows are pixel art at 10 logical pixels per yard in an offscreen buffer,
   scaled onto the screen canvas (at the device's full resolution) with crisp pixels; how many yards the buffer holds
   is the zoom. Markers, labels, meters and text go on top in "UI pixels", the size of draw.js's pixels, so
   everything the page measures feels the same at any zoom: R.W / R.H, toScreen, toWorld and dragToWorld all work in
   UI pixels, and a drag is worth as many yards as it always was. */
import { FW, MID, GOAL_HALF, BAR, canThrow, clamp, trajectory, throwSpread } from './sim.js';
import { drawText, drawTextCentered } from './font.js';
import * as A from './hdart.js';

const { S } = A;
const UI = 290;   // UI pixels on the screen's short side: draw.js's logical resolution
const OLD = 5;    // draw.js's pixels per yard
/* Yards across the screen's short side. */
const CLOSE = 32, CARRY = 36, THROW = 48, COVER = 46, WIDE = 58;
const KX = .95, KY = .38;   // the cast shadows' lean: low sun from the top left
const POST = ['#fff3a0', '#f5d327', '#d6a812', '#8e6a0a'].map(c => A.css(A.LIT(A.hex(c))));
const PAD = ['#3a5f94', '#16365f', '#0b2240', '#061529', '#061529'].map(c => A.css(A.LIT(A.hex(c))));
/* Plausible jersey numbers by position. */
const R_ = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const NUMS = { QB: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19], RB: [...R_(20, 35), 2, 4, 5, 6, 7], X: [...R_(1, 19), ...R_(80, 88)],
  TE: R_(80, 89), OL: R_(50, 79), DL: [...R_(90, 99), ...R_(50, 58)], LB: [...R_(30, 59), 1, 6, 10], CB: R_(1, 39), S: [...R_(1, 9), ...R_(20, 49)] };
NUMS.Z = NUMS.SL = NUMS.X;

export function createRenderer(canvas){
  const ctx = canvas.getContext('2d');
  const buf = A.canvas(8, 8), bx = buf.getContext('2d');   // the pixel-art layer
  const sl = A.canvas(8, 8), sx = sl.getContext('2d');      // cast shadows, composited onto it
  let cw = 0, ch = 0, short = 1, k = 1, Wu = UI, Hu = UI * 2, portrait = false;
  let Wb = 8, Hb = 8, bs = 1;   // the part of the buffer in use, and its scale onto the screen (device px per buffer px)
  const cam = { x: 30, y: MID, shake: 0 }, zoom = { span: CLOSE };
  let t = 0, vig = null, motes = [];

  /* ---------- size and zoom ---------- */
  let sized = '';
  /* Matches the canvas to its on-screen size at the device's resolution. Safe to call often; ignores the moment
     before the page has laid the game out. */
  function resize(){
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (r.width < 60 || r.height < 60) return false;
    const key = `${Math.round(r.width)}x${Math.round(r.height)}@${dpr}`;
    if (key === sized) return false;
    sized = key;
    portrait = r.height > r.width;
    cw = Math.round(r.width * dpr); ch = Math.round(r.height * dpr);
    canvas.width = cw; canvas.height = ch;
    short = Math.min(cw, ch); k = Math.max(1, Math.round(short / UI));
    Wu = Math.ceil(cw / k); Hu = Math.ceil(ch / k);
    // Room for the widest view (a snapped one can run a little past WIDE).
    const least = short / (WIDE * 1.15 * S);
    buf.width = sl.width = Math.ceil(cw / least) + 2; buf.height = sl.height = Math.ceil(ch / least) + 2;
    bx.imageSmoothingEnabled = false;
    setZoom(zoom.span);
    vig = null; motes = Array.from({ length: 34 }, (_, i) => ({ x: A.hash2(i, 1) * Wu, y: A.hash2(i, 2) * Hu, vx: (A.hash2(i, 3) - .3) * 2, vy: (A.hash2(i, 4) - .6) * 1.5, ph: A.hash2(i, 5) * 6 }));
    return true;
  }
  /* A view `yards` across, nudged to a whole-number scale when one is close, so views at rest are perfectly crisp. */
  const snap = yards => { const n = Math.round(short / (S * yards)), s = n >= 1 ? short / (S * n) : yards; return Math.abs(s - yards) / yards < .12 ? s : yards; };
  function setZoom(span){
    zoom.span = span; bs = short / (span * S);
    Wb = Math.min(buf.width, Math.ceil(cw / bs)); Hb = Math.min(buf.height, Math.ceil(ch / bs));
  }
  /* How close the camera wants to be: tight before the snap and with a runner, wide while there's a throw to make. */
  function zoomTarget(G, aim){
    const P = G.play;
    if (G.kick) return THROW;
    if (G.youDefend) return G.defDrill?.kind === 'rush' ? CLOSE : COVER;
    if (!P || !P.live && !P.result) return CLOSE;
    if (aim || P.ball.state === 'air' || canThrow(G)) return THROW;
    if (P.carrier) return CARRY;
    return null;   // a dead ball: stay put
  }
  function updateZoom(G, dt, aim){
    const want = zoomTarget(G, aim); if (want == null) return;
    const goal = snap(want), d = goal - zoom.span;
    if (Math.abs(d) < .03) setZoom(goal);
    else setZoom(zoom.span + d * Math.min(1, dt * (d > 0 ? 4.5 : 2.6)));   // out quickly (a throw is coming), in gently
  }

  /* ---------- coordinates ---------- */
  const toBuf = (x, y, z = 0) => portrait
    ? [Math.round((y - cam.y) * S + Wb / 2), Math.round(Hb / 2 - (x - cam.x) * S - z * S * .8)]
    : [Math.round((x - cam.x) * S + Wb / 2 + z * S * .3), Math.round((y - cam.y) * S + Hb / 2 - z * S * .75)];
  const toScreen = (x, y, z = 0) => { const [a, b] = toBuf(x, y, z), f = bs / k; return [Math.round(a * f), Math.round(b * f)]; };
  const toWorld = (ux, uy) => {
    const px = ux * k / bs, py = uy * k / bs;
    return portrait ? { x: cam.x + (Hb / 2 - py) / S, y: cam.y + (px - Wb / 2) / S } : { x: cam.x + (px - Wb / 2) / S, y: cam.y + (py - Hb / 2) / S };
  };
  /* A screen-space drag (UI px) as a field vector in yards, at draw.js's scale whatever the zoom. */
  const dragToWorld = (dx, dy) => portrait ? { x: -dy / OLD, y: dx / OLD } : { x: dx / OLD, y: dy / OLD };
  /* Buffer px to UI px, and how far above a player's feet his head is on screen (draw.js's sprites stood ~10 px). */
  const f2u = () => bs / k;
  const lift = () => Math.round(28 * f2u()) - 10;
  /* Places the world texture (pixel (i, j) = world (x0 + i/S, y0 + j/S)) on a context, turned for portrait. */
  function worldTransform(c, x0, y0){
    const [ox, oy] = toBuf(x0, y0);
    if (portrait) c.setTransform(0, -1, 1, 0, ox, oy + 1); else c.setTransform(1, 0, 0, 1, ox, oy);
  }

  /* ---------- teams: the field, the stands, uniforms, the logo ---------- */
  let teamsKey = '', fieldKey = '', art = null, crowd = null, crowdKey = '', uniOff = null, uniDef = null, logo = null, logoSrc = '';
  let home = null, away = null, building = 0;
  function prepare(G){
    const key = `${G.me.id}${G.me.color}${G.me.alt}${G.me.name}|${G.opp.id}${G.opp.color}${G.opp.alt}${G.opp.name}|${G.youDefend ? 'D' : ''}`;
    if (key !== teamsKey){
      teamsKey = key;
      // On defense your team (G.opp in those scenes) wears its colors and their offense wears road white.
      uniOff = A.uniform(G.me, !!G.youDefend); uniDef = A.uniform(G.opp, !G.youDefend);
      const fk = key.slice(0, key.lastIndexOf('|'));
      if (fk !== fieldKey){
        fieldKey = fk; home = { name: G.me.name, color: G.me.color, alt: G.me.alt }; away = { name: G.opp.name, color: G.opp.color, alt: G.opp.alt };
        // Baking the field and the stands takes a moment: do it off this frame, keeping the old ones up meanwhile.
        const job = ++building, h = home, a = away;
        setTimeout(() => { if (job !== building) return; art = A.buildField(h, a); crowd = A.buildCrowd(portrait, h, a); crowdKey = `${fk}|${portrait}`; }, 0);
      }
      loadLogo(G.youDefend ? G.opp.img : G.me.img);
    }
    const ck = `${fieldKey}|${portrait}`;
    // Turned the phone: the fans stand upright the other way.
    if (art && crowdKey && ck !== crowdKey){ crowdKey = ck; crowd = A.buildCrowd(portrait, home, away); }
  }
  function loadLogo(img){
    const src = img?.src || ''; if (src === logoSrc) return;
    logoSrc = src; logo = null; if (!src) return;
    // Our own copy, asking for CORS so it can be posterized; without it, a plain one.
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { if (logoSrc === src) logo = A.paintLogo(im); };
    im.onerror = () => { const p = new Image(); p.onload = () => { if (logoSrc === src) logo = A.paintLogo(p); }; p.src = src; };
    im.src = src;
  }
  /* Jersey numbers: stable for each team's position slot, never two alike on a team. */
  const nums = new Map(), taken = new Map();
  function jersey(team, role, idx){
    const key = `${team}|${role}|${idx}`; let n = nums.get(key); if (n != null) return n;
    const pool = NUMS[role] || NUMS.X, used = taken.get(team) || new Set(); taken.set(team, used);
    let i = Math.floor(A.hash2(String(team).length * 31 + idx, [...`${team}${role}`].reduce((s, c) => s * 31 + c.charCodeAt(0) | 0, 7)) * pool.length);
    for (let tries = 0; tries < pool.length && used.has(pool[i]); tries++) i = (i + 1) % pool.length;
    n = pool[i]; used.add(n); nums.set(key, n);
    return n;
  }

  /* ---------- the field and the stands ---------- */
  function field(G){
    bx.setTransform(1, 0, 0, 1, 0, 0);
    bx.fillStyle = '#24222a'; bx.fillRect(0, 0, Wb, Hb);
    if (!art) return;
    worldTransform(bx, A.FX0, A.FY0); bx.drawImage(art.tex, 0, 0);
    bx.setTransform(1, 0, 0, 1, 0, 0);
    if (crowd) stands(G);
    if (logo){ const [x, y] = toBuf(50, MID); bx.globalAlpha = .93; bx.drawImage(logo, x - (logo.width >> 1), y - (logo.height >> 1)); bx.globalAlpha = 1; }
  }
  function stands(G){
    const C = crowd, [ox, oy] = portrait ? toBuf(A.CX0 + A.CDEPTH, A.FY0) : toBuf(A.CX0, A.FY0);
    if (ox > Wb || oy > Hb || ox + C.c.width < 0 || oy + C.c.height < 0) return;
    bx.drawImage(C.c, ox, oy);
    bx.setTransform(1, 0, 0, 1, ox, oy);
    // The crowd's life: fans bobbing (everyone, after a score), towels, flags, camera flashes.
    const roar = (G.cheer || 0) > 0;
    for (const b of C.bob) if (Math.sin(t * (roar ? 9 : b.sp) + b.ph) > (roar ? 0 : .6)) A.person(bx, b.px, b.py - 1, b.shirt, b.skin, b.hat, b.lit, b.haze, b.hz * .42, false);
    for (const tw of C.towels){
      const f = Math.floor(t * (roar ? 12 : 7) + tw.ph) % 4, dx = [0, 1, 0, -1][f], col = tw.lit ? A.LIT(A.hex(tw.col)) : A.SHD(A.hex(tw.col));
      bx.fillStyle = A.css(A.mix(col, [40, 30, 50], .15)); bx.fillRect(tw.px + 2, tw.py - 9, 1, 3);
      bx.fillStyle = A.css(col); bx.fillRect(tw.px + 1 + dx, tw.py - 12, 4, 3);
      bx.fillStyle = A.css(A.mix(col, [255, 255, 255], .3)); bx.fillRect(tw.px + 1 + dx, tw.py - 12, 4, 1);
    }
    for (const fl of C.flags){
      const T = (c, f = 0) => A.css(A.mix(fl.lit ? A.LIT(A.hex(c)) : A.SHD(A.hex(c)), [40, 30, 20], f));
      bx.fillStyle = T('#c8ccd0'); bx.fillRect(fl.px, fl.py - 30, 1, 30); bx.fillStyle = T('#6a6e74'); bx.fillRect(fl.px + 1, fl.py - 30, 1, 30);
      for (let c = 0; c < 18; c++){
        const s = Math.sin(t * 5 + fl.k + c * .45), wv = Math.round(s * 1.4 * (c / 18)), f = s > .4 ? .18 : 0, y0 = fl.py - 30 + wv;
        bx.fillStyle = T(C.colors.field, f); bx.fillRect(fl.px + 2 + c, y0, 1, 11);
        bx.fillStyle = T(C.colors.band, f); bx.fillRect(fl.px + 2 + c, y0 + 4, 1, 3);
      }
    }
    if (Math.random() < .5){
      const px = Math.floor(Math.random() * C.c.width), py = Math.floor(Math.random() * C.c.height);
      bx.fillStyle = 'rgba(255,255,240,.95)'; bx.fillRect(px, py, 1, 1); bx.fillStyle = 'rgba(255,255,230,.45)'; bx.fillRect(px - 1, py, 3, 1); bx.fillRect(px, py - 1, 1, 3);
    }
    bx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- lines on the grass (under the players) ---------- */
  function band(X, rgb, a){
    const p0 = toBuf(X, 0), p1 = toBuf(X, FW); bx.fillStyle = A.css(rgb, a);
    if (portrait) bx.fillRect(p0[0], p0[1] - 1, p1[0] - p0[0], 3); else bx.fillRect(p0[0] - 1, p0[1], 3, p1[1] - p0[1]);
  }
  function lines(G){
    const P = G.play, L = P ? P.los : G.los;
    band(L, [63, 125, 255], .8);
    const fd = L + G.toGo;
    if (fd < 100 && !G.twoPt && !G.practice) band(fd, [255, 212, 0], .9);
  }
  function dotted(c, pts, col, gap, size){
    c.fillStyle = col;
    let acc = 0;
    for (let i = 1; i < pts.length; i++){
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s < n; s++) if (acc++ % gap === 0) c.fillRect(Math.round(x0 + (x1 - x0) * s / n) - (size >> 1), Math.round(y0 + (y1 - y0) * s / n) - (size >> 1), size, size);
    }
  }
  function routes(G){
    // Each route's first ~18 yards, enough to read the pattern without lines across the whole field.
    for (const r of G.play.rec){
      if (!r.route.length) continue;
      const pts = [[r.x, r.y]]; let left = 18;
      for (const w of r.route){
        const [px, py] = pts[pts.length - 1], d = Math.hypot(w.x - px, w.y - py);
        if (d >= left){ pts.push([px + (w.x - px) * left / d, py + (w.y - py) * left / d]); break; }
        pts.push([w.x, w.y]); left -= d;
      }
      const sp = pts.map(([x, y]) => toBuf(x, y));
      // In a target drill the target's route is bright gold and the decoys' fade back.
      const T = G.play.target, col = !T ? 'rgba(255,240,170,.85)' : r === T ? 'rgba(255,216,74,1)' : 'rgba(255,255,255,.22)';
      dotted(bx, sp, col, r === T ? 4 : 6, 2);
      const [ex, ey] = sp[sp.length - 1]; bx.fillStyle = col; bx.fillRect(ex - 2, ey - 2, 5, 5);
    }
  }
  /* A pulsing ring at a player's feet: the back to hand off to, the drill's target, the read key, you on defense. */
  function ring(p, rgb){
    const [x, y] = toBuf(p.x, p.y), pulse = (Math.sin(t * 7) + 1) / 2, rx = 14 + Math.round(pulse * 4), ry = 6 + Math.round(pulse * 2);
    bx.fillStyle = `rgba(${rgb},${.55 + pulse * .45})`;
    for (let a = 0; a < 44; a++){ const th = a / 44 * Math.PI * 2; bx.fillRect(Math.round(x + Math.cos(th) * rx) - 1, Math.round(y + Math.sin(th) * ry) - 1, 2, 2); }
  }
  /* Cover drill: where the ball will come down, ringed at your jump range (inside it, a tap gets a hand on it). */
  function landing(G, r){
    const b = G.play.ball, pulse = (Math.sin(t * 9) + 1) / 2;
    bx.fillStyle = `rgba(255,216,74,${.45 + pulse * .45})`;
    for (let a = 0; a < 40; a++){ const th = a / 40 * Math.PI * 2, [x, y] = toBuf(b.tx + Math.cos(th) * r, b.ty + Math.sin(th) * r); bx.fillRect(x - 1, y - 1, 3, 3); }
    const [cx, cy] = toBuf(b.tx, b.ty);
    bx.fillRect(cx - 4, cy - 1, 9, 2); bx.fillRect(cx - 1, cy - 4, 2, 9);
  }

  /* ---------- players ---------- */
  const phase = new WeakMap();   // each player's breathing rhythm
  /* The pose for this moment: stances before the snap, strides when moving, blocking and ready stances after. */
  function frameOf(G, p){
    const P = G.play, K = G.kick;
    if (p.down) return { down: true };
    if (Math.hypot(p.vx, p.vy) > .6) return { pose: 'set', run: Math.floor(p.step * 1.4) % 4 };
    const big = p.role === 'OL' || p.role === 'DL';
    if (K || !P || !P.live && !P.result){
      if (big || p.role === 'TE' && !K) return { pose: 'line' };
      if (p.role === 'QB') return { pose: 'set', c: 0, arms: 'ready' };
      if (p.role === 'RB' || p.role === 'LB') return { pose: 'set', c: 2, arms: 'knees' };
      if (p.role === 'S') return { pose: 'set', c: 1, arms: 'hang' };
      return { pose: 'set', c: 2, arms: 'ready' };
    }
    if (p === P.qb && P.thrown && P.ball.state === 'air' && P.ball.t < .35) return { pose: 'set', c: 0, arms: 'throw' };
    return { pose: 'set', c: 1, arms: big ? 'block' : 'ready' };
  }
  function drawPlayers(G, list){
    const counts = {}, drawn = [], pre = G.kick || !G.play || !G.play.live && !G.play.result;
    for (const p of list){
      const off = p.team === 'off', team = `${off ? G.me.id : G.opp.id}${off ? 'o' : 'd'}`;
      const slot = `${off ? 'o' : 'd'}${p.role}`, idx = counts[slot] = (counts[slot] ?? -1) + 1;
      const f = frameOf(G, p);
      let view, flip = false;
      if (portrait) view = off ? (p.vx < -.5 ? 'front' : 'back') : (p.vx > .5 ? 'back' : 'front');
      else { view = 'side'; flip = p.face < 0; }
      if (portrait && Math.abs(p.vy) > Math.abs(p.vx) + .5){ view = 'side'; flip = p.vy < 0; }
      if (f.down) flip = (p.face ?? 1) < 0;
      let ph = phase.get(p); if (ph == null){ ph = Math.random() * 6; phase.set(p, ph); }
      const still = f.run == null && !f.down, b = still && Math.sin(t * 2.1 + ph) > .35 ? 1 : 0;
      const spr = A.getSprite({ uni: off ? uniOff : uniDef, view, pose: f.pose || 'set', c: f.c || 0, arms: f.arms || 'hang', b, run: f.run ?? null,
        num: jersey(team, p.role, idx), skin: p.skin || '#c68642', flip, lit: !A.inShadow(p.x, p.y), down: !!f.down });
      // From the side, the two lines' stances would overlap: set them a touch apart.
      const nz = pre && !portrait && f.pose === 'line' ? (off ? -.45 : .35) : 0;
      const [gx, gy] = toBuf(p.x + nz, p.y);
      const hop = p.celebrate && !p.down ? Math.round(Math.abs(Math.sin(t * 9 + p.x)) * 8) : 0;   // touchdown celebration
      drawn.push({ spr, gx, gy, hop, down: f.down });
    }
    // Long late-afternoon shadows, then erased where the stadium already shades the grass.
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, Wb, Hb);
    for (const d of drawn){ if (d.down) continue; const s = d.spr; sx.setTransform(1, 0, -KX, -KY, d.gx - s.ax + KX * s.ay, d.gy + KY * s.ay); sx.drawImage(s.sil, 0, 0); }
    sx.setTransform(1, 0, 0, 1, 0, 0);
    goalposts(true);
    if (art){ sx.globalCompositeOperation = 'destination-out'; worldTransform(sx, A.FX0, A.FY0); sx.drawImage(art.mask, 0, 0); sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; }
    bx.globalAlpha = .34; bx.drawImage(sl, 0, 0, Wb, Hb, 0, 0, Wb, Hb); bx.globalAlpha = 1;
    for (const d of drawn) bx.drawImage(A.AO, d.gx - (A.AO.width >> 1), d.gy - 4);
    drawn.sort((a, b) => a.gy - b.gy || a.gx - b.gx);
    for (const d of drawn) bx.drawImage(d.spr.cv, d.gx - d.spr.ax, d.gy - d.spr.ay - d.hop);
  }
  function ball(G){
    const b = G.play.ball;
    if (b.state === 'held' && b.holder && !b.holder.down) return;
    drawBall(b.x, b.y, b.z || 0);
  }
  function drawBall(x, y, z){
    const [gx, gy] = toBuf(x, y), air = z > .25;
    if (air){ bx.fillStyle = 'rgba(6,10,20,.38)'; bx.fillRect(gx - 3, gy - 1, 7, 3); bx.fillRect(gx - 2, gy - 2, 5, 5); }
    const [bx_, by_] = toBuf(x, y, z), spr = A.ballSprite(portrait, air, air ? [0, 1, 0, 2][Math.floor(t * 16) % 4] : 0);
    bx.drawImage(spr, bx_ - (spr.width >> 1), by_ - (spr.height >> 1) - (air ? 0 : 2));
  }
  /* A line `cols.length` pixels thick, one color per pixel across it. */
  function thick(c, a, b, cols, vertical){
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    for (let i = 0; i <= n; i++){
      const px = Math.round(a[0] + (b[0] - a[0]) * i / n), py = Math.round(a[1] + (b[1] - a[1]) * i / n);
      for (let q = 0; q < cols.length; q++){ c.fillStyle = cols[q]; if (vertical) c.fillRect(px - (cols.length >> 1) + q, py, 1, 1); else c.fillRect(px, py - (cols.length >> 1) + q, 1, 1); }
    }
  }
  /* The far goalposts: padded base, gooseneck, crossbar, uprights and their ribbons (or, shadow = true, the
     post's shadow on the cast-shadow layer). */
  function goalposts(shadow = false){
    const v = (X, Y, Z) => toBuf(X, Y, Z);
    if (shadow){
      const sh = (X, Y, Z) => { const [gx, gy] = toBuf(X, Y, 0), hs = Z * S * (portrait ? .8 : .78); return [gx + hs * KX, gy + hs * KY]; };
      thick(sx, sh(111.4, MID, 0), sh(111.4, MID, 2.4), ['#000', '#000', '#000'], !portrait);
      return;
    }
    const [bx0, by0] = v(110, MID, BAR + 8); if (bx0 < -40 || by0 > Hb + 120 || by0 < -120 || bx0 > Wb + 40) return;
    thick(bx, v(111.4, MID, 0), v(111.4, MID, 1.9), PAD, true);
    thick(bx, v(111.4, MID, 1.9), v(111.4, MID, 2.4), POST.slice(0, 3), true);
    thick(bx, v(111.4, MID, 2.4), v(110, MID, BAR), POST.slice(0, 3), true);
    thick(bx, v(110, MID - GOAL_HALF, BAR), v(110, MID + GOAL_HALF, BAR), POST.slice(0, 3), !portrait);
    for (const s of [-1, 1]){
      const a = v(110, MID + s * GOAL_HALF, BAR), b = v(110, MID + s * GOAL_HALF, BAR + 8);
      thick(bx, a, b, [POST[0], POST[2]], true);
      const w = Math.sin(t * 7 + s) > 0 ? 1 : 0;
      bx.fillStyle = A.css(A.LIT(A.hex('#ff5a3c'))); bx.fillRect(b[0] + 1, b[1] + 1, 4, 1); bx.fillRect(b[0] + 3 + w, b[1] + 2, 3, 1);
    }
  }
  /* A holder and kicker, plus the line, for the field goal / extra point picture. */
  function kickPlayers(G){
    const K = G.kick;
    const me = (x, y, face = 1) => ({ x, y, vx: 0, vy: 0, step: 0, face, team: 'off', role: 'X', skin: '#c68642', stun: 0, down: false });
    const them = (x, y) => ({ ...me(x, y, -1), team: 'def', role: 'DL', skin: '#8d5524' });
    const list = kickCast.at === K ? kickCast.list : [me(0, 0), me(0, 0)];
    if (kickCast.at !== K){ for (const dy of [-4, -2.5, -1, 0, 1, 2.5, 4]) list.push({ ...me(0, 0), role: 'OL', dy }, { ...them(0, 0), dy }); kickCast.at = K; kickCast.list = list; }
    // Placed every frame (the kicker steps up), but the same people, so they keep their numbers and breathing.
    list[0].x = K.spotX - .4; list[0].y = K.spotY - .8;
    list[1].x = K.spotX - (K.stage === 'flight' || K.stage === 'done' ? .5 : 2.5); list[1].y = K.spotY + .9;
    for (const p of list.slice(2)){ p.x = K.spotX + (p.team === 'off' ? 6.4 : 7.6); p.y = K.spotY + p.dy * (p.team === 'off' ? 1 : 1.05); }
    drawPlayers(G, list);
    if (K.ball) drawBall(K.ball.x, K.ball.y, K.ball.z); else drawBall(K.spotX, K.spotY, 0);
  }
  const kickCast = { at: null, list: null };

  /* ---------- overlays (UI pixels, on the screen) ---------- */
  function line(x0, y0, x1, y1, col, w = 1){
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n) - (w >> 1), Math.round(y0 + (y1 - y0) * i / n) - (w >> 1), w, w);
  }
  function labels(G){
    const P = G.play, L = lift();
    for (const r of P.rec){
      if (r.routeName === 'block' && P.t < 1) continue;
      const d = Math.min(...P.def.map(x => Math.hypot(x.x - r.x, x.y - r.y)));
      const col = d > 3 ? '#4cff7a' : d > 1.6 ? '#ffd84a' : '#ff5a4e';
      const [x, y] = toScreen(r.x, r.y);
      ctx.fillStyle = col; ctx.fillRect(x - 4, y + 1, 9, 1); ctx.fillRect(x - 3, y + 2, 7, 1);
      ctx.fillStyle = '#101010'; ctx.fillRect(x - 4, y - 25 - L, 9, 9);
      ctx.fillStyle = col; ctx.fillRect(x - 3, y - 24 - L, 7, 7);
      drawText(ctx, String(r.num), x - 2, y - 24 - L, { color: '#101010', scale: 1 });
    }
  }
  function aimArc(G, aim){
    // The real flight (white: a bullet; blue: a touch throw over the linebackers; gold: a deep ball) and, around the
    // spot, how far the throw can stray right now: the ring grows under pressure and on the run.
    const P = G.play, q = P.qb, { h, tier } = trajectory(G, aim.x, aim.y), sd = throwSpread(G, aim.x, aim.y), pts = [];
    for (let i = 0; i <= 24; i++){ const s = i / 24; pts.push(toScreen(q.x + (aim.x - q.x) * s, q.y + (aim.y - q.y) * s, 1.8 - .6 * s + 4 * h * s * (1 - s))); }
    const col = { bullet: [255, 255, 255], touch: [125, 216, 255], deep: [255, 216, 74] }[tier];
    dotted(ctx, pts, `rgb(${col})`, 2, 1);
    const [tx, ty] = toScreen(aim.x, aim.y), seg = 32;
    ctx.fillStyle = `rgba(${col},.85)`;
    for (let a = 0; a < seg; a++){ const th = a / seg * Math.PI * 2, [x, y] = toScreen(aim.x + Math.cos(th) * sd * 1.6, aim.y + Math.sin(th) * sd * 1.6); ctx.fillRect(x, y, 1, 1); }
    ctx.fillStyle = '#fff'; ctx.fillRect(tx - 1, ty, 3, 1); ctx.fillRect(tx, ty - 1, 1, 3);
  }
  /* An arrow bobbing over a player's head: the back to hand off to, the drill's target, you, the ball carrier. */
  function mark(p, col){
    const [x, y] = toScreen(p.x, p.y), b = Math.floor(t * 6) % 2, L = lift();
    ctx.fillStyle = '#101010'; ctx.fillRect(x - 3, y - 19 - b - L, 7, 4);
    ctx.fillStyle = col; ctx.fillRect(x - 2, y - 18 - b - L, 5, 1); ctx.fillRect(x - 1, y - 17 - b - L, 3, 1); ctx.fillRect(x, y - 16 - b - L, 1, 1);
  }
  /* The drag stick on defense: a ring where your finger went down and a knob where it is now. */
  function stick(v){
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    for (let a = 0; a < 40; a++){ const th = a / 40 * Math.PI * 2; ctx.fillRect(Math.round(v.ax + Math.cos(th) * v.r), Math.round(v.ay + Math.sin(th) * v.r), 1, 1); }
    const r = Math.max(3, Math.round(v.r * .38));
    ctx.fillStyle = 'rgba(255,216,74,.85)';
    for (let y = -r; y <= r; y++){ const w = Math.round(Math.sqrt(r * r - y * y)); ctx.fillRect(Math.round(v.kx) - w, Math.round(v.ky) + y, w * 2 + 1, 1); }
  }
  /* Pass rush timing meter over your rusher: a marker sweeps the bar; tap while it's in the green. */
  function rushMeter(p, m){
    const [x, y] = toScreen(p.x, p.y), w = 30, x0 = x - w / 2, y0 = y - 30 - lift();
    ctx.fillStyle = '#101010'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 6);
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(x0, y0, w, 4);
    ctx.fillStyle = m.flash ? '#ff5a4e' : '#4cff7a'; ctx.fillRect(x0 + Math.round(m.lo * w), y0, Math.max(2, Math.round((m.hi - m.lo) * w)), 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(x0 + Math.round(m.pos * w) - 1, y0 - 2, 2, 8);
  }
  function stunned(G){
    const L = lift();
    for (const p of G.play.all){
      if (!(p.stun > 0) || p.down) continue;
      const [x, y] = toScreen(p.x, p.y), a = t * 8;
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(x + Math.round(Math.cos(a) * 5), y - 16 - L + Math.round(Math.sin(a) * 1.5), 1, 1);
      ctx.fillRect(x - Math.round(Math.cos(a) * 5), y - 16 - L - Math.round(Math.sin(a) * 1.5), 1, 1);
    }
  }
  function effects(P, dt){
    const n = Math.max(1, Math.round(f2u() * 1.5)), L = lift();
    for (const f of P.fx){
      f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z = Math.max(0, f.z + f.vz * dt); f.vz -= 9 * dt;
      if (f.t > f.life) continue;
      const [x, y] = toScreen(f.x, f.y, f.z); ctx.fillStyle = f.c; ctx.fillRect(x, y, n, n);
    }
    P.fx = P.fx.filter(f => f.t <= f.life);
    for (const p of P.pops){
      p.t += dt; if (p.t > 1.3) continue;
      const [x, y] = toScreen(p.x, p.y);
      drawTextCentered(ctx, p.text, x, y - 30 - L - p.t * 14, { color: p.color, outline: '#101010' });
    }
    P.pops = P.pops.filter(p => p.t <= 1.3);
  }
  /* Close in, a receiver can be off the screen: a tab on the edge with his number points the way. */
  function edgeArrows(G){
    const P = G.play;
    for (const r of P.rec){
      if (r.down || r.routeName === 'block' && P.live) continue;
      const [x, y] = toScreen(r.x, r.y), top = y - Math.round(30 * f2u());
      const offL = x < 2, offR = x > Wu - 2, offU = y < 0, offD = top > Hu;
      if (!offL && !offR && !offU && !offD) continue;
      const w = 17, h = 11, ex = clamp(x - (w >> 1), 2, Wu - w - 2), ey = clamp(y - 20, 4, Hu - h - 4);
      ctx.fillStyle = 'rgba(10,14,28,.82)'; ctx.fillRect(ex, ey, w, h);
      ctx.fillStyle = '#ffd84a';
      if (offL || offR){ for (let q = 0; q < 4; q++){ const ax = offL ? ex + 1 + q : ex + w - 2 - q; ctx.fillRect(ax, ey + 5 - q, 1, q * 2 + 1); } }
      else for (let q = 0; q < 4; q++){ const ay = offU ? ey + 1 + q : ey + h - 2 - q; ctx.fillRect(ex + 3 - q, ay, q * 2 + 1, 1); }
      drawText(ctx, String(r.num), offL ? ex + 7 : offR ? ex + 3 : ex + 9, ey + 2, { color: '#ffd84a', scale: 1 });
    }
  }
  function kickOverlay(G){
    const K = G.kick, [bxs, bys] = toScreen(K.spotX, K.spotY);
    if (K.stage !== 'aim' && K.stage !== 'power') return;
    const L = 14, [ax, ay] = toScreen(K.spotX + Math.cos(K.aim) * L, K.spotY + Math.sin(K.aim) * L);
    line(bxs, bys, ax, ay, '#ffd84a', 1);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(ax - 1, ay - 1, 3, 3);
    // Power meter beside the ball.
    const mx = bxs + (portrait ? 14 : -4), my = bys + (portrait ? -6 : 12);
    ctx.fillStyle = '#101010'; ctx.fillRect(mx - 1, my - 31, 6, 33);
    const hgt = Math.round((K.stage === 'power' ? K.power : 0) * 30);
    ctx.fillStyle = K.power > .92 ? '#ff5a4e' : '#4cff7a'; ctx.fillRect(mx, my - hgt, 4, hgt);
  }
  /* Dust drifting in the sunlit air. */
  function dust(dt){
    for (const m of motes){
      m.x = (m.x + m.vx * dt + Wu) % Wu; m.y = (m.y + m.vy * dt + Hu) % Hu;
      const w = toWorld(m.x, m.y); if (A.inShadow(w.x, w.y)) continue;
      const a = (Math.sin(t * 1.7 + m.ph) + 1) / 2; if (a < .45) continue;
      ctx.fillStyle = `rgba(255,236,190,${(.2 + a * .3).toFixed(2)})`; ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
  }
  /* A dithered vignette in a few quantized steps (UI pixels; built once per size). */
  function vignette(){
    if (!vig){
      vig = A.canvas(Wu, Hu); const x = vig.getContext('2d'), img = x.createImageData(Wu, Hu), d = img.data;
      for (let j = 0; j < Hu; j++) for (let i = 0; i < Wu; i++){
        const nx = (i - Wu / 2) / (Wu / 2), ny = (j - Hu / 2) / (Hu / 2);
        const r = Math.sqrt(nx * nx * (portrait ? .85 : 1) + ny * ny * (portrait ? 1 : .85));
        const lvl = Math.floor(Math.pow(clamp((r - .66) / .6, 0, 1), 1.6) * .5 * 5 + A.bayer(i, j)) / 5;
        if (lvl <= 0) continue;
        const q = (j * Wu + i) * 4; d[q] = 10; d[q + 1] = 7; d[q + 2] = 22; d[q + 3] = Math.round(lvl * 140);
      }
      x.putImageData(img, 0, 0);
    }
    ctx.drawImage(vig, 0, 0);
  }

  /* ---------- camera ---------- */
  function updateCamera(G, dt, aim){
    const P = G.play, K = G.kick;
    const long = (portrait ? Hb : Wb) / S, lat = (portrait ? Wb : Hb) / S;
    let fx, fy, ahead;
    if (K){ fx = (K.ball ? Math.max(K.spotX, Math.min(K.ball.x, 108)) : K.spotX) + long * .3; fy = K.ball ? (K.ball.y + MID) / 2 : (K.spotY + MID) / 2; ahead = 0; }
    else if (!P || !P.live && !P.result){
      fx = (P ? P.los : G.los); fy = P ? P.b : G.y; ahead = long * (portrait ? .2 : .16);
      // Covering: frame your corner and the quarterback together, so the matchup and the formation are both in view.
      const cb = G.youDefend && G.defDrill?.kind === 'cover' && P?.def.find(d => d.user);
      if (cb) fy = (cb.y + P.qb.y) / 2;
    }
    else {
      const b = P.ball, you = G.youDefend && P.def.find(d => d.user);
      // On defense the camera stays with you while the ball is up, framing you and where it will come down.
      const air = b.state === 'air' && (you ? { x: (you.x + b.tx) / 2, y: (you.y + b.ty) / 2 } : { x: b.x, y: b.y });
      const pair = you && G.defDrill?.kind === 'cover' && b.state === 'held' ? { x: (you.x + P.qb.x) / 2, y: (you.y + P.qb.y) / 2 } : null;
      const foc = P.carrier || air || pair || you || P.qb;
      fx = foc.x; fy = foc.y; ahead = P.carrier ? long * .14 : canThrow(G) ? long * .24 : long * .1;
      if (aim){ fx = (P.qb.x + aim.x) / 2; fy = (P.qb.y + aim.y) / 2; ahead = long * .05; }
    }
    let tx = fx + ahead, ty = fy;
    // Near the goal line, frame the whole end zone with room to spare at the far edge (where the scoreboard sits on a
    // phone), and for kicks the uprights too, without letting the ball itself drift to the edge.
    const far = K ? 120 : 110;
    if (fx + long / 2 > 96) tx = Math.max(tx, Math.min(far + long * .2 - long / 2, fx + long * .25));
    if (K) tx = Math.min(tx, K.spotX - 3 + long / 2);   // ...without losing the kicker off the near edge
    tx = long >= 128 ? 50 : clamp(tx, -13 + long / 2, 140 - long / 2);
    ty = lat >= FW + 14 ? MID : clamp(ty, lat / 2 - 7, FW + 7 - lat / 2);
    const q = Math.min(1, dt * (P?.live ? 5 : 3.2));
    cam.x += (tx - cam.x) * q; cam.y += (ty - cam.y) * q;
  }
  function snapCamera(G){
    setZoom(snap(zoomTarget(G) ?? CLOSE));
    cam.x = G.los + ((portrait ? Hb : Wb) / S) * (portrait ? .2 : .16); cam.y = clamp(G.y, 0, FW);
  }

  /* ---------- a frame ---------- */
  function draw(G, dt, view = {}){
    t += dt;
    prepare(G);
    updateZoom(G, dt, view.aim);
    updateCamera(G, dt, view.aim);
    const sh = cam.shake > 0 ? cam.shake : 0; cam.shake = Math.max(0, cam.shake - dt * 10);
    const ox = sh ? Math.round((Math.random() - .5) * sh * 2) : 0, oy = sh ? Math.round((Math.random() - .5) * sh * 2) : 0;
    // The pixel-art layer.
    field(G);
    const P = G.play, mine = P && !G.kick && P.def.find(d => d.user || d.rusher);
    if (G.kick) kickPlayers(G);
    else if (P){
      lines(G);
      if (!P.live && !P.result && view.routes) routes(G);
      if (view.handoff && !P.carrier) ring(P.rb, '125,249,255');
      if (P.target && !P.thrown && !P.carrier) ring(P.target, '255,216,74');   // the target drill's man to hit
      if (view.readKey) ring(view.readKey, '255,216,74');   // the read option's key: the end left unblocked
      if (mine && !P.result) ring(mine, '255,216,74');   // you, on defense
      if (view.landing && P.ball.state === 'air') landing(G, view.landing);
      drawPlayers(G, P.all);
      ball(G);
    }
    goalposts();
    // Onto the screen, then the overlays in UI pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    if (sh){ ctx.fillStyle = '#24222a'; ctx.fillRect(0, 0, cw, ch); }
    ctx.drawImage(buf, 0, 0, Wb, Hb, ox * k, oy * k, Wb * bs, Hb * bs);
    ctx.setTransform(k, 0, 0, k, ox * k, oy * k);
    if (G.kick) kickOverlay(G);
    else if (P){
      if (P.live && canThrow(G) && !view.aim && !G.youDefend) labels(G);
      stunned(G);
      if (P.carrier && !P.carrier.down) mark(P.carrier, '#ffd84a');
      if (view.handoff && !P.carrier) mark(P.rb, '#7df9ff');
      if (P.target && !P.thrown && !P.carrier) mark(P.target, '#ffd84a');
      if (mine && !P.result) mark(mine, '#ffd84a');
      if (view.rush && mine) rushMeter(mine, view.rush);
      if (view.aim){ labels(G); aimArc(G, view.aim); }
      if (!G.youDefend && !P.carrier && !P.result) edgeArrows(G);
      effects(P, dt);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    dust(dt);
    vignette();
    if (view.stick) stick(view.stick);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return {
    resize, draw, toWorld, toScreen, dragToWorld, snapCamera,
    shake(a){ cam.shake = Math.max(cam.shake, a); },
    get portrait(){ return portrait; }, get W(){ return Wu; }, get H(){ return Hu; }, S: OLD,
    /* How far above his feet the middle of a player is, in UI pixels (for taps on receivers). */
    get figure(){ return Math.round(16 * f2u()); },
    hd: true
  };
}
