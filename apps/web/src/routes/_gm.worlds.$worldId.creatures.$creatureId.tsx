import { createFileRoute } from "@tanstack/react-router";
import { WorldAggregateBoundary } from "../WorldAggregateBoundary";

export const Route = createFileRoute(
  "/_gm/worlds/$worldId/creatures/$creatureId",
)({
  component: WorldCreatureRoute,
});

function WorldCreatureRoute() {
  return (
    <WorldAggregateBoundary
      title="Bestiary"
      description="Creature editing will publish through the World Definition revision workflow."
    />
  );
}
