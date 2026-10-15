import { createFileRoute } from "@tanstack/react-router";
import { ActorCatalogPage } from "../ActorCatalogPage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/bestiary/catalog-monsters/",
)({ component: Page });
function Page() {
  return <ActorCatalogPage kind="monster" />;
}
