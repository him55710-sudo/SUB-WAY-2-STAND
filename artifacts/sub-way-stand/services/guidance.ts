/**
 * Voice + haptic guidance service. Owner: voice/docs task.
 *
 * Speaks Korean warnings with expo-speech (ko-KR) and fires a matching
 * expo-haptics pattern. All timing / dedupe / suppression / wording rules
 * live in lib/guidanceRules.ts (pure, unit-tested); this hook only performs
 * the side effects.
 *
 * - FLAGS.voiceGuidance off or no Korean TTS on this device → available=false,
 *   never speaks (the screen can show a silent notice).
 * - User toggle (`enabled`) mutes speech immediately. Haptics are a separate
 *   cue governed by FLAGS.haptics, so a muted rider still feels the warning.
 * - When the forecast flips to suppressed while a warning is pending, speech
 *   in progress is stopped and a silent `suppressed` event is recorded.
 * - Foreground only: leaving the foreground stops speech and pending haptics,
 *   and no cue is decided until the app is active again.
 */
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { FLAGS } from '@/config/flags';
import type { Forecast, GuidanceEvent, UseGuidance } from '@/contracts';
import {
  type Availability,
  type HapticStep,
  type VoiceInfo,
  decideGuidance,
  initialGuidanceMemory,
  planOutput,
  resolveAvailability,
  SPEECH_LANGUAGE,
  SPEECH_RATE,
} from '@/lib/guidanceRules';

const VOICE_LIST_TIMEOUT_MS = 2500;

function hasSpeechApi(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function hapticsSupported(): boolean {
  if (!FLAGS.haptics) return false;
  if (Platform.OS === 'ios' || Platform.OS === 'android') return true;
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Voice list, or null on error/timeout (web `getVoices` can hang forever). */
async function readVoices(): Promise<VoiceInfo[] | null> {
  if (Platform.OS === 'web' && !hasSpeechApi()) return null;
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), VOICE_LIST_TIMEOUT_MS));
    return await Promise.race([Speech.getAvailableVoicesAsync(), timeout]);
  } catch {
    return null;
  }
}

function stopSpeech() {
  Speech.stop().catch(() => {});
}

function fireHapticStep(step: HapticStep) {
  try {
    const p =
      step.type === 'notification-warning'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    p.catch(() => {});
  } catch {
    // haptics unavailable on this device — guidance stays voice/visual only
  }
}

/** Cheap identity of the parts of a forecast the rules read. */
function forecastKey(f: Forecast | null): string {
  if (!f) return 'null';
  return [f.state, f.source, f.suppressReason, f.sway, f.targetCurve?.id, f.etaWindowS?.min, f.etaWindowS?.max].join('|');
}

export const useGuidance: UseGuidance = (forecast) => {
  const [enabled, setEnabledState] = useState(true);
  const [tts, setTts] = useState<Availability>(() => ({
    // Optimistic on native until the voice list says otherwise; web must prove a Korean voice.
    available: FLAGS.voiceGuidance && (Platform.OS === 'ios' || Platform.OS === 'android'),
    voiceId: null,
  }));
  const [lastEvent, setLastEvent] = useState<GuidanceEvent | null>(null);

  const memoryRef = useRef(initialGuidanceMemory());
  const hapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // State (not a ref) so returning to the foreground re-runs the decision on the latest forecast.
  const [appActive, setAppActive] = useState(true);
  const available = FLAGS.voiceGuidance && tts.available;
  const voiceOn = available && enabled;

  // Detect Korean TTS once.
  useEffect(() => {
    if (!FLAGS.voiceGuidance) return;
    let alive = true;
    readVoices().then((voices) => {
      if (!alive) return;
      setTts(resolveAvailability({ flagOn: FLAGS.voiceGuidance, platform: Platform.OS, speechApi: hasSpeechApi(), voices }));
    });
    return () => {
      alive = false;
    };
  }, []);

  const silenceAll = useCallback(() => {
    hapticTimers.current.forEach(clearTimeout);
    hapticTimers.current = [];
    stopSpeech();
  }, []);

  // Foreground only: silence on background/inactive, block cues until active.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      // 'unknown' (early iOS launch) counts as foreground so cues are not blocked forever.
      const active = state !== 'background' && state !== 'inactive';
      setAppActive(active);
      if (!active) silenceAll();
    };
    onChange(AppState.currentState ?? 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [silenceAll]);

  // Silence everything on unmount.
  useEffect(() => silenceAll, [silenceAll]);

  const key = forecastKey(forecast);
  useEffect(() => {
    const nowMs = Date.now();
    const { memory, action } = decideGuidance(memoryRef.current, forecast, nowMs, { appActive });
    memoryRef.current = memory;
    if (action.type === 'none') return;

    const plan = planOutput(action, { voiceOn, hapticsOn: hapticsSupported() });
    if (plan.stopSpeech) silenceAll();
    if (plan.speak) {
      try {
        Speech.speak(plan.speak, {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
          pitch: 1.0,
          ...(tts.voiceId ? { voice: tts.voiceId } : {}),
          // iOS: system-managed session ducks music and plays with earphones.
          useApplicationAudioSession: false,
        });
      } catch {
        // TTS failed at runtime — keep the visual event, never crash.
      }
    }
    if (plan.haptic) {
      for (const step of plan.haptic) {
        if (step.atMs <= 0) fireHapticStep(step);
        else hapticTimers.current.push(setTimeout(() => fireHapticStep(step), step.atMs));
      }
    }
    setLastEvent({
      kind: action.kind,
      textKo: action.textKo,
      curveId: action.curveId,
      at: new Date(nowMs).toISOString(),
    });
    // `key` captures every forecast field the rules read; `forecast` itself is a new
    // object each render. `appActive` re-runs it on foreground return even if the
    // forecast is unchanged. voiceOn/voiceId are read from the triggering render.
  }, [key, appActive]);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    if (!next) stopSpeech();
  }, []);

  return { enabled: voiceOn, setEnabled, available, lastEvent };
};
