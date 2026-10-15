import {createFileRoute} from "@tanstack/react-router";
import {CampaignInstanceRosterPage} from "../CampaignInstancePages";
export const Route=createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/roster_/invitations")({component:()=> <CampaignInstanceRosterPage section="invitations" />});
