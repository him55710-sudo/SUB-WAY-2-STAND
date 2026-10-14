# Motion OS — Dark Edition

> Quiet black glass. One lime signal, only when the physics is verified.

This is the **final** design direction, confirmed by the user on 2026-10-14 ("디자인 1번", dark Motion Live).
It covers the two existing screens only: **Select Train (열차 선택)** and **Motion Live (탑승 안내)**. There are no menus, tabs or extra screens, and no new features.
Tokens live in `design/tokens.ts`, which has no imports. Apply them through `constants/colors.ts` and `hooks/useColors.ts`.

These references set a level of quality, not a look to copy:
- Wallet: one tidy pass with identity first.
- Nothing: restrained tech, mono numerals, dot glyphs.
- Linear: hairline structure and strict text hierarchy.

---

## 1. Principles

1. **Calm by default.** With no verified event, the screen is grey and white type on black, with almost no movement.
2. **Lime means verified.** Neon lime is the brand point, and on Motion Live it appears **only** for a verified, unsuppressed forecast.
3. **Never colour alone.** Every state and every risk level is shown with a glyph and words as well. Intensity uses filled segments and a word, never a redder colour.
4. **Don't exaggerate.** Motion is measurement at a fixed scale. One short entrance per event, then stillness.
5. **No decoration.** No shadows, no gradients, no cards inside cards, no charts. Structure comes from type, spacing and hairlines.

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| `ink` | `#05070B` | Background (deep black, navy cast) |
| `surface` | `#0C111B` | Dark navy, the only surface level |
| `raised` | `#131A27` | Pressed or selected surface |
| `hairline` | `#1A2232` | 1 px separators |
| `text` / `text2` / `text3` | `#F3F5F7` / `#8A94A6` / `#556074` | Three-level text hierarchy |
| **`lime`** | **`#C8FF3C`** | Brand point: wordmark dot, primary CTA, selection ring. On Motion Live, verified-event direction, seconds and dot only |
| `onLime` | `#0A0D05` | Text on lime |
| `live` | `#5BD6FF` | LIVE tag (with ● glyph) |
| `sim` | `#B9A6FF` | SIMULATION tag (with ◆ glyph) |
| `hold` | `#8A94A6` | HOLD tag (with a dashed-ring — glyph) |
| `error` | `#FF6B5E` | Network or key errors, always with an alert icon and a sentence |

Seoul line colours are used **only** for line identity: the line badge, the selected-row bar and the route stroke.

No state colour ever fills a background. Lime never appears in Motion Live's calm, hold or paused modes.

## 3. Typography: bold and big

- Korean uses the system font, with weight carrying the hierarchy.
- Numbers and Latin tags use Inter, tabular.

| Role | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 64 / 66, −1.5 | 800 | Event direction "오른쪽". One per screen |
| `figure` | 48 / 52 | Inter 700 | Event seconds "4–9" plus a small "초 후" in `headline` |
| `title` | 34 / 40 | 800 | Line name on the pass, Motion Live station |
| `headline` | 24 / 30 | 800 | Calm or hold status line |
| `body` | 16 / 24 | 500 | Rows, reasons |
| `label` | 13 / 18 | 600 | Metadata |
| `tag` | 11 / 14, +1.2, caps | Inter 700 | `LIVE` / `SIMULATION` / `HOLD` |

The layout must fit 375 pt width with no truncation of the station, direction or seconds.

## 4. Space and shape

- 4 pt grid, gutter 20, section gap 36.
- Radius: the pass is 24, controls are 16, pills are 999.
- No `shadow*`, `elevation` or gradients. Touch targets are at least 48 pt.

## 5. State Tag (shown everywhere a data source matters)

| State | Glyph | Text | Motion |
|---|---|---|---|
| LIVE | ● | `LIVE · 실시간 관측` | Dot breathes (opacity 0.55→1, 2.4 s). Static when reduced motion is on |
| SIMULATION | ◆ | `SIMULATION · 합성 시연` | Static |
| HOLD | dashed ring — | `HOLD · 예측 보류` | Static |

- A live train always shows **LIVE + HOLD**, because station-level data has no verified geometry.
- The demo always shows **SIMULATION** plus the line "실제 열차와 무관한 가상 선로".

## 6. Select Train

1. **Header row.** The `SUB WAY 2 STAND` wordmark (tag style, 13 pt) followed by a 6 pt lime dot. There is no menu.
2. **Line pass** (surface, radius 24, the only large surface).
   - A 48 pt line-colour badge with the number, then the line name in `title` style.
   - Nine line dots (40 pt, in line colours). The selected one gets a 2 pt **lime ring**.
   - A direction segmented control (상행/하행, or 내선/외선 for Line 2). The thumb slides in 180 ms.
   - A station field followed by recent-station pills.
3. **Demo row.** It has a hairline border and no fill:
   - Text: "◆ SIMULATION · 키 없이 체험 — 가상 선로 쏠림 예측".
   - Right: a chevron.
4. **Train rows** (hairline-separated, no cards).
   - Left: the station in `headline`, with "{dest}행 · {direction} · {no.}" below in `text2`.
   - Right: the state word, the age in Inter `text3`, and a LIVE tag.
   - Selected row: a 3 pt left bar in the **line colour** plus a lime check.
5. **Feed states** are inline: loading, empty, missing key, quota, degraded and error. Each has one sentence, a glyph and at most one action. Errors use the `error` colour plus an icon.
6. **Confirm bar.** It is fixed at the bottom with a **lime fill and onLime text**, reading "이 열차로 시작". It slides up in 220 ms when a train is selected.

## 7. Motion Live

```
[←]  ● 2  강남 → 성수                        [State Tag]
────────────────────────────────────────────────
HERO  (mode-dependent, fixed height — no layout jump)
INSTRUMENT  (hairline track + weighted dot)
────────────────────────────────────────────────
속도 · 곡선 반경 · 횡가속도   (Inter, text2, one row)
Route strip (simulation: SYN-A plan / live: prev · current · next)
────────────────────────────────────────────────
음성 · 진동 · 음성 테스트 · (demo) 일시정지
```

### Hero modes
| Mode | When | Content | Colour |
|---|---|---|---|
| **Calm** | No unsuppressed forecast within 12 s | `headline` "직선 구간 · 쏠림 없음" plus `text2` "다음 곡선까지 약 18초" | White and grey only |
| **Event** | Unsuppressed, window start ≤ 12 s | `display` "오른쪽 →", then `figure` "4–9" with "초 후", then segments ▮▮▯ with "쏠림 보통 · 신뢰도 높음", then the `text2` safety line | **Lime** on direction, seconds and dot |
| **In curve** | Inside the curve | `headline` "곡선 통과 중 · 오른쪽으로 쏠리는 중" | Direction word in lime at headline size |
| **Hold** | Live train, or suppressed | `headline` "예측 보류" plus a hairline list of reasons | Grey. Dashed track, hollow dot, **no direction anywhere** |
| **Paused** | Demo paused or app in background | `headline` "일시정지됨 · 음성 안내 중지" | Grey |

### Event entrance (the only "showy" motion)
- The direction word and seconds fade in while sliding 12 px from the sway side, in 240 ms.
- The arrow nudges 6 px toward the sway side **once**, over 320 ms.
- A warning haptic fires once per curve (demo, native, haptics on).
- After that, everything is still except the dot, and the countdown ticks at 1 Hz.
- Reduced motion: the content appears instantly with no slide or nudge.

### Instrument
- A 3 pt hairline track with ticks at 0, ±0.5 and ±1.0 m/s². End labels read 왼쪽 and 오른쪽.
- The weighted dot is 30 pt, ivory when calm and lime during an event. Displacement is `a_y / 1.0` × half-width, clamped, at a fixed scale.
- The ghost ring is 30 pt, dashed in `limeFaint`, at the predicted a_y. It appears in Event mode only.
- The spring is near-critically damped (no visible bounce). No tilt, shake, glow or trail.
- The legend is one line in `text3`: "● 몸이 쏠리는 방향 ◌ 예측 · 끝 = 1.0 m/s²".

## 8. Safety rules for motion

1. At most one moving element in the hero (the dot), plus a single entrance per event.
2. No flashing, strobing, looping pulses on warnings, shaking, or full-screen colour changes.
3. Risk is never shown by colour alone: direction word, arrow, seconds, segments and text all carry it.
4. When the hero leaves Event mode (pause, background, suppression), speech and haptics stop.
5. Copy never tells riders to lean and never implies a handrail is always reachable.

## 9. Micro-interactions

| Interaction | Spec |
|---|---|
| Press | Scale 0.97, opacity 0.88, 110 ms |
| Line or direction change | Ring or thumb slides 180 ms, plus `Haptics.selectionAsync()` (native, haptics on) |
| Rows appear | Fade and 6 px rise, 35 ms stagger, max 6. None with reduced motion |
| Select a row | Line-colour bar grows over 140 ms and the lime check fades in |
| Confirm bar | Slides up over 220 ms |
| Event start | The entrance above plus a single warning haptic |

## 10. Acceptance checklist
- [ ] Only two screens. No tabs, drawers or menus. The native header is dark or hidden.
- [ ] No `shadow*`, `elevation` or gradient in screens or components. No card inside a card. No charts.
- [ ] Lime is absent from Motion Live in calm, hold and paused modes.
- [ ] Live trains never show a direction word or lime.
- [ ] Every state and risk level is readable in greyscale through glyphs, words and segments.
- [ ] Reduced motion disables the entrance, nudge, stagger and breathing. The countdown stays at 1 Hz.
- [ ] 375 pt width with no truncation. Touch targets are at least 48 pt. Web insets are 67 top and 34 bottom.
