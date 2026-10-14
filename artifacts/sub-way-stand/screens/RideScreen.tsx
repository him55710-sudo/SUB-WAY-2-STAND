/** Motion Live: source, direction, timing, then the evidence behind the prediction. */
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { FLAGS } from '@/config/flags';
import type { Forecast, GuidanceState } from '@/contracts';
import { typography } from '@/constants/colors';
import { lineInfo } from '@/constants/lines';
import { useColors } from '@/hooks/useColors';
import { useRideSession } from '@/session/RideSession';
import { useForecast } from '@/services/forecast';
import { useGuidance } from '@/services/guidance';
import { usePhoneMotion, useSensorGate } from '@/services/motionSensor';
import { DEFAULT_SCENARIO_ID, getSimulationRide } from '@/services/simulation';
import { useTrackedTrain } from '@/services/trains';
import { simState } from '@/lib/simulationRide';
import { planLine2Journey } from '@/lib/journeyPlanner';
import { ExplanationCard } from '@/components/ExplanationCard';
import { RouteStrip, routeStripData } from '@/components/RouteStrip';
import { SwayFigure } from '@/components/SwayFigure';
import { candidateFreshness } from '@/components/TrainCard';
import { Button, DarkScreenChrome, TogglePill, useScreenInsets, useTicker } from '@/components/ui';
import { SIDE_KO, confidenceBadge, etaSecondBounds, leanDegrees, rideFeedBadge, stateSentence, suppressCopy } from '@/components/uiModel';

export default function RideScreen() {
  const c = useColors();
  const { top, bottom } = useScreenInsets();
  const reduced = useReducedMotion();
  const now = useTicker(1000);
  const { selection, select } = useRideSession();
  const params = useLocalSearchParams<{ sim?: string; from?: string; to?: string; direction?: string }>();
  const journeyOptions = params.from && params.to ? planLine2Journey(params.from, params.to) : null;
  const plannedJourney = journeyOptions ? params.direction === journeyOptions.alternative.directionCode ? journeyOptions.alternative : journeyOptions.recommended : null;
  const [pausedSnapshot, setPausedSnapshot] = useState<Forecast | null>(null);
  const live = selection?.kind === 'live' ? selection : null;
  const tracked = useTrackedTrain(live?.line ?? 0, live?.trainId ?? null);
  const baseForecast = useForecast(selection);
  const motion = usePhoneMotion({ enabled: !!live });
  const { forecast: gatedForecast } = useSensorGate(baseForecast, motion.sensor, tracked.train ?? live?.initial ?? null);
  const forecast = pausedSnapshot ?? gatedForecast;
  const paused = pausedSnapshot !== null;
  const guidance = useGuidance(paused ? { ...forecast, state: 'suppressed', sway: 'none', etaWindowS: null, lateralAccelMs2: null, suppressReason: 'stationary' } : forecast);
  const wantsSim = params.sim === '1' && FLAGS.simulationFallback;
  useEffect(() => {
    if (!selection && wantsSim) select({ kind: 'simulation', scenarioId: DEFAULT_SCENARIO_ID, selectedAt: new Date().toISOString() });
  }, [selection, wantsSim, select]);

  if (!selection) return (
    <View style={[styles.center, { backgroundColor: c.background }]}><DarkScreenChrome /><Feather name="navigation" size={28} color={c.faint} /><Text style={[styles.centerTitle, { color: c.foreground }]}>먼저 열차를 선택해 주세요</Text><Text style={[styles.centerBody, { color: c.mutedForeground }]}>시뮬레이션으로도 움직임 안내를 체험할 수 있어요.</Text><Button label="열차 선택으로" icon="arrow-left" variant="ghost" onPress={() => router.replace('/')} style={{ alignSelf: 'stretch', marginTop: 16 }} /></View>
  );

  const train = tracked.train ?? live?.initial ?? null;
  const sim = selection.kind === 'simulation';
  const info = lineInfo(sim ? 2 : selection.line);
  const ride = sim ? getSimulationRide(selection.scenarioId) : null;
  const st = ride ? simState(ride, Math.max(0, (Date.parse(forecast.computedAt) - Date.parse(selection.selectedAt)) / 1000)) : null;
  const strip = routeStripData(selection, forecast, train);
  const feedState = !sim && !tracked.isLoading ? rideFeedBadge(tracked.feed, FLAGS.liveTrains) : null;
  const fixture = !sim && train?.origin === 'fixture';
  const fresh = train && !sim ? candidateFreshness(train, now) : null;
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const replay = () => { setPausedSnapshot(null); if (selection.kind === 'simulation') select({ ...selection, selectedAt: new Date().toISOString() }); };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <DarkScreenChrome />
      <ScrollView style={styles.frame} contentContainerStyle={[styles.scroll, { paddingTop: top + 8, paddingBottom: bottom + 32 }]}>
        <View style={styles.topbar}>
          <Pressable testID="back" accessibilityRole="button" accessibilityLabel="열차 선택으로 돌아가기" onPress={back} style={({ pressed }) => [styles.back, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}><Feather name="arrow-left" size={20} color={c.foreground} /></Pressable>
          <View style={{ flex: 1, gap: 4 }}><Text style={[styles.wordmark, { color: c.mutedForeground }]}>MOTION LIVE</Text><Text style={[styles.topTitle, { color: c.foreground }]}>{sim ? '움직임 미리보기' : `${info.name} 탑승 안내`}</Text></View>
          <View style={[styles.lineBadge, { backgroundColor: info.color }]}><Text style={[styles.lineNumber, { color: info.onColor }]}>{info.n}</Text></View>
        </View>

        <View style={[styles.source, { borderBottomColor: c.border }]}>
          <View testID={sim ? 'source-simulation' : fixture ? 'source-fixture' : 'source-live'} style={styles.sourceTop} accessibilityLabel={`데이터 출처 ${sim ? '시뮬레이션 실제 열차와 무관' : fixture ? '예시 데이터 실제 관측 아님' : '실시간 역 단위 관측'}`}>
            <Text style={[styles.sourceTag, { color: sim ? c.synthetic : fixture ? c.mutedForeground : c.live }]}>{sim ? '◆ SIMULATION' : fixture ? '◇ EXAMPLE' : '● LIVE'}</Text>
            <Text style={[styles.sourceDetail, { color: c.mutedForeground }]}>{sim ? '실제 열차와 무관한 가상 주행' : fixture ? '실제 관측 아님' : '역 단위 실시간 관측'}</Text>
          </View>
          <Text style={[styles.identity, { color: c.foreground }]}>{sim ? `${forecast.segment?.from ?? '가상 A역'} → ${forecast.segment?.to ?? '가상 B역'}` : train ? `${train.station} → ${train.destination}` : '열차 정보를 확인하고 있어요'}</Text>
          {!sim && train ? <Text style={[styles.sourceMeta, { color: c.mutedForeground }]}>{train.id}열차 · {train.direction} · {stateSentence(train)}{fresh ? ` · ${fresh.label}` : ''}</Text> : null}
          {feedState || tracked.lost && !sim ? <View style={styles.feedIssue}><Feather name="info" size={12} color={c.mutedForeground} /><Text style={[styles.sourceMeta, { color: c.mutedForeground }]}>{tracked.lost ? '열차의 마지막 관측을 표시하고 있어요.' : feedState?.title}</Text></View> : null}
        </View>

        {plannedJourney ? <View style={{ paddingVertical: 18, gap: 8, borderBottomWidth: 1, borderColor: c.border }}><Text style={{ color: c.signal, fontWeight: '800', fontSize: 18 }}>{plannedJourney.from} → {plannedJourney.to}</Text><Text style={{ color: c.foreground }}>{plannedJourney.nextStation} 방면 {plannedJourney.directionLabel} · {plannedJourney.stopCount}개 역 후 {plannedJourney.to}에서 하차</Text><Text style={{ color: c.mutedForeground, fontSize: 12, lineHeight: 20 }}>{plannedJourney.stations.join(' → ')}</Text></View> : null}
        <SwayHero forecast={forecast} paused={paused} reducedMotion={reduced} />

        <View style={[styles.metrics, { borderTopColor: c.border, borderBottomColor: c.border }]}>
          <Metric label={sim ? '가상 속도' : '현재 속도'} value={st ? Math.round(st.speedMs * 3.6).toString() : '—'} unit="km/h" />
          <Metric label="다음 곡선 반경" value={forecast.targetCurve ? Math.round(forecast.targetCurve.radiusM).toString() : '—'} unit="m" />
          <Metric label="예상 횡가속도" value={forecast.lateralAccelMs2 ? ((forecast.lateralAccelMs2.min + forecast.lateralAccelMs2.max) / 2).toFixed(2) : '—'} unit="m/s²" />
        </View>

        <View style={styles.routeSection}><RouteStrip data={strip} reducedMotion={reduced || paused} /></View>
        <View style={[styles.controls, { borderTopColor: c.border }]}>
          <View style={styles.controlHeader}><Text style={[styles.sectionTitle, { color: c.foreground }]}>이동 중 안내</Text><Text style={[styles.controlHint, { color: c.faint }]}>{guidance.available ? 'KOREAN VOICE' : '화면 안내 사용 중'}</Text></View>
          <GuidanceRow guidance={guidance} paused={paused} />
          {guidance.available ? <Pressable testID="voice-test" accessibilityRole="button" accessibilityLabel="한국어 음성 안내 테스트" onPress={() => { Speech.stop().catch(() => {}); Speech.speak('음성 안내 테스트입니다. 지지물을 안정적으로 잡고, 주변을 확인하세요.', { language: 'ko-KR', rate: 0.95 }); }} style={({ pressed }) => [styles.voiceTest, { opacity: pressed ? 0.6 : 1 }]}><Feather name="volume-2" size={14} color={c.mutedForeground} /><Text style={[styles.sourceMeta, { color: c.mutedForeground }]}>음성 테스트</Text><Feather name="play" size={11} color={c.faint} /></Pressable> : null}
          {sim ? <View style={styles.playback}><Button testID="simulation-pause" label={paused ? '처음부터 다시 재생' : '시연 일시정지'} icon={paused ? 'play' : 'pause'} variant="ghost" onPress={() => paused ? replay() : setPausedSnapshot(forecast)} style={{ flex: 1 }} />{!paused ? <Pressable testID="simulation-restart" accessibilityRole="button" accessibilityLabel="시뮬레이션 처음부터 재생" onPress={replay} style={[styles.restart, { borderColor: c.border }]}><Feather name="rotate-ccw" size={18} color={c.mutedForeground} /></Pressable> : null}</View> : <View style={styles.sensor}><Button testID="motion-permission" label={motion.enabled ? '동작 센서 끄기' : '동작 센서 켜기'} variant="ghost" icon="activity" onPress={() => motion.enabled ? motion.disable() : void motion.requestPermission()} /><Text style={[styles.sourceMeta, { color: c.faint }]}>{motion.messageKo}</Text></View>}
        </View>
        <ExplanationCard forecast={forecast} reducedMotion={reduced} />
        <Text style={[styles.footnote, { color: c.faint }]}>{sim ? '합성 시연은 정차 · 가속 · 곡선 · 감속을 반복합니다.\n실제 열차의 운행 또는 안전을 보장하는 정보가 아닙니다.' : '관측 정보만으로 정확한 곡선 진입 시점을 알 수 없으면\n방향 안내를 보류합니다. 주변 상황을 먼저 확인하세요.'}</Text>
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  const c = useColors();
  return <View style={styles.metric}><Text style={[styles.metricLabel, { color: c.faint }]}>{label}</Text><Text style={[styles.metricValue, { color: c.foreground }]}>{value}<Text style={[styles.metricUnit, { color: c.mutedForeground }]}> {unit}</Text></Text></View>;
}

function SwayHero({ forecast, paused, reducedMotion }: { forecast: Forecast; paused: boolean; reducedMotion: boolean }) {
  const c = useColors();
  const eta = forecast.etaWindowS;
  const eligible = !paused && forecast.state === 'active' && forecast.sway !== 'none';
  const active = eligible && !!eta && eta.min <= 12;
  const now = active && !!eta && eta.max <= 0;
  const hold = !paused && !active && forecast.source !== 'simulation';
  const quiet = suppressCopy(forecast.suppressReason);
  const side = SIDE_KO[forecast.sway];
  const confidence = confidenceBadge(forecast.confidence);
  const magnitude = forecast.lateralAccelMs2 ? (forecast.lateralAccelMs2.min + forecast.lateralAccelMs2.max) / 2 : 0;
  const intensity = magnitude >= 0.65 ? 3 : magnitude >= 0.3 ? 2 : 1;
  const etaSeconds = eta ? etaSecondBounds(eta) : null;
  const etaText = etaSeconds ? etaSeconds.min === etaSeconds.max ? `${etaSeconds.min}` : `${etaSeconds.min}–${etaSeconds.max}` : '';
  const reasonLine = [...forecast.explanationKo].reverse().find((line) => !line.startsWith('['));
  const title = paused ? '시연이 멈췄어요' : hold ? '예측 보류' : forecast.suppressReason === 'stationary' ? '정차 중 · 안내 대기' : '직선 구간 · 쏠림 없음';
  const detail = paused ? '음성 안내가 중지되었습니다. 처음부터 다시 재생할 수 있어요.' : eligible && eta ? `다음 곡선까지 약 ${etaText}초` : reasonLine ?? quiet.detail;
  return (
    <View testID={paused ? 'hero-paused' : active ? now ? 'hero-now' : 'hero-approach' : 'hero-suppressed'} style={styles.hero}>
      <View style={styles.heroKicker}><Text style={[styles.kicker, { color: active ? c.signal : c.mutedForeground }]}>{paused ? 'Ⅱ PAUSED' : active ? now ? '● IN CURVE' : '↗ UPCOMING MOTION' : hold ? '◌ PREDICTION HOLD' : '○ ALL QUIET'}</Text><Text style={[styles.travelFrame, { color: c.faint }]}>진행 방향 기준</Text></View>
      <View style={styles.heroMessage} accessibilityLiveRegion="polite">
        {active ? <Animated.View key={`${forecast.targetCurve?.id}-${now ? 'now' : 'soon'}`} entering={reducedMotion ? undefined : FadeIn.duration(240)} style={styles.event}>
          <View style={styles.directionRow}><Text style={[styles.direction, { color: c.signal }]}>{side}</Text><Feather name={forecast.sway === 'left' ? 'arrow-left' : 'arrow-right'} size={42} color={c.signal} /></View>
          {now ? <Text style={[styles.inCurve, { color: c.foreground }]}>곡선 통과 중 · 쏠리는 중</Text> : <Text style={[styles.countdown, { color: c.signal }]}>{etaText}<Text style={[styles.countdownUnit, { color: c.mutedForeground }]}> 초 후</Text></Text>}
          <View style={styles.intensity}><View style={styles.segments}>{[1, 2, 3].map((i) => <View key={i} style={[styles.segment, { backgroundColor: i <= intensity ? c.foreground : c.border }]} />)}</View><Text style={[styles.intensityText, { color: c.mutedForeground }]}>쏠림 {intensity === 3 ? '강함' : intensity === 2 ? '보통' : '약함'} · {confidence.label}</Text></View>
          <Text style={[styles.safety, { color: c.mutedForeground }]}>지지물을 안정적으로 잡고, 주변을 확인하세요.</Text>
        </Animated.View> : <View style={styles.quiet}><Text style={[styles.quietTitle, { color: c.foreground }]}>{title}</Text><Text style={[styles.quietDetail, { color: c.mutedForeground }]}>{detail}</Text>{hold ? <Text style={[styles.holdNote, { color: c.faint }]}>관측은 실시간으로 · 방향 안내는 확실할 때만</Text> : null}</View>}
      </View>
      <SwayFigure lean={leanDegrees(active ? forecast.sway : 'none', active ? forecast.lateralAccelMs2 : null)} sway={active ? forecast.sway : 'none'} phase={active ? now ? 'now' : 'approach' : 'suppressed'} acceleration={active ? forecast.lateralAccelMs2 : null} reducedMotion={reducedMotion} />
    </View>
  );
}

function GuidanceRow({ guidance, paused }: { guidance: GuidanceState; paused: boolean }) {
  const c = useColors();
  return <View style={styles.guidance}><View style={{ flex: 1, gap: 6 }}><Text style={[styles.guideTitle, { color: c.foreground }]}>음성 안내</Text><Text style={[styles.guideStatus, { color: c.mutedForeground }]}>{paused ? '시연을 재생하면 안내가 이어집니다.' : !guidance.available ? '기기에서 한국어 음성을 사용할 수 없어요.' : guidance.enabled ? '다가오는 움직임을 한국어로 알려드려요.' : '화면으로 움직임을 확인하세요.'}</Text></View>{guidance.available ? <TogglePill testID="guidance-toggle" label="음성" icon="volume-2" value={guidance.enabled} onChange={guidance.setEnabled} /> : <Feather name="volume-x" size={20} color={c.faint} />}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, frame: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }, scroll: { paddingHorizontal: 24 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }, centerTitle: { fontSize: 22, fontWeight: '800' }, centerBody: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 26 }, back: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, wordmark: { fontSize: 9, fontFamily: typography.numBold, letterSpacing: 2 }, topTitle: { fontSize: 18, fontWeight: '800' }, lineBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, lineNumber: { fontSize: 20, fontFamily: typography.numBold },
  source: { gap: 12, paddingBottom: 24, borderBottomWidth: 1 }, sourceTop: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, sourceTag: { fontSize: 10, fontFamily: typography.numBold, letterSpacing: 1.2 }, sourceDetail: { fontSize: 11 }, identity: { fontSize: 26, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 }, sourceMeta: { fontSize: 11, lineHeight: 18 }, feedIssue: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  hero: { paddingTop: 28, paddingBottom: 10 }, heroKicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, kicker: { fontSize: 9, fontFamily: typography.numBold, letterSpacing: 1.3 }, travelFrame: { fontSize: 10 }, heroMessage: { minHeight: 240, justifyContent: 'center', paddingVertical: 22 }, event: { gap: 12 }, directionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, direction: { fontSize: 62, lineHeight: 72, fontWeight: '800', letterSpacing: -2 }, countdown: { fontSize: 48, lineHeight: 56, fontFamily: typography.numBold, fontVariant: ['tabular-nums'], letterSpacing: -1.5 }, countdownUnit: { fontSize: 18, fontWeight: '500', letterSpacing: -0.3 }, inCurve: { fontSize: 22, lineHeight: 30, fontWeight: '700' }, intensity: { flexDirection: 'row', alignItems: 'center', gap: 10 }, segments: { flexDirection: 'row', gap: 3 }, segment: { width: 5, height: 16, borderRadius: 1 }, intensityText: { fontSize: 12 }, safety: { fontSize: 12, lineHeight: 20 }, quiet: { gap: 14 }, quietTitle: { fontSize: 27, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 }, quietDetail: { fontSize: 15, lineHeight: 24 }, holdNote: { fontSize: 11, lineHeight: 20 },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 24, gap: 8 }, metric: { flex: 1, gap: 8, minWidth: 0 }, metricLabel: { fontSize: 10 }, metricValue: { fontSize: 23, fontFamily: typography.num, fontVariant: ['tabular-nums'], letterSpacing: -0.8 }, metricUnit: { fontSize: 9, letterSpacing: 0 }, routeSection: { paddingVertical: 28 },
  controls: { borderTopWidth: 1, paddingTop: 24, paddingBottom: 24, gap: 20 }, controlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { fontSize: 17, fontWeight: '800' }, controlHint: { fontSize: 8, fontFamily: typography.num, letterSpacing: 1 }, guidance: { flexDirection: 'row', alignItems: 'center', gap: 12 }, guideTitle: { fontSize: 14, fontWeight: '700' }, guideStatus: { fontSize: 11, lineHeight: 18 }, voiceTest: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center' }, playback: { flexDirection: 'row', gap: 10 }, restart: { width: 52, height: 52, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, sensor: { gap: 8 }, footnote: { marginTop: 24, fontSize: 11, lineHeight: 19, textAlign: 'center' },
});

