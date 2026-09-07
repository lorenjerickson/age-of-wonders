import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useBlocker, useLocation, useRouter } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Fieldset,
  Input,
  Legend,
  Select,
  Textarea,
} from "@aow/ui";
import {
  ApiRequestError,
  createModelRegistry,
  extendModelRegistryRelease,
  getModelRegistry,
  listModelRegistries,
  publishWorldDefinitionDraft,
  validateWorldDefinitionDraft,
  type ModelRegistrySummary,
  type JsonValue,
  type WorldModelOption,
  type WorldDraftImpact,
  type WorldDraftRecord,
} from "./api";
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";
import { DraftRequired, useWorldAuthoring } from "./WorldAuthoringShell";
import {
  hierarchyRows,
  attributeNumberConfig,
  definitionConformance,
  creatureEmbodimentPolicyForSave,
  draftAdoptingRegistryRelease,
  locationParentOptions,
  modelExtensionKey,
  recordName,
  recordDescription,
  recordPayload,
  recoverableRegistryRelease,
  savedNavigationAllowanceForRoute,
  recordsForLibrary,
  worldPlacementRecordsForLocation,
  worldPlacementSourceId,
  worldPlacementSourceIsEditable,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
import type { ReadSection } from "./server/readModels";
import { safeDateLabel } from "./worldDefinitionModel";
import {
  characterOptionDefinition,
  characterOptionKey,
  type CharacterOptionKind,
} from "./characterOptionModel";

const objectValue = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

type EmbodimentStrategy =
  "" | "one-per-instance" | "one-per-realization" | "preserve-extension";

export function CreatureEmbodimentPolicyFields({
  strategy,
  maximum,
  legacy,
  onStrategyChange,
  onMaximumChange,
}: {
  strategy: EmbodimentStrategy;
  maximum: string;
  legacy: boolean;
  onStrategyChange(value: EmbodimentStrategy): void;
  onMaximumChange(value: string): void;
}) {
  return (
    <Fieldset className="rounded-box border border-base-300 p-4">
      <Legend className="px-2 font-semibold">
        Campaign Instance embodiment
      </Legend>
      <p
        id="embodiment-policy-help"
        className="mb-3 text-sm text-base-content/60"
      >
        Choose whether placements share one named embodiment or create an
        independent embodiment for every realized placement.
      </p>
      <Field label="Embodiment policy" required>
        <Select
          required
          value={strategy}
          aria-describedby="embodiment-policy-help"
          onChange={(event) =>
            onStrategyChange(event.currentTarget.value as EmbodimentStrategy)
          }
          className="mt-2 w-full"
        >
          <option value="" disabled>
            Choose an embodiment policy
          </option>
          <option value="one-per-instance">
            One per Campaign Instance (recommended)
          </option>
          <option value="one-per-realization">
            One per realized placement
          </option>
          {strategy === "preserve-extension" && (
            <option value="preserve-extension">
              Preserve installed extension strategy
            </option>
          )}
        </Select>
      </Field>
      {strategy === "one-per-realization" && (
        <Field
          label="Maximum per Campaign Instance (optional)"
          className="mt-4"
        >
          <Input
            type="number"
            min={1}
            step={1}
            value={maximum}
            onChange={(event) => onMaximumChange(event.currentTarget.value)}
            className="mt-2 w-full"
          />
        </Field>
      )}
      {legacy && (
        <Alert tone="warning" className="mt-4">
          Existing captured content defaults to one per Campaign Instance, but
          this working draft needs an explicit choice before its next
          publication.
        </Alert>
      )}
    </Fieldset>
  );
}

export function WorldOverviewPage() {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const base = `/worlds/${encodeURIComponent(definition.id)}`;
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World Definition · Authoring
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-base-content/65">
        {definition.description?.trim() ||
          "Review this World’s authoring readiness and choose a focused library."}
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body">
            <h2 className="card-title">Working context</h2>
            <p>
              {!canEdit
                ? "Archived World · read only"
                : draft
                  ? draft.revisionName || "Unnamed working revision"
                  : "Published content is read only"}
            </p>
            <p className="text-sm text-base-content/55">
              {draft
                ? `${draft.records.length} draft records`
                : "Open Versions to review publication history."}
            </p>
          </div>
        </section>
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body">
            <h2 className="card-title">Authoring libraries</h2>
            <nav
              aria-label="World authoring destinations"
              className="grid gap-2"
            >
              <InternalLink
                className="link"
                href={`${base}/atlas${guideSuffix}`}
              >
                Open Atlas
              </InternalLink>
              <InternalLink
                className="link"
                href={`${base}/bestiary${guideSuffix}`}
              >
                Open Bestiary
              </InternalLink>
              <InternalLink
                className="link"
                href={`${base}/item-compendium${guideSuffix}`}
              >
                Open Item Compendium
              </InternalLink>
              <InternalLink
                className="link"
                href={`${base}/characters${guideSuffix}`}
              >
                Open Characters
              </InternalLink>
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
}

export function WorldVersionsPage() {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const base = `/worlds/${encodeURIComponent(definition.id)}`;
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World authoring
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Versions</h1>
      {draft ? (
        <section className="card mt-8 border border-primary/25 bg-primary/[0.05]">
          <div className="card-body">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="card-title">Working draft</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  {draft.revisionName || "Unnamed revision"}
                </p>
              </div>
              <Badge
                tone={
                  !canEdit || draft.status === "stale" ? "warning" : "primary"
                }
              >
                {!canEdit
                  ? "Archived · read only"
                  : draft.status === "stale"
                    ? "Needs rebase"
                    : "Current"}
              </Badge>
            </div>
            {canEdit && (
              <RouterButtonLink
                href={`${base}/versions/draft/review${guideSuffix}`}
                tone="primary"
                className="mt-4"
              >
                Review impact
              </RouterButtonLink>
            )}
          </div>
        </section>
      ) : (
        <Alert tone="warning" className="mt-8">
          No working draft is available. Published revisions remain read only
          until a draft is created by the World Definition service.
        </Alert>
      )}
      <section className="mt-10" aria-labelledby="published-revisions-heading">
        <h2 id="published-revisions-heading" className="text-2xl font-semibold">
          Published revisions
        </h2>
        <ol className="mt-4 space-y-3">
          {definition.revisions.map((revision) => (
            <li
              key={revision.id}
              className="rounded-box border border-base-300 bg-base-200 p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <span className="font-semibold">
                  Revision {revision.revisionNumber} ·{" "}
                  {revision.name.trim() || "Unnamed revision"}
                </span>
                <span className="text-sm text-base-content/50">
                  Published {safeDateLabel(revision.publishedAt)} UTC
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

export function WorldImpactReviewPage({
  result,
}: {
  result: ReadSection<WorldDraftImpact>;
}) {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const navigate = useInternalNavigate();
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  async function publish() {
    if (!draft || !result.ok) return;
    setPublishing(true);
    setError("");
    setValidationIssues([]);
    try {
      const validation = await validateWorldDefinitionDraft(
        definition.id,
        draft.storageRevision,
      );
      if (!validation.valid) {
        setValidationIssues(validation.issues.map((issue) => issue.detail));
        setPublishing(false);
        return;
      }
      await publishWorldDefinitionDraft(definition.id, draft.storageRevision);
      await router.invalidate();
      await navigate(
        `/worlds/${encodeURIComponent(definition.id)}/versions${guideSuffix}`,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 409
          ? "The draft changed before publication. Reload the impact review and resolve the newer version."
          : "The draft could not be published. No published revision was changed.",
      );
      setPublishing(false);
    }
  }
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Whole-revision publication
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Review draft impact
      </h1>
      <p className="mt-4 max-w-3xl text-base-content/65">
        Publication creates one immutable World revision. Existing Campaign
        Definitions and Instances remain on their captured snapshots until
        explicitly migrated.
      </p>
      {!result.ok ? (
        <Alert tone="error" className="mt-8">
          {result.message}
        </Alert>
      ) : (
        <>
          <section className="mt-8" aria-labelledby="changes-heading">
            <h2 id="changes-heading" className="text-xl font-semibold">
              Complete change set
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-box border border-base-300 p-4">
                <dt className="text-sm text-base-content/55">Added</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {result.data.changes.added}
                </dd>
              </div>
              <div className="rounded-box border border-base-300 p-4">
                <dt className="text-sm text-base-content/55">Changed</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {result.data.changes.changed}
                </dd>
              </div>
              <div className="rounded-box border border-base-300 p-4">
                <dt className="text-sm text-base-content/55">Removed</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {result.data.changes.removed}
                </dd>
              </div>
            </dl>
          </section>
          <section className="mt-8" aria-labelledby="downstream-heading">
            <h2 id="downstream-heading" className="text-xl font-semibold">
              Downstream Campaign captures
            </h2>
            {result.data.downstreamCampaigns.length ? (
              <ul className="mt-3 space-y-2">
                {result.data.downstreamCampaigns.map((campaign, index) => (
                  <li
                    key={`${campaign.name}-${index}`}
                    className="rounded-box border border-base-300 p-3"
                  >
                    <span className="font-medium">
                      {campaign.name || "Unnamed Campaign Definition"}
                    </span>
                    <span className="ml-2 text-sm text-base-content/55">
                      {campaign.eligibility === "eligible-after-publication"
                        ? "eligible for direct-lineage migration after publication"
                        : "not on the direct predecessor lineage"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-base-content/55">
                No Campaign Definition currently captures this World.
              </p>
            )}
          </section>
          {validationIssues.length > 0 && (
            <Alert tone="error" className="mt-6" aria-live="polite">
              <div>
                <p className="font-semibold">
                  Resolve these draft issues before publishing:
                </p>
                <ul className="mt-2 list-disc pl-5">
                  {validationIssues.map((issue, index) => (
                    <li key={`${issue}-${index}`}>{issue}</li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
          {error && (
            <Alert tone="error" className="mt-6" aria-live="polite">
              {error}
            </Alert>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {canEdit ? (
              <Button
                tone="primary"
                loading={publishing}
                disabled={!draft || draft.status === "stale"}
                onClick={() => void publish()}
              >
                Validate &amp; publish complete revision
              </Button>
            ) : (
              <Button disabled>Archived · read only</Button>
            )}
            <RouterButtonLink
              href={`/worlds/${encodeURIComponent(definition.id)}/versions${guideSuffix}`}
              tone="outline"
            >
              Back to Versions
            </RouterButtonLink>
          </div>
        </>
      )}
    </main>
  );
}

export function AtlasPage() {
  const { definition, draft } = useWorldAuthoring();
  const rows = hierarchyRows(draft?.records ?? []);
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  return (
    <LibraryPage
      eyebrow="Atlas"
      title="Locations"
      description="Author the World’s containment hierarchy. Connections remain a separate relationship."
      createHref={`/worlds/${encodeURIComponent(definition.id)}/atlas/locations/new`}
    >
      <DraftRequired>
        {rows.length ? (
          <ul className="mt-6 space-y-2">
            {rows.map((row) => (
              <li
                key={row.record.sourceId}
                style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}
              >
                <InternalLink
                  className="flex min-h-11 items-center justify-between rounded-box border border-base-300 bg-base-200 px-4"
                  href={`/worlds/${encodeURIComponent(definition.id)}/atlas/locations/${encodeURIComponent(row.record.sourceId)}${guideSuffix}`}
                >
                  <span>{row.name}</span>
                  {row.issue && <Badge tone="warning">{row.issue}</Badge>}
                </InternalLink>
              </li>
            ))}
          </ul>
        ) : (
          <Empty label="No Locations yet" />
        )}
      </DraftRequired>
    </LibraryPage>
  );
}

export function BestiaryPage() {
  const { definition, draft } = useWorldAuthoring();
  const creatures = recordsForLibrary(draft?.records ?? [], "creatures");
  return (
    <LibraryPage
      eyebrow="Bestiary"
      title="Creatures"
      description="Reusable source creatures in this working World revision."
      createHref={`/worlds/${encodeURIComponent(definition.id)}/bestiary/creatures/new`}
    >
      <DraftRequired>
        {creatures.length ? (
          <CardGrid
            records={creatures}
            href={(record) =>
              `/worlds/${encodeURIComponent(definition.id)}/bestiary/creatures/${encodeURIComponent(record.sourceId)}`
            }
          />
        ) : (
          <Empty label="No Creatures yet" />
        )}
      </DraftRequired>
    </LibraryPage>
  );
}

export function ItemCompendiumPage() {
  const { definition, draft } = useWorldAuthoring();
  const [query, setQuery] = useState("");
  const items = useMemo(
    () =>
      recordsForLibrary(draft?.records ?? [], "items").filter((record) =>
        recordName(record, "")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
    [draft, query],
  );
  return (
    <LibraryPage
      eyebrow="Item Compendium"
      title="Items, objects & hazards"
      description="Browse every Item family without splitting Objects, Traps, or Hazards into peer libraries."
      createHref={`/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/new`}
    >
      <DraftRequired>
        <Field label="Search Items" className="mt-6 max-w-md">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 w-full"
          />
        </Field>
        {items.length ? (
          <CardGrid
            records={items}
            href={(record) =>
              `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(record.sourceId)}`
            }
          />
        ) : (
          <Empty label="No matching Items" />
        )}
      </DraftRequired>
    </LibraryPage>
  );
}

function LibraryPage({
  eyebrow,
  title,
  description,
  createHref,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  createHref: string;
  children: ReactNode;
}) {
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const { canEdit } = useWorldAuthoring();
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-base-content/60">{description}</p>
        </div>
        {canEdit ? (
          <RouterButtonLink href={`${createHref}${guideSuffix}`} tone="primary">
            Create
          </RouterButtonLink>
        ) : (
          <Button disabled>Archived · read only</Button>
        )}
      </div>
      {children}
    </main>
  );
}
function CardGrid({
  records,
  href,
}: {
  records: WorldDraftRecord[];
  href: (record: WorldDraftRecord) => string;
}) {
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {records.map((record) => (
        <InternalLink
          key={`${record.resourceType}:${record.sourceId}`}
          href={`${href(record)}${guideSuffix}`}
          className="card border border-base-300 bg-base-200"
        >
          <div className="card-body">
            <h2 className="card-title">
              {recordName(record, "Unnamed record")}
            </h2>
            <p className="line-clamp-2 text-sm text-base-content/55">
              {recordDescription(record) ?? "No description yet."}
            </p>
          </div>
        </InternalLink>
      ))}
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="mt-6 rounded-box border border-dashed border-base-300 p-10 text-center text-base-content/55">
      {label}
    </div>
  );
}

export function DraftRecordEditor({
  kind,
  sourceId,
}: {
  kind: "locations" | "creatures" | "items";
  sourceId?: string;
}) {
  const { definition, draft, saveRecord, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate();
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const existing = recordsForLibrary(draft?.records ?? [], kind).find(
    (record) => record.sourceId === sourceId,
  );
  const initial = recordPayload(
    existing ?? { resourceType: kind, sourceId: "new", payload: {} },
  );
  const models = draft?.effectiveModels;
  const [name, setName] = useState(String(initial.name ?? ""));
  const [description, setDescription] = useState(
    String(initial.description ?? ""),
  );
  const [subtype, setSubtype] = useState(
    String(
      kind === "items"
        ? (initial.itemFamilyKey ?? models?.itemFamilies[0]?.key ?? "")
        : (initial.kind ?? (kind === "locations" ? "region" : "creature")),
    ),
  );
  const initialPlacement = objectValue(initial.placement);
  const [parentId, setParentId] = useState(
    String(
      initialPlacement.parentLocationId ??
        (kind === "locations" ? (draft?.content.rootLocationId ?? "") : ""),
    ),
  );
  const [attributes, setAttributes] = useState<Record<string, number>>(
    () => objectValue(initial.attributes) as Record<string, number>,
  );
  const [slots, setSlots] = useState<string[]>(() =>
    Array.isArray(initial.equipmentSlots)
      ? initial.equipmentSlots.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const initialEmbodimentPolicy = objectValue(initial.instanceEmbodimentPolicy);
  const initialEmbodimentStrategy = String(
    initialEmbodimentPolicy.strategy ?? "",
  );
  const [embodimentStrategy, setEmbodimentStrategy] =
    useState<EmbodimentStrategy>(
      initialEmbodimentStrategy === "one-per-instance" ||
        initialEmbodimentStrategy === "one-per-realization"
        ? initialEmbodimentStrategy
        : initialEmbodimentStrategy.includes(":")
          ? "preserve-extension"
          : "",
    );
  const [embodimentMaximum, setEmbodimentMaximum] = useState(
    initialEmbodimentPolicy.maximumPerCampaignInstance === undefined
      ? ""
      : String(initialEmbodimentPolicy.maximumPerCampaignInstance),
  );
  const [saved, setSaved] = useState(false);
  const conformance =
    draft && kind !== "locations"
      ? definitionConformance(draft, kind === "creatures" ? "creature" : "item")
      : undefined;
  const snapshot = JSON.stringify({
    name,
    description,
    subtype,
    parentId,
    attributes,
    slots,
    embodimentStrategy,
    embodimentMaximum,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;
  const allowSavedNavigation = useRef(false);
  const priorSourceId = useRef(sourceId);
  useEffect(() => {
    allowSavedNavigation.current = savedNavigationAllowanceForRoute(
      priorSourceId.current,
      sourceId,
      allowSavedNavigation.current,
    );
    priorSourceId.current = sourceId;
  }, [sourceId]);
  useBlocker({
    shouldBlockFn: () =>
      dirty &&
      !allowSavedNavigation.current &&
      !window.confirm("Leave without saving your World draft changes?"),
    enableBeforeUnload: dirty,
  });
  useEffect(() => {
    if (dirty) {
      setSaved(false);
      markDirty();
    }
  }, [dirty, markDirty]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !name.trim()) return;
    const id = existing?.sourceId ?? crypto.randomUUID();
    const isWorldRoot =
      kind === "locations" &&
      (!draft.content.rootLocationId || draft.content.rootLocationId === id);
    if (kind !== "locations" && !conformance) return;
    const didSave = await saveRecord({
      resourceType: kind === "locations" ? "locations" : "definitions",
      sourceId: id,
      payload: {
        ...initial,
        name: name.trim(),
        description: description.trim(),
        kind: isWorldRoot
          ? "world"
          : kind === "locations"
            ? subtype
            : kind === "creatures"
              ? "creature"
              : "item",
        ...(kind !== "locations"
          ? {
              conformance,
            }
          : {}),
        ...(kind === "locations"
          ? {
              placement: isWorldRoot
                ? { kind: "root" }
                : { kind: "within-parent", parentLocationId: parentId },
            }
          : {}),
        ...(kind === "creatures"
          ? {
              attributes,
              equipmentSlots: slots,
              instanceEmbodimentPolicy: creatureEmbodimentPolicyForSave(
                initial.instanceEmbodimentPolicy,
                embodimentStrategy,
                embodimentMaximum,
              ),
            }
          : {}),
        ...(kind === "items"
          ? { itemFamilyKey: subtype, compatibleEquipmentSlots: slots }
          : {}),
      },
    });
    if (!didSave) return;
    setSavedSnapshot(snapshot);
    setSaved(true);
    if (!existing) {
      allowSavedNavigation.current = true;
      const library =
        kind === "locations"
          ? "atlas/locations"
          : kind === "creatures"
            ? "bestiary/creatures"
            : "item-compendium/items";
      try {
        await navigate(
          `/worlds/${encodeURIComponent(definition.id)}/${library}/${encodeURIComponent(id)}${guideSuffix}`,
          { replace: true },
        );
      } finally {
        allowSavedNavigation.current = false;
      }
    }
  }
  const locations = locationParentOptions(
    draft?.records ?? [],
    existing?.sourceId,
  );
  const isRootLocation =
    kind === "locations" &&
    Boolean(existing && draft?.content.rootLocationId === existing.sourceId);
  const needsParent =
    kind === "locations" &&
    Boolean(draft?.content.rootLocationId) &&
    !isRootLocation;
  if (!canEdit)
    return (
      <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
        <h1 className="text-4xl font-semibold">
          {recordName(
            existing ?? {
              resourceType: kind,
              sourceId: "unavailable",
              payload: {},
            },
            `Archived ${kind === "items" ? "Item" : kind === "locations" ? "Location" : "Creature"}`,
          )}
        </h1>
        <Alert tone="warning" className="mt-8">
          {draft?.status === "stale"
            ? "This World draft changed elsewhere or its published base advanced. Reload the latest draft before editing."
            : "This World is archived and read only. Restore it from the World header before editing."}
        </Alert>
        {description && (
          <p className="mt-6 text-base-content/70">{description}</p>
        )}
        {kind === "locations" && existing && (
          <WorldLocationPlacements location={existing} />
        )}
      </main>
    );
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {kind === "locations"
          ? "Atlas"
          : kind === "creatures"
            ? "Bestiary"
            : "Item Compendium"}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {existing
          ? `Edit ${kind === "items" ? "Item" : kind === "locations" ? "Location" : "Creature"}`
          : `Create ${kind === "items" ? "Item" : kind === "locations" ? "Location" : "Creature"}`}
      </h1>
      <DraftRequired>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-8 grid gap-5"
        >
          <Field label="Name" required>
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="mt-2 w-full"
            />
          </Field>
          {kind === "locations" && !isRootLocation && (
            <Field label="Location kind">
              <Input
                value={subtype}
                onChange={(event) => setSubtype(event.target.value)}
                className="mt-2 w-full"
              />
            </Field>
          )}
          {kind === "items" && (
            <Field label="Item family" required>
              <Select
                required
                value={subtype}
                onChange={(event) => setSubtype(event.target.value)}
                className="mt-2 w-full"
              >
                <option value="" disabled>
                  Choose an Item family
                </option>
                {(models?.itemFamilies ?? []).map((family) => (
                  <option key={family.key} value={family.key}>
                    {family.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "creatures" && (
            <Alert>
              Creature kinds do not yet have an approved Model vocabulary. This
              Definition conforms to the effective Creature concept without
              inventing a free-text taxonomy.
            </Alert>
          )}
          {kind === "creatures" && (
            <CreatureEmbodimentPolicyFields
              strategy={embodimentStrategy}
              maximum={embodimentMaximum}
              legacy={!initial.instanceEmbodimentPolicy && Boolean(existing)}
              onStrategyChange={setEmbodimentStrategy}
              onMaximumChange={setEmbodimentMaximum}
            />
          )}
          {kind !== "locations" && !conformance && (
            <Alert tone="warning">
              The effective {kind === "creatures" ? "Creature" : "Item"}
              concept is unavailable. Select a complete Model release before
              saving this Definition.
            </Alert>
          )}
          {kind === "locations" && needsParent && (
            <Field
              label="Parent Location"
              required
              help="Choose containment in the Atlas hierarchy. Connections are authored separately."
            >
              <Select
                required
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                className="mt-2 w-full"
              >
                <option value="" disabled>
                  Choose a parent Location
                </option>
                {locations.map((location) => (
                  <option key={location.sourceId} value={location.sourceId}>
                    {recordName(location, "Unnamed Location")}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "locations" && !draft?.content.rootLocationId && (
            <Alert>
              The first Location becomes the World root. Further Locations must
              choose a parent.
            </Alert>
          )}
          {kind === "creatures" && (
            <Fieldset className="rounded-box border border-base-300 p-4">
              <Legend className="px-2 font-semibold">
                Attributes from effective model
              </Legend>
              {models?.attributes.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {models.attributes.map((attribute) => {
                    const config = attributeNumberConfig(attribute);
                    return (
                      <Field key={attribute.key} label={attribute.name}>
                        <Input
                          type="number"
                          min={config.minimum}
                          max={config.maximum}
                          value={
                            attributes[attribute.key] ?? config.defaultValue
                          }
                          onChange={(event) =>
                            setAttributes((current) => ({
                              ...current,
                              [attribute.key]: Number(event.target.value),
                            }))
                          }
                          className="mt-1 w-full"
                        />
                      </Field>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-base-content/55">
                  No effective Attribute release is available. Add one under
                  Characters → Model &amp; Taxonomies.
                </p>
              )}
            </Fieldset>
          )}
          {(kind === "creatures" || kind === "items") && (
            <Fieldset className="rounded-box border border-base-300 p-4">
              <Legend className="px-2 font-semibold">
                {kind === "items"
                  ? "Compatible Equipment Slots"
                  : "Available Equipment Slots"}
              </Legend>
              {models?.equipmentSlots.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {models.equipmentSlots.map((slot) => (
                    <Checkbox
                      key={slot.key}
                      label={slot.name}
                      checked={slots.includes(slot.key)}
                      onChange={(event) =>
                        setSlots((current) =>
                          event.target.checked
                            ? [...new Set([...current, slot.key])]
                            : current.filter((key) => key !== slot.key),
                        )
                      }
                      wrapperClassName="min-h-11 items-center gap-3"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-base-content/55">
                  No effective Equipment Slot release is available.
                </p>
              )}
            </Fieldset>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              tone="primary"
              disabled={
                !draft ||
                draft.status === "stale" ||
                (needsParent && !parentId) ||
                (kind !== "locations" && !conformance) ||
                (kind === "items" && !subtype) ||
                (kind === "creatures" && !embodimentStrategy)
              }
            >
              Save to working draft
            </Button>
            {saved && (
              <span aria-live="polite" className="text-sm text-success">
                Draft record saved.
              </span>
            )}
          </div>
        </form>
      </DraftRequired>
      {kind === "locations" && existing && (
        <WorldLocationPlacements location={existing} />
      )}
    </main>
  );
}

function WorldLocationPlacements({ location }: { location: WorldDraftRecord }) {
  const { draft, canEdit, saveRecord, removeWorldPlacement, markDirty } =
    useWorldAuthoring();
  const placements = worldPlacementRecordsForLocation(
    draft?.records ?? [],
    location.sourceId,
  );
  const creatures = recordsForLibrary(draft?.records ?? [], "creatures");
  const items = recordsForLibrary(draft?.records ?? [], "items");
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [scale, setScale] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const blankSnapshot = JSON.stringify({
    editingId: "",
    name: "",
    sourceKey: "",
    x: "",
    y: "",
    scale: "",
    notes: "",
  });
  const editorSnapshot = JSON.stringify({
    editingId,
    name,
    sourceKey,
    x,
    y,
    scale,
    notes,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(blankSnapshot);
  const dirty = editorSnapshot !== savedSnapshot;
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Leave without saving this World placement?"),
    enableBeforeUnload: dirty,
  });
  useEffect(() => {
    if (dirty) markDirty();
  }, [dirty, markDirty]);

  const labelForSource = (record: WorldDraftRecord) => {
    const id = worldPlacementSourceId(record);
    const source = [...creatures, ...items].find(
      (candidate) => candidate.sourceId === id,
    );
    return source
      ? recordName(source, "Unnamed World content")
      : "Unavailable World content";
  };

  function resetEditor() {
    setEditingId("");
    setName("");
    setSourceKey("");
    setX("");
    setY("");
    setScale("");
    setNotes("");
    setMessage("");
    setSavedSnapshot(blankSnapshot);
  }

  function edit(record: WorldDraftRecord) {
    const payload = recordPayload(record);
    const source = objectValue(payload.source);
    const position = objectValue(payload.mapPosition);
    const sourceId = worldPlacementSourceId(record) ?? "";
    const next = {
      editingId: record.sourceId,
      name: recordName(record, "Unnamed World placement"),
      sourceKey: `${String(source.kind ?? "world-creature")}\u0000${sourceId}`,
      x: typeof position.x === "number" ? String(position.x) : "",
      y: typeof position.y === "number" ? String(position.y) : "",
      scale: typeof payload.scale === "number" ? String(payload.scale) : "",
      notes: typeof payload.notes === "string" ? payload.notes : "",
    };
    setEditingId(next.editingId);
    setName(next.name);
    setSourceKey(next.sourceKey);
    setX(next.x);
    setY(next.y);
    setScale(next.scale);
    setNotes(next.notes);
    setMessage("");
    setSavedSnapshot(JSON.stringify(next));
  }

  async function remove(record: WorldDraftRecord) {
    if (
      !window.confirm(
        `Remove ${recordName(record, "this World placement")} from the working World revision?`,
      )
    )
      return;
    if (await removeWorldPlacement(record.sourceId)) {
      if (editingId === record.sourceId) resetEditor();
      setMessage("World placement removed from the working revision.");
    }
  }

  const [sourceKind, sourceId] = sourceKey.split("\u0000");
  const positionValid =
    (!x && !y) ||
    (x !== "" &&
      y !== "" &&
      Number(x) >= 0 &&
      Number(x) <= 1 &&
      Number(y) >= 0 &&
      Number(y) <= 1);
  const scaleValid = scale === "" || Number(scale) > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !draft ||
      !canEdit ||
      !name.trim() ||
      !sourceId ||
      !positionValid ||
      !scaleValid
    )
      return;
    const id = editingId || `world-placement:${crypto.randomUUID()}`;
    const existing = placements.find((record) => record.sourceId === editingId);
    const payload: Record<string, unknown> = {
      ...recordPayload(
        existing ?? {
          resourceType: "world-placements",
          sourceId: id,
          payload: {},
        },
      ),
      id,
      locationId: location.sourceId,
      name: name.trim(),
      source:
        sourceKind === "world-item"
          ? { kind: "world-item", itemDefinitionId: sourceId }
          : { kind: "world-creature", creatureId: sourceId },
    };
    if (x && y) {
      payload.mapPosition = {
        kind: "normalized-map",
        x: Number(x),
        y: Number(y),
      };
    } else delete payload.mapPosition;
    if (scale) payload.scale = Number(scale);
    else delete payload.scale;
    if (notes.trim()) payload.notes = notes.trim();
    else delete payload.notes;
    const didSave = await saveRecord({
      resourceType: "world-placements",
      sourceId: id,
      payload: payload as WorldDraftRecord["payload"],
    });
    if (!didSave) return;
    resetEditor();
    setMessage("World placement saved to the working revision.");
  }

  return (
    <section
      className="mt-10 border-t border-base-300 pt-8"
      aria-labelledby="world-placement-heading"
    >
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          Atlas · Location content
        </p>
        <h2
          id="world-placement-heading"
          className="mt-2 text-2xl font-semibold"
        >
          World placements
        </h2>
        <p className="mt-2 text-sm text-base-content/60">
          Place a named World Creature or Item in{" "}
          {recordName(location, "this Location")}. These stable placements are
          captured with published World revisions.
        </p>
      </div>
      <div className="mt-5 space-y-3">
        {placements.length ? (
          placements.map((record) => {
            const payload = recordPayload(record);
            const position = objectValue(payload.mapPosition);
            return (
              <article
                key={record.sourceId}
                className="rounded-box border border-base-300 bg-base-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {recordName(record, "Unnamed World placement")}
                    </h3>
                    <p className="mt-1 text-sm text-base-content/60">
                      {labelForSource(record)}
                    </p>
                    {(typeof position.x === "number" &&
                      typeof position.y === "number") ||
                    typeof payload.scale === "number" ? (
                      <p className="mt-1 text-xs text-base-content/55">
                        {typeof position.x === "number" &&
                        typeof position.y === "number"
                          ? `Map position ${Math.round(position.x * 100)}% × ${Math.round(position.y * 100)}%`
                          : "No map position"}
                        {typeof payload.scale === "number"
                          ? ` · Scale ${payload.scale}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {worldPlacementSourceIsEditable(record) ? (
                        <Button
                          type="button"
                          tone="outline"
                          size="sm"
                          onClick={() => edit(record)}
                        >
                          Edit placement
                        </Button>
                      ) : (
                        <Badge tone="warning">
                          Source preserved · read only
                        </Badge>
                      )}
                      <Button
                        type="button"
                        tone="danger"
                        size="sm"
                        onClick={() => void remove(record)}
                      >
                        Remove placement
                      </Button>
                    </div>
                  )}
                </div>
                {typeof payload.notes === "string" && payload.notes.trim() && (
                  <p className="mt-3 text-sm">{payload.notes}</p>
                )}
              </article>
            );
          })
        ) : (
          <Alert>No World placements are authored at this Location.</Alert>
        )}
      </div>
      {canEdit && (
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-6 rounded-box border border-base-300 bg-base-200 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">
              {editingId ? "Edit World placement" : "Add World placement"}
            </h3>
            {editingId && (
              <Button
                type="button"
                tone="ghost"
                size="sm"
                onClick={resetEditor}
              >
                Cancel editing
              </Button>
            )}
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Placement name" required className="sm:col-span-2">
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full"
              />
            </Field>
            <Field label="Creature or Item" required className="sm:col-span-2">
              <Select
                required
                value={sourceKey}
                onChange={(event) => setSourceKey(event.target.value)}
                className="mt-2 w-full"
              >
                <option value="">Choose named World content</option>
                <optgroup label="Creatures">
                  {creatures.map((record) => (
                    <option
                      key={record.sourceId}
                      value={`world-creature\u0000${record.sourceId}`}
                    >
                      {recordName(record, "Unnamed Creature")}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Items">
                  {items.map((record) => (
                    <option
                      key={record.sourceId}
                      value={`world-item\u0000${record.sourceId}`}
                    >
                      {recordName(record, "Unnamed Item")}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field
              label="Horizontal map position"
              help="Optional value from 0 to 1. Enter both coordinates or leave both blank."
            >
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={x}
                onChange={(event) => setX(event.target.value)}
                className="mt-2 w-full"
              />
            </Field>
            <Field
              label="Vertical map position"
              help="Optional value from 0 to 1. Enter both coordinates or leave both blank."
            >
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={y}
                onChange={(event) => setY(event.target.value)}
                className="mt-2 w-full"
              />
            </Field>
            <Field
              label="Token scale"
              help="Optional positive multiplier, such as 1 or 1.5."
            >
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={scale}
                onChange={(event) => setScale(event.target.value)}
                className="mt-2 w-full"
              />
            </Field>
            <Field label="Presentation notes" className="sm:col-span-2">
              <Textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-2 w-full"
              />
            </Field>
          </div>
          {!positionValid && (
            <Alert tone="warning" className="mt-4">
              Enter both map coordinates between 0 and 1, or leave both blank.
            </Alert>
          )}
          {!scaleValid && (
            <Alert tone="warning" className="mt-4">
              Token scale must be greater than zero.
            </Alert>
          )}
          <Button
            type="submit"
            tone="primary"
            className="mt-5"
            disabled={
              !name.trim() || !sourceId || !positionValid || !scaleValid
            }
          >
            {editingId ? "Save placement" : "Add placement"}
          </Button>
        </form>
      )}
      {message && (
        <p className="mt-4 text-sm" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}

export function CharactersPage() {
  const { definition, draft } = useWorldAuthoring();
  const base = `/worlds/${encodeURIComponent(definition.id)}/characters`;
  const names = (kind: Exclude<CharacterOptionKind, "heritage">) =>
    (draft?.records ?? [])
      .filter(
        (record) =>
          record.resourceType === "definitions" &&
          recordPayload(record).kind === kind,
      )
      .map((record) => recordName(record, "Unnamed option"));
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World authoring
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Characters</h1>
      <p className="mt-4 max-w-3xl text-base-content/65">
        Author the choices that shape Characters. Open model structure only when
        you need to change the vocabulary behind these editors.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <ModelCard
          title="Skills"
          values={names("skill")}
          emptyLabel="No Skills have been authored yet."
          href={`${base}/skills`}
        />
        <ModelCard
          title="Professions"
          values={names("profession")}
          emptyLabel="No Professions have been authored yet."
          href={`${base}/professions`}
        />
        <ModelCard
          title="Backgrounds"
          values={names("background")}
          emptyLabel="No Backgrounds have been authored yet."
          href={`${base}/backgrounds`}
        />
        <ModelCard
          title="Models & Taxonomies"
          values={[]}
          emptyLabel="Open the structural vocabularies behind Characters."
          href={`${base}/models`}
        />
      </div>
    </main>
  );
}

export function CharacterDefinitionsPage({
  kind,
}: {
  kind: Exclude<CharacterOptionKind, "heritage">;
}) {
  const { definition, draft } = useWorldAuthoring();
  const segment = `${kind}s`;
  const title =
    kind === "skill"
      ? "Skills"
      : kind === "profession"
        ? "Professions"
        : "Backgrounds";
  const records = (draft?.records ?? []).filter(
    (record) =>
      record.resourceType === "definitions" &&
      recordPayload(record).kind === kind,
  );
  const base = `/worlds/${encodeURIComponent(definition.id)}/characters/${segment}`;
  return (
    <LibraryPage
      eyebrow="Characters"
      title={title}
      description={`Create and revise ${title.toLocaleLowerCase()} within this World Definition.`}
      createHref={`${base}/new`}
    >
      {records.length ? (
        <CardGrid
          records={records}
          href={(record) => `${base}/${encodeURIComponent(record.sourceId)}`}
        />
      ) : (
        <Empty
          label={`No ${title.toLocaleLowerCase()} have been authored yet.`}
        />
      )}
    </LibraryPage>
  );
}

export function CharacterDefinitionEditor({
  kind,
  sourceId,
}: {
  kind: Exclude<CharacterOptionKind, "heritage">;
  sourceId?: string;
}) {
  const { definition, draft, saveRecord, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate();
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const existing = (draft?.records ?? []).find(
    (record) =>
      record.resourceType === "definitions" &&
      record.sourceId === sourceId &&
      recordPayload(record).kind === kind,
  );
  const initial = recordPayload(
    existing ?? { resourceType: "definitions", sourceId: "new", payload: {} },
  );
  const identity = objectValue(initial.identity);
  const components = objectValue(initial.components);
  const [name, setName] = useState(String(identity.name ?? ""));
  const [description, setDescription] = useState(
    String(identity.description ?? ""),
  );
  const [defaultAttribute, setDefaultAttribute] = useState(
    String(components.defaultAttribute ?? ""),
  );
  const initialRanks = Array.isArray(components.expertiseOrder)
    ? components.expertiseOrder
    : [];
  const [startingProfessionRank, setStartingProfessionRank] = useState(
    typeof initialRanks[0] === "string"
      ? initialRanks[0]
      : (draft?.effectiveModels?.professionRanks?.[0]?.key ?? ""),
  );
  const conformance = draft ? definitionConformance(draft, kind) : undefined;
  const snapshot = JSON.stringify({
    name,
    description,
    defaultAttribute,
    startingProfessionRank,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Leave without saving this Character option?"),
    enableBeforeUnload: dirty,
  });
  useEffect(() => {
    if (dirty) markDirty();
  }, [dirty, markDirty]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !name.trim() || !conformance) return;
    const id = existing?.sourceId ?? crypto.randomUUID();
    const generated = characterOptionDefinition({
      kind,
      id,
      key:
        typeof identity.key === "string"
          ? identity.key
          : characterOptionKey(kind, name),
      worldId: definition.id,
      name: name.trim(),
      description: description.trim(),
      defaultAttribute: defaultAttribute || undefined,
      startingProfessionRank: startingProfessionRank || undefined,
      existingComponents: components as Record<string, JsonValue>,
    });
    const didSave = await saveRecord({
      resourceType: "definitions",
      sourceId: id,
      payload: {
        ...initial,
        ...generated,
        identity: { ...identity, ...generated.identity },
        components: generated.components,
        conformance,
      },
    });
    if (!didSave) return;
    setSavedSnapshot(snapshot);
    if (!existing) {
      await navigate(
        `/worlds/${encodeURIComponent(definition.id)}/characters/${kind}s/${encodeURIComponent(id)}${guideSuffix}`,
        { replace: true },
      );
    }
  }

  const title =
    kind === "skill"
      ? "Skill"
      : kind === "profession"
        ? "Profession"
        : "Background";
  if (!canEdit)
    return (
      <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
        <h1 className="text-4xl font-semibold">{name || title}</h1>
        <Alert tone="warning" className="mt-8">
          This World is read only. Restore it or refresh its draft before
          editing Character options.
        </Alert>
      </main>
    );
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Characters · {title}s
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {existing ? `Edit ${title}` : `Create ${title}`}
      </h1>
      {!conformance && (
        <Alert tone="warning" className="mt-6">
          The effective {title} model is unavailable. Select a complete Model
          release before saving.
        </Alert>
      )}
      <DraftRequired>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-8 grid gap-5"
        >
          <Field label="Name" required>
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="mt-2 w-full"
            />
          </Field>
          {kind === "skill" && (
            <Field label="Default Attribute">
              <Select
                value={defaultAttribute}
                onChange={(event) => setDefaultAttribute(event.target.value)}
                className="mt-2 w-full"
              >
                <option value="">No default Attribute</option>
                {(draft?.effectiveModels?.attributes ?? []).map((attribute) => (
                  <option key={attribute.key} value={attribute.key}>
                    {attribute.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "profession" && (
            <Field label="Starting Profession Rank" required>
              <Select
                required
                value={startingProfessionRank}
                onChange={(event) =>
                  setStartingProfessionRank(event.target.value)
                }
                className="mt-2 w-full"
              >
                <option value="" disabled>
                  Choose a Profession Rank
                </option>
                {(draft?.effectiveModels?.professionRanks ?? []).map((rank) => (
                  <option key={rank.key} value={rank.key}>
                    {rank.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Button
            type="submit"
            tone="primary"
            disabled={
              !conformance ||
              !name.trim() ||
              (kind === "profession" && !startingProfessionRank)
            }
          >
            Save {title}
          </Button>
        </form>
      </DraftRequired>
    </main>
  );
}

export function CharacterModelsPage() {
  const { definition, draft } = useWorldAuthoring();
  const models = draft?.effectiveModels;
  const base = `/worlds/${encodeURIComponent(definition.id)}/characters/model`;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Characters
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Model &amp; Taxonomies
      </h1>
      <p className="mt-4 max-w-3xl text-base-content/65">
        Edit open World schema and vocabularies separately from record values.
        Changes affect compatible editors in this working revision and are
        reviewed before publication.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <ModelCard
          title="Schema Structure"
          values={[
            `${models?.elements?.filter(({ kind }) => kind === "concept").length ?? 0} Concepts`,
            `${models?.elements?.filter(({ kind }) => kind === "field").length ?? 0} Fields`,
            `${models?.elements?.filter(({ kind }) => kind === "relationship").length ?? 0} Relationships`,
          ]}
          href={`${base}/structure/effective`}
        />
        <ModelCard
          title="Attributes"
          values={models?.attributes.map(({ name }) => name) ?? []}
          href={`${base}/attributes/effective`}
        />
        <ModelCard
          title="Equipment Slots"
          values={models?.equipmentSlots.map(({ name }) => name) ?? []}
          href={`${base}/equipment-slots/effective`}
        />
        <ModelCard
          title="Profession Ranks"
          values={models?.professionRanks?.map(({ name }) => name) ?? []}
          href={`${base}/profession-ranks/effective`}
        />
      </div>
    </main>
  );
}
function ModelCard({
  title,
  values,
  href,
  emptyLabel = "No effective release is available.",
}: {
  title: string;
  values: string[];
  href: string;
  emptyLabel?: string;
}) {
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  return (
    <section className="card border border-base-300 bg-base-200">
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p className="text-sm text-base-content/55">
          {values.length ? values.join(", ") : emptyLabel}
        </p>
        <InternalLink
          className="btn btn-outline btn-sm mt-3"
          href={`${href}${guideSuffix}`}
        >
          Review {title}
        </InternalLink>
      </div>
    </section>
  );
}

export function WorldModelEditor({
  kind,
}: {
  kind: "attributes" | "equipment-slots" | "profession-ranks";
}) {
  const { draft, saveDraft, refreshEffectiveModels, canEdit, markDirty } =
    useWorldAuthoring();
  const [registries, setRegistries] = useState<ModelRegistrySummary[]>([]);
  const [registryId, setRegistryId] = useState("");
  const [name, setName] = useState("");
  const [minimum, setMinimum] = useState(0);
  const [maximum, setMaximum] = useState(100);
  const [defaultValue, setDefaultValue] = useState(50);
  const [order, setOrder] = useState(0);
  const [editing, setEditing] = useState<WorldModelOption>();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{
    release: {
      id: string;
      registryId: string;
      predecessorRevisionId?: string;
      dependencyReleaseIds: string[];
    };
    label: string;
  }>();
  const options =
    kind === "attributes"
      ? draft?.effectiveModels?.attributes
      : kind === "equipment-slots"
        ? draft?.effectiveModels?.equipmentSlots
        : draft?.effectiveModels?.professionRanks;
  const modelLabel =
    kind === "attributes"
      ? "Attribute"
      : kind === "equipment-slots"
        ? "Equipment Slot"
        : "Profession Rank";
  const gmRegistries = registries.filter(
    (registry) => registry.provenance.kind === "gm",
  );
  const modelMetadataValid =
    Number.isInteger(order) &&
    (kind !== "attributes" ||
      (Number.isInteger(minimum) &&
        Number.isInteger(maximum) &&
        Number.isInteger(defaultValue) &&
        minimum <= defaultValue &&
        defaultValue <= maximum));
  const modelDirty =
    Boolean(name.trim()) ||
    Boolean(editing) ||
    order !== 0 ||
    (kind === "attributes" &&
      (minimum !== 0 || maximum !== 100 || defaultValue !== 50));
  useBlocker({
    shouldBlockFn: () =>
      modelDirty &&
      !window.confirm("Leave without publishing this Model option?"),
    enableBeforeUnload: modelDirty,
  });
  useEffect(() => {
    if (modelDirty) markDirty();
  }, [markDirty, modelDirty]);
  useEffect(() => {
    void listModelRegistries()
      .then(({ items }) => {
        const editable = items.filter(
          (registry) => registry.provenance.kind === "gm",
        );
        setRegistries(items);
        setRegistryId((current) => current || editable[0]?.identity.id || "");
      })
      .catch(() =>
        setMessage(
          "Editable Model Registries could not be loaded. No release was changed.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!draft || !registryId || pending) return;
    let active = true;
    void getModelRegistry(registryId)
      .then((registry) => {
        if (!active) return;
        const recovery = recoverableRegistryRelease(
          draft.content,
          draft.effectiveModels?.releases ?? [],
          registryId,
          registry.releases,
        );
        if (!recovery) return;
        setPending({
          release: {
            id: recovery.identity.id,
            registryId: recovery.identity.lineageId,
            predecessorRevisionId: recovery.identity.predecessorRevisionId,
            dependencyReleaseIds: (recovery.dependencies ?? []).map(
              ({ releaseId }) => releaseId,
            ),
          },
          label: recovery.name || "Published Model release",
        });
        setMessage(
          "A published Model release is ready to adopt into this World draft. Adopt it before publishing another option.",
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [draft, pending, registryId]);

  if (!canEdit)
    return (
      <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
        <h1 className="text-4xl font-semibold">{modelLabel}s</h1>
        <Alert tone="warning" className="mt-8">
          {draft?.status === "stale"
            ? "This World draft changed elsewhere. Reload it before publishing or adopting Model releases."
            : "This World is archived and read only. Restore it before publishing or adopting Model releases."}
        </Alert>
      </main>
    );

  async function adopt(
    release: {
      id: string;
      registryId: string;
      predecessorRevisionId?: string;
      dependencyReleaseIds: string[];
    },
    label: string,
  ) {
    if (!draft) return false;
    const adoptedDraft = draftAdoptingRegistryRelease(
      draft,
      draft.effectiveModels?.releases ?? [],
      release,
    );
    if (!adoptedDraft) {
      setMessage(
        "The World’s selected Model release changed. Reload this workspace before adopting the new release.",
      );
      return false;
    }
    const saved = await saveDraft(adoptedDraft);
    if (!saved) {
      setPending({ release, label });
      setMessage(
        `${label} was published in the Model Registry, but this World did not adopt that release. Review the draft conflict, then retry adoption.`,
      );
      return false;
    }
    try {
      await refreshEffectiveModels();
    } catch {
      setPending(undefined);
      setMessage(
        `${label} was published and adopted. Reload the workspace to see the refreshed editor fields.`,
      );
      return true;
    }
    setPending(undefined);
    setMessage(
      `${label} is now part of this World’s selected Model release and is available in compatible editors.`,
    );
    return true;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !name.trim()) return;
    const vocabularyRole =
      kind === "attributes"
        ? "aow:attribute-registry"
        : kind === "equipment-slots"
          ? "aow:equipment-slot-registry"
          : "aow:profession-rank-registry";
    const semanticRole =
      kind === "attributes"
        ? "aow:attribute"
        : kind === "equipment-slots"
          ? "aow:equipment-slot"
          : "aow:profession-rank";
    const vocabulary = draft.effectiveModels?.elements?.find(
      (element) =>
        element.semanticRole === vocabularyRole &&
        element.payload?.kind === "vocabulary",
    );
    if (!vocabulary?.elementId) {
      setMessage(
        `The effective ${modelLabel} vocabulary could not be resolved. No release was changed.`,
      );
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      let selected = gmRegistries.find(
        (registry) => registry.identity.id === registryId,
      );
      if (!selected) {
        selected = await createModelRegistry({
          key: "custom:models",
          name: "Custom Models",
        });
        setRegistries((current) => [...current, selected!]);
        setRegistryId(selected.identity.id);
      }
      const registry = await getModelRegistry(selected.identity.id);
      const recovery = recoverableRegistryRelease(
        draft.content,
        draft.effectiveModels?.releases ?? [],
        selected.identity.id,
        registry.releases,
      );
      if (recovery) {
        await adopt(
          {
            id: recovery.identity.id,
            registryId: recovery.identity.lineageId,
            predecessorRevisionId: recovery.identity.predecessorRevisionId,
            dependencyReleaseIds: (recovery.dependencies ?? []).map(
              ({ releaseId }) => releaseId,
            ),
          },
          recovery.name || "Published Model release",
        );
        return;
      }
      const predecessor = registry.releases[0];
      const currentElement = editing
        ? registry.elements.find((element) => element.id === editing.elementId)
        : undefined;
      if (editing && !currentElement?.currentRevision) {
        setMessage(
          "That Model option changed or is no longer editable. Reload and try again.",
        );
        return;
      }
      const valueMetadata =
        kind === "attributes"
          ? {
              "aow:minimum": minimum,
              "aow:maximum": maximum,
              "aow:default": defaultValue,
            }
          : undefined;
      const presentation = {
        ...(currentElement?.currentRevision?.presentation ?? {}),
        label: name.trim(),
        order,
      };
      const payload = currentElement?.currentRevision
        ? {
            ...currentElement.currentRevision.payload,
            ...(valueMetadata ? { valueMetadata } : {}),
          }
        : {
            kind: "vocabulary-option",
            vocabularyId: vocabulary.elementId,
            ...(valueMetadata ? { valueMetadata } : {}),
          };
      const result = await extendModelRegistryRelease(selected.identity.id, {
        name: `${editing ? "Revise" : "Add"} ${name.trim()}`,
        predecessorRevisionId: predecessor?.identity.id,
        ...(editing && currentElement?.currentRevision
          ? {
              revisions: [
                {
                  elementId: currentElement.id,
                  predecessorRevisionId:
                    currentElement.currentRevision.identity.id,
                  payload,
                  presentation,
                  dependencies: currentElement.currentRevision.dependencies,
                },
              ],
            }
          : {
              elements: [
                {
                  key: modelExtensionKey(kind, name),
                  kind: "vocabulary-option" as const,
                  semanticRole,
                  applicability: { kind: "global" },
                  payload,
                  presentation,
                },
              ],
            }),
      });
      const label = name.trim();
      const adopted = await adopt(
        {
          id: result.release.identity.id,
          registryId: result.release.identity.lineageId,
          predecessorRevisionId: result.release.identity.predecessorRevisionId,
          dependencyReleaseIds: (result.release.dependencies ?? []).map(
            ({ releaseId }) => releaseId,
          ),
        },
        label,
      );
      if (adopted) {
        setName("");
        setMinimum(0);
        setMaximum(100);
        setDefaultValue(50);
        setOrder(0);
        setEditing(undefined);
      }
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError && error.status === 409
          ? "The Model Registry advanced before this release was published. Reload and try again."
          : "The Model release could not be published. No World draft selection was changed.",
      );
    } finally {
      setWorking(false);
    }
  }

  function editOption(option: WorldModelOption) {
    const metadata = objectValue(option.payload?.valueMetadata);
    setEditing(option);
    setRegistryId(option.registryId ?? "");
    setName(option.name);
    setMinimum(
      typeof metadata["aow:minimum"] === "number" ? metadata["aow:minimum"] : 0,
    );
    setMaximum(
      typeof metadata["aow:maximum"] === "number"
        ? metadata["aow:maximum"]
        : 100,
    );
    setDefaultValue(
      typeof metadata["aow:default"] === "number"
        ? metadata["aow:default"]
        : 50,
    );
    setOrder(
      typeof option.presentation?.order === "number"
        ? option.presentation.order
        : 0,
    );
    setMessage("");
  }

  async function archiveOption(option: WorldModelOption) {
    if (
      !draft ||
      !option.registryId ||
      !option.elementId ||
      !window.confirm(
        `Archive ${option.name}? Existing releases will retain it, but the new release will omit it.`,
      )
    )
      return;
    setWorking(true);
    setMessage("");
    try {
      const registry = await getModelRegistry(option.registryId);
      const recovery = recoverableRegistryRelease(
        draft.content,
        draft.effectiveModels?.releases ?? [],
        option.registryId,
        registry.releases,
      );
      if (recovery) {
        await adopt(
          {
            id: recovery.identity.id,
            registryId: recovery.identity.lineageId,
            predecessorRevisionId: recovery.identity.predecessorRevisionId,
            dependencyReleaseIds: (recovery.dependencies ?? []).map(
              ({ releaseId }) => releaseId,
            ),
          },
          recovery.name || "Published Model release",
        );
        return;
      }
      const result = await extendModelRegistryRelease(option.registryId, {
        name: `Archive ${option.name}`,
        predecessorRevisionId: registry.releases[0]?.identity.id,
        archiveElementIds: [option.elementId],
      });
      await adopt(
        {
          id: result.release.identity.id,
          registryId: result.release.identity.lineageId,
          predecessorRevisionId: result.release.identity.predecessorRevisionId,
          dependencyReleaseIds: (result.release.dependencies ?? []).map(
            ({ releaseId }) => releaseId,
          ),
        },
        option.name,
      );
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError && error.status === 409
          ? "The Model Registry advanced before this option was archived. Reload and try again."
          : "The Model option could not be archived. No World draft selection was changed.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Characters · Model &amp; Taxonomies
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {modelLabel}s
      </h1>
      <p className="mt-4 text-base-content/65">
        These values come from the exact immutable Model Schema release selected
        by this World draft.
      </p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {(options ?? []).map((option) => (
          <li
            key={option.key}
            className="rounded-box border border-base-300 bg-base-200 p-4"
          >
            <span className="font-semibold">{option.name}</span>
            {option.description && (
              <p className="mt-1 text-sm text-base-content/55">
                {option.description}
              </p>
            )}
            {gmRegistries.some(
              (registry) => registry.identity.id === option.registryId,
            ) && (
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  tone="outline"
                  disabled={working}
                  onClick={() => editOption(option)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  tone="outline"
                  disabled={working}
                  onClick={() => void archiveOption(option)}
                >
                  Archive
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!options?.length && (
        <Alert tone="warning" className="mt-6">
          No effective options are available for this World.
        </Alert>
      )}
      <DraftRequired>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-8 rounded-box border border-base-300 p-5"
        >
          <h2 className="text-xl font-semibold">
            {editing ? "Edit" : "Add"} {modelLabel}
          </h2>
          <p className="mt-2 text-sm text-base-content/60">
            This publishes a successor release, then explicitly adopts that
            exact release in the working World draft.
          </p>
          {gmRegistries.length > 1 ? (
            <Field label="Editable Model Registry" className="mt-4">
              <Select
                value={registryId}
                disabled={Boolean(editing)}
                onChange={(event) => setRegistryId(event.target.value)}
                className="mt-2 w-full"
              >
                {gmRegistries.map((registry) => (
                  <option
                    key={registry.identity.id}
                    value={registry.identity.id}
                  >
                    {registry.name || "Unnamed Model Registry"}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="mt-4 text-sm text-base-content/55">
              {gmRegistries[0]
                ? `Publishing to ${gmRegistries[0].name || "your editable Model Registry"}.`
                : "Your editable Custom Models registry will be created when you publish the first option."}
            </p>
          )}
          <Field label="Display name" required className="mt-4">
            <Input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                kind === "attributes"
                  ? "Likeable"
                  : kind === "equipment-slots"
                    ? "Wings"
                    : "Initiate"
              }
              className="mt-2 w-full"
            />
          </Field>
          {kind === "attributes" && (
            <Fieldset className="mt-5 rounded-box border border-base-300 p-4">
              <Legend className="px-2 font-semibold">Numeric behavior</Legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum" required>
                  <Input
                    required
                    type="number"
                    value={minimum}
                    onChange={(event) => setMinimum(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </Field>
                <Field label="Maximum" required>
                  <Input
                    required
                    type="number"
                    value={maximum}
                    onChange={(event) => setMaximum(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </Field>
                <Field label="Default" required>
                  <Input
                    required
                    type="number"
                    value={defaultValue}
                    onChange={(event) =>
                      setDefaultValue(Number(event.target.value))
                    }
                    className="mt-2 w-full"
                  />
                </Field>
                <Field label="Display order" required>
                  <Input
                    required
                    type="number"
                    value={order}
                    onChange={(event) => setOrder(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </Field>
              </div>
              {!modelMetadataValid && (
                <p className="mt-3 text-sm text-error" role="alert">
                  Use whole numbers and keep the default between the minimum and
                  maximum.
                </p>
              )}
            </Fieldset>
          )}
          {kind !== "attributes" && (
            <Field label="Display order" required className="mt-4">
              <Input
                required
                type="number"
                value={order}
                onChange={(event) => setOrder(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </Field>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="submit"
              tone="primary"
              loading={working}
              disabled={
                working ||
                Boolean(pending) ||
                draft?.status === "stale" ||
                !name.trim() ||
                !modelMetadataValid
              }
            >
              {editing ? "Publish revision and adopt" : "Publish and adopt"}
            </Button>
            {editing && (
              <Button
                type="button"
                tone="outline"
                disabled={working}
                onClick={() => {
                  setEditing(undefined);
                  setName("");
                  setMinimum(0);
                  setMaximum(100);
                  setDefaultValue(50);
                  setOrder(0);
                }}
              >
                Cancel edit
              </Button>
            )}
            {pending && (
              <Button
                type="button"
                tone="outline"
                disabled={draft?.status === "stale"}
                onClick={() => void adopt(pending.release, pending.label)}
              >
                Retry adoption
              </Button>
            )}
          </div>
          {message && (
            <Alert className="mt-4" aria-live="polite">
              {message}
            </Alert>
          )}
        </form>
      </DraftRequired>
    </main>
  );
}
