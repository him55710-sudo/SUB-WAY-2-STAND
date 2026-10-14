/**
 * Voice guidance service — STUB. Owner: voice/docs task.
 *
 * Derives the GuidanceEvent that WOULD be spoken, but does not call TTS or
 * haptics yet. The real implementation uses expo-speech (ko-KR) + expo-haptics
 * and must honour FLAGS.voiceGuidance / FLAGS.haptics.
 */
import { useMemo, useState } from 'react';
import { FLAGS } from '@/config/flags';
import type { GuidanceEvent, UseGuidance } from '@/contracts';

export const useGuidance: UseGuidance = (forecast) => {
  const [enabled, setEnabled] = useState(FLAGS.voiceGuidance);
  const available = FLAGS.voiceGuidance;

  const lastEvent = useMemo<GuidanceEvent | null>(() => {
    if (!available || !enabled || !forecast) return null;
    if (forecast.state === 'suppressed') {
      return { kind: 'suppressed', textKo: '예측이 중지되었습니다.', curveId: null, at: forecast.computedAt };
    }
    const curveId = forecast.targetCurve?.id ?? null;
    const side = forecast.sway === 'right' ? '오른쪽' : forecast.sway === 'left' ? '왼쪽' : null;
    if (!side) return null;
    const eta = forecast.etaWindowS;
    if (eta && eta.min <= 2) {
      return { kind: 'now', textKo: `지금 ${side}으로 쏠립니다.`, curveId, at: forecast.computedAt };
    }
    return {
      kind: 'pre-warning',
      textKo: `곧 ${side}으로 쏠림이 예상됩니다.`,
      curveId,
      at: forecast.computedAt,
    };
  }, [available, enabled, forecast]);

  return { enabled: available && enabled, setEnabled, available, lastEvent };
};
