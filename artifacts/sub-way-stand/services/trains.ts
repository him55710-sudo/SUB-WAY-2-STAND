/**
 * Trains + route service. Owner: backend/data task.
 *
 * Live trains come from GET /api/subway/trains (secure server proxy; the
 * Seoul API key never reaches the app). Polling is quota-friendly: 30 s on the
 * train list, 20 s for a tracked train, paused while the app is in the
 * background, and refreshed once on return. The server additionally caches
 * per line and guards the daily quota.
 *
 * Route geometry is bundled (Line 2 main loop only); see data/routes.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  getGetSubwayTrainsQueryKey,
  useGetSubwayTrains,
  type GetSubwayTrainsParams,
  type Train,
} from '@workspace/api-client-react';
import { FLAGS } from '@/config/flags';
import type { FindSegment, GetRoute, UseTrackedTrain, UseTrainCandidates } from '@/contracts';
import { ROUTE_ALIASES, ROUTES } from '@/data/routes';
import { findSegmentInRoute } from '@/data/routeGeometry';
import { useAppActive, useNow } from '@/hooks/runtime';
import {
  CANDIDATE_POLL_MS,
  DISABLED_FEED,
  TRACK_POLL_MS,
  candidatesFromSnapshot,
  feedFromSnapshot,
  invalidLineFeed,
  isValidLine,
  normalizeStationQuery,
  trackedFromSnapshot,
} from '@/services/trainFeed';

/** Re-evaluates freshness between polls so labels age honestly. */
const FRESHNESS_TICK_MS = 5_000;

function usePolledTrains(params: GetSubwayTrainsParams, enabled: boolean, intervalMs: number) {
  const active = useAppActive();
  const query = useGetSubwayTrains(params, {
    query: {
      queryKey: getGetSubwayTrainsQueryKey(params),
      enabled,
      refetchInterval: enabled && active ? intervalMs : false,
      refetchIntervalInBackground: false,
      staleTime: intervalMs / 2,
      retry: 1,
    },
  });
  const { refetch, dataUpdatedAt } = query;

  // Coming back to the foreground: refresh once if the data is due.
  useEffect(() => {
    if (enabled && active && Date.now() - dataUpdatedAt >= intervalMs) void refetch();
  }, [active, enabled, intervalMs, refetch, dataUpdatedAt]);

  return query;
}

export const useTrainCandidates: UseTrainCandidates = ({ line, direction, station }) => {
  const valid = isValidLine(line);
  const enabled = FLAGS.liveTrains && valid;
  const stationQuery = normalizeStationQuery(station);
  const params = useMemo<GetSubwayTrainsParams>(
    () => ({
      line: valid ? line : 2,
      ...(direction ? { direction } : {}),
      ...(stationQuery ? { station: stationQuery } : {}),
    }),
    [line, valid, direction, stationQuery],
  );
  const query = usePolledTrains(params, enabled, CANDIDATE_POLL_MS);
  const now = useNow(FRESHNESS_TICK_MS);
  const { data, error, isError, isLoading, refetch } = query;

  const candidates = useMemo(
    () => (enabled ? candidatesFromSnapshot({ data, error, isError }, now) : []),
    [enabled, data, error, isError, now],
  );
  const feed = !FLAGS.liveTrains
    ? DISABLED_FEED
    : !valid
      ? invalidLineFeed(line)
      : feedFromSnapshot({ data, error, isError });

  return {
    candidates,
    feed,
    isLoading: enabled && isLoading,
    refresh: () => {
      if (enabled) void refetch();
    },
  };
};

export const useTrackedTrain: UseTrackedTrain = (line, trainId) => {
  const valid = isValidLine(line);
  const enabled = FLAGS.liveTrains && valid && trainId !== null;
  // Line-wide query (no filters) so the train is found wherever it moves.
  const params = useMemo<GetSubwayTrainsParams>(() => ({ line: valid ? line : 2 }), [line, valid]);
  const query = usePolledTrains(params, enabled, TRACK_POLL_MS);
  const now = useNow(FRESHNESS_TICK_MS);
  const { data, error, isError, isLoading } = query;

  const [lastSeen, setLastSeen] = useState<{ trainId: string; train: Train } | null>(null);
  useEffect(() => {
    const hit = trainId ? data?.trains.find((t) => t.id === trainId) : undefined;
    if (hit) setLastSeen({ trainId: hit.id, train: hit });
  }, [data, trainId]);

  const tracked = useMemo(() => {
    if (!enabled || trainId === null) return { train: null, lost: false };
    const seen = lastSeen?.trainId === trainId ? lastSeen.train : null;
    return trackedFromSnapshot({ data, error, isError }, trainId, seen, now);
  }, [enabled, trainId, lastSeen, data, error, isError, now]);

  const feed = !FLAGS.liveTrains
    ? DISABLED_FEED
    : !valid
      ? invalidLineFeed(line)
      : feedFromSnapshot({ data, error, isError });

  return { train: tracked.train, feed, isLoading: enabled && isLoading, lost: tracked.lost };
};

export const getRoute: GetRoute = (line) => ROUTES[line] ?? null;

export const findSegment: FindSegment = (line, station, directionCode, end) => {
  const route = getRoute(line);
  if (!route) return null;
  return findSegmentInRoute(route, station, directionCode, end, ROUTE_ALIASES[line] ?? {});
};
