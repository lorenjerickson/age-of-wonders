import {createFileRoute} from "@tanstack/react-router";
import {CampaignPlotRoutePage} from "../CampaignPlotRoutePages";
export const Route=createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/placements/$placementId")({component:Page});
function Page() {const params=Route.useParams();return <CampaignPlotRoutePage plotId={params.plotDefinitionId} collection={params.collection} childId={params.childId} associationPage placementId={params.placementId}/>;}
