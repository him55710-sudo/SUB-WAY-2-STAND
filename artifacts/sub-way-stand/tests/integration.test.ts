// End-to-end chain tests (no network). Run with the mobile `test` script.
//
//   API response fixture → trains mapping → route segment lookup → forecast → guidance decision
//
// The API responses are pinned by the server test
// (artifacts/api-server/tests/integration.test.ts), which produces them from a
// provider payload through the real proxy + response schema, so both sides of
// the contract are exercised by the same bytes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { TrainResponse } from '@workspace/api-client-react';
import type { FindSegment, Forecast, RouteData, TrainCandidate } from '../contracts/index.ts';
import { feedBanner, rideFeedBadge, ridePhase, sourceLabel } from '../components/uiModel.ts';
// data/routes.ts value-imports via the `@/` alias (Metro only), so build the
// bundled Line 2 route from its Node-loadable sources the same way it does.
import { LINE2_ALIASES, LINE2_LOOP_LENGTH_M, LINE2_MAIN_LOOP } from '../data/line2.ts';
import { buildLoopRoute, findSegmentInRoute } from '../data/routeGeometry.ts';
import { computeLiveForecast } from '../lib/forecastEngine.ts';
import {
  SIMULATION_PREFIX,
  decideGuidance,
  initialGuidanceMemory,
  resolveAvailability,
  type GuidanceAction,
} from '../lib/guidanceRules.ts';
import { buildSimRide, simulateForecast } from '../lib/simulationRide.ts';
import {
  candidatesFromSnapshot,
  feedFromSnapshot,
  trackedFromSnapshot,
  type FeedSnapshot,
} from '../services/trainFeed.ts';

// Same instant the server test pins its responses at (14:00:00 KST).
const NOW = Date.parse('2026-10-14T05:00:00Z');

const fixture = (name: string): TrainResponse =>
  JSON.parse(readFileSync(new URL(`../../api-server/tests/fixtures/${name}`, import.meta.url), 'utf8'));
const LIVE = fixture('trains-line2-live.json');
const CACHED = fixture('trains-line2-cached.json');
const MISSING_KEY = fixture('trains-line2-missing-key.json');
const ok = (data: TrainResponse): FeedSnapshot => ({ data, error: null, isError: false });

const ROUTE: RouteData = buildLoopRoute({
  line: 2,
  name: '2호선',
  stations: LINE2_MAIN_LOOP,
  officialLengthM: LINE2_LOOP_LENGTH_M,
  sourceNote: 'test',
});
const routeFor = (route: RouteData) => (line: number) => (line === 2 ? route : null);
const finderFor =
  (route: RouteData): FindSegment =>
  (line, station, dir, end) =>
    line === 2 ? findSegmentInRoute(route, station, dir, end, LINE2_ALIASES) : null;

/**
 * Test-only stand-in for surveyed alignment: the same curves marked verified.
 * The bundled curves are station-geometry approximations, so the real live path
 * must hold; this variant shows what the chain does once verified data exists.
 */
const VERIFIED: RouteData = {
  ...ROUTE,
  segments: ROUTE.segments.map((s) => ({
    ...s,
    curves: s.curves.map((c) => ({ ...c, source: 'curated' as const, confidence: 'high' as const })),
  })),
};

/** One forecast + guidance decision per second, like the ride screen. */
function ride(forecastAt: (s: number, nowMs: number) => Forecast, seconds: number, t0 = NOW) {
  let memory = initialGuidanceMemory();
  const ticks: { s: number; f: Forecast; action: GuidanceAction }[] = [];
  for (let s = 0; s < seconds; s++) {
    const nowMs = t0 + s * 1000;
    const f = forecastAt(s, nowMs);
    const d = decideGuidance(memory, f, nowMs, { appActive: true });
    memory = d.memory;
    ticks.push({ s, f, action: d.action });
  }
  const announced = ticks.filter((t) => t.action.type === 'announce');
  return { ticks, announced };
}

const opposite = (turn: 'left' | 'right') => (turn === 'left' ? 'right' : 'left');

function pick(id: string): TrainCandidate {
  const tracked = trackedFromSnapshot(ok(LIVE), id, null, NOW);
  assert.ok(tracked.train, `train ${id} missing from the fixture`);
  assert.equal(tracked.lost, false);
  return tracked.train;
}

const liveForecast = (train: TrainCandidate, nowMs: number, route: RouteData = ROUTE, lost = false) =>
  computeLiveForecast({
    train,
    nowMs,
    route: routeFor(route)(train.line),
    findSegment: finderFor(route),
    lost,
  });

// ---------------------------------------------------------------------------
// Live path
// ---------------------------------------------------------------------------

test('live: response maps to labeled live candidates and a live feed banner', () => {
  const feed = feedFromSnapshot(ok(LIVE));
  assert.equal(feed.status, 'live');
  assert.equal(feed.origin, 'live');
  assert.equal(feedBanner(feed, true).kind, 'live');

  const candidates = candidatesFromSnapshot(ok(LIVE), NOW);
  assert.equal(candidates.length, 6);
  assert.ok(candidates.every((c) => c.origin === 'live'), 'no fixture/stub trains in the live path');
  const fresh = Object.fromEntries(candidates.map((c) => [c.id, c.fresh]));
  assert.equal(fresh['3276'], true);
  assert.equal(fresh['2310'], false, '10-minute-old observation is not fresh');
});

test('live: moving train → segment lookup → approximate curve → honest hold, never spoken', () => {
  const train = pick('3276'); // 교대 출발, 내선
  assert.equal(finderFor(ROUTE)(2, '교대', '0', 'outOf')?.id, 'L2-0-교대-서초');

  const { ticks, announced } = ride((_, nowMs) => liveForecast(train, nowMs), 90);
  const first = ticks[0]!.f;
  assert.equal(first.source, 'live-estimate');
  assert.equal(sourceLabel(first).label, '실시간 관측 기반 추정');
  assert.equal(first.state, 'suppressed');
  assert.equal(first.suppressReason, 'low-confidence');
  assert.equal(first.segment?.id, 'L2-0-교대-서초');
  assert.equal(first.sway, 'none', 'no direction from unverified geometry');
  assert.match(first.explanationKo.join(' '), /근사/);
  assert.equal(ridePhase(first), 'suppressed');
  assert.deepEqual(announced, [], 'live estimate on approximate curves must stay silent');
  assert.ok(ticks.every((t) => t.f.state === 'suppressed'));
});

test('live: with verified geometry the same chain counts down and warns before the curve', () => {
  const train = pick('3276');
  const { ticks, announced } = ride((_, nowMs) => liveForecast(train, nowMs, VERIFIED), 60);

  const active = ticks.filter((t) => t.f.state === 'active');
  assert.ok(active.length > 10, 'forecast becomes active');
  const curve = active[0]!.f.targetCurve!;
  assert.equal(active[0]!.f.sway, opposite(curve.turn), 'sway is opposite the turn');

  // Countdown: earliest entry decreases tick by tick while approaching the same curve.
  const approach = active.filter((t) => t.f.targetCurve?.id === curve.id && t.f.etaWindowS!.min > 0);
  for (let i = 1; i < approach.length; i++) {
    assert.ok(approach[i]!.f.etaWindowS!.min < approach[i - 1]!.f.etaWindowS!.min, `countdown at ${approach[i]!.s}s`);
  }

  const kinds = announced.map((t) => (t.action.type === 'announce' ? t.action.kind : ''));
  assert.deepEqual(kinds.slice(0, 2), ['pre-warning', 'now']);
  const [pre, now] = announced;
  assert.ok(pre!.action.type === 'announce' && now!.action.type === 'announce');
  assert.equal(pre!.action.curveId, curve.id);
  assert.ok(!pre!.action.textKo.startsWith(SIMULATION_PREFIX), 'live cues carry no simulation prefix');
  assert.match(pre!.action.textKo, curve.turn === 'left' ? /왼쪽 곡선.*오른쪽으로 쏠림/ : /오른쪽 곡선.*왼쪽으로 쏠림/);
  const preEta = pre!.f.etaWindowS!.min;
  assert.ok(preEta <= 10 && preEta >= 3, `pre-warning lead ${preEta}s`);
  assert.ok(now!.s > pre!.s);
});

test('live: stationary train is suppressed and silent; leaving the curve-ahead state cancels a pending warning', () => {
  const stopped = pick('2277'); // 잠실 도착
  const { ticks, announced } = ride((_, nowMs) => liveForecast(stopped, nowMs, VERIFIED), 60);
  assert.ok(ticks.every((t) => t.f.state === 'suppressed' && t.f.suppressReason === 'stationary'));
  assert.equal(ridePhase(ticks[0]!.f), 'suppressed');
  assert.deepEqual(announced, []);

  // Pre-warned on a moving train, then the next observation says it stopped.
  const moving = pick('3276');
  let memory = initialGuidanceMemory();
  let s = 0;
  for (; s < 60; s++) {
    const d = decideGuidance(memory, liveForecast(moving, NOW + s * 1000, VERIFIED), NOW + s * 1000);
    memory = d.memory;
    if (d.action.type === 'announce' && d.action.kind === 'pre-warning') break;
  }
  assert.ok(s < 60, 'pre-warning issued');
  const halted = liveForecast({ ...moving, state: '도착', stateCode: '1' }, NOW + (s + 1) * 1000, VERIFIED);
  assert.equal(halted.suppressReason, 'stationary');
  const d = decideGuidance(memory, halted, NOW + (s + 1) * 1000);
  assert.equal(d.action.type, 'cancel');
});

test('live: branch platform, unknown line, stale and lost trains are suppressed with a reason', () => {
  assert.equal(liveForecast(pick('5615'), NOW).suppressReason, 'unknown-segment'); // 신도림지선
  assert.equal(liveForecast({ ...pick('3276'), line: 3 }, NOW).suppressReason, 'unknown-segment');
  assert.equal(liveForecast(pick('2310'), NOW).suppressReason, 'stale');

  // Train disappears from the next complete (live) response.
  const next: TrainResponse = { ...LIVE, trains: LIVE.trains.filter((t) => t.id !== '3276') };
  const last = LIVE.trains.find((t) => t.id === '3276')!;
  const tracked = trackedFromSnapshot(ok(next), '3276', last, NOW);
  assert.equal(tracked.lost, true);
  assert.ok(tracked.train, 'last observation kept for display');
  assert.equal(liveForecast(tracked.train, NOW, ROUTE, tracked.lost).suppressReason, 'train-lost');
});

test('live: ride-screen feed badge — none for fresh live, shown for cache and offline', () => {
  assert.equal(rideFeedBadge(null, true), null, 'nothing while loading');
  assert.equal(rideFeedBadge(feedFromSnapshot(ok(LIVE)), true), null);

  // Server cache hit: still status "live", but the ride must say it is reused data.
  assert.equal(CACHED.status, 'live');
  assert.equal(CACHED.cached, true);
  const cached = rideFeedBadge(feedFromSnapshot(ok(CACHED)), true);
  assert.equal(cached?.kind, 'cache');
  assert.equal(cached?.label, '캐시');
  // Tracking still works off the cached response, labeled as such.
  const tracked = trackedFromSnapshot(ok(CACHED), '3276', null, NOW);
  assert.equal(tracked.train?.id, '3276');
  assert.equal(tracked.lost, false);

  const offline = feedFromSnapshot({ data: CACHED, error: new TypeError('Network request failed'), isError: true });
  assert.equal(rideFeedBadge(offline, true)?.kind, 'offline');
});

test('live: our API server unreachable → offline, never live', () => {
  const feed = feedFromSnapshot({ data: undefined, error: new TypeError('Network request failed'), isError: true });
  assert.equal(feed.status, 'offline');
  assert.equal(feedBanner(feed, true).kind, 'offline');
  assert.deepEqual(candidatesFromSnapshot({ data: undefined, error: null, isError: true }, NOW), []);
});

// ---------------------------------------------------------------------------
// Missing key
// ---------------------------------------------------------------------------

test('missing key: no candidates, explicit banner, simulation offered and still works', () => {
  const snap = ok(MISSING_KEY);
  assert.deepEqual(candidatesFromSnapshot(snap, NOW), []);
  const feed = feedFromSnapshot(snap);
  assert.equal(feed.status, 'missing_key');
  const banner = feedBanner(feed, true);
  assert.equal(banner.kind, 'missing-key');
  assert.equal(banner.canRetry, false);
  assert.equal(banner.suggestSimulation, true);

  // The one-tap fallback does not depend on the API at all.
  const sim = buildSimRide(ROUTE);
  const { announced } = ride((s, nowMs) => simulateForecast(sim, s, nowMs), sim.durationS);
  assert.ok(announced.length >= 2);
});

// ---------------------------------------------------------------------------
// Simulation path
// ---------------------------------------------------------------------------

test('simulation: Line 2 segment → dwell suppressed → countdown → prefixed pre-warning → now cue, every lap', () => {
  const sim = buildSimRide(ROUTE);
  assert.equal(sim.usesRouteData, true);
  assert.ok(sim.segment.id.startsWith('L2-'), 'runs on a bundled Line 2 segment');

  const laps = 2;
  const { ticks, announced } = ride((s, nowMs) => simulateForecast(sim, s, nowMs), sim.durationS * laps);
  assert.ok(ticks.every((t) => t.f.source === 'simulation'));
  assert.equal(sourceLabel(ticks[0]!.f).label, '시뮬레이션 · 가상 선로');

  // Stationary at both platforms: suppressed and silent.
  const dwell = ticks.filter((t) => t.f.suppressReason === 'stationary');
  assert.ok(dwell.length >= sim.runStartS * laps);
  assert.ok(dwell.every((t) => t.action.type === 'none'));
  assert.equal(ticks[0]!.f.state, 'suppressed');

  for (const t of announced) {
    assert.ok(t.action.type === 'announce');
    assert.ok(t.action.textKo.startsWith(SIMULATION_PREFIX), t.action.textKo);
    assert.equal(t.f.state, 'active');
    assert.equal(t.f.sway, opposite(t.f.targetCurve!.turn));
  }
  const kinds = announced.map((t) => (t.action.type === 'announce' ? t.action.kind : ''));
  assert.deepEqual(kinds, Array.from({ length: laps }, () => ['pre-warning', 'now']).flat());
  const pre = announced[0]!;
  assert.ok(pre.f.etaWindowS!.min <= 10 && pre.f.etaWindowS!.min >= 3);
  assert.ok(pre.s > sim.runStartS && pre.s < sim.runEndS);
});

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

test('flags: default ON, "0"/"false" turn each off; voice flag off means unavailable', async () => {
  const names = ['LIVE_TRAINS', 'PHYSICS_FORECAST', 'VOICE_GUIDANCE', 'HAPTICS', 'SIMULATION_FALLBACK', 'MOTION_SENSOR'] as const;
  const load = async (tag: string) => {
    // A query string forces a fresh module instance that re-reads process.env.
    const spec = `../config/flags.ts?${tag}`;
    return ((await import(spec)) as typeof import('../config/flags.ts')).FLAGS;
  };
  for (const n of names) delete process.env[`EXPO_PUBLIC_FLAG_${n}`];
  assert.ok(Object.values(await load('default')).every(Boolean));

  process.env.EXPO_PUBLIC_FLAG_LIVE_TRAINS = '0';
  process.env.EXPO_PUBLIC_FLAG_PHYSICS_FORECAST = 'false';
  process.env.EXPO_PUBLIC_FLAG_VOICE_GUIDANCE = '0';
  process.env.EXPO_PUBLIC_FLAG_HAPTICS = '0';
  process.env.EXPO_PUBLIC_FLAG_SIMULATION_FALLBACK = '0';
  process.env.EXPO_PUBLIC_FLAG_MOTION_SENSOR = '0';
  try {
    assert.ok(Object.values(await load('off')).every((v) => v === false));
  } finally {
    for (const n of names) delete process.env[`EXPO_PUBLIC_FLAG_${n}`];
  }

  // Live flag off: banner switches to simulation wording, never "live".
  assert.equal(feedBanner(feedFromSnapshot(ok(LIVE)), false).kind, 'simulation');
  assert.equal(
    resolveAvailability({ flagOn: false, platform: 'ios', speechApi: true, voices: null }).available,
    false,
  );
});
