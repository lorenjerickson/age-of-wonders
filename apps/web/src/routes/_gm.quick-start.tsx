import { createFileRoute } from "@tanstack/react-router";
import { QuickStartPage } from "../QuickStart";

export const Route = createFileRoute("/_gm/quick-start")({
  component: QuickStartRoute,
});

function QuickStartRoute() {
  const { session } = Route.useRouteContext();
  return (
    <QuickStartPage
      gmScope={
        session.authenticated ? session.user.displayName : "local-gm"
      }
    />
  );
}
