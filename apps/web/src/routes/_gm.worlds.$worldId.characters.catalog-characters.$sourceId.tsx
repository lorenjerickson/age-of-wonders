import { createFileRoute } from "@tanstack/react-router";
import { ActorCatalogPage } from "../ActorCatalogPage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/catalog-characters/$sourceId",
)({ component: Page });
function Page() {
  const { sourceId } = Route.useParams();
  return <ActorCatalogPage kind="character-template" sourceId={sourceId} />;
}
