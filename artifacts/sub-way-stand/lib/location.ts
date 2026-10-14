/** Local station suggestions only. A GPS fix never identifies a train. */
import { LINE2_MAIN_LOOP } from '../data/line2.ts';

export interface RiderPosition {
  latitude: number;
  longitude: number;
  accuracyM: number;
  timestampMs: number;
}

export interface NearbyStation {
  name: string;
  line: 2;
  distanceM: number;
}

export const LOCATION_MAX_AGE_MS = 60_000;
export const LOCATION_MAX_ACCURACY_M = 1_000;
export const NEARBY_STATION_RADIUS_M = 5_000;

export function positionIssue(position: RiderPosition, nowMs = Date.now()): 'invalid' | 'stale' | 'inaccurate' | null {
  const { latitude, longitude, accuracyM, timestampMs } = position;
  if (![latitude, longitude, accuracyM, timestampMs, nowMs].every(Number.isFinite) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracyM < 0 || timestampMs > nowMs + 5_000) return 'invalid';
  if (nowMs - timestampMs >= LOCATION_MAX_AGE_MS) return 'stale';
  if (accuracyM > LOCATION_MAX_ACCURACY_M) return 'inaccurate';
  return null;
}

/** Great-circle distance between WGS84 station points, metres. */
export function distanceMetres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function nearestLine2Stations(position: RiderPosition, nowMs = Date.now(), limit = 3): NearbyStation[] {
  if (positionIssue(position, nowMs) || !Number.isFinite(limit) || limit < 1) return [];
  return LINE2_MAIN_LOOP
    .map((station): NearbyStation => ({ name: station.name, line: 2,
      distanceM: Math.round(distanceMetres(position.latitude, position.longitude, station.lat, station.lon)) }))
    .filter((station) => station.distanceM <= NEARBY_STATION_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, Math.floor(limit));
}
