import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstancePlotsPage } from "../CampaignInstancePages";
export const Route = createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/plots_/$plotId")({component: Detail});
function Detail() { const { plotId } = Route.useParams(); return <CampaignInstancePlotsPage selectedPlotId={plotId} />; }
