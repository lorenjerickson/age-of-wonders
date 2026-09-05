import { createFileRoute } from "@tanstack/react-router";
import { ResourceListPage } from "../App";
import { readResourceList } from "../server/readModels";

export const Route = createFileRoute("/_gm/locations/")({
  loader: () => readResourceList({ data: { resource: "locations" } }),
  component: LocationsRoute,
});

function LocationsRoute() {
  return (
    <ResourceListPage
      resource="locations"
      label="Locations"
      basePath="locations"
      initialResult={Route.useLoaderData()}
    />
  );
}
