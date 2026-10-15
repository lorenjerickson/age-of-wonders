import { createFileRoute } from "@tanstack/react-router";
import { ActorCatalogPage } from "../ActorCatalogPage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/bestiary/catalog-monsters/$sourceId",
)({ component: Page });
function Page() {
  const { sourceId } = Route.useParams();
  return <ActorCatalogPage kind="monster" sourceId={sourceId} />;
}
