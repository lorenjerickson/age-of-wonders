import { createFileRoute } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId",
)({ component: LocationRoute });
function LocationRoute() {
  return (
    <DraftRecordEditor
      kind="locations"
      sourceId={
        Route.useParams().locationId === "new"
          ? undefined
          : Route.useParams().locationId
      }
    />
  );
}
