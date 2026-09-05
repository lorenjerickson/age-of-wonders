import { createFileRoute } from "@tanstack/react-router";
import { WorldOverviewPage } from "../WorldAuthoringPages";

export const Route = createFileRoute("/_gm/worlds/$worldId/")({
  component: WorldRoute,
});

function WorldRoute() {
  return <WorldOverviewPage />;
}
