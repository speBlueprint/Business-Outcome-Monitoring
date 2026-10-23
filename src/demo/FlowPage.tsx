/* One flow, opened from the estate. The product's flow page with its tabs; Monitoring is the live one,
   and inside it Overview, Alert History and Settings (FR-5.8). */
import { exclSummary, flowById } from "../lib/engine";
import { agoLabel } from "../lib/stats";
import { useApp, type Tab, type Win } from "../state/store";
import { History } from "./History";
import { Overview } from "./Overview";
import { RunsTable } from "./RunsTable";
import { Settings } from "./Settings";
import { Seg, StatusPill } from "./ui";

const FLOW_TABS = ["Properties", "Diagram", "Dependencies", "Changes", "Logs", "Tests"];

export function FlowPage() {
  const { S, setTab, setWin, openModal } = useApp();
  const f = flowById(S.flowId);
  const last = f._runs[f._runs.length - 1];
  return <div className="wrap flowwrap">
    <div className="card">
      <div className="flowhead">
        <div>
          <h2>{f.name} <StatusPill f={f} inline /></h2>
          <div className="fd">{f.desc}</div>
          <div className="flowmeta"><span>Environment <b>{f.env}</b></span><span>Last run <b>{last ? agoLabel(last.t) : "—"}</b></span><span>Type <b>{f.type}</b></span><span>Exclusions <b>{exclSummary(f) || "none set"}</b></span></div>
        </div>
        <div className="headacts">
          <button type="button" className="btn sm" onClick={() => openModal({ kind: "schedule", fid: f.id })}>Schedule Settings</button>
          {S.tab !== "settings" ? <Seg<Win> label="Timeframe" value={S.win} options={[{ v: 7, l: "1w" }, { v: 30, l: "1m" }, { v: 90, l: "3m" }]} onChange={setWin} /> : null}
        </div>
      </div>
      <div className="ftabs">{FLOW_TABS.map((t) => <span key={t} aria-disabled="true">{t}</span>)}<span className="on">Monitoring</span></div>
      <div className="tabs">
        {(["overview", "history", "settings"] as Tab[]).map((t) => <button key={t} type="button" className={S.tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "overview" ? "Overview" : t === "history" ? "Alert History" : "Settings"}</button>)}
      </div>
      {S.tab === "overview" ? <Overview f={f} /> : S.tab === "history" ? <History f={f} /> : <Settings f={f} />}
    </div>
    {S.tab === "overview" ? <RunsTable f={f} /> : null}
  </div>;
}
