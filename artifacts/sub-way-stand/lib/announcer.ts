/**
 * Korean voice announcer over an injected speech port (expo-speech in the app,
 * a fake in tests). No value imports so it runs under `node --test`.
 *
 * Rules:
 *  - every announcement stops any current speech first (no overlapping voices)
 *  - turning voice off stops speech immediately
 *  - the test button always plays, even when voice is off (explicit user action)
 */

export const TEST_PHRASE =
  "음성 테스트입니다. 잠시 후 오른쪽으로 쏠릴 수 있습니다. 균형에 유의하세요.";

export const SAFETY_GUIDANCE =
  "이동을 잠시 멈추고, 가능한 범위에서 안정적인 자세를 유지하세요.";

export function warningPhrase(side: "left" | "right"): string {
  const dir = side === "left" ? "왼쪽" : "오른쪽";
  return `시연입니다. 잠시 후 ${dir}으로 쏠릴 수 있습니다. 균형에 유의하세요.`;
}

export interface SpeechPort {
  speak(text: string): void;
  stop(): void;
}

export type Announcer = {
  readonly voiceEnabled: boolean;
  readonly lastSpoken: string | null;
  setVoiceEnabled(enabled: boolean): void;
  announce(text: string): boolean;
  test(): void;
  stop(): void;
};

export function createAnnouncer(port: SpeechPort, opts: { voiceEnabled: boolean }): Announcer {
  let enabled = opts.voiceEnabled;
  let last: string | null = null;
  const say = (text: string) => {
    port.stop();
    port.speak(text);
    last = text;
  };
  return {
    get voiceEnabled() {
      return enabled;
    },
    get lastSpoken() {
      return last;
    },
    setVoiceEnabled(next) {
      enabled = next;
      if (!next) port.stop();
    },
    announce(text) {
      if (!enabled) return false;
      say(text);
      return true;
    },
    test() {
      say(TEST_PHRASE);
    },
    stop() {
      port.stop();
    },
  };
}
