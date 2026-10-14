/**
 * Live observation freshness. Type-only imports so it runs under `node --test`.
 */
import type { Train } from "@workspace/api-client-react";

export const FRESH_S = 120;
export const FUTURE_SKEW_S = 90;
export const LIVE_POLL_MS = 60_000;

export type Condition = "offline" | "missing" | "unknown" | "stale" | "stationary" | "moving";

export const CONDITION_COPY: Record<Condition, { label: string; detail: string }> = {
  offline: { label: "연결 끊김", detail: "서버에 연결할 수 없어 마지막 관측을 표시합니다." },
  missing: { label: "관측 범위 밖", detail: "최근 응답에서 이 열차가 보이지 않습니다." },
  unknown: { label: "상태 불확실", detail: "열차 상태 또는 관측 시각을 해석할 수 없습니다." },
  stale: { label: "오래된 관측", detail: "관측 후 2분이 지나 현재 위치를 알 수 없습니다." },
  stationary: { label: "정차 중", detail: "역에 도착해 정차한 상태로 관측되었습니다." },
  moving: { label: "운행 중", detail: "역 단위 상태만 확인됩니다. 역 사이 위치·속도는 알 수 없습니다." },
};

export function observationAge(observedAt: string, now: number): number | null {
  const t = Date.parse(observedAt);
  return Number.isFinite(t) ? (now - t) / 1000 : null;
}

export function trainCondition(input: {
  train: Train | null | undefined;
  now: number;
  online: boolean;
}): { condition: Condition; ageSeconds: number | null } {
  const { train, now, online } = input;
  const ageSeconds = train ? observationAge(train.observedAt, now) : null;
  if (!online) return { condition: "offline", ageSeconds };
  if (!train) return { condition: "missing", ageSeconds: null };
  if (ageSeconds === null || train.stateCode === "unknown") return { condition: "unknown", ageSeconds };
  if (ageSeconds > FRESH_S || ageSeconds < -FUTURE_SKEW_S) return { condition: "stale", ageSeconds };
  if (train.stateCode === "1") return { condition: "stationary", ageSeconds };
  return { condition: "moving", ageSeconds };
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) return "시각 미상";
  if (seconds < -FUTURE_SKEW_S) return "시각 오차";
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return "방금";
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

/** HH:MM:SS in Seoul time without relying on Intl time-zone support. */
export function formatKstClock(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "--:--:--";
  return new Date(t + 9 * 3_600_000).toISOString().slice(11, 19);
}
