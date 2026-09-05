import { createFileRoute } from "@tanstack/react-router";
import { ResourceListPage } from "../App";
import { readResourceList } from "../server/readModels";

export const Route = createFileRoute("/_gm/systems/")({
  loader: () => readResourceList({ data: { resource: "systems" } }),
  component: SystemsRoute,
});

function SystemsRoute() {
  return (
    <ResourceListPage
      resource="systems"
      label="Systems"
      basePath="systems"
      initialResult={Route.useLoaderData()}
    />
  );
}
