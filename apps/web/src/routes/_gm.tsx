import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "../App";
import { readGmShell } from "../server/readModels";

export const Route = createFileRoute("/_gm")({
  beforeLoad: async ({ location }) => {
    const result = await readGmShell();
    if (!result.session.authenticated || result.session.user.role !== "gm") {
      throw redirect({ to: "/login", search: { returnTo: location.href } });
    }
    return result;
  },
  component: GmShell,
});

function GmShell() {
  const { session } = Route.useRouteContext();
  return (
    <AppShell
      gmScope={session.authenticated ? session.user.displayName : "local-gm"}
    >
      <Outlet />
    </AppShell>
  );
}
