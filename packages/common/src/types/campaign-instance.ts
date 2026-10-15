import type { TerrainPoint } from "./isometric-terrain";
import type { CampaignLocationCanvasConfiguration } from "./campaign";
import type { ResolvedCreatureInstanceEmbodimentPolicy } from "./creatures";
import type { ItemInstance } from "./items";
import type { CampaignInstancePlotProgress } from "./plots";
import type {
  CampaignInstanceId,
  CampaignInstanceMigrationAuditId,
  CampaignInstancePlacementRealizationId,
  CampaignInstanceRuntimeCheckpointId,
  CampaignInstanceSnapshotId,
  CampaignPlacementDefinitionId,
  CharacterId,
  CreatureId,
  DefinitionId,
  EntityId,
  ExtensionData,
  ItemInstanceId,
  JsonValue,
  LocationId,
  PlotDefinitionId,
  StateIdentity,
  UserId,
  WorldPlacementDefinitionId,
} from "./primitives";

/** Mutable preparation for one actual group, copied from but independent of Definition defaults. */
export interface CampaignInstancePreparation<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly startingLocationId?: LocationId;
  readonly startingContext?: string;
  readonly mapVariations?: string;
  readonly locationCanvases?: readonly CampaignLocationCanvasConfiguration[];
  readonly extensions?: Extensions;
}

/** Exact captured authoring intent from which an Instance placement decision originates. */
export type CampaignInstancePlacementSource =
  | {
      readonly kind: "campaign-placement";
      readonly campaignPlacementDefinitionId: CampaignPlacementDefinitionId;
      /** Present when the Campaign placement decorates a captured World placement. */
      readonly capturedWorldPlacementDefinitionId?: WorldPlacementDefinitionId;
    }
  | {
      readonly kind: "captured-world-placement";
      readonly worldPlacementDefinitionId: WorldPlacementDefinitionId;
    }
  | {
      readonly kind: "instance-created";
      readonly reason: string;
    };

export type CampaignInstanceRealizedEntity =
  | { readonly kind: "creature"; readonly runtimeCreatureId: CreatureId }
  | { readonly kind: "item"; readonly runtimeItemId: ItemInstanceId };

/**
 * Instance-owned decision and mutable realization of captured placement intent.
 * Source identity is provenance only; movement or removal never edits the source.
 */
export interface CampaignInstancePlacementRealization<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignInstancePlacementRealizationId>;
  /** Human-readable runtime label; opaque identity is never used as a fallback. */
  readonly name: string;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly source: CampaignInstancePlacementSource;
  readonly sourceLocationId: LocationId;
  readonly status: "planned" | "deferred" | "realized" | "replaced" | "removed";
  readonly realizedEntity?: CampaignInstanceRealizedEntity;
  readonly currentLocationId?: LocationId;
  readonly notes?: string;
  readonly extensions?: Extensions;
}

/** Captured content or Instance ownership from which an independent creature embodiment arose. */
export type CampaignInstanceCreatureSource =
  | {
      readonly kind: "captured-world-creature";
      readonly sourceCreatureId: CreatureId;
      readonly embodimentPolicy: ResolvedCreatureInstanceEmbodimentPolicy;
    }
  | {
      readonly kind: "campaign-placement";
      readonly campaignPlacementDefinitionId: CampaignPlacementDefinitionId;
      readonly sourceCreatureId?: CreatureId;
      readonly embodimentPolicy?: ResolvedCreatureInstanceEmbodimentPolicy;
    }
  | { readonly kind: "character"; readonly characterId: CharacterId }
  | { readonly kind: "instance-created"; readonly reason: string };

/**
 * Bounded mutable overlay for a Creature embodiment. The captured Definition is
 * the immutable source of rules/content; runtime JSON must not persist a partial
 * `CreatureState` assembled by spreading that Definition.
 */
export interface CampaignInstanceCreatureStateOverlay<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CreatureId>;
  readonly entityId: EntityId;
  readonly name: string;
  readonly definitionId?: DefinitionId;
  readonly currentLocationId?: LocationId;
  /** Feet in grid units of the current captured isometric Location. Authored during setup or changed by an approved captured-rule effect. */
  readonly terrainPosition?: TerrainPoint;
  /** Optional equipment overlay; absent on historical captures until explicitly equipped. */
  readonly equipment?: import("./items").EquipmentState;
  /** Explicit GM-configured combat health, updated only when a round is published. */
  readonly combat?: {
    readonly hp: number;
    readonly maxHp: number;
    readonly prone: boolean;
    readonly removed: boolean;
    readonly incapacitation?: "unconscious" | "dead" | null;
  };
  /** Explicit runtime effects; Instance orchestration supplies elapsed units/events. */
  readonly activeEffects?: readonly import("./rules").ActiveEffect[];
  /** The aow:rules namespace stores authored numeric aow:movementRemaining, aow:moves and aow:bonusActions resources; absence grants no default allowance. */
  readonly extensions?: Extensions;
}

/**
 * One mutable Creature embodiment isolated to one Campaign Instance. Even a named
 * unique captured Creature receives a different runtime identity in every Instance.
 */
export interface CampaignInstanceCreatureEmbodiment<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly runtimeCreatureId: CreatureId;
  readonly runtimeEntityId: EntityId;
  readonly source: CampaignInstanceCreatureSource;
  readonly creature: CampaignInstanceCreatureStateOverlay<Extensions>;
}

/** Canonical, schema-validated mutable state persisted by CampaignInstanceRuntime. */
export interface CampaignInstanceRuntimeState<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly formatVersion: 1;
  /** Sole durable encounter owner, including locked plans and unpublished simulation. */
  readonly encounter?: import("./combat").EncounterState;
  readonly preparation: CampaignInstancePreparation<Extensions>;
  /** One progress overlay for every captured root Plot and subplot. */
  readonly plotProgress: readonly CampaignInstancePlotProgress<Extensions>[];
  readonly placementRealizations: readonly CampaignInstancePlacementRealization<Extensions>[];
  readonly creatureEmbodiments: readonly CampaignInstanceCreatureEmbodiment<Extensions>[];
  readonly itemInstances: readonly ItemInstance[];
  /** ISO-8601 value in the Campaign's fictional clock, when one has been established. */
  readonly campaignTime?: string;
  /** Instance-local presentation; absent weather inherits capture, null suppresses it. */
  readonly locationPresentationOverrides?: readonly {
    readonly locationId: LocationId;
    readonly weather?: import("./world-authoring").LocationWeather | null;
  }[];
  readonly extensions?: Extensions;
}

export interface CampaignInstanceRuntimeValidationContext {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceSnapshotId: CampaignInstanceSnapshotId;
  readonly capturedPlotObjectiveIds: ReadonlyMap<
    PlotDefinitionId,
    ReadonlySet<string>
  >;
  readonly capturedLocationIds: ReadonlySet<LocationId>;
  readonly capturedCampaignPlacementIds: ReadonlySet<CampaignPlacementDefinitionId>;
  readonly capturedWorldPlacementIds: ReadonlySet<WorldPlacementDefinitionId>;
  readonly capturedCreaturePolicies: ReadonlyMap<
    CreatureId,
    ResolvedCreatureInstanceEmbodimentPolicy
  >;
}

export type CampaignInstanceRuntimeValidationIssueCode =
  | "plot-progress-membership-mismatch"
  | "plot-progress-instance-mismatch"
  | "objective-progress-not-captured"
  | "placement-realization-duplicate"
  | "placement-realization-instance-mismatch"
  | "placement-source-not-captured"
  | "location-not-captured"
  | "placement-status-entity-mismatch"
  | "creature-embodiment-duplicate"
  | "creature-embodiment-instance-mismatch"
  | "creature-embodiment-identity-mismatch"
  | "creature-embodiment-cardinality-exceeded"
  | "creature-embodiment-policy-mismatch"
  | "creature-source-not-captured"
  | "runtime-entity-not-found"
  | "invalid-terrain-position"
  | "invalid-encounter";

export interface CampaignInstanceRuntimeValidationIssue {
  readonly code: CampaignInstanceRuntimeValidationIssueCode;
  readonly subject: string;
  readonly detail: string;
}

export interface CampaignInstanceRuntimeValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CampaignInstanceRuntimeValidationIssue[];
}

/** Immutable runtime state captured at creation, migration, or restore. */
export interface CampaignInstanceRuntimeCheckpoint {
  readonly id: CampaignInstanceRuntimeCheckpointId;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceSnapshotId: CampaignInstanceSnapshotId;
  readonly checkpointNumber: number;
  readonly reason:
    | "initial"
    | "migration-source"
    | "migration-result"
    | "restore-source"
    | "restore-result";
  readonly runtimeRevision: number;
  readonly state: CampaignInstanceRuntimeState;
  /** Absent on legacy checkpoints; a recorded empty capture has count zero and a hash. */
  readonly explorationHash?: string;
  readonly explorationCount?: number;
  readonly contentHash: string;
  readonly createdAt: string;
}

/** Storage-independent migration resolution plan payload. */
export interface CampaignInstanceMigrationResolutionPlan {
  readonly formatVersion: 1;
  readonly mappings: Readonly<Record<string, string>>;
  readonly decisions?: Readonly<Record<string, JsonValue>>;
}

/** Append-only provenance for one direct-lineage all-or-nothing snapshot adoption. */
export interface CampaignInstanceMigrationAudit {
  readonly id: CampaignInstanceMigrationAuditId;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly kind: "migration" | "restore";
  readonly sourceSnapshotId: CampaignInstanceSnapshotId;
  readonly resultSnapshotId: CampaignInstanceSnapshotId;
  readonly sourceRuntimeCheckpointId: CampaignInstanceRuntimeCheckpointId;
  readonly resultRuntimeCheckpointId: CampaignInstanceRuntimeCheckpointId;
  readonly resolutionPlan: CampaignInstanceMigrationResolutionPlan;
  readonly planHash: string;
  readonly createdByUserId: UserId;
  readonly appliedAt: string;
}
