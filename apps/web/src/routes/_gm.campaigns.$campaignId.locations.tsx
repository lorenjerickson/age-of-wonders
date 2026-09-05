import { createFileRoute } from "@tanstack/react-router";
import { LegacyCampaignRoute } from "../CampaignDetailPanels";

export const Route = createFileRoute("/_gm/campaigns/$campaignId/locations")({
  ssr: false,
  component: CampaignLocationsRoute,
});

function CampaignLocationsRoute() {
  return <LegacyCampaignRoute />;
}
