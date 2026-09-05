import { createFileRoute } from "@tanstack/react-router";
import { CampaignPlacementsPage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/placements")({ component: CampaignPlacementsPage });
