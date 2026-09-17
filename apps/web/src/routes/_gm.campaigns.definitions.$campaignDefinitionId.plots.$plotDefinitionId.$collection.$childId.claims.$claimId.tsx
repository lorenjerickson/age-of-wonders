import { createFileRoute } from "@tanstack/react-router";
import { CampaignPlotRoutePage } from "../CampaignPlotRoutePages";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/claims/$claimId")({component:Page});
function Page() { const params=Route.useParams(); return <CampaignPlotRoutePage plotId={params.plotDefinitionId} collection={params.collection} childId={params.childId} claimsPage claimId={params.claimId}/>; }
