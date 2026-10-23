/* Small shared pieces: status pill, tiles, cards, reconciliation line, banners, switch, mode tag. */
import type { ReactNode } from "react";
import type { Flow } from "../lib/types";

export function StatusPill({ f, inline }: { f: Flow; inline?: boolean }) {
  const style = inline ? { verticalAlign: "3px" } : undefined;
  if (f.status === "healthy") return <span className="pill healthy" style={style}><span className="dot" />Healthy</span>;
  if (f.status === "awaiting") return <span className="pill none" style={style}><span className="dot" />Awaiting Baseline</span>;
  const label = inline && f.conditions.length > 1 ? f.conditions.length + " conditions active" : "Needs Attention";
  return <span className="pill attn" style={style}><span className="dot" />{label}</span>;
}
export function Tile({ n, l, tone }: { n: ReactNode; l: ReactNode; tone?: "attn" | "healthy" }) {
  return <div className={`tile${tone ? " " + tone : ""}`}><div className="n">{n}</div><div className="l">{l}</div></div>;
}
export function Card({ title, hint, children, className, style }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card${className ? " " + className : ""}`} style={style}>{title ? <div className="hd"><h3>{title}</h3>{hint ? <span className="hint">{hint}</span> : null}</div> : null}{children}</div>;
}
export function Recon({ children, style }: { children: ReactNode; style?: React.CSSProperties }) { return <div className="recon" style={style}>{children}</div>; }
export function Banner({ tone, icon, title, children, actions }: { tone: "blue" | "amber" | "green"; icon?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return <div className={`banner ${tone}`}>{icon ? <div className="bi">{icon}</div> : null}<div><h4>{title}</h4>{children ? <p>{children}</p> : null}</div>{actions ? <div className="act">{actions}</div> : null}</div>;
}
export function Switch({ on, onClick, disabled }: { on: boolean; onClick?: () => void; disabled?: boolean }) {
  return <span role="switch" aria-checked={on} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} className={`switch${on ? " on" : ""}${disabled ? " dis" : ""}`} onClick={disabled ? undefined : onClick} onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick?.(); } }} />;
}
export function Mode({ m, style }: { m: "inferred" | "custom" | "rule" | "value"; style?: React.CSSProperties }) { return <span className={`mode ${m === "value" ? "inferred" : m}`} style={style}>{m}</span>; }
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label?: string }) {
  return <div className="tf">{label ? <span>{label}</span> : null}{options.map((o) => <button key={String(o.v)} type="button" className={o.v === value ? "active" : ""} onClick={() => onChange(o.v)}>{o.l}</button>)}</div>;
}
