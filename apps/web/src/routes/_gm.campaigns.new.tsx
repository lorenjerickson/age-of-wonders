import { createFileRoute } from "@tanstack/react-router";
import { CampaignCreatePage } from "../Campaigns";

export const Route = createFileRoute("/_gm/campaigns/new")({
  ssr: false,
  component: CampaignCreatePage,
});
