import { createFileRoute } from "@tanstack/react-router";
import { WorldAggregateBoundary } from "../WorldAggregateBoundary";

export const Route = createFileRoute("/_gm/worlds/$worldId/items/")({
  component: WorldItemsRoute,
});

function WorldItemsRoute() {
  return (
    <WorldAggregateBoundary
      title="Item Compendium"
      description="Items, objects, and hazards belonging to this versioned World Definition will be authored here."
    />
  );
}
