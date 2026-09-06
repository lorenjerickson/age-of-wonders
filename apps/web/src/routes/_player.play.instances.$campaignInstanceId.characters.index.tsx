import { createFileRoute } from "@tanstack/react-router";
import { CharacterCreationPage } from "../CharacterCreationPage";

export const Route = createFileRoute(
  "/_player/play/instances/$campaignInstanceId/characters/",
)({
  ssr: false,
  component: CharacterIndexRoute,
});

function CharacterIndexRoute() {
  return (
    <CharacterCreationPage
      campaignInstanceId={Route.useParams().campaignInstanceId}
    />
  );
}
