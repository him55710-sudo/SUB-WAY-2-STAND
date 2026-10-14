import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrainCandidate } from '@/contracts';
import { lineInfo } from '@/constants/lines';
import { useColors } from '@/hooks/useColors';
import { FRESH_S, formatAge, observationAge } from '@/lib/freshness';
import { NUM_FONT_BOLD, Skeleton, type Tone } from './ui';

export function candidateFreshness(t: TrainCandidate, now: number): { label: string; tone: Tone } {
  if (t.origin === 'fixture') return { label: '예시 · 실제 관측 아님', tone: 'warn' };
  const age = observationAge(t.observedAt, now);
  if (age === null) return { label: '관측 시각 미상', tone: 'warn' };
  if (t.fresh && age <= FRESH_S) return { label: `${formatAge(age)} 관측`, tone: 'live' };
  return { label: `오래된 관측 · ${formatAge(age)}`, tone: 'warn' };
}

export function TrainCard({ train, now, onPress, selected = false }: { train: TrainCandidate; now: number; onPress: () => void; selected?: boolean }) {
  const c = useColors();
  const line = lineInfo(train.line);
  const freshness = candidateFreshness(train, now);
  const live = train.origin === 'live';
  return (
    <Pressable testID={`train-${train.id}`} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${train.station}역 ${train.state}. ${train.destination}행 ${train.direction} ${train.id}열차. ${freshness.label}. ${selected ? '선택됨' : '선택하기'}`}
      onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: c.border, backgroundColor: selected ? c.card : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.stripe, { backgroundColor: selected ? line.color : 'transparent' }]} />
      <View style={styles.body}>
        <View style={styles.titleRow}><Text style={[styles.station, { color: c.foreground }]}>{train.station}</Text>{train.express ? <Text style={[styles.express, { color: c.mutedForeground }]}>급행</Text> : null}</View>
        <Text style={[styles.meta, { color: c.mutedForeground }]}>{train.destination}행 · {train.direction} · <Text style={styles.trainNo}>{train.id}</Text></Text>
        {train.lastTrain ? <Text style={[styles.lastTrain, { color: c.mutedForeground }]}>막차</Text> : null}
      </View>
      <View style={styles.right}>
        <View style={styles.statusRow}><Text style={[styles.state, { color: c.foreground }]}>{train.state}</Text>{selected ? <Feather name="check" size={16} color={c.signal} /> : null}</View>
        <Text style={[styles.age, { color: c.faint }]}>{freshness.label}</Text>
        <Text style={[styles.tag, { color: live ? c.live : c.mutedForeground }]}>{live ? '● LIVE' : '◇ EXAMPLE'}</Text>
      </View>
    </Pressable>
  );
}

export function TrainCardSkeleton() {
  const c = useColors();
  return <View style={[styles.row, { borderBottomColor: c.border }]}><View style={[styles.body, { gap: 12 }]}><Skeleton width={100} height={24} /><Skeleton width={160} height={13} /></View><Skeleton width={60} height={28} /></View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 22, paddingHorizontal: 4, borderBottomWidth: 1, minHeight: 112 },
  stripe: { width: 3, height: 48, borderRadius: 2 }, body: { flex: 1, gap: 6, minWidth: 0 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, station: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5, flexShrink: 1 }, meta: { fontSize: 12, lineHeight: 18 }, trainNo: { fontFamily: NUM_FONT_BOLD, fontVariant: ['tabular-nums'] }, express: { fontSize: 10, fontWeight: '700' }, lastTrain: { fontSize: 11 }, right: { alignItems: 'flex-end', gap: 6, maxWidth: '38%' }, statusRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, state: { fontSize: 13, fontWeight: '700' }, age: { fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] }, tag: { fontSize: 9, letterSpacing: 1, fontFamily: NUM_FONT_BOLD },
});
