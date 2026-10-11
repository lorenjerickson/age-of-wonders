import { useEffect, useState } from "react";
import { Alert, Button, Disclosure, Field, Input, Select } from "@aow/ui";
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
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"responsive" | "cards" | "list">(
    "responsive",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [working, setWorking] = useState("");
  const [confirmArchive, setConfirmArchive] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (result.ok) setWorlds(result.data.items);
  }, [result]);
  const filtered = filterWorlds(worlds, query, status).sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

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
    <main className="mx-auto w-full max-w-[1440px] p-4 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Worlds</h1>
          <p className="mt-2 hidden text-sm text-base-content/60 sm:block">
            {filtered.length} worlds ·{" "}
            {sort === "recent"
              ? "Most recently edited first"
              : "Alphabetical order"}
          </p>
        </div>
        <RouterButtonLink
          href={`/worlds/new${quickStartSuffix}`}
          tone="primary"
          className="min-h-11"
        >
          Create world
        </RouterButtonLink>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:items-end">
        <Field label="Search worlds" className="col-span-2 min-w-0 flex-1">
          <Input
            type="search"
            placeholder="Search worlds…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full min-h-11"
          />
        </Field>
        <Button
          tone="outline"
          className="min-h-11 sm:hidden"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Filters · {status === "all" ? 0 : 1}
        </Button>
        <div
          className={`${filtersOpen ? "flex" : "hidden"} col-span-2 flex-wrap gap-2 sm:flex`}
        >
          <Field label="Status">
            <Select
              className="min-h-11"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="all">All worlds</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Sort">
            <Select
              className="min-h-11"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recent">Recently edited</option>
              <option value="name">Name</option>
            </Select>
          </Field>
        </div>
        <Field label="View">
          <Select
            className="min-h-11 w-full"
            value={view}
            onChange={(event) => setView(event.target.value as typeof view)}
          >
            <option value="responsive">Adaptive</option>
            <option value="cards">Cards</option>
            <option value="list">List</option>
          </Select>
        </Field>
      </div>
      <p className="mt-4 text-sm text-base-content/60 sm:hidden">
        {filtered.length} worlds ·{" "}
        {sort === "recent" ? "Recently edited" : "Name"}
      </p>
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
        <div
          className={`mt-6 grid gap-4 ${view === "list" ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}
        >
          {filtered.map((world) => (
            <article
              key={world.id}
              className="card border border-base-300 bg-base-200 shadow-sm"
            >
              <div
                className={`${view === "list" ? "hidden" : view === "responsive" ? "hidden sm:block" : ""} relative h-20 overflow-hidden opacity-60 invert`}
              >
                <img
                  src="/wireframes/world-tile-map.svg"
                  alt=""
                  className="absolute inset-0 h-full w-full"
                />
                <div className="absolute inset-[12.86%_9.29%_13.57%_4.76%]">
                  <img
                    src="/wireframes/world-tile-outline.svg"
                    alt=""
                    className="h-full w-full"
                  />
                </div>
                <div className="absolute inset-[36.43%_15.48%_39.29%_13.1%]">
                  <img
                    src="/wireframes/world-tile-routes.svg"
                    alt=""
                    className="h-full w-full"
                  />
                </div>
                <div className="absolute inset-[47.86%_22.86%_29.29%_21.19%]">
                  <img
                    src="/wireframes/world-tile-mountains.svg"
                    alt=""
                    className="h-full w-full"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="card-title text-xl">
                    {humanWorldName(world.name)}
                  </h2>
                  <span className="badge badge-outline shrink-0">
                    {statusLabel(world.status)}
                  </span>
                </div>
                <p
                  className={`${view === "responsive" ? "hidden sm:block" : ""} line-clamp-3 text-sm leading-6 text-base-content/60`}
                >
                  {world.description?.trim() ||
                    "A World Definition ready for structured authoring."}
                </p>
                <div className="space-y-1 text-sm text-base-content/55">
                  <p>{worldRevisionLabel(world)}</p>
                  <p>{worldDraftLabel(world)}</p>
                  <p className="hidden sm:block">
                    Updated {safeDateLabel(world.updatedAt)} UTC
                  </p>
                </div>
                <div className="mt-auto grid gap-2">
                  <InternalLink
                    className="btn btn-outline min-h-11 w-full"
                    href={`/worlds/${encodeURIComponent(world.id)}${quickStartSuffix}`}
                  >
                    Edit world
                  </InternalLink>
                  <Disclosure summary="More actions" className="text-sm">
                    <div className="flex flex-wrap gap-2">
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
                          tone={
                            confirmArchive === world.id ? "danger" : "ghost"
                          }
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
                  </Disclosure>
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
