import { createFileRoute } from "@tanstack/react-router";
import { ResourceListPage } from "../App";
import { readResourceList } from "../server/readModels";

export const Route = createFileRoute("/_gm/worlds/")({
  loader: () =>
    readResourceList({ data: { resource: "locations", kind: "world" } }),
  component: WorldsRoute,
});

function WorldsRoute() {
  return (
    <ResourceListPage
      resource="locations"
      label="Worlds"
      basePath="worlds"
      kind="world"
      initialResult={Route.useLoaderData()}
    />
  );
}
