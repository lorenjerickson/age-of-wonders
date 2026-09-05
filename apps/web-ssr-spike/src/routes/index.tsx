import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "SSR spike | Age of Wonders" }] }),
  component: PublicOverview,
});

function PublicOverview() {
  return (
    <main className="shell stack">
      <header>
        <p className="muted">Phase 0 acceptance fixture</p>
        <h1>Age of Wonders SSR/SSG spike</h1>
      </header>
      <section className="panel stack">
        <h2>Static rendering</h2>
        <p data-testid="prerender-proof">
          This identity-independent page is prerendered during the production
          build.
        </p>
      </section>
      <nav className="panel stack" aria-label="Spike routes">
        <Link
          to="/world/atlas/locations/$locationId"
          params={{ locationId: "location-1" }}
        >
          Open the protected nested location fixture
        </Link>
        <Link
          to="/campaigns/instances/$campaignInstanceId/run/$sessionId"
          params={{ campaignInstanceId: "campaign-1", sessionId: "session-1" }}
        >
          Open the client-only Run fixture
        </Link>
        <Link to="/operations">Exercise mutations and uploads</Link>
        <Link to="/login">Open the login fixture</Link>
      </nav>
    </main>
  );
}
