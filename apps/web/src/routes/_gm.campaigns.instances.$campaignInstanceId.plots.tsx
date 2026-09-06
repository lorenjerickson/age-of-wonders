import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstancePlotsPage } from "../CampaignInstancePages";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/plots",
)({ component: CampaignInstancePlotsPage });
