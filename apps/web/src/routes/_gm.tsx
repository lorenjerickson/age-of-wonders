import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "../App";
import { readGmShell } from "../server/readModels";

export const Route = createFileRoute("/_gm")({
  beforeLoad: async ({ location }) => {
    const result = await readGmShell();
    if (!result.session.authenticated) {
      throw redirect({ to: "/login", search: { returnTo: location.href } });
    }
    const gm = result.session.user.role === "gm";
    const settings = location.pathname.startsWith("/settings");
    if (!gm && !(settings && result.session.user.systemAdministrator)) {
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
      gmAccess={session.authenticated && session.user.role === "gm"}
      systemAdministrator={
        session.authenticated && session.user.systemAdministrator
      }
    >
      <Outlet />
    </AppShell>
  );
}
