import { createFileRoute } from "@tanstack/react-router";
import { CharacterModelsPage } from "../WorldAuthoringPages";

export const Route = createFileRoute("/_gm/worlds/$worldId/characters")({
  component: WorldCharactersLanding,
});

function WorldCharactersLanding() {
  return <CharacterModelsPage />;
}
