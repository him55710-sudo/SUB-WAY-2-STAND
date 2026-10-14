/**
 * Pure mapping from GET /api/subway/trains responses to the app contracts.
 * Owner: backend/data task. Type-only imports, so Node tests can load it.
 *
 * Honesty rules
 * - Only the API decides whether data is live; its status + Korean message are
 *   passed through unchanged (키 없음 / 캐시 / 한도 / 연결 불가 …).
 * - `fresh` is re-checked on the device as time passes, so a train that was
 *   fresh when fetched turns stale if polling stops.
 * - A failed request to our own API server becomes `offline`; any trains shown
 *   then are the last ones received and age out like everything else.
 */
import type { Train, TrainResponse } from '@workspace/api-client-react';
import type { FeedStatus, TrainCandidate } from '@/contracts';

/** Train-select screen. The server caches ≥30 s, so faster polling buys nothing. */
export const CANDIDATE_POLL_MS = 30_000;
/** Ride screen (tracked train). */
export const TRACK_POLL_MS = 20_000;
/** Same limits as the API proxy. */
export const FRESH_LIMIT_S = 120;
export const FUTURE_SKEW_S = 90;

/** Statuses whose train list is a current, complete observation of the line. */
const AUTHORITATIVE = new Set<TrainResponse['status']>(['live', 'empty']);

export function isFreshAt(train: Pick<Train, 'observedAt' | 'fresh'>, now: number): boolean {
  if (!train.fresh) return false;
  const observed = Date.parse(train.observedAt);
  if (!Number.isFinite(observed)) return false;
  const ageS = (now - observed) / 1000;
  return ageS >= -FUTURE_SKEW_S && ageS <= FRESH_LIMIT_S;
}

export function toCandidate(train: Train, now: number): TrainCandidate {
  return {
    id: train.id,
    line: train.line,
    station: train.station,
    direction: train.direction,
    directionCode: train.directionCode,
    destination: train.destination,
    state: train.state,
    stateCode: train.stateCode,
    observedAt: train.observedAt,
    fresh: isFreshAt(train, now),
    express: train.express,
    lastTrain: train.lastTrain,
    origin: 'live',
  };
}

export function feedFromResponse(res: TrainResponse): FeedStatus {
  return {
    status: res.status,
    message: res.message,
    fetchedAt: res.fetchedAt,
    cached: res.cached,
    origin: 'live',
  };
}

export const LOADING_FEED: FeedStatus = {
  status: 'unavailable',
  message: '실시간 열차 정보를 불러오는 중입니다.',
  fetchedAt: null,
  cached: false,
  origin: 'live',
};

export const DISABLED_FEED: FeedStatus = {
  status: 'offline',
  message: '실시간 열차 기능이 꺼져 있습니다. 시뮬레이션으로 체험해 주세요.',
  fetchedAt: null,
  cached: false,
  origin: 'fixture',
};

export function invalidLineFeed(line: number): FeedStatus {
  return {
    status: 'unavailable',
    message: `${line}호선은 실시간 조회를 지원하지 않습니다 (1–9호선만 가능).`,
    fetchedAt: null,
    cached: false,
    origin: 'live',
  };
}

/** Our own API server could not be reached or answered with an error. */
export function offlineFeed(error: unknown, last: TrainResponse | undefined): FeedStatus {
  const httpStatus =
    error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
      ? error.status
      : null;
  const cause = httpStatus ? `앱 서버 오류(${httpStatus})` : '앱 서버에 연결할 수 없습니다';
  return {
    status: 'offline',
    message: last
      ? `${cause}. 마지막으로 받은 관측을 표시합니다.`
      : `${cause}. 잠시 후 다시 시도해 주세요.`,
    fetchedAt: last?.fetchedAt ?? null,
    cached: Boolean(last),
    origin: 'live',
  };
}

export function isValidLine(line: number): boolean {
  return Number.isInteger(line) && line >= 1 && line <= 9;
}

/** Trims the station filter; the API rejects names over 40 characters. */
export function normalizeStationQuery(station: string | undefined): string | undefined {
  const s = station?.trim();
  return s ? s.slice(0, 40) : undefined;
}

export interface FeedSnapshot {
  data: TrainResponse | undefined;
  error: unknown;
  isError: boolean;
}

export function feedFromSnapshot(snap: FeedSnapshot): FeedStatus {
  if (snap.isError) return offlineFeed(snap.error, snap.data);
  return snap.data ? feedFromResponse(snap.data) : LOADING_FEED;
}

export function candidatesFromSnapshot(snap: FeedSnapshot, now: number): TrainCandidate[] {
  return (snap.data?.trains ?? []).map((t) => toCandidate(t, now));
}

export interface TrackedState {
  train: TrainCandidate | null;
  lost: boolean;
}

/**
 * Finds `trainId` in the latest line-wide response. When it is missing from a
 * current, complete observation (live/empty) it is `lost`, and the last
 * observation seen (if any) is returned so screens can still show it as stale.
 * Cached/degraded/offline responses never mark a train lost.
 */
export function trackedFromSnapshot(
  snap: FeedSnapshot,
  trainId: string,
  lastSeen: Train | null,
  now: number,
): TrackedState {
  const res = snap.data;
  const hit = res?.trains.find((t) => t.id === trainId) ?? null;
  if (hit && !snap.isError) return { train: toCandidate(hit, now), lost: false };
  const fallback = hit ?? lastSeen;
  const lost = Boolean(res && !snap.isError && AUTHORITATIVE.has(res.status) && !hit);
  return { train: fallback ? toCandidate(fallback, now) : null, lost };
}
