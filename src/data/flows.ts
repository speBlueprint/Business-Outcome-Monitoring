/* Synthetic estate: eight Northwind finance and IT flows, generated in-browser from a fixed seed so every
   scenario is reproducible. The generator order is the same as the reference prototype (v5), so the
   verified scenarios are unchanged: a silent producer failure, a missed run window, a paused flow,
   consolidated conditions, weekend false positives, custom baselines, and a flow awaiting a baseline. */
import { DAY, HOUR, NOW, WIN_START, mulberry32, startOfDay } from "../lib/stats";
import type { Flow, FlowSpec, Run } from "../lib/types";

const rng = mulberry32(20260724);
function noise(scale: number) { return (rng() * 2 - 1) * scale; }

interface GenSpec {
  runsPerDay?: number; runsPerDayJitter?: number; weekdaysOnly?: boolean;
  durBase: number; durJit: number; failRate?: number;
  queue?: boolean; qTotal?: number; qTotalJit?: number; errRate?: number; koRate?: number;
  producer?: boolean; itemsBase?: number; itemsJit?: number;
  lastRunAgoH?: number; forceHealthyLast?: boolean; shape?: (runs: Run[]) => void;
}
function genRuns(spec: GenSpec): Run[] {
  const runs: Run[] = [];
  const rpd = spec.runsPerDay || 1;
  const hours = rpd >= 4 ? [6, 10, 14, 18] : rpd >= 3 ? [6, 11, 16] : rpd === 2 ? [7, 15] : [6];
  for (let day = 90; day >= 0; day--) {
    const mid = startOfDay(NOW - day * DAY);
    const dow = new Date(mid).getDay();
    if (spec.weekdaysOnly && (dow === 0 || dow === 6)) continue;
    const count = Math.max(1, Math.round(rpd + noise(spec.runsPerDayJitter == null ? 0.35 : spec.runsPerDayJitter)));
    for (let k = 0; k < count; k++) {
      const hr = (hours[k % hours.length] || 8) + k * 0.4 + noise(0.5);
      const t = mid + hr * HOUR;
      if (t > NOW || t < WIN_START) continue;
      const dur = Math.max(2, spec.durBase + noise(spec.durJit));
      let outcome: Run["outcome"] = "success";
      if (rng() < (spec.failRate || 0)) outcome = "failed";
      const run: Run = { t, duration: dur, outcome, _uid: "" };
      if (spec.queue) {
        const total = Math.max(1, Math.round((spec.qTotal || 0) + noise(spec.qTotalJit || 0)));
        const err = Math.round(total * Math.max(0, (spec.errRate || 0.01) + noise(0.006)));
        const ko = Math.round(total * Math.max(0, (spec.koRate || 0.02) + noise(0.01)));
        run.qTotal = total; run.qError = err; run.qKick = ko; run.qProcessed = Math.max(0, total - err - ko);
      }
      if (spec.producer) run.items = Math.max(0, Math.round((spec.itemsBase || 0) + noise(spec.itemsJit || 0)));
      runs.push(run);
    }
  }
  runs.sort((a, b) => a.t - b.t);
  if (spec.lastRunAgoH != null) { const cutoff = NOW - spec.lastRunAgoH * HOUR; for (let i = runs.length - 1; i >= 0; i--) if (runs[i].t > cutoff) runs.splice(i, 1); }
  if (spec.shape) spec.shape(runs);
  if (spec.forceHealthyLast) {
    const l = runs[runs.length - 1];
    if (l) {
      l.duration = spec.durBase; l.outcome = "success";
      if (l.qTotal) { l.qKick = Math.round(l.qTotal * (spec.koRate || 0.02)); l.qError = Math.round(l.qTotal * (spec.errRate || 0.01)); l.qProcessed = Math.max(0, l.qTotal - l.qKick - l.qError); }
      if (l.items != null) l.items = spec.itemsBase || 0;
    }
  }
  return runs;
}

const SPECS: FlowSpec[] = [];

/* 1 — Invoice Processing: healthy, queue-based, exclusions configured */
SPECS.push({
  id: "invoice", name: "Invoice Processing", type: "Queue consumer", env: "Production",
  desc: "Reads invoices from the AP intake queue, validates line items against POs, and posts approved invoices to the ERP.",
  freqWindowH: 12,
  excl: { weekends: false, days: [], ranges: [{ from: startOfDay(NOW - 31 * DAY), to: startOfDay(NOW - 30 * DAY), label: "ERP upgrade window" }] },
  recipients: [{ email: "ap-coe@northwind.com" }, { email: "dana.reyes@northwind.com", title: "AP Manager" }],
  runs: genRuns({ runsPerDay: 3, runsPerDayJitter: 0.5, durBase: 295, durJit: 35, failRate: 0.02, queue: true, qTotal: 140, qTotalJit: 22, errRate: 0.015, koRate: 0.03, forceHealthyLast: true }),
});
/* 2 — Vendor Onboarding: missed run-frequency window; exclusions NOT configured */
SPECS.push({
  id: "vendor", name: "Vendor Onboarding", type: "Scheduled flow", env: "Production",
  desc: "Nightly flow that provisions newly-approved vendors into the ERP and notifies procurement.",
  freqWindowH: 24, excl: null,
  recipients: [{ email: "procurement@northwind.com" }],
  runs: genRuns({ runsPerDay: 1, runsPerDayJitter: 0.1, durBase: 210, durJit: 28, failRate: 0.02, forceHealthyLast: true,
    shape: (runs) => { for (let i = runs.length - 1; i >= 0; i--) if (runs[i].t > NOW - 26 * HOUR) runs.splice(i, 1); const last = runs[runs.length - 1]; if (last) last.t = NOW - 26 * HOUR; } }),
});
/* 3 — GL Reconciliation: producer silent failure. Runs succeed, items-added collapses. */
SPECS.push({
  id: "gl", name: "GL Reconciliation", type: "Producer flow", env: "Production",
  desc: "Producer that scans the general ledger and enqueues reconciliation exceptions for the review queue.",
  freqWindowH: 12, excl: { weekends: true, days: [], ranges: [] },
  recipients: [{ email: "gl-team@northwind.com" }, { email: "m.okafor@northwind.com", title: "Controller" }],
  runs: genRuns({ runsPerDay: 2, runsPerDayJitter: 0.4, durBase: 180, durJit: 22, failRate: 0.01, producer: true, itemsBase: 420, itemsJit: 60,
    shape: (runs) => { for (let i = runs.length - 3; i < runs.length; i++) if (runs[i]) { runs[i].items = Math.round(24 + noise(10)); runs[i].outcome = "success"; } } }),
});
/* 4 — PO Matching: several active conditions at once, so one consolidated notification */
SPECS.push({
  id: "po", name: "PO Matching", type: "Queue consumer", env: "Production",
  desc: "Matches purchase orders to goods receipts and invoices; routes mismatches to the exception queue.",
  freqWindowH: 12, excl: { weekends: true, days: [], ranges: [] },
  recipients: [{ email: "po-coe@northwind.com" }, { email: "finance-ops@northwind.com" }],
  runs: genRuns({ runsPerDay: 2, runsPerDayJitter: 0.4, durBase: 240, durJit: 30, failRate: 0.02, queue: true, qTotal: 120, qTotalJit: 18, errRate: 0.02, koRate: 0.03,
    shape: (runs) => {
      const n = runs.length;
      for (let i = n - 3; i < n; i++) if (runs[i]) runs[i].outcome = "failed";
      const last = runs[n - 1];
      if (last && last.qTotal) { last.duration = 615; last.qKick = Math.round(last.qTotal * 0.26); last.qError = Math.round(last.qTotal * 0.05); last.qProcessed = Math.max(0, last.qTotal - last.qKick - last.qError); }
      for (let i = n - 3; i < n - 1; i++) { const r = runs[i]; if (r && r.qTotal) { r.qKick = Math.round(r.qTotal * 0.22); r.qError = Math.round(r.qTotal * 0.02); r.qProcessed = Math.max(0, r.qTotal - r.qKick - r.qError); } }
    } }),
});
/* 5 — Daily Bank Reconciliation: weekday-only, exclusions NOT set, so weekend zero-run days flag */
SPECS.push({
  id: "bank", name: "Daily Bank Reconciliation", type: "Queue consumer", env: "Production",
  desc: "Weekday flow that pulls cleared bank transactions and reconciles them against open ledger entries.",
  freqWindowH: 36, excl: null,
  recipients: [{ email: "treasury-coe@northwind.com" }],
  runs: genRuns({ weekdaysOnly: true, runsPerDay: 4, runsPerDayJitter: 0.25, durBase: 260, durJit: 24, failRate: 0.01, queue: true, qTotal: 95, qTotalJit: 12, errRate: 0.01, koRate: 0.02, forceHealthyLast: true }),
});
/* 6 — Employee Offboarding: paused for more than 24h */
SPECS.push({
  id: "offboard", name: "Employee Offboarding", type: "Scheduled flow", env: "Production",
  desc: "Revokes access, reclaims licenses, and archives mailboxes when HR marks an employee as departed.",
  freqWindowH: 24, excl: { weekends: true, days: [], ranges: [] },
  recipients: [{ email: "it-sec@northwind.com" }, { email: "p.singh@northwind.com", title: "IT Security Lead" }],
  paused: true, pausedSince: NOW - 41 * HOUR,
  runs: genRuns({ runsPerDay: 1, runsPerDayJitter: 0.1, durBase: 160, durJit: 20, failRate: 0.02, lastRunAgoH: 41, forceHealthyLast: true }),
});
/* 7 — License Reclamation: custom baselines set below 10 runs, has now crossed 10 */
{
  const runs: Run[] = [];
  for (const o of [70, 63, 56, 49, 42, 35, 28, 21, 14, 7, 0]) runs.push({ t: startOfDay(NOW - o * DAY) + 10 * HOUR, duration: 340 + noise(30), outcome: "success", _uid: "" });
  SPECS.push({
    id: "license", name: "License Reclamation", type: "Scheduled flow", env: "Production",
    desc: "Weekly sweep that reclaims unused software licenses from departed or inactive users.",
    freqWindowH: 192, excl: { weekends: true, days: [], ranges: [] },
    recipients: [{ email: "it-asset@northwind.com" }],
    customConfigured: true, customSetAtRuns: 6, offerInferred: true,
    custom: { durMin: 200, durMax: 600, freqWindow: 192 },
    runs,
  });
}
/* 8 — Quarterly Compliance Report: 4 runs in 90 days, awaiting a baseline */
{
  const runs: Run[] = [];
  for (const off of [86, 58, 31, 6]) runs.push({ t: NOW - off * DAY + 9 * HOUR, duration: 1200 + noise(120), outcome: "success", _uid: "" });
  SPECS.push({
    id: "quarterly", name: "Quarterly Compliance Report", type: "Scheduled flow", env: "Production",
    desc: "Compiles the quarterly SOX evidence package and distributes it to audit stakeholders.",
    excl: null, recipients: [{ email: "audit@northwind.com" }], runs,
  });
}

/* Namespaced PAD error codes, the format the Error List column already carries in the product. */
export const ERROR_CATALOG = [
  { name: "System.UnspecifiedError", w: 34 },
  { name: "Runtime.NoAvailableMachineError", w: 22 },
  { name: "UIAutomation.ElementNotFoundError", w: 12 },
  { name: "WebAutomation.PopulateTextFieldError", w: 10 },
  { name: "UIAutomation.ApplicationNotRespondingError", w: 8 },
  { name: "Security.CredentialExpiredError", w: 6 },
  { name: "Runtime.NoListenerConnectedError", w: 5 },
  { name: "Email.InvalidEmailAddressError", w: 3 },
];

function mk(spec: FlowSpec, fi: number): Flow {
  return {
    ...spec,
    machine: "LAPTOP-" + (65591341 - fi * 4127),
    lastModified: NOW - (9 + fi * 3) * DAY + 11 * HOUR + 26 * 60000,
    _runs: [], _included: [], eligible: false, monitorMode: "none", monitored: false, hasQueue: false, hasItems: false,
    evDur: [], bDur: null, rpd: [], evRpd: [], bRpd: null, obd: [], evSuccDay: [], evFailDay: [], bSuccDay: null, bFailDay: null,
    _q: [], evKo: [], evErr: [], evSucc: [], bKo: null, bErr: null, bSucc: null, _p: [], evItems: [], bItems: null,
    _streak: 0, conditions: [], status: "awaiting", history: [], _epSeeded: false, _exclDismissed: false, _set: null,
  };
}
export const FLOWS: Flow[] = SPECS.map(mk);

/* Error names: a pass of its own with its own seed, so the scenarios above are untouched. */
{
  const erng = mulberry32(90210);
  const tot = ERROR_CATALOG.reduce((a, e) => a + e.w, 0);
  FLOWS.forEach((f) => f.runs.forEach((r) => {
    if (r.outcome !== "failed") return;
    let x = erng() * tot, hit = ERROR_CATALOG[0];
    for (const e of ERROR_CATALOG) { x -= e.w; if (x <= 0) { hit = e; break; } }
    r.error = hit.name;
  }));
}
/* Run-table fields the product already carries. Execution Duration is null for Local-mode runs, as in the product. */
{
  const mrng = mulberry32(31337);
  FLOWS.forEach((f) => f.runs.forEach((r) => {
    const local = mrng() < 0.18;
    r.mode = local ? "Local" : f.type === "Scheduled flow" ? "Unattended" : "Attended";
    r.machine = f.machine;
    r.execDuration = local ? null : Math.max(1, r.duration * (0.86 + mrng() * 0.1));
    r.queuedDuration = Math.max(0, r.duration * (mrng() < 0.75 ? mrng() * 0.04 : 0.1 + mrng() * 0.35));
  }));
}
FLOWS.forEach((f) => f.runs.forEach((r, i) => { r._uid = f.id + ":" + i; }));

export const flowById = (id: string): Flow => FLOWS.find((f) => f.id === id) || FLOWS[0];
