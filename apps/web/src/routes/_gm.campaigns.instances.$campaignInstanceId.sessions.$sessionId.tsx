import { createFileRoute } from "@tanstack/react-router";
import { CampaignSessionPage } from "../CampaignInstancePages";

export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/sessions/$sessionId",
)({
  component: SessionRoute,
});

function SessionRoute() {
  return <CampaignSessionPage sessionId={Route.useParams().sessionId} />;
}
