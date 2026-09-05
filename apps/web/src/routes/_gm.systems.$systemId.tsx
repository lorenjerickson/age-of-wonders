import { createFileRoute, notFound } from "@tanstack/react-router";
import { ResourceEditorPage } from "../App";
import { readResource } from "../server/readModels";

export const Route = createFileRoute("/_gm/systems/$systemId")({
  loader: async ({ params }) => {
    const result = await readResource({
      data: { resource: "systems", id: params.systemId },
    });
    if (!result.found) throw notFound();
    return result.record;
  },
  component: SystemRoute,
});

function SystemRoute() {
  const record = Route.useLoaderData();
  return (
    <ResourceEditorPage
      resource="systems"
      id={record.id}
      label="Systems"
      basePath="systems"
      initialRecord={record}
    />
  );
}
