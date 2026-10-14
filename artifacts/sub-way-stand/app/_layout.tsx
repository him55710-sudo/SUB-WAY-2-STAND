import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { setBaseUrl } from '@workspace/api-client-react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { color } from '@/design/tokens';
import { RideSessionProvider } from '@/session/RideSession';

// Expo bundles run outside the web proxy: point the API client at the dev
// domain so `/api/subway/trains` resolves to the API server.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (apiUrl) {
  setBaseUrl(apiUrl);
} else if (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_DOMAIN) {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  setBaseUrl(/^https?:\/\//.test(domain) ? domain : `https://${domain}`);
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: '뒤로',
        // Motion OS — Dark Edition: the native header blends into the ink background.
        headerStyle: { backgroundColor: color.ink },
        headerTintColor: color.text,
        headerTitleStyle: { fontWeight: '700', color: color.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: '열차 선택' }} />
      <Stack.Screen name="ride" options={{ title: '탑승 안내' }} />
      <Stack.Screen name="evidence" options={{ title: '검증과 연구 근거' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.ink }}>
            <KeyboardProvider>
              <RideSessionProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
              </RideSessionProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
