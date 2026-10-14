/** "탑승 안내" — which way you will lean, and when. Owner: UI task. */
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { Forecast, GuidanceState, TrainCandidate } from '@/contracts';
import { spacing, typography } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { useRideSession } from '@/session/RideSession';
import { useForecast } from '@/services/forecast';
import { useGuidance } from '@/services/guidance';
import { DEFAULT_SCENARIO_ID, getSimulationScenario } from '@/services/simulation';
import { useTrackedTrain } from '@/services/trains';
import { EtaBand } from '@/components/EtaBand';
import { ExplanationCard } from '@/components/ExplanationCard';
import { RouteStrip, routeStripData } from '@/components/RouteStrip';
import { SwayFigure } from '@/components/SwayFigure';
import { candidateFreshness } from '@/components/TrainCard';
import { Badge, Button, DarkScreenChrome, TogglePill, useScreenInsets, useTicker, useTone } from '@/components/ui';
import {
  SIDE_KO,
  TURN_KO,
  confidenceBadge,
  etaPhrase,
  leanDegrees,
  ridePhase,
  sourceLabel,
  stateSentence,
  suppressCopy,
  type RidePhase,
} from '@/components/uiModel';

export default function RideScreen() {
  const c = useColors();
  const { bottom } = useScreenInsets();
  const reduced = useReducedMotion();
  const now = useTicker(1000);
  const { selection, select } = useRideSession();
  const params = useLocalSearchParams<{ sim?: string }>();
  const live = selection?.kind === 'live' ? selection : null;
  const tracked = useTrackedTrain(live?.line ?? 0, live?.trainId ?? null);
  const forecast = useForecast(selection);
  const guidance = useGuidance(forecast);

  // Shareable demo link: /ride?sim=1 opens straight into the labeled simulation.
  const wantsSim = params.sim === '1';
  useEffect(() => {
    if (!selection && wantsSim) {
      select({ kind: 'simulation', scenarioId: DEFAULT_SCENARIO_ID, selectedAt: new Date().toISOString() });
    }
  }, [selection, wantsSim, select]);

  if (!selection) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <DarkScreenChrome />
        <Feather name="navigation" size={28} color={c.faint} />
        <Text style={[styles.centerTitle, { color: c.foreground }]}>선택된 열차가 없어요</Text>
        <Text style={[styles.centerBody, { color: c.mutedForeground }]}>열차를 고르거나 시뮬레이션을 시작하세요.</Text>
        <Button
          label="열차 선택으로"
          icon="arrow-left"
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{ alignSelf: 'stretch', marginTop: 8 }}
        />
      </View>
    );
  }

  const train = tracked.train ?? live?.initial ?? null;
  const phase = ridePhase(forecast);
  const strip = routeStripData(selection, forecast, train);
  const scenario = selection.kind === 'simulation' ? getSimulationScenario(selection.scenarioId) : null;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <DarkScreenChrome />
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 24 }]}
      >
        <SourceStrip
          forecast={forecast}
          train={train}
          now={now}
          lost={tracked.lost}
          feedMessage={tracked.feed.message}
          scenarioTitle={scenario?.titleKo ?? null}
        />

        <View style={styles.content}>
          <SwayHero forecast={forecast} phase={phase} reducedMotion={reduced} />
          <GuidanceRow guidance={guidance} />
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <RouteStrip data={strip} reducedMotion={reduced} />
          </View>
          <ExplanationCard forecast={forecast} reducedMotion={reduced} />
          {scenario ? (
            <Text style={[styles.footnote, { color: c.faint }]}>{scenario.summaryKo}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** Pinned data-source label: never scrolls away, so live vs simulation is always clear. */
function SourceStrip({
  forecast,
  train,
  now,
  lost,
  feedMessage,
  scenarioTitle,
}: {
  forecast: Forecast;
  train: TrainCandidate | null;
  now: number;
  lost: boolean;
  feedMessage: string;
  scenarioTitle: string | null;
}) {
  const c = useColors();
  const sim = forecast.source === 'simulation';
  const fixture = !sim && train?.origin === 'fixture';
  // Fixture trains are never labeled as live observations.
  const src = fixture ? { label: '예시 데이터 · 실제 관측 아님', tone: 'warn' as const } : sourceLabel(forecast);
  const t = useTone(src.tone);
  const fresh = train && !sim && !fixture ? candidateFreshness(train, now) : null;

  return (
    <View style={[styles.strip, { backgroundColor: c.background, borderBottomColor: c.border }]}>
      <View
        testID={sim ? 'source-simulation' : fixture ? 'source-fixture' : 'source-live'}
        accessibilityRole="summary"
        accessibilityLabel={`데이터 출처: ${src.label}`}
        style={[styles.sourcePill, { backgroundColor: t.bg, borderColor: t.fg + '55' }]}
      >
        <Feather name={sim ? 'cpu' : fixture ? 'file-text' : 'radio'} size={14} color={t.fg} />
        <Text style={[styles.sourceText, { color: t.fg }]}>{src.label}</Text>
      </View>
      <Text style={[styles.identity, { color: c.mutedForeground }]} numberOfLines={1}>
        {sim
          ? `${scenarioTitle ?? '시뮬레이션'} · 실제 열차와 무관`
          : train
            ? `${train.id}열차 · ${stateSentence(train)} · ${train.destination}행 · ${train.direction}`
            : feedMessage}
      </Text>
      {fresh || lost ? (
        <View style={styles.stripBadges}>
          {fresh ? <Badge label={fresh.label} tone={fresh.tone} dot /> : null}
          {lost ? <Badge label="피드에서 사라짐 · 마지막 관측 표시" tone="danger" icon="alert-triangle" /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The core message: sway side first, then timing, then confidence. */
function SwayHero({ forecast, phase, reducedMotion }: { forecast: Forecast; phase: RidePhase; reducedMotion: boolean }) {
  const c = useColors();
  const lean = leanDegrees(forecast.sway, forecast.lateralAccelMs2);
  const conf = confidenceBadge(forecast.confidence);
  const active = phase !== 'suppressed';
  const side = SIDE_KO[forecast.sway];
  const eta = forecast.etaWindowS;
  const quiet = suppressCopy(forecast.suppressReason ?? (forecast.state === 'active' ? 'no-curve-ahead' : null));
  const sim = forecast.source === 'simulation';
  // The service's own last reason line is the most specific detail (e.g. "곡선 구간을 통과 중입니다").
  const reasonLine = [...forecast.explanationKo].reverse().find((l) => !l.startsWith('['));
  const quietDetail =
    reasonLine && quiet.detail === '안내 일시중지' ? `안내 일시중지 · ${reasonLine}` : (reasonLine ?? quiet.detail);

  const a11y = active
    ? `${eta ? etaPhrase(eta) : '곧'} ${side}으로 쏠림. ${conf.label}.`
    : `${quiet.title}. ${quietDetail}`;

  return (
    <View
      testID={`hero-${phase}`}
      accessible
      accessibilityLabel={a11y}
      accessibilityLiveRegion="polite"
      style={[
        styles.hero,
        {
          backgroundColor: phase === 'now' ? c.warnSoft : c.card,
          borderColor: active ? c.warn : c.border,
          borderStyle: sim && !active ? 'dashed' : 'solid',
        },
      ]}
    >
      {active ? (
        <View style={styles.heroHead}>
          <Text style={[styles.kicker, { color: c.warn }]}>{phase === 'now' ? '지금 · 손잡이를 잡으세요' : '곧 곡선 진입'}</Text>
          <Text style={[styles.sway, { color: c.foreground }]}>
            <Text style={{ color: c.warn }}>{side}</Text>으로 쏠림
          </Text>
          {eta ? (
            <Text style={[styles.eta, { color: c.foreground }]}>{etaPhrase(eta)}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.heroHead}>
          <View style={styles.quietRow}>
            <Feather name={quiet.icon} size={16} color={c.mutedForeground} />
            <Text style={[styles.kicker, { color: c.mutedForeground }]}>안내 대기</Text>
          </View>
          <Text style={[styles.quietTitle, { color: c.foreground }]}>{quiet.title}</Text>
          {quietDetail ? (
            <Text style={[styles.quietDetail, { color: c.mutedForeground }]} numberOfLines={2}>
              {quietDetail}
            </Text>
          ) : null}
        </View>
      )}

      <SwayFigure lean={lean} sway={forecast.sway} phase={phase} reducedMotion={reducedMotion} />

      {active && eta ? <EtaBand eta={eta} reducedMotion={reducedMotion} /> : null}

      <View style={styles.heroFoot}>
        <Badge label={conf.label} tone={conf.tone} icon="bar-chart-2" />
        {active && forecast.lateralAccelMs2 ? (
          <Badge
            label={`${forecast.lateralAccelMs2.min.toFixed(2)}–${forecast.lateralAccelMs2.max.toFixed(2)} m/s²`}
            tone="muted"
          />
        ) : null}
        {active && forecast.targetCurve ? (
          <Badge label={`${TURN_KO[forecast.targetCurve.turn]} R${Math.round(forecast.targetCurve.radiusM)}`} tone="muted" />
        ) : null}
      </View>
    </View>
  );
}

function GuidanceRow({ guidance }: { guidance: GuidanceState }) {
  const c = useColors();
  const status = !guidance.available
    ? '이 기기 또는 설정에서 사용할 수 없어요'
    : !guidance.enabled
      ? '꺼짐 · 화면으로만 안내'
      : guidance.lastEvent
        ? `“${guidance.lastEvent.textKo}”`
        : '곡선이 다가오면 말과 진동으로 알려드려요';
  return (
    <View style={[styles.card, styles.guidance, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.guideIcon, { backgroundColor: c.raised }]}>
        <Feather name={guidance.enabled ? 'volume-2' : 'volume-x'} size={18} color={guidance.enabled ? c.foreground : c.faint} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.guideTitle, { color: c.foreground }]}>음성·진동 안내</Text>
        <Text style={[styles.guideStatus, { color: c.mutedForeground }]} numberOfLines={2}>
          {status}
        </Text>
      </View>
      {guidance.available ? (
        <TogglePill testID="guidance-toggle" label="안내" icon="bell" value={guidance.enabled} onChange={guidance.setEnabled} />
      ) : (
        <Badge label="사용 불가" tone="muted" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingTop: 0 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  centerTitle: { fontSize: 18, fontWeight: '800', marginTop: 8 },
  centerBody: { fontSize: 14, textAlign: 'center' },
  strip: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 6, borderBottomWidth: 1 },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 30,
  },
  sourceText: { fontSize: 13, fontWeight: '800' },
  identity: { fontSize: 14, fontWeight: '600' },
  stripBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  hero: { borderWidth: 1.5, borderRadius: 22, padding: 18, gap: 14 },
  heroHead: { gap: 4 },
  kicker: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  sway: { fontSize: 34, lineHeight: 42, fontWeight: '900' },
  eta: { fontSize: 24, lineHeight: 30, fontFamily: typography.numBold, fontVariant: ['tabular-nums'] },
  quietRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quietTitle: { fontSize: 26, lineHeight: 34, fontWeight: '800' },
  quietDetail: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  heroFoot: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  guidance: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  guideIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  guideTitle: { fontSize: 15, fontWeight: '800' },
  guideStatus: { fontSize: 13, lineHeight: 18 },
  footnote: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: spacing.md },
});
