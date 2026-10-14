import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LINE2_MAIN_LOOP } from '../data/line2.ts';
import { normalizeLine2Station, planLine2Journey } from '../lib/journeyPlanner.ts';

test('Gangnam to Jamsil recommends outer loop and gives every stop', () => {
  const trip = planLine2Journey('강남역', '잠실(송파구청)')!;
  assert.equal(trip.recommended.directionCode, '1');
  assert.equal(trip.recommended.directionLabel, '외선');
  assert.equal(trip.recommended.nextStation, '역삼');
  assert.deepEqual(trip.recommended.stations, ['강남', '역삼', '선릉', '삼성', '종합운동장', '잠실새내', '잠실']);
  assert.equal(trip.recommended.stopCount, 6);
  assert.equal(trip.alternative.directionCode, '0');
  assert.equal(trip.alternative.stopCount, 37);
});

test('route wraps around City Hall in both directions', () => {
  const outer = planLine2Journey('을지로입구', '충정로')!.recommended;
  assert.deepEqual(outer.stations, ['을지로입구', '시청', '충정로']);
  assert.equal(outer.directionCode, '1');
  const inner = planLine2Journey('충정로', '을지로입구')!.recommended;
  assert.deepEqual(inner.stations, ['충정로', '시청', '을지로입구']);
  assert.equal(inner.directionCode, '0');
});

test('aliases, spaces and parenthetical alternate names resolve', () => {
  assert.equal(normalizeLine2Station(' 강 남 역 '), '강남');
  assert.equal(normalizeLine2Station('신천역'), '잠실새내');
  assert.equal(normalizeLine2Station('ddp'), '동대문역사문화공원');
  assert.equal(normalizeLine2Station('서울대입구(관악구청)'), '서울대입구');
  assert.equal(planLine2Journey('신천', '잠실')!.recommended.stopCount, 1);
  for (const pair of [['강남', '강남역'], ['', '시청'], ['용답', '강남'], ['강남', '없는역']]) {
    assert.equal(planLine2Journey(pair[0]!, pair[1]!), null);
  }
});

test('all 43 stations route to each other with complementary lengths and shortest recommendation', () => {
  // A 43-stop loop has no equal-distance distinct station pair (odd count).
  for (const from of LINE2_MAIN_LOOP) for (const to of LINE2_MAIN_LOOP) {
    const trip = planLine2Journey(from.name, to.name);
    if (from.name === to.name) { assert.equal(trip, null); continue; }
    assert.ok(trip);
    assert.ok(trip.recommended.stopCount < trip.alternative.stopCount);
    assert.equal(trip.recommended.stopCount + trip.alternative.stopCount, 43);
    for (const route of [trip.recommended, trip.alternative]) {
      assert.equal(route.stations.length, route.stopCount + 1);
      assert.equal(route.stations[0], from.name);
      assert.equal(route.stations[route.stations.length - 1], to.name);
      assert.equal(route.nextStation, route.stations[1]);
      assert.equal(new Set(route.stations).size, route.stations.length);
    }
  }
});
