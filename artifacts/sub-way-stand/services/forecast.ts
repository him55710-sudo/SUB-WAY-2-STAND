/**
 * Forecast service — STUB. Owner: physics task.
 *
 * - simulation selection: runs lib/physics syntheticFrame on the invented
 *   SYN-A track, labeled source "simulation".
 * - live selection: always suppressed ("not-implemented") until the physics
 *   task wires real route + train data. Never presented as live.
 */
import { useEffect, useState } from 'react';
import { APP_CONFIG, FLAGS } from '@/config/flags';
import type { CurveFeature, Forecast, RideSelection, SuppressReason, UseForecast } from '@/contracts';
import { REASON_LABEL, SYN_A, SYN_PARAMS, syntheticFrame } from '@/lib/physics';
import type { Curve, Side } from '@/lib/physics';

function toCurveFeature(c: Curve): CurveFeature {
  return {
    id: `${SYN_A.id}-${c.id}`,
    startOffsetM: c.start,
    lengthM: c.end - c.start,
    radiusM: c.radius,
    turn: c.turn,
    source: 'synthetic',
    confidence: 'low',
  };
}

const toSway = (s: Side): Forecast['sway'] => s;

function suppressed(
  selection: RideSelection | null,
  reason: SuppressReason,
  explanationKo: string[],
): Forecast {
  return {
    state: 'suppressed',
    source: selection?.kind === 'simulation' ? 'simulation' : 'live-estimate',
    segment: null,
    positionM: null,
    targetCurve: null,
    sway: 'none',
    etaWindowS: null,
    lateralAccelMs2: null,
    confidence: 'unavailable',
    suppressReason: reason,
    explanationKo,
    computedAt: new Date().toISOString(),
  };
}

function simulate(selection: RideSelection, elapsedS: number): Forecast {
  const frame = syntheticFrame(elapsedS);
  const fc = frame.forecast;
  const curve = frame.upcoming && !frame.upcoming.inside ? frame.upcoming.curve : null;
  const u = SYN_PARAMS.positionUncertaintyM;
  if (fc.suppressed || !fc.window || !fc.accel || !curve) {
    const why = fc.reasons.map((r) => REASON_LABEL[r]);
    return {
      ...suppressed(selection, curve ? 'low-confidence' : 'no-curve-ahead', [
        '[시뮬레이션] 가상 선로 — 실제 열차와 무관합니다.',
        ...(why.length ? why : ['곡선 구간을 통과 중입니다.']),
      ]),
      positionM: { min: Math.max(0, frame.s - u), max: frame.s + u },
    };
  }
  return {
    state: 'active',
    source: 'simulation',
    segment: null,
    positionM: { min: Math.max(0, frame.s - u), max: frame.s + u },
    targetCurve: toCurveFeature(curve),
    sway: toSway(fc.sway),
    etaWindowS: { min: fc.window[0], max: fc.window[1] },
    lateralAccelMs2: { min: fc.accel[0], max: fc.accel[1] },
    confidence: fc.confidence ?? 'unavailable',
    suppressReason: null,
    explanationKo: [
      '[시뮬레이션] 가상 선로 SYN-A — 실제 열차와 무관합니다.',
      `반경 ${Math.round(curve.radius)}m ${curve.turn === 'left' ? '좌' : '우'}곡선, 속도 ${SYN_PARAMS.speedMin}–${SYN_PARAMS.speedMax} m/s 가정.`,
      `${curve.turn === 'left' ? '좌' : '우'}회전 시 승객은 ${fc.sway === 'right' ? '오른쪽' : '왼쪽'}으로 쏠립니다.`,
    ],
    computedAt: new Date().toISOString(),
  };
}

export const useForecast: UseForecast = (selection) => {
  const [elapsedS, setElapsedS] = useState(0);

  useEffect(() => {
    setElapsedS(0);
    if (!selection) return;
    const id = setInterval(() => setElapsedS((s) => s + 1), APP_CONFIG.forecastTickMs);
    return () => clearInterval(id);
  }, [selection]);

  if (!selection) return suppressed(null, 'no-selection', ['선택된 열차가 없습니다.']);
  if (!FLAGS.physicsForecast) {
    return suppressed(selection, 'flag-disabled', ['흔들림 예측 기능이 꺼져 있습니다.']);
  }
  if (selection.kind === 'live') {
    return suppressed(selection, 'not-implemented', [
      '[스텁] 실시간 예측은 아직 연결되지 않았습니다.',
      '예측을 표시하지 않습니다.',
    ]);
  }
  return simulate(selection, elapsedS);
};
