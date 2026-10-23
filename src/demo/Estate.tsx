/* Estate view (Area 4): Health above, Activity below, and the All Flows table. Reached from Tools. */
import { ALERTING, FLOWS, anomaliesLast7, estateActivity, flowsWithRecentAnomalies, monitorLabel, portfolioVolume } from "../lib/engine";
import { agoLabel, dtstr, fmtInt, pct } from "../lib/stats";
import type { Flow } from "../lib/types";
import { useApp } from "../state/store";
import { DayBars, HBars } from "./charts/charts";
import { Card, Recon, StatusPill, Tile } from "./ui";

function Reason({ f }: { f: Flow }) {
  if (!f.conditions.length) return <span className="muted">No active conditions</span>;
  if (f.conditions.length === 1) return <b>{f.conditions[0].name}</b>;
  return <span className="cnt">{f.conditions.length} conditions active</span>;
}
function Detail({ f }: { f: Flow }) {
  if (!f.conditions.length) return <span className="muted">—</span>;
  if (f.conditions.length === 1) { const c = f.conditions[0]; return <><span className="obs">{c.observed}</span> <span className="muted">vs. expected {c.threshold}</span></>; }
  return <span className="muted">{f.conditions.map((c) => c.name).join(", ")}</span>;
}
function Layer({ n, title, q, per }: { n: number; title: string; q: string; per: string }) {
  return <div className="layer"><span className="lnum">{n}</span><h2>{title}</h2><span className="lq">{q}</span><span className="rule" /><span className="per">{per}</span></div>;
}

export function Estate() {
  const { openFlow, openModal } = useApp();
  const awaiting = FLOWS.filter((f) => f.status === "awaiting").length;
  const healthy = FLOWS.filter((f) => f.status === "healthy").length;
  const attn = FLOWS.filter((f) => f.status === "attn").length;
  const anom7 = anomaliesLast7();
  const attnFlows = FLOWS.filter((f) => f.status === "attn").sort((a, b) => ((b.conditions[0] || {}).activatedAt || 0) - ((a.conditions[0] || {}).activatedAt || 0));
  const act = estateActivity(90);
  const vol = portfolioVolume();

  return <div className="wrap">
    {!ALERTING.enabled ? (
      <div className="card gate"><div className="gi">!</div><div><h4>Email alerting is off</h4><p>The views below already work. Nobody is being notified yet. Provide an alert email to activate alerting across the estate.</p></div><div className="ga"><button type="button" className="btn pri" onClick={() => openModal({ kind: "activate" })}>Set up alerting</button></div></div>
    ) : null}

    <Layer n={1} title="Health" q="what needs attention right now" per="judged against each flow's own baseline" />
    <div className="tiles">
      <Tile n={FLOWS.length} l="Total flows" />
      <Tile n={healthy} l="Healthy right now" tone="healthy" />
      <Tile n={attn} l="Needs attention" tone="attn" />
      <Tile n={anom7} l="Anomalies · last 7 days" />
    </div>
    <Recon style={{ margin: "0 0 20px" }}><b>These tiles do not sum, by design.</b> Health is one field with three values: healthy {healthy} + needs attention {attn} + awaiting baseline {awaiting} = {FLOWS.length} total. Awaiting Baseline has no tile; it is in the Baseline column of All Flows below. Anomalies in the last 7 days is a trailing count: <b>{flowsWithRecentAnomalies()}</b> flow(s) had at least one, which is not the same as needing attention now, since conditions self-clear.</Recon>

    <Card title="Needs attention" hint="Sorted by most recent condition activation">
      <div className="bd"><table className="grid"><thead><tr><th style={{ width: 230 }}>Flow</th><th style={{ width: 230 }}>Reason</th><th>Observed vs. expected</th><th style={{ width: 190 }}>Time of issue</th></tr></thead><tbody>
        {!attnFlows.length ? <tr><td colSpan={4} className="emptyq">Nothing needs attention. Every flow with a baseline is healthy.</td></tr> : null}
        {attnFlows.map((f) => { const since = (f.conditions[0] || {}).activatedAt; return <tr key={f.id} className="row" onClick={() => openFlow(f.id)}><td><span className="nm">{f.name}</span></td><td><Reason f={f} /></td><td><Detail f={f} /></td><td className="muted">{since ? dtstr(since) : ""}</td></tr>; })}
      </tbody></table></div>
    </Card>

    <Layer n={2} title="Activity" q="what happened across the estate" per="trailing 90 days · absolute counts, no baseline" />
    <div className="tiles">
      <Tile n={fmtInt(act.flows)} l="Total flows" />
      <Tile n={fmtInt(act.total)} l="Total runs" />
      <Tile n={fmtInt(act.succ)} l="Successful runs" tone="healthy" />
      <Tile n={fmtInt(act.fail)} l="Failed runs" tone="attn" />
    </div>
    <Recon style={{ margin: "0 0 20px" }}>Run-level counts reconcile: successful {fmtInt(act.succ)} + failed {fmtInt(act.fail)} = total runs {fmtInt(act.total)} · failure rate {pct(act.total ? act.fail / act.total : 0)}. Counts every run that occurred, including schedule-excluded ones. Exclusion suppresses evaluation, not the fact that a run happened.</Recon>

    <div className="twocol">
      <Card title="Top 5 flows by failed runs" hint={fmtInt(act.fail) + " failures total"} style={{ marginBottom: 0 }}>
        <div className="bd pad"><HBars rows={act.topFlows.slice(0, 5)} accent="var(--f-fail)" label="Failed runs" labelChars={24} axisTitle="failed runs" /></div>
        <Recon style={{ margin: "2px 14px 14px" }}>Concentration, not severity. A flow can top this list and still be <b>Healthy</b>. Cross-reference the Health layer before acting.</Recon>
      </Card>
      <Card title="Top 5 errors" hint={act.topErrs.length + " distinct causes seen"} style={{ marginBottom: 0 }}>
        <div className="bd pad"><HBars rows={act.topErrs.slice(0, 5)} accent="var(--f-fail)" label="Occurrences" labelChars={26} axisTitle="number of errors" /></div>
        <Recon style={{ margin: "2px 14px 14px" }}>The diagnostic half. A condition says a flow deviated; this says why it failed.</Recon>
      </Card>
    </div>

    <Card title="Run volume across the estate" hint="Total runs per day, all flows · hover any day">
      <div className="bd" style={{ padding: "14px 18px" }}><div className="chart"><DayBars days={vol} win={90} kind="rpd" accent="var(--f-rpd)" label="Runs" title="runs / day" descriptive w={1300} h={210} /></div></div>
    </Card>

    <Card title="All flows" hint={FLOWS.length + " automations · both layers per flow"}>
      <div className="bd"><table className="grid"><thead><tr><th>Flow</th><th style={{ width: 200 }}>Baseline</th><th style={{ width: 170 }}>Health now</th><th style={{ width: 120 }}>Failed · 90d</th><th style={{ width: 120 }}>Last run</th></tr></thead><tbody>
        {FLOWS.map((f) => { const last = f._runs[f._runs.length - 1]; const fr = (act.topFlows.find((z) => z.id === f.id) || { n: 0 }).n; return <tr key={f.id} className="row" onClick={() => openFlow(f.id)}><td><span className="nm">{f.name}</span></td><td className="muted">{monitorLabel(f)}</td><td><StatusPill f={f} /></td><td className="muted">{fr ? fmtInt(fr) : "—"}</td><td className="muted">{last ? agoLabel(last.t) : "—"}</td></tr>; })}
      </tbody></table></div>
      <Recon style={{ margin: "0 16px 16px" }}>Both layers side by side. <b>Health now</b> is the evaluative read; <b>Failed · 90d</b> is the descriptive one. They disagree on purpose: a flow with the most failures can be healthy, and a flow with none can need attention.</Recon>
    </Card>
  </div>;
}
