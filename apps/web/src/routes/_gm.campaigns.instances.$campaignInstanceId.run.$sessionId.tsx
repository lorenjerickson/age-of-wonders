import { createFileRoute } from "@tanstack/react-router";
import { CampaignSessionRunPage } from "../CampaignSessionPage";

export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/run/$sessionId",
)({
  component: SessionRunRoute,
});

function SessionRunRoute() {
  return (
    <CampaignSessionRunPage sessionId={Route.useParams().sessionId} />
  );
}
