import test from "node:test";
import assert from "node:assert/strict";
import {
  SYN_A,
  findCurves,
  forecast,
  lateralAcceleration,
  nextCurve,
  swayDirection,
  syntheticFrame,
  transitionJerk,
  type Geometry,
} from "../lib/physics.ts";

const geo = (over: Partial<Geometry> = {}): Geometry => ({
  speedMin: 12,
  speedMax: 16,
  distanceMin: 60,
  distanceMax: 100,
  curvature: 1 / 450,
  ...over,
});
const ok = { verified: true, stale: false, stationary: false, delayed: false };

test("doubling speed quadruples curve acceleration", () => {
  for (const k of [1 / 300, -1 / 450, 1 / 1200]) {
    const a1 = lateralAcceleration(10, k);
    const a2 = lateralAcceleration(20, k);
    assert.ok(Math.abs(a2 / a1 - 4) < 1e-12, `ratio for κ=${k}`);
  }
});

test("zero curvature gives zero lateral acceleration and no sway", () => {
  assert.equal(lateralAcceleration(25, 0), 0);
  assert.ok(Object.is(lateralAcceleration(25, -0), 0), "-0 is normalised to 0");
  assert.equal(swayDirection(lateralAcceleration(25, 0)), "none");
});

test("left curve pushes passengers right, right curve pushes left", () => {
  assert.equal(swayDirection(lateralAcceleration(14, 1 / 450)), "right");
  assert.equal(swayDirection(lateralAcceleration(14, -1 / 300)), "left");
  const f = forecast({ geometry: geo({ curvature: 1 / 450 }), ...ok });
  assert.equal(f.turn, "left");
  assert.equal(f.sway, "right");
  assert.equal(forecast({ geometry: geo({ curvature: -1 / 300 }), ...ok }).sway, "left");
});

test("known cant reduces lateral acceleration and can make the direction ambiguous", () => {
  const plain = lateralAcceleration(14, 1 / 450);
  const canted = lateralAcceleration(14, 1 / 450, 0.03);
  assert.ok(canted < plain);
  // at low speed the cant dominates, at high speed curvature dominates → ambiguous
  const f = forecast({ geometry: geo({ speedMin: 2, speedMax: 16, cantRad: 0.05 }), ...ok });
  assert.equal(f.suppressed, true);
  assert.ok(f.reasons.includes("ambiguous"));
});

test("invalid physics inputs throw", () => {
  assert.throws(() => lateralAcceleration(-1, 0.01));
  assert.throws(() => lateralAcceleration(Number.NaN, 0.01));
  assert.throws(() => lateralAcceleration(10, 0.01, 0.5));
});

test("forecast window is conservative [dMin/vMax, dMax/vMin] with confidence by spread", () => {
  const f = forecast({ geometry: geo(), ...ok });
  assert.equal(f.suppressed, false);
  assert.deepEqual(f.window, [60 / 16, 100 / 12]);
  assert.equal(f.confidence, "medium"); // spread ≈ 4.58 s
  assert.equal(f.intensity, "moderate"); // 16²/450 ≈ 0.57 m/s²
  const near = forecast({ geometry: geo({ distanceMin: 10, distanceMax: 50 }), ...ok });
  assert.equal(near.confidence, "high");
});

test("forecast is suppressed with explicit reasons", () => {
  const cases: [Parameters<typeof forecast>[0], string][] = [
    [{ geometry: geo(), ...ok, verified: false }, "unverified"],
    [{ geometry: geo(), ...ok, stale: true }, "stale"],
    [{ geometry: geo(), ...ok, stationary: true }, "stationary"],
    [{ geometry: geo(), ...ok, delayed: true }, "delayed"],
    [{ geometry: geo({ speedMax: 5, speedMin: 10 }), ...ok }, "invalid"],
    [{ geometry: geo({ curvature: 0 }), ...ok }, "straight"],
    [{ geometry: geo({ distanceMax: 400 }), ...ok }, "ambiguous"],
    [{ geometry: null, ...ok, verified: false }, "unverified"],
  ];
  for (const [input, reason] of cases) {
    const f = forecast(input);
    assert.equal(f.suppressed, true, reason);
    assert.ok(f.reasons.includes(reason as never), `${reason} in ${f.reasons.join(",")}`);
    assert.equal(f.sway, "none");
    assert.equal(f.window, null);
  }
});

test("transition jerk scales with v³", () => {
  assert.ok(Math.abs(transitionJerk(20, 1e-4) / transitionJerk(10, 1e-4) - 8) < 1e-12);
});

test("synthetic track has a left R450 then a right R300 curve and loops", () => {
  const curves = findCurves(SYN_A);
  assert.equal(curves.length, 2);
  assert.equal(curves[0]!.turn, "left");
  assert.equal(Math.round(curves[0]!.radius), 450);
  assert.equal(curves[1]!.turn, "right");
  assert.equal(Math.round(curves[1]!.radius), 300);
  const wrap = nextCurve(SYN_A, 650, true);
  assert.equal(wrap?.curve.id, "C1");
  assert.equal(wrap?.lapOffset, 1);
});

test("synthetic frame approaches C1 with a right-sway forecast, then shows sway inside it", () => {
  const before = syntheticFrame(10);
  assert.equal(before.upcoming?.curve.id, "C1");
  assert.equal(before.forecast.sway, "right");
  assert.equal(before.approaching, true);
  const inside = syntheticFrame(17);
  assert.equal(inside.upcoming?.inside, true);
  assert.equal(inside.sway, "right");
});
