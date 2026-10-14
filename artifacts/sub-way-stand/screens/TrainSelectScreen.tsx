/** "열차 선택" — placeholder. Owner: UI task. */
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_CONFIG, FLAGS } from '@/config/flags';
import type { TrainCandidate } from '@/contracts';
import { useColors } from '@/hooks/useColors';
import { useRideSession } from '@/session/RideSession';
import { DEFAULT_SCENARIO_ID, listSimulationScenarios } from '@/services/simulation';
import { useTrainCandidates } from '@/services/trains';

export default function TrainSelectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { select } = useRideSession();
  const { candidates, feed, isLoading } = useTrainCandidates({ line: APP_CONFIG.defaultLine });
  const scenario = listSimulationScenarios()[0];

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={candidates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={[styles.banner, { backgroundColor: colors.muted }]}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>
              {APP_CONFIG.defaultLine}호선 · {feed.origin === 'fixture' ? '예시 데이터' : '실시간'}
            </Text>
            <Text style={{ color: colors.mutedForeground }}>{isLoading ? '불러오는 중…' : feed.message}</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : <Text style={{ color: colors.mutedForeground }}>표시할 열차가 없습니다.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pickTrain(item)}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                {item.id}번 열차 · {item.destination}행
              </Text>
              <Text style={{ color: colors.mutedForeground }}>
                {item.station} {item.state} · {item.direction}
              </Text>
            </View>
            {item.origin === 'fixture' ? (
              <Text style={[styles.badge, { color: colors.destructive, borderColor: colors.destructive }]}>
                예시
              </Text>
            ) : null}
          </Pressable>
        )}
        ListFooterComponent={
          FLAGS.simulationFallback && scenario ? (
            <Pressable onPress={pickSimulation} style={[styles.simButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.simText, { color: colors.primaryForeground }]}>시뮬레이션으로 체험</Text>
              <Text style={{ color: colors.primaryForeground }}>{scenario.summaryKo}</Text>
            </Pressable>
          ) : !FLAGS.liveTrains ? (
            <Text style={{ color: colors.mutedForeground }}>사용 가능한 모드가 없습니다.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: { padding: 12, borderRadius: 8, gap: 4, marginBottom: 6 },
  bannerTitle: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 8, borderWidth: 1, gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, fontSize: 12 },
  simButton: { marginTop: 16, padding: 16, borderRadius: 8, gap: 4 },
  simText: { fontSize: 17, fontWeight: '700' },
});
