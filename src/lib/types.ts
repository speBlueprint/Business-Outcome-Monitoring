import type { Band } from "./stats";

export type Outcome = "success" | "failed";
export type FlowType = "Queue consumer" | "Scheduled flow" | "Producer flow";
export type Status = "healthy" | "attn" | "awaiting";
export type MonitorMode = "inferred" | "custom" | "none";
export type AlertType =
  | "Run Duration" | "Runs Per Day" | "Queue Success Rate" | "Queue Kickout Rate" | "Queue Error Rate"
  | "Producer Items Added" | "Run Frequency" | "Consecutive Failed Runs" | "Flow Paused";

export interface Run {
  t: number; duration: number; outcome: Outcome;
  qTotal?: number; qError?: number; qKick?: number; qProcessed?: number;
  items?: number;
  error?: string; mode?: string; machine?: string; execDuration?: number | null; queuedDuration?: number;
  _uid: string;
  /* set by analyze() */
  _excl?: boolean; _durBad?: boolean; _koBad?: boolean; _errBad?: boolean; _succBad?: boolean; _itemsBad?: boolean;
}
export interface Range { from: number; to: number; label: string }
export interface Excl { weekends: boolean; days: number[]; ranges: Range[] }
export interface Recipient { email: string; title?: string }
export interface Condition {
  type: AlertType; name: string; dir?: "above" | "below";
  reason: string; observed: string; threshold: string; activatedAt: number;
}
/* Alert History row. Written on activation, never derived from live conditions (FR-6.2). */
export interface Episode { type: AlertType; name: string; observed: string; threshold: string; activatedAt: number; clearedAt: number | null; t: number }
export interface Eval { evaluated: boolean; excluded: boolean; bad: boolean; band: Band | null; v: number }
export interface DayPoint { t: number; day: number; count: number; _excl: boolean; _bad?: boolean; _evaluated?: boolean; _band?: Band | null }
export interface OutcomeDay extends DayPoint { succ: number; fail: number; _succBad?: boolean; _failBad?: boolean; _succBand?: Band | null; _failBand?: Band | null }

export interface Field { mode: "inferred" | "custom"; val: number; _inferred?: number | null }
export interface Settings {
  fields: Record<string, Field>;
  rules: { freqWindow: number; consecFail: number; pauseHours: number };
  types: Record<string, boolean>;
  basisN: number;
}
export interface Custom { durMin: number; durMax: number; freqWindow: number }

/* What the data file declares for a flow. */
export interface FlowSpec {
  id: string; name: string; type: FlowType; env: string; desc: string;
  freqWindowH?: number | null; excl: Excl | null; recipients: Recipient[]; runs: Run[];
  paused?: boolean; pausedSince?: number;
  customConfigured?: boolean; customSetAtRuns?: number; offerInferred?: boolean; custom?: Custom | null;
  pauseThresholdH?: number; consecFailN?: number;
}
/* A flow plus everything analyze() derives from its runs. */
export interface Flow extends FlowSpec {
  machine: string; lastModified: number;
  _runs: Run[]; _included: Run[]; eligible: boolean; monitorMode: MonitorMode; monitored: boolean;
  hasQueue: boolean; hasItems: boolean;
  evDur: Eval[]; bDur: Band | null;
  rpd: DayPoint[]; evRpd: Eval[]; bRpd: Band | null;
  obd: OutcomeDay[]; evSuccDay: Eval[]; evFailDay: Eval[]; bSuccDay: Band | null; bFailDay: Band | null;
  _q: Run[]; evKo: Eval[]; evErr: Eval[]; evSucc: Eval[]; bKo: Band | null; bErr: Band | null; bSucc: Band | null;
  _p: Run[]; evItems: Eval[]; bItems: Band | null;
  _streak: number; conditions: Condition[]; status: Status; history: Episode[];
  _epSeeded: boolean; _exclDismissed: boolean; _set: Settings | null;
}
