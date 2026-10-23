# Business Outcome Monitoring demo: project brief

A clickable prototype of one feature inside Blueprint's platform: Business Outcome Monitoring for Power Automate Desktop estates. It is driven by a presenter from the guide bar at the top and shown to customers, partners and Microsoft contacts. The feature is live in the product today in a rougher form; this demo shows the intended design.

## What the feature does

Conventional error handling proves a bot finished. It cannot tell you whether the bot did meaningful work. A flow that stopped running, ran empty, or fed a downstream queue nothing throws no error and looks healthy until a business process breaks. Business Outcome Monitoring:

1. **Judges every flow against its own history.** A trailing 90-day baseline (median ± 3 × Scaled MAD, the calculation ALC already ships) gives each signal a normal range. Runs, days or queue rates outside it are anomalies.
2. **Raises nine alert types.** Six value types (Run Duration, Runs Per Day, Queue Success / Kickout / Error Rate, Producer Items Added) and three rule types (Run Frequency, Consecutive Failed Runs, Flow Paused). Each is a stateful condition that activates and self-clears. No user action clears a condition.
3. **Shows the estate on one page.** Health (what needs attention now) above Activity (what happened, absolute counts, no baseline), then an All Flows table.
4. **Gives each flow a Monitoring tab** with Overview (six run-level KPI tiles, one chart per monitored signal, the run table), Alert History (every episode ever, kept indefinitely) and Settings (min/max pair per signal, Inferred or Custom per bound, three rule fields, nine switches, per-flow recipients).
5. **Sends one plain-language email per episode** to the people who own the business outcome, including recipients with no Blueprint account. Conditions from the same run are batched into one notification.

## The synthetic estate

Eight Northwind flows generated in the browser from a fixed seed. "Now" is Fri 24 Jul 2026 12:00. Each one carries a scenario:

| Flow | Scenario |
|---|---|
| Invoice Processing | Healthy queue consumer with exclusions configured. Used for the Settings step. |
| Vendor Onboarding | Last run succeeded 26h ago, window is 24h. Run Frequency with no bad run. No exclusions set. |
| GL Reconciliation | Producer silent failure: runs succeed, items added fell from ~420 to ~24. The headline scenario. |
| PO Matching | Several conditions at once (duration, kickout, error, consecutive failures). One consolidated email. |
| Daily Bank Reconciliation | Weekday-only, no exclusions, so weekend zero-run days flag. Exclude weekends live and they clear. |
| Employee Offboarding | Paused 41h, threshold 24h. |
| License Reclamation | Custom baselines set at 6 runs; now has 11, so the switch-to-inferred offer appears. |
| Quarterly Compliance Report | 4 runs in 90 days: Awaiting Baseline. Set custom baselines to start monitoring. |

## Hard rules (decided by the product owner; do not undo them)

- **Product-realistic.** No sales copy, slogans or "Blueprint does this for you" asides inside the app frame. Persuasion belongs to the presenter. Guide-bar notes say what is on screen.
- **Honesty line stays.** "Prototype · example data" in the frame and the synthetic-data line in the guide bar. Never present the data as real.
- **Health model is fixed.** Every flow is monitored. One field, three values: Healthy, Needs Attention, Awaiting Baseline. An active condition outranks baseline state. Tiles do not sum, and the reconciliation line under them explains why.
- **No user-clear anywhere.** No acknowledge, dismiss, snooze or mark-false-positive. Include in baseline recomputes the band; it never clears a condition directly.
- **Nine alert types, direction as an attribute.** Do not split a two-sided signal into two types. Successful and failed runs per day are charted but never alert and have no settings fields.
- **Alert History accumulates.** Rows are written on activation and never removed. State comes from the episode's own clear timestamp.
- **One notification wording,** outcome-framed, not configurable. No technical variant, no per-recipient roles, no clear or reminder emails.
- **Red is reserved for anomalies**, drawn as an enlarged diamond with a white ring, never as a family accent or bar fill. Activity charts carry no band and no marks.
- **The timeframe selector changes only what is drawn.** It never changes the band, the health status or whether a point is an anomaly.
- **Vocabulary is fixed:** Healthy / Needs Attention / Awaiting Baseline; Inferred / Custom; condition, episode, alert type; Time of issue; Include in baseline. Do not introduce severity levels, scores or "incidents".

## Where things live

- `src/lib/stats.ts`: the band calculation, constants (NOW, the 90-day window, the 10-run minimum), formatters.
- `src/data/flows.ts`: the eight flows and their generator. Change scenarios here only; keep the generator order or the data changes.
- `src/lib/engine.ts`: analyze() (baselines, conditions, Alert History), settings, the estate rollups, every mutation, the notification wording.
- `src/state/store.tsx`: view state, dialogs, toast, the walkthrough STEPS and the short path.
- `src/components/`: Estate (home), FlowPage (header, tabs), Overview, RunsTable, History, Settings, Modals, AppFrame (product chrome), GuideBar, charts/charts.tsx.
- `src/styles/app.css`: the whole stylesheet. Tailwind is present but its preflight is off; keep the class names.

## Walkthrough (ten steps; short path = 1, 3, 6, 7, 9)

1. Estate health. 2. Turn on email alerting (dialog). 3. GL Reconciliation: a silent failure. 4. GL Alert History. 5. PO Matching: several conditions. 6. PO Matching notification preview. 7. Daily Bank Reconciliation: exclude weekends live. 8. Vendor Onboarding: the run that did not happen. 9. Invoice Processing Settings. 10. Quarterly Compliance Report: awaiting a baseline.

Keyboard: arrows move the walkthrough, Escape closes the dialog, then the Tools menu. Presenter mode scales the 1400×780 frame to the window.
