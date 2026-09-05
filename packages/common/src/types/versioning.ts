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
  PlotDefinitionId,
  SessionId,
  StateIdentity,
  WorldDefinitionId,
  WorldDefinitionRevisionId,
  WorldDefinitionSnapshotId,
} from "./primitives";

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
  readonly gmPremise: string;
  readonly playerIntroduction: string;
  readonly plotDefinitionIds: readonly PlotDefinitionId[];
  readonly placementDefinitionIds: readonly string[];
  readonly extensions?: Extensions;
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
  readonly campaignDefinitionId: CampaignDefinitionId;
  readonly currentSnapshotId: CampaignInstanceSnapshotId;
  readonly status: CampaignInstanceStatus;
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
  readonly campaignDefinitionSnapshotId: CampaignDefinitionSnapshotId;
  /** Must equal the World snapshot required by campaignDefinitionSnapshotId. */
  readonly worldDefinitionSnapshotId: WorldDefinitionSnapshotId;
  readonly adoptedAt: string;
  readonly manifest: SnapshotManifest;
}

/** Mutable continuing state for one Campaign Instance and captured snapshot. */
export interface CampaignInstanceRuntime<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignInstanceRuntimeId>;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceSnapshotId: CampaignInstanceSnapshotId;
  readonly activeSessionId?: SessionId;
  readonly extensions?: Extensions;
}
