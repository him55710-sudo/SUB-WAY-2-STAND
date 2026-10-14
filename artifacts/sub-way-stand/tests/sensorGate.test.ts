// Phone-sensor gate for live forecasts. Sensor readings here are SYNTHETIC
// (hand-built states, plus one end-to-end run over a generated trace).
// Run: `pnpm --filter @workspace/sub-way-stand test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Forecast, MotionSensorState, SuppressReason, TrainCandidate, TrainMotionState } from '@/contracts';
import {
  GATE_MIN_CONFIDENCE,
  SENSOR_STALE_MS,
  DETECTED_NOT_PREDICTED_KO,
  type SensorGateMemory,
  applySensorGate,
  initialSensorGateMemory,
} from '../lib/sensorGate.ts';
import { SUPPRESS_REASON_KO, decideGuidance, initialGuidanceMemory, planOutput } from '../lib/guidanceRules.ts';
import { createMotionDetector } from '../lib/motionDetector.ts';
import { synthesize } from './support/syntheticMotion.ts';

const T0 = Date.UTC(2026, 9, 14, 8, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

function active(nowMs: number, opts: { etaMin?: number; source?: Forecast['source'] } = {}): Forecast {
  const etaMin = opts.etaMin ?? 8;
  return {
    state: 'active',
    source: opts.source ?? 'live-estimate',
    segment: { id: 'S1', from: '강남', to: '역삼', directionCode: '1', lengthM: 1200, curves: [] },
    positionM: { min: 100, max: 140 },
    targetCurve: {
      id: 'C1',
      startOffsetM: 300,
      lengthM: 150,
      radiusM: 400,
      turn: 'right',
      source: 'station-geometry-approx',
      confidence: 'medium',
    },
    sway: 'left',
    etaWindowS: { min: etaMin, max: etaMin + 4 },
    lateralAccelMs2: { min: 0.3, max: 0.5 },
    confidence: 'medium',
    suppressReason: null,
    explanationKo: ['예측 근거'],
    computedAt: iso(nowMs),
  };
}

function suppressed(nowMs: number, reason: SuppressReason): Forecast {
  return {
    ...active(nowMs),
    state: 'suppressed',
    segment: null,
    positionM: null,
    targetCurve: null,
    sway: 'none',
    etaWindowS: null,
    lateralAccelMs2: null,
    confidence: 'unavailable',
    suppressReason: reason,
  };
}

const STATE_LABEL: Record<TrainCandidate['stateCode'], string> = {
  '0': '진입',
  '1': '도착',
  '2': '출발',
  '3': '전역출발',
  unknown: '알 수 없음',
};

function obs(stateCode: TrainCandidate['stateCode'], observedAtMs: number, id = '2234'): TrainCandidate {
  return {
    id,
    line: 2,
    station: '강남',
    direction: '외선',
    directionCode: '1',
    destination: '성수',
    state: STATE_LABEL[stateCode],
    stateCode,
    observedAt: iso(observedAtMs),
    fresh: true,
    express: false,
    lastTrain: false,
    origin: 'live',
  };
}

function sensor(
  state: TrainMotionState,
  nowMs: number,
  opts: { confidence?: number; quality?: 'good' | 'handling' | 'no-data'; sinceMs?: number; updatedAtMs?: number } = {},
): MotionSensorState {
  return {
    status: 'active',
    state,
    confidence: opts.confidence ?? 0.8,
    quality: opts.quality ?? 'good',
    stateSinceMs: state === 'unknown' ? null : (opts.sinceMs ?? nowMs - 6000),
    forwardAxisCalibrated: false,
    features: null,
    gravitySource: 'device-motion',
    updatedAtMs: opts.updatedAtMs ?? nowMs,
  };
}

const gate = (forecast: Forecast, s: MotionSensorState, o: TrainCandidate | null, nowMs: number, memory: SensorGateMemory = initialSensorGateMemory()) =>
  applySensorGate({ forecast, sensor: s, observation: o, nowMs, memory });

// ---------------------------------------------------------------------------
// Stop between stations
// ---------------------------------------------------------------------------

test('a confident stop between stations (출발 / 전역출발) holds the live forecast as stationary', () => {
  for (const code of ['2', '3'] as const) {
    const now = T0 + 60_000;
    const r = gate(active(now), sensor('stationary', now, { sinceMs: now - 7000 }), obs(code, now - 40_000), now);
    assert.equal(r.effect, 'hold-stationary');
    const f = r.forecast;
    assert.equal(f.state, 'suppressed');
    assert.equal(f.suppressReason, 'stationary');
    assert.equal(f.source, 'live-estimate');
    assert.equal(f.sway, 'none');
    assert.equal(f.etaWindowS, null);
    assert.equal(f.targetCurve, null);
    assert.equal(f.positionM, null);
    assert.equal(f.lateralAccelMs2, null);
    assert.equal(f.confidence, 'unavailable');
    assert.equal(f.computedAt, iso(now));
    assert.ok(f.explanationKo.length > 0 && f.explanationKo.length <= 4);
    assert.ok(f.explanationKo.some((l) => l.includes('센서') && l.includes('감지')), 'says the phone sensor detected it');
    assert.ok(f.explanationKo.includes(DETECTED_NOT_PREDICTED_KO), 'says it is not a prediction');
    assert.ok(f.explanationKo.some((l) => l.includes('7초')), 'says how long the stop has lasted');
    assert.ok(f.explanationKo.some((l) => l.includes(STATE_LABEL[code])), 'names the last observation');
    assert.deepEqual(r.memory.held, { trainId: '2234', line: 2, stopStartMs: now - 7000, restartConfirmedMs: null });
  }
});

test('the hold cancels a pending pre-warning through the existing guidance decision', () => {
  const t1 = T0;
  const t2 = T0 + 1000;
  const o = obs('2', T0 - 30_000);
  // Tick 1: moving train, ETA 8 s → pre-warning goes out.
  const g1 = gate(active(t1), sensor('moving', t1), o, t1);
  assert.equal(g1.effect, 'none');
  const d1 = decideGuidance(initialGuidanceMemory(), g1.forecast, t1);
  assert.equal(d1.action.type, 'announce');
  // Tick 2: the phone confirms the train is standing between stations.
  const g2 = gate(active(t2, { etaMin: 7 }), sensor('stationary', t2), o, t2, g1.memory);
  assert.equal(g2.effect, 'hold-stationary');
  const d2 = decideGuidance(d1.memory, g2.forecast, t2);
  assert.equal(d2.action.type, 'cancel');
  assert.ok(d2.action.type === 'cancel' && d2.action.textKo.includes(SUPPRESS_REASON_KO.stationary));
  assert.deepEqual(planOutput(d2.action, { voiceOn: true, hapticsOn: true }), { stopSpeech: true, speak: null, haptic: null });
  // Tick 3: still held → nothing further is said.
  const g3 = gate(active(t2 + 1000, { etaMin: 6 }), sensor('stationary', t2 + 1000), o, t2 + 1000, g2.memory);
  assert.equal(decideGuidance(d2.memory, g3.forecast, t2 + 1000).action.type, 'none');
});

test('a stop at a station (진입 / 도착) is a normal dwell: no change', () => {
  for (const code of ['0', '1'] as const) {
    const now = T0;
    const f = active(now);
    const m = initialSensorGateMemory();
    const r = gate(f, sensor('stationary', now), obs(code, now - 10_000), now, m);
    assert.equal(r.effect, 'none');
    assert.equal(r.forecast, f, 'same object, untouched');
    assert.equal(r.memory, m);
  }
});

// ---------------------------------------------------------------------------
// Restart → delayed until a newer observation
// ---------------------------------------------------------------------------

test('after the restart the forecast stays delayed until an observation newer than the stop start', () => {
  const o = obs('3', T0 - 50_000);
  const stopStart = T0 - 8000;
  let memory = initialSensorGateMemory();
  const tick = (offS: number, s: MotionSensorState, observation: TrainCandidate = o) => {
    const now = T0 + offS * 1000;
    const r = gate(active(now), s, observation, now, memory);
    memory = r.memory;
    return r;
  };

  assert.equal(tick(0, sensor('stationary', T0, { sinceMs: stopStart })).effect, 'hold-stationary');
  // Renewed motion confirmed.
  const restart = T0 + 20_000;
  const moving = tick(23, sensor('speed-changing', T0 + 23_000, { sinceMs: restart }));
  assert.equal(moving.effect, 'hold-delayed');
  assert.equal(moving.forecast.suppressReason, 'delayed');
  assert.equal(moving.forecast.etaWindowS, null);
  assert.ok(moving.forecast.explanationKo.includes(DETECTED_NOT_PREDICTED_KO));
  assert.deepEqual(memory.held, { trainId: '2234', line: 2, stopStartMs: stopStart, restartConfirmedMs: restart });

  // Still moving, still the old observation → still delayed; the restart time is kept.
  assert.equal(tick(30, sensor('moving', T0 + 30_000, { sinceMs: restart + 3000 })).forecast.suppressReason, 'delayed');
  assert.equal(memory.held?.restartConfirmedMs, restart);
  // Phone handled meanwhile → no decision, the delayed hold stays.
  assert.equal(tick(31, sensor('moving', T0 + 31_000, { quality: 'handling', confidence: 0.4 })).forecast.suppressReason, 'delayed');
  // A re-sent observation older than the stop start does not release it.
  assert.equal(tick(32, sensor('moving', T0 + 32_000), obs('3', stopStart - 1000)).effect, 'hold-delayed');

  // A provider observation newer than the stop start releases the hold.
  const fresh = obs('2', T0 + 33_000);
  const f = active(T0 + 34_000);
  const released = gate(f, sensor('moving', T0 + 34_000), fresh, T0 + 34_000, memory);
  assert.equal(released.effect, 'none');
  assert.equal(released.forecast, f);
  assert.equal(released.memory.held, null);
});

test('a contaminated window neither confirms a restart nor ends the stop hold', () => {
  const now = T0;
  const o = obs('2', now - 60_000);
  const held = gate(active(now), sensor('stationary', now), o, now);
  for (const s of [
    sensor('moving', now + 1000, { quality: 'handling', confidence: 0.3 }),
    sensor('stationary', now + 1000, { quality: 'handling', confidence: 0.3 }),
    sensor('moving', now + 1000, { confidence: GATE_MIN_CONFIDENCE - 0.01 }),
    sensor('moving', now + 1000, { updatedAtMs: now + 1000 - SENSOR_STALE_MS - 1 }),
    sensor('stationary', now + 1000, { quality: 'no-data', confidence: 0.5 }),
  ]) {
    const r = gate(active(now + 1000), s, o, now + 1000, held.memory);
    assert.equal(r.effect, 'hold-stationary');
    assert.equal(r.forecast.suppressReason, 'stationary');
    assert.equal(r.memory, held.memory, 'restart not recorded');
    assert.ok(r.forecast.explanationKo.some((l) => l.includes('판단하지 않습니다')));
  }
});

test('re-applying with the returned memory is stable (same memory object)', () => {
  const now = T0;
  const o = obs('2', now - 60_000);
  const s = sensor('stationary', now);
  const a = gate(active(now), s, o, now);
  const b = gate(active(now), s, o, now, a.memory);
  assert.equal(b.memory, a.memory);
  assert.deepEqual(b.forecast, a.forecast);
});

test('a different train forgets the remembered stop', () => {
  const now = T0;
  const held = gate(active(now), sensor('stationary', now), obs('2', now - 60_000), now);
  const other = obs('3', now - 60_000, '9999');
  const r = gate(active(now + 1000), sensor('moving', now + 1000), other, now + 1000, held.memory);
  assert.equal(r.effect, 'none');
  assert.equal(r.memory.held, null);
});

// ---------------------------------------------------------------------------
// No-ops: the sensor can only hold
// ---------------------------------------------------------------------------

test('an unavailable or starting sensor is a no-op and drops any hold', () => {
  const now = T0;
  const o = obs('2', now - 60_000);
  const held = gate(active(now), sensor('stationary', now), o, now);
  const states: MotionSensorState[] = [
    { status: 'starting' },
    ...(['flag-disabled', 'disabled', 'web', 'no-sensor', 'permission-denied', 'error'] as const).map(
      (reason): MotionSensorState => ({ status: 'unavailable', reason }),
    ),
  ];
  for (const s of states) {
    const f = active(now + 1000);
    const r = gate(f, s, o, now + 1000, held.memory);
    assert.equal(r.effect, 'none');
    assert.equal(r.forecast, f);
    assert.equal(r.memory.held, null);
  }
});

test('without a hold, handling / low confidence / stale / unknown readings pass the forecast through', () => {
  const now = T0;
  const o = obs('2', now - 60_000);
  for (const s of [
    sensor('stationary', now, { quality: 'handling' }),
    sensor('stationary', now, { confidence: GATE_MIN_CONFIDENCE - 0.01 }),
    sensor('stationary', now, { updatedAtMs: now - SENSOR_STALE_MS - 1 }),
    sensor('stationary', now, { quality: 'no-data' }),
    sensor('unknown', now, { confidence: 0 }),
    sensor('moving', now),
    sensor('accelerating', now),
  ]) {
    const f = active(now);
    const m = initialSensorGateMemory();
    const r = gate(f, s, o, now, m);
    assert.equal(r.effect, 'none');
    assert.equal(r.forecast, f);
    assert.equal(r.memory, m);
  }
});

test('the sensor never activates or rewrites an already suppressed forecast', () => {
  const now = T0;
  const o = obs('2', now - 60_000);
  for (const reason of ['no-curve-ahead', 'stale', 'delayed', 'low-confidence'] as const) {
    for (const s of [sensor('stationary', now), sensor('moving', now)]) {
      const f = suppressed(now, reason);
      const r = gate(f, s, o, now);
      assert.equal(r.forecast, f);
      assert.equal(r.effect, 'none');
    }
  }
  // But the stop is still remembered for later ticks.
  assert.notEqual(gate(suppressed(now, 'no-curve-ahead'), sensor('stationary', now), o, now).memory.held, null);
});

test('simulation forecasts are never gated by the real phone', () => {
  const now = T0;
  const held = gate(active(now), sensor('stationary', now), obs('2', now - 60_000), now);
  const f = active(now, { source: 'simulation' });
  for (const s of [sensor('stationary', now), sensor('moving', now)]) {
    const r = gate(f, s, obs('2', now - 60_000), now, held.memory);
    assert.equal(r.forecast, f);
    assert.equal(r.effect, 'none');
    assert.equal(r.memory.held, null);
  }
});

test('no observation, or a bad clock, passes through', () => {
  const now = T0;
  const f = active(now);
  assert.equal(gate(f, sensor('stationary', now), null, now).forecast, f);
  assert.equal(gate(f, sensor('stationary', now), obs('2', now - 1000), Number.NaN).forecast, f);
});

// ---------------------------------------------------------------------------
// End to end over a synthetic trace
// ---------------------------------------------------------------------------

test('synthetic trace: detector → gate holds a stop between stations, then delayed after the restart', () => {
  // Running → braking → 30 s standstill between stations → departure.
  const trace = synthesize([
    { s: 10, vib: 0.25 },
    { s: 4, fwd: -0.8, vib: 0.2 },
    { s: 30, vib: 0.005 },
    { s: 10, fwd: 0.9, vib: 0.25 },
  ]);
  const [, , stopAt, departAt] = trace.phaseStartMs as [number, number, number, number];
  const o = obs('2', trace.phaseStartMs[0]! - 20_000); // last provider observation: 출발, before the stop
  const det = createMotionDetector();
  let memory = initialSensorGateMemory();
  let nextTick = trace.samples[0]!.tMs + 1000;
  const effects: { t: number; effect: string }[] = [];
  for (const s of trace.samples) {
    det.push(s);
    if (s.tMs < nextTick) continue;
    nextTick += 1000; // forecast ticks once a second
    const snap = det.snapshot(s.tMs);
    const reading: MotionSensorState = { status: 'active', ...snap, gravitySource: 'device-motion', updatedAtMs: s.tMs };
    const r = gate(active(s.tMs), reading, o, s.tMs, memory);
    memory = r.memory;
    effects.push({ t: s.tMs, effect: r.effect });
  }
  const runsOf = effects.reduce<string[]>((acc, e) => (acc[acc.length - 1] === e.effect ? acc : [...acc, e.effect]), []);
  assert.deepEqual(runsOf, ['none', 'hold-stationary', 'hold-delayed']);
  const firstHold = effects.find((e) => e.effect === 'hold-stationary')!;
  assert.ok(firstHold.t > stopAt && firstHold.t < stopAt + 10_000, 'stop detected within the standstill');
  assert.ok(effects.filter((e) => e.t < stopAt).every((e) => e.effect === 'none'), 'nothing while running');
  const firstDelayed = effects.find((e) => e.effect === 'hold-delayed')!;
  assert.ok(firstDelayed.t > departAt, 'restart only after the departure');
  assert.ok(memory.held && memory.held.stopStartMs >= stopAt);
});
