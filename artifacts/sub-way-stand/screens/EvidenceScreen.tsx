import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { typography } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { DarkScreenChrome, useScreenInsets } from '@/components/ui';
import validation from '@/docs/physics-validation-results.json';

const QUESTIONS = [
  { title: '쏠림 방향은 어떻게 계산하나요?', body: '속도, 곡선 반경, 선로 기울기(캔트)를 함께 계산합니다. 평탄한 선로에서는 곡선 바깥쪽으로 밀리지만, 기울어진 선로를 천천히 달리면 방향이 바뀔 수 있어요. 곡선 진입부터 이탈까지 방향이 일치할 때만 안내합니다.', formula: 'a = v²κ cosθ − g sinθ', note: 'v: 속도 · κ: 방향을 포함한 곡률(±1/R) · θ: 선로 기울기' },
  { title: '어떤 경우에 안내를 보류하나요?', body: '검증된 선로·캔트가 없거나, 관측이 오래됐거나, 정차·지연 때문에 진입 시각을 판단하기 어려우면 안내를 보류합니다. 지도에 선로가 표시된다는 사실만으로 방향을 확정하지 않아요. 시뮬레이션에서 캔트를 모를 때는 0을 가정했다고 표시합니다.' },
  { title: '검증 수치는 무엇을 의미하나요?', body: '합성 조건에서 계산 결과를 독립적인 힘 벡터 해석식과 비교한 수치입니다. 저크는 가감속·곡률·캔트 변화까지 포함해 수치 미분과 비교했습니다. 아래 오차는 소프트웨어 계산 오차이며, 실제 열차의 예측 오차가 아니에요.' },
  { title: '신뢰도와 강도는 안전 점수인가요?', body: '아니요. 신뢰도는 자료와 예측 범위에 따른 앱의 판단이며, 성공 확률이나 95% 신뢰구간이 아닙니다. 쏠림 강도와 0.15 m/s² 안내 표시 기준도 인체의 안전·낙상·체감 임계값이 아니에요.' },
  { title: '아직 검증하지 않은 것은 무엇인가요?', body: '실제 서울 지하철에서의 방향·진입 시각 정확도와 낙상 예방 효과는 아직 측정하지 않았습니다. 현장 검증에는 실제 선로·캔트, 동기화된 속도·위치, 고정 장착한 보정 센서와 독립 평가 주행이 필요합니다. 인체의 균형 반응, 차체 현가장치, 혼잡도도 현재 모델에 포함되지 않아요.' },
];

const PAPERS = [
  { title: '스마트폰으로 철도 가속도를 측정할 수 있을까요?', authors: 'Urbaniak 외 · 2025 · Sensors', detail: '철도 가속도 측정의 가능성을 다룬 연구입니다. 기기·장착 위치 차이와 기준 센서 보정이 필요하며, 이 앱의 실측 정확도를 입증한 연구는 아닙니다.', url: 'https://doi.org/10.3390/s25154635' },
  { title: '가속도 변화는 서 있는 승객에게 어떤 영향을 줄까요?', authors: 'Krašna 외 · 2021 · Frontiers in Bioengineering and Biotechnology', detail: '24명 대상 버스 종방향 교란 연구입니다. 가속도·저크·지속 시간에 따른 반응을 다루며, 그 수치를 지하철 횡방향 안전 기준으로 적용하지 않았습니다.', url: 'https://doi.org/10.3389/fbioe.2021.680883' },
  { title: '철도 곡선과 캔트의 물리적 관계', authors: 'Persson · 2008 · KTH 학위논문', detail: '선로면 횡가속도와 캔트의 좌표 변환을 확인하는 이론적 근거입니다.', url: 'https://kth.diva-portal.org/smash/get/diva2:13865/FULLTEXT01.pdf' },
];

export default function EvidenceScreen() {
  const c = useColors();
  const { top, bottom } = useScreenInsets();
  const [expanded, setExpanded] = useState<number | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const openPaper = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert('논문을 열지 못했어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'));
  };
  const date = new Date(validation.generatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  const metrics = [
    { label: '횡가속도 해석식 비교', count: validation.acceleration.after.samples, detail: `최대 계산 오차 ${validation.acceleration.after.maxAbsoluteError.toExponential(2)} m/s²`, passed: validation.acceleration.after.maxAbsoluteError < validation.acceleration.tolerance },
    { label: '가감속·전이 저크 비교', count: validation.jerk.fullDerivative.samples, detail: `최대 계산 오차 ${validation.jerk.fullDerivative.maxAbsoluteError.toExponential(2)} m/s³`, passed: validation.jerk.fullDerivative.maxAbsoluteError < validation.jerk.tolerance },
    { label: '가속도 범위 포함 검사', count: validation.accelerationIntervals.samples, detail: `계산 범위 밖 사례 ${validation.accelerationIntervals.violations}건`, passed: validation.accelerationIntervals.violations === 0 },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <DarkScreenChrome />
      <ScrollView testID="evidence-screen" style={styles.frame} contentContainerStyle={[styles.content, { paddingTop: top + 8, paddingBottom: bottom + 36 }]}>
        <View style={styles.topbar}>
          <Pressable testID="evidence-back" accessibilityRole="button" accessibilityLabel="이전 화면으로 돌아가기" onPress={back} style={({ pressed }) => [styles.back, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}><Feather name="arrow-left" size={20} color={c.foreground} /></Pressable>
          <View style={styles.topText}><Text style={[styles.kicker, { color: c.mutedForeground }]}>MODEL & EVIDENCE</Text><Text style={[styles.topTitle, { color: c.foreground }]}>검증과 연구 근거</Text></View>
        </View>

        <Text accessibilityRole="header" style={[styles.title, { color: c.foreground }]}>{'확인한 것과,\n아직 모르는 것.'}</Text>
        <Text style={[styles.intro, { color: c.mutedForeground }]}>안내가 어떤 계산과 가정에서 나오는지, 어디까지 확인했는지 공개합니다.</Text>
        <View testID="validation-scope" style={[styles.scope, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.status}><Feather name="check-circle" size={18} color={c.foreground} /><Text style={[styles.statusText, { color: c.foreground }]}>해석·합성 조건의 계산 검증 완료</Text></View>
          <View style={styles.status}><Feather name="clock" size={18} color={c.mutedForeground} /><Text style={[styles.statusText, { color: c.mutedForeground }]}>실제 열차 예측 정확도·예방 효과 미측정</Text></View>
          <Text style={[styles.scopeNote, { color: c.mutedForeground }]}>계산 검증을 실제 운행의 정확도나 안전 보장으로 해석하지 않습니다.</Text>
        </View>

        <View style={styles.sectionHead}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.foreground }]}>계산을 어떻게 확인했나요?</Text><Text style={[styles.caption, { color: c.mutedForeground }]}>{date} 기준 · 앱에 저장된 검증 결과</Text></View>
        {metrics.map((metric) => (
          <View key={metric.label} style={[styles.metric, { borderColor: c.border }]}>
            <View style={styles.metricTop}><Text style={[styles.metricLabel, { color: c.foreground }]}>{metric.label}</Text><Text style={[styles.caption, { color: metric.passed ? c.mutedForeground : c.destructive }]}>{metric.passed ? '기준 통과' : '재검증 필요'}</Text></View>
            <Text style={[styles.number, { color: c.foreground }]}>{metric.count.toLocaleString('ko-KR')}<Text style={[styles.numberUnit, { color: c.mutedForeground }]}>개 합성 사례</Text></Text>
            <Text style={[styles.caption, { color: c.mutedForeground }]}>{metric.detail}</Text>
          </View>
        ))}
        <Text style={[styles.smallNote, { color: c.mutedForeground }]}>수치 오차는 동일한 물리 가정에서의 계산 차이입니다. 유한한 합성 사례의 통과가 모든 실제 운행 조건을 증명하지는 않아요.</Text>

        <View style={styles.sectionHead}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.foreground }]}>원리와 한계, 쉽게 보기</Text></View>
        {QUESTIONS.map((question, index) => (
          <View key={question.title} style={[styles.question, { borderColor: c.border }]}>
            <Pressable testID={`evidence-question-${index}`} accessibilityRole="button" accessibilityState={{ expanded: expanded === index }} onPress={() => setExpanded(expanded === index ? null : index)} style={({ pressed }) => [styles.questionHead, { opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[styles.questionTitle, { color: c.foreground }]}>{question.title}</Text><Feather name={expanded === index ? 'minus' : 'plus'} size={18} color={c.mutedForeground} />
            </Pressable>
            {expanded === index ? <View style={styles.answer}><Text style={[styles.body, { color: c.mutedForeground }]}>{question.body}</Text>{question.formula ? <View style={[styles.formula, { backgroundColor: c.card }]}><Text selectable style={[styles.formulaText, { color: c.foreground }]}>{question.formula}</Text><Text style={[styles.caption, { color: c.mutedForeground }]}>{question.note}</Text></View> : null}</View> : null}
          </View>
        ))}

        <View style={styles.sectionHead}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.foreground }]}>연구 근거</Text><Text style={[styles.caption, { color: c.mutedForeground }]}>Consensus에서 확인한 연구와 철도 이론 자료</Text></View>
        {PAPERS.map((paper, index) => (
          <View key={paper.url} style={[styles.paper, { borderColor: c.border }]}>
            <Text style={[styles.paperTitle, { color: c.foreground }]}>{paper.title}</Text>
            <Text style={[styles.caption, { color: c.mutedForeground }]}>{paper.authors}</Text>
            <Text style={[styles.body, { color: c.mutedForeground }]}>{paper.detail}</Text>
            <Pressable testID={`evidence-paper-${index}`} accessibilityRole="link" accessibilityLabel={`${paper.title} 원문 열기. 외부 사이트로 이동합니다.`} onPress={() => openPaper(paper.url)} style={({ pressed }) => [styles.paperLink, { opacity: pressed ? 0.6 : 1 }]}><Text style={[styles.linkText, { color: c.foreground }]}>연구 원문 보기</Text><Feather name="external-link" size={14} color={c.mutedForeground} /></Pressable>
          </View>
        ))}
        <Text style={[styles.footer, { color: c.mutedForeground }]}>논문은 모델을 검토하는 근거입니다. 이 앱의 효과를 검증한 임상·현장 시험은 아닙니다.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, frame: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }, content: { paddingHorizontal: 24 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 34 }, back: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, topText: { gap: 5 }, kicker: { fontSize: 9, letterSpacing: 1.8, fontFamily: typography.numBold }, topTitle: { fontSize: 17, fontWeight: '700' },
  title: { fontSize: 34, lineHeight: 44, fontWeight: '800', letterSpacing: -1 }, intro: { fontSize: 15, lineHeight: 24, marginTop: 14, marginBottom: 24 },
  scope: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 14 }, status: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, statusText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '600' }, scopeNote: { fontSize: 12, lineHeight: 20 },
  sectionHead: { marginTop: 34, marginBottom: 16, gap: 8 }, sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4 }, caption: { fontSize: 12, lineHeight: 19 },
  metric: { paddingVertical: 20, borderBottomWidth: 1, gap: 10 }, metricTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, metricLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' }, number: { fontSize: 36, lineHeight: 44, fontFamily: typography.numBold, fontVariant: ['tabular-nums'] }, numberUnit: { fontSize: 12, fontFamily: undefined }, smallNote: { marginTop: 16, fontSize: 12, lineHeight: 20 },
  question: { borderBottomWidth: 1 }, questionHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 20, minHeight: 56 }, questionTitle: { flex: 1, fontSize: 14, lineHeight: 22, fontWeight: '600' }, answer: { paddingBottom: 22, gap: 14 }, body: { fontSize: 13, lineHeight: 22 }, formula: { padding: 16, borderRadius: 12, gap: 10 }, formulaText: { fontSize: 15, lineHeight: 24, fontFamily: typography.num },
  paper: { paddingVertical: 20, borderBottomWidth: 1, gap: 10 }, paperTitle: { fontSize: 15, lineHeight: 24, fontWeight: '700' }, paperLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }, linkText: { fontSize: 13, fontWeight: '600' }, footer: { marginTop: 28, fontSize: 12, lineHeight: 20 },
});
