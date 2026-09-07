import { createFileRoute } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/bestiary/creatures/$creatureId",
)({ component: CreatureRoute });
function CreatureRoute() {
  const creatureId = Route.useParams().creatureId;
  return (
    <DraftRecordEditor
      key={creatureId}
      kind="creatures"
      sourceId={creatureId === "new" ? undefined : creatureId}
    />
  );
}
