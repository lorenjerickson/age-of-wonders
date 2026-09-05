import { createFileRoute } from "@tanstack/react-router";
import { ItemListPage } from "../Items";

export const Route = createFileRoute("/_gm/worlds/$worldId/items/")({
  ssr: false,
  component: WorldItemsRoute,
});

function WorldItemsRoute() {
  return <ItemListPage worldId={Route.useParams().worldId} />;
}
