import { createFileRoute } from "@tanstack/react-router";
import { ItemCompendiumPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/item-compendium")({
  component: ItemCompendiumPage,
});
