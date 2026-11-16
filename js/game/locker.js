/* The Locker Room: design a team's uniforms. Every part takes any color (the team's own first, a curated palette, or
   a free pick), and the helmet, jersey, pants and socks each have styles: the helmet's finish, stripe and visor, the
   numbers' trim, sleeve and shoulder stripes, the pants stripe, sock bands. Presets are starting points. Each team can
   keep several kits and wear one; whoever that team plays, on the field and on its sideline (hdart.js reads it through
   setKitLookup), the kit is what it wears.
   Stored under `kits`: { [teamId]: { list: [{ id, name, c: {region: color}, s: {style: value} }], wear: id | 'road' | null } }. */
import { esc, store } from '../util.js';
import * as A from './hdart.js';

let ctx = null;            // { modal, teamInfo, allTeams, logoUrl, picker, back, icon }
let data = store.get('kits', {});
let team = null, sel = 'home', tab = 'helmet', slot = {}, mode = 'edit', naming = false, dirty = false, raf = 0, t0 = 0;
const save = () => store.set('kits', data);
const entry = id => (data[id] ||= { list: [], wear: null });

/* ---------- kits ---------- */
const COLORS = ['H', 'Y', 'W', 'M', 'J', 'N', 'U', 'T', 'S', 'P', 'Q', 'O', 'X', 'B', 'G'];
const STYLES = ['two', 'hs', 'fin', 'sl', 'sh', 'ps', 'sk', 'ns', 'vis'];
const VISOR = { smoke: '#2a2f38', gold: '#d8a830', ice: '#7fc8e8' };
/* The uniform the game would give a team without a kit, as a kit. */
function base(t, away){
  const u = A.uniform({ ...t, noKit: true }, away), c = {}, s = {};
  for (const k of COLORS) c[k] = u[k];
  for (const k of STYLES) s[k] = u[k];
  if (!u.stripe) s.hs = 'none';
  return { c, s };
}
const resolve = k => k && { c: { ...k.c, V: VISOR[k.s.vis] || '#2a2f38' }, s: k.s };
/* For hdart.js: the kit a team wears (or a draft being edited, or none). */
export function kitFor(t, away){
  if (!t || t.noKit) return null;
  if (t.kitDraft) return resolve(t.kitDraft);
  const e = data[t.id]; if (!e?.wear) return null;
  if (e.wear === 'road') return resolve(base(t, true));
  return resolve(e.list.find(k => k.id === e.wear));
}
/* The menu's shortcut in: a portrait of the player in what the team wears right now (its worn kit or home), cropped
   to helmet and shoulders, as an image (cached per uniform). */
const BUSTS = new Map();
export function bust(t){ return bustOf(A.uniform(t, false)) + EDIT; }
const EDIT = '<span class="pb-kitcap"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.2 1.8l3 3L5.5 13.5l-3.8.8.8-3.8z" fill="currentColor"/></svg>EDIT</span>';
function bustOf(uni){
  let url = BUSTS.get(uni.key);
  if (!url){
    const spr = A.getSprite({ uni, view: 'front', pose: 'set', c: 0, arms: 'hang', b: 0, run: null, num: 7, skin: '#8d5524', flip: false, lit: true, down: false });
    const S = 4, cw = 22, ch = 21, cv = document.createElement('canvas'); cv.width = cw * S; cv.height = ch * S;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(spr.cv, 0, 0, cw, ch, 0, 0, cw * S, ch * S);
    url = cv.toDataURL(); BUSTS.set(uni.key, url);
  }
  return `<img src="${url}" alt="">`;
}
export const wearing = id => { const e = data[id]; if (!e?.wear) return null; return e.wear === 'road' ? 'Road' : e.list.find(k => k.id === e.wear)?.name || null; };

/* ---------- presets (starting points) ---------- */
const BLACK = '#17181c', WHITE = '#f2f2ee', lum = h => { const [r, g, b] = A.hex(h); return (r * .299 + g * .587 + b * .114) / 255; };
const on = (c, bg) => Math.abs(lum(c) - lum(bg)) > .3 ? c : lum(bg) > .55 ? BLACK : WHITE;
const PRESETS = {
  home: { name: 'Home', make: t => base(t, false) },
  road: { name: 'Road', make: t => base(t, true) },
  blackout: { name: 'Blackout', make: t => { const k = base(t, false), a = t.color; Object.assign(k.c, { H: BLACK, W: a, M: BLACK, J: BLACK, N: on(a, BLACK), U: on(a, BLACK), T: a, S: a, P: BLACK, Q: a, O: BLACK, X: a, B: BLACK, G: BLACK }); Object.assign(k.s, { fin: 'matte', hs: 'single' }); return k; } },
  whiteout: { name: 'Whiteout', make: t => { const k = base(t, true), a = t.color; Object.assign(k.c, { H: WHITE, W: a, M: a, J: WHITE, N: on(a, WHITE), U: on(a, WHITE), T: a, S: a, P: WHITE, Q: a, O: WHITE, X: a, B: WHITE, G: WHITE }); return k; } },
  rush: { name: 'Color Rush', make: t => { const k = base(t, false), a = t.color, b = t.alt || WHITE; Object.assign(k.c, { H: a, W: b, M: a, J: a, N: on(b, a), U: on(b, a), T: b, S: b, P: a, Q: b, O: a, X: b, B: a, G: a }); Object.assign(k.s, { ns: 'outline' }); return k; } },
  throwback: { name: 'Throwback', make: t => { const k = base(t, false), a = t.color, b = t.alt && lum(t.alt) < .85 ? t.alt : '#c9a227'; Object.assign(k.c, { H: b, W: a, M: '#9a9ca2', J: a, N: WHITE, U: b, T: b, S: b, P: b, Q: a, O: a, X: b }); Object.assign(k.s, { hs: 'triple', sl: 'double', sh: 'loops', ps: 'double', sk: 'two', ns: 'outline', fin: 'gloss' }); return k; } },
  chrome: { name: 'Chrome', make: t => { const k = base(t, false); Object.assign(k.s, { fin: 'chrome', vis: 'smoke' }); return k; } }
};
const PAL = ['#f2f2ee', '#17181c', '#9aa1a9', '#4a4f57', '#c8102e', '#9e1b32', '#6b1f2a', '#f26522', '#d4a72c', '#ffcd00', '#00843d', '#154734', '#00807f', '#5bb3e6', '#0033a0', '#0b2240', '#4e2a84', '#e8508f', '#5c3a21', '#c9a227'];
function randomKit(t){
  const pool = [t.color, t.alt || WHITE, WHITE, BLACK, ...PAL], r = a => a[Math.floor(Math.random() * a.length)];
  const k = base(t, Math.random() < .3), main = r([t.color, t.color, BLACK, WHITE, t.alt || WHITE]), acc = r(pool.filter(c => Math.abs(lum(c) - lum(main)) > .25)) || WHITE;
  Object.assign(k.c, { H: r([main, acc, t.color, WHITE, BLACK]), W: acc, M: r([BLACK, acc, '#9a9ca2']), J: main, N: on(acc, main), U: r(pool), T: acc, S: acc, P: r([main, acc, WHITE, BLACK]), Q: acc, O: r([main, acc]), X: acc, B: r([BLACK, WHITE]), G: r([main, acc, BLACK]) });
  Object.assign(k.s, { hs: r(['none', 'single', 'wide', 'double', 'triple']), fin: r(['gloss', 'gloss', 'matte', 'chrome']), sl: r(['none', 'band', 'double']), sh: r(['none', 'none', 'loops', 'bars']), ps: r(['none', 'single', 'double', 'wide']), sk: r(['none', 'one', 'two']), ns: r(['plain', 'shadow', 'outline']), vis: r(['none', 'none', 'smoke', 'gold', 'ice']) });
  return k;
}

/* ---------- the screen ---------- */
export function init(c){ ctx = c; A.setKitLookup(kitFor); }
const cur = () => {
  if (sel === 'home' || sel === 'road') return { id: sel, name: PRESETS[sel].name, ...PRESETS[sel].make(team), builtin: true };
  return entry(team.id).list.find(k => k.id === sel) || null;
};
/* Editing Home or Road makes a copy to edit (the originals always stay). */
function editable(){
  const k = cur(); if (!k.builtin) return k;
  const e = entry(team.id), n = e.list.length + 1;
  const nk = { id: 'k' + Date.now().toString(36), name: `Custom ${n}`, c: { ...k.c }, s: { ...k.s } };
  e.list.push(nk); sel = nk.id; save(); return nk;
}
export function open(teamId){
  mode = 'edit'; naming = false;
  team = ctx.teamInfo(teamId); const e = entry(team.id);
  sel = e.wear && e.wear !== 'road' && e.list.some(k => k.id === e.wear) ? e.wear : e.wear === 'road' ? 'road' : e.list[0]?.id || 'home';
  draw(); start();
}
const SEG = {
  fin: [['gloss', 'Gloss'], ['matte', 'Matte'], ['chrome', 'Chrome']],
  two: [['solid', 'Solid'], ['two', 'Two-tone']],
  hs: [['none', 'None'], ['single', 'Single'], ['wide', 'Wide'], ['double', 'Double'], ['triple', 'Triple']],
  vis: [['none', 'None'], ['smoke', 'Smoke'], ['gold', 'Gold'], ['ice', 'Ice']],
  ns: [['plain', 'Plain'], ['shadow', 'Shadow'], ['outline', 'Outline']],
  sl: [['none', 'None'], ['band', 'One'], ['double', 'Two']],
  sh: [['none', 'None'], ['loops', 'Loops'], ['bars', 'Bars']],
  ps: [['none', 'None'], ['single', 'Single'], ['double', 'Double'], ['wide', 'Wide']],
  sk: [['none', 'None'], ['one', 'One'], ['two', 'Two']]
};
/* Each part: its color slots (shown only when they show on the uniform) and its style choices. */
const TABS = {
  helmet: { name: 'Helmet', slots: k => [['H', 'Shell'], k.s.hs !== 'none' && ['W', 'Stripe'], k.s.two === 'two' && ['Y', 'Rear']], styles: [['hs', 'Stripe'], ['fin', 'Finish'], ['two', 'Shell'], ['vis', 'Visor']] },
  jersey: { name: 'Jersey', slots: k => [['J', 'Jersey'], ['N', 'Numbers'], k.s.ns === 'outline' && ['U', 'Outline'], k.s.sl !== 'none' && ['T', 'Sleeves'], k.s.sh !== 'none' && ['S', 'Shoulders']], styles: [['ns', 'Numbers'], ['sl', 'Sleeve stripes'], ['sh', 'Shoulder stripes']] },
  pants: { name: 'Pants', slots: k => [['P', 'Pants'], k.s.ps !== 'none' && ['Q', 'Stripe']], styles: [['ps', 'Stripe']] },
  socks: { name: 'Socks', slots: k => [['O', 'Socks'], k.s.sk !== 'none' && ['X', 'Bands'], ['B', 'Cleats'], ['G', 'Gloves']], styles: [['sk', 'Bands']] }
};
/* One palette for the selected slot: the team's colors first, a curated set, and any color at all. */
function palette(k, reg){
  const now = (k.c[reg] || '').toLowerCase(), own = [team.color, team.alt].filter(Boolean).map(x => x.toLowerCase());
  const list = [...new Set([...own, ...PAL])];
  return `<div class="lk-pal">${list.map((c, i) => `<button type="button" data-pb="lk-c" data-r="${reg}" data-v="${c}" class="${c === now ? 'on' : ''}${i < own.length ? ' own' : ''}" style="--s:${c}" aria-label="${c}"></button>`).join('')}
    <label class="lk-pick${list.includes(now) ? '' : ' on'}" style="--s:${now}" aria-label="Any color"><input type="color" value="${esc(now.length === 7 ? now : '#888888')}" data-lk-color="${reg}"></label></div>`;
}
const seg = (k, st) => `<div class="pb-seg lk-seg">${SEG[st].map(([v, l]) => `<button type="button" data-pb="lk-s" data-k="${st}" data-v="${v}" aria-pressed="${k.s[st] === v}">${l}</button>`).join('')}</div>`;
function editor(k){
  const T = TABS[tab], slots = T.slots(k).filter(Boolean);
  if (!slots.some(([r]) => r === slot[tab])) slot[tab] = slots[0][0];
  const on = slot[tab];
  return `<div class="lk-tabs">${Object.entries(TABS).map(([t, d]) => `<button type="button" data-pb="lk-tab" data-v="${t}" class="${t === tab ? 'on' : ''}">${d.name}</button>`).join('')}</div>
    <div class="lk-scroll">
      <div class="lk-card">
        <div class="lk-slots">${slots.map(([r, l]) => `<button type="button" data-pb="lk-slot" data-v="${r}" class="${r === on ? 'on' : ''}"><i style="--s:${esc(k.c[r])}"></i>${l}</button>`).join('')}</div>
        ${palette(k, on)}
      </div>
      <div class="lk-card lk-styles">${T.styles.map(([st, l]) => `<div class="lk-row"><span>${l}</span>${seg(k, st)}</div>`).join('')}</div>
      ${k.builtin ? '<p class="lk-note">Editing Home or Road saves your changes as a new kit.</p>' : naming
        ? `<div class="lk-card lk-renrow"><input class="pb-q lk-name" type="text" maxlength="18" value="${esc(k.name)}" data-lk-name autocomplete="off" aria-label="Kit name"><button type="button" data-pb="lk-ren">Done</button></div>`
        : `<div class="lk-links"><button type="button" data-pb="lk-ren">Rename</button><button type="button" data-pb="lk-dup">Duplicate</button><button type="button" data-pb="lk-del" class="lk-danger">Delete</button></div>`}
    </div>`;
}
/* "+ New": pick a starting look, each on a mini player. */
function newSheet(){
  const tiles = [...Object.entries(PRESETS).map(([p, d]) => [p, d.name, bustOf(A.uniform({ ...team, kitDraft: { name: d.name, ...d.make(team) } }, false))]), ['rand', 'Surprise me', '<span class="lk-die">🎲</span>']];
  return `<div class="lk-scroll"><div class="lk-newh"><b>Start a new kit from</b><button type="button" data-pb="lk-cancel">Cancel</button></div>
    <div class="lk-newgrid">${tiles.map(([p, n, img]) => `<button type="button" data-pb="lk-make" data-v="${p}"><span class="lk-mini">${img}</span><small>${esc(n)}</small></button>`).join('')}</div></div>`;
}
function draw(){
  const e = entry(team.id), k = cur(), x = ctx.icon.x;
  const wearId = e.wear || 'home', isWorn = wearId === sel;
  const chips = [['home', 'Home'], ['road', 'Road'], ...e.list.map(q => [q.id, q.name])];
  ctx.modal(`<div class="pb-setup lk" style="--c:${esc(team.color)}">
    <div class="pb-ph"><b>LOCKER ROOM</b><button type="button" class="lk-team" data-pb="lk-teams" aria-label="Change team">${team.logo ? `<img src="${esc(ctx.logoUrl(team.logo, 72))}" alt="">` : ''}<span>${esc(team.abbr || team.name)}</span><i>▾</i></button><button class="pb-x" type="button" data-pb="lk-close" aria-label="Back">${x}</button></div>
    <div class="lk-stage" aria-label="Uniform preview: drag to spin, tap to change the pose"><canvas class="lk-cv"></canvas>
      <div class="lk-tag" style="--c:${esc(team.color)}"><i></i><span><b>${esc(k.name)}</b><small>${esc(team.name)}</small></span></div>
      <span class="lk-hint${hintSeen ? ' seen' : ''}">${esc(ACTS[act][1])}</span></div>
    <div class="lk-kits">${chips.map(([id, n]) => `<button type="button" data-pb="lk-kit" data-v="${esc(id)}" class="${id === sel && mode === 'edit' ? 'on' : ''}">${id === wearId ? '<i class="lk-dot"></i>' : ''}${esc(n)}</button>`).join('')}<button type="button" data-pb="lk-new" class="lk-add${mode === 'new' ? ' on' : ''}" aria-label="New kit">+ New</button></div>
    ${mode === 'new' ? newSheet() : editor(k)}
    ${mode === 'new' ? '' : `<button class="pb-go lk-wear${isWorn ? ' worn' : ''}" type="button" data-pb="lk-wear">${isWorn ? `✓ WEARING ${esc(k.name).toUpperCase()}` : `WEAR ${esc(k.name).toUpperCase()}`}</button>`}
  </div>`, false, 'locker');
  bindStage();
  if (!hintSeen) setTimeout(() => { hintSeen = true; }, 2600);
}
/* ---------- the preview: a uniform reveal ----------
   The real game sprites under stadium light: the hero on a turf pedestal with your logo painted on it, turning like a
   turntable (squashing through each quarter turn, holding on each view), a lineman in his stance and a receiver
   showing his back number behind him. Spotlight beams, a backlight in the team color, dust in the light, the stadium's
   lights up top, a glint that sweeps across the uniform (and sparkles off chrome), the hero reflected in the floor.
   Drag to spin him, tap to change the pose. */
const ACTS = [['stand', 'Drag to spin · tap for poses'], ['run', 'Running'], ['throw', 'Throwing'], ['catch', 'Catching']];
const VIEW4 = [['front', false], ['side', false], ['back', false], ['side', true]];
let hintSeen = false, act = 0, spin = 0, spinBase = 0, autoT = 0, lastTs = 0, resumeSpin = true, drag = null, manualUntil = 0, logoImg = null, logoFor = null, motes = null;
const ease = x => x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
/* Auto turn, unhurried: a long hold on each view (the front longest), then a slow eased quarter turn. */
const HOLD = [5.5, 2.6, 4.2, 2.6], TURN = 1.1, LAP = HOLD.reduce((a, h) => a + h + TURN, 0);
const autoSpin = (t, q0 = 0) => {   // q0: the view it starts on (after a drag), so each view keeps its own hold
  let n = Math.floor(t / LAP) * 4, r = t % LAP;
  for (let i = 0; i < 4; i++){ const h = HOLD[(q0 + i) % 4]; if (r < h) return n; r -= h; if (r < TURN) return n + ease(r / TURN); r -= TURN; n++; }
  return n;
};
/* Turn the hero to his side view and hold it a moment (to show a helmet decal or a two-tone shell). */
function showSide(){ spin = Math.round(spin / 4) * 4 + 1; manualUntil = performance.now() + 3500; resumeSpin = true; }
function bindStage(){
  const st = document.querySelector('.lk-stage'); if (!st) return;
  st.addEventListener('pointerdown', e => { drag = { x: e.clientX, s: spin, moved: false, id: e.pointerId }; try{ st.setPointerCapture(e.pointerId); }catch{} });
  st.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 6) drag.moved = true; if (drag.moved) spin = drag.s - dx / 70; });
  const up = e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved){ act = (act + 1) % ACTS.length; const h = document.querySelector('.lk-hint'); if (h){ h.textContent = ACTS[act][1]; h.classList.remove('seen'); h.style.animation = 'none'; void h.offsetWidth; h.style.animation = ''; } }
    else { manualUntil = performance.now() + 2200; resumeSpin = true; }
    drag = null;
  };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
}
/* A sprite scaled up and squashed, optionally darkened (the ones further back) or swept by the glint. */
const off = document.createElement('canvas'), ox = off.getContext('2d');
function blit(x, spr, cx, fy, S, sx = 1, { dark = 0, sweep = null, flipY = false, alpha = 1 } = {}){
  const w = Math.max(1, Math.round(spr.cv.width * S)), h = Math.round(spr.cv.height * S);
  off.width = w; off.height = h; ox.imageSmoothingEnabled = false; ox.clearRect(0, 0, w, h);
  ox.drawImage(spr.cv, 0, 0, w, h);
  if (dark){ ox.globalCompositeOperation = 'source-atop'; ox.fillStyle = `rgba(6,8,14,${dark})`; ox.fillRect(0, 0, w, h); }
  if (sweep != null){ ox.globalCompositeOperation = 'source-atop'; const gx = sweep * (w + h) - h, g = ox.createLinearGradient(gx, 0, gx + h * .5, h * .5);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ox.fillStyle = g; ox.fillRect(0, 0, w, h); }
  ox.globalCompositeOperation = 'source-over';
  x.save(); x.globalAlpha = alpha; x.imageSmoothingEnabled = false;
  const ax = spr.ax * S, ay = spr.ay * S;
  x.translate(cx, fy); x.scale(sx, flipY ? -1 : 1);
  x.drawImage(off, Math.round(-ax), Math.round(-ay));
  x.restore();
}
let x = null;
function frame(ts){
  raf = requestAnimationFrame(frame);
  const cv = document.querySelector('.lk-cv'); if (!cv || !team) return;
  if (!t0) t0 = ts;
  const k = cur(); if (!k) return;
  const t = (ts - t0) / 1000, dpr = Math.min(3, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const dt = Math.min(.1, lastTs ? (ts - lastTs) / 1000 : 0); lastTs = ts;
  x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.imageSmoothingEnabled = false;
  const uni = A.uniform({ ...team, kitDraft: k }, false), tc = A.hex(team.color), rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  if (logoFor !== team.id){ logoFor = team.id; logoImg = null; if (team.logo){ const im = new Image(); im.onload = () => { logoImg = im; }; im.src = ctx.logoUrl(team.logo, 200); } }
  // Sky: the dark of the tunnel, the stadium's light banks up top.
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#05060a'); bg.addColorStop(.62, '#0e1117'); bg.addColorStop(1, '#07080b');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'lighter';
  for (const [bx, by] of [[W * .34, 14], [W * .66, 14]]){
    const gl = x.createRadialGradient(bx, by, 0, bx, by, 70); gl.addColorStop(0, 'rgba(255,248,225,.32)'); gl.addColorStop(1, 'rgba(255,248,225,0)'); x.fillStyle = gl; x.fillRect(bx - 70, by - 70, 140, 140);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++){ const fl = .75 + .25 * Math.sin(t * 3 + i * 1.7 + j); x.fillStyle = `rgba(255,252,236,${.85 * fl})`; x.beginPath(); x.arc(bx - 15 + i * 10, by - 4 + j * 8, 2.6, 0, Math.PI * 2); x.fill(); }
  }
  // The backlight, in the team's color, breathing.
  const cxm = W / 2, fy = H - 30, pulse = .85 + .15 * Math.sin(t * 1.6);
  const bl = x.createRadialGradient(cxm, fy - 80, 0, cxm, fy - 80, 150); bl.addColorStop(0, rgba(tc, .55 * pulse)); bl.addColorStop(.6, rgba(tc, .12)); bl.addColorStop(1, rgba(tc, 0));
  x.fillStyle = bl; x.fillRect(0, 0, W, H);
  // Two beams crossing on the pedestal, swaying a little.
  for (const s of [-1, 1]){
    const top = cxm + s * (W * .42) + Math.sin(t * .7 + s) * 10, g = x.createLinearGradient(top, 0, cxm, fy);
    g.addColorStop(0, 'rgba(255,250,235,.22)'); g.addColorStop(1, 'rgba(255,250,235,.02)');
    x.fillStyle = g; x.beginPath(); x.moveTo(top - 10, 0); x.lineTo(top + 10, 0); x.lineTo(cxm + s * -10 + 70, fy + 6); x.lineTo(cxm + s * -10 - 70, fy + 6); x.closePath(); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  // The floor: turf falling off into the dark, the pedestal with the logo painted on it and a rim in the team color.
  const fl = x.createLinearGradient(0, fy - 40, 0, H); fl.addColorStop(0, 'rgba(24,60,32,0)'); fl.addColorStop(.5, 'rgba(24,60,32,.55)'); fl.addColorStop(1, 'rgba(10,24,14,.9)');
  x.fillStyle = fl; x.fillRect(0, fy - 40, W, H);
  x.save(); x.beginPath(); x.ellipse(cxm, fy, 112, 22, 0, 0, Math.PI * 2); x.clip();
  const ped = x.createRadialGradient(cxm, fy - 6, 10, cxm, fy, 112); ped.addColorStop(0, '#3b8a45'); ped.addColorStop(1, '#173d1f'); x.fillStyle = ped; x.fillRect(cxm - 112, fy - 22, 224, 44);
  if (logoImg){ x.globalAlpha = .42; x.imageSmoothingEnabled = true; x.drawImage(logoImg, cxm - 36, fy - 11, 72, 22); x.imageSmoothingEnabled = false; x.globalAlpha = 1; }
  x.restore();
  x.strokeStyle = rgba(tc, .9); x.lineWidth = 2; x.beginPath(); x.ellipse(cxm, fy, 112, 22, 0, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; x.beginPath(); x.ellipse(cxm, fy - 1, 110, 21, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
  // The teammates behind: a lineman in his stance (left) and a receiver showing his number (right).
  const br = Math.floor(t * 1.3) % 2;
  const line = A.getSprite({ uni, view: 'side', pose: 'line', c: 0, arms: null, b: br, run: null, num: 74, skin: '#c68642', flip: false, lit: true, down: false });
  const wr = A.getSprite({ uni, view: 'back', pose: 'set', c: 0, arms: 'hang', b: 1 - br, run: null, num: 1, skin: '#5c3a21', flip: false, lit: true, down: false });
  blit(x, line, cxm - W * .3, fy - 16, 3, 1, { dark: .42 });
  blit(x, wr, cxm + W * .3, fy - 16, 3, 1, { dark: .42 });
  // The hero: the turntable (auto, or where you dragged it), and the pose.
  const now = performance.now();
  if (!drag && now > manualUntil){ if (resumeSpin){ resumeSpin = false; spinBase = Math.round(spin); autoT = 0; } autoT += dt; spin = spinBase + autoSpin(autoT, ((spinBase % 4) + 4) % 4); }
  else if (!drag) spin += (Math.round(spin) - spin) * Math.min(1, dt * 10);   // let go: settle on the nearest view
  const q = ((Math.round(spin) % 4) + 4) % 4, phi = spin - Math.round(spin), sq = Math.max(.18, Math.cos(phi * Math.PI));
  let [view, flip] = VIEW4[q];
  const a0 = ACTS[act][0], run = a0 === 'run' ? Math.floor(t * 12) % 8 : null;
  const arms = a0 === 'throw' ? 'throw' : a0 === 'catch' ? 'reach' : a0 === 'run' ? null : 'hang';
  if (a0 === 'throw' && view === 'back') view = 'front';   // the throw reads from the front and side
  const hero = A.getSprite({ uni, view, pose: 'set', c: 0, arms, b: a0 === 'stand' ? (Math.floor(t * 1.4) % 2) : 0, run, num: 7, skin: '#8d5524', flip, lit: true, down: false, ball: a0 === 'throw' ? 0 : a0 === 'run' && view !== 'back' ? 1 : 0 });
  const S = 4.4, bob = a0 === 'stand' ? Math.sin(t * 2) * 1.2 : 0;
  x.save(); x.beginPath(); x.ellipse(cxm, fy, 112, 22, 0, 0, Math.PI * 2); x.clip();
  blit(x, hero, cxm, fy + 2, S, sq, { flipY: true, alpha: .2 });   // the reflection
  x.restore();
  x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.ellipse(cxm, fy, 34 * sq + 8, 6, 0, 0, Math.PI * 2); x.fill();
  const sweep = ((t % 3.6) / 1.1); blit(x, hero, cxm, fy - 2 + bob, S, sq, { sweep: sweep <= 1 ? sweep : null });
  // Chrome throws a sparkle off the helmet.
  if (k.s.fin === 'chrome'){ const p = (t % 2.4) / .5; if (p < 1){ const sx = cxm - 9 * sq, sy = fy - hero.ay * S + 10 + bob, r = 9 * Math.sin(p * Math.PI);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = '#fff'; x.beginPath(); x.moveTo(sx, sy - r); x.lineTo(sx + r * .2, sy - r * .2); x.lineTo(sx + r, sy); x.lineTo(sx + r * .2, sy + r * .2); x.lineTo(sx, sy + r); x.lineTo(sx - r * .2, sy + r * .2); x.lineTo(sx - r, sy); x.lineTo(sx - r * .2, sy - r * .2); x.closePath(); x.fill(); x.globalCompositeOperation = 'source-over'; } }
  // Dust drifting up through the light.
  motes ||= Array.from({ length: 28 }, (_, i) => [Math.random(), Math.random(), .3 + Math.random() * .7, Math.random() * 6]);
  x.globalCompositeOperation = 'lighter';
  for (const m of motes){ const yy = (m[1] - t * .025 * m[2]) % 1, py = (yy < 0 ? yy + 1 : yy) * (fy - 10), px = cxm + (m[0] - .5) * 220 + Math.sin(t * .6 + m[3]) * 8; x.fillStyle = `rgba(255,246,220,${.35 * m[2] * (.6 + .4 * Math.sin(t * 2 + m[3]))})`; x.fillRect(px, py, 1.5, 1.5); }
  x.globalCompositeOperation = 'source-over';
  // Vignette.
  const vg = x.createRadialGradient(cxm, H * .55, H * .35, cxm, H * .55, W * .7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
}
function start(){ cancelAnimationFrame(raf); t0 = 0; lastTs = 0; resumeSpin = true; raf = requestAnimationFrame(frame); }
export function stop(){ cancelAnimationFrame(raf); raf = 0; if (dirty){ dirty = false; A.bumpKits(); } }
const changed = () => { dirty = true; save(); };

/* ---------- input ---------- */
export function click(a, b){
  const e = team && entry(team.id);
  switch (a){
    case 'lk-open': return open(b.dataset.id || team?.id);
    case 'lk-close': stop(); return ctx.back();
    case 'lk-teams': return ctx.picker(team.id);
    case 'lk-pickteam': return open(b.dataset.id);
    case 'lk-tab': tab = b.dataset.v; return draw();
    case 'lk-slot': slot[tab] = b.dataset.v; return draw();
    case 'lk-kit': sel = b.dataset.v; mode = 'edit'; naming = false; return draw();
    case 'lk-new': mode = mode === 'new' ? 'edit' : 'new'; return draw();
    case 'lk-cancel': mode = 'edit'; return draw();
    case 'lk-make': { const p = b.dataset.v, made = p === 'rand' ? randomKit(team) : PRESETS[p].make(team), nm = p === 'rand' ? `Custom ${e.list.length + 1}` : PRESETS[p].name;
      const taken = new Set(e.list.map(q => q.name)); let name = nm, i = 2; while (taken.has(name) || name === 'Home' || name === 'Road') name = `${nm} ${i++}`;
      const nk = { id: 'k' + Date.now().toString(36), name, c: made.c, s: made.s }; e.list.push(nk); sel = nk.id; mode = 'edit'; changed(); return draw(); }
    case 'lk-ren': naming = !naming; return draw();
    case 'lk-c': { const k = editable(); k.c[b.dataset.r] = b.dataset.v; changed(); return draw(); }
    case 'lk-s': { const k = editable(); k.s[b.dataset.k] = b.dataset.v;
      if (b.dataset.k === 'two') showSide();   // it shows from the side: turn him to it
      changed(); return draw(); }
    case 'lk-wear': e.wear = sel === 'home' ? null : sel; changed(); return draw();
    case 'lk-dup': { const k = cur(), nk = { id: 'k' + Date.now().toString(36), name: `${k.name} 2`.slice(0, 18), c: { ...k.c }, s: { ...k.s } }; e.list.push(nk); sel = nk.id; changed(); return draw(); }
    case 'lk-del': { naming = false; e.list = e.list.filter(k => k.id !== sel); if (e.wear === sel) e.wear = null; sel = e.list[0]?.id || 'home'; changed(); return draw(); }
  }
}
/* The free color pick: the preview follows as you drag; the row redraws when you let go. */
export function input(el, done){
  if (el.matches('[data-lk-name]')){ const k = cur(); if (k && !k.builtin && el.value.trim()){ k.name = el.value.trim().slice(0, 18); changed(); if (done) draw(); } return; }
  const reg = el.dataset.lkColor, k = editable();
  k.c[reg] = el.value; changed();
  const lab = el.closest('.lk-pick'); if (lab){ lab.style.setProperty('--s', el.value); lab.classList.add('on'); lab.parentElement.querySelectorAll('button.on').forEach(x => x.classList.remove('on')); }
  if (done) draw();
}

export const CSS = `
.pb.hd .lk{display:flex;flex-direction:column;gap:10px;height:calc(100dvh - var(--pb-top) - env(safe-area-inset-bottom,0px) - 8px);max-height:940px;overflow:hidden}
.pb.hd .lk > *{flex:none}
.pb.hd .lk .pb-ph{gap:8px}
.pb.hd .lk-team{display:flex;align-items:center;gap:7px;height:38px;padding:0 12px 0 4px;border:0;border-radius:19px;background:var(--hd-chip);color:#fff}
.pb.hd .lk-team img{width:30px;height:30px;padding:2px;border-radius:50%;background:#fff;object-fit:contain}
.pb.hd .lk-team span{font:800 16px/1 var(--hd-display);text-transform:uppercase}
.pb.hd .lk-team i{font-style:normal;font-size:10px;opacity:.6}
.pb.hd .lk-stage{position:relative;height:214px;border-radius:26px;overflow:hidden;background:#07080b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);touch-action:pan-y;cursor:grab;user-select:none;-webkit-user-select:none}
.pb.hd .lk-stage:active{cursor:grabbing}
.pb.hd .lk-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
.pb.hd .lk-tag{position:absolute;left:12px;top:12px;display:flex;align-items:stretch;gap:0;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none;animation:lkTag .5s cubic-bezier(.2,.9,.25,1) both}
.pb.hd .lk-tag i{width:5px;background:var(--c)}
.pb.hd .lk-tag span{display:grid;gap:2px;padding:5px 10px 4px 8px;background:rgba(8,10,14,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.pb.hd .lk-tag b{font:800 16px/1 var(--hd-display);text-transform:uppercase;color:#fff;letter-spacing:.01em}
.pb.hd .lk-tag small{font:700 9px/1 var(--hd-body);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55)}
@keyframes lkTag{from{transform:translateX(-14px);opacity:0}}

.pb.hd .lk-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);white-space:nowrap;padding:4px 9px 3px;border-radius:10px;background:rgba(0,0,0,.55);font:700 10px/1.2 var(--hd-body);letter-spacing:.06em;color:rgba(255,255,255,.8);text-transform:uppercase;pointer-events:none;animation:lkHint 2.6s ease forwards}
.pb.hd .lk-hint.seen{animation:none;opacity:0}
@keyframes lkHint{0%,70%{opacity:1}100%{opacity:0}}
.pb.hd .lk-kits{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -18px;padding:0 18px}
.pb.hd .lk-kits::-webkit-scrollbar{display:none}
.pb.hd .lk-kits button{flex:none;display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:0;border-radius:17px;background:var(--hd-chip);color:rgba(255,255,255,.85);font:600 13px var(--hd-body)}
.pb.hd .lk-kits button.on{background:#fff;color:#111}
.pb.hd .lk-kits .lk-add{background:transparent;box-shadow:inset 0 0 0 1px rgba(255,210,63,.45);color:var(--hd-yellow)}
.pb.hd .lk-kits .lk-add.on{background:var(--hd-yellow);color:#111;box-shadow:none}
.pb.hd .lk-dot{width:7px;height:7px;border-radius:50%;background:var(--hd-green)}
/* the parts: a segmented bar */
.pb.hd .lk-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;padding:3px;border-radius:16px;background:var(--hd-chip2)}
.pb.hd .lk-tabs button{height:34px;border:0;border-radius:13px;background:none;color:rgba(255,255,255,.6);font:800 15px/1 var(--hd-display);text-transform:uppercase;letter-spacing:.02em}
.pb.hd .lk-tabs button.on{background:rgba(255,255,255,.14);color:#fff}
.pb.hd .lk-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;margin:0 -18px;padding:2px 18px 14px;display:grid;align-content:start;gap:10px;scrollbar-width:none;overscroll-behavior:contain}
.pb.hd .lk-scroll::-webkit-scrollbar{display:none}
.pb.hd .lk-card{display:grid;gap:12px;padding:12px;border-radius:20px;background:var(--hd-chip2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
/* color: pick the part, then its color */
.pb.hd .lk-slots{display:flex;flex-wrap:wrap;gap:6px}
.pb.hd .lk-slots button{display:flex;align-items:center;gap:7px;height:32px;padding:0 12px 0 6px;border:0;border-radius:16px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);font:600 12.5px var(--hd-body)}
.pb.hd .lk-slots button i{width:20px;height:20px;border-radius:50%;background:var(--s);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.pb.hd .lk-slots button.on{background:#fff;color:#111}
.pb.hd .lk-slots button.on i{box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.pb.hd .lk-pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(26px,1fr));gap:8px 6px;justify-items:center}
.pb.hd .lk-pal button,.pb.hd .lk-pick{position:relative;width:26px;height:26px;padding:0;border:0;border-radius:50%;background:var(--s);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
.pb.hd .lk-pal button.own::after{content:"";position:absolute;left:50%;bottom:-6px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:rgba(255,255,255,.45)}
.pb.hd .lk-pal .on{box-shadow:0 0 0 2px #1d2025,0 0 0 4px var(--hd-yellow)}
.pb.hd .lk-pick{background:conic-gradient(#f44,#fd4,#4d6,#4cf,#46f,#d4f,#f44);cursor:pointer}
.pb.hd .lk-pick::before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--s);box-shadow:0 0 0 2px #1d2025}
.pb.hd .lk-pick input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}
/* styles */
.pb.hd .lk-styles{gap:12px}
.pb.hd .lk-row{display:grid;gap:7px}
.pb.hd .lk-row > span{font:700 10px/1 var(--hd-body);letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5)}
.pb.hd .lk-seg{display:flex;overflow-x:auto;scrollbar-width:none;padding:3px;border-radius:18px;background:rgba(0,0,0,.22)}
.pb.hd .lk-seg button{flex:1 0 auto;height:32px;padding:0 10px;border-radius:15px;font-size:13px}
.pb.hd .lk-note{margin:0;padding:0 4px;font:400 12px/1.4 var(--hd-body);color:rgba(255,255,255,.45)}
.pb.hd .lk-links{display:flex;justify-content:center;gap:4px}
.pb.hd .lk-links button{height:32px;padding:0 12px;border:0;border-radius:16px;background:none;color:rgba(255,255,255,.6);font:600 12.5px var(--hd-body)}
.pb.hd .lk-links .lk-danger{color:#ff7a70}
.pb.hd .lk-renrow{display:flex;gap:8px;padding:8px}
.pb.hd .lk-renrow .lk-name{flex:1;height:40px}
.pb.hd .lk-renrow button{height:40px;padding:0 16px;border:0;border-radius:20px;background:#fff;color:#111;font:700 13px var(--hd-body)}
/* + New: starting looks */
.pb.hd .lk-newh{display:flex;align-items:center;justify-content:space-between}
.pb.hd .lk-newh b{font:800 18px/1 var(--hd-display);text-transform:uppercase;color:#fff}
.pb.hd .lk-newh button{height:32px;padding:0 12px;border:0;border-radius:16px;background:var(--hd-chip);color:#fff;font:600 12.5px var(--hd-body)}
.pb.hd .lk-newgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pb.hd .lk-newgrid button{display:grid;justify-items:center;gap:6px;padding:8px 2px 9px;border:0;border-radius:18px;background:var(--hd-chip2);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);transition:transform .12s}
.pb.hd .lk-newgrid button:active{transform:scale(.95)}
.pb.hd .lk-mini{position:relative;display:grid;place-items:end center;width:56px;height:52px;border-radius:14px;overflow:hidden;background:radial-gradient(90% 70% at 50% 25%,color-mix(in srgb,var(--c) 50%,transparent),rgba(255,255,255,.04) 70%)}
.pb.hd .lk-mini img{width:58px;margin-bottom:-6px;image-rendering:pixelated;image-rendering:crisp-edges}
.pb.hd .lk-die{font-size:28px;align-self:center}
.pb.hd .lk-newgrid small{font:600 11.5px/1.15 var(--hd-body);text-align:center;color:rgba(255,255,255,.85)}
.pb.hd .lk-wear{margin-bottom:2px}
.pb.hd .lk-wear.worn{background:var(--hd-chip);color:#4be38f !important;box-shadow:inset 0 0 0 1.5px rgba(61,220,132,.5)}
.pb.hd .pb-tw{position:relative;display:grid}
.pb.hd .pb-kitbtn{position:absolute;top:10px;right:10px;width:52px;height:62px;padding:0;border:0;border-radius:15px;overflow:hidden;
  background:radial-gradient(90% 60% at 50% 22%,rgba(255,255,255,.32),rgba(255,255,255,.06) 70%),rgba(8,10,14,.34);
  box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.38),0 4px 12px rgba(0,0,0,.28);transition:transform .12s,box-shadow .12s}
.pb.hd .pb-kitbtn:active{transform:scale(.92)}
.pb.hd .pb-kitbtn img{position:absolute;left:50%;bottom:10px;width:56px;height:auto;transform:translateX(-50%);image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
/* a caption strip across the bottom of the frame: says what a tap does, inside the frame (never near the name) */
.pb.hd .pb-kitcap{position:absolute;left:0;right:0;bottom:0;z-index:1;display:flex;align-items:center;justify-content:center;gap:3px;height:16px;
  background:rgba(8,10,14,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font:800 8.5px/1 var(--hd-body);letter-spacing:.12em;color:#fff}
.pb.hd .pb-kitcap svg{width:8px;height:8px;opacity:.85}
.pb.hd .pb-kitbtn.on::after{content:"";position:absolute;top:5px;right:5px;z-index:2;width:8px;height:8px;border-radius:50%;background:var(--hd-green);box-shadow:0 0 0 2px rgba(8,10,14,.5)}
`;
