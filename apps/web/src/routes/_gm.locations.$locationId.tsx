import { createFileRoute, notFound } from "@tanstack/react-router";
import { ResourceEditorPage } from "../App";
import { readResource } from "../server/readModels";

export const Route = createFileRoute("/_gm/locations/$locationId")({
  loader: async ({ params }) => {
    const result = await readResource({
      data: { resource: "locations", id: params.locationId },
    });
    if (!result.found) throw notFound();
    return result.record;
  },
  component: LocationRoute,
});

function LocationRoute() {
  const record = Route.useLoaderData();
  return (
    <ResourceEditorPage
      resource="locations"
      id={record.id}
      label="Locations"
      basePath="locations"
      initialRecord={record}
    />
  );
}
