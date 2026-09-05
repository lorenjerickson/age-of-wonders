import { createFileRoute } from "@tanstack/react-router";
import { BestiaryPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/bestiary")({
  component: BestiaryPage,
});
