/* All Flow Activity: the run-level table already shipped beneath each flow, with the BOM column set (FR-5.20)
   and the Include in baseline action on checkbox selection (FR-2.17 to FR-2.23). */
import { useState } from "react";
import { INCLUDED, anomSignals, includeSelected } from "../lib/engine";
import { DAY, NOW, dtstr, esc, fmtHMS, fmtInt, pct } from "../lib/stats";
import type { Flow, Run } from "../lib/types";
import { useApp } from "../state/store";
import { Card, Recon } from "./ui";

const LIMIT = 30;

export function RunsTable({ f }: { f: Flow }) {
  const { S, mutate, toast, toggleSelected, setSelected } = useApp();
  const [menu, setMenu] = useState(false);
  const cut = NOW - S.win * DAY;
  const all = f._runs.filter((r) => r.t >= cut).slice().sort((a, b) => b.t - a.t);
  const rows = all.slice(0, LIMIT);
  const anomTotal = all.filter((r) => anomSignals(r).length).length;
  const sel = new Set(S.selected);
  const selN = rows.filter((r) => sel.has(r._uid)).length;
  const selectable = (r: Run) => anomSignals(r).length > 0 || INCLUDED.has(r._uid);
  const showQ = f.hasQueue, showP = f.hasItems;
  const nCols = 12 + (showQ ? 3 : 0) + (showP ? 1 : 0);
  const apply = (on: boolean) => { setMenu(false); const uids = new Set(S.selected); setSelected([]); mutate(() => includeSelected(f.id, uids, on)); };

  return <Card title="All Flow Activity" hint={<>{fmtInt(all.length)} item{all.length === 1 ? "" : "s"}{all.length > rows.length ? <> · showing {rows.length}</> : null}{anomTotal ? <> · {anomTotal} flagged</> : null}</>}>
    <div className="tableacts">
      <button type="button" className="btn sm" onClick={() => toast("Filters would open here: status, mode, error, date range")}>Filters</button>
      <div className="actwrap">
        <button type="button" className={`btn sm${selN ? " pri" : ""}`} disabled={!selN} onClick={() => setMenu((m) => !m)}>Actions{selN ? ` (${selN})` : ""} ▾</button>
        {menu ? <div className="actmenu"><button type="button" onClick={() => apply(true)}>Include in baseline</button><button type="button" onClick={() => apply(false)}>Remove from baseline</button></div> : null}
      </div>
      <span className="muted small">{selN ? `${selN} run${selN === 1 ? "" : "s"} selected` : "Select flagged runs to declare them normal"}</span>
    </div>
    <div className="bd scrollx"><table className="grid runs"><thead><tr>
      <th className="ckcol"><input type="checkbox" aria-label="Select all flagged runs" checked={selN > 0 && selN === rows.filter(selectable).length} onChange={(e) => setSelected(e.target.checked ? rows.filter(selectable).map((r) => r._uid) : [])} /></th>
      <th>Anomaly</th><th>Flow</th><th>Start</th><th>Status</th><th>Duration</th><th>Queued<br />duration</th><th>Execution<br />duration</th>
      {showQ ? <><th>Queue<br />processed</th><th>Queue<br />kickout</th><th>Queue<br />errors</th></> : null}
      {showP ? <th>Items<br />added</th> : null}
      <th>Error list</th><th>Machine</th><th>Last modified</th><th>Mode</th>
    </tr></thead><tbody>
      {!rows.length ? <tr><td colSpan={nCols} className="emptyq">No runs in this timeframe.</td></tr> : null}
      {rows.map((r) => {
        const sig = anomSignals(r), flagged = sig.length > 0, inc = INCLUDED.has(r._uid), qt = r.qTotal || 0;
        const tip = flagged
          ? `<b>Anomaly</b><br><span class="r">Outside the normal range on: ${esc(sig.join(", "))}</span>${inc ? '<br><span class="nv">Included in baseline, still outside the recomputed band</span>' : ""}`
          : r._excl ? '<span class="nv">Schedule-excluded: not evaluated</span>' : inc ? '<span class="ok">● Included in baseline, now in range</span>' : '<span class="ok">● No anomaly on this run</span>';
        return <tr key={r._uid} className={`${r._excl ? "exclrow " : ""}${inc ? "incrow" : ""}`}>
          <td className="ckcol">{flagged || inc ? <input type="checkbox" aria-label="Select run" checked={sel.has(r._uid)} onChange={(e) => toggleSelected(r._uid, e.target.checked)} /> : null}</td>
          <td className="center">{flagged ? <span className="anomicon" data-tip={tip}>⚠</span> : inc ? <span className="incicon" data-tip={tip}>✓</span> : <span className="hit sq" data-tip={tip} />}</td>
          <td>{f.name}</td>
          <td className="muted">{dtstr(r.t)}</td>
          <td className={r.outcome === "failed" ? "stfail" : "stok"}>{r.outcome === "failed" ? "Failed" : "Succeeded"}</td>
          <td className={`num${r._durBad ? " bad" : ""}`}>{fmtHMS(r.duration)}</td>
          <td className="num muted">{fmtHMS(r.queuedDuration)}</td>
          <td className="num">{fmtHMS(r.execDuration)}</td>
          {showQ ? <><td className={`num${r._succBad ? " bad" : ""}`}>{qt ? pct((r.qProcessed || 0) / qt) : "—"}</td><td className={`num${r._koBad ? " bad" : ""}`}>{qt ? pct((r.qKick || 0) / qt) : "—"}</td><td className={`num${r._errBad ? " bad" : ""}`}>{qt ? pct((r.qError || 0) / qt) : "—"}</td></> : null}
          {showP ? <td className={`num${r._itemsBad ? " bad" : ""}`}>{r.items != null ? fmtInt(r.items) : "—"}</td> : null}
          <td className="errc">{r.error || ""}</td>
          <td className="muted">{r.machine || f.machine}</td>
          <td className="muted">{dtstr(f.lastModified)}</td>
          <td className="muted">{r.mode || ""}</td>
        </tr>;
      })}
    </tbody></table></div>
    <Recon style={{ margin: "0 16px 16px" }}><b>Every value signal has a column that can turn red.</b> Queue rates and items added are columns, so a flagged run always shows its offending value. Queued duration is kept as diagnostic context: the monitored duration includes queue wait, so a slow run may simply have waited. Execution duration stays blank for Local-mode runs, as in the product. Run Frequency, Flow Paused and Runs Per Day never appear here, because no run row corresponds to them, so this table under-reports against Alert History by design.</Recon>
  </Card>;
}
