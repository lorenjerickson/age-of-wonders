import type {
  CampaignDefinitionId,
  CampaignDefinitionRevisionId,
  CampaignDefinitionSnapshotId,
  CampaignInstanceId,
  CampaignInstanceRuntimeId,
  CampaignInstanceSnapshotId,
  DefinitionId,
  ExtensionData,
  JsonValue,
  LocationId,
  ModelSchemaReleaseId,
  SessionId,
  StateIdentity,
  WorldDefinitionId,
  WorldDefinitionRevisionId,
  WorldDefinitionSnapshotId,
  WorldPlacementDefinitionId,
  UserId,
} from "./primitives";
import type { CampaignDefinitionContent } from "./campaign-definition";
import type { CampaignInstanceRuntimeState } from "./campaign-instance";

/** Identity of one immutable published revision in a definition lineage. */
export interface DefinitionRevisionIdentity<
  LineageId extends string,
  RevisionId extends string,
> {
  readonly id: RevisionId;
  readonly lineageId: LineageId;
  /** Monotonically increasing within this lineage; display labels are not identity. */
  readonly revisionNumber: number;
  /** Direct lineage only. The first published revision has no predecessor. */
  readonly predecessorRevisionId?: RevisionId;
  readonly publishedAt: string;
  readonly contentHash: string;
}

/** One complete resource replica embedded in an immutable snapshot. */
export interface SnapshotResourceRecord<Payload extends JsonValue = JsonValue> {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly sourceRevision?: number;
  readonly contentHash: string;
  readonly payload: Payload;
}

/**
 * Complete, content-addressed snapshot data. Captures own replicas instead of
 * resolving mutable upstream records through live references.
 */
export interface SnapshotManifest {
  readonly formatVersion: number;
  readonly contentHash: string;
  readonly records: readonly SnapshotResourceRecord[];
}

/** Stable identity and mutable authoring-head metadata for one World lineage. */
export interface WorldDefinition<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<WorldDefinitionId>;
  readonly name: string;
  readonly description?: string;
  readonly currentRevisionId?: WorldDefinitionRevisionId;
  readonly archivedAt?: string;
  readonly extensions?: Extensions;
}

/** One immutable published World Definition revision. */
export interface WorldDefinitionRevision<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: DefinitionRevisionIdentity<
    WorldDefinitionId,
    WorldDefinitionRevisionId
  >;
  readonly rootLocationId: LocationId;
  readonly locationIds: readonly LocationId[];
  /** Definitions and schemas resolved by this revision are replicated when captured. */
  readonly definitionIds: readonly DefinitionId[];
  readonly schemaDefinitionIds: readonly DefinitionId[];
  /** World-owned Creature, Item, and registered-content placements. */
  readonly worldPlacementDefinitionIds: readonly WorldPlacementDefinitionId[];
  /** Exact immutable model releases adopted by this World revision. */
  readonly modelSchemaReleaseIds: readonly ModelSchemaReleaseId[];
  readonly extensions?: Extensions;
}

/** An immutable, replicated capture of one World Definition revision. */
export interface WorldDefinitionSnapshot {
  readonly id: WorldDefinitionSnapshotId;
  readonly worldDefinitionId: WorldDefinitionId;
  readonly worldDefinitionRevisionId: WorldDefinitionRevisionId;
  readonly capturedAt: string;
  readonly manifest: SnapshotManifest;
}

/**
 * Stable identity and mutable authoring-head metadata for one Campaign
 * Definition lineage. Named separately while the legacy CampaignDefinition
 * aggregate remains available during migration.
 */
export interface CampaignDefinitionLineage<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignDefinitionId>;
  readonly name: string;
  readonly description?: string;
  readonly worldDefinitionId: WorldDefinitionId;
  readonly currentRevisionId?: CampaignDefinitionRevisionId;
  readonly archivedAt?: string;
  readonly extensions?: Extensions;
}

/** One immutable published Campaign Definition revision. */
export interface CampaignDefinitionRevision<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: DefinitionRevisionIdentity<
    CampaignDefinitionId,
    CampaignDefinitionRevisionId
  >;
  /** The replicated World capture against which this campaign was authored. */
  readonly capturedWorldSnapshotId: WorldDefinitionSnapshotId;
  /** The complete authored payload persisted and captured for this revision. */
  readonly content: CampaignDefinitionContent<Extensions>;
}

/**
 * An immutable, replicated capture of a Campaign Definition revision. Its
 * World snapshot is part of the consistency boundary, not a live World head.
 */
export interface CampaignDefinitionSnapshot {
  readonly id: CampaignDefinitionSnapshotId;
  readonly campaignDefinitionId: CampaignDefinitionId;
  readonly campaignDefinitionRevisionId: CampaignDefinitionRevisionId;
  readonly capturedWorldSnapshotId: WorldDefinitionSnapshotId;
  readonly capturedAt: string;
  readonly manifest: SnapshotManifest;
}

export type CampaignInstanceStatus =
  "preparing" | "active" | "paused" | "concluded" | "archived";

/** Stable identity for one played realization of a Campaign Definition. */
export interface CampaignInstance<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignInstanceId>;
  readonly name: string;
  readonly ownerUserId: UserId;
  readonly createdByUserId: UserId;
  readonly campaignDefinitionId: CampaignDefinitionId;
  readonly currentSnapshotId: CampaignInstanceSnapshotId;
  readonly status: CampaignInstanceStatus;
  /** Storage compare-and-swap token for lifecycle and other Instance metadata. */
  readonly metadataRevision: number;
  readonly createdAt: string;
  readonly concludedAt?: string;
  readonly archivedAt?: string;
  readonly extensions?: Extensions;
}

/**
 * One immutable consistency boundary adopted by a Campaign Instance. Migration
 * creates a new snapshot along the direct Instance lineage and preserves this one.
 */
export interface CampaignInstanceSnapshot {
  readonly id: CampaignInstanceSnapshotId;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly snapshotNumber: number;
  readonly predecessorSnapshotId?: CampaignInstanceSnapshotId;
  readonly reason: "initial" | "migration" | "restore";
  readonly campaignDefinitionSnapshotId: CampaignDefinitionSnapshotId;
  /** Must equal the World snapshot required by campaignDefinitionSnapshotId. */
  readonly worldDefinitionSnapshotId: WorldDefinitionSnapshotId;
  readonly adoptedAt: string;
  readonly manifest: SnapshotManifest;
  readonly contentHash: string;
}

/** Mutable continuing state for one Campaign Instance and captured snapshot. */
export interface CampaignInstanceRuntime<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignInstanceRuntimeId>;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceSnapshotId: CampaignInstanceSnapshotId;
  /** Monotonic compare-and-swap token for every mutable runtime write. */
  readonly revision: number;
  readonly state: CampaignInstanceRuntimeState<Extensions>;
  /** Session records are authoritative; this is a derived projection only. */
  readonly activeSessionId?: SessionId;
  readonly extensions?: Extensions;
}
