/* ESPN play-by-play text, rewritten to read like a broadcast ticker: who did what, how far, and what it meant.
   Facts (down, distance, yards, turnover, score) come from ESPN's structured play fields; the text only supplies names. */
import { esc } from './util.js';

const NAME = String.raw`#\d+\s+([A-Z][\w'’.\-]*(?:,?\s(?:Jr\.?|Sr\.?|II|III|IV|V)(?=[\s,)]|$))?)`;
const N = s => new RegExp(s.replaceAll('NAME', NAME), 'i');
const DIR = String.raw`(?:(short|deep)\s+)?(left|right|middle)?`;

// "K.Lacy" -> "Lacy", "A.St. Brown" -> "St. Brown", "C.Dawn, Jr." -> "Dawn Jr."
const last = n => n ? n.replace(/^(?:[A-Z][a-z]?\.)+(?=\S)/, '').replace(',', '') : '';
const who = n => `<b>${esc(last(n))}</b>`;
const yd = n => `${n} yd${Math.abs(n) === 1 ? '' : 's'}`;
const titled = s => s.replace(/^[A-Za-z]{2,4}:\s*/, '').toLowerCase().replace(/(^|[\s:\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// The play's own yardage from the text; ESPN's statYardage folds in penalties and reads 0 on fumbles.
function gained(s){
  let x = /for (\d+) yards? (gain|loss)|for (?:a )?loss of (\d+)|for (\d+) yards?|for (no gain)/i.exec(s);
  return !x ? null : x[1] ? (x[2].toLowerCase() === 'loss' ? -x[1] : +x[1]) : x[3] ? -x[3] : x[4] ? +x[4] : 0;
}

/* ESPN text -> { line (html), yds?, tags[], kind } */
export function readPlay(p){
  const raw = String(p.text || '').trim();
  let t = raw.replace(/^\(\d+:\d+\)\s*/, '').replace(/^(?:No Huddle-?|Shotgun|Pistol|Under Center|-)+\s*/i, '');
  const tags = [], type = p.type || '', m = (re, s = t) => N(re).exec(s);
  if (/^End of (?:\d\w\w quarter|OT|game|regulation)/i.test(t) || /^End (?:Period|of Game|of Regulation)/i.test(type)) return { kind: 'break', line: esc(t.replace(/\.$/, '')), tags };
  let x;
  if ((x = /^Timeout ([^,]+)/i.exec(t))) return { kind: 'break', line: `Timeout · ${esc(x[1])}`, tags };

  // Split off the penalty tail so the play itself parses cleanly.
  const pi = t.search(/\bPENALTY\b/);
  const pen = pi >= 0 ? t.slice(pi) : '', body = (pi >= 0 ? t.slice(0, pi) : t).replace(/[,\s]+$/, '');
  const noPlay = /NO PLAY/i.test(pen) && !p.scoring;
  let line = '', kind = 'play', yds = null;

  const gain = () => gained(body) ?? p.yds;
  if ((x = m(String.raw`^NAME pass incomplete,?\s*spike`, body))) {
    line = `${who(x[1])} spikes it`; kind = 'dud';
  } else if ((x = m(String.raw`^NAME pass complete ${DIR}\s*to NAME`, body))) {
    line = `${who(x[1])} <i class="pl-to">→</i> ${who(x[4])}${x[2] || x[3] ? ` <span class="pl-sub">${esc([x[2], x[3]].filter(Boolean).join(' '))}</span>` : ''}`; yds = gain();
  } else if ((x = m(String.raw`^NAME pass incomplete,?\s*${DIR}(?:\s*to NAME)?`, body))) {
    const bu = m(String.raw`broken up by NAME`, body);
    line = `${who(x[1])} incomplete${x[4] ? ` to ${who(x[4])}` : ''}${bu ? ` <span class="pl-sub">broken up by ${esc(last(bu[1]))}</span>` : ''}`; kind = 'dud';
  } else if ((x = m(String.raw`^NAME pass intercepted by NAME`, body))) {
    const r = /return (\d+) yards?/i.exec(body);
    line = `${who(x[1])} picked off by ${who(x[2])}${r && +r[1] ? ` <span class="pl-sub">returned ${yd(+r[1])}</span>` : ''}`; tags.push(['bad', 'INT']);
  } else if ((x = m(String.raw`^NAME sacked`, body))) {
    const by = m(String.raw`\(NAME`, body);
    line = `${who(x[1])} sacked${by ? ` by ${who(by[1])}` : ''}`; yds = gain();
  } else if ((x = m(String.raw`^NAME (?:rush|run)\s+${DIR}`, body))) {
    line = `${who(x[1])} run${x[3] ? ` <span class="pl-sub">${esc(x[3])}</span>` : ''}`; yds = gain();
  } else if ((x = m(String.raw`^Kneel down by NAME`, body)) || /^kneel/i.test(body)) {
    line = 'Kneel down'; kind = 'dud';
  } else if ((x = m(String.raw`^NAME (punt|(?:onside )?kickoff|on-?side kick)(?: (\d+) yards?)?`, body))) {
    const ret = m(String.raw`NAME return (?:(\d+) yards?|for loss of (\d+))`, body), fc = m(String.raw`fair catch by NAME`, body);
    const end = /touchback/i.test(body) ? 'touchback' : fc ? 'fair catch' : /out of bounds/i.test(body) ? 'out of bounds' : /downed/i.test(body) ? 'downed' : null;
    const verb = /^punt/i.test(x[2]) ? 'punts' : /on-?side/i.test(x[2]) ? 'onside kick' : 'kicks off';
    line = `${who(x[1])} ${verb}${x[3] ? ` <span class="pl-sub">${yd(+x[3])}</span>` : ''}`
      + (ret ? ` · ${who(ret[1])} returns <span class="pl-sub">${ret[3] ? '−' + yd(+ret[3]) : yd(+ret[2])}</span>` : end ? ` · <span class="pl-sub">${end}</span>` : '');
    if (/blocked/i.test(body)) tags.push(['bad', 'BLOCKED']);
    kind = 'kick';
  } else if ((x = m(String.raw`^NAME field goal attempt from (\d+) yards?\s+(NO GOOD|GOOD)`, body))) {
    const good = x[3].toUpperCase() === 'GOOD';
    line = `${who(x[1])} <span class="pl-sub">${x[2]}-yd</span> field goal`; kind = 'kick';
    tags.push(good ? ['good', 'GOOD'] : ['bad', /blocked/i.test(body) ? 'BLOCKED' : 'NO GOOD']);
  } else if (/^PENALTY/i.test(t)) {
    kind = 'flag';
  } else {
    // Anything we don't recognise: keep ESPN's words but drop the clutter.
    line = esc(body.replace(/#\d+\s+/g, '').replace(/\((?:H|LS):[^)]*\)/g, '').replace(/\s*\([^)]*\)/g, '').replace(/,?\s*End Of Play/i, '').replace(/\s(?:to the|at) [A-Z][\w\-]*\s?\d+/g, '').replace(/\s+/g, ' ').trim());
    kind = 'other';
  }

  // Fumbles can ride on any play.
  if ((x = m(String.raw`(fumbled?|muffed) by NAME.*?recovered by (\S+)\s+NAME`, body))) {
    const lost = p.turnover || p.possessionChanged || /Opponent/i.test(type), what = /muff/i.test(x[1]) ? 'muffed' : 'fumble';
    line += ` · ${what}${lost ? `, recovered by ${who(x[4])}` : ', recovered'}`;
    if (lost) tags.push(['bad', 'FUMBLE']);
  }
  const td = p.scoring != null ? p.scoring && /TOUCHDOWN/.test(body) || /Touchdown/i.test(type) && p.scoring : /TOUCHDOWN/.test(body) && !/nullified/i.test(body);
  if (td) {
    tags.push(['score', 'TOUCHDOWN']);
    const pat = /(kick|pass|rush) attempt\s+(good|successful|failed|no good|missed|blocked)/i.exec(body);
    if (pat) tags.push([/good|successful/i.test(pat[2]) ? 'soft' : 'miss', pat[1].toLowerCase() === 'kick' ? 'XP' : '2PT']);
  } else if (/\bSAFETY\b/i.test(body) || /^Safety/i.test(type)) tags.push(['score', 'SAFETY']);
  else if (/1ST DOWN/i.test(body) && !noPlay) tags.push(['first', '1ST']);
  if (p.turnover && !tags.some(([c]) => c === 'bad')) tags.push(['bad', /TURNOVER ON DOWNS/i.test(body) ? 'ON DOWNS' : 'TURNOVER']);

  // The flag: what, on whom, and whether it wiped out the play.
  if (pen) {
    const f = /^PENALTY\s+(\S+)\s+(.+?)(?:\s*\(#|\s+\d+ yards?|\s+(?:declined|offsetting|enforced)|[,.]|$)/i.exec(pen);
    const pyd = /(\d+) yards? from/i.exec(pen), declined = /declined/i.test(pen), off = /offsetting/i.test(pen);
    const what = f ? `${esc(titled(f[2].trim()))} <span class="pl-sub">on ${esc(f[1])}${pyd && !declined ? ` · ${yd(+pyd[1])}` : ''}${declined ? ' · declined' : off ? ' · offsetting' : ''}</span>` : 'Penalty';
    const flag = `<span class="pl-flag" aria-label="Penalty">⚑</span> ${what}`;
    line = line && kind !== 'flag' ? (noPlay ? `<s class="pl-wiped">${line}</s> ${flag}` : `${line} <span class="pl-pen">${flag}</span>`) : flag;
    if (kind === 'flag' || noPlay) { kind = 'flag'; yds = null; tags.splice(0, tags.length, ...tags.filter(([c]) => c !== 'first')); if (/1ST DOWN/i.test(pen)) tags.push(['first', '1ST']); if (noPlay) tags.push(['soft', 'NO PLAY']); }
    if (declined && yds == null && kind !== 'flag') yds = p.yds;
  }
  return { kind, line, yds: Number.isFinite(yds) ? yds : null, tags };
}

/* A thumbnail field, offense driving left to right: where the snap was and where the ball ended up. */
function field(p, r){
  if (!Number.isFinite(p.y0) || p.y0 <= 0 || p.y0 >= 100 || !['play', 'dud', 'flag'].includes(r.kind)) return '';
  const a = 100 - p.y0, td = r.tags.some(([, l]) => l === 'TOUCHDOWN');
  const returned = td && (p.possessionChanged || p.turnover || /interception|fumble recovery \(opponent\)/i.test(p.type || ''));
  const b = Math.max(0, Math.min(100, td ? returned ? 0 : 100 : Number.isFinite(p.y1) && p.y1 > 0 ? 100 - p.y1 : a + (r.yds ?? 0)));
  const x = y => (100 + y * 10) / 12, lo = x(Math.min(a, b)), w = x(Math.max(a, b)) - lo; // yards -> % of a field with 10-yd end zones
  return `<span class="pl-fld" title="${esc(p.spot || '')}">${w ? `<i class="pl-seg${b < a ? ' loss' : ''}" style="left:${lo.toFixed(1)}%;width:${w.toFixed(1)}%"></i>` : ''}<i class="pl-ball" style="left:${x(b).toFixed(1)}%"></i></span>`;
}

/* One play as a ticker row: situation (down, field) | what happened + tags | yards (clock).
   opts.color: the offense's team color; opts.clock: show the game clock; opts.dot: a color dot before the play,
   for places with no drive header to say who has the ball. */
export function playHTML(p, opts = {}){
  const r = readPlay(p);
  if (r.kind === 'break') return `<span class="pl pl-break">${r.line}</span>`;
  const big = r.yds != null && Math.abs(r.yds) >= 20 && r.kind === 'play';
  const cls = [`pl-${r.kind}`, big && 'pl-big', r.tags.some(([, l]) => l === 'TOUCHDOWN') && 'pl-td', r.tags.some(([c]) => c === 'bad') && 'pl-lost',
    /^(?:3rd|4th)/.test(p.dd || '') && r.kind !== 'kick' && 'pl-money'].filter(Boolean).join(' ');
  const down = p.dd && r.kind !== 'kick' ? `<b class="pl-down">${esc(p.dd)}</b>` : '';
  const clk = opts.clock && p.clock && p.q <= 4 ? `<small>${esc(p.clock)}</small>` : '';  // overtime has no clock
  const dd = `<span class="pl-dd">${down}${field(p, r)}</span>`;
  const y = `<span class="pl-end">${r.yds == null ? '' : `<span class="pl-yd ${r.yds > 0 ? 'up' : r.yds < 0 ? 'down' : ''}">${r.yds > 0 ? '+' : r.yds < 0 ? '−' : ''}${Math.abs(r.yds)}</span>`}${clk}</span>`;
  const tags = r.tags.map(([c, l]) => ` <span class="pl-tag ${c}">${l}</span>`).join('');
  const dot = opts.dot ? `<i class="pl-dot" style="background:${esc(opts.dot)}"></i>` : '';
  const tc = opts.color || opts.dot;
  return `<span class="pl ${cls}"${tc ? ` style="--tc:${esc(tc)}"` : ''}>${dd}<span class="pl-main">${dot}${r.line}${tags}</span>${y}</span>`;
}
