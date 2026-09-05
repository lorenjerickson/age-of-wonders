import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { WorldSecondaryNavigation } from "../WorldNavigation";
import { readWorldAuthoring } from "../server/readModels";
import { currentWorldRevision, humanWorldName } from "../worldDefinitionModel";
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
  const { worldId } = Route.useParams();
  const { session } = Route.useRouteContext();
  if (!result.found) {
    return (
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
    );
  }
  const worldName = humanWorldName(result.definition.name);
  const revision = currentWorldRevision(result.definition);
  const contextLabel = result.draft
    ? result.draft.baseRevisionNumber
      ? `Draft · based on revision ${result.draft.baseRevisionNumber}`
      : "Initial unpublished draft"
    : revision
      ? `Published revision ${revision.revisionNumber} · read only`
      : "Unpublished · read only";
  return (
    <WorldAuthoringProvider
      definition={result.definition}
      initialDraft={result.draft}
    >
      <div className="min-h-full lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <WorldSecondaryNavigation
          worldId={worldId}
          worldName={worldName}
          revisionLabel={contextLabel}
          gmScope={
            session.authenticated ? session.user.displayName : "local-gm"
          }
        />
        <div className="min-w-0">
          <WorldContextBar />
          <Outlet />
        </div>
      </div>
    </WorldAuthoringProvider>
  );
}
