/** Offline Line 2 main-loop routing. Stop count is exact for this station list;
 * it is not an arrival-time prediction. Branches and transfers are excluded.
 */
import { LINE2_ALIASES, LINE2_MAIN_LOOP } from '../data/line2.ts';
import { stationKeys } from '../data/routeGeometry.ts';

export interface Line2JourneyOption {
  from: string;
  to: string;
  /** Includes departure and destination, in travel order. */
  stations: string[];
  stopCount: number;
  directionCode: '0' | '1';
  directionLabel: '내선' | '외선';
  nextStation: string;
}

export interface Line2Journey {
  recommended: Line2JourneyOption;
  alternative: Line2JourneyOption;
}

export function normalizeLine2Station(input: string): string | null {
  if (typeof input !== 'string') return null;
  const wanted = stationKeys(input).map((key) => LINE2_ALIASES[key] ?? LINE2_ALIASES[key.toUpperCase()] ?? key);
  return LINE2_MAIN_LOOP.find((station) => stationKeys(station.name).some((key) => wanted.includes(key)))?.name ?? null;
}

function option(fromIndex: number, toIndex: number, step: 1 | -1): Line2JourneyOption {
  const count = LINE2_MAIN_LOOP.length;
  const stopCount = step === 1 ? (toIndex - fromIndex + count) % count : (fromIndex - toIndex + count) % count;
  const stations = Array.from({ length: stopCount + 1 }, (_, offset) =>
    LINE2_MAIN_LOOP[(fromIndex + step * offset + count) % count]!.name);
  return {
    from: stations[0]!, to: stations[stations.length - 1]!, stations, stopCount,
    directionCode: step === 1 ? '1' : '0',
    directionLabel: step === 1 ? '외선' : '내선',
    nextStation: stations[1]!,
  };
}

/** Fewest stops on the main loop; equal options prefer 외선 deterministically. */
export function planLine2Journey(from: string, to: string): Line2Journey | null {
  const origin = normalizeLine2Station(from);
  const destination = normalizeLine2Station(to);
  if (!origin || !destination || origin === destination) return null;
  const fromIndex = LINE2_MAIN_LOOP.findIndex((station) => station.name === origin);
  const toIndex = LINE2_MAIN_LOOP.findIndex((station) => station.name === destination);
  const outer = option(fromIndex, toIndex, 1);
  const inner = option(fromIndex, toIndex, -1);
  return outer.stopCount <= inner.stopCount
    ? { recommended: outer, alternative: inner }
    : { recommended: inner, alternative: outer };
}
