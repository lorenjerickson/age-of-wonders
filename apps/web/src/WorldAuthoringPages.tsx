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
  draftAdoptingRegistryRelease,
  locationParentOptions,
  modelExtensionKey,
  recordName,
  recordPayload,
  recoverableRegistryRelease,
  savedNavigationAllowanceForRoute,
  recordsForLibrary,
} from "./worldAuthoringModel";
import type { ReadSection } from "./server/readModels";
import { safeDateLabel } from "./worldDefinitionModel";
import { quickStartSuffix } from "./quickStartModel";

const objectValue = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function WorldOverviewPage() {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const base = `/worlds/${encodeURIComponent(definition.id)}`;
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
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
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
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
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
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
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
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
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
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
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
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
              {String(
                recordPayload(record).description ?? "No description yet.",
              )}
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
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
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
        ...(kind === "creatures" ? { attributes, equipmentSlots: slots } : {}),
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
          This World is archived and read only. Restore it from the World header
          before editing.
        </Alert>
        {description && (
          <p className="mt-6 text-base-content/70">{description}</p>
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
                (kind === "items" && !subtype)
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
        Edit open World vocabularies separately from record values. Changes
        affect compatible editors in this working revision and are reviewed
        before publication.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
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
      </div>
    </main>
  );
}
function ModelCard({
  title,
  values,
  href,
}: {
  title: string;
  values: string[];
  href: string;
}) {
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  return (
    <section className="card border border-base-300 bg-base-200">
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p className="text-sm text-base-content/55">
          {values.length
            ? values.join(", ")
            : "No effective release is available."}
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
  kind: "attributes" | "equipment-slots";
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
      : draft?.effectiveModels?.equipmentSlots;
  const gmRegistries = registries.filter(
    (registry) => registry.provenance.kind === "gm",
  );
  const attributeMetadataValid =
    kind !== "attributes" ||
    (Number.isInteger(minimum) &&
      Number.isInteger(maximum) &&
      Number.isInteger(defaultValue) &&
      Number.isInteger(order) &&
      minimum <= defaultValue &&
      defaultValue <= maximum);
  const modelDirty =
    Boolean(name.trim()) ||
    (kind === "attributes" &&
      (minimum !== 0 || maximum !== 100 || defaultValue !== 50 || order !== 0));
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
        <h1 className="text-4xl font-semibold">
          {kind === "attributes" ? "Attributes" : "Equipment Slots"}
        </h1>
        <Alert tone="warning" className="mt-8">
          This World is archived and read only. Restore it before publishing or
          adopting Model releases.
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
        : "aow:equipment-slot-registry";
    const semanticRole =
      kind === "attributes" ? "aow:attribute" : "aow:equipment-slot";
    const vocabulary = draft.effectiveModels?.elements?.find(
      (element) =>
        element.semanticRole === vocabularyRole &&
        element.payload?.kind === "vocabulary",
    );
    if (!vocabulary?.elementId) {
      setMessage(
        `The effective ${kind === "attributes" ? "Attribute" : "Equipment Slot"} vocabulary could not be resolved. No release was changed.`,
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
      const result = await extendModelRegistryRelease(selected.identity.id, {
        name: `Add ${name.trim()}`,
        predecessorRevisionId: predecessor?.identity.id,
        elements: [
          {
            key: modelExtensionKey(kind, name),
            kind: "vocabulary-option",
            semanticRole,
            applicability: { kind: "global" },
            payload: {
              kind: "vocabulary-option",
              vocabularyId: vocabulary.elementId,
              ...(kind === "attributes"
                ? {
                    valueMetadata: {
                      "aow:minimum": minimum,
                      "aow:maximum": maximum,
                      "aow:default": defaultValue,
                    },
                  }
                : {}),
            },
            presentation: {
              label: name.trim(),
              ...(kind === "attributes" ? { order } : {}),
            },
          },
        ],
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

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Characters · Model &amp; Taxonomies
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {kind === "attributes" ? "Attributes" : "Equipment Slots"}
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
            Add {kind === "attributes" ? "Attribute" : "Equipment Slot"}
          </h2>
          <p className="mt-2 text-sm text-base-content/60">
            This publishes a successor release, then explicitly adopts that
            exact release in the working World draft.
          </p>
          {gmRegistries.length > 1 ? (
            <Field label="Editable Model Registry" className="mt-4">
              <Select
                value={registryId}
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
              placeholder={kind === "attributes" ? "Likeable" : "Wings"}
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
              {!attributeMetadataValid && (
                <p className="mt-3 text-sm text-error" role="alert">
                  Use whole numbers and keep the default between the minimum and
                  maximum.
                </p>
              )}
            </Fieldset>
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
                !attributeMetadataValid
              }
            >
              Publish and adopt
            </Button>
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
