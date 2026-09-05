import { createFileRoute } from "@tanstack/react-router";
import { CharacterCreationPage } from "../CharacterCreationPage";

export const Route = createFileRoute("/_player/play/characters/$characterId")({
  ssr: false,
  component: CharacterRoute,
});

function CharacterRoute() {
  return <CharacterCreationPage characterId={Route.useParams().characterId} />;
}
