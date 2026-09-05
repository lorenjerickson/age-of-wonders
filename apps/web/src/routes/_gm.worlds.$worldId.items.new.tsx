import { createFileRoute } from "@tanstack/react-router";
import { WorldAggregateBoundary } from "../WorldAggregateBoundary";

export const Route = createFileRoute("/_gm/worlds/$worldId/items/new")({
  component: NewItemRoute,
});

function NewItemRoute() {
  return (
    <WorldAggregateBoundary
      title="Item Compendium"
      description="Item creation will publish through the World Definition revision workflow."
    />
  );
}
