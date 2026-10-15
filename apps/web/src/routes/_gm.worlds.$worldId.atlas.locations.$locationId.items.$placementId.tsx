import { createFileRoute } from "@tanstack/react-router";
import { LocationCollectionRoute } from "../LocationCollectionPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId/items/$placementId",
)({ component: Page });
function Page() {
  const { locationId, placementId } = Route.useParams();
  return (
    <LocationCollectionRoute
      key={`${locationId}-${placementId}`}
      locationId={locationId}
      collection="items"
      entryId={placementId}
    />
  );
}
