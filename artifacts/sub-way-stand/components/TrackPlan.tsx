import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { SYN_A, findCurves, trackLength, trackPolyline } from '@/lib/physics';

/** Lateral (cross-track) distances are drawn 3× larger so gentle curves are visible. */
const EXAGGERATION = 3;
const HEIGHT = 112;
const PAD = 14;

const POINTS = trackPolyline(SYN_A, 5);
const CURVES = findCurves(SYN_A);
const LENGTH = trackLength(SYN_A);
const MAX_X = Math.max(...POINTS.map((p) => p.x));
const MIN_Y = Math.min(...POINTS.map((p) => p.y));
const MAX_Y = Math.max(...POINTS.map((p) => p.y));

function project(width: number) {
  const sx = (width - PAD * 2) / MAX_X;
  const sy = sx * EXAGGERATION;
  const midY = (MIN_Y + MAX_Y) / 2;
  // +y (left of travel) is drawn upward
  return (p: { x: number; y: number }) => ({ X: PAD + p.x * sx, Y: HEIGHT / 2 - (p.y - midY) * sy });
}

function pathFor(width: number, from: number, to: number) {
  const proj = project(width);
  const pts = POINTS.filter((p) => p.s >= from - 0.01 && p.s <= to + 0.01).map(proj);
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.X.toFixed(1)},${p.Y.toFixed(1)}`).join(' ');
}

function pointAt(width: number, s: number) {
  const i = Math.min(POINTS.length - 1, Math.max(0, Math.round((s / LENGTH) * (POINTS.length - 1))));
  return project(width)(POINTS[i]!);
}

export function TrackPlan({ s, activeCurveId }: { s: number; activeCurveId: string | null }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const train = width > 0 ? pointAt(width, s) : null;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT} accessibilityLabel="가상 선로 평면도">
          <Path d={pathFor(width, 0, LENGTH)} stroke={c.border} strokeWidth={6} fill="none" strokeLinecap="round" />
          {CURVES.map((cv) => (
            <Path
              key={cv.id}
              d={pathFor(width, cv.start, cv.end)}
              stroke={c.warn}
              strokeOpacity={cv.id === activeCurveId ? 1 : 0.35}
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
            />
          ))}
          {train ? (
            <>
              <Circle cx={train.X} cy={train.Y} r={11} fill={c.primary} fillOpacity={0.15} />
              <Circle cx={train.X} cy={train.Y} r={6} fill={c.primary} />
            </>
          ) : null}
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      <View style={styles.curveLabels}>
        {CURVES.map((cv) => (
          <Text
            key={cv.id}
            style={[
              styles.curveLabel,
              { color: cv.id === activeCurveId ? c.warn : c.mutedForeground, left: `${(((cv.start + cv.end) / 2) / LENGTH) * 100 - 9}%` },
            ]}
          >
            {cv.turn === 'left' ? '좌' : '우'} R{Math.round(cv.radius)}
          </Text>
        ))}
      </View>
      <Text style={[styles.caption, { color: c.faint }]}>
        {SYN_A.name} · {Math.round(LENGTH)} m · 진행 방향 → · 가로 방향(곡선 휨) {EXAGGERATION}배 과장
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  curveLabels: { height: 18, position: 'relative' },
  curveLabel: { position: 'absolute', fontSize: 12, fontFamily: 'Inter_600SemiBold', width: '18%', textAlign: 'center' },
  caption: { fontSize: 11, marginTop: 6 },
});
