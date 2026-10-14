import test from "node:test";
import assert from "node:assert/strict";
import {
  createQuotaGuard,
  createSubwayService,
  interpretPayload,
  parseObservedAt,
  selectTrains,
  stationMatches,
  type FetchLike,
  type RawPosition,
} from "../src/lib/seoulSubway.ts";

const KEY = "TEST-SECRET-KEY-123";
const NOW = Date.parse("2026-10-14T05:00:00Z"); // 14:00:00 KST

const row = (over: Partial<RawPosition> = {}): RawPosition => ({
  subwayId: "1002",
  subwayNm: "2호선",
  statnNm: "강남",
  trainNo: "2156",
  recptnDt: "2026-10-14 13:59:30",
  lastRecptnDt: "20261014",
  updnLine: "1",
  statnTnm: "성수",
  trainSttus: "1",
  directAt: "0",
  lstcarAt: "0",
  ...over,
});

const okFetch = (rows: RawPosition[]) => {
  const calls: string[] = [];
  const fn: FetchLike = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ errorMessage: { code: "INFO-000" }, realtimePositionList: rows }) };
  };
  return { fn, calls };
};

test("interpretPayload handles rows, empty, auth and malformed payloads", () => {
  assert.equal(interpretPayload({ realtimePositionList: [row()] }).kind, "rows");
  assert.equal(interpretPayload({ status: 500, code: "INFO-200", message: "없음" }).kind, "empty");
  assert.equal(interpretPayload({ code: "INFO-100" }).kind, "auth");
  assert.equal(interpretPayload({ errorMessage: { code: "ERROR-337" } }).kind, "quota");
  assert.deepEqual(interpretPayload("<html>"), { kind: "error", code: "PARSE" });
});

test("observation time is parsed as KST", () => {
  assert.equal(parseObservedAt(row()), "2026-10-14T13:59:30+09:00");
  assert.equal(parseObservedAt(row({ recptnDt: "13:59:30" })), "2026-10-14T13:59:30+09:00");
  assert.equal(parseObservedAt(row({ recptnDt: "", lastRecptnDt: "" })), null);
});

test("station matching normalizes suffix and parenthetical names", () => {
  assert.ok(stationMatches("강남역", "강남"));
  assert.ok(stationMatches(" 강 남 ", "강남"));
  assert.ok(stationMatches("이수", "총신대입구(이수)"));
  assert.ok(!stationMatches("강남", "강남구청"));
});

test("selectTrains filters direction/station, dedupes and flags freshness", () => {
  const rows = [
    row(),
    row({ trainNo: "2156", recptnDt: "2026-10-14 13:58:00" }),
    row({ trainNo: "2200", updnLine: "0" }),
    row({ trainNo: "2300", statnNm: "역삼", recptnDt: "2026-10-14 13:50:00" }),
  ];
  const trains = selectTrains(rows, { line: 2, direction: "1" }, NOW);
  assert.deepEqual(trains.map((t) => t.id), ["2156", "2300"]);
  assert.equal(trains[0]!.fresh, true);
  assert.equal(trains[0]!.direction, "외선");
  assert.equal(trains[0]!.state, "도착");
  assert.equal(trains[1]!.fresh, false, "10 minutes old must not be fresh");
  assert.deepEqual(selectTrains(rows, { line: 2, station: "역삼역" }, NOW).map((t) => t.id), ["2300"]);
});

test("missing key returns explicit state without calling the provider", async () => {
  const { fn, calls } = okFetch([row()]);
  const svc = createSubwayService({ getKey: () => undefined, fetchImpl: fn, now: () => NOW });
  const res = await svc.getTrains({ line: 2 });
  assert.equal(res.status, "missing_key");
  assert.equal(calls.length, 0);
});

test("responses are cached within TTL and concurrent requests are deduped", async () => {
  const { fn, calls } = okFetch([row()]);
  let t = NOW;
  const svc = createSubwayService({ getKey: () => KEY, fetchImpl: fn, now: () => t });
  const [a, b] = await Promise.all([svc.getTrains({ line: 2 }), svc.getTrains({ line: 2, direction: "1" })]);
  assert.equal(a.status, "live");
  assert.equal(b.trains.length, 1);
  assert.equal(calls.length, 1);
  t += 10_000;
  const c = await svc.getTrains({ line: 2 });
  assert.equal(c.cached, true);
  assert.equal(calls.length, 1);
  t += 40_000;
  await svc.getTrains({ line: 2 });
  assert.equal(calls.length, 2);
});

test("provider failure: unavailable without cache, degraded with stale cache; key never logged", async () => {
  const logs: string[] = [];
  let fail = false;
  let t = NOW;
  const fn: FetchLike = async (url) => {
    if (fail) throw new TypeError(`fetch failed for ${url}`);
    return { ok: true, status: 200, json: async () => ({ realtimePositionList: [row()] }) };
  };
  const log = { warn: (o: Record<string, unknown>, m: string) => logs.push(JSON.stringify(o) + m) };

  const cold = createSubwayService({ getKey: () => KEY, fetchImpl: async () => { throw new Error(`boom ${KEY}`); }, now: () => t, log });
  const r1 = await cold.getTrains({ line: 3 });
  assert.equal(r1.status, "unavailable");
  assert.equal(r1.trains.length, 0);

  const warm = createSubwayService({ getKey: () => KEY, fetchImpl: fn, now: () => t, log });
  await warm.getTrains({ line: 2 });
  fail = true;
  t += 60_000;
  const r2 = await warm.getTrains({ line: 2 });
  assert.equal(r2.status, "degraded");
  assert.equal(r2.cached, true);
  assert.equal(r2.trains.length, 1);

  const http = createSubwayService({ getKey: () => KEY, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }), now: () => t, log });
  assert.equal((await http.getTrains({ line: 4 })).status, "unavailable");

  for (const entry of [...logs, JSON.stringify(r1), JSON.stringify(r2)]) {
    assert.ok(!entry.includes(KEY), "secret key leaked into logs or response");
  }
});

test("quota guard stops upstream calls before the daily limit", async () => {
  const { fn, calls } = okFetch([row()]);
  const quota = createQuotaGuard(3, 1);
  let t = NOW;
  const svc = createSubwayService({ getKey: () => KEY, fetchImpl: fn, now: () => t, quota });
  await svc.getTrains({ line: 1 });
  await svc.getTrains({ line: 2 });
  const blocked = await svc.getTrains({ line: 3 });
  assert.equal(blocked.status, "quota");
  assert.equal(calls.length, 2);
  t += 24 * 3_600_000; // next Seoul day resets the budget
  assert.equal((await svc.getTrains({ line: 3 })).status, "live");
});

test("auth rejection is reported without exposing details", async () => {
  const svc = createSubwayService({
    getKey: () => KEY,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ code: "INFO-100", message: "인증키가 유효하지 않습니다." }) }),
    now: () => NOW,
  });
  const res = await svc.getTrains({ line: 5 });
  assert.equal(res.status, "unavailable");
  assert.ok(!JSON.stringify(res).includes(KEY));
});
