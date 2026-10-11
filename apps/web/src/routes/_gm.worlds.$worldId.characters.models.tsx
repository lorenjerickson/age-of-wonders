import { createFileRoute } from "@tanstack/react-router";
import { WorldModelFacets } from "../WorldModelFacets";
import { CharacterModelsPage } from "../WorldAuthoringPages";

export const Route = createFileRoute("/_gm/worlds/$worldId/characters/models")({
  component: () => (
    <WorldModelFacets>
      <CharacterModelsPage />
    </WorldModelFacets>
  ),
});
