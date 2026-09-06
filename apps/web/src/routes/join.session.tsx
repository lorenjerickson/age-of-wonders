import { createFileRoute } from "@tanstack/react-router";
import { CampaignSessionJoinPage } from "../CampaignInstanceJoinPages";

export const Route = createFileRoute("/join/session")({
  component: CampaignSessionJoinPage,
});
