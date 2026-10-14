import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  G, SWAY_THRESHOLD, forecast, lateralAcceleration, lateralAccelBand, lateralJerk,
  syntheticFrame, type LateralJerkInput,
} from '../lib/physics.ts';
import { makeProfile, minSpeedOver, peakSpeedOver, speedAt } from '../lib/forecastProfile.ts';

// Independent force-vector reference: rotate the resultant of horizontal
// centripetal acceleration and vertical gravity into the track plane.
const reference = (v: number, k: number, theta: number) => {
  const horizontal = v * v * k;
  return Math.hypot(horizontal, G) * Math.sin(Math.atan2(horizontal, G) - theta);
};

test('banked-track acceleration agrees with force-vector rotation across both turns', () => {
  for (const v of [0, 2, 11, 18, 35]) for (const k of [0, 1 / 150, -1 / 150, 1 / 450, -1 / 1200]) {
    for (const theta of [-0.3, -0.12, 0, 0.05, 0.3]) {
      assert.ok(Math.abs(lateralAcceleration(v, k, theta) - reference(v, k, theta)) < 1e-12);
      assert.ok(Math.abs(lateralAcceleration(v, k, theta) + lateralAcceleration(v, -k, -theta)) < 1e-12);
    }
  }
});

test('equilibrium cant atan(v²κ/g) cancels the track-plane acceleration', () => {
  for (const v of [5, 12, 18]) for (const k of [1 / 300, -1 / 450]) {
    const theta = Math.atan(v * v * k / G);
    assert.ok(Math.abs(lateralAcceleration(v, k, theta)) < 1e-12);
  }
});

test('a tiny opposite-sign endpoint and a neutral endpoint cannot be used for a definite direction', () => {
  const theta = Math.atan(100 / 400 / G);
  for (const v0 of [9.99, 10]) {
    const band = lateralAccelBand(v0, 18, 1 / 400, theta);
    assert.equal(band.ambiguous, true);
    assert.equal(band.sway, 'none');
  }
});

test('acceleration magnitude bands contain every sampled speed, including over-cant and balance crossings', () => {
  for (const k of [1 / 150, -1 / 450]) for (const theta of [-0.1, 0, 0.03, 0.12]) {
    const band = lateralAccelBand(1, 25, k, theta);
    for (let n = 0; n <= 400; n++) {
      const a = reference(1 + 24 * n / 400, k, theta);
      assert.ok(Math.abs(a) >= band.min - 1e-12 && Math.abs(a) <= band.max + 1e-12);
      if (!band.ambiguous && Math.abs(a) >= SWAY_THRESHOLD) {
        assert.equal(band.sway, a > 0 ? 'right' : 'left');
      }
    }
  }
});

test('full jerk agrees with a numerical derivative during acceleration, braking, curvature and cant ramps', () => {
  for (const v of [4, 12, 22]) for (const a of [-0.8, 0, 1]) for (const k of [-1 / 400, 1 / 300]) {
    const p: LateralJerkInput = { speed: v, curvature: k, longitudinalAcceleration: a,
      curvatureSlope: 1 / 18000, cantRad: 0.06, cantSlope: 0.001 };
    const h = 1e-4;
    const at = (t: number) => {
      const s = v * t + 0.5 * a * t * t;
      return reference(v + a * t, k + p.curvatureSlope! * s, p.cantRad! + p.cantSlope! * s);
    };
    assert.ok(Math.abs(lateralJerk(p) - (at(h) - at(-h)) / (2 * h)) < 1e-7);
  }
});

test('synthetic jerk includes changing speed on a constant-radius arc', () => {
  const t = 18; // Inside the R450 circular arc, away from its transitions.
  const h = 1e-4;
  const frame = syntheticFrame(t);
  assert.ok(Math.abs(frame.jerk) > 0.001);
  const derivative = (syntheticFrame(t + h).accel - syntheticFrame(t - h).accel) / (2 * h);
  assert.ok(Math.abs(frame.jerk - derivative) < 1e-7);
});

test('speed envelopes cover every point on triangular and trapezoidal runs', () => {
  for (const length of [80, 1000]) {
    const p = makeProfile(length, { accel: 0.8, cruise: 16, brake: 0.9 });
    for (const [lo, hi] of [[0, length], [length * 0.02, length * 0.6], [length * 0.4, length * 0.95]]) {
      const min = minSpeedOver(p, lo!, hi!);
      const max = peakSpeedOver(p, lo!, hi!);
      for (let n = 0; n <= 100; n++) {
        const v = speedAt(p, lo! + (hi! - lo!) * n / 100);
        assert.ok(v >= min - 1e-12 && v <= max + 1e-12);
      }
    }
  }
});

test('overflow and non-finite jerk inputs fail explicitly', () => {
  assert.throws(() => lateralAcceleration(1e200, 1 / 400), RangeError);
  assert.throws(() => lateralJerk({ speed: 12, curvature: 1 / 400, cantSlope: NaN }), RangeError);
  assert.throws(() => lateralJerk({ speed: 1e100, curvature: 0, curvatureSlope: 1e100 }), RangeError);
  const result = forecast({ verified: true, stale: false, stationary: false, delayed: false,
    geometry: { speedMin: 1e200, speedMax: 1e200, distanceMin: 10, distanceMax: 20, curvature: 1 / 400 } });
  assert.equal(result.suppressed, true);
  assert.ok(result.reasons.includes('invalid'));
});
