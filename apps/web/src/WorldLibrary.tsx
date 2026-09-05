import { Alert } from "@aow/ui";
import type { WorldDefinitionList } from "./api";
import { statusLabel } from "./campaignLibraryModel";
import { InternalLink } from "./navigation";
import type { ReadSection } from "./server/readModels";
import {
  humanWorldName,
  safeDateLabel,
  worldRevisionLabel,
} from "./worldDefinitionModel";

export function WorldLibraryPage({
  result,
  quickStartSuffix = "",
}: {
  result: ReadSection<WorldDefinitionList>;
  quickStartSuffix?: string;
}) {
  return (
    <main className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World authoring
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Worlds</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-base-content/65">
        Choose a World Definition lineage. Each workspace is anchored to its
        explicitly published current revision.
      </p>

      {!result.ok ? (
        <Alert tone="error" className="mt-8">
          <div>
            <p>{result.message}</p>
            <InternalLink className="link mt-2 inline-block" href="/worlds">
              Try loading Worlds again
            </InternalLink>
          </div>
        </Alert>
      ) : result.data.items.length ? (
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.items.map((world) => (
            <article
              key={world.id}
              className="card border border-base-300 bg-base-200 shadow-sm"
            >
              <div className="card-body">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="card-title text-xl">
                    {humanWorldName(world.name)}
                  </h2>
                  <span className="badge badge-outline shrink-0">
                    {statusLabel(world.status)}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm leading-6 text-base-content/60">
                  {world.description?.trim() ||
                    "A World Definition ready for structured authoring."}
                </p>
                <div className="mt-3 space-y-1 text-sm text-base-content/55">
                  <p>{worldRevisionLabel(world)}</p>
                  <p>Updated {safeDateLabel(world.updatedAt)} UTC</p>
                </div>
                <div className="card-actions mt-4">
                  <InternalLink
                    className="btn btn-primary btn-sm"
                    href={`/worlds/${encodeURIComponent(world.id)}${quickStartSuffix}`}
                  >
                    Open World Definition
                  </InternalLink>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="alert mt-8 max-w-3xl border border-base-300 bg-base-200">
          <span>No World Definitions are available yet.</span>
        </div>
      )}
    </main>
  );
}
