import { createFileRoute } from "@tanstack/react-router";
import { ActorCatalogPage } from "../ActorCatalogPage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/catalog-characters/",
)({ component: Page });
function Page() {
  return <ActorCatalogPage kind="character-template" />;
}
