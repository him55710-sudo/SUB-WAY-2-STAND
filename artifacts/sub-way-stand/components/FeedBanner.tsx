import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedStatus } from '@/contracts';
import { useColors } from '@/hooks/useColors';
import { formatAge, observationAge } from '@/lib/freshness';
import { feedBanner } from './uiModel';
import { useTone } from './ui';

/** Compact feed status; the selection and demo remain usable through outages. */
export function FeedBanner({ feed, liveEnabled, loading, now, onRetry }: { feed: FeedStatus; liveEnabled: boolean; loading: boolean; now: number; onRetry: () => void }) {
  const c = useColors();
  const m = feedBanner(feed, liveEnabled);
  const t = useTone(m.tone);
  const age = feed.fetchedAt ? observationAge(feed.fetchedAt, now) : null;
  return (
    <View testID={`feed-${m.kind}`} accessibilityRole="summary" accessibilityLabel={`데이터 상태 ${m.label}. ${m.title}. ${feed.message}`} style={[styles.wrap, { borderBottomColor: c.border }]}>
      <View style={styles.row}>{loading ? <ActivityIndicator size="small" color={c.mutedForeground} /> : <Feather name={m.icon} size={13} color={t.fg} />}<Text style={[styles.label, { color: t.fg }]}>{loading ? '열차 확인 중' : m.label}</Text><Text style={[styles.age, { color: c.faint }]}>{age !== null ? `${formatAge(age)} 갱신${feed.cached ? ' · 캐시' : ''}` : ''}</Text>
      {m.canRetry ? <Pressable testID="feed-retry" accessibilityRole="button" accessibilityLabel="열차 목록 다시 불러오기" disabled={loading} onPress={onRetry} style={({ pressed }) => [styles.retry, { opacity: loading ? 0.4 : pressed ? 0.6 : 1 }]}><Feather name="refresh-cw" size={15} color={c.mutedForeground} /></Pressable> : null}</View>
      {!loading && m.kind !== 'live' ? <Text style={[styles.message, { color: c.mutedForeground }]}>{feed.message || m.title}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { paddingBottom: 12, borderBottomWidth: 1, gap: 6 }, row: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 32 }, label: { fontSize: 11, fontWeight: '700' }, age: { fontSize: 10, flex: 1 }, message: { fontSize: 12, lineHeight: 18 }, retry: { width: 48, height: 48, marginVertical: -8, alignItems: 'center', justifyContent: 'center' } });
