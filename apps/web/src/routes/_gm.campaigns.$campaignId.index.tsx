import { createFileRoute } from "@tanstack/react-router";
import { CampaignEditorPage } from "../Campaigns";

export const Route = createFileRoute("/_gm/campaigns/$campaignId/")({
  ssr: false,
  component: CampaignRoute,
});

function CampaignRoute() {
  return (
    <CampaignEditorPage id={Route.useParams().campaignId} view="definition" />
  );
}
