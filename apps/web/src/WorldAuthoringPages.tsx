import { ItemStorageFields, type ItemStorageEdits } from "./ItemStorageFields";
import { visibleRecordName, visibleRecordDescription } from "./recordDisplay";
import { protectedComparisonText } from "./protectedAuthoringText";
import { RuleTextField } from "./RuleValueFields";
import { WorldRecordRemoval } from "./WorldRecordRemoval";
import {
  LocationCollectionPage,
  LocationPreservedPlacements,
} from "./LocationCollectionPages";
import { BackgroundDefinition } from "@aow/domain";
import { backgroundModifiersValid } from "./backgroundModifierModel";
import { RecordTabs, recordTabId } from "./RecordTabs";
import { ShellTools } from "./AppShellTools";
import { ArtworkGenerator } from "./ArtworkGenerator";
import {
  ProfessionModifiersEditor,
  type ModifierEdit,
} from "./ProfessionModifiersEditor";
import {
  levelModifierGrants,
  professionModifierLevels,
  professionModifiersValid,
} from "./professionModifierModel";
import { useEditorSave } from "./useEditorSave";
import { MediaImage } from "./MediaImage";
import { CreatureArtwork, RecordThumbnail } from "./RecordArtwork";
import {
  useEffect,
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
  Disclosure,
  Field,
  Fieldset,
  Input,
  Legend,
  Select,
  Textarea,
} from "@aow/ui";
import {
  ApiRequestError,
  deleteMedia,
  publishWorldDefinitionDraft,
  proposeWorldDraftRecord,
  saveWorldCreature,
  saveWorldItem,
  saveWorldLocation,
  uploadWorldMedia,
  upgradeLegacyWorldCreature,
  validateWorldDefinitionDraft,
  type JsonValue,
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
  locationParentId,
  adoptedLegacyModelKey,
  creatureAttributesForEditor,
  attributeNumberConfig,
  definitionConformance,
  creatureEmbodimentPolicyForSave,
  locationParentOptions,
  recordDescription,
  recordPayload,
  requestedDraftRecordMissing,
  savedNavigationAllowanceForRoute,
  savedWorldRecordEditorSnapshot,
  squareItemImageIssue,
  recordsForLibrary,
  worldDraftMutationRevision,
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

function AuthoringTextField({
  label,
  value,
  onChange,
  recordIds,
  multiline = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  recordIds: ReadonlySet<string>;
  multiline?: boolean;
  required?: boolean;
}) {
  if (protectedComparisonText(value, recordIds))
    return (
      <RuleTextField
        label={label}
        value={value}
        onChange={onChange}
        recordIds={recordIds}
      />
    );
  return (
    <Field label={label} required={required}>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={5}
          className="mt-2 w-full"
        />
      ) : (
        <Input
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full"
        />
      )}
    </Field>
  );
}

function imageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected Item image could not be read."));
    };
    image.src = url;
  });
}

class ItemImageSelectionError extends Error {}

type EmbodimentStrategy =
  "" | "one-per-instance" | "one-per-realization" | "preserve-extension";

export function AiCreationChoice({
  kind,
  mode,
  direction,
  pending,
  ready,
  error,
  disabled,
  disabledReason,
  onModeChange,
  onDirectionChange,
  onRequest,
}: {
  kind: "locations" | "creatures" | "items";
  mode: "manual" | "ai";
  direction: string;
  pending: boolean;
  ready: boolean;
  error: string;
  disabled: boolean;
  disabledReason?: string;
  onModeChange(mode: "manual" | "ai"): void;
  onDirectionChange(value: string): void;
  onRequest(): void;
}) {
  const label =
    kind === "items" ? "Item" : kind === "locations" ? "Location" : "Creature";
  return (
    <section className="mt-8 rounded-box border border-base-300 bg-base-200 p-5">
      <h2 className="font-semibold">Choose how to begin</h2>
      <div
        className="mt-3 flex flex-wrap gap-3"
        role="group"
        aria-label="Creation mode"
      >
        <Button
          type="button"
          tone={mode === "manual" ? "primary" : undefined}
          aria-pressed={mode === "manual"}
          onClick={() => onModeChange("manual")}
          disabled={pending}
        >
          Create manually
        </Button>
        <Button
          type="button"
          tone={mode === "ai" ? "primary" : undefined}
          aria-pressed={mode === "ai"}
          onClick={() => onModeChange("ai")}
          disabled={pending}
        >
          Create with AI
        </Button>
      </div>
      {mode === "ai" && (
        <div className="mt-5 grid gap-4">
          <Field
            label={`Describe the ${label}`}
            required
            help="Your direction and limited working-draft context are sent to the configured AI provider. The editable proposal will not change the draft until you apply it."
          >
            <Textarea
              value={direction}
              maxLength={4_000}
              rows={4}
              onChange={(event) => onDirectionChange(event.target.value)}
              className="mt-2 w-full"
              disabled={pending}
              aria-describedby={
                disabledReason ? `${kind}-ai-disabled-reason` : undefined
              }
            />
          </Field>
          {kind === "items" && (
            <Alert>
              AI proposes text only. You must choose a catalog image and write
              its accessible description before applying.
            </Alert>
          )}
          <div>
            <Button
              type="button"
              disabled={pending || disabled}
              aria-describedby={
                disabledReason ? `${kind}-ai-disabled-reason` : undefined
              }
              onClick={onRequest}
            >
              {pending ? "Preparing proposal…" : "Prepare editable proposal"}
            </Button>
            {disabledReason && (
              <p
                id={`${kind}-ai-disabled-reason`}
                className="mt-2 text-sm text-base-content/65"
              >
                {disabledReason}
              </p>
            )}
          </div>
          {ready && (
            <Alert tone="success" aria-live="polite">
              Proposal ready. Review and edit every field below, then apply it
              to the working draft.
            </Alert>
          )}
          {error && (
            <Alert tone="error" aria-live="polite">
              {error}
            </Alert>
          )}
        </div>
      )}
    </section>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function editorFieldsFromProposal(
  kind: "locations" | "creatures" | "items",
  proposal: Record<string, unknown>,
) {
  const policy = objectValue(proposal.instanceEmbodimentPolicy);
  const proposedSlots =
    kind === "creatures"
      ? proposal.equipmentSlots
      : kind === "items"
        ? (proposal.compatibleEquipmentSlotSets ??
          proposal.compatibleEquipmentSlots)
        : undefined;
  const slotSets = Array.isArray(proposedSlots)
    ? proposedSlots
        .map((value) =>
          Array.isArray(value)
            ? value.filter((slot): slot is string => typeof slot === "string")
            : typeof value === "string"
              ? [value]
              : [],
        )
        .filter((set) => set.length > 0)
    : undefined;
  return {
    name: String(proposal.name ?? ""),
    description: String(proposal.description ?? ""),
    subtype:
      kind === "locations"
        ? String(proposal.kind ?? "region")
        : kind === "items"
          ? String(proposal.itemFamilyKey ?? "")
          : undefined,
    attributes:
      kind === "creatures"
        ? (objectValue(proposal.attributes) as Record<string, number>)
        : undefined,
    slots: slotSets?.flat(),
    slotSets,
    profileSummary:
      kind === "locations" && proposal.profileSummary !== undefined
        ? String(proposal.profileSummary)
        : undefined,
    profileTags:
      kind === "locations" && Array.isArray(proposal.profileTags)
        ? proposal.profileTags.filter(
            (value): value is string => typeof value === "string",
          )
        : undefined,
    mapSceneNotes:
      kind === "locations" && proposal.mapSceneNotes !== undefined
        ? String(proposal.mapSceneNotes)
        : undefined,
    mapOrientation:
      kind === "locations" && proposal.mapOrientation !== undefined
        ? String(proposal.mapOrientation)
        : undefined,
    artDirection:
      kind === "creatures" && proposal.artDirection !== undefined
        ? String(proposal.artDirection)
        : undefined,
    movement:
      kind === "creatures" && Array.isArray(proposal.movement)
        ? proposal.movement
        : undefined,
    skillDefinitionIds:
      kind === "creatures" && Array.isArray(proposal.skillDefinitionIds)
        ? proposal.skillDefinitionIds.filter(
            (value): value is string => typeof value === "string",
          )
        : undefined,
    professionDefinitionIds:
      kind === "creatures" && Array.isArray(proposal.professionDefinitionIds)
        ? proposal.professionDefinitionIds.filter(
            (value): value is string => typeof value === "string",
          )
        : undefined,
    progressiveMechanicsNotes:
      kind === "creatures" && proposal.progressiveMechanicsNotes !== undefined
        ? String(proposal.progressiveMechanicsNotes)
        : undefined,
    itemCategory:
      kind === "items"
        ? String(proposal.category ?? "adventuring-gear")
        : undefined,
    itemQuality:
      kind === "items" ? String(proposal.quality ?? "standard") : undefined,
    embodimentStrategy:
      kind === "creatures"
        ? policy.strategy === "one-per-realization"
          ? ("one-per-realization" as const)
          : ("one-per-instance" as const)
        : undefined,
    embodimentMaximum:
      kind === "creatures" && policy.maximumPerCampaignInstance !== undefined
        ? String(policy.maximumPerCampaignInstance)
        : "",
  };
}

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
  const { definition, draft } = useWorldAuthoring();
  const base = `/worlds/${encodeURIComponent(definition.id)}`;
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const locations = hierarchyRows(draft?.records ?? []);
  const findings = (draft?.records ?? []).filter(
    (record) =>
      (["locations", "creatures"].includes(record.resourceType) ||
        (record.resourceType === "definitions" &&
          ["creature", "item"].includes(String(recordPayload(record).kind)))) &&
      !recordDescription(record)?.trim(),
  );
  const issues = locations.filter((row) => row.issue);
  const count = findings.length + issues.length;
  const [checked, setChecked] = useState(false);
  return (
    <main className="mx-auto max-w-6xl p-4 lg:px-8 lg:py-7">
      <h1 className="text-3xl font-semibold">
        {definition.name.trim() || "Unnamed World"}
      </h1>
      <p className="mt-2 text-sm text-base-content/60">
        {draft ? "Draft" : "Published"} ·{" "}
        {draft?.revisionName || "Current version"}
      </p>
      <section className="mt-6 flex flex-col gap-6 rounded-box border border-base-300 bg-base-200 p-5 sm:flex-row">
        <img
          src="/wireframes/world-map.svg"
          alt=""
          className="h-32 w-auto max-w-full shrink-0 self-center opacity-60 invert sm:max-w-52"
        />
        <div>
          <h2 className="text-xl font-semibold">World overview</h2>
          <p className="mt-3 text-sm leading-6 text-base-content/70">
            {definition.description?.trim() ||
              "Add locations, creatures, and items to bring this World to life."}
          </p>
        </div>
      </section>
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
        <section className="rounded-box border border-base-300 bg-base-200 p-5">
          <h2 className="text-xl font-semibold">Domain health</h2>
          <p className="mt-4 font-semibold">
            {count ? "Needs attention" : "No authoring gaps found"}
          </p>
          <p className="mt-3 text-2xl font-semibold">
            {count} {count === 1 ? "finding" : "findings"}
          </p>
          <p className="mt-3 text-sm">
            {findings.length} missing descriptions
            <br />
            {issues.length} location hierarchy issues
          </p>
          <Button
            className="mt-5 min-h-11 w-full"
            tone="outline"
            onClick={() => setChecked(true)}
          >
            Review findings
          </Button>
          <p className="mt-3 text-xs text-base-content/60">
            {checked
              ? "Checked against the current working draft."
              : "Checks descriptions and the location hierarchy. Publication validates the complete revision."}
          </p>
        </section>
        <section className="rounded-box border border-base-300 bg-base-200 p-5">
          <h2 className="text-xl font-semibold">Recommended next steps</h2>
          <p className="mt-2 text-sm text-base-content/60">
            For {definition.name} · continue authoring
          </p>
          <nav
            aria-label="World authoring destinations"
            className="mt-5 grid gap-4"
          >
            {(checked ? findings : findings.slice(0, 3)).map((record) => (
              <InternalLink
                key={record.sourceId}
                className="link min-h-11 text-sm"
                href={`${base}/${record.resourceType === "locations" ? "atlas/locations" : record.resourceType === "creatures" || recordPayload(record).kind === "creature" ? "bestiary/creatures" : "item-compendium/items"}/${encodeURIComponent(record.sourceId)}${guideSuffix}`}
              >
                Describe {visibleRecordName(record, "this record")} →
              </InternalLink>
            ))}
            {checked &&
              issues.map((row) => (
                <p key={row.record.sourceId} className="text-sm text-warning">
                  {row.name}: {row.issue}
                </p>
              ))}
            <InternalLink
              className="link min-h-11 text-sm"
              href={`${base}/atlas${guideSuffix}`}
            >
              Browse Locations →
            </InternalLink>
            <InternalLink
              className="link min-h-11 text-sm"
              href={`${base}/bestiary${guideSuffix}`}
            >
              Open Bestiary →
            </InternalLink>
            <InternalLink
              className="link min-h-11 text-sm"
              href={`${base}/item-compendium${guideSuffix}`}
            >
              Browse Items →
            </InternalLink>
            <InternalLink
              className="link min-h-11 text-sm"
              href={`${base}/characters${guideSuffix}`}
            >
              Character definitions →
            </InternalLink>
          </nav>
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
  const locations = recordsForLibrary(draft?.records ?? [], "locations");
  const root = locations.find(
    (record) => record.sourceId === draft?.content.rootLocationId,
  );
  const [scope, setScope] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [showPath, setShowPath] = useState(false);
  const current = locations.find((record) => record.sourceId === scope) ?? root;
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const base = `/worlds/${encodeURIComponent(definition.id)}/atlas/locations`;
  const visible = locations.filter((record) =>
    query.trim()
      ? `${visibleRecordName(record, "")} ${visibleRecordDescription(record) ?? ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
      : record.sourceId !== current?.sourceId &&
        locationParentId(record) === current?.sourceId,
  );
  const ancestors: WorldDraftRecord[] = [];
  let ancestor = current;
  while (
    ancestor &&
    !ancestors.some((record) => record.sourceId === ancestor?.sourceId)
  ) {
    ancestors.unshift(ancestor);
    const parent = locationParentId(ancestor);
    ancestor = locations.find((record) => record.sourceId === parent);
  }
  return (
    <LibraryPage
      eyebrow="Locations"
      title={current ? visibleRecordName(current, "World map") : "World map"}
      description={
        current
          ? (visibleRecordDescription(current) ?? "Browse contained locations.")
          : "Browse the places in this World."
      }
      createHref={`${base}/new${current ? `?parentLocationId=${encodeURIComponent(current.sourceId)}` : ""}`}
    >
      <DraftRequired>
        <div className="mt-5 flex flex-wrap gap-2">
          {current && (
            <RouterButtonLink
              className="min-h-11"
              tone="outline"
              href={`${base}/${encodeURIComponent(current.sourceId)}${guideSuffix}`}
            >
              Edit current location
            </RouterButtonLink>
          )}
          <Button
            tone="outline"
            className="min-h-11"
            onClick={() => {
              setScope(undefined);
              setQuery("");
            }}
          >
            World map
          </Button>
          <Button
            tone="outline"
            className="min-h-11"
            aria-expanded={showPath}
            onClick={() => setShowPath(!showPath)}
          >
            Full location path
          </Button>
        </div>
        {showPath && (
          <nav aria-label="Location path" className="mt-3 flex flex-wrap gap-2">
            {ancestors.map((record) => (
              <Button
                key={record.sourceId}
                tone="ghost"
                className="min-h-11"
                onClick={() => {
                  setScope(record.sourceId);
                  setQuery("");
                }}
              >
                {visibleRecordName(record, "Location")}
              </Button>
            ))}
          </nav>
        )}
        <Field label="Search all locations" className="mt-5">
          <Input
            type="search"
            className="min-h-11 w-full"
            placeholder="Search all locations…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <p className="mt-4 text-sm font-semibold">
          {visible.length} {query ? "matching" : "contained"} locations
        </p>
        {visible.length ? (
          <ul className="mt-4 space-y-4">
            {visible.map((record) => (
              <li
                key={record.sourceId}
                className="rounded-box border border-base-300 bg-base-200 p-4"
              >
                <h2 className="font-semibold">
                  {visibleRecordName(record, "Unnamed Location")}
                </h2>
                <p className="mt-1 text-sm text-base-content/65">
                  {visibleRecordDescription(record) || "No description yet."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    tone="outline"
                    className="min-h-11"
                    onClick={() => {
                      setScope(record.sourceId);
                      setQuery("");
                    }}
                  >
                    Browse places
                  </Button>
                  <RouterButtonLink
                    tone="outline"
                    className="min-h-11"
                    href={`${base}/${encodeURIComponent(record.sourceId)}${guideSuffix}`}
                  >
                    Edit location
                  </RouterButtonLink>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            label={
              query ? "No matching locations" : "No contained locations yet"
            }
          />
        )}
      </DraftRequired>
    </LibraryPage>
  );
}

export function BestiaryPage() {
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const { definition, draft } = useWorldAuthoring();
  const [query, setQuery] = useState("");
  const creatures = recordsForLibrary(draft?.records ?? [], "creatures").filter(
    (record) =>
      `${visibleRecordName(record, "")} ${visibleRecordDescription(record) ?? ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <LibraryPage
      eyebrow="Bestiary"
      title="Bestiary"
      description="Creatures in this World"
      createHref={`/worlds/${encodeURIComponent(definition.id)}/bestiary/creatures/new`}
    >
      <DraftRequired>
        <RouterButtonLink
          className="min-h-11"
          href={`/worlds/${encodeURIComponent(definition.id)}/bestiary/catalog-monsters${guideSuffix}`}
        >
          Catalog creatures
        </RouterButtonLink>
        <Field label="Search creatures" className="mt-5">
          <Input
            type="search"
            placeholder="Search by name or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 w-full"
          />
        </Field>
        <p className="mt-4 text-sm text-base-content/60">
          {creatures.length} creatures
        </p>
        {creatures.length ? (
          <CardGrid
            records={creatures}
            list
            showImages
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
  const [category, setCategory] = useState("");
  const [quality, setQuality] = useState("");
  const [rarity, setRarity] = useState("");
  const allItems = recordsForLibrary(draft?.records ?? [], "items");
  const facets = (record: WorldDraftRecord) => {
    const payload = recordPayload(record);
    const components = objectValue(payload.components);
    return {
      category: String(components.category ?? payload.category ?? ""),
      quality: String(components.quality ?? payload.quality ?? ""),
      rarity: String(components.rarity ?? payload.rarity ?? ""),
    };
  };
  const options = (key: "category" | "quality" | "rarity") =>
    [
      ...new Set(allItems.map((record) => facets(record)[key]).filter(Boolean)),
    ].sort();
  const items = allItems.filter((record) => {
    const values = facets(record);
    return (
      `${visibleRecordName(record, "")} ${visibleRecordDescription(record) ?? ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (!category || values.category === category) &&
      (!quality || values.quality === quality) &&
      (!rarity || values.rarity === rarity)
    );
  });
  return (
    <LibraryPage
      eyebrow="Item Compendium"
      title="Items"
      description="Item templates and artifacts in this World"
      createHref={`/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/new`}
    >
      <ShellTools>
        <div className="mt-6 grid gap-4">
          <Field label="Type">
            <Select
              className="w-full min-h-11"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All types</option>
              {options("category").map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("-", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quality">
            <Select
              className="w-full min-h-11"
              value={quality}
              onChange={(event) => setQuality(event.target.value)}
            >
              <option value="">All qualities</option>
              {options("quality").map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("-", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rarity">
            <Select
              className="w-full min-h-11"
              value={rarity}
              onChange={(event) => setRarity(event.target.value)}
            >
              <option value="">All rarities</option>
              {options("rarity").map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("-", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            tone="outline"
            className="min-h-11"
            onClick={() => {
              setCategory("");
              setQuality("");
              setRarity("");
            }}
          >
            Clear filters
          </Button>
        </div>
      </ShellTools>
      <DraftRequired>
        <Field label="Search Items" className="mt-6">
          <Input
            type="search"
            placeholder="Search by name or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 w-full"
          />
        </Field>
        <p className="mt-4 text-sm text-base-content/60">
          {items.length} items
        </p>
        {items.length ? (
          <CardGrid
            records={items}
            showImages
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
  createLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  createHref: string;
  createLabel?: string;
  children: ReactNode;
}) {
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const { canEdit, draft } = useWorldAuthoring();
  return (
    <main className="mx-auto max-w-6xl p-4 lg:px-8 lg:py-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 max-w-2xl text-base-content/60">{description}</p>
        </div>
        {canEdit && draft ? (
          <RouterButtonLink
            href={`${createHref}${createHref.includes("?") ? guideSuffix.replace(/^\?/, "&") : guideSuffix}`}
            tone="primary"
          >
            + Add{" "}
            {createLabel ??
              (eyebrow === "Bestiary"
                ? "creature"
                : eyebrow === "Item Compendium"
                  ? "item"
                  : "location")}
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
  showImages = false,
  list = false,
}: {
  records: WorldDraftRecord[];
  href: (record: WorldDraftRecord) => string;
  showImages?: boolean;
  list?: boolean;
}) {
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  return (
    <div className={`mt-6 grid gap-4 ${list ? "" : "md:grid-cols-2"}`}>
      {records.map((record) => (
        <InternalLink
          key={`${record.resourceType}:${record.sourceId}`}
          href={`${href(record)}${guideSuffix}`}
          className="flex min-h-24 items-center gap-3 rounded-box border border-base-300 bg-base-200 p-3"
        >
          {showImages && (
            <RecordThumbnail
              payload={recordPayload(record)}
              name={visibleRecordName(record, "Unnamed record")}
              className="w-16 shrink-0"
            />
          )}
          <div className="min-w-0">
            <h2 className="font-semibold">
              {visibleRecordName(record, "Unnamed record")}
            </h2>
            <p className="line-clamp-2 text-sm text-base-content/55">
              {visibleRecordDescription(record) ?? "No description yet."}
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
  const [editorSection, setEditorSection] = useState("Overview");
  const editorSections =
    kind === "creatures"
      ? [
          "Overview",
          "Attributes",
          "Abilities",
          "Movement",
          "Equipment",
          "Artwork",
        ]
      : ["Overview", "Equipment", "Artwork"];
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate();
  const libraryHref = `/worlds/${encodeURIComponent(definition.id)}/${kind === "locations" ? "atlas" : kind === "creatures" ? "bestiary" : "item-compendium"}`;
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const existing = recordsForLibrary(draft?.records ?? [], kind).find(
    (record) => record.sourceId === sourceId,
  );
  const initial = recordPayload(
    existing ?? { resourceType: kind, sourceId: "new", payload: {} },
  );
  const initialIdentity = objectValue(initial.identity);
  const initialComponents = objectValue(initial.components);
  const initialEquippable = objectValue(initialComponents.equippable);
  const initialModelValues = objectValue(initial.modelValues);
  const [itemArtwork, setItemArtwork] = useState<Record<string, JsonValue>>();
  const [creatureArtwork, setCreatureArtwork] = useState<
    Record<string, JsonValue>
  >({});
  const [artworkBusy, setArtworkBusy] = useState(false);
  const initialImage = itemArtwork ?? objectValue(initial.image);
  const models = draft?.effectiveModels;
  const [name, setName] = useState(
    String(initialIdentity.name ?? initial.name ?? ""),
  );
  const [description, setDescription] = useState(
    String(initialIdentity.description ?? initial.description ?? ""),
  );
  const [subtype, setSubtype] = useState(
    String(
      kind === "items"
        ? (initialModelValues["aow:item-family"] ??
            initial.itemFamilyKey ??
            models?.itemFamilies.find(
              (family) =>
                family.key ===
                adoptedLegacyModelKey(
                  String(initialComponents.category ?? initial.category ?? ""),
                  "item-family",
                  models.itemFamilies,
                ),
            )?.key ??
            models?.itemFamilies[0]?.key ??
            "")
        : (initial.kind ?? (kind === "locations" ? "region" : "creature")),
    ),
  );
  const windowSearch = useLocation().searchStr;
  const initialPlacement = objectValue(initial.placement);
  const initialProfile = objectValue(initial.profile);
  const initialMapScene = objectValue(initial.mapScene);
  const [parentId, setParentId] = useState(
    String(
      initialPlacement.parentLocationId ??
        (kind === "locations"
          ? (new URLSearchParams(windowSearch).get("parentLocationId") ??
            draft?.content.rootLocationId ??
            "")
          : ""),
    ),
  );
  const [profileSummary, setProfileSummary] = useState(
    String(initialProfile.summary ?? ""),
  );
  const [profileTags, setProfileTags] = useState(
    Array.isArray(initialProfile.tags)
      ? initialProfile.tags
          .filter((value): value is string => typeof value === "string")
          .join(", ")
      : "",
  );
  const [mapSceneNotes, setMapSceneNotes] = useState(
    String(initialMapScene.notes ?? ""),
  );
  const [mapOrientation, setMapOrientation] = useState(
    String(initialMapScene.orientation ?? ""),
  );
  const [attributes, setAttributes] = useState<Record<string, number>>(() =>
    creatureAttributesForEditor(initial, models?.attributes ?? []),
  );
  const [slotSets, setSlotSets] = useState<string[][]>(() => {
    const canonicalSlots =
      kind === "items"
        ? initialEquippable.compatibleSlotSets
        : initialComponents.equipmentSlots;
    const candidates = Array.isArray(canonicalSlots)
      ? canonicalSlots.map((entry) => (Array.isArray(entry) ? entry : [entry]))
      : Array.isArray(initial.equipmentSlots)
        ? initial.equipmentSlots.map((entry) => [entry])
        : Array.isArray(initial.compatibleEquipmentSlots)
          ? initial.compatibleEquipmentSlots.map((entry) => [entry])
          : [];
    return candidates
      .map((entry) =>
        entry
          .filter((value): value is string => typeof value === "string")
          .map((value) =>
            kind === "items"
              ? adoptedLegacyModelKey(
                  value,
                  "equipment-slot",
                  models?.equipmentSlots ?? [],
                )
              : value,
          ),
      )
      .filter((entry) => entry.length > 0);
  });
  const slots = [...new Set(slotSets.flat())];
  const initialArt = objectValue(initialComponents.art);
  const initialMechanics = objectValue(initialComponents.progressiveMechanics);
  const initialMovements = Array.isArray(initialComponents.movement)
    ? initialComponents.movement
    : [];
  const preservedPrimaryMovement = objectValue(initialMovements[0]);
  const preservedAdditionalMovements = initialMovements.slice(1);
  const [artDirection, setArtDirection] = useState(
    String(initialArt.direction ?? ""),
  );
  const [movementMode, setMovementMode] = useState(() => {
    const movement = initialMovements[0];
    return String(objectValue(movement).mode ?? "walk");
  });
  const [movementDistance, setMovementDistance] = useState(() => {
    const movement = initialMovements[0];
    return String(objectValue(objectValue(movement).distance).value ?? "");
  });
  const [movementUnit, setMovementUnit] = useState(() => {
    const movement = initialMovements[0];
    return String(objectValue(objectValue(movement).distance).unit ?? "foot");
  });
  const [skillDefinitionIds, setSkillDefinitionIds] = useState<string[]>(() =>
    Array.isArray(initialComponents.skillDefinitionIds)
      ? initialComponents.skillDefinitionIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const [professionDefinitionIds, setProfessionDefinitionIds] = useState<
    string[]
  >(() =>
    Array.isArray(initialComponents.professionDefinitionIds)
      ? initialComponents.professionDefinitionIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const [progressiveMechanicsNotes, setProgressiveMechanicsNotes] = useState(
    String(initialMechanics.notes ?? ""),
  );
  const [itemCategory, setItemCategory] = useState(
    String(
      initialComponents.category ?? initial.category ?? "adventuring-gear",
    ),
  );
  const [itemQuality, setItemQuality] = useState(
    String(initialComponents.quality ?? initial.quality ?? "standard"),
  );
  const [itemStorageEdits, setItemStorageEdits] = useState<ItemStorageEdits>(
    {},
  );
  const [itemImageFile, setItemImageFile] = useState<File>();
  const [itemImageAltText, setItemImageAltText] = useState(
    String(initialImage.altText ?? ""),
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
  const [saveError, setSaveError] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");
  const [aiDirection, setAiDirection] = useState("");
  const [proposalPending, setProposalPending] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const [proposalReady, setProposalReady] = useState(false);
  const [proposalStorageRevision, setProposalStorageRevision] =
    useState<number>();
  const conformance =
    draft && kind !== "locations"
      ? definitionConformance(draft, kind === "creatures" ? "creature" : "item")
      : undefined;
  const snapshotFields = {
    name,
    description,
    subtype,
    parentId,
    attributes,
    slotSets,
    profileSummary,
    profileTags,
    mapSceneNotes,
    mapOrientation,
    artDirection,
    movementMode,
    movementDistance,
    movementUnit,
    skillDefinitionIds,
    professionDefinitionIds,
    progressiveMechanicsNotes,
    itemCategory,
    itemQuality,
    itemStorageEdits,
    itemImageFileName: itemImageFile?.name ?? "",
    itemArtwork,
    creatureArtwork,
    itemImageAltText,
    embodimentStrategy,
    embodimentMaximum,
  };
  const snapshot = JSON.stringify(snapshotFields);
  const editorSave = useEditorSave(snapshot);
  const { dirty } = editorSave;
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
      editorSave.hasChanges() &&
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
    if (!draft || !name.trim() || artworkBusy) return;
    setSaveError("");
    if (kind !== "locations" && !conformance) return;
    let saved;
    let uploadedItemImageAssetId: string | undefined;
    try {
      saved =
        kind === "locations"
          ? await saveWorldLocation(
              definition.id,
              {
                expectedStorageRevision: worldDraftMutationRevision(
                  draft.storageRevision,
                  proposalReady,
                  proposalStorageRevision,
                ),
                name: name.trim(),
                ...(description.trim()
                  ? { description: description.trim() }
                  : {}),
                kind: subtype,
                ...(parentId ? { parentLocationId: parentId as never } : {}),
                profileSummary,
                profileTags: profileTags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
                mapSceneNotes,
                ...(mapOrientation
                  ? {
                      mapOrientation: mapOrientation as
                        "scenic" | "overhead" | "side-on" | "isometric",
                    }
                  : {}),
              },
              existing?.sourceId,
            )
          : kind === "creatures"
            ? await (async () => {
                const input = {
                  expectedStorageRevision: worldDraftMutationRevision(
                    draft.storageRevision,
                    proposalReady,
                    proposalStorageRevision,
                  ),
                  name: name.trim(),
                  ...(description.trim()
                    ? { description: description.trim() }
                    : {}),
                  attributes: attributes as never,
                  equipmentSlots: slots as never,
                  artDirection,
                  ...(Object.keys(creatureArtwork).length
                    ? { images: creatureArtwork as never }
                    : {}),
                  movement: movementDistance
                    ? [
                        {
                          ...preservedPrimaryMovement,
                          mode: movementMode,
                          distance: {
                            ...objectValue(preservedPrimaryMovement.distance),
                            value: Number(movementDistance),
                            unit: movementUnit as never,
                          },
                        },
                        ...preservedAdditionalMovements,
                      ]
                    : preservedAdditionalMovements,
                  skillDefinitionIds: skillDefinitionIds as never,
                  professionDefinitionIds: professionDefinitionIds as never,
                  progressiveMechanicsNotes,
                  instanceEmbodimentPolicy: creatureEmbodimentPolicyForSave(
                    initial.instanceEmbodimentPolicy,
                    embodimentStrategy,
                    embodimentMaximum,
                  ) as never,
                };
                return existing?.resourceType === "creatures"
                  ? upgradeLegacyWorldCreature(
                      definition.id,
                      existing.sourceId,
                      input,
                    )
                  : saveWorldCreature(definition.id, input, existing?.sourceId);
              })()
            : await (async () => {
                const image = itemImageFile
                  ? await (async () => {
                      const dimensions = await imageDimensions(itemImageFile);
                      const dimensionIssue = squareItemImageIssue(
                        dimensions.width,
                        dimensions.height,
                      );
                      if (dimensionIssue)
                        throw new ItemImageSelectionError(dimensionIssue);
                      const asset = await uploadWorldMedia(
                        definition.id,
                        itemImageFile,
                        "item-image",
                        ["item"],
                      );
                      uploadedItemImageAssetId = asset.id;
                      return {
                        assetId: asset.id as never,
                        altText: itemImageAltText.trim(),
                        width: dimensions.width,
                        height: dimensions.height,
                        mimeType: asset.mimeType as `image/${string}`,
                      };
                    })()
                  : ({
                      ...initialImage,
                      altText: itemImageAltText.trim(),
                    } as never);
                return saveWorldItem(
                  definition.id,
                  {
                    expectedStorageRevision: worldDraftMutationRevision(
                      draft.storageRevision,
                      proposalReady,
                      proposalStorageRevision,
                    ),
                    name: name.trim(),
                    ...(description.trim()
                      ? { description: description.trim() }
                      : {}),
                    itemFamilyKey: subtype as never,
                    category: itemCategory,
                    quality: itemQuality as
                      "ramshackle" | "standard" | "fine" | "exquisite",
                    compatibleEquipmentSlotSets: slotSets as never,
                    ...(itemStorageEdits as Partial<
                      import("@aow/common").CreateWorldItemDraftRequest
                    >),
                    image,
                  },
                  existing?.sourceId,
                );
              })();
    } catch (error) {
      if (uploadedItemImageAssetId) {
        await deleteMedia(uploadedItemImageAssetId).catch(() => undefined);
      }
      setSaveError(
        error instanceof ItemImageSelectionError
          ? error.message
          : error instanceof ApiRequestError && error.status === 409
            ? "This World draft changed elsewhere. Reload before saving."
            : "This record could not be saved. No World draft changes were accepted.",
      );
      return;
    }
    adoptDraft({
      ...saved,
      status: "current",
      effectiveModels: draft.effectiveModels,
    });
    editorSave.markSaved(savedWorldRecordEditorSnapshot(snapshotFields, kind));
    setSaved(true);
    if (kind === "items") setItemImageFile(undefined);
    if (!existing) {
      const created = saved.records.find(
        (record) =>
          record.resourceType ===
            (kind === "locations" ? "locations" : "definitions") &&
          !draft.records.some(
            (prior) =>
              prior.resourceType === record.resourceType &&
              prior.sourceId === record.sourceId,
          ),
      );
      if (created) {
        allowSavedNavigation.current = true;
        const library =
          kind === "locations"
            ? "atlas/locations"
            : kind === "creatures"
              ? "bestiary/creatures"
              : "item-compendium/items";
        try {
          await navigate(
            `/worlds/${encodeURIComponent(definition.id)}/${library}/${encodeURIComponent(created.sourceId)}${guideSuffix}`,
            { replace: true },
          );
        } finally {
          allowSavedNavigation.current = false;
        }
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
  const characterDefinitions = (draft?.records ?? []).filter(
    (record) => record.resourceType === "definitions",
  );
  const skillOptions = characterDefinitions.filter(
    (record) => recordPayload(record).kind === "skill",
  );
  const professionOptions = characterDefinitions.filter(
    (record) => recordPayload(record).kind === "profession",
  );
  const proposalDisabledReason = !aiDirection.trim()
    ? "Describe what you want before preparing a proposal."
    : needsParent && !parentId
      ? "Choose the parent Location before preparing a proposal."
      : kind !== "locations" && !conformance
        ? `Select a complete ${kind === "creatures" ? "Creature" : "Item"} Model release before preparing a proposal.`
        : undefined;
  const proposalIsStale =
    proposalReady && proposalStorageRevision !== draft?.storageRevision;
  async function requestProposal() {
    if (!draft || !aiDirection.trim() || (needsParent && !parentId)) return;
    setProposalPending(true);
    setProposalError("");
    setProposalReady(false);
    try {
      const result = await proposeWorldDraftRecord(
        definition.id,
        kind === "locations"
          ? "location"
          : kind === "creatures"
            ? "creature"
            : "item",
        {
          expectedStorageRevision: draft.storageRevision,
          direction: aiDirection.trim(),
          ...(kind === "locations" && parentId
            ? { parentLocationId: parentId }
            : {}),
        },
        crypto.randomUUID(),
      );
      const proposal = result.proposal;
      const fields = editorFieldsFromProposal(kind, proposal);
      setName(fields.name);
      setDescription(fields.description);
      if (fields.subtype !== undefined) setSubtype(fields.subtype);
      if (kind === "locations") {
        if (fields.profileSummary !== undefined)
          setProfileSummary(fields.profileSummary);
        if (fields.profileTags !== undefined)
          setProfileTags(fields.profileTags.join(", "));
        if (fields.mapSceneNotes !== undefined)
          setMapSceneNotes(fields.mapSceneNotes);
        if (fields.mapOrientation !== undefined)
          setMapOrientation(fields.mapOrientation);
      }
      if (kind === "creatures") {
        setAttributes(fields.attributes ?? {});
        setSlotSets(fields.slotSets ?? []);
        setEmbodimentStrategy(fields.embodimentStrategy ?? "one-per-instance");
        setEmbodimentMaximum(fields.embodimentMaximum);
        if (fields.artDirection !== undefined)
          setArtDirection(fields.artDirection);
        if (fields.movement !== undefined) {
          const movement = objectValue(fields.movement[0]);
          const distance = objectValue(movement.distance);
          setMovementMode(String(movement.mode ?? "walk"));
          setMovementDistance(
            distance.value === undefined ? "" : String(distance.value),
          );
          setMovementUnit(String(distance.unit ?? "foot"));
        }
        if (fields.skillDefinitionIds !== undefined)
          setSkillDefinitionIds(fields.skillDefinitionIds);
        if (fields.professionDefinitionIds !== undefined)
          setProfessionDefinitionIds(fields.professionDefinitionIds);
        if (fields.progressiveMechanicsNotes !== undefined)
          setProgressiveMechanicsNotes(fields.progressiveMechanicsNotes);
      }
      if (kind === "items") {
        setItemCategory(fields.itemCategory ?? "adventuring-gear");
        setItemQuality(fields.itemQuality ?? "standard");
        setSlotSets(fields.slotSets ?? []);
      }
      setProposalStorageRevision(proposal.expectedStorageRevision);
      setProposalReady(true);
    } catch (error) {
      setProposalError(
        error instanceof ApiRequestError && error.status === 409
          ? "This World draft changed elsewhere. Reload before requesting another proposal."
          : "No proposal could be prepared. Your working draft was not changed.",
      );
    } finally {
      setProposalPending(false);
    }
  }
  if (requestedDraftRecordMissing(Boolean(draft), sourceId, existing)) {
    const library =
      kind === "locations"
        ? "atlas/locations"
        : kind === "creatures"
          ? "bestiary/creatures"
          : "item-compendium/items";
    return (
      <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
        <h1 className="text-4xl font-semibold">Record not found</h1>
        <Alert tone="warning" className="mt-8">
          This{" "}
          {kind === "locations"
            ? "Location"
            : kind === "creatures"
              ? "Creature"
              : "Item"}{" "}
          is not in the current World draft. Nothing was changed.
        </Alert>
        <RouterButtonLink
          href={`/worlds/${encodeURIComponent(definition.id)}/${library}${guideSuffix}`}
          className="mt-6"
        >
          Back to{" "}
          {kind === "locations"
            ? "Atlas"
            : kind === "creatures"
              ? "Bestiary"
              : "Item Compendium"}
        </RouterButtonLink>
      </main>
    );
  }
  if (!canEdit)
    return (
      <main className="mx-auto max-w-4xl px-6 py-12 lg:px-10">
        <h1 className="text-4xl font-semibold">
          {visibleRecordName(
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
        {existing && visibleRecordDescription(existing) && (
          <p className="mt-6 text-base-content/70">
            {visibleRecordDescription(existing)}
          </p>
        )}
        {kind === "locations" && existing && (
          <WorldLocationPlacements location={existing} />
        )}
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl p-4 lg:px-8 lg:py-7">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {kind === "locations"
          ? "Atlas"
          : kind === "creatures"
            ? "Bestiary"
            : "Item Compendium"}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {existing
          ? visibleRecordName(existing, "Unnamed record")
          : `Create ${kind === "items" ? "Item" : kind === "locations" ? "Location" : "Creature"}`}
      </h1>
      {kind !== "locations" && (
        <RecordTabs
          label={`${kind === "creatures" ? "Creature" : "Item"} properties`}
          idPrefix="world-record"
          panelId="world-record-editor"
          tabs={editorSections.map((section) => ({
            id: section,
            label: section,
          }))}
          activeTab={editorSection}
          onTabChange={setEditorSection}
        />
      )}
      {kind === "items" && existing && (
        <nav aria-label="Item mechanics" className="mt-4 flex flex-wrap gap-2">
          {(["traits", "actions", "vehicle", "owner"] as const).map(
            (section) => (
              <RouterButtonLink
                key={section}
                className="min-h-11"
                href={`${libraryHref}/items/${encodeURIComponent(existing.sourceId)}/${section}${guideSuffix}`}
              >
                {section === "traits"
                  ? "Traits"
                  : section === "actions"
                    ? "Actions"
                    : section === "owner"
                      ? "Item rules"
                      : "Vehicle"}
              </RouterButtonLink>
            ),
          )}
        </nav>
      )}
      <DraftRequired>
        {!existing && (
          <AiCreationChoice
            kind={kind}
            mode={entryMode}
            direction={aiDirection}
            pending={proposalPending}
            ready={proposalReady}
            error={proposalError}
            disabled={Boolean(proposalDisabledReason)}
            disabledReason={proposalDisabledReason}
            onModeChange={(mode) => {
              setEntryMode(mode);
              if (mode === "manual") {
                setProposalReady(false);
                setProposalStorageRevision(undefined);
              }
            }}
            onDirectionChange={setAiDirection}
            onRequest={() => void requestProposal()}
          />
        )}
        <form
          id="world-record-editor"
          role={kind !== "locations" ? "tabpanel" : undefined}
          aria-labelledby={
            kind !== "locations"
              ? recordTabId("world-record", editorSection)
              : undefined
          }
          tabIndex={kind !== "locations" ? 0 : undefined}
          onInvalidCapture={(event) => {
            const input = event.target as HTMLInputElement;
            const section = input.closest<HTMLElement>("[data-editor-section]")
              ?.dataset.editorSection;
            if (section && section !== editorSection) {
              event.preventDefault();
              setEditorSection(section);
              requestAnimationFrame(() => input.focus());
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void editorSave.run(() => submit(event));
          }}
          className="mt-8 grid gap-5"
        >
          <div
            data-editor-section="Overview"
            hidden={kind !== "locations" && editorSection !== "Overview"}
            className="space-y-5"
          >
            <h2 className="text-xl font-semibold">Overview</h2>
            <AuthoringTextField
              label="Name"
              required
              value={name}
              onChange={setName}
              recordIds={
                new Set(draft?.records.map((record) => record.sourceId))
              }
            />
            <AuthoringTextField
              label="Description"
              multiline
              value={description}
              onChange={setDescription}
              recordIds={
                new Set(draft?.records.map((record) => record.sourceId))
              }
            />
            {proposalPending && (
              <Alert aria-live="polite">
                Proposal context is locked until the request finishes.
              </Alert>
            )}
            {proposalIsStale && (
              <Alert tone="warning" aria-live="polite">
                This proposal belongs to an earlier working-draft revision.
                Prepare a new proposal before applying it.
              </Alert>
            )}
            {kind === "locations" && (
              <Disclosure summary="Location profile" className="p-4">
                <div className="mt-4 grid gap-5">
                  <Field label="Profile summary">
                    <Textarea
                      value={profileSummary}
                      onChange={(event) =>
                        setProfileSummary(event.target.value)
                      }
                      rows={3}
                      className="mt-2 w-full"
                    />
                  </Field>
                  <Field
                    label="Discovery tags"
                    help="Separate tags with commas."
                  >
                    <Input
                      value={profileTags}
                      onChange={(event) => setProfileTags(event.target.value)}
                      className="mt-2 w-full"
                    />
                  </Field>
                  {existing && (
                    <InternalLink
                      className="link"
                      href={`/worlds/${encodeURIComponent(definition.id)}/atlas/locations/${encodeURIComponent(existing.sourceId)}/map${guideSuffix}`}
                    >
                      Edit Map &amp; scene
                    </InternalLink>
                  )}
                </div>
              </Disclosure>
            )}
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
            {kind === "items" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Category" required>
                  <Input
                    required
                    value={itemCategory}
                    onChange={(event) => setItemCategory(event.target.value)}
                    className="mt-2 w-full"
                  />
                </Field>
                <Field label="Quality" required>
                  <Select
                    value={itemQuality}
                    onChange={(event) => setItemQuality(event.target.value)}
                    className="mt-2 w-full"
                  >
                    <option value="ramshackle">Ramshackle</option>
                    <option value="standard">Standard</option>
                    <option value="fine">Fine</option>
                    <option value="exquisite">Exquisite</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>
          <div
            data-editor-section="Artwork"
            hidden={editorSection !== "Artwork"}
            className="space-y-5"
          >
            <h2 className="text-xl font-semibold">Artwork</h2>
            {kind === "creatures" && (
              <Field
                label="Art direction"
                help="Describe the portrait and token treatment. Existing image references are preserved."
              >
                <Textarea
                  value={artDirection}
                  onChange={(event) => setArtDirection(event.target.value)}
                  rows={3}
                  className="mt-2 w-full"
                />
              </Field>
            )}

            {kind === "items" && Boolean(initialImage.assetId) && (
              <MediaImage
                image={initialImage}
                name={name || "Item image"}
                className="max-w-xs"
              />
            )}
            {kind === "items" && draft && (
              <ArtworkGenerator
                worldId={definition.id}
                storageRevision={draft.storageRevision}
                role="item"
                label="Item image"
                name={name}
                description={description}
                direction={`Category: ${itemCategory}. Quality: ${itemQuality}.`}
                hasImage={Boolean(initialImage.assetId)}
                disabled={
                  !canEdit ||
                  artworkBusy ||
                  editorSave.saving ||
                  draft.status === "stale"
                }
                onBusyChange={setArtworkBusy}
                onApply={(image) => {
                  setItemArtwork(image);
                  setItemImageFile(undefined);
                  setItemImageAltText(String(image.altText ?? ""));
                }}
              />
            )}
            {kind === "items" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label={initialImage.assetId ? "Replace image" : "Image"}
                  required={!initialImage.assetId}
                  help="Item Definitions require a square catalog image."
                >
                  <Input
                    type="file"
                    accept="image/*"
                    required={!initialImage.assetId}
                    onChange={(event) => {
                      setItemImageFile(event.target.files?.[0]);
                      setItemArtwork(undefined);
                    }}
                    className="mt-2 w-full"
                  />
                </Field>
                <Field label="Image description" required>
                  <Input
                    required
                    value={itemImageAltText}
                    onChange={(event) =>
                      setItemImageAltText(event.target.value)
                    }
                    className="mt-2 w-full"
                  />
                </Field>
              </div>
            )}
            {kind === "creatures" && (
              <CreatureArtwork
                compact
                payload={{
                  ...initial,
                  components: {
                    ...initialComponents,
                    art: {
                      ...initialArt,
                      images: {
                        ...objectValue(initial.images),
                        ...objectValue(initialArt.images),
                        ...creatureArtwork,
                      },
                    },
                  },
                }}
                name={name || "Creature"}
                renderControls={(role, label, hasImage) =>
                  draft && (
                    <ArtworkGenerator
                      worldId={definition.id}
                      storageRevision={draft.storageRevision}
                      role={role}
                      label={label}
                      name={name}
                      description={description}
                      direction={artDirection}
                      hasImage={hasImage}
                      disabled={
                        !canEdit ||
                        artworkBusy ||
                        editorSave.saving ||
                        draft.status === "stale"
                      }
                      onBusyChange={setArtworkBusy}
                      onApply={(image) =>
                        setCreatureArtwork((current) => ({
                          ...current,
                          [role]: image,
                        }))
                      }
                    />
                  )
                }
              />
            )}
          </div>
          <div
            data-editor-section="Overview"
            hidden={editorSection !== "Overview"}
            className="space-y-5"
          >
            {kind === "creatures" && (
              <Alert>
                Creature type selection isn’t available yet. You can still edit
                and save this creature.
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
          </div>
          {kind === "creatures" && (
            <div>
              <div
                data-editor-section="Movement"
                hidden={editorSection !== "Movement"}
                className="space-y-5"
              >
                <h2 className="text-xl font-semibold">Movement</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Movement mode">
                    <Input
                      value={movementMode}
                      onChange={(event) => setMovementMode(event.target.value)}
                      className="mt-2 w-full"
                    />
                  </Field>
                  <Field label="Distance">
                    <Input
                      type="number"
                      min="0"
                      value={movementDistance}
                      onChange={(event) =>
                        setMovementDistance(event.target.value)
                      }
                      className="mt-2 w-full"
                    />
                  </Field>
                  <Field label="Unit">
                    <Input
                      value={movementUnit}
                      onChange={(event) => setMovementUnit(event.target.value)}
                      className="mt-2 w-full"
                    />
                  </Field>
                </div>
              </div>
              <div
                data-editor-section="Abilities"
                hidden={editorSection !== "Abilities"}
                className="space-y-5"
              >
                <h2 className="text-xl font-semibold">Abilities</h2>
                <Fieldset>
                  <Legend className="font-semibold">Skills</Legend>
                  {skillOptions.length ? (
                    skillOptions.map((record) => (
                      <Checkbox
                        key={record.sourceId}
                        label={visibleRecordName(record, "Unnamed Skill")}
                        checked={skillDefinitionIds.includes(record.sourceId)}
                        onChange={(event) =>
                          setSkillDefinitionIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, record.sourceId])]
                              : current.filter((id) => id !== record.sourceId),
                          )
                        }
                        wrapperClassName="min-h-11 items-center gap-3"
                      />
                    ))
                  ) : (
                    <p className="text-sm text-base-content/55">
                      No Skills have been authored yet.
                    </p>
                  )}
                </Fieldset>
                <Fieldset>
                  <Legend className="font-semibold">Professions</Legend>
                  {professionOptions.length ? (
                    professionOptions.map((record) => (
                      <Checkbox
                        key={record.sourceId}
                        label={visibleRecordName(record, "Unnamed Profession")}
                        checked={professionDefinitionIds.includes(
                          record.sourceId,
                        )}
                        onChange={(event) =>
                          setProfessionDefinitionIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, record.sourceId])]
                              : current.filter((id) => id !== record.sourceId),
                          )
                        }
                        wrapperClassName="min-h-11 items-center gap-3"
                      />
                    ))
                  ) : (
                    <p className="text-sm text-base-content/55">
                      No Professions have been authored yet.
                    </p>
                  )}
                </Fieldset>
                <Field label="Progressive mechanics notes">
                  <Textarea
                    value={progressiveMechanicsNotes}
                    onChange={(event) =>
                      setProgressiveMechanicsNotes(event.target.value)
                    }
                    rows={3}
                    className="mt-2 w-full"
                  />
                </Field>
              </div>
            </div>
          )}
          {kind !== "locations" && !conformance && (
            <Alert tone="warning">
              The effective {kind === "creatures" ? "Creature" : "Item"} concept
              is unavailable. Select a complete Model release before saving this
              Definition.
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
                disabled={proposalPending}
                onChange={(event) => setParentId(event.target.value)}
                className="mt-2 w-full"
              >
                <option value="" disabled>
                  Choose a parent Location
                </option>
                {locations.map((location) => (
                  <option key={location.sourceId} value={location.sourceId}>
                    {visibleRecordName(location, "Unnamed Location")}
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
          <div
            data-editor-section="Attributes"
            hidden={editorSection !== "Attributes"}
          >
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
          </div>
          <div
            data-editor-section="Equipment"
            hidden={editorSection !== "Equipment"}
          >
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
                          setSlotSets((current) => {
                            const compound = current.filter(
                              (set) => set.length > 1,
                            );
                            const singleton = current.filter(
                              (set) => set.length === 1 && set[0] !== slot.key,
                            );
                            return event.target.checked
                              ? [...compound, ...singleton, [slot.key]]
                              : [...compound, ...singleton];
                          })
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
          </div>
          {kind === "items" && editorSection === "Equipment" && (
            <ItemStorageFields
              initial={initialComponents}
              edits={itemStorageEdits}
              onChange={setItemStorageEdits}
            />
          )}
          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-base-300 bg-base-100 py-4">
            {kind === "items" &&
              editorSection !== "Artwork" &&
              (!itemImageAltText.trim() ||
                (!initialImage.assetId && !itemImageFile)) && (
                <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <p>Add the required item image and description in Artwork.</p>
                  <Button
                    tone="outline"
                    className="min-h-11"
                    onClick={() => setEditorSection("Artwork")}
                  >
                    Open Artwork
                  </Button>
                </div>
              )}
            <Button
              type="submit"
              tone="primary"
              disabled={
                editorSave.saving ||
                artworkBusy ||
                !draft ||
                draft.status === "stale" ||
                proposalPending ||
                proposalIsStale ||
                (needsParent && !parentId) ||
                (kind !== "locations" && !conformance) ||
                (kind === "items" &&
                  (!subtype ||
                    !itemImageAltText.trim() ||
                    (!initialImage.assetId && !itemImageFile))) ||
                (kind === "creatures" && !embodimentStrategy)
              }
            >
              {kind === "creatures" && existing?.resourceType === "creatures"
                ? "Upgrade legacy Creature"
                : proposalReady
                  ? "Apply to working draft"
                  : existing
                    ? "Save changes"
                    : "Create in working draft"}
            </Button>
            <RouterButtonLink
              href={`${libraryHref}${guideSuffix}`}
              tone="ghost"
              className="min-h-11"
            >
              Cancel
            </RouterButtonLink>
            {saved && (
              <span aria-live="polite" className="text-sm text-success">
                Draft record saved.
              </span>
            )}
          </div>
          {saveError && (
            <Alert tone="error" aria-live="polite">
              {saveError}
            </Alert>
          )}
        </form>
      </DraftRequired>
      {existing && (
        <WorldRecordRemoval
          record={existing}
          path={
            kind === "locations"
              ? "atlas/locations"
              : kind === "creatures"
                ? "bestiary/creatures"
                : "item-compendium/items"
          }
          returnPath={libraryHref}
          disabled={editorSave.dirty || editorSave.saving || artworkBusy}
        />
      )}
      {kind === "locations" && existing && (
        <WorldLocationPlacements location={existing} />
      )}
    </main>
  );
}

export function WorldLocationPlacements({
  location,
  filter,
}: {
  location: WorldDraftRecord;
  filter?: "creatures" | "items";
}) {
  return filter ? (
    <LocationCollectionPage location={location} collection={filter} />
  ) : (
    <>
      <LocationCollectionPage location={location} collection="creatures" />
      <LocationCollectionPage location={location} collection="items" />
      <LocationPreservedPlacements location={location} />
    </>
  );
}

export function CharactersPage() {
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const { definition, draft } = useWorldAuthoring();
  const base = `/worlds/${encodeURIComponent(definition.id)}/characters`;
  const names = (kind: Exclude<CharacterOptionKind, "heritage">) =>
    (draft?.records ?? [])
      .filter(
        (record) =>
          record.resourceType === "definitions" &&
          recordPayload(record).kind === kind,
      )
      .map((record) => visibleRecordName(record, "Unnamed option"));
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World authoring
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Characters</h1>
      <RouterButtonLink
        className="min-h-11"
        href={`${base}/catalog-characters${guideSuffix}`}
      >
        Catalog Character templates
      </RouterButtonLink>
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
      createLabel={kind}
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
  const [facet, setFacet] = useState("overview");
  const hasModifiers = kind === "profession" || kind === "background";
  const newRecordId = useRef<string | undefined>(undefined);
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
  const [modifierLevels, setModifierLevels] = useState(() =>
    kind === "background"
      ? [
          {
            rank: 0,
            benefits: {
              modifierGrants: (components.modifierGrants ?? []) as JsonValue,
            },
          },
        ]
      : professionModifierLevels(components as Record<string, JsonValue>),
  );
  const [modifierEdit, setModifierEdit] = useState<ModifierEdit | null>(null);
  const modifiersValid =
    kind === "background"
      ? backgroundModifiersValid(levelModifierGrants(modifierLevels[0]))
      : kind !== "profession" || professionModifiersValid(modifierLevels);
  const conformance = draft ? definitionConformance(draft, kind) : undefined;
  const snapshot = JSON.stringify({
    name,
    description,
    defaultAttribute,
    startingProfessionRank,
    modifierLevels,
    modifierEdit,
  });
  const editorSave = useEditorSave(snapshot);
  const { dirty } = editorSave;
  useBlocker({
    shouldBlockFn: () =>
      editorSave.hasChanges() &&
      !window.confirm("Leave without saving this Character option?"),
    enableBeforeUnload: dirty,
  });
  useEffect(() => {
    if (dirty) markDirty();
  }, [dirty, markDirty]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !draft ||
      !canEdit ||
      !name.trim() ||
      (kind === "profession" && !startingProfessionRank) ||
      !conformance ||
      !modifiersValid ||
      modifierEdit
    )
      return;
    const id =
      existing?.sourceId ?? (newRecordId.current ??= crypto.randomUUID());
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
      existingComponents:
        kind === "profession"
          ? {
              ...(components as Record<string, JsonValue>),
              expertiseLevels: modifierLevels,
            }
          : kind === "background"
            ? BackgroundDefinition.withModifierGrants(
                components as Record<string, JsonValue>,
                levelModifierGrants(modifierLevels[0]),
              )
            : (components as Record<string, JsonValue>),
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
    editorSave.markSaved(snapshot);
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
        <h1 className="text-4xl font-semibold">
          {existing ? visibleRecordName(existing, title) : title}
        </h1>
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
      {hasModifiers && (
        <RecordTabs
          label={`${title} properties`}
          idPrefix="character-definition"
          panelId="character-definition-editor"
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "modifiers", label: "Modifiers" },
          ]}
          activeTab={facet}
          onTabChange={setFacet}
        />
      )}
      <DraftRequired>
        <form
          id="character-definition-editor"
          role={hasModifiers ? "tabpanel" : undefined}
          aria-labelledby={
            hasModifiers
              ? recordTabId("character-definition", facet)
              : undefined
          }
          tabIndex={hasModifiers ? 0 : undefined}
          onInvalidCapture={(event) => {
            const input = event.target as HTMLInputElement;
            const invalidFacet = input.closest<HTMLElement>(
              "[data-definition-facet]",
            )?.dataset.definitionFacet;
            if (hasModifiers && invalidFacet && invalidFacet !== facet) {
              event.preventDefault();
              setFacet(invalidFacet);
              requestAnimationFrame(() => {
                input.focus();
                input.reportValidity();
              });
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void editorSave.run(() => submit(event));
          }}
          className="mt-8 grid gap-5"
        >
          <div
            data-definition-facet="overview"
            hidden={hasModifiers && facet !== "overview"}
            className={
              hasModifiers && facet !== "overview" ? "hidden" : "grid gap-5"
            }
          >
            <AuthoringTextField
              label="Name"
              required
              value={name}
              onChange={setName}
              recordIds={
                new Set(draft?.records.map((record) => record.sourceId))
              }
            />
            <AuthoringTextField
              label={kind === "background" ? "Backstory" : "Description"}
              multiline
              value={description}
              onChange={setDescription}
              recordIds={
                new Set(draft?.records.map((record) => record.sourceId))
              }
            />
            {kind === "skill" && (
              <Field label="Default Attribute">
                <Select
                  value={defaultAttribute}
                  onChange={(event) => setDefaultAttribute(event.target.value)}
                  className="mt-2 w-full"
                >
                  <option value="">No default Attribute</option>
                  {(draft?.effectiveModels?.attributes ?? []).map(
                    (attribute) => (
                      <option key={attribute.key} value={attribute.key}>
                        {attribute.name}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
            )}
          </div>
          <div
            data-definition-facet="modifiers"
            hidden={!hasModifiers || facet !== "modifiers"}
            className={
              !hasModifiers || facet !== "modifiers" ? "hidden" : "grid gap-5"
            }
          >
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
                  {(draft?.effectiveModels?.professionRanks ?? []).map(
                    (rank) => (
                      <option key={rank.key} value={rank.key}>
                        {rank.name}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
            )}
            {(kind === "profession" || kind === "background") && (
              <ProfessionModifiersEditor
                subject={kind === "background" ? "Background" : "Profession"}
                levels={modifierLevels}
                onChange={setModifierLevels}
                editing={modifierEdit}
                onEditingChange={setModifierEdit}
                startingRank={startingProfessionRank}
                ranks={draft?.effectiveModels?.professionRanks ?? []}
                attributes={draft?.effectiveModels?.attributes ?? []}
                skills={(draft?.records ?? [])
                  .filter(
                    (r) =>
                      r.resourceType === "definitions" &&
                      recordPayload(r).kind === "skill",
                  )
                  .map((r) => ({
                    key: r.sourceId,
                    name: visibleRecordName(r, "Unnamed Skill"),
                  }))}
                statistics={(draft?.effectiveModels?.elements ?? [])
                  .filter(
                    (e) =>
                      e.kind === "field" &&
                      ["integer", "number"].includes(
                        String(objectValue(e.payload?.valueType).kind),
                      ),
                  )
                  .map((e) => ({
                    key: String(e.payload?.storageKey ?? e.key),
                    name: e.name,
                  }))}
                disabled={editorSave.saving}
              />
            )}
          </div>
          {modifierEdit && (
            <p className="text-sm text-base-content/65" role="status">
              Add or update the modifier in the list, or cancel its form, before
              saving this definition.
            </p>
          )}
          {!modifiersValid && (
            <Alert tone="warning">
              Give each modifier a name, a valid target, and whole-number dice
              counts and sizes before saving.
            </Alert>
          )}
          <Button
            type="submit"
            tone="primary"
            disabled={
              editorSave.saving ||
              !!modifierEdit ||
              !modifiersValid ||
              !conformance ||
              !name.trim() ||
              (kind === "profession" && !startingProfessionRank)
            }
          >
            {editorSave.saving ? "Saving…" : `Save ${title}`}
          </Button>
          <RouterButtonLink
            className="min-h-11"
            href={`/worlds/${encodeURIComponent(definition.id)}/characters/${kind}s${guideSuffix}`}
          >
            Cancel
          </RouterButtonLink>
        </form>
        {existing && (
          <WorldRecordRemoval
            record={existing}
            path={`characters/${kind}s`}
            returnPath={`/worlds/${encodeURIComponent(definition.id)}/characters/${kind}s`}
            disabled={editorSave.dirty || editorSave.saving}
          />
        )}
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

export { WorldModelEditor } from "./WorldModelEditor";
