import { createFileRoute } from "@tanstack/react-router";
import { CampaignEditorPage } from "../Campaigns";

export const Route = createFileRoute("/_gm/campaigns/$campaignId/locations")({
  ssr: false,
  component: CampaignLocationsRoute,
});

function CampaignLocationsRoute() {
  return (
    <CampaignEditorPage id={Route.useParams().campaignId} view="locations" />
  );
}
