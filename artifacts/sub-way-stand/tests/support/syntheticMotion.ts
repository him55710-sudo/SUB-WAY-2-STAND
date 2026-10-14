// SYNTHETIC phone-motion traces for the detector / gate tests.
//
// Nothing here is recorded data: every trace is generated from a few
// hand-written parameters (train acceleration, vibration RMS, phone
// rotation) with a seeded noise source, so tests are deterministic. They
// check the detector's logic, not its calibration against real rides.
//
// Frames: world = x forward (train), y left, z up. The phone sits in the
// train with a mount rotation (device → train frame) that changes while the
// rider handles it; the train itself can yaw (curves). The accelerometer
// reads specific force (+g up at rest), as Android / expo-sensors do.
import type { MotionSample, Vec3 } from '../../lib/motionDetector.ts';

export const SYNTHETIC_HZ = 50;
const G = 9.80665;

type Mat = [number, number, number, number, number, number, number, number, number];

const I: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (a: Mat, b: Mat): Mat => {
  const r = new Array(9).fill(0) as Mat;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
};
const transpose = (a: Mat): Mat => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const apply = (m: Mat, p: Vec3): Vec3 => ({
  x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
  y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
  z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
});

/** Rotation by `angle` rad about unit-ish `axis` (Rodrigues). */
export function rotation(axis: Vec3, angle: number): Mat {
  const n = Math.hypot(axis.x, axis.y, axis.z) || 1;
  const x = axis.x / n;
  const y = axis.y / n;
  const z = axis.z / n;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Mount from roll / pitch / yaw in degrees (device → train frame). */
export function mount(rollDeg: number, pitchDeg: number, yawDeg: number): Mat {
  return mul(rotation({ x: 0, y: 0, z: 1 }, deg(yawDeg)), mul(rotation({ x: 0, y: 1, z: 0 }, deg(pitchDeg)), rotation({ x: 1, y: 0, z: 0 }, deg(rollDeg))));
}

/** Angular velocity (device frame, rad/s) between two orientations dt apart. */
function angularVelocity(prev: Mat, next: Mat, dtS: number): Vec3 {
  const m = mul(transpose(prev), next);
  const cos = Math.max(-1, Math.min(1, (m[0] + m[4] + m[8] - 1) / 2));
  const angle = Math.acos(cos);
  if (angle < 1e-12) return { x: 0, y: 0, z: 0 };
  const k = angle / (2 * Math.sin(angle) * dtS);
  return { x: (m[7] - m[5]) * k, y: (m[2] - m[6]) * k, z: (m[3] - m[1]) * k };
}

/** Seeded Gaussian noise (LCG + Box–Muller). */
function noise(seed: number) {
  let s = seed >>> 0 || 1;
  const uniform = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

export interface Phase {
  /** Duration, seconds. */
  s: number;
  /** Train forward acceleration, m/s² (number or function of seconds into the phase). */
  fwd?: number | ((t: number) => number);
  /** Train lateral (left +) acceleration, m/s², e.g. centripetal in a curve. */
  lat?: number;
  /** Running-vibration RMS (total over 3 axes), m/s². */
  vib?: number;
  /** Train yaw rate (curve), rad/s. The phone turns with the train. */
  yawRate?: number;
  /** Phone rotation relative to the train (handling), device-frame axis + rate. */
  turn?: { axis: Vec3; rateRadS: number };
  /** Walking / pick-up shake: sinusoidal acceleration amplitude (m/s²) and frequency. */
  shake?: { amp: number; hz: number };
}

export interface TraceOptions {
  t0Ms?: number;
  /** Initial phone mount (device → train). Default: tilted, yawed. */
  mount?: Mat;
  /** Provide OS-separated gravity like DeviceMotion (default true). */
  deviceGravity?: boolean;
  /** Provide a gyroscope (default true). */
  gyro?: boolean;
  /** Sensor noise floor RMS added everywhere, m/s². Default 0.01. */
  floor?: number;
  seed?: number;
}

export interface Trace {
  samples: MotionSample[];
  /** Start time (epoch ms) of each phase. */
  phaseStartMs: number[];
  endMs: number;
}

export const DEFAULT_MOUNT = mount(25, -35, 40);

export function synthesize(phases: Phase[], opts: TraceOptions = {}): Trace {
  const t0 = opts.t0Ms ?? Date.UTC(2026, 9, 14, 8, 0, 0);
  const dt = 1 / SYNTHETIC_HZ;
  const rand = noise(opts.seed ?? 7);
  const floor = opts.floor ?? 0.01;
  const withGravity = opts.deviceGravity ?? true;
  const withGyro = opts.gyro ?? true;
  let mountM = opts.mount ?? DEFAULT_MOUNT;
  let heading = 0;
  let prevR = mul(rotation({ x: 0, y: 0, z: 1 }, heading), mountM);
  const samples: MotionSample[] = [];
  const phaseStartMs: number[] = [];
  let tS = 0;
  for (const p of phases) {
    phaseStartMs.push(t0 + tS * 1000);
    const n = Math.round(p.s * SYNTHETIC_HZ);
    for (let i = 0; i < n; i++) {
      const local = i * dt;
      heading += (p.yawRate ?? 0) * dt;
      if (p.turn) mountM = mul(mountM, rotation(p.turn.axis, p.turn.rateRadS * dt));
      const train = rotation({ x: 0, y: 0, z: 1 }, heading);
      const R = mul(train, mountM); // device → world
      const fwd = typeof p.fwd === 'function' ? p.fwd(local) : (p.fwd ?? 0);
      const sigma = Math.hypot(p.vib ?? 0, floor) / Math.sqrt(3);
      const shake = p.shake ? p.shake.amp * Math.sin(2 * Math.PI * p.shake.hz * (tS + local)) : 0;
      // Specific force in the TRAIN frame, then to world, then to device.
      const fTrain: Vec3 = {
        x: fwd + sigma * rand() + shake * 0.4,
        y: (p.lat ?? 0) + sigma * rand() + shake * 0.3,
        z: G + sigma * rand() + shake,
      };
      const Rt = transpose(R);
      const accel = apply(Rt, apply(train, fTrain));
      const gravity = apply(Rt, { x: 0, y: 0, z: G });
      const gyro = angularVelocity(prevR, R, dt);
      prevR = R;
      samples.push({
        tMs: t0 + (tS + local) * 1000,
        accel,
        gravity: withGravity ? gravity : null,
        gyro: withGyro ? gyro : null,
      });
    }
    tS += n * dt;
  }
  return { samples, phaseStartMs, endMs: t0 + tS * 1000 };
}

export const IDENTITY_MOUNT = I;
