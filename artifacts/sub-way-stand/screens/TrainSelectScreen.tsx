/** Select an observed train, or enter the clearly labelled physics demo. */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { APP_CONFIG, FLAGS } from '@/config/flags';
import type { TrainCandidate } from '@/contracts';
import { LINES, directionOptions, lineInfo } from '@/constants/lines';
import { typography } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { useRideSession } from '@/session/RideSession';
import { DEFAULT_SCENARIO_ID, listSimulationScenarios } from '@/services/simulation';
import { useTrainCandidates } from '@/services/trains';
import { useLocation } from '@/services/location';
import { FeedBanner } from '@/components/FeedBanner';
import { TrainCard, TrainCardSkeleton } from '@/components/TrainCard';
import { Button, Chip, DarkScreenChrome, Segmented, useScreenInsets, useTicker } from '@/components/ui';
import { feedBanner, filterCandidates, type DirectionFilter } from '@/components/uiModel';
import { JourneyPlanner } from '@/components/JourneyPlanner';
import type { Line2JourneyOption } from '@/lib/journeyPlanner';

export default function TrainSelectScreen() {
  const c = useColors();
  const { top, bottom } = useScreenInsets();
  const { select } = useRideSession();
  const now = useTicker(1000);
  const location = useLocation();
  const [line, setLine] = useState<number>(APP_CONFIG.defaultLine);
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [query, setQuery] = useState('');
  const [pulling, setPulling] = useState(false);
  const [chosen, setChosen] = useState<TrainCandidate | null>(null);
  const [journey, setJourney] = useState<Line2JourneyOption | null>(null);
  const [manual, setManual] = useState(false);
  // Local filtering avoids a network request on every keystroke.
  const { candidates, feed, isLoading, refresh } = useTrainCandidates({ line });
  const visible = useMemo(() => journey || manual ? filterCandidates(candidates, direction, query) : [], [candidates, direction, query, journey, manual]);
  const banner = feedBanner(feed, FLAGS.liveTrains);
  const scenario = listSimulationScenarios()[0];
  const showSim = FLAGS.simulationFallback && !!scenario;
  const info = lineInfo(line);
  const selectedTrain = chosen ? candidates.find((t) => t.id === chosen.id && t.line === chosen.line) ?? chosen : null;

  const onRefresh = useCallback(() => { setPulling(true); refresh(); }, [refresh]);
  useEffect(() => {
    if (!pulling || isLoading) return;
    const id = setTimeout(() => setPulling(false), 500);
    return () => clearTimeout(id);
  }, [pulling, isLoading]);

  const pickTrain = (t: TrainCandidate) => {
    select({ kind: 'live', line: t.line, trainId: t.id, directionCode: t.directionCode, initial: t, selectedAt: new Date().toISOString() });
    router.push(journey ? { pathname: '/ride', params: { from: journey.from, to: journey.to, direction: journey.directionCode } } : '/ride');
  };
  const pickSimulation = () => {
    select({ kind: 'simulation', scenarioId: scenario?.id ?? DEFAULT_SCENARIO_ID, selectedAt: new Date().toISOString() });
    router.push('/ride');
  };
  const changeLine = (n: number) => { setLine(n); setQuery(''); setDirection('all'); setChosen(null); };
  const resetFilters = () => { setDirection('all'); setQuery(''); setChosen(null); };

  const header = (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brand}><Text style={[styles.wordmark, { color: c.foreground }]}>SUB WAY 2 STAND</Text><View style={[styles.brandDot, { backgroundColor: c.signal }]} /></View>
        <Pressable testID="open-evidence" accessibilityRole="button" accessibilityLabel="검증과 연구 근거 보기" onPress={() => router.push('/evidence')} style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}><Text style={[styles.edition, { color: c.mutedForeground }]}>근거·검증 ↗</Text></Pressable>
      </View>
      <View style={styles.intro}>
        <Text style={[styles.eyebrow, { color: c.mutedForeground }]}>A LITTLE HEADS-UP. A STEADIER RIDE.</Text>
        <Text style={[styles.title, { color: c.foreground }]}>{'목적지까지,\n어떻게 갈까요?'}</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>출발역과 도착역을 고르면 탑승 방향부터 하차역까지 안내해요.</Text>
      </View>

      <JourneyPlanner onJourney={(next) => { setJourney(next); setChosen(null); if (next) { setLine(2); setDirection(next.directionCode); setQuery(next.from); } }} />
      <Pressable accessibilityRole="button" accessibilityLabel="열차 직접 선택 열기" onPress={() => setManual(!manual)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.mutedForeground }}>열차를 직접 찾아 연결하기 {manual ? '⌃' : '⌄'}</Text></Pressable>

      {manual ? <View style={[styles.pass, { backgroundColor: c.card }]}>
        <View style={styles.passTop}>
          <View style={[styles.lineBadge, { backgroundColor: info.color }]}><Text style={[styles.lineNumber, { color: info.onColor }]}>{line}</Text></View>
          <View style={{ flex: 1 }}><Text style={[styles.passLabel, { color: c.mutedForeground }]}>SEOUL METRO</Text><Text style={[styles.passTitle, { color: c.foreground }]}>{info.name}</Text></View>
          <Feather name="git-commit" size={28} color={c.faint} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lineSelectors} accessibilityLabel="지하철 노선 선택">
          {LINES.map((l) => (
            <Pressable key={l.n} testID={`line-${l.n}`} accessibilityRole="button" accessibilityLabel={`${l.name} 선택`} accessibilityState={{ selected: line === l.n }} onPress={() => changeLine(l.n)}
              style={({ pressed }) => [styles.lineSelector, { borderColor: line === l.n ? c.signal : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.lineCircle, { backgroundColor: l.color }]}><Text style={[styles.lineCircleText, { color: l.onColor }]}>{l.n}</Text></View>
            </Pressable>
          ))}
        </ScrollView>
        <Segmented label="방향" value={direction} onChange={(v) => { setDirection(v); setChosen(null); }} options={[{ value: 'all', label: '전체 방향' }, ...directionOptions(line).map((d) => ({ value: d.code, label: d.label }))]} />
        <View style={[styles.search, { borderBottomColor: c.border }]}>
          <Feather name="search" size={20} color={c.mutedForeground} />
          <TextInput testID="station-search" value={query} onChangeText={(q) => { setQuery(q); setChosen(null); }} placeholder="역 이름 또는 열차 번호" placeholderTextColor={c.faint} accessibilityLabel="역 이름, 행선지 또는 열차 번호로 검색" returnKeyType="search" autoCorrect={false} style={[styles.searchInput, { color: c.foreground }]} />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery('')} style={styles.clear}><Feather name="x" size={18} color={c.mutedForeground} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {info.stations.map((s) => <Chip key={s} label={s} selected={query === s} onPress={() => { setQuery(query === s ? '' : s); setChosen(null); }} accessibilityLabel={`${s}역으로 검색`} />)}
        </ScrollView>
      </View>

      : null}
      <View style={styles.locationSection}>
        <Pressable testID="use-location" accessibilityRole="button" accessibilityLabel="내 위치로 가까운 역 찾기" disabled={location.status === 'requesting'} onPress={() => void location.requestLocation()} style={({ pressed }) => [styles.locationButton, { opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="navigation" size={15} color={c.mutedForeground} /><Text style={[styles.locationText, { color: c.mutedForeground }]}>{location.status === 'requesting' ? '가까운 역을 찾고 있어요' : '내 위치로 가까운 역 찾기'}</Text><Feather name="arrow-up-right" size={14} color={c.mutedForeground} />
        </Pressable>
        {location.status !== 'idle' ? <Text style={[styles.locationNote, { color: c.faint }]}>{location.messageKo}</Text> : null}
        {location.nearestStations.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{location.nearestStations.map((s) => <Chip key={`${s.line}-${s.name}`} label={`${s.name} · ${s.distanceM < 1000 ? `${Math.round(s.distanceM)}m` : `${(s.distanceM / 1000).toFixed(1)}km`}`} selected={query === s.name && line === s.line} onPress={() => { setLine(s.line); setQuery(s.name); setChosen(null); }} />)}</ScrollView> : null}
      </View>

      {showSim ? (
        <Pressable testID="start-simulation" accessibilityRole="button" accessibilityLabel="시뮬레이션으로 체험. 실제 열차와 무관한 가상 주행입니다." onPress={pickSimulation} style={({ pressed }) => [styles.demo, { borderColor: c.border, opacity: pressed ? 0.65 : 1 }]}>
          <View style={[styles.demoGlyph, { borderColor: c.border }]}><Feather name="play" size={18} color={c.synthetic} /></View>
          <View style={{ flex: 1, gap: 4 }}><Text style={[styles.demoTag, { color: c.synthetic }]}>◆ SIMULATION</Text><Text style={[styles.demoTitle, { color: c.foreground }]}>키 없이, 지금 체험하기</Text><Text style={[styles.demoSub, { color: c.mutedForeground }]}>가상 주행 · 실제 열차와 무관</Text></View>
          <Feather name="arrow-right" size={20} color={c.foreground} />
        </Pressable>
      ) : null}

      {journey || manual ? <View style={styles.listHead}><Text style={[styles.listTitle, { color: c.foreground }]}>{journey ? `${journey.from} · ${journey.directionLabel} 탑승 열차` : '탑승할 열차'}</Text><Text style={[styles.listCount, { color: c.mutedForeground }]}>{visible.length.toString().padStart(2, '0')} TRAINS</Text></View> : null}
      {(journey || manual) && (FLAGS.liveTrains || showSim) ? <FeedBanner feed={feed} liveEnabled={FLAGS.liveTrains} loading={isLoading} now={now} onRetry={refresh} /> : null}
    </View>
  );

  const empty = isLoading && !candidates.length ? <View><TrainCardSkeleton /><TrainCardSkeleton /></View> : (
    <View style={styles.empty} accessibilityRole="summary">
      <Feather name={candidates.length ? 'search' : 'radio'} size={24} color={c.faint} />
      <Text style={[styles.emptyTitle, { color: c.foreground }]}>{candidates.length ? '조건에 맞는 열차가 없어요' : banner.kind === 'empty' ? '현재 조회된 열차가 없어요' : '실시간 열차를 기다리고 있어요'}</Text>
      <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>{candidates.length ? '다른 역이나 방향으로 검색해 보세요.' : showSim ? '연결 상태를 확인하는 동안 시뮬레이션을 체험할 수 있어요.' : '연결이 복구되면 열차 목록이 자동으로 갱신됩니다.'}</Text>
      {candidates.length ? <Button label={journey ? '같은 방향의 열차 전체 보기' : '필터 초기화'} variant="ghost" onPress={journey ? () => setQuery('') : resetFilters} /> : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <DarkScreenChrome />
      <FlatList data={visible} keyExtractor={(t) => `${t.line}-${t.id}`} renderItem={({ item }) => <TrainCard train={item} now={now} selected={selectedTrain?.id === item.id && selectedTrain.line === item.line} onPress={() => setChosen(item)} />}
        ListHeaderComponent={header} ListEmptyComponent={journey || manual ? empty : null} ListFooterComponent={<View style={[styles.footnoteWrap, { borderTopColor: c.border }]}><Feather name="info" size={13} color={c.faint} /><Text style={[styles.footnote, { color: c.faint }]}>실시간 위치는 역 단위로 관측됩니다. 검증된 곡선 정보가 없는 구간에서는 쏠림 예측을 보류합니다.</Text></View>}
        style={styles.listFrame} contentContainerStyle={[styles.list, { paddingTop: top + 12, paddingBottom: bottom + (selectedTrain ? 130 : 32) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={c.foreground} colors={[c.foreground]} progressBackgroundColor={c.card} />} />
      {selectedTrain ? <View style={[styles.ctaBar, { backgroundColor: c.background, borderTopColor: c.border, paddingBottom: bottom + 12 }]}><View style={styles.ctaInner}><Text style={[styles.selectedSummary, { color: c.mutedForeground }]}>{selectedTrain.station} · {selectedTrain.destination}행 · {selectedTrain.id}</Text><Button testID="confirm-train" label="이 열차로 시작" icon="arrow-right" onPress={() => pickTrain(selectedTrain)} /></View></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, listFrame: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }, list: { paddingHorizontal: 24 },
  header: { gap: 20, marginBottom: 4 }, brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandDot: { width: 6, height: 6, borderRadius: 3 }, wordmark: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }, edition: { fontSize: 10, fontFamily: typography.num, letterSpacing: 1.5 },
  intro: { gap: 12, marginTop: 26, marginBottom: 8 }, eyebrow: { fontSize: 9, fontFamily: typography.num, letterSpacing: 1.2 }, title: { fontSize: 42, lineHeight: 50, fontWeight: '800', letterSpacing: -1.6 }, subtitle: { fontSize: 14, lineHeight: 22 },
  pass: { borderRadius: 24, padding: 20, gap: 18 }, passTop: { flexDirection: 'row', alignItems: 'center', gap: 14 }, lineBadge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }, lineNumber: { fontSize: 30, fontFamily: typography.numBold }, passLabel: { fontSize: 9, fontFamily: typography.num, letterSpacing: 1.5 }, passTitle: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.7 }, lineSelectors: { gap: 3, paddingVertical: 3 }, lineSelector: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, lineCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, lineCircleText: { fontSize: 17, fontFamily: typography.numBold },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, borderBottomWidth: 1 }, searchInput: { flex: 1, minWidth: 0, fontSize: 16, paddingVertical: 14, outlineWidth: 0 }, clear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, chips: { gap: 8 },
  locationSection: { gap: 8 }, locationButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 }, locationText: { fontSize: 13, fontWeight: '600' }, locationNote: { fontSize: 12, lineHeight: 18 },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, padding: 18 }, demoGlyph: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, demoTag: { fontSize: 9, fontFamily: typography.numBold, letterSpacing: 1.2 }, demoTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700' }, demoSub: { fontSize: 12, lineHeight: 18 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }, listTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 }, listCount: { fontSize: 10, fontFamily: typography.num, letterSpacing: 1.2 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 16 }, emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' }, emptyBody: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  footnoteWrap: { borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingTop: 20, marginTop: 28 }, footnote: { flex: 1, fontSize: 11, lineHeight: 18 },
  ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 24 }, ctaInner: { width: '100%', maxWidth: 672, alignSelf: 'center', gap: 8 }, selectedSummary: { fontSize: 12, textAlign: 'center' },
});


