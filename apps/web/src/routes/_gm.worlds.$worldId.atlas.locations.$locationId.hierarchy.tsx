import { createFileRoute } from "@tanstack/react-router";
import { LocationSectionPage } from "../LocationWorkspacePages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId/hierarchy",
)({ component: SectionRoute });
function SectionRoute() {
  const { locationId } = Route.useParams();
  return (
    <LocationSectionPage
      key={locationId}
      locationId={locationId}
      section="hierarchy"
    />
  );
}
