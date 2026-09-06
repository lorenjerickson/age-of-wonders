import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstanceSessionsPage } from "../CampaignInstancePages";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/sessions/",
)({ component: CampaignInstanceSessionsPage });
