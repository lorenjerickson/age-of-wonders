import { createFileRoute } from "@tanstack/react-router";
import { WorldAggregateBoundary } from "../WorldAggregateBoundary";

export const Route = createFileRoute("/_gm/worlds/$worldId/items/$itemId")({
  component: WorldItemRoute,
});

function WorldItemRoute() {
  return (
    <WorldAggregateBoundary
      title="Item Compendium"
      description="Item editing will publish through the World Definition revision workflow."
    />
  );
}
