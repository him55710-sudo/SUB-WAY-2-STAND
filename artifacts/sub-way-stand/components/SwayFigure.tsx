import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { NumericRange, SwayDirection } from '@/contracts';
import { useColors } from '@/hooks/useColors';
import type { RidePhase } from './uiModel';

/** Fixed ±1.0 m/s² prediction instrument; no looping or exaggerated sway. */
export function SwayFigure({ lean, sway, phase, reducedMotion, acceleration }: { lean: { mid: number; min: number; max: number }; sway: SwayDirection; phase: RidePhase; reducedMotion: boolean; acceleration?: NumericRange | null }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const active = phase !== 'suppressed' && sway !== 'none';
  const magnitude = acceleration ? (acceleration.min + acceleration.max) / 2 : Math.tan(Math.abs(lean.mid) * Math.PI / 180) * 9.81;
  const sign = sway === 'left' ? -1 : sway === 'right' ? 1 : 0;
  const travel = Math.max(0, (width - 40) / 2);
  const target = active ? Math.max(-1, Math.min(1, magnitude * sign)) * travel : 0;
  const offset = useSharedValue(0);
  useEffect(() => { offset.set(reducedMotion ? target : withSpring(target, { damping: 26, stiffness: 180, mass: 1 })); }, [target, reducedMotion, offset]);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const signal = active ? c.signal : c.foreground;
  return (
    <View style={styles.wrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.labels}><Text style={[styles.side, { color: c.mutedForeground }]}>왼쪽</Text><Text style={[styles.scale, { color: c.faint }]}>LATERAL FORCE / m/s²</Text><Text style={[styles.side, { color: c.mutedForeground }]}>오른쪽</Text></View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.canvas}>
        <View style={[styles.rail, { borderColor: c.borderStrong, borderStyle: active ? 'solid' : 'dashed' }]} />
        {[-1, -0.5, 0, 0.5, 1].map((tick, i) => <View key={tick} style={[styles.tickColumn, { left: `${i * 25}%` }]}><View style={[styles.tick, { backgroundColor: tick === 0 ? c.mutedForeground : c.borderStrong, height: tick === 0 ? 20 : 10 }]} /><Text style={[styles.tickLabel, { color: c.faint }]}>{tick === 0 ? '0' : Math.abs(tick).toFixed(1)}</Text></View>)}
        <Animated.View style={[styles.dotPosition, dotStyle]}>
          {active ? <View style={[styles.ghost, { borderColor: c.signal }]} /> : null}
          <View style={[styles.dot, { backgroundColor: active ? signal : c.background, borderColor: active ? signal : c.mutedForeground }]} />
        </Animated.View>
      </View>
      <Text style={[styles.legend, { color: c.faint }]}>{active ? '● 예상 쏠림 방향 · 고정 눈금 ±1.0 m/s²' : '○ 예측 대기 · 방향을 확신할 때만 안내해요'}</Text>
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { width: '100%', gap: 6, paddingTop: 12, paddingBottom: 10 }, labels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, side: { fontSize: 11, fontWeight: '600' }, scale: { fontSize: 8, letterSpacing: 1.2, fontFamily: 'Inter_500Medium' }, canvas: { height: 94, marginHorizontal: 16 }, rail: { position: 'absolute', top: 40, left: 0, right: 0, borderTopWidth: 2 }, tickColumn: { position: 'absolute', top: 31, width: 24, marginLeft: -12, alignItems: 'center', gap: 15 }, tick: { width: 1, marginTop: 4 }, tickLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', fontVariant: ['tabular-nums'] }, dotPosition: { position: 'absolute', left: '50%', top: 26, width: 30, height: 30, marginLeft: -15, alignItems: 'center', justifyContent: 'center' }, dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 }, ghost: { position: 'absolute', width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderStyle: 'dashed', opacity: 0.3 }, legend: { fontSize: 10, textAlign: 'center', lineHeight: 16 } });
