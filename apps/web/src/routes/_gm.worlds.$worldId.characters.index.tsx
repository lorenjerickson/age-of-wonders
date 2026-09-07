import { createFileRoute } from "@tanstack/react-router";
import { CharactersPage } from "../WorldAuthoringPages";

export const Route = createFileRoute("/_gm/worlds/$worldId/characters/")({
  component: CharactersPage,
});
