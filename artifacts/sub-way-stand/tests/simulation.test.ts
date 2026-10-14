// Simulated ride tests (deterministic, no network). Run with the mobile `test` script.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CurveFeature, RouteData, RouteSegment } from '../contracts/index.ts';
import {
  SIM_TIMING,
  SYNTHETIC_SEGMENT,
  buildSimRide,
  pickSimulationSegment,
  simState,
  simulateForecast,
} from '../lib/simulationRide.ts';
import { timeAt } from '../lib/forecastProfile.ts';

const NOW = Date.parse('2026-10-14T10:00:00+09:00');

const curve = (id: string, startOffsetM: number, turn: CurveFeature['turn'], radiusM = 400): CurveFeature => ({
  id,
  startOffsetM,
  lengthM: 150,
  radiusM,
  turn,
  source: 'curated',
  confidence: 'medium',
});

const seg = (from: string, to: string, lengthM: number, curves: CurveFeature[]): RouteSegment => ({
  id: `L2-1-${from}-${to}`,
  from,
  to,
  directionCode: '1',
  lengthM,
  curves,
});

const LINE2: RouteData = {
  line: 2,
  name: '2호선',
  loop: true,
  stations: [],
  segments: [
    seg('갑', '을', 900, []),
    seg('을', '병', 1100, [curve('k1', 350, 'left')]),
    seg('병', '정', 1300, [curve('k2', 300, 'right', 350), curve('k3', 800, 'left', 500)]),
  ],
  origin: 'curated',
  sourceNote: 'test',
};

test('picks the Line 2 segment with the most curves; falls back to the synthetic segment', () => {
  const pick = pickSimulationSegment(LINE2);
  assert.equal(pick.usesRouteData, true);
  assert.equal(pick.segment.id, 'L2-1-병-정');
  assert.equal(pick.label, '2호선 병→정');
  for (const route of [null, { ...LINE2, segments: [seg('갑', '을', 900, [])] }]) {
    const p = pickSimulationSegment(route);
    assert.equal(p.usesRouteData, false);
    assert.equal(p.segment, SYNTHETIC_SEGMENT);
  }
  assert.ok(SYNTHETIC_SEGMENT.curves.length >= 2);
  assert.ok(SYNTHETIC_SEGMENT.curves.every((c) => c.source === 'synthetic'));
});

test('timeline: stop → accelerate → curve → brake → stop, and it loops', () => {
  const ride = buildSimRide(LINE2);
  assert.equal(simState(ride, 0).phase, 'dwell-start');
  assert.equal(simState(ride, SIM_TIMING.dwellStartS + 1).phase, 'run');
  assert.equal(simState(ride, ride.durationS - 1).phase, 'dwell-end');
  assert.equal(simState(ride, ride.durationS - 1).positionM, ride.segment.lengthM);
  // Speed rises, plateaus, then falls back to 0.
  const speeds = Array.from({ length: ride.durationS }, (_, t) => simState(ride, t).speedMs);
  const peakIdx = speeds.indexOf(Math.max(...speeds));
  for (let t = SIM_TIMING.dwellStartS + 1; t < peakIdx; t++) assert.ok(speeds[t]! >= speeds[t - 1]!);
  assert.equal(speeds[0], 0);
  assert.equal(speeds[ride.durationS - 1], 0);
  // Loops.
  assert.deepEqual(simState(ride, 17.5), simState(ride, 17.5 + ride.durationS));
});

test('every frame of the loop is labeled simulation and follows the contract', () => {
  const ride = buildSimRide(LINE2);
  for (let t = 0; t <= ride.durationS; t += 0.5) {
    const f = simulateForecast(ride, t, NOW);
    assert.equal(f.source, 'simulation');
    assert.ok(f.explanationKo[0]!.startsWith('[시뮬레이션]'), `t=${t}`);
    assert.ok(f.explanationKo.length >= 1 && f.explanationKo.length <= 4);
    if (f.state === 'active') {
      assert.equal(f.suppressReason, null);
      assert.ok(f.etaWindowS!.min >= 0 && f.etaWindowS!.min <= f.etaWindowS!.max);
      assert.notEqual(f.sway, 'none');
      assert.ok(f.explanationKo.length >= 2);
    } else {
      assert.notEqual(f.suppressReason, null);
      assert.equal(f.etaWindowS, null);
    }
  }
});

test('stationary phases are suppressed; curves get the right sway and a counting-down ETA', () => {
  const ride = buildSimRide(LINE2);
  const start = simulateForecast(ride, 1, NOW);
  assert.equal(start.state, 'suppressed');
  assert.equal(start.suppressReason, 'stationary');
  const end = simulateForecast(ride, ride.durationS - 0.5, NOW);
  assert.equal(end.suppressReason, 'stationary');

  // Approaching k2 (right curve) → passenger leans left, ETA shrinks each second.
  const t0 = SIM_TIMING.dwellStartS + 3;
  const a = simulateForecast(ride, t0, NOW);
  const b = simulateForecast(ride, t0 + 1, NOW);
  assert.equal(a.state, 'active');
  assert.equal(a.targetCurve?.id, 'k2');
  assert.equal(a.sway, 'left');
  assert.ok(b.etaWindowS!.max < a.etaWindowS!.max && b.etaWindowS!.min < a.etaWindowS!.min);
  assert.equal(a.segment?.id, 'L2-1-병-정');

  // Inside k2 → ETA {0,0}; after k2 the next target is k3 (left curve → lean right).
  const inK2 = ride.runStartS + (timeAt(ride.profile, 300) + timeAt(ride.profile, 450)) / 2;
  assert.deepEqual(simulateForecast(ride, inK2, NOW).etaWindowS, { min: 0, max: 0 });
  const afterK2 = ride.runStartS + timeAt(ride.profile, 500);
  const next = simulateForecast(ride, afterK2, NOW);
  assert.equal(next.targetCurve?.id, 'k3');
  assert.equal(next.sway, 'right');

  // After the last curve, braking → no curve ahead.
  const braking = ride.runStartS + timeAt(ride.profile, 1200);
  assert.equal(simulateForecast(ride, braking, NOW).suppressReason, 'no-curve-ahead');
});

test('deterministic: same elapsed time → same forecast', () => {
  const r1 = buildSimRide(LINE2);
  const r2 = buildSimRide(LINE2);
  for (const t of [0, 12.3, 30, 61.7]) {
    assert.deepEqual(simulateForecast(r1, t, NOW), simulateForecast(r2, t, NOW));
  }
});

test('synthetic fallback ride plays a left then a right curve', () => {
  const ride = buildSimRide(null);
  const turns: string[] = [];
  for (let t = 0; t < ride.durationS; t++) {
    const f = simulateForecast(ride, t, NOW);
    const turn = f.targetCurve?.turn;
    if (turn && turns[turns.length - 1] !== turn) turns.push(turn);
  }
  assert.deepEqual(turns, ['left', 'right']);
  assert.ok(simulateForecast(ride, 20, NOW).explanationKo[0]!.includes('가상 구간'));
});
