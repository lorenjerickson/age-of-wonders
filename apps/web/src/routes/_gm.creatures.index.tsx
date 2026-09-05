import { createFileRoute } from "@tanstack/react-router";
import { ResourceListPage } from "../App";
import { readResourceList } from "../server/readModels";

export const Route = createFileRoute("/_gm/creatures/")({
  loader: () => readResourceList({ data: { resource: "creatures" } }),
  component: CreaturesRoute,
});

function CreaturesRoute() {
  return (
    <ResourceListPage
      resource="creatures"
      label="Creatures"
      basePath="creatures"
      initialResult={Route.useLoaderData()}
    />
  );
}
