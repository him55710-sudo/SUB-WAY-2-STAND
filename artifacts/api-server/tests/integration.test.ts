// Contract leg of the end-to-end chain: provider payload → proxy service →
// response schema (the same Zod parse the route applies). The parsed responses
// are pinned as JSON fixtures that the mobile integration test
// (artifacts/sub-way-stand/tests/integration.test.ts) feeds into the app's
// trains → route → forecast → guidance chain, so both sides share one payload.
//
// Regenerate after an intentional contract change:
//   UPDATE_FIXTURES=1 pnpm --filter @workspace/api-server test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
// The package entry re-exports extensionless paths that plain Node can't resolve.
import { GetSubwayTrainsResponse } from "../../../lib/api-zod/src/generated/api.ts";
import { createSubwayService, type FetchLike, type RawPosition } from "../src/lib/seoulSubway.ts";

const KEY = "TEST-SECRET-KEY-123";
const NOW = Date.parse("2026-10-14T05:00:00Z"); // 14:00:00 KST

const pos = (over: Partial<RawPosition>): RawPosition => ({
  subwayId: "1002",
  subwayNm: "2호선",
  statnNm: "강남",
  trainNo: "0000",
  recptnDt: "2026-10-14 13:59:50",
  lastRecptnDt: "20261014",
  updnLine: "1",
  statnTnm: "성수종착",
  trainSttus: "2",
  directAt: "0",
  lstcarAt: "0",
  ...over,
});

// Shape of the live provider (2026-10-14); one row per scenario the app must handle.
const PROVIDER_PAYLOAD = {
  errorMessage: { status: 200, code: "INFO-000", message: "정상 처리되었습니다.", total: 6 },
  realtimePositionList: [
    pos({ trainNo: "3276", statnNm: "교대", updnLine: "0", trainSttus: "2", recptnDt: "2026-10-14 13:59:50" }), // moving (출발)
    pos({ trainNo: "2277", statnNm: "잠실", updnLine: "1", trainSttus: "1", recptnDt: "2026-10-14 13:59:50" }), // stopped (도착)
    pos({ trainNo: "2281", statnNm: "강남", updnLine: "1", trainSttus: "0", recptnDt: "2026-10-14 13:59:55" }), // entering (진입)
    pos({ trainNo: "2300", statnNm: "역삼", updnLine: "1", trainSttus: "3", recptnDt: "2026-10-14 13:59:45" }), // 전역출발
    pos({ trainNo: "5615", statnNm: "신도림지선", statnTnm: "신도림지선", updnLine: "1", trainSttus: "2", recptnDt: "2026-10-14 13:59:30" }), // branch line
    pos({ trainNo: "2310", statnNm: "선릉", updnLine: "1", trainSttus: "2", recptnDt: "2026-10-14 13:50:00" }), // stale (10 min)
  ],
};

const FIXTURES = new URL("./fixtures/", import.meta.url);

function pinned(name: string, actual: unknown) {
  const file = new URL(name, FIXTURES);
  if (process.env["UPDATE_FIXTURES"] === "1") writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(readFileSync(file, "utf8")), `${name} drifted; see header comment`);
}

test("live: provider payload → proxy → schema-valid response pinned for the app", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => PROVIDER_PAYLOAD };
  };
  const svc = createSubwayService({ getKey: () => KEY, fetchImpl, now: () => NOW });
  const body = GetSubwayTrainsResponse.parse(await svc.getTrains({ line: 2 }));

  assert.equal(calls.length, 1);
  assert.equal(body.status, "live");
  assert.equal(body.cached, false);
  assert.equal(body.trains.length, 6);
  assert.ok(!JSON.stringify(body).includes(KEY), "key leaked into the response");
  const byId = new Map(body.trains.map((t) => [t.id, t]));
  assert.equal(byId.get("3276")!.stateCode, "2");
  assert.equal(byId.get("3276")!.directionCode, "0");
  assert.equal(byId.get("2277")!.stateCode, "1");
  assert.equal(byId.get("2310")!.fresh, false);
  pinned("trains-line2-live.json", body);

  // Second request inside the TTL is served from cache and labeled as such.
  const again = GetSubwayTrainsResponse.parse(await svc.getTrains({ line: 2 }));
  assert.equal(again.cached, true);
  assert.equal(again.status, "live");
  assert.equal(calls.length, 1);
  pinned("trains-line2-cached.json", again);
});

test("missing key: explicit schema-valid state, provider never called, pinned for the app", async () => {
  let called = false;
  const svc = createSubwayService({
    getKey: () => undefined,
    fetchImpl: async () => {
      called = true;
      throw new Error("must not be called");
    },
    now: () => NOW,
  });
  const body = GetSubwayTrainsResponse.parse(await svc.getTrains({ line: 2 }));
  assert.equal(called, false);
  assert.equal(body.status, "missing_key");
  assert.deepEqual(body.trains, []);
  pinned("trains-line2-missing-key.json", body);
});

test("quota and provider outage stay schema-valid and never claim live", async () => {
  const outage = createSubwayService({
    getKey: () => KEY,
    fetchImpl: async () => {
      throw new TypeError("network down");
    },
    now: () => NOW,
  });
  const down = GetSubwayTrainsResponse.parse(await outage.getTrains({ line: 2 }));
  assert.equal(down.status, "unavailable");
  assert.deepEqual(down.trains, []);

  const quota = createSubwayService({
    getKey: () => KEY,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ errorMessage: { code: "ERROR-337" } }) }),
    now: () => NOW,
  });
  const q = GetSubwayTrainsResponse.parse(await quota.getTrains({ line: 2 }));
  assert.equal(q.status, "quota");
  assert.deepEqual(q.trains, []);
});
