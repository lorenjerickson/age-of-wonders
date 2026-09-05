import { createFileRoute } from "@tanstack/react-router";
import { WorldAggregateBoundary } from "../WorldAggregateBoundary";

export const Route = createFileRoute("/_gm/worlds/$worldId/creatures/new")({
  component: NewCreatureRoute,
});

function NewCreatureRoute() {
  return (
    <WorldAggregateBoundary
      title="Bestiary"
      description="Creature creation will publish through the World Definition revision workflow."
    />
  );
}
