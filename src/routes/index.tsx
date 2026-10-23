import { createFileRoute } from "@tanstack/react-router";

import { DemoApp } from "@/demo/DemoApp";

// The whole demo lives on the home route.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Blueprint Business Outcome Monitoring — Walkthrough" },
      { name: "description", content: "Explore Blueprint's Business Outcome Monitoring walkthrough: estate health, per-flow baselines, alert history and plain-language alerts, with synthetic example data." },
      { property: "og:title", content: "Blueprint Business Outcome Monitoring — Walkthrough" },
      { property: "og:description", content: "An interactive Blueprint walkthrough of flow health judged against each flow's own history, with synthetic example data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <DemoApp />;
}
