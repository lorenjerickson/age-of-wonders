import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstancePlacementsPage } from "../CampaignInstancePages";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/placements",
)({ component: CampaignInstancePlacementsPage });
