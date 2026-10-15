import {createFileRoute} from "@tanstack/react-router";
import {CampaignInstanceRosterPage} from "../CampaignInstancePages";
export const Route=createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/roster_/invitations_/$recordId")({component:Detail});
function Detail(){return <CampaignInstanceRosterPage section="invitations" selectedRecordId={Route.useParams().recordId}/>;}
