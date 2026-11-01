/* node --test scripts/test_drive_quarters.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { quarterRecaps, driveNumbers } from '../js/drive-quarters.js';

const game = (extra = {}) => ({ state: 'post', period: 2,
  away: { abbr: 'FLA', lines: [0, 0] }, home: { abbr: 'UGA', lines: [7, 7] }, ...extra });
const play = (extra = {}) => ({ id: 'td', q: 1, clock: '1:00', side: 'home', scoring: true, scoreType: 'touchdown', type: 'Rushing Touchdown', ...extra });
const drive = (extra = {}) => ({ id: 'drive', q: 1, side: 'home', yards: 75, playCount: 8, isScore: true, result: 'Touchdown', plays: [play()], ...extra });

test('quarter scoring comes from the official line score, including conversions', () => {
  const quarters = quarterRecaps(game(), [drive()]);
  assert.deepEqual(quarters.find(q => q.q === 1).points, { away: 0, home: 7 });
  assert.equal(quarters.find(q => q.q === 1).events.length, 1);
});

test('a cross-quarter drive and its touchdown belong to the ending quarter', () => {
  const quarters = quarterRecaps(game(), [drive({ q: 1, plays: [play({ q: 2 })] })]);
  assert.equal(quarters.find(q => q.q === 1).rows.length, 0);
  assert.equal(quarters.find(q => q.q === 2).rows.length, 1);
  assert.equal(quarters.find(q => q.q === 2).events[0].q, 2);
});

test('Florida–Georgia sack return credits Georgia despite the missing turnover flag', () => {
  const quarters = quarterRecaps(game(), [drive({ side: 'away', q: 2, result: 'Fumble Touchdown', plays: [play({ q: 2, side: 'away', type: 'Sack',
    possessionChanged: true, turnover: false, yds: 66, text: 'Fumble recovered for a touchdown' })] })]);
  const event = quarters.find(q => q.q === 2).events[0];
  assert.equal(event.side, 'home');
  assert.equal(event.kind, 'defense');
  assert.equal(event.label, '66-yard fumble return TD');
});

test('extra points are not additional highlights and duplicate play ids are counted once', () => {
  const td = play();
  const extra = play({ id: 'pat', scoreType: 'point-after-touchdown', type: 'Extra Point Good' });
  const quarters = quarterRecaps(game(), [drive({ plays: [td, extra] }), drive({ id: 'duplicate', plays: [td] })]);
  assert.equal(quarters.find(q => q.q === 1).events.length, 1);
});

test('future padded line-score entries do not produce future recaps in a live game', () => {
  const quarters = quarterRecaps(game({ state: 'in', period: 1, home: { lines: [7, 0, 0, 0] } }), [drive()]);
  assert.equal(quarters.length, 1);
  assert.equal(quarters[0].current, true);
  assert.equal(quarters[0].complete, false);
});

test('a quarter-ending marker does not move a drive into a different quarter', () => {
  const quarters = quarterRecaps(game(), [drive({ plays: [play(), play({ id: 'end', q: 2, type: 'End Period', scoring: false })] })]);
  assert.equal(quarters.find(q => q.q === 1).rows.length, 1);
});

test('metrics preserve zero and negative yardage and have no future values on partial drives', () => {
  assert.equal(driveNumbers({ yards: 0 }).yards, 0);
  assert.equal(driveNumbers({ desc: '3 plays, -7 yards, 1:15' }).yards, -7);
  assert.deepEqual(driveNumbers({ yards: null, playCount: null, elapsed: null, desc: '3 plays so far' }), { yards: null, plays: 3, elapsed: null });
});
