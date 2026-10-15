import { AstraFrame } from "../AstraWorkspace";
import { ContextualBreadcrumbs } from "../ContextualNavigation";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { astraWorldCompatibilityHref } from "../astraCompatibility";
import { readWorldAuthoring } from "../server/readModels";
import { WorldAuthoringProvider } from "../WorldAuthoringShell";

export const Route = createFileRoute("/_gm/worlds/$worldId")({
  beforeLoad: ({ params, location }) => {
    const href = astraWorldCompatibilityHref(
      params.worldId,
      location.pathname,
      location.searchStr,
    );
    if (href) throw redirect({ href, replace: true });
  },
  loader: ({ params }) =>
    readWorldAuthoring({ data: { worldDefinitionId: params.worldId } }),
  component: WorldLayout,
});

function WorldLayout() {
  const result = Route.useLoaderData();
  const pathname = useLocation().pathname;
  const base = `/worlds/${encodeURIComponent(Route.useParams().worldId)}`;
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
      {pathname.replace(/\/$/, "") === base ? (
        <Outlet />
      ) : (
        <AstraFrame
          name={result.definition.name}
          base={base}
          title="World authoring"
          view="authoring"
        >
          <ContextualBreadcrumbs />
          <Outlet />
        </AstraFrame>
      )}
    </WorldAuthoringProvider>
  );
}
