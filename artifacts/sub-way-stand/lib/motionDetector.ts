/**
 * Train-motion detector over the rider's phone accelerometer + gyroscope
 * (pure; no React / React Native / timers). Owner: motion-sensing task.
 *
 * It DETECTS what the train is doing now (in particular an ongoing stop). It
 * never predicts a stop, and its output is never used as a measured train
 * speed or acceleration for the physics.
 *
 * Pipeline per sample (≈50 Hz):
 * 1. Gravity: the OS sensor-fusion gravity vector when the sample carries one
 *    (device motion), otherwise a first-order low-pass of the raw
 *    acceleration (faster while the phone is being handled, so it re-tracks a
 *    new orientation).
 * 2. Linear acceleration = acceleration − gravity, split into a vertical part
 *    (along gravity) and a horizontal-plane part.
 * 3. Window features: running-vibration RMS (spread of the linear
 *    acceleration), sustained horizontal acceleration (window mean), gyro
 *    rotation RMS, short-window shake and gravity-direction change.
 * 4. Quality: `handling` while rotation / tilt change / shake exceed their
 *    thresholds and for HANDLING_SETTLE_MS afterwards (long enough that no
 *    decision window still contains a contaminated sample); `no-data` while
 *    warming up or after a sample gap; otherwise `good`.
 * 5. Hysteresis: `stationary` needs low vibration AND low horizontal
 *    acceleration for STATIONARY_ENTER_MS at good quality; leaving it needs
 *    motion evidence for MOVING_ENTER_MS. Evidence runs restart after any
 *    handling, so no stop / restart decision is made from a contaminated
 *    window. While handled the state is frozen and confidence decays.
 * 6. Forward axis: learned from the sustained horizontal acceleration right
 *    after a confirmed stationary → moving transition (a departing train
 *    accelerates forward). Invalidated when the phone rotates past
 *    FORWARD_AXIS_MAX_ROTATION_DEG, after a sample gap, or without a gyro
 *    (yaw could not be seen). Only with an axis is sustained acceleration
 *    signed as accelerating / decelerating; otherwise it is `speed-changing`
 *    (which in a curve can also be lateral acceleration).
 *
 * THRESHOLDS ARE UNCALIBRATED DEFAULTS. They are plausible orders of
 * magnitude for a phone on a metro train, chosen by hand; none was fitted to
 * Seoul (or any) recorded rides. See docs/MOTION_SENSING.md.
 *
 * Axis sign conventions differ between platforms; every rule here uses
 * magnitudes, angles or directions learned from the same stream, so a global
 * sign flip of the accelerometer or gyroscope does not change the output.
 *
 * Type-only imports from contracts so it runs under `node --test`.
 */
import type {
  MotionFeatures,
  MotionReading,
  MotionSensorQuality,
  TrainMotionState,
} from '@/contracts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MotionSample {
  /** Epoch ms of the measurement. Non-increasing timestamps are ignored. */
  tMs: number;
  /** Acceleration INCLUDING gravity, device frame, m/s². */
  accel: Vec3;
  /** OS-separated gravity (device motion), device frame, m/s². null → low-pass estimate. */
  gravity?: Vec3 | null;
  /** Rotation rate, device frame, rad/s. null → no gyroscope. */
  gyro?: Vec3 | null;
}

export type GravitySource = 'device-motion' | 'low-pass';

export interface DetectorSnapshot extends MotionReading {
  gravitySource: GravitySource | null;
  /** Timestamp of the last accepted sample. */
  lastSampleMs: number | null;
}

// ---------------------------------------------------------------------------
// Thresholds — UNCALIBRATED DEFAULTS (hand-picked, not fitted to Seoul data)
// ---------------------------------------------------------------------------

export const GRAVITY_MS2 = 9.80665;

/** Low-pass time constant of the fallback gravity estimate. */
export const GRAVITY_LP_TAU_S = 2;
/** Faster gravity low-pass while the phone is handled (re-tracks orientation). */
export const GRAVITY_LP_HANDLING_TAU_S = 0.3;
/** Low-pass of raw acceleration used as the orientation reference without device motion. */
export const ORIENTATION_LP_TAU_S = 0.25;

export const VIBRATION_WINDOW_MS = 1500;
export const SUSTAINED_WINDOW_MS = 2000;
export const HANDLING_WINDOW_MS = 500;
export const TILT_WINDOW_MS = 1000;

/** Stillness: running-vibration RMS below this… */
export const STATIONARY_VIBRATION_MAX_MS2 = 0.05;
/** …and sustained horizontal acceleration below this. */
export const STATIONARY_HORIZONTAL_MAX_MS2 = 0.15;
/** Motion: running-vibration RMS above this (gap to the stillness limit = hysteresis)… */
export const MOVING_VIBRATION_MIN_MS2 = 0.12;
/** …or sustained horizontal acceleration above this. Also the speed-change threshold. */
export const SUSTAINED_ACCEL_MIN_MS2 = 0.3;

/** Continuous good-quality stillness needed to enter `stationary`. */
export const STATIONARY_ENTER_MS = 4000;
/** Continuous good-quality motion evidence needed to leave `stationary` (or `unknown`). */
export const MOVING_ENTER_MS = 3000;
/** A moving sub-state (moving / accelerating / …) must persist this long to be shown. */
export const SUBSTATE_HOLD_MS = 1500;

/** Handling: RMS rotation rate over HANDLING_WINDOW_MS above this (≈29°/s). */
export const HANDLING_ROTATION_RAD_S = 0.5;
/** Handling: gravity-direction change over TILT_WINDOW_MS above this. */
export const HANDLING_TILT_DEG = 10;
/** Handling: linear-acceleration spread over HANDLING_WINDOW_MS above this (pick-up, steps). */
export const HANDLING_SHAKE_MS2 = 1.5;
/** Quality stays `handling` this long after the last contaminated sample. */
export const HANDLING_SETTLE_MS = Math.max(VIBRATION_WINDOW_MS, SUSTAINED_WINDOW_MS, TILT_WINDOW_MS);

/** Larger sample gaps restart the windows (warm-up) and drop the forward axis. */
export const MAX_SAMPLE_GAP_MS = 500;
/** Larger gaps (or silence) also reset the state to `unknown`. */
export const STATE_RESET_GAP_MS = 5000;
/** Silence after which a snapshot reports `no-data`. */
export const NO_DATA_AFTER_MS = 1000;
/** Continuous data needed before any decision (all windows full). */
export const WARMUP_MS = HANDLING_SETTLE_MS;

/** Confidence right after a state is confirmed. */
export const CONFIDENCE_ON_ENTRY = 0.65;
export const CONFIDENCE_MAX = 0.95;
/** Confidence gained per second while the evidence keeps supporting the state. */
export const CONFIDENCE_RISE_PER_S = 0.03;
/** Confidence decay time constant while handled, without data, or unsupported. */
export const CONFIDENCE_DECAY_TAU_S = 3;

/** Forward-axis learning window, starting at the confirmed stop → move transition. */
export const CALIBRATION_WINDOW_MS = 8000;
/** Clean data needed inside that window. */
export const CALIBRATION_MIN_MS = 2000;
/** Mean horizontal acceleration needed to accept the axis. */
export const CALIBRATION_MIN_ACCEL_MS2 = 0.3;
/** |mean vector| / mean |vector|: the acceleration must point one way. */
export const CALIBRATION_MIN_CONSISTENCY = 0.6;
/** Phone rotation (or gravity-direction change) that invalidates the axis. */
export const FORWARD_AXIS_MAX_ROTATION_DEG = 20;
/**
 * Rotation below this rate is not counted against the axis: the phone turns
 * WITH the train in curves (≲0.1 rad/s), which does not move the axis.
 */
export const GYRO_DEADBAND_RAD_S = 0.15;

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vec3, k: number) => v(a.x * k, a.y * k, a.z * k);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 | null => {
  const n = norm(a);
  return n > 1e-9 ? scale(a, 1 / n) : null;
};
const lerp = (from: Vec3, to: Vec3, alpha: number) => add(from, scale(sub(to, from), alpha));
const RAD_TO_DEG = 180 / Math.PI;
const angleDeg = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * RAD_TO_DEG;
const finite = (a: Vec3 | null | undefined): a is Vec3 =>
  !!a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);

export const MOVING_STATES: ReadonlySet<TrainMotionState> = new Set([
  'moving',
  'accelerating',
  'decelerating',
  'speed-changing',
]);
export const isMovingState = (s: TrainMotionState) => MOVING_STATES.has(s);

// ---------------------------------------------------------------------------
// Time window with running sums
// ---------------------------------------------------------------------------

type Entry = { t: number; x: number; y: number; z: number; s: number };

/** Samples within (t − span, t] with running vector sums, squares and a scalar sum. */
class TimeWindow {
  private buf: Entry[] = [];
  private sx = 0;
  private sy = 0;
  private sz = 0;
  private sxx = 0;
  private syy = 0;
  private szz = 0;
  private ss = 0;
  private pushes = 0;
  private readonly spanMs: number;

  constructor(spanMs: number) {
    this.spanMs = spanMs;
  }

  push(t: number, a: Vec3, s = 0) {
    const e: Entry = { t, x: a.x, y: a.y, z: a.z, s };
    this.buf.push(e);
    this.accumulate(e, 1);
    while (this.buf.length > 1 && this.buf[0]!.t <= t - this.spanMs) this.accumulate(this.buf.shift()!, -1);
    // Re-sum now and then so floating-point drift cannot build up over a long ride.
    if (++this.pushes % 1024 === 0) this.resum();
  }

  clear() {
    this.buf = [];
    this.resum();
  }

  get count() {
    return this.buf.length;
  }

  front(): Entry | undefined {
    return this.buf[0];
  }

  mean(): Vec3 {
    const n = this.buf.length || 1;
    return v(this.sx / n, this.sy / n, this.sz / n);
  }

  /** Total variance of the vector (sum over axes), ≥ 0. */
  variance(): number {
    const n = this.buf.length;
    if (n < 2) return 0;
    const m = this.mean();
    return Math.max(0, this.sxx / n - m.x * m.x + (this.syy / n - m.y * m.y) + (this.szz / n - m.z * m.z));
  }

  /** Mean of the (non-negative) scalar channel; clamped so float drift never goes below 0. */
  meanScalar(): number {
    return this.buf.length ? Math.max(0, this.ss / this.buf.length) : 0;
  }

  private accumulate(e: Entry, sign: 1 | -1) {
    this.sx += sign * e.x;
    this.sy += sign * e.y;
    this.sz += sign * e.z;
    this.sxx += sign * e.x * e.x;
    this.syy += sign * e.y * e.y;
    this.szz += sign * e.z * e.z;
    this.ss += sign * e.s;
  }

  private resum() {
    this.sx = this.sy = this.sz = this.sxx = this.syy = this.szz = this.ss = 0;
    for (const e of this.buf) this.accumulate(e, 1);
  }
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export interface MotionDetector {
  /** Feed one sample. Invalid or out-of-order samples are ignored. */
  push(sample: MotionSample): void;
  /** Current reading as of `nowMs` (defaults to the last sample time). Does not mutate. */
  snapshot(nowMs?: number): DetectorSnapshot;
}

type Calibration = { untilMs: number; sum: Vec3; sumMag: number; n: number; cleanMs: number };
type ForwardAxis = { axis: Vec3; gravityDir: Vec3; rotationRad: number };

const NO_READING: DetectorSnapshot = {
  state: 'unknown',
  confidence: 0,
  quality: 'no-data',
  stateSinceMs: null,
  forwardAxisCalibrated: false,
  features: null,
  gravitySource: null,
  lastSampleMs: null,
};

const round = (x: number, k = 1000) => Math.round(x * k) / k;

export function createMotionDetector(): MotionDetector {
  const vib = new TimeWindow(VIBRATION_WINDOW_MS);
  const sustained = new TimeWindow(SUSTAINED_WINDOW_MS);
  const hand = new TimeWindow(HANDLING_WINDOW_MS);
  const tilt = new TimeWindow(TILT_WINDOW_MS);

  let lastT: number | null = null;
  let segmentStart = 0;
  let gravity: Vec3 | null = null;
  let orient: Vec3 | null = null;
  let gravitySource: GravitySource | null = null;
  let lastHandling: number | null = null;
  let quality: MotionSensorQuality = 'no-data';
  let features: MotionFeatures | null = null;

  let state: TrainMotionState = 'unknown';
  let stateSince: number | null = null;
  let confidence = 0;
  let stillSince: number | null = null;
  let motionSince: number | null = null;
  let pending: { state: TrainMotionState; since: number } | null = null;

  let calibration: Calibration | null = null;
  let forward: ForwardAxis | null = null;

  const decay = (dtS: number) => {
    confidence *= Math.exp(-Math.max(0, dtS) / CONFIDENCE_DECAY_TAU_S);
  };

  const setState = (next: TrainMotionState, since: number) => {
    state = next;
    stateSince = since;
    pending = null;
    confidence = CONFIDENCE_ON_ENTRY;
  };

  /** Sample gap: restart the windows; a long one also forgets the state. */
  const restart = (t: number, gapMs: number) => {
    vib.clear();
    sustained.clear();
    hand.clear();
    tilt.clear();
    segmentStart = t;
    gravity = null;
    orient = null;
    stillSince = motionSince = null;
    pending = null;
    calibration = null;
    forward = null; // rotation during the gap was not observed
    features = null;
    if (gapMs > STATE_RESET_GAP_MS) {
      state = 'unknown';
      stateSince = null;
      confidence = 0;
    } else {
      decay(gapMs / 1000);
    }
  };

  const desiredSubState = (meanH: Vec3): TrainMotionState => {
    if (norm(meanH) < SUSTAINED_ACCEL_MIN_MS2) return 'moving';
    if (!forward) return 'speed-changing';
    const along = dot(meanH, forward.axis);
    if (along >= SUSTAINED_ACCEL_MIN_MS2) return 'accelerating';
    if (along <= -SUSTAINED_ACCEL_MIN_MS2) return 'decelerating';
    return 'moving'; // mostly lateral (e.g. a curve), not a speed change
  };

  function push(s: MotionSample) {
    if (!s || !Number.isFinite(s.tMs) || !finite(s.accel)) return;
    const t = s.tMs;
    if (lastT !== null && t <= lastT) return;
    const gap = lastT === null ? 0 : t - lastT;
    if (lastT === null) segmentStart = t;
    else if (gap > MAX_SAMPLE_GAP_MS) restart(t, gap);
    const dtS = lastT === null || gap > MAX_SAMPLE_GAP_MS ? 0 : gap / 1000;
    lastT = t;

    const wasHandling = lastHandling !== null && t - lastHandling < HANDLING_SETTLE_MS;

    // 1. Gravity + orientation reference
    const osGravity = finite(s.gravity) && norm(s.gravity) > 1 ? s.gravity : null;
    if (osGravity) {
      gravity = osGravity;
      orient = osGravity;
      gravitySource = 'device-motion';
    } else {
      const tau = wasHandling ? GRAVITY_LP_HANDLING_TAU_S : GRAVITY_LP_TAU_S;
      gravity = gravity ? lerp(gravity, s.accel, dtS / (tau + dtS)) : s.accel;
      orient = orient ? lerp(orient, s.accel, dtS / (ORIENTATION_LP_TAU_S + dtS)) : s.accel;
      gravitySource = 'low-pass';
    }
    const gDir = unit(gravity);
    const oDir = unit(orient) ?? gDir;
    if (!gDir || !oDir) return;

    // 2. Linear acceleration, vertical / horizontal split
    const lin = sub(s.accel, gravity);
    const h = sub(lin, scale(gDir, dot(lin, gDir)));
    const gyro = finite(s.gyro) ? s.gyro : null;
    const rot = gyro ? norm(gyro) : 0;

    // 3. Window features
    vib.push(t, lin);
    sustained.push(t, h);
    hand.push(t, lin, rot * rot);
    tilt.push(t, oDir);
    const meanH = sustained.mean();
    const ref = tilt.front();
    features = {
      vibrationRmsMs2: round(Math.sqrt(vib.variance())),
      sustainedHorizontalMs2: round(norm(meanH)),
      rotationRateRadS: round(Math.sqrt(hand.meanScalar())),
      tiltChangeDeg: round(ref ? angleDeg(v(ref.x, ref.y, ref.z), oDir) : 0, 10),
    };
    const shake = Math.sqrt(hand.variance());

    // 4. Quality
    const contaminated =
      features.rotationRateRadS > HANDLING_ROTATION_RAD_S ||
      features.tiltChangeDeg > HANDLING_TILT_DEG ||
      shake > HANDLING_SHAKE_MS2;
    if (contaminated) lastHandling = t;
    const handling = lastHandling !== null && t - lastHandling < HANDLING_SETTLE_MS;
    const warm = t - segmentStart >= WARMUP_MS;
    quality = !warm ? 'no-data' : handling ? 'handling' : 'good';

    // Forward-axis invalidation (any quality): rotation past the limit, or no gyro to see yaw.
    if (forward) {
      forward.rotationRad += Math.max(0, rot - GYRO_DEADBAND_RAD_S) * dtS;
      const limit = FORWARD_AXIS_MAX_ROTATION_DEG;
      if (!gyro || forward.rotationRad * RAD_TO_DEG > limit || angleDeg(forward.gravityDir, oDir) > limit) {
        forward = null;
      }
    }
    if (calibration && t > calibration.untilMs) calibration = null;

    if (quality !== 'good') {
      // Frozen: no transition, evidence restarts, confidence decays.
      stillSince = motionSince = null;
      pending = null;
      decay(dtS);
      return;
    }

    // 5. Evidence + hysteresis
    const vibRms = features.vibrationRmsMs2;
    const sustainedH = features.sustainedHorizontalMs2;
    const still = vibRms < STATIONARY_VIBRATION_MAX_MS2 && sustainedH < STATIONARY_HORIZONTAL_MAX_MS2;
    const motion = vibRms > MOVING_VIBRATION_MIN_MS2 || sustainedH > SUSTAINED_ACCEL_MIN_MS2;
    stillSince = still ? (stillSince ?? t) : null;
    motionSince = motion ? (motionSince ?? t) : null;

    if (state !== 'stationary' && stillSince !== null && t - stillSince >= STATIONARY_ENTER_MS) {
      setState('stationary', stillSince);
      calibration = null;
    } else if (!isMovingState(state) && motionSince !== null && t - motionSince >= MOVING_ENTER_MS) {
      const fromStop = state === 'stationary';
      setState(desiredSubState(meanH), motionSince);
      // 6. Learn the forward axis from the departure acceleration (needs a gyro to guard it).
      if (fromStop && gyro) calibration = { untilMs: t + CALIBRATION_WINDOW_MS, sum: v(0, 0, 0), sumMag: 0, n: 0, cleanMs: 0 };
    } else if (isMovingState(state)) {
      const want = desiredSubState(meanH);
      if (want === state) pending = null;
      else if (pending?.state !== want) pending = { state: want, since: t };
      else if (t - pending.since >= SUBSTATE_HOLD_MS) {
        const keep = confidence;
        setState(want, pending.since);
        confidence = Math.max(keep, CONFIDENCE_ON_ENTRY); // same moving family
      }
    }

    if (calibration && gyro && isMovingState(state)) {
      calibration.sum = add(calibration.sum, h);
      calibration.sumMag += norm(h);
      calibration.n += 1;
      calibration.cleanMs += dtS * 1000;
      if (calibration.cleanMs >= CALIBRATION_MIN_MS) {
        const mean = scale(calibration.sum, 1 / calibration.n);
        const meanMag = calibration.sumMag / calibration.n;
        const axis = unit(mean);
        if (axis && norm(mean) >= CALIBRATION_MIN_ACCEL_MS2 && norm(mean) / meanMag >= CALIBRATION_MIN_CONSISTENCY) {
          forward = { axis, gravityDir: oDir, rotationRad: 0 };
          calibration = null;
        }
      }
    }

    // Confidence: rises while the evidence supports the state, decays otherwise.
    // After handling / a blip it only returns to the entry level once the
    // supporting evidence has run as long as an entry would need.
    const supportSince = state === 'stationary' ? stillSince : isMovingState(state) ? motionSince : null;
    const enterMs = state === 'stationary' ? STATIONARY_ENTER_MS : MOVING_ENTER_MS;
    if (state === 'unknown') confidence = 0;
    else if (supportSince !== null) {
      const floor = t - supportSince >= enterMs ? CONFIDENCE_ON_ENTRY : 0;
      confidence = Math.min(CONFIDENCE_MAX, Math.max(floor, confidence + CONFIDENCE_RISE_PER_S * dtS));
    } else decay(dtS);
  }

  function snapshot(nowMs?: number): DetectorSnapshot {
    if (lastT === null) return { ...NO_READING };
    const now = nowMs ?? lastT;
    const silentMs = Math.max(0, now - lastT);
    if (silentMs > STATE_RESET_GAP_MS) return { ...NO_READING, gravitySource, lastSampleMs: lastT };
    const silent = silentMs > NO_DATA_AFTER_MS;
    return {
      state,
      confidence: round(
        state === 'unknown' ? 0 : silent ? confidence * Math.exp(-silentMs / 1000 / CONFIDENCE_DECAY_TAU_S) : confidence,
        100,
      ),
      quality: silent ? 'no-data' : quality,
      stateSinceMs: stateSince,
      forwardAxisCalibrated: forward !== null,
      features,
      gravitySource,
      lastSampleMs: lastT,
    };
  }

  return { push, snapshot };
}
