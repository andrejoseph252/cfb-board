/* Quarter recaps use the official line score. Drives belong to the quarter of their last play;
   scoring events use their own period, so a drive crossing a quarter cannot move points between periods. */
import { driveOutcome } from './drive-result.js';

const validQ = q => Number.isInteger(Number(q)) && Number(q) > 0 ? Number(q) : 0;
const opposite = side => side === 'home' ? 'away' : side === 'away' ? 'home' : null;
const at = (team, q) => {
  const v = team?.lines?.[q - 1];
  return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
};
export function driveNumbers(d){
  return {
    yards: Number.isFinite(d.yards) ? d.yards : /(-?\d+) yards?/.test(d.desc || '') ? Number(/(-?\d+) yards?/.exec(d.desc)[1]) : null,
    plays: Number.isFinite(d.playCount) ? d.playCount : /^(\d+) plays?/.test(d.desc || '') ? Number(/^(\d+) plays?/.exec(d.desc)[1]) : null,
    elapsed: d.elapsed || /,\s*(\d+:\d+)\s*$/.exec(d.desc || '')?.[1] || null
  };
}

export function quarterRecaps(g, drives){
  const rows = drives.map((d, i) => {
    const last = [...d.plays].reverse().find(p => validQ(p.q) && !/timeout|end (?:period|of)/i.test(p.type || ''));
    const q = d.active && g.state === 'in' ? Math.max(validQ(last?.q), validQ(d.q), validQ(g.period)) : validQ(last?.q) || validQ(d.q);
    return { d, i, q, key: String(d.id ?? d.plays[0]?.id ?? i), result: driveOutcome(d), numbers: driveNumbers(d) };
  });
  const current = Math.max(validQ(g.period), ...rows.map(r => r.q)) || Math.max(g.home?.lines?.length || 0, g.away?.lines?.length || 0);
  const events = [], seen = new Set();
  for (const row of rows){
    for (const [pi, p] of row.d.plays.entries()){
      const td = p.scoring && (p.scoreType === 'touchdown' || /touchdown/i.test(p.type || ''));
      const fg = p.scoring && (p.scoreType === 'field-goal' || /field goal good/i.test(p.type || ''));
      const safety = p.scoring && (p.scoreType === 'safety' || /safety/i.test(p.type || ''));
      const pick = !td && /interception|intercepted/i.test(p.type || '') && (p.turnover || p.possessionChanged);
      if (!td && !fg && !safety && !pick) continue;
      const key = p.id != null ? String(p.id) : `${row.key}:${pi}`; if (seen.has(key)) continue;
      seen.add(key);
      const conceded = safety || td && (row.result.conceded || p.possessionChanged || p.turnover || /intercept|fumble recovery \(opponent\)/i.test(p.type || ''));
      const side = conceded || pick ? opposite(p.side || row.d.side) : p.side || row.d.side;
      const intercepted = /intercept/i.test((p.type || '') + ' ' + (p.text || ''));
      const returned = td && conceded;
      const yards = Number.isFinite(p.yds) && p.yds > 0 ? p.yds : null;
      const kind = returned || safety ? 'defense' : td ? 'touchdown' : fg ? 'fieldgoal' : 'interception';
      const label = returned ? `${yards ? yards + '-yard ' : ''}${intercepted ? 'pick-six' : /fumble|sack/i.test(p.type || '') || /fumbl/i.test(p.text || '') ? 'fumble return TD' : 'defensive touchdown'}`
        : td ? `${row.numbers.yards > 0 ? row.numbers.yards + '-yard ' : ''}touchdown drive` : fg ? `${yards ? yards + '-yard ' : ''}field goal` : safety ? 'Safety' : 'Interception';
      events.push({ q: validQ(p.q) || row.q, side, kind, badge: returned ? 'DEF TD' : td ? 'TD' : fg ? 'FG' : safety ? 'SF' : 'INT',
        label, clock: p.clock || '', priority: returned ? 4 : td || safety ? 3 : pick ? 2 : 1, order: row.i * 1000 + pi, key: row.key });
    }
  }
  const periods = [...new Set([...Array.from({ length: current }, (_, i) => i + 1), ...rows.map(r => r.q)])].sort((a, b) => b - a);
  return periods.map(q => ({ q, rows: rows.filter(r => r.q === q), events: events.filter(e => e.q === q),
    points: { away: at(g.away, q), home: at(g.home, q) }, current: g.state === 'in' && q === current,
    complete: g.state === 'post' || q < current, halftime: /halftime/i.test(g.detail || '') }));
}
