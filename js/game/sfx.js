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
  // First down: the band's "da-da-DAH!" with a cymbal and a cheer.
  first(){
    [[0, .09], [.13, .09], [.26, .5]].forEach(([at, d], i) => { const top = i === 2; horn(mtof(top ? 77 : 72), d, { vol: .04, at, bright: 6 }); horn(mtof(top ? 72 : 69), d, { vol: .03, at, pan: .25 }); tuba(mtof(top ? 41 : 48), d, { vol: .045, at }); });
    cymbal(.26, .03, .9); bassDrum(.26, .14);
    cheer(1.2, .5);
  },
  td(){
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { const last = i === 5, d = last ? .7 : .13; horn(f, d, { vol: .045, at: i * .1, bright: 6 }); horn(f / 2, d, { vol: .03, at: i * .1, pan: .2 }); });
    horn(659, .7, { vol: .035, at: .5 }); horn(784, .7, { vol: .03, at: .5 }); tuba(131, .7, { at: .5 });
    bassDrum(.5, .2); cymbal(.5, .06, 1.8); roll(0, .45, .04);
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

/* ---------- the band ----------
   A marching band in synthesis: a brass section (a few players on each note, slightly apart in tune, the filter opening
   with the breath, vibrato settling in), sousaphones, a glockenspiel, and a drumline (snares, quads, bass drum,
   cymbals). Tunes are lists of [MIDI note or null for a rest, beats]. */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function horn(f, dur, { vol = .04, at = 0, pan = 0, verb = .32, bright = 5, n = 3 } = {}){
  const t = now() + at, g = ac.createGain(), lp = filt('lowpass', f * 1.2, 1.3);
  lp.frequency.setValueAtTime(f * 1.1, t); lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * bright), t + .05);
  lp.frequency.exponentialRampToValueAtTime(Math.min(3600, f * bright * .55), t + Math.max(.09, dur));
  for (let i = 0; i < n; i++){
    const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (i - (n - 1) / 2) * 8 + rnd(-3, 3);
    l.frequency.value = rnd(4.8, 5.8); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * .005, t + Math.min(.3, dur));
    l.connect(lg); lg.connect(o.frequency); o.connect(lp);
    o.start(t); l.start(t); o.stop(t + dur + .1); l.stop(t + dur + .1);
  }
  shape(g.gain, t, vol, dur + .06, .022, dur * .7);
  lp.connect(g); route(g, { pan, verb });
}
const tuba = (f, dur, o = {}) => horn(f, dur, { vol: .05, bright: 2.6, n: 2, verb: .18, ...o });
function glock(f, dur, { vol = .035, at = 0, pan = .3 } = {}){
  tone(f, Math.min(1.2, dur + .6), { type: 'sine', vol, at, a: .002, verb: .35, pan });
  tone(f * 4.07, .25, { type: 'sine', vol: vol * .25, at, a: .001, verb: .2, pan });
}
function bassDrum(at, vol = .26){ thump(88, 46, .38, { vol, at, drop: .05, verb: .3 }); noise(.05, { vol: vol * .2, type: 'lowpass', freq: 600, at, a: .001 }); }
function cymbal(at, vol = .05, dur = 1.4){ noise(dur, { vol, at, type: 'highpass', freq: 5200, q: .4, a: .003, verb: .35 }); noise(dur * .5, { vol: vol * .6, at, freq: 3600, q: .7, a: .003 }); }
function quad(f, at, vol = .12){ thump(f * 1.6, f, .2, { vol, at, drop: .03, verb: .22 }); }
function roll(at, dur, vol = .05){ for (let k = 0; k < dur / .045; k++) snare(at + k * .045, vol * (.55 + .45 * k / (dur / .045))); }
/* Plays a tune: fn(frequency, seconds, start) for each note. Returns its length in seconds. */
function play(tune, bpm, at, fn){
  const b = 60 / bpm; let x = at;
  for (const [m, beats] of tune){ if (m != null) fn(mtof(m), beats * b * .92, x); x += beats * b; }
  return x - at;
}
/* A crowd singing a tune on a vowel: many voices on each note, a little ragged. */
function chant(tune, bpm, at, { vowel = 'oh', vol = .09, n = 9 } = {}){
  return play(tune, bpm, at, (f, d, x) => voices(d + .08, { n, lo: f * .985, hi: f * 1.015, vowel, vol, at: x, att: .05, breath: .35, lp: 2600, verb: .5, spread: .9 }));
}

/* An original fight-song strain (the generic home band): melody on trumpets, an octave down on trombones,
   sousaphones on the roots, snare on 2 and 4, bass drum on 1 and 3, a crash at the top and the end. */
const FIGHT = [[65, 1], [65, .5], [67, .5], [69, 1], [65, 1], [70, 1.5], [69, .5], [67, 2], [65, 1], [67, .5], [69, .5], [70, 1], [72, 1], [74, 1], [72, 1], [70, 2]];
const FIGHT_BASS = [[46, 2], [41, 2], [51, 2], [46, 2], [46, 2], [41, 2], [46, 2], [46, 2]];
function fightSong(at = 0, vol = 1){
  const bpm = 150, b = 60 / bpm;
  play(FIGHT, bpm, at, (f, d, x) => { horn(f, d, { vol: .042 * vol, at: x, pan: -.15 }); horn(f / 2, d, { vol: .03 * vol, at: x, pan: .2, bright: 3.5 }); });
  play(FIGHT_BASS, bpm, at, (f, d, x) => tuba(f, d * .5, { vol: .05 * vol, at: x }));
  for (let k = 0; k < 16; k++){ if (k % 2 === 1) snare(at + k * b, .07 * vol); if (k % 2 === 0) bassDrum(at + k * b, .2 * vol); }
  roll(at + 14 * b, 2 * b, .06 * vol);
  cymbal(at, .045 * vol); cymbal(at + 16 * b, .06 * vol, 2);
  horn(mtof(70), 1.1, { vol: .045 * vol, at: at + 16 * b }); horn(mtof(65), 1.1, { vol: .035 * vol, at: at + 16 * b }); tuba(mtof(46), 1.1, { vol: .05 * vol, at: at + 16 * b });
  glock(mtof(82), .3, { vol: .03 * vol, at: at + 16 * b });
  return 17 * b;
}

/* Florida State's War Chant: the low "oh-oh-oh-oh-oh-oh" from the whole stadium on a minor tune, the Marching Chiefs'
   horns on the line with it and a deep tom on every beat. */
const WAR = [[64, 1], [64, .5], [64, .5], [64, .5], [64, .5], [62, .5], [64, .5]];
const WAR_HI = [[67, 1], [67, .5], [67, .5], [67, .5], [67, .5], [64, .5], [67, .5]];
function warChant(at = 0, { phrases = 4, vol = 1, horns = true } = {}){
  const bpm = 118, b = 60 / bpm, tune = [];
  for (let k = 0; k < phrases; k++) tune.push(...(k % 4 === 2 ? WAR_HI : WAR));
  chant(tune.map(([m, d]) => [m - 12, d]), bpm, at, { vowel: 'oh', vol: .11 * vol, n: 12 });
  if (horns) play(tune, bpm, at, (f, d, x) => { horn(f / 2, d, { vol: .03 * vol, at: x, bright: 3.2 }); horn(f, d, { vol: .018 * vol, at: x, pan: .25, bright: 3.5 }); });
  for (let k = 0; k < phrases * 4; k++){ const acc = k % 4 === 0; quad(acc ? 92 : 80, at + k * b, (acc ? .2 : .13) * vol); if (acc) bassDrum(at + k * b, .12 * vol); }
  return phrases * 4 * b;
}

/* "Charge!": the bugle call every stadium knows, and the crowd shouting it back. */
function charge(at = 0){
  [[67, .14], [72, .14], [76, .14], [79, .38], [76, .14], [79, .8]].reduce((x, [m, d]) => { horn(mtof(m), d, { vol: .045, at: x, bright: 7 }); horn(mtof(m - 12), d, { vol: .025, at: x, bright: 4 }); return x + d + .03; }, at);
  bassDrum(at + .5, .16); cymbal(at + 1.12, .045);
  voices(.55, { n: 12, lo: 170, hi: 300, glide: 1.08, vowel: 'ah', vol: .14, at: at + 1.75, att: .03, verb: .55 });
  applause(1.6, { vol: .12, at: at + 1.8, att: .1 });
}

/* The stadium's "Seven Nation Army" chant on a defensive stand, over the bass drum. */
const SNA = [[52, 1.5], [52, .5], [55, .75], [52, .75], [50, .5], [48, 2], [47, 2]];
function sevenNation(at = 0){
  const bpm = 124, b = 60 / bpm, len = chant(SNA, bpm, at, { vowel: 'oh', vol: .1, n: 12 });
  for (let k = 0; k < 8; k++) bassDrum(at + k * b, k % 2 ? .1 : .16);
  return len;
}

/* The drumline between plays: two bars of a street-beat cadence, heard from across the stadium. */
function drumline(at = 0){
  const b = 60 / 112, S = '1.1.1.11.1.1.1.11'.split(''), Q = [0, null, 1, null, 2, null, 1, 0, null, 2, null, 1, 2, 1, 0, null];
  for (let bar = 0; bar < 2; bar++) for (let k = 0; k < 16; k++){
    const x = at + (bar * 16 + k) * b / 4;
    if (S[k] === '1') snare(x, k % 4 === 0 ? .05 : .03);
    if (Q[k] != null) quad([150, 124, 104][Q[k]], x, .06);
    if (k % 8 === 0) bassDrum(x, .09);
  }
  roll(at + 7.5 * b, b * .5, .04); cymbal(at + 8 * b, .025, .8);
}

/* Whose game it is, for the home band and Florida State's chant (pixelbowl.js binds it). */
let teams = () => null;
export function bindTeams(fn){ teams = fn; }
const fsuHome = () => String(teams()?.me?.id) === '52';

// After your touchdown: the fight song (Florida State's comes from the War Chant after the fanfare: drumsLate).
FX.band = () => { if (!fsuHome()) fightSong(1.3, .9); };
// Florida State moments: the spear at midfield gets a drum cadence; a Florida State score, the War Chant.
FX.drums = () => { for (let k = 0; k < 8; k++){ const acc = k % 4 === 0; quad(acc ? 96 : 82, k * .42, acc ? .24 : .15); if (acc) bassDrum(k * .42, .14); } };
FX.drumsLate = () => warChant(2.1, { phrases: 4 });
// The opening kickoff: the home crowd's War Chant at Doak, a drum roll and a crash everywhere else.
FX.kickoff = () => { if (fsuHome()) warChant(.2, { phrases: 4, vol: .85 }); else { roll(0, 1.2, .05); cymbal(1.2, .05); bassDrum(1.2, .2); cheer(1.8, .6); } };
// Your key defensive stand: the War Chant if you're Florida State, the stadium chant otherwise.
FX.defense = () => { if (fsuHome()) warChant(.1, { phrases: 4, vol: .9, horns: false }); else sevenNation(.1); };
// A big gain: "Charge!".
FX.charge = () => charge(.15);
// A win: the fight song (or the War Chant) and a long ovation.
FX.win = () => { if (fsuHome()) warChant(.3, { phrases: 8 }); else fightSong(.3); cheer(3.5, .9); };

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
let C = null, cl = 0, lastT = 0, nextEvt = 0, lastCall = 0, watchdog = 0, nextDrums = 0;
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
  const A = .36 * Math.pow(cl, .75);      // overall loudness: rises with the level, but gently (the band carries the moments)
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
  // Now and then between plays the drumline plays a cadence across the stadium.
  if (target > 0 && x < .45 && t >= nextDrums){ if (nextDrums) drumline(.1); nextDrums = t + rnd(28, 46); }
}
