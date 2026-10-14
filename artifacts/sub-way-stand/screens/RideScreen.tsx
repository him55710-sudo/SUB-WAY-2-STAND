/** "탑승 안내" — placeholder. Owner: UI task. */
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Forecast } from '@/contracts';
import { useColors } from '@/hooks/useColors';
import { useRideSession } from '@/session/RideSession';
import { useForecast } from '@/services/forecast';
import { useGuidance } from '@/services/guidance';
import { getSimulationScenario } from '@/services/simulation';
import { useTrackedTrain } from '@/services/trains';

const SWAY_KO: Record<Forecast['sway'], string> = { left: '왼쪽', right: '오른쪽', none: '없음' };
const fmt = (n: number) => n.toFixed(1);

export default function RideScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selection } = useRideSession();
  const live = selection?.kind === 'live' ? selection : null;
  const tracked = useTrackedTrain(live?.line ?? 0, live?.trainId ?? null);
  const forecast = useForecast(selection);
  const guidance = useGuidance(forecast);

  if (!selection) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>선택된 열차가 없습니다.</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Text style={{ color: colors.primary, marginTop: 12 }}>열차 선택으로</Text>
        </Pressable>
      </View>
    );
  }

  const train = tracked.train ?? live?.initial ?? null;
  const title =
    selection.kind === 'simulation'
      ? `[시뮬레이션] ${getSimulationScenario(selection.scenarioId)?.titleKo ?? ''}`
      : `${train?.id ?? selection.trainId}번 열차 ${train?.origin === 'fixture' ? '[예시]' : ''}`;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {train ? (
        <Text style={{ color: colors.mutedForeground }}>
          {train.station} {train.state} · {train.destination}행 · {tracked.feed.message}
        </Text>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {forecast.source === 'simulation' ? '시뮬레이션 예측' : '실시간 추정'} ·{' '}
          {forecast.state === 'active' ? '활성' : `중지 (${forecast.suppressReason})`}
        </Text>
        <Text style={[styles.big, { color: colors.foreground }]}>쏠림: {SWAY_KO[forecast.sway]}</Text>
        {forecast.etaWindowS ? (
          <Text style={{ color: colors.foreground }}>
            곡선 진입까지 {fmt(forecast.etaWindowS.min)}–{fmt(forecast.etaWindowS.max)}초
          </Text>
        ) : null}
        {forecast.lateralAccelMs2 ? (
          <Text style={{ color: colors.foreground }}>
            횡가속도 {fmt(forecast.lateralAccelMs2.min)}–{fmt(forecast.lateralAccelMs2.max)} m/s²
          </Text>
        ) : null}
        <Text style={{ color: colors.mutedForeground }}>신뢰도: {forecast.confidence}</Text>
        {forecast.explanationKo.map((line) => (
          <Text key={line} style={{ color: colors.mutedForeground }}>
            · {line}
          </Text>
        ))}
      </View>

      <View style={[styles.card, styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground }}>음성 안내</Text>
          <Text style={{ color: colors.mutedForeground }}>
            {guidance.available ? (guidance.lastEvent?.textKo ?? '대기 중') : '사용할 수 없음'}
          </Text>
        </View>
        <Switch value={guidance.enabled} onValueChange={guidance.setEnabled} disabled={!guidance.available} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: '700' },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 13 },
  big: { fontSize: 22, fontWeight: '700' },
});
