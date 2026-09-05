import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Fieldset,
  Input,
  Label,
  Legend,
  Select,
  Textarea,
} from "@aow/ui";
import {
  applyCampaignWorldMigration,
  archiveCampaignDefinition,
  createCampaignDefinitionDraftProposal,
  createCampaignDefinition,
  forkCampaignDefinition,
  getCampaignDefinitionDraftImpact,
  getWorldDefinition,
  listWorldDefinitions,
  previewCampaignWorldMigration,
  publishCampaignDefinitionDraft,
  resetCampaignDefinitionDraft,
  saveCampaignDefinitionDraft,
  validateCampaignDefinitionDraft,
  type CampaignDefinitionDraft,
  type CampaignDraftImpact,
  type CampaignMigrationPreview,
  type JsonValue,
  type WorldDefinitionDetail,
  type WorldDefinitionSummary,
} from "./api";
import {
  campaignPlotTree,
  campaignPlotParentCandidates,
  campaignPlacementSourceId,
  campaignProposalRecoveryRequested,
  campaignProposalRecoverySuffix,
  campaignRecordLabel,
  humanReferenceLabel,
  mergeDiscoveryLines,
  mergeCampaignPlacementPayload,
  mergeNamedComponentLines,
  mergePlotLocationContexts,
  mergePlotRelationships,
  plotBreadcrumb,
  recordObject,
  reviewedRangesCoverTotal,
  type CampaignDraftRecord,
  type CampaignPlotNode,
} from "./campaignAuthoringModel";
import {
  CampaignDraftRequired,
  useCampaignDefinitionAuthoring,
} from "./CampaignDefinitionAuthoringShell";
import { dateLabel } from "./campaignLibraryModel";
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";
import { quickStartSuffix } from "./quickStartModel";
import { campaignReturnSuffix } from "./worldAuthoringModel";

const pageClass = "mx-auto max-w-6xl px-6 py-12 lg:px-10";
const objectValue = (
  value: JsonValue | undefined,
): Record<string, JsonValue> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const stringValue = (value: JsonValue | undefined) =>
  typeof value === "string" ? value : "";
const arrayValue = (value: JsonValue | undefined) =>
  Array.isArray(value) ? value : [];

function namedLines(value: JsonValue | undefined) {
  return arrayValue(value)
    .map((entry) => stringValue(objectValue(entry).name))
    .filter(Boolean)
    .join("\n");
}

function namedEntries(
  lines: string,
  existing: JsonValue | undefined,
  prefix: string,
) {
  return mergeNamedComponentLines(lines, existing, prefix);
}

function discoveryLines(value: JsonValue | undefined) {
  return arrayValue(value)
    .flatMap((entry) => {
      const discovery = objectValue(entry);
      const claim = objectValue(arrayValue(discovery.claims)[0]);
      const kind = stringValue(claim.kind) || "rumor";
      const statement = stringValue(claim.statement);
      return statement
        ? [
            `${kind} | ${stringValue(discovery.name) || "Discovery"} | ${statement}`,
          ]
        : [];
    })
    .join("\n");
}

function discoveryEntries(lines: string, existing: JsonValue | undefined) {
  return mergeDiscoveryLines(lines, existing);
}

export function CampaignDefinitionCreatePage() {
  const navigate = useInternalNavigate();
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  const [worlds, setWorlds] = useState<WorldDefinitionSummary[]>([]);
  const [worldId, setWorldId] = useState("");
  const [world, setWorld] = useState<WorldDefinitionDetail>();
  const [snapshotId, setSnapshotId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiDirection, setAiDirection] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdCampaignId, setCreatedCampaignId] = useState("");
  const [createdNeedsRecovery, setCreatedNeedsRecovery] = useState(false);

  useEffect(() => {
    void listWorldDefinitions().then(
      ({ items }) =>
        setWorlds(
          items.filter(({ status }) => status.toLowerCase() !== "archived"),
        ),
      () => setMessage("Published Worlds could not be loaded."),
    );
  }, []);
  useEffect(() => {
    setWorld(undefined);
    setSnapshotId("");
    if (!worldId) return;
    void getWorldDefinition(worldId).then(
      (detail) => setWorld(detail),
      () => setMessage("That World’s published revisions could not be loaded."),
    );
  }, [worldId]);

  const revisionChoices = useMemo(
    () =>
      (world?.revisions ?? []).flatMap((revision) =>
        revision.snapshots.map((snapshot) => ({
          snapshotId: snapshot.id,
          revisionNumber: revision.revisionNumber,
          name: revision.name,
          publishedAt: revision.publishedAt,
        })),
      ),
    [world],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (createdCampaignId) {
      await navigate(
        `/campaigns/definitions/${encodeURIComponent(createdCampaignId)}${createdNeedsRecovery ? campaignProposalRecoverySuffix(guideSuffix) : guideSuffix}`,
      );
      return;
    }
    if (!snapshotId || !name.trim()) return;
    setSaving(true);
    setMessage("");
    let createdId = "";
    try {
      const proposal = aiDirection.trim()
        ? await createCampaignDefinitionDraftProposal(
            snapshotId,
            aiDirection.trim(),
          )
        : undefined;
      const created = await createCampaignDefinition({
        name: name.trim(),
        description: description.trim() || undefined,
        worldDefinitionSnapshotId: snapshotId,
      });
      createdId = created.id;
      setCreatedCampaignId(created.id);
      if (proposal) {
        const proposedDraft = {
          ...created.draft,
          content: proposal.draftProposal.content,
          records: proposal.draftProposal.records.map((record) => ({
            ...record,
            payload:
              record.resourceType === "plots"
                ? {
                    ...objectValue(record.payload),
                    campaignDefinitionId: created.id,
                  }
                : record.payload,
          })),
        };
        try {
          await saveCampaignDefinitionDraft(created.id, proposedDraft);
        } catch {
          setCreatedNeedsRecovery(true);
          try {
            window.sessionStorage.setItem(
              `campaign-proposal:${created.id}`,
              JSON.stringify({
                content: proposedDraft.content,
                records: proposedDraft.records,
              }),
            );
          } catch {
            // The Campaign exists and remains safe to author manually.
          }
          await navigate(
            `/campaigns/definitions/${encodeURIComponent(created.id)}${campaignProposalRecoverySuffix(guideSuffix)}`,
          );
          return;
        }
      }
      await navigate(
        `/campaigns/definitions/${encodeURIComponent(created.id)}${guideSuffix}`,
      );
    } catch (error) {
      setMessage(
        createdId
          ? "The Campaign Definition was created, but it could not be opened automatically. Use the button to open the existing draft; retrying will not create another Campaign."
          : error instanceof Error
            ? error.message
            : "The Campaign Definition could not be created.",
      );
      setSaving(false);
    }
  }

  return (
    <main className={pageClass}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Campaign Definition · New
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Create Campaign Definition
      </h1>
      <p className="mt-4 max-w-3xl text-base-content/65">
        Choose an exact published World revision. The Campaign receives an
        isolated captured snapshot; future World changes require an explicit
        migration.
      </p>
      {message && (
        <Alert tone="error" className="mt-6" role="alert">
          {message}
        </Alert>
      )}
      <form className="mt-8 space-y-7" onSubmit={submit}>
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body gap-5">
            <h2 className="card-title">1. Captured World</h2>
            <Label>
              World
              <Select
                className="mt-2 w-full max-w-xl"
                required
                value={worldId}
                onChange={(event) => setWorldId(event.currentTarget.value)}
              >
                <option value="">Choose a World by name</option>
                {worlds.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name.trim() || "Unnamed World"}
                    {candidate.currentRevision
                      ? ` · current revision ${candidate.currentRevision.revisionNumber}`
                      : " · no published revision"}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              Published revision
              <Select
                className="mt-2 w-full max-w-xl"
                required
                disabled={!world}
                value={snapshotId}
                onChange={(event) => setSnapshotId(event.currentTarget.value)}
              >
                <option value="">Choose a published revision</option>
                {revisionChoices.map((choice) => (
                  <option key={choice.snapshotId} value={choice.snapshotId}>
                    Revision {choice.revisionNumber} ·{" "}
                    {choice.name.trim() || "Unnamed revision"} ·{" "}
                    {dateLabel(choice.publishedAt)}
                  </option>
                ))}
              </Select>
            </Label>
            {world && revisionChoices.length === 0 && (
              <Alert tone="warning">
                This World has no published revision. Publish it in World
                Authoring before creating a Campaign Definition.
              </Alert>
            )}
          </div>
        </section>
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body gap-5">
            <h2 className="card-title">2. Campaign identity</h2>
            <Label>
              Name
              <Input
                className="mt-2 w-full"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Label>
            <Label>
              Description
              <Textarea
                className="mt-2 min-h-28 w-full"
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </Label>
          </div>
        </section>
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body gap-4">
            <h2 className="card-title">3. Optional AI starting point</h2>
            <p className="text-sm text-base-content/60">
              AI can propose draft Plots and placements grounded in the selected
              snapshot. The proposal is reviewed and saved through the same
              Campaign draft boundary; it never publishes automatically.
            </p>
            <Label>
              Campaign direction
              <Textarea
                className="mt-2 min-h-32 w-full"
                value={aiDirection}
                onChange={(event) => setAiDirection(event.currentTarget.value)}
                placeholder="A celebrated detective vanished beneath a flooded city…"
              />
            </Label>
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <InternalLink
            className="btn btn-outline"
            href={`/campaigns${guideSuffix}`}
          >
            Cancel
          </InternalLink>
          <Button
            loading={saving}
            disabled={
              saving || (!createdCampaignId && (!snapshotId || !name.trim()))
            }
          >
            {createdCampaignId ? "Open existing draft" : "Create working draft"}
          </Button>
        </div>
      </form>
    </main>
  );
}

export function CampaignDefinitionOverviewPage() {
  const { definition, draft, saveDraft, markDirty, canEdit } =
    useCampaignDefinitionAuthoring();
  const location = useLocation();
  const navigate = useInternalNavigate();
  const content = draft?.content ?? {};
  const [gmPremise, setGmPremise] = useState(stringValue(content.gmPremise));
  const [playerIntroduction, setPlayerIntroduction] = useState(
    stringValue(content.playerIntroduction),
  );
  const [revisionName, setRevisionName] = useState(draft?.revisionName ?? "");
  const [proposalRecovery, setProposalRecovery] = useState(
    campaignProposalRecoveryRequested(location.searchStr),
  );
  const [proposalRecoveryMessage, setProposalRecoveryMessage] = useState("");
  const currentRevision = definition.revisions?.find(
    ({ id }) => id === definition.currentRevisionId,
  );
  const world = draft?.capturedWorld ?? currentRevision?.capturedWorld;

  useEffect(() => {
    setGmPremise(stringValue(draft?.content.gmPremise));
    setPlayerIntroduction(stringValue(draft?.content.playerIntroduction));
    setRevisionName(draft?.revisionName ?? "");
  }, [
    draft?.storageRevision,
    draft?.content.gmPremise,
    draft?.content.playerIntroduction,
    draft?.revisionName,
  ]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    await saveDraft({
      ...draft,
      revisionName: revisionName.trim(),
      content: {
        ...draft.content,
        gmPremise: gmPremise.trim(),
        playerIntroduction: playerIntroduction.trim(),
      },
    });
  }

  async function retryProposal() {
    if (!draft || !canEdit) return;
    setProposalRecoveryMessage("");
    try {
      const stored = JSON.parse(
        window.sessionStorage.getItem(`campaign-proposal:${definition.id}`) ??
          "null",
      ) as unknown;
      const recovery = objectValue(stored as JsonValue);
      if (!Array.isArray(recovery.records)) {
        setProposalRecoveryMessage(
          "The original proposal is no longer available. The Campaign draft is safe; continue authoring it manually.",
        );
        return;
      }
      const saved = await saveDraft({
        ...draft,
        content: objectValue(recovery.content),
        records: recovery.records as CampaignDefinitionDraft["records"],
      });
      if (!saved) return;
      window.sessionStorage.removeItem(`campaign-proposal:${definition.id}`);
      setProposalRecovery(false);
      setProposalRecoveryMessage(
        "The AI proposal was applied to the working draft.",
      );
      await navigate(
        `${location.pathname}${quickStartSuffix(location.searchStr)}`,
      );
    } catch {
      setProposalRecoveryMessage(
        "The proposal could not be recovered. The Campaign draft is safe; continue authoring it manually.",
      );
    }
  }
  return (
    <main className={pageClass}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Campaign Definition · Authoring
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-4 max-w-3xl text-base-content/65">
        Author reusable Campaign material without changing the captured World or
        any played Campaign Instance.
      </p>
      {proposalRecovery && (
        <Alert tone="warning" className="mt-6" role="alert">
          <p>
            The Campaign Definition was created, but its AI proposal was not
            applied. Retrying updates this existing draft; it does not create
            another Campaign.
          </p>
          {canEdit && (
            <Button
              type="button"
              tone="outline"
              size="sm"
              className="mt-3"
              onClick={() => void retryProposal()}
            >
              Retry applying proposal
            </Button>
          )}
        </Alert>
      )}
      {proposalRecoveryMessage && (
        <Alert
          tone={proposalRecovery ? "warning" : "success"}
          className="mt-6"
          role="status"
        >
          {proposalRecoveryMessage}
        </Alert>
      )}
      <section className="card mt-8 border border-base-300 bg-base-200">
        <div className="card-body">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-base-content/60">
                Captured World
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                {(world?.worldName ?? world?.name)?.trim() ||
                  "Unavailable captured World"}
              </h2>
              <p className="mt-1 text-sm text-base-content/60">
                Revision {world?.revisionNumber ?? "unavailable"} · read-only
                snapshot
              </p>
            </div>
            {world?.worldDefinitionId && (
              <RouterButtonLink
                href={`/worlds/${encodeURIComponent(world.worldDefinitionId)}${campaignReturnSuffix(location.pathname, definition.name, location.searchStr)}`}
                tone="outline"
                size="sm"
              >
                Open World Authoring
              </RouterButtonLink>
            )}
          </div>
          <p className="mt-4 text-sm text-base-content/60">
            Changes in World Authoring become migration candidates; they do not
            alter this Campaign automatically.
          </p>
        </div>
      </section>
      <CampaignDraftRequired>
        <form className="mt-8 space-y-6" onSubmit={save}>
          <Label>
            Revision name
            <Input
              required
              maxLength={120}
              className="mt-2 w-full"
              value={revisionName}
              onChange={(event) => {
                setRevisionName(event.currentTarget.value);
                markDirty();
              }}
            />
            <span className="mt-1 block text-xs text-base-content/55">
              Name the immutable Campaign revision this draft will publish.
            </span>
          </Label>
          <Label>
            GM premise
            <Textarea
              className="mt-2 min-h-40 w-full"
              value={gmPremise}
              onChange={(event) => {
                setGmPremise(event.currentTarget.value);
                markDirty();
              }}
            />
          </Label>
          <Label>
            Player-safe introduction
            <Textarea
              className="mt-2 min-h-40 w-full"
              value={playerIntroduction}
              onChange={(event) => {
                setPlayerIntroduction(event.currentTarget.value);
                markDirty();
              }}
            />
          </Label>
          <Button>Save overview</Button>
        </form>
      </CampaignDraftRequired>
    </main>
  );
}

function PlotTreeList({
  nodes,
  selectedId,
  base,
  guideSuffix,
}: {
  nodes: CampaignPlotNode[];
  selectedId?: string;
  base: string;
  guideSuffix: string;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.id}>
          <InternalLink
            href={`${base}/${encodeURIComponent(node.id)}${guideSuffix}`}
            aria-current={node.id === selectedId ? "page" : undefined}
            className={`block min-h-10 rounded-md px-3 py-2 text-sm ${node.id === selectedId ? "bg-primary/10 font-semibold text-primary" : "hover:bg-base-200"}`}
          >
            {node.name}
            <span className="ml-2 text-xs text-base-content/55">
              {node.children.length
                ? `${node.children.length} subplot${node.children.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </InternalLink>
          {node.children.length > 0 && (
            <div className="ml-4 border-l border-base-300 pl-2">
              <PlotTreeList
                nodes={node.children}
                selectedId={selectedId}
                base={base}
                guideSuffix={guideSuffix}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CampaignPlotsPage({ plotId }: { plotId?: string }) {
  const { definition, draft, saveRecord, markDirty } =
    useCampaignDefinitionAuthoring();
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  const navigate = useInternalNavigate();
  const base = `/campaigns/definitions/${encodeURIComponent(definition.id)}/plots`;
  const plots = useMemo(
    () => campaignPlotTree(draft?.records ?? []),
    [draft?.records],
  );
  const plotRecords = (draft?.records ?? []).filter(
    ({ resourceType }) => resourceType === "plots",
  );
  const selected = plotId
    ? plotRecords.find(({ sourceId }) => sourceId === plotId)
    : undefined;
  const selectedPayload = selected ? recordObject(selected) : {};
  const [name, setName] = useState(
    selected ? campaignRecordLabel(selected) : "",
  );
  const [description, setDescription] = useState(
    stringValue(selectedPayload.description),
  );
  const [parentId, setParentId] = useState(
    stringValue(objectValue(selectedPayload.parent).parentPlotDefinitionId),
  );
  const [prerequisites, setPrerequisites] = useState<Set<string>>(new Set());
  const [dependencies, setDependencies] = useState<Set<string>>(new Set());
  const [prerequisiteRationales, setPrerequisiteRationales] = useState<
    Record<string, string>
  >({});
  const [dependencyRationales, setDependencyRationales] = useState<
    Record<string, string>
  >({});
  const [objectives, setObjectives] = useState(
    namedLines(selectedPayload.objectives),
  );
  const [pressures, setPressures] = useState(
    namedLines(selectedPayload.pressures),
  );
  const [resistances, setResistances] = useState(
    namedLines(selectedPayload.resistances),
  );
  const [discoveries, setDiscoveries] = useState(
    discoveryLines(selectedPayload.discoveries),
  );
  const [locationIds, setLocationIds] = useState<Set<string>>(new Set());
  const parentCandidates = useMemo(
    () =>
      selected
        ? campaignPlotParentCandidates(plotRecords, selected.sourceId)
        : [],
    [plotRecords, selected],
  );
  const relationshipCandidates = useMemo(() => {
    const byId = new Map(
      plotRecords.map((record) => [record.sourceId, record]),
    );
    const ancestors: CampaignDraftRecord[] = [];
    const visited = new Set<string>();
    let nextId = parentId;
    while (nextId && !visited.has(nextId)) {
      visited.add(nextId);
      const record = byId.get(nextId);
      if (!record) break;
      ancestors.push(record);
      nextId = stringValue(
        objectValue(recordObject(record).parent).parentPlotDefinitionId,
      );
    }
    return ancestors;
  }, [parentId, plotRecords]);

  useEffect(() => {
    setName(selected ? campaignRecordLabel(selected) : "");
    setDescription(stringValue(selectedPayload.description));
    setParentId(
      stringValue(objectValue(selectedPayload.parent).parentPlotDefinitionId),
    );
    const relationships = Array.isArray(selectedPayload.prerequisites)
      ? selectedPayload.prerequisites
      : [];
    setPrerequisites(
      new Set(
        relationships.flatMap((value) => {
          const candidate = objectValue(value);
          return typeof candidate.plotDefinitionId === "string"
            ? [candidate.plotDefinitionId]
            : [];
        }),
      ),
    );
    setPrerequisiteRationales(
      Object.fromEntries(
        relationships.flatMap((value) => {
          const candidate = objectValue(value);
          return typeof candidate.plotDefinitionId === "string" &&
            typeof candidate.crossBranchRationale === "string"
            ? [[candidate.plotDefinitionId, candidate.crossBranchRationale]]
            : [];
        }),
      ),
    );
    const dependencyValues = arrayValue(selectedPayload.dependencies);
    setDependencies(
      new Set(
        dependencyValues.flatMap((value) => {
          const candidate = objectValue(value);
          return typeof candidate.plotDefinitionId === "string"
            ? [candidate.plotDefinitionId]
            : [];
        }),
      ),
    );
    setDependencyRationales(
      Object.fromEntries(
        dependencyValues.flatMap((value) => {
          const candidate = objectValue(value);
          return typeof candidate.plotDefinitionId === "string" &&
            typeof candidate.crossBranchRationale === "string"
            ? [[candidate.plotDefinitionId, candidate.crossBranchRationale]]
            : [];
        }),
      ),
    );
    setObjectives(namedLines(selectedPayload.objectives));
    setPressures(namedLines(selectedPayload.pressures));
    setResistances(namedLines(selectedPayload.resistances));
    setDiscoveries(discoveryLines(selectedPayload.discoveries));
    setLocationIds(
      new Set(
        arrayValue(selectedPayload.locationContexts).flatMap((value) => {
          const locationId = objectValue(value).locationId;
          return typeof locationId === "string" ? [locationId] : [];
        }),
      ),
    );
  }, [
    selected?.sourceId,
    selectedPayload.description,
    selectedPayload.parent,
    selectedPayload.prerequisites,
    selectedPayload.dependencies,
    selectedPayload.objectives,
    selectedPayload.pressures,
    selectedPayload.resistances,
    selectedPayload.discoveries,
    selectedPayload.locationContexts,
  ]);

  async function add(parentPlotId?: string) {
    if (!draft) return;
    const id = `plot:${crypto.randomUUID()}`;
    const record: CampaignDraftRecord = {
      resourceType: "plots",
      sourceId: id,
      payload: {
        id,
        campaignDefinitionId: definition.id,
        parent: parentPlotId
          ? { kind: "subplot", parentPlotDefinitionId: parentPlotId }
          : { kind: "root" },
        name: parentPlotId ? "New subplot" : "New Plot",
        description: "",
        objectives: [],
        pressures: [],
        resistances: [],
        discoveries: [],
        locationContexts: [],
        prerequisites: [],
        dependencies: [],
      },
    };
    if (await saveRecord(record))
      await navigate(`${base}/${encodeURIComponent(id)}${guideSuffix}`);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || !name.trim()) return;
    await saveRecord({
      ...selected,
      payload: {
        ...selectedPayload,
        name: name.trim(),
        description: description.trim(),
        parent: parentId
          ? { kind: "subplot", parentPlotDefinitionId: parentId }
          : { kind: "root" },
        prerequisites: mergePlotRelationships(
          [...prerequisites],
          selectedPayload.prerequisites,
          prerequisiteRationales,
        ),
        dependencies: mergePlotRelationships(
          [...dependencies],
          selectedPayload.dependencies,
          dependencyRationales,
        ),
        objectives: namedEntries(
          objectives,
          selectedPayload.objectives,
          "objective",
        ),
        pressures: namedEntries(
          pressures,
          selectedPayload.pressures,
          "pressure",
        ),
        resistances: namedEntries(
          resistances,
          selectedPayload.resistances,
          "resistance",
        ),
        discoveries: discoveryEntries(discoveries, selectedPayload.discoveries),
        locationContexts: mergePlotLocationContexts(
          [...locationIds],
          selectedPayload.locationContexts,
        ),
      },
    });
  }

  const breadcrumbs = selected
    ? plotBreadcrumb(plotRecords, selected.sourceId)
    : [];
  const invalidImportedDiscoveryCount = arrayValue(
    selectedPayload.discoveries,
  ).filter(
    (entry) => arrayValue(objectValue(entry).claims).length === 0,
  ).length;
  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Story
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Plots</h1>
          <p className="mt-3 text-base-content/65">
            Build multiple root Plots and recursively nested subplots.
          </p>
        </div>
        <CampaignDraftRequired>
          <Button onClick={() => void add()}>New root Plot</Button>
        </CampaignDraftRequired>
      </div>
      <CampaignDraftRequired>
        <div className="mt-8 grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <nav
            aria-label="Plot hierarchy"
            className="rounded-box border border-base-300 bg-base-100 p-3"
          >
            <h2 className="px-2 pb-3 font-semibold">Plot hierarchy</h2>
            {plots.length ? (
              <PlotTreeList
                nodes={plots}
                selectedId={plotId}
                base={base}
                guideSuffix={guideSuffix}
              />
            ) : (
              <p className="px-2 py-4 text-sm text-base-content/60">
                No Plots yet. Create a root Plot to begin.
              </p>
            )}
          </nav>
          {selected ? (
            <form
              onSubmit={save}
              className="card border border-base-300 bg-base-200"
            >
              <div className="card-body gap-5">
                <nav
                  aria-label="Plot ancestry"
                  className="text-sm text-base-content/60"
                >
                  {breadcrumbs.join(" › ")}
                </nav>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="card-title">Edit Plot</h2>
                  <Button
                    type="button"
                    tone="outline"
                    size="sm"
                    onClick={() => void add(selected.sourceId)}
                  >
                    Add subplot
                  </Button>
                </div>
                <Label>
                  Name
                  <Input
                    required
                    className="mt-2 w-full"
                    value={name}
                    onChange={(event) => {
                      setName(event.currentTarget.value);
                      markDirty();
                    }}
                  />
                </Label>
                <Label>
                  Description
                  <Textarea
                    className="mt-2 min-h-36 w-full"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.currentTarget.value);
                      markDirty();
                    }}
                  />
                </Label>
                <Label>
                  Parent Plot
                  <Select
                    className="mt-2 w-full"
                    value={parentId}
                    onChange={(event) => {
                      setParentId(event.currentTarget.value);
                      markDirty();
                    }}
                  >
                    <option value="">Root Plot</option>
                    {parentCandidates.map((candidate) => (
                      <option
                        key={candidate.sourceId}
                        value={candidate.sourceId}
                      >
                        {campaignRecordLabel(candidate)}
                      </option>
                    ))}
                  </Select>
                  <span className="mt-1 block text-xs text-base-content/55">
                    Any Plot outside this Plot’s subtree may become its parent.
                    Review &amp; publish validates the changed hierarchy and all
                    affected relationships.
                  </span>
                </Label>
                <Fieldset>
                  <Legend className="font-medium">Prerequisites</Legend>
                  <p className="mt-1 text-sm text-base-content/60">
                    Relationships point upward to this Plot’s current parent or
                    ancestors and remain acyclic.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {parentCandidates.map((candidate) => (
                      <div key={candidate.sourceId}>
                        <Checkbox
                          label={campaignRecordLabel(candidate)}
                          checked={prerequisites.has(candidate.sourceId)}
                          onChange={(event) => {
                            setPrerequisites((current) => {
                              const next = new Set(current);
                              if (event.currentTarget.checked)
                                next.add(candidate.sourceId);
                              else next.delete(candidate.sourceId);
                              return next;
                            });
                            markDirty();
                          }}
                        />
                        {prerequisites.has(candidate.sourceId) &&
                          !relationshipCandidates.some(
                            ({ sourceId }) => sourceId === candidate.sourceId,
                          ) && (
                            <Label className="mt-2 ml-7 block">
                              Cross-branch rationale
                              <Input
                                required
                                className="mt-1 w-full"
                                value={
                                  prerequisiteRationales[candidate.sourceId] ??
                                  ""
                                }
                                onChange={(event) => {
                                  setPrerequisiteRationales((current) => ({
                                    ...current,
                                    [candidate.sourceId]:
                                      event.currentTarget.value,
                                  }));
                                  markDirty();
                                }}
                              />
                            </Label>
                          )}
                      </div>
                    ))}
                  </div>
                </Fieldset>
                <Fieldset>
                  <Legend className="font-medium">Dependencies</Legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {parentCandidates.map((candidate) => (
                      <div key={candidate.sourceId}>
                        <Checkbox
                          label={campaignRecordLabel(candidate)}
                          checked={dependencies.has(candidate.sourceId)}
                          onChange={(event) => {
                            setDependencies((current) => {
                              const next = new Set(current);
                              if (event.currentTarget.checked)
                                next.add(candidate.sourceId);
                              else next.delete(candidate.sourceId);
                              return next;
                            });
                            markDirty();
                          }}
                        />
                        {dependencies.has(candidate.sourceId) &&
                          !relationshipCandidates.some(
                            ({ sourceId }) => sourceId === candidate.sourceId,
                          ) && (
                            <Label className="mt-2 ml-7 block">
                              Cross-branch rationale
                              <Input
                                required
                                className="mt-1 w-full"
                                value={
                                  dependencyRationales[candidate.sourceId] ?? ""
                                }
                                onChange={(event) => {
                                  setDependencyRationales((current) => ({
                                    ...current,
                                    [candidate.sourceId]:
                                      event.currentTarget.value,
                                  }));
                                  markDirty();
                                }}
                              />
                            </Label>
                          )}
                      </div>
                    ))}
                  </div>
                </Fieldset>
                <div className="grid gap-5 md:grid-cols-3">
                  <Label>
                    Objectives · one per line
                    <Textarea
                      className="mt-2 min-h-32 w-full"
                      value={objectives}
                      onChange={(event) => {
                        setObjectives(event.currentTarget.value);
                        markDirty();
                      }}
                    />
                  </Label>
                  <Label>
                    Pressures · one per line
                    <Textarea
                      className="mt-2 min-h-32 w-full"
                      value={pressures}
                      onChange={(event) => {
                        setPressures(event.currentTarget.value);
                        markDirty();
                      }}
                    />
                  </Label>
                  <Label>
                    Resistances · one per line
                    <Textarea
                      className="mt-2 min-h-32 w-full"
                      value={resistances}
                      onChange={(event) => {
                        setResistances(event.currentTarget.value);
                        markDirty();
                      }}
                    />
                  </Label>
                </div>
                <Label>
                  Discoveries
                  <Textarea
                    className="mt-2 min-h-36 w-full font-mono text-sm"
                    value={discoveries}
                    onChange={(event) => {
                      setDiscoveries(event.currentTarget.value);
                      markDirty();
                    }}
                    placeholder="truth | The broken seal | The archive was opened from within."
                  />
                  <span className="mt-1 block text-xs text-base-content/55">
                    One per line: truth, belief, or rumor | discovery name |
                    statement. Rumors need not resolve to truths.
                  </span>
                </Label>
                {invalidImportedDiscoveryCount > 0 && (
                  <Alert tone="warning">
                    {invalidImportedDiscoveryCount} imported Discovery
                    {invalidImportedDiscoveryCount === 1
                      ? " has"
                      : " entries have"}{" "}
                    no claim. It is preserved, but publication remains blocked
                    until each Discovery has a truth, belief, or rumor
                    statement.
                  </Alert>
                )}
                <Fieldset>
                  <Legend className="font-medium">
                    Captured-World Location contexts
                  </Legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(draft?.capturedWorldContent?.locations ?? []).map(
                      (location) => (
                        <Checkbox
                          key={location.id}
                          label={location.name || "Unnamed captured Location"}
                          checked={locationIds.has(location.id)}
                          onChange={(event) => {
                            setLocationIds((current) => {
                              const next = new Set(current);
                              if (event.currentTarget.checked)
                                next.add(location.id);
                              else next.delete(location.id);
                              return next;
                            });
                            markDirty();
                          }}
                        />
                      ),
                    )}
                  </div>
                </Fieldset>
                <Button className="self-start">Save Plot</Button>
              </div>
            </form>
          ) : (
            <section className="rounded-box border border-dashed border-base-300 p-8">
              <h2 className="text-xl font-semibold">Choose a Plot</h2>
              <p className="mt-2 text-base-content/60">
                Select a named Plot from the hierarchy to edit it.
              </p>
            </section>
          )}
        </div>
      </CampaignDraftRequired>
    </main>
  );
}

interface CapturedChoice {
  id: string;
  name: string;
  resourceType: string;
  kind?: string;
  locationId?: string;
}
function capturedChoices(
  draft: CampaignDefinitionDraft | undefined,
): CapturedChoice[] {
  const content = draft?.capturedWorldContent;
  if (!content) return [];
  return [
    ...content.locations.map((item) => ({
      ...item,
      resourceType: "locations",
    })),
    ...content.creatures.map((item) => ({
      ...item,
      resourceType: "creatures",
    })),
    ...content.items.map((item) => ({ ...item, resourceType: "definitions" })),
    ...content.placements.map((item) => ({
      ...item,
      resourceType: "world-placements",
    })),
  ];
}

export function CampaignPlacementsPage() {
  const { draft, saveRecord, removeRecord, markDirty } =
    useCampaignDefinitionAuthoring();
  const [editingId, setEditingId] = useState("");
  const [mode, setMode] = useState<"independent" | "world-decoration">(
    "independent",
  );
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [definitionId, setDefinitionId] = useState("");
  const [capturedWorldPlacementId, setCapturedWorldPlacementId] = useState("");
  const [contentType, setContentType] = useState("creature");
  const [plotIds, setPlotIds] = useState<Set<string>>(new Set());
  const choices = useMemo(() => capturedChoices(draft), [draft]);
  const locations = choices.filter(
    ({ resourceType, kind }) =>
      resourceType === "locations" && kind !== "world",
  );
  const content = choices.filter(
    ({ resourceType, kind }) =>
      resourceType === "creatures" ||
      resourceType === "items" ||
      (resourceType === "definitions" &&
        (kind === "creature" || kind === "item")),
  );
  const worldPlacements = choices.filter(
    ({ resourceType }) => resourceType === "world-placements",
  );
  const selectedWorldPlacement = worldPlacements.find(
    (placement) => placement.id === capturedWorldPlacementId,
  );
  const plots = (draft?.records ?? []).filter(
    ({ resourceType }) => resourceType === "plots",
  );
  const placements = (draft?.records ?? []).filter(
    ({ resourceType }) => resourceType === "campaign-placements",
  );
  const labelFor = (id: string, fallback: string) =>
    choices.find((choice) => choice.id === id)?.name ??
    plotLabel(id) ??
    fallback;
  const plotLabel = (id: string) =>
    plots.find((plot) => plot.sourceId === id)
      ? campaignRecordLabel(plots.find((plot) => plot.sourceId === id)!)
      : undefined;

  function resetEditor() {
    setEditingId("");
    setMode("independent");
    setName("");
    setLocationId("");
    setDefinitionId("");
    setCapturedWorldPlacementId("");
    setContentType("creature");
    setPlotIds(new Set());
  }

  function editPlacement(record: CampaignDraftRecord) {
    const payload = recordObject(record);
    const nextMode =
      payload.kind === "world-decoration" ? "world-decoration" : "independent";
    const source = objectValue(payload.source);
    const nextDefinitionId = campaignPlacementSourceId(record) ?? "";
    setEditingId(record.sourceId);
    setMode(nextMode);
    setName(campaignRecordLabel(record));
    setLocationId(stringValue(payload.locationId));
    setDefinitionId(nextDefinitionId);
    setCapturedWorldPlacementId(stringValue(payload.capturedWorldPlacementId));
    setContentType(source.kind === "world-item" ? "item" : "creature");
    setPlotIds(
      new Set(
        arrayValue(payload.plotDefinitionIds).filter(
          (value): value is string => typeof value === "string",
        ),
      ),
    );
  }

  async function removePlacement(record: CampaignDraftRecord) {
    if (
      !window.confirm(
        `Remove ${campaignRecordLabel(record)} from this Campaign draft?`,
      )
    )
      return;
    if (await removeRecord("campaign-placements", record.sourceId)) {
      if (editingId === record.sourceId) resetEditor();
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !name.trim()) return;
    const id = editingId || `campaign-placement:${crypto.randomUUID()}`;
    const existingRecord = placements.find(
      (record) => record.sourceId === editingId,
    ) ?? {
      resourceType: "campaign-placements",
      sourceId: id,
      payload: {},
    };
    const sourceExtensions = {
      ...objectValue(recordObject(existingRecord).source),
    };
    delete sourceExtensions.creatureId;
    delete sourceExtensions.itemDefinitionId;
    const updates: Record<string, JsonValue> =
      mode === "independent"
        ? {
            id,
            name: name.trim(),
            locationId,
            plotDefinitionIds: [...plotIds],
            source:
              contentType === "item"
                ? {
                    ...sourceExtensions,
                    kind: "world-item",
                    itemDefinitionId: definitionId,
                  }
                : {
                    ...sourceExtensions,
                    kind: "world-creature",
                    creatureId: definitionId,
                  },
          }
        : {
            id,
            name: name.trim(),
            locationId: selectedWorldPlacement?.locationId ?? "",
            capturedWorldPlacementId,
            plotDefinitionIds: [...plotIds],
          };
    const saved = await saveRecord({
      resourceType: "campaign-placements",
      sourceId: id,
      payload: mergeCampaignPlacementPayload(existingRecord, mode, updates),
    });
    if (saved) resetEditor();
  }
  return (
    <main className={pageClass}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World context
      </p>
      <h1 className="mt-3 text-4xl font-semibold">Placements</h1>
      <p className="mt-3 max-w-3xl text-base-content/65">
        Campaign placements add context to the captured World snapshot without
        modifying World data.
      </p>
      <CampaignDraftRequired>
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="placement-list-title">
            <h2 id="placement-list-title" className="text-xl font-semibold">
              Campaign placements
            </h2>
            <div className="mt-4 space-y-3">
              {placements.length ? (
                placements.map((record) => {
                  const payload = recordObject(record);
                  const decoration = payload.kind === "world-decoration";
                  return (
                    <article
                      key={record.sourceId}
                      className="rounded-box border border-base-300 bg-base-200 p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-3">
                        <h3 className="font-semibold">
                          {campaignRecordLabel(record)}
                        </h3>
                        <Badge tone={decoration ? "info" : "primary"}>
                          {decoration
                            ? "World decoration"
                            : "Campaign placement"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-base-content/60">
                        {decoration
                          ? labelFor(
                              stringValue(payload.capturedWorldPlacementId),
                              "Unavailable captured World placement",
                            )
                          : `${labelFor(campaignPlacementSourceId(record) ?? "", "Unavailable captured content")} · ${labelFor(stringValue(payload.locationId), "Unavailable captured Location")}`}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {decoration ||
                        ["world-creature", "world-item"].includes(
                          stringValue(objectValue(payload.source).kind),
                        ) ? (
                          <Button
                            type="button"
                            tone="outline"
                            size="sm"
                            onClick={() => editPlacement(record)}
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
                          onClick={() => void removePlacement(record)}
                        >
                          Remove placement
                        </Button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <Alert>No Campaign placements yet.</Alert>
              )}
            </div>
          </section>
          <form
            onSubmit={save}
            className="card h-fit border border-base-300 bg-base-200"
          >
            <div className="card-body gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="card-title">
                  {editingId ? "Edit placement" : "Add placement"}
                </h2>
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
              <Fieldset>
                <Legend className="text-sm font-medium">Ownership</Legend>
                <div className="mt-2 space-y-2">
                  <Label className="flex min-h-11 items-center gap-3">
                    <Input
                      type="radio"
                      name="placement-mode"
                      value="independent"
                      checked={mode === "independent"}
                      onChange={() => {
                        setMode("independent");
                        markDirty();
                      }}
                    />
                    Place Campaign content
                  </Label>
                  <Label className="flex min-h-11 items-center gap-3">
                    <Input
                      type="radio"
                      name="placement-mode"
                      value="world-decoration"
                      checked={mode === "world-decoration"}
                      onChange={() => {
                        setMode("world-decoration");
                        markDirty();
                      }}
                    />
                    Decorate a World placement
                  </Label>
                </div>
              </Fieldset>
              <Label>
                Campaign label
                <Input
                  required
                  className="mt-2 w-full"
                  value={name}
                  onChange={(event) => {
                    setName(event.currentTarget.value);
                    markDirty();
                  }}
                />
              </Label>
              {mode === "independent" ? (
                <>
                  <Label>
                    Captured Location
                    <Select
                      required
                      className="mt-2 w-full"
                      value={locationId}
                      onChange={(event) => {
                        setLocationId(event.currentTarget.value);
                        markDirty();
                      }}
                    >
                      <option value="">Choose a Location</option>
                      {locations.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.name}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Creature or Item
                    <Select
                      required
                      className="mt-2 w-full"
                      value={definitionId}
                      onChange={(event) => {
                        setDefinitionId(event.currentTarget.value);
                        const selected = content.find(
                          ({ id }) => id === event.currentTarget.value,
                        );
                        setContentType(
                          selected?.kind === "item" ||
                            selected?.resourceType === "items"
                            ? "item"
                            : "creature",
                        );
                        markDirty();
                      }}
                    >
                      <option value="">Choose captured content</option>
                      {content.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.name} · {choice.kind || choice.resourceType}
                        </option>
                      ))}
                    </Select>
                  </Label>
                </>
              ) : (
                <Label>
                  Captured World placement
                  <Select
                    required
                    className="mt-2 w-full"
                    value={capturedWorldPlacementId}
                    onChange={(event) => {
                      setCapturedWorldPlacementId(event.currentTarget.value);
                      markDirty();
                    }}
                  >
                    <option value="">Choose a World placement</option>
                    {worldPlacements.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.name}
                      </option>
                    ))}
                  </Select>
                </Label>
              )}
              <Fieldset>
                <Legend>Supporting Plots</Legend>
                <p className="text-xs text-base-content/60">
                  Optionally associate this placement with one or more Plots.
                </p>
                <div className="mt-2 space-y-2">
                  {plots.map((plot) => (
                    <Checkbox
                      key={plot.sourceId}
                      label={campaignRecordLabel(plot)}
                      checked={plotIds.has(plot.sourceId)}
                      onChange={(event) => {
                        setPlotIds((current) => {
                          const next = new Set(current);
                          if (event.currentTarget.checked)
                            next.add(plot.sourceId);
                          else next.delete(plot.sourceId);
                          return next;
                        });
                        markDirty();
                      }}
                    />
                  ))}
                </div>
              </Fieldset>
              <p className="text-xs text-base-content/60">
                World facts remain read only. Only the Campaign overlay is
                saved.
              </p>
              <Button
                disabled={
                  mode === "independent"
                    ? !locationId || !definitionId
                    : !capturedWorldPlacementId ||
                      !selectedWorldPlacement?.locationId
                }
              >
                {editingId ? "Save placement" : "Add to draft"}
              </Button>
            </div>
          </form>
        </div>
      </CampaignDraftRequired>
    </main>
  );
}

export function CampaignPreparationPage() {
  const { draft, saveDraft, markDirty } = useCampaignDefinitionAuthoring();
  const preparation = objectValue(draft?.content.preparation);
  const [startingContext, setStartingContext] = useState(
    stringValue(preparation.startingContext),
  );
  const [startingLocationId, setStartingLocationId] = useState(
    stringValue(preparation.startingLocationId),
  );
  const [mapVariations, setMapVariations] = useState(
    stringValue(preparation.mapVariations),
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    await saveDraft({
      ...draft,
      content: {
        ...draft.content,
        preparation: {
          ...(startingLocationId ? { startingLocationId } : {}),
          startingContext: startingContext.trim(),
          mapVariations: mapVariations.trim(),
        },
      },
    });
  }
  return (
    <main className={pageClass}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World context
      </p>
      <h1 className="mt-3 text-4xl font-semibold">Preparation defaults</h1>
      <p className="mt-3 max-w-3xl text-base-content/65">
        Define reusable starting context and staging guidance for future
        Campaign Instances.
      </p>
      <Alert tone="info" className="mt-6">
        Preparation defaults never contain membership, attendance, current
        positions, revealed knowledge, Sessions, or runtime state.
      </Alert>
      <CampaignDraftRequired>
        <form className="mt-8 space-y-6" onSubmit={save}>
          <Label>
            Starting Location
            <Select
              className="mt-2 w-full"
              value={startingLocationId}
              onChange={(event) => {
                setStartingLocationId(event.currentTarget.value);
                markDirty();
              }}
            >
              <option value="">Choose later in a Campaign Instance</option>
              {(draft?.capturedWorldContent?.locations ?? []).map(
                (location) => (
                  <option key={location.id} value={location.id}>
                    {location.name || "Unnamed captured Location"}
                  </option>
                ),
              )}
            </Select>
          </Label>
          <Label>
            Starting context
            <Textarea
              className="mt-2 min-h-40 w-full"
              value={startingContext}
              onChange={(event) => {
                setStartingContext(event.currentTarget.value);
                markDirty();
              }}
            />
          </Label>
          <Label>
            Source-map variations
            <Textarea
              className="mt-2 min-h-40 w-full"
              value={mapVariations}
              onChange={(event) => {
                setMapVariations(event.currentTarget.value);
                markDirty();
              }}
            />
          </Label>
          <Button>Save preparation defaults</Button>
        </form>
      </CampaignDraftRequired>
    </main>
  );
}

export function CampaignVersionsPage() {
  const { definition, draft, canEdit, adoptDraft } =
    useCampaignDefinitionAuthoring();
  const router = useRouter();
  const navigate = useInternalNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [impact, setImpact] = useState<CampaignDraftImpact>();
  const [forkSnapshotId, setForkSnapshotId] = useState("");
  const [forkSourceLabel, setForkSourceLabel] = useState("");
  const [forkName, setForkName] = useState("");
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  async function archive() {
    if (definition.metadataRevision === undefined) return;
    setBusy(true);
    try {
      await archiveCampaignDefinition(
        definition.id,
        definition.metadataRevision,
      );
      await router.invalidate();
    } catch {
      setMessage(
        "The Definition changed before it could be archived. Reload and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function inspectImpact() {
    setBusy(true);
    setMessage("");
    try {
      setImpact(await getCampaignDefinitionDraftImpact(definition.id));
    } catch {
      setMessage("Draft impact could not be loaded. Reload and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function resetDraft() {
    if (
      !draft ||
      !window.confirm(
        "Discard every unpublished Campaign change and reset this draft to its published revision? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      adoptDraft(
        await resetCampaignDefinitionDraft(
          definition.id,
          draft.storageRevision,
        ),
      );
      setImpact(undefined);
      await router.invalidate();
      setMessage(
        "Unpublished changes were discarded. The draft now matches the published revision.",
      );
    } catch {
      setMessage(
        "The draft changed before it could be reset. Reload and review it before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createFork(event: FormEvent) {
    event.preventDefault();
    if (
      !forkSnapshotId ||
      !forkName.trim() ||
      !window.confirm(
        `Create ${forkName.trim()} as an independent Campaign Definition from ${forkSourceLabel}?`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const fork = await forkCampaignDefinition(definition.id, {
        sourceSnapshotId: forkSnapshotId,
        name: forkName.trim(),
      });
      await navigate(
        `/campaigns/definitions/${encodeURIComponent(fork.id)}${guideSuffix}`,
      );
    } catch {
      setMessage(
        "The Campaign fork could not be created. No source revision changed.",
      );
      setBusy(false);
    }
  }
  const revisions = definition.revisions ?? [];
  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Lifecycle
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Versions</h1>
          <p className="mt-3 text-base-content/65">
            Published Campaign revisions and their exact captured World
            provenance.
          </p>
        </div>
        {canEdit && (
          <Button tone="danger" loading={busy} onClick={() => void archive()}>
            Archive Definition
          </Button>
        )}
      </div>
      {message && (
        <Alert
          tone={
            message.startsWith("Unpublished changes were discarded")
              ? "success"
              : "error"
          }
          role="alert"
          className="mt-6"
        >
          {message}
        </Alert>
      )}
      {draft && (
        <section className="card mt-8 border border-primary/25 bg-primary/[0.06]">
          <div className="card-body">
            <Badge tone="primary">Working draft</Badge>
            <h2 className="card-title mt-2">
              {draft.revisionName || "Unpublished Campaign changes"}
            </h2>
            <p>
              Captured{" "}
              {draft.capturedWorld.worldName ||
                draft.capturedWorld.name ||
                "Unavailable World"}{" "}
              revision {draft.capturedWorld.revisionNumber}
            </p>
            <RouterButtonLink
              href={`/campaigns/definitions/${encodeURIComponent(definition.id)}/versions/draft/review${guideSuffix}`}
              tone="primary"
              className="mt-3 self-start"
            >
              Review &amp; publish
            </RouterButtonLink>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                tone="outline"
                loading={busy}
                onClick={() => void inspectImpact()}
              >
                Review draft impact
              </Button>
              {draft.baseRevisionId && canEdit && (
                <Button
                  type="button"
                  tone="danger"
                  loading={busy}
                  onClick={() => void resetDraft()}
                >
                  Discard unpublished changes
                </Button>
              )}
            </div>
            {impact && (
              <div className="mt-4 rounded-box border border-base-300 bg-base-100/60 p-4">
                <h3 className="font-semibold">Draft impact</h3>
                <p className="mt-2 text-sm">
                  {impact.changes.added} added · {impact.changes.changed}{" "}
                  changed · {impact.changes.removed} removed
                </p>
                {impact.downstreamInstances.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    {impact.downstreamInstances.map((instance) => (
                      <li key={`${instance.name}-${instance.status}`}>
                        {instance.name || "Unnamed Campaign Instance"} ·{" "}
                        {instance.status}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-base-content/60">
                    No Campaign Instances depend on this Definition yet.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}
      <div className="mt-6 space-y-3">
        {revisions.map((revision) => (
          <article
            key={revision.id}
            className="rounded-box border border-base-300 bg-base-200 p-5"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-semibold">
                Campaign revision {revision.revisionNumber}
              </h2>
              <Badge>
                {definition.currentRevisionId === revision.id
                  ? "Current"
                  : "Published"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-base-content/60">
              {revision.capturedWorld.worldName ||
                revision.capturedWorld.name ||
                "Unavailable captured World"}{" "}
              · World revision {revision.capturedWorld.revisionNumber} ·{" "}
              {dateLabel(revision.publishedAt)}
            </p>
            {revision.snapshot && canEdit && (
              <Button
                type="button"
                tone="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setForkSnapshotId(revision.snapshot!.id);
                  setForkSourceLabel(
                    `Campaign revision ${revision.revisionNumber} · ${revision.name || "Unnamed revision"}`,
                  );
                  setForkName(`${definition.name} fork`);
                }}
              >
                Fork this revision
              </Button>
            )}
          </article>
        ))}
      </div>
      {forkSnapshotId && (
        <form
          onSubmit={(event) => void createFork(event)}
          className="mt-8 rounded-box border border-base-300 bg-base-200 p-5"
        >
          <h2 className="text-xl font-semibold">Fork Campaign Definition</h2>
          <p className="mt-2 text-sm text-base-content/60">
            Source: {forkSourceLabel}
          </p>
          <Label className="mt-4 block">
            New Campaign Definition name
            <Input
              required
              className="mt-2 w-full"
              value={forkName}
              onChange={(event) => setForkName(event.currentTarget.value)}
            />
          </Label>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button loading={busy}>Create independent fork</Button>
            <Button
              type="button"
              tone="ghost"
              onClick={() => setForkSnapshotId("")}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}

export function CampaignReviewPage() {
  const { definition, draft } = useCampaignDefinitionAuthoring();
  const router = useRouter();
  const [issues, setIssues] = useState<
    Array<{ code: string; subject: string; detail: string }>
  >([]);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function validate() {
    if (!draft) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await validateCampaignDefinitionDraft(
        definition.id,
        draft.storageRevision,
      );
      setIssues(result.issues);
      setValid(result.valid);
      setMessage(
        result.valid
          ? "This complete draft is ready to publish."
          : "Resolve every issue before publishing.",
      );
    } catch {
      setMessage("The draft could not be validated.");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!draft || !valid) return;
    setBusy(true);
    try {
      await publishCampaignDefinitionDraft(
        definition.id,
        draft.storageRevision,
      );
      await router.navigate({
        to: `/campaigns/definitions/${encodeURIComponent(definition.id)}`,
      });
      await router.invalidate();
    } catch {
      setMessage(
        "Publication failed. The previous published revision remains unchanged.",
      );
      setBusy(false);
    }
  }
  if (!draft)
    return (
      <main className={pageClass}>
        <Alert tone="warning">There is no working draft to review.</Alert>
      </main>
    );
  const plotCount = draft.records.filter(
    ({ resourceType }) => resourceType === "plots",
  ).length;
  const placementCount = draft.records.filter(
    ({ resourceType }) => resourceType === "campaign-placements",
  ).length;
  return (
    <main className={pageClass}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Lifecycle
      </p>
      <h1 className="mt-3 text-4xl font-semibold">Review &amp; publish</h1>
      <p className="mt-3 max-w-3xl text-base-content/65">
        Publication creates an immutable Campaign revision with the exact
        captured World snapshot. Existing Campaign Instances do not change.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReviewFact
          label="Captured World"
          value={`${draft.capturedWorld.worldName || draft.capturedWorld.name || "Unavailable World"} revision ${draft.capturedWorld.revisionNumber}`}
        />
        <ReviewFact label="Plots" value={String(plotCount)} />
        <ReviewFact
          label="Campaign placements"
          value={String(placementCount)}
        />
        <ReviewFact
          label="Exact Campaign model releases"
          value={String(arrayValue(draft.content.modelSchemaReleaseIds).length)}
        />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button tone="outline" loading={busy} onClick={() => void validate()}>
          Validate complete draft
        </Button>
        <Button
          disabled={!valid || busy}
          loading={busy}
          onClick={() => void publish()}
        >
          Publish Campaign revision
        </Button>
      </div>
      {message && (
        <Alert
          tone={valid ? "success" : "warning"}
          className="mt-5"
          aria-live="polite"
        >
          {message}
        </Alert>
      )}
      {issues.length > 0 && (
        <section className="mt-6" aria-labelledby="validation-heading">
          <h2 id="validation-heading" className="text-xl font-semibold">
            Required fixes
          </h2>
          <ul className="mt-3 space-y-3">
            {issues.map((issue, index) => (
              <li
                key={`${issue.code}-${index}`}
                className="rounded-box border border-error/25 bg-error/5 p-4"
              >
                <p className="font-semibold">
                  {humanReferenceLabel(
                    issue.subject,
                    "Affected Campaign content",
                  )}
                </p>
                <p className="mt-1 text-sm">{issue.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4">
      <p className="text-xs font-semibold uppercase text-base-content/60">
        {label}
      </p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

export function CampaignWorldMigrationPage() {
  const { definition, draft, adoptDraft } = useCampaignDefinitionAuthoring();
  const router = useRouter();
  const [world, setWorld] = useState<WorldDefinitionDetail>();
  const [targetSnapshotId, setTargetSnapshotId] = useState("");
  const [preview, setPreview] = useState<CampaignMigrationPreview>();
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [conflictOffset, setConflictOffset] = useState(0);
  const [candidateOffset, setCandidateOffset] = useState(0);
  const [impactOffset, setImpactOffset] = useState(0);
  const [changeOffset, setChangeOffset] = useState(0);
  const [reviewedChangeRanges, setReviewedChangeRanges] = useState<
    Array<{ start: number; end: number }>
  >([]);
  const [reviewedImpactRanges, setReviewedImpactRanges] = useState<
    Array<{ start: number; end: number }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (draft)
      void getWorldDefinition(draft.capturedWorld.worldDefinitionId).then(
        setWorld,
      );
  }, [draft?.capturedWorld.worldDefinitionId]);
  const targets = (world?.revisions ?? [])
    .filter(
      (revision) =>
        revision.predecessorRevisionId ===
        draft?.capturedWorld.worldDefinitionRevisionId,
    )
    .flatMap((revision) =>
      revision.snapshots.map((snapshot) => ({
        id: snapshot.id,
        revisionNumber: revision.revisionNumber,
        name: revision.name,
      })),
    )
    .filter(({ id }) => id !== draft?.capturedWorld.snapshotId);
  async function dryRun(
    nextConflictOffset = conflictOffset,
    nextCandidateOffset = candidateOffset,
    nextImpactOffset = impactOffset,
    nextChangeOffset = changeOffset,
  ) {
    if (!draft || !targetSnapshotId) return;
    setBusy(true);
    setMessage("");
    try {
      const nextPreview = await previewCampaignWorldMigration(definition.id, {
        expectedStorageRevision: draft.storageRevision,
        targetWorldDefinitionSnapshotId: targetSnapshotId,
        mappings: Object.entries(mappings).map(([key, targetId]) => {
          const [resourceType, sourceId] = key.split("\u0000");
          return {
            resourceType: resourceType!,
            sourceId: sourceId!,
            targetId,
          };
        }),
        conflictOffset: nextConflictOffset,
        candidateOffset: nextCandidateOffset,
        impactOffset: nextImpactOffset,
        changeOffset: nextChangeOffset,
      });
      setPreview(nextPreview);
      setReviewedChangeRanges((current) => [
        ...current,
        {
          start: nextPreview.changeSummary.offset,
          end:
            nextPreview.changeSummary.offset +
            Math.max(
              nextPreview.changeSummary.returned.added,
              nextPreview.changeSummary.returned.changed,
              nextPreview.changeSummary.returned.removed,
            ),
        },
      ]);
      setReviewedImpactRanges((current) => [
        ...current,
        {
          start: nextPreview.impact.offset,
          end:
            nextPreview.impact.offset +
            Math.max(
              nextPreview.impact.locationMoves.length,
              nextPreview.impact.affectedPlots.length,
              nextPreview.impact.affectedReferences.length,
              nextPreview.impact.modelReleases.added.length,
              nextPreview.impact.modelReleases.removed.length,
            ),
        },
      ]);
    } catch {
      setMessage("The complete migration comparison could not be prepared.");
    } finally {
      setBusy(false);
    }
  }
  async function resetBeforeMigration() {
    if (
      !draft ||
      !window.confirm(
        "Discard every unpublished Campaign change and reset to the published Campaign revision before migration? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      adoptDraft(
        await resetCampaignDefinitionDraft(
          definition.id,
          draft.storageRevision,
        ),
      );
      setPreview(undefined);
      setMappings({});
      setConflictOffset(0);
      setCandidateOffset(0);
      setImpactOffset(0);
      setChangeOffset(0);
      setReviewedChangeRanges([]);
      setReviewedImpactRanges([]);
      setMessage(
        "The draft now matches the published Campaign revision. You can preview migration safely.",
      );
    } catch {
      setMessage(
        "The draft changed before it could be reset. Reload and review it before migrating.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!draft || !preview || !migrationFullyReviewed) return;
    setBusy(true);
    try {
      await applyCampaignWorldMigration(definition.id, {
        expectedStorageRevision: draft.storageRevision,
        targetWorldDefinitionSnapshotId: targetSnapshotId,
        expectedPlanHash: preview.planHash,
        mappings: Object.entries(mappings).map(([key, targetId]) => {
          const [resourceType, sourceId] = key.split("\u0000");
          return { resourceType: resourceType!, sourceId: sourceId!, targetId };
        }),
      });
      await router.navigate({
        to: `/campaigns/definitions/${encodeURIComponent(definition.id)}/versions`,
      });
      await router.invalidate();
    } catch {
      setMessage(
        "Migration did not apply. The current Campaign and captured World remain unchanged.",
      );
      setBusy(false);
    }
  }
  const migrationItems: Array<{
    subject: string;
    detail: string;
    status: string;
    source?: { resourceType: string; id: string };
    candidates?: Array<{ id: string; label: string; typeLabel: string }>;
  }> = preview
    ? [
        ...preview.conflicts.map((item) => ({
          ...item,
          subject: item.sourceLabel || item.subject,
          status: "Needs reconciliation",
        })),
        ...preview.changes.added.map((item) => ({
          subject: item.name,
          detail: `${item.typeLabel} is added by the target World revision.`,
          status: "Added",
        })),
        ...preview.changes.changed.map((item) => ({
          subject: item.name,
          detail: `${item.typeLabel} changes in the target World revision.`,
          status: "Changed",
        })),
        ...preview.changes.removed.map((item) => ({
          subject: item.name,
          detail: `${item.typeLabel} is removed by the target World revision.`,
          status: "Removed",
        })),
      ]
    : [];
  const allChangesReviewed = preview
    ? reviewedRangesCoverTotal(
        reviewedChangeRanges,
        Math.max(
          preview.changeSummary.added,
          preview.changeSummary.changed,
          preview.changeSummary.removed,
        ),
      )
    : false;
  const allImpactsReviewed = preview
    ? reviewedRangesCoverTotal(
        reviewedImpactRanges,
        Math.max(
          preview.impact.summary.locationMoves,
          preview.impact.summary.affectedPlots,
          preview.impact.summary.affectedReferences,
          preview.impact.summary.modelReleasesAdded,
          preview.impact.summary.modelReleasesRemoved,
        ),
      )
    : false;
  const migrationFullyReviewed =
    Boolean(preview?.ready) && allChangesReviewed && allImpactsReviewed;
  return (
    <main className={pageClass}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Lifecycle
      </p>
      <h1 className="mt-3 text-4xl font-semibold">World migration</h1>
      <p className="mt-3 max-w-3xl text-base-content/65">
        Compare and adopt one complete direct-lineage World revision. Individual
        changes cannot be selected.
      </p>
      <Alert tone="info" className="mt-6">
        Existing Campaign Instances remain on their captured Campaign and World
        revisions. Migration never edits the source World.
      </Alert>
      <CampaignDraftRequired>
        <section className="card mt-8 border border-base-300 bg-base-200">
          <div className="card-body gap-4">
            <h2 className="card-title">Prepare dry run</h2>
            <p>
              Current capture:{" "}
              <strong>
                {draft?.capturedWorld.worldName ||
                  draft?.capturedWorld.name ||
                  "Unavailable World"}{" "}
                revision {draft?.capturedWorld.revisionNumber ?? "unavailable"}
              </strong>
            </p>
            <Label>
              Target direct-lineage World revision
              <Select
                className="mt-2 w-full"
                value={targetSnapshotId}
                onChange={(event) => {
                  setTargetSnapshotId(event.currentTarget.value);
                  setPreview(undefined);
                  setMappings({});
                  setConflictOffset(0);
                  setCandidateOffset(0);
                  setImpactOffset(0);
                  setChangeOffset(0);
                  setReviewedChangeRanges([]);
                  setReviewedImpactRanges([]);
                }}
              >
                <option value="">Choose a newer revision</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    Revision {target.revisionNumber} ·{" "}
                    {target.name || "Unnamed revision"}
                  </option>
                ))}
              </Select>
            </Label>
            <Button
              className="self-start"
              tone="outline"
              loading={busy}
              disabled={!targetSnapshotId}
              onClick={() => void dryRun()}
            >
              Preview complete migration
            </Button>
            {draft?.baseRevisionId && (
              <Button
                className="self-start"
                tone="danger"
                loading={busy}
                onClick={() => void resetBeforeMigration()}
              >
                Discard changes and reset before migration
              </Button>
            )}
          </div>
        </section>
        {message && (
          <Alert
            tone={
              message.startsWith("The draft now matches") ? "success" : "error"
            }
            role="alert"
            className="mt-5"
          >
            {message}
          </Alert>
        )}
        {preview && (
          <section className="mt-8" aria-labelledby="migration-result-heading">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2
                  id="migration-result-heading"
                  className="text-2xl font-semibold"
                >
                  {preview.sourceWorld.worldName ||
                    preview.sourceWorld.name ||
                    "Unavailable World"}{" "}
                  revision {preview.sourceWorld.revisionNumber} →{" "}
                  {preview.targetWorld.worldName ||
                    preview.targetWorld.name ||
                    "Unavailable World"}{" "}
                  revision {preview.targetWorld.revisionNumber}
                </h2>
                <p className="mt-2 text-sm text-base-content/60">
                  {preview.ready
                    ? "All required mappings are resolved."
                    : "Resolve every blocker before applying."}
                </p>
              </div>
              <Badge tone={preview.ready ? "success" : "warning"}>
                {preview.ready ? "Ready" : "Blocked"}
              </Badge>
            </div>
            <div className="mt-5 space-y-3">
              {migrationItems.map((item, index) => (
                <article
                  key={index}
                  className="rounded-box border border-base-300 bg-base-200 p-4"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <h3 className="font-semibold">
                      {humanReferenceLabel(
                        item.subject,
                        "Affected captured content",
                      )}
                    </h3>
                    <Badge
                      tone={
                        item.status === "Needs reconciliation" ||
                        item.status === "Removed"
                          ? "warning"
                          : "info"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm">{item.detail}</p>
                  {item.source &&
                    item.candidates &&
                    item.candidates.length > 0 && (
                      <Label className="mt-4 block">
                        Reconcile with target content
                        <Select
                          className="mt-2 w-full max-w-xl"
                          value={
                            mappings[
                              `${item.source.resourceType}\u0000${item.source.id}`
                            ] ?? ""
                          }
                          onChange={(event) => {
                            const key = `${item.source!.resourceType}\u0000${item.source!.id}`;
                            setMappings((current) => ({
                              ...current,
                              [key]: event.currentTarget.value,
                            }));
                          }}
                        >
                          <option value="">
                            Choose a compatible replacement
                          </option>
                          {item.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label} · {candidate.typeLabel}
                            </option>
                          ))}
                        </Select>
                      </Label>
                    )}
                </article>
              ))}
            </div>
            <p className="mt-4 text-sm text-base-content/60">
              World changes: {preview.changeSummary.added} added ·{" "}
              {preview.changeSummary.changed} changed ·{" "}
              {preview.changeSummary.removed} removed
            </p>
            {(preview.changeSummary.offset > 0 ||
              preview.changeSummary.nextOffset !== undefined) && (
              <nav
                aria-label="World change pages"
                className="mt-4 flex flex-wrap items-center gap-3"
              >
                <Button
                  type="button"
                  tone="outline"
                  disabled={preview.changeSummary.offset === 0 || busy}
                  onClick={() => {
                    const next = Math.max(0, preview.changeSummary.offset - 50);
                    setChangeOffset(next);
                    void dryRun(
                      conflictOffset,
                      candidateOffset,
                      impactOffset,
                      next,
                    );
                  }}
                >
                  Previous World changes
                </Button>
                <span className="text-sm">
                  World change details from {preview.changeSummary.offset + 1}
                </span>
                <Button
                  type="button"
                  tone="outline"
                  disabled={
                    busy || preview.changeSummary.nextOffset === undefined
                  }
                  onClick={() => {
                    const next = preview.changeSummary.nextOffset;
                    if (next === undefined) return;
                    setChangeOffset(next);
                    void dryRun(
                      conflictOffset,
                      candidateOffset,
                      impactOffset,
                      next,
                    );
                  }}
                >
                  More World changes
                </Button>
              </nav>
            )}
            <section
              className="mt-8 rounded-box border border-base-300 bg-base-200 p-5"
              aria-labelledby="migration-impact-heading"
            >
              <h3
                id="migration-impact-heading"
                className="text-xl font-semibold"
              >
                Campaign impact
              </h3>
              <p className="mt-2 text-sm text-base-content/60">
                {preview.impact.summary.locationMoves} Location moves ·{" "}
                {preview.impact.summary.affectedPlots} affected Plots ·{" "}
                {preview.impact.summary.affectedReferences} affected references
                · {preview.impact.summary.modelReleasesAdded} model releases
                added · {preview.impact.summary.modelReleasesRemoved} model
                releases removed
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {preview.impact.locationMoves.map((move) => (
                  <article
                    key={`${move.locationName}-${move.fromParentName}-${move.toParentName}`}
                  >
                    <h4 className="font-semibold">
                      {move.locationName || "Affected Location"}
                    </h4>
                    <p className="text-sm">
                      Moves from {move.fromParentName || "World root"} to{" "}
                      {move.toParentName || "World root"}.
                    </p>
                  </article>
                ))}
                {preview.impact.affectedPlots.map((plot) => (
                  <article key={plot.plotName}>
                    <h4 className="font-semibold">
                      {plot.plotName || "Affected Plot"}
                    </h4>
                    <p className="text-sm">
                      {plot.reasons.length
                        ? plot.reasons.join(" · ")
                        : "References changed World content."}
                    </p>
                  </article>
                ))}
                {preview.impact.affectedReferences.map((reference) => (
                  <article key={`${reference.typeLabel}-${reference.name}`}>
                    <h4 className="font-semibold">
                      {reference.name || "Affected World content"}
                    </h4>
                    <p className="text-sm">
                      {reference.typeLabel} will be {reference.change}.
                    </p>
                  </article>
                ))}
                {preview.impact.modelReleases.added.map((release) => (
                  <article key={`added-${release.name}`}>
                    <h4 className="font-semibold">
                      {release.name || "Model release"}
                    </h4>
                    <p className="text-sm">Model release will be adopted.</p>
                  </article>
                ))}
                {preview.impact.modelReleases.removed.map((release) => (
                  <article key={`removed-${release.name}`}>
                    <h4 className="font-semibold">
                      {release.name || "Model release"}
                    </h4>
                    <p className="text-sm">
                      Model release will no longer be captured.
                    </p>
                  </article>
                ))}
              </div>
              {(preview.impact.offset > 0 ||
                preview.impact.nextOffset !== undefined) && (
                <nav
                  aria-label="Migration impact pages"
                  className="mt-5 flex flex-wrap items-center gap-3"
                >
                  <Button
                    type="button"
                    tone="outline"
                    disabled={preview.impact.offset === 0 || busy}
                    onClick={() => {
                      const next = Math.max(0, preview.impact.offset - 50);
                      setImpactOffset(next);
                      void dryRun(conflictOffset, candidateOffset, next);
                    }}
                  >
                    Previous impacts
                  </Button>
                  <span className="text-sm">
                    Impact details from {preview.impact.offset + 1}
                  </span>
                  <Button
                    type="button"
                    tone="outline"
                    disabled={busy || preview.impact.nextOffset === undefined}
                    onClick={() => {
                      const next = preview.impact.nextOffset;
                      if (next === undefined) return;
                      setImpactOffset(next);
                      void dryRun(conflictOffset, candidateOffset, next);
                    }}
                  >
                    More impacts
                  </Button>
                </nav>
              )}
            </section>
            {preview.presentationTruncated &&
              (!allChangesReviewed || !allImpactsReviewed) && (
                <Alert tone="warning" className="mt-5">
                  This migration has more review pages. Review every World
                  change and Campaign impact page before applying it.
                </Alert>
              )}
            {preview.conflictSummary?.truncated && (
              <nav
                aria-label="Migration conflict pages"
                className="mt-6 flex flex-wrap items-center gap-3"
              >
                <Button
                  type="button"
                  tone="outline"
                  disabled={preview.conflictSummary.offset === 0 || busy}
                  onClick={() => {
                    const next = Math.max(
                      0,
                      preview.conflictSummary!.offset - 50,
                    );
                    setConflictOffset(next);
                    void dryRun(next, candidateOffset, impactOffset);
                  }}
                >
                  Previous conflicts
                </Button>
                <span className="text-sm">
                  Showing {preview.conflictSummary.offset + 1}–
                  {preview.conflictSummary.offset +
                    preview.conflictSummary.returned}{" "}
                  of {preview.conflictSummary.total}
                </span>
                <Button
                  type="button"
                  tone="outline"
                  disabled={
                    preview.conflictSummary.nextOffset === undefined || busy
                  }
                  onClick={() => {
                    const next = preview.conflictSummary!.nextOffset ?? 0;
                    setConflictOffset(next);
                    void dryRun(next, candidateOffset, impactOffset);
                  }}
                >
                  Next conflicts
                </Button>
              </nav>
            )}
            {preview.conflicts.some(
              ({ candidateSummary }) => candidateSummary?.truncated,
            ) && (
              <nav
                aria-label="Migration replacement pages"
                className="mt-4 flex flex-wrap items-center gap-3"
              >
                <Button
                  type="button"
                  tone="outline"
                  disabled={candidateOffset === 0 || busy}
                  onClick={() => {
                    const next = Math.max(0, candidateOffset - 12);
                    setCandidateOffset(next);
                    void dryRun(conflictOffset, next, impactOffset);
                  }}
                >
                  Previous replacements
                </Button>
                <span className="text-sm">
                  Replacement choices {candidateOffset + 1} onward
                </span>
                <Button
                  type="button"
                  tone="outline"
                  disabled={
                    busy ||
                    preview.conflicts.every(
                      ({ candidateSummary }) =>
                        !candidateSummary ||
                        candidateSummary.offset + candidateSummary.returned >=
                          candidateSummary.total,
                    )
                  }
                  onClick={() => {
                    const next = candidateOffset + 12;
                    setCandidateOffset(next);
                    void dryRun(conflictOffset, next, impactOffset);
                  }}
                >
                  More replacements
                </Button>
              </nav>
            )}
            {preview.conflicts.length > 0 && (
              <Button
                className="mt-6"
                tone="outline"
                loading={busy}
                onClick={() => void dryRun()}
              >
                Update dry run with mappings
              </Button>
            )}
            <Button
              className="mt-6 ml-0 sm:ml-3"
              loading={busy}
              disabled={!migrationFullyReviewed}
              onClick={() => void apply()}
            >
              Apply complete migration
            </Button>
            {preview.ready && !migrationFullyReviewed && (
              <p className="mt-3 text-sm text-base-content/60">
                Apply unlocks after every World change and Campaign impact page
                has been reviewed.
              </p>
            )}
          </section>
        )}
      </CampaignDraftRequired>
    </main>
  );
}
