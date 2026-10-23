/* One store for the whole demo: where the viewer is (estate or a flow, which tab, which window), the open
   dialog, the toast, the presenter walkthrough, and a tick that bumps after every engine mutation so
   React re-renders against the engine's (mutable) flow records. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ALERTING, reanalyze } from "../lib/engine";

export type View = "home" | "flow";
export type Tab = "overview" | "history" | "settings";
export type Win = 7 | 30 | 90;
export type Modal =
  | { kind: "activate" } | { kind: "review" } | { kind: "schedule"; fid: string } | { kind: "mail"; fid: string } | { kind: "recipient"; fid: string } | null;

export interface State {
  view: View; flowId: string; tab: Tab; win: Win; modal: Modal; toast: string | null; selected: string[]; toolsOpen: boolean;
  step: number; shortMode: boolean; present: boolean; hideNotes: boolean; tick: number;
}
const fresh = (): State => ({ view: "home", flowId: "invoice", tab: "overview", win: 90, modal: null, toast: null, selected: [], toolsOpen: false, step: 0, shortMode: false, present: false, hideNotes: false, tick: 0 });

/* Walkthrough. Each step says where it is, what the presenter says, and the state it puts the app in. */
export interface Step { where: string; t: string; d: string; set: (s: State) => State }
const flow = (s: State, id: string, tab: Tab = "overview", win: Win = 90): State => ({ ...s, view: "flow", flowId: id, tab, win, modal: null, selected: [], toolsOpen: false });
export const STEPS: Step[] = [
  { where: "Tools › Business Outcome Monitoring", t: "Estate health", d: "Two layers on one page. Health judges each flow against its own history and says what needs attention now. Activity reports what happened. Health can be empty; Activity never is.", set: (s) => ({ ...s, view: "home", modal: null, toolsOpen: false, win: 90 }) },
  { where: "Estate › Set up alerting", t: "Turn on email alerting", d: "The views already work. Providing one alert email turns on notifications across the estate, then a review of schedule exclusions so weekends do not flag as missed runs.", set: (s) => ({ ...s, view: "home", modal: { kind: "activate" }, toolsOpen: false }) },
  { where: "GL Reconciliation › Overview", t: "A silent failure", d: "Every run succeeded. Items added collapsed from about 420 to about 24. No error, no failed run, no alert from Power Automate. The producer stopped doing work.", set: (s) => flow(s, "gl") },
  { where: "GL Reconciliation › Alert History", t: "Alert History", d: "Every condition episode this flow has ever raised, with when it activated and when it cleared. Rows are written on activation and never removed.", set: (s) => flow(s, "gl", "history") },
  { where: "PO Matching › Overview", t: "Several conditions at once", d: "One run tripped duration, kickout rate and error rate, and the flow has failed three times in a row. Four conditions, each with its own observed value and threshold.", set: (s) => flow(s, "po") },
  { where: "PO Matching › Notification preview", t: "One email, plain language", d: "Conditions from the same run are batched into one notification. The wording is for the business process owner: no statistics, and a link into the flow for the technical reader.", set: (s) => ({ ...flow(s, "po", "settings"), modal: { kind: "mail", fid: "po" } }) },
  { where: "Daily Bank Reconciliation › Overview", t: "Weekend false positives", d: "A weekday-only flow with no schedule exclusions set, so weekend zero-run days are flagged. Open Schedule Settings, exclude weekends, and watch the anomalies clear.", set: (s) => flow(s, "bank", "overview", 30) },
  { where: "Vendor Onboarding › Overview", t: "The run that did not happen", d: "The last run succeeded 26 hours ago and the window is 24 hours. There is no bad run to find; the problem is that nothing has happened since. Time of Issue is when the window elapsed.", set: (s) => flow(s, "vendor") },
  { where: "Invoice Processing › Settings", t: "Inferred or custom, per bound", d: "Every threshold was inferred from this flow's own history and is shown in plain language. Edit a bound and it becomes Custom; revert it any time. Nine alert types, each on or off independently.", set: (s) => flow(s, "invoice", "settings") },
  { where: "Quarterly Compliance Report › Overview", t: "Awaiting a baseline", d: "Four runs in 90 days is below the minimum of ten, so nothing is inferred. Set custom baselines to start monitoring now; the pause check applies regardless.", set: (s) => flow(s, "quarterly") },
];
export const SHORT = [0, 2, 5, 6, 8];

interface Ctx {
  S: State; path: number[]; isLast: boolean;
  set: (patch: Partial<State>) => void;
  go: (v: View) => void; openFlow: (id: string, tab?: Tab) => void; setTab: (t: Tab) => void; setWin: (w: Win) => void;
  openModal: (m: Modal) => void; closeModal: () => void; toast: (m: string) => void;
  /* Run an engine mutation, re-render, and show its message if it returns one. */
  mutate: (fn: () => string | void, opts?: { reanalyze?: boolean }) => void;
  toggleSelected: (uid: string, on: boolean) => void; setSelected: (uids: string[]) => void;
  move: (dir: number) => void; reset: () => void; escape: () => void;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [S, setS] = useState<State>(() => STEPS[0].set(fresh()));
  const toastTimer = useRef<number | null>(null);
  const set = useCallback((patch: Partial<State>) => setS((s) => ({ ...s, ...patch })), []);
  const toast = useCallback((msg: string, ms = 3200) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setS((s) => ({ ...s, toast: msg }));
    toastTimer.current = window.setTimeout(() => setS((s) => ({ ...s, toast: null })), ms);
  }, []);
  const mutate = useCallback((fn: () => string | void, opts?: { reanalyze?: boolean }) => {
    const msg = fn();
    if (opts?.reanalyze) reanalyze();
    setS((s) => ({ ...s, tick: s.tick + 1 }));
    if (msg) toast(msg);
  }, [toast]);

  const pathOf = (s: State) => (s.shortMode ? SHORT : STEPS.map((_, i) => i));
  const goTo = (s: State, i: number, dir: number): State => {
    i = Math.max(0, Math.min(STEPS.length - 1, i));
    if (s.shortMode && !SHORT.includes(i)) { const f = dir < 0 ? [...SHORT].reverse().find((x) => x <= i) : SHORT.find((x) => x >= i); i = f == null ? (dir < 0 ? SHORT[0] : SHORT[SHORT.length - 1]) : f; }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    return STEPS[i].set({ ...s, step: i, modal: null, toast: null });
  };

  const value = useMemo<Ctx>(() => ({
    S, path: pathOf(S), isLast: S.step === pathOf(S)[pathOf(S).length - 1], set,
    go: (v) => set({ view: v, modal: null, toolsOpen: false, selected: [] }),
    openFlow: (id, tab = "overview") => set({ view: "flow", flowId: id, tab, modal: null, toolsOpen: false, selected: [] }),
    setTab: (t) => set({ tab: t, selected: [] }),
    setWin: (w) => set({ win: w }),
    openModal: (m) => set({ modal: m }),
    closeModal: () => set({ modal: null }),
    toast, mutate,
    toggleSelected: (uid, on) => setS((s) => ({ ...s, selected: on ? Array.from(new Set([...s.selected, uid])) : s.selected.filter((u) => u !== uid) })),
    setSelected: (uids) => set({ selected: uids }),
    move: (dir) => setS((s) => goTo(s, s.step + dir, dir)),
    reset: () => setS((s) => goTo({ ...s, selected: [] }, 0, -1)),
    escape: () => setS((s) => (s.modal ? { ...s, modal: null } : s.toolsOpen ? { ...s, toolsOpen: false } : s)),
  }), [S, set, toast, mutate]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export function useApp(): Ctx { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside AppProvider"); return c; }
export { ALERTING };
