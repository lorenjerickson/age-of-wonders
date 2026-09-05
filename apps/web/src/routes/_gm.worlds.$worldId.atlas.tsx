import { createFileRoute } from "@tanstack/react-router";
import { AtlasPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/atlas")({
  component: AtlasPage,
});
