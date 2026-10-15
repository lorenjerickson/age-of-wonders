import type { TerrainPoint } from "./isometric-terrain";
import { isTerrainActorPosition } from "../spatial/actor-position";
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
  | "invalid-terrain-position";

export interface CampaignInstanceRuntimeValidationIssue {
  readonly code: CampaignInstanceRuntimeValidationIssueCode;
  readonly subject: string;
  readonly detail: string;
}

export interface CampaignInstanceRuntimeValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CampaignInstanceRuntimeValidationIssue[];
}

/** Pure consistency validation; model-schema conformance remains an additional server check. */
export function validateCampaignInstanceRuntimeState(
  state: CampaignInstanceRuntimeState,
  context: CampaignInstanceRuntimeValidationContext,
): CampaignInstanceRuntimeValidationResult {
  const issues: CampaignInstanceRuntimeValidationIssue[] = [];
  const add = (
    code: CampaignInstanceRuntimeValidationIssueCode,
    subject: string,
    detail: string,
  ) => issues.push({ code, subject, detail });

  const plotIds = [...context.capturedPlotObjectiveIds.keys()];
  const progressIds = state.plotProgress.map(
    ({ plotDefinitionId }) => plotDefinitionId,
  );
  if (!sameUniqueMembers(plotIds, progressIds)) {
    add(
      "plot-progress-membership-mismatch",
      "Plot progress",
      "Instance Plot progress must exactly cover every captured root Plot and subplot once.",
    );
  }
  if (
    state.preparation.startingLocationId !== undefined &&
    !context.capturedLocationIds.has(state.preparation.startingLocationId)
  ) {
    add(
      "location-not-captured",
      "Instance preparation",
      "The starting Location is outside the captured World.",
    );
  }

  for (const progress of state.plotProgress) {
    if (progress.campaignInstanceId !== context.campaignInstanceId) {
      add(
        "plot-progress-instance-mismatch",
        "Plot progress",
        "A Plot progress overlay belongs to a different Campaign Instance.",
      );
    }
    const objectiveIds = context.capturedPlotObjectiveIds.get(
      progress.plotDefinitionId,
    );
    for (const objective of progress.objectiveProgress ?? []) {
      if (!objectiveIds?.has(objective.objectiveId)) {
        add(
          "objective-progress-not-captured",
          "Plot objective progress",
          "An Objective progress entry does not exist in the captured Plot.",
        );
      }
    }
  }

  const realizationIds = new Set<string>();
  for (const realization of state.placementRealizations) {
    const subject = realization.name.trim() || "Instance placement";
    if (realizationIds.has(realization.identity.id)) {
      add(
        "placement-realization-duplicate",
        subject,
        "An Instance placement is listed more than once.",
      );
    }
    realizationIds.add(realization.identity.id);
    if (realization.campaignInstanceId !== context.campaignInstanceId) {
      add(
        "placement-realization-instance-mismatch",
        subject,
        "An Instance placement belongs to a different Campaign Instance.",
      );
    }
    if (
      !context.capturedLocationIds.has(realization.sourceLocationId) ||
      (realization.currentLocationId !== undefined &&
        !context.capturedLocationIds.has(realization.currentLocationId))
    ) {
      add(
        "location-not-captured",
        subject,
        "An Instance placement refers to a Location outside the captured World.",
      );
    }
    if (!placementSourceIsCaptured(realization.source, context)) {
      add(
        "placement-source-not-captured",
        subject,
        "An Instance placement source is absent from the captured Campaign and World snapshots.",
      );
    }
    const requiresEntity =
      realization.status === "realized" || realization.status === "replaced";
    if (requiresEntity !== (realization.realizedEntity !== undefined)) {
      add(
        "placement-status-entity-mismatch",
        subject,
        "A realized or replaced placement must name one runtime entity, while other placement states must not.",
      );
    }
  }

  const creatureIds = new Set<CreatureId>();
  const capturedSourceCounts = new Map<CreatureId, number>();
  for (const embodiment of state.creatureEmbodiments) {
    const subject = embodiment.creature.name.trim() || "Creature embodiment";
    if (creatureIds.has(embodiment.runtimeCreatureId)) {
      add(
        "creature-embodiment-duplicate",
        subject,
        "A runtime Creature identity is used by more than one embodiment.",
      );
    }
    creatureIds.add(embodiment.runtimeCreatureId);
    if (embodiment.campaignInstanceId !== context.campaignInstanceId) {
      add(
        "creature-embodiment-instance-mismatch",
        subject,
        "A Creature embodiment belongs to a different Campaign Instance.",
      );
    }
    if (
      embodiment.creature.identity.id !== embodiment.runtimeCreatureId ||
      embodiment.creature.entityId !== embodiment.runtimeEntityId
    ) {
      add(
        "creature-embodiment-identity-mismatch",
        subject,
        "A Creature embodiment's runtime identities do not match its mutable Creature state.",
      );
    }
    if (
      embodiment.creature.terrainPosition !== undefined &&
      (!embodiment.creature.currentLocationId ||
        !context.capturedLocationIds.has(
          embodiment.creature.currentLocationId,
        ) ||
        !isTerrainActorPosition(embodiment.creature.terrainPosition))
    )
      add(
        "invalid-terrain-position",
        subject,
        "An actor terrain position requires a captured Location and valid grid coordinates.",
      );
    if (embodiment.source.kind === "captured-world-creature") {
      const sourceId = embodiment.source.sourceCreatureId;
      const capturedPolicy = context.capturedCreaturePolicies.get(sourceId);
      if (!capturedPolicy) {
        add(
          "creature-source-not-captured",
          subject,
          "A Creature embodiment source is absent from the captured World.",
        );
      } else {
        if (
          !sameEmbodimentPolicy(
            embodiment.source.embodimentPolicy,
            capturedPolicy,
          )
        ) {
          add(
            "creature-embodiment-policy-mismatch",
            subject,
            "A Creature embodiment does not retain the policy resolved from its captured source.",
          );
        }
        const count = (capturedSourceCounts.get(sourceId) ?? 0) + 1;
        capturedSourceCounts.set(sourceId, count);
        const maximum =
          capturedPolicy.policy.strategy === "one-per-instance"
            ? 1
            : capturedPolicy.policy.maximumPerCampaignInstance;
        if (maximum !== undefined && count > maximum) {
          add(
            "creature-embodiment-cardinality-exceeded",
            subject,
            "This captured Creature's explicit embodiment policy does not permit another embodiment in this Campaign Instance.",
          );
        }
      }
    }
    if (
      embodiment.source.kind === "campaign-placement" &&
      !context.capturedCampaignPlacementIds.has(
        embodiment.source.campaignPlacementDefinitionId,
      )
    ) {
      add(
        "creature-source-not-captured",
        subject,
        "A Creature embodiment source is absent from the captured Campaign Definition.",
      );
    }
    if (
      embodiment.source.kind === "campaign-placement" &&
      embodiment.source.sourceCreatureId !== undefined
    ) {
      const sourceId = embodiment.source.sourceCreatureId;
      const capturedPolicy = context.capturedCreaturePolicies.get(sourceId);
      if (!capturedPolicy) {
        add(
          "creature-source-not-captured",
          subject,
          "A Campaign placement embodiment refers to a Creature absent from the captured World.",
        );
      } else {
        if (
          !embodiment.source.embodimentPolicy ||
          !sameEmbodimentPolicy(
            embodiment.source.embodimentPolicy,
            capturedPolicy,
          )
        ) {
          add(
            "creature-embodiment-policy-mismatch",
            subject,
            "A Campaign placement embodiment does not retain the policy resolved from its captured Creature source.",
          );
        }
        const count = (capturedSourceCounts.get(sourceId) ?? 0) + 1;
        capturedSourceCounts.set(sourceId, count);
        const maximum =
          capturedPolicy.policy.strategy === "one-per-instance"
            ? 1
            : capturedPolicy.policy.maximumPerCampaignInstance;
        if (maximum !== undefined && count > maximum) {
          add(
            "creature-embodiment-cardinality-exceeded",
            subject,
            "This captured Creature's explicit embodiment policy does not permit another embodiment in this Campaign Instance.",
          );
        }
      }
    }
  }

  const itemIds = new Set(state.itemInstances.map(({ id }) => id));
  for (const realization of state.placementRealizations) {
    const entity = realization.realizedEntity;
    if (
      entity?.kind === "creature" &&
      !creatureIds.has(entity.runtimeCreatureId)
    ) {
      add(
        "runtime-entity-not-found",
        realization.name || "Instance placement",
        "A placement refers to a missing Instance Creature embodiment.",
      );
    }
    if (entity?.kind === "item" && !itemIds.has(entity.runtimeItemId)) {
      add(
        "runtime-entity-not-found",
        realization.name || "Instance placement",
        "A placement refers to a missing Instance Item.",
      );
    }
  }

  issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.subject.localeCompare(right.subject),
  );
  return { valid: issues.length === 0, issues };
}

function sameUniqueMembers<Value>(
  left: readonly Value[],
  right: readonly Value[],
): boolean {
  return (
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function placementSourceIsCaptured(
  source: CampaignInstancePlacementSource,
  context: CampaignInstanceRuntimeValidationContext,
): boolean {
  if (source.kind === "campaign-placement") {
    return (
      context.capturedCampaignPlacementIds.has(
        source.campaignPlacementDefinitionId,
      ) &&
      (source.capturedWorldPlacementDefinitionId === undefined ||
        context.capturedWorldPlacementIds.has(
          source.capturedWorldPlacementDefinitionId,
        ))
    );
  }
  return (
    source.kind === "instance-created" ||
    context.capturedWorldPlacementIds.has(source.worldPlacementDefinitionId)
  );
}

function sameEmbodimentPolicy(
  left: ResolvedCreatureInstanceEmbodimentPolicy,
  right: ResolvedCreatureInstanceEmbodimentPolicy,
): boolean {
  return (
    left.source === right.source &&
    left.policy.strategy === right.policy.strategy &&
    left.policy.maximumPerCampaignInstance ===
      right.policy.maximumPerCampaignInstance
  );
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
