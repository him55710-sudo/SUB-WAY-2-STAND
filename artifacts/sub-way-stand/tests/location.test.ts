import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceMetres, nearestLine2Stations, positionIssue, type RiderPosition } from '../lib/location.ts';
import { createLocationClient, LOCATION_WAIT_MS, type LocationFailure, type LocationWatch } from '../lib/locationClient.ts';

const NOW = 1_780_000_000_000;
const GANGNAM: RiderPosition = { latitude: 37.49795, longitude: 127.02756, accuracyM: 15, timestampMs: NOW };

function clock() {
  let now = NOW;
  let seq = 0;
  const scheduled = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    later(callback: () => void, ms: number) { const id = ++seq; scheduled.set(id, { at: now + ms, callback }); return id; },
    cancel(timer: unknown) { scheduled.delete(timer as number); },
    advance(ms: number) {
      now += ms;
      for (const [id, task] of [...scheduled]) if (task.at <= now) { scheduled.delete(id); task.callback(); }
    },
  };
}

test('a fresh GPS fix at Gangnam returns Gangnam first, with local distance order', () => {
  const stations = nearestLine2Stations(GANGNAM, NOW);
  assert.equal(stations[0]?.name, '강남');
  assert.equal(stations[0]?.distanceM, 0);
  assert.equal(stations.length, 3);
  assert.ok(stations.every((s, i) => s.line === 2 && (i === 0 || s.distanceM >= stations[i - 1]!.distanceM)));
  assert.ok(distanceMetres(37.49795, 127.02756, 37.50082, 127.03696) > 800);
});

test('distant, inaccurate, stale, future and invalid fixes never produce local station suggestions', () => {
  assert.equal(nearestLine2Stations({ ...GANGNAM, latitude: 35.1796, longitude: 129.0756 }, NOW).length, 0);
  assert.equal(positionIssue({ ...GANGNAM, accuracyM: 2000 }, NOW), 'inaccurate');
  assert.equal(positionIssue({ ...GANGNAM, timestampMs: NOW - 60_000 }, NOW), 'stale');
  assert.equal(positionIssue({ ...GANGNAM, timestampMs: NOW + 10_000 }, NOW), 'invalid');
  for (const position of [
    { ...GANGNAM, latitude: NaN }, { ...GANGNAM, longitude: 181 },
    { ...GANGNAM, accuracyM: -1 }, { ...GANGNAM, accuracyM: 1001 },
    { ...GANGNAM, timestampMs: NOW - 65_000 },
  ]) assert.deepEqual(nearestLine2Stations(position, NOW), []);
});

test('location does not start until user request; permission denial is explicit and clears suggestions', async () => {
  let starts = 0;
  const client = createLocationClient(async () => { starts += 1; throw { status: 'denied' }; }, clock());
  assert.equal(starts, 0);
  assert.equal(client.getState().status, 'idle');
  await client.requestLocation();
  assert.equal(starts, 1);
  assert.equal(client.getState().status, 'denied');
  assert.match(client.getState().messageKo, /직접 선택/);
  assert.deepEqual(client.getState().nearestStations, []);
  client.dispose();
});

test('a missing underground fix times out and releases its watcher; late callbacks are ignored', async () => {
  const timer = clock();
  let updates!: (position: RiderPosition) => void;
  let removed = 0;
  const client = createLocationClient(async (onPosition) => { updates = onPosition; return () => { removed += 1; }; }, timer);
  await client.requestLocation();
  assert.equal(client.getState().status, 'requesting');
  timer.advance(LOCATION_WAIT_MS);
  assert.equal(client.getState().status, 'unavailable');
  assert.equal(removed, 1);
  updates(GANGNAM);
  assert.equal(client.getState().status, 'unavailable');
  client.dispose();
});

test('a successful fix expires and removes stale nearby suggestions', async () => {
  const timer = clock();
  let removed = 0;
  const client = createLocationClient(async (onPosition) => { onPosition(GANGNAM); return () => { removed += 1; }; }, timer);
  await client.requestLocation();
  assert.equal(client.getState().status, 'active');
  assert.equal(client.getState().nearestStations[0]?.name, '강남');
  timer.advance(60_000);
  assert.equal(client.getState().status, 'unavailable');
  assert.equal(client.getState().position, null);
  assert.equal(client.getState().nearestStations.length, 0);
  assert.equal(removed, 1);
  client.dispose();
});

test('stopping during a permission prompt removes any subscription that resolves afterwards', async () => {
  let resolve!: (cleanup: () => void) => void;
  let removed = 0;
  let updates!: (position: RiderPosition) => void;
  const watch: LocationWatch = async (onPosition) => { updates = onPosition; return new Promise((done) => { resolve = done; }); };
  const client = createLocationClient(watch, clock());
  const pending = client.requestLocation();
  client.stop();
  resolve(() => { removed += 1; });
  await pending;
  updates(GANGNAM);
  assert.equal(removed, 1);
  assert.equal(client.getState().status, 'idle');
  assert.deepEqual(client.getState().nearestStations, []);
  client.dispose();
});

test('repeated request cleans up old watch and ignores its errors', async () => {
  let errors: Array<(error: LocationFailure) => void> = [];
  let removed = 0;
  const client = createLocationClient(async (_, onError) => { errors.push(onError); return () => { removed += 1; }; }, clock());
  await client.requestLocation();
  await client.requestLocation();
  errors[0]!({ status: 'denied' });
  assert.equal(client.getState().status, 'requesting');
  assert.equal(removed, 1);
  client.dispose();
  assert.equal(removed, 2);
});
