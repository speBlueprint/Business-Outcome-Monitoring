/* Business Outcome Monitoring demo. A presenter's guide bar above a 1400x780 replica of the product.
   Keyboard: ArrowLeft/ArrowRight move the walkthrough, Escape closes the dialog, then the Tools menu.
   Chart tooltips: one delegated listener reads data-tip off whatever is under the pointer.
   Rendered on the client only: the synthetic data is formatted with the viewer's locale and time zone. */
import { useEffect, useRef, useState } from "react";
import { AppProvider, useApp } from "../state/store";
import { AppFrame } from "./AppFrame";
import { GuideBar } from "./GuideBar";

function Shell() {
  const { S, move, escape } = useApp();
  const shell = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape") { escape(); return; }
      /* Arrows still move the walkthrough from inside a dialog, unless the viewer is editing text. */
      const field = t && t.closest ? (t.closest("input,textarea,select") as HTMLInputElement | null) : null;
      if (field && (field.tagName === "SELECT" || field.value)) return;
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [move, escape]);

  useEffect(() => {
    const el = tip.current; if (!el) return;
    const onMove = (e: MouseEvent) => {
      const t = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      const payload = t ? t.getAttribute("data-tip") : null;
      if (!payload) { el.style.opacity = "0"; return; }
      el.innerHTML = payload;
      const pad = 14, w = el.offsetWidth || 220, h = el.offsetHeight || 90;
      let L = e.clientX + pad, T = e.clientY + pad;
      if (L + w > window.innerWidth - 8) L = e.clientX - w - pad;
      if (T + h > window.innerHeight - 8) T = e.clientY - h - pad;
      el.style.left = Math.max(8, L) + "px"; el.style.top = Math.max(8, T) + "px"; el.style.opacity = "1";
    };
    const hide = () => { el.style.opacity = "0"; };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseleave", hide); document.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseleave", hide); document.removeEventListener("scroll", hide, true); };
  }, []);

  /* Presenter scale: as large as the window allows, 1.25x at most, recomputed on resize. */
  useEffect(() => {
    document.body.classList.toggle("present", S.present);
    const fit = () => {
      if (!S.present || !shell.current) return;
      const gh = guide.current?.offsetHeight || 56, ih = window.innerHeight || 1080;
      shell.current.style.setProperty("--scale", Math.min(1.25, Math.max(0.5, (ih - gh - 44) / 780)).toFixed(3));
    };
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [S.present, S.hideNotes]);

  return <div ref={shell} className={`shell${S.present ? " present" : ""}`}>
    <div ref={guide}><GuideBar /></div>
    <div className={`viewport${S.present ? " present" : ""}`}><div className="stage"><AppFrame /></div></div>
    <div id="tip" ref={tip} />
  </div>;
}

export function DemoApp() {
  /* Mount after hydration so the server never renders locale-dependent dates that the client would then disagree with. */
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!ready) return <div className="shell" aria-busy="true" />;
  return <AppProvider><Shell /></AppProvider>;
}
