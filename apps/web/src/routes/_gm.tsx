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
  const { world, campaign } = Route.useRouteContext();
  return (
    <AppShell initialWorld={world} initialCampaign={campaign}>
      <Outlet />
    </AppShell>
  );
}
