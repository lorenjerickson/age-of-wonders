import { createFileRoute } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/bestiary/creatures/$creatureId",
)({ component: CreatureRoute });
function CreatureRoute() {
  return (
    <DraftRecordEditor
      kind="creatures"
      sourceId={
        Route.useParams().creatureId === "new"
          ? undefined
          : Route.useParams().creatureId
      }
    />
  );
}
