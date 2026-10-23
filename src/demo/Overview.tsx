/* Per-flow Overview tab (Area 5): banners, active conditions, six run-level KPI tiles, one chart per monitored signal. */
import { declineInferred, dismissExcl, runsPerDaySeries, setCustom, switchToInferred } from "../lib/engine";
import { MIN_BASELINE_RUNS, agoLabel, dtstr, fmtDur, fmtInt, median, pct, DAY, NOW } from "../lib/stats";
import type { Flow } from "../lib/types";
import { useApp } from "../state/store";
import { DayBars, Trailing } from "./charts/charts";
import { Banner, Recon } from "./ui";

const WINS: Record<number, string> = { 7: "1w", 30: "1m", 90: "3m" };

export function Conditions({ f }: { f: Flow }) {
  if (!f.conditions.length) return null;
  return <div className="banner amber block">
    <h4>{f.conditions.length === 1 ? "1 active condition" : f.conditions.length + " active conditions"}</h4>
    <table className="grid inner"><thead><tr><th style={{ width: 250 }}>Condition</th><th style={{ width: 170 }}>Observed</th><th style={{ width: 160 }}>Expected</th><th>Time of issue</th></tr></thead><tbody>
      {f.conditions.map((c) => <tr key={c.type}><td><b>{c.name}</b></td><td className="obs">{c.observed}</td><td className="muted">{c.threshold}</td><td className="muted">{dtstr(c.activatedAt)}</td></tr>)}
    </tbody></table>
  </div>;
}

function Kpis({ f, win }: { f: Flow; win: number }) {
  const cut = NOW - win * DAY;
  const runs = f._runs.filter((r) => r.t >= cut && !r._excl);
  const total = runs.length, fail = runs.filter((r) => r.outcome === "failed").length, succ = total - fail;
  const errRate = total ? fail / total : 0;
  const med = median(runs.map((r) => r.duration)) || 0;
  let qs = "—";
  if (f.hasQueue) { const q = runs.filter((r) => r.qTotal); const tp = q.reduce((a, r) => a + (r.qTotal || 0), 0), pp = q.reduce((a, r) => a + (r.qProcessed || 0), 0); qs = pct(tp ? pp / tp : 0); }
  const lastR = f._runs[f._runs.length - 1];
  const outside = f._runs.length - runs.length;
  return <>
    <div className="kpis">
      <div className="kpi"><div className="v">{lastR ? agoLabel(lastR.t) : "—"}</div><div className="k">Last run</div></div>
      <div className="kpi"><div className="v">{fmtDur(med)}</div><div className="k">Median duration</div></div>
      <div className="kpi"><div className="v">{fmtInt(total)}</div><div className="k">Total runs · {WINS[win]}</div></div>
      <div className="kpi"><div className="v">{fmtInt(succ)}</div><div className="k">Successful</div></div>
      <div className="kpi"><div className="v">{fmtInt(fail)}</div><div className="k">Failed</div></div>
      <div className="kpi"><div className="v">{pct(errRate)}</div><div className="k">Error rate</div></div>
    </div>
    <Recon>Run-level counts reconcile for this window: successful {fmtInt(succ)} + failed {fmtInt(fail)} = total runs {fmtInt(total)} · error rate = failed ÷ total = {pct(errRate)}{f.hasQueue ? <> · queue success (item-level, not run-level) = {qs}</> : null}{outside > 0 ? <> · {outside} run(s) outside the window or schedule-excluded</> : null}</Recon>
  </>;
}

function ChartCard({ title, sub, children }: { title: string; sub: React.ReactNode; children: React.ReactNode }) {
  return <div className="chart"><div className="ct">{title}</div><div className="cs">{sub}</div>{children}</div>;
}

export function Overview({ f }: { f: Flow }) {
  const { S, mutate, openModal } = useApp();
  const win = S.win;

  if (!f.eligible) {
    return <div>
      <Banner tone="amber" icon="!" title="Not enough run history to infer a baseline" actions={f.monitorMode === "custom" ? null : <button type="button" className="btn pri" onClick={() => mutate(() => setCustom(f.id))}>Set custom baselines</button>}>
        Only {f._included.length} non-excluded runs in the last 90 days; inference needs at least {MIN_BASELINE_RUNS}. {f.monitorMode === "custom" ? <>This flow is evaluated against <b>custom baselines</b> you set.</> : <>There are no system default thresholds, so nothing is evaluated on this flow yet. Set custom baselines to start now instead of waiting for history. The pause check applies regardless.</>}
      </Banner>
      <Conditions f={f} />
      <div className="charts one"><ChartCard title="Runs recorded" sub={<>{f._runs.length} runs · last 90 days · no band, because there is no inferred baseline</>}><DayBars days={runsPerDaySeries(f, f._runs)} win={90} kind="rpd" accent="var(--f-rpd)" label="Runs" title="runs / day" descriptive w={1300} h={210} /></ChartCard></div>
    </div>;
  }

  return <div>
    {f.offerInferred && f.monitorMode !== "inferred" ? (
      <Banner tone="blue" icon="✦" title="Enough history to infer a baseline" actions={<><button type="button" className="btn" onClick={() => mutate(() => declineInferred(f.id))}>Keep custom</button><button type="button" className="btn pri" onClick={() => mutate(() => switchToInferred(f.id))}>Switch to inferred</button></>}>
        {f.name} now has {f._included.length} runs in the last 90 days. Its thresholds are still the custom values you set at {f.customSetAtRuns} runs.
      </Banner>
    ) : null}
    {!f.excl && !f._exclDismissed ? (
      <Banner tone="blue" icon="▦" title="Does this flow run on weekends?" actions={<><button type="button" className="btn" onClick={() => mutate(() => dismissExcl(f.id))}>Not now</button><button type="button" className="btn pri" onClick={() => openModal({ kind: "schedule", fid: f.id })}>Set exclusions</button></>}>
        Schedule Settings have never been configured for <b>{f.name}</b>. Until expected downtime is excluded, weekends and holidays count as real zero-run days and flag as anomalies.
      </Banner>
    ) : !f.excl && f._exclDismissed ? (
      <Banner tone="amber" icon="▦" title="Schedule exclusions still not configured" actions={<button type="button" className="btn sm" onClick={() => openModal({ kind: "schedule", fid: f.id })}>Set exclusions</button>}>Dismissed. This returns until exclusions are set or you opt out for this flow.</Banner>
    ) : null}

    <Conditions f={f} />
    <Kpis f={f} win={win} />

    <div className="charts">
      <ChartCard title="Run duration" sub={<>Per run · band = median ± 3 × Scaled MAD · duration includes queue wait</>}><Trailing items={f._runs} evals={f.evDur} win={win} unit="s" accent="var(--f-dur)" label="Duration" title="duration" /></ChartCard>
      <ChartCard title="Runs per day" sub={<>Daily count · minimum band width 1 · <b>raises a condition</b> in both directions</>}><DayBars days={f.rpd} win={win} kind="rpd" accent="var(--f-rpd)" label="Runs" title="runs / day" /></ChartCard>
      <ChartCard title="Successful runs per day" sub="Charted only: raises no condition, so no marks"><DayBars days={f.obd} win={win} kind="succ" accent="var(--f-succ)" label="Successful" title="successful" noMarks /></ChartCard>
      <ChartCard title="Failed runs per day" sub="Charted only: raises no condition, so no marks"><DayBars days={f.obd} win={win} kind="fail" accent="var(--f-fail)" label="Failed" title="failed" noMarks /></ChartCard>
      {f.hasQueue ? <>
        <ChartCard title="Queue items processed" sub="Rate per run · two-sided band: an unusually high rate is an anomaly too"><Trailing items={f._q} evals={f.evSucc} win={win} unit="%" accent="var(--f-queue)" label="Processed" title="processed" /></ChartCard>
        <ChartCard title="Queue items kicked out" sub="Rate per run · two-sided: kickouts collapsing may mean validation stopped"><Trailing items={f._q} evals={f.evKo} win={win} unit="%" accent="var(--f-queue)" label="Kickout rate" title="kickout" /></ChartCard>
        <ChartCard title="Queue item errors" sub="Rate per run · two-sided"><Trailing items={f._q} evals={f.evErr} win={win} unit="%" accent="var(--f-queue)" label="Error rate" title="errors" /></ChartCard>
      </> : null}
      {f.hasItems ? <ChartCard title="Queue items added (producer)" sub="Per run · two-sided band: a drop is the silent failure, a surge is worth a look"><Trailing items={f._p} evals={f.evItems} win={win} unit="" accent="var(--f-prod)" label="Items added" title="items added" /></ChartCard> : null}
    </div>
    <div className="legend">
      <span><i className="dot" style={{ background: "var(--f-dur)", opacity: 0.55 }} />In range (each chart has its own accent)</span>
      <span><i className="dia" />Anomaly: fired or would fire an alert</span>
      <span><i style={{ background: "var(--c-band)", border: "1px solid var(--c-band-edge)" }} />Trailing normal-range band</span>
      <span><i className="dot" style={{ background: "#fff", border: "1.5px solid var(--c-warm)" }} />Warm-up: fewer than {MIN_BASELINE_RUNS} prior runs, not evaluated</span>
      <span><i style={{ background: "var(--c-excl)" }} />Excluded by Schedule Settings</span>
      <span><i className="ln" style={{ borderTop: "2px solid var(--f-dur)" }} />Baseline median</span>
      <span className="strong">Hover any point for its value and the band that judged it</span>
    </div>
    <Recon>The band comes from the pinned 90-day baseline and steps as history accrues. The timeframe selector changes only how much history is <b>drawn</b>; it can never make a point become, or stop being, an anomaly.</Recon>
  </div>;
}
