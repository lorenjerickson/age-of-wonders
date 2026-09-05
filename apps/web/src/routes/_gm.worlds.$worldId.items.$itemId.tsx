import { createFileRoute } from "@tanstack/react-router";
import { ItemEditorPage } from "../Items";

export const Route = createFileRoute("/_gm/worlds/$worldId/items/$itemId")({
  ssr: false,
  component: WorldItemRoute,
});

function WorldItemRoute() {
  const { worldId, itemId } = Route.useParams();
  return <ItemEditorPage worldId={worldId} itemId={itemId} />;
}
