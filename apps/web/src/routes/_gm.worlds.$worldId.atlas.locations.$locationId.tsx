import { createFileRoute } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId",
)({ component: LocationRoute });
function LocationRoute() {
  const locationId = Route.useParams().locationId;
  return (
    <DraftRecordEditor
      key={locationId}
      kind="locations"
      sourceId={locationId === "new" ? undefined : locationId}
    />
  );
}
