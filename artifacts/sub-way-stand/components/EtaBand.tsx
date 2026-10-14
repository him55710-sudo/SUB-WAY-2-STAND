import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { NumericRange } from '@/contracts';
import { typography } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';

/** Seconds shown on the countdown track. */
export const ETA_HORIZON_S = 20;
const TICKS = [0, 5, 10, 15, 20];

/**
 * Countdown track: the amber band is the uncertainty window for curve entry and glides toward
 * the "곡선 진입" line at the left as seconds pass (linear 1 s glide between forecast ticks).
 */
export function EtaBand({ eta, reducedMotion }: { eta: NumericRange; reducedMotion: boolean }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const lo = Math.max(0, Math.min(eta.min, eta.max));
  const hi = Math.max(0, Math.max(eta.min, eta.max));
  const x0 = Math.min(1, lo / ETA_HORIZON_S) * width;
  const x1 = Math.min(1, hi / ETA_HORIZON_S) * width;

  const left = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    const bandW = Math.max(6, x1 - x0);
    // First placement after layout snaps; later forecast ticks glide.
    if (reducedMotion || width === 0 || !placed.current) {
      left.set(x0);
      w.set(bandW);
      placed.current = width > 0;
      return;
    }
    const cfg = { duration: 950, easing: Easing.linear };
    left.set(withTiming(x0, cfg));
    w.set(withTiming(bandW, cfg));
  }, [x0, x1, width, reducedMotion, left, w]);

  const bandStyle = useAnimatedStyle(() => ({ transform: [{ translateX: left.get() }], width: w.get() }));

  return (
    <View
      accessible
      accessibilityLabel={`곡선 진입까지 ${Math.floor(lo)}초에서 ${Math.ceil(hi)}초`}
      style={styles.wrap}
    >
      <View style={styles.trackWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.track, { backgroundColor: c.raised }]} />
        <Animated.View style={[styles.band, { backgroundColor: c.warn + '55', borderColor: c.warn }, bandStyle]} />
        <View style={[styles.entry, { backgroundColor: c.warn }]} />
      </View>
      <View style={styles.ticks}>
        {TICKS.map((t) => (
          <Text
            key={t}
            style={[
              styles.tick,
              { color: t === 0 ? c.warn : c.faint, left: width ? (t / ETA_HORIZON_S) * width - 20 : 0 },
              t === 0 && { textAlign: 'left', left: 0, width: 64 },
              t === ETA_HORIZON_S && { textAlign: 'right', left: undefined, right: 0 },
            ]}
          >
            {t === 0 ? '곡선 진입' : t === ETA_HORIZON_S ? `${t}초+` : `${t}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  trackWrap: { height: 18, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4 },
  band: { position: 'absolute', left: 0, height: 18, borderRadius: 6, borderWidth: 1.5 },
  entry: { position: 'absolute', left: -1, width: 3, height: 26, borderRadius: 2, top: -4 },
  ticks: { height: 16 },
  tick: { position: 'absolute', width: 40, textAlign: 'center', fontSize: 11, fontFamily: typography.num, fontVariant: ['tabular-nums'] },
});
