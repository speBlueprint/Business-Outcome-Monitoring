/* Statistics and formatting shared by the engine and the charts.
   The anomaly calculation is the one ALC already ships (ITEM-1587): a trailing baseline,
   median ± 3 × Scaled MAD, two passes to trim inliers, lower bound clamped at zero,
   and a per-signal minimum band width. */

export const DAY = 86400000;
export const HOUR = 3600000;
/* Fixed reference "now": Fri 24 Jul 2026, 12:00. Every date in the demo is relative to it. */
export const NOW = new Date(2026, 6, 24, 12, 0, 0).getTime();
export const WIN_START = NOW - 90 * DAY; /* pinned 90-day baseline window (FR-2.11) */
export const MIN_BASELINE_RUNS = 10; /* FR-2.8 */
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface Band { median: number; lo: number; hi: number; width: number; n: number }

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export function mad(arr: number[]): number {
  if (!arr.length) return 0;
  const m = median(arr);
  return median(arr.map((x) => Math.abs(x - m)));
}

/* Robust band (FR-2.3 to FR-2.5). Two passes: trim to inliers, then recompute on the survivors,
   so a single chronic outlier cannot inflate the band enough to hide itself. */
export function computeBand(values: number[], opts: { minWidth?: number } = {}): Band {
  const minWidth = opts.minWidth || 0;
  const vals = values.filter((v) => Number.isFinite(v));
  if (vals.length < 2) { const m = vals.length ? vals[0] : 0; return { median: m, lo: Math.max(0, m), hi: m, width: 0, n: vals.length }; }
  const m1 = median(vals), sm1 = mad(vals) * 1.4826, w1 = Math.max(3 * sm1, minWidth);
  const inliers = vals.filter((v) => Math.abs(v - m1) <= w1);
  const base = inliers.length >= Math.max(2, Math.floor(vals.length * 0.5)) ? inliers : vals;
  const m = median(base), sm = mad(base) * 1.4826, w = Math.max(3 * sm, minWidth);
  return { median: m, lo: Math.max(0, m - w), hi: m + w, width: w, n: vals.length };
}
/* Every value signal is two-sided (FR-2.6). */
export function isAnom(v: number, band: Band | null): boolean {
  if (!band || !Number.isFinite(v)) return false;
  return v < band.lo || v > band.hi;
}

/* ---- formatting ---- */
export function fmtDur(s: number): string {
  if (s < 90) return Math.round(s) + "s";
  const m = s / 60;
  return m < 60 ? m.toFixed(1).replace(/\.0$/, "") + "m" : (m / 60).toFixed(1) + "h";
}
/* HH:MM:SS, matching the Duration columns in the product. */
export function fmtHMS(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "-";
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return p(h) + ":" + p(m) + ":" + p(sec);
}
export function fmtInt(n: number): string { return Math.round(n).toLocaleString("en-US"); }
export function pct(n: number): string { return (n * 100).toFixed(n < 0.1 ? 1 : 0) + "%"; }
export function agoLabel(ms: number): string {
  const h = (NOW - ms) / HOUR;
  if (h < 1) return Math.max(1, Math.round(h * 60)) + "m ago";
  if (h < 48) return Math.round(h) + "h ago";
  return Math.round(h / 24) + "d ago";
}
export function dstr(ms: number): string { return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
/* Absolute datetime, the format the All Flow Activity table already uses ("Jul 13, 2026 3:09 PM"). */
export function dtstr(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export function startOfDay(ms: number): number { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
export const DAY0 = startOfDay(WIN_START);
export function dayIndex(ms: number): number { return Math.round((startOfDay(ms) - DAY0) / DAY); }

export function fmtVal(v: number, unit: string): string {
  if (unit === "%") return Math.round(v * 100) + "%";
  if (unit === "s") return fmtDur(Math.max(0, v));
  return fmtInt(v);
}
export function niceTicks(min: number, max: number, n: number): number[] {
  const span = max - min; if (!(span > 0)) return [min];
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out.length ? out : [min];
}
export function truncLabel(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
export function esc(s: unknown): string { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
