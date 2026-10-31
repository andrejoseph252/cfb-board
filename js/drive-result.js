/* Drive outcomes from the possession team's perspective. A scoring drive can end in an opponent's score.
   Prefer ESPN's drive result; scoring-play types fill in whether a generic touchdown was a return. */
export function driveOutcome(d){
  const raw = String(d.result || '').trim();
  const outcome = (kind, label, badge, extra = {}) => ({ kind, label, badge, ...extra });
  // Stream sync can deliberately hide a drive's eventual result. Never inspect later plays first.
  if (d.active || /in progress|current drive/i.test(raw)) return outcome('live', 'Drive in progress', 'LIVE');

  const score = [...(d.plays || [])].reverse().find(p => p.scoring);
  const type = score?.type || '';
  const touchdown = /touchdown|\bTD\b/i.test(raw) || (d.isScore && (score?.scoreType === 'touchdown' || /touchdown/i.test(type)));
  if (touchdown){
    if (/intercept|\bINT\b|pick[ -]?six/i.test(raw + ' ' + type))
      return outcome('defense', 'Pick-six', 'DEF TD', { conceded: true });
    if (/fumble/i.test(raw + ' ' + type) && !/fumble recovery \(own\)/i.test(type))
      return outcome('defense', 'Fumble return TD', 'DEF TD', { conceded: true });
    if (/blocked/i.test(raw + ' ' + type))
      return outcome('defense', 'Blocked kick return TD', 'DEF TD', { conceded: true });
    if (/punt return|kickoff return|kick return/i.test(raw + ' ' + type))
      return outcome('touchdown', /punt/i.test(raw + ' ' + type) ? 'Punt return TD' : 'Kick return TD', 'TD');
    return outcome('touchdown', 'Touchdown', 'TD');
  }
  if (/safety|^SF$/i.test(raw) || (d.isScore && score?.scoreType === 'safety'))
    return outcome('defense', 'Safety conceded', 'SAFETY', { conceded: true });
  if (/missed.*(?:FG|field goal)|(?:FG|field goal).*miss|no good/i.test(raw)) return outcome('miss', 'Field goal missed', 'MISS');
  if (/blocked.*(?:FG|field goal)|(?:FG|field goal).*blocked/i.test(raw)) return outcome('turnover', 'Field goal blocked', 'BLOCK');
  if (/field goal|^FG$/i.test(raw)) return outcome('fieldgoal', 'Field goal', 'FG');
  if (/intercept|^INT$/i.test(raw)) return outcome('turnover', 'Interception', 'INT');
  if (/fumble/i.test(raw)) return outcome('turnover', 'Fumble', 'FUM');
  if (/downs/i.test(raw)) return outcome('turnover', 'Turnover on downs', 'DOWNS');
  if (/blocked.*punt|punt.*blocked/i.test(raw)) return outcome('turnover', 'Punt blocked', 'BLOCK');
  if (/punt/i.test(raw)) return outcome('punt', 'Punt', 'PUNT');
  if (/end.*half/i.test(raw)) return outcome('end', 'End of half', 'HALF');
  if (/end.*(?:game|regulation)/i.test(raw)) return outcome('end', 'End of game', 'FINAL');
  if (/end.*(?:quarter|period)/i.test(raw)) return outcome('end', 'End of quarter', 'END');
  return outcome('other', raw || 'Drive ended', '—');
}
