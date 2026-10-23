/* Per-flow Settings (Area 8): schedule exclusions, min/max pair per value signal (Inferred or Custom per bound),
   the three rule fields, nine independent alert-type switches, recipients and the notification preview. */
import { ALERT_TYPES, editField, editRule, ensureSettings, exclSummary, revertField, rmRecip, setCustom, toggleType, typicalGapHours } from "../lib/engine";
import { MIN_BASELINE_RUNS, fmtDur } from "../lib/stats";
import type { Flow } from "../lib/types";
import { useApp } from "../state/store";
import { Banner, Mode, Switch } from "./ui";

function FieldRow({ f, k, label, sub, suffix }: { f: Flow; k: string; label: string; sub?: string | undefined; suffix?: string | undefined }) {
  const { mutate } = useApp();
  const fld = ensureSettings(f).fields[k]; if (!fld) return null;
  return <div className="fieldrow">
    <div className="fl">{label}{sub ? <small>{sub}</small> : null}</div>
    <input type="number" value={fld.val} min={suffix === "%" ? 0 : undefined} max={suffix === "%" ? 100 : undefined} onChange={(e) => mutate(() => editField(f.id, k, parseFloat(e.target.value)))} />
    <span className="muted unit">{suffix || ""}</span>
    <Mode m={fld.mode} />
    {fld.mode === "custom" && fld._inferred != null ? <button type="button" className="btn lnk" onClick={() => mutate(() => revertField(f.id, k))}>revert to inferred</button> : null}
  </div>;
}
function Group({ title, basis, children }: { title: string; basis?: React.ReactNode; children: React.ReactNode }) {
  return <div className="setgroup"><div className="gh">{title}{basis ? <span className="basis">{basis}</span> : null}</div>{children}</div>;
}
function PairGroup({ f, title, rows, basis }: { f: Flow; title: string; rows: [string, string, string?, string?][]; basis?: string }) {
  const s = ensureSettings(f);
  if (!rows.some((r) => s.fields[r[0]])) return null;
  return <Group title={title} basis={basis}>{rows.map((r) => <FieldRow key={r[0]} f={f} k={r[0]} label={r[1]} sub={r[2]} suffix={r[3]} />)}</Group>;
}

export function Settings({ f }: { f: Flow }) {
  const { mutate, openModal } = useApp();
  const s = ensureSettings(f);
  const typical = typicalGapHours(f);
  const basis = "Based on " + s.basisN + " historical runs in the last 90 days";
  return <div className="setgrid">
    {!f.eligible && f.monitorMode !== "custom" ? (
      <Banner tone="amber" icon="!" title="No inferred baseline" actions={<button type="button" className="btn pri" onClick={() => mutate(() => setCustom(f.id))}>Add custom baselines</button>}>
        {f.name} has only {f._included.length} non-excluded runs in the last 90 days. There are no system default thresholds; add custom baselines to start evaluating it now rather than waiting for history.
      </Banner>
    ) : !f.eligible ? (
      <div className="warn"><b>All signals on this flow are Custom.</b> It has {f._included.length} runs, below the {MIN_BASELINE_RUNS}-run inference minimum, so every threshold below is a fixed value you set. As inferred values become available you can switch signals to Inferred.</div>
    ) : <>
      {f.customConfigured ? <div className="warn"><b>Custom baselines are in force.</b> This flow now has enough history to infer a baseline, but the thresholds you set at {f.customSetAtRuns} runs are still the ones being alerted against; recomputation never overwrites a deliberate value. Each Custom bound below can be reverted to Inferred individually.</div> : null}
      {f.bDur ? <div className="note"><b>What we inferred.</b> Based on <b>{f._included.length}</b> historical runs in the last 90 days, this flow typically runs about every {typical < 1 ? Math.round(typical * 60) + " minutes" : typical.toFixed(1).replace(/\.0$/, "") + " hours"} and takes around <b>{fmtDur(f.bDur.median)}</b>. A normal run finishes between <b>{fmtDur(f.bDur.lo)}</b> and <b>{fmtDur(f.bDur.hi)}</b>.{f.freqWindowH != null ? <> You will be alerted as soon as <b>{f.freqWindowH} hours</b> pass without a run.</> : null} Confirm, adjust or override any value below.</div> : null}
    </>}

    <Group title="Schedule exclusions" basis={exclSummary(f) || "Nothing excluded (default)"}>
      <div className="fieldrow"><div className="fl">Expected downtime<small>Excluded periods are dropped from anomaly detection, the baseline and the trend</small></div><button type="button" className="btn" onClick={() => openModal({ kind: "schedule", fid: f.id })}>{f.excl ? "Edit exclusions" : "Configure exclusions"}</button></div>
    </Group>

    <PairGroup f={f} title="Run behaviour" basis={basis} rows={[["rpdMin", "Runs per day: minimum", "Alert if daily runs fall below"], ["rpdMax", "Runs per day: maximum", "Alert if daily runs exceed"]]} />
    <PairGroup f={f} title="Run duration" rows={[["durMin", "Duration: minimum (too fast)", "Lower bound is clamped at zero", "s"], ["durMax", "Duration: maximum (too slow)", "Measured on duration, which includes queue wait", "s"]]} />
    <PairGroup f={f} title="Queue outcome thresholds" rows={[["qSuccMin", "Queue success rate: minimum", "Alert below this rate", "%"], ["qSuccMax", "Queue success rate: maximum", "Alert above this rate; an unusually good day is still anomalous", "%"], ["qKickMin", "Kickout rate: minimum", "Alert below this rate; kickouts collapsing may mean validation stopped", "%"], ["qKickMax", "Kickout rate: maximum", "Alert above this rate", "%"], ["qErrMin", "Error rate: minimum", "Alert below this rate", "%"], ["qErrMax", "Error rate: maximum", "Alert above this rate", "%"]]} />
    <PairGroup f={f} title="Producer volume" rows={[["itemsMin", "Items added: minimum", "Alert below this volume; the silent-failure signal"], ["itemsMax", "Items added: maximum", "Alert above this volume; a surge is worth a look"]]} />

    <Group title="Alert rules">
      <div className="fieldrow"><div className="fl">Run-frequency window<small>Alert if no run occurs within this window. Unset means Run Frequency never fires</small></div><input type="number" value={s.rules.freqWindow} onChange={(e) => mutate(() => editRule(f.id, "freqWindow", parseFloat(e.target.value)))} /><span className="muted unit">hrs</span><Mode m="rule" /></div>
      <div className="fieldrow"><div className="fl">Consecutive failed runs<small>Alert after N failures in a row; resets on success</small></div><input type="number" value={s.rules.consecFail} onChange={(e) => mutate(() => editRule(f.id, "consecFail", parseFloat(e.target.value)))} /><span className="muted unit">runs</span><Mode m="rule" /></div>
      <div className="fieldrow"><div className="fl">Pause threshold<small>Alert once when the flow has been paused this long. Per flow</small></div><input type="number" value={s.rules.pauseHours} onChange={(e) => mutate(() => editRule(f.id, "pauseHours", parseFloat(e.target.value)))} /><span className="muted unit">hrs</span><Mode m="rule" /></div>
    </Group>

    <Group title="Alert types" basis="Nine types, each on or off independently">
      {ALERT_TYPES.map((t) => {
        const avail = t.need === "queue" ? f.hasQueue : t.need === "items" ? f.hasItems : true;
        const on = s.types[t.key] && avail;
        return <div className="fieldrow" key={t.key}>
          <div className="fl">{t.label}<small>{avail ? t.note || (t.kind === "value" ? "Two-sided value signal" : "Rule") : "Not applicable: this flow has no " + (t.need === "queue" ? "queue data" : "producer data")}</small></div>
          <Mode m={t.kind} style={{ marginLeft: "auto" }} />
          <div className="toggle"><Switch on={on} disabled={!avail} onClick={() => mutate(() => toggleType(f.id, t.key))} /><span className="muted unit">{avail ? (on ? "On" : "Off") : "—"}</span></div>
        </div>;
      })}
      <div className="fieldrow"><div className="muted small">Disabling a type stops evaluating it and clears any active condition of that type. Past episodes stay in Alert History. <b>Successful runs per day</b> and <b>failed runs per day</b> have no fields here: they raise no conditions, and a field would imply otherwise.</div></div>
    </Group>

    <Group title="Alert recipients" basis="Per-flow routing, independent of the global alert email">
      <div className="rangelist">
        {!f.recipients.length ? <div className="muted" style={{ padding: "6px 0" }}>No recipients: this flow falls back to the global alert email.</div> : null}
        {f.recipients.map((r, i) => <div className="rangerow" key={r.email + i}><span className="rl">{r.email}</span>{r.title ? <span className="rd">{r.title}</span> : null}<button type="button" className="btn lnk" onClick={() => mutate(() => rmRecip(f.id, i))}>remove</button></div>)}
        <div style={{ paddingTop: 10 }}><button type="button" className="btn sm" onClick={() => openModal({ kind: "recipient", fid: f.id })}>+ Add recipient</button></div>
      </div>
      <div className="fieldrow"><div className="muted small">Anyone listed here receives the alert, including a business process owner who does not use Blueprint. One wording for everyone, not configurable. <button type="button" className="btn lnk" onClick={() => openModal({ kind: "mail", fid: f.id })}>Preview the alert email</button></div></div>
    </Group>
  </div>;
}
