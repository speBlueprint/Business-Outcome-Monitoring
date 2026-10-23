# Paste this into Lovable → Project Settings → Knowledge

This is a demo of one feature in Blueprint's platform: Business Outcome Monitoring for Power Automate Desktop estates. It judges every flow against its own 90-day history, raises nine kinds of condition, shows the estate as Health above Activity, gives each flow a Monitoring tab (Overview, Alert History, Settings) and previews the plain-language alert email. It is a clickable prototype with synthetic data generated in the browser, driven by a presenter from the guide bar at the top. Read PROJECT_BRIEF.md before any change.

Rules that must survive every edit:

1. Product-realistic. Nothing persuasive inside the app frame: no slogans, no comparison cards, no "Blueprint does this for you". Guide-bar notes say only what is on screen.
2. Keep the honesty lines: "Prototype · example data" in the frame and the synthetic-data line in the guide bar. Never claim the data is real.
3. Health is one field with three values: Healthy / Needs Attention / Awaiting Baseline. Every flow is monitored. An active condition outranks baseline state. The tiles do not sum; keep the reconciliation line that explains it.
4. No user-clear anywhere: no acknowledge, dismiss, snooze or mark-false-positive. Include in baseline recomputes the band and clears nothing directly.
5. Nine alert types with direction as an attribute, never split into "too fast" and "too slow" types. Successful and failed runs per day are charted only: no anomaly marks, no conditions, no settings fields.
6. Alert History rows are written on activation and never removed; State comes from the episode's own clear timestamp.
7. One notification wording, plain language, not configurable. No technical variant, no recipient roles, no clear or reminder emails. Conditions from the same run are batched into one email.
8. Red is reserved for anomalies (enlarged diamond with a white ring). Activity charts have no band and no marks. One accent hue per metric family.
9. The timeframe selector changes only what is drawn, never the band, the status or whether a point is an anomaly.
10. The engine lives in src/lib/engine.ts and the data in src/data/flows.ts. Do not change the calculation (median ± 3 × Scaled MAD, 10-run minimum, pinned 90 days) or the generator order without being asked.
11. State, dialogs and the walkthrough live in src/state/store.tsx. Add new behaviour as store or engine functions, not ad-hoc local state, unless it is purely a form field.
12. Keep the product look: light theme, navy header, grey table headers, blue links, Open Sans in the frame, nothing below 11px. Do not replace src/demo.css with a redesign; keep its class names. Keep Tailwind preflight off in src/styles.css.
13. Keyboard behaviour: arrows move the walkthrough, Escape closes the dialog, then the Tools menu. Keep it.

When asked for a change, make the smallest edit that does it, in the component under src/demo/ that owns that screen.
