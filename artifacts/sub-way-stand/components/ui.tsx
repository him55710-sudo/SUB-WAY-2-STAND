import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';

export const NUM_FONT = typography.num;
export const NUM_FONT_BOLD = typography.numBold;

export type FeatherName = React.ComponentProps<typeof Feather>['name'];
export type Tone = 'live' | 'synthetic' | 'warn' | 'danger' | 'muted';

export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  return { top: web ? 28 : insets.top, bottom: web ? 20 : insets.bottom };
}

export function useTone(tone: Tone) {
  const c = useColors();
  switch (tone) {
    case 'live':
      return { fg: c.live, bg: c.liveSoft };
    case 'synthetic':
      return { fg: c.synthetic, bg: c.syntheticSoft };
    case 'warn':
      return { fg: c.warn, bg: c.warnSoft };
    case 'danger':
      return { fg: c.destructive, bg: c.destructiveSoft };
    default:
      return { fg: c.mutedForeground, bg: c.muted };
  }
}

export function Badge({ label, tone, icon, dot }: { label: string; tone: Tone; icon?: FeatherName; dot?: boolean }) {
  const t = useTone(tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {dot ? <View style={[styles.badgeDot, { backgroundColor: t.fg }]} /> : null}
      {icon ? <Feather name={icon} size={12} color={t.fg} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Card({
  children,
  style,
  accent,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
}) {
  const c = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.card, borderColor: accent ?? c.border, borderRadius: c.radius },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'synthetic';
  icon?: FeatherName;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const scheme = {
    primary: { bg: c.primary, fg: c.primaryForeground, border: c.primary },
    secondary: { bg: c.raised, fg: c.foreground, border: c.border },
    ghost: { bg: 'transparent', fg: c.foreground, border: c.border },
    synthetic: { bg: c.synthetic, fg: c.primaryForeground, border: c.synthetic },
  }[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: scheme.bg,
          borderColor: scheme.border,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={scheme.fg} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={18} color={scheme.fg} /> : null}
          <Text style={[styles.buttonText, { color: scheme.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: c.raised, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Feather name={icon} size={20} color={c.foreground} />
    </Pressable>
  );
}

export function TogglePill({
  label,
  icon,
  value,
  onChange,
  testID,
}: {
  label: string;
  icon: FeatherName;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggle,
        {
          backgroundColor: value ? c.foreground : 'transparent',
          borderColor: value ? c.foreground : c.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Feather name={icon} size={16} color={value ? c.background : c.mutedForeground} />
      <Text style={[styles.toggleText, { color: value ? c.background : c.mutedForeground }]}>
        {label} {value ? '켜짐' : '꺼짐'}
      </Text>
    </Pressable>
  );
}

export function SectionLabel({ step, title, hint }: { step?: string; title: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      {step ? (
        <View style={[styles.step, { borderColor: c.border }]}>
          <Text style={[styles.stepText, { color: c.mutedForeground }]}>{step}</Text>
        </View>
      ) : null}
      <Text style={[styles.sectionTitle, { color: c.foreground }]}>{title}</Text>
      {hint ? <Text style={[styles.sectionHint, { color: c.faint }]}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: Tone;
  icon: FeatherName;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  const t = useTone(tone);
  const c = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderColor: t.fg + '40' }]}>
      <View style={styles.noticeRow}>
        <Feather name={icon} size={18} color={t.fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.noticeTitle, { color: t.fg }]}>{title}</Text>
          {body ? <Text style={[styles.noticeBody, { color: c.foreground }]}>{body}</Text> : null}
        </View>
      </View>
      {children ? <View style={{ marginTop: 12, gap: 8 }}>{children}</View> : null}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.header}>
      {onBack ? <IconButton icon="arrow-left" label="뒤로" onPress={onBack} testID="back" /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerTitle, { color: c.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.headerSub, { color: c.mutedForeground }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Stat({ label, value, unit, style }: { label: string; value: string; unit?: string; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: c.faint }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.foreground }, style]}>
        {value}
        {unit ? <Text style={[styles.statUnit, { color: c.mutedForeground }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** Wall clock that re-renders every `intervalMs` (for "N초 전" freshness labels). */
export function useTicker(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Dark native-stack chrome for the current screen. Only styling is set here (titles and
 * visibility stay in app/_layout.tsx) so the screen never remounts.
 */
export function DarkScreenChrome() {
  const c = useColors();
  return (
    <>
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          headerShown: false,
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.foreground,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700', color: c.foreground },
          contentStyle: { backgroundColor: c.background },
        }}
      />
    </>
  );
}

/** Pill chip used for line / station quick filters. */
export function Chip({
  label,
  selected,
  onPress,
  color,
  onColor,
  leading,
  testID,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Fill colour when selected (defaults to the cream primary). */
  color?: string;
  onColor?: string;
  leading?: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const fill = color ?? c.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.raised : 'transparent',
          borderColor: selected ? fill : c.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {leading}
      <Text style={[styles.chipText, { color: selected ? c.foreground : c.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Two-to-four option segmented control with radio semantics. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.segmented, { backgroundColor: c.sunken, borderColor: c.border }]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`seg-${o.value}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label} ${o.label}`}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.segment,
              { backgroundColor: on ? c.raised : 'transparent', borderColor: on ? c.borderStrong : 'transparent', opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.segmentText, { color: on ? c.foreground : c.mutedForeground }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pulsing placeholder block; static when the OS asks for reduced motion. */
export function Skeleton({ width, height, radius = 8, style }: { width: number | `${number}%`; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (reduced) {
      o.set(0.55);
      return;
    }
    o.set(withRepeat(withTiming(1, { duration: 750 }), -1, true));
  }, [reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: c.raised }, anim, style]} />;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { fontSize: 14, fontWeight: '700' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 14, fontWeight: '700' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  card: { borderWidth: 1, padding: 16 },
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: { fontSize: 14, fontWeight: '600' },
  section: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  step: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 12, fontFamily: NUM_FONT },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionHint: { fontSize: 13, marginLeft: 'auto' },
  notice: { borderRadius: 14, borderWidth: 1, padding: 14 },
  noticeRow: { flexDirection: 'row', gap: 10 },
  noticeTitle: { fontSize: 15, fontWeight: '700' },
  noticeBody: { fontSize: 14, lineHeight: 20, opacity: 0.9 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 2 },
  stat: { flex: 1, gap: 4 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 20, fontFamily: NUM_FONT, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
