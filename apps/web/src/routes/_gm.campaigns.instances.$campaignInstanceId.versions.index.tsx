import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstanceVersionsPage } from "../CampaignInstancePages";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/versions/",
)({ component: CampaignInstanceVersionsPage });
