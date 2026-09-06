import { createFileRoute } from "@tanstack/react-router";
import { CampaignInstanceCreatePage } from "../CampaignInstancePages";
export const Route = createFileRoute("/_gm/campaigns/instances/new")({
  component: CampaignInstanceCreatePage,
});
