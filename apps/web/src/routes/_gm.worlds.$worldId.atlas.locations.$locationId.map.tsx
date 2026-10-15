import { createFileRoute } from "@tanstack/react-router";
import { WorldMapPage } from "../WorldMapPage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId/map",
)({ component: MapRoute });
function MapRoute() {
  const { locationId } = Route.useParams();
  return <WorldMapPage key={locationId} locationId={locationId} inlineTools />;
}
