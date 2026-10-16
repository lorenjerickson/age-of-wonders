import { createFileRoute } from "@tanstack/react-router";
import { AstraCodex } from "../AstraCodex";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/bestiary/creatures/$creatureId",
)({ component: CreatureRoute });
function CreatureRoute() {
  const creatureId = Route.useParams().creatureId;
  return (
    <AstraCodex key={creatureId} collection="bestiary" entryId={creatureId} />
  );
}
