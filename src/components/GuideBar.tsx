/* Presenter's guide bar: step notes, Back/Next, Reset, and the options (short path, presenter scale, hide notes).
   It sits above the product frame and is not part of the product. */
import { STEPS, useApp } from "../state/store";

export function GuideBar() {
  const { S, set, move, reset, path, isLast } = useApp();
  const st = STEPS[S.step], pos = path.indexOf(S.step);
  const k = pos < 0 ? `Step ${S.step + 1} of ${STEPS.length} · ${st.where} · off the short path` : `Step ${pos + 1} of ${path.length} · ${st.where}${S.shortMode ? " · short path" : ""}`;
  return <div className={`guide${S.hideNotes ? " nonotes" : ""}`}>
    <div className="story" aria-live="polite"><span className="k">{k}</span><span className="t">{st.t}</span><p className="d" title={st.d}>{st.d}</p></div>
    <div className="nav">
      <div className="dots" aria-hidden="true">{path.map((i) => <i key={i} className={i === S.step ? "on" : ""} title={STEPS[i].t} />)}</div>
      <button type="button" disabled={pos < 0 ? S.step <= 0 : pos <= 0} onClick={() => move(-1)}>Back</button>
      <button type="button" className="pri" onClick={() => (isLast ? reset() : move(1))}>{isLast ? "Start over" : "Next"}</button>
      <button type="button" onClick={reset}>Reset</button>
      <span className="opts">
        <label><input type="checkbox" checked={S.shortMode} onChange={(e) => set({ shortMode: e.target.checked })} /> Short path</label>
        <label><input type="checkbox" checked={S.present} onChange={(e) => set({ present: e.target.checked })} /> Presenter</label>
        <label><input type="checkbox" checked={S.hideNotes} onChange={(e) => set({ hideNotes: e.target.checked })} /> Hide notes</label>
      </span>
    </div>
    <div className="legend"><span>Rows, tabs, charts, switches and the buttons in the walkthrough are live.</span><span>Example data: synthetic Northwind estate, generated in the browser. Dates are relative to 24 Jul 2026.</span></div>
  </div>;
}
