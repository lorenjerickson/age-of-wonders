import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@aow/ui";
import type { WorldDefinitionList } from "./api";
import {
  archiveWorldDefinition,
  forkWorldDefinition,
  getWorldDefinition,
  restoreWorldDefinition,
  type WorldDefinitionSummary,
} from "./api";
import { statusLabel } from "./campaignLibraryModel";
import type { ReadSection } from "./server/readModels";
import {
  humanWorldName,
  safeDateLabel,
  worldRevisionLabel,
} from "./worldDefinitionModel";
import { filterWorlds, worldDraftLabel } from "./worldAuthoringModel";
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";

export function WorldLibraryPage({
  result,
  quickStartSuffix = "",
}: {
  result: ReadSection<WorldDefinitionList>;
  quickStartSuffix?: string;
}) {
  const navigate = useInternalNavigate();
  const [worlds, setWorlds] = useState<WorldDefinitionSummary[]>(
    result.ok ? result.data.items : [],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("active");
  const [working, setWorking] = useState("");
  const [confirmArchive, setConfirmArchive] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (result.ok) setWorlds(result.data.items);
  }, [result]);
  const filtered = filterWorlds(worlds, query, status);

  async function lifecycle(
    world: WorldDefinitionSummary,
    action: "archive" | "restore" | "fork",
  ) {
    setWorking(`${action}:${world.id}`);
    setMessage("");
    try {
      if (action === "archive") {
        if (world.metadataRevision === undefined)
          throw new Error("metadata unavailable");
        const updated = await archiveWorldDefinition(
          world.id,
          world.metadataRevision,
        );
        setWorlds((current) =>
          current.map((item) => (item.id === world.id ? updated : item)),
        );
        setMessage(
          `${humanWorldName(world.name)} archived. Captured Campaign history remains available.`,
        );
        setConfirmArchive("");
      } else if (action === "restore") {
        if (world.metadataRevision === undefined)
          throw new Error("metadata unavailable");
        const updated = await restoreWorldDefinition(
          world.id,
          world.metadataRevision,
        );
        setWorlds((current) =>
          current.map((item) => (item.id === world.id ? updated : item)),
        );
        setMessage(`${humanWorldName(world.name)} restored.`);
      } else {
        const detail = world.currentRevision?.snapshotId
          ? undefined
          : await getWorldDefinition(world.id);
        const current = detail?.revisions.find(
          (revision) => revision.id === detail.currentRevisionId,
        );
        const sourceSnapshotId =
          world.currentRevision?.snapshotId ?? current?.snapshots[0]?.id;
        if (!sourceSnapshotId) throw new Error("snapshot unavailable");
        const forked = await forkWorldDefinition(world.id, {
          sourceSnapshotId,
          name: `${humanWorldName(world.name)} copy`,
          description: world.description,
        });
        await navigate(
          `/worlds/${encodeURIComponent(forked.id)}${quickStartSuffix}`,
        );
      }
    } catch {
      setMessage(
        `${humanWorldName(world.name)} could not be ${action === "fork" ? "duplicated" : `${action}d`}. No World was changed.`,
      );
    } finally {
      setWorking("");
    }
  }
  return (
    <main className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World authoring
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Worlds</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-base-content/65">
        Choose a World Definition lineage. A workspace opens its working draft
        and shows whether that draft matches a published baseline or contains
        unpublished work.
      </p>
      <div className="mt-7 flex flex-wrap items-end gap-3">
        <Field label="Search Worlds" className="min-w-64 flex-1">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 w-full"
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="mt-2"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All Worlds</option>
          </Select>
        </Field>
        <RouterButtonLink
          href={`/worlds/new${quickStartSuffix}`}
          tone="primary"
        >
          Create World
        </RouterButtonLink>
      </div>
      {message && (
        <Alert className="mt-5" aria-live="polite">
          {message}
        </Alert>
      )}

      {!result.ok ? (
        <Alert tone="error" className="mt-8">
          <div>
            <p>{result.message}</p>
            <InternalLink className="link mt-2 inline-block" href="/worlds">
              Try loading Worlds again
            </InternalLink>
          </div>
        </Alert>
      ) : filtered.length ? (
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((world) => (
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
                  <p>{worldDraftLabel(world)}</p>
                  <p>Updated {safeDateLabel(world.updatedAt)} UTC</p>
                </div>
                <div className="card-actions mt-4">
                  <InternalLink
                    className="btn btn-primary btn-sm"
                    href={`/worlds/${encodeURIComponent(world.id)}${quickStartSuffix}`}
                  >
                    Open World Definition
                  </InternalLink>
                  <Button
                    aria-label={`Duplicate ${humanWorldName(world.name)}`}
                    title={
                      world.currentRevision
                        ? undefined
                        : "Publish this World before duplicating it."
                    }
                    disabled={!world.currentRevision}
                    size="sm"
                    tone="ghost"
                    loading={working === `fork:${world.id}`}
                    onClick={() => void lifecycle(world, "fork")}
                  >
                    Duplicate
                  </Button>
                  {world.status.toLowerCase() === "archived" ? (
                    <Button
                      aria-label={`Restore ${humanWorldName(world.name)}`}
                      title={
                        world.metadataRevision === undefined
                          ? "Restore is temporarily unavailable."
                          : undefined
                      }
                      disabled={world.metadataRevision === undefined}
                      size="sm"
                      tone="ghost"
                      loading={working === `restore:${world.id}`}
                      onClick={() => void lifecycle(world, "restore")}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      aria-label={`${confirmArchive === world.id ? "Confirm archive" : "Archive"} ${humanWorldName(world.name)}`}
                      title={
                        world.metadataRevision === undefined
                          ? "Archive is temporarily unavailable."
                          : undefined
                      }
                      disabled={world.metadataRevision === undefined}
                      size="sm"
                      tone={confirmArchive === world.id ? "danger" : "ghost"}
                      loading={working === `archive:${world.id}`}
                      onClick={() =>
                        confirmArchive === world.id
                          ? void lifecycle(world, "archive")
                          : setConfirmArchive(world.id)
                      }
                    >
                      {confirmArchive === world.id
                        ? "Confirm archive"
                        : "Archive"}
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="alert mt-8 max-w-3xl border border-base-300 bg-base-200">
          <span>
            {worlds.length
              ? "No Worlds match these filters."
              : "No World Definitions are available yet."}
          </span>
        </div>
      )}
    </main>
  );
}
