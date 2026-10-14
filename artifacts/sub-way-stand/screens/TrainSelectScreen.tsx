/** "열차 선택" — pick a live train or start the labeled simulation. Owner: UI task. */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { APP_CONFIG, FLAGS } from '@/config/flags';
import type { TrainCandidate } from '@/contracts';
import { LINES, directionOptions, lineInfo } from '@/constants/lines';
import { spacing } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { useRideSession } from '@/session/RideSession';
import { DEFAULT_SCENARIO_ID, listSimulationScenarios } from '@/services/simulation';
import { useTrainCandidates } from '@/services/trains';
import { FeedBanner } from '@/components/FeedBanner';
import { TrainCard, TrainCardSkeleton } from '@/components/TrainCard';
import { Button, Chip, DarkScreenChrome, Segmented, useScreenInsets, useTicker } from '@/components/ui';
import { feedBanner, filterCandidates, type DirectionFilter } from '@/components/uiModel';

export default function TrainSelectScreen() {
  const c = useColors();
  const { bottom } = useScreenInsets();
  const { select } = useRideSession();
  const now = useTicker(1000);

  const [line, setLine] = useState<number>(APP_CONFIG.defaultLine);
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [query, setQuery] = useState('');
  const [pulling, setPulling] = useState(false);

  // Only `line` goes to the service: direction + station filtering is client-side so typing
  // and toggling are instant and never spend live-API quota.
  const { candidates, feed, isLoading, refresh } = useTrainCandidates({ line });
  const visible = useMemo(() => filterCandidates(candidates, direction, query), [candidates, direction, query]);
  const banner = feedBanner(feed, FLAGS.liveTrains);
  const scenario = listSimulationScenarios()[0];
  const showSim = FLAGS.simulationFallback && !!scenario;
  const info = lineInfo(line);
  const filtered = direction !== 'all' || query.trim() !== '';

  const onRefresh = useCallback(() => {
    setPulling(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pulling || isLoading) return;
    const id = setTimeout(() => setPulling(false), 600);
    return () => clearTimeout(id);
  }, [pulling, isLoading]);

  const pickTrain = (t: TrainCandidate) => {
    select({
      kind: 'live',
      line: t.line,
      trainId: t.id,
      directionCode: t.directionCode,
      initial: t,
      selectedAt: new Date().toISOString(),
    });
    router.push('/ride');
  };

  const pickSimulation = () => {
    select({ kind: 'simulation', scenarioId: scenario?.id ?? DEFAULT_SCENARIO_ID, selectedAt: new Date().toISOString() });
    router.push('/ride');
  };

  const resetFilters = () => {
    setDirection('all');
    setQuery('');
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.intro}>
        <Text style={[styles.wordmark, { color: c.line2 }]}>SUB WAY 2 STAND</Text>
        <Text style={[styles.tagline, { color: c.foreground }]}>{'곡선 전에, 어느 쪽으로\n쏠릴지 미리 알려드려요'}</Text>
      </View>

      {/* With live and simulation both off the banner would claim "시뮬레이션 모드"; the empty state explains instead. */}
      {FLAGS.liveTrains || showSim ? (
        <FeedBanner feed={feed} liveEnabled={FLAGS.liveTrains} loading={isLoading} now={now} onRetry={refresh} />
      ) : null}

      <View style={styles.group}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {LINES.map((l) => (
            <Chip
              key={l.n}
              testID={`line-${l.n}`}
              label={l.name}
              accessibilityLabel={`${l.name} 선택`}
              selected={l.n === line}
              color={l.color}
              onColor={l.onColor}
              onPress={() => setLine(l.n)}
              leading={<View style={[styles.lineDot, { backgroundColor: l.n === line ? l.onColor : l.color }]} />}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <View style={[styles.search, { backgroundColor: c.card, borderColor: query ? c.borderStrong : c.border }]}>
          <Feather name="search" size={18} color={c.mutedForeground} />
          <TextInput
            testID="station-search"
            value={query}
            onChangeText={setQuery}
            placeholder="역 이름, 행선지 또는 열차 번호"
            placeholderTextColor={c.faint}
            accessibilityLabel="역 이름, 행선지 또는 열차 번호로 검색"
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.searchInput, { color: c.foreground }]}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery('')} hitSlop={10}>
              <Feather name="x-circle" size={18} color={c.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {info.stations.map((s) => (
            <Chip key={s} label={s} selected={query === s} onPress={() => setQuery(query === s ? '' : s)} accessibilityLabel={`${s}역으로 검색`} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <Segmented
          label="방향"
          value={direction}
          onChange={setDirection}
          options={[{ value: 'all', label: '전체' }, ...directionOptions(line).map((d) => ({ value: d.code, label: d.label }))]}
        />
      </View>

      {!isLoading && visible.length > 0 ? (
        <View style={styles.listHead}>
          <Text style={[styles.listTitle, { color: c.foreground }]}>
            {info.name} 열차 {visible.length}대{filtered ? ` / 전체 ${candidates.length}대` : ''}
          </Text>
          <Text style={[styles.listHint, { color: c.faint }]}>탑승한 열차를 선택하세요</Text>
        </View>
      ) : null}
    </View>
  );

  const empty = (() => {
    if (isLoading) {
      return (
        <View style={{ gap: spacing.md }}>
          <TrainCardSkeleton />
          <TrainCardSkeleton />
          <TrainCardSkeleton />
        </View>
      );
    }
    if (candidates.length > 0) {
      return (
        <EmptyState
          icon="filter"
          title="조건에 맞는 열차가 없어요"
          body="방향이나 검색어를 바꿔 보세요."
          action={<Button label="필터 초기화" variant="secondary" icon="rotate-ccw" onPress={resetFilters} />}
        />
      );
    }
    if (!FLAGS.liveTrains) {
      return (
        <EmptyState
          icon="cpu"
          title="실시간 열차 기능이 꺼져 있어요"
          body={showSim ? '아래 시뮬레이션으로 쏠림 안내를 체험할 수 있어요.' : '시뮬레이션도 꺼져 있어 지금은 체험할 수 있는 안내가 없어요.'}
        />
      );
    }
    if (banner.kind === 'empty') {
      return (
        <EmptyState
          icon="moon"
          title="지금은 운행 중인 열차가 없어요"
          body={`${info.name}에서 조회된 열차가 없습니다. 잠시 후 다시 시도하거나 시뮬레이션을 이용하세요.`}
          action={<Button label="다시 불러오기" variant="secondary" icon="refresh-cw" onPress={refresh} />}
        />
      );
    }
    return (
      <EmptyState
        icon={banner.icon === 'key' ? 'key' : 'wifi-off'}
        tone="danger"
        title={banner.kind === 'missing-key' ? '실시간 데이터를 쓸 수 없어요' : '열차 목록을 불러오지 못했어요'}
        body={`${feed.message}${showSim ? '\n시뮬레이션은 네트워크 없이도 동작합니다.' : ''}`}
        action={
          banner.canRetry ? <Button label="다시 시도" variant="secondary" icon="refresh-cw" onPress={refresh} /> : undefined
        }
      />
    );
  })();

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <DarkScreenChrome />
      <FlatList
        data={isLoading ? [] : visible}
        keyExtractor={(t) => `${t.line}-${t.id}`}
        renderItem={({ item }) => <TrainCard train={item} now={now} onPress={() => pickTrain(item)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <Text style={[styles.footnote, { color: c.faint }]}>
            열차 위치는 역 단위(진입·도착·출발)로만 관측됩니다. 역 사이 위치와 속도, 쏠림 시점은 추정치입니다.
          </Text>
        }
        contentContainerStyle={[styles.list, { paddingBottom: (showSim ? 110 : 24) + bottom }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={c.foreground} colors={[c.line2]} progressBackgroundColor={c.card} />
        }
      />

      {showSim && scenario ? (
        <View style={[styles.ctaBar, { backgroundColor: c.background, borderTopColor: c.border, paddingBottom: bottom + 12 }]}>
          <Pressable
            testID="start-simulation"
            accessibilityRole="button"
            accessibilityLabel="시뮬레이션으로 체험. 가상 선로를 달리는 시연이며 실제 열차와 무관합니다."
            onPress={pickSimulation}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.synthetic, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <View style={[styles.ctaIcon, { backgroundColor: c.syntheticForeground + '1F' }]}>
              <Feather name="play" size={20} color={c.syntheticForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.ctaTitleRow}>
                <Text style={[styles.ctaTitle, { color: c.syntheticForeground }]}>시뮬레이션으로 체험</Text>
                {banner.suggestSimulation ? (
                  <View style={[styles.ctaTag, { backgroundColor: c.syntheticForeground }]}>
                    <Text style={[styles.ctaTagText, { color: c.synthetic }]}>추천</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.ctaSub, { color: c.syntheticForeground }]} numberOfLines={1}>
                가상 선로 · 실제 열차와 무관 · 네트워크 불필요
              </Text>
            </View>
            <Feather name="arrow-right" size={22} color={c.syntheticForeground} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
  tone = 'muted',
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: 'muted' | 'danger';
}) {
  const c = useColors();
  const fg = tone === 'danger' ? c.destructive : c.mutedForeground;
  return (
    <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.card }]} accessibilityRole="summary">
      <View style={[styles.emptyIcon, { backgroundColor: tone === 'danger' ? c.destructiveSoft : c.raised }]}>
        <Feather name={icon} size={22} color={fg} />
      </View>
      <Text style={[styles.emptyTitle, { color: c.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>{body}</Text>
      {action ? <View style={{ alignSelf: 'stretch', marginTop: 4 }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.md },
  intro: { gap: 4 },
  wordmark: { fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  tagline: { fontSize: 20, lineHeight: 27, fontWeight: '800' },
  group: { gap: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  lineDot: { width: 8, height: 8, borderRadius: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 12, outlineWidth: 0 },
  listHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  listTitle: { fontSize: 16, fontWeight: '800' },
  listHint: { fontSize: 12, fontWeight: '500' },
  footnote: { fontSize: 12, lineHeight: 18, marginTop: spacing.xl, textAlign: 'center', paddingHorizontal: spacing.md },
  empty: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center', gap: 8 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: 12, borderTopWidth: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, borderRadius: 18, paddingHorizontal: 14 },
  ctaIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  ctaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaTitle: { fontSize: 17, fontWeight: '800' },
  ctaTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  ctaTagText: { fontSize: 11, fontWeight: '800' },
  ctaSub: { fontSize: 12, fontWeight: '600', opacity: 0.8, marginTop: 1 },
});
