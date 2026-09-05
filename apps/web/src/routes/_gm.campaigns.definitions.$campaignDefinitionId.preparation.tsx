import { createFileRoute } from "@tanstack/react-router";
import { CampaignPreparationPage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/preparation")({ component: CampaignPreparationPage });
