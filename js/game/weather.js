/* Game conditions for Coach Andre's Bowl: the kickoff time (noon, afternoon, night) and the weather (clear, rain,
   snow, wind, fog), picked on the setup screen or rolled at random. drawhd.js and hdart.js paint them; sim.js reads
   `effects` so the weather plays as well as it looks, kept small on purpose: a wet ball is an edge, not a coin flip.
   `wind` is signed miles per hour across the field (+ toward y = 53.3), the same sense as a kick's crosswind. */

export const TIMES = { noon: { name: 'Noon', icon: '☀️' }, afternoon: { name: 'Afternoon', icon: '🌤️' }, night: { name: 'Night', icon: '🌙' } };
export const SKIES = { clear: { name: 'Clear', icon: '✨' }, rain: { name: 'Rain', icon: '🌧️' }, snow: { name: 'Snow', icon: '❄️' },
  wind: { name: 'Wind', icon: '💨' }, fog: { name: 'Fog', icon: '🌫️' } };

/* What each weather does on the field. catchR: yards added to the catch radius. acc: throw spread. deep: extra
   spread on lofted throws. fumble: fumble chance on a tackle. spd: everyone's speed. kick: field goal distance.
   td / to: the other team's simulated drives (touchdown and turnover odds). */
const NONE = { catchR: 0, acc: 1, deep: 1, fumble: 1, spd: 1, kick: 1, td: 1, to: 1 };
const FX = {
  clear: NONE,
  rain: { ...NONE, catchR: -.22, acc: 1.12, fumble: 2.2, spd: .97, kick: .94, td: .9, to: 1.3 },
  snow: { ...NONE, catchR: -.12, acc: 1.08, fumble: 1.6, spd: .9, kick: .88, td: .86, to: 1.2 },
  wind: { ...NONE, deep: 1.35, kick: .97, td: .95 },
  fog: { ...NONE, deep: 1.1, td: .97 }
};
export const effects = c => FX[c?.sky] || NONE;

// How hard it blows, in mph, by weather.
const WIND = { clear: [0, 8], rain: [4, 14], snow: [3, 12], wind: [15, 25], fog: [0, 4] };
// Degrees Fahrenheit, by weather, before the time of day.
const TEMP = { clear: [58, 82], rain: [46, 64], snow: [18, 31], wind: [44, 66], fog: [42, 58] };
export const TEMP_BY_TIME = { noon: 3, afternoon: 0, night: -7 };

const rnd = (a, b) => a + Math.random() * (b - a);
function pickW(weights){
  let tot = 0; for (const w of Object.values(weights)) tot += w;
  let r = Math.random() * tot; for (const [k, w] of Object.entries(weights)) if ((r -= w) < 0) return k;
  return Object.keys(weights)[0];
}

/* Conditions for a game. time / sky: a key, or 'random'. Random weather follows the calendar: no snow in September,
   a little in late October, more once it's November. */
export function roll(time = 'random', sky = 'random', date = new Date()){
  const m = date.getMonth(), late = m >= 10 || m <= 1, oct = m === 9 && date.getDate() >= 20;
  const t = TIMES[time] ? time : pickW({ noon: 3, afternoon: 4, night: 4 });
  const s = SKIES[sky] ? sky : pickW({ clear: 9, rain: 3, wind: 2, fog: 1.2, snow: late ? 1.8 : oct ? .5 : 0 });
  const [w0, w1] = WIND[s], [t0, t1] = TEMP[s];
  const wind = Math.round(rnd(w0, w1)) * (Math.random() < .5 ? -1 : 1);
  const temp = Math.round(rnd(t0, t1) + TEMP_BY_TIME[t]);
  return { time: t, sky: s, wind, temp, picked: { time, sky } };
}

/* A kick's crosswind: the game's wind, gusting a little. */
export const gust = c => c ? Math.round(c.wind + rnd(-3, 3) * (Math.abs(c.wind) > 4 ? 1 : .4)) : Math.round(rnd(-12, 12));

/* "Night · Rain · 52° · Wind 9 mph" */
export function describe(c){
  if (!c) return '';
  const w = Math.abs(c.wind);
  return [`${TIMES[c.time].icon} ${TIMES[c.time].name}`, `${SKIES[c.sky].icon} ${SKIES[c.sky].name}`, `${c.temp}°`, w ? `Wind ${w} mph` : 'Calm'].join(' · ');
}

/* ---------- for the screens: icons and short words ---------- */
/* One set of icons, drawn alike (32-unit box, round 2.2 strokes, flat color fills) so they sit together anywhere:
   cloud bodies take the CSS fill, outlines and wind / fog strokes take currentColor. */
const CLOUD = 'M10 26h13a5.5 5.5 0 0 0 .5-10.97A7.5 7.5 0 0 0 9.6 16.05 5 5 0 0 0 10 26z';
const ray = (cx, cy, r0, r1, angles) => angles.map(a => { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
  return `M${(cx + r0 * c).toFixed(1)} ${(cy + r0 * s).toFixed(1)}L${(cx + r1 * c).toFixed(1)} ${(cy + r1 * s).toFixed(1)}`; }).join('');
const cloud = (t = '') => `<path class="wc" d="${CLOUD}"${t ? ` transform="${t}"` : ''}/>`;
const SVG = {
  noon: `<circle class="ws" cx="16" cy="16" r="6.2"/><path class="wr" d="${ray(16, 16, 9.6, 13.2, [0, 45, 90, 135, 180, 225, 270, 315])}"/>`,
  afternoon: `<circle class="ws" cx="12" cy="12" r="5.2"/><path class="wr" d="${ray(12, 12, 7.8, 10.6, [135, 180, 225, 270, 315])}"/>${cloud('translate(3 2) scale(.9)')}`,
  night: `<path class="wm" d="M19.5 4A12 12 0 1 0 28 21.5 9.6 9.6 0 0 1 19.5 4z"/><path class="wk" d="M25 4.5c.4 2.2 1.2 3 3.4 3.4-2.2.4-3 1.2-3.4 3.4-.4-2.2-1.2-3-3.4-3.4 2.2-.4 3-1.2 3.4-3.4z"/>`,
  clear: `<path class="wk" d="M14 4c1 7 3 9 10 11-7 2-9 4-10 11-1-7-3-9-10-11 7-2 9-4 10-11z"/><path class="wk" d="M25 3c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4z"/>`,
  rain: `${cloud('translate(0 -6)')}<path class="wd" d="M11 23.5l-1.6 4.5M17 23.5l-1.6 4.5M23 23.5l-1.6 4.5"/>`,
  snow: `<path class="wf" d="${[0, 60, 120, 180, 240, 300].map(a => { const r = a * Math.PI / 180, p = (x, y) => `${(16 + x * Math.cos(r) - y * Math.sin(r)).toFixed(1)} ${(16 + x * Math.sin(r) + y * Math.cos(r)).toFixed(1)}`;
    return `M${p(0, 0)}L${p(0, -12)}M${p(-3.4, -9.6)}L${p(0, -6.6)}L${p(3.4, -9.6)}`; }).join('')}"/>`,
  wind: '<path class="ww" d="M3 11.5h14.5a3.8 3.8 0 1 0-3.8-3.8M3 17h21a3.8 3.8 0 1 1-3.8 3.8M3 22.5h9"/>',
  fog: `${cloud('translate(0 -7)')}<path class="ww" d="M5 22.5h22M9 27.5h15"/>`,
  dice: '<rect class="wx" x="5" y="5" width="22" height="22" rx="5.5"/><g class="wp"><circle cx="11" cy="11" r="2.1"/><circle cx="21" cy="11" r="2.1"/><circle cx="16" cy="16" r="2.1"/><circle cx="11" cy="21" r="2.1"/><circle cx="21" cy="21" r="2.1"/></g>'
};
/* An icon by key (a time, a weather, or 'dice'). */
export const icon = (k, cls = '') => `<svg class="wxi${cls ? ' ' + cls : ''}" viewBox="0 0 32 32" aria-hidden="true">${SVG[k] || ''}</svg>`;
/* The game's look in one mark: the weather, or the time of day when it's clear. */
export const mark = c => icon(c.sky === 'clear' ? c.time : c.sky);
/* A small arrow, turned with the CSS variable --r. */
export const ARROW = '<svg class="wxa" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5"/></svg>';
/* Which way the wind arrow points on screen: + blows to the right with the field upright (portrait), down with it sideways. */
export const windTurn = (c, portrait) => (c.wind > 0 ? 0 : 180) + (portrait ? 0 : 90);
export const TIME_LABEL = { noon: 'Noon kickoff', afternoon: 'Afternoon kickoff', night: 'Night game' };
/* What the weather does to play, in a few words. */
const PLAY = { clear: 'Clean conditions: no weather edge', rain: 'Slick ball: more drops and fumbles', snow: 'Slow footing, shorter kicks, loose ball',
  wind: 'Deep balls drift, kicks blow off line', fog: 'Deep balls are harder to place' };
export const playNote = c => c ? PLAY[c.sky] + (c.sky !== 'wind' && Math.abs(c.wind) >= 12 ? ' · crosswind on kicks' : '') : '';
