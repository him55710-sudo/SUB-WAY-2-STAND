import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { LINE2_MAIN_LOOP } from '@/data/line2';
import { planLine2Journey, type Line2JourneyOption } from '@/lib/journeyPlanner';
import { Button, Chip } from '@/components/ui';

export function JourneyPlanner({ onJourney, pickedStation }: { onJourney: (route: Line2JourneyOption | null) => void; pickedStation?: {name: string} | null }) {
  const c = useColors();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const [search, setSearch] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [guiding, setGuiding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reverse, setReverse] = useState(false);
  const plan = useMemo(() => planLine2Journey(from, to), [from, to]);
  const route = plan ? reverse ? plan.alternative : plan.recommended : null;
  const stations = LINE2_MAIN_LOOP.filter(s => s.name.includes(search.trim().replace(/역$/, '')));
  const selectStation = (name: string) => {
    const field = editing ?? (!from ? 'from' : 'to');
    if (field === 'from') setFrom(name); else setTo(name);
    setEditing(field === 'from' && !to ? 'to' : null);
    setSearch(''); setShowResult(false); setGuiding(false); setReverse(false); onJourney(null);
  };
  const text = { color: c.foreground };
  useEffect(() => { if (pickedStation) selectStation(pickedStation.name); }, [pickedStation]);
  const muted = { color: c.mutedForeground, fontSize: 12, lineHeight: 20 };
  return <View style={{ gap: 14 }}>
    <Text style={{ ...muted, color: c.signal }}>01 경로 선택 → 02 탑승 방향 확인 → 03 이동 안내</Text>
    <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 18, gap: 12 }}>
      <Text style={{ ...text, fontWeight: '800', fontSize: 19 }}>어디에서 어디로 가시나요?</Text>
      <Text style={muted}>2호선 순환선 43개 역 · 환승 없는 짧은 경로 추천</Text>
      {(['from', 'to'] as const).map(field => <Pressable key={field} testID={`journey-${field}`} accessibilityRole="button" accessibilityLabel={`${field === 'from' ? '출발역' : '도착역'} 선택${(field === 'from' ? from : to) ? `, ${field === 'from' ? from : to}` : ''}`} onPress={() => { setEditing(editing === field ? null : field); setSearch(''); }} style={{ minHeight: 60, borderWidth: 1, borderColor: editing === field ? c.signal : c.border, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Text style={{ ...muted, width: 44 }}>{field === 'from' ? '출발역' : '도착역'}</Text>
        <Text style={{ color: (field === 'from' ? from : to) ? c.foreground : c.mutedForeground, fontSize: 18, fontWeight: '700', flex: 1 }}>{(field === 'from' ? from : to) || '눌러서 역 선택'}</Text><Text style={muted}>⌄</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel="출발역과 도착역 바꾸기" onPress={() => { setFrom(to); setTo(from); setShowResult(false); setGuiding(false); setReverse(false); onJourney(null); }} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ ...muted, color: c.foreground }}>↑↓ 출발·도착 바꾸기</Text></Pressable>
      {editing ? <View style={{ gap: 8 }}>
        <Text style={{ ...text, fontSize: 14, fontWeight: '700' }}>{editing === 'from' ? '출발역' : '도착역'}을 골라 주세요</Text>
        <TextInput testID="journey-station-search" value={search} onChangeText={setSearch} placeholder="역 이름 검색 (예: 강남, 홍대입구)" placeholderTextColor={c.faint} accessibilityLabel="선택할 역 검색" style={{ ...text, minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12 }} />
        <ScrollView style={{ maxHeight: 210 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">{stations.map(s => <Pressable key={s.name} accessibilityRole="button" accessibilityLabel={`${s.name}을 ${editing === 'from' ? '출발역' : '도착역'}으로 선택`} onPress={() => selectStation(s.name)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderColor: c.border }}><Text style={text}>{s.name}</Text></Pressable>)}{!stations.length ? <Text style={muted}>2호선 순환선 역 이름을 입력해 주세요.</Text> : null}</ScrollView>
      </View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['강남', '잠실', '홍대입구', '신도림', '사당'].map(s => <Chip key={s} label={s} selected={from === s || to === s} onPress={() => selectStation(s)} />)}</ScrollView>}
      {from && to && from === to ? <Text style={{ ...muted, color: c.foreground }}>출발역과 다른 도착역을 선택해 주세요.</Text> : null}
      <Button testID="recommend-journey" label={from && to ? `${from} → ${to} 경로 추천받기` : '출발역과 도착역을 선택해 주세요'} icon="navigation" disabled={!plan} onPress={() => { if (!route) return; setShowResult(true); setEditing(null); setProgress(0); setGuiding(false); onJourney(route); }} />
    </View>
    {showResult && route ? <View testID="journey-result" style={{ borderWidth: 1, borderColor: c.signal, borderRadius: 18, padding: 18, gap: 14 }}>
      <Text style={{ ...muted, color: c.signal }}>{guiding ? '● 경로 안내 중' : reverse ? '다른 방향 경로' : '추천 경로 · 정거장 수가 적은 방향'}</Text>
      <Text style={{ ...text, fontSize: 24, fontWeight: '800' }}>{route.from} → {route.to}</Text>
      <Text style={{ ...text, fontSize: 16, lineHeight: 25 }}>{route.nextStation} 방면 {route.directionLabel} 탑승{ '\n' }{route.stopCount}개 역 이동 · 환승 0회 · {route.to}역에서 하차</Text>
      <Text style={muted}>{route.stations.join(' → ')}</Text>
      {guiding ? <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 14, gap: 10 }}>
        <Text style={muted}>직접 확인한 현재 역 · {progress}/{route.stopCount}</Text>
        <Text style={{ ...text, fontSize: 22, fontWeight: '800' }}>{route.stations[progress]}</Text>
        {progress >= route.stopCount ? <Text style={{ ...text, color: c.signal, fontSize: 18 }}>목적지에 도착했어요. 이 역에서 내리세요.</Text> : <><Text style={muted}>다음은 {route.stations[progress + 1]}역 · 도착까지 {route.stopCount - progress}개 역</Text><Button testID="confirm-next-station" label={`${route.stations[progress + 1]}역 도착 확인`} variant="ghost" onPress={() => setProgress(p => Math.min(p + 1, route.stopCount))} /></>}
        <Text style={muted}>역 안내방송을 듣고 도착을 확인해 주세요. GPS로 현재 탑승 역을 확정하지 않습니다.</Text>
      </View> : <Button testID="start-journey" label="이 경로로 이동 안내 시작" icon="arrow-right" onPress={() => { setGuiding(true); setProgress(0); }} />}
      <Pressable accessibilityRole="button" accessibilityLabel="반대 방향 경로 보기" onPress={() => { const next = reverse ? plan!.recommended : plan!.alternative; setReverse(!reverse); setGuiding(false); setProgress(0); onJourney(next); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={muted}>다른 방향: {reverse ? plan!.recommended.directionLabel : plan!.alternative.directionLabel} · {reverse ? plan!.recommended.stopCount : plan!.alternative.stopCount}개 역 보기 ↗</Text></Pressable>
      <Text style={muted}>아래 열차 목록은 출발역·탑승 방향으로 좁혔어요. 실제 열차 번호를 확인하고 연결하면 움직임 안내로 이어집니다.</Text>
    </View> : null}
  </View>;
}

