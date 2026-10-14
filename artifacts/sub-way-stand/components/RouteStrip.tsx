import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import type { Forecast, RideSelection, TrainCandidate } from '@/contracts';
import { useColors } from '@/hooks/useColors';
import { getSimulationRide } from '@/services/simulation';
import { findSegment, getRoute } from '@/services/trains';
import {
  TURN_KO,
  buildRouteStrip,
  placementFromState,
  type RouteStripModel,
  type StationRole,
  type StripInput,
} from './uiModel';
import { Badge, type Tone } from './ui';

const H = 94;
const RAIL_Y = 38;
const PAD = 22;
const ROLE_KO: Record<StationRole, string> = { prev: '이전', current: '현재', next: '다음' };

export interface RouteStripData {
  model: RouteStripModel | null;
  origin: { label: string; tone: Tone };
  note: string;
  synthetic: boolean;
  /** Position comes from station-level state, not a positioned forecast. */
  estimatedFromState: boolean;
}

/** Decide which segments and train placement to draw from the contract data. */
export function routeStripData(
  selection: RideSelection,
  forecast: Forecast,
  train: TrainCandidate | null,
): RouteStripData {
  const targetCurveId = forecast.targetCurve?.id ?? null;

  // Simulation: draw exactly the segment the simulated ride runs on (one segment, looped).
  if (selection.kind === 'simulation') {
    const ride = getSimulationRide(selection.scenarioId);
    const seg = ride?.segment ?? null;
    return {
      model: seg
        ? buildRouteStrip({
            into: seg,
            outOf: null,
            anchor: seg.to,
            train: forecast.positionM ? { on: 'into', offsetM: forecast.positionM } : null,
            targetCurveId,
            fullWidth: true,
          })
        : null,
      origin: { label: '가상 주행', tone: 'synthetic' },
      note: !ride
        ? '알 수 없는 시뮬레이션입니다.'
        : ride.usesRouteData
          ? `${ride.label} · ${Math.round(ride.segment.lengthM)} m · 역 좌표로 근사한 곡선 위를 가상으로 달립니다. 실제 열차와 무관합니다.`
          : `${ride.label} · ${Math.round(ride.segment.lengthM)} m · 실제 노선이 아닌 시연용 선로입니다.`,
      synthetic: true,
      estimatedFromState: false,
    };
  }

  const line = selection.line;
  const route = getRoute(line);
  // "검수" only when every curve is verified; station-derived curves are labeled as approximations.
  const verified = !!route && route.segments.every((s) => s.curves.every((cv) => cv.source === 'curated'));
  const routeOrigin = !route
    ? { label: '노선 자료 없음', tone: 'muted' as Tone }
    : route.origin !== 'curated'
      ? { label: '예시 노선 · 가상 곡선', tone: 'warn' as Tone }
      : verified
        ? { label: '검수 노선 자료', tone: 'live' as Tone }
        : { label: '역 좌표 근사 곡선', tone: 'warn' as Tone };

  let input: StripInput | null = null;
  let estimatedFromState = false;

  if (forecast.segment) {
    const seg = forecast.segment;
    const departed = !!train && train.station === seg.from;
    const into = departed ? findSegment(line, seg.from, seg.directionCode, 'into') : seg;
    const outOf = departed ? seg : findSegment(line, seg.to, seg.directionCode, 'outOf');
    const on = departed ? 'outOf' : 'into';
    estimatedFromState = !forecast.positionM;
    input = {
      into,
      outOf,
      anchor: departed ? seg.from : seg.to,
      train: forecast.positionM
        ? { on, offsetM: forecast.positionM }
        : placementFromState(train?.stateCode ?? null, into, outOf),
      targetCurveId,
    };
  } else if (train) {
    const into = findSegment(line, train.station, train.directionCode, 'into');
    const outOf = findSegment(line, train.station, train.directionCode, 'outOf');
    estimatedFromState = true;
    input = {
      into,
      outOf,
      anchor: train.station,
      train: placementFromState(train.stateCode, into, outOf),
      targetCurveId,
    };
  }

  return {
    model: input ? buildRouteStrip(input) : null,
    origin: routeOrigin,
    note: route?.sourceNote ?? '이 노선은 구간·곡선 자료가 없습니다.',
    synthetic: false,
    estimatedFromState,
  };
}

/**
 * Station strip: previous / current / next stations on a rail, curve markers coloured by turn
 * side (active curve highlighted) and an animated train marker with its position uncertainty.
 */
export function RouteStrip({ data, reducedMotion }: { data: RouteStripData; reducedMotion: boolean }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const { model } = data;
  const span = Math.max(0, width - PAD * 2);
  const px = (x: number) => PAD + x * span;

  const tx = useSharedValue(0);
  const bandL = useSharedValue(0);
  const bandW = useSharedValue(0);
  const prevX = useRef<number | null>(null);

  const trainX = model?.train ? px(model.train.x) : null;
  const band = model?.train?.band ?? null;
  const bL = band ? px(band[0]) : 0;
  const bW = band ? Math.max(4, px(band[1]) - px(band[0])) : 0;

  useEffect(() => {
    if (trainX === null || width === 0) return;
    // A loop restart (big backwards jump) snaps instead of sliding back across the strip.
    const prev = prevX.current;
    const jumpedBack = prev !== null && prev - trainX > span * 0.4;
    prevX.current = trainX;
    if (reducedMotion || jumpedBack || prev === null) {
      tx.set(trainX);
      bandL.set(bL);
      bandW.set(bW);
      return;
    }
    const cfg = { duration: 950, easing: Easing.linear };
    tx.set(withTiming(trainX, cfg));
    bandL.set(withTiming(bL, cfg));
    bandW.set(withTiming(bW, cfg));
  }, [trainX, bL, bW, width, span, reducedMotion, tx, bandL, bandW]);

  const trainStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() - 15 }] }));
  const bandStyle = useAnimatedStyle(() => ({ transform: [{ translateX: bandL.get() }], width: bandW.get() }));

  const turnColor = (turn: 'left' | 'right') => (turn === 'left' ? c.turnLeft : c.turnRight);
  const stationNames = model?.stations.map((s) => `${ROLE_KO[s.role]} ${s.name}`).join(', ') ?? '';
  const curveNames = model?.curves.map((cv) => `${TURN_KO[cv.turn]} 반경 ${Math.round(cv.radiusM)}미터`).join(', ') ?? '';

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: c.foreground }]}>노선 위치</Text>
        <Badge label={data.origin.label} tone={data.origin.tone} />
        <View style={styles.legend}>
          <View style={[styles.legendSwatch, { backgroundColor: c.turnLeft }]} />
          <Text style={[styles.legendText, { color: c.mutedForeground }]}>좌곡선</Text>
          <View style={[styles.legendSwatch, { backgroundColor: c.turnRight }]} />
          <Text style={[styles.legendText, { color: c.mutedForeground }]}>우곡선</Text>
        </View>
      </View>

      {model ? (
        <View
          accessible
          accessibilityLabel={`노선 위치. ${stationNames}. 곡선: ${curveNames || '없음'}. 진행 방향은 오른쪽.`}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ height: H }}
        >
          {width > 0 ? (
            <>
              <Svg width={width} height={H} style={StyleSheet.absoluteFill}>
                <Line x1={PAD} y1={RAIL_Y} x2={width - PAD} y2={RAIL_Y} stroke={c.borderStrong} strokeWidth={6} strokeLinecap="round" />
                {model.gaps.map(([a, b]) => (
                  <Line key={`gap-${a}`} x1={px(a)} y1={RAIL_Y} x2={px(b)} y2={RAIL_Y} stroke={c.background} strokeWidth={8} />
                ))}
                {model.gaps.map(([a, b]) => (
                  <Line key={`gapd-${a}`} x1={px(a)} y1={RAIL_Y} x2={px(b)} y2={RAIL_Y} stroke={c.faint} strokeWidth={2} strokeDasharray="4 5" />
                ))}
                {model.curves.map((cv) =>
                  cv.active ? (
                    <Line
                      key={`glow-${cv.id}`}
                      x1={px(cv.x0)}
                      y1={RAIL_Y}
                      x2={px(cv.x1)}
                      y2={RAIL_Y}
                      stroke={turnColor(cv.turn)}
                      strokeOpacity={0.3}
                      strokeWidth={18}
                      strokeLinecap="round"
                    />
                  ) : null,
                )}
                {model.curves.map((cv) => (
                  <Line
                    key={cv.id}
                    x1={px(cv.x0)}
                    y1={RAIL_Y}
                    x2={px(cv.x1)}
                    y2={RAIL_Y}
                    stroke={turnColor(cv.turn)}
                    strokeOpacity={cv.active ? 1 : 0.6}
                    strokeWidth={cv.active ? 8 : 6}
                    strokeLinecap="round"
                  />
                ))}
                {model.stations
                  .filter((s) => s.role === 'current')
                  .map((s) => (
                    <Circle key="st-ring" cx={px(s.x)} cy={RAIL_Y} r={15} fill="none" stroke={c.line2} strokeOpacity={0.7} strokeWidth={2} />
                  ))}
                {model.stations.map((s) => (
                  <Circle
                    key={`st-${s.role}`}
                    cx={px(s.x)}
                    cy={RAIL_Y}
                    r={s.role === 'current' ? 9 : 7}
                    fill={s.role === 'current' ? c.line2 : c.background}
                    stroke={s.role === 'current' ? c.foreground : c.mutedForeground}
                    strokeWidth={3}
                  />
                ))}
              </Svg>

              {band ? (
                <Animated.View style={[styles.band, { top: RAIL_Y - 13, backgroundColor: c.foreground + '14', borderColor: c.foreground + '40' }, bandStyle]} />
              ) : null}

              {model.curves.map((cv) => {
                const mid = px((cv.x0 + cv.x1) / 2);
                return (
                  <View key={`lbl-${cv.id}`} style={[styles.curveLabel, { left: mid - 34, top: 0 }]}>
                    <Feather name={cv.turn === 'left' ? 'corner-up-left' : 'corner-up-right'} size={11} color={turnColor(cv.turn)} />
                    <Text style={[styles.curveText, { color: turnColor(cv.turn), opacity: cv.active ? 1 : 0.75 }]}>
                      {cv.turn === 'left' ? '좌' : '우'} R{Math.round(cv.radiusM)}
                    </Text>
                  </View>
                );
              })}

              {model.train ? (
                <Animated.View style={[styles.train, { top: RAIL_Y - 9, backgroundColor: c.foreground, shadowColor: c.foreground }, trainStyle]}>
                  <Feather name="chevron-right" size={14} color={c.background} />
                </Animated.View>
              ) : null}

              {model.stations.map((s, i) => {
                const x = px(s.x);
                const first = i === 0;
                const last = i === model.stations.length - 1 && model.stations.length > 1;
                const align = first && s.x < 0.1 ? 'left' : last && s.x > 0.9 ? 'right' : 'center';
                const pos = align === 'left' ? { left: x - 10 } : align === 'right' ? { left: x - 110 + 10 } : { left: x - 55 };
                const current = s.role === 'current';
                return (
                  <View key={`name-${s.role}`} style={[styles.station, pos, { top: RAIL_Y + 14 }]}>
                    {!data.synthetic ? (
                      <Text style={[styles.role, { color: current ? c.line2 : c.faint, textAlign: align }]}>{ROLE_KO[s.role]}</Text>
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={[styles.stationName, { color: current ? c.foreground : c.mutedForeground, textAlign: align, fontWeight: current ? '800' : '600' }]}
                    >
                      {s.name}
                    </Text>
                  </View>
                );
              })}
            </>
          ) : null}
        </View>
      ) : (
        <View style={[styles.fallback, { borderColor: c.border }]}>
          <Feather name="map" size={18} color={c.faint} />
          <Text style={[styles.fallbackText, { color: c.mutedForeground }]}>
            이 구간의 노선·곡선 자료가 없어 위치를 그릴 수 없어요. 자료가 없는 구간에서는 쏠림 안내도 하지 않습니다.
          </Text>
        </View>
      )}

      <View style={styles.footRow}>
        <Feather name="info" size={12} color={c.faint} style={{ marginTop: 2 }} />
        <Text style={[styles.caption, { color: c.faint }]} numberOfLines={3}>
          진행 방향 →{data.estimatedFromState ? ' · 열차 위치는 역 단위 상태로 추정' : ''} · {data.note}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: '800' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' },
  legendSwatch: { width: 12, height: 4, borderRadius: 2, marginLeft: 4 },
  legendText: { fontSize: 11, fontWeight: '600' },
  band: { position: 'absolute', left: 0, height: 26, borderRadius: 8, borderWidth: 1 },
  curveLabel: { position: 'absolute', width: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  curveText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  train: {
    position: 'absolute',
    left: 0,
    width: 30,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  station: { position: 'absolute', width: 110, gap: 1 },
  role: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  stationName: { fontSize: 14 },
  fallback: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 14 },
  fallbackText: { flex: 1, fontSize: 13, lineHeight: 19 },
  footRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  caption: { flex: 1, fontSize: 11, lineHeight: 16 },
});
