import { createFileRoute } from "@tanstack/react-router";
import { CampaignJoinPage } from "../CampaignJoinPage";

export const Route = createFileRoute("/join/")({
  component: CampaignJoinPage,
});
