/** DeviceMotion payloads use m/s² and degrees/s. Missing axes are not zero measurements. */
import type { MotionSample, Vec3 } from './motionDetector.ts';

type BrowserVector = { x: number | null; y: number | null; z: number | null };
export interface BrowserMotionPayload {
  accelerationIncludingGravity: BrowserVector | null;
  acceleration: BrowserVector | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  timeStamp: number;
}

function finiteVector(v: BrowserVector | null): Vec3 | null {
  if (!v || typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.z !== 'number' ||
      ![v.x, v.y, v.z].every(Number.isFinite)) return null;
  return { x: v.x, y: v.y, z: v.z };
}

export function browserMotionSample(event: BrowserMotionPayload, nowMs: number, timeOriginMs: number): MotionSample | null {
  const accel = finiteVector(event.accelerationIncludingGravity);
  if (!accel) return null;
  const linear = finiteVector(event.acceleration);
  const rotation = event.rotationRate;
  const rate = rotation ? finiteVector({ x: rotation.beta, y: rotation.gamma, z: rotation.alpha }) : null;
  const deg = Math.PI / 180;
  const candidate = event.timeStamp > 1e12 ? event.timeStamp : timeOriginMs + event.timeStamp;
  const tMs = Number.isFinite(candidate) && Math.abs(candidate - nowMs) < 5_000 ? candidate : nowMs;
  return {
    tMs, accel,
    gravity: linear ? { x: accel.x - linear.x, y: accel.y - linear.y, z: accel.z - linear.z } : null,
    gyro: rate ? { x: rate.x * deg, y: rate.y * deg, z: rate.z * deg } : null,
  };
}
