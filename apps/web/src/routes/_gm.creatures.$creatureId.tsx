import { createFileRoute } from "@tanstack/react-router";
import { CreatureEditorPage } from "../Creatures";

export const Route = createFileRoute("/_gm/creatures/$creatureId")({
  ssr: false,
  component: CreatureRoute,
});

function CreatureRoute() {
  return <CreatureEditorPage creatureId={Route.useParams().creatureId} />;
}
