<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## This project: Business Outcome Monitoring demo

Before changing anything under `src/demo/`, `src/state/`, `src/lib/engine.ts`, `src/lib/stats.ts`, `src/data/` or `src/demo.css`, read `PROJECT_BRIEF.md`. It holds the rules the demo must keep (product-realistic copy, the three-value health model, no user-clear, nine alert types, one notification wording, red reserved for anomalies) and the eight scenarios. Keep Tailwind preflight off in `src/styles.css`.

- The demo mounts on the `/` route (`src/routes/index.tsx` → `src/demo/DemoApp.tsx`) and renders on the client only, because its synthetic dates are formatted in the viewer's locale.
- The engine (`src/lib/engine.ts`) keeps mutable module state on purpose; the store bumps a tick after every mutation. Add behaviour as engine or store functions, not ad-hoc local state.
