import { createFileRoute } from "@tanstack/react-router";
import { CharacterCreationPage } from "../CharacterCreationPage";

export const Route = createFileRoute(
  "/_player/play/instances/$campaignInstanceId/characters/$characterId",
)({
  ssr: false,
  component: CharacterRoute,
});

function CharacterRoute() {
  const { campaignInstanceId, characterId } = Route.useParams();
  return (
    <CharacterCreationPage
      campaignInstanceId={campaignInstanceId}
      characterId={characterId}
    />
  );
}
