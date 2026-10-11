import { locationHref } from "../locationWorkspaceModel";
import { LocationSectionPage } from "../LocationWorkspacePages";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
import { LocationRecordView } from "../LocationRecordView";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId",
)({ component: LocationRoute });
function LocationRoute() {
  const { locationId, worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  if (locationId !== "new")
    return (
      <LocationRecordView locationId={locationId}>
        {pathname !== locationHref(worldId, locationId) ? (
          <Outlet />
        ) : (
          <LocationSectionPage locationId={locationId} section="description" />
        )}
      </LocationRecordView>
    );
  if (pathname !== locationHref(worldId, locationId)) return <Outlet />;
  return (
    <DraftRecordEditor
      key={locationId}
      kind="locations"
      sourceId={locationId === "new" ? undefined : locationId}
    />
  );
}
