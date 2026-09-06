import { Outlet, createFileRoute } from "@tanstack/react-router";
import { CampaignUnavailable } from "../CampaignDetailPanels";
import {
  CampaignInstanceContextBar,
  CampaignInstanceProvider,
  CampaignInstanceSecondaryNavigation,
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
  const { session } = Route.useRouteContext();
  if (!result.found) return <CampaignUnavailable kind="Instance" />;
  return (
    <CampaignInstanceProvider instance={result.instance}>
      <div className="min-h-full lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <CampaignInstanceSecondaryNavigation
          gmScope={
            session.authenticated ? session.user.displayName : "local-gm"
          }
        />
        <div className="min-w-0">
          <CampaignInstanceContextBar />
          <Outlet />
        </div>
      </div>
    </CampaignInstanceProvider>
  );
}
