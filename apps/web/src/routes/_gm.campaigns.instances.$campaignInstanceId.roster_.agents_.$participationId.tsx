import {createFileRoute} from "@tanstack/react-router";
import {CampaignInstanceAgentsPage} from "../CampaignInstancePages";
export const Route=createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/roster_/agents_/$participationId")({component:Detail});
function Detail(){return <CampaignInstanceAgentsPage selectedParticipationId={Route.useParams().participationId}/>;}
