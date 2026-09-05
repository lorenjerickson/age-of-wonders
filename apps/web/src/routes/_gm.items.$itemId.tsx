import { createFileRoute, notFound } from "@tanstack/react-router";
import { ResourceEditorPage } from "../App";
import { readResource } from "../server/readModels";

export const Route = createFileRoute("/_gm/items/$itemId")({
  loader: async ({ params }) => {
    const result = await readResource({
      data: { resource: "definitions", id: params.itemId },
    });
    if (!result.found) throw notFound();
    return result.record;
  },
  component: ItemRoute,
});

function ItemRoute() {
  const record = Route.useLoaderData();
  return (
    <ResourceEditorPage
      resource="definitions"
      id={record.id}
      label="Items"
      basePath="items"
      initialRecord={record}
    />
  );
}
