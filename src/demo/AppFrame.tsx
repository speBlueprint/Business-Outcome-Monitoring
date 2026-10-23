/* The 1400x780 replica of the Blueprint product: navy header with the Tools menu, breadcrumb bar with the alerting chip,
   the scrolling page (estate or one flow), the dialogs and the toast. */
import { ALERTING, flowById } from "../lib/engine";
import { useApp } from "../state/store";
import { Estate } from "./Estate";
import { FlowPage } from "./FlowPage";
import { Modals } from "./Modals";

const TOOLS = ["Flow Activity", "Business Outcome Monitoring", "Find and Replace", "Diagrams", "Reuse", "Compliance"];

export function AppFrame() {
  const { S, set, go, openModal } = useApp();
  const f = flowById(S.flowId);
  return <div className="app">
    <div className="hdr">
      <span className="burger" aria-disabled="true">≡</span><span className="logo">blueprint</span>
      <span className="nv" aria-disabled="true">Ideas</span>
      <span className="nv lnk" role="button" tabIndex={0} onClick={() => go("home")}>Flows</span>
      <span className="nv tools">
        <span role="button" tabIndex={0} aria-expanded={S.toolsOpen} onClick={() => set({ toolsOpen: !S.toolsOpen })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set({ toolsOpen: !S.toolsOpen }); } }}>Tools ▾</span>
        {S.toolsOpen ? <div className="menu" role="menu">{TOOLS.map((t) => <button type="button" key={t} role="menuitem" className={t === "Business Outcome Monitoring" ? "on" : ""} aria-disabled={t !== "Business Outcome Monitoring"} onClick={() => { if (t === "Business Outcome Monitoring") go("home"); else set({ toolsOpen: false }); }}>{t}</button>)}</div> : null}
      </span>
      <span className="nv" aria-disabled="true">Manage ▾</span><span className="nv" aria-disabled="true">⚒ Jobs</span>
      <span className="sp" /><span aria-disabled="true">All</span><span className="sp" />
      <span className="av" aria-disabled="true">DA</span><span className="ic" aria-disabled="true">?</span>
    </div>
    <div className="crumbbar">
      <span className="crumb">{S.view === "home" ? <><span className="muted">Tools</span> › <b>Business Outcome Monitoring</b></> : <><span className="muted">Flows</span> › <button type="button" className="lnk" onClick={() => go("home")}>Business Outcome Monitoring</button> › <b>{f.name}</b></>}</span>
      <span className="sp" />
      <button type="button" className={`alertchip ${ALERTING.enabled ? "on" : "off"}`} onClick={() => openModal({ kind: "activate" })}><span className="dot" />{ALERTING.enabled ? `Alerting on · ${ALERTING.email}` : "Alerting off"}</button>
    </div>
    {S.view === "home" ? <div className="ptitle">Business Outcome Monitoring <span className="q" aria-disabled="true">?</span></div> : null}
    <div className="page" key={S.view + S.flowId + S.tab} onClick={() => { if (S.toolsOpen) set({ toolsOpen: false }); }}>
      {S.view === "home" ? <Estate /> : <FlowPage />}
    </div>
    <Modals />
    {S.toast ? <div className="toast" role="status">{S.toast}</div> : null}
    <span className="sample">Prototype · example data</span>
  </div>;
}
