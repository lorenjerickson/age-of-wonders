import { createFileRoute } from "@tanstack/react-router";
import { Alert } from "@aow/ui";
import { readCampaignLibrary } from "../server/readModels";
import { InternalLink } from "../navigation";

export const Route = createFileRoute("/_gm/sessions")({
  loader: () => readCampaignLibrary(),
  component: SessionsRoute,
});

function SessionsRoute() {
  const { instances } = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Instance-scoped history
      </p>
      <h1 className="mt-3 text-4xl font-semibold">Sessions</h1>
      <p className="mt-4 max-w-3xl text-base-content/65">
        Choose a Campaign Instance before viewing Sessions. The system never
        guesses from the most recently changed Campaign.
      </p>
      {!instances.ok ? (
        <Alert tone="error" className="mt-8">
          {instances.message}
        </Alert>
      ) : instances.data.items.length ? (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {instances.data.items.map((instance) => (
            <li
              key={instance.id}
              className="rounded-box border border-base-300 bg-base-200 p-5"
            >
              <h2 className="text-lg font-semibold">
                {instance.name.trim() || "Unnamed Campaign Instance"}
              </h2>
              <p className="mt-2 text-sm text-base-content/60">
                {instance.currentSnapshot
                  ? `${instance.currentSnapshot.campaignDefinition.name} revision ${instance.currentSnapshot.campaignDefinition.revisionNumber}`
                  : "Captured Campaign unavailable"}
              </p>
              <InternalLink
                className="btn btn-outline btn-sm mt-4"
                href={`/campaigns/instances/${encodeURIComponent(instance.id)}/sessions`}
              >
                Open Sessions
              </InternalLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-sm text-base-content/60">
          No Campaign Instances are available yet.
        </p>
      )}
    </main>
  );
}
