import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Train } from '@workspace/api-client-react';
import React, { createContext, useContext, useEffect, useState } from 'react';

type Prefs = { voice: boolean; haptics: boolean };

type RideState = {
  /** The live train the rider confirmed. Never used by the synthetic demo. */
  train: Train | null;
  selectTrain: (train: Train | null) => void;
  recentStations: string[];
  addRecentStation: (name: string) => void;
  prefs: Prefs;
  setPref: (key: keyof Prefs, value: boolean) => void;
};

const STORAGE_KEY = 'sws:prefs:v1';
const RideContext = createContext<RideState | null>(null);

export function RideProvider({ children }: { children: React.ReactNode }) {
  const [train, setTrain] = useState<Train | null>(null);
  const [recentStations, setRecent] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Prefs>({ voice: true, haptics: true });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { recent?: unknown; prefs?: Partial<Prefs> };
        if (Array.isArray(saved.recent)) {
          setRecent(saved.recent.filter((s): s is string => typeof s === 'string').slice(0, 6));
        }
        if (saved.prefs) setPrefs((p) => ({ ...p, ...saved.prefs }));
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ recent: recentStations, prefs })).catch(
      () => undefined,
    );
  }, [loaded, recentStations, prefs]);

  const value: RideState = {
    train,
    selectTrain: setTrain,
    recentStations,
    addRecentStation: (name) => {
      const clean = name.trim();
      if (!clean) return;
      setRecent((list) => [clean, ...list.filter((s) => s !== clean)].slice(0, 6));
    },
    prefs,
    setPref: (key, v) => setPrefs((p) => ({ ...p, [key]: v })),
  };

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide(): RideState {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be used inside RideProvider');
  return ctx;
}
