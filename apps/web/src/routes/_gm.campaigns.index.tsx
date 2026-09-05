import { createFileRoute } from "@tanstack/react-router";
import { ResourceListPage } from "../App";
import { readResourceList } from "../server/readModels";

export const Route = createFileRoute("/_gm/campaigns/")({
  loader: () => readResourceList({ data: { resource: "campaigns" } }),
  component: CampaignsRoute,
});

function CampaignsRoute() {
  return (
    <ResourceListPage
      resource="campaigns"
      label="Campaigns"
      basePath="campaigns"
      initialResult={Route.useLoaderData()}
    />
  );
}
