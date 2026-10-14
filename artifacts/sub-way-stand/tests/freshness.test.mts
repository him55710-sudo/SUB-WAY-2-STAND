// Observation freshness helpers (lib/freshness.ts). Run with the mobile `test` script.
import test from "node:test";
import assert from "node:assert/strict";
import { trainCondition, formatAge, formatKstClock } from "../lib/freshness.ts";

const train = (over: Record<string, unknown> = {}) =>
  ({
    id: "2156",
    line: 2,
    station: "강남",
    direction: "외선",
    directionCode: "1",
    destination: "성수",
    state: "출발",
    stateCode: "2",
    observedAt: "2026-10-14T14:00:00+09:00",
    fresh: true,
    express: false,
    lastTrain: false,
    ...over,
  }) as never;
const NOW = Date.parse("2026-10-14T14:00:30+09:00");

test("freshness conditions: offline, missing, unknown, stale, stationary, moving", () => {
  assert.equal(trainCondition({ train: train(), now: NOW, online: false }).condition, "offline");
  assert.equal(trainCondition({ train: null, now: NOW, online: true }).condition, "missing");
  assert.equal(trainCondition({ train: train({ stateCode: "unknown" }), now: NOW, online: true }).condition, "unknown");
  assert.equal(
    trainCondition({ train: train({ observedAt: "2026-10-14T13:57:00+09:00" }), now: NOW, online: true }).condition,
    "stale",
  );
  assert.equal(trainCondition({ train: train({ stateCode: "1" }), now: NOW, online: true }).condition, "stationary");
  assert.equal(trainCondition({ train: train(), now: NOW, online: true }).condition, "moving");
});

test("formatting helpers", () => {
  assert.equal(formatAge(30), "30초 전");
  assert.equal(formatAge(2), "방금");
  assert.equal(formatAge(125), "2분 전");
  assert.equal(formatKstClock("2026-10-14T05:03:21Z"), "14:03:21");
});
