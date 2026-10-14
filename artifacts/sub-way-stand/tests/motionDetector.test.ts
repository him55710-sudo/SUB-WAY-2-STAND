// Phone motion detector on SYNTHETIC traces (generated, not recorded rides).
// Run: `pnpm --filter @workspace/sub-way-stand test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrainMotionState } from '@/contracts';
import {
  CONFIDENCE_ON_ENTRY,
  GRAVITY_MS2,
  HANDLING_SETTLE_MS,
  MOVING_ENTER_MS,
  STATIONARY_ENTER_MS,
  STATE_RESET_GAP_MS,
  VIBRATION_WINDOW_MS,
  WARMUP_MS,
  createMotionDetector,
  type DetectorSnapshot,
  type MotionSample,
} from '../lib/motionDetector.ts';
import { GATE_MIN_CONFIDENCE } from '../lib/sensorGate.ts';
import { mount, synthesize, type Phase, type TraceOptions } from './support/syntheticMotion.ts';

type Frame = DetectorSnapshot & { t: number };

/** Feed a synthetic trace; snapshot after every sample. */
function run(phases: Phase[], opts: TraceOptions = {}) {
  const trace = synthesize(phases, opts);
  const det = createMotionDetector();
  const frames: Frame[] = [];
  for (const s of trace.samples) {
    det.push(s);
    frames.push({ ...det.snapshot(s.tMs), t: s.tMs });
  }
  const at = (ms: number) => frames.find((f) => f.t >= ms) ?? frames[frames.length - 1]!;
  const between = (from: number, to: number) => frames.filter((f) => f.t >= from && f.t < to);
  return { trace, det, frames, at, between, last: frames[frames.length - 1]! };
}

/** Collapse a state timeline into its distinct runs. */
const runs = (frames: Frame[]): TrainMotionState[] =>
  frames.reduce<TrainMotionState[]>((acc, f) => (acc[acc.length - 1] === f.state ? acc : [...acc, f.state]), []);

const STILL: Phase = { s: 10, vib: 0.005 };
const CRUISE: Phase = { s: 10, vib: 0.25 };

// ---------------------------------------------------------------------------
// Gravity compensation
// ---------------------------------------------------------------------------

test('synthetic: tilted phone at rest — gravity is removed on both gravity paths', () => {
  const tilted = mount(35, 20, -60);
  for (const deviceGravity of [true, false]) {
    const r = run([{ s: 8, vib: 0.005 }], { mount: tilted, deviceGravity });
    const f = r.last.features!;
    assert.ok(f.sustainedHorizontalMs2 < 0.03, `horizontal ${f.sustainedHorizontalMs2} (deviceGravity=${deviceGravity})`);
    assert.ok(f.vibrationRmsMs2 < 0.03, `vibration ${f.vibrationRmsMs2}`);
    assert.equal(f.rotationRateRadS, 0, 'rotation RMS stays a finite 0 at rest (no float drift below 0)');
    assert.equal(r.last.quality, 'good');
    assert.equal(r.last.state, 'stationary');
    assert.equal(r.last.gravitySource, deviceGravity ? 'device-motion' : 'low-pass');
  }
});

test('synthetic: tilted phone — horizontal acceleration is the true train acceleration, whatever the tilt', () => {
  for (const m of [mount(0, 0, 0), mount(35, 20, -60), mount(-70, 10, 130)]) {
    const r = run([{ s: 3, vib: 0.005 }, { s: 4, fwd: 1.0, vib: 0.005 }], { mount: m });
    const f = r.last.features!;
    assert.ok(Math.abs(f.sustainedHorizontalMs2 - 1.0) < 0.05, `got ${f.sustainedHorizontalMs2}`);
  }
  // Sanity: the raw reading is dominated by gravity, so naive use would be wrong.
  const raw = synthesize([{ s: 1, fwd: 1.0 }], { mount: mount(35, 20, -60) }).samples[0]!.accel;
  assert.ok(Math.abs(Math.hypot(raw.x, raw.y, raw.z) - GRAVITY_MS2) < 0.2);
});

// ---------------------------------------------------------------------------
// Stationary vs running vibration
// ---------------------------------------------------------------------------

test('synthetic: low vibration becomes stationary, running vibration becomes moving', () => {
  const still = run([STILL]);
  assert.deepEqual(runs(still.frames), ['unknown', 'stationary']);
  const entered = still.frames.find((f) => f.state === 'stationary')!;
  assert.ok(entered.t - still.trace.phaseStartMs[0]! >= WARMUP_MS + STATIONARY_ENTER_MS - 50, 'needs warm-up + entry time');
  assert.ok(still.last.confidence > CONFIDENCE_ON_ENTRY);

  const moving = run([CRUISE]);
  assert.deepEqual(runs(moving.frames), ['unknown', 'moving']);
  assert.ok(moving.last.features!.vibrationRmsMs2 > 0.2);
});

test('synthetic: no decision before the windows are full', () => {
  const r = run([{ s: 1.5, vib: 0.005 }]);
  assert.ok(r.frames.every((f) => f.quality === 'no-data' && f.state === 'unknown' && f.confidence === 0));
});

// ---------------------------------------------------------------------------
// Hysteresis
// ---------------------------------------------------------------------------

test('synthetic: short pauses and bumps do not flip the state', () => {
  // Running train that slows to near-silence for 2.5 s, then runs on.
  const pause = run([CRUISE, { s: 2.5, vib: 0.005 }, { s: 6, vib: 0.25 }]);
  assert.deepEqual(runs(pause.frames), ['unknown', 'moving']);

  // Stopped train with a 1.5 s bump (door, someone brushing past).
  const bump = run([STILL, { s: 1.5, vib: 0.3 }, { s: 8, vib: 0.005 }]);
  assert.deepEqual(runs(bump.frames), ['unknown', 'stationary']);
  const since = bump.frames.find((f) => f.state === 'stationary')!.stateSinceMs;
  assert.equal(bump.last.stateSinceMs, since, 'the stop start does not move on a bump');
});

test('synthetic: a real stop and restart each flip once, with the stop start at the start of stillness', () => {
  const r = run([CRUISE, { s: 4, fwd: -0.8, vib: 0.2 }, { s: 12, vib: 0.005 }, { s: 8, fwd: 0.9, vib: 0.25 }]);
  const seq = runs(r.frames).filter((s) => s !== 'unknown');
  assert.deepEqual(seq.filter((s) => s === 'stationary').length, 1);
  assert.equal(seq[0], 'moving');
  assert.ok(seq.includes('stationary'));
  assert.ok(['speed-changing', 'accelerating', 'moving'].includes(seq[seq.length - 1]!));

  const stopAt = r.trace.phaseStartMs[2]!;
  const entered = r.frames.find((f) => f.state === 'stationary')!;
  assert.ok(entered.stateSinceMs! >= stopAt && entered.stateSinceMs! <= stopAt + VIBRATION_WINDOW_MS + 500, 'stop start near the real stop');
  assert.ok(entered.t - entered.stateSinceMs! >= STATIONARY_ENTER_MS - 20);

  const restartAt = r.trace.phaseStartMs[3]!;
  const left = r.frames.find((f) => f.t > restartAt && f.state !== 'stationary')!;
  assert.ok(left.t - restartAt >= MOVING_ENTER_MS - 20, 'leaving the stop needs sustained motion');
  assert.ok(left.t - restartAt < MOVING_ENTER_MS + 1000);
});

// ---------------------------------------------------------------------------
// Handling contamination
// ---------------------------------------------------------------------------

test('synthetic: picking the phone up during a stop freezes the state; confidence decays below the gate threshold', () => {
  // Stopped; rider picks the phone up (rotation + lift shake) while the train starts.
  const r = run([
    STILL,
    { s: 1.2, vib: 0.005, turn: { axis: { x: 1, y: 0.3, z: 0 }, rateRadS: 1.4 }, shake: { amp: 2.5, hz: 3 } },
    { s: 1.0, fwd: 0.9, vib: 0.25 },
    { s: 8, fwd: 0.9, vib: 0.25 },
  ]);
  const pick = r.trace.phaseStartMs[1]!;
  const clean = r.trace.phaseStartMs[3]!;
  const handled = r.between(pick + 100, clean);
  assert.ok(handled.length > 0 && handled.every((f) => f.state === 'stationary'), 'state frozen while handled');
  assert.ok(handled.slice(10).every((f) => f.quality === 'handling'));
  assert.ok(handled[handled.length - 1]!.confidence < GATE_MIN_CONFIDENCE, 'confidence decays');

  // Motion is only confirmed after the settle time plus a full clean evidence run.
  const left = r.frames.find((f) => f.t > pick && f.state !== 'stationary')!;
  const lastHandled = [...r.frames].reverse().find((f) => f.quality === 'handling')!;
  assert.ok(left.t - lastHandled.t >= MOVING_ENTER_MS - 20, `left after ${left.t - lastHandled.t} ms of clean data`);
});

test('synthetic: rotating the phone while the train brakes to a stop makes no stop decision from that window', () => {
  const r = run([
    CRUISE,
    { s: 3, fwd: -0.8, vib: 0.2, turn: { axis: { x: 0, y: 0, z: 1 }, rateRadS: 0.9 } },
    { s: 1.5, vib: 0.005, turn: { axis: { x: 0, y: 1, z: 0 }, rateRadS: 0.9 } },
    { s: 8, vib: 0.005 },
  ]);
  const rotStart = r.trace.phaseStartMs[1]!;
  const rotEnd = r.trace.phaseStartMs[3]!;
  assert.ok(r.between(rotStart + 200, rotEnd + HANDLING_SETTLE_MS - 20).every((f) => f.state === 'moving'));
  const entered = r.frames.find((f) => f.state === 'stationary')!;
  assert.ok(entered.t >= rotEnd + HANDLING_SETTLE_MS + STATIONARY_ENTER_MS - 50, 'needs a clean stillness run after handling');
  assert.ok(entered.stateSinceMs! >= rotEnd + HANDLING_SETTLE_MS - 50, 'stop start never inside the contaminated window');
});

test('synthetic: rotation alone (about the vertical: no tilt change, no shake) is handling', () => {
  const r = run([STILL, { s: 2, vib: 0.005, turn: { axis: { x: 0, y: 0, z: 1 }, rateRadS: 0.8 } }, { s: 1, vib: 0.005 }], {
    mount: mount(0, 0, 0),
  });
  const turning = r.between(r.trace.phaseStartMs[1]! + 600, r.trace.phaseStartMs[2]!);
  assert.ok(turning.every((f) => f.quality === 'handling' && f.features!.tiltChangeDeg < 1));
  assert.ok(turning.every((f) => f.features!.rotationRateRadS > 0.7));
  assert.equal(r.last.quality, 'handling', 'still settling 1 s after the rotation');
});

test('synthetic: carrying the phone while walking on a stopped train is handling, never motion', () => {
  const r = run([STILL, { s: 8, vib: 0.005, shake: { amp: 2.5, hz: 2 }, turn: { axis: { x: 0.5, y: 1, z: 0 }, rateRadS: 0.8 } }]);
  const walk = r.between(r.trace.phaseStartMs[1]! + 300, r.trace.endMs);
  assert.ok(walk.every((f) => f.state === 'stationary' && f.quality === 'handling'));
});

// ---------------------------------------------------------------------------
// Forward axis
// ---------------------------------------------------------------------------

const DEPART = (s = 10): Phase => ({ s, fwd: 1.0, vib: 0.2 });

test('synthetic: forward axis learned after a stop → move transition gives accelerating / decelerating', () => {
  const r = run([STILL, DEPART(), { s: 8, vib: 0.2 }, { s: 6, lat: 0.6, vib: 0.2, yawRate: 0.05 }, { s: 8, fwd: -0.9, vib: 0.2 }]);
  const [, depart, cruise, curve, brake] = r.trace.phaseStartMs as [number, number, number, number, number];
  const departing = r.between(depart, cruise);
  // Before the axis exists the sign is unknown.
  const firstMoving = departing.find((f) => f.state !== 'stationary')!;
  assert.equal(firstMoving.state, 'speed-changing');
  assert.equal(firstMoving.forwardAxisCalibrated, false);
  assert.equal(r.at(cruise - 20).state, 'accelerating');
  assert.equal(r.at(cruise - 20).forwardAxisCalibrated, true);
  assert.equal(r.at(curve - 20).state, 'moving');
  // Lateral (curve) acceleration with a calibrated axis is not a speed change;
  // the slow train yaw does not invalidate the axis.
  assert.ok(r.between(curve + 2500, brake).every((f) => f.state === 'moving' && f.forwardAxisCalibrated));
  assert.equal(r.last.state, 'decelerating');
  assert.ok(r.last.forwardAxisCalibrated);
});

test('synthetic: rotating the phone invalidates the forward axis → speed-changing again', () => {
  const r = run([STILL, DEPART(), { s: 1, fwd: -0.9, vib: 0.2, turn: { axis: { x: 0, y: 0, z: 1 }, rateRadS: 0.8 } }, { s: 8, fwd: -0.9, vib: 0.2 }]);
  const rotate = r.trace.phaseStartMs[2]!;
  assert.equal(r.at(rotate - 20).forwardAxisCalibrated, true);
  assert.equal(r.at(rotate + 1000).forwardAxisCalibrated, false);
  assert.equal(r.last.state, 'speed-changing');
  assert.equal(r.last.forwardAxisCalibrated, false);
});

test('synthetic: without a gyroscope the axis is never learned', () => {
  const r = run([STILL, DEPART(), { s: 8, fwd: -0.9, vib: 0.2 }], { gyro: false });
  assert.ok(r.frames.every((f) => !f.forwardAxisCalibrated));
  assert.ok(!r.frames.some((f) => f.state === 'accelerating' || f.state === 'decelerating'));
  assert.equal(r.last.state, 'speed-changing');
});

test('synthetic: no axis is learned without a confirmed stop first', () => {
  const r = run([DEPART(14)]);
  assert.ok(r.frames.every((f) => !f.forwardAxisCalibrated));
  assert.equal(r.last.state, 'speed-changing');
});

// ---------------------------------------------------------------------------
// Gaps + robustness
// ---------------------------------------------------------------------------

test('synthetic: silence reads as no-data, a long gap resets to unknown', () => {
  const r = run([STILL]);
  const end = r.trace.endMs;
  assert.equal(r.det.snapshot(end + 500).quality, 'good');
  const silent = r.det.snapshot(end + 2000);
  assert.equal(silent.quality, 'no-data');
  assert.equal(silent.state, 'stationary');
  assert.ok(silent.confidence < r.last.confidence);
  const gone = r.det.snapshot(end + STATE_RESET_GAP_MS + 1);
  assert.equal(gone.state, 'unknown');
  assert.equal(gone.confidence, 0);

  // Data resumes after a long gap: warm-up again from unknown.
  const later = synthesize([{ s: 1, vib: 0.005 }], { t0Ms: end + 60_000 });
  for (const s of later.samples) r.det.push(s);
  const snap = r.det.snapshot(later.endMs);
  assert.equal(snap.state, 'unknown');
  assert.equal(snap.quality, 'no-data');
});

test('invalid or out-of-order samples are ignored', () => {
  const det = createMotionDetector();
  const ok: MotionSample = { tMs: 1000, accel: { x: 0, y: 0, z: GRAVITY_MS2 } };
  det.push(ok);
  det.push({ tMs: 1000, accel: { x: 5, y: 5, z: 5 } });
  det.push({ tMs: 900, accel: { x: 5, y: 5, z: 5 } });
  det.push({ tMs: 1020, accel: { x: Number.NaN, y: 0, z: 9.8 } });
  det.push({ tMs: Number.POSITIVE_INFINITY, accel: { x: 0, y: 0, z: 9.8 } });
  assert.equal(det.snapshot(1000).lastSampleMs, 1000);
  assert.deepEqual(createMotionDetector().snapshot(0).state, 'unknown');
});
