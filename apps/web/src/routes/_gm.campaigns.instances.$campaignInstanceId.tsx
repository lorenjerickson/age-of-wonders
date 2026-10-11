import { ContextualBreadcrumbs } from "../ContextualNavigation";
import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { CampaignUnavailable } from "../CampaignDetailPanels";
import {
  CampaignInstanceContextBar,
  CampaignInstanceProvider,
} from "../CampaignInstanceWorkspace";
import { readCampaignInstance } from "../server/readModels";

export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId",
)({
  loader: ({ params }) =>
    readCampaignInstance({
      data: { campaignInstanceId: params.campaignInstanceId },
    }),
  component: CampaignInstanceLayout,
});

function CampaignInstanceLayout() {
  const result = Route.useLoaderData();
  const running = useLocation().pathname.includes("/run/");
  if (!result.found)
    return (
      <>
        <ContextualBreadcrumbs />
        <CampaignUnavailable kind="Instance" />
      </>
    );
  return (
    <CampaignInstanceProvider instance={result.instance}>
      <div className="min-h-full">
        <div className="min-w-0">
          {!running && <CampaignInstanceContextBar />}
          <Outlet />
        </div>
      </div>
    </CampaignInstanceProvider>
  );
}
