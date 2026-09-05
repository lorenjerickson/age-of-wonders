import { createFileRoute } from "@tanstack/react-router";
import { WorldImpactReviewPage } from "../WorldAuthoringPages";
import { readWorldDraftImpact } from "../server/readModels";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/versions/draft/review",
)({
  loader: ({ params }) =>
    readWorldDraftImpact({ data: { worldDefinitionId: params.worldId } }),
  component: ImpactRoute,
});
function ImpactRoute() {
  return <WorldImpactReviewPage result={Route.useLoaderData()} />;
}
