import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstanceJoinPage } from "../CampaignInstanceJoinPages";

export const Route = createFileRoute("/join/instance")({
  component: CampaignInstanceJoinPage,
});
