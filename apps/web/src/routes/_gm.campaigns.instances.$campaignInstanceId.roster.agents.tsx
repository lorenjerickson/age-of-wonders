import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstanceAgentsPage } from "../CampaignInstancePages";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/roster/agents",
)({ component: CampaignInstanceAgentsPage });
