/* Sound for Coach Andre's Bowl: real recordings (audio/, made by scripts/sounds.py and picked in the sound lab),
   played with Web Audio. The context starts on the first tap, which browsers require.

   Signal flow: effects, music and the crowd each have a bus -> master -> a limiter -> speakers. Every clip in a slot
   is already normalized to that slot's loudness, so the levels here are the whole mix. Only one music cue (the War
   Chant, a fight song, "Charge!", a chant, the drumline) plays at a time, and the crowd ducks under it. */
let ac = null, master = null, fxBus = null, musicBus = null, crowdBus = null, on = true;
const clips = {};           // slot -> [AudioBuffer], filled as files arrive
const last = {};            // slot -> index played last, so a slot never repeats the same clip twice in a row
const DIR = new URL('../../audio/', import.meta.url);

export function initAudio(enabled){
  on = enabled;
  if (ac || !enabled) return;
  try{
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = .003; lim.release.value = .25;
    lim.connect(ac.destination);
    master = ac.createGain(); master.gain.value = .9; master.connect(lim);
    fxBus = ac.createGain(); fxBus.connect(master);
    musicBus = ac.createGain(); musicBus.connect(fxBus);
    crowdBus = ac.createGain(); crowdBus.connect(fxBus);
    buildVerb();
    load();
  }catch{ ac = null; }
}
export function setSound(enabled){
  on = enabled;
  if (enabled) initAudio(true);
  if (ac && fxBus) ramp(fxBus.gain, enabled ? 1 : 0, .05);
}
export const soundOn = () => on;
export function resume(){ if (ac?.state === 'suspended') ac.resume().catch(() => {}); }

/* Loading, in the order the game needs them. First the sounds of a play (whistle, snap, throw, catch, hit, kick:
   about 150 KB): once they're in, a play has every sound it needs ("ready"). Then the crowd's reactions (cheers,
   boos, groans: most of a megabyte, and no play can end in one for a few seconds). The long clips (music and the crowd beds, most of the megabytes) are different: decoded audio is
   raw samples, about 30 times the size of the file, so holding every one would take ~150 MB of memory. Instead each
   long slot keeps just the compressed bytes of one clip ready, decodes it when it's played, lets it go when it's
   done, and fetches another of its clips for next time. The two crowd beds stay decoded (they never stop). */
const LONG = /^(crowd|crowdhype|warchant|fsufight|band|defense|drumline|charge)$/;
const long = {};            // slot -> { files, next: Promise<ArrayBuffer|null>, nextF, lastF }
const beds = {};            // 'crowd' / 'crowdhype' -> AudioBuffer
const status = { want: 0, loaded: 0, failed: [], ready: false, done: false, missing: new Set() };
// The short effects jump the queue (a play needs them now); the long clips wait their turn behind everything else.
const bytes = (f, priority = 'low') => fetch(new URL(f, DIR), { priority }).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); });
function prepare(slot){
  const L = long[slot]; if (!L || L.next) return;
  const pool = L.files.length > 1 ? L.files.filter(f => f !== L.lastF) : L.files, f = pool[Math.floor(Math.random() * pool.length)];
  L.nextF = f; L.next = bytes(f).catch(() => { status.failed.push(f); return null; });
}
/* The prepared clip of a long slot, decoded; the slot starts fetching another for next time unless keep is false. */
async function take(slot, again = true){
  const L = long[slot]; if (!L) return null;
  prepare(slot);
  const p = L.next; L.lastF = L.nextF; L.next = null;
  const ab = await p;
  if (again) prepare(slot);
  if (!ab) return null;
  try{ return await ac.decodeAudioData(ab); }catch{ return null; }
}
async function load(){
  let man;
  try{ man = await (await fetch(new URL('manifest.json', DIR), { cache: 'no-cache', priority: 'high' })).json(); }catch{ status.failed.push('manifest.json'); status.done = true; return; }
  const shorts = Object.entries(man).filter(([s]) => !LONG.test(s)), longs = Object.entries(man).filter(([s]) => LONG.test(s));
  const inPlay = ([s]) => /^(whistle|hike|throw|catch|tackle|juke|kick|blip)$/.test(s);
  status.want = shorts.reduce((n, [, l]) => n + l.length, 0) + longs.length;
  const get = async (slot, f, priority) => {
    try{ (clips[slot] ||= []).push(await ac.decodeAudioData(await bytes(f, priority))); status.loaded++; }catch{ status.failed.push(f); }
  };
  await Promise.all(shorts.filter(inPlay).flatMap(([s, l]) => l.map(c => get(s, c.f, 'high'))));
  status.ready = true;
  await Promise.all(shorts.filter(x => !inPlay(x)).flatMap(([s, l]) => l.map(c => get(s, c.f, 'auto'))));
  for (const [s, l] of longs) long[s] = { files: l.map(c => c.f), next: null };
  // The crowd beds next (the stadium is on from the first snap), then one clip of each music slot, one at a time so
  // they never crowd out anything the game is downloading.
  await Promise.all(['crowd', 'crowdhype'].map(async s => { const b = await take(s, false); if (b){ beds[s] = b; status.loaded++; } }));
  for (const [s] of longs){
    if (beds[s]) continue;
    prepare(s);
    if (await long[s].next) status.loaded++;
  }
  status.done = true;
}
/* For the smoke test: what loaded, and any sound the game asked for (after loading) that had no clip. */
export const audioStatus = () => ({ ...status, missing: [...status.missing], playing: playing.size + (C ? C.beds.length : 0) });

/* The stadium around every sound: most effects are recorded close and dry, so each sends a little into a big open
   reverb (decaying noise that darkens as it fades, after a short pre-delay off the far stands). */
let verbIn = null;
function buildVerb(){
  const rate = ac.sampleRate, len = Math.floor(rate * 2.6), pre = Math.floor(rate * .03), ir = ac.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++){
    const d = ir.getChannelData(c); let y = 0;
    for (let i = pre; i < len; i++){
      const t = (i - pre) / rate, k = .7 - .62 * Math.min(1, t / 1.8);
      y += k * ((Math.random() * 2 - 1) - y);
      d[i] = y * Math.exp(-6.9 * t / 2.3) * Math.min(1, t / .01);
    }
  }
  const cv = ac.createConvolver(), ret = ac.createGain();
  cv.buffer = ir; ret.gain.value = .55;
  verbIn = ac.createBiquadFilter(); verbIn.type = 'highpass'; verbIn.frequency.value = 250;
  verbIn.connect(cv); cv.connect(ret); ret.connect(fxBus);
}

const now = () => ac.currentTime;
const rnd = (a, b) => a + Math.random() * (b - a);
function ramp(p, v, sec, t = now()){
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
  p.linearRampToValueAtTime(v, t + sec);
}
function pick(slot){
  const l = clips[slot]; if (!l?.length){ if (status.done) status.missing.add(slot); return null; }
  let i = Math.floor(Math.random() * l.length);
  if (l.length > 1 && i === last[slot]) i = (i + 1) % l.length;
  last[slot] = i;
  return l[i];
}
/* One clip from a slot. vary nudges its pitch a little so repeats don't sound copy-pasted. */
const play = (slot, o) => playBuf(pick(slot), o);
const playing = new Set();   // every clip started and not yet over, so leaving the game can stop them all
function playBuf(b, { vol = 1, at = 0, vary = .04, pan = 0, dest = fxBus, fadeIn = 0, verb = .15 } = {}){
  if (!b) return null;
  const t = now() + at, s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b; s.playbackRate.value = 1 + rnd(-vary, vary);
  if (fadeIn){ g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + fadeIn); } else g.gain.value = vol;
  let n = s; s.connect(g); n = g;
  if (pan && ac.createStereoPanner){ const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); n = p; }
  n.connect(dest);
  if (verb && verbIn){ const v = ac.createGain(); v.gain.value = verb; n.connect(v); v.connect(verbIn); }
  s.start(t);
  const c = { s, g, end: t + b.duration / s.playbackRate.value };
  playing.add(c); s.onended = () => playing.delete(c);
  return c;
}
/* Fades a playing clip out from time t (now by default) and stops it. */
function release(c, sec, t = now()){ if (c && c.end > t){ ramp(c.g.gain, 0, sec, t); c.s.stop(t + sec + .05); } }

/* The crowd's reactions (a cheer, boos, a groan, a gasp) flow into each other: a new one fades the last one out
   instead of cutting it off or piling on top of it, the way a gasp turns into boos. */
let react = null;
function reaction(slot, o = {}){
  release(react, .9, now() + (o.at || 0));
  const c = play(slot, { vary: .02, verb: .3, ...o });
  if (c) react = c;
}

/* Music: one cue at a time. A new cue fades out the one playing; the crowd ducks while it plays. Its clip is decoded
   when it's asked for (a fraction of a second, inside the delay most cues have anyway); if that runs well past the
   moment, the cue is dropped rather than played late. */
let cue = null, cueSeq = 0;
async function music(slot, { vol = .85, at = 0 } = {}){
  const asked = now(), me = ++cueSeq;
  const b = await take(slot);
  if (!b){ if (status.done) status.missing.add(slot); return; }
  const late = now() - asked;
  if (me !== cueSeq || late > at + 2) return;
  release(cue, 1.2);
  const c = playBuf(b, { vol, at: Math.max(0, at - late), vary: 0, dest: musicBus, fadeIn: .03, verb: .12 });
  if (!c) return;
  cue = c;
  if (crowdBus){ ramp(crowdBus.gain, .5, .4, now() + at); ramp(crowdBus.gain, 1, 1.5, Math.max(now() + at + .4, c.end - 1)); }
}
const musicPlaying = () => cue && cue.end > now();

/* Leaving the game: everything fades out together, including clips scheduled to start later (a boo after a gasp) and
   a music cue still being decoded (cueSeq makes it drop itself when it's ready). The crowd stops with them. */
export function silence(fade = .35){
  if (!ac) return;
  cueSeq++;
  for (const c of playing) release(c, fade);
  playing.clear(); cue = react = null;
  stopCrowd(fade);
}

/* Whose game it is, for the home band and Florida State's chant (pixelbowl.js binds it). */
let teams = () => null;
export function bindTeams(fn){ teams = fn; }
const fsuHome = () => String(teams()?.me?.id) === '52';

const FX = {
  whistle: () => play('whistle', { vol: .5, verb: .3 }),
  hike: () => play('hike', { vol: .65, verb: .1 }),
  throw: () => play('throw', { vol: .6, pan: -.1, verb: .08 }),
  catch: () => play('catch', { vol: .75, verb: .12 }),
  tackle: () => play('tackle', { vol: .85, verb: .2 }),
  juke: () => play('juke', { vol: .5, vary: .08, verb: .05 }),
  kick: () => play('kick', { vol: .8, verb: .3 }),
  blip: () => play('blip', { vol: .45, vary: 0, verb: 0 }),
  drop: () => reaction('aww', { vol: .7 }),
  miss: () => reaction('aww', { vol: .8 }),
  boo: () => reaction('boo', { vol: .75 }),
  turnover: () => { reaction('gasp', { vol: .8 }); reaction('boo', { vol: .45, at: 1.1, fadeIn: .8 }); },
  // A good moment for you: a stop, a pick, a made kick, a good practice rep.
  good: () => reaction('cheer', { vol: .65 }),
  first: () => reaction('firstdown', { vol: .8 }),
  td: () => reaction('cheer', { vol: 1 }),
  charge: () => music('charge'),
  // After your touchdown the band plays (Florida State's War Chant comes from drumsLate, on every FSU score).
  band: () => { if (!fsuHome()) music('band', { at: 1.6 }); },
  drums: () => music('drumline', { vol: .9 }),
  drumsLate: () => music('warchant', { at: 1.4 }),
  kickoff: () => { if (fsuHome()) music('warchant', { at: .2 }); else play('cheer', { vol: .7 }); },
  defense: () => music(fsuHome() ? 'warchant' : 'defense'),
  win: () => { music(fsuHome() ? 'fsufight' : 'band', { at: .4 }); reaction('cheer', { vol: .9 }); }
};

export function sfx(name){
  if (!on || !ac) return;
  resume();
  try{ FX[name]?.(); }catch{}
}

/* ---------- the crowd ----------
   Called every frame with the moment's level (about .05 quiet, .17 tense, up to .4 after a score; 0 when paused or
   in menus). Two real stadium beds loop underneath: a calm one, and an excited one that crossfades in as the level
   rises. At 0 both fade out and stop. */
let C = null, cl = 0, lastT = 0, lastCall = 0, watchdog = 0, nextDrums = 0;
function startCrowd(){
  // Both beds, once they've arrived (a moment after the short effects); until then the game is just quieter.
  if (!beds.crowd || !beds.crowdhype && !status.done){ if (status.done) status.missing.add('crowd'); return null; }
  const t = now(), started = [];
  for (const slot of ['crowd', 'crowdhype']){
    const b = beds[slot]; if (!b) continue;
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(crowdBus); s.start(t, rnd(0, b.duration));
    started.push({ slot, s, g });
  }
  return { beds: started };
}
function stopCrowd(fade){
  if (!C) return;
  const end = now() + fade;
  for (const b of C.beds){ ramp(b.g.gain, 0, fade); b.s.stop(end + .05); }
  C = null; cl = 0; clearInterval(watchdog); watchdog = 0;
}
export function crowd(level){
  if (!ac) return;
  lastCall = performance.now();
  const t = now(), target = on ? Math.max(0, Math.min(.5, +level || 0)) : 0;
  if (!C && target <= 0){ cl = 0; return; }
  if (t - lastT < .045 && C) return;
  const dt = Math.min(.25, Math.max(0, t - lastT)); lastT = t;
  if (!C){
    C = startCrowd(); if (!C) return;
    cl = 0;
    // If the game closes mid-play its loop just stops calling crowd(); notice that and fade out anyway.
    watchdog = setInterval(() => { if (performance.now() - lastCall > 600) stopCrowd(.5); }, 300);
  }
  // Crowds roar up fast and settle slowly; leaving the game (0) fades out in about a second and a half.
  const tau = target > cl ? .35 : target === 0 ? .3 : 1.6;
  cl += (target - cl) * (1 - Math.exp(-dt / tau));
  if (target === 0 && cl < .002) return stopCrowd(.06);
  const x = Math.min(1, cl / .4), live = Math.min(1, cl / .05);   // x: how excited; live: fades in from silence
  for (const b of C.beds) ramp(b.g.gain, live * (b.slot === 'crowd' ? .42 * (1 - .5 * x) : .6 * x * x), .08);
  // Now and then between plays, when nothing else is playing, the drumline plays a cadence across the stadium.
  if (target > 0 && x < .45 && t >= nextDrums){ if (nextDrums && !musicPlaying()) music('drumline', { vol: .45 }); nextDrums = t + rnd(35, 60); }
}
