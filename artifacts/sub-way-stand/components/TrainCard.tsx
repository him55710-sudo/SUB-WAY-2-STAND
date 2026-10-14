import { Feather } from '@expo/vector-icons';
import type { Train } from '@workspace/api-client-react';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lineInfo } from '@/constants/lines';
import { useColors } from '@/hooks/useColors';
import { formatAge, formatKstClock, observationAge } from '@/lib/freshness';
import { Badge, NUM_FONT } from './ui';

export function TrainCard({
  train,
  now,
  selected,
  onPress,
}: {
  train: Train;
  now: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const c = useColors();
  const line = lineInfo(train.line);
  const age = observationAge(train.observedAt, now);
  const fresh = train.fresh && age !== null && age <= 120;

  return (
    <Pressable
      testID={`train-${train.id}`}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${train.id} 열차, ${train.station} ${train.state}, ${train.destination}행`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? c.raised : c.card,
          borderColor: selected ? c.primary : c.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: line.color }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.row}>
          <Text style={[styles.station, { color: c.foreground }]} numberOfLines={1}>
            {train.station}
          </Text>
          <View style={[styles.state, { borderColor: c.border }]}>
            <Text style={[styles.stateText, { color: train.stateCode === '1' ? c.mutedForeground : c.foreground }]}>
              {train.state}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {selected ? <Feather name="check-circle" size={22} color={c.primary} /> : null}
        </View>
        <Text style={[styles.meta, { color: c.mutedForeground }]} numberOfLines={1}>
          {train.destination}행 · {train.direction} · 열차{' '}
          <Text style={{ fontFamily: NUM_FONT }}>{train.id}</Text>
        </Text>
        <View style={styles.row}>
          <Badge label={fresh ? '실시간 관측' : '오래된 관측'} tone={fresh ? 'live' : 'warn'} dot />
          <Text style={[styles.time, { color: c.faint }]}>
            {formatKstClock(train.observedAt)} · {formatAge(age)}
          </Text>
          {train.express ? <Badge label="급행" tone="muted" /> : null}
          {train.lastTrain ? <Badge label="막차" tone="danger" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, padding: 14, borderRadius: 14, borderWidth: 1, minHeight: 88 },
  stripe: { width: 4, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  station: { fontSize: 18, fontWeight: '800', maxWidth: '60%' },
  state: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  stateText: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 14 },
  time: { fontSize: 12, fontFamily: NUM_FONT, fontVariant: ['tabular-nums'] },
});
