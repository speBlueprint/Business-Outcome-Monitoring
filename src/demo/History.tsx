/* Alert History (Area 6): every condition episode, written on activation, kept indefinitely. */
import { dtstr } from "../lib/stats";
import type { Flow } from "../lib/types";
import { Recon } from "./ui";

export function History({ f }: { f: Flow }) {
  if (!f.history.length) return <div className="emptyq">No alert episodes recorded. This flow has been quiet.</div>;
  return <div>
    <div className="bd"><table className="grid ahist"><thead><tr><th style={{ width: 190 }}>When</th><th style={{ width: 220 }}>Alert type</th><th style={{ width: 190 }}>Observed</th><th>Threshold</th><th style={{ width: 110 }}>State</th></tr></thead><tbody>
      {f.history.slice(0, 60).map((e, i) => <tr key={i}><td className="muted">{dtstr(e.t)}</td><td><b>{e.type}</b></td><td className="obs">{e.observed}</td><td className="muted">{e.threshold}</td><td>{e.clearedAt == null ? <span className="an">● Active</span> : <span className="cl">● Cleared</span>}</td></tr>)}
    </tbody></table></div>
    <Recon style={{ margin: "0 18px 18px" }}>Episodes accumulate and are kept indefinitely. A row is written when a condition <b>activates</b> and stays here permanently; State comes from the episode's own clear timestamp. There is no acknowledge, dismiss or user-clear anywhere: nothing but the flow's own behaviour clears a condition. Episodes are recorded whether or not a notification was sent.</Recon>
  </div>;
}
