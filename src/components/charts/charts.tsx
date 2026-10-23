/* SVG charts. Role encoding is identical in every chart (Area 9):
     band      neutral grey, hairline edges   context, not a series
     median    one line in the family accent
     in range  accent at reduced opacity
     warm-up   hollow ring                    no baseline yet, which is not "in range"
     anomaly   saturated red diamond + white ring   red is reserved for this alone
     excluded  pale strip beneath the data
   Tooltips ride on the hit targets as data-tip; one delegated listener in App shows them. */
import type { Band } from "../../lib/stats";
import { DAY, DOW, MIN_BASELINE_RUNS, NOW, dstr, dtstr, esc, fmtInt, fmtVal, niceTicks, startOfDay, truncLabel } from "../../lib/stats";
import type { DayPoint, Eval, OutcomeDay } from "../../lib/types";

interface Dims { W: number; H: number; PL: number; PR: number; PT: number; PB: number; IW: number; IH: number }
/* Chart geometry. The default fits a half-width card; the estate volume chart passes a wider box so its text stays small. */
function dims(w = 470, h = 186): Dims { const C = { W: w, H: h, PL: 48, PR: 16, PT: 18, PB: 28, IW: 0, IH: 0 }; C.IW = C.W - C.PL - C.PR; C.IH = C.H - C.PT - C.PB; return C; }
const f1 = (n: number) => n.toFixed(1);

function Grid({ C, y, vmin, vmax, unit, title }: { C: Dims; y: (v: number) => number; vmin: number; vmax: number; unit: string; title?: string }) {
  return <>
    {niceTicks(vmin, vmax, 4).map((v) => { const Y = y(v); if (!Number.isFinite(Y)) return null; return <g key={v}><line className="gl" x1={C.PL} y1={f1(Y)} x2={C.PL + C.IW} y2={f1(Y)} /><text className="glabel" x={C.PL - 7} y={f1(Y + 3.4)} textAnchor="end">{fmtVal(v, unit)}</text></g>; })}
    <line className="axis" x1={C.PL} y1={C.PT + C.IH} x2={C.PL + C.IW} y2={C.PT + C.IH} />
    {title ? <text className="gltitle" x={0} y={C.PT - 7}>{title}</text> : null}
  </>;
}
function XLabels({ C, cut }: { C: Dims; cut: number }) {
  return <><text className="glabel" x={C.PL} y={C.PT + C.IH + 16}>{dstr(cut)}</text><text className="glabel" x={C.PL + C.IW} y={C.PT + C.IH + 16} textAnchor="end">{dstr(NOW)}</text></>;
}
interface Pt { t: number; band: Band | null; skip: boolean }
function segments(pts: Pt[]): Pt[][] { const segs: Pt[][] = []; let cur: Pt[] = []; pts.forEach((p) => { if (p.band && !p.skip) cur.push(p); else { if (cur.length > 1) segs.push(cur); cur = []; } }); if (cur.length > 1) segs.push(cur); return segs; }
/* Stepped trailing band: the band evolves per observation, so a red point is always visibly outside the band that judged it. */
function stepBand(pts: Pt[], x: (t: number) => number, y: (v: number) => number): string {
  let d = "";
  segments(pts).forEach((seg) => {
    const b = (p: Pt) => p.band as Band;
    let p = "M " + f1(x(seg[0].t)) + " " + f1(y(b(seg[0]).hi));
    for (let i = 1; i < seg.length; i++) p += " L " + f1(x(seg[i].t)) + " " + f1(y(b(seg[i - 1]).hi)) + " L " + f1(x(seg[i].t)) + " " + f1(y(b(seg[i]).hi));
    for (let i = seg.length - 1; i > 0; i--) p += " L " + f1(x(seg[i].t)) + " " + f1(y(b(seg[i]).lo)) + " L " + f1(x(seg[i].t)) + " " + f1(y(b(seg[i - 1]).lo));
    p += " L " + f1(x(seg[0].t)) + " " + f1(y(b(seg[0]).lo)) + " Z";
    d += p + " ";
  });
  return d.trim();
}
function stepLine(pts: Pt[], x: (t: number) => number, y: (v: number) => number, key: "hi" | "lo" | "md"): string {
  const val = (b: Band) => (key === "hi" ? b.hi : key === "lo" ? b.lo : b.median);
  let d = "";
  segments(pts).forEach((seg) => {
    const b = (p: Pt) => p.band as Band;
    let p = "M " + f1(x(seg[0].t)) + " " + f1(y(val(b(seg[0]))));
    for (let i = 1; i < seg.length; i++) p += " L " + f1(x(seg[i].t)) + " " + f1(y(val(b(seg[i - 1])))) + " L " + f1(x(seg[i].t)) + " " + f1(y(val(b(seg[i]))));
    d += p + " ";
  });
  return d.trim();
}
function NowMarker({ C, band, y, accent }: { C: Dims; band: Band | null; y: (v: number) => number; accent: string }) {
  if (!band) return null;
  const xr = C.PL + C.IW, yh = y(band.hi), yl = y(band.lo);
  if (!Number.isFinite(yh) || !Number.isFinite(yl)) return null;
  return <><rect x={f1(xr - 3.5)} y={f1(yh)} width={3.5} height={f1(Math.max(1, yl - yh))} fill={accent} opacity={0.4} /><text className="nowlbl" x={xr - 6} y={f1(yh - 4)} textAnchor="end" fill={accent}>normal now</text></>;
}
/* FR-9.2: an anomaly is marked by shape and size as well as colour. */
function Anom({ cx, cy, r = 7 }: { cx: number; cy: number; r?: number }) {
  return <polygon className="anom" points={`${f1(cx)},${f1(cy - r)} ${f1(cx + r)},${f1(cy)} ${f1(cx)},${f1(cy + r)} ${f1(cx - r)},${f1(cy)}`} />;
}
const Head = ({ C, children }: { C: Dims; children: React.ReactNode }) => <svg viewBox={`0 0 ${C.W} ${C.H}`} width="100%" preserveAspectRatio="xMidYMid meet">{children}</svg>;
const Empty = ({ C }: { C: Dims }) => <svg viewBox={`0 0 ${C.W} ${C.H}`} width="100%" />;

/* ---------- per-run scatter: duration, queue rates, producer volume ---------- */
export function Trailing({ items, evals, win, unit = "", accent, label = "Value", title = "", w, h }: { items: { t: number }[]; evals: Eval[]; win: number; unit?: string; accent: string; label?: string; title?: string; w?: number; h?: number }) {
  const C = dims(w, h);
  const cut = NOW - win * DAY;
  const rows: { t: number; ev: Eval }[] = [];
  items.forEach((it, i) => { if (it.t >= cut && evals[i]) rows.push({ t: it.t, ev: evals[i] }); });
  if (!rows.length) return <Empty C={C} />;
  const finite: number[] = [];
  rows.forEach((r) => { if (Number.isFinite(r.ev.v) && !r.ev.excluded) finite.push(r.ev.v); if (r.ev.band) finite.push(r.ev.band.lo, r.ev.band.hi); });
  if (!finite.length) return <Empty C={C} />;
  const vmin = Math.min(0, ...finite); let vmax = Math.max(...finite) * 1.14;
  if (!Number.isFinite(vmax) || vmax <= vmin) vmax = vmin + 1;
  const x = (t: number) => C.PL + C.IW * ((t - cut) / (NOW - cut || 1));
  const y = (v: number) => C.PT + C.IH * (1 - (v - vmin) / (vmax - vmin));
  const pts: Pt[] = rows.map((r) => ({ t: r.t, band: r.ev.band, skip: r.ev.excluded }));
  const anoms = rows.filter((r) => r.ev.bad && !r.ev.excluded);
  const lastRow = rows.filter((r) => r.ev.band && !r.ev.excluded).pop();
  const bp = stepBand(pts, x, y), hiL = stepLine(pts, x, y, "hi"), loL = stepLine(pts, x, y, "lo"), mdL = stepLine(pts, x, y, "md");
  return <Head C={C}>
    {rows.map((r, i) => r.ev.excluded ? <rect key={"x" + i} className="excl" x={f1(x(r.t) - 2.2)} y={C.PT} width={4.4} height={C.IH} /> : null)}
    {bp ? <path className="band" d={bp} /> : null}
    <Grid C={C} y={y} vmin={vmin} vmax={vmax} unit={unit} title={title} /><XLabels C={C} cut={cut} />
    {hiL ? <path className="bedge" d={hiL} /> : null}{loL ? <path className="bedge" d={loL} /> : null}
    {mdL ? <path d={mdL} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.92} /> : null}
    <NowMarker C={C} band={lastRow ? lastRow.ev.band : null} y={y} accent={accent} />
    {rows.map((r, i) => { if (r.ev.excluded || r.ev.bad || !Number.isFinite(r.ev.v)) return null; const X = f1(x(r.t)), Y = f1(y(r.ev.v)); return r.ev.evaluated ? <circle key={i} cx={X} cy={Y} r={2.9} fill={accent} opacity={0.5} /> : <circle key={i} className="warm" cx={X} cy={Y} r={2.7} />; })}
    {anoms.map((r, i) => { const X = x(r.t), Y = y(r.ev.v); return <g key={"a" + i}><line className="anomdrop" x1={f1(X)} y1={f1(Y + 6)} x2={f1(X)} y2={C.PT + C.IH} /><Anom cx={X} cy={Y} />{anoms.length <= 5 ? <text className="anomlbl" x={f1(X)} y={f1(Y - 13)} textAnchor="middle">{fmtVal(r.ev.v, unit)}</text> : null}</g>; })}
    {rows.map((r, i) => {
      let tip: string, Y: number;
      if (r.ev.excluded) { tip = `<b>${dtstr(r.t)}</b><br><span class="nv">Schedule-excluded: not evaluated, and not in the baseline</span>`; Y = C.PT + C.IH / 2; }
      else if (!Number.isFinite(r.ev.v)) return null;
      else {
        tip = `<b>${dtstr(r.t)}</b><br>${label} <b>${fmtVal(r.ev.v, unit)}</b>`;
        if (r.ev.band) tip += `<br><span class="r">Normal ${fmtVal(r.ev.band.lo, unit)} to ${fmtVal(r.ev.band.hi, unit)}</span><br><span class="r">Median ${fmtVal(r.ev.band.median, unit)} · from ${r.ev.band.n} prior runs</span><br>` + (r.ev.bad ? '<span class="bad">● Anomaly: alert fired</span>' : '<span class="ok">● In range</span>');
        else tip += `<br><span class="nv">Warm-up: fewer than ${MIN_BASELINE_RUNS} prior runs, not evaluated</span>`;
        Y = y(r.ev.v);
      }
      return <circle key={"h" + i} className="hit" cx={f1(x(r.t))} cy={f1(Y)} r={8} data-tip={tip} />;
    })}
  </Head>;
}

/* ---------- per-day bars: runs/day, successful/day, failed/day, estate volume ---------- */
type Kind = "rpd" | "succ" | "fail";
export function DayBars({ days, win, kind = "rpd", accent, label = "Runs", title = "", noMarks = false, descriptive = false, w, h }: { days: (DayPoint | OutcomeDay)[]; win: number; kind?: Kind; accent: string; label?: string; title?: string; noMarks?: boolean; descriptive?: boolean; w?: number; h?: number }) {
  const C = dims(w, h);
  const cut = startOfDay(NOW - win * DAY);
  const d = days.filter((x) => x.t >= cut);
  if (!d.length) return <Empty C={C} />;
  const od = (x: DayPoint | OutcomeDay) => x as OutcomeDay;
  const valOf = (x: DayPoint | OutcomeDay) => (kind === "fail" ? od(x).fail || 0 : kind === "succ" ? od(x).succ || 0 : x.count || 0);
  const bandOf = (x: DayPoint | OutcomeDay): Band | null => (kind === "fail" ? od(x)._failBand || null : kind === "succ" ? od(x)._succBand || null : x._band || null);
  const badOf = (x: DayPoint | OutcomeDay) => (kind === "fail" ? !!od(x)._failBad : kind === "succ" ? !!od(x)._succBad : !!x._bad);
  const hi = [1]; d.forEach((x) => { hi.push(valOf(x)); const b = bandOf(x); if (b) hi.push(b.hi); });
  const vmax = Math.max(...hi) * 1.18;
  const step = C.IW / Math.max(1, d.length), bw = Math.max(1.5, step - 1.4);
  const x = (i: number) => C.PL + i * step, xc = (i: number) => C.PL + i * step + bw / 2;
  const y = (v: number) => C.PT + C.IH * (1 - v / (vmax || 1));
  const base = C.PT + C.IH;
  const pts: Pt[] = d.map((x0, i) => ({ t: i, band: bandOf(x0), skip: x0._excl }));
  const bp = stepBand(pts, xc, y), hiL = stepLine(pts, xc, y, "hi"), loL = stepLine(pts, xc, y, "lo"), mdL = stepLine(pts, xc, y, "md");
  const lastB = d.filter((x0) => bandOf(x0) && !x0._excl).pop();
  const hasAnyBand = d.some((x0) => bandOf(x0));
  const anomCount = noMarks ? 0 : d.filter((x0) => !x0._excl && badOf(x0)).length;
  return <Head C={C}>
    {d.map((x0, i) => x0._excl ? <rect key={"x" + i} className="excl" x={f1(x(i))} y={C.PT} width={f1(bw)} height={C.IH} /> : null)}
    {bp ? <path className="band" d={bp} /> : null}
    <Grid C={C} y={y} vmin={0} vmax={vmax} unit="" title={title} /><XLabels C={C} cut={cut} />
    {hiL ? <path className="bedge" d={hiL} /> : null}{loL ? <path className="bedge" d={loL} /> : null}
    {mdL ? <path d={mdL} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.92} /> : null}
    <NowMarker C={C} band={lastB ? bandOf(lastB) : null} y={y} accent={accent} />
    {d.map((x0, i) => {
      if (x0._excl) return null;
      const v = valOf(x0), bad = noMarks ? false : badOf(x0), b = bandOf(x0);
      if (v === 0) return bad ? <g key={i}><Anom cx={xc(i)} cy={base - 5} r={5.6} />{anomCount <= 5 ? <text className="anomlbl" x={f1(xc(i))} y={f1(base - 15)} textAnchor="middle">0</text> : null}</g> : null;
      const hh = Math.max(0, base - y(v));
      return bad
        ? <g key={i}><rect x={f1(x(i))} y={f1(y(v))} width={f1(bw)} height={f1(hh)} fill="var(--c-anom)" /><Anom cx={xc(i)} cy={y(v)} r={5.6} /></g>
        : <rect key={i} x={f1(x(i))} y={f1(y(v))} width={f1(bw)} height={f1(hh)} fill={accent} opacity={b || !hasAnyBand ? 0.55 : 0.22} />;
    })}
    {d.map((x0, i) => {
      const v = valOf(x0), b = bandOf(x0);
      let tip = `<b>${dstr(x0.t)}</b> <span class="r">${DOW[new Date(x0.t).getDay()]}</span>`;
      if (descriptive) tip += `<br>${label} <b>${fmtInt(v)}</b>`;
      else if (x0._excl) tip += `<br><span class="nv">Schedule-excluded: not evaluated, and not in the baseline</span>`;
      else { tip += `<br>${label} <b>${fmtInt(v)}</b>`; if (b) tip += `<br><span class="r">Normal ${fmtInt(b.lo)} to ${fmtInt(b.hi)}</span><br>` + (badOf(x0) && !noMarks ? '<span class="bad">● Anomaly: alert fired</span>' : noMarks && badOf(x0) ? '<span class="r">Outside the band; this signal raises no condition</span>' : '<span class="ok">● In range</span>'); else tip += `<br><span class="nv">Warm-up: fewer than ${MIN_BASELINE_RUNS} prior runs, not evaluated</span>`; }
      return <rect key={"h" + i} className="hit" x={f1(x(i))} y={C.PT} width={f1(Math.max(3, bw))} height={C.IH} data-tip={tip} />;
    })}
  </Head>;
}

/* ---------- horizontal ranked bars (Activity layer): no band, no marks ---------- */
export function HBars({ rows, accent = "var(--f-fail)", label = "Count", labelChars = 24, axisTitle, padLeft = 158 }: { rows: { label: string; n: number }[]; accent?: string; label?: string; labelChars?: number; axisTitle?: string; padLeft?: number }) {
  const W = 470, PL = padLeft, PR = 44, PT = 8, PB = 28, rowH = 25, gap = 8;
  if (!rows.length) return <svg viewBox={`0 0 ${W} 60`} width="100%"><text className="glabel" x={W / 2} y={34} textAnchor="middle">Nothing recorded in this period</text></svg>;
  const n = rows.length, plotH = n * rowH, H = PT + plotH + PB, IW = W - PL - PR;
  const max = Math.max(1, ...rows.map((r) => r.n)) * 1.08;
  const x = (v: number) => PL + IW * (v / max);
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
    {niceTicks(0, max, 4).map((v) => <g key={v}><line className="gl" x1={f1(x(v))} y1={PT} x2={f1(x(v))} y2={PT + plotH} /><text className="glabel" x={f1(x(v))} y={PT + plotH + 14} textAnchor="middle">{fmtInt(v)}</text></g>)}
    <line className="axis" x1={PL} y1={PT + plotH} x2={PL + IW} y2={PT + plotH} />
    {axisTitle ? <text className="gltitle" x={PL + IW / 2} y={PT + plotH + 25} textAnchor="middle">{axisTitle}</text> : null}
    {rows.map((r, i) => { const y0 = PT + i * rowH + gap / 2, bh = rowH - gap, cy = y0 + bh / 2 + 3.5; return <g key={i}>
      <text className="hblbl" x={PL - 9} y={f1(cy)} textAnchor="end">{truncLabel(r.label, labelChars)}</text>
      <rect x={PL} y={f1(y0)} width={f1(Math.max(1.5, x(r.n) - PL))} height={bh} rx={2} fill={accent} opacity={0.62} />
      <text className="hbval" x={f1(x(r.n) + 7)} y={f1(cy)}>{fmtInt(r.n)}</text>
      <rect className="hit" x={0} y={f1(y0)} width={W} height={bh} data-tip={`<b>${esc(r.label)}</b><br>${label} <b>${fmtInt(r.n)}</b>`} />
    </g>; })}
  </svg>;
}
