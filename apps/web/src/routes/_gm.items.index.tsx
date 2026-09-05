import { createFileRoute } from "@tanstack/react-router";
import { ResourceListPage } from "../App";
import { readResourceList } from "../server/readModels";

export const Route = createFileRoute("/_gm/items/")({
  loader: () =>
    readResourceList({ data: { resource: "definitions", kind: "item" } }),
  component: ItemsRoute,
});

function ItemsRoute() {
  return (
    <ResourceListPage
      resource="definitions"
      label="Items"
      basePath="items"
      kind="item"
      initialResult={Route.useLoaderData()}
    />
  );
}
