/**
 * Seoul Open Data Plaza — 지하철 실시간 열차 위치정보 (realtimePosition) proxy logic.
 *
 * Provider facts (official spec, OA-12601):
 *   - Station-level observation only: trainNo, statnNm, updnLine, trainSttus, recptnDt.
 *   - NO coordinates, instantaneous speed, braking command or curve entry time.
 *   - The key is embedded in the URL path, so this module must never log URLs
 *     or raw error messages (which may contain the URL).
 *
 * Pure logic + injectable fetch so it can be unit-tested without network access.
 */
import type { Train, TrainResponse } from "@workspace/api-zod";

export const DAILY_LIMIT = 1000;
export const QUOTA_RESERVE = 50;
export const FRESH_LIMIT_SECONDS = 120;
export const MAX_FUTURE_SKEW_SECONDS = 90;
export const STALE_CACHE_MAX_MS = 10 * 60_000;
export const UPSTREAM_TIMEOUT_MS = 7_000;
export const COVERAGE =
  "서울 열린데이터광장 지하철 실시간 열차 위치정보(realtimePosition) · 1–9호선 · 역 단위 관측 · 좌표·속도·곡선 진입 시각 미제공";

const STATE_LABELS: Record<string, string> = {
  "0": "진입",
  "1": "도착",
  "2": "출발",
  "3": "전역출발",
};

export interface RawPosition {
  subwayId?: string;
  subwayNm?: string;
  statnId?: string;
  statnNm?: string;
  trainNo?: string;
  lastRecptnDt?: string;
  recptnDt?: string;
  updnLine?: string;
  statnTid?: string;
  statnTnm?: string;
  trainSttus?: string;
  directAt?: string;
  lstcarAt?: string;
}

export type Upstream =
  | { kind: "rows"; rows: RawPosition[] }
  | { kind: "empty" }
  | { kind: "auth" }
  | { kind: "quota" }
  | { kind: "error"; code: string };

export type TrainQuery = { line: number; direction?: "0" | "1"; station?: string };

/** Interprets both the success shape and the bare-error shape of the provider JSON. */
export function interpretPayload(json: unknown): Upstream {
  if (!json || typeof json !== "object") return { kind: "error", code: "PARSE" };
  const root = json as Record<string, unknown>;
  const list = root["realtimePositionList"];
  const meta = (
    root["errorMessage"] && typeof root["errorMessage"] === "object" ? root["errorMessage"] : root
  ) as Record<string, unknown>;
  const code = typeof meta["code"] === "string" ? (meta["code"] as string) : "";
  if (Array.isArray(list) && list.length > 0) return { kind: "rows", rows: list as RawPosition[] };
  if (code === "INFO-200" || (code === "INFO-000" && Array.isArray(list))) return { kind: "empty" };
  if (code === "INFO-100") return { kind: "auth" };
  if (code === "ERROR-337") return { kind: "quota" };
  return { kind: "error", code: code || "UNKNOWN" };
}

/** recptnDt is local Seoul time (KST, UTC+9) without an offset. */
export function parseObservedAt(row: RawPosition): string | null {
  const r = (row.recptnDt ?? "").trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(r);
  if (full) return `${full[1]}-${full[2]}-${full[3]}T${full[4]}:${full[5]}:${full[6]}+09:00`;
  const d = /^(\d{4})-?(\d{2})-?(\d{2})/.exec((row.lastRecptnDt ?? "").trim());
  const t = /^(\d{2}):?(\d{2}):?(\d{2})$/.exec(r);
  if (d && t) return `${d[1]}-${d[2]}-${d[3]}T${t[1]}:${t[2]}:${t[3]}+09:00`;
  return null;
}

/** "서울역" ≡ "서울", "총신대입구(이수)" ≡ "총신대입구" ≡ "이수". */
export function stationKeys(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, "");
  const base = clean.replace(/\(.*?\)/g, "");
  const inner = [...clean.matchAll(/\((.*?)\)/g)].map((m) => m[1] ?? "");
  return [...new Set([clean, base, ...inner].map((s) => s.replace(/역$/, "")).filter(Boolean))];
}

export function stationMatches(query: string, stationName: string): boolean {
  const q = stationKeys(query);
  const s = stationKeys(stationName);
  return q.some((k) => s.includes(k));
}

export function directionLabel(line: number, code: "0" | "1"): string {
  if (line === 2) return code === "0" ? "내선" : "외선";
  return code === "0" ? "상행" : "하행";
}

export function toTrain(row: RawPosition, line: number, now: number): Train | null {
  const id = (row.trainNo ?? "").trim();
  const station = (row.statnNm ?? "").trim();
  const dir = row.updnLine === "0" || row.updnLine === "1" ? row.updnLine : null;
  const observedAt = parseObservedAt(row);
  if (!id || !station || !dir || !observedAt) return null;
  const rawState = row.trainSttus ?? "";
  const stateCode = rawState in STATE_LABELS ? (rawState as "0" | "1" | "2" | "3") : "unknown";
  const age = (now - Date.parse(observedAt)) / 1000;
  return {
    id,
    line,
    station,
    direction: directionLabel(line, dir),
    directionCode: dir,
    destination: (row.statnTnm ?? "").trim() || "행선지 미상",
    state: STATE_LABELS[stateCode] ?? "상태 미상",
    stateCode,
    observedAt,
    fresh: age >= -MAX_FUTURE_SKEW_SECONDS && age <= FRESH_LIMIT_SECONDS,
    express: row.directAt === "1" || row.directAt === "7",
    lastTrain: row.lstcarAt === "1",
  };
}

export function selectTrains(rows: RawPosition[], q: TrainQuery, now: number): Train[] {
  const byId = new Map<string, Train>();
  for (const row of rows) {
    const t = toTrain(row, q.line, now);
    if (!t) continue;
    const prev = byId.get(t.id);
    if (!prev || Date.parse(t.observedAt) > Date.parse(prev.observedAt)) byId.set(t.id, t);
  }
  const station = q.station?.trim();
  return [...byId.values()]
    .filter((t) => !q.direction || t.directionCode === q.direction)
    .filter((t) => !station || stationMatches(station, t.station))
    .sort((a, b) =>
      a.fresh === b.fresh ? Date.parse(b.observedAt) - Date.parse(a.observedAt) : a.fresh ? -1 : 1,
    );
}

/** Daily budget keyed on the Seoul calendar day. In-memory: resets on server restart. */
export function kstDayKey(now: number): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}

export type QuotaGuard = {
  remaining: (now: number) => number;
  canSpend: (now: number) => boolean;
  spend: (now: number) => void;
};

export function createQuotaGuard(limit = DAILY_LIMIT, reserve = QUOTA_RESERVE): QuotaGuard {
  let day = "";
  let used = 0;
  const roll = (now: number) => {
    const key = kstDayKey(now);
    if (key !== day) {
      day = key;
      used = 0;
    }
  };
  return {
    remaining(now) {
      roll(now);
      return Math.max(0, limit - used);
    },
    canSpend(now) {
      roll(now);
      return limit - used > reserve;
    },
    spend(now) {
      roll(now);
      used += 1;
    },
  };
}

/** Cache longer as the daily budget shrinks. */
export function cacheTtlMs(remaining: number): number {
  if (remaining > 600) return 30_000;
  if (remaining > 300) return 60_000;
  return 180_000;
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface SubwayServiceOptions {
  getKey: () => string | undefined;
  fetchImpl: FetchLike;
  now?: () => number;
  quota?: QuotaGuard;
  log?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

type CacheEntry = { at: number; rows: RawPosition[] };
type LineResult =
  | { kind: "ok"; entry: CacheEntry; cached: boolean }
  | { kind: "missing_key" }
  | { kind: "auth" }
  | { kind: "quota"; stale: CacheEntry | null }
  | { kind: "unavailable"; stale: CacheEntry | null };

export function createSubwayService(opts: SubwayServiceOptions) {
  const now = opts.now ?? Date.now;
  const quota = opts.quota ?? createQuotaGuard();
  const cache = new Map<number, CacheEntry>();
  const inflight = new Map<number, Promise<LineResult>>();

  async function fetchLine(line: number, key: string): Promise<LineResult> {
    const prior = cache.get(line) ?? null;
    const stale = prior && now() - prior.at <= STALE_CACHE_MAX_MS ? prior : null;
    if (!quota.canSpend(now())) return { kind: "quota", stale };
    quota.spend(now());
    const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimePosition/0/199/${encodeURIComponent(`${line}호선`)}`;
    try {
      const res = await opts.fetchImpl(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (!res.ok) {
        opts.log?.warn({ line, status: res.status }, "subway upstream http error");
        return { kind: "unavailable", stale };
      }
      const up = interpretPayload(await res.json());
      if (up.kind === "rows" || up.kind === "empty") {
        const entry = { at: now(), rows: up.kind === "rows" ? up.rows : [] };
        cache.set(line, entry);
        return { kind: "ok", entry, cached: false };
      }
      if (up.kind === "auth") return { kind: "auth" };
      if (up.kind === "quota") return { kind: "quota", stale };
      opts.log?.warn({ line, code: up.code }, "subway upstream error code");
      return { kind: "unavailable", stale };
    } catch (err) {
      // Never log err.message: fetch errors can echo the URL, which contains the key.
      opts.log?.warn(
        { line, error: err instanceof Error ? err.name : "unknown" },
        "subway upstream request failed",
      );
      return { kind: "unavailable", stale };
    }
  }

  async function loadLine(line: number): Promise<LineResult> {
    const key = opts.getKey();
    if (!key) return { kind: "missing_key" };
    const hit = cache.get(line);
    if (hit && now() - hit.at < cacheTtlMs(quota.remaining(now()))) {
      return { kind: "ok", entry: hit, cached: true };
    }
    const pending = inflight.get(line);
    if (pending) return pending;
    const p = fetchLine(line, key).finally(() => inflight.delete(line));
    inflight.set(line, p);
    return p;
  }

  async function getTrains(q: TrainQuery): Promise<TrainResponse> {
    const result = await loadLine(q.line);
    const t = now();
    const base = {
      fetchedAt: new Date(t).toISOString(),
      coverage: COVERAGE,
      callsRemaining: quota.remaining(t),
    };
    const station = q.station?.trim();
    const emptyMessage = station
      ? `'${station}' 역에서 관측된 열차가 없습니다.`
      : "이 방향에서 관측된 열차가 없습니다.";

    switch (result.kind) {
      case "missing_key":
        return {
          ...base,
          status: "missing_key",
          message: "서버에 SEOUL_SUBWAY_API_KEY가 설정되지 않았습니다.",
          trains: [],
          cached: false,
          totalOnLine: 0,
        };
      case "auth":
        return {
          ...base,
          status: "unavailable",
          message: "서버에 설정된 인증키가 거부되었습니다. 키 설정을 확인해 주세요.",
          trains: [],
          cached: false,
          totalOnLine: 0,
        };
      case "ok": {
        const all = selectTrains(result.entry.rows, { line: q.line }, t);
        const trains = selectTrains(result.entry.rows, q, t);
        return {
          ...base,
          fetchedAt: new Date(result.entry.at).toISOString(),
          status: trains.length > 0 ? "live" : "empty",
          message: trains.length > 0 ? "역 단위 실시간 관측" : emptyMessage,
          trains,
          cached: result.cached,
          totalOnLine: all.length,
        };
      }
      case "quota":
      case "unavailable": {
        const quotaHit = result.kind === "quota";
        if (result.stale) {
          return {
            ...base,
            fetchedAt: new Date(result.stale.at).toISOString(),
            status: quotaHit ? "quota" : "degraded",
            message: quotaHit
              ? "오늘 조회 한도를 보호하기 위해 마지막 관측을 표시합니다."
              : "공공 API 응답에 실패해 최근 관측을 표시합니다.",
            trains: selectTrains(result.stale.rows, q, t),
            cached: true,
            totalOnLine: selectTrains(result.stale.rows, { line: q.line }, t).length,
          };
        }
        return {
          ...base,
          status: quotaHit ? "quota" : "unavailable",
          message: quotaHit
            ? "오늘 조회 한도에 가까워 실시간 조회를 잠시 멈췄습니다."
            : "공공 API에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
          trains: [],
          cached: false,
          totalOnLine: 0,
        };
      }
    }
  }

  return { getTrains };
}
