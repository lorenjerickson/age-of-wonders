import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";
import { readCurrentSession } from "../server/functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const session = await readCurrentSession();
    if (!session.authenticated || session.user.role !== "gm") {
      throw redirect({
        to: "/login",
        search: { returnTo: location.href },
      });
    }
    return { user: session.user };
  },
  component: AuthenticatedShell,
  pendingComponent: () => (
    <main className="shell">
      <p className="muted">Checking access…</p>
    </main>
  ),
});

function AuthenticatedShell() {
  const { user } = Route.useRouteContext();
  return (
    <div className="shell">
      <nav className="navigation" aria-label="Spike navigation">
        <Link to="/">Overview</Link>
        <Link
          to="/world/atlas/locations/$locationId"
          params={{ locationId: "location-1" }}
        >
          Location
        </Link>
        <Link
          to="/campaigns/instances/$campaignInstanceId/run/$sessionId"
          params={{ campaignInstanceId: "campaign-1", sessionId: "session-1" }}
        >
          Run
        </Link>
        <Link to="/operations">Operations</Link>
        <span className="muted">Signed in as {user.displayName}</span>
      </nav>
      <Outlet />
    </div>
  );
}
