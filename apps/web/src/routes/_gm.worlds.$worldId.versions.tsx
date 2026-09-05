import { createFileRoute } from "@tanstack/react-router";
import { WorldVersionsPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/versions")({
  component: WorldVersionsPage,
});
