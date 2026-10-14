import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedStatus } from '@/contracts';
import { useColors } from '@/hooks/useColors';
import { formatAge, observationAge } from '@/lib/freshness';
import { feedBanner } from './uiModel';
import { useTone } from './ui';

/**
 * Always-visible feed status: 실시간 / 캐시 / 시뮬레이션 / 키 없음 / 연결 불가 (+ 예시 데이터,
 * 호출 한도, 운행 없음). Shows the provider message verbatim and a retry when it can help.
 */
export function FeedBanner({
  feed,
  liveEnabled,
  loading,
  now,
  onRetry,
}: {
  feed: FeedStatus;
  liveEnabled: boolean;
  loading: boolean;
  now: number;
  onRetry: () => void;
}) {
  const c = useColors();
  const m = feedBanner(feed, liveEnabled);
  const t = useTone(m.tone);
  const age = feed.fetchedAt ? observationAge(feed.fetchedAt, now) : null;

  return (
    <View
      testID={`feed-${m.kind}`}
      accessibilityRole="summary"
      accessibilityLabel={`데이터 상태 ${m.label}. ${m.title}. ${feed.message}`}
      style={[styles.wrap, { backgroundColor: t.bg, borderColor: t.fg + '40' }]}
    >
      <View style={styles.top}>
        <View style={[styles.pill, { backgroundColor: t.fg }]}>
          {loading ? (
            <ActivityIndicator size="small" color={c.background} style={{ transform: [{ scale: 0.7 }] }} />
          ) : (
            <Feather name={m.icon} size={13} color={c.background} />
          )}
          <Text style={[styles.pillText, { color: c.background }]}>{loading ? '확인 중' : m.label}</Text>
        </View>
        <Text style={[styles.title, { color: t.fg }]} numberOfLines={1}>
          {m.title}
        </Text>
        {m.canRetry ? (
          <Pressable
            testID="feed-retry"
            accessibilityRole="button"
            accessibilityLabel="열차 목록 다시 불러오기"
            disabled={loading}
            onPress={onRetry}
            hitSlop={6}
            style={({ pressed }) => [
              styles.retry,
              { borderColor: t.fg + '66', opacity: loading ? 0.5 : pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="refresh-cw" size={16} color={t.fg} />
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.message, { color: c.foreground }]}>
        {feed.message}
        {age !== null ? (
          <Text style={[styles.meta, { color: c.mutedForeground }]}>
            {'  '}
            {formatAge(age)} 갱신{feed.cached ? ' · 서버 캐시' : ''}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 26,
  },
  pillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  title: { flex: 1, fontSize: 14, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 20, opacity: 0.92 },
  meta: { fontSize: 12, fontWeight: '500' },
  retry: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: -6,
  },
});
