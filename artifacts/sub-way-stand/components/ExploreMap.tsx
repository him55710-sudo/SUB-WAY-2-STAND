import { Feather } from "@expo/vector-icons";
import React, { memo, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Pattern,
  Rect,
  Text as MapText,
} from "react-native-svg";
import { LINE2_MAIN_LOOP } from "@/data/line2";

const MAP_W = 1000;
const MAP_H = 780;
const project = (lon: number, lat: number) => ({
  x: 110 + (lon - 126.89) * 3600,
  y: 180 + (37.5668 - lat) * 4700,
});
const STATIONS = LINE2_MAIN_LOOP.map((s) => ({
  ...s,
  ...project(s.lon, s.lat),
}));
const LOOP = `${STATIONS.map((s, i) => `${i ? "L" : "M"} ${s.x.toFixed(1)} ${s.y.toFixed(1)}`).join(" ")} Z`;
const MAJOR = new Set([
  "시청",
  "홍대입구",
  "합정",
  "당산",
  "신도림",
  "대림",
  "신림",
  "서울대입구",
  "사당",
  "교대",
  "강남",
  "선릉",
  "삼성",
  "종합운동장",
  "잠실",
  "잠실나루",
  "강변",
  "건대입구",
  "성수",
  "왕십리",
  "신당",
  "을지로3가",
]);
const DISTRICTS = [
  { name: "마포구", x: 205, y: 145 },
  { name: "중구", x: 475, y: 128 },
  { name: "성동구", x: 675, y: 188 },
  { name: "광진구", x: 845, y: 247 },
  { name: "영등포구", x: 140, y: 391 },
  { name: "동작구", x: 362, y: 479 },
  { name: "관악구", x: 294, y: 669 },
  { name: "서초구", x: 607, y: 604 },
  { name: "강남구", x: 735, y: 496 },
  { name: "송파구", x: 953, y: 470 },
];

function MapControl({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Feather name={icon} size={20} color="#475569" />
    </Pressable>
  );
}

/** A bundled station-coordinate map. Decorative streets are schematic, never a live basemap. */
export const ExploreMap = memo(function ExploreMap({
  station,
  onStationPress,
  demoFrom,
  demoTo,
  compact,
  line = 2,
}: {
  station: string | null;
  onStationPress: (name: string) => void;
  demoFrom: string;
  demoTo: string;
  compact: boolean;
  line?: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 1000, height: 780 });
  const gesture = useRef({ x: 0, y: 0, units: 1 });
  const frame = useRef({ offset, zoom, size });
  frame.current = { offset, zoom, size };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) + Math.abs(g.dy) > 8,
        onPanResponderGrant: () => {
          const f = frame.current;
          gesture.current = {
            ...f.offset,
            units:
              Math.max(MAP_W / f.size.width, MAP_H / f.size.height) / f.zoom,
          };
        },
        onPanResponderMove: (_, g) =>
          setOffset({
            x: Math.max(
              -450,
              Math.min(450, gesture.current.x - g.dx * gesture.current.units),
            ),
            y: Math.max(
              -350,
              Math.min(350, gesture.current.y - g.dy * gesture.current.units),
            ),
          }),
      }),
    [],
  );
  const selected = STATIONS.find((s) => s.name === station);
  const from = STATIONS.find((s) => s.name === demoFrom);
  const to = STATIONS.find((s) => s.name === demoTo);
  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };
  const showRoute = line === 2;

  return (
    <View style={styles.map} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`${(MAP_W - MAP_W / zoom) / 2 + offset.x} ${(MAP_H - MAP_H / zoom) / 2 + offset.y} ${MAP_W / zoom} ${MAP_H / zoom}`}
          accessibilityLabel="서울 2호선 역 좌표 기반 데모 지도. 실제 선로 위치와 다를 수 있습니다."
        >
          <Defs>
            <Pattern
              id="city-blocks"
              width="124"
              height="106"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-13)"
            >
              <Rect width="124" height="106" fill="#efeee8" />
              <Rect x="8" y="8" width="45" height="38" rx="4" fill="#e6e5df" />
              <Rect x="63" y="8" width="53" height="38" rx="4" fill="#e8e7e1" />
              <Rect x="8" y="57" width="67" height="41" rx="4" fill="#e7e6df" />
              <Rect
                x="86"
                y="57"
                width="30"
                height="41"
                rx="4"
                fill="#e4e4dd"
              />
              <Path
                d="M0 51 H124 M58 0 V51 M80 51 V106"
                stroke="#fafaf7"
                strokeWidth="5"
              />
            </Pattern>
          </Defs>
          <Rect
            x="-1000"
            y="-1000"
            width="3000"
            height="2800"
            fill="url(#city-blocks)"
          />
          <Path
            d="M-100 237 Q80 218 148 273 Q230 330 338 340 Q458 356 542 359 Q660 359 735 311 Q833 250 872 299 Q920 358 1007 329 L1150 280 L1150 374 Q1000 450 937 397 Q880 347 833 365 Q723 430 608 428 Q430 425 310 405 Q200 385 106 330 Q22 280 -100 315Z"
            fill="#b9ddec"
          />
          <Path
            d="M230 323 Q307 337 329 362 Q312 379 276 363 Q243 350 230 323"
            fill="#dbe7c8"
          />
          <Path
            d="M448 271 Q490 228 528 248 L545 295 Q492 317 448 271Z"
            fill="#d7e2c7"
          />
          <Path
            d="M613 336 Q642 309 685 319 L674 339 Q640 358 613 336"
            fill="#d7e2c7"
          />
          <Path
            d="M834 80 Q898 42 974 113 L948 211 Q878 210 824 164Z"
            fill="#d7e2c7"
          />
          <Path
            d="M546 639 Q628 612 691 686 L648 805 L522 805Z"
            fill="#d7e2c7"
          />
          <G stroke="#dcd6c5" strokeWidth="13" fill="none">
            <Path d="M-80 178 Q235 88 449 154 Q664 204 1080 218" />
            <Path d="M-20 619 Q355 705 535 543 Q705 448 1130 426" />
            <Path d="M301 -80 Q358 207 390 369 Q410 597 473 870" />
            <Path d="M774 -60 Q764 200 780 395 Q808 570 860 840" />
          </G>
          <G stroke="#fffdf5" strokeWidth="8" fill="none">
            <Path d="M-80 178 Q235 88 449 154 Q664 204 1080 218" />
            <Path d="M-20 619 Q355 705 535 543 Q705 448 1130 426" />
            <Path d="M301 -80 Q358 207 390 369 Q410 597 473 870" />
            <Path d="M774 -60 Q764 200 780 395 Q808 570 860 840" />
          </G>
          {DISTRICTS.map((d) => (
            <MapText
              key={d.name}
              x={d.x}
              y={d.y}
              fontSize="20"
              fill="#a5aaa0"
              fontWeight="500"
              textAnchor="middle"
              letterSpacing="3"
            >
              {d.name}
            </MapText>
          ))}
          <MapText
            x="522"
            y="392"
            fontSize="17"
            fill="#6b9aac"
            textAnchor="middle"
            letterSpacing="8"
          >
            한강
          </MapText>
          <MapText
            x="491"
            y="278"
            fontSize="11"
            fill="#859273"
            textAnchor="middle"
          >
            남산
          </MapText>
          <MapText
            x="635"
            y="326"
            fontSize="10"
            fill="#859273"
            textAnchor="middle"
          >
            서울숲
          </MapText>
          {showRoute ? (
            <>
              <Path
                d={LOOP}
                fill="none"
                stroke="#ffffff"
                strokeWidth="11"
                strokeLinejoin="round"
              />
              <Path
                d={LOOP}
                fill="none"
                stroke="#30a66b"
                strokeWidth="5"
                strokeLinejoin="round"
              />
              {from && to ? (
                <>
                  <Line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#ffffff"
                    strokeWidth="17"
                    strokeLinecap="round"
                  />
                  <Line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#1a73e8"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                </>
              ) : null}
              {STATIONS.map((s, i) => {
                const major = MAJOR.has(s.name);
                const active = station === s.name;
                const below = i >= 11 && i <= 28;
                return (
                  <G key={s.name} onPress={() => onStationPress(s.name)}>
                    <Circle cx={s.x} cy={s.y} r={16} fill="transparent" />
                    <Circle
                      cx={s.x}
                      cy={s.y}
                      r={major ? 5 : 3.5}
                      fill="#ffffff"
                      stroke={active ? "#1a73e8" : "#30a66b"}
                      strokeWidth="2"
                    />
                    {major || zoom > 1.4 ? (
                      <G>
                        <MapText
                          x={s.x + (i <= 11 ? -10 : 9)}
                          y={s.y + (below ? 21 : -12)}
                          fontSize="12"
                          fontWeight={active ? "700" : "500"}
                          fill="none"
                          stroke="#fafaf7"
                          strokeWidth="3"
                          textAnchor={i <= 11 ? "end" : "start"}
                        >
                          {s.name}
                        </MapText>
                        <MapText
                          x={s.x + (i <= 11 ? -10 : 9)}
                          y={s.y + (below ? 21 : -12)}
                          fontSize="12"
                          fontWeight={active ? "700" : "500"}
                          fill={active ? "#1a73e8" : "#52605b"}
                          textAnchor={i <= 11 ? "end" : "start"}
                        >
                          {s.name}
                        </MapText>
                      </G>
                    ) : null}
                  </G>
                );
              })}
              {selected ? (
                <G>
                  <Circle
                    cx={selected.x}
                    cy={selected.y}
                    r="23"
                    fill="#1a73e8"
                    opacity="0.12"
                  />
                  <Path
                    d={`M ${selected.x} ${selected.y - 7} C ${selected.x - 7} ${selected.y - 19} ${selected.x - 17} ${selected.y - 25} ${selected.x - 17} ${selected.y - 37} A 17 17 0 1 1 ${selected.x + 17} ${selected.y - 37} C ${selected.x + 17} ${selected.y - 25} ${selected.x + 7} ${selected.y - 19} ${selected.x} ${selected.y - 7} Z`}
                    fill="#1a73e8"
                    stroke="#ffffff"
                    strokeWidth="3"
                  />
                  <Circle
                    cx={selected.x}
                    cy={selected.y - 37}
                    r="5"
                    fill="#ffffff"
                  />
                </G>
              ) : null}
            </>
          ) : null}
        </Svg>
      </View>
      {!showRoute ? (
        <View style={styles.unmapped}>
          <Feather name="map" size={20} color="#64748b" />
          <Text style={styles.unmappedTitle}>{line}호선 지도 준비 중</Text>
          <Text style={styles.unmappedBody}>
            열차 목록은 열차 찾기에서 확인할 수 있어요.
          </Text>
          <Text style={styles.unmappedBody}>
            현재 데모 지도는 2호선만 제공합니다.
          </Text>
        </View>
      ) : null}
      <View style={[styles.controls, compact && styles.controlsCompact]}>
        <View style={styles.compass}>
          <Text style={styles.north}>N</Text>
          <Feather name="navigation-2" size={16} color="#e06c64" />
        </View>
        <View style={styles.controlGroup}>
          <MapControl
            icon="plus"
            label="지도 확대"
            disabled={zoom >= 2.4}
            onPress={() =>
              setZoom((z) => Math.min(2.4, +(z + 0.35).toFixed(2)))
            }
          />
          <View style={styles.divider} />
          <MapControl
            icon="minus"
            label="지도 축소"
            disabled={zoom <= 1}
            onPress={() => setZoom((z) => Math.max(1, +(z - 0.35).toFixed(2)))}
          />
        </View>
        <View style={styles.controlGroup}>
          <MapControl icon="maximize" label="지도 전체 보기" onPress={reset} />
        </View>
      </View>
      <View pointerEvents="none" style={styles.attribution}>
        <Text style={styles.attributionText}>
          데모 지도 · 역 좌표 OSM © OpenStreetMap contributors (ODbL) · 배경
          도식
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: "#eeeee7", overflow: "hidden" },
  controls: {
    position: "absolute",
    right: 22,
    bottom: 58,
    gap: 12,
    alignItems: "center",
  },
  controlsCompact: { right: 12, bottom: 35, gap: 8 },
  controlGroup: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    boxShadow: "0 2px 12px rgba(40,60,50,0.12)",
    overflow: "hidden",
  },
  control: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: 1, marginHorizontal: 10, backgroundColor: "#edf0ed" },
  compass: {
    gap: 3,
    alignItems: "center",
    padding: 8,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    width: 44,
  },
  north: { color: "#6b7280", fontSize: 10, fontWeight: "700" },
  attribution: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.84)",
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  attributionText: { color: "#646e68", fontSize: 10, textAlign: "right" },
  unmapped: {
    position: "absolute",
    top: "38%",
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 24,
    gap: 10,
    alignItems: "center",
    boxShadow: "0 4px 24px rgba(40,60,50,0.10)",
  },
  unmappedTitle: { fontSize: 18, fontWeight: "700", color: "#24322a" },
  unmappedBody: { fontSize: 12, color: "#64746b" },
});
