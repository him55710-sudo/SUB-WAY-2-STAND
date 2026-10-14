import test from "node:test";
import assert from "node:assert/strict";
import { decideAlert, type AlertInput } from "../lib/alertPolicy.ts";
import { createAnnouncer, TEST_PHRASE, warningPhrase, type SpeechPort } from "../lib/announcer.ts";
import { trainCondition, formatAge, formatKstClock } from "../lib/freshness.ts";
import { forecast } from "../lib/physics.ts";

const goodForecast = forecast({
  geometry: { speedMin: 12, speedMax: 16, distanceMin: 40, distanceMax: 80, curvature: 1 / 450 },
  verified: true,
  stale: false,
  stationary: false,
  delayed: false,
});
const base: AlertInput = {
  mode: "demo",
  running: true,
  appActive: true,
  forecast: goodForecast,
  etaSeconds: 5,
  curveKey: "0:C1",
  alerted: new Set(),
};

test("alert fires once per curve inside the lead window", () => {
  const d = decideAlert(base);
  assert.deepEqual(d, { alert: true, side: "right", key: "0:C1" });
  assert.deepEqual(decideAlert({ ...base, alerted: new Set(["0:C1"]) }), {
    alert: false,
    block: "already_alerted",
  });
});

test("alerts are blocked in live mode, paused, background, too early/late and suppressed", () => {
  const blocked: [Partial<AlertInput>, string][] = [
    [{ mode: "live" }, "live_mode"],
    [{ running: false }, "paused"],
    [{ appActive: false }, "background"],
    [{ etaSeconds: 9 }, "too_early"],
    [{ etaSeconds: 0.4 }, "too_late"],
    [{ curveKey: null }, "no_curve"],
    [
      {
        forecast: forecast({
          geometry: { speedMin: 12, speedMax: 16, distanceMin: 40, distanceMax: 80, curvature: 1 / 450 },
          verified: true,
          stale: true,
          stationary: false,
          delayed: false,
        }),
      },
      "suppressed",
    ],
  ];
  for (const [over, block] of blocked) {
    assert.deepEqual(decideAlert({ ...base, ...over }), { alert: false, block });
  }
});

function fakePort() {
  const log: string[] = [];
  const port: SpeechPort = {
    speak: (t) => log.push(`speak:${t}`),
    stop: () => log.push("stop"),
  };
  return { port, log };
}

test("announcer stops current speech before speaking and respects the voice toggle", () => {
  const { port, log } = fakePort();
  const a = createAnnouncer(port, { voiceEnabled: true });
  assert.equal(a.announce(warningPhrase("left")), true);
  assert.deepEqual(log, ["stop", `speak:${warningPhrase("left")}`]);
  assert.match(warningPhrase("left"), /왼쪽으로 쏠릴 수 있습니다/);
  assert.match(warningPhrase("right"), /^시연입니다/);

  log.length = 0;
  a.setVoiceEnabled(false);
  assert.deepEqual(log, ["stop"], "turning voice off stops speech");
  assert.equal(a.announce("무시됨"), false);
  assert.deepEqual(log, ["stop"], "nothing spoken while voice is off");
});

test("test button plays even when voice is off", () => {
  const { port, log } = fakePort();
  const a = createAnnouncer(port, { voiceEnabled: false });
  a.test();
  assert.deepEqual(log, ["stop", `speak:${TEST_PHRASE}`]);
  assert.equal(a.lastSpoken, TEST_PHRASE);
});

test("phrases never instruct passengers to lean", () => {
  for (const p of [TEST_PHRASE, warningPhrase("left"), warningPhrase("right")]) {
    assert.doesNotMatch(p, /기대|기울/);
  }
});

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
