import { Feather } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_CONFIG, FLAGS } from "@/config/flags";
import type { TrainCandidate } from "@/contracts";
import { LINES, directionOptions, lineInfo } from "@/constants/lines";
import { ExploreMap } from "@/components/ExploreMap";
import { JourneyPlanner } from "@/components/JourneyPlanner";
import type { Line2JourneyOption } from "@/lib/journeyPlanner";
import {
  feedBanner,
  filterCandidates,
  type DirectionFilter,
} from "@/components/uiModel";
import { formatAge, observationAge } from "@/lib/freshness";
import { useRideSession } from "@/session/RideSession";
import {
  DEFAULT_SCENARIO_ID,
  getSimulationRide,
  listSimulationScenarios,
} from "@/services/simulation";
import { useTrainCandidates } from "@/services/trains";
import { useLocation } from "@/services/location";
import { useTicker, type FeatherName } from "@/components/ui";

const C = {
  ink: "#24352e",
  text: "#617168",
  faint: "#849087",
  green: "#247d54",
  pale: "#edf6ef",
  blue: "#1a73e8",
  border: "#e7ece7",
  white: "#ffffff",
};
type HomeTab = "about" | "trains";

function Action({
  label,
  icon,
  onPress,
  secondary = false,
  testID,
}: {
  label: string;
  icon?: FeatherName;
  onPress: () => void;
  secondary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondaryAction,
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {icon ? (
        <Feather name={icon} size={17} color={secondary ? C.green : C.white} />
      ) : null}
      <Text style={[styles.actionText, secondary && { color: C.green }]}>
        {label}
      </Text>
      <Feather
        name="arrow-right"
        size={17}
        color={secondary ? C.green : C.white}
      />
    </Pressable>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: FeatherName;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Feather name={icon} size={20} color={C.green} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureBody}>{body}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const insets = useSafeAreaInsets();
  const { select } = useRideSession();
  const now = useTicker(1000);
  const location = useLocation();
  const [tab, setTab] = useState<HomeTab>("about");
  const [line, setLine] = useState<number>(APP_CONFIG.defaultLine);
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<TrainCandidate | null>(null);
  const [mapStation, setMapStation] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [journey, setJourney] = useState<Line2JourneyOption | null>(null);
  const [pickedStation, setPickedStation] = useState<{name: string} | null>(null);
  const mainScroll = useRef<ScrollView>(null);
  const { candidates, feed, isLoading, refresh } = useTrainCandidates({ line });
  const visible = useMemo(
    () => filterCandidates(candidates, direction, query),
    [candidates, direction, query],
  );
  const banner = feedBanner(feed, FLAGS.liveTrains);
  const scenario = useMemo(() => listSimulationScenarios()[0], []);
  const demoRide = getSimulationRide(scenario?.id ?? DEFAULT_SCENARIO_ID);
  const from = demoRide?.segment.from ?? "가상 A역";
  const to = demoRide?.segment.to ?? "가상 B역";
  const showSim = FLAGS.simulationFallback && !!scenario;
  const info = lineInfo(line);
  const selectedTrain = chosen
    ? (candidates.find((t) => t.id === chosen.id && t.line === chosen.line) ??
      chosen)
    : null;
  const age = feed.fetchedAt ? observationAge(feed.fetchedAt, now) : null;
  const pickSimulation = () => {
    select({
      kind: "simulation",
      scenarioId: scenario?.id ?? DEFAULT_SCENARIO_ID,
      selectedAt: new Date().toISOString(),
    });
    router.push("/ride");
  };
  const pickTrain = (t: TrainCandidate) => {
    select({
      kind: "live",
      line: t.line,
      trainId: t.id,
      directionCode: t.directionCode,
      initial: t,
      selectedAt: new Date().toISOString(),
    });
    router.push(journey && t.line === 2 && t.directionCode === journey.directionCode ? { pathname: '/ride', params: { from: journey.from, to: journey.to, direction: journey.directionCode } } : '/ride');
  };
  const changeLine = (n: number) => {
    setLine(n);
    setQuery("");
    setDirection("all");
    setChosen(null);
    setMapStation(null);
  };
  const search = useCallback((q: string) => {
    setQuery(q);
    setChosen(null);
    setTab("trains");
  }, []);
  const pickStation = useCallback(
    (name: string) => {
      setLine(2);
      setMapStation(name);
      setPickedStation({name});
      setChosen(null);
      mainScroll.current?.scrollTo({y: 0, animated: true});
    },
    [search],
  );
  const showAbout = () => {
    setTab("about");
    setMapStation(null);
  };

  const panelHead = (
    <View
      style={[styles.panelHead, compact && { paddingTop: insets.top + 18 }]}
    >
      <View style={styles.brandRow}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Feather name="navigation" size={19} color={C.white} />
          </View>
          <View>
            <Text style={styles.brandName}>
              SUB WAY <Text style={{ color: C.green }}>2</Text> STAND
            </Text>
            <Text style={styles.brandCaption}>
              서서 가는 당신을 위한 이동 안내
            </Text>
          </View>
        </View>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>DEMO</Text>
        </View>
      </View>
      <View style={styles.search}>
        <Feather name="search" size={19} color={C.text} />
        <TextInput
          testID="station-search"
          accessibilityLabel="역 이름, 행선지 또는 열차 번호로 검색"
          value={query}
          onChangeText={search}
          onSubmitEditing={() => setTab("trains")}
          placeholder="어느 역에서 타시나요?"
          placeholderTextColor={C.faint}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검색어 지우기"
            onPress={() => {
              setQuery("");
              setMapStation(null);
              setChosen(null);
            }}
            style={styles.clear}
          >
            <Feather name="x" size={17} color={C.text} />
          </Pressable>
        ) : (
          <Feather name="map-pin" size={18} color={C.green} />
        )}
      </View>
      <View
        accessibilityRole="tablist"
        accessibilityLabel="메인 메뉴"
        style={styles.tabs}
      >
        {(
          [
            { id: "about", label: "경로 찾기", icon: "compass" },
            { id: "trains", label: "열차 찾기", icon: "git-commit" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: tab === item.id }}
            onPress={() =>
              item.id === "about" ? showAbout() : setTab("trains")
            }
            style={[styles.tab, tab === item.id && styles.tabActive]}
          >
            <Feather
              name={item.icon}
              size={16}
              color={tab === item.id ? C.green : C.text}
            />
            <Text
              style={[styles.tabText, tab === item.id && { color: C.green }]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const about = (
    <View style={styles.about}>
      <View style={styles.eyebrowRow}>
        <View style={styles.greenDot} />
        <Text style={styles.eyebrow}>조금 더 편안한 지하철의 시작</Text>
      </View>
      <Text accessibilityRole="header" style={styles.heroTitle}>
        {"흔들리기 전에,\n미리 알려드려요."}
      </Text>
      <Text style={styles.heroBody}>
        {
          "서서 가는 지하철, 갑자기 몸이 쏠린 적 있나요?\n열차의 다음 곡선과 쏠림 방향을 미리 알려\n균형을 준비할 수 있도록 도와드려요."
        }
      </Text>
      <View style={styles.features}>
        <Feature
          icon="corner-up-right"
          title="다음 곡선을 한발 먼저"
          body="곡선 진입 전, 몸이 쏠릴 방향을 확인해요."
        />
        <Feature
          icon="volume-2"
          title="화면을 보지 않아도 괜찮아요"
          body="음성과 진동으로 다가오는 움직임을 안내해요."
        />
        <Feature
          icon="check-circle"
          title="확실한 정보만 안내해요"
          body="정보가 부족할 때는 예측을 잠시 보류해요."
        />
      </View>
      <View style={styles.demoCard}>
        <View style={styles.demoCardTop}>
          <View style={styles.smallTag}>
            <Feather name="play-circle" size={13} color={C.green} />
            <Text style={styles.smallTagText}>먼저 체험해보세요</Text>
          </View>
          <Text style={styles.duration}>
            약 {Math.ceil((scenario?.durationS ?? 120) / 60)}분
          </Text>
        </View>
        <Text style={styles.demoCardTitle}>한 정거장이면 충분해요.</Text>
        <View style={styles.routeRow}>
          <View style={styles.lineBadge}>
            <Text style={styles.lineBadgeText}>2</Text>
          </View>
          <Text style={styles.routeName}>{from}</Text>
          <Feather name="arrow-right" size={14} color={C.text} />
          <Text style={styles.routeName}>{to}</Text>
        </View>
        <Text style={styles.demoCardBody}>
          {
            "가상 열차에 탑승해 곡선 안내를 경험해보세요.\n가입이나 위치 권한 없이 바로 시작할 수 있어요."
          }
        </Text>
        {showSim ? (
          <Action
            testID="start-simulation"
            icon="play"
            label="데모 주행 시작"
            onPress={pickSimulation}
          />
        ) : (
          <Text style={styles.note}>
            시뮬레이션이 현재 비활성화되어 있어요.
          </Text>
        )}
        <Text style={styles.demoDisclaimer}>
          시뮬레이션 · 실제 운행 중인 열차와 무관합니다
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setTab("trains")}
        style={styles.textLink}
      >
        <Text style={styles.textLinkText}>
          지금 타고 있는 열차를 찾고 싶다면
        </Text>
        <Feather name="arrow-up-right" size={16} color={C.green} />
      </Pressable>
      <Pressable testID="home-open-evidence" accessibilityRole="button" accessibilityLabel="검증 결과와 연구 근거 보기" onPress={() => router.push("/evidence")} style={styles.textLink}>
        <Text style={styles.textLinkText}>검증 결과와 연구 근거 보기</Text>
        <Feather name="file-text" size={16} color={C.green} />
      </Pressable>
      <View style={styles.panelFoot}>
        <Feather name="info" size={14} color={C.text} />
        <Text style={styles.footText}>
          실시간 쏠림 안내는 검증된 곡선 자료가 있을 때 제공해요. 지금은 데모로
          먼저 경험해보세요.
        </Text>
      </View>
    </View>
  );

  const trains = (
    <View style={styles.trainContent}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          탑승할 열차를 찾아보세요
        </Text>
        <Feather name="git-commit" size={22} color={C.green} />
      </View>
      <Text style={styles.sectionBody}>
        노선과 방향을 고른 뒤, 실제 탑승한 열차를 확인해주세요.
      </Text>
      <Text style={styles.fieldLabel}>지하철 노선</Text>
      <View style={styles.lineSelectors}>
        {LINES.map((l) => (
          <Pressable
            key={l.n}
            testID={`line-${l.n}`}
            accessibilityRole="button"
            accessibilityLabel={`${l.name} 선택`}
            accessibilityState={{ selected: line === l.n }}
            onPress={() => changeLine(l.n)}
            style={[
              styles.lineSelector,
              line === l.n && {
                borderColor: l.color,
                backgroundColor: "#f3f7f4",
              },
            ]}
          >
            <View style={[styles.lineCircle, { backgroundColor: l.color }]}>
              <Text style={[styles.lineCircleText, { color: l.onColor }]}>
                {l.n}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View
        style={styles.directions}
        accessibilityRole="radiogroup"
        accessibilityLabel="방향"
      >
        {[{ code: "all", label: "전체 방향" }, ...directionOptions(line)].map(
          (d) => (
            <Pressable
              key={d.code}
              testID={`seg-${d.code}`}
              accessibilityRole="radio"
              accessibilityLabel={`방향 ${d.label}`}
              accessibilityState={{ checked: direction === d.code }}
              onPress={() => {
                setDirection(d.code as DirectionFilter);
                setChosen(null);
              }}
              style={[
                styles.direction,
                direction === d.code && styles.directionActive,
              ]}
            >
              <Text
                style={[
                  styles.directionText,
                  direction === d.code && { color: C.green },
                ]}
              >
                {d.label}
              </Text>
            </Pressable>
          ),
        )}
      </View>
      <View style={styles.stationChips}>
        {info.stations.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`${s}역으로 검색`}
            accessibilityState={{ selected: query === s }}
            onPress={() => {
              search(query === s ? "" : s);
              if (line === 2) setMapStation(query === s ? null : s);
            }}
            style={[
              styles.stationChip,
              query === s && styles.stationChipActive,
            ]}
          >
            <Text
              style={[
                styles.stationChipText,
                query === s && { color: C.green },
              ]}
            >
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        testID="use-location"
        accessibilityRole="button"
        accessibilityLabel="내 위치로 가까운 역 찾기"
        accessibilityState={{ disabled: location.status === "requesting" }}
        disabled={location.status === "requesting"}
        onPress={() => void location.requestLocation()}
        style={styles.locationButton}
      >
        <Feather name="navigation" size={15} color={C.blue} />
        <Text style={styles.locationText}>
          {location.status === "requesting"
            ? "가까운 역을 찾고 있어요"
            : "내 위치로 가까운 역 찾기"}
        </Text>
      </Pressable>
      {location.status !== "idle" ? (
        <Text style={styles.note}>{location.messageKo}</Text>
      ) : null}
      {location.nearestStations.length ? (
        <View style={styles.stationChips}>
          {location.nearestStations.map((s) => (
            <Pressable
              key={s.name}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}역으로 검색`}
              onPress={() => {
                setLine(s.line);
                search(s.name);
                setMapStation(s.name);
              }}
              style={styles.stationChip}
            >
              <Text style={styles.stationChipText}>
                {s.name} ·{" "}
                {s.distanceM < 1000
                  ? `${Math.round(s.distanceM)}m`
                  : `${(s.distanceM / 1000).toFixed(1)}km`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>
          {query ? `${query} 검색 결과` : `${info.name} 운행 열차`}
        </Text>
        <Text style={styles.listCount}>{visible.length}대</Text>
      </View>
      <View
        testID={`feed-${banner.kind}`}
        accessibilityRole="summary"
        accessibilityLabel={`데이터 상태 ${banner.label}. ${feed.message}`}
        style={styles.feed}
      >
        <View style={styles.feedRow}>
          {isLoading ? (
            <ActivityIndicator size="small" color={C.green} />
          ) : (
            <Feather
              name={banner.icon}
              size={14}
              color={banner.kind === "live" ? C.green : C.text}
            />
          )}
          <Text style={styles.feedLabel}>
            {isLoading ? "열차 확인 중" : banner.label}
          </Text>
          {age !== null ? (
            <Text style={styles.feedAge}>
              {formatAge(age)} 갱신{feed.cached ? " · 캐시" : ""}
            </Text>
          ) : null}
          <Pressable
            testID="feed-retry"
            accessibilityRole="button"
            accessibilityLabel="열차 목록 다시 불러오기"
            disabled={isLoading}
            onPress={refresh}
            style={styles.retry}
          >
            <Feather name="refresh-cw" size={16} color={C.text} />
          </Pressable>
        </View>
        {!isLoading && banner.kind !== "live" ? (
          <Text style={styles.feedMessage}>{feed.message || banner.title}</Text>
        ) : null}
      </View>
      {visible.map((t) => (
        <Pressable
          key={`${t.line}-${t.id}`}
          testID={`train-${t.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${t.station}역 ${t.destination}행 ${t.id} 열차 선택`}
          accessibilityState={{ selected: selectedTrain?.id === t.id }}
          onPress={() => {
            setChosen(t);
            if (line === 2) setMapStation(t.station);
          }}
          style={[
            styles.trainCard,
            selectedTrain?.id === t.id && styles.trainCardSelected,
          ]}
        >
          <View style={styles.trainCardHead}>
            <Text style={styles.trainStation}>
              {t.station}
              <Text style={styles.trainState}> · {t.state}</Text>
            </Text>
            <Feather
              name={
                selectedTrain?.id === t.id ? "check-circle" : "chevron-right"
              }
              size={18}
              color={selectedTrain?.id === t.id ? C.green : C.faint}
            />
          </View>
          <Text style={styles.trainDetail}>
            {t.direction} · {t.destination}행 · {t.id}
          </Text>
          <Text style={styles.trainAge}>
            {t.origin === "fixture"
              ? "예시 데이터 · 실제 관측 아님"
              : t.fresh
                ? "실시간 관측"
                : "이전 관측"}{" "}
            · {formatAge(observationAge(t.observedAt, now) ?? 0)} 관측
          </Text>
        </Pressable>
      ))}
      {!visible.length ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Feather
              name={candidates.length ? "search" : "radio"}
              size={24}
              color={C.faint}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {isLoading
              ? "운행 정보를 확인하고 있어요"
              : candidates.length
                ? "조건에 맞는 열차가 없어요"
                : "현재 표시할 열차가 없어요"}
          </Text>
          <Text style={styles.emptyBody}>
            {candidates.length
              ? "다른 역이나 방향으로 검색해보세요."
              : "실시간 연결을 기다리는 동안\n데모 주행을 먼저 경험해보세요."}
          </Text>
          {candidates.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setQuery("");
                setDirection("all");
                setChosen(null);
                setMapStation(null);
              }}
              style={styles.textLink}
            >
              <Text style={styles.textLinkText}>필터 초기화</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {showSim ? (
        <Action
          secondary
          icon="play-circle"
          label="시뮬레이션으로 체험"
          onPress={pickSimulation}
        />
      ) : null}
      <Text style={[styles.note, { marginTop: 18 }]}>
        열차 위치는 역 단위 관측입니다. 검증된 곡선 정보가 없는 구간에서는 쏠림
        예측을 보류합니다.
      </Text>
    </View>
  );

  const routePlanner = <View style={{ backgroundColor: '#05070B', margin: 16, padding: 16, borderRadius: 20 }}><JourneyPlanner pickedStation={pickedStation} onJourney={(next) => { setJourney(next); setChosen(null); if (next) { setLine(2); setDirection(next.directionCode); setQuery(next.from); setMapStation(next.from); setTab('trains'); } }} /></View>;
  const panelBody = (
    <>
      {!compact ? routePlanner : null}
      {tab === "about" ? about : trains}
      <View style={styles.bottomNote}>
        <Feather name="heart" size={12} color={C.faint} />
        <Text style={styles.bottomNoteText}>
          더 편안한 이동을 위해. 안내 중에도 손잡이를 잡아주세요.
        </Text>
      </View>
    </>
  );
  const selectedBar =
    selectedTrain && tab === "trains" ? (
      <View
        style={[
          styles.selectedBar,
          { paddingBottom: compact ? insets.bottom + 16 : 20 },
        ]}
      >
        <Text style={styles.selectedSummary}>
          {selectedTrain.station} · {selectedTrain.destination}행 ·{" "}
          {selectedTrain.id}
        </Text>
        <Action
          testID="confirm-train"
          label="이 열차로 시작"
          onPress={() => pickTrain(selectedTrain)}
        />
      </View>
    ) : null;

  const map = (
    <View style={[styles.mapFrame, compact && styles.mapCompact]}>
      <ExploreMap
        compact={compact}
        station={mapStation ?? from}
        onStationPress={pickStation}
        demoFrom={from}
        demoTo={to}
        line={tab === "about" ? 2 : line}
      />
      <View
        style={[styles.mapTop, compact && { top: 14, left: 14, right: 14 }]}
      >
        <View style={styles.mapPill}>
          <View
            style={[
              styles.pillDot,
              { backgroundColor: tab === "about" ? "#30a66b" : info.color },
            ]}
          />
          <Text style={styles.mapPillText}>
            {tab === "about" ? "2호선" : info.name}
          </Text>
          <View style={styles.pillDivider} />
          <Text style={styles.mapPillSub}>
            {tab === "about"
              ? "데모 구간 둘러보기"
              : line === 2
                ? "역을 눌러 열차 찾기"
                : "지도 준비 중"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이용 방법"
          onPress={() => setHelp(true)}
          style={[
            styles.helpPill,
            compact && {
              width: 40,
              height: 40,
              padding: 0,
              justifyContent: "center",
            },
          ]}
        >
          <Feather name="help-circle" size={16} color={C.text} />
          {!compact ? <Text style={styles.helpPillText}>이용 방법</Text> : null}
        </Pressable>
      </View>
      {compact && showSim && tab === "about" ? (
        <View style={styles.mobileMapAction}>
          <Action
            testID="map-start-simulation"
            icon="play"
            label="데모 주행 시작"
            onPress={pickSimulation}
          />
        </View>
      ) : null}
      {!compact && tab === "about" ? (
        <View style={styles.motionExample}>
          <View style={styles.exampleHead}>
            <View style={styles.greenDot} />
            <Text style={styles.exampleTag}>이렇게 안내해드려요 · 예시</Text>
            <Feather name="volume-2" size={16} color={C.green} />
          </View>
          <View style={styles.exampleBody}>
            <View style={styles.curveIcon}>
              <Feather name="corner-up-left" size={32} color={C.green} />
            </View>
            <View>
              <Text style={styles.exampleTitle}>잠시 후 왼쪽 곡선</Text>
              <Text style={styles.exampleSub}>
                오른쪽으로 쏠림에 대비하세요.
              </Text>
            </View>
          </View>
          <View style={styles.exampleFooter}>
            <Feather name="smartphone" size={13} color={C.text} />
            <Text style={styles.exampleFootText}>
              음성 + 진동으로 미리 알려드려요
            </Text>
          </View>
        </View>
      ) : null}
      {!compact && (tab === "about" || line === 2) ? (
        <View style={styles.mapRouteCard}>
          <View style={styles.mapRouteHead}>
            <View style={styles.routeCardIcon}>
              <Feather
                name={mapStation ? "map-pin" : "navigation"}
                size={20}
                color={C.blue}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mapRouteEyebrow}>
                {mapStation ? "선택한 역" : "추천 체험 구간"}
              </Text>
              <Text style={styles.mapRouteTitle}>
                {mapStation ?? `${from} → ${to}`}
              </Text>
            </View>
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>
                {mapStation ? "2호선" : "DEMO"}
              </Text>
            </View>
          </View>
          <Text style={styles.mapRouteBody}>
            {mapStation
              ? "실제 탑승한 열차는 열차 찾기에서 확인해주세요."
              : "한 정거장 동안, 다음 움직임을 미리 만나보세요."}
          </Text>
          {mapStation ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => pickStation(mapStation)}
              style={styles.mapRouteLink}
            >
              <Text style={styles.mapRouteLinkText}>이 역의 열차 찾기</Text>
              <Feather name="arrow-right" size={16} color={C.blue} />
            </Pressable>
          ) : showSim ? (
            <Pressable
              accessibilityRole="button"
              onPress={pickSimulation}
              style={styles.mapRouteLink}
            >
              <Text style={styles.mapRouteLinkText}>데모 주행 시작</Text>
              <Feather name="arrow-right" size={16} color={C.blue} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!compact && (tab === "about" || line === 2) ? (
        <View pointerEvents="none" style={styles.mapLegend}>
          <View style={[styles.legendLine, { backgroundColor: "#30a66b" }]} />
          <Text style={styles.legendText}>2호선</Text>
          <View style={[styles.legendLine, { backgroundColor: C.blue }]} />
          <Text style={styles.legendText}>데모 구간</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: C.white },
          title: "SUB WAY 2 STAND · 다음 움직임을 미리",
        }}
      />
      {compact ? (
        <ScrollView
          ref={mainScroll}
          style={styles.mobileScroll}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {panelHead}
          {routePlanner}
          {map}
          <View style={styles.mobilePanel}>{panelBody}</View>
          {selectedBar}
        </ScrollView>
      ) : (
        <View style={styles.desktop}>
          <View style={styles.rail}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="서비스 소개로 이동"
              onPress={showAbout}
              style={styles.railLogo}
            >
              <Feather name="navigation" size={23} color={C.white} />
            </Pressable>
            <View style={styles.railNav}>
              {(
                [
                  {
                    icon: "compass",
                    label: "둘러보기",
                    active: tab === "about",
                    press: showAbout,
                  },
                  {
                    icon: "git-commit",
                    label: "열차 찾기",
                    active: tab === "trains",
                    press: () => setTab("trains"),
                  },
                  {
                    icon: "book-open",
                    label: "이용 안내",
                    active: help,
                    press: () => setHelp(true),
                  },
                  {
                    icon: "file-text",
                    label: "근거·검증",
                    active: false,
                    press: () => router.push("/evidence"),
                  },
                ] as const
              ).map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: item.active }}
                  onPress={item.press}
                  style={styles.railItem}
                >
                  <View
                    style={[
                      styles.railIcon,
                      item.active && styles.railIconActive,
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={21}
                      color={item.active ? C.green : C.text}
                    />
                  </View>
                  <Text
                    style={[
                      styles.railLabel,
                      item.active && { color: C.green },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.railBottom}>
              <Text style={styles.railSeoul}>SEOUL</Text>
              <Text style={styles.railVersion}>v. demo</Text>
            </View>
          </View>
          <View style={styles.panel}>
            {panelHead}
            <ScrollView
              style={styles.panelScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {panelBody}
            </ScrollView>
            {selectedBar}
          </View>
          {map}
        </View>
      )}
      <Modal
        visible={help}
        transparent
        animationType="fade"
        onRequestClose={() => setHelp(false)}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modal}>
            <View style={styles.modalHead}>
              <Text accessibilityRole="header" style={styles.modalTitle}>
                이렇게 이용해보세요
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="이용 안내 닫기"
                onPress={() => setHelp(false)}
                style={styles.clear}
              >
                <Feather name="x" size={21} color={C.text} />
              </Pressable>
            </View>
            <Feature
              icon="play-circle"
              title="1. 데모로 먼저 경험하기"
              body="메인페이지에서 데모 주행을 시작하면 가상 열차가 출발해요."
            />
            <Feature
              icon="git-commit"
              title="2. 실제 탑승한 열차 고르기"
              body="열차 찾기에서 노선·방향·역을 선택하고 열차 번호를 확인해요."
            />
            <Feature
              icon="volume-2"
              title="3. 안내 화면에서 움직임 확인하기"
              body="음성 안내를 켜고 다음 곡선과 쏠림 방향을 확인해요. 진동은 지원 기기에서 작동해요."
            />
            <Text style={[styles.note, { marginVertical: 18 }]}>
              데모의 위치·속도는 시뮬레이션입니다. 실제 주행 안내는 검증된 곡선
              자료가 있을 때만 제공하며, 정보가 부족하면 보류합니다.
            </Text>
            <Action label="알겠어요" onPress={() => setHelp(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.white },
  desktop: { flex: 1, flexDirection: "row" },
  mobileScroll: { flex: 1 },
  rail: {
    width: 80,
    backgroundColor: "#f9fbf9",
    borderRightWidth: 1,
    borderRightColor: C.border,
    alignItems: "center",
    paddingTop: 26,
  },
  railLogo: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  railNav: { marginTop: 36, gap: 21 },
  railItem: { alignItems: "center", gap: 6 },
  railIcon: {
    width: 48,
    height: 38,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  railIconActive: { backgroundColor: "#e4f0e6" },
  railLabel: { fontSize: 10, fontWeight: "600", color: C.text },
  railBottom: {
    marginTop: "auto",
    alignItems: "center",
    gap: 6,
    paddingBottom: 28,
  },
  railSeoul: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: C.text,
  },
  railVersion: { fontSize: 9, color: C.faint },
  panel: {
    width: 390,
    backgroundColor: C.white,
    zIndex: 2,
    boxShadow: "4px 0 18px rgba(44,62,49,0.06)",
  },
  panelHead: {
    paddingHorizontal: 25,
    paddingTop: 25,
    backgroundColor: C.white,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 8,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 34,
    height: 34,
    backgroundColor: C.green,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  brandName: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: C.ink,
  },
  brandCaption: { fontSize: 10, color: C.text, marginTop: 4 },
  demoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#edf3ed",
  },
  demoBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: C.green,
    letterSpacing: 0.6,
  },
  search: {
    borderWidth: 1,
    borderColor: "#dfe6df",
    backgroundColor: "#f9fbf9",
    borderRadius: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 51,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: C.ink,
    outlineWidth: 0,
    paddingVertical: 15,
  },
  clear: {
    width: 34,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    marginTop: 17,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 15,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: C.green },
  tabText: { fontSize: 13, fontWeight: "600", color: C.text },
  panelScroll: { flex: 1 },
  about: { padding: 26, paddingTop: 29 },
  mobilePanel: { backgroundColor: C.white },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  eyebrow: { color: C.green, fontSize: 11, fontWeight: "600" },
  heroTitle: {
    color: C.ink,
    fontSize: 32,
    lineHeight: 43,
    fontWeight: "800",
    letterSpacing: -1.4,
    marginTop: 15,
  },
  heroBody: { fontSize: 12, lineHeight: 22, color: C.text, marginTop: 14 },
  features: { gap: 22, marginTop: 28, marginBottom: 27 },
  feature: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#f0f5ef",
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.ink,
    lineHeight: 19,
  },
  featureBody: { fontSize: 11, color: C.text, lineHeight: 18 },
  demoCard: {
    backgroundColor: "#f0f6ef",
    borderRadius: 18,
    padding: 19,
    borderWidth: 1,
    borderColor: "#e0ebdd",
  },
  demoCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  smallTag: { flexDirection: "row", alignItems: "center", gap: 5 },
  smallTagText: { fontSize: 10, fontWeight: "600", color: C.green },
  duration: { fontSize: 10, color: C.text },
  demoCardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.6,
    marginTop: 15,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 15,
  },
  lineBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#30a66b",
    alignItems: "center",
    justifyContent: "center",
  },
  lineBadgeText: { color: C.white, fontSize: 11, fontWeight: "700" },
  routeName: { fontSize: 12, fontWeight: "600", color: C.ink },
  demoCardBody: {
    color: C.text,
    fontSize: 11,
    lineHeight: 19,
    marginTop: 13,
    marginBottom: 18,
  },
  action: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: C.green,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionText: {
    flex: 1,
    textAlign: "center",
    color: C.white,
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryAction: {
    backgroundColor: C.pale,
    borderWidth: 1,
    borderColor: "#d9e6d9",
  },
  demoDisclaimer: {
    fontSize: 9,
    color: C.text,
    textAlign: "center",
    marginTop: 11,
    lineHeight: 15,
  },
  textLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    marginTop: 12,
  },
  textLinkText: { fontSize: 11, fontWeight: "600", color: C.green },
  panelFoot: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 17,
    marginTop: 12,
  },
  footText: { flex: 1, fontSize: 10, lineHeight: 18, color: C.text },
  bottomNote: {
    paddingHorizontal: 25,
    paddingBottom: 22,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  bottomNoteText: { flex: 1, color: C.faint, fontSize: 9, lineHeight: 15 },
  mapFrame: { flex: 1, overflow: "hidden" },
  mapCompact: { flex: 0, height: 290 },
  mobileMapAction: {
    position: "absolute",
    left: 14,
    bottom: 34,
    width: 220,
    boxShadow: "0 3px 16px rgba(40,60,50,0.14)",
    borderRadius: 10,
  },
  mapTop: {
    position: "absolute",
    top: 25,
    left: 26,
    right: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  mapPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: C.white,
    borderRadius: 25,
    paddingVertical: 13,
    paddingHorizontal: 18,
    boxShadow: "0 2px 12px rgba(40,60,50,0.08)",
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  mapPillText: { fontSize: 12, color: C.ink, fontWeight: "700" },
  pillDivider: {
    width: 1,
    height: 14,
    backgroundColor: C.border,
    marginHorizontal: 2,
  },
  mapPillSub: { fontSize: 11, color: C.text },
  helpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.white,
    padding: 12,
    paddingHorizontal: 15,
    borderRadius: 24,
    boxShadow: "0 2px 12px rgba(40,60,50,0.06)",
  },
  helpPillText: { fontSize: 11, color: C.text },
  motionExample: {
    position: "absolute",
    right: 26,
    top: 104,
    width: 285,
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 8px 30px rgba(39,61,47,0.09)",
  },
  exampleHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  exampleTag: { flex: 1, fontSize: 10, color: C.text },
  exampleBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 19,
  },
  curveIcon: {
    width: 49,
    height: 49,
    backgroundColor: C.pale,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  exampleTitle: { color: C.ink, fontSize: 15, fontWeight: "700" },
  exampleSub: { color: C.text, fontSize: 11, marginTop: 6 },
  exampleFooter: {
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  exampleFootText: { color: C.text, fontSize: 10 },
  mapRouteCard: {
    position: "absolute",
    left: 26,
    bottom: 63,
    width: 320,
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 19,
    boxShadow: "0 4px 24px rgba(39,61,47,0.12)",
  },
  mapRouteHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  routeCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#edf4fd",
    alignItems: "center",
    justifyContent: "center",
  },
  mapRouteEyebrow: { color: C.text, fontSize: 10, marginBottom: 5 },
  mapRouteTitle: {
    color: C.ink,
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: -0.5,
  },
  mapRouteBody: { color: C.text, fontSize: 10, lineHeight: 17, marginTop: 14 },
  mapRouteLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 14,
    paddingTop: 13,
    minHeight: 35,
  },
  mapRouteLinkText: { color: C.blue, fontWeight: "600", fontSize: 11 },
  mapLegend: {
    position: "absolute",
    left: 27,
    bottom: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendLine: { width: 17, height: 3, borderRadius: 2 },
  legendText: { fontSize: 10, color: "#4e6256", marginRight: 10 },
  trainContent: { padding: 25, paddingTop: 28 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    color: C.ink,
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  sectionBody: {
    color: C.text,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 24,
  },
  fieldLabel: {
    color: C.text,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 12,
  },
  lineSelectors: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  lineSelector: {
    width: 32,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  lineCircle: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  lineCircleText: { fontSize: 13, fontWeight: "700" },
  directions: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderRadius: 10,
    backgroundColor: "#f3f6f2",
    marginTop: 18,
  },
  direction: {
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 7,
  },
  directionActive: {
    backgroundColor: C.white,
    boxShadow: "0 1px 5px rgba(40,60,50,0.07)",
  },
  directionText: { fontSize: 12, color: C.text, fontWeight: "600" },
  stationChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 15,
  },
  stationChip: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
  },
  stationChipActive: { borderColor: "#afcfb4", backgroundColor: C.pale },
  stationChipText: { fontSize: 11, color: C.text },
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 45,
    marginTop: 9,
  },
  locationText: { fontSize: 11, color: C.blue, fontWeight: "500" },
  note: { fontSize: 10, lineHeight: 18, color: C.text },
  listHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 26,
    marginBottom: 12,
  },
  listTitle: { color: C.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  listCount: { color: C.text, fontSize: 12 },
  feed: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f5f7f3",
  },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  feedLabel: { color: C.text, fontSize: 11, fontWeight: "600" },
  feedAge: { color: C.faint, fontSize: 9 },
  retry: {
    width: 30,
    height: 30,
    marginLeft: "auto",
    alignItems: "center",
    justifyContent: "center",
  },
  feedMessage: { color: C.text, fontSize: 10, lineHeight: 17, marginTop: 4 },
  trainCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
  },
  trainCardSelected: { backgroundColor: "#f4faf3", borderColor: C.green },
  trainCardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trainStation: { fontSize: 15, fontWeight: "700", color: C.ink },
  trainState: { fontSize: 11, fontWeight: "400", color: C.text },
  trainDetail: { fontSize: 11, color: C.text, marginTop: 9 },
  trainAge: { fontSize: 9, color: C.text, marginTop: 8 },
  empty: { alignItems: "center", paddingVertical: 30, gap: 10 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f4f6f2",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 13, color: C.ink, fontWeight: "600" },
  emptyBody: {
    fontSize: 11,
    lineHeight: 19,
    color: C.text,
    textAlign: "center",
  },
  selectedBar: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 25,
    paddingTop: 14,
    backgroundColor: C.white,
    gap: 10,
  },
  selectedSummary: { fontSize: 11, textAlign: "center", color: C.text },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(27,43,34,0.30)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 430,
    padding: 25,
    borderRadius: 22,
    backgroundColor: C.white,
    gap: 22,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.6,
  },
});
