import {createFileRoute} from "@tanstack/react-router";
import {CampaignInstancePlacementsPage} from "../CampaignInstancePages";
export const Route=createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/actors/$actorId")({component:Detail});
function Detail(){return <CampaignInstancePlacementsPage selectedActorId={Route.useParams().actorId}/>;}
