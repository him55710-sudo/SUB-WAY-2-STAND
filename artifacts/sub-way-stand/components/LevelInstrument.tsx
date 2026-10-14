import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

/** Lateral acceleration (m/s²) that maps to full deflection. */
const FULL_SCALE = 1.0;
const DOT = 30;

type Props = {
  /** Current passenger push, + = right (m/s²). */
  accel: number;
  /** Predicted push at the upcoming curve, or null to hide the ghost. */
  ghost: number | null;
  tone: 'warn' | 'neutral' | 'off';
  reducedMotion: boolean;
};

const clamp = (x: number) => Math.max(-1, Math.min(1, x));

/**
 * A spirit-level style instrument: the solid weighted dot is where the body is pushed,
 * the dashed ring is where it is predicted to be pushed at the next curve.
 */
export function LevelInstrument({ accel, ghost, tone, reducedMotion }: Props) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const half = Math.max(0, width / 2 - DOT / 2 - 6);

  const x = useSharedValue(0);
  const gx = useSharedValue(0);
  const gOpacity = useSharedValue(0);
  const tilt = useSharedValue(0);

  const target = clamp(accel / FULL_SCALE) * half;
  const ghostTarget = ghost === null ? 0 : clamp(ghost / FULL_SCALE) * half;
  const tiltTarget = reducedMotion ? 0 : clamp(accel / FULL_SCALE) * 3;

  useEffect(() => {
    if (reducedMotion) {
      x.set(target);
      gx.set(ghostTarget);
      tilt.set(0);
      gOpacity.set(ghost === null ? 0 : 1);
      return;
    }
    x.set(withSpring(target, { damping: 13, stiffness: 110, mass: 1.3 }));
    gx.set(withTiming(ghostTarget, { duration: 400 }));
    tilt.set(withSpring(tiltTarget, { damping: 18, stiffness: 90 }));
    gOpacity.set(withTiming(ghost === null ? 0 : 1, { duration: 250 }));
  }, [target, ghostTarget, tiltTarget, ghost, reducedMotion, x, gx, tilt, gOpacity]);

  const dotStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const ghostStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: gx.get() }],
    opacity: gOpacity.get(),
  }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${tilt.get()}deg` }] }));

  const dotColor = tone === 'warn' ? c.warn : tone === 'neutral' ? c.primary : c.faint;
  const sideColor = (side: 'left' | 'right') =>
    tone !== 'off' && ((side === 'right' && accel > 0.05) || (side === 'left' && accel < -0.05))
      ? dotColor
      : c.faint;

  return (
    <View
      accessible
      accessibilityLabel={
        tone === 'off'
          ? '쏠림 표시 비활성'
          : `현재 ${accel > 0.05 ? '오른쪽' : accel < -0.05 ? '왼쪽' : '쏠림 없음'}, 크기 ${Math.abs(accel).toFixed(2)} 미터 매 초 제곱`
      }
    >
      <View style={styles.sides}>
        <View style={styles.side}>
          <Feather name="chevron-left" size={16} color={sideColor('left')} />
          <Text style={[styles.sideText, { color: sideColor('left') }]}>왼쪽</Text>
        </View>
        <View style={styles.side}>
          <Text style={[styles.sideText, { color: sideColor('right') }]}>오른쪽</Text>
          <Feather name="chevron-right" size={16} color={sideColor('right')} />
        </View>
      </View>

      <Animated.View style={[styles.barWrap, barStyle]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.track, { backgroundColor: c.raised, borderColor: c.border }]} />
        {[-1, -0.5, 0, 0.5, 1].map((p) => (
          <View
            key={p}
            style={[
              styles.tick,
              {
                left: width / 2 + p * half - 1,
                height: p === 0 ? 26 : 12,
                backgroundColor: p === 0 ? c.mutedForeground : c.border,
              },
            ]}
          />
        ))}
        <Animated.View
          style={[styles.dotBase, { left: width / 2 - DOT / 2, borderColor: c.warn }, styles.ghost, ghostStyle]}
        />
        <Animated.View style={[styles.dotBase, { left: width / 2 - DOT / 2 }, dotStyle]}>
          <View style={[styles.dotInner, { backgroundColor: dotColor, shadowColor: dotColor }]} />
        </Animated.View>
      </Animated.View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.legendText, { color: c.mutedForeground }]}>몸이 쏠리는 방향</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendGhost, { borderColor: c.warn }]} />
          <Text style={[styles.legendText, { color: c.mutedForeground }]}>다음 곡선 예측</Text>
        </View>
        <Text style={[styles.legendText, { color: c.faint, marginLeft: 'auto' }]}>끝 = 1.0 m/s²</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sides: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sideText: { fontSize: 13, fontWeight: '700' },
  barWrap: { height: 40, justifyContent: 'center' },
  track: { height: 12, borderRadius: 6, borderWidth: 1 },
  tick: { position: 'absolute', width: 2, borderRadius: 1, top: '50%', transform: [{ translateY: -6 }] },
  dotBase: { position: 'absolute', width: DOT, height: DOT, top: 5, alignItems: 'center', justifyContent: 'center' },
  dotInner: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  ghost: { borderRadius: DOT / 2, borderWidth: 2, borderStyle: 'dashed' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed' },
  legendText: { fontSize: 12 },
});
