/* Coach Andre's Bowl in HD (beta): the same renderer interface as draw.js, drawn in hdart.js's late-afternoon style,
   with a camera that zooms: in close before the snap and with the ball carrier, out wide while the quarterback can
   throw (and for kicks).

   Two layers. The field, players and shadows are pixel art at 10 logical pixels per yard in an offscreen buffer,
   scaled onto the screen canvas (at the device's full resolution) with crisp pixels; how many yards the buffer holds
   is the zoom. Markers, labels, meters and text go on top in "UI pixels", the size of draw.js's pixels, so
   everything the page measures feels the same at any zoom: R.W / R.H, toScreen, toWorld and dragToWorld all work in
   UI pixels, and a drag is worth as many yards as it always was. */
import { FW, MID, GOAL_HALF, BAR, canThrow, clamp, trajectory, throwSpread } from './sim.js';
import * as A from './hdart.js';
import { sfx } from './sfx.js';

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
/* The HD interface's colors (hdkit.js's tokens) for the overlays. */
const INK = '#0b0d10', GLASS = 'rgba(16,18,22,.78)', GO = '#3ddc84', YEL = '#ffd23f', BAD = '#ff4d4f';
const STATE = { open: GO, tight: YEL, covered: BAD };
/* The engine's pop-up colors, in the new palette. */
const POP = { '#4cff7a': GO, '#ff5a4e': BAD, '#ffd84a': YEL, '#9fc4ff': '#9fc4ff', '#fff': '#fff' };
const FINE = typeof matchMedia === 'function' ? matchMedia('(pointer: fine)') : null;
/* Big Shoulders Display (index.html loads it) once it's ready; a narrow system face until then. */
const DISPLAY = '"Big Shoulders Display"';
let fontOK = false;
try { document.fonts.load(`800 12px ${DISPLAY}`).then(f => { if (f.length) fontOK = true; }, () => {}); } catch {}
const font = (px, w = 800) => `${w} ${px.toFixed(2)}px ${fontOK ? `${DISPLAY},` : ''}"Arial Narrow",Impact,sans-serif`;
/* Florida State (ESPN id 52): garnet and gold. */
const FSU = '52', GARNET = '#782f40', GOLD = '#ceb888';
const isFSU = t => String(t?.id) === FSU;

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
  /* Before the snap with the route preview on: as close as frames every receiver and the first stretch of his route
     (what the preview draws), across the field; up and down there's always room. */
  let routesOn = true;
  function fit(P){
    let lo = P.b, hi = P.b;
    for (const r of P.rec){
      lo = Math.min(lo, r.y); hi = Math.max(hi, r.y);
      let px = r.x, py = r.y, left = 18;
      for (const w of r.route){
        const d = Math.hypot(w.x - px, w.y - py), u = Math.min(1, left / (d || 1)), y = py + (w.y - py) * u;
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        if (d >= left) break;
        left -= d; px = w.x; py = w.y;
      }
    }
    return { span: clamp(hi - lo + 7, CLOSE, THROW), mid: (lo + hi) / 2 };
  }
  const fitting = (G, P) => routesOn && P && !P.live && !P.result && !G.youDefend && !G.kick;
  /* How close the camera wants to be: framing the routes (or tight) before the snap, wide while there's a throw to
     make, tight again with a runner. */
  function zoomTarget(G, aim){
    const P = G.play;
    if (spearOn()) return CLOSE;
    if (G.kick) return THROW;
    if (G.youDefend) return G.defDrill?.kind === 'rush' ? CLOSE : COVER;
    if (fitting(G, P)) return fit(P).span;
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
  /* World to buffer pixels. The camera is pinned to whole pixels and everything is placed from there, so the players,
     the ball and the turf move together on one pixel grid instead of shimmering against each other. */
  const toBuf = (x, y, z = 0) => {
    const cx = Math.round(cam.x * S), cy = Math.round(cam.y * S), hw = Wb >> 1, hh = Hb >> 1;
    return portrait ? [Math.round(y * S) - cy + hw, hh - (Math.round(x * S) - cx) - Math.round(z * S * .8)]
      : [Math.round(x * S) - cx + hw + Math.round(z * S * .3), Math.round(y * S) - cy + hh - Math.round(z * S * .75)];
  };
  const toScreen = (x, y, z = 0) => { const [a, b] = toBuf(x, y, z), f = bs / k; return [Math.round(a * f), Math.round(b * f)]; };
  const toWorld = (ux, uy) => {
    const px = ux * k / bs, py = uy * k / bs;
    const cx = Math.round(cam.x * S), cy = Math.round(cam.y * S), hw = Wb >> 1, hh = Hb >> 1;
    return portrait ? { x: (cx + hh - py) / S, y: (cy + px - hw) / S } : { x: (cx + px - hw) / S, y: (cy + py - hh) / S };
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
    if (C.chop && chopping(G)){
      // The chop: arms up, then down toward the field together, about twice a second.
      const ph = (t * 1.9) % 1, f = ph < .42 ? 0 : ph < .56 ? 1 : 2;
      for (const c of C.chop){
        bx.fillStyle = c.arm;
        if (f === 0){ bx.fillRect(c.px + 2, c.py - 11, 1, 7); bx.fillRect(c.px + 2, c.py - 12, 1, 1); }
        else if (f === 1){ bx.fillRect(c.px + 2, c.py - 6, 1, 2); bx.fillRect(c.px + 3, c.py - 8, 1, 2); bx.fillRect(c.px + 4, c.py - 9, 1, 1); }
        else bx.fillRect(c.px, c.py - 4, 2, 2);
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
    // A stride every 2.6 yards of ground covered, so the feet keep pace with the turf at any speed; a truck lowers
    // the shoulder.
    if (Math.hypot(p.vx, p.vy) > .6) return { pose: 'set', run: Math.floor(p.step / 2.6 * 8) % 8, c: p.truck > 0 ? 2 : 0 };
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
      let hop = p.celebrate && !p.down ? Math.round(Math.abs(Math.sin(t * 9 + p.x)) * 8) : 0;   // touchdown celebration
      // Moves: a juke leans him away from the cut, a dive launches him, a stumble wobbles, and a man going down tips
      // over for a beat before he lies on the turf.
      let lean = 0, rot = 0, fall = null, dx = 0;
      if (p.juke > 0){ const k = Math.sin(Math.PI * (1 - p.juke / .3)); lean = -(p.jukeDir || 1) * .32 * k; dx = Math.round((p.jukeDir || 1) * 2 * k); }
      if (p.dive > 0){ const k = 1 - p.dive / .32; hop = Math.round(Math.sin(Math.PI * k) * 7); lean = (portrait ? 0 : -.35) * Math.sin(Math.PI * k); }
      if (p.stumble > 0) dx += Math.round(Math.sin(t * 38));
      if (!portrait) [lean, dx] = [lean * .4, 0];   // from the side, a cut runs up or down the screen
      if (f.down){
        let at = downAt.get(p); if (at == null){ at = t; downAt.set(p, at); }
        const k = (t - at) / .22;
        if (k < 1){ rot = (flip ? -1 : 1) * Math.PI / 2 * Math.min(1, k * k * 1.2 + .15); fall = A.getSprite({ uni: off ? uniOff : uniDef, view: 'side', pose: 'set', c: 0, arms: 'hang', b: 0, run: null,
          num: jersey(team, p.role, idx), skin: p.skin || '#c68642', flip, lit: !A.inShadow(p.x, p.y), down: false }); }
      } else downAt.delete(p);
      // The ball, tucked in the carrier's arm (or in the quarterback's hands on a dropback).
      const B = G.play?.ball, ball = !G.kick && G.play?.live && B?.state === 'held' && B.holder === p && !p.down ? (view === 'side' ? (flip ? -4 : 4) : view === 'back' ? 5 : -6) : null;
      drawn.push({ spr, gx: gx + dx, gy, hop, down: f.down, lean, rot, fall, ball });
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
    for (const d of drawn){
      if (d.fall){   // tipping over, about his feet
        bx.setTransform(1, 0, 0, 1, d.gx, d.gy); bx.rotate(d.rot); bx.drawImage(d.fall.cv, -d.fall.ax, -d.fall.ay); bx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      const s = d.spr, y = d.gy - d.hop;
      if (d.lean){ bx.setTransform(1, 0, d.lean, 1, d.gx - s.ax - d.lean * s.ay, y - s.ay); bx.drawImage(s.cv, 0, 0); bx.setTransform(1, 0, 0, 1, 0, 0); }
      else bx.drawImage(s.cv, d.gx - s.ax, y - s.ay);
      if (d.ball != null){ const b = A.ballSprite(false, false, 0); bx.drawImage(b, d.gx + d.ball - (b.width >> 1), y - 16); }
    }
  }
  const downAt = new WeakMap();   // when each player hit the turf (for the fall)
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

  /* ---------- overlays (UI pixels, on the screen) ----------
     Drawn as clean vector shapes at the device's resolution (the HD interface's look: dark outlines, the UI's
     green / yellow / red, Big Shoulders Display for numbers and words). */
  /* A rounded diamond centered on (x, y), r from the center to a corner. */
  function diamond(x, y, r){
    const c = r * .3;
    ctx.beginPath();
    ctx.moveTo(x - c * .7, y - r + c * .7);
    ctx.quadraticCurveTo(x, y - r, x + c * .7, y - r + c * .7); ctx.lineTo(x + r - c * .7, y - c * .7);
    ctx.quadraticCurveTo(x + r, y, x + r - c * .7, y + c * .7); ctx.lineTo(x + c * .7, y + r - c * .7);
    ctx.quadraticCurveTo(x, y + r, x - c * .7, y + r - c * .7); ctx.lineTo(x - r + c * .7, y + c * .7);
    ctx.quadraticCurveTo(x - r, y, x - r + c * .7, y - c * .7); ctx.closePath();
  }
  /* Text with a dark rim, in the display face (once it has loaded). */
  function say(text, x, y, px, col, { align = 'center', base = 'middle', rim = 2.4, alpha = 1 } = {}){
    ctx.save(); ctx.globalAlpha = alpha; ctx.font = font(px); ctx.textAlign = align; ctx.textBaseline = base; ctx.lineJoin = 'round';
    ctx.lineWidth = rim; ctx.strokeStyle = INK; ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
    ctx.restore();
  }
  /* How open a receiver is: the nearest defender's distance, in the three states the tags show. */
  function openness(P, r){
    const d = Math.min(...P.def.map(x => Math.hypot(x.x - r.x, x.y - r.y)));
    return d > 3 ? 'open' : d > 1.6 ? 'tight' : 'covered';
  }
  /* Receiver tags: a small color marker over each head (green open, yellow tight, red covered). Open is the biggest
     and breathes a soft halo, covered is smaller and dimmer, so it reads without color too. With a keyboard (a fine
     pointer) a tiny number beside it names the key that throws to him. */
  function labels(G){
    const P = G.play, L = lift(), keys = FINE?.matches;
    for (const r of P.rec){
      if (r.routeName === 'block' && P.t < 1) continue;
      const st = openness(P, r), [x, y0] = toScreen(r.x, r.y), y = y0 - 18 - L;
      const rad = st === 'open' ? 4.6 : st === 'tight' ? 4 : 3.3;
      ctx.save();
      if (st === 'open'){ const p = (Math.sin(t * 5) + 1) / 2; diamond(x, y, rad + 2 + p * 1.4); ctx.fillStyle = `rgba(61,220,132,${(.16 + p * .16).toFixed(2)})`; ctx.fill(); }
      ctx.globalAlpha = st === 'covered' ? .74 : 1;
      diamond(x, y, rad + .9); ctx.fillStyle = INK; ctx.fill();
      diamond(x, y, rad); ctx.fillStyle = STATE[st]; ctx.fill();
      // A little light on the top facet.
      ctx.beginPath(); ctx.moveTo(x - rad * .5, y - rad * .5); ctx.lineTo(x, y - rad * .92); ctx.lineTo(x + rad * .5, y - rad * .5); ctx.lineTo(x, y - rad * .12); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();
      ctx.restore();
      if (keys) say(String(r.num), x + rad + 2.2, y + .3, 7.5, '#fff', { align: 'left', rim: 2, alpha: st === 'covered' ? .74 : 1 });
    }
  }
  function aimArc(G, aim){
    // The real flight (white: a bullet; blue: a touch throw over the linebackers; gold: a deep ball) as a fine dotted
    // arc and, around the spot, how far the throw can stray right now: a ring of dots that grows under pressure and on
    // the run. Kept light on purpose, so it never hides the receivers.
    const P = G.play, q = P.qb, { h, tier } = trajectory(G, aim.x, aim.y), sd = throwSpread(G, aim.x, aim.y), pts = [];
    for (let i = 0; i <= 24; i++){ const s = i / 24; pts.push(toScreen(q.x + (aim.x - q.x) * s, q.y + (aim.y - q.y) * s, 1.8 - .6 * s + 4 * h * s * (1 - s))); }
    const col = { bullet: '255,255,255', touch: '125,216,255', deep: '255,216,74' }[tier];
    dotted(ctx, pts, `rgb(${col})`, 2, 1);
    const [tx, ty] = toScreen(aim.x, aim.y), seg = 28;
    ctx.fillStyle = `rgba(${col},.85)`;
    for (let a = 0; a < seg; a++){ const th = a / seg * Math.PI * 2, [x, y] = toScreen(aim.x + Math.cos(th) * sd * 1.6, aim.y + Math.sin(th) * sd * 1.6); ctx.fillRect(x, y, 1, 1); }
    ctx.fillStyle = '#fff'; ctx.fillRect(tx - 1, ty, 3, 1); ctx.fillRect(tx, ty - 1, 1, 3);
  }
  /* A pointer bobbing over a player's head: the back to hand off to, the drill's target, you, the ball carrier. */
  function mark(p, col){
    const [x, y] = toScreen(p.x, p.y), L = lift(), yy = y - 19 - L - (Math.sin(t * 6) + 1) * .9;
    ctx.save(); ctx.lineJoin = 'round';
    const tri = () => { ctx.beginPath(); ctx.moveTo(x - 4.8, yy - 3.4); ctx.lineTo(x + 4.8, yy - 3.4); ctx.lineTo(x, yy + 2.8); ctx.closePath(); };
    tri(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke(); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 3.2, yy - 2.6); ctx.lineTo(x + 3.2, yy - 2.6); ctx.lineTo(x, yy - 1.1); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    ctx.restore();
  }
  /* The drag stick on defense: a glass ring where your finger went down and a knob where it is now. */
  function stick(v){
    ctx.save();
    ctx.beginPath(); ctx.arc(v.ax, v.ay, v.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(16,18,22,.28)'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.stroke();
    const r = Math.max(3, v.r * .38);
    ctx.beginPath(); ctx.arc(v.kx, v.ky, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,210,63,.92)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(v.kx - r * .25, v.ky - r * .3, r * .45, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
    ctx.restore();
  }
  /* A glass capsule (meters' track). */
  function capsule(x, y, w, h, fill = GLASS){ ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(w, h) / 2); ctx.fillStyle = fill; ctx.fill(); }
  /* Pass rush timing meter over your rusher: a marker sweeps the bar; tap while it's in the green. */
  function rushMeter(p, m){
    const [x, y] = toScreen(p.x, p.y), w = 32, x0 = Math.round(x - w / 2), y0 = y - 31 - lift();
    ctx.save();
    capsule(x0 - 1.2, y0 - 1.2, w + 2.4, 6.4, INK); capsule(x0, y0, w, 4, 'rgba(255,255,255,.14)');
    ctx.beginPath(); ctx.roundRect(x0 + m.lo * w, y0, Math.max(2, (m.hi - m.lo) * w), 4, 1.5); ctx.fillStyle = m.flash ? BAD : GO; ctx.fill();
    const nx = x0 + m.pos * w;
    ctx.beginPath(); ctx.roundRect(nx - 1.3, y0 - 2.6, 2.6, 9.2, 1.3); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = .8; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
  function stunned(G){
    const L = lift();
    for (const p of G.play.all){
      if (!(p.stun > 0) || p.down) continue;
      const [x, y] = toScreen(p.x, p.y), a = t * 8;
      for (const s of [1, -1]){ ctx.beginPath(); ctx.arc(x + s * Math.cos(a) * 5, y - 16 - L + s * Math.sin(a) * 1.5, .9, 0, Math.PI * 2); ctx.fillStyle = YEL; ctx.fill(); }
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
    // Pop-up words: pop in, rise, fade.
    for (const p of P.pops){
      p.t += dt; if (p.t > 1.3) continue;
      const [x, y] = toScreen(p.x, p.y), grow = Math.min(1, p.t / .12), a = p.t > 1 ? 1 - (p.t - 1) / .3 : 1;
      say(p.text, x, y - 32 - L - p.t * 14, 10.5 * (.7 + .3 * grow), POP[String(p.color).toLowerCase()] || p.color, { rim: 2.6, alpha: a });
    }
    P.pops = P.pops.filter(p => p.t <= 1.3);
  }
  /* Close in, a receiver can be off the screen: a glass tab on the edge points the way (in his tag's color once
     the ball is snapped; with his number on a keyboard). */
  function edgeArrows(G){
    const P = G.play, keys = FINE?.matches;
    for (const r of P.rec){
      if (r.down || r.routeName === 'block' && P.live) continue;
      const [x, y] = toScreen(r.x, r.y), top = y - Math.round(30 * f2u());
      const offL = x < 2, offR = x > Wu - 2, offU = y < 0, offD = top > Hu;
      if (!offL && !offR && !offU && !offD) continue;
      const col = P.live ? STATE[openness(P, r)] : YEL;
      const w = keys ? 19 : 13, h = 13, ex = clamp(x - w / 2, 3, Wu - w - 3), ey = clamp(y - 20, 4, Hu - h - 4);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(ex, ey, w, h, 4); ctx.fillStyle = GLASS; ctx.fill(); ctx.lineWidth = .8; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.stroke();
      // The chevron at the side facing him.
      const cx = offL ? ex + 4 : offR ? ex + w - 4 : keys ? ex + 5 : ex + w / 2, cy = offU ? ey + 4.5 : offD ? ey + h - 4.5 : ey + h / 2;
      ctx.beginPath();
      if (offL || offR){ const s = offL ? -1 : 1; ctx.moveTo(cx - s * 1.6, cy - 3); ctx.lineTo(cx + s * 1.4, cy); ctx.lineTo(cx - s * 1.6, cy + 3); }
      else { const s = offU ? -1 : 1; ctx.moveTo(cx - 3, cy - s * 1.6); ctx.lineTo(cx, cy + s * 1.4); ctx.lineTo(cx + 3, cy - s * 1.6); }
      ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.stroke();
      ctx.restore();
      if (keys) say(String(r.num), offL ? ex + w - 6 : offR ? ex + 6 : ex + w - 6, ey + h / 2 + .4, 8.5, col, { rim: 0 });
      else if (offU || offD){ ctx.beginPath(); ctx.arc(ex + w / 2, offU ? ey + h - 3.5 : ey + 3.5, 1.2, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
    }
  }
  function kickOverlay(G){
    const K = G.kick, [bxs, bys] = toScreen(K.spotX, K.spotY);
    if (K.stage !== 'aim' && K.stage !== 'power') return;
    const L = 14, [ax, ay] = toScreen(K.spotX + Math.cos(K.aim) * L, K.spotY + Math.sin(K.aim) * L);
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bxs, bys); ctx.lineTo(ax, ay); ctx.strokeStyle = 'rgba(11,13,16,.55)'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.setLineDash([3, 2.4]); ctx.lineDashOffset = -t * 12; ctx.strokeStyle = YEL; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ax, ay, 2.2, 0, Math.PI * 2); ctx.fillStyle = YEL; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke();
    // Power meter beside the ball: a glass capsule filling from the bottom; the top sliver (over 92%) is too much.
    const mx = bxs + (portrait ? 14 : -4), my = bys + (portrait ? -6 : 12), H = 32;
    capsule(mx - 1.4, my - H - 1.4, 7.8, H + 2.8, INK); capsule(mx, my - H, 5, H, 'rgba(255,255,255,.14)');
    ctx.fillStyle = 'rgba(255,77,79,.35)'; ctx.fillRect(mx, my - H, 5, Math.round(H * .08));
    const hgt = (K.stage === 'power' ? K.power : 0) * H;
    if (hgt > .5){ ctx.beginPath(); ctx.roundRect(mx, my - hgt, 5, hgt, 2.5); ctx.fillStyle = K.power > .92 ? BAD : GO; ctx.fill(); }
    ctx.restore();
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

  /* ---------- Florida State ----------
     When FSU plays: a flaming spear planted at midfield before the opening kickoff of a home game (the camera goes
     to it while the coin is tossed), the home crowd doing the chop on big moments, and garnet-and-gold confetti
     with a drum cadence whenever FSU scores. */
  const SPEAR_T = 6.2, DROP = .75;
  const fsu = { G: null, score: [0, 0], celeb: 0, flash: 0, conf: [], spear: -1, done: false };
  const spearOn = () => fsu.spear >= 0;
  const CONF = [GARNET, GOLD, '#a3485c', '#e9d9ae', GARNET, GOLD, '#ffffff'];
  function fsuTrack(G, dt){
    if (fsu.G !== G) Object.assign(fsu, { G, score: [...G.score], celeb: 0, flash: 0, conf: [], spear: -1, done: false });
    const side = isFSU(G.me) ? 0 : isFSU(G.opp) ? 1 : -1;
    if (side >= 0 && G.score[side] > fsu.score[side]) celebrate();
    fsu.score = [...G.score];
    fsu.celeb = Math.max(0, fsu.celeb - dt);
    // Before the opening kickoff of a home game: the toss has been called, no one has had the ball yet.
    const before = isFSU(G.me) && !G.youDefend && !G.practice && !!G.firstHalfReceiver && !G.drive && !G.lastDrive && !G.kick
      && G.quarter === 1 && !G.score[0] && !G.score[1];
    if (!spearOn() && !fsu.done && before){ fsu.spear = 0; sfx('drums'); }
    if (spearOn()){
      const was = fsu.spear; fsu.spear += dt;
      if (was < DROP && fsu.spear >= DROP) plant(G);
      if (fsu.spear >= SPEAR_T || !before){ fsu.spear = -1; fsu.done = true; }
    }
  }
  function plant(G){
    cam.shake = Math.max(cam.shake, 2.5);
    const P = G.play; if (!P) return;
    for (let i = 0; i < 28; i++){
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3;
      P.fx.push({ x: 50, y: MID, z: .2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 1 + Math.random() * 3, c: [GARNET, GOLD, '#8a6a44', '#ffd04a'][i % 4], t: 0, life: .5 + Math.random() * .5 });
    }
  }
  function celebrate(){
    fsu.celeb = 4.4; fsu.flash = 1;
    // Two cannons from the bottom corners, and a rain from the top.
    fsu.conf = Array.from({ length: 150 }, (_, i) => {
      const c = CONF[i % CONF.length], sp = Math.random() * 6, w = 3 + Math.random() * 5, term = 22 + Math.random() * 22;
      if (i % 3 === 2) return { x: Math.random() * Wu, y: -4 - Math.random() * Hu * .35, vx: (Math.random() - .5) * 16, vy: term, sp, w, c, term };
      const L = i % 3 === 0, a = -(Math.PI / 2 - (.25 + Math.random() * .45)), v = 220 + Math.random() * 170;
      return { x: L ? 4 : Wu - 4, y: Hu * .82, vx: (L ? 1 : -1) * Math.cos(a) * v, vy: Math.sin(a) * v, sp, w, c, term };
    });
    sfx('drumsLate');
  }
  /* The home crowd chops on the big moments: a score, a kick, the spear. */
  const chopping = G => isFSU(G.me) && ((G.cheer || 0) > 0 || fsu.celeb > 0 || spearOn() || !!G.kick);
  /* The spear on the buffer: dropping in point first, planted in the logo, its wrapped end burning. */
  function spear(){
    const s = fsu.spear, fall = s < DROP ? 1 - s / DROP : 0, e = fall * fall;
    const fade = clamp((SPEAR_T - s) / .8, 0, 1), X = 50 - e * 5, Y = MID - e * 1.5, Z = e * 20;
    const at = u => toBuf(X - .6 * u, Y - .35 * u, Z - .4 + 7.4 * u);   // u: 0 the point (in the turf) .. 1 the burning end
    bx.globalAlpha = fade;
    // Its long shadow, then the shockwave rings in garnet and gold.
    const shp = u => { const [gx, gy] = toBuf(X - .6 * u, Y - .35 * u, 0), hs = Math.max(0, Z - .4 + 7.4 * u) * S * (portrait ? .8 : .78); return [gx + hs * KX, gy + hs * KY]; };
    if (!fall) thick(bx, shp(0), shp(1), ['rgba(6,10,20,.3)', 'rgba(6,10,20,.3)'], !portrait);
    if (s > DROP && s < DROP + 1.6) for (const [col, lag] of [[[120, 47, 64], 0], [[206, 184, 136], .25]]){
      const q = clamp((s - DROP - lag) / 1.2, 0, 1), r = 1 + q * 9; if (q <= 0 || q >= 1) continue;
      bx.fillStyle = A.css(col, (1 - q) * .85);
      for (let a = 0; a < 64; a++){ const th = a / 64 * Math.PI * 2, [x, y] = toBuf(50 + Math.cos(th) * r, MID + Math.sin(th) * r); bx.fillRect(x - 1, y - 1, 2, 2); }
    }
    if (!fall){ const [gx, gy] = toBuf(X, Y); bx.fillStyle = 'rgba(40,28,14,.45)'; bx.fillRect(gx - 4, gy - 1, 9, 3); }
    // The shaft, its garnet and gold wraps and a pair of tassels.
    thick(bx, at(0), at(1), ['#f0c888', '#c08a4a', '#8a5a2a', '#4e3016'], true);
    for (const [u0, u1, col] of [[.6, .66, GARNET], [.68, .72, GOLD], [.74, .8, GARNET], [.86, .9, GOLD]]) thick(bx, at(u0), at(u1), [col, col, col, A.css(A.mix(A.hex(col), [0, 0, 0], .35))], true);
    const [tx, ty] = at(.7), sw = Math.round(Math.sin(t * 4) * 1.2);
    bx.fillStyle = GOLD; bx.fillRect(tx + 2, ty, 1, 5 + sw); bx.fillStyle = GARNET; bx.fillRect(tx + 3, ty + 1, 1, 4 - sw);
    // The fire on the end: a warm glow and flickering flame pixels rising.
    const [fx, fy] = at(.97), big = fall ? .8 : 1;
    const glow = bx.createRadialGradient(fx, fy - 14, 2, fx, fy - 14, 34);
    glow.addColorStop(0, 'rgba(255,170,60,.32)'); glow.addColorStop(1, 'rgba(255,120,40,0)');
    bx.fillStyle = glow; bx.fillRect(fx - 34, fy - 48, 68, 68);
    for (let i = 0; i < 64; i++){
      const h = A.hash2(i, 77), ph = (t * (1.1 + h * 1.1) + h * 7) % 1, size = 1 + Math.round((1 - ph) * 4.4 * big);
      const dx = Math.round((A.hash2(i, 78) - .5) * 14 * (1 - ph * .65) + Math.sin(t * 8 + i) * 2.2 * ph);
      const dy = -Math.round(ph * 50 * big) + (fall ? Math.round(ph * 16 * fall) : 0);
      bx.fillStyle = ph < .1 ? '#fff2b0' : ph < .32 ? '#ffd04a' : ph < .6 ? '#ff8a1e' : ph < .84 ? '#d2462a' : 'rgba(60,50,50,.35)';
      bx.fillRect(fx + dx - (size >> 1), fy + dy - (size >> 1), size, size);
    }
    bx.globalAlpha = 1;
  }
  /* Garnet and gold confetti (and a brief garnet glow at the edges) after an FSU score, in UI pixels. */
  function confetti(dt){
    ctx.save();
    if (fsu.flash > 0){
      for (const [y0, y1] of [[0, Hu * .22], [Hu, Hu * .78]]){
        const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(120,47,64,${(fsu.flash * .55).toFixed(3)})`); g.addColorStop(1, 'rgba(120,47,64,0)');
        ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), Wu, Math.abs(y1 - y0));
      }
      fsu.flash = Math.max(0, fsu.flash - dt * .7);
    }
    const a = Math.min(1, fsu.celeb / .9);
    for (const c of fsu.conf){
      c.vx *= Math.max(0, 1 - 1.8 * dt); c.vy = Math.min(c.term, c.vy + 260 * dt) * (c.vy < 0 ? Math.max(0, 1 - 1.2 * dt) : 1);
      c.x += (c.vx + Math.sin(t * 3 + c.sp) * 9) * dt; c.y += c.vy * dt; c.sp += dt * c.w;
      if (c.y < -3 || c.y > Hu + 3) continue;
      ctx.globalAlpha = a; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.translate(c.x, c.y); ctx.rotate(c.sp * .5); ctx.scale(1, Math.cos(c.sp) || .1);
      ctx.fillStyle = c.c; ctx.fillRect(-1.7, -.9, 3.4, 1.8);
    }
    ctx.restore();
    if (fsu.celeb <= 0) fsu.conf = [];
  }

  /* ---------- camera ---------- */
  function updateCamera(G, dt, aim){
    const P = G.play, K = G.kick;
    const long = (portrait ? Hb : Wb) / S, lat = (portrait ? Wb : Hb) / S;
    let fx, fy, ahead;
    if (K){ fx = (K.ball ? Math.max(K.spotX, Math.min(K.ball.x, 108)) : K.spotX) + long * .3; fy = K.ball ? (K.ball.y + MID) / 2 : (K.spotY + MID) / 2; ahead = 0; }
    else if (!P || !P.live && !P.result){
      fx = (P ? P.los : G.los); fy = fitting(G, P) ? fit(P).mid : P ? P.b : G.y; ahead = long * (portrait ? .2 : .16);
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
    // The spear at midfield, framed in the top half (the coin toss card is below).
    if (spearOn()){ fx = 50 - long * (portrait ? .14 : 0); fy = MID; ahead = 0; }
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
    // The new play isn't set up yet: start from the throw view when the routes will need framing (it eases in).
    setZoom(snap(routesOn && !G.youDefend ? THROW : zoomTarget(G) ?? CLOSE));
    cam.x = G.los + ((portrait ? Hb : Wb) / S) * (portrait ? .2 : .16); cam.y = clamp(G.y, 0, FW);
  }

  /* ---------- a frame ---------- */
  function draw(G, dt, view = {}){
    t += dt;
    if (G.play && !G.play.live && !G.play.result && !G.kick) routesOn = !!view.routes;
    prepare(G);
    fsuTrack(G, dt);
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
      if (view.handoff && !P.carrier) ring(P.rb, '111,227,255');
      if (P.target && !P.thrown && !P.carrier) ring(P.target, '255,210,63');   // the target drill's man to hit
      if (view.readKey) ring(view.readKey, '255,210,63');   // the read option's key: the end left unblocked
      if (mine && !P.result) ring(mine, '255,210,63');   // you, on defense
      if (view.landing && P.ball.state === 'air') landing(G, view.landing);
      drawPlayers(G, P.all);
      ball(G);
    }
    if (spearOn()) spear();
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
      if (P.carrier && !P.carrier.down) mark(P.carrier, YEL);
      if (view.handoff && !P.carrier) mark(P.rb, '#6fe3ff');
      if (P.target && !P.thrown && !P.carrier) mark(P.target, YEL);
      if (mine && !P.result) mark(mine, YEL);
      if (view.rush && mine) rushMeter(mine, view.rush);
      if (view.aim){ labels(G); aimArc(G, view.aim); }
      if (!G.youDefend && !P.carrier && !P.result) edgeArrows(G);
      effects(P, dt);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    dust(dt);
    vignette();
    if (fsu.conf.length || fsu.flash > 0) confetti(dt);
    ctx.setTransform(k, 0, 0, k, 0, 0);
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
