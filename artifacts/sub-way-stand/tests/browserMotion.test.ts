import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserMotionSample, type BrowserMotionPayload } from '../lib/browserMotion.ts';
import { createMotionDetector } from '../lib/motionDetector.ts';

const NOW = 1_780_000_000_000;
const PAYLOAD: BrowserMotionPayload = {
  accelerationIncludingGravity: { x: 1, y: 2, z: 9.81 },
  acceleration: { x: 1, y: 2, z: 0 },
  rotationRate: { alpha: 180, beta: 90, gamma: 45 }, timeStamp: 1000,
};

test('browser motion preserves m/s², separates gravity and maps angular rates to rad/s', () => {
  const sample = browserMotionSample(PAYLOAD, NOW, NOW - 1000)!;
  assert.deepEqual(sample.accel, { x: 1, y: 2, z: 9.81 });
  assert.deepEqual(sample.gravity, { x: 0, y: 0, z: 9.81 });
  assert.deepEqual(sample.gyro, { x: Math.PI / 2, y: Math.PI / 4, z: Math.PI });
  assert.equal(sample.tMs, NOW);
});

test('empty browser measurements and missing axes never become stillness evidence', () => {
  assert.equal(browserMotionSample({ ...PAYLOAD, accelerationIncludingGravity: null }, NOW, NOW), null);
  assert.equal(browserMotionSample({ ...PAYLOAD, accelerationIncludingGravity: { x: null, y: null, z: null } }, NOW, NOW), null);
  assert.equal(browserMotionSample({ ...PAYLOAD, accelerationIncludingGravity: { x: NaN, y: 0, z: 9.81 } }, NOW, NOW), null);
  const fallback = browserMotionSample({ ...PAYLOAD, acceleration: null, rotationRate: null }, NOW, NOW - 1000)!;
  assert.equal(fallback.gravity, null);
  assert.equal(fallback.gyro, null);
});

test('browser event timestamps use the event clock and tolerate epoch or invalid clocks', () => {
  assert.equal(browserMotionSample(PAYLOAD, NOW + 15, NOW - 1000)!.tMs, NOW);
  assert.equal(browserMotionSample({ ...PAYLOAD, timeStamp: NOW }, NOW + 15, 0)!.tMs, NOW);
  assert.equal(browserMotionSample({ ...PAYLOAD, timeStamp: NaN }, NOW, NOW)!.tMs, NOW);
});

test('synthetic browser motion feeds the existing detector without inventing gravity or speed', () => {
  const detector = createMotionDetector();
  for (let t = 0; t <= 8000; t += 20) {
    const sample = browserMotionSample({ ...PAYLOAD, accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
      acceleration: { x: 0, y: 0, z: 0 }, rotationRate: null, timeStamp: 1000 + t }, NOW + t, NOW - 1000);
    assert.ok(sample);
    detector.push(sample);
  }
  const snapshot = detector.snapshot(NOW + 8000);
  assert.equal(snapshot.state, 'stationary');
  assert.equal(snapshot.gravitySource, 'device-motion');
  assert.equal(snapshot.forwardAxisCalibrated, false);
});
