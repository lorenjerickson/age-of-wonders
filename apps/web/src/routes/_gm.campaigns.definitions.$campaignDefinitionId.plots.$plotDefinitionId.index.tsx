import { createFileRoute } from "@tanstack/react-router";
import { CampaignPlotsPage } from "../CampaignPlotPages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/")({component:Page});
function Page() { const params=Route.useParams(); return <CampaignPlotsPage plotId={params.plotDefinitionId} />; }
