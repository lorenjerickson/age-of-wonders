import { createFileRoute, useLocation } from "@tanstack/react-router";
import { CampaignLibraryPage } from "../CampaignLibrary";
import { readCampaignLibrary } from "../server/readModels";
import { quickStartSuffix } from "../quickStartModel";

export const Route = createFileRoute("/_gm/campaigns/")({
  loader: () => readCampaignLibrary(),
  component: CampaignsRoute,
});

function CampaignsRoute() {
  const search = useLocation({ select: (location) => location.searchStr });
  return (
    <CampaignLibraryPage
      {...Route.useLoaderData()}
      quickStartSuffix={quickStartSuffix(search)}
    />
  );
}
