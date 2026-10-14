// Run with `pnpm --filter @workspace/sub-way-stand test` (Node built-in runner,
// native TS type stripping). Import source files by relative path WITH `.ts`;
// `@/` aliases and React Native imports do not resolve under plain Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMFORT_THRESHOLD_MS2,
  SWAY_THRESHOLD,
  lateralAccelBand,
  lateralAcceleration,
  passengerSway,
  signedCant,
  signedCurvature,
  swayDirection,
} from '../lib/physics.ts';

test('left turn pushes the passenger to the right', () => {
  assert.equal(swayDirection(lateralAcceleration(12, 1 / 400)), 'right');
});

test('sign convention: route turn → signed curvature → sway opposite to the turn', () => {
  assert.ok(signedCurvature(400, 'left') > 0);
  assert.ok(signedCurvature(400, 'right') < 0);
  assert.equal(passengerSway('left'), 'right');
  assert.equal(passengerSway('right'), 'left');
  for (const turn of ['left', 'right'] as const) {
    const a = lateralAcceleration(15, signedCurvature(350, turn));
    assert.equal(swayDirection(a), passengerSway(turn), turn);
    assert.ok(Math.abs(Math.abs(a) - (15 * 15) / 350) < 1e-12);
  }
  assert.throws(() => signedCurvature(0, 'left'));
  assert.throws(() => signedCurvature(Number.NaN, 'right'));
});

test('route cant (positive = toward curve inside) always reduces |a| at moderate speed', () => {
  assert.equal(signedCant(undefined, 'left'), undefined);
  assert.equal(signedCant(0.05, 'left'), 0.05);
  assert.equal(signedCant(0.05, 'right'), -0.05);
  for (const turn of ['left', 'right'] as const) {
    const k = signedCurvature(400, turn);
    const plain = Math.abs(lateralAcceleration(15, k));
    const canted = Math.abs(lateralAcceleration(15, k, signedCant(0.04, turn)));
    assert.ok(canted < plain, turn);
  }
});

test('acceleration band is bounded by the speed band ends and keeps the sway direction', () => {
  const band = lateralAccelBand(11, 18, signedCurvature(400, 'left'));
  assert.equal(band.sway, 'right');
  assert.equal(band.ambiguous, false);
  assert.ok(Math.abs(band.min - 121 / 400) < 1e-12);
  assert.ok(Math.abs(band.max - 324 / 400) < 1e-12);
  assert.equal(lateralAccelBand(11, 18, signedCurvature(400, 'right')).sway, 'left');
  assert.throws(() => lateralAccelBand(18, 11, 0.01));
  assert.throws(() => lateralAccelBand(-1, 11, 0.01));
});

test('cant that flips the sign inside the speed band makes the direction ambiguous', () => {
  const band = lateralAccelBand(2, 16, signedCurvature(450, 'left'), signedCant(0.05, 'left'));
  assert.equal(band.ambiguous, true);
  assert.equal(band.sway, 'none');
  assert.equal(band.min, 0);
});

test('thresholds: tiny accelerations have no direction; comfort threshold is above it', () => {
  assert.equal(swayDirection(SWAY_THRESHOLD / 2), 'none');
  assert.ok(COMFORT_THRESHOLD_MS2 > SWAY_THRESHOLD);
});
