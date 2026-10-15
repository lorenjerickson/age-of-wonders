import { createFileRoute } from "@tanstack/react-router";
import { LocationCollectionRoute } from "../LocationCollectionPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId/discoveries/$discoveryId",
)({ component: Page });
function Page() {
  const { locationId, discoveryId } = Route.useParams();
  return (
    <LocationCollectionRoute
      key={`${locationId}-${discoveryId}`}
      locationId={locationId}
      collection="discoveries"
      entryId={discoveryId}
    />
  );
}
