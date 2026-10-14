/**
 * Bounded speed profile between two stations: accelerate → cruise → brake.
 *
 * The live feed is station-level only (no speed, no position), so the
 * forecast brackets every curve with two profiles: a FAST one (strong
 * acceleration, high cruise, late braking) and a SLOW one. Any real run that
 * stays inside these bounds reaches every point between the two times.
 *
 * Pure and dependency-free so it runs under `node --test`.
 */

export type ProfileParams = {
  /** Service acceleration, m/s². */
  accel: number;
  /** Cruise speed, m/s. */
  cruise: number;
  /** Service braking deceleration, m/s². */
  brake: number;
};

/** Assumed speed band for an urban metro run between stations (≈ 40–65 km/h cruise). */
export const SPEED_BAND: Readonly<{ fast: ProfileParams; slow: ProfileParams }> = Object.freeze({
  fast: Object.freeze({ accel: 1.0, cruise: 18, brake: 1.0 }),
  slow: Object.freeze({ accel: 0.6, cruise: 11, brake: 0.7 }),
});

export type Profile = {
  length: number;
  accel: number;
  brake: number;
  /** Highest speed reached (cruise speed, or the apex on short segments). */
  peak: number;
  accelDist: number;
  brakeDist: number;
  /** Departure → stop at the next station, s. */
  totalTime: number;
};

const finitePositive = (x: number) => Number.isFinite(x) && x > 0;

export function makeProfile(lengthM: number, p: ProfileParams): Profile {
  if (![lengthM, p.accel, p.cruise, p.brake].every(finitePositive)) {
    throw new RangeError("invalid profile inputs");
  }
  const a = p.accel;
  const b = p.brake;
  let peak = p.cruise;
  let accelDist = (peak * peak) / (2 * a);
  let brakeDist = (peak * peak) / (2 * b);
  if (accelDist + brakeDist > lengthM) {
    // Too short to reach cruise speed: triangular profile.
    peak = Math.sqrt((2 * a * b * lengthM) / (a + b));
    accelDist = (peak * peak) / (2 * a);
    brakeDist = lengthM - accelDist;
  }
  const cruiseDist = Math.max(0, lengthM - accelDist - brakeDist);
  return {
    length: lengthM,
    accel: a,
    brake: b,
    peak,
    accelDist,
    brakeDist,
    totalTime: peak / a + cruiseDist / peak + peak / b,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/** Seconds from departure until the train reaches `s` metres. */
export function timeAt(pr: Profile, s: number): number {
  const x = clamp(s, 0, pr.length);
  if (x <= pr.accelDist) return Math.sqrt((2 * x) / pr.accel);
  const cruiseEnd = pr.length - pr.brakeDist;
  if (x <= cruiseEnd) return pr.peak / pr.accel + (x - pr.accelDist) / pr.peak;
  return pr.totalTime - Math.sqrt((2 * (pr.length - x)) / pr.brake);
}

/** Speed (m/s) at `s` metres. */
export function speedAt(pr: Profile, s: number): number {
  const x = clamp(s, 0, pr.length);
  return Math.min(
    Math.sqrt(2 * pr.accel * x),
    pr.peak,
    Math.sqrt(2 * pr.brake * (pr.length - x)),
  );
}

/** Distance (m) covered `t` seconds after departure (inverse of `timeAt`). */
export function positionAt(pr: Profile, t: number): number {
  if (!(t > 0)) return 0;
  if (t >= pr.totalTime) return pr.length;
  const tAccel = pr.peak / pr.accel;
  if (t <= tAccel) return 0.5 * pr.accel * t * t;
  const cruiseDist = Math.max(0, pr.length - pr.accelDist - pr.brakeDist);
  const tCruiseEnd = tAccel + cruiseDist / pr.peak;
  if (t <= tCruiseEnd) return pr.accelDist + pr.peak * (t - tAccel);
  const r = pr.totalTime - t;
  return pr.length - 0.5 * pr.brake * r * r;
}

/** Highest speed over [s0, s1] — the profile is unimodal, so check the plateau and the ends. */
export function peakSpeedOver(pr: Profile, s0: number, s1: number): number {
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  if (lo <= pr.length - pr.brakeDist && hi >= pr.accelDist) return pr.peak;
  return Math.max(speedAt(pr, lo), speedAt(pr, hi));
}
