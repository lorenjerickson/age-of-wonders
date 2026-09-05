import { createFileRoute, useLocation } from "@tanstack/react-router";
import { WorldLibraryPage } from "../WorldLibrary";
import { quickStartSuffix } from "../quickStartModel";
import { readWorldDefinitionLibrary } from "../server/readModels";

export const Route = createFileRoute("/_gm/worlds/")({
  loader: () => readWorldDefinitionLibrary(),
  component: WorldsRoute,
});

function WorldsRoute() {
  const search = useLocation({ select: (location) => location.searchStr });
  return (
    <WorldLibraryPage
      result={Route.useLoaderData()}
      quickStartSuffix={quickStartSuffix(search)}
    />
  );
}
