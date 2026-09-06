import { createFileRoute } from "@tanstack/react-router";
import { CampaignSessionParticipantPage } from "../CampaignSessionParticipantPage";

export const Route = createFileRoute(
  "/_participant/play/instances/$campaignInstanceId/sessions/$sessionId",
)({
  ssr: false,
  component: ParticipantSessionRoute,
});

function ParticipantSessionRoute() {
  const params = Route.useParams();
  return (
    <CampaignSessionParticipantPage
      campaignInstanceId={params.campaignInstanceId}
      sessionId={params.sessionId}
    />
  );
}
