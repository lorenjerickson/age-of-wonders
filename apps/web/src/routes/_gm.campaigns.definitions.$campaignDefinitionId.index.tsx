import { createFileRoute } from "@tanstack/react-router";
import { CampaignDefinitionOverviewPage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/")({ component: CampaignDefinitionOverviewPage });
