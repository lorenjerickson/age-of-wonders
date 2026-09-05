import { createFileRoute } from "@tanstack/react-router";
import { CampaignReviewPage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/versions/draft/review")({ component: CampaignReviewPage });
