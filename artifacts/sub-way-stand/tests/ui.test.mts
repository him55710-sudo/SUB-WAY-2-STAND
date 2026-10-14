// UI view-model tests. Run: `node --no-warnings --test tests/*.test.mts` from the mobile package.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRouteStrip,
  confidenceBadge,
  etaPhrase,
  feedBanner,
  filterCandidates,
  leanDegrees,
  LEAN_MAX_DEG,
  normalizeQuery,
  placementFromState,
  ridePhase,
  sourceLabel,
  suppressCopy,
} from '../components/uiModel.ts';
import type { FeedStatus, RouteSegment, TrainCandidate } from '../contracts/index.ts';

const feed = (over: Partial<FeedStatus>): FeedStatus => ({
  status: 'live',
  message: '',
  fetchedAt: null,
  cached: false,
  origin: 'live',
  ...over,
});

const train = (over: Partial<TrainCandidate>): TrainCandidate => ({
  id: '2041',
  line: 2,
  station: '강남',
  direction: '외선',
  directionCode: '1',
  destination: '성수',
  state: '출발',
  stateCode: '2',
  observedAt: '2026-10-14T00:00:00.000Z',
  fresh: true,
  express: false,
  lastTrain: false,
  origin: 'live',
  ...over,
});

const seg = (over: Partial<RouteSegment>): RouteSegment => ({
  id: 's',
  from: 'A',
  to: 'B',
  directionCode: '1',
  lengthM: 1000,
  curves: [],
  ...over,
});

test('feed banner maps every status to the required Korean label', () => {
  assert.equal(feedBanner(feed({}), true).label, '실시간');
  assert.equal(feedBanner(feed({ cached: true }), true).label, '캐시');
  assert.equal(feedBanner(feed({ status: 'degraded' }), true).label, '캐시');
  assert.equal(feedBanner(feed({}), false).label, '시뮬레이션');
  assert.equal(feedBanner(feed({ status: 'missing_key' }), true).label, '키 없음');
  assert.equal(feedBanner(feed({ status: 'offline' }), true).label, '연결 불가');
  assert.equal(feedBanner(feed({ status: 'unavailable' }), true).label, '연결 불가');
});

test('fixture data is never labeled live, and offers the simulation', () => {
  const b = feedBanner(feed({ status: 'live', origin: 'fixture' }), true);
  assert.equal(b.kind, 'fixture');
  assert.notEqual(b.tone, 'live');
  assert.equal(b.suggestSimulation, true);
});

test('missing key cannot be fixed by retrying', () => {
  assert.equal(feedBanner(feed({ status: 'missing_key' }), true).canRetry, false);
  assert.equal(feedBanner(feed({ status: 'offline' }), true).canRetry, true);
});

test('station search ignores spaces and a trailing 역', () => {
  assert.equal(normalizeQuery(' 강남 역 '), '강남');
  const list = [train({}), train({ id: '2213', station: '역삼', directionCode: '0', destination: '잠실' })];
  assert.deepEqual(filterCandidates(list, 'all', '강남역').map((t) => t.id), ['2041']);
  assert.deepEqual(filterCandidates(list, '0', '').map((t) => t.id), ['2213']);
  assert.deepEqual(filterCandidates(list, 'all', '잠실').map((t) => t.id), ['2213']);
  assert.deepEqual(filterCandidates(list, 'all', '2213').map((t) => t.id), ['2213']);
});

test('ETA phrase is rounded, ordered and never negative', () => {
  assert.equal(etaPhrase({ min: 7.6, max: 13.6 }), '약 7–14초 후');
  assert.equal(etaPhrase({ min: 14, max: 8 }), '약 8–14초 후');
  assert.equal(etaPhrase({ min: 5.2, max: 4.8 }), '약 4–6초 후');
  assert.equal(etaPhrase({ min: 0.1, max: 0.4 }), '약 0–1초 후');
  assert.equal(etaPhrase({ min: -3, max: -1 }), '지금');
});

test('ride phase: suppressed, approach, then now', () => {
  const base = { state: 'active' as const, sway: 'left' as const };
  assert.equal(ridePhase({ ...base, state: 'suppressed', sway: 'none', etaWindowS: null }), 'suppressed');
  assert.equal(ridePhase({ ...base, sway: 'none', etaWindowS: { min: 5, max: 8 } }), 'suppressed');
  assert.equal(ridePhase({ ...base, etaWindowS: { min: 8, max: 14 } }), 'approach');
  assert.equal(ridePhase({ ...base, etaWindowS: { min: 1, max: 4 } }), 'approach');
  assert.equal(ridePhase({ ...base, etaWindowS: { min: 0, max: 0 } }), 'now');
});

test('lean is proportional, signed by side and capped', () => {
  assert.deepEqual(leanDegrees('none', { min: 0.3, max: 0.6 }), { mid: 0, min: 0, max: 0 });
  const r = leanDegrees('right', { min: 0.2, max: 0.4 });
  assert.ok(r.min > 0 && r.min < r.mid && r.mid < r.max);
  const l = leanDegrees('left', { min: 0.2, max: 0.4 });
  assert.equal(l.mid, -r.mid);
  assert.equal(leanDegrees('right', { min: 5, max: 9 }).max, LEAN_MAX_DEG);
});

test('source and confidence labels', () => {
  assert.equal(sourceLabel({ source: 'simulation' }).tone, 'synthetic');
  assert.equal(sourceLabel({ source: 'live-estimate' }).label, '실시간 관측 기반 추정');
  assert.equal(confidenceBadge('unavailable').tone, 'muted');
  assert.equal(confidenceBadge('high').label, '신뢰도 높음');
});

test('stationary suppression reads as a calm pause', () => {
  const s = suppressCopy('stationary');
  assert.equal(`${s.title} · ${s.detail}`, '정차 중 · 안내 일시중지');
  assert.ok(suppressCopy(null).title.length > 0);
});

test('route strip: two segments place prev/current/next and curves in order', () => {
  const into = seg({ id: 'in', from: '강남', to: '역삼', lengthM: 800, curves: [{ id: 'c1', startOffsetM: 200, lengthM: 100, radiusM: 400, turn: 'left', source: 'synthetic', confidence: 'low' }] });
  const outOf = seg({ id: 'out', from: '역삼', to: '선릉', lengthM: 800, curves: [{ id: 'c2', startOffsetM: 400, lengthM: 100, radiusM: 400, turn: 'right', source: 'synthetic', confidence: 'low' }] });
  const m = buildRouteStrip({ into, outOf, anchor: '역삼', train: { on: 'anchor' }, targetCurveId: 'c2' });
  assert.ok(m);
  assert.deepEqual(m.stations.map((s) => [s.role, s.name]), [['prev', '강남'], ['current', '역삼'], ['next', '선릉']]);
  assert.equal(m.stations[1].x, 0.5);
  assert.equal(m.gaps.length, 0);
  assert.ok(m.curves[0].x1 < 0.5 && m.curves[1].x0 > 0.5);
  assert.deepEqual(m.curves.map((c) => c.active), [false, true]);
  assert.equal(m.train?.x, 0.5);
});

test('route strip: one known side leaves a dashed gap; none gives null', () => {
  const outOf = seg({ from: '강남', to: '역삼' });
  const m = buildRouteStrip({ into: null, outOf, anchor: '강남', train: placementFromState('2', null, outOf), targetCurveId: null });
  assert.ok(m);
  assert.deepEqual(m.gaps, [[0, 0.28]]);
  assert.ok(m.train && m.train.x > 0.28 && m.train.band);
  assert.equal(buildRouteStrip({ into: null, outOf: null, anchor: 'X', train: null, targetCurveId: null }), null);
});

test('route strip: full-width single segment maps the position band', () => {
  const into = seg({ lengthM: 1000 });
  const m = buildRouteStrip({ into, outOf: null, anchor: 'B', train: { on: 'into', offsetM: { min: 400, max: 600 } }, targetCurveId: null, fullWidth: true });
  assert.ok(m);
  assert.equal(m.gaps.length, 0);
  assert.equal(m.train?.x, 0.5);
  assert.deepEqual(m.train?.band, [0.4, 0.6]);
});
