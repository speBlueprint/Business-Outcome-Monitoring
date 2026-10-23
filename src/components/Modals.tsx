/* Dialogs: activate alerting, the activation-time exclusion review, Schedule Settings, the notification preview,
   and add recipient. Each is a plain form over the engine's mutation functions. */
import { useEffect, useRef, useState } from "react";
import { ALERTING, FLOWS, activateAlerting, addRecip, applyExclusionReview, flowById, plainLanguage, reviewTargets, saveSchedule, skipExclusionReview } from "../lib/engine";
import { DOW, MIN_BASELINE_RUNS, dstr, startOfDay } from "../lib/stats";
import type { Excl } from "../lib/types";
import { useApp } from "../state/store";
import { Switch } from "./ui";

function Frame({ title, sub, wide, children, footer }: { title: string; sub?: React.ReactNode; wide?: boolean; children: React.ReactNode; footer: React.ReactNode }) {
  const { closeModal } = useApp();
  return <div className="modalbg" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
    <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="mh"><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
      <div className="mb">{children}</div>
      <div className="mf">{footer}</div>
    </div>
  </div>;
}

export function ActivateModal() {
  const { closeModal, openModal, mutate, toast } = useApp();
  const [email, setEmail] = useState(ALERTING.email);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const eligible = FLOWS.filter((f) => f.eligible).length;
  const go = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { toast("Enter a valid email address to activate alerting"); return; }
    mutate(() => activateAlerting(email.trim()));
    if (reviewTargets().length) openModal({ kind: "review" }); else { closeModal(); toast("Alerting activated"); }
  };
  return <Frame title="Set up email alerting" sub="Alerting is off until a valid alert email is provided. Providing one activates alerting across every flow." footer={<><button type="button" className="btn" onClick={closeModal}>Cancel</button><button type="button" className="btn pri" onClick={go}>Activate alerting</button></>}>
    <div className="note"><b>The in-app views already work.</b> The estate and per-flow views are available whether or not alerting is configured. This only controls whether notifications are <b>sent</b>.</div>
    <label className="lbl" htmlFor="alertEmail">Alert email</label>
    <input ref={ref} id="alertEmail" type="email" placeholder="rpa-coe@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
    <div className="muted small" style={{ marginTop: 8 }}>All {FLOWS.length} flows are monitored. {eligible} have enough history for an inferred baseline (at least {MIN_BASELINE_RUNS} runs in the trailing 90 days); the remaining {FLOWS.length - eligible} will not be evaluated until they accrue history, or until you set custom baselines.</div>
  </Frame>;
}

export function ReviewModal() {
  const { closeModal, mutate } = useApp();
  const targets = reviewTargets();
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(targets.map((f) => [f.id, true])));
  return <Frame wide title="Review schedule exclusions before the first alerts fire" sub={<>Nothing is excluded by default. These {targets.length} flows have no exclusions configured, so weekend and holiday zero-run days will flag as anomalies. Apply the weekends preset in bulk now.</>}
    footer={<><button type="button" className="btn" onClick={() => { closeModal(); mutate(() => skipExclusionReview()); }}>Skip for now</button><button type="button" className="btn pri" onClick={() => { closeModal(); mutate(() => applyExclusionReview(targets.filter((f) => on[f.id]).map((f) => f.id))); }}>Exclude weekends on selected</button></>}>
    <div className="warn"><b>Why this step exists.</b> Schedules are never inferred. Skipping is fine; skipped flows keep the per-flow setup prompt on their Overview tab until exclusions are configured.</div>
    {targets.map((f) => <label className="mrow" key={f.id}><input type="checkbox" checked={!!on[f.id]} onChange={(e) => setOn({ ...on, [f.id]: e.target.checked })} /><span className="nm">{f.name}</span><span className="mn">{f.type} · no exclusions set</span></label>)}
  </Frame>;
}

export function ScheduleModal({ fid }: { fid: string }) {
  const { closeModal, mutate, toast } = useApp();
  const f = flowById(fid);
  const [sch, setSch] = useState<Excl>(() => (f.excl ? JSON.parse(JSON.stringify(f.excl)) : { weekends: false, days: [], ranges: [] }));
  const [label, setLabel] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const toggleWeekends = () => setSch({ ...sch, weekends: !sch.weekends, days: sch.days.filter((d) => d !== 0 && d !== 6) });
  const toggleDow = (d: number) => {
    if ((d === 0 || d === 6) && sch.weekends) { const days = [...sch.days]; [0, 6].forEach((k) => { if (k !== d && !days.includes(k)) days.push(k); }); setSch({ ...sch, weekends: false, days: days.sort() }); return; }
    const days = sch.days.includes(d) ? sch.days.filter((x) => x !== d) : [...sch.days, d].sort();
    setSch({ ...sch, days });
  };
  const addRange = () => {
    if (!from || !to) { toast("Pick a start and end date"); return; }
    const a = startOfDay(new Date(from + "T12:00:00").getTime()), b = startOfDay(new Date(to + "T12:00:00").getTime());
    if (b < a) { toast("End date is before the start date"); return; }
    setSch({ ...sch, ranges: [...sch.ranges, { from: a, to: b, label: label.trim() || "Excluded period" }].sort((x, y) => x.from - y.from) });
    setLabel(""); setFrom(""); setTo("");
  };
  return <Frame wide title={`Schedule Settings: ${f.name}`} sub={<>Tell monitoring when this flow is <b>not</b> expected to run. Excluded periods are removed from anomaly detection, baseline computation <b>and</b> trend calculations.</>}
    footer={<><button type="button" className="btn" onClick={closeModal}>Cancel</button><button type="button" className="btn pri" onClick={() => { closeModal(); mutate(() => saveSchedule(fid, sch)); }}>Save exclusions</button></>}>
    <div className="note"><b>Nothing is excluded until you configure it.</b> Out of the box a weekday-only flow flags weekend zero-run days as anomalies; that is the accepted cost of not inferring schedules.</div>
    <div className="setgroup"><div className="gh">Weekends preset</div><div className="fieldrow"><div className="fl">Exclude Saturday &amp; Sunday<small>The most common case</small></div><div className="toggle"><Switch on={sch.weekends} onClick={toggleWeekends} /><span className="muted">{sch.weekends ? "Excluded" : "Not excluded"}</span></div></div></div>
    <div className="setgroup"><div className="gh">Recurring weekday rules</div><div style={{ padding: "10px 16px" }}><div className="muted small" style={{ marginBottom: 8 }}>Click a day to exclude it every week. Struck-through days are excluded.</div><div className="dow">{DOW.map((d, i) => <button type="button" key={d} className={sch.days.includes(i) || (sch.weekends && (i === 0 || i === 6)) ? "on" : ""} onClick={() => toggleDow(i)}>{d}</button>)}</div></div></div>
    <div className="setgroup"><div className="gh">Custom date ranges<span className="basis">Holidays, planned maintenance, freeze windows</span></div><div className="rangelist">
      {!sch.ranges.length ? <div className="muted small" style={{ padding: "6px 0" }}>No custom date ranges.</div> : null}
      {sch.ranges.map((r, i) => <div className="rangerow" key={i}><span className="rl">{r.label}</span><span className="rd">{dstr(r.from)} – {dstr(r.to)}</span><button type="button" className="btn lnk" onClick={() => setSch({ ...sch, ranges: sch.ranges.filter((_, j) => j !== i) })}>remove</button></div>)}
      <div className="addrange"><input type="text" placeholder="Label (e.g. Thanksgiving)" value={label} onChange={(e) => setLabel(e.target.value)} /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /><button type="button" className="btn sm" onClick={addRange}>Add range</button></div>
    </div></div>
  </Frame>;
}

/* One notification, one wording (FR-7.13). Conditions from the same run are batched (FR-7.4). */
export function MailModal({ fid }: { fid: string }) {
  const { closeModal } = useApp();
  const f = flowById(fid); const cs = f.conditions;
  const to = f.recipients.map((r) => r.email).join(", ") || ALERTING.email || "(no recipients configured)";
  return <Frame wide title={`Notification preview: ${f.name}`} sub={cs.length > 1 ? <>This run tripped <b>{cs.length} thresholds</b>. They are batched into <b>one</b> notification listing every condition, not one email per condition.</> : "One active condition, one notification."}
    footer={<button type="button" className="btn" onClick={closeModal}>Close</button>}>
    <div className="note">Every recipient gets this same message. There is no technical variant and no wording setting: plain language reads correctly for the CoE and for the business process owner, and only one of those two audiences can read the other version.</div>
    <div className="mail">
      <div className="mhdr"><div><b>To</b> {to}</div><div><b>From</b> blueprint@northwind.com</div><div className="subj">{cs.length ? `${f.name} may not have completed its work` : `${f.name}: no active conditions`}</div></div>
      <div className="mbody">{!cs.length ? <p className="muted">This flow has no active conditions, so no notification would be sent.</p> : <>
        <p>Hello,</p><p>Something looks off with <b>{f.name}</b>:</p>
        <ul className="plainlist">{cs.map((c) => <li key={c.type}>{plainLanguage(f, c)}</li>)}</ul>
        <p className="muted small">The RPA team has been notified at the same time. This message is here so the business outcome does not go unnoticed.</p>
        <span className="cta">See the details in Blueprint</span>
      </>}</div>
    </div>
  </Frame>;
}

export function RecipientModal({ fid }: { fid: string }) {
  const { closeModal, mutate, toast } = useApp();
  const [email, setEmail] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const go = () => { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { toast("Enter a valid email address"); return; } closeModal(); mutate(() => { addRecip(fid, email.trim()); return "Recipient added"; }); };
  return <Frame title="Add recipient" sub="Any address, including a business process owner who has no Blueprint account." footer={<><button type="button" className="btn" onClick={closeModal}>Cancel</button><button type="button" className="btn pri" onClick={go}>Add</button></>}>
    <label className="lbl" htmlFor="recipEmail">Email</label>
    <input ref={ref} id="recipEmail" type="email" placeholder="owner@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
  </Frame>;
}

export function Modals() {
  const { S } = useApp();
  const m = S.modal; if (!m) return null;
  if (m.kind === "activate") return <ActivateModal />;
  if (m.kind === "review") return <ReviewModal />;
  if (m.kind === "schedule") return <ScheduleModal key={m.fid} fid={m.fid} />;
  if (m.kind === "mail") return <MailModal fid={m.fid} />;
  return <RecipientModal fid={m.fid} />;
}
