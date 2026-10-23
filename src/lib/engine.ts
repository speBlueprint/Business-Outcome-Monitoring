/* The monitoring engine: trailing baselines, the nine-type alert catalogue, condition lifecycle,
   Alert History, settings, notification wording, and the estate rollups.
   Module state is mutable on purpose (like the product's own data layer); the store calls bump()
   after any mutation so React re-renders. */
import { FLOWS, flowById } from "../data/flows";
import { DAY, DAY0, DOW, HOUR, MIN_BASELINE_RUNS, NOW, WIN_START, computeBand, dayIndex, dstr, fmtDur, fmtInt, isAnom, median, pct, startOfDay } from "./stats";
import type { Band } from "./stats";
import type { AlertType, Condition, DayPoint, Episode, Eval, Excl, Flow, OutcomeDay, Run, Settings } from "./types";

/* ---------- global alerting configuration (FR-7.1) ---------- */
export const ALERTING = { enabled: false, email: "", reviewed: false };
/* Runs the user has declared normal (FR-2.17). Admitted to the baseline, never force-cleared. */
export const INCLUDED = new Set<string>();
/* Alert History episodes per flow. Written on activation, never rebuilt, never deleted (FR-6.2 to FR-6.4). */
const EPISODES: Record<string, Episode[]> = {};
const episodesFor = (f: Flow) => EPISODES[f.id] || (EPISODES[f.id] = []);

/* The catalogue (Area 3). Nine types; direction is an attribute, not a separate type. */
export interface AlertTypeDef { key: AlertType; label: string; kind: "value" | "rule"; note?: string; need?: "queue" | "items" }
export const ALERT_TYPES: AlertTypeDef[] = [
  { key: "Run Duration", label: "Run Duration", kind: "value", note: "Two-sided: too fast or too slow" },
  { key: "Runs Per Day", label: "Runs Per Day", kind: "value", note: "Two-sided, day-level" },
  { key: "Queue Success Rate", label: "Queue Success Rate", kind: "value", need: "queue" },
  { key: "Queue Kickout Rate", label: "Queue Kickout Rate", kind: "value", need: "queue" },
  { key: "Queue Error Rate", label: "Queue Error Rate", kind: "value", need: "queue" },
  { key: "Producer Items Added", label: "Items Added", kind: "value", need: "items" },
  { key: "Run Frequency", label: "Run Frequency", kind: "rule", note: "Needs a window set, or it never fires" },
  { key: "Consecutive Failed Runs", label: "Consecutive Failed Runs", kind: "rule" },
  { key: "Flow Paused", label: "Flow Paused", kind: "rule", note: "Baseline-independent" },
];

/* ---------- schedule exclusions (FR-8.4) ---------- */
export function isExcluded(f: Flow, ms: number): boolean {
  const e = f.excl; if (!e) return false;
  const dow = new Date(ms).getDay();
  if (e.weekends && (dow === 0 || dow === 6)) return true;
  if (e.days && e.days.indexOf(dow) >= 0) return true;
  if (e.ranges) for (const r of e.ranges) if (ms >= r.from && ms < r.to + DAY) return true;
  return false;
}
export function exclSummary(f: Flow): string | null {
  const e = f.excl; if (!e) return null;
  const parts: string[] = [];
  if (e.weekends) parts.push("Weekends");
  if (e.days && e.days.length) parts.push(e.days.map((d) => DOW[d]).join(", "));
  if (e.ranges && e.ranges.length) parts.push(e.ranges.length + " date range" + (e.ranges.length > 1 ? "s" : ""));
  return parts.length ? parts.join(" · ") : null;
}

/* ---------- trailing baseline (Area 2) ----------
   For each observation the band is computed from prior, non-excluded, non-flagged observations only.
   The first MIN_BASELINE_RUNS are warm-up: not evaluated, never flagged. */
interface Timed { t: number; _excl?: boolean; _uid?: string }
function trailingEval<T extends Timed>(items: T[], valueFn: (it: T) => number, opts: { minWidth: number }): Eval[] {
  const out: Eval[] = []; const hist: number[] = [];
  items.forEach((it) => {
    const v = valueFn(it);
    if (it._excl || !Number.isFinite(v)) { out.push({ evaluated: false, excluded: !!it._excl, bad: false, band: null, v }); return; }
    let band: Band | null = null, bad = false, evaluated = false;
    if (hist.length >= MIN_BASELINE_RUNS) { band = computeBand(hist, opts); bad = isAnom(v, band); evaluated = true; }
    out.push({ evaluated, excluded: false, bad, band, v });
    /* Flagged observations never enter the baseline (FR-2.15) unless the user included them (FR-2.17). */
    if (!bad || (it._uid && INCLUDED.has(it._uid))) hist.push(v);
  });
  return out;
}
/* The pinned band right now: what Settings shows and what the next observation is judged against. */
function currentBand<T extends Timed>(items: T[], valueFn: (it: T) => number, opts: { minWidth: number }, evals: Eval[]): Band {
  const vals = items.filter((it, i) => {
    if (it._excl) return false;
    if (evals[i] && evals[i].bad && !(it._uid && INCLUDED.has(it._uid))) return false;
    return true;
  }).map(valueFn).filter((v) => Number.isFinite(v));
  return computeBand(vals, opts);
}
export function runsPerDaySeries(f: Flow, runs: Run[]): DayPoint[] {
  const map: Record<number, number> = {};
  runs.forEach((r) => { const k = dayIndex(r.t); map[k] = (map[k] || 0) + 1; });
  const days: DayPoint[] = []; const lastIdx = dayIndex(NOW);
  for (let d = 0; d <= lastIdx; d++) { const t = DAY0 + d * DAY; days.push({ t, day: d, count: map[d] || 0, _excl: isExcluded(f, t) }); }
  return days;
}
function outcomesByDay(f: Flow, runs: Run[]): OutcomeDay[] {
  const map: Record<number, { succ: number; fail: number }> = {};
  runs.forEach((r) => { const k = dayIndex(r.t); const m = (map[k] = map[k] || { succ: 0, fail: 0 }); if (r.outcome === "failed") m.fail++; else m.succ++; });
  const out: OutcomeDay[] = []; const lastIdx = dayIndex(NOW);
  for (let d = 0; d <= lastIdx; d++) { const t = DAY0 + d * DAY; const m = map[d] || { succ: 0, fail: 0 }; out.push({ t, day: d, succ: m.succ, fail: m.fail, count: m.succ + m.fail, _excl: isExcluded(f, t) }); }
  return out;
}

const typeOn = (f: Flow, t: AlertType) => !f._set || f._set.types[t] !== false;

export function analyze(flow: Flow): Flow {
  const runs = flow.runs.filter((r) => r.t >= WIN_START && r.t <= NOW).sort((a, b) => a.t - b.t);
  runs.forEach((r) => { r._excl = isExcluded(flow, r.t); r._durBad = r._koBad = r._errBad = r._succBad = r._itemsBad = false; });
  flow._runs = runs;
  const included = runs.filter((r) => !r._excl);
  flow._included = included;

  const eligible = included.length >= MIN_BASELINE_RUNS;
  flow.eligible = eligible;
  /* Custom baselines stay in force once a flow becomes eligible; recomputation never overwrites a deliberate value (FR-8.10). */
  flow.monitorMode = flow.customConfigured ? "custom" : eligible ? "inferred" : "none";
  flow.monitored = flow.monitorMode !== "none";

  const conditions: Condition[] = [];

  /* Flow Paused (catalogue #9): baseline-independent, so it applies to a flow with no baseline yet. */
  flow.pauseThresholdH = flow.pauseThresholdH != null ? flow.pauseThresholdH : 24;
  const pauseH = flow.pauseThresholdH;
  const pausedActive = !!flow.paused && flow.pausedSince != null && NOW - flow.pausedSince > pauseH * HOUR;
  if (pausedActive && typeOn(flow, "Flow Paused")) {
    const since = flow.pausedSince as number;
    conditions.push({ type: "Flow Paused", name: "Flow Paused", reason: "Paused " + Math.round((NOW - since) / HOUR) + "h, past the " + pauseH + "h threshold",
      observed: Math.round((NOW - since) / HOUR) + "h paused", threshold: pauseH + "h", activatedAt: since + pauseH * HOUR });
  }

  flow.hasQueue = included.some((r) => !!r.qTotal);
  flow.hasItems = included.some((r) => r.items != null);

  if (eligible) {
    flow.evDur = trailingEval(runs, (r) => r.duration, { minWidth: 5 });
    flow.bDur = currentBand(runs, (r) => r.duration, { minWidth: 5 }, flow.evDur);
    runs.forEach((r, i) => { r._durBad = flow.evDur[i].bad; });

    /* Today is still open: a day-level count can only be judged below-bound once the day closes (catalogue #2). */
    const openDay = (ev: Eval[]) => { const e = ev[ev.length - 1]; if (e && e.bad && e.band && e.v <= e.band.hi) e.bad = false; };
    const rpd = runsPerDaySeries(flow, runs);
    flow.evRpd = trailingEval(rpd, (d) => d.count, { minWidth: 1 }); openDay(flow.evRpd);
    flow.bRpd = currentBand(rpd, (d) => d.count, { minWidth: 1 }, flow.evRpd);
    rpd.forEach((d, i) => { d._bad = flow.evRpd[i].bad; d._evaluated = flow.evRpd[i].evaluated; d._band = flow.evRpd[i].band; });
    flow.rpd = rpd;

    const obd = outcomesByDay(flow, runs);
    flow.evSuccDay = trailingEval(obd, (d) => d.succ, { minWidth: 1 }); openDay(flow.evSuccDay);
    flow.evFailDay = trailingEval(obd, (d) => d.fail, { minWidth: 1 }); openDay(flow.evFailDay);
    obd.forEach((d, i) => { d._succBad = flow.evSuccDay[i].bad; d._failBad = flow.evFailDay[i].bad; d._succBand = flow.evSuccDay[i].band; d._failBand = flow.evFailDay[i].band; });
    flow.obd = obd;
    flow.bSuccDay = currentBand(obd, (d) => d.succ, { minWidth: 1 }, flow.evSuccDay);
    flow.bFailDay = currentBand(obd, (d) => d.fail, { minWidth: 1 }, flow.evFailDay);

    if (flow.hasQueue) {
      const q = runs.filter((r) => r.qTotal);
      flow._q = q;
      const qt = (r: Run) => r.qTotal || 1;
      flow.evKo = trailingEval(q, (r) => (r.qKick || 0) / qt(r), { minWidth: 0.02 });
      flow.evErr = trailingEval(q, (r) => (r.qError || 0) / qt(r), { minWidth: 0.02 });
      flow.evSucc = trailingEval(q, (r) => (r.qProcessed || 0) / qt(r), { minWidth: 0.02 });
      flow.bKo = currentBand(q, (r) => (r.qKick || 0) / qt(r), { minWidth: 0.02 }, flow.evKo);
      flow.bErr = currentBand(q, (r) => (r.qError || 0) / qt(r), { minWidth: 0.02 }, flow.evErr);
      flow.bSucc = currentBand(q, (r) => (r.qProcessed || 0) / qt(r), { minWidth: 0.02 }, flow.evSucc);
      q.forEach((r, i) => { r._koBad = flow.evKo[i].bad; r._errBad = flow.evErr[i].bad; r._succBad = flow.evSucc[i].bad; });
    }
    /* Producer items added: two-sided (FR-2.6). A surge is an anomaly worth a look, not only a collapse. */
    if (flow.hasItems) {
      const p = runs.filter((r) => r.items != null);
      flow._p = p;
      flow.evItems = trailingEval(p, (r) => r.items as number, { minWidth: 1 });
      flow.bItems = currentBand(p, (r) => r.items as number, { minWidth: 1 }, flow.evItems);
      p.forEach((r, i) => { r._itemsBad = flow.evItems[i].bad; });
    }
  } else {
    flow.rpd = runsPerDaySeries(flow, runs);
    flow.obd = outcomesByDay(flow, runs);
  }

  const last = included[included.length - 1];

  if (flow.monitored && last) {
    /* Run Frequency (rule). Counts only non-excluded elapsed time. Not suppressed by pause (FR-3.3). */
    const win = flow.monitorMode === "custom" && flow.custom ? flow.custom.freqWindow : flow.freqWindowH;
    flow.freqWindowH = win;
    if (win != null && typeOn(flow, "Run Frequency")) {
      let elapsed = 0;
      for (let t = last.t; t < NOW; t += HOUR) if (!isExcluded(flow, t)) elapsed += HOUR;
      const elapsedH = Math.round(elapsed / HOUR);
      if (elapsedH > win) conditions.push({ type: "Run Frequency", name: "Run Frequency", reason: "No run in " + elapsedH + "h; window is " + win + "h",
        observed: elapsedH + "h since last run", threshold: win + "h", activatedAt: last.t + win * HOUR });
    }
  }

  if (eligible && last) {
    const li = runs.indexOf(last);
    if (flow.evDur[li] && flow.evDur[li].bad && typeOn(flow, "Run Duration")) {
      const b = flow.evDur[li].band as Band; const dir = last.duration > b.hi ? "above" : "below";
      conditions.push({ type: "Run Duration", name: "Run Duration (" + (dir === "above" ? "too slow" : "too fast") + ")", dir,
        reason: "Last run " + fmtDur(last.duration) + "; normal " + fmtDur(b.lo) + "–" + fmtDur(b.hi),
        observed: fmtDur(last.duration), threshold: fmtDur(b.lo) + "–" + fmtDur(b.hi), activatedAt: last.t });
    }
    /* Runs Per Day (catalogue #2), two-sided. Below-bound activates at day close, so today (still open) can only
       fire above-bound; the last completed day can fire either way. */
    const rpdLast = flow.rpd[flow.rpd.length - 1], rpdPrev = flow.rpd[flow.rpd.length - 2];
    const dayHit = (d: typeof rpdLast, openDay: boolean) => !!d && !!d._bad && !d._excl && !!d._band && (!openDay || d.count > d._band.hi);
    const rpdHit = dayHit(rpdLast, true) ? rpdLast : dayHit(rpdPrev, false) ? rpdPrev : undefined;
    if (rpdHit && rpdHit._band && typeOn(flow, "Runs Per Day")) {
      const above = rpdHit.count > rpdHit._band.hi, dir = above ? "above" : "below";
      const range = Math.round(rpdHit._band.lo) + "–" + Math.round(rpdHit._band.hi) + "/day";
      conditions.push({ type: "Runs Per Day", name: "Runs Per Day (" + dir + " normal)", dir,
        reason: (rpdHit.count === 0 ? "No runs on " : rpdHit.count + " runs on ") + dstr(rpdHit.t) + "; normal " + range,
        observed: rpdHit.count + " runs", threshold: range, activatedAt: rpdHit.t + (above ? 0 : DAY) });
    }
    if (flow.hasQueue && flow._q.length) {
      const qi = flow._q.length - 1, lq = flow._q[qi], qt = lq.qTotal || 1;
      const qcond = (ev: Eval, val: number, type: AlertType, label: string) => {
        if (!ev.bad || !ev.band || !typeOn(flow, type)) return;
        const dir = val > ev.band.hi ? "above" : "below";
        const range = pct(ev.band.lo) + "–" + pct(ev.band.hi);
        conditions.push({ type, name: label + " (" + dir + " normal)", dir, reason: label + " " + pct(val) + "; normal " + range, observed: pct(val), threshold: range, activatedAt: lq.t });
      };
      qcond(flow.evKo[qi], (lq.qKick || 0) / qt, "Queue Kickout Rate", "Kickout rate");
      qcond(flow.evErr[qi], (lq.qError || 0) / qt, "Queue Error Rate", "Queue error rate");
      qcond(flow.evSucc[qi], (lq.qProcessed || 0) / qt, "Queue Success Rate", "Queue success rate");
    }
    if (flow.hasItems && flow._p.length) {
      const pi = flow._p.length - 1, lp = flow._p[pi], ev = flow.evItems[pi], items = lp.items as number;
      if (ev.bad && ev.band && typeOn(flow, "Producer Items Added")) {
        const above = items > ev.band.hi, dir = above ? "above" : "below";
        const range = fmtInt(ev.band.lo) + "–" + fmtInt(ev.band.hi);
        conditions.push({ type: "Producer Items Added", name: "Items Added (" + dir + " normal)", dir,
          reason: (above ? "Added " : "Only ") + fmtInt(items) + " items; normal " + range, observed: fmtInt(items) + " items", threshold: range, activatedAt: lp.t });
      }
    }
    flow.consecFailN = flow.consecFailN || 3;
    let streak = 0; for (let i = included.length - 1; i >= 0; i--) { if (included[i].outcome === "failed") streak++; else break; }
    flow._streak = streak;
    if (streak >= flow.consecFailN && typeOn(flow, "Consecutive Failed Runs")) {
      const idx = included.length - flow.consecFailN;
      conditions.push({ type: "Consecutive Failed Runs", name: "Consecutive Failed Runs", reason: streak + " consecutive failed runs; threshold " + flow.consecFailN,
        observed: streak + " failures in a row", threshold: flow.consecFailN + " runs", activatedAt: included[idx] ? included[idx].t : last.t });
    }
  }

  /* Queue success rate is the complement of kickout + error; do not double-report the same run. */
  let conds = conditions;
  if (conds.some((c) => c.type === "Queue Kickout Rate" || c.type === "Queue Error Rate")) conds = conds.filter((c) => c.type !== "Queue Success Rate");
  conds.sort((a, b) => b.activatedAt - a.activatedAt);
  flow.conditions = conds;
  /* One field, three values. An active condition outranks baseline state (FR-1.3). */
  flow.status = conds.length > 0 ? "attn" : flow.monitored ? "healthy" : "awaiting";

  /* ---- Alert History (Area 6): episodes accumulate ---- */
  const eps = episodesFor(flow);
  if (!flow._epSeeded) {
    const seed = <T extends Timed>(items: T[], evals: Eval[], type: AlertType, label: string, obsFn: (it: T, e: Eval) => string, thrFn: (it: T, e: Eval) => string) => {
      evals.forEach((e, i) => {
        if (!e || !e.bad || e.excluded || !e.band) return;
        let cleared: number | null = null;
        for (let j = i + 1; j < evals.length; j++) if (evals[j] && evals[j].evaluated && !evals[j].bad && !evals[j].excluded) { cleared = items[j].t; break; }
        eps.push({ type, name: label, observed: obsFn(items[i], e), threshold: thrFn(items[i], e), activatedAt: items[i].t, clearedAt: cleared, t: items[i].t });
      });
    };
    const bandOf = (e: Eval) => e.band as Band;
    if (eligible) {
      seed(runs, flow.evDur, "Run Duration", "Run Duration", (r) => fmtDur(r.duration), (_r, e) => fmtDur(bandOf(e).lo) + "–" + fmtDur(bandOf(e).hi));
      seed(flow.rpd, flow.evRpd, "Runs Per Day", "Runs Per Day", (d) => d.count + " runs", (_d, e) => Math.round(bandOf(e).lo) + "–" + Math.round(bandOf(e).hi) + "/day");
      if (flow.hasQueue) {
        const qt = (r: Run) => r.qTotal || 1;
        seed(flow._q, flow.evKo, "Queue Kickout Rate", "Queue Kickout Rate", (r) => pct((r.qKick || 0) / qt(r)), (_r, e) => pct(bandOf(e).lo) + "–" + pct(bandOf(e).hi));
        seed(flow._q, flow.evErr, "Queue Error Rate", "Queue Error Rate", (r) => pct((r.qError || 0) / qt(r)), (_r, e) => pct(bandOf(e).lo) + "–" + pct(bandOf(e).hi));
        seed(flow._q, flow.evSucc, "Queue Success Rate", "Queue Success Rate", (r) => pct((r.qProcessed || 0) / qt(r)), (_r, e) => pct(bandOf(e).lo) + "–" + pct(bandOf(e).hi));
      }
      if (flow.hasItems) seed(flow._p, flow.evItems, "Producer Items Added", "Items Added", (r) => fmtInt(r.items as number) + " items", (_r, e) => fmtInt(bandOf(e).lo) + "–" + fmtInt(bandOf(e).hi));
    }
    flow._epSeeded = true;
  }
  const activeTypes = new Set(conds.map((c) => c.type));
  conds.forEach((c) => { if (!eps.some((e) => e.type === c.type && e.clearedAt == null)) eps.push({ type: c.type, name: c.name, observed: c.observed, threshold: c.threshold, activatedAt: c.activatedAt, clearedAt: null, t: c.activatedAt }); });
  eps.forEach((e) => { if (e.clearedAt == null && !activeTypes.has(e.type)) e.clearedAt = NOW; });
  eps.sort((a, b) => b.activatedAt - a.activatedAt);
  flow.history = eps;
  return flow;
}
export function reanalyze() { FLOWS.forEach(analyze); }
reanalyze();

/* ---------- estate rollups ---------- */
export function anomaliesLast7(): number { const cut = NOW - 7 * DAY; let c = 0; FLOWS.forEach((f) => f.history.forEach((h) => { if (h.t >= cut) c++; })); return c; }
export function flowsWithRecentAnomalies(): number { const cut = NOW - 7 * DAY; return FLOWS.filter((f) => f.history.some((h) => h.t >= cut)).length; }
export interface RankRow { id?: string; label: string; n: number }
export interface Activity { total: number; succ: number; fail: number; flows: number; topFlows: RankRow[]; topErrs: RankRow[] }
/* Counts every run that happened, including schedule-excluded ones (FR-4.19). */
export function estateActivity(win: number): Activity {
  const cut = NOW - win * DAY; let total = 0, succ = 0, fail = 0;
  const byFlow: Record<string, number> = {}, byErr: Record<string, number> = {};
  FLOWS.forEach((f) => f._runs.forEach((r) => {
    if (r.t < cut) return; total++;
    if (r.outcome === "failed") { fail++; byFlow[f.id] = (byFlow[f.id] || 0) + 1; if (r.error) byErr[r.error] = (byErr[r.error] || 0) + 1; } else succ++;
  }));
  const topFlows = Object.keys(byFlow).map((id) => ({ id, label: flowById(id).name, n: byFlow[id] })).sort((a, b) => b.n - a.n);
  const topErrs = Object.keys(byErr).map((k) => ({ label: k, n: byErr[k] })).sort((a, b) => b.n - a.n);
  return { total, succ, fail, flows: FLOWS.length, topFlows, topErrs };
}
export function portfolioVolume(): DayPoint[] {
  const lastIdx = dayIndex(NOW); const out: DayPoint[] = [];
  for (let d = 0; d <= lastIdx; d++) out.push({ t: DAY0 + d * DAY, day: d, count: 0, _excl: false });
  FLOWS.forEach((f) => f._runs.forEach((r) => { const k = dayIndex(r.t); if (out[k]) out[k].count++; }));
  return out;
}
export function anomSignals(r: Run): string[] {
  const out: string[] = [];
  if (r._durBad) out.push("run duration");
  if (r._koBad) out.push("queue kickout rate");
  if (r._errBad) out.push("queue error rate");
  if (r._succBad) out.push("queue success rate");
  if (r._itemsBad) out.push("items added");
  return out;
}
export function monitorLabel(f: Flow): string { return f.monitorMode === "inferred" ? "Inferred baseline" : f.monitorMode === "custom" ? "Custom baselines" : "Awaiting baseline"; }

/* ---------- Settings (Area 8) ---------- */
export function ensureSettings(f: Flow): Settings {
  if (f._set) return f._set;
  const s: Settings = { fields: {}, rules: { freqWindow: 24, consecFail: 3, pauseHours: 24 }, types: {}, basisN: 0 };
  const inf = (val: number) => ({ mode: "inferred" as const, val });
  if (f.eligible && f.bDur && f.bRpd) {
    s.fields.rpdMin = inf(Math.round(f.bRpd.lo)); s.fields.rpdMax = inf(Math.round(f.bRpd.hi));
    s.fields.durMin = inf(Math.round(f.bDur.lo)); s.fields.durMax = inf(Math.round(f.bDur.hi));
    if (f.hasQueue && f.bSucc && f.bKo && f.bErr) {
      s.fields.qSuccMin = inf(Math.round(f.bSucc.lo * 100)); s.fields.qSuccMax = inf(Math.round(f.bSucc.hi * 100));
      s.fields.qKickMin = inf(Math.round(f.bKo.lo * 100)); s.fields.qKickMax = inf(Math.round(f.bKo.hi * 100));
      s.fields.qErrMin = inf(Math.round(f.bErr.lo * 100)); s.fields.qErrMax = inf(Math.round(f.bErr.hi * 100));
    }
    if (f.hasItems && f.bItems) { s.fields.itemsMin = inf(Math.round(f.bItems.lo)); s.fields.itemsMax = inf(Math.round(f.bItems.hi)); }
    if (f.customConfigured && f.custom) {
      s.fields.durMin = { mode: "custom", val: f.custom.durMin, _inferred: Math.round(f.bDur.lo) };
      s.fields.durMax = { mode: "custom", val: f.custom.durMax, _inferred: Math.round(f.bDur.hi) };
    }
  } else if (f.monitorMode === "custom" && f.custom) {
    s.fields.durMin = { mode: "custom", val: f.custom.durMin, _inferred: null };
    s.fields.durMax = { mode: "custom", val: f.custom.durMax, _inferred: null };
  }
  s.rules.freqWindow = f.freqWindowH != null ? f.freqWindowH : 24;
  s.rules.consecFail = f.consecFailN || 3;
  s.rules.pauseHours = f.pauseThresholdH != null ? f.pauseThresholdH : 24;
  ALERT_TYPES.forEach((t) => { s.types[t.key] = true; });
  s.basisN = f._included.length;
  f._set = s; return s;
}
export function typicalGapHours(f: Flow): number {
  const gaps: number[] = []; const inc = f._included;
  for (let i = 1; i < inc.length; i++) gaps.push(inc[i].t - inc[i - 1].t);
  return gaps.length ? median(gaps) / HOUR : 0;
}

/* ---------- mutations (each returns the toast text) ---------- */
export function includeSelected(fid: string, uids: Set<string>, on: boolean): string {
  const n = uids.size; if (!n) return "";
  uids.forEach((uid) => { if (on) INCLUDED.add(uid); else INCLUDED.delete(uid); });
  const before = flowById(fid).conditions.length;
  reanalyze();
  const after = flowById(fid).conditions.length;
  if (!on) return n + " run" + (n === 1 ? "" : "s") + " removed from the baseline; recomputed.";
  return n + " run" + (n === 1 ? "" : "s") + " included; baseline recomputed. " + (after < before
    ? (before - after) + " condition" + (before - after === 1 ? "" : "s") + " cleared because the observation is now in band."
    : "No condition cleared: the robust recompute did not move the band far enough.");
}
export function saveSchedule(fid: string, excl: Excl): string {
  const f = flowById(fid);
  f.excl = JSON.parse(JSON.stringify(excl)); f._exclDismissed = false; f._set = null;
  reanalyze();
  return "Exclusions saved; baseline, anomalies and trend recomputed";
}
export function dismissExcl(fid: string): string { flowById(fid)._exclDismissed = true; return "Dismissed; the prompt returns until exclusions are set"; }
export function setCustom(fid: string): string {
  const f = flowById(fid); const m = median(f._included.map((r) => r.duration)) || 300;
  f.customConfigured = true; f.custom = { durMin: Math.round(m * 0.4), durMax: Math.round(m * 1.8), freqWindow: f.freqWindowH || 24 * 7 };
  f.freqWindowH = f.custom.freqWindow; f._set = null; reanalyze();
  return "Custom baselines set; this flow is now being evaluated";
}
export function switchToInferred(fid: string): string {
  const f = flowById(fid); f.offerInferred = false; f.customConfigured = false; f.custom = null; f._set = null; reanalyze();
  return "Switched to the inferred baseline";
}
export function declineInferred(fid: string): string { flowById(fid).offerInferred = false; return "Keeping custom baselines; they survive recomputation by design"; }
export function editField(fid: string, key: string, val: number) {
  const fld = ensureSettings(flowById(fid)).fields[key]; if (!fld) return;
  if (fld._inferred === undefined) fld._inferred = fld.val;
  fld.val = val;
  if (fld._inferred != null && fld.val !== fld._inferred) fld.mode = "custom";
}
export function revertField(fid: string, key: string) { const fld = ensureSettings(flowById(fid)).fields[key]; if (fld && fld._inferred != null) { fld.val = fld._inferred; fld.mode = "inferred"; } }
export function editRule(fid: string, key: "freqWindow" | "consecFail" | "pauseHours", val: number) {
  const f = flowById(fid); ensureSettings(f).rules[key] = val;
  if (key === "freqWindow") f.freqWindowH = val; if (key === "consecFail") f.consecFailN = val; if (key === "pauseHours") f.pauseThresholdH = val;
  reanalyze();
}
/* FR-8.20: disabling a type stops evaluating it and clears its active condition; history is kept (FR-8.21). */
export function toggleType(fid: string, key: AlertType): string {
  const f = flowById(fid); const s = ensureSettings(f); s.types[key] = !s.types[key]; reanalyze();
  return (s.types[key] ? "Enabled " : "Disabled ") + key + (s.types[key] ? "" : "; any active condition of this type cleared, history kept");
}
export function rmRecip(fid: string, i: number) { flowById(fid).recipients.splice(i, 1); }
export function addRecip(fid: string, email: string) { flowById(fid).recipients.push({ email }); }
export function activateAlerting(email: string) { ALERTING.email = email; ALERTING.enabled = true; }
export function applyExclusionReview(ids: string[]): string {
  let n = 0;
  FLOWS.forEach((f) => { if (ids.includes(f.id) && !f.excl) { f.excl = { weekends: true, days: [], ranges: [] }; n++; } });
  ALERTING.reviewed = true; reanalyze();
  return n ? "Weekends excluded on " + n + " flow" + (n > 1 ? "s" : "") + "; baselines recomputed" : "Alerting activated";
}
export function skipExclusionReview(): string { ALERTING.reviewed = true; return "Skipped; per-flow setup prompts remain"; }
export const reviewTargets = () => FLOWS.filter((f) => f.eligible && !f.excl);

/* ---------- notification wording (FR-7.13): one outcome-framed wording for everyone ---------- */
export function plainLanguage(f: Flow, c: Condition): string {
  const n = f.name; const bare = (s: string) => String(s || "").replace(/^\s*(<=|>=|<|>)\s*/, "");
  switch (c.type) {
    case "Run Frequency": return n + " hasn’t run in " + c.observed.replace(" since last run", "") + ". Work that normally happens every " + c.threshold + " hasn’t been picked up.";
    case "Runs Per Day": return n + " didn’t run at all on a day it normally runs " + c.threshold + ".";
    case "Run Duration": return c.name.indexOf("slow") >= 0
      ? n + " took much longer than usual to finish (" + c.observed + " instead of the usual " + c.threshold + ")."
      : n + " finished far faster than usual (" + c.observed + "), which normally means it processed little or nothing.";
    case "Queue Success Rate": return n + " completed fewer items successfully than usual: " + c.observed + " went through, where it normally manages at least " + bare(c.threshold) + ".";
    case "Queue Kickout Rate": return n + " set aside far more items for manual review than usual (" + c.observed + ", against a normal " + bare(c.threshold) + "). Someone will need to work through them.";
    case "Queue Error Rate": return n + " hit errors on " + c.observed + " of the items it touched, well above its usual " + bare(c.threshold) + ".";
    case "Producer Items Added": return n + " found far fewer items to work on than usual: " + c.observed + ", where it normally finds at least " + bare(c.threshold) + ". Downstream steps may still look healthy while the work has quietly stopped.";
    case "Consecutive Failed Runs": return n + " has failed " + String(c.observed || "").replace(" failures in a row", " times in a row") + " without completing.";
    case "Flow Paused": return n + " has been switched off for " + c.observed + " and hasn’t been turned back on.";
    default: return n + ": " + c.reason;
  }
}
export { FLOWS, flowById, startOfDay };
