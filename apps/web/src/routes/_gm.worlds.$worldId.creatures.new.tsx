import { createFileRoute } from "@tanstack/react-router";
import { CreatureCreatePage } from "../Creatures";

export const Route = createFileRoute("/_gm/worlds/$worldId/creatures/new")({
  ssr: false,
  component: NewCreatureRoute,
});

function NewCreatureRoute() {
  return <CreatureCreatePage worldId={Route.useParams().worldId} />;
}
