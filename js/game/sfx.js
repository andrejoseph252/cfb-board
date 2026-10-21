/* Sound for Coach Andre's Bowl, synthesized with Web Audio (no audio files). The context starts on the first tap,
   which browsers require.

   Signal flow: every effect -> fx bus -> master -> a gentle compressor -> speakers, with a send into a synthetic
   stadium reverb. The crowd is its own graph (built on demand, torn down when it fades to silence), see crowd(). */
let ac = null, master = null, fxBus = null, verbIn = null, on = true, soft = null;
const B = {};   // noise buffers: white, pink, brown (stereo), env (slow random wobble), clap (applause)

export function initAudio(enabled){
  on = enabled;
  if (ac || !enabled) return;
  try{
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .22;
    comp.connect(ac.destination);
    master = ac.createGain(); master.gain.value = .9; master.connect(comp);
    fxBus = ac.createGain(); fxBus.connect(master);
    buildVerb();
    buildBuffers();
    // A soft pulse: odd harmonics falling off faster than a square wave, so the retro beeps aren't buzzy.
    const n = 16, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k += 2) im[k] = 1 / Math.pow(k, 1.6);
    soft = ac.createPeriodicWave(re, im);
  }catch{ ac = null; }
}
export function setSound(enabled){
  on = enabled;
  if (enabled) initAudio(true);
  if (ac && fxBus){ const p = fxBus.gain, t = ac.currentTime; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(enabled ? 1 : 0, t + .05); }
}
export const soundOn = () => on;
export function resume(){ if (ac?.state === 'suspended') ac.resume().catch(() => {}); }

/* ---------- buffers ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
// A looping buffer whose end crossfades into its start, so the loop point never clicks.
function loopBuf(chs, sec, gen, rate = ac.sampleRate, rms = .3){
  const n = Math.floor(sec * rate), F = Math.floor(rate * .08), b = ac.createBuffer(chs, n, rate);
  for (let c = 0; c < chs; c++){
    const s = gen(n + F, rate), d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = s[i];
    for (let i = 0; i < F; i++){ const w = i / F; d[i] = s[i] * Math.sqrt(w) + s[n + i] * Math.sqrt(1 - w); }
    let m = 0, q = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n;
    for (let i = 0; i < n; i++){ d[i] -= m; q += d[i] * d[i]; }
    const k = rms / Math.sqrt(q / n || 1); for (let i = 0; i < n; i++) d[i] *= k;
  }
  return b;
}
const white = n => { const s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = Math.random() * 2 - 1; return s; };
function pink(n){   // Paul Kellet's filter
  const s = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++){
    const w = Math.random() * 2 - 1;
    b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
    b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
    s[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362; b6 = w * .115926;
  }
  return s;
}
function brown(n){ const s = new Float32Array(n); let b = 0; for (let i = 0; i < n; i++){ b = (b + .02 * (Math.random() * 2 - 1)) / 1.02; s[i] = b; } return s; }
// Smoothed random motion (a few Hz), used to make noise "talk" like a crowd instead of hissing evenly.
function wobble(n, rate){
  const s = new Float32Array(n), a = Math.exp(-2 * Math.PI * 3.5 / rate); let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++){ y1 = a * y1 + (1 - a) * (Math.random() * 2 - 1); y2 = a * y2 + (1 - a) * y1; s[i] = y2; }
  return s;
}
// Applause: many short filtered hand claps at random times.
function claps(n, rate){
  const s = new Float32Array(n), per = rate / 30;
  for (let at = Math.random() * per; at < n; at += -Math.log(1 - Math.random()) * per){
    const f = rnd(900, 2600), w = 2 * Math.PI * f / rate, r = Math.exp(-w / (2 * 2.2)), c = 2 * r * Math.cos(w), amp = rnd(.3, 1);
    let y1 = 0, y2 = 0;
    for (let j = 0, L = Math.floor(rate * .04); j < L && at + j < n; j++){
      const e = Math.min(1, j / (rate * .0006)) * Math.exp(-j / (rate * .007));
      const y = (Math.random() * 2 - 1) * e + c * y1 - r * r * y2; y2 = y1; y1 = y;
      s[Math.floor(at) + j] += y * amp;
    }
  }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(s[i]));
  for (let i = 0; i < n; i++) s[i] = Math.tanh(3 * s[i] / pk);   // tame the rare pile-up of claps
  return s;
}
function buildBuffers(){
  B.white = loopBuf(1, 2, white);
  B.pink = loopBuf(2, 5, pink);
  B.brown = loopBuf(2, 6, brown);
  B.env = loopBuf(1, 9, wobble, 3000, 1);
  B.clap = loopBuf(2, 4, claps, ac.sampleRate, .25);
}
// Stadium reverb: decaying noise that darkens as it fades, after a short pre-delay.
function buildVerb(){
  const rate = ac.sampleRate, len = Math.floor(rate * 2.4), pre = Math.floor(rate * .022), ir = ac.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++){
    const d = ir.getChannelData(c); let y = 0;
    for (let i = pre; i < len; i++){
      const t = (i - pre) / rate, k = .75 - .65 * Math.min(1, t / 1.6);
      y += k * ((Math.random() * 2 - 1) - y);
      d[i] = y * Math.exp(-6.9 * t / 2.1) * Math.min(1, t / .006);
    }
  }
  const cv = ac.createConvolver(); cv.buffer = ir;
  verbIn = ac.createBiquadFilter(); verbIn.type = 'highpass'; verbIn.frequency.value = 220;
  const ret = ac.createGain(); ret.gain.value = .5;
  verbIn.connect(cv); cv.connect(ret); ret.connect(master);
}

/* ---------- building blocks ---------- */
const now = () => ac.currentTime;
// Attack, optional hold, exponential fall to -60 dB, then a last few ms to true zero: no clicks at either end.
function shape(p, t, vol, dur, a = .005, hold = 0){
  a = Math.min(a, dur * .5); hold = Math.min(hold, dur - a - .01);
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(vol, t + a);
  if (hold > 0) p.setValueAtTime(vol, t + a + hold);
  p.exponentialRampToValueAtTime(vol * .001, t + dur); p.linearRampToValueAtTime(0, t + dur + .012);
}
function route(node, { pan = 0, verb = 0, dest = fxBus } = {}){
  let n = node;
  if (pan && ac.createStereoPanner){ const p = ac.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(dest);
  if (verb){ const s = ac.createGain(); s.gain.value = verb; n.connect(s); s.connect(verbIn); }
}
function filt(type, freq, q = .7){ const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }

function tone(freq, dur, { type = 'soft', vol = .15, at = 0, a = .005, hold = 0, slide = null, slideT = null, vib = 0, vibRate = 5.5, lp = 0, pan = 0, verb = .12, dest } = {}){
  const t = now() + at, o = ac.createOscillator(), g = ac.createGain();
  if (type === 'soft') o.setPeriodicWave(soft); else o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + (slideT ?? dur));
  if (vib){ const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vibRate; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + .05); }
  shape(g.gain, t, vol, dur, a, hold);
  let n = o; if (lp){ const f = filt('lowpass', lp, .5); n.connect(f); n = f; }
  n.connect(g); route(g, { pan, verb, dest });
  o.start(t); o.stop(t + dur + .05);
}
function noise(dur, { buf = 'white', vol = .15, at = 0, a = .004, hold = 0, freq = 1000, q = 1, type = 'bandpass', sweep = null, sweepT = null, hp = 0, pan = 0, verb = .1, dest, rate = 1 } = {}){
  const t = now() + at, s = ac.createBufferSource(), f = filt(type, freq, q), g = ac.createGain(), b = B[buf];
  s.buffer = b; s.loop = true; s.playbackRate.value = rate;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + (sweepT ?? dur));
  shape(g.gain, t, vol, dur, a, hold);
  let n = s; if (hp){ const h = filt('highpass', hp); n.connect(h); n = h; }
  n.connect(f); f.connect(g); route(g, { pan, verb, dest });
  s.start(t, Math.random() * (b.duration - .1)); s.stop(t + dur + .05);
}
// A thump with a fast pitch drop: the body of every hit, kick and drum.
function thump(f0, f1, dur, { vol = .4, at = 0, drop = .05, pan = 0, verb = .12, dest } = {}){
  const t = now() + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + drop);
  o.frequency.exponentialRampToValueAtTime(f1 * .85, t + dur);
  shape(g.gain, t, vol, dur, .002);
  o.connect(g); route(g, { pan, verb, dest }); o.start(t); o.stop(t + dur + .05);
}
// Brass: two detuned saws through a low-pass that opens on the attack, like a horn's "blat".
function brass(f, dur, { vol = .06, at = 0, pan = 0, verb = .28, bright = 6 } = {}){
  const t = now() + at, g = ac.createGain(), lp = filt('lowpass', f * 1.5, 1.2);
  lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.exponentialRampToValueAtTime(Math.min(5000, f * bright), t + .035);
  lp.frequency.exponentialRampToValueAtTime(Math.min(3000, f * 2.5), t + dur);
  for (const d of [-7, 7]){ const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + .05); }
  shape(g.gain, t, vol, dur, .018, dur * .45);
  lp.connect(g); route(g, { pan, verb });
}
function snare(at, vol = .1){
  noise(.11, { vol, at, freq: 3200, q: .6, hp: 1200, verb: .2, a: .001 });
  tone(200, .06, { type: 'triangle', vol: vol * .7, at, slide: 160, verb: .1, a: .001 });
}

/* Crowd voices: a cluster of detuned, wavering voices through vowel formants, mixed with breathy noise. Several at
   different pitches read as a crowd's "ahh", "ohh" or "boo". */
const VOWEL = { ah: [[750, 5, 1], [1150, 7, .55], [2500, 9, .2]], oh: [[520, 5, 1], [860, 7, .5], [2450, 9, .12]],
  oo: [[320, 5, 1], [800, 7, .3], [2250, 9, .08]] };
function voices(dur, { n = 8, lo = 160, hi = 360, glide = 1, vowel = 'ah', vol = .1, at = 0, att = .12, lp = 3800, breath = .6, verb = .45, spread = .8, dest } = {}){
  const t = now() + at, sum = ac.createGain(), fo = ac.createGain(), low = filt('lowpass', lp, .5), g = ac.createGain();
  for (const [f, q, w] of VOWEL[vowel]){ const bp = filt('bandpass', f, q), k = ac.createGain(); k.gain.value = w * q * .5; sum.connect(bp); bp.connect(k); k.connect(fo); }
  fo.connect(low); low.connect(g);
  for (let i = 0; i < n; i++){
    const d = Math.random() * att * .8, f = lo * Math.pow(hi / lo, Math.random()), o = ac.createOscillator(), v = ac.createGain();
    const l = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * rnd(.96, 1), t + d);
    if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f * glide * rnd(.95, 1.05), t + dur * rnd(.55, .85));
    l.frequency.value = rnd(4.2, 6.8); lg.gain.value = f * rnd(.01, .025); l.connect(lg); lg.connect(o.frequency);
    v.gain.setValueAtTime(0, t + d); v.gain.linearRampToValueAtTime(1 / Math.sqrt(n), t + d + .06);
    o.connect(v);
    if (ac.createStereoPanner){ const p = ac.createStereoPanner(); p.pan.value = rnd(-spread, spread); v.connect(p); p.connect(sum); } else v.connect(sum);
    o.start(t + d); l.start(t + d); o.stop(t + dur + .05); l.stop(t + dur + .05);
  }
  const s = ac.createBufferSource(), sg = ac.createGain(); s.buffer = B.pink; s.loop = true; sg.gain.value = breath;
  s.connect(sg); sg.connect(sum); s.start(t, Math.random() * 4); s.stop(t + dur + .05);
  shape(g.gain, t, vol, dur, att, Math.max(0, dur - att - .5));
  route(g, { verb, dest });
}
function applause(dur, { vol = .2, at = 0, att = .15, verb = .4, dest } = {}){
  noise(dur, { buf: 'clap', vol, at, a: att, hold: dur * .3, type: 'highpass', freq: 500, q: .5, verb, dest, rate: rnd(.95, 1.05) });
}
function cheer(dur, vol = 1){
  voices(dur, { n: 10, lo: 190, hi: 440, glide: 1.12, vowel: 'ah', vol: .085 * vol, att: .1, verb: .5 });
  noise(dur * .9, { buf: 'pink', vol: .07 * vol, freq: 1100, q: .5, a: .12, hold: dur * .2, verb: .4 });
  applause(dur, { vol: .14 * vol, att: .2 });
}

/* ---------- the effects ---------- */
const FX = {
  // Referee's pea whistle: a pure tone warbled by the rattling pea, with a little breath.
  whistle(){
    const t = now(), dur = .42, o = ac.createOscillator(), g = ac.createGain(), am = ac.createGain(), l = ac.createOscillator(), fm = ac.createGain(), amd = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(2550, t); o.frequency.exponentialRampToValueAtTime(2800, t + .04);
    l.frequency.value = 34; fm.gain.value = 55; amd.gain.value = .3; am.gain.value = .7;
    l.connect(fm); fm.connect(o.frequency); l.connect(amd); amd.connect(am.gain);
    shape(g.gain, t, .085, dur, .015, dur - .1);
    o.connect(am); am.connect(g); route(g, { verb: .22 });
    o.start(t); l.start(t); o.stop(t + dur + .05); l.stop(t + dur + .05);
    noise(dur, { vol: .02, freq: 2800, q: 4, a: .015, hold: dur - .1, verb: .1 });
  },
  // The quarterback's "Hut!" and the snap.
  hike(){
    const t = now(), o = ac.createOscillator(), g = ac.createGain(), f1 = filt('bandpass', 640, 2), f2 = filt('bandpass', 1150, 3), k2 = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t + .012); o.frequency.exponentialRampToValueAtTime(118, t + .12);
    k2.gain.value = .5; o.connect(f1); o.connect(f2); f2.connect(k2); f1.connect(g); k2.connect(g);
    shape(g.gain, t + .012, .6, .11, .01, .03);
    route(g, { verb: .15 }); o.start(t + .012); o.stop(t + .17);
    noise(.05, { vol: .05, freq: 1800, q: 1, a: .006 });
    thump(110, 70, .08, { vol: .22, at: .02 });
  },
  throw(){
    noise(.32, { vol: .8, freq: 450, sweep: 2000, sweepT: .16, q: 1.4, a: .07, pan: -.15, verb: .08 });
    noise(.03, { vol: .12, type: 'highpass', freq: 2500, a: .002 });
  },
  catch(){
    noise(.05, { vol: 1, freq: 1300, q: .9, a: .001, verb: .1 });
    thump(240, 130, .07, { vol: .42 });
    tone(880, .12, { type: 'sine', vol: .08, at: .03 });
    tone(1320, .2, { type: 'sine', vol: .08, at: .09, verb: .2 });
  },
  // The ball bouncing away, and a soft "aww" tone.
  drop(){
    [[0, .2], [.16, .12], [.27, .06]].forEach(([at, v]) => { thump(190, 120, .07, { vol: v, at }); noise(.035, { vol: v * .25, freq: 900, at, a: .001 }); });
    tone(392, .3, { type: 'triangle', vol: .05, at: .05, slide: 262, lp: 1800 });
  },
  tackle(){
    thump(135, 45, .24, { vol: .5, drop: .1, verb: .15 });
    noise(.1, { vol: .3, type: 'lowpass', freq: 900, q: .6, a: .001 });
    noise(.03, { vol: .07, freq: 2300, q: 1, a: .001 });
  },
  juke(){
    noise(.15, { vol: 1.5, freq: 3000, sweep: 900, q: 1.5, a: .01, pan: .25 });
    tone(620, .08, { vol: .06, slide: 1100, lp: 3000 });
  },
  kick(){
    thump(170, 55, .16, { vol: .55, verb: .2 });
    noise(.025, { vol: .2, freq: 1600, q: 1.2, a: .001, verb: .15 });
    noise(.45, { vol: .045, freq: 900, sweep: 380, q: 1.2, a: .06, at: .03 });
  },
  good(){
    [523, 659, 784].forEach((f, i) => tone(f, .16, { vol: .075, at: i * .08, lp: 4000 }));
    tone(1047, .45, { vol: .075, at: .24, lp: 4000, hold: .1, verb: .2 }); tone(1319, .45, { type: 'triangle', vol: .04, at: .24, hold: .1 });
    cheer(1.6, .8);
  },
  miss(){
    [392, 330, 262].forEach((f, i) => tone(f, .24, { type: 'triangle', vol: .09, at: i * .15, lp: 2000, vib: i === 2 ? 6 : 0 }));
    voices(1.1, { n: 7, lo: 140, hi: 260, glide: .82, vowel: 'oh', vol: .07, at: .1, att: .15 });
  },
  first(){
    tone(784, .25, { type: 'sine', vol: .13 }); tone(1568, .12, { type: 'sine', vol: .025 });
    tone(1175, .4, { type: 'sine', vol: .13, at: .08, verb: .2 }); tone(2350, .16, { type: 'sine', vol: .025, at: .08 });
  },
  td(){
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { const last = i === 5, d = last ? .6 : .14; brass(f, d, { vol: .045, at: i * .1 }); brass(f / 2, d, { vol: .03, at: i * .1 }); });
    brass(659, .6, { vol: .04, at: .5 }); brass(784, .6, { vol: .035, at: .5 });
    thump(90, 50, .25, { vol: .15, at: .5, verb: .3 });
    cheer(2.6, 1);
  },
  boo(){
    voices(1.5, { n: 10, lo: 105, hi: 200, glide: .92, vowel: 'oo', vol: .16, att: .2, breath: .4 });
  },
  blip(){ tone(1100, .05, { type: 'sine', vol: .22, a: .003, verb: 0 }); tone(2200, .03, { type: 'sine', vol: .04, a: .002, verb: 0 }); },
  turnover(){
    brass(233, .2, { vol: .05 }); brass(175, .45, { vol: .05, at: .18, bright: 3 });
    voices(1.3, { n: 9, lo: 120, hi: 240, glide: .78, vowel: 'oh', vol: .1, at: .1, att: .15 });
  }
};

// The band, after your touchdown: a fight-song phrase on brass, snare on the off-beats, bass drum on the downbeats.
FX.band = () => {
  [392, 392, 523, 523, 659, 587, 523, 659, 784].forEach((f, i) => { const d = i === 8 ? .45 : .13; brass(f, d, { vol: .038, at: .5 + i * .14 }); brass(f * .75, d, { vol: .021, at: .5 + i * .14, pan: .3 }); });
  [0, .28, .56, .84, 1.12].forEach(a => snare(.5 + a + .14, .07));
  [0, .56, 1.12].forEach(a => thump(95, 52, .22, { vol: .2, at: .5 + a, verb: .25 }));
};

/* A drum cadence for Florida State moments: two bars of four on a deep tom, the first beat of each bar the loudest. */
function cadence(start){
  for (let i = 0; i < 8; i++){
    const at = start + i * .42, acc = i % 4 === 0, f = acc ? 118 : 96;
    thump(f * 1.7, f, .42, { vol: acc ? .26 : .17, at, drop: .035, verb: .3 });
    tone(f * 1.59, .14, { type: 'sine', vol: acc ? .045 : .03, at, a: .002, verb: .1 });
    noise(.03, { vol: acc ? .07 : .045, type: 'lowpass', freq: 1400, at, a: .001 });
  }
}
FX.drums = () => cadence(0);
FX.drumsLate = () => cadence(2.3);   // after the touchdown fanfare

export function sfx(name){
  if (!on || !ac) return;
  resume();
  try{ FX[name]?.(); }catch{}
}

/* ---------- the crowd ----------
   Called every frame with the moment's level (about .05 quiet, .17 tense, up to .4 after a score; 0 when paused or
   in menus). The stadium is a warm low rumble, two drifting walls of murmur (left and right) that rise and fall on
   their own, a brighter roar that only opens up on big moments, and now and then a distant clapper or a shout.
   At 0 it fades out completely and the graph is stopped. */
let C = null, cl = 0, lastT = 0, nextEvt = 0, lastCall = 0, watchdog = 0;
const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function setp(p, v, t){
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
  p.linearRampToValueAtTime(v, t + .08);
}
function buildCrowd(){
  const t = now(), srcs = [];
  const src = (buf, off) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, off); srcs.push(s); return s; };
  const out = ac.createGain(), wet = ac.createGain(), pre = ac.createGain(), evt = ac.createGain(), evtWet = ac.createGain(), preWet = ac.createGain();
  out.gain.value = 0; wet.gain.value = 0; evtWet.gain.value = .8; preWet.gain.value = .12;
  out.connect(master); wet.connect(verbIn); pre.connect(out); pre.connect(preWet); preWet.connect(wet);
  evt.connect(out); evt.connect(evtWet); evtWet.connect(wet);
  // The rumble: brown noise, stereo, kept under 400 Hz.
  const bed = ac.createGain(), bh = filt('highpass', 55), bl = filt('lowpass', 380, .5);
  src(B.brown, rnd(0, 5)).connect(bh); bh.connect(bl); bl.connect(bed); bed.connect(pre); bed.gain.value = .55;
  // The murmur: pink noise through two voice-like bands, its loudness wobbling a few times a second.
  const side = (pan, off) => {
    const f1 = filt('bandpass', 480, .8), f2 = filt('bandpass', 1150, 1.4), k2 = ac.createGain(), am = ac.createGain(), amd = ac.createGain(), sw = ac.createGain();
    const s = src(B.pink, off), e = src(B.env, rnd(0, 8));
    k2.gain.value = .45; am.gain.value = .7; amd.gain.value = .3; sw.gain.value = 1;
    s.connect(f1); s.connect(f2); f2.connect(k2); f1.connect(am); k2.connect(am); e.connect(amd); amd.connect(am.gain);
    am.connect(sw); let n = sw;
    if (ac.createStereoPanner){ const p = ac.createStereoPanner(); p.pan.value = pan; sw.connect(p); n = p; }
    n.connect(pre);
    return { g: sw.gain, v: 1, goal: 1, next: 0 };
  };
  const sides = [side(-.6, rnd(0, 2)), side(.6, rnd(2.5, 4.5))];
  // The roar: brighter, wider, and it gets brighter as it gets louder.
  const rf = filt('bandpass', 700, .55), rhs = filt('highshelf', 2500, .7), roar = ac.createGain(), ram = ac.createGain(), ramd = ac.createGain();
  rhs.gain.value = -6; ram.gain.value = .82; ramd.gain.value = .18; roar.gain.value = 0;
  src(B.pink, rnd(0, 4)).connect(rf); src(B.env, rnd(0, 8)).connect(ramd); ramd.connect(ram.gain);
  rf.connect(rhs); rhs.connect(ram); ram.connect(roar); roar.connect(pre);
  srcs[0].onended = () => { try{ out.disconnect(); wet.disconnect(); }catch{} };
  return { srcs, out, wet, evt, bed, sides, roar, rf };
}
// Something in the stands: one fan clapping, a couple of them, or a distant shout.
function crowdEvent(x){
  const r = Math.random(), dest = C.evt;
  if (r < .55){
    const people = r < .2 ? 2 : 1;
    for (let p = 0; p < people; p++){
      const per = rnd(.24, .34), k = 3 + Math.floor(Math.random() * 5), pan = rnd(-.8, .8), f = rnd(1100, 2100), at0 = rnd(0, .3);
      for (let i = 0; i < k; i++) noise(.05, { vol: rnd(2.2, 3.2) * (1 - i / (k + 2)), at: at0 + i * per + rnd(-.012, .012), freq: f, q: 1.6, a: .0008, pan, verb: 0, dest });
    }
  } else if (r < .8){
    voices(rnd(.6, .9), { n: 3, lo: 230, hi: 420, glide: rnd(1.15, 1.35), vowel: Math.random() < .5 ? 'oo' : 'ah', vol: .4, att: .08, lp: 1800, verb: 0, spread: .9, dest });
  } else {
    applause(rnd(1.2, 2), { vol: .25 + .25 * x, att: .3, verb: 0, dest });
  }
}
// Ramp to true zero and stop every source, so nothing keeps running once the crowd is silent.
function stopCrowd(fade){
  if (!C) return;
  const t = now(), end = t + fade;
  for (const p of [C.out.gain, C.wet.gain]){ if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); } p.linearRampToValueAtTime(0, end); }
  for (const s of C.srcs) s.stop(end + .05);
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
    C = buildCrowd(); cl = 0; nextEvt = t + rnd(1, 3);
    // If the game closes mid-play its loop just stops calling crowd(); notice that and fade out anyway.
    watchdog = setInterval(() => { if (performance.now() - lastCall > 600) stopCrowd(.5); }, 300);
  }
  // Crowds roar up fast and settle slowly; leaving the game (0) fades out in about a second and a half.
  const tau = target > cl ? .35 : target === 0 ? .3 : 1.6;
  cl += (target - cl) * (1 - Math.exp(-dt / tau));
  if (target === 0 && cl < .002) return stopCrowd(.06);
  const x = Math.min(1, cl / .42);
  const A = .47 * Math.pow(cl, .75);      // overall loudness: rises with the level, but gently
  setp(C.out.gain, A, t); setp(C.wet.gain, A, t);
  setp(C.bed.gain, .55 + .25 * x, t);
  for (const s of C.sides){              // each side drifts on its own between 0.65 and 1.25
    if (t >= s.next){ s.goal = rnd(.65, 1.25); s.next = t + rnd(1.5, 4.5); }
    s.v += (s.goal - s.v) * (1 - Math.exp(-dt / 1.4));
    setp(s.g, s.v * (1 - .35 * x), t);
  }
  setp(C.roar.gain, 1.8 * smooth(.3, .95, x), t);
  setp(C.rf.frequency, 650 + 950 * x, t);
  if (target > 0 && t >= nextEvt){ crowdEvent(x); nextEvt = t + rnd(2.2, 6) * (1 - .45 * x); }
}
