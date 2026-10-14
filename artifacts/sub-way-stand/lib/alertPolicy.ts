/**
 * When may the app speak a sway warning? Deliberately strict.
 * Type-only imports so it runs under `node --test`.
 */
import type { Forecast } from "./physics";

export const ALERT_LEAD_S = 6; // announce when nominal arrival is ≤ 6 s away
export const ALERT_TOO_LATE_S = 1; // closer than this, a warning would arrive too late

export type AlertBlock =
  | "live_mode" // live data has no verified geometry → never auto-alert
  | "paused"
  | "background"
  | "suppressed"
  | "no_curve"
  | "too_early"
  | "too_late"
  | "already_alerted";

export type AlertInput = {
  mode: "live" | "demo";
  running: boolean;
  appActive: boolean;
  forecast: Forecast | null;
  etaSeconds: number | null;
  curveKey: string | null;
  alerted: ReadonlySet<string>;
};

export type AlertDecision =
  | { alert: true; side: "left" | "right"; key: string }
  | { alert: false; block: AlertBlock };

export function decideAlert(i: AlertInput): AlertDecision {
  if (i.mode !== "demo") return { alert: false, block: "live_mode" };
  if (!i.running) return { alert: false, block: "paused" };
  if (!i.appActive) return { alert: false, block: "background" };
  if (!i.forecast || i.forecast.suppressed || i.forecast.sway === "none") {
    return { alert: false, block: "suppressed" };
  }
  if (!i.curveKey || i.etaSeconds === null || !Number.isFinite(i.etaSeconds)) {
    return { alert: false, block: "no_curve" };
  }
  if (i.etaSeconds > ALERT_LEAD_S) return { alert: false, block: "too_early" };
  if (i.etaSeconds < ALERT_TOO_LATE_S) return { alert: false, block: "too_late" };
  if (i.alerted.has(i.curveKey)) return { alert: false, block: "already_alerted" };
  return { alert: true, side: i.forecast.sway, key: i.curveKey };
}
