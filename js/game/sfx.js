/* Retro sound effects, synthesized with Web Audio (no audio files). The context starts on the first tap, which
   browsers require. */
let ac = null, master = null, on = true, noiseBuf = null;

export function initAudio(enabled){
  on = enabled;
  if (ac || !enabled) return;
  try{
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = .32; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }catch{ ac = null; }
}
export function setSound(enabled){ on = enabled; if (enabled) initAudio(true); }
export const soundOn = () => on;
export function resume(){ if (ac?.state === 'suspended') ac.resume().catch(() => {}); }

function tone(freq, dur, { type = 'square', vol = .5, at = 0, slide = null, vib = 0 } = {}){
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  if (vib){ const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 28; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, { vol = .4, at = 0, freq = 1200, q = 1, type = 'bandpass', sweep = null } = {}){
  const t = ac.currentTime + at, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(.04, dur / 3)); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
}

const FX = {
  whistle(){ tone(2900, .32, { type: 'sine', vol: .25, vib: 90 }); },
  hike(){ noise(.06, { vol: .5, freq: 900, q: 3 }); tone(180, .06, { vol: .2 }); },
  throw(){ noise(.28, { vol: .35, freq: 500, sweep: 2600, q: 2 }); },
  catch(){ tone(660, .07, { vol: .25 }); tone(990, .09, { vol: .25, at: .06 }); },
  drop(){ tone(330, .12, { vol: .2, slide: 160 }); },
  tackle(){ tone(110, .18, { type: 'sine', vol: .7, slide: 50 }); noise(.12, { vol: .35, freq: 400, q: .7 }); },
  juke(){ noise(.12, { vol: .3, freq: 1800, sweep: 600, q: 2 }); tone(520, .06, { vol: .15, slide: 780 }); },
  kick(){ tone(140, .12, { type: 'sine', vol: .8, slide: 60 }); noise(.05, { vol: .4, freq: 700 }); },
  good(){ [523, 659, 784, 1047].forEach((f, i) => tone(f, .14, { vol: .22, at: i * .09 })); noise(1.4, { vol: .25, freq: 900, q: .4, at: .1 }); },
  miss(){ [392, 330, 262].forEach((f, i) => tone(f, .2, { vol: .2, at: i * .14 })); },
  first(){ tone(784, .08, { vol: .2 }); tone(1175, .12, { vol: .2, at: .08 }); },
  td(){ [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .16, { vol: .24, at: i * .1 })); noise(2.4, { vol: .3, freq: 800, q: .35, at: .05 }); },
  boo(){ noise(1.2, { vol: .22, freq: 300, q: .5 }); tone(140, .5, { vol: .12, slide: 90 }); },
  blip(){ tone(880, .05, { vol: .15 }); },
  turnover(){ tone(220, .3, { vol: .25, slide: 110 }); noise(.9, { vol: .2, freq: 350, q: .5, at: .1 }); }
};

export function sfx(name){
  if (!on || !ac) return;
  resume();
  try{ FX[name]?.(); }catch{}
}
