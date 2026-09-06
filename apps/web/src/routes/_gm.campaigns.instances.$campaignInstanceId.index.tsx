import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstanceOverviewPage } from "../CampaignInstancePages";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/",
)({ component: CampaignInstanceOverviewPage });
