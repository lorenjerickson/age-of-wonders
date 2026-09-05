import { createFileRoute } from "@tanstack/react-router";
import { CampaignPlotsPage } from "../CampaignDefinitionPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId")({ component: PlotRoute });
function PlotRoute() { return <CampaignPlotsPage plotId={Route.useParams().plotDefinitionId} />; }
