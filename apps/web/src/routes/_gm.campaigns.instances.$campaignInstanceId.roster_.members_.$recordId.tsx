import {createFileRoute} from "@tanstack/react-router";
import {CampaignInstanceRosterPage} from "../CampaignInstancePages";
export const Route=createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/roster_/members_/$recordId")({component:Detail});
function Detail(){return <CampaignInstanceRosterPage section="members" selectedRecordId={Route.useParams().recordId}/>;}
