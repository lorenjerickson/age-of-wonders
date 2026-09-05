import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Fact, FactPanel } from "../CampaignDetailPanels";
import { statusLabel } from "../campaignLibraryModel";
import {
  currentWorldRevision,
  safeDateLabel,
} from "../worldDefinitionModel";

const worldRoute = getRouteApi("/_gm/worlds/$worldId");

export const Route = createFileRoute("/_gm/worlds/$worldId/")({
  component: WorldRoute,
});

function WorldRoute() {
  const result = worldRoute.useLoaderData();
  if (!result.found) return null;
  const revision = currentWorldRevision(result.definition);
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World Definition · Authoring
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Atlas overview</h1>
        <span className="badge badge-outline">
          {statusLabel(result.definition.status)}
        </span>
      </div>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-base-content/65">
        {result.definition.description?.trim() ||
          "Review this World Definition lineage and its explicitly published revision."}
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <FactPanel title="Published head">
          <Fact
            label="Revision"
            value={revision ? String(revision.revisionNumber) : "Not published"}
          />
          <Fact
            label="Revision name"
            value={revision?.name.trim() || "No published revision"}
          />
          <Fact
            label="Updated"
            value={safeDateLabel(result.definition.updatedAt)}
          />
        </FactPanel>
        <FactPanel title="Authoring boundary">
          <p className="text-sm leading-6 text-base-content/60">
            This workspace reads the versioned World Definition aggregate.
            Legacy Location JSON editing is intentionally unavailable here;
            complete-revision authoring will replace it.
          </p>
        </FactPanel>
      </div>
    </main>
  );
}
