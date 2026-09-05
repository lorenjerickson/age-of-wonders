import { createFileRoute } from "@tanstack/react-router";
import { CampaignVersionsPage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/versions/")({ component: CampaignVersionsPage });
