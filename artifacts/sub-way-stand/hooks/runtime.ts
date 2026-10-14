import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createAnnouncer, type Announcer } from '@/lib/announcer';

/** true while the app is in the foreground. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** Wall clock that re-renders every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Korean TTS through expo-speech.
 * koreanVoice: true/false when the platform lists voices, null when unknown
 * (some browsers load the voice list lazily).
 */
export function useSpeech(voiceEnabled: boolean): {
  announcer: Announcer;
  speaking: boolean;
  koreanVoice: boolean | null;
} {
  const [speaking, setSpeaking] = useState(false);
  const [koreanVoice, setKoreanVoice] = useState<boolean | null>(null);
  const [announcer] = useState(() =>
    createAnnouncer(
      {
        speak: (text) =>
          Speech.speak(text, {
            language: 'ko-KR',
            rate: 0.95,
            onStart: () => setSpeaking(true),
            onDone: () => setSpeaking(false),
            onStopped: () => setSpeaking(false),
            onError: () => setSpeaking(false),
          }),
        stop: () => {
          void Speech.stop();
          setSpeaking(false);
        },
      },
      { voiceEnabled },
    ),
  );

  useEffect(() => {
    announcer.setVoiceEnabled(voiceEnabled);
  }, [announcer, voiceEnabled]);

  useEffect(() => {
    let alive = true;
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        if (!alive) return;
        setKoreanVoice(
          voices.length === 0 ? null : voices.some((v) => v.language?.toLowerCase().startsWith('ko')),
        );
      })
      .catch(() => alive && setKoreanVoice(null));
    return () => {
      alive = false;
      announcer.stop();
    };
  }, [announcer]);

  return { announcer, speaking, koreanVoice };
}
