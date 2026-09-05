import { createFileRoute } from "@tanstack/react-router";
import { CreatureListPage } from "../Creatures";

export const Route = createFileRoute("/_gm/worlds/$worldId/creatures/")({
  ssr: false,
  component: WorldCreaturesRoute,
});

function WorldCreaturesRoute() {
  return <CreatureListPage worldId={Route.useParams().worldId} />;
}
