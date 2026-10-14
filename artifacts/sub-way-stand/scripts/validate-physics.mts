/** Reproducible analytical verification, NOT a field accuracy evaluation. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  G, lateralAcceleration, lateralAccelBand, lateralJerk,
  type LateralJerkInput,
} from '../lib/physics.ts';
import { SPEED_BAND, makeProfile, positionAt, speedAt, timeAt } from '../lib/forecastProfile.ts';
import { computeLiveForecast } from '../lib/forecastEngine.ts';
import type { RouteSegment, TrainCandidate } from '../contracts/index.ts';

const reference = (v: number, k: number, theta: number) => {
  const horizontal = v * v * k;
  return Math.hypot(horizontal, G) * Math.sin(Math.atan2(horizontal, G) - theta);
};
const stats = (errors: number[]) => ({
  samples: errors.length,
  maxAbsoluteError: Math.max(...errors.map(Math.abs)),
  rmse: Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length),
});

const oldErrors: number[] = [];
const newErrors: number[] = [];
for (let v = 0; v <= 35; v++) for (const r of [150, 300, 450, 800, 1200]) {
  for (const sign of [-1, 1]) for (const theta of [-0.12, -0.06, 0, 0.06, 0.12]) {
    const k = sign / r;
    const truth = reference(v, k, theta);
    oldErrors.push(v * v * k - G * Math.sin(theta) - truth);
    newErrors.push(lateralAcceleration(v, k, theta) - truth);
  }
}

const jerkErrors: number[] = [];
const shortcutJerkErrors: number[] = [];
for (const v of [4, 12, 22]) for (const a of [-0.8, 0, 1]) for (const k of [-1 / 400, 1 / 300]) {
  for (const dk of [-1 / 18000, 0, 1 / 18000]) for (const theta of [-0.08, 0, 0.08]) {
    for (const dt of [-0.001, 0, 0.001]) {
      const p: LateralJerkInput = { speed: v, curvature: k, longitudinalAcceleration: a,
        curvatureSlope: dk, cantRad: theta, cantSlope: dt };
      const at = (t: number) => {
        const s = v * t + 0.5 * a * t * t;
        return reference(v + a * t, k + dk * s, theta + dt * s);
      };
      const h = 1e-4;
      const derivative = (at(h) - at(-h)) / (2 * h);
      jerkErrors.push(lateralJerk(p) - derivative);
      shortcutJerkErrors.push(v * v * v * dk - derivative);
    }
  }
}

let intervalSamples = 0;
let intervalViolations = 0;
for (const r of [150, 450, 1200]) for (const sign of [-1, 1]) for (const theta of [-0.12, 0, 0.03, 0.12]) {
  for (const [lo, hi] of [[1, 25], [5, 12], [11, 18]] as const) {
    const band = lateralAccelBand(lo, hi, sign / r, theta);
    for (let n = 0; n <= 200; n++) {
      const a = Math.abs(reference(lo + (hi - lo) * n / 200, sign / r, theta));
      intervalSamples++;
      if (a < band.min - 1e-12 || a > band.max + 1e-12) intervalViolations++;
    }
  }
}

const profileInverseErrors: number[] = [];
for (const length of [80, 150, 450, 1000, 3000]) for (const params of [SPEED_BAND.fast, SPEED_BAND.slow]) {
  const pr = makeProfile(length, params);
  for (let n = 0; n <= 100; n++) {
    const s = length * n / 100;
    profileInverseErrors.push(positionAt(pr, timeAt(pr, s)) - s);
  }
}

const nowMs = Date.parse('2026-10-14T16:00:00+09:00');
const segment: RouteSegment = {
  id: 'ANALYTICAL-ONLY', from: '가상 A', to: '가상 B', lengthM: 1000, directionCode: '1',
  curves: [{ id: 'C1', startOffsetM: 10, lengthM: 300, radiusM: 400, turn: 'left',
    cantRad: 0.01, source: 'curated', confidence: 'high' }],
};
const train: TrainCandidate = {
  id: 'ANALYTICAL-ONLY', line: 2, station: segment.from, direction: '가상', directionCode: '1',
  destination: segment.to, state: '출발', stateCode: '2', observedAt: new Date(nowMs).toISOString(),
  fresh: true, express: false, lastTrain: false, origin: 'fixture',
};
const forecast = computeLiveForecast({ train, nowMs, route: { origin: 'curated', sourceNote: 'invented test' },
  findSegment: () => segment });
const actualEntrySpeed = speedAt(makeProfile(1000, SPEED_BAND.slow), 10);
const entryAcceleration = reference(actualEntrySpeed, 1 / 400, 0.01);
const oldPeakOnly = lateralAccelBand(11, 18, 1 / 400, 0.01);
const withoutCant: RouteSegment = { ...segment, curves: segment.curves.map(c => ({ ...c, cantRad: undefined })) };
const unknownCantForecast = computeLiveForecast({ train, nowMs,
  route: { origin: 'curated', sourceNote: 'invented test' }, findSegment: () => withoutCant });

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: 'Analytical and synthetic software verification only; no Seoul train measurement or fall-prevention study.',
  acceleration: { unit: 'm/s²', reference: 'Independent resultant-force rotation',
    speedsMs: '0..35 in 1 m/s steps', radiiM: [150, 300, 450, 800, 1200],
    cantsRad: [-0.12, -0.06, 0, 0.06, 0.12], bothTurnDirections: true,
    before: stats(oldErrors), after: stats(newErrors), tolerance: 1e-12 },
  jerk: { unit: 'm/s³', reference: 'Central difference of independent force reference, dt = 0.0001 s',
    constantSpeedShortcut: stats(shortcutJerkErrors), fullDerivative: stats(jerkErrors), tolerance: 1e-7 },
  accelerationIntervals: { samples: intervalSamples, violations: intervalViolations },
  profileInverse: { unit: 'm', ...stats(profileInverseErrors), tolerance: 1e-8 },
  regression: {
    entrySpeedMs: actualEntrySpeed,
    entryAccelerationMs2: entryAcceleration,
    peakOnlySway: oldPeakOnly.sway,
    correctedForecastState: forecast.state,
    correctedForecastSway: forecast.sway,
    correctedSuppressReason: forecast.suppressReason,
    unknownCantState: unknownCantForecast.state,
  },
  fieldValidation: { performed: false,
    required: ['Verified track radius and cant with uncertainty', 'Synchronized speed/position reference',
      'Fixed, calibrated reference IMU and phone measurements', 'Held-out runs covering both directions and operating conditions'] },
};

assert.ok(report.acceleration.after.maxAbsoluteError < report.acceleration.tolerance);
assert.ok(report.jerk.fullDerivative.maxAbsoluteError < report.jerk.tolerance);
assert.equal(report.accelerationIntervals.violations, 0);
assert.ok(report.profileInverse.maxAbsoluteError < report.profileInverse.tolerance);
assert.ok(entryAcceleration < 0 && oldPeakOnly.sway === 'right');
assert.equal(forecast.state, 'suppressed');
assert.equal(forecast.sway, 'none');
assert.equal(unknownCantForecast.state, 'suppressed');
const destination = new URL('../docs/physics-validation-results.json', import.meta.url);
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
