/* Coach Andre's Bowl renderer. The canvas runs at a low "logical" resolution (about 290 pixels on the short side, enough for
   the full width of the field) and the
   browser scales it up with crisp pixels. Landscape screens show the field sideways (you drive right); portrait
   phones show it upright (you drive up). Sprites are always drawn upright; only positions are rotated. */
import { FW, MID, HASH, GOAL_HALF, BAR, canThrow, clamp } from './sim.js';
import { drawText, drawTextCentered, textWidth } from './font.js';

const S = 5;   // logical pixels per yard

/* ---------- colors ---------- */
const hex = c => { c = String(c || '#777').replace('#', ''); if (c.length === 3) c = [...c].map(x => x + x).join(''); const n = parseInt(c, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const shade = (c, f) => toHex(hex(c).map(v => f < 0 ? v * (1 + f) : v + (255 - v) * f));
const lum = c => { const [r, g, b] = hex(c); return (r * .299 + g * .587 + b * .114) / 255; };
const near = (a, b) => { const p = hex(a), q = hex(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 70; };

/* ---------- sprites ---------- */
const BODY = [
  '..hhh..', '.hhhhh.', '.hhhhh.', '..sss..', 'jjjjjjj', 'sjjjjjs', '.jjjjj.', '.ppppp.'
];
const LEGS = [
  ['.pp.pp.', '.ll.ll.', '.kk.kk.'],
  ['.ppppp.', 'll...ll', 'k.....k'],
  ['..ppp..', '..ll...', '..kk...'],
  ['.ppppp.', 'll...ll', 'k.....k'],
  ['..ppp..', '...ll..', '...kk..']
];
const DOWN = ['...........', '.hhh.......', 'hhhhjjjjjpk', 'hmhhjjjjjpk', '.s..s......'];

const cache = new Map();
/* One player frame as a small offscreen canvas with a dark outline. view: 'side' (facing right), 'front', 'back'. */
function sprite(key, colors, view, frame, flip, down){
  const k = `${key}|${view}|${frame}|${flip}|${down}`;
  let c = cache.get(k); if (c) return c;
  const rows = down ? DOWN : [...BODY, ...LEGS[frame]];
  const w = rows[0].length + 2, h = rows.length + 2;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), map = { ...colors };
  const px = (cx, cy, col) => { x.fillStyle = col; x.fillRect(flip ? w - 1 - cx : cx, cy, 1, 1); };
  const cell = (r, i) => rows[r][i];
  // Outline pass, then fill.
  for (let r = 0; r < rows.length; r++) for (let i = 0; i < rows[r].length; i++) if (cell(r, i) !== '.')
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) px(i + 1 + dx, r + 1 + dy, '#101010');
  for (let r = 0; r < rows.length; r++) for (let i = 0; i < rows[r].length; i++){
    let ch = cell(r, i); if (ch === '.') continue;
    let col = map[ch] || '#f0f';
    if (!down && r === 2 && ch === 'h'){
      if (view === 'side' && i >= 4) col = map.m;
      if (view === 'front' && i >= 2 && i <= 4) col = map.m;
    }
    if (!down && r <= 2 && i === 3 && view !== 'side' && ch === 'h') col = map.stripe;
    if (!down && r === 4 && (i === 0 || i === 6)) col = map.trim;
    if (!down && r === 3 && view === 'back') col = map.h;
    px(i + 1, r + 1, col);
  }
  cache.set(k, c);
  return c;
}

function teamColors(t, away){
  const color = t.color || '#777', alt = t.alt && !near(t.alt, color) ? t.alt : (lum(color) > .6 ? '#222' : '#fff');
  return away
    ? { h: color, stripe: alt, m: '#bfbfbf', j: '#f4f4f4', trim: color, p: lum(alt) > .7 ? '#d9d9d9' : '#e8e8e8', l: color, k: '#1a1a1a' }
    : { h: color, stripe: alt, m: '#bfbfbf', j: color, trim: alt, p: lum(color) < .25 ? alt : '#f2f2f2', l: color, k: '#1a1a1a' };
}

/* ---------- the renderer ---------- */
export function createRenderer(canvas){
  const ctx = canvas.getContext('2d');
  let W = 320, H = 180, portrait = false;
  const cam = { x: 30, y: MID, shake: 0 };
  let crowd = null, crowdKey = '', logoImg = null, teamsKey = '', t = 0;

  let sized = '';
  /* Matches the canvas to its on-screen size. Safe to call often: it only rebuilds when the size really changed,
     and ignores the moment before the page has laid the game out (a phone measuring then would get a squeezed,
     sideways field). */
  function resize(){
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (r.width < 60 || r.height < 60) return false;
    const key = `${Math.round(r.width)}x${Math.round(r.height)}@${dpr}`;
    if (key === sized) return false;
    sized = key;
    portrait = r.height > r.width;
    const short = Math.min(r.width, r.height) * dpr, P = Math.max(1, Math.round(short / 290));
    W = Math.ceil(r.width * dpr / P); H = Math.ceil(r.height * dpr / P);
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    return true;
  }

  const toScreen = (x, y, z = 0) => portrait
    ? [Math.round((y - cam.y) * S + W / 2), Math.round(H / 2 - (x - cam.x) * S - z * S * .8)]
    : [Math.round((x - cam.x) * S + W / 2 + z * S * .3), Math.round((y - cam.y) * S + H / 2 - z * S * .75)];
  const toWorld = (sx, sy) => portrait
    ? { x: cam.x + (H / 2 - sy) / S, y: cam.y + (sx - W / 2) / S }
    : { x: cam.x + (sx - W / 2) / S, y: cam.y + (sy - H / 2) / S };
  /* A screen-space drag (logical px) as a field vector in yards. */
  const dragToWorld = (dx, dy) => portrait ? { x: -dy / S, y: dx / S } : { x: dx / S, y: dy / S };

  function rect(x0, y0, x1, y1, col){
    const [ax, ay] = toScreen(x0, y0), [bx, by] = toScreen(x1, y1);
    ctx.fillStyle = col;
    ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax) || 1, Math.abs(by - ay) || 1);
  }
  const visible = () => {
    const a = toWorld(0, 0), b = toWorld(W, H);
    return { x0: Math.min(a.x, b.x) - 2, x1: Math.max(a.x, b.x) + 2, y0: Math.min(a.y, b.y) - 2, y1: Math.max(a.y, b.y) + 2 };
  };

  function buildCrowd(G){
    const key = G.me.color + G.opp.color;
    if (key === crowdKey) return;
    crowdKey = key;
    const c = document.createElement('canvas'); c.width = 36; c.height = 36;
    const x = c.getContext('2d');
    x.fillStyle = '#1d2024'; x.fillRect(0, 0, 36, 36);
    const cols = [G.me.color, G.me.color, G.me.alt || '#fff', G.opp.color, '#e8e8e8', '#3a3a3a', '#d9a066', '#8d5524'];
    for (let yy = 0; yy < 36; yy += 3) for (let xx = (yy / 3) % 2; xx < 36; xx += 3){
      x.fillStyle = cols[Math.floor(Math.random() * cols.length)]; x.fillRect(xx, yy, 2, 2);
    }
    crowd = c;
  }

  /* ---------- the field ---------- */
  function field(G){
    const v = visible();
    ctx.fillStyle = '#1d2024'; ctx.fillRect(0, 0, W, H);
    // Crowd in the stands (bouncing after a touchdown).
    if (crowd){
      const pat = ctx.createPattern(crowd, 'repeat'), [ox, oy] = toScreen(0, 0), b = G.cheer > 0 && Math.floor(t * 10) % 2 ? 1 : 0;
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, ox % 36, (oy % 36) - b]));
      ctx.fillStyle = pat;
      ctx.save();
      ctx.beginPath();
      const [s0x, s0y] = toScreen(v.x0, -7), [s1x, s1y] = toScreen(v.x1, v.y0 - 40); ctx.rect(Math.min(s0x, s1x), Math.min(s0y, s1y), Math.abs(s1x - s0x), Math.abs(s1y - s0y));
      const [t0x, t0y] = toScreen(v.x0, FW + 7), [t1x, t1y] = toScreen(v.x1, v.y1 + 40); ctx.rect(Math.min(t0x, t1x), Math.min(t0y, t1y), Math.abs(t1x - t0x), Math.abs(t1y - t0y));
      for (const [a, b] of [[v.x0 - 40, -17.4], [117.4, v.x1 + 40]]){ const [p0x, p0y] = toScreen(a, v.y0 - 40), [p1x, p1y] = toScreen(b, v.y1 + 40); ctx.rect(Math.min(p0x, p1x), Math.min(p0y, p1y), Math.abs(p1x - p0x), Math.abs(p1y - p0y)); }
      ctx.fill(); ctx.restore();
    }
    // Grass behind the end lines.
    rect(-17, -6, -10, FW + 6, '#2f6e34'); rect(110, -6, 117, FW + 6, '#2f6e34');
    rect(-17.4, -7, -17, FW + 7, '#0e1012'); rect(117, -7, 117.4, FW + 7, '#0e1012');
    // Wall, sideline grass and benches.
    rect(-30, -7, 140, -6, '#0e1012'); rect(-30, FW + 6, 140, FW + 7, '#0e1012');
    rect(-30, -6, 140, 0, '#2f6e34'); rect(-30, FW, 140, FW + 6, '#2f6e34');
    rect(30, FW + 3, 70, FW + 4.6, shade(G.me.color, -.2)); rect(30, -4.6, 70, -3, shade(G.opp.color, -.2));
    rect(30, FW + 4.6, 70, FW + 5, '#111'); rect(30, -3, 70, -2.6, '#111');
    // Grass in five-yard stripes, end zones in team colors.
    for (let x = Math.floor(Math.max(0, v.x0) / 5) * 5; x < Math.min(100, v.x1); x += 5) rect(x, 0, x + 5, FW, (x / 5) % 2 ? '#3d8b39' : '#459a40');
    rect(-10, 0, 0, FW, shade(G.me.color, -.15)); rect(100, 0, 110, FW, shade(G.opp.color, -.15));
    // Lines: yard lines every five, goal lines and end lines thicker, hash marks every yard.
    for (let x = 0; x <= 100; x += 5) if (x >= v.x0 && x <= v.x1) rect(x - (x % 50 === 0 ? .17 : 0), 0, x + .17, FW, '#f4f4ee');
    rect(-.25, 0, .25, FW, '#fff'); rect(99.75, 0, 100.25, FW, '#fff'); rect(-10.3, 0, -10, FW, '#fff'); rect(110, 0, 110.3, FW, '#fff');
    rect(-10, -.33, 110, 0, '#fff'); rect(-10, FW, 110, FW + .33, '#fff');
    for (let x = Math.max(1, Math.ceil(v.x0)); x < Math.min(100, v.x1); x++){
      if (x % 5 === 0) continue;
      for (const y of [.5, HASH[0], HASH[1], FW - .9]) rect(x - .08, y, x + .08, y + .4, '#e9efe4');
    }
    // Yard numbers.
    for (let x = 10; x <= 90; x += 10){
      if (x < v.x0 - 3 || x > v.x1 + 3) continue;
      const n = String(x <= 50 ? x : 100 - x);
      for (const y of [7, FW - 7]){ const [sx, sy] = toScreen(x, y); drawTextCentered(ctx, n, sx, sy - 7, { color: '#f4f4ee', scale: 2 }); }
    }
    // Midfield logo.
    if (logoImg?.complete && logoImg.naturalWidth){ const [sx, sy] = toScreen(50, MID); ctx.globalAlpha = .9; ctx.drawImage(logoImg, sx - 18, sy - 18, 36, 36); ctx.globalAlpha = 1; }
    // End zone names: stacked letters sideways, a word across when upright.
    endZoneText(G.me.name, -5, G.me.alt && !near(G.me.alt, G.me.color) ? G.me.alt : '#fff');
    endZoneText(G.opp.name, 105, G.opp.alt && !near(G.opp.alt, G.opp.color) ? G.opp.alt : '#fff');
  }
  function endZoneText(name, x, col){
    const s = String(name || '').toUpperCase().slice(0, 14), [sx, sy] = toScreen(x, MID);
    if (portrait) drawTextCentered(ctx, s, sx, sy - 7, { color: col, scale: 2, outline: '#111' });
    else { const h = s.length * 16; for (let i = 0; i < s.length; i++) drawTextCentered(ctx, s[i], sx, sy - h / 2 + i * 16, { color: col, scale: 2, outline: '#111' }); }
  }

  function goalposts(){
    const top = [[110, MID - GOAL_HALF, BAR], [110, MID + GOAL_HALF, BAR]];
    const [bx, by] = toScreen(110, MID, 0), [cx, cy] = toScreen(110, MID, BAR);
    line(bx, by, cx, cy, '#e8c51a', 2);
    const [l1x, l1y] = toScreen(...top[0]), [r1x, r1y] = toScreen(...top[1]);
    line(l1x, l1y, r1x, r1y, '#f5d327', 2);
    for (const [x, y] of top){ const [ax, ay] = toScreen(x, y, BAR), [zx, zy] = toScreen(x, y, BAR + 6.5); line(ax, ay, zx, zy, '#f5d327', 2); }
  }
  function line(x0, y0, x1, y1, col, w = 1){
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n) - (w >> 1), Math.round(y0 + (y1 - y0) * i / n) - (w >> 1), w, w);
  }
  function dotted(pts, col, gap = 3){
    ctx.fillStyle = col;
    let acc = 0;
    for (let i = 1; i < pts.length; i++){
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k < n; k++){ if (acc++ % gap === 0) ctx.fillRect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1); }
    }
  }

  /* ---------- players and the ball ---------- */
  function player(G, p){
    const [sx, sy] = toScreen(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(sx - 4, sy - 1, 8, 2); ctx.fillRect(sx - 3, sy - 2, 6, 1);
    const away = p.team === 'def', cols = away ? G.cols.opp : G.cols.me;
    const moving = Math.hypot(p.vx, p.vy) > .6, frame = p.down ? 0 : moving ? 1 + Math.floor(p.step * 1.4) % 4 : 0;
    let view, flip = false;
    if (portrait) view = p.team === 'off' ? (p.vx < -.5 ? 'front' : 'back') : (p.vx > .5 ? 'back' : 'front');
    else { view = 'side'; flip = p.face < 0; }
    if (portrait && Math.abs(p.vy) > Math.abs(p.vx) + .5){ view = 'side'; flip = p.vy < 0; }
    const img = sprite(away ? 'o' + p.skin : 'm' + p.skin, { ...cols, s: p.skin }, view, frame, flip, p.down);
    const big = p.role === 'OL' || p.role === 'DL';
    ctx.drawImage(img, sx - (img.width >> 1), sy - img.height + 1, img.width + (big && !p.down ? 1 : 0), img.height);
    if (p.stun > 0 && !p.down){ ctx.fillStyle = '#ffd84a'; const a = t * 8; ctx.fillRect(sx + Math.round(Math.cos(a) * 4), sy - 14 + Math.round(Math.sin(a) * 1.5), 1, 1); ctx.fillRect(sx - Math.round(Math.cos(a) * 4), sy - 14 - Math.round(Math.sin(a) * 1.5), 1, 1); }
  }
  function ball(G){
    const P = G.play, b = P.ball;
    if (b.state === 'held' && b.holder && !b.holder.down) return;
    const [gx, gy] = toScreen(b.x, b.y), [sx, sy] = toScreen(b.x, b.y, b.z);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(gx - 1, gy - 1, 3, 1);
    ctx.fillStyle = '#101010'; ctx.fillRect(sx - 2, sy - 2, 5, 4);
    ctx.fillStyle = '#8b4a1c'; ctx.fillRect(sx - 1, sy - 1, 3, 2);
    ctx.fillStyle = '#fff'; if (Math.floor(t * 20) % 2) ctx.fillRect(sx, sy - 1, 1, 1);
  }

  /* ---------- overlays ---------- */
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
      const sp = pts.map(([x, y]) => toScreen(x, y));
      dotted(sp, 'rgba(255,240,170,.8)', 3);
      const [ex, ey] = sp[sp.length - 1]; ctx.fillStyle = 'rgba(255,240,170,.95)'; ctx.fillRect(ex - 1, ey - 1, 3, 3);
    }
  }
  function labels(G){
    const P = G.play;
    for (const r of P.rec){
      if (r.routeName === 'block' && P.t < 1) continue;
      const d = Math.min(...P.def.map(x => Math.hypot(x.x - r.x, x.y - r.y)));
      const col = d > 3 ? '#4cff7a' : d > 1.6 ? '#ffd84a' : '#ff5a4e';
      const [sx, sy] = toScreen(r.x, r.y);
      ctx.fillStyle = col; ctx.fillRect(sx - 4, sy + 1, 9, 1); ctx.fillRect(sx - 3, sy + 2, 7, 1);
      ctx.fillStyle = '#101010'; ctx.fillRect(sx - 4, sy - 25, 9, 9);
      ctx.fillStyle = col; ctx.fillRect(sx - 3, sy - 24, 7, 7);
      drawText(ctx, String(r.num), sx - 2, sy - 24, { color: '#101010', scale: 1 });
    }
  }
  function aimArc(G, aim){
    const P = G.play, q = P.qb, d = Math.hypot(aim.x - q.x, aim.y - q.y), h = Math.max(.6, d * .17), pts = [];
    for (let i = 0; i <= 24; i++){ const s = i / 24; pts.push(toScreen(q.x + (aim.x - q.x) * s, q.y + (aim.y - q.y) * s, 1.8 - .6 * s + 4 * h * s * (1 - s))); }
    dotted(pts, '#ffffff', 2);
    const [tx, ty] = toScreen(aim.x, aim.y);
    ctx.fillStyle = '#fff';
    for (let a = 0; a < 16; a++){ const r = 5 + Math.sin(t * 8) * .6; ctx.fillRect(Math.round(tx + Math.cos(a / 16 * Math.PI * 2) * r), Math.round(ty + Math.sin(a / 16 * Math.PI * 2) * r * .55), 1, 1); }
    ctx.fillRect(tx, ty, 1, 1);
  }
  /* The running back glows before and just after the snap: tap him to hand off (ring at his feet, under the
     sprites; arrow above his head, over them). */
  function handoffRing(G){
    const rb = G.play.rb, [sx, sy] = toScreen(rb.x, rb.y), pulse = (Math.sin(t * 7) + 1) / 2;
    const rx = 7 + Math.round(pulse * 2), ry = 3 + Math.round(pulse);
    ctx.fillStyle = `rgba(125,249,255,${.55 + pulse * .45})`;
    for (let a = 0; a < 28; a++){ const th = a / 28 * Math.PI * 2; ctx.fillRect(Math.round(sx + Math.cos(th) * rx), Math.round(sy + Math.sin(th) * ry), 1, 1); }
  }
  /* The running back glows before and just after the snap: tap him to hand off. */
  function handoffMark(G){
    const rb = G.play.rb, [sx, sy] = toScreen(rb.x, rb.y), pulse = (Math.sin(t * 7) + 1) / 2;
    const b = Math.floor(t * 6) % 2;
    ctx.fillStyle = '#101010'; ctx.fillRect(sx - 3, sy - 19 - b, 7, 4);
    ctx.fillStyle = '#7df9ff'; ctx.fillRect(sx - 2, sy - 18 - b, 5, 1); ctx.fillRect(sx - 1, sy - 17 - b, 3, 1); ctx.fillRect(sx, sy - 16 - b, 1, 1);
  }
  function carrierMark(G){
    const c = G.play.carrier; if (!c || c.down) return;
    const [sx, sy] = toScreen(c.x, c.y), b = Math.floor(t * 6) % 2;
    ctx.fillStyle = '#101010'; ctx.fillRect(sx - 3, sy - 19 - b, 7, 4);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(sx - 2, sy - 18 - b, 5, 1); ctx.fillRect(sx - 1, sy - 17 - b, 3, 1); ctx.fillRect(sx, sy - 16 - b, 1, 1);
  }
  function lines(G){
    const P = G.play, L = P ? P.los : G.los;
    rect(L - .12, 0, L + .12, FW, 'rgba(70,140,255,.85)');
    const fd = L + G.toGo;
    if (fd < 100 && !G.twoPt && !G.practice) rect(fd - .12, 0, fd + .12, FW, 'rgba(255,214,0,.9)');
  }
  function effects(P, dt){
    for (const f of P.fx){
      f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z = Math.max(0, f.z + f.vz * dt); f.vz -= 9 * dt;
      if (f.t > f.life) continue;
      const [sx, sy] = toScreen(f.x, f.y, f.z); ctx.fillStyle = f.c; ctx.fillRect(sx, sy, 1, 1);
    }
    P.fx = P.fx.filter(f => f.t <= f.life);
    for (const p of P.pops){
      p.t += dt; if (p.t > 1.3) continue;
      const [sx, sy] = toScreen(p.x, p.y);
      drawTextCentered(ctx, p.text, sx, sy - 30 - p.t * 14, { color: p.color, outline: '#101010' });
    }
    P.pops = P.pops.filter(p => p.t <= 1.3);
  }
  function kickOverlay(G){
    const K = G.kick, [bx, by] = toScreen(K.spotX, K.spotY);
    if (K.stage === 'aim' || K.stage === 'power'){
      const L = 14, ex = K.spotX + Math.cos(K.aim) * L, ey = K.spotY + Math.sin(K.aim) * L;
      const [ax, ay] = toScreen(ex, ey); line(bx, by, ax, ay, '#ffd84a', 1);
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(ax - 1, ay - 1, 3, 3);
      // Power meter beside the ball.
      const mx = bx + (portrait ? 14 : -4), my = by + (portrait ? -6 : 12);
      ctx.fillStyle = '#101010'; ctx.fillRect(mx - 1, my - 31, 6, 33);
      const hgt = Math.round((K.stage === 'power' ? K.power : 0) * 30);
      ctx.fillStyle = K.power > .92 ? '#ff5a4e' : '#4cff7a'; ctx.fillRect(mx, my - hgt, 4, hgt);
    }
    if (K.ball){
      const b = K.ball, [gx, gy] = toScreen(b.x, b.y), [sx, sy] = toScreen(b.x, b.y, b.z);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(gx - 1, gy, 3, 1);
      ctx.fillStyle = '#101010'; ctx.fillRect(sx - 2, sy - 2, 5, 4); ctx.fillStyle = '#8b4a1c'; ctx.fillRect(sx - 1, sy - 1, 3, 2);
    } else { ctx.fillStyle = '#8b4a1c'; ctx.fillRect(bx - 1, by - 2, 3, 2); }
  }
  function kickPlayers(G){
    // A holder and kicker, plus the line, for the field goal / extra point picture.
    const K = G.kick;
    const me = (x, y, face = 1) => ({ x, y, vx: 0, vy: 0, step: 0, face, team: 'off', role: 'X', skin: '#c68642', stun: 0, down: false });
    const them = (x, y) => ({ ...me(x, y, -1), team: 'def', role: 'DL', skin: '#8d5524' });
    const list = [me(K.spotX - .4, K.spotY - .8), me(K.spotX - (K.stage === 'flight' || K.stage === 'done' ? .5 : 2.5), K.spotY + .9)];
    for (const dy of [-4, -2.5, -1, 0, 1, 2.5, 4]) list.push({ ...me(K.spotX + 6.4, K.spotY + dy), role: 'OL' }, them(K.spotX + 7.6, K.spotY + dy * 1.05));
    list.sort((a, b) => toScreen(a.x, a.y)[1] - toScreen(b.x, b.y)[1]).forEach(p => player(G, p));
  }

  /* ---------- camera ---------- */
  function updateCamera(G, dt, aim){
    const P = G.play, K = G.kick;
    const long = (portrait ? H : W) / S, lat = (portrait ? W : H) / S;
    let fx, fy, ahead;
    if (K){ fx = (K.ball ? Math.max(K.spotX, Math.min(K.ball.x, 108)) : K.spotX) + long * .3; fy = K.ball ? (K.ball.y + MID) / 2 : (K.spotY + MID) / 2; ahead = 0; }
    else if (!P || !P.live && !P.result){ fx = (P ? P.los : G.los); fy = P ? P.b : G.y; ahead = long * (portrait ? .2 : .16); }
    else {
      const b = P.ball, foc = P.carrier || (b.state === 'air' ? { x: b.x, y: b.y } : P.qb);
      fx = foc.x; fy = foc.y; ahead = P.carrier ? long * .14 : canThrow(G) ? long * .24 : long * .1;
      if (aim) { fx = (P.qb.x + aim.x) / 2; fy = (P.qb.y + aim.y) / 2; ahead = long * .05; }
    }
    let tx = fx + ahead, ty = fy;
    // Near the goal line, frame the whole end zone with room to spare at the far edge, where the scoreboard sits
    // on a phone; for kicks, the uprights (which stand ~10 yards tall) too. The camera may look past the end line
    // into the stands to do it.
    const far = K ? 120 : 110;
    if (fx + long / 2 > 96) tx = Math.max(tx, far + long * .2 - long / 2);
    if (K) tx = Math.min(tx, K.spotX - 3 + long / 2);   // ...without losing the kicker off the near edge
    tx = long >= 128 ? 50 : clamp(tx, -13 + long / 2, 140 - long / 2);
    ty = lat >= FW + 14 ? MID : clamp(ty, lat / 2 - 7, FW + 7 - lat / 2);
    const k = Math.min(1, dt * (P?.live ? 5 : 3.2));
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }
  function snapCamera(G){ cam.x = G.los + ((portrait ? H : W) / S) * (portrait ? .2 : .16); cam.y = clamp(G.y, 0, FW); }

  function draw(G, dt, view = {}){
    t += dt;
    const key = G.me.id + G.opp.id;
    if (key !== teamsKey || !G.cols){ teamsKey = key; G.cols = { me: teamColors(G.me, false), opp: teamColors(G.opp, true) }; buildCrowd(G); logoImg = G.me.img || null; }
    updateCamera(G, dt, view.aim);
    const sh = cam.shake > 0 ? cam.shake : 0; cam.shake = Math.max(0, cam.shake - dt * 10);
    const ox = sh ? Math.round((Math.random() - .5) * sh * 2) : 0, oy = sh ? Math.round((Math.random() - .5) * sh * 2) : 0;
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    field(G);
    const P = G.play;
    if (G.kick){ kickPlayers(G); kickOverlay(G); goalposts(); ctx.setTransform(1, 0, 0, 1, 0, 0); return; }
    if (P){
      lines(G);
      if (!P.live && !P.result && view.routes) routes(G);
      if (P.live && canThrow(G) && !view.aim) labels(G);
      if (view.handoff && !P.carrier) handoffRing(G);
      const order = [...P.all].sort((a, b) => toScreen(a.x, a.y)[1] - toScreen(b.x, b.y)[1]);
      for (const p of order) player(G, p);
      ball(G);
      carrierMark(G);
      if (view.handoff && !P.carrier) handoffMark(G);
      if (view.aim) { labels(G); aimArc(G, view.aim); }
      effects(P, dt);
    }
    goalposts();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return {
    resize, draw, toWorld, toScreen, dragToWorld, snapCamera,
    shake(a){ cam.shake = Math.max(cam.shake, a); },
    get portrait(){ return portrait; }, get W(){ return W; }, get H(){ return H; }, S
  };
}
