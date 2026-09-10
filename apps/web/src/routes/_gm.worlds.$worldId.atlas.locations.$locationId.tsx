import { locationHref } from "../locationWorkspaceModel";
import { LocationSectionPage } from "../LocationWorkspacePages";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId",
)({ component: LocationRoute });
function LocationRoute() {
  const { locationId, worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  if (pathname !== locationHref(worldId, locationId)) return <Outlet />;
  if (locationId !== "new")
    return (
      <LocationSectionPage locationId={locationId} section="description" />
    );
  return (
    <DraftRecordEditor
      key={locationId}
      kind="locations"
      sourceId={locationId === "new" ? undefined : locationId}
    />
  );
}
