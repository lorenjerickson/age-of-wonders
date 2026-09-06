import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstanceMigrationPage } from "../CampaignInstancePages";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/versions/migrate",
)({ component: CampaignInstanceMigrationPage });
