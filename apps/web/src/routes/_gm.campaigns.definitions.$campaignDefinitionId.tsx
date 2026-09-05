import { Outlet, createFileRoute } from "@tanstack/react-router";
import { CampaignUnavailable } from "../CampaignDetailPanels";
import {
  CampaignDefinitionAuthoringProvider,
  CampaignDefinitionContextBar,
  CampaignDefinitionSecondaryNavigation,
  CampaignDefinitionUnsavedNavigationGuard,
} from "../CampaignDefinitionAuthoringShell";
import { readCampaignDefinitionAuthoring } from "../server/readModels";

export const Route = createFileRoute(
  "/_gm/campaigns/definitions/$campaignDefinitionId",
)({
  loader: ({ params }) =>
    readCampaignDefinitionAuthoring({
      data: { campaignDefinitionId: params.campaignDefinitionId },
    }),
  component: CampaignDefinitionLayout,
});

function CampaignDefinitionLayout() {
  const result = Route.useLoaderData();
  const { campaignDefinitionId } = Route.useParams();
  const { session } = Route.useRouteContext();
  if (!result.found) return <CampaignUnavailable kind="Definition" />;
  const name = result.definition.name.trim() || "Unnamed Campaign Definition";
  return (
    <CampaignDefinitionAuthoringProvider
      definition={result.definition}
      initialDraft={result.draft}
    >
      <CampaignDefinitionUnsavedNavigationGuard />
      <div className="min-h-full lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <CampaignDefinitionSecondaryNavigation
          campaignDefinitionId={campaignDefinitionId}
          campaignName={name}
          gmScope={
            session.authenticated ? session.user.displayName : "local-gm"
          }
        />
        <div className="min-w-0">
          <CampaignDefinitionContextBar />
          <Outlet />
        </div>
      </div>
    </CampaignDefinitionAuthoringProvider>
  );
}
