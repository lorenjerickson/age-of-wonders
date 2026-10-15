import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { LocationSectionPage } from "../LocationWorkspacePages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId/items",
)({ component: SectionRoute });
function SectionRoute() {
  const { locationId } = Route.useParams();
  if (useLocation().pathname.replace(/\/$/, "").split("/").length > 7)
    return <Outlet />;
  return (
    <LocationSectionPage
      key={locationId}
      locationId={locationId}
      section="items"
    />
  );
}
