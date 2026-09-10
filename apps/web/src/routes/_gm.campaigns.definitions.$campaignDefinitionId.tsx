import { ContextualBreadcrumbs } from "../ContextualNavigation";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { CampaignUnavailable } from "../CampaignDetailPanels";
import {
  CampaignDefinitionAuthoringProvider,
  CampaignDefinitionContextBar,
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
  if (!result.found)
    return (
      <>
        <ContextualBreadcrumbs />
        <CampaignUnavailable kind="Definition" />
      </>
    );
  return (
    <CampaignDefinitionAuthoringProvider
      definition={result.definition}
      initialDraft={result.draft}
    >
      <CampaignDefinitionUnsavedNavigationGuard />
      <div className="min-h-full">
        <div className="min-w-0">
          <CampaignDefinitionContextBar />
          <Outlet />
        </div>
      </div>
    </CampaignDefinitionAuthoringProvider>
  );
}
