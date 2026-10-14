import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Forecast } from '@/contracts';
import { typography } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { CURVE_SOURCE_KO, TURN_KO, etaPhrase } from './uiModel';

const f2 = (n: number) => n.toFixed(2);

function Fact({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={[styles.fact, { borderColor: c.border }]}>
      <Text style={[styles.factLabel, { color: c.faint }]}>{label}</Text>
      <Text style={[styles.factValue, { color: c.foreground }]}>{value}</Text>
    </View>
  );
}

/** Expandable "왜 이렇게 예측했나요?" card: explanation lines plus the numbers behind them. */
export function ExplanationCard({ forecast, reducedMotion }: { forecast: Forecast; reducedMotion: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const rot = useSharedValue(0);

  useEffect(() => {
    rot.set(reducedMotion ? (open ? 180 : 0) : withTiming(open ? 180 : 0, { duration: 200 }));
  }, [open, reducedMotion, rot]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));

  const curve = forecast.targetCurve;
  const pos = forecast.positionM;
  const facts: { label: string; value: string }[] = [];
  if (curve) {
    facts.push({ label: '다음 곡선', value: `${TURN_KO[curve.turn]} R${Math.round(curve.radiusM)} · ${Math.round(curve.lengthM)} m` });
    facts.push({ label: '곡선 자료', value: CURVE_SOURCE_KO[curve.source] });
  }
  if (forecast.lateralAccelMs2) {
    facts.push({ label: '횡가속도', value: `${f2(forecast.lateralAccelMs2.min)}–${f2(forecast.lateralAccelMs2.max)} m/s²` });
  }
  if (forecast.etaWindowS) facts.push({ label: '곡선 진입', value: etaPhrase(forecast.etaWindowS) });
  if (pos) facts.push({ label: '위치 불확실성', value: `±${Math.round(Math.abs(pos.max - pos.min) / 2)} m` });

  return (
    <View style={[styles.card, { borderColor: c.border }]}>
      <Pressable
        testID="explain-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="왜 이렇게 예측했나요?"
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={styles.qIcon}>
          <Feather name="help-circle" size={18} color={c.foreground} />
        </View>
        <Text style={[styles.title, { color: c.foreground }]}>왜 이렇게 예측했나요?</Text>
        <Animated.View style={chevron}>
          <Feather name="chevron-down" size={22} color={c.mutedForeground} />
        </Animated.View>
      </Pressable>

      {open ? (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(220)} style={styles.body}>
          {forecast.explanationKo.map((line, i) => (
            <View key={`${i}-${line}`} style={styles.bullet}>
              <View style={[styles.dot, { backgroundColor: c.mutedForeground }]} />
              <Text style={[styles.line, { color: c.foreground }]}>{line}</Text>
            </View>
          ))}

          {facts.length > 0 ? (
            <View style={styles.facts}>
              {facts.map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} />
              ))}
            </View>
          ) : null}

          <View style={[styles.formula, { borderColor: c.border }]}>
            <Text style={[styles.formulaText, { color: c.mutedForeground }]}>
              원리: 속도·곡률·선로 기울기를 함께 반영합니다 (a = v²κ cosθ − g sinθ).
              평탄한 선로에서는 곡선 바깥쪽으로 밀리지만, 기울기와 저속 주행에 따라 방향이 바뀔 수 있어요.
            </Text>
            <Text style={[styles.formulaText, { color: c.faint }]}>
              {forecast.source === 'simulation'
                ? '이 화면은 가상 선로 시뮬레이션입니다. 실제 열차와 무관합니다.'
                : '실시간 피드는 역 단위 상태만 제공하므로 역 사이 위치·속도는 범위로 추정하며, 확신이 낮으면 안내하지 않습니다.'}
            </Text>
          </View>
        </Animated.View>
      ) : null}
      <Pressable testID="ride-open-evidence" accessibilityRole="button" accessibilityLabel="물리 모델 검증 결과와 연구 근거 보기" onPress={() => router.push('/evidence')} style={({ pressed }) => [styles.evidenceLink, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
        <Feather name="file-text" size={17} color={c.mutedForeground} />
        <View style={{ flex: 1, gap: 4 }}><Text style={[styles.evidenceTitle, { color: c.foreground }]}>계산은 검증했어요. 실제 운행 실측은 아직이에요.</Text><Text style={[styles.formulaText, { color: c.mutedForeground }]}>검증 수치 · 모델의 가정과 한계 · 연구 원문 보기</Text></View>
        <Feather name="arrow-up-right" size={18} color={c.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderTopWidth: 1, paddingVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  qIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '800' },
  body: { gap: 10, paddingBottom: 14 },
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  line: { flex: 1, fontSize: 14, lineHeight: 21 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexGrow: 1, flexBasis: '46%', borderLeftWidth: 1, padding: 10, gap: 3 },
  factLabel: { fontSize: 11, fontWeight: '700' },
  factValue: { fontSize: 14, fontFamily: typography.num, fontVariant: ['tabular-nums'] },
  formula: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  formulaText: { fontSize: 12, lineHeight: 18 },
  evidenceLink: { borderTopWidth: 1, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  evidenceTitle: { fontSize: 13, lineHeight: 21, fontWeight: '600' },
});
