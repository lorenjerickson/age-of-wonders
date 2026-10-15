import { createFileRoute } from "@tanstack/react-router";
import { AstraWorldWorkspace } from "../AstraWorkspace";

export const Route = createFileRoute("/_gm/worlds/$worldId/")({
  component: WorldRoute,
});

function WorldRoute() {
  return <AstraWorldWorkspace />;
}
