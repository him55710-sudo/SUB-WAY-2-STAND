/** Ride session: holds the current RideSelection. Owner: integrator. */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { RideSelection, RideSessionValue } from '@/contracts';

const RideSessionContext = createContext<RideSessionValue | null>(null);

export function RideSessionProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<RideSelection | null>(null);
  const select = useCallback((next: RideSelection) => setSelection(next), []);
  const clear = useCallback(() => setSelection(null), []);
  const value = useMemo(() => ({ selection, select, clear }), [selection, select, clear]);
  return <RideSessionContext.Provider value={value}>{children}</RideSessionContext.Provider>;
}

export function useRideSession(): RideSessionValue {
  const ctx = useContext(RideSessionContext);
  if (!ctx) throw new Error('useRideSession must be used inside <RideSessionProvider>');
  return ctx;
}
