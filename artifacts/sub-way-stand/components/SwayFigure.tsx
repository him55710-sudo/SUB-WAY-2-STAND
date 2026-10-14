import { Feather } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { SwayDirection } from '@/contracts';
import { useColors } from '@/hooks/useColors';
import type { RidePhase } from './uiModel';

const W = 240;
const H = 182;
const HIP = { x: W / 2, y: 112 };
/** Upper-body box is centred on the hip so rotating the box pivots at the hip. */
const R = 96;
const FLOOR_Y = 172;

function UpperBody({ color, ghost }: { color: string; ghost?: boolean }) {
  // Coordinates are relative to a 2R×2R box whose centre (R, R) is the hip.
  const dash = ghost ? '4 5' : undefined;
  const limb = ghost ? 2 : 11;
  return (
    <Svg width={R * 2} height={R * 2}>
      {/* balance pose: arms slightly out */}
      <Path
        d={`M${R - 24} ${R - 14} L${R} ${R - 50} L${R + 24} ${R - 14}`}
        stroke={color}
        strokeWidth={limb}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
        fill="none"
      />
      {/* torso */}
      <Line x1={R} y1={R - 2} x2={R} y2={R - 54} stroke={color} strokeWidth={ghost ? 2 : 20} strokeLinecap="round" strokeDasharray={dash} />
      {/* head */}
      <Circle
        cx={R}
        cy={R - 80}
        r={15}
        fill={ghost ? 'none' : color}
        stroke={ghost ? color : 'none'}
        strokeWidth={ghost ? 2 : 0}
        strokeDasharray={dash}
      />
    </Svg>
  );
}

/**
 * Standing-passenger pictogram that leans toward the predicted sway side. The lean is a spring
 * (pendulum feel) proportional to the acceleration; two dashed ghosts mark the min/max of the
 * range. Static when the OS requests reduced motion.
 */
export function SwayFigure({
  lean,
  sway,
  phase,
  reducedMotion,
}: {
  lean: { mid: number; min: number; max: number };
  sway: SwayDirection;
  phase: RidePhase;
  reducedMotion: boolean;
}) {
  const c = useColors();
  const active = phase !== 'suppressed';
  const color = active ? c.warn : c.faint;

  const angle = useSharedValue(0);
  const gMin = useSharedValue(0);
  const gMax = useSharedValue(0);
  const ghostOpacity = useSharedValue(0);
  const halo = useSharedValue(0);
  const nudge = useSharedValue(0);

  const target = active ? lean.mid : 0;
  const tMin = active ? lean.min : 0;
  const tMax = active ? lean.max : 0;
  const dir = sway === 'left' ? -1 : sway === 'right' ? 1 : 0;

  useEffect(() => {
    if (reducedMotion) {
      angle.set(target);
      gMin.set(tMin);
      gMax.set(tMax);
      ghostOpacity.set(active ? 1 : 0);
      return;
    }
    angle.set(withSpring(target, { damping: 7, stiffness: 60, mass: 1.1 }));
    gMin.set(withTiming(tMin, { duration: 450 }));
    gMax.set(withTiming(tMax, { duration: 450 }));
    ghostOpacity.set(withTiming(active ? 1 : 0, { duration: 300 }));
  }, [target, tMin, tMax, active, reducedMotion, angle, gMin, gMax, ghostOpacity]);

  useEffect(() => {
    if (reducedMotion || phase !== 'now') {
      cancelAnimation(halo);
      halo.set(phase === 'now' ? 0.6 : 0);
    } else {
      halo.set(withRepeat(withTiming(1, { duration: 520 }), -1, true));
    }
    if (reducedMotion || !active || dir === 0) {
      cancelAnimation(nudge);
      nudge.set(0);
    } else {
      const d = phase === 'now' ? 10 : 6;
      nudge.set(
        withRepeat(withSequence(withTiming(dir * d, { duration: 420 }), withTiming(0, { duration: 420 })), -1, false),
      );
    }
  }, [phase, active, dir, reducedMotion, halo, nudge]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
  const minStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${gMin.get()}deg` }],
    opacity: ghostOpacity.get() * 0.55,
  }));
  const maxStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${gMax.get()}deg` }],
    opacity: ghostOpacity.get() * 0.55,
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.get() * 0.5,
    transform: [{ scale: 0.9 + halo.get() * 0.15 }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.get() }] }));

  const boxPos = { left: HIP.x - R, top: HIP.y - R };

  return (
    <View style={styles.canvas} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.halo, { backgroundColor: c.warnSoft, borderColor: c.warn }, haloStyle]} />

      {/* floor + planted legs (static) */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Rect x={24} y={FLOOR_Y} width={W - 48} height={4} rx={2} fill={c.borderStrong} />
        <Path
          d={`M${HIP.x - 16} ${FLOOR_Y - 4} L${HIP.x} ${HIP.y} L${HIP.x + 16} ${FLOOR_Y - 4}`}
          stroke={color}
          strokeLinejoin="round"
          strokeWidth={13}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>

      <Animated.View style={[styles.box, boxPos, minStyle]}>
        <UpperBody color={color} ghost />
      </Animated.View>
      <Animated.View style={[styles.box, boxPos, maxStyle]}>
        <UpperBody color={color} ghost />
      </Animated.View>
      <Animated.View style={[styles.box, boxPos, bodyStyle]}>
        <UpperBody color={color} />
      </Animated.View>

      {active && dir !== 0 ? (
        <Animated.View style={[styles.arrow, dir < 0 ? { left: 0 } : { right: 0 }, arrowStyle]}>
          <Feather name={dir < 0 ? 'chevrons-left' : 'chevrons-right'} size={52} color={c.warn} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: W, height: H, alignSelf: 'center' },
  box: { position: 'absolute', width: R * 2, height: R * 2 },
  halo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    left: W / 2 - 85,
    top: HIP.y - 104,
  },
  arrow: { position: 'absolute', top: 40 },
});
