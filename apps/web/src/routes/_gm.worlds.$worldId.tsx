import { ContextualBreadcrumbs } from "../ContextualNavigation";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { readWorldAuthoring } from "../server/readModels";
import {
  WorldAuthoringProvider,
  WorldContextBar,
} from "../WorldAuthoringShell";

export const Route = createFileRoute("/_gm/worlds/$worldId")({
  loader: ({ params }) =>
    readWorldAuthoring({ data: { worldDefinitionId: params.worldId } }),
  component: WorldLayout,
});

function WorldLayout() {
  const result = Route.useLoaderData();
  if (!result.found) {
    return (
      <>
        <ContextualBreadcrumbs />
        <main className="mx-auto max-w-3xl px-6 py-20">
          <p className="text-xs font-semibold tracking-[0.18em] text-error uppercase">
            World unavailable
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            This World could not be opened
          </h1>
          <p className="mt-4 text-base-content/65">
            It may have been archived or removed. Choose an available World
            Definition from the Worlds library.
          </p>
          <Link className="btn btn-outline mt-7" to="/worlds">
            Back to Worlds
          </Link>
        </main>
      </>
    );
  }
  return (
    <WorldAuthoringProvider
      key={result.definition.id}
      definition={result.definition}
      initialDraft={result.draft}
    >
      <div className="min-h-full">
        <div className="min-w-0">
          <WorldContextBar />
          <Outlet />
        </div>
      </div>
    </WorldAuthoringProvider>
  );
}
