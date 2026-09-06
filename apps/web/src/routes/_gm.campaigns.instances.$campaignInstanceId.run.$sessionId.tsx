import { createFileRoute } from "@tanstack/react-router";
import { CampaignSessionPage } from "../CampaignInstancePages";

export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/run/$sessionId",
)({
  component: SessionRunRoute,
});

function SessionRunRoute() {
  return (
    <CampaignSessionPage sessionId={Route.useParams().sessionId} operational />
  );
}
