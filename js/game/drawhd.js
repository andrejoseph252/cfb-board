/* Coach Andre's Bowl's renderer, in hdart.js's late-afternoon style, with a camera that zooms: in close before the snap and with the ball carrier, out wide while the quarterback can
   throw (and for kicks).

   Two layers. The field, players and shadows are pixel art at 10 logical pixels per yard in an offscreen buffer,
   scaled onto the screen canvas (at the device's full resolution) with crisp pixels; how many yards the buffer holds
   is the zoom. Markers, labels, meters and text go on top in "UI pixels" (about 290 on the screen's short side, the
   game's original resolution), so everything the page measures feels the same at any zoom: R.W / R.H, toScreen, toWorld and dragToWorld all work in
   UI pixels, and a drag is worth as many yards as it always was. */
import { FW, MID, GOAL_HALF, BAR, NET_X, NET_HALF, canThrow, clamp, trajectory, throwSpread, kickPreview } from './sim.js';
import * as A from './hdart.js';
import * as FO from './flyover.js';
import { sfx } from './sfx.js';

const { S } = A;
const UI = 290;   // UI pixels on the screen's short side: the game's original resolution
const OLD = 5;    // UI pixels per yard for drags (the original scale, so a throw's pull feels as it always has)
/* Yards across the screen's short side. */
const CLOSE = 32, CARRY = 36, THROW = 48, COVER = 46, WIDE = 58;
const SIDE = 11.5;   // how far past a sideline the camera may look: the team box, the wall, the first rows of the stands
const KX = .95, KY = .38;   // the cast shadows' lean: low sun from the top left
/* The light by kickoff time (weather.js): the cast shadows' leans and strength, and a grade over the pixel art
   (multiply, then a lift on the field itself). Afternoon is the art as painted. Night: four light towers, four faint
   shadows each, and the stands falling off into the dark. */
const LIGHT = {
  afternoon: { sh: [[KX, KY]], a: .34 },
  noon: { sh: [[.14, .18]], a: .46, lift: 'rgba(255,248,228,.06)' },
  night: { sh: [[.5, .42], [-.5, .42], [.5, -.42], [-.5, -.42]], a: .24, bloom: .5, rim: ['rgba(220,232,255,.5)', [[-1, -1], [1, -1]]] }
};
const BOLT = { sh: [[-.9, .5]], a: .55 };   // a lightning flash: one hard shadow for a blink
/* The sky's grade, over the light's: overcast for rain and snow, a gray wash for fog; rain leaves a wet sheen on the
   players (the light's rim, when it has one, wins). */
const SKY = { rain: { mul: 'rgb(170,180,200)', rim: ['rgba(210,224,240,.32)', [[0, -1]]] }, snow: { mul: 'rgb(214,222,238)', lift: 'rgba(200,212,236,.08)' },
  fog: { mul: 'rgb(214,218,226)' } };
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
  let t = 0, vig = null, motes = [], drops = [], flash = 0, nextBolt = 12;

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
    vig = null; fogV = null; nightV = null; snowV = null; drops = []; motes = Array.from({ length: 34 }, (_, i) => ({ x: A.hash2(i, 1) * Wu, y: A.hash2(i, 2) * Hu, vx: (A.hash2(i, 3) - .3) * 2, vy: (A.hash2(i, 4) - .6) * 1.5, ph: A.hash2(i, 5) * 6 }));
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
  /* A screen-space drag (UI px) as a field vector in yards, at the original scale whatever the zoom. */
  const dragToWorld = (dx, dy) => portrait ? { x: -dy / OLD, y: dx / OLD } : { x: dx / OLD, y: dy / OLD };
  /* Buffer px to UI px, and how far above a player's feet his head is on screen (the original sprites stood ~10 px). */
  const f2u = () => bs / k;
  const lift = () => Math.round(28 * f2u()) - 10;
  /* Places the world texture (pixel (i, j) = world (x0 + i/S, y0 + j/S)) on a context, turned for portrait. */
  function worldTransform(c, x0, y0){
    const [ox, oy] = toBuf(x0, y0);
    if (portrait) c.setTransform(0, -1, 1, 0, ox, oy + 1); else c.setTransform(1, 0, 0, 1, ox, oy);
  }

  /* ---------- teams: the field, the stands, uniforms, the logo ---------- */
  let teamsKey = '', fieldKey = '', art = null, crowd = null, crowdKey = '', uniOff = null, uniDef = null, logo = null, logoSrc = '';
  let home = null, away = null, turf = 'clear', bake = null;
  /* The last few fields and stands baked (by matchup, light and weather), so flipping back to one is instant. */
  const baked = new Map(), KEEP = 3;
  let ov = null, ovBake = null, fly = null;   // the pregame flyover's overview (baked a slice at a time) and the shot under way
  function prepare(G){
    const C = G.cond || {}, sky = C.sky || 'clear';
    const key = `${G.me.id}${G.me.color}${G.me.alt}${G.me.name}|${G.opp.id}${G.opp.color}${G.opp.alt}${G.opp.name}|${C.time === 'afternoon' || !C.time ? 'sun' : 'flat'}${sky}|${G.youDefend ? 'D' : ''}`;
    if (key !== teamsKey){
      teamsKey = key;
      // On defense your team (G.opp in those scenes) wears its colors and their offense wears road white.
      uniOff = A.uniform(G.me, !!G.youDefend); uniDef = A.uniform(G.opp, !G.youDefend);
      const fk = key.slice(0, key.lastIndexOf('|'));
      if (fk !== fieldKey){
        fieldKey = fk; home = { id: G.me.id, name: G.me.name, color: G.me.color, alt: G.me.alt }; away = { id: G.opp.id, name: G.opp.name, color: G.opp.color, alt: G.opp.alt };
        const shade = !C.time || C.time === 'afternoon';
        turf = sky; A.setShade(shade);
        const hit = baked.get(fk);
        if (hit){
          baked.delete(fk); baked.set(fk, hit); art = hit.art; crowd = hit.crowd[portrait] || null; crowdKey = `${fk}|${portrait}`;
          bake = crowd ? null : { fk, field: art, p: portrait, cs: A.buildCrowdSteps(portrait, home, away, sky), at: 0 };
        }
        // Baking a field takes a while (most of a second on a phone): it's done a little each frame (pumpBake), the
        // old one staying up meanwhile, and only once the choice has settled for a moment.
        else bake = { fk, h: home, a: away, sky, shade, steps: null, at: performance.now() + (art ? 220 : 0) };
      }
      loadLogo(G.youDefend ? G.opp.img : G.me.img);
    }
    const ck = `${fieldKey}|${portrait}`;
    // Turned the phone: the fans stand upright the other way (baked a slice at a time, the stands empty meanwhile).
    if (art && crowdKey && ck !== crowdKey && !bake){
      crowdKey = ck; const e = baked.get(fieldKey);
      if (e?.crowd[portrait]) crowd = e.crowd[portrait];
      else { crowd = null; bake = { fk: fieldKey, field: art, p: portrait, cs: A.buildCrowdSteps(portrait, home, away, turf), at: 0 }; }
    }
  }
  /* A slice of the waiting bake: about 5 ms a frame, so the game keeps running (the first field of a game bakes all at
     once, there being nothing to show meanwhile). */
  function pumpBake(){
    const B = bake; if (!B || performance.now() < B.at) return;
    B.steps ||= A.buildFieldSteps(B.h, B.a, B.sky, B.shade);
    const end = performance.now() + (art ? 5 : 1e9);
    // The field first, then the stands; both go up together once both are done.
    let r;
    if (!B.field){ do r = B.steps.next(); while (!r.done && performance.now() < end); if (!r.done) return; B.field = r.value; B.p = portrait; B.cs = A.buildCrowdSteps(portrait, B.h, B.a, B.sky); }
    do r = B.cs.next(); while (!r.done && performance.now() < end);
    if (!r.done) return;
    bake = null; art = B.field; crowd = r.value; crowdKey = `${B.fk}|${B.p}`;   // turned meanwhile: prepare() rebuilds it
    const e = baked.get(B.fk)?.art === art ? baked.get(B.fk) : { art, crowd: {} }; e.crowd[B.p] = crowd;
    baked.delete(B.fk); baked.set(B.fk, e);
    while (baked.size > KEEP) baked.delete(baked.keys().next().value);
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
    if (crowd?.sides) sideStands(G);
    if (crowd) stands(G);
    if (logo){ const [x, y] = toBuf(50, MID); bx.globalAlpha = .93; bx.drawImage(logo, x - (logo.width >> 1), y - (logo.height >> 1)); bx.globalAlpha = 1; }
  }
  function stands(G){
    const C = crowd, [ox, oy] = standsAt(C);
    if (ox > Wb + C.AP || oy > Hb || ox + C.c.width < 0 || oy + C.c.height + C.AP < 0) return;
    bx.drawImage(C.c, ox, oy);
    const roar = (G.cheer || 0) > 0, B = C.bands;
    // The cheerleaders and photographers behind the end line (pom-poms shaking faster after a score).
    const ap = C.aprons[Math.floor(t * (roar ? 7 : 2.2)) % 2];
    if (portrait) bx.drawImage(ap, ox, oy + C.c.height - C.UP); else bx.drawImage(ap, ox - C.AP, oy);
    bx.setTransform(1, 0, 0, 1, ox, oy);
    // The crowd's life, by lifting bits of the baked crowd: fans bobbing (everyone, after a score), the student
    // section jumping, a wave rolling around now and then; then towels, flags, camera flashes.
    const lift = (s0, s1, b0, b1, d) => { const [x, y, w, h] = C.rect(Math.max(0, s0), Math.min(C.along, s1), b0, b1); if (w > 0 && h > 0 && d) bx.drawImage(C.c, x, y, w, h, x, y - d, w, h); };
    const arms = (f, d) => { bx.fillStyle = f.arm; if (f.sm){ bx.fillRect(f.px - 2, f.py - 7 - d, 1, 3); bx.fillRect(f.px + 1, f.py - 7 - d, 1, 3); } else { bx.fillRect(f.px - 3, f.py - 11 - d, 1, 5); bx.fillRect(f.px + 3, f.py - 11 - d, 1, 5); } };
    for (const b of C.bob) if (Math.sin(t * (roar ? 9 : b.sp) + b.ph) > (roar ? 0 : .6)) bx.drawImage(C.c, b.px - 2, b.py - 9, 5, 9, b.px - 2, b.py - 10, 5, 9);
    if (roar){
      const d = [0, 2, 3, 1][Math.floor(t * 11) % 4], top = B.LB0 + 14 * 7, gap = B.AIS0;   // the student section, either side of its aisle
      lift(B.STU[0], gap, B.LB0 + 2, top, d); lift(gap + 8, B.STU[1], B.LB0 + 2, top, d);
      for (const f of C.stu) arms(f, d);
    } else if (!G.kick){
      // The wave: every half minute or so, once around in nine seconds.
      const ph = (t + 11) % 32;
      if (ph < 9){
        const sw = ph / 9 * (C.along + 80) - 40;
        for (const [a, b, d] of [[-16, -8, 1], [-8, -3, 2], [-3, 3, 3], [3, 9, 2], [9, 15, 1]]){ lift(sw + a, sw + b, B.LB0 + 2, B.LB1, d); lift(sw + a, sw + b, B.UD0, B.UD1, Math.max(1, d - 1)); }
        let i = lo(C.fans, sw - 4); for (; i < C.fans.length && C.fans[i].s < sw + 4; i++) arms(C.fans[i], C.fans[i].sm ? 2 : 3);
      }
    }
    for (const tw of C.towels){
      const f = Math.floor(t * (roar ? 12 : 7) + tw.ph) % 4, dx = [0, 1, 0, -1][f];
      if (!tw.cs){ const col = tw.lit ? A.LIT(A.hex(tw.col)) : A.SHD(A.hex(tw.col)); tw.cs = [A.css(A.mix(col, [40, 30, 50], .15)), A.css(col), A.css(A.mix(col, [255, 255, 255], .3))]; }
      bx.fillStyle = tw.cs[0]; bx.fillRect(tw.px + 2, tw.py - 9, 1, 3);
      bx.fillStyle = tw.cs[1]; bx.fillRect(tw.px + 1 + dx, tw.py - 12, 4, 3);
      bx.fillStyle = tw.cs[2]; bx.fillRect(tw.px + 1 + dx, tw.py - 12, 4, 1);
    }
    for (const fl of C.flags){
      const T = (c, f = 0) => A.css(A.mix(fl.lit ? A.LIT(A.hex(c)) : A.SHD(A.hex(c)), [40, 30, 20], f));
      bx.fillStyle = T('#c8ccd0'); bx.fillRect(fl.px, fl.py - 30, 1, 30); bx.fillStyle = T('#6a6e74'); bx.fillRect(fl.px + 1, fl.py - 30, 1, 30);
      for (let c = 0; c < 18; c++){
        const s = Math.sin(t * (5 + Math.abs(G.cond?.wind || 0) * .3) + fl.k + c * .45), wv = Math.round(s * 1.4 * (c / 18)), f = s > .4 ? .18 : 0, y0 = fl.py - 30 + wv;
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
    // Phones going off among the fans (more of them at night, and on a kick), and the photographers' strobes.
    const night = G.cond?.time === 'night';
    for (let f = (night ? 4 : 1) + (G.kick ? 2 : 0) + (roar ? 3 : 0); f > 0; f--) if (Math.random() < .5){
      let px, py;
      if (Math.random() < .08){ const [a, b] = C.shooters[Math.floor(Math.random() * C.shooters.length)]; px = portrait ? a : a - C.AP; py = portrait ? b + C.c.height - C.UP - 9 : b - 9; }
      else { const q = C.fans[Math.floor(Math.random() * C.fans.length)]; px = q.px; py = q.py - (q.sm ? 5 : 8); }
      if (night){ if (ox + px >= 0 && oy + py >= 0 && ox + px < Wb && oy + py < Hb) pops.push([ox + px, oy + py]); continue; }   // popped over the dark, after the grade
      bx.fillStyle = 'rgba(255,255,240,.95)'; bx.fillRect(px, py, 1, 1); bx.fillStyle = 'rgba(255,255,230,.45)'; bx.fillRect(px - 1, py, 3, 1); bx.fillRect(px, py - 1, 1, 3);
    }
    bx.setTransform(1, 0, 0, 1, 0, 0);
    if (G.kick) net();
  }
  /* Where the stands' canvas sits on the buffer, and the first fan at or past `s` across (fans are sorted by it). */
  const standsAt = C => portrait ? toBuf(A.CX0 + A.CDEPTH, A.FY0) : toBuf(A.CX0, A.FY0);
  const lo = (list, s) => { let a = 0, b = list.length; while (a < b){ const m = (a + b) >> 1; if (list[m].s < s) a = m + 1; else b = m; } return a; };
  /* The kicking net, raised behind the uprights for kicks: a mesh between two poles, baked once per orientation. */
  let netC = null;
  function net(){
    const y0 = MID - NET_HALF, y1 = MID + NET_HALF, z0 = BAR + .5, z1 = BAR + 9.6, X = NET_X;   // where sim.js catches the ball
    const P = (y, z) => portrait ? [Math.round(y * S), -Math.round(X * S) - Math.round(z * S * .8)] : [Math.round(X * S) + Math.round(z * S * .3), Math.round(y * S) - Math.round(z * S * .75)];
    if (!netC || netC.p !== portrait){
      const pts = [P(y0, 0), P(y1, 0), P(y0, z1 + .4), P(y1, z1 + .4)], mx = Math.min(...pts.map(p => p[0])) - 1, my = Math.min(...pts.map(p => p[1])) - 1;
      const w = Math.max(...pts.map(p => p[0])) - mx + 2, h = Math.max(...pts.map(p => p[1])) - my + 2, c = A.canvas(w, h), x = c.getContext('2d');
      const seen = new Set(), dot = (y, z, col) => { const [a, b] = P(y, z), q = a * 9973 + b; if (seen.has(q)) return; seen.add(q); x.fillStyle = col; x.fillRect(a - mx, b - my, 1, 1); };
      for (const y of [y0 - .1, y1 + .1]) for (let z = 0; z <= z1 + .4; z += .05){ dot(y, z, '#3a3c46'); }   // the poles
      for (let y = y0; y <= y1; y += .05){ dot(y, z1, 'rgba(246,246,250,.8)'); dot(y, z0, 'rgba(220,224,232,.5)'); }   // the head rope, the foot
      for (let z = z0; z <= z1; z += .45) for (let y = y0; y <= y1; y += .05) dot(y, z, 'rgba(236,238,244,.26)');   // the cords across
      for (let y = y0; y <= y1 + .01; y += .45) for (let z = z0; z <= z1; z += .05) dot(y, z, 'rgba(236,238,244,.26)');   // and down
      netC = { c, p: portrait, mx, my };
    }
    const [ax, ay] = toBuf(0, 0);
    bx.drawImage(netC.c, ax + netC.mx, ay + netC.my);
  }
  /* What the stands light themselves, laid over after the grade: at night the suites, the rigs and the step lights;
     always the LED ribbon (the home name scrolling, inside out and racing after a score) and the video board. */
  function standsLights(G){
    const C = crowd; if (!C) return;
    const [ox, oy] = standsAt(C); if (ox > Wb || oy > Hb || ox + C.c.width < 0 || oy + C.c.height < 0) return;
    const roar = (G.cheer || 0) > 0, night = G.cond?.time === 'night';
    if (night) bx.drawImage(C.glow, ox, oy);
    if (portrait) bx.setTransform(1, 0, 0, 1, ox, oy); else bx.setTransform(0, 1, -1, 0, ox + C.c.width, oy);
    const hotT = roar && Math.floor(t * 5) % 2, tape = hotT ? C.tapeHot : C.tape, seg = hotT ? C.segHot : C.seg;
    bx.drawImage(tape, Math.floor(t * (roar ? 70 : 16)) % seg, 0, C.along, 7, 0, C.ribY, C.along, 7);
    const hot = roar ? 1 + Math.floor(t * 3) % 2 : 0, key = `${G.score?.[0]}|${G.score?.[1]}|${G.quarter}|${hot}|${!!logo}|${C.face.width}`;
    if (key !== C.faceKey){ C.faceKey = key; A.paintBoard(C, home || G.me, away || G.opp, G.score || [0, 0], G.quarter, logo, hot); }
    bx.drawImage(C.face, C.faceAt[0], C.faceAt[1]);
    bx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- the sidelines (hdart.js's sideStand and sideCast) ---------- */
  /* Where a strip of side stands sits on the buffer (standing up, the world's rows land one pixel lower). */
  const sideAt = s => { const [x, y] = toBuf(s.org[0], s.org[1]); return portrait ? [x, y + 1] : [x, y]; };
  /* The strip's span along the field that's on screen, in its own pixels. */
  const sideSpan = (s, ox, oy) => portrait ? [Math.max(0, -oy), Math.min(s.c.height, Hb - oy)] : [Math.max(0, -ox), Math.min(s.c.width, Wb - ox)];
  function sideStands(G){
    const roar = (G.cheer || 0) > 0;
    for (const s of crowd.sides.stands){
      const [ox, oy] = sideAt(s), c = s.c;
      if (ox > Wb || oy > Hb || ox + c.width < 0 || oy + c.height < 0) continue;
      bx.drawImage(c, ox, oy);
      const [a0, a1] = sideSpan(s, ox, oy);
      if (roar){
        // After a score the whole strip is up and jumping, a stretch at a time (the wall stays put).
        const r0 = s.far ? 12 : 0, rn = s.D - 12, f = Math.floor(t * 11);
        for (let a = a0 - a0 % 24; a < a1; a += 24){
          const k = [0, 2, 3, 1][(f + a / 24) % 4]; if (!k) continue;
          if (portrait) bx.drawImage(c, r0, a, rn, 24, ox + r0, oy + a - k, rn, 24); else bx.drawImage(c, a, r0, 24, rn, ox + a, oy + r0 - k, 24, rn);
        }
      } else for (let i = lo(s.bob, a0 - 3); i < s.bob.length && s.bob[i].s < a1 + 3; i++){ const b = s.bob[i]; if (Math.sin(t * b.sp + b.ph) > .6) bx.drawImage(c, b.px - 2, b.py - 9, 5, 9, ox + b.px - 2, oy + b.py - 10, 5, 9); }
    }
  }
  /* The LED boards along both walls (after the grade, so they glow at night): the home name and chevrons scrolling,
     racing inside out after a score. Upright either way: standing up, the letters' tops face the field. */
  function sideLights(G){
    const C = crowd?.sides; if (!C) return;
    const roar = (G.cheer || 0) > 0, hotT = roar && Math.floor(t * 5) % 2, tape = hotT ? C.tapeHot : C.tape, seg = hotT ? C.segHot : C.seg;
    const run = Math.floor(t * (roar ? 70 : 16)) % seg;
    for (const s of C.stands){
      const [ox, oy] = sideAt(s); if (ox > Wb || oy > Hb || ox + s.c.width < 0 || oy + s.c.height < 0) continue;
      const [a0, a1] = sideSpan(s, ox, oy), n = a1 - a0; if (n <= 0) continue;
      if (!portrait){ bx.drawImage(tape, run + a0, 0, n, 7, ox + a0, oy + s.led, n, 7); continue; }
      // Standing up the canvas runs top to bottom with the field: near side reads downward, far side upward.
      if (s.far) bx.setTransform(0, -1, 1, 0, ox + s.led, oy + a1); else bx.setTransform(0, 1, -1, 0, ox + s.led + 7, oy + a0);
      bx.drawImage(tape, run + a0, 0, n, 7, 0, 0, n, 7);
      bx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  /* The cast: placed (the movers walked toward where the game wants them), culled, sorted back to front, shadowed
     like the players, and drawn before the lines and the players, so a man run out of bounds is always on top. */
  const MOVE = { hc0: 2.6, hc1: 2.6, lj: 7, rod0: 5, box: 5, rod1: 5, tv: 4, cart: 7 };
  const HOP = { pl: 6, sit: 4, cheer: 5, mascot: 9 };
  let castG = null, sideShade = null;
  function sideline(G, dt){
    sideShade = null; const cast = crowd?.sides?.cast; if (!cast) return;
    const P = G.play, L = P ? P.los : G.los, fd = Math.min(100, L + (G.toGo || 10)), roar = (G.cheer || 0) > 0;
    const live = P?.live, bxw = live ? (P.carrier || P.ball)?.x : null, fresh = castG !== G; castG = G;
    const list = [];
    let r0 = null, r1 = null;
    for (const a of cast){
      if (a.mv){
        let tx = a.x;
        if (a.mv === 'hc0') tx = clamp(L - 3, 28, 72) + 2.6 * Math.sin(t * .4 + a.ph);   // pacing his box, a step behind the line
        else if (a.mv === 'hc1') tx = clamp(L + 2, 28, 72) + 2.2 * Math.sin(t * .33 + a.ph);
        else if (a.mv === 'lj') tx = bxw != null ? clamp(bxw, -2, 102) : L;   // the line judge runs with the play
        else if (a.mv === 'rod0') tx = fd - 10; else if (a.mv === 'box') tx = L; else if (a.mv === 'rod1') tx = fd;
        else if (a.mv === 'tv') tx = clamp(bxw ?? L, 77, 99);
        else if (a.mv === 'cart') tx = clamp((bxw ?? Math.min(L, fd - 10)) - 6, -8, 104);
        if (fresh || !a.on){ a.x = tx; a.on = true; }
        const dx = G.kick ? 0 : clamp(tx - a.x, -MOVE[a.mv] * dt, MOVE[a.mv] * dt);
        a.x += dx; a.step = (a.step || 0) + Math.abs(dx); a.walk = dt > 0 && Math.abs(dx) > dt * .3 ? Math.sign(dx) : 0;
        if (a.mv === 'rod0') r0 = a; else if (a.mv === 'rod1') r1 = a;
      }
      const y = a.side ? FW + a.b : -a.b, [gx, gy] = toBuf(a.x, y);
      let spr, hop = 0;
      if (a.walk && a.wp) spr = (a.walk > 0 ? a.wp : a.wn)[Math.floor(a.step / .45) % 4];
      else if (roar && (a.side === 0 || a.kind === 'ref')){ spr = a.j[0]; const h = HOP[a.kind]; if (h) hop = Math.round(Math.abs(Math.sin(t * (a.kind === 'mascot' ? 6 : 9) + a.ph)) * h); if (a.kind === 'cheer') spr = a.f[Math.floor(t * 7 + a.ph) % 2]; }
      else if (roar) spr = a.d[0];
      else if (a.kind === 'cheer' || a.kind === 'mascot') spr = a.f[Math.floor(t * (a.kind === 'cheer' ? 2.2 : 1.4) + a.ph) % 2];
      else spr = a.f[a.f.length > 1 && Math.sin(t * 2.1 + a.ph) > .35 ? 1 : 0];
      const x0 = gx - spr.ax, y0 = gy - hop - spr.ay;
      if (x0 > Wb + 24 || y0 > Hb + 8 || x0 + spr.cv.width < -24 || y0 + spr.cv.height < -8) continue;
      list.push({ a, spr, gx, gy, hop, key: gy + (a.sy || 0) });
    }
    if (!list.length) return;
    list.sort((p, q) => p.key - q.key);
    sideShade = list;   // their shadows go down with the players' (one pass over the buffer, in drawPlayers)
    // The chain, slack on the grass between the rods.
    if (r0 && r1){
      const p = toBuf(r0.x, FW + r0.b), q = toBuf(r1.x, FW + r1.b), off = portrait ? -6 : 6;
      bx.fillStyle = 'rgba(30,28,24,.85)';
      if (portrait) bx.fillRect(p[0] + off, q[1], 1, p[1] - q[1]); else bx.fillRect(p[0] + off, p[1] - 1, q[0] - p[0], 1);
      bx.fillStyle = 'rgba(214,206,170,.9)';
      if (portrait){ for (let y = Math.max(q[1], -2); y < Math.min(p[1], Hb + 2); y += 3) bx.fillRect(p[0] + off, y, 1, 1); }
      else for (let x = Math.max(p[0] + off, -2); x < Math.min(q[0] + off, Wb + 2); x += 3) bx.fillRect(x, p[1] - 1, 1, 1);
    }
    for (const d of list){
      const s = d.spr, k = d.a.kind;
      if (k !== 'bench' && k !== 'table' && k !== 'tent' && k !== 'heater' && k !== 'cart'){
        if (!d.hop) bx.drawImage(A.AO, d.gx - (A.AO.width >> 1), d.gy - 4); else bx.drawImage(A.AO, d.gx - 7, d.gy - 3, 14, A.AO.height - 2);
      }
      bx.drawImage(s.cv, d.gx - s.ax, d.gy - d.hop - s.ay);
      if (k === 'chain') pole(G, d);
    }
  }
  /* A chain crew man's pole: the rods' orange paddles, the box with the down on it. */
  function pole(G, d){
    const a = d.a, on = !A.inShadow(a.x, FW + a.b), px = d.gx + (portrait ? -6 : 6), top = d.gy - 37;
    const T = c => A.css(on ? A.LIT(c) : A.SHD(c));
    bx.fillStyle = T([208, 208, 214]); bx.fillRect(px, top, 1, d.gy - top);
    bx.fillStyle = T([120, 120, 130]); bx.fillRect(px + 1, top, 1, d.gy - top);
    if (a.mv === 'box'){ bx.drawImage(A.downBox(G.down || 1, on), px - 4, top - 10); return; }
    bx.fillStyle = T([250, 112, 28]); bx.fillRect(px - 2, top - 8, 6, 9);
    bx.fillStyle = T([255, 178, 96]); bx.fillRect(px - 2, top - 8, 6, 1);
    bx.fillStyle = T([168, 64, 14]); bx.fillRect(px - 2, top, 6, 1);
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
  function frameOf(G, p, engaged){
    const P = G.play, K = G.kick;
    if (p.down) return { down: true };
    // Your corner jumping the route, and anyone the ball is coming down on: both hands up for it.
    if (p.jump > 0) return { pose: 'set', c: 1, arms: 'reach' };
    const B = P?.ball;
    if (B?.state === 'air' && B.T - B.t < .4 && Math.hypot(p.x - B.tx, p.y - B.ty) < 2.4) return { pose: 'set', c: 0, arms: 'reach' };
    // Locked up at the line: hands in his man's chest, feet churning.
    if (engaged.has(p)) return { pose: 'set', c: 1, arms: 'block', run: Math.floor(t * 9 + (phase.get(p) || 0) * 3) % 8 };
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
    const counts = {}, drawn = [], pre = G.kick || !G.play || !G.play.live && !G.play.result, P = G.play;
    // Who's locked up with whom at the line (each side leans into the other).
    const engaged = new Map();
    if (P?.live) for (const d of P.def){
      const o = d.eng?.by || (d.role === 'DL' && !d.free && d.ol) || null;
      if (o && !d.down && !o.down){ engaged.set(d, o); engaged.set(o, d); }
    }
    // A tackle: the man with the ball goes down away from the hit, the tackler on top of him.
    const R_ = P?.result, victim = R_?.by ? (R_.type === 'sack' ? P.qb : P.carrier) : null;
    for (const p of list){
      const off = p.team === 'off', team = `${off ? G.me.id : G.opp.id}${off ? 'o' : 'd'}`;
      const slot = `${off ? 'o' : 'd'}${p.role}`, idx = counts[slot] = (counts[slot] ?? -1) + 1;
      const f = frameOf(G, p, engaged);
      let view, flip = false;
      if (portrait) view = off ? (p.vx < -.5 ? 'front' : 'back') : (p.vx > .5 ? 'back' : 'front');
      else { view = 'side'; flip = p.face < 0; }
      if (portrait && Math.abs(p.vy) > Math.abs(p.vx) + .5){ view = 'side'; flip = p.vy < 0; }
      if (f.down) flip = (p.face ?? 1) < 0;
      if (f.down && victim){
        const sxOf = q => toBuf(q.x, q.y)[0];
        if (p === victim) flip = sxOf(R_.by) > sxOf(p);
        else if (p === R_.by) flip = sxOf(victim) < sxOf(p);
      }
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
      // The jump: up and back down over its .45 s, his shadow left on the turf.
      if (p.jump > 0) hop = Math.round(Math.sin(Math.PI * (1 - p.jump / .45)) * 15);
      // Locked up: a shove toward his man every few beats, and turf kicking up under the churning feet.
      const foe = engaged.get(p);
      if (foe){
        const [fx] = toBuf(foe.x, foe.y), push = Math.sin(t * 13 + ph * 2) > .35 ? 1 : 0;
        dx += Math.sign(fx - gx) * push;
        if (Math.random() < .035) kick(p.x, p.y, 2, .5);
      }
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
      // Pressure: a red ring pulses under the quarterback as an unblocked rusher closes in.
      if (p === P?.qb && P.live && canThrow(G) && !G.youDefend){
        const near = Math.min(99, ...P.def.filter(d => (d.free || d.blitz) && !d.eng && !d.down).map(d => Math.hypot(d.x - p.x, d.y - p.y)));
        if (near < 4.5) pressure = { p, k: 1 - near / 4.5 };
      }
    }
    // Long late-afternoon shadows, then erased where the stadium already shades the grass.
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, Wb, Hb);
    for (const [kx, ky] of lit.sh) for (const d of sideShade ? drawn.concat(sideShade) : drawn){ if (d.down) continue; const s = d.spr; sx.setTransform(1, 0, -kx, -ky, d.gx - s.ax + kx * s.ay, d.gy + ky * s.ay); sx.drawImage(s.sil, 0, 0); }
    sideShade = null;
    sx.setTransform(1, 0, 0, 1, 0, 0);
    goalposts(true);
    if (art){ sx.globalCompositeOperation = 'destination-out'; worldTransform(sx, A.FX0, A.FY0); sx.drawImage(art.mask, 0, 0); sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; }
    bx.globalAlpha = lit.a; bx.drawImage(sl, 0, 0, Wb, Hb, 0, 0, Wb, Hb); bx.globalAlpha = 1;
    if (pressure){
      const { p, k } = pressure, [x, y] = toBuf(p.x, p.y), pulse = (Math.sin(t * (8 + k * 8)) + 1) / 2, rx = 15 + Math.round(pulse * 3), ry = 6 + Math.round(pulse);
      bx.fillStyle = `rgba(255,77,79,${(.25 + k * .55) * (.6 + pulse * .4)})`;
      for (let a = 0; a < 44; a++){ const th = a / 44 * Math.PI * 2; bx.fillRect(Math.round(x + Math.cos(th) * rx) - 1, Math.round(y + Math.sin(th) * ry) - 1, 2, 2); }
      pressure = null;
    }
    // Contact shadows, smaller under a man in the air.
    for (const d of drawn){
      if (!d.hop) bx.drawImage(A.AO, d.gx - (A.AO.width >> 1), d.gy - 4);
      else { const w = Math.round(A.AO.width * Math.max(.45, 1 - d.hop / 24)); bx.drawImage(A.AO, d.gx - (w >> 1), d.gy - 3, w, A.AO.height - 2); }
    }
    drawn.sort((a, b) => a.gy - b.gy || a.gx - b.gx);
    const rim = lit.rim || SKY[G.cond?.sky]?.rim;
    for (const d of drawn){
      if (d.fall){   // tipping over, about his feet
        bx.setTransform(1, 0, 0, 1, d.gx, d.gy); bx.rotate(d.rot); bx.drawImage(d.fall.cv, -d.fall.ax, -d.fall.ay); bx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      const s = d.spr, y = d.gy - d.hop;
      if (rim && !d.lean){ const r = rimOf(s, rim[0]); for (const [ox, oy] of rim[1]) bx.drawImage(r, d.gx - s.ax + ox, y - s.ay + oy); }
      if (d.lean){ bx.setTransform(1, 0, d.lean, 1, d.gx - s.ax - d.lean * s.ay, y - s.ay); bx.drawImage(s.cv, 0, 0); bx.setTransform(1, 0, 0, 1, 0, 0); }
      else bx.drawImage(s.cv, d.gx - s.ax, y - s.ay);
      if (d.ball != null){ const b = A.ballSprite(false, false, 0); bx.drawImage(b, d.gx + d.ball - (b.width >> 1), y - 16); }
    }
  }
  const downAt = new WeakMap();
  /* A sprite's silhouette in one color: the rim of light the stadium lights (or the rain) put on a player. */
  const rims = new WeakMap();
  function rimOf(s, col){
    let r = rims.get(s); if (r && r.col === col) return r.c;
    const c = A.canvas(s.cv.width, s.cv.height), x = c.getContext('2d');
    x.drawImage(s.cv, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    rims.set(s, { col, c }); return c;
  }   // when each player hit the turf (for the fall)
  let pressure = null;

  /* Turf and dust kicked up on the field (buffer pixels, world positions): from the line's churning feet, and a big
     burst where a tackle lands. */
  const clods = [];
  const TURF = ['#6b5236', '#8a6a3c', '#4f7a2e', '#6f9a43', '#c9b48a'];
  function kick(x, y, n, up = 1){
    for (let i = 0; i < n; i++) clods.push({ x: x + (Math.random() - .5) * .8, y: y + (Math.random() - .5) * .6, z: .1, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3,
      vz: (1.5 + Math.random() * 3) * up, c: TURF[Math.floor(Math.random() * TURF.length)], s: Math.random() < .3 ? 2 : 1, life: .5 + Math.random() * .4, t: 0 });
  }
  let rings = [], seenResult = null;
  function impacts(G, dt){
    const R_ = G.play?.result;
    if (R_ && R_ !== seenResult){
      seenResult = R_;
      if (['tackle', 'sack', 'dive', 'fumble'].includes(R_.type)){ kick(R_.x, R_.y, R_.type === 'sack' ? 26 : 14, 1.2); rings.push({ x: R_.x, y: R_.y, t: 0, big: R_.type === 'sack' }); }
    }
    for (const c of clods){ c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vz -= 14 * dt; c.z = Math.max(0, c.z + c.vz * dt); if (!c.z){ c.vx *= .6; c.vy *= .6; } }
    for (let i = clods.length - 1; i >= 0; i--) if (clods[i].t > clods[i].life) clods.splice(i, 1);
    for (const r of rings) r.t += dt;
    rings = rings.filter(r => r.t < .45);
  }
  function drawImpacts(){
    for (const r of rings){   // a dust ring spreading on the turf
      const k = r.t / .45, [x, y] = toBuf(r.x, r.y), rx = Math.round((r.big ? 10 : 7) + k * (r.big ? 26 : 18)), ry = Math.round(rx * .4);
      bx.fillStyle = `rgba(214,196,160,${(1 - k) * .55})`;
      for (let a = 0; a < 40; a++){ const th = a / 40 * Math.PI * 2; bx.fillRect(Math.round(x + Math.cos(th) * rx), Math.round(y + Math.sin(th) * ry), 2, 2); }
    }
    for (const c of clods){ const [x, y] = toBuf(c.x, c.y, c.z); bx.globalAlpha = Math.min(1, (c.life - c.t) * 4); bx.fillStyle = c.c; bx.fillRect(x, y, c.s, c.s); }
    bx.globalAlpha = 1;
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
      for (const [kx, ky] of lit.sh){
        const sh = (X, Y, Z) => { const [gx, gy] = toBuf(X, Y, 0), hs = Z * S * (portrait ? .8 : .78); return [gx + hs * kx, gy + hs * ky]; };
        thick(sx, sh(111.4, MID, 0), sh(111.4, MID, 2.4), ['#000', '#000', '#000'], !portrait);
      }
      return;
    }
    const [bx0, by0] = v(110, MID, BAR + 8); if (bx0 < -40 || by0 > Hb + 120 || by0 < -120 || bx0 > Wb + 40) return;
    thick(bx, v(111.4, MID, 0), v(111.4, MID, 1.9), PAD, true);
    thick(bx, v(111.4, MID, 1.9), v(111.4, MID, 2.4), POST.slice(0, 3), true);
    thick(bx, v(111.4, MID, 2.4), v(110, MID, BAR), POST.slice(0, 3), true);
    thick(bx, v(110, MID - GOAL_HALF, BAR), v(110, MID + GOAL_HALF, BAR), POST.slice(0, 3), !portrait);
    // The ribbons on top of the uprights stream with the wind (across the field): longer and snappier the harder it
    // blows, hanging limp when it's calm. They're how you read the wind on a kick.
    const wind = curG?.kick?.wind ?? curG?.cond?.wind ?? 0, ws = Math.sign(wind) || 1, wl = 3 + Math.min(10, Math.abs(wind) * .5);
    const [d0x, d0y] = v(110, MID, BAR + 8), [d1x, d1y] = v(110, MID + 1, BAR + 8), dx = (d1x - d0x) / S, dy = (d1y - d0y) / S;
    for (const s of [-1, 1]){
      const a = v(110, MID + s * GOAL_HALF, BAR), b = v(110, MID + s * GOAL_HALF, BAR + 8);
      thick(bx, a, b, [POST[0], POST[2]], true);
      bx.fillStyle = A.css(A.LIT(A.hex('#ff5a3c')));
      for (let i = 1; i <= wl; i++){
        const wave = Math.round(Math.sin(t * (6 + Math.abs(wind) * .5) - i * .9 + s) * Math.min(1.5, i * .25)), sag = Math.abs(wind) < 3 ? i * .6 : 0;
        bx.fillRect(Math.round(b[0] + dx * ws * i - dy * wave), Math.round(b[1] + dy * ws * i + dx * wave + sag), 1, 2);
      }
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
    // In the air the ball is drawn with the goalposts (in front of them or behind, by where it is).
    if (!K.ball) drawBall(K.spotX, K.spotY, 0);
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
    const live = K.stage === 'aim' || K.stage === 'power', after = K.stage === 'flight' && K.t < .9;
    if (!live && !after) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (live){
      // The aim: on the easier levels the line runs all the way to the goal line, bending with the wind, green when
      // it would split the uprights (a kick in the green band); on the harder ones, straight, and the wind is yours to read.
      const pv = G.diff.preview ? kickPreview(G) : null;
      const pts = pv ? pv.pts : (() => { const L = (110 - K.spotX) / Math.cos(K.aim); return [[K.spotX, K.spotY, 0], [K.spotX + Math.cos(K.aim) * L, K.spotY + Math.sin(K.aim) * L, BAR + 1]]; })();
      const col = pv ? (pv.good ? GO : BAD) : YEL, path = new Path2D();
      pts.forEach(([x, y, z = 0], i) => { const [sx_, sy_] = toScreen(x, y, z); i ? path.lineTo(sx_, sy_) : path.moveTo(sx_, sy_); });
      ctx.strokeStyle = 'rgba(11,13,16,.55)'; ctx.lineWidth = 2.8; ctx.stroke(path);
      ctx.setLineDash([3, 2.6]); ctx.lineDashOffset = -t * 14; ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.stroke(path); ctx.setLineDash([]);
      const [ex, ey] = toScreen(...pts[pts.length - 1]);
      ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 1.3; ctx.strokeStyle = col; ctx.stroke();
    }
    // The power meter beside the ball, built for this kick: short (red), the green band that flies true, then yellow
    // into red where the kicker over-swings and hooks it. The needle rides up and down; once kicked it stays a moment.
    const a = after ? 1 - K.t / .9 : 1, W = 8, H = 50;
    const mx = bxs + (portrait ? 16 : -5), my = bys + (portrait ? -4 : 16);
    ctx.globalAlpha = a;
    capsule(mx - 2, my - H - 2, W + 4, H + 4, INK);
    const band = (p0, p1, fill) => { if (p1 <= p0) return; ctx.fillStyle = fill; ctx.fillRect(mx, my - p1 * H, W, (p1 - p0) * H); };
    ctx.save(); ctx.beginPath(); ctx.roundRect(mx, my - H, W, H, W / 2); ctx.clip();
    band(0, K.lo, 'rgba(255,77,79,.32)');
    band(K.lo, K.hi, GO);
    const over = ctx.createLinearGradient(0, my - K.hi * H, 0, my - H); over.addColorStop(0, YEL); over.addColorStop(1, BAD);
    band(K.hi, 1, over);
    if (K.stage !== 'aim'){ ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(mx, my - K.power * H, W, K.power * H); }
    ctx.restore();
    if (K.stage !== 'aim'){
      const ny = Math.round(my - K.power * H);
      ctx.fillStyle = INK; ctx.fillRect(mx - 4, ny - 1.5, W + 8, 3);
      ctx.fillStyle = '#fff'; ctx.fillRect(mx - 3, ny - .5, W + 6, 1);
    }
    ctx.restore();
  }
  /* ---------- the conditions (weather.js) ---------- */
  let lit = LIGHT.afternoon, curG = null;   // curG: this frame's game, for goalposts()
  const rr = (a, b) => a + Math.random() * (b - a);
  /* Under the lights: a light map baked once (world space, 5 px a yard, in dithered steps). The field bright and cool,
     a touch brighter toward the four towers off its corners; past the walls the light falls away fast, and up the
     stands it fades row by row into the dark. */
  const LR = 5, LX0 = A.FX0, LY0 = -A.SB1 - 1, LY1 = FW + A.SB1 + 1;
  const BANKS = [[-4, -8], [104, -8], [-4, FW + 8], [104, FW + 8]];
  let lmap = null;
  function lightmap(){
    if (lmap) return lmap;
    const w = Math.round((A.CX0 + A.CDEPTH - LX0) * LR), h = Math.round((LY1 - LY0) * LR);
    const c = A.canvas(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    const DK = [18, 24, 56], HI = [214, 230, 255];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
      const X = LX0 + i / LR, Y = LY0 + j / LR, st = X > A.CX0, b = Math.max(-Y, Y - FW), side = !st && b > A.SB0;
      let pool = 0; for (const [p, q] of BANKS) pool += 1 / (1 + ((X - p) ** 2 + (Y - q) ** 2) / 700);
      const out = st ? 0 : Math.max(0, -Y - .4, Y - FW - .4, -10.4 - X, X - 110.4);
      // The end zone's stands, the side stands (a little dimmer, falling off up the rows), the field and its edges.
      let L = st ? .66 - (X - A.CX0) / A.CDEPTH * .34 : side ? .56 - (b - A.SB0) / (A.SB1 - A.SB0) * .16 : 1 - Math.pow(clamp(out / 7, 0, 1), .8) * .62;
      L *= .8 + .2 * Math.min(1, pool);
      const lv = clamp(Math.floor(L * 18 + A.bayer(i, j)) / 18, 0, 1), col = A.mix(DK, HI, lv * lv * (3 - 2 * lv) * .35 + lv * .65), q = (j * w + i) * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return lmap = c;
  }
  /* A tileable value-noise texture, dithered to a few alpha steps in one color (fog banks, rain clouds). */
  function noiseTex(N, per, col, lo, hi, maxA, seed, dith = 0){
    const c = A.canvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
    const vn = (u, v, P) => {
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, h = (a, b) => A.hash2(((a % P) + P) % P + seed * 101, ((b % P) + P) % P + seed * 37);
      const a = h(i, j), b = h(i + 1, j), cc = h(i, j + 1), e = h(i + 1, j + 1), su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      return a + (b - a) * su + (cc - a) * sv + (a - b - cc + e) * su * sv;
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
      let n = 0, amp = .55, tot = 0;
      for (let o = 0, P = per; o < 4; o++, P *= 2, amp *= .5){ n += vn(i / N * P, j / N * P, P) * amp; tot += amp; }
      const a = clamp(((n / tot) - lo) / (hi - lo), 0, 1), lv = Math.floor(a * a * 5 + (dith ? A.bayer(i, j) : .5)) / 5, q = (j * N + i) * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = Math.round(lv * maxA);
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  let clouds = null;
  /* The pixel-art layer's grade: the light, then the sky. Noon gets a little more punch, a storm drifting cloud
     shadow, and lightning lifts the night for a blink. */
  function grade(G){
    const C = G.cond; if (!C) return;
    const K = SKY[C.sky], night = C.time === 'night', bolt = flash > .5;
    bx.setTransform(1, 0, 0, 1, 0, 0);
    if (C.time === 'noon' && !K){   // the high sun: the art pushed against itself for contrast and color
      bx.globalCompositeOperation = 'overlay'; bx.globalAlpha = .28; bx.drawImage(buf, 0, 0, Wb, Hb, 0, 0, Wb, Hb); bx.globalAlpha = 1;
    }
    bx.globalCompositeOperation = 'multiply';
    if (night){
      const m = lightmap(), [ax, ay] = toBuf(LX0, LY0), [cx, cy] = toBuf(LX0 + m.width / LR, LY0 + m.height / LR);
      bx.globalAlpha = bolt ? .3 : 1;
      bx.beginPath(); bx.rect(0, 0, Wb, Hb); bx.rect(Math.min(ax, cx), Math.min(ay, cy), Math.abs(cx - ax), Math.abs(cy - ay));
      bx.fillStyle = 'rgb(34,40,76)'; bx.fill('evenodd');
      worldTransform(bx, LX0, LY0); bx.drawImage(m, 0, 0, m.width * S / LR, m.height * S / LR);
      bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalAlpha = 1;
    }
    if (K){ bx.fillStyle = K.mul; bx.fillRect(0, 0, Wb, Hb); }
    if (C.sky === 'rain'){   // storm clouds rolling over, their shadows sliding across the turf
      if (!clouds) clouds = bx.createPattern(noiseTex(256, 3, [104, 114, 136], .42, .78, 150, 3), 'repeat');
      const [ox, oy] = toBuf(0, 0), dr = t * (6 + Math.abs(C.wind || 0));
      clouds.setTransform(new DOMMatrix([2, 0, 0, 2, ox + (portrait ? dr : 0), oy + (portrait ? 0 : dr)]));
      bx.fillStyle = clouds; bx.fillRect(0, 0, Wb, Hb);
    }
    bx.globalCompositeOperation = 'screen';
    if (lit.lift){ bx.fillStyle = lit.lift; bx.fillRect(0, 0, Wb, Hb); }
    if (K?.lift){ bx.fillStyle = K.lift; bx.fillRect(0, 0, Wb, Hb); }
    bx.globalCompositeOperation = 'source-over';
    standsLights(G); sideLights(G);
    // Flashbulbs in the stands, popping bright over the dark.
    for (const [x, y] of pops){
      bx.fillStyle = 'rgba(255,255,248,.16)'; bx.fillRect(x - 2, y - 1, 5, 3); bx.fillRect(x - 1, y - 2, 3, 5);
      bx.fillStyle = 'rgba(255,255,244,.7)'; bx.fillRect(x - 2, y, 5, 1); bx.fillRect(x, y - 2, 1, 5);
      bx.fillStyle = '#fff'; bx.fillRect(x, y, 1, 1);
    }
    pops.length = 0;
  }
  const pops = [];
  /* Bloom: the bright parts of the pixel art (lines, jerseys, lights, snow) glowing softly into the air. The buffer
     shrunk twice with smoothing, cubed against itself so only the brights survive, and laid back over the screen.
     The shrunken grids are pinned to the field, not the screen (shifted by where the field's origin sits, mod 12):
     pinned to the screen, every line and jersey fell on a different texel as the camera moved, and the glow shimmered. */
  const bl1 = A.canvas(8, 8), bl2 = A.canvas(8, 8), b1 = bl1.getContext('2d'), b2 = bl2.getContext('2d');
  function bloom(a, ox, oy){
    const [wx0, wy0] = toBuf(0, 0), px = ((-wx0) % 12 + 12) % 12, py = ((-wy0) % 12 + 12) % 12;   // buffer px -> grid: +px, +py
    const w1 = Math.ceil((Wb + 12) / 4), h1 = Math.ceil((Hb + 12) / 4), w2 = Math.ceil(w1 / 3), h2 = Math.ceil(h1 / 3);
    if (bl1.width !== w1 || bl1.height !== h1){ bl1.width = w1; bl1.height = h1; bl2.width = w2; bl2.height = h2; }
    b1.imageSmoothingEnabled = b2.imageSmoothingEnabled = true;
    b1.globalCompositeOperation = 'copy'; b1.drawImage(buf, 0, 0, Wb, Hb, px / 4, py / 4, Wb / 4, Hb / 4);
    b1.globalCompositeOperation = 'multiply'; b1.drawImage(bl1, 0, 0); b1.drawImage(bl1, 0, 0);
    b2.globalCompositeOperation = 'copy'; b2.drawImage(bl1, 0, 0, w2 * 3, h2 * 3, 0, 0, w2, h2);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'screen';
    const x0 = ox * k - px * bs, y0 = oy * k - py * bs;
    ctx.globalAlpha = a * .55; ctx.drawImage(bl1, 0, 0, w1, h1, x0, y0, w1 * 4 * bs, h1 * 4 * bs);
    ctx.globalAlpha = a; ctx.drawImage(bl2, 0, 0, w2, h2, x0, y0, w2 * 12 * bs, h2 * 12 * bs);
    ctx.restore();
  }
  /* Rain, snow, wind and fog in the air, the haze of the lights at night, and lightning in a storm (UI pixels, over
     the field and under the markers and labels, which stay crisp on top). */
  function sky(G, dt){
    const C = G.cond; if (!C) return;
    const night = C.time === 'night', wind = C.wind || 0, s = C.sky;
    // The crosswind on screen: across the field is left-right standing up, up-down lying down.
    const wx = portrait ? wind : 0, wy = portrait ? 0 : wind;
    if (night && flash < .5) nightLayer();
    if (s === 'fog') fogBanks(night, dt, wind);
    if (night) glows(s);
    if (s === 'snow') snowEdge(night);
    if (s === 'rain') rain(night, dt, wx, wy);
    if (s === 'snow') snow(night, dt, wx, wy);
    if ((C.temp ?? 60) <= 40) breath(G, dt, wind);
    if (s === 'wind' || Math.abs(wind) >= 15) gusty(dt, wind, s === 'wind');
    if (s === 'rain' && (nextBolt -= dt) <= 0){ nextBolt = rr(12, 34); flash = 1; }
    if (flash > 0){
      const a = flash > .82 ? .62 : flash > .7 ? .1 : flash > .56 ? .44 : flash * .4;
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(214,224,255,${a.toFixed(2)})`; ctx.fillRect(0, 0, Wu, Hu); ctx.globalCompositeOperation = 'source-over';
      flash = Math.max(0, flash - dt * 2.2);
    }
  }
  /* Rain in three depths: a haze of fine far drops, the body of it, and a few long bright streaks right by the lens,
     slanting with the wind; splashes crown and ripple out on the turf (world space, so they stay put on the grass). */
  const splashes = [];
  let dropsOf = '';
  function rain(night, dt, wx, wy){
    const n = Math.min(420, Math.round(Wu * Hu / 260));
    if (dropsOf !== 'rain'){ dropsOf = 'rain'; drops = []; }
    while (drops.length < n) drops.push({ x: rr(-20, Wu + 20), y: rr(-20, Hu + 20), z: Math.pow(Math.random(), 1.6) });
    drops.length = n;
    const vx = 26 + wx * 4.5, vy = 340 + wy * 3, P = [new Path2D(), new Path2D(), new Path2D()];
    for (const d of drops){
      const sp = .5 + d.z * 1.1, L = .018 + d.z * .05;
      d.x += vx * sp * dt; d.y += vy * sp * dt;
      if (d.y > Hu + 24) d.y -= Hu + 48; if (d.y < -24) d.y += Hu + 48;
      if (d.x > Wu + 24) d.x -= Wu + 48; if (d.x < -24) d.x += Wu + 48;
      const p = P[d.z > .82 ? 2 : d.z > .42 ? 1 : 0]; p.moveTo(d.x, d.y); p.lineTo(d.x - vx * sp * L, d.y - vy * sp * L);
    }
    const tone = night ? '196,212,255' : '214,224,238';
    // Sheets of heavier rain sweeping across with the wind.
    for (let i = 0; i < 2; i++){
      const L = portrait ? Wu : Hu, span = L * .45, c = ((t * (40 + Math.abs(wx + wy) * 3) + i * L * 1.1) % (L * 2.2)) - span, sg = (wx + wy) < 0 ? -1 : 1, u = sg > 0 ? c : L - c;
      const g = portrait ? ctx.createLinearGradient(u - span / 2, 0, u + span / 2, 0) : ctx.createLinearGradient(0, u - span / 2, 0, u + span / 2);
      g.addColorStop(0, `rgba(${tone},0)`); g.addColorStop(.5, `rgba(${tone},${night ? .07 : .09})`); g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g; if (portrait) ctx.fillRect(u - span / 2, 0, span, Hu); else ctx.fillRect(0, u - span / 2, Wu, span);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = .55; ctx.strokeStyle = `rgba(${tone},${night ? .3 : .26})`; ctx.stroke(P[0]);
    ctx.lineWidth = .85; ctx.strokeStyle = `rgba(${tone},${night ? .5 : .4})`; ctx.stroke(P[1]);
    ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${tone},${night ? .62 : .5})`; ctx.stroke(P[2]);
    ctx.lineCap = 'butt';
    for (let q = Wu * Hu / 1500 * dt; q > 0; q--) if (q >= 1 || Math.random() < q){ const w = toWorld(rr(0, Wu), rr(0, Hu)); splashes.push({ x: w.x, y: w.y, t: 0, big: Math.random() < .25 }); }
    const crown = new Path2D(), ring = new Path2D(), fade = new Path2D();
    for (let i = splashes.length - 1; i >= 0; i--){
      const p = splashes[i]; p.t += dt;
      if (p.t > .5){ splashes[i] = splashes[splashes.length - 1]; splashes.pop(); continue; }
      const [x, y] = toScreen(p.x, p.y);
      if (p.t < .08){ crown.rect(x, y - 2, 1, 1); crown.rect(x - 1, y - 1, 1, 1); crown.rect(x + 1, y - 1, 1, 1); crown.rect(x, y, 1, 1); continue; }
      const r = 1.2 + (p.t - .08) * (p.big ? 14 : 9), ry = r * .55, pth = p.t < .3 ? ring : fade, m = r > 3 ? 12 : 8;
      for (let a = 0; a < m; a++){ const th = a / m * Math.PI * 2; pth.rect(Math.round(x + Math.cos(th) * r), Math.round(y + Math.sin(th) * ry), 1, 1); }
    }
    ctx.fillStyle = `rgba(${tone},.85)`; ctx.fill(crown);
    ctx.fillStyle = `rgba(${tone},.42)`; ctx.fill(ring);
    ctx.fillStyle = `rgba(${tone},.2)`; ctx.fill(fade);
  }
  /* Snow in three depths: fine far flakes, a middle layer, and big soft ones drifting past close to the lens; all of
     it swaying down and carried by the wind. */
  function snow(night, dt, wx, wy){
    const n = Math.min(520, Math.round(Wu * Hu / 210));
    if (dropsOf !== 'snow'){ dropsOf = 'snow'; drops = []; }
    while (drops.length < n) drops.push({ x: rr(-10, Wu + 10), y: rr(-10, Hu + 10), z: Math.pow(Math.random(), 1.3), ph: rr(0, 6) });
    drops.length = n;
    const P = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (const d of drops){
      const sp = .35 + d.z * 1.2;
      d.y += (16 + wy * 1.1) * sp * dt; d.x += (wx * 1.6 * sp + Math.sin(t * (.7 + d.z * .6) + d.ph) * (3 + 9 * d.z)) * dt;
      if (d.y > Hu + 8) d.y -= Hu + 16; if (d.y < -8) d.y += Hu + 16;
      if (d.x > Wu + 8) d.x -= Wu + 16; if (d.x < -8) d.x += Wu + 16;
      const x = Math.round(d.x), y = Math.round(d.y);
      if (d.z < .4) P[0].rect(x, y, 1, 1);
      else if (d.z < .76){ P[1].rect(x, y, 2, 2); P[4].rect(x + 1, y + 2, 2, 1); }
      else if (d.z < .93){ P[2].rect(x - 1, y, 3, 1); P[2].rect(x, y - 1, 1, 3); P[3].rect(x, y, 1, 1); P[4].rect(x, y + 2, 2, 1); P[4].rect(x + 2, y + 1, 1, 1); }
      else { P[2].rect(x - 1, y - 1, 4, 4); P[2].rect(x - 2, y, 6, 2); P[2].rect(x, y - 2, 2, 6); P[3].rect(x, y, 2, 2); P[4].rect(x, y + 4, 2, 1); P[4].rect(x + 2, y + 3, 2, 1); P[4].rect(x + 4, y + 2, 1, 1); }
    }
    const tone = night ? '226,234,255' : '255,255,255';
    ctx.fillStyle = 'rgba(70,84,120,.3)'; ctx.fill(P[4]);   // a cool shade under the nearer flakes, so they read over the snow too
    ctx.fillStyle = `rgba(${tone},.5)`; ctx.fill(P[0]);
    ctx.fillStyle = `rgba(${tone},.85)`; ctx.fill(P[1]);
    ctx.fillStyle = `rgba(${tone},.42)`; ctx.fill(P[2]);
    ctx.fillStyle = `rgba(${tone},.95)`; ctx.fill(P[3]);
  }
  /* In the cold, every player's breath puffing and drifting off with the wind (world space, at head height). */
  const puffs = [];
  function breath(G, dt, wind){
    const P = G.play; if (!P || G.kick) { puffs.length = 0; return; }
    for (let q = P.all.length * dt * .7; q > 0; q--) if (q >= 1 || Math.random() < q){
      const p = P.all[Math.floor(Math.random() * P.all.length)]; if (p.down) continue;
      const f = portrait ? (p.team === 'off' ? 1 : -1) : (p.face ?? (p.team === 'off' ? 1 : -1));
      puffs.push({ x: p.x + f * .45, y: p.y, vx: f * .5 + p.vx * .8, vy: wind * .045 + p.vy * .8, t: 0 });
    }
    const P3 = [new Path2D(), new Path2D(), new Path2D()];
    for (let i = puffs.length - 1; i >= 0; i--){
      const b = puffs[i]; b.t += dt;
      if (b.t > 1){ puffs[i] = puffs[puffs.length - 1]; puffs.pop(); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - dt * 2;
      const [x, y] = toScreen(b.x, b.y, 3.4 + b.t * .3), r = Math.round(1 + b.t * 3.4), p = P3[b.t < .3 ? 0 : b.t < .65 ? 1 : 2];
      p.rect(x - r + 1, y - r, 2 * r - 2 || 1, 2 * r); p.rect(x - r, y - r + 1, 2 * r, 2 * r - 2 || 1);
    }
    ctx.fillStyle = 'rgba(244,247,255,.62)'; ctx.fill(P3[0]);
    ctx.fillStyle = 'rgba(244,247,255,.36)'; ctx.fill(P3[1]);
    ctx.fillStyle = 'rgba(244,247,255,.16)'; ctx.fill(P3[2]);
  }
  /* Wind you can read (which way it blows matters for kicks): long swooshes of air whipping across with a curl at
     their heads, a race of fine streaks under them, and leaves and scraps tumbling along. */
  const swish = [], streaks = [], leaves = [];
  function gusty(dt, wind, strong){
    const sg = Math.sign(wind) || 1, sp = 80 + Math.abs(wind) * 8, ext = portrait ? Wu : Hu, wide = portrait ? Hu : Wu;
    // Along / across the wind to the screen: u runs with it, v across.
    const put = (p, u, v, w = 1, h = 1) => { const a = Math.round(sg > 0 ? u : ext - u), b = Math.round(v); if (portrait) p.rect(a, b, w, h); else p.rect(b, a, h, w); };
    if (swish.length < (strong ? 11 : 4) && Math.random() < dt * (strong ? 7 : 2.5))
      swish.push({ u: rr(-.4, .6) * ext, v: rr(.04, .96) * wide, len: rr(70, 150), amp: rr(2, 5), ph: rr(0, 6), fq: rr(.035, .07), t: 0, T: rr(1, 1.5), z: Math.random(), two: Math.random() < .4 });
    const near = new Path2D(), far = new Path2D(), fine = new Path2D();
    for (let i = swish.length - 1; i >= 0; i--){
      const w = swish[i]; w.t += dt;
      if (w.t > w.T){ swish.splice(i, 1); continue; }
      const k = w.t / w.T, head = Math.min(1, k / .5) * w.len, tail = Math.max(0, (k - .4) / .6) * w.len, base = w.u + w.t * sp * .6, pth = w.z > .45 ? near : far;
      for (let s = tail; s <= head; s += 1){
        const v = w.v + Math.sin(s * w.fq + w.ph) * w.amp;
        put(pth, base + s, v); if (w.two && s > tail + 12) put(far, base + s - 10, v + 4);
      }
      if (k > .45 && k < .8){   // the curl at the head
        const v0 = w.v + Math.sin(head * w.fq + w.ph) * w.amp;
        for (let a = 0; a < 12; a++){ const th = a / 12 * Math.PI * 1.7; put(pth, base + head + Math.sin(th) * 3.5, v0 - (1 - Math.cos(th)) * 3.5); }
      }
    }
    const nS = strong ? 44 : 16;
    while (streaks.length < nS) streaks.push({ u: rr(0, ext), v: rr(0, wide), len: rr(5, 16), z: rr(.5, 1) });
    streaks.length = nS;
    for (const q of streaks){
      q.u += sp * 1.4 * q.z * dt; if (q.u > ext + 20){ q.u = -q.len - rr(0, 40); q.v = rr(0, wide); }
      put(fine, q.u, q.v, Math.round(q.len), 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill(fine);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill(far);
    ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.fill(near);
    if (!strong) return;
    while (leaves.length < 16) leaves.push({ u: rr(0, ext), v: rr(0, wide), z: rr(.45, 1), ph: rr(0, 6), c: ['#c9822f', '#a65a24', '#e3c16f', '#7a8f3a', '#8a4a1e'][leaves.length % 5] });
    for (const g of leaves){
      g.u += sp * .75 * g.z * dt; g.v += Math.sin(t * 2.6 + g.ph) * 18 * dt;
      if (g.u > ext + 10){ g.u = -rr(6, 60); g.v = rr(0, wide); }
      const f = Math.floor(t * (8 + g.z * 6) + g.ph) % 4, sh = new Path2D(), lf = new Path2D(), u = g.u, v = g.v, big = g.z > .8 ? 1 : 0;
      put(sh, u + 2, v + 4, 2 + big, 1);   // its shadow on the grass below
      if (f === 0) put(lf, u, v, 3 + big, 2); else if (f === 1){ put(lf, u, v, 2, 1); put(lf, u + 1, v + 1, 2 + big, 1); } else if (f === 2) put(lf, u + 1, v - 1, 1, 3 + big); else { put(lf, u + 1, v, 2 + big, 1); put(lf, u, v + 1, 2, 1); }
      ctx.fillStyle = 'rgba(16,22,12,.28)'; ctx.fill(sh); ctx.fillStyle = g.c; ctx.fill(lf);
    }
  }
  /* Under the lights: the edges of the screen sinking into a deep blue night (dithered steps, built once per size). */
  let nightV = null, snowV = null;
  function edgeTex(rgb, r0, span, pow, maxA, lv = 6, dith = true){
    const c = A.canvas(Wu, Hu), x = c.getContext('2d'), img = x.createImageData(Wu, Hu), d = img.data;
    for (let j = 0; j < Hu; j++) for (let i = 0; i < Wu; i++){
      const nx = (i - Wu / 2) / (Wu / 2), ny = (j - Hu / 2) / (Hu / 2), r = Math.sqrt(nx * nx * .9 + ny * ny * .9);
      const a = Math.floor(Math.pow(clamp((r - r0) / span, 0, 1), pow) * lv + (dith ? A.bayer(i, j) : .5)) / lv; if (a <= 0) continue;
      const q = (j * Wu + i) * 4; d[q] = rgb[0]; d[q + 1] = rgb[1]; d[q + 2] = rgb[2]; d[q + 3] = Math.round(Math.min(1, a) * maxA);
    }
    x.putImageData(img, 0, 0); return c;
  }
  function nightLayer(){ ctx.drawImage(nightV ||= edgeTex([2, 5, 20], .34, 1, 1.35, 225, 8), 0, 0); }
  function snowEdge(night){ ctx.drawImage(snowV ||= edgeTex([226, 232, 244], .62, .7, 1.6, 120), 0, 0); }
  /* The haze of the light towers: each one's glow hanging in the air toward where it stands (pulled in to just off
     the screen's corner when it's farther), soft enough to read as air, not a lamp. Brighter in fog, rain and snow,
     where the air catches the light. */
  function glows(s){
    const thick = s === 'fog' ? 2.2 : s === 'rain' || s === 'snow' ? 1.25 : 1, M = Math.max(Wu, Hu), R = M * .62;
    ctx.globalCompositeOperation = 'screen';
    for (const [p, q] of BANKS){
      let [x, y] = toScreen(p, q); x = clamp(x, -Wu * .08, Wu * 1.08); y = clamp(y, -Hu * .12, Hu * 1.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(214,228,255,${(.3 * thick).toFixed(3)})`); g.addColorStop(.2, `rgba(176,198,255,${(.13 * thick).toFixed(3)})`);
      g.addColorStop(.55, `rgba(120,146,220,${(.04 * thick).toFixed(3)})`); g.addColorStop(1, 'rgba(100,120,200,0)');
      ctx.fillStyle = g; ctx.fillRect(Math.max(0, x - R), Math.max(0, y - R), R * 2, R * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  /* Fog: banks of it rolling across the field in layers (dithered noise, drifting with the wind and lying on the turf
     as the camera moves), over a thin wash, thickening into the distance at the edges of the screen. */
  let fogPat = null, fogV = null;
  function fogBanks(night, dt, wind){
    const key = night ? 'n' : 'd', col = night ? [92, 106, 136] : [214, 218, 224];
    if (!fogPat || fogPat.key !== key) fogPat = { key, far: ctx.createPattern(noiseTex(128, 2, col, .42, .74, 110, 7), 'repeat'), near: ctx.createPattern(noiseTex(256, 2, col, .46, .8, 140, 11), 'repeat') };
    if (!fogV || fogV.key !== key) fogV = { key, c: edgeTex(col, .42, .9, 1.4, 180, 10) };
    const [ox, oy] = toScreen(0, 0), dr = t * (5 + Math.abs(wind) * .8) * (Math.sign(wind) || 1);
    ctx.fillStyle = A.css(col, .12); ctx.fillRect(0, 0, Wu, Hu);
    for (const [pat, par, sc, spd] of [[fogPat.far, .7, 1, .6], [fogPat.near, 1, 2, 1.3]]){
      const u = dr * spd + t * 2 * spd, mx = ox * par + (portrait ? u : t * 1.5), my = oy * par + (portrait ? t * 1.5 : u);
      pat.setTransform(new DOMMatrix([sc, 0, 0, sc, mx, my])); ctx.fillStyle = pat; ctx.fillRect(0, 0, Wu, Hu);
    }
    ctx.drawImage(fogV.c, 0, 0);
  }
  /* Dust drifting in the sunlit air; at night, specks glinting in the lights. */
  function dust(dt, night){
    for (const m of motes){
      m.x = (m.x + m.vx * dt + Wu) % Wu; m.y = (m.y + m.vy * dt + Hu) % Hu;
      if (!night){ const w = toWorld(m.x, m.y); if (A.inShadow(w.x, w.y)) continue; }
      const a = (Math.sin(t * (night ? 3.1 : 1.7) + m.ph) + 1) / 2; if (a < .45) continue;
      ctx.fillStyle = night ? `rgba(220,232,255,${(.25 + a * .45).toFixed(2)})` : `rgba(255,236,190,${(.2 + a * .3).toFixed(2)})`; ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
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
    ty = lat >= FW + 2 * SIDE ? MID : clamp(ty, lat / 2 - SIDE, FW + SIDE - lat / 2);
    const q = Math.min(1, dt * (P?.live ? 5 : 3.2));
    cam.x += (tx - cam.x) * q; cam.y += (ty - cam.y) * q;
  }
  function snapCamera(G){
    // The new play isn't set up yet: start from the throw view when the routes will need framing (it eases in).
    setZoom(snap(routesOn && !G.youDefend ? THROW : zoomTarget(G) ?? CLOSE));
    cam.x = G.los + ((portrait ? Hb : Wb) / S) * (portrait ? .2 : .16); cam.y = clamp(G.y, 0, FW);
  }

  /* ---------- a frame ---------- */
  let held = 0, odd = false;
  function draw(G, dt, view = {}){
    // Behind a menu, whose frosted glass re-blurs whatever changes under it, a heavy scene (night, or rain, snow or
    // fog) redraws every other frame and without its glow: no one can tell under the blur, and the menu stays smooth.
    const C = G.cond, heavy = C && (C.time === 'night' || C.sky === 'rain' || C.sky === 'snow' || C.sky === 'fog');
    if (view.covered && heavy){ if ((odd = !odd)){ held += dt; return; } dt += held; } held = 0;
    t += dt;
    if (G.play && !G.play.live && !G.play.result && !G.kick) routesOn = !!view.routes;
    prepare(G);
    pumpBake();
    // The flyover's overview, once the field is up: baked in slices behind the setup menu (a bigger bite if the shot is waiting on it).
    const C0 = G.cond || {}, okey = art && !bake ? `${fieldKey}|${C0.time}|${['rain', 'snow', 'fog'].includes(C0.sky) ? C0.sky : 'clear'}` : '';
    if (okey && (view.fly || fly) && ov?.key !== okey && ovBake?.key !== okey) ovBake = { key: okey, steps: FO.buildOverviewSteps(home, away, { time: C0.time || 'afternoon', sky: C0.sky || 'clear' }, art, logo) };
    if (ovBake && !bake){ const end = performance.now() + (fly && !fly.on ? 12 : 5); let r; do r = ovBake.steps.next(); while (!r.done && performance.now() < end); if (r.done){ ov = r.value; ov.key = ovBake.key; ovBake = null; } }
    const fm = fly ? flyTick(G, dt, okey) : 0;   // 0: no flyover, 1: the overview alone, 2: crossfading into the live scene
    if (fm === 1) return paintOv(G);
    lit = flash > .55 ? BOLT : LIGHT[G.cond?.time] || LIGHT.afternoon; curG = G;
    fsuTrack(G, dt);
    impacts(G, dt);
    if (!fm){ updateZoom(G, dt, view.aim); updateCamera(G, dt, view.aim); }
    const sh = cam.shake > 0 ? cam.shake : 0; cam.shake = Math.max(0, cam.shake - dt * 10);
    const ox = sh ? Math.round((Math.random() - .5) * sh * 2) : 0, oy = sh ? Math.round((Math.random() - .5) * sh * 2) : 0;
    // The pixel-art layer.
    field(G);
    sideline(G, dt);
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
      drawImpacts();
      ball(G);
    }
    if (spearOn()) spear();
    const KB = G.kick?.ball, behind = KB && KB.x >= 110.4;
    if (G.kick && behind && !KB.gone) drawBall(KB.x, KB.y, KB.z);
    goalposts();
    if (KB && !behind) drawBall(KB.x, KB.y, KB.z);
    grade(G);
    // Onto the screen, then the overlays in UI pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    if (sh){ ctx.fillStyle = '#24222a'; ctx.fillRect(0, 0, cw, ch); }
    ctx.drawImage(buf, 0, 0, Wb, Hb, ox * k, oy * k, Wb * bs, Hb * bs);
    const glow = !view.covered && (lit.bloom || SKY[G.cond?.sky]?.bloom); if (glow) bloom(glow, ox, oy);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (!G.cond || G.cond.sky === 'clear') dust(dt, G.cond?.time === 'night');
    sky(G, dt);
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
    vignette();
    if (fsu.conf.length || fsu.flash > 0) confetti(dt);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (view.stick) stick(view.stick);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fm === 2) paintOv(G);
  }
  /* ---------- the pregame flyover (flyover.js paints it; this runs the clock and the handoff) ---------- */
  function flyTick(G, dt, okey){
    const F = fly;
    if (!F.on){
      F.wait += dt;
      if (okey && ov?.key === okey){ F.on = true; F.t = 0; }
      else if (F.wait > 1.8 || (!ovBake && !bake && F.wait > .3)) return endFly();   // not ready: skip the shot
      else return 0;
    }
    if (F.skip){ F.sk += dt; if (F.sk >= .4) return endFly(); F.alpha = 1 - F.sk / .4; }
    else {
      F.t += dt; if (F.t >= FO.FLY_T) return endFly();
      F.alpha = F.t < FO.FLY_FADE ? 1 : 1 - (F.t - FO.FLY_FADE) / (FO.FLY_T - FO.FLY_FADE);
      if (!F.cheered && F.t >= FO.cheerAt(F.variant)){ F.cheered = true; sfx('td'); }
    }
    cam.x = 50; cam.y = MID; setZoom(WIDE);   // the live camera waits at the widest view, where the overview lands
    return F.skip || F.t >= FO.FLY_FADE ? 2 : 1;
  }
  function endFly(){ const cb = fly?.done; fly = null; cb?.(); return 0; }
  function paintOv(G){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    FO.paintFly(ctx, { ov, cw, ch, portrait, k, t: fly.t, alpha: fly.alpha, art, logo, wind: G.cond?.wind, variant: fly.variant, match: { home: G.me, away: G.opp, cond: G.cond } });
  }

  return {
    resize, draw, toWorld, toScreen, dragToWorld, snapCamera,
    flyStart(G, done, variant){ fly = { done, wait: 0, on: false, t: 0, sk: 0, skip: false, alpha: 1, cheered: false, variant: variant || (Math.random() < .125 ? 'b2' : 'jets') }; },
    flySkip(){ if (!fly) return; if (fly.on) fly.skip = true; else endFly(); },
    get flying(){ return !!fly; }, get flyLevel(){ return fly?.on ? FO.flyLevel(fly.t, fly.variant) : .05; },
    shake(a){ cam.shake = Math.max(cam.shake, a); },
    bolt(){ flash = 1; },   // lightning now (a storm rolls its own)
    get portrait(){ return portrait; }, get W(){ return Wu; }, get H(){ return Hu; }, S: OLD,
    /* How far above his feet the middle of a player is, in UI pixels (for taps on receivers). */
    get figure(){ return Math.round(16 * f2u()); },
    hd: true
  };
}
