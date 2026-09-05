import { createFileRoute } from "@tanstack/react-router";
import { WorldEditor } from "../WorldEditor";

export const Route = createFileRoute("/_gm/worlds/$worldId/")({
  ssr: false,
  component: WorldRoute,
});

function WorldRoute() {
  return <WorldEditor id={Route.useParams().worldId} />;
}
