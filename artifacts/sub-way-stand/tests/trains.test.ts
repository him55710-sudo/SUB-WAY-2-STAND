// Train feed mapping. Run with `pnpm --filter @workspace/sub-way-stand test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Train, TrainResponse } from '@workspace/api-client-react';
import {
  FRESH_LIMIT_S,
  candidatesFromSnapshot,
  feedFromSnapshot,
  isValidLine,
  normalizeStationQuery,
  toCandidate,
  trackedFromSnapshot,
} from '../services/trainFeed.ts';

const NOW = Date.parse('2026-10-14T05:00:00Z'); // 14:00:00 KST

const train = (over: Partial<Train> = {}): Train => ({
  id: '2282',
  line: 2,
  station: '강남',
  direction: '내선',
  directionCode: '0',
  destination: '성수',
  state: '출발',
  stateCode: '2',
  observedAt: '2026-10-14T13:59:40+09:00',
  fresh: true,
  express: false,
  lastTrain: false,
  ...over,
});

const response = (over: Partial<TrainResponse> = {}): TrainResponse => ({
  status: 'live',
  message: '역 단위 실시간 관측',
  trains: [train()],
  fetchedAt: '2026-10-14T05:00:00.000Z',
  cached: false,
  coverage: 'test',
  callsRemaining: 900,
  totalOnLine: 30,
  ...over,
});

const ok = (data: TrainResponse) => ({ data, error: null, isError: false });

test('API trains map to live candidates; freshness ages on the device', () => {
  const c = toCandidate(train(), NOW);
  assert.equal(c.origin, 'live');
  assert.equal(c.fresh, true);
  assert.equal(c.station, '강남');
  assert.equal(c.direction, '내선');
  assert.equal(toCandidate(train(), NOW + (FRESH_LIMIT_S + 1) * 1000).fresh, false, 'must turn stale');
  assert.equal(toCandidate(train({ fresh: false }), NOW).fresh, false, 'server-stale stays stale');
  assert.equal(toCandidate(train({ observedAt: 'garbage' }), NOW).fresh, false);
  assert.equal(candidatesFromSnapshot(ok(response()), NOW).length, 1);
});

test('feed status and Korean message come straight from the API', () => {
  for (const status of ['live', 'degraded', 'missing_key', 'unavailable', 'quota', 'empty'] as const) {
    const msg = `msg-${status}`;
    const feed = feedFromSnapshot(ok(response({ status, message: msg, cached: status === 'degraded' })));
    assert.equal(feed.status, status);
    assert.equal(feed.message, msg);
    assert.equal(feed.origin, 'live');
    assert.equal(feed.cached, status === 'degraded');
  }
  const loading = feedFromSnapshot({ data: undefined, error: null, isError: false });
  assert.equal(loading.fetchedAt, null);
});

test('app-server failure is offline, never live', () => {
  const cold = feedFromSnapshot({ data: undefined, error: new TypeError('Network request failed'), isError: true });
  assert.equal(cold.status, 'offline');
  assert.equal(cold.cached, false);
  assert.match(cold.message, /연결할 수 없습니다/);
  const warm = feedFromSnapshot({ data: response(), error: { status: 502 }, isError: true });
  assert.equal(warm.status, 'offline');
  assert.equal(warm.cached, true);
  assert.match(warm.message, /502/);
  assert.match(warm.message, /마지막/);
});

test('tracked train: found, lost from a live feed, kept on degraded/offline', () => {
  const seen = train({ id: '3276', station: '교대' });
  const found = trackedFromSnapshot(ok(response({ trains: [seen] })), '3276', null, NOW);
  assert.equal(found.lost, false);
  assert.equal(found.train?.station, '교대');

  const moved = trackedFromSnapshot(ok(response({ trains: [train()] })), '3276', seen, NOW);
  assert.equal(moved.lost, true);
  assert.equal(moved.train?.station, '교대', 'last observation is still returned');
  assert.equal(trackedFromSnapshot(ok(response({ trains: [] , status: 'empty' })), '3276', seen, NOW).lost, true);

  const degraded = trackedFromSnapshot(ok(response({ status: 'degraded', trains: [], cached: true })), '3276', seen, NOW);
  assert.equal(degraded.lost, false);
  assert.equal(degraded.train?.id, '3276');

  const offline = trackedFromSnapshot(
    { data: response({ trains: [seen] }), error: new TypeError('x'), isError: true },
    '3276',
    seen,
    NOW + 5 * 60_000,
  );
  assert.equal(offline.lost, false);
  assert.equal(offline.train?.fresh, false, 'old observation must not look fresh');

  const never = trackedFromSnapshot(ok(response({ status: 'missing_key', trains: [] })), '3276', null, NOW);
  assert.deepEqual(never, { train: null, lost: false });
});

test('query helpers', () => {
  assert.equal(normalizeStationQuery('  강남역 '), '강남역');
  assert.equal(normalizeStationQuery('   '), undefined);
  assert.equal(normalizeStationQuery(undefined), undefined);
  assert.equal(normalizeStationQuery('가'.repeat(60))?.length, 40);
  assert.ok(isValidLine(2) && isValidLine(9));
  assert.ok(!isValidLine(0) && !isValidLine(10) && !isValidLine(2.5));
});
