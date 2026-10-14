// Voice/haptic guidance rules. Run: `pnpm --filter @workspace/sub-way-stand test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Forecast, SuppressReason } from '@/contracts';
import {
  HAPTIC_PATTERNS,
  NOW_LEAD_S,
  PRE_WARN_LEAD_S,
  REARM_AFTER_S,
  SIMULATION_PREFIX,
  type GuidanceAction,
  type GuidanceMemory,
  decideGuidance,
  initialGuidanceMemory,
  planOutput,
  resolveAvailability,
  pickKoreanVoice,
} from '../lib/guidanceRules.ts';

const T0 = Date.UTC(2026, 9, 14, 8, 0, 0);

function active(
  etaMin: number,
  opts: { curve?: string; turn?: 'left' | 'right'; sway?: Forecast['sway']; source?: Forecast['source'] } = {},
): Forecast {
  const turn = opts.turn ?? 'right';
  return {
    state: 'active',
    source: opts.source ?? 'live-estimate',
    segment: null,
    positionM: { min: 100, max: 140 },
    targetCurve: {
      id: opts.curve ?? 'C1',
      startOffsetM: 300,
      lengthM: 150,
      radiusM: 400,
      turn,
      source: 'station-geometry-approx',
      confidence: 'medium',
    },
    sway: opts.sway ?? (turn === 'right' ? 'left' : 'right'),
    etaWindowS: { min: etaMin, max: etaMin + 4 },
    lateralAccelMs2: { min: 0.3, max: 0.5 },
    confidence: 'medium',
    suppressReason: null,
    explanationKo: [],
    computedAt: new Date(T0).toISOString(),
  };
}

function suppressed(reason: SuppressReason, source: Forecast['source'] = 'live-estimate'): Forecast {
  return {
    state: 'suppressed',
    source,
    segment: null,
    positionM: null,
    targetCurve: null,
    sway: 'none',
    etaWindowS: null,
    lateralAccelMs2: null,
    confidence: 'unavailable',
    suppressReason: reason,
    explanationKo: [],
    computedAt: new Date(T0).toISOString(),
  };
}

/** Feed forecasts one per second; returns every non-`none` action. */
function run(seq: (Forecast | null)[], start: GuidanceMemory = initialGuidanceMemory(), t0 = T0) {
  let memory = start;
  const actions: GuidanceAction[] = [];
  seq.forEach((f, i) => {
    const d = decideGuidance(memory, f, t0 + i * 1000);
    memory = d.memory;
    if (d.action.type !== 'none') actions.push(d.action);
  });
  return { memory, actions };
}

const kinds = (a: GuidanceAction[]) => a.map((x) => (x.type === 'none' ? 'none' : x.kind));

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

test('pre-warning fires once the earliest entry is within the lead time, not before', () => {
  assert.equal(PRE_WARN_LEAD_S, 10);
  const { actions } = run([active(14), active(12), active(10.5)]);
  assert.deepEqual(actions, []);

  const r = run([active(10.5), active(9.6)]);
  assert.equal(r.actions.length, 1);
  const a = r.actions[0]!;
  assert.equal(a.type, 'announce');
  if (a.type !== 'announce') return;
  assert.equal(a.kind, 'pre-warning');
  assert.equal(a.curveId, 'C1');
  assert.equal(a.textKo, '약 10초 후 오른쪽 곡선입니다. 왼쪽으로 쏠림에 대비하세요.');
});

test('now cue fires at entry time (earliest entry ≤ NOW_LEAD_S) after the pre-warning', () => {
  const { actions } = run([active(9), active(6), active(3), active(1.5), active(NOW_LEAD_S), active(0.2)]);
  assert.deepEqual(kinds(actions), ['pre-warning', 'now']);
  const now = actions[1]!;
  assert.equal(now.type === 'announce' && now.textKo, '지금 곡선 진입. 왼쪽 쏠림 주의.');
});

test('a pre-warning that would be too late is skipped, the now cue still follows', () => {
  const { actions } = run([active(2.2), active(1.4), active(0.6)]);
  assert.deepEqual(kinds(actions), ['now']);
});

test('joining right at the curve gives only the now cue', () => {
  const { actions } = run([active(0)]);
  assert.deepEqual(kinds(actions), ['now']);
});

test('spoken seconds are the earliest entry, rounded, never 0', () => {
  const pre = (eta: number) => {
    const a = run([active(eta)]).actions[0];
    return a?.type === 'announce' ? a.textKo : null;
  };
  assert.match(pre(8.4)!, /^약 8초 후/);
  assert.match(pre(3)!, /^약 3초 후/);
  assert.equal(
    pre(7)!.startsWith('약 7초 후 왼쪽 곡선입니다'),
    false,
    'turn comes from the curve, not from the sway',
  );
  const left = run([active(7, { turn: 'left' })]).actions[0];
  assert.equal(left?.type === 'announce' && left.textKo, '약 7초 후 왼쪽 곡선입니다. 오른쪽으로 쏠림에 대비하세요.');
});

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

test('no repeated announcements for the same curve, even if the ETA bounces', () => {
  const { actions } = run([
    active(9.8),
    active(9.5),
    active(12), // estimate jumps back out of the lead window
    active(9.9),
    active(5),
    active(0.9),
    active(0.5),
    active(0.1),
  ]);
  assert.deepEqual(kinds(actions), ['pre-warning', 'now']);
});

test('each curve gets its own announcements', () => {
  const { actions } = run([active(9, { curve: 'C1' }), active(0.5, { curve: 'C1' }), active(9, { curve: 'C2', turn: 'left' }), active(0.5, { curve: 'C2', turn: 'left' })]);
  assert.deepEqual(
    actions.map((a) => (a.type === 'announce' ? `${a.curveId}:${a.kind}` : a.type)),
    ['C1:pre-warning', 'C1:now', 'C2:pre-warning', 'C2:now'],
  );
});

test('flicker back to a just-finished curve stays silent; a later lap is announced again', () => {
  const first = run([active(9, { curve: 'C1' }), active(0.5, { curve: 'C1' }), active(9, { curve: 'C2' })]);
  // C1 again 1 s later (flicker) → silent
  const flicker = run([active(9, { curve: 'C1' }), active(0.5, { curve: 'C1' })], first.memory, T0 + 3000);
  assert.deepEqual(flicker.actions, []);

  // simulation loop: C1 targeted again well after its episode ended
  const later = T0 + 3000 + (REARM_AFTER_S + 5) * 1000;
  const lap = run([active(9, { curve: 'C2' }), active(9, { curve: 'C1' }), active(0.5, { curve: 'C1' })], first.memory, later);
  assert.deepEqual(
    lap.actions.map((a) => (a.type === 'announce' ? `${a.curveId}:${a.kind}` : a.type)),
    ['C1:pre-warning', 'C1:now'],
  );
});

test('a curve re-approached from outside the lead window is a new approach, even soon after', () => {
  // short simulation loop: C1 passed, C2 passed, C1 targeted again from far away ~15 s later
  const first = run([active(9, { curve: 'C1' }), active(0.5, { curve: 'C1' }), active(9, { curve: 'C2' }), active(0.5, { curve: 'C2' })]);
  const lap = run([active(15, { curve: 'C1' }), active(12, { curve: 'C1' }), active(9.4, { curve: 'C1' }), active(0.7, { curve: 'C1' })], first.memory, T0 + 15_000);
  assert.deepEqual(
    lap.actions.map((a) => (a.type === 'announce' ? `${a.curveId}:${a.kind}` : a.type)),
    ['C1:pre-warning', 'C1:now'],
  );
});

test('same curve re-approached after a suppressed interval (no other curve in between) is announced again', () => {
  const s = suppressed('no-curve-ahead');
  const { actions } = run([active(9), active(0.5), s, s, s, active(14), active(12), active(9.5), active(0.6)]);
  assert.deepEqual(kinds(actions), ['pre-warning', 'now', 'pre-warning', 'now']);
});

test('short suppression blip after the now cue does not repeat it (flicker guard)', () => {
  const { actions } = run([active(9), active(0.5), suppressed('stale'), active(0.3), active(0.1)]);
  assert.deepEqual(kinds(actions), ['pre-warning', 'now']);
});

test('same curve back after REARM_AFTER_S of suppression is a fresh approach even inside the lead window', () => {
  const first = run([active(9), active(0.5), suppressed('stationary')]);
  const closedAt = T0 + 2000;
  const back = run([active(8), active(0.5)], first.memory, closedAt + REARM_AFTER_S * 1000);
  assert.deepEqual(kinds(back.actions), ['pre-warning', 'now']);
  const soon = run([active(8), active(0.5)], first.memory, closedAt + 5000);
  assert.deepEqual(soon.actions, []);
});

test('app in background: nothing is announced or consumed; the warning comes on return', () => {
  const start = initialGuidanceMemory();
  const bg = decideGuidance(start, active(8), T0, { appActive: false });
  assert.deepEqual(bg.action, { type: 'none' });
  assert.equal(bg.memory, start, 'memory untouched while backgrounded');
  const fg = decideGuidance(bg.memory, active(6.6), T0 + 1000, { appActive: true });
  assert.equal(fg.action.type === 'announce' && fg.action.textKo, '약 7초 후 오른쪽 곡선입니다. 왼쪽으로 쏠림에 대비하세요.');
});

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

test('nothing is spoken while the forecast is suppressed or missing', () => {
  const reasons: SuppressReason[] = ['stale', 'stationary', 'feed-unavailable', 'train-lost', 'no-curve-ahead', 'flag-disabled'];
  const { actions } = run([null, ...reasons.map((r) => suppressed(r))]);
  assert.deepEqual(actions, []);
});

test('an active forecast without a usable direction or curve is not announced', () => {
  const noSway = active(5, { sway: 'none' });
  const noCurve = { ...active(5), targetCurve: null };
  const badEta = { ...active(5), etaWindowS: { min: Number.NaN, max: 9 } };
  assert.deepEqual(run([noSway, noCurve, badEta]).actions, []);
});

test('pending speech is cancelled when the forecast flips to suppressed', () => {
  const { actions, memory } = run([active(9), suppressed('stale'), suppressed('stale')]);
  assert.deepEqual(kinds(actions), ['pre-warning', 'suppressed']);
  const cancel = actions[1]!;
  assert.equal(cancel.type, 'cancel');
  assert.equal(cancel.type === 'cancel' && cancel.curveId, 'C1');
  assert.match(cancel.type === 'cancel' ? cancel.textKo : '', /데이터가 오래되었습니다/);

  const plan = planOutput(cancel, { voiceOn: true, hapticsOn: true });
  assert.deepEqual(plan, { stopSpeech: true, speak: null, haptic: null });

  // Back to active for the same curve: no repeated pre-warning, the now cue may still come.
  const resumed = run([active(6), active(0.5)], memory, T0 + 3000);
  assert.deepEqual(kinds(resumed.actions), ['now']);
});

test('a lost forecast (null) also cancels a pending warning', () => {
  const { actions } = run([active(9), null]);
  assert.deepEqual(kinds(actions), ['pre-warning', 'suppressed']);
});

test('after the now cue, entering the curve (suppressed) does not cut the cue off', () => {
  const { actions } = run([active(9), active(0.5), suppressed('no-curve-ahead')]);
  assert.deepEqual(kinds(actions), ['pre-warning', 'now']);
});

// ---------------------------------------------------------------------------
// Wording: simulation prefix
// ---------------------------------------------------------------------------

test('simulation announcements are prefixed so they are never mistaken for live', () => {
  assert.equal(SIMULATION_PREFIX, '시뮬레이션 안내: ');
  const { actions } = run([active(9.2, { source: 'simulation', turn: 'left' }), active(0.4, { source: 'simulation', turn: 'left' })]);
  const texts = actions.map((a) => (a.type === 'announce' ? a.textKo : ''));
  assert.deepEqual(texts, [
    '시뮬레이션 안내: 약 9초 후 왼쪽 곡선입니다. 오른쪽으로 쏠림에 대비하세요.',
    '시뮬레이션 안내: 지금 곡선 진입. 오른쪽 쏠림 주의.',
  ]);
  const live = run([active(9.2)]).actions[0];
  assert.equal(live?.type === 'announce' && live.textKo.startsWith('시뮬레이션'), false);
});

// ---------------------------------------------------------------------------
// Toggle off + haptics
// ---------------------------------------------------------------------------

test('voice toggled off: no speech, haptics still fire, and nothing is replayed on re-enable', () => {
  let memory = initialGuidanceMemory();
  const step = (f: Forecast, i: number, voiceOn: boolean) => {
    const d = decideGuidance(memory, f, T0 + i * 1000);
    memory = d.memory;
    return planOutput(d.action, { voiceOn, hapticsOn: true });
  };
  const muted = step(active(9), 0, false);
  assert.equal(muted.speak, null);
  assert.equal(muted.stopSpeech, false);
  assert.deepEqual(muted.haptic, HAPTIC_PATTERNS['pre-warning']);

  // user turns voice back on mid-approach: the old pre-warning is not replayed
  const reenabled = step(active(7), 1, true);
  assert.deepEqual(reenabled, { stopSpeech: false, speak: null, haptic: null });
  const now = step(active(0.5), 2, true);
  assert.equal(now.speak, '지금 곡선 진입. 왼쪽 쏠림 주의.');
  assert.equal(now.stopSpeech, true, 'a new cue interrupts any speech still playing');
});

test('haptics flag off: speech only', () => {
  const a = run([active(9)]).actions[0]!;
  assert.deepEqual(planOutput(a, { voiceOn: true, hapticsOn: false }).haptic, null);
});

test('pre-warning and now cue use distinct haptic patterns', () => {
  assert.notDeepEqual(HAPTIC_PATTERNS['pre-warning'], HAPTIC_PATTERNS.now);
  assert.ok(HAPTIC_PATTERNS.now.length > HAPTIC_PATTERNS['pre-warning'].length);
});

// ---------------------------------------------------------------------------
// TTS availability
// ---------------------------------------------------------------------------

const KO = { identifier: 'ko-yuna', language: 'ko-KR' };
const EN = { identifier: 'en-sam', language: 'en-US' };

test('availability: flag off, missing Korean voice, or missing web speech API → unavailable', () => {
  const base = { flagOn: true, platform: 'web', speechApi: true, voices: [KO, EN] };
  assert.deepEqual(resolveAvailability(base), { available: true, voiceId: 'ko-yuna' });
  assert.equal(resolveAvailability({ ...base, flagOn: false }).available, false);
  assert.equal(resolveAvailability({ ...base, speechApi: false }).available, false);
  assert.equal(resolveAvailability({ ...base, voices: [EN] }).available, false);
  assert.equal(resolveAvailability({ ...base, voices: null }).available, false, 'voice list timed out');

  assert.deepEqual(resolveAvailability({ ...base, platform: 'ios' }), { available: true, voiceId: null });
  assert.equal(resolveAvailability({ ...base, platform: 'android', voices: [EN] }).available, false);
  assert.equal(resolveAvailability({ ...base, platform: 'android', voices: [] }).available, true);
  assert.equal(resolveAvailability({ ...base, platform: 'ios', voices: null }).available, true);
  assert.equal(resolveAvailability({ ...base, platform: 'windows' }).available, false);
});

test('Korean voice pick prefers ko-KR and enhanced quality', () => {
  const voices = [
    EN,
    { identifier: 'ko-generic', language: 'ko' },
    { identifier: 'ko-default', language: 'ko-KR', quality: 'Default' },
    { identifier: 'ko-enhanced', language: 'ko_KR', quality: 'Enhanced' },
  ];
  assert.equal(pickKoreanVoice(voices)?.identifier, 'ko-enhanced');
  assert.equal(pickKoreanVoice([EN, { identifier: 'kok', language: 'kok-IN' }]), null);
});
