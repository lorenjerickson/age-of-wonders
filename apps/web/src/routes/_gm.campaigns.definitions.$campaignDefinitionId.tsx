import { createFileRoute } from "@tanstack/react-router";
import {
  CampaignUnavailable,
  Fact,
  FactPanel,
} from "../CampaignDetailPanels";
import { dateLabel, statusLabel } from "../campaignLibraryModel";
import { readCampaignDefinition } from "../server/readModels";
import { CampaignWorkspaceShell } from "../CampaignWorkspace";

export const Route = createFileRoute(
  "/_gm/campaigns/definitions/$campaignDefinitionId",
)({
  loader: ({ params }) =>
    readCampaignDefinition({
      data: { campaignDefinitionId: params.campaignDefinitionId },
    }),
  component: CampaignDefinitionWorkspace,
});

function CampaignDefinitionWorkspace() {
  const result = Route.useLoaderData();
  if (!result.found) return <CampaignUnavailable kind="Definition" />;

  const { definition } = result;
  const revision = definition.currentRevision;
  const definitionName =
    definition.name.trim() || "Unnamed Campaign Definition";
  return (
    <CampaignWorkspaceShell
      kind="Definition"
      name={definitionName}
      context={
        revision
          ? `Campaign revision ${revision.revisionNumber} · captured World revision ${revision.capturedWorld.revisionNumber}`
          : "No published revision"
      }
    >
    <main className="mx-auto max-w-5xl px-6 py-14 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Campaign Definition · Authoring
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">
          {definitionName}
        </h1>
        <span className="badge badge-outline">
          {statusLabel(definition.status)}
        </span>
      </div>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-base-content/65">
        {definition.description?.trim() ||
          "Author this Campaign against its captured World provenance."}
      </p>

      {revision ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <FactPanel title="Campaign authoring revision">
            <Fact label="Revision" value={String(revision.revisionNumber)} />
            <Fact label="Published" value={dateLabel(revision.publishedAt)} />
            <Fact label="Updated" value={dateLabel(definition.updatedAt)} />
          </FactPanel>
          <FactPanel title="Captured World provenance">
            <Fact
              label="World"
              value={
                revision.capturedWorld.name.trim() || "Unnamed World"
              }
            />
            <Fact
              label="World revision"
              value={String(revision.capturedWorld.revisionNumber)}
            />
            <Fact
              label="Captured"
              value={dateLabel(revision.capturedWorld.capturedAt)}
            />
          </FactPanel>
        </div>
      ) : (
        <div className="alert mt-10 border border-base-300 bg-base-200">
          <span>This Definition does not yet have a published revision.</span>
        </div>
      )}
      <p className="mt-8 max-w-3xl text-sm leading-6 text-base-content/50">
        This read-only authoring view follows the Definition’s captured World,
        not the World’s mutable current head. Definition editing and migration
        will be introduced as separate authoring workflows.
      </p>
    </main>
    </CampaignWorkspaceShell>
  );
}
