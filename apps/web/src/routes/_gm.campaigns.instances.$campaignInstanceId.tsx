import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@aow/ui";
import {
  CampaignUnavailable,
  Fact,
  FactPanel,
} from "../CampaignDetailPanels";
import { dateLabel, statusLabel } from "../campaignLibraryModel";
import { readCampaignInstance } from "../server/readModels";
import { CampaignWorkspaceShell } from "../CampaignWorkspace";

export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId",
)({
  loader: ({ params }) =>
    readCampaignInstance({
      data: { campaignInstanceId: params.campaignInstanceId },
    }),
  component: CampaignInstanceWorkspace,
});

function CampaignInstanceWorkspace() {
  const result = Route.useLoaderData();
  if (!result.found) return <CampaignUnavailable kind="Instance" />;

  const { instance } = result;
  const snapshot = instance.currentSnapshot;
  const instanceName = instance.name.trim() || "Unnamed Campaign Instance";
  const active = instance.status.toLowerCase() === "active";
  return (
    <CampaignWorkspaceShell
      kind="Instance"
      name={instanceName}
      context={
        snapshot
          ? `Instance snapshot ${snapshot.snapshotNumber} · Campaign revision ${snapshot.campaignDefinition.revisionNumber}`
          : "No captured snapshot"
      }
    >
    <main className="mx-auto max-w-5xl px-6 py-14 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Campaign Instance · Instance management
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">
          {instanceName}
        </h1>
        <span className="badge badge-outline">
          {statusLabel(instance.status)}
        </span>
      </div>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-base-content/65">
        Manage this played realization independently from Campaign Definition
        authoring.
      </p>

      {snapshot ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <FactPanel title="Captured compatible pair">
            <Fact
              label="Campaign Definition"
              value={
                snapshot.campaignDefinition.name.trim() ||
                "Unnamed Campaign Definition"
              }
            />
            <Fact
              label="Campaign revision"
              value={String(snapshot.campaignDefinition.revisionNumber)}
            />
            <Fact
              label="World"
              value={
                snapshot.worldDefinition.name.trim() || "Unnamed World"
              }
            />
            <Fact
              label="World revision"
              value={String(snapshot.worldDefinition.revisionNumber)}
            />
          </FactPanel>
          <FactPanel title="Instance snapshot">
            <Fact label="Snapshot" value={String(snapshot.snapshotNumber)} />
            <Fact label="Adopted" value={dateLabel(snapshot.adoptedAt)} />
            <Fact label="Reason" value={statusLabel(snapshot.reason)} />
          </FactPanel>
        </div>
      ) : (
        <div className="alert mt-10 border border-base-300 bg-base-200">
          <span>This Instance does not yet have a captured snapshot.</span>
        </div>
      )}

      <div className="mt-5">
        <FactPanel title="Runtime metadata">
          {instance.runtime ? (
            <>
              <Fact
                label="Storage revision"
                value={String(instance.runtime.revision)}
              />
              <Fact
                label="Runtime updated"
                value={dateLabel(instance.runtime.updatedAt)}
              />
            </>
          ) : (
            <p className="text-sm text-base-content/55">
              Runtime state is not available for this Instance.
            </p>
          )}
        </FactPanel>
      </div>
      <p className="mt-8 max-w-3xl text-sm leading-6 text-base-content/50">
        Session resumption will appear only after this Instance has an explicit
        resumable Session relationship. Definition editing is not part of this
        workspace.
      </p>
      {active && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button disabled aria-describedby="instance-continue-explanation">
            Continue
          </Button>
          <p id="instance-continue-explanation" className="text-sm text-base-content/55">
            No resumable Session is linked to this Instance yet.
          </p>
        </div>
      )}
    </main>
    </CampaignWorkspaceShell>
  );
}
