import { createFileRoute } from "@tanstack/react-router";
import { ItemCreatePage } from "../Items";

export const Route = createFileRoute("/_gm/worlds/$worldId/items/new")({
  ssr: false,
  component: NewItemRoute,
});

function NewItemRoute() {
  return <ItemCreatePage worldId={Route.useParams().worldId} />;
}
