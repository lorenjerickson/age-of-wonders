import type {
  CampaignDefinitionId,
  CampaignPlacementDefinitionId,
  CampaignInstanceId,
  CreatureId,
  DefinitionId,
  EntityId,
  ExtensionData,
  ItemInstanceId,
  JsonValue,
  LocationId,
  NamespacedKey,
  OpenString,
  PlotDefinitionId,
} from "./primitives";
import type { ModelConformance } from "./model-registry";

export type PlotParent =
  | { readonly kind: "root" }
  | {
      readonly kind: "subplot";
      readonly parentPlotDefinitionId: PlotDefinitionId;
    };

export interface PlotRelationship {
  readonly plotDefinitionId: PlotDefinitionId;
  /** Required when the target is not a parent or ancestor in the Plot hierarchy. */
  readonly crossBranchRationale?: string;
}

export interface PlotObjective<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly extensions?: Extensions;
}

export interface PlotPressure<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly extensions?: Extensions;
}

export interface PlotResistance<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly extensions?: Extensions;
}

interface DiscoveryFacetBase<Extensions extends ExtensionData = ExtensionData> {
  readonly id: string;
  readonly statement: string;
  readonly provenance?: string;
  readonly relation: "supports" | "contradicts";
  readonly extensions?: Extensions;
}

export interface DiscoveryTruth<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly statement: string;
  readonly provenance?: string;
  readonly extensions?: Extensions;
}

export interface DiscoveryBelief<
  Extensions extends ExtensionData = ExtensionData,
> extends DiscoveryFacetBase<Extensions> {}

export interface DiscoveryRumor<
  Extensions extends ExtensionData = ExtensionData,
> extends DiscoveryFacetBase<Extensions> {}

interface LegacyDiscoveryClaimBase<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly statement: string;
  readonly provenance?: string;
  readonly extensions?: Extensions;
}

/** @deprecated Use the discovery truth, beliefs, and rumors facets. */
export type DiscoveryClaim<Extensions extends ExtensionData = ExtensionData> =
  | (LegacyDiscoveryClaimBase<Extensions> & { readonly kind: "truth" })
  | (LegacyDiscoveryClaimBase<Extensions> & {
      readonly kind: "belief";
      readonly conflictsWithClaimIds?: readonly string[];
    })
  | (LegacyDiscoveryClaimBase<Extensions> & {
      readonly kind: "rumor";
      readonly relatedTruthClaimId?: string;
      readonly conflictsWithClaimIds?: readonly string[];
    });

export interface PlotDiscovery<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly name: string;
  /** The single factual proposition that anchors this discovery. */
  readonly truth: DiscoveryTruth<Extensions>;
  /** Claims that support or contradict the truth. */
  readonly beliefs: readonly DiscoveryBelief<Extensions>[];
  readonly rumors: readonly DiscoveryRumor<Extensions>[];
  /** @deprecated Read legacy snapshots only; new writes must use the facets above. */
  readonly claims?: readonly DiscoveryClaim<Extensions>[];
  readonly extensions?: Extensions;
}

/** Returns the legacy claim view for runtime consumers while facets migrate. */
export function plotDiscoveryClaims(
  discovery: PlotDiscovery,
): Array<DiscoveryClaim & { readonly relation?: "supports" | "contradicts" }> {
  if (discovery.claims) return [...discovery.claims];
  return [
    { ...discovery.truth, kind: "truth" },
    ...discovery.beliefs.map((facet) => ({
      ...facet,
      kind: "belief" as const,
    })),
    ...discovery.rumors.map((facet) => ({ ...facet, kind: "rumor" as const })),
  ];
}

export type PlotActorSource =
  | {
      readonly kind: "world-creature";
      readonly creatureId: CreatureId;
    }
  | {
      readonly kind: "actor-role";
      readonly role: string;
      readonly suggestedCreatureDefinitionId?: DefinitionId;
    };

export interface PlotActorPlacementIntent<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly source: PlotActorSource;
  /** Present when this intent decorates a placement in the captured World snapshot. */
  readonly capturedWorldPlacementId?: string;
  readonly notes?: string;
  readonly extensions?: Extensions;
}

export type PlotItemRole = "item" | "loot";

export interface PlotItemPlacementIntent<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly role: PlotItemRole;
  readonly itemDefinitionId?: DefinitionId;
  readonly description?: string;
  /** Present when this intent decorates a placement in the captured World snapshot. */
  readonly capturedWorldPlacementId?: string;
  readonly extensions?: Extensions;
}

/** Campaign-authored context against a Location in the captured World snapshot. */
export interface PlotLocationContext<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly locationId: LocationId;
  /** Authoritative Campaign placements associated with this Plot context. */
  readonly placementDefinitionIds?: readonly CampaignPlacementDefinitionId[];
  /** @deprecated Use placementDefinitionIds and CampaignPlacementDefinition. */
  readonly actorPlacements?: readonly PlotActorPlacementIntent<Extensions>[];
  /** @deprecated Use placementDefinitionIds and CampaignPlacementDefinition. */
  readonly itemPlacements?: readonly PlotItemPlacementIntent<Extensions>[];
  readonly extensions?: Extensions;
}

/** Authored Plot content owned by one Campaign Definition lineage. */
export interface PlotDefinition<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: PlotDefinitionId;
  readonly campaignDefinitionId: CampaignDefinitionId;
  readonly parent: PlotParent;
  readonly name: string;
  readonly description?: string;
  readonly objectives: readonly PlotObjective<Extensions>[];
  readonly pressures: readonly PlotPressure<Extensions>[];
  readonly resistances: readonly PlotResistance<Extensions>[];
  readonly discoveries: readonly PlotDiscovery<Extensions>[];
  readonly locationContexts: readonly PlotLocationContext<Extensions>[];
  readonly prerequisites?: readonly PlotRelationship[];
  readonly dependencies?: readonly PlotRelationship[];
  /** Required when an applicable Model Schema declares an `aow:plot` concept. */
  readonly conformance?: ModelConformance;
  /** Values keyed by the selected Model field's stable storage key. */
  readonly modelValues?: Readonly<Record<NamespacedKey, JsonValue>>;
  readonly extensions?: Extensions;
}

export interface PlotActorRealization {
  readonly actorPlacementIntentId: string;
  readonly runtimeActorId: EntityId;
  readonly runtimePlacementId?: string;
}

export interface PlotItemRealization {
  readonly itemPlacementIntentId: string;
  readonly runtimeItemId: ItemInstanceId;
  readonly runtimePlacementId?: string;
}

export interface PlotLocationRealization {
  readonly plotLocationContextId: string;
  readonly actors: readonly PlotActorRealization[];
  readonly items: readonly PlotItemRealization[];
}

export type CreatureDiscoveryKnowledge =
  | {
      readonly kind: "knows-truth";
      readonly creatureId: EntityId;
      readonly claimId: string;
      readonly learnedAt?: string;
      readonly provenance?: string;
    }
  | {
      readonly kind: "holds-belief";
      readonly creatureId: EntityId;
      readonly claimId: string;
      readonly learnedAt?: string;
      readonly provenance?: string;
    }
  | {
      readonly kind: "heard-rumor";
      readonly creatureId: EntityId;
      readonly claimId: string;
      readonly learnedAt?: string;
      readonly provenance?: string;
    };

export type PlotObjectiveProgressStatus = OpenString<
  "not-started" | "active" | "completed" | "failed"
>;

export interface PlotObjectiveProgress {
  readonly objectiveId: string;
  readonly status: PlotObjectiveProgressStatus;
  readonly notes?: string;
}

export interface PlotProgressOverride {
  readonly key: NamespacedKey;
  readonly reason: string;
  readonly value: JsonValue;
}

/** Mutable overlay for one Plot in exactly one Campaign Instance. */
export type CampaignInstancePlotProgressStatus = OpenString<
  "not-started" | "active" | "completed" | "failed" | "abandoned"
>;

export interface CampaignInstancePlotProgress<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly plotDefinitionId: PlotDefinitionId;
  readonly status: CampaignInstancePlotProgressStatus;
  readonly objectiveProgress?: readonly PlotObjectiveProgress[];
  readonly locationRealizations?: readonly PlotLocationRealization[];
  readonly creatureKnowledge?: readonly CreatureDiscoveryKnowledge[];
  readonly revealedClaimIds?: readonly string[];
  readonly approvedOverrides?: readonly PlotProgressOverride[];
  readonly extensions?: Extensions;
}

export type PlotHierarchyValidationIssueCode =
  | "plot-id-duplicate"
  | "plot-parent-not-found"
  | "plot-parent-crosses-campaign-definition"
  | "plot-parent-cycle"
  | "plot-relationship-not-found"
  | "plot-relationship-crosses-campaign-definition"
  | "plot-relationship-cycle"
  | "plot-cross-branch-relationship-unexplained";

export interface PlotHierarchyValidationIssue {
  readonly code: PlotHierarchyValidationIssueCode;
  readonly plotName: string;
  readonly relatedPlotName?: string;
  readonly message: string;
}

export interface PlotHierarchyValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PlotHierarchyValidationIssue[];
}

/** Validates one or more Campaign Definition Plot sets without mutating them. */
export function validatePlotHierarchy(
  plots: readonly PlotDefinition[],
): PlotHierarchyValidationResult {
  const ordered = [...plots].sort((left, right) =>
    String(left.id).localeCompare(String(right.id), "en"),
  );
  const byId = new Map<PlotDefinitionId, PlotDefinition>();
  const issues: PlotHierarchyValidationIssue[] = [];
  const addIssue = (
    code: PlotHierarchyValidationIssueCode,
    plotValue: PlotDefinition,
    message: string,
    related?: PlotDefinition,
  ) => {
    issues.push({
      code,
      plotName: plotValue.name,
      relatedPlotName: related?.name,
      message,
    });
  };

  for (const plotValue of ordered) {
    const duplicate = byId.get(plotValue.id);
    if (duplicate) {
      addIssue(
        "plot-id-duplicate",
        plotValue,
        "Two Plots use the same identity within the validation set.",
        duplicate,
      );
      continue;
    }
    byId.set(plotValue.id, plotValue);
  }

  for (const plotValue of ordered) {
    if (plotValue.parent.kind === "subplot") {
      const parent = byId.get(plotValue.parent.parentPlotDefinitionId);
      if (!parent) {
        addIssue(
          "plot-parent-not-found",
          plotValue,
          "The subplot's parent Plot is not present.",
        );
      } else if (
        parent.campaignDefinitionId !== plotValue.campaignDefinitionId
      ) {
        addIssue(
          "plot-parent-crosses-campaign-definition",
          plotValue,
          "A subplot and its parent must belong to the same Campaign Definition.",
          parent,
        );
      }
    }
  }

  addCycleIssues(
    ordered,
    (plotValue) =>
      plotValue.parent.kind === "subplot"
        ? [plotValue.parent.parentPlotDefinitionId]
        : [],
    "plot-parent-cycle",
    "The Plot parent hierarchy contains a cycle.",
    byId,
    addIssue,
  );

  for (const plotValue of ordered) {
    for (const relationship of [
      ...(plotValue.prerequisites ?? []),
      ...(plotValue.dependencies ?? []),
    ]) {
      const target = byId.get(relationship.plotDefinitionId);
      if (!target) {
        addIssue(
          "plot-relationship-not-found",
          plotValue,
          "A Plot prerequisite or dependency is not present.",
        );
        continue;
      }
      if (target.campaignDefinitionId !== plotValue.campaignDefinitionId) {
        addIssue(
          "plot-relationship-crosses-campaign-definition",
          plotValue,
          "Plot prerequisites and dependencies must remain in one Campaign Definition.",
          target,
        );
        continue;
      }
      if (
        !isAncestor(plotValue, target.id, byId) &&
        !relationship.crossBranchRationale?.trim()
      ) {
        addIssue(
          "plot-cross-branch-relationship-unexplained",
          plotValue,
          "A cross-branch Plot relationship requires an explicit rationale.",
          target,
        );
      }
    }
  }

  addCycleIssues(
    ordered,
    (plotValue) => [
      ...(plotValue.prerequisites ?? []).map(
        (relationship) => relationship.plotDefinitionId,
      ),
      ...(plotValue.dependencies ?? []).map(
        (relationship) => relationship.plotDefinitionId,
      ),
    ],
    "plot-relationship-cycle",
    "The Plot prerequisite and dependency graph contains a cycle.",
    byId,
    addIssue,
  );

  issues.sort((left, right) =>
    [left.code, left.plotName, left.relatedPlotName ?? ""]
      .join("\0")
      .localeCompare(
        [right.code, right.plotName, right.relatedPlotName ?? ""].join("\0"),
        "en",
      ),
  );
  return { valid: issues.length === 0, issues };
}

function isAncestor(
  plotValue: PlotDefinition,
  possibleAncestorId: PlotDefinitionId,
  byId: ReadonlyMap<PlotDefinitionId, PlotDefinition>,
): boolean {
  const visited = new Set<PlotDefinitionId>();
  let current = plotValue;
  while (current.parent.kind === "subplot") {
    const parentId = current.parent.parentPlotDefinitionId;
    if (parentId === possibleAncestorId) return true;
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (
      !parent ||
      parent.campaignDefinitionId !== plotValue.campaignDefinitionId
    ) {
      return false;
    }
    current = parent;
  }
  return false;
}

function addCycleIssues(
  plots: readonly PlotDefinition[],
  adjacent: (plotValue: PlotDefinition) => readonly PlotDefinitionId[],
  code: "plot-parent-cycle" | "plot-relationship-cycle",
  message: string,
  byId: ReadonlyMap<PlotDefinitionId, PlotDefinition>,
  addIssue: (
    code: PlotHierarchyValidationIssueCode,
    plotValue: PlotDefinition,
    message: string,
    related?: PlotDefinition,
  ) => void,
): void {
  const complete = new Set<PlotDefinitionId>();
  const active = new Set<PlotDefinitionId>();
  const reported = new Set<string>();

  const visit = (plotValue: PlotDefinition) => {
    if (complete.has(plotValue.id)) return;
    active.add(plotValue.id);
    for (const targetId of adjacent(plotValue)) {
      const target = byId.get(targetId);
      if (
        !target ||
        target.campaignDefinitionId !== plotValue.campaignDefinitionId
      ) {
        continue;
      }
      if (active.has(targetId)) {
        const key = [String(plotValue.id), String(targetId)].sort().join("\0");
        if (!reported.has(key)) {
          reported.add(key);
          addIssue(code, plotValue, message, target);
        }
      } else {
        visit(target);
      }
    }
    active.delete(plotValue.id);
    complete.add(plotValue.id);
  };

  for (const plotValue of plots) visit(plotValue);
}
