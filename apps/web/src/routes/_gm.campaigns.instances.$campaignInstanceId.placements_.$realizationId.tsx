import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstancePlacementsPage } from "../CampaignInstancePages";
export const Route = createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/placements_/$realizationId")({component: Detail});
function Detail() { const { realizationId } = Route.useParams(); return <CampaignInstancePlacementsPage selectedRealizationId={realizationId} />; }
