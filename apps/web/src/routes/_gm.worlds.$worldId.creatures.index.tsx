import { createFileRoute } from "@tanstack/react-router";
import { WorldAggregateBoundary } from "../WorldAggregateBoundary";

export const Route = createFileRoute("/_gm/worlds/$worldId/creatures/")({
  component: WorldCreaturesRoute,
});

function WorldCreaturesRoute() {
  return (
    <WorldAggregateBoundary
      title="Bestiary"
      description="Creatures belonging to this versioned World Definition will be authored here."
    />
  );
}
