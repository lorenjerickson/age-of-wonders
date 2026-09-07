import {
  buildSnapshotManifest,
  canonicalJsonHash,
  MAX_SNAPSHOT_RECORDS,
  type SnapshotRecordInput,
} from "./snapshot-manifest";
import { CORE_MODEL_SCHEMA_RELEASE_ID } from "../model-registry/editable-core-model-seed";

export const LEGACY_REALIGNMENT_SHADOW_PLAN_VERSION =
  "aow:legacy-realignment-shadow-plan/v1" as const;

type JsonObject = Readonly<Record<string, unknown>>;

export interface LegacyShadowDomainRecord {
  readonly resource: string;
  readonly id: string;
  readonly kind: string | null;
  readonly name?: string | null;
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly data: JsonObject;
}

export interface LegacyShadowCampaignRelation {
  readonly id: string;
  readonly campaignId: string;
  readonly data: JsonObject;
}

export interface LegacyShadowCharacterDraft {
  readonly id: string;
  readonly membershipId: string;
  readonly characterId: string | null;
  readonly data: JsonObject;
}

export interface LegacyRealignmentShadowDataset {
  /** Caller-supplied capture time; the planner never reads the wall clock. */
  readonly capturedAt: string;
  readonly domainRecords: readonly LegacyShadowDomainRecord[];
  readonly memberships: readonly LegacyShadowCampaignRelation[];
  readonly invitations: readonly LegacyShadowCampaignRelation[];
  readonly characterDrafts: readonly LegacyShadowCharacterDraft[];
}

export type RealignmentTargetType =
  | "world-definition"
  | "world-definition-revision"
  | "world-definition-snapshot"
  | "campaign-definition"
  | "campaign-definition-revision"
  | "campaign-definition-snapshot"
  | "campaign-instance"
  | "campaign-instance-snapshot"
  | "campaign-instance-runtime"
  | "campaign-instance-session";

export interface ProposedShadowRow<Payload = JsonObject> {
  readonly id: string;
  readonly payload: Payload;
}

export interface ProposedSnapshotRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly contentHash: string;
  readonly payload: JsonObject;
}

export interface ProposedSnapshotManifest {
  readonly formatVersion: 1;
  readonly contentHash: string;
  readonly records: readonly ProposedSnapshotRecord[];
}

function proposedManifest(
  records: readonly SnapshotRecordInput[],
): ProposedSnapshotManifest {
  const manifest = buildSnapshotManifest(1, records);
  return {
    formatVersion: 1,
    contentHash: manifest.contentHash,
    records: manifest.records as readonly ProposedSnapshotRecord[],
  };
}

export interface ProposedWorldDefinitionPayload {
  readonly name: string;
  readonly currentRevisionId: string;
  readonly legacyRootPayload: JsonObject;
}

export interface ProposedWorldDefinitionRevisionPayload {
  readonly worldDefinitionId: string;
  readonly revisionNumber: 1;
  readonly publishedAt: string;
  readonly contentHash: string;
  readonly rootLocationId: string;
  readonly content: JsonObject;
}

export interface ProposedWorldDefinitionSnapshotPayload {
  readonly worldDefinitionId: string;
  readonly worldDefinitionRevisionId: string;
  readonly capturedAt: string;
  readonly manifest: ProposedSnapshotManifest;
}

export interface ProposedWorldDefinitionDraftPayload {
  readonly worldDefinitionId: string;
  readonly baseRevisionId: string;
  readonly baseSnapshotId: string;
  readonly revisionName: string;
  readonly content: JsonObject;
  readonly snapshotRecords: readonly ProposedSnapshotRecord[];
}

export interface ProposedCampaignDefinitionPayload {
  readonly name: string;
  readonly worldDefinitionId: string;
  readonly currentRevisionId: string;
}

export interface ProposedCampaignDefinitionRevisionPayload {
  readonly campaignDefinitionId: string;
  readonly revisionNumber: 1;
  readonly publishedAt: string;
  readonly contentHash: string;
  readonly capturedWorldSnapshotId: string;
  readonly legacyCampaignPayload: JsonObject;
}

export interface ProposedCampaignDefinitionSnapshotPayload {
  readonly campaignDefinitionId: string;
  readonly campaignDefinitionRevisionId: string;
  readonly capturedWorldSnapshotId: string;
  readonly capturedAt: string;
  readonly manifest: ProposedSnapshotManifest;
}

export interface ProposedCampaignDefinitionDraftPayload {
  readonly campaignDefinitionId: string;
  readonly worldDefinitionId: string;
  readonly baseRevisionId: string;
  readonly baseSnapshotId: string;
  readonly capturedWorldSnapshotId: string;
  readonly revisionName: string;
  readonly content: JsonObject;
  readonly snapshotRecords: readonly ProposedSnapshotRecord[];
}

export interface ProposedCampaignInstancePayload {
  readonly name: string;
  readonly campaignDefinitionId: string;
  readonly currentSnapshotId: string;
  readonly status: "active";
  readonly createdAt: string;
}

export interface ProposedCampaignInstanceSnapshotPayload {
  readonly campaignInstanceId: string;
  readonly snapshotNumber: 1;
  readonly campaignDefinitionSnapshotId: string;
  readonly worldDefinitionSnapshotId: string;
  readonly adoptedAt: string;
  readonly manifest: ProposedSnapshotManifest;
}

export interface ProposedCampaignInstanceRuntimePayload {
  readonly campaignInstanceId: string;
  readonly campaignInstanceSnapshotId: string;
  readonly legacyGamePayload: JsonObject | null;
}

export interface ProposedCampaignInstanceSessionPayload {
  readonly campaignInstanceId: string;
  readonly name: string;
  readonly status:
    | "planned"
    | "lobby"
    | "active"
    | "paused"
    | "concluded"
    | "cancelled";
  readonly metadataRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly lobbyOpenedAt?: string;
  readonly pausedAt?: string;
  readonly concludedAt?: string;
  readonly cancelledAt?: string;
  readonly cancellationReason?: string;
  readonly legacyPayload: JsonObject;
}

export interface LegacyIdentityMapEntry {
  readonly legacyResource: string;
  readonly legacyId: string;
  readonly targetType: RealignmentTargetType;
  readonly targetId: string;
}

export interface LegacyDependentRebinding {
  readonly legacyResource:
    | "sessions"
    | "memberships"
    | "invitations"
    | "character-drafts"
    | "characters";
  readonly legacyId: string;
  readonly campaignInstanceId: string;
  /** Exact sanitized legacy payload; the planner does not rewrite it in place. */
  readonly payload: JsonObject;
}

export interface LegacyRealignmentShadowPlanIssue {
  readonly code: string;
  readonly legacyResource: string;
  readonly legacyId: string;
  readonly detail: string;
}

export class LegacyRealignmentShadowPlanError extends Error {
  constructor(readonly issues: readonly LegacyRealignmentShadowPlanIssue[]) {
    super(
      `Legacy realignment shadow conversion is blocked by ${issues.length} issue${issues.length === 1 ? "" : "s"}.`,
    );
    this.name = "LegacyRealignmentShadowPlanError";
  }
}

export interface LegacyRealignmentShadowPlanRows {
  readonly worldDefinitions: readonly ProposedShadowRow<ProposedWorldDefinitionPayload>[];
  readonly worldDefinitionRevisions: readonly ProposedShadowRow<ProposedWorldDefinitionRevisionPayload>[];
  readonly worldDefinitionSnapshots: readonly ProposedShadowRow<ProposedWorldDefinitionSnapshotPayload>[];
  readonly worldDefinitionDrafts: readonly ProposedShadowRow<ProposedWorldDefinitionDraftPayload>[];
  readonly campaignDefinitions: readonly ProposedShadowRow<ProposedCampaignDefinitionPayload>[];
  readonly campaignDefinitionRevisions: readonly ProposedShadowRow<ProposedCampaignDefinitionRevisionPayload>[];
  readonly campaignDefinitionSnapshots: readonly ProposedShadowRow<ProposedCampaignDefinitionSnapshotPayload>[];
  readonly campaignDefinitionDrafts: readonly ProposedShadowRow<ProposedCampaignDefinitionDraftPayload>[];
  readonly campaignInstances: readonly ProposedShadowRow<ProposedCampaignInstancePayload>[];
  readonly campaignInstanceSnapshots: readonly ProposedShadowRow<ProposedCampaignInstanceSnapshotPayload>[];
  readonly campaignInstanceRuntimes: readonly ProposedShadowRow<ProposedCampaignInstanceRuntimePayload>[];
  readonly campaignInstanceSessions: readonly ProposedShadowRow<ProposedCampaignInstanceSessionPayload>[];
}

export interface LegacyRealignmentShadowPlan {
  readonly version: typeof LEGACY_REALIGNMENT_SHADOW_PLAN_VERSION;
  readonly mode: "read-only";
  readonly capturedAt: string;
  readonly rows: LegacyRealignmentShadowPlanRows;
  readonly legacyIdentityMap: readonly LegacyIdentityMapEntry[];
  readonly dependentRebindings: readonly LegacyDependentRebinding[];
  /** Explicitly classified legacy rows whose target aggregate is deferred. */
  readonly retainedLegacyRecords: readonly LegacyShadowDomainRecord[];
}

const REQUIRED_WORLD_OWNED_RESOURCES = new Set([
  "definitions",
  "creatures",
  "items",
  "objects",
  "scenes",
  "location-connections",
  "encounters",
]);

const DEFERRED_LEGACY_RESOURCES = new Set([
  "rule-variants",
  "content-packs",
  "extension-schemas",
  "systems",
  "pending-decisions",
  "game-events",
]);

const objectOrEmpty = (value: unknown): JsonObject =>
  isObject(value) ? value : {};

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function contentHash(value: unknown): string {
  return canonicalJsonHash(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
}

function humanName(
  record: LegacyShadowDomainRecord | undefined,
  fallback: string,
): string {
  if (!record) return fallback;
  if (typeof record.data.name === "string" && record.data.name.trim()) {
    return record.data.name.trim();
  }
  const identity = objectOrEmpty(record.data.identity);
  if (typeof identity.name === "string" && identity.name.trim()) {
    return identity.name.trim();
  }
  return record.name?.trim() || fallback;
}

function validIso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

function atOrAfter(value: string, minimum: string): string {
  return new Date(value).getTime() >= new Date(minimum).getTime()
    ? value
    : minimum;
}

function worldDraftContent(
  root: LegacyShadowDomainRecord,
  records: readonly ProposedSnapshotRecord[],
): JsonObject {
  const locations = records
    .filter((record) => record.resourceType === "locations")
    .map((record) => record.sourceId);
  const legacyDefinitionIds = strings(root.data.definitionIds);
  const legacyModelSchemaReleaseIds = strings(
    root.data.modelSchemaReleaseIds,
  );
  return {
    ...root.data,
    formatVersion: 1,
    rootLocationId: root.id,
    locationIds: locations,
    // Legacy Definition and Creature payloads remain lossless draft records.
    // Wave 3 canonical authoring may promote them without misrepresenting them
    // as already conforming to the newer Definition contract.
    definitionIds: [],
    schemaDefinitionIds: strings(root.data.schemaDefinitionIds),
    worldPlacementDefinitionIds: strings(
      root.data.worldPlacementDefinitionIds,
    ),
    modelSchemaReleaseIds: [CORE_MODEL_SCHEMA_RELEASE_ID],
    extensions: {
      ...objectOrEmpty(root.data.extensions),
      "aow:legacy-recovery": {
        sourceResource: root.resource,
        sourceRevision: root.revision,
        definitionIds: legacyDefinitionIds,
        modelSchemaReleaseIds: legacyModelSchemaReleaseIds,
      },
    },
  };
}

function campaignPlacementRecords(
  campaign: LegacyShadowDomainRecord,
  recordsByKey: ReadonlyMap<string, LegacyShadowDomainRecord>,
): ProposedSnapshotRecord[] {
  const result: ProposedSnapshotRecord[] = [];
  const append = (
    value: unknown,
    source:
      | { readonly kind: "world-creature"; readonly creatureId: string }
      | { readonly kind: "world-item"; readonly itemDefinitionId: string },
  ) => {
    if (!isObject(value)) return;
    const id = value.id;
    const locationId = value.locationId;
    if (
      typeof id !== "string" ||
      !id.trim() ||
      typeof locationId !== "string" ||
      !locationId.trim()
    ) {
      return;
    }
    const referenced =
      source.kind === "world-creature"
        ? recordsByKey.get(`creatures\0${source.creatureId}`)
        : recordsByKey.get(`definitions\0${source.itemDefinitionId}`);
    const payload = {
      id,
      kind: "independent",
      name: humanName(referenced, "Imported Campaign placement"),
      locationId,
      plotDefinitionIds: strings(value.plotDefinitionIds),
      source,
      extensions: { "aow:legacy-placement": value },
    };
    result.push({
      resourceType: "campaign-placements",
      sourceId: id,
      sourceRevision: campaign.revision,
      contentHash: contentHash(payload),
      payload,
    });
  };
  for (const value of Array.isArray(campaign.data.creaturePlacements)
    ? campaign.data.creaturePlacements
    : []) {
    if (!isObject(value) || typeof value.creatureId !== "string") continue;
    append(value, { kind: "world-creature", creatureId: value.creatureId });
  }
  for (const value of Array.isArray(campaign.data.itemPlacements)
    ? campaign.data.itemPlacements
    : []) {
    if (!isObject(value) || typeof value.itemDefinitionId !== "string") {
      continue;
    }
    append(value, {
      kind: "world-item",
      itemDefinitionId: value.itemDefinitionId,
    });
  }
  return result.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function campaignDraftContent(
  campaign: LegacyShadowDomainRecord,
  placements: readonly ProposedSnapshotRecord[],
  recoveredPlotId?: string,
): JsonObject {
  const legacyModelSchemaReleaseIds = strings(
    campaign.data.modelSchemaReleaseIds,
  );
  const startingLocationId =
    typeof campaign.data.partyStartingLocationId === "string"
      ? campaign.data.partyStartingLocationId
      : undefined;
  const locationCanvases = Array.isArray(campaign.data.locationCanvases)
    ? campaign.data.locationCanvases
    : [];
  return {
    formatVersion: 1,
    gmPremise:
      typeof campaign.data.gmPremise === "string"
        ? campaign.data.gmPremise
        : "",
    playerIntroduction:
      typeof campaign.data.playerIntroduction === "string"
        ? campaign.data.playerIntroduction
        : "",
    plotDefinitionIds: recoveredPlotId ? [recoveredPlotId] : [],
    placementDefinitionIds: placements.map((record) => record.sourceId),
    // The recovered Campaign inherits the core selection from its captured
    // World. Legacy Campaign-specific selections remain metadata until they
    // can be independently materialized and validated.
    modelSchemaReleaseIds: [],
    ...((startingLocationId || locationCanvases.length > 0) && {
      preparation: {
        ...(startingLocationId ? { startingLocationId } : {}),
        ...(locationCanvases.length > 0 ? { locationCanvases } : {}),
      },
    }),
    extensions: {
      ...objectOrEmpty(campaign.data.extensions),
      "aow:legacy-recovery": {
        sourceResource: campaign.resource,
        sourceRevision: campaign.revision,
        modelSchemaReleaseIds: legacyModelSchemaReleaseIds,
        payload: campaign.data,
      },
    },
  };
}

function recoveredPlotRecord(
  campaign: LegacyShadowDomainRecord,
  campaignDefinitionId: string,
  placements: readonly ProposedSnapshotRecord[],
): ProposedSnapshotRecord | undefined {
  const discoveries = Array.isArray(campaign.data.discoveries)
    ? campaign.data.discoveries.filter(isObject)
    : [];
  const objectives = Array.isArray(campaign.data.objectives)
    ? campaign.data.objectives.filter(isObject)
    : [];
  const pressures = Array.isArray(campaign.data.pressures)
    ? campaign.data.pressures.filter(isObject)
    : [];
  const resistances = Array.isArray(campaign.data.resistances)
    ? campaign.data.resistances.filter(isObject)
    : [];
  if (
    discoveries.length === 0 &&
    objectives.length === 0 &&
    pressures.length === 0 &&
    resistances.length === 0
  ) {
    return undefined;
  }
  const plotId = `recovery:plot:${campaign.id}`;
  const namedEntries = (entries: readonly JsonObject[], noun: string) =>
    entries.map((entry, index) => ({
      id:
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id
          : `${plotId}:${noun}:${index + 1}`,
      name:
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name
          : `Recovered ${noun} ${index + 1}`,
      ...(typeof entry.description === "string"
        ? { description: entry.description }
        : {}),
      extensions: { "aow:legacy-recovery": entry },
    }));
  const projectedDiscoveries = discoveries.map((entry, index) => {
    const discoveryId =
      typeof entry.id === "string" && entry.id.trim()
        ? entry.id
        : `${plotId}:discovery:${index + 1}`;
    const grants = Array.isArray(entry.grants)
      ? entry.grants.filter(isObject)
      : [];
    const claims = grants.flatMap((grant, grantIndex) => {
      if (typeof grant.text !== "string" || !grant.text.trim()) return [];
      const legacyKind = typeof grant.kind === "string" ? grant.kind : "fact";
      const kind = legacyKind === "rumor" ? "rumor" : "truth";
      return [
        {
          id: `${discoveryId}:claim:${grantIndex + 1}`,
          kind,
          statement: grant.text,
          provenance: "Recovered from legacy Campaign discovery grant.",
          extensions: { "aow:legacy-recovery": grant },
        },
      ];
    });
    return {
      id: discoveryId,
      name:
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name
          : `Recovered discovery ${index + 1}`,
      claims,
      extensions: { "aow:legacy-recovery": entry },
    };
  });
  const locations = [
    ...new Set(
      discoveries
        .map((entry) => entry.locationId)
        .filter(
          (locationId): locationId is string =>
            typeof locationId === "string" && locationId.trim().length > 0,
        ),
    ),
  ];
  const payload = {
    id: plotId,
    campaignDefinitionId,
    parent: { kind: "root" },
    name: `Recovered ${humanName(campaign, "Campaign")} plot`,
    description:
      "Recovered authoring content retained from the legacy Campaign.",
    objectives: namedEntries(objectives, "objective"),
    pressures: namedEntries(pressures, "pressure"),
    resistances: namedEntries(resistances, "resistance"),
    discoveries: projectedDiscoveries,
    locationContexts: locations.map((locationId, index) => ({
      id: `${plotId}:location:${index + 1}`,
      locationId,
      placementDefinitionIds: placements
        .filter((placement) => placement.payload.locationId === locationId)
        .map((placement) => placement.sourceId),
    })),
    extensions: {
      "aow:legacy-recovery": {
        objectives,
        pressures,
        resistances,
        discoveries,
      },
    },
  };
  return {
    resourceType: "plots",
    sourceId: plotId,
    sourceRevision: campaign.revision,
    contentHash: contentHash(payload),
    payload,
  };
}

function historicalSessionPayload(
  session: LegacyShadowDomainRecord,
  campaignInstanceId: string,
  capturedAt: string,
): ProposedCampaignInstanceSessionPayload {
  const createdAt =
    validIso(session.createdAt) ??
    validIso(
      objectOrEmpty(objectOrEmpty(session.data.identity).version).updatedAt,
    ) ??
    capturedAt;
  const updatedAt = validIso(session.updatedAt) ?? capturedAt;
  const startedAt = validIso(session.data.startedAt);
  const endedAt = validIso(session.data.endedAt);
  const cancelledAt = validIso(session.data.cancelledAt);
  const sourceStatus =
    typeof session.data.status === "string"
      ? session.data.status.toLowerCase()
      : "planned";
  const base = {
    campaignInstanceId,
    name: humanName(session, "Imported Session"),
    metadataRevision: Math.max(1, session.revision),
    createdAt,
    updatedAt,
    legacyPayload: session.data,
  };
  if (sourceStatus === "completed" || sourceStatus === "concluded") {
    const started = startedAt ?? createdAt;
    return {
      ...base,
      status: "concluded",
      startedAt: started,
      concludedAt: atOrAfter(endedAt ?? updatedAt, started),
    };
  }
  if (sourceStatus === "cancelled" || sourceStatus === "canceled") {
    return {
      ...base,
      status: "cancelled",
      ...(startedAt ? { startedAt } : {}),
      cancelledAt: atOrAfter(cancelledAt ?? updatedAt, startedAt ?? createdAt),
      cancellationReason: "Imported from a cancelled legacy Session.",
    };
  }
  if (sourceStatus === "active" || sourceStatus === "paused") {
    const started = startedAt ?? createdAt;
    return {
      ...base,
      status: "paused",
      startedAt: started,
      pausedAt: atOrAfter(updatedAt, started),
    };
  }
  if (sourceStatus === "lobby") {
    return { ...base, status: "lobby", lobbyOpenedAt: updatedAt };
  }
  return { ...base, status: "planned" };
}

function targetId(type: RealignmentTargetType, legacyId: string): string {
  return `realignment:v1:${type}:${legacyId}`;
}

function compareSource(
  left: { readonly resource: string; readonly id: string },
  right: { readonly resource: string; readonly id: string },
): number {
  return (
    left.resource.localeCompare(right.resource) ||
    left.id.localeCompare(right.id)
  );
}

function worldIdFromRecord(
  record: LegacyShadowDomainRecord,
): string | undefined {
  if (typeof record.data.worldId === "string") return record.data.worldId;
  const extensions = objectOrEmpty(record.data.extensions);
  const extensionWorldId = extensions["aow:worldId"];
  return typeof extensionWorldId === "string" ? extensionWorldId : undefined;
}

function campaignIdFromGame(
  record: LegacyShadowDomainRecord,
): string | undefined {
  const campaign = objectOrEmpty(record.data.campaign);
  const identity = objectOrEmpty(campaign.identity);
  return typeof identity.id === "string" ? identity.id : undefined;
}

/**
 * Produces an atomic, deterministic migration proposal from sanitized legacy data.
 * It performs no persistence access or writes and never mutates its input.
 */
export function planLegacyRealignmentShadowConversion(
  source: LegacyRealignmentShadowDataset,
): LegacyRealignmentShadowPlan {
  const records = [...source.domainRecords].sort(compareSource);
  const memberships = [...source.memberships].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const invitations = [...source.invitations].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const characterDrafts = [...source.characterDrafts].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const issues: LegacyRealignmentShadowPlanIssue[] = [];
  const addIssue = (
    code: string,
    legacyResource: string,
    legacyId: string,
    detail: string,
  ) => issues.push({ code, legacyResource, legacyId, detail });

  const recordsByKey = new Map<string, LegacyShadowDomainRecord>();
  for (const record of records) {
    const key = `${record.resource}\u0000${record.id}`;
    if (recordsByKey.has(key)) {
      addIssue(
        "duplicate-legacy-identity",
        record.resource,
        record.id,
        "More than one source record has this resource-scoped legacy identity.",
      );
    } else {
      recordsByKey.set(key, record);
    }
  }

  const inspectDuplicateIds = (
    entries: readonly { readonly id: string }[],
    resource: string,
  ) => {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.id)) {
        addIssue(
          "duplicate-legacy-identity",
          resource,
          entry.id,
          "More than one source record has this resource-scoped legacy identity.",
        );
      }
      seen.add(entry.id);
    }
  };
  inspectDuplicateIds(memberships, "memberships");
  inspectDuplicateIds(invitations, "invitations");
  inspectDuplicateIds(characterDrafts, "character-drafts");

  const locations = records.filter((record) => record.resource === "locations");
  const roots = locations.filter(
    (record) =>
      (record.kind === "world" || record.data.kind === "world") &&
      objectOrEmpty(record.data.placement).kind === "root",
  );
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  const locationsById = new Map(
    locations.map((location) => [location.id, location]),
  );
  const locationWorldCache = new Map<string, string>();

  const resolveLocationWorld = (
    location: LegacyShadowDomainRecord,
    lineage: readonly string[] = [],
  ): string | undefined => {
    const cached = locationWorldCache.get(location.id);
    if (cached) return cached;
    if (rootsById.has(location.id)) {
      locationWorldCache.set(location.id, location.id);
      return location.id;
    }
    if (lineage.includes(location.id)) {
      addIssue(
        "location-parent-cycle",
        "locations",
        location.id,
        "The Location parent chain contains a cycle and has no unambiguous World root.",
      );
      return undefined;
    }
    const placement = objectOrEmpty(location.data.placement);
    const parentId = placement.parentLocationId;
    if (placement.kind !== "within-parent" || typeof parentId !== "string") {
      addIssue(
        "location-parent-malformed",
        "locations",
        location.id,
        "A non-root Location must have one usable parent Location reference.",
      );
      return undefined;
    }
    const parent = locationsById.get(parentId);
    if (!parent) {
      addIssue(
        "location-parent-not-found",
        "locations",
        location.id,
        "The Location parent does not exist in the sanitized source dataset.",
      );
      return undefined;
    }
    const worldId = resolveLocationWorld(parent, [...lineage, location.id]);
    if (worldId) locationWorldCache.set(location.id, worldId);
    return worldId;
  };

  locations.forEach((location) => resolveLocationWorld(location));

  const worldRecords = new Map<string, LegacyShadowDomainRecord[]>();
  const retainedLegacyRecords: LegacyShadowDomainRecord[] = [];
  for (const root of roots) worldRecords.set(root.id, []);
  for (const location of locations) {
    const worldId = locationWorldCache.get(location.id);
    if (worldId) worldRecords.get(worldId)?.push(location);
  }

  const structuralResources = new Set([
    "locations",
    "campaigns",
    "games",
    "sessions",
    "characters",
  ]);
  for (const record of records) {
    if (structuralResources.has(record.resource)) continue;
    if (DEFERRED_LEGACY_RESOURCES.has(record.resource)) {
      retainedLegacyRecords.push(record);
      continue;
    }
    let worldId = worldIdFromRecord(record);
    if (record.resource === "location-connections" && !worldId) {
      const candidates = [
        record.data.scopeLocationId,
        record.data.fromLocationId,
        record.data.toLocationId,
      ]
        .filter((value): value is string => typeof value === "string")
        .map((locationId) => locationWorldCache.get(locationId))
        .filter((value): value is string => typeof value === "string");
      const distinct = [...new Set(candidates)];
      if (distinct.length === 1) worldId = distinct[0];
      if (distinct.length > 1) {
        addIssue(
          "location-connection-world-ambiguous",
          record.resource,
          record.id,
          "The Location Connection crosses World lineages and cannot be captured.",
        );
        continue;
      }
    }
    if (!worldId) {
      if (REQUIRED_WORLD_OWNED_RESOURCES.has(record.resource)) {
        addIssue(
          "content-world-reference-missing",
          record.resource,
          record.id,
          "World-owned content has no usable legacy World reference.",
        );
      } else {
        addIssue(
          "legacy-resource-unclassified",
          record.resource,
          record.id,
          "The legacy resource has no approved target or explicit retention policy.",
        );
      }
      continue;
    }
    const ownedRecords = worldRecords.get(worldId);
    if (!ownedRecords) {
      addIssue(
        "content-world-not-found",
        record.resource,
        record.id,
        "World-owned content refers to a World root that is not present.",
      );
      continue;
    }
    ownedRecords.push(record);
  }

  const campaigns = records.filter((record) => record.resource === "campaigns");
  const campaignsById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );
  const campaignWorlds = new Map<string, string>();
  for (const campaign of campaigns) {
    const worldId = campaign.data.worldId;
    if (typeof worldId !== "string" || !rootsById.has(worldId)) {
      addIssue(
        "campaign-world-not-found",
        "campaigns",
        campaign.id,
        "The Campaign does not resolve to one valid root World.",
      );
    } else {
      campaignWorlds.set(campaign.id, worldId);
    }
  }

  const gamesByCampaign = new Map<string, LegacyShadowDomainRecord[]>();
  const sessionsByCampaign = new Map<string, LegacyShadowDomainRecord[]>();
  const charactersByCampaign = new Map<string, LegacyShadowDomainRecord[]>();
  const membershipsByCampaign = new Map<
    string,
    LegacyShadowCampaignRelation[]
  >();
  const invitationsByCampaign = new Map<
    string,
    LegacyShadowCampaignRelation[]
  >();
  const draftsByCampaign = new Map<string, LegacyShadowCharacterDraft[]>();
  const membershipsById = new Map(
    memberships.map((entry) => [entry.id, entry]),
  );
  const charactersById = new Map(
    records
      .filter((record) => record.resource === "characters")
      .map((character) => [character.id, character]),
  );

  const groupRecord = (
    map: Map<string, LegacyShadowDomainRecord[]>,
    campaignId: string,
    record: LegacyShadowDomainRecord,
  ) => map.set(campaignId, [...(map.get(campaignId) ?? []), record]);

  for (const game of records.filter((record) => record.resource === "games")) {
    const campaignId = campaignIdFromGame(game);
    if (!campaignId || !campaignsById.has(campaignId)) {
      addIssue(
        "game-campaign-not-found",
        "games",
        game.id,
        "The runtime snapshot does not resolve to one legacy Campaign.",
      );
      continue;
    }
    groupRecord(gamesByCampaign, campaignId, game);
  }
  for (const [campaignId, games] of gamesByCampaign) {
    if (games.length > 1) {
      addIssue(
        "campaign-runtime-ambiguous",
        "campaigns",
        campaignId,
        "More than one runtime snapshot refers to this legacy Campaign.",
      );
    }
  }

  for (const session of records.filter(
    (record) => record.resource === "sessions",
  )) {
    const campaignId = session.data.campaignId;
    if (typeof campaignId !== "string" || !campaignsById.has(campaignId)) {
      addIssue(
        "session-campaign-not-found",
        "sessions",
        session.id,
        "The Session does not resolve to one legacy Campaign.",
      );
      continue;
    }
    const expectedWorldId = campaignWorlds.get(campaignId);
    if (
      expectedWorldId &&
      typeof session.data.worldId === "string" &&
      session.data.worldId !== expectedWorldId
    ) {
      addIssue(
        "session-world-mismatch",
        "sessions",
        session.id,
        "The Session World differs from its Campaign World.",
      );
    }
    groupRecord(sessionsByCampaign, campaignId, session);
  }

  const groupRelation = (
    entries: readonly LegacyShadowCampaignRelation[],
    map: Map<string, LegacyShadowCampaignRelation[]>,
    resource: "memberships" | "invitations",
  ) => {
    for (const entry of entries) {
      if (!campaignsById.has(entry.campaignId)) {
        addIssue(
          `${resource.slice(0, -1)}-campaign-not-found`,
          resource,
          entry.id,
          `The ${resource.slice(0, -1)} does not resolve to one legacy Campaign.`,
        );
        continue;
      }
      map.set(entry.campaignId, [...(map.get(entry.campaignId) ?? []), entry]);
    }
  };
  groupRelation(memberships, membershipsByCampaign, "memberships");
  groupRelation(invitations, invitationsByCampaign, "invitations");

  for (const draft of characterDrafts) {
    const membership = membershipsById.get(draft.membershipId);
    if (!membership || !campaignsById.has(membership.campaignId)) {
      addIssue(
        "draft-membership-not-found",
        "character-drafts",
        draft.id,
        "The Character draft does not resolve through one membership to a Campaign.",
      );
      continue;
    }
    if (draft.characterId !== null) {
      const character = charactersById.get(draft.characterId);
      if (!character) {
        addIssue(
          "draft-character-not-found",
          "character-drafts",
          draft.id,
          "The Character draft refers to a Character that is not present.",
        );
      } else if (character.data.ownerMembershipId !== membership.id) {
        addIssue(
          "draft-character-membership-mismatch",
          "character-drafts",
          draft.id,
          "The draft and its Character resolve to different memberships.",
        );
      }
    }
    draftsByCampaign.set(membership.campaignId, [
      ...(draftsByCampaign.get(membership.campaignId) ?? []),
      draft,
    ]);
  }

  for (const character of records.filter(
    (record) => record.resource === "characters",
  )) {
    const membershipId = character.data.ownerMembershipId;
    const membership =
      typeof membershipId === "string"
        ? membershipsById.get(membershipId)
        : undefined;
    if (!membership || !campaignsById.has(membership.campaignId)) {
      addIssue(
        "character-membership-not-found",
        "characters",
        character.id,
        "The Character does not resolve through one membership to a Campaign.",
      );
      continue;
    }
    groupRecord(charactersByCampaign, membership.campaignId, character);
  }

  for (const membership of memberships) {
    const referencedCharacterIds: readonly unknown[] = Array.isArray(
      membership.data.characterIds,
    )
      ? (membership.data.characterIds as unknown[])
      : [];
    const activeCharacterId = membership.data.activeCharacterId;
    const allReferences = [
      ...referencedCharacterIds,
      ...(typeof activeCharacterId === "string" ? [activeCharacterId] : []),
    ];
    for (const characterId of allReferences) {
      if (typeof characterId !== "string") {
        addIssue(
          "membership-character-reference-malformed",
          "memberships",
          membership.id,
          "A membership Character reference is not a string identity.",
        );
        continue;
      }
      const character = charactersById.get(characterId);
      if (!character) {
        addIssue(
          "membership-character-not-found",
          "memberships",
          membership.id,
          "A Character referenced by the membership is not present.",
        );
      } else if (character.data.ownerMembershipId !== membership.id) {
        addIssue(
          "membership-character-owner-mismatch",
          "memberships",
          membership.id,
          "A referenced Character belongs to a different membership.",
        );
      }
    }
  }

  for (const [worldId, ownedRecords] of worldRecords) {
    if (ownedRecords.length >= MAX_SNAPSHOT_RECORDS) {
      addIssue(
        "world-snapshot-record-limit-exceeded",
        "locations",
        worldId,
        "The World capture has too many records for one bounded snapshot manifest.",
      );
    }
  }

  if (issues.length > 0) {
    issues.sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        left.legacyResource.localeCompare(right.legacyResource) ||
        left.legacyId.localeCompare(right.legacyId),
    );
    throw new LegacyRealignmentShadowPlanError(issues);
  }

  const rows: {
    worldDefinitions: ProposedShadowRow<ProposedWorldDefinitionPayload>[];
    worldDefinitionRevisions: ProposedShadowRow<ProposedWorldDefinitionRevisionPayload>[];
    worldDefinitionSnapshots: ProposedShadowRow<ProposedWorldDefinitionSnapshotPayload>[];
    worldDefinitionDrafts: ProposedShadowRow<ProposedWorldDefinitionDraftPayload>[];
    campaignDefinitions: ProposedShadowRow<ProposedCampaignDefinitionPayload>[];
    campaignDefinitionRevisions: ProposedShadowRow<ProposedCampaignDefinitionRevisionPayload>[];
    campaignDefinitionSnapshots: ProposedShadowRow<ProposedCampaignDefinitionSnapshotPayload>[];
    campaignDefinitionDrafts: ProposedShadowRow<ProposedCampaignDefinitionDraftPayload>[];
    campaignInstances: ProposedShadowRow<ProposedCampaignInstancePayload>[];
    campaignInstanceSnapshots: ProposedShadowRow<ProposedCampaignInstanceSnapshotPayload>[];
    campaignInstanceRuntimes: ProposedShadowRow<ProposedCampaignInstanceRuntimePayload>[];
    campaignInstanceSessions: ProposedShadowRow<ProposedCampaignInstanceSessionPayload>[];
  } = {
    worldDefinitions: [],
    worldDefinitionRevisions: [],
    worldDefinitionSnapshots: [],
    worldDefinitionDrafts: [],
    campaignDefinitions: [],
    campaignDefinitionRevisions: [],
    campaignDefinitionSnapshots: [],
    campaignDefinitionDrafts: [],
    campaignInstances: [],
    campaignInstanceSnapshots: [],
    campaignInstanceRuntimes: [],
    campaignInstanceSessions: [],
  };
  const legacyIdentityMap: LegacyIdentityMapEntry[] = [];
  const dependentRebindings: LegacyDependentRebinding[] = [];
  const mapIdentity = (
    record: { readonly resource: string; readonly id: string },
    type: RealignmentTargetType,
    id: string,
  ) =>
    legacyIdentityMap.push({
      legacyResource: record.resource,
      legacyId: record.id,
      targetType: type,
      targetId: id,
    });

  for (const root of roots.sort(compareSource)) {
    const definitionId = targetId("world-definition", root.id);
    const revisionId = targetId("world-definition-revision", root.id);
    const snapshotId = targetId("world-definition-snapshot", root.id);
    const snapshotRecords = [...(worldRecords.get(root.id) ?? [])]
      .sort(compareSource)
      .map((record) => ({
        resourceType: record.resource,
        sourceId: record.id,
        sourceRevision: record.revision,
        contentHash: contentHash(record.data),
        payload: record.data,
      }));
    const manifest = proposedManifest([
      {
        resourceType: "world-definition-revision",
        sourceId: revisionId,
        sourceRevision: 1,
        payload: root.data,
      },
      ...snapshotRecords,
    ]);
    rows.worldDefinitions.push({
      id: definitionId,
      payload: {
        name:
          typeof root.data.name === "string" ? root.data.name : "Unnamed World",
        currentRevisionId: revisionId,
        legacyRootPayload: root.data,
      },
    });
    rows.worldDefinitionRevisions.push({
      id: revisionId,
      payload: {
        worldDefinitionId: definitionId,
        revisionNumber: 1,
        publishedAt: source.capturedAt,
        contentHash: contentHash(root.data),
        rootLocationId: root.id,
        content: root.data,
      },
    });
    rows.worldDefinitionSnapshots.push({
      id: snapshotId,
      payload: {
        worldDefinitionId: definitionId,
        worldDefinitionRevisionId: revisionId,
        capturedAt: source.capturedAt,
        manifest,
      },
    });
    rows.worldDefinitionDrafts.push({
      id: `realignment:v1:world-definition-draft:${root.id}`,
      payload: {
        worldDefinitionId: definitionId,
        baseRevisionId: revisionId,
        baseSnapshotId: snapshotId,
        revisionName: humanName(root, "Unnamed World"),
        content: worldDraftContent(root, snapshotRecords),
        snapshotRecords,
      },
    });
    mapIdentity(root, "world-definition", definitionId);
    mapIdentity(root, "world-definition-revision", revisionId);
    mapIdentity(root, "world-definition-snapshot", snapshotId);
  }

  for (const campaign of campaigns) {
    const legacyWorldId = campaignWorlds.get(campaign.id)!;
    const worldDefinitionId = targetId("world-definition", legacyWorldId);
    const worldSnapshotId = targetId(
      "world-definition-snapshot",
      legacyWorldId,
    );
    const definitionId = targetId("campaign-definition", campaign.id);
    const revisionId = targetId("campaign-definition-revision", campaign.id);
    const definitionSnapshotId = targetId(
      "campaign-definition-snapshot",
      campaign.id,
    );
    const initialPlacementRecords = campaignPlacementRecords(
      campaign,
      recordsByKey,
    );
    const plotRecord = recoveredPlotRecord(
      campaign,
      definitionId,
      initialPlacementRecords,
    );
    const placementRecords = plotRecord
      ? initialPlacementRecords.map((record) => {
          const payload = {
            ...record.payload,
            plotDefinitionIds:
              strings(record.payload.plotDefinitionIds).length > 0
                ? strings(record.payload.plotDefinitionIds)
                : [plotRecord.sourceId],
          };
          return { ...record, contentHash: contentHash(payload), payload };
        })
      : initialPlacementRecords;
    const campaignDraftRecords = [
      ...(plotRecord ? [plotRecord] : []),
      ...placementRecords,
    ];
    const definitionRecords = [
      {
        resourceType: "campaign-definition-revision",
        sourceId: revisionId,
        sourceRevision: 1,
        payload: campaign.data,
      },
    ];
    const definitionManifest = proposedManifest(definitionRecords);
    rows.campaignDefinitions.push({
      id: definitionId,
      payload: {
        name:
          typeof campaign.data.name === "string"
            ? campaign.data.name
            : "Unnamed Campaign",
        worldDefinitionId,
        currentRevisionId: revisionId,
      },
    });
    rows.campaignDefinitionRevisions.push({
      id: revisionId,
      payload: {
        campaignDefinitionId: definitionId,
        revisionNumber: 1,
        publishedAt: source.capturedAt,
        contentHash: contentHash(campaign.data),
        capturedWorldSnapshotId: worldSnapshotId,
        legacyCampaignPayload: campaign.data,
      },
    });
    rows.campaignDefinitionSnapshots.push({
      id: definitionSnapshotId,
      payload: {
        campaignDefinitionId: definitionId,
        campaignDefinitionRevisionId: revisionId,
        capturedWorldSnapshotId: worldSnapshotId,
        capturedAt: source.capturedAt,
        manifest: definitionManifest,
      },
    });
    rows.campaignDefinitionDrafts.push({
      id: `realignment:v1:campaign-definition-draft:${campaign.id}`,
      payload: {
        campaignDefinitionId: definitionId,
        worldDefinitionId,
        baseRevisionId: revisionId,
        baseSnapshotId: definitionSnapshotId,
        capturedWorldSnapshotId: worldSnapshotId,
        revisionName: humanName(campaign, "Unnamed Campaign"),
        content: campaignDraftContent(
          campaign,
          placementRecords,
          plotRecord?.sourceId,
        ),
        snapshotRecords: campaignDraftRecords,
      },
    });
    mapIdentity(campaign, "campaign-definition", definitionId);
    mapIdentity(campaign, "campaign-definition-revision", revisionId);
    mapIdentity(campaign, "campaign-definition-snapshot", definitionSnapshotId);

    const hasInstance =
      (gamesByCampaign.get(campaign.id)?.length ?? 0) > 0 ||
      (sessionsByCampaign.get(campaign.id)?.length ?? 0) > 0 ||
      (membershipsByCampaign.get(campaign.id)?.length ?? 0) > 0 ||
      (invitationsByCampaign.get(campaign.id)?.length ?? 0) > 0 ||
      (draftsByCampaign.get(campaign.id)?.length ?? 0) > 0 ||
      (charactersByCampaign.get(campaign.id)?.length ?? 0) > 0;
    if (!hasInstance) continue;

    const instanceId = targetId("campaign-instance", campaign.id);
    const instanceSnapshotId = targetId(
      "campaign-instance-snapshot",
      campaign.id,
    );
    const runtimeId = targetId("campaign-instance-runtime", campaign.id);
    const game = gamesByCampaign.get(campaign.id)?.[0];
    rows.campaignInstances.push({
      id: instanceId,
      payload: {
        name:
          typeof campaign.data.name === "string"
            ? campaign.data.name
            : "Unnamed Campaign",
        campaignDefinitionId: definitionId,
        currentSnapshotId: instanceSnapshotId,
        status: "active",
        createdAt: source.capturedAt,
      },
    });
    rows.campaignInstanceSnapshots.push({
      id: instanceSnapshotId,
      payload: {
        campaignInstanceId: instanceId,
        snapshotNumber: 1,
        campaignDefinitionSnapshotId: definitionSnapshotId,
        worldDefinitionSnapshotId: worldSnapshotId,
        adoptedAt: source.capturedAt,
        manifest: proposedManifest([
          {
            resourceType: "campaign-definition-snapshot",
            sourceId: definitionSnapshotId,
            sourceRevision: 1,
            payload: {
              campaignDefinitionId: definitionId,
              campaignDefinitionRevisionId: revisionId,
              capturedWorldSnapshotId: worldSnapshotId,
              manifest: definitionManifest,
            },
          },
          {
            resourceType: "world-definition-snapshot",
            sourceId: worldSnapshotId,
            sourceRevision: 1,
            payload: {
              worldDefinitionId,
              worldDefinitionRevisionId: targetId(
                "world-definition-revision",
                legacyWorldId,
              ),
              manifest: rows.worldDefinitionSnapshots.find(
                (row) => row.id === worldSnapshotId,
              )!.payload.manifest,
            },
          },
        ]),
      },
    });
    rows.campaignInstanceRuntimes.push({
      id: runtimeId,
      payload: {
        campaignInstanceId: instanceId,
        campaignInstanceSnapshotId: instanceSnapshotId,
        legacyGamePayload: game?.data ?? null,
      },
    });
    mapIdentity(campaign, "campaign-instance", instanceId);
    mapIdentity(campaign, "campaign-instance-snapshot", instanceSnapshotId);
    if (game) mapIdentity(game, "campaign-instance-runtime", runtimeId);

    for (const session of sessionsByCampaign.get(campaign.id) ?? []) {
      const sessionId = targetId("campaign-instance-session", session.id);
      rows.campaignInstanceSessions.push({
        id: sessionId,
        payload: historicalSessionPayload(
          session,
          instanceId,
          source.capturedAt,
        ),
      });
      mapIdentity(session, "campaign-instance-session", sessionId);
    }

    const rebindDomainRecords = (
      resource: "sessions" | "characters",
      entries: readonly LegacyShadowDomainRecord[],
    ) => {
      for (const entry of entries) {
        dependentRebindings.push({
          legacyResource: resource,
          legacyId: entry.id,
          campaignInstanceId: instanceId,
          payload: entry.data,
        });
      }
    };
    rebindDomainRecords(
      "characters",
      charactersByCampaign.get(campaign.id) ?? [],
    );
    for (const entry of membershipsByCampaign.get(campaign.id) ?? []) {
      dependentRebindings.push({
        legacyResource: "memberships",
        legacyId: entry.id,
        campaignInstanceId: instanceId,
        payload: entry.data,
      });
    }
    for (const entry of invitationsByCampaign.get(campaign.id) ?? []) {
      dependentRebindings.push({
        legacyResource: "invitations",
        legacyId: entry.id,
        campaignInstanceId: instanceId,
        payload: entry.data,
      });
    }
    for (const entry of draftsByCampaign.get(campaign.id) ?? []) {
      dependentRebindings.push({
        legacyResource: "character-drafts",
        legacyId: entry.id,
        campaignInstanceId: instanceId,
        payload: entry.data,
      });
    }
  }

  legacyIdentityMap.sort(
    (left, right) =>
      left.legacyResource.localeCompare(right.legacyResource) ||
      left.legacyId.localeCompare(right.legacyId) ||
      left.targetType.localeCompare(right.targetType),
  );
  dependentRebindings.sort(
    (left, right) =>
      left.legacyResource.localeCompare(right.legacyResource) ||
      left.legacyId.localeCompare(right.legacyId),
  );

  return {
    version: LEGACY_REALIGNMENT_SHADOW_PLAN_VERSION,
    mode: "read-only",
    capturedAt: source.capturedAt,
    rows,
    legacyIdentityMap,
    dependentRebindings,
    retainedLegacyRecords: retainedLegacyRecords.sort(compareSource),
  };
}
