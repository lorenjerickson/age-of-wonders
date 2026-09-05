import { createFileRoute } from "@tanstack/react-router";
import { CreatureEditorPage } from "../Creatures";

export const Route = createFileRoute(
  "/_gm/worlds/$worldId/creatures/$creatureId",
)({
  ssr: false,
  component: WorldCreatureRoute,
});

function WorldCreatureRoute() {
  const { worldId, creatureId } = Route.useParams();
  return <CreatureEditorPage worldId={worldId} creatureId={creatureId} />;
}
