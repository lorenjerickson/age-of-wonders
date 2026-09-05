import { createFileRoute } from "@tanstack/react-router";
import { LegacyCampaignRoute } from "../CampaignDetailPanels";

export const Route = createFileRoute("/_gm/campaigns/$campaignId/")({
  ssr: false,
  component: CampaignRoute,
});

function CampaignRoute() {
  return <LegacyCampaignRoute />;
}
