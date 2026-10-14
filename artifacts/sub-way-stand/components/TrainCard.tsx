import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrainCandidate } from '@/contracts';
import { lineInfo } from '@/constants/lines';
import { useColors } from '@/hooks/useColors';
import { FRESH_S, formatAge, observationAge } from '@/lib/freshness';
import { stateSentence } from './uiModel';
import { Badge, NUM_FONT_BOLD, Skeleton, type Tone } from './ui';

/** Freshness of one observation, honest about fixture data and clock problems. */
export function candidateFreshness(t: TrainCandidate, now: number): { label: string; tone: Tone } {
  if (t.origin === 'fixture') return { label: '예시 데이터 · 실제 관측 아님', tone: 'warn' };
  const age = observationAge(t.observedAt, now);
  if (age === null) return { label: '관측 시각 미상', tone: 'warn' };
  if (t.fresh && age <= FRESH_S) return { label: `${formatAge(age)} 관측`, tone: 'live' };
  return { label: `오래된 관측 · ${formatAge(age)}`, tone: 'warn' };
}

/** Step indicator: ● previous → ● station, filled up to the reported state. */
function StateTrack({ stateCode, color }: { stateCode: TrainCandidate['stateCode']; color: string }) {
  const c = useColors();
  // 전역출발 → 진입 → 도착 → 출발
  const step = { '3': 0, '0': 1, '1': 2, '2': 3, unknown: -1 }[stateCode];
  return (
    <View style={styles.track} importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.trackPip,
            i === 2 && styles.trackStation,
            { backgroundColor: i <= step ? color : c.raised, borderColor: i === 2 ? (i <= step ? color : c.borderStrong) : 'transparent' },
          ]}
        />
      ))}
    </View>
  );
}

export function TrainCard({
  train,
  now,
  onPress,
}: {
  train: TrainCandidate;
  now: number;
  onPress: () => void;
}) {
  const c = useColors();
  const line = lineInfo(train.line);
  const freshness = candidateFreshness(train, now);
  const stopped = train.stateCode === '1';

  return (
    <Pressable
      testID={`train-${train.id}`}
      accessibilityRole="button"
      accessibilityHint="탑승 안내 화면으로 이동합니다"
      accessibilityLabel={`${train.id}번 열차, ${stateSentence(train)}, ${train.destination}행, ${train.direction}, ${freshness.label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? c.raised : c.card, borderColor: c.border, transform: [{ scale: pressed ? 0.99 : 1 }] },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: line.color }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={[styles.trainNo, { color: c.foreground }]}>{train.id}</Text>
          <Text style={[styles.trainNoUnit, { color: c.mutedForeground }]}>열차</Text>
          <View style={{ flex: 1 }} />
          {train.express ? <Badge label="급행" tone="warn" /> : null}
          {train.lastTrain ? <Badge label="막차" tone="danger" /> : null}
          {train.origin === 'fixture' ? <Badge label="예시" tone="warn" icon="alert-triangle" /> : null}
        </View>

        <View style={styles.row}>
          <Text style={[styles.station, { color: c.foreground }]} numberOfLines={1}>
            {train.station}
          </Text>
          <View style={[styles.state, { backgroundColor: stopped ? c.raised : c.warnSoft }]}>
            <Text style={[styles.stateText, { color: stopped ? c.mutedForeground : c.warn }]}>{train.state}</Text>
          </View>
          <StateTrack stateCode={train.stateCode} color={stopped ? c.mutedForeground : c.warn} />
        </View>

        <Text style={[styles.meta, { color: c.mutedForeground }]} numberOfLines={1}>
          {train.destination}행 · {train.direction}
        </Text>

        <View style={styles.footer}>
          <Badge label={freshness.label} tone={freshness.tone} dot />
          <Feather name="chevron-right" size={20} color={c.faint} style={{ marginLeft: 'auto' }} />
        </View>
      </View>
    </Pressable>
  );
}

export function TrainCardSkeleton() {
  const c = useColors();
  return (
    <View
      accessibilityLabel="열차 목록 불러오는 중"
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
    >
      <View style={[styles.stripe, { backgroundColor: c.raised }]} />
      <View style={[styles.body, { gap: 10 }]}>
        <Skeleton width={84} height={18} />
        <Skeleton width="62%" height={22} />
        <Skeleton width="44%" height={14} />
        <Skeleton width={120} height={20} radius={999} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, minHeight: 124 },
  stripe: { width: 4, borderRadius: 2 },
  body: { flex: 1, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trainNo: { fontSize: 15, fontFamily: NUM_FONT_BOLD, fontVariant: ['tabular-nums'], letterSpacing: 0.4 },
  trainNoUnit: { fontSize: 13, fontWeight: '600', marginLeft: -4 },
  station: { fontSize: 22, fontWeight: '800', flexShrink: 1 },
  state: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  stateText: { fontSize: 13, fontWeight: '800' },
  track: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 2 },
  trackPip: { width: 6, height: 6, borderRadius: 3 },
  trackStation: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  meta: { fontSize: 14, fontWeight: '500' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
});
