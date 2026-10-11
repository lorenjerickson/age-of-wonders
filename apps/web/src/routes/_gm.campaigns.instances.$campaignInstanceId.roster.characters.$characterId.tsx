import { createFileRoute } from "@tanstack/react-router";
import { CharacterDraftEditor } from "../CharacterCreationPage";
import { useCampaignInstance } from "../CampaignInstanceWorkspace";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/roster/characters/$characterId",
)({ component: Page });
function Page() {
  const { instance } = useCampaignInstance();
  const { characterId } = Route.useParams();
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <CharacterDraftEditor
        key={characterId}
        campaignInstanceId={instance.id}
        campaignDefinitionId={instance.campaignDefinitionId}
        characterId={characterId}
      />
    </main>
  );
}
