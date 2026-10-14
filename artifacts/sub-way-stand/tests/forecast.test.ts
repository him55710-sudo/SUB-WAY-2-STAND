// Forecast engine tests (no network). Run with the mobile `test` script.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CurveFeature, FindSegment, Forecast, RouteData, RouteSegment, TrainCandidate } from '../contracts/index.ts';
// data/routes.ts value-imports via the `@/` alias (Metro only), so build the
// bundled Line 2 route from its Node-loadable sources the same way it does.
import { LINE2_ALIASES, LINE2_LOOP_LENGTH_M, LINE2_MAIN_LOOP } from '../data/line2.ts';
import { buildLoopRoute, findSegmentInRoute } from '../data/routeGeometry.ts';
import {
  AGE_CONFIDENCE_S,
  DEPARTURE_LAG_S,
  HOLD_RATE,
  MAX_ACTIVE_SPREAD_S,
  STALE_AFTER_S,
  ageConfidence,
  computeLiveForecast,
  isVerifiedCurve,
  minConfidence,
  newerObservation,
  outwardRange,
  safeForecast,
  spreadConfidence,
} from '../lib/forecastEngine.ts';
import {
  SPEED_BAND,
  makeProfile,
  peakSpeedOver,
  positionAt,
  speedAt,
  timeAt,
} from '../lib/forecastProfile.ts';

// ---------------------------------------------------------------------------
// Fixtures — an invented 3-segment line, direction "1": A → B → C → D
// ---------------------------------------------------------------------------

const curve = (over: Partial<CurveFeature> = {}): CurveFeature => ({
  id: 'c1',
  startOffsetM: 400,
  lengthM: 150,
  radiusM: 400,
  cantRad: 0, // Explicitly level track in this invented test fixture.
  turn: 'left',
  source: 'curated',
  confidence: 'high',
  ...over,
});

const seg = (from: string, to: string, lengthM: number, curves: CurveFeature[]): RouteSegment => ({
  id: `T-1-${from}-${to}`,
  from,
  to,
  directionCode: '1',
  lengthM,
  curves,
});

const SEGMENTS: RouteSegment[] = [
  seg('A', 'B', 1000, [curve()]),
  seg('B', 'C', 900, [curve({ id: 'c2', startOffsetM: 300, radiusM: 350, turn: 'right' })]),
  seg('C', 'D', 800, []),
];

const finder =
  (segments: RouteSegment[]): FindSegment =>
  (_line, station, dir, end) =>
    segments.find((s) => s.directionCode === dir && (end === 'into' ? s.to === station : s.from === station)) ??
    null;

const NOW = Date.parse('2026-10-14T10:00:00+09:00');

const train = (over: Partial<TrainCandidate> = {}, ageS = 0): TrainCandidate => ({
  id: '2041',
  line: 2,
  station: 'A',
  direction: '외선',
  directionCode: '1',
  destination: 'D',
  state: '출발',
  stateCode: '2',
  observedAt: new Date(NOW - ageS * 1000).toISOString(),
  fresh: true,
  express: false,
  lastTrain: false,
  origin: 'live',
  ...over,
});

type RouteMeta = Pick<RouteData, 'origin' | 'sourceNote'>;
const CURATED: RouteMeta = { origin: 'curated', sourceNote: 'test' };

const live = (
  t: TrainCandidate | null,
  opts: { segments?: RouteSegment[]; now?: number; route?: RouteMeta | null; lost?: boolean } = {},
) =>
  computeLiveForecast({
    train: t,
    nowMs: opts.now ?? NOW,
    route: opts.route === undefined ? CURATED : opts.route,
    findSegment: finder(opts.segments ?? SEGMENTS),
    lost: opts.lost,
  });

function assertContract(f: Forecast) {
  if (f.state === 'suppressed') {
    assert.notEqual(f.suppressReason, null);
    assert.equal(f.sway, 'none');
    assert.equal(f.etaWindowS, null);
    assert.equal(f.lateralAccelMs2, null);
    assert.equal(f.targetCurve, null);
    assert.equal(f.confidence, 'unavailable');
    assert.ok(f.explanationKo.length >= 1 && f.explanationKo.length <= 4);
  } else {
    assert.equal(f.suppressReason, null);
    assert.notEqual(f.sway, 'none');
    assert.ok(f.etaWindowS && f.etaWindowS.min >= 0 && f.etaWindowS.min <= f.etaWindowS.max);
    assert.ok(f.lateralAccelMs2 && f.lateralAccelMs2.min <= f.lateralAccelMs2.max);
    assert.ok(f.positionM && f.positionM.min <= f.positionM.max);
    assert.notEqual(f.confidence, 'unavailable');
    assert.ok(f.explanationKo.length >= 2 && f.explanationKo.length <= 4);
  }
  assert.ok(!Number.isNaN(Date.parse(f.computedAt)));
}

const near = (a: number, b: number, eps = 0.051) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// Speed profile
// ---------------------------------------------------------------------------

test('speed profile: time/position are inverse and FAST is never slower than SLOW', () => {
  const fast = makeProfile(1000, SPEED_BAND.fast);
  const slow = makeProfile(1000, SPEED_BAND.slow);
  for (const s of [0, 1, 50, 162, 400, 700, 900, 999, 1000]) {
    assert.ok(near(positionAt(fast, timeAt(fast, s)), s, 1e-6), `fast ${s}`);
    assert.ok(near(positionAt(slow, timeAt(slow, s)), s, 1e-6), `slow ${s}`);
    assert.ok(timeAt(fast, s) <= timeAt(slow, s) + 1e-9);
    assert.ok(speedAt(fast, s) >= speedAt(slow, s) - 1e-9);
  }
  assert.equal(speedAt(fast, 0), 0);
  assert.equal(speedAt(fast, 1000), 0);
  assert.equal(fast.peak, SPEED_BAND.fast.cruise);
});

test('speed profile: short segments never reach cruise speed', () => {
  const p = makeProfile(150, SPEED_BAND.fast);
  assert.ok(p.peak < SPEED_BAND.fast.cruise);
  assert.ok(near(p.accelDist + p.brakeDist, 150, 1e-9));
  assert.ok(near(peakSpeedOver(p, 0, 150), p.peak, 1e-9));
});

// ---------------------------------------------------------------------------
// Active live estimate
// ---------------------------------------------------------------------------

test('출발 at A: next curve ahead with sway opposite to the turn, ETA, accel, confidence, Korean lines', () => {
  const f = live(train({}, 10));
  assertContract(f);
  assert.equal(f.state, 'active');
  assert.equal(f.source, 'live-estimate');
  assert.equal(f.segment?.id, 'T-1-A-B');
  assert.equal(f.targetCurve?.id, 'c1');
  assert.equal(f.sway, 'right'); // left curve → passenger leans right
  assert.ok(f.lateralAccelMs2!.min >= 0.15);
  assert.ok(f.explanationKo.some((l) => l.includes('A→B') && l.includes('반경 400m') && l.includes('좌곡선')));
  assert.ok(f.explanationKo.some((l) => l.includes('km/h') && l.includes('m/s²')));
  assert.ok(f.explanationKo.some((l) => l.startsWith('근거') && l.includes('실시간')));
});

test('ETA window bounds = [fast entry − (age + lag), slow entry − age + hold]', () => {
  const age = 10;
  const f = live(train({}, age));
  const fast = makeProfile(1000, SPEED_BAND.fast);
  const slow = makeProfile(1000, SPEED_BAND.slow);
  const expMin = timeAt(fast, 400) - age - DEPARTURE_LAG_S;
  const expMax = timeAt(slow, 400) - age + HOLD_RATE * age;
  assert.ok(f.etaWindowS!.min <= expMin && expMin - f.etaWindowS!.min < 0.1);
  assert.ok(f.etaWindowS!.max >= expMax && f.etaWindowS!.max - expMax < 0.1);
  // This entire curve is on both cruise plateaus (11–18 m/s on R400).
  assert.ok(near(f.lateralAccelMs2!.min, (11 * 11) / 400, 0.006));
  assert.ok(near(f.lateralAccelMs2!.max, (18 * 18) / 400, 0.006));
});

test('a verified live curve without cant is held instead of assuming level track', () => {
  const f = live(train({}, 3), {
    segments: [seg('A', 'B', 1000, [curve({ cantRad: undefined })])],
  });
  assert.equal(f.suppressReason, 'low-confidence');
  assert.equal(f.sway, 'none');
  assert.ok(f.explanationKo.some((line) => line.includes('캔트')));
});

test('curve entry speed below cant balance is included even when both peak speeds exceed balance', () => {
  // Old peak-only envelope [11,18] missed the inward push near entry (~3.46 m/s).
  const f = live(train({}, 0), {
    segments: [seg('A', 'B', 1000, [curve({ startOffsetM: 10, lengthM: 300, cantRad: 0.01 })])],
  });
  assert.equal(f.suppressReason, 'low-confidence');
  assert.equal(f.sway, 'none');
});

test('displayed intervals contain raw values rather than rounding uncertainty away', () => {
  for (const r of [{ min: 0.154, max: 0.156 }, { min: 2.049, max: 8.051 }, { min: 0, max: 0 }]) {
    for (const digits of [1, 2]) {
      const out = outwardRange(r, digits);
      assert.ok(out.min <= r.min && out.max >= r.max);
      assert.ok(r.min - out.min < 10 ** -digits + 1e-12);
      assert.ok(out.max - r.max < 10 ** -digits + 1e-12);
    }
  }
});

test('right curve → passenger leans left', () => {
  const f = live(train({ station: 'B' }, 5));
  assert.equal(f.state, 'active');
  assert.equal(f.targetCurve?.turn, 'right');
  assert.equal(f.sway, 'left');
});

test('ETA counts down every second while uncertainty widens with observation age', () => {
  const t = train({}, 0);
  const frames = [0, 1, 2, 3, 4, 5].map((s) => live(t, { now: NOW + s * 1000 }));
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!.etaWindowS!;
    const b = frames[i]!.etaWindowS!;
    assert.ok(near(a.min - b.min, 1), `min drops 1 s/s (${a.min}→${b.min})`);
    assert.ok(near(a.max - b.max, 1 - HOLD_RATE), `max drops slower (${a.max}→${b.max})`);
    assert.ok(b.max - b.min > a.max - a.min, 'spread grows');
  }
});

test('confidence: capped by curve data and downgraded as the observation ages', () => {
  assert.equal(minConfidence('high', 'medium', 'low'), 'low');
  assert.equal(minConfidence('high', 'high'), 'high');
  assert.equal(ageConfidence(AGE_CONFIDENCE_S.high), 'high');
  assert.equal(ageConfidence(AGE_CONFIDENCE_S.high + 1), 'medium');
  assert.equal(ageConfidence(AGE_CONFIDENCE_S.medium + 1), 'low');
  assert.equal(spreadConfidence(3), 'high');
  assert.equal(spreadConfidence(8), 'medium');
  assert.equal(spreadConfidence(20), 'low');
  assert.equal(spreadConfidence(MAX_ACTIVE_SPREAD_S + 1), 'unavailable');

  // Short spread on a high-confidence curve → high, then lower with age.
  const close = [seg('A', 'B', 1000, [curve({ startOffsetM: 40, lengthM: 200, radiusM: 300 })])];
  const fresh = live(train({}, 0), { segments: close });
  assert.equal(fresh.state, 'active');
  assert.equal(fresh.confidence, 'medium'); // ≥ 5 s departure-report lag keeps live below high
  const lowData = live(train({}, 0), {
    segments: [seg('A', 'B', 1000, [curve({ startOffsetM: 40, lengthM: 200, radiusM: 300, confidence: 'low' })])],
  });
  assert.equal(lowData.confidence, 'low');
  const rank = { unavailable: 0, low: 1, medium: 2, high: 3 } as const;
  const conf = [0, 35, 70].map((age) => live(train({}, age)).confidence);
  for (let i = 1; i < conf.length; i++) assert.ok(rank[conf[i]!] <= rank[conf[i - 1]!], conf.join(','));
  const aged = live(train({}, AGE_CONFIDENCE_S.medium + 5));
  if (aged.state === 'active') assert.equal(aged.confidence, 'low');
});

test('a newer observation resets the estimate; older out-of-order ones are ignored', () => {
  const old = train({ station: 'A', stateCode: '2', state: '출발' }, 60);
  const fresh = train({ station: 'B', stateCode: '2', state: '출발' }, 2);
  assert.equal(newerObservation(old, fresh), fresh);
  assert.equal(newerObservation(fresh, old), fresh);
  assert.equal(newerObservation(null, old), old);
  assert.equal(newerObservation(old, null), old);
  const before = live(newerObservation(null, old));
  const after = live(newerObservation(old, fresh));
  assert.equal(after.state, 'active');
  assert.equal(after.segment?.id, 'T-1-B-C');
  assert.equal(after.targetCurve?.id, 'c2');
  assert.ok(after.positionM!.max < 50, 'position restarts near B');
  assert.notDeepEqual(before.etaWindowS, after.etaWindowS);
});

test('전역출발 uses the segment INTO the station; 진입 waits for dwell then the next segment', () => {
  const into = live(train({ station: 'B', stateCode: '3', state: '전역출발' }, 5));
  assert.equal(into.segment?.id, 'T-1-A-B');
  assert.equal(into.targetCurve?.id, 'c1');

  const entering = live(train({ station: 'B', stateCode: '0', state: '진입' }, 5));
  // Not departed yet: estimated at B, waiting for arrival + dwell before B→C.
  assert.equal(entering.segment?.id, 'T-1-B-C');
  assert.deepEqual(entering.positionM, { min: 0, max: 0 });
  // Arrival + dwell (25–55 s) makes the window wider than the 30 s limit.
  assert.equal(entering.suppressReason, 'low-confidence');
  assert.ok(entering.explanationKo.some((l) => l.includes('B→C')));
});

test('looks one segment ahead once the current segment has no curve left', () => {
  // 85 s after leaving A even the slow case has passed c1, so the next curve is c2 on B→C.
  const f = live(train({ station: 'A' }, 85));
  assertContract(f);
  assert.equal(f.state, 'suppressed'); // arrival + dwell at B make it too uncertain
  assert.equal(f.suppressReason, 'low-confidence');
  assert.equal(f.segment?.id, 'T-1-A-B'); // where the train is now
  assert.ok(f.explanationKo.some((l) => l.includes('다음 B→C')));
  // Past the last curve before C and nothing after it → no curve ahead.
  const g = live(train({ station: 'C', stateCode: '3', state: '전역출발' }, 70));
  assert.equal(g.suppressReason, 'no-curve-ahead');
});

// ---------------------------------------------------------------------------
// Suppression rules
// ---------------------------------------------------------------------------

test('suppression reasons with Korean explanations', () => {
  const cases: [string, Forecast, Forecast['suppressReason']][] = [
    ['arrived (도착)', live(train({ stateCode: '1', state: '도착' }, 3)), 'stationary'],
    ['stale', live(train({}, STALE_AFTER_S + 1)), 'stale'],
    ['unknown state', live(train({ stateCode: 'unknown', state: '알 수 없음' }, 3)), 'unknown-segment'],
    ['no route data', live(train({}, 3), { route: null }), 'unknown-segment'],
    ['no segment for station', live(train({ station: 'Z' }, 3)), 'unknown-segment'],
    ['bad timestamp', live(train({ observedAt: 'not-a-date' })), 'invalid-input'],
    ['future timestamp', live(train({}, -600)), 'invalid-input'],
    ['invalid curve', live(train({}, 3), { segments: [seg('A', 'B', 1000, [curve({ radiusM: -5 })])] }), 'invalid-input'],
    ['no curves ahead', live(train({ station: 'C' }, 3)), 'no-curve-ahead'],
    ['below comfort threshold', live(train({}, 3), { segments: [seg('A', 'B', 1000, [curve({ radiusM: 5000 })])] }), 'no-curve-ahead'],
    ['train lost', live(train({}, 3), { lost: true }), 'train-lost'],
    ['no observation', live(null), 'feed-unavailable'],
  ];
  for (const [name, f, reason] of cases) {
    assertContract(f);
    assert.equal(f.state, 'suppressed', name);
    assert.equal(f.suppressReason, reason, name);
    assert.ok(f.explanationKo.every((l) => /[가-힣]/.test(l)), `${name}: Korean lines`);
  }
  const weak = live(train({}, 3), { segments: [seg('A', 'B', 1000, [curve({ radiusM: 5000 })])] });
  assert.ok(weak.explanationKo.some((l) => l.includes('안내 표시 기준')));
});

test('small clock skew is tolerated (treated as age 0)', () => {
  const f = live(train({}, -20));
  assert.equal(f.state, 'active');
});

test('cant that may flip the sway direction suppresses as low-confidence', () => {
  // Cruise band 11–18 m/s on R450 with 0.05 rad cant: balance speed ≈ 14.8 m/s lies inside.
  const f = live(train({}, 3), {
    segments: [seg('A', 'B', 1000, [curve({ radiusM: 450, cantRad: 0.05 })])],
  });
  assert.equal(f.state, 'suppressed');
  assert.equal(f.suppressReason, 'low-confidence');
  assert.ok(f.explanationKo.some((l) => l.includes('캔트')));
});

test('cant over-compensating at low speed pushes the passenger toward the curve inside', () => {
  // Curve right after departure: ≤ 12 m/s, below the balance speed → lean toward the turn.
  const f = live(train({}, 0), {
    segments: [seg('A', 'B', 1000, [curve({ startOffsetM: 30, lengthM: 40, radiusM: 450, cantRad: 0.05 })])],
  });
  assert.equal(f.state, 'active');
  assert.equal(f.targetCurve?.turn, 'left');
  assert.equal(f.sway, 'left');
  assert.ok(f.explanationKo.some((l) => l.includes('캔트 반영')));
});

test('very old (but not stale) observations widen past the limit and suppress', () => {
  const far = [seg('A', 'B', 3000, [curve({ startOffsetM: 2500, lengthM: 100 })])];
  const f = live(train({}, 0), { segments: far });
  assert.equal(f.suppressReason, 'low-confidence');
  assert.ok(f.explanationKo.some((l) => l.includes('너무 넓')));
});

test('fixture observations are labeled as not real', () => {
  const f = live(train({ origin: 'fixture' }, 5));
  assert.ok(f.explanationKo.some((l) => l.includes('실제 아님')));
});

test('errors never escape: they become a suppressed forecast', () => {
  const f = safeForecast('live-estimate', NOW, () => {
    throw new Error('boom');
  });
  assertContract(f);
  assert.equal(f.suppressReason, 'invalid-input');
  const g = safeForecast('live-estimate', NOW, () =>
    computeLiveForecast({
      train: train({}, 3),
      nowMs: NOW,
      route: CURATED,
      findSegment: () => {
        throw new Error('route lookup failed');
      },
    }),
  );
  assert.equal(g.state, 'suppressed');
  assert.equal(g.suppressReason, 'invalid-input');
});

// ---------------------------------------------------------------------------
// Live trains never get a direction from unverified geometry (LIVE + HOLD)
// ---------------------------------------------------------------------------

test('only curated route + curated curve counts as verified geometry', () => {
  assert.equal(isVerifiedCurve(curve({ source: 'curated' }), CURATED), true);
  assert.equal(isVerifiedCurve(curve({ source: 'synthetic' }), CURATED), false);
  assert.equal(isVerifiedCurve(curve({ source: 'station-geometry-approx' }), CURATED), false);
  assert.equal(isVerifiedCurve(curve({ source: 'curated' }), { origin: 'fixture' }), false);
  assert.equal(isVerifiedCurve(curve(), null), false);
});

test('fresh live observation + fixture route → held, no direction', () => {
  const f = live(train({}, 3), { route: { origin: 'fixture', sourceNote: 'fixture' } });
  assertContract(f);
  assert.equal(f.state, 'suppressed');
  assert.equal(f.suppressReason, 'low-confidence');
  assert.equal(f.sway, 'none');
  assert.equal(f.segment?.id, 'T-1-A-B'); // position estimate is still provided
  assert.ok(f.explanationKo.some((l) => l.includes('검증')));
});

test('fresh live observation + synthetic or approximate curve on a curated route → held', () => {
  for (const source of ['synthetic', 'station-geometry-approx'] as const) {
    const f = live(train({}, 3), { segments: [seg('A', 'B', 1000, [curve({ source })])] });
    assert.equal(f.state, 'suppressed', source);
    assert.equal(f.suppressReason, 'low-confidence', source);
    assert.equal(f.sway, 'none', source);
    assert.ok(f.explanationKo.some((l) => l.includes('검증된 선로 형상이 아닙니다')), source);
  }
  // An unverified curve ahead blocks a verified one behind it (never skip past it).
  const mixed = live(train({}, 3), {
    segments: [seg('A', 'B', 1000, [curve({ id: 'u', startOffsetM: 200, source: 'synthetic' }), curve({ id: 'v', startOffsetM: 600 })])],
  });
  assert.equal(mixed.state, 'suppressed');
});

test('bundled Line 2 data: a fresh live train is never given a direction from unverified curves', () => {
  const route = buildLoopRoute({
    line: 2,
    name: '2호선',
    stations: LINE2_MAIN_LOOP,
    officialLengthM: LINE2_LOOP_LENGTH_M,
    sourceNote: 'test',
  });
  assert.ok(route.segments.some((s) => s.curves.length > 0), 'route has curves to test against');
  const findSegment: FindSegment = (_line, station, dir, end) =>
    findSegmentInRoute(route, station, dir, end, LINE2_ALIASES);
  let held = 0;
  {
    for (const s of route.segments) {
      for (const [stateCode, state, station] of [
        ['2', '출발', s.from],
        ['3', '전역출발', s.to],
      ] as const) {
        for (const age of [0, 5, 20, 40]) {
          const f = computeLiveForecast({
            train: train({ line: route.line, station, stateCode, state, directionCode: s.directionCode }, age),
            nowMs: NOW,
            route,
            findSegment,
          });
          assertContract(f);
          if (f.state === 'active') {
            assert.ok(isVerifiedCurve(f.targetCurve!, route), `${s.id} ${state} ${age}s: unverified curve made active`);
          } else {
            assert.equal(f.sway, 'none');
            if (f.suppressReason === 'low-confidence') held++;
          }
        }
      }
    }
  }
  assert.ok(held > 0, 'approximate curves ahead are held');
});
