/** Foreground location, requested only by an explicit user action. No coordinate uploads/storage. */
import * as ExpoLocation from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { createLocationClient, type LocationWatch } from '../lib/locationClient';
export type { LocationState, LocationStatus } from '../lib/locationClient';
export type { NearbyStation, RiderPosition } from '../lib/location';

const browserWatch: LocationWatch = async (onPosition, onError) => {
  if (typeof window === 'undefined' || !window.isSecureContext) throw {
    status: 'unavailable', messageKo: '위치는 HTTPS 또는 localhost에서 사용할 수 있어요. 역을 직접 선택해 주세요.',
  };
  if (!navigator.geolocation) throw { status: 'unavailable' };
  const id = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) => onPosition({ latitude: coords.latitude, longitude: coords.longitude,
      accuracyM: coords.accuracy, timestampMs: timestamp }),
    (error) => onError({ status: error.code === 1 ? 'denied' : 'unavailable' }),
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 18_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
};

const nativeWatch: LocationWatch = async (onPosition, onError) => {
  const permission = await ExpoLocation.requestForegroundPermissionsAsync();
  if (!permission.granted) throw { status: 'denied' };
  if (!(await ExpoLocation.hasServicesEnabledAsync())) throw { status: 'unavailable' };
  const subscription = await ExpoLocation.watchPositionAsync(
    { accuracy: ExpoLocation.Accuracy.Balanced, distanceInterval: 25, timeInterval: 5_000 },
    ({ coords, timestamp }) => onPosition({ latitude: coords.latitude, longitude: coords.longitude,
      accuracyM: coords.accuracy ?? Infinity, timestampMs: timestamp }),
    () => onError({ status: 'unavailable' }),
  );
  return () => subscription.remove();
};

export function useLocation() {
  const client = useMemo(() => createLocationClient(Platform.OS === 'web' ? browserWatch : nativeWatch), []);
  const [state, setState] = useState(client.getState);
  useEffect(() => {
    const unsubscribe = client.subscribe(setState);
    const appState = AppState.addEventListener('change', (value) => { if (value !== 'active') client.stop(); });
    const onVisibility = () => { if (document.hidden) client.stop(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      client.dispose();
      appState.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [client]);
  return { ...state, requestLocation: client.requestLocation, stop: client.stop };
}
