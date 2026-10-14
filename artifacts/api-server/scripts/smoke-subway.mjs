#!/usr/bin/env node
/**
 * Smoke test for the running API server's /api/subway/trains proxy.
 *
 *   pnpm --filter @workspace/api-server run smoke
 *   API_BASE_URL=https://<domain> pnpm --filter @workspace/api-server run smoke
 *
 * Works with or without SEOUL_SUBWAY_API_KEY on the server: every status in the
 * contract is accepted, but the payload shape is checked strictly. All queries
 * hit the same line, so the server cache keeps this to one upstream call.
 * If the key is visible to this process, responses are checked for leaks.
 */
const BASE = (process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/+$/, "");
const KEY = process.env.SEOUL_SUBWAY_API_KEY?.trim() || null;
const STATUSES = new Set(["live", "degraded", "missing_key", "unavailable", "quota", "empty"]);
const STATE_CODES = new Set(["0", "1", "2", "3", "unknown"]);

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  if (KEY) check(!text.includes(KEY), `${path}: response contains the API key`);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    check(false, `${path}: response is not JSON`);
  }
  return { status: res.status, json };
}

function checkTrainResponse(path, body) {
  if (!body || typeof body !== "object") return check(false, `${path}: empty body`);
  check(STATUSES.has(body.status), `${path}: unknown status ${body.status}`);
  check(typeof body.message === "string" && body.message.length > 0, `${path}: missing message`);
  check(Array.isArray(body.trains), `${path}: trains is not an array`);
  check(!Number.isNaN(Date.parse(body.fetchedAt)), `${path}: bad fetchedAt`);
  check(typeof body.cached === "boolean", `${path}: cached is not boolean`);
  check(Number.isInteger(body.callsRemaining), `${path}: callsRemaining is not an integer`);
  check(Number.isInteger(body.totalOnLine), `${path}: totalOnLine is not an integer`);
  if (body.status === "live") check(body.trains.length > 0, `${path}: live with no trains`);
  if (["missing_key", "unavailable"].includes(body.status)) check(body.trains.length === 0, `${path}: ${body.status} with trains`);
  for (const t of body.trains ?? []) {
    check(typeof t.id === "string" && t.id.length > 0, `${path}: train without id`);
    check(t.directionCode === "0" || t.directionCode === "1", `${path}: train ${t.id} bad directionCode`);
    check(STATE_CODES.has(t.stateCode), `${path}: train ${t.id} bad stateCode`);
    check(/\+09:00$/.test(t.observedAt) && !Number.isNaN(Date.parse(t.observedAt)), `${path}: train ${t.id} bad observedAt`);
    check(typeof t.fresh === "boolean", `${path}: train ${t.id} fresh not boolean`);
    check(!/종착$/.test(t.destination) && !/종착$/.test(t.station), `${path}: train ${t.id} terminal suffix not cleaned`);
  }
}

const health = await get("/api/healthz").catch((e) => {
  console.error(`API server not reachable at ${BASE} (${e.name})`);
  process.exit(2);
});
check(health.status === 200, `/api/healthz returned ${health.status}`);

const all = await get("/api/subway/trains?line=2");
checkTrainResponse("line=2", all.json);
const station = await get(`/api/subway/trains?line=2&station=${encodeURIComponent("강남역")}`);
checkTrainResponse("line=2&station=강남역", station.json);
for (const t of station.json?.trains ?? []) check(t.station === "강남", `station filter leaked ${t.station}`);
const inner = await get("/api/subway/trains?line=2&direction=0");
checkTrainResponse("line=2&direction=0", inner.json);
for (const t of inner.json?.trains ?? []) check(t.directionCode === "0" && t.direction === "내선", `direction filter leaked ${t.id}`);
const bad = await get("/api/subway/trains?line=10");
check(bad.status === 400, `line=10 should be 400, got ${bad.status}`);

const body = all.json ?? {};
const trains = body.trains ?? [];
console.log(`base           ${BASE}`);
console.log(`status         ${body.status} — ${body.message}`);
console.log(`cached         ${body.cached}  fetchedAt ${body.fetchedAt}  callsRemaining ${body.callsRemaining}`);
console.log(`trains         ${trains.length} on line 2 (${trains.filter((t) => t.fresh).length} fresh), 강남 ${station.json?.trains?.length ?? 0}, 내선 ${inner.json?.trains?.length ?? 0}`);
for (const t of trains.slice(0, 5)) {
  console.log(`  ${t.id} ${t.direction} ${t.station} ${t.state} → ${t.destination} @ ${t.observedAt}${t.fresh ? "" : " (stale)"}`);
}
if (trains.length) console.log(`stations seen  ${[...new Set(trains.map((t) => t.station))].sort().join(" ")}`);

if (failures.length) {
  console.error(`\nFAIL (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nOK");
