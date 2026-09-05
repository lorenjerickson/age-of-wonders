import { createFileRoute } from "@tanstack/react-router";
import { CampaignDefinitionCreatePage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/new")({ component: CampaignDefinitionCreatePage });
