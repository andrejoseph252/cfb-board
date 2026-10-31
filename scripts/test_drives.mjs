/* node --test scripts/test_drives.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { driveOutcome } from '../js/drive-result.js';
import { parseSummary } from '../js/models.js';
import { playHTML } from '../js/plays.js';

test('a pick-six is an opponent score, including ESPN result-code and generic-TD variants', () => {
  for (const result of ['Interception Touchdown', 'INT TD', 'Touchdown']){
    const r = driveOutcome({ result, isScore: true, plays: [{ scoring: true, type: 'Interception Return Touchdown' }] });
    assert.equal(r.label, 'Pick-six');
    assert.equal(r.kind, 'defense');
    assert.equal(r.conceded, true);
  }
});

test('opponent fumble returns differ from an offense recovering its own fumble in the end zone', () => {
  const result = 'Fumble Touchdown';
  const lost = driveOutcome({ result, plays: [{ scoring: true, type: 'Fumble Recovery (Opponent)' }] });
  const own = driveOutcome({ result, plays: [{ scoring: true, type: 'Fumble Recovery (Own)' }] });
  assert.equal(lost.conceded, true);
  assert.equal(own.kind, 'touchdown');
  assert.notEqual(own.conceded, true);
});

test('structured touchdown data handles a stale drive label after review', () => {
  const r = driveOutcome({ result: 'Fumble', isScore: true,
    plays: [{ scoring: true, scoreType: 'touchdown', type: 'Fumble Recovery (Own)' }] });
  assert.equal(r.kind, 'touchdown');
  assert.notEqual(r.conceded, true);
});

test('touchdowns, field goals, punts, misses and turnovers have distinct treatments', () => {
  const kinds = ['Touchdown', 'Field Goal', 'Punt', 'Missed FG', 'Interception'].map(result => driveOutcome({ result }).kind);
  assert.equal(new Set(kinds).size, 5);
  assert.equal(driveOutcome({ result: 'Blocked Field Goal' }).kind, 'turnover');
  assert.equal(driveOutcome({ result: 'Downs' }).label, 'Turnover on downs');
  assert.equal(driveOutcome({ result: 'Safety', isScore: true }).conceded, true);
});

test('a stream-synced active drive cannot reveal its eventual score', () => {
  const r = driveOutcome({ result: 'In progress', active: true, plays: [{ scoring: true, type: 'Interception Return Touchdown' }] });
  assert.equal(r.kind, 'live');
  assert.equal(r.conceded, undefined);
});

test('only an unfinished current drive in a live game is marked active', () => {
  const previous = { id: '1', team: { id: '1' }, plays: [] };
  const current = { id: '2', team: { id: '2' }, plays: [] };
  const raw = { header: { id: 'game', competitions: [{ status: { type: { state: 'in' } },
    competitors: [{ homeAway: 'home', team: { id: '1' } }, { homeAway: 'away', team: { id: '2' } }] }] },
    drives: { previous: [previous], current } };
  let parsed = parseSummary(raw);
  assert.equal(driveOutcome(parsed.drives[0]).label, 'Drive ended');
  assert.equal(driveOutcome(parsed.drives[1]).kind, 'live');
  raw.drives.current.displayResult = 'Touchdown';
  parsed = parseSummary(raw);
  assert.equal(parsed.drives[1].active, false);
  assert.equal(driveOutcome(parsed.drives[1]).kind, 'touchdown');
  delete raw.drives.current.displayResult;
  raw.header.competitions[0].status.type.state = 'post';
  assert.equal(parseSummary(raw).drives[1].active, false);
});

test('half endings and unfamiliar outcomes remain readable without a scoring badge', () => {
  assert.equal(driveOutcome({ result: 'End Of Half' }).kind, 'end');
  assert.equal(driveOutcome({ result: 'Unusual finish' }).label, 'Unusual finish');
  assert.equal(driveOutcome({}).label, 'Drive ended');
});

test('defensive return touchdowns end at the left end zone on the play diagram', () => {
  for (const type of ['Fumble Recovery (Opponent)', 'Interception Return Touchdown']){
    // The structured type also identifies a return when ESPN omits the turnover flag.
    for (const turnover of [true, false]){
      const html = playHTML({ text: '#6 G.Payne rush middle for 7 yards loss, TOUCHDOWN',
        scoring: true, type, turnover, y0: 42, yds: 51 });
      assert.match(html, /pl-seg loss/);
      assert.match(html, /pl-ball" style="left:8\.3%/);
    }
  }
});

test('offensive touchdowns, including own fumble recoveries, still end on the right', () => {
  for (const type of ['Rushing Touchdown', 'Fumble Recovery (Own)']){
    const html = playHTML({ text: '#6 G.Payne rush middle for 7 yards, TOUCHDOWN',
      scoring: true, type, turnover: false, y0: 7, yds: 7 });
    assert.doesNotMatch(html, /pl-seg loss/);
    assert.match(html, /pl-ball" style="left:91\.7%/);
  }
});

test('a return touchdown nullified by a penalty does not move the ball into either end zone', () => {
  const html = playHTML({ text: '#6 G.Payne rush middle for 7 yards loss, TOUCHDOWN PENALTY NEV Holding 10 yards NO PLAY',
    scoring: false, type: 'Fumble Recovery (Opponent)', turnover: true, y0: 42, yds: 51 });
  assert.match(html, /pl-ball" style="left:56\.7%/);
});

test('Florida–Georgia sack-fumble return is identified even when ESPN says isTurnover=false', () => {
  const play = { text: '(00:44) No Huddle-Shotgun #9 T.Jones Jr. sacked for loss of 3 yards to the UGA34 (#3 Q.Johnson), fumble by #9 T.Jones Jr. recovered by UGA #9 C.Cole at UGA34 #9 C.Cole return 66 yards to the UF 00 TOUCHDOWN, clock 00:29',
    type: { text: 'Sack' }, scoringPlay: true, scoringType: { name: 'touchdown' }, isTurnover: false, statYardage: 66,
    start: { team: { id: '57' }, yardsToEndzone: 37 }, end: { team: { id: '61' }, yardsToEndzone: 66 } };
  const raw = { header: { competitions: [{ competitors: [
    { homeAway: 'home', team: { id: '61' } }, { homeAway: 'away', team: { id: '57' } }
  ] }] }, drives: { previous: [{ team: { id: '57' }, plays: [play] }] } };
  const p = parseSummary(raw).drives[0].plays[0];
  assert.equal(p.turnover, false);
  assert.equal(p.possessionChanged, true);
  const html = playHTML(p);
  assert.match(html, /pl-ball" style="left:8\.3%/);
  assert.match(html, /pl-seg loss/);
  assert.match(html, /pl-tag bad">FUMBLE/);
  assert.match(html, /recovered by <b>Cole<\/b>/);
});
