import { createFileRoute } from "@tanstack/react-router";
import { CampaignWorldMigrationPage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/versions/migrate")({ component: CampaignWorldMigrationPage });
