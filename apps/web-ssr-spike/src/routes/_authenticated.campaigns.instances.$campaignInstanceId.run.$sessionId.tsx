import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute(
  "/_authenticated/campaigns/instances/$campaignInstanceId/run/$sessionId",
)({
  ssr: false,
  component: ClientOnlyRun,
  pendingComponent: () => (
    <section className="panel">
      <p className="muted">Preparing the client-only Run surface…</p>
    </section>
  ),
});

function ClientOnlyRun() {
  const [viewportWidth] = useState(() => window.innerWidth);
  return (
    <main className="panel stack" data-testid="client-only-run">
      <p className="muted">Client-only route behind a server access gate</p>
      <h1>Run workspace fixture</h1>
      <p>
        The browser-only surface mounted successfully at a viewport width of{" "}
        {viewportWidth}px.
      </p>
    </main>
  );
}
