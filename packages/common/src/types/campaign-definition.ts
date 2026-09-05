import type { CampaignLocationCanvasConfiguration } from "./campaign";
import type {
  CampaignIndependentPlacementSource,
  CampaignPlacementDefinition,
  WorldPlacementDefinition,
} from "./placements";
import type { PlotDefinition, PlotHierarchyValidationIssue } from "./plots";
import { validatePlotHierarchy } from "./plots";
import type {
  CampaignDefinitionId,
  CampaignPlacementDefinitionId,
  CreatureId,
  DefinitionId,
  ExtensionData,
  LocationId,
  ModelSchemaReleaseId,
  PlotDefinitionId,
  WorldPlacementDefinitionId,
  WorldDefinitionSnapshotId,
} from "./primitives";

/** Reusable preparation owned by a Campaign Definition, never by a Session. */
export interface CampaignPreparationDefaults<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly startingLocationId?: LocationId;
  /** Reusable narrative and staging context for a newly created Instance. */
  readonly startingContext?: string;
  /** Campaign-authored guidance for variations over captured World maps. */
  readonly mapVariations?: string;
  readonly locationCanvases?: readonly CampaignLocationCanvasConfiguration[];
  readonly extensions?: Extensions;
}

/** Complete authored content for one Campaign Definition revision or draft. */
export interface CampaignDefinitionContent<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly formatVersion: 1;
  readonly gmPremise: string;
  readonly playerIntroduction: string;
  readonly plotDefinitionIds: readonly PlotDefinitionId[];
  readonly placementDefinitionIds: readonly CampaignPlacementDefinitionId[];
  /** Exact Campaign-scoped releases layered over the captured World releases. */
  readonly modelSchemaReleaseIds: readonly ModelSchemaReleaseId[];
  readonly preparation?: CampaignPreparationDefaults<Extensions>;
  readonly extensions?: Extensions;
}

/**
 * AI or import proposal waiting to be applied to a specific Campaign lineage.
 * Applying it adds that lineage's CampaignDefinitionId to every Plot.
 */
export interface CampaignDefinitionDraftProposal<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly sourceWorldDefinitionSnapshotId: WorldDefinitionSnapshotId;
  readonly name: string;
  readonly description?: string;
  readonly content: CampaignDefinitionContent<Extensions>;
  readonly plots: readonly Omit<PlotDefinition<Extensions>, "campaignDefinitionId">[];
  readonly placements: readonly CampaignPlacementDefinition<Extensions>[];
  readonly records: readonly (
    | {
        readonly resourceType: "plots";
        readonly sourceId: PlotDefinitionId;
        readonly payload: Omit<PlotDefinition<Extensions>, "campaignDefinitionId">;
      }
    | {
        readonly resourceType: "campaign-placements";
        readonly sourceId: CampaignPlacementDefinitionId;
        readonly payload: CampaignPlacementDefinition<Extensions>;
      }
  )[];
}

export interface CampaignDefinitionValidationContext {
  readonly campaignDefinitionId: CampaignDefinitionId;
  readonly capturedLocationIds: ReadonlySet<LocationId>;
  readonly capturedCreatureIds: ReadonlySet<CreatureId>;
  readonly capturedItemDefinitionIds: ReadonlySet<DefinitionId>;
  readonly capturedDefinitionIds: ReadonlySet<DefinitionId>;
  readonly capturedWorldPlacements: ReadonlyMap<
    WorldPlacementDefinitionId,
    WorldPlacementDefinition
  >;
}

export type CampaignDefinitionValidationIssueCode =
  | "plot-membership-mismatch"
  | "placement-membership-mismatch"
  | "plot-campaign-mismatch"
  | "location-not-captured"
  | "placement-plot-not-found"
  | "placement-source-not-captured"
  | "plot-context-placement-not-found"
  | "plot-context-placement-mismatch"
  | "world-placement-not-captured"
  | "world-placement-location-mismatch"
  | "model-release-duplicate"
  | PlotHierarchyValidationIssue["code"];

export interface CampaignDefinitionValidationIssue {
  readonly code: CampaignDefinitionValidationIssueCode;
  readonly subject: string;
  readonly detail: string;
}

export interface CampaignDefinitionValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CampaignDefinitionValidationIssue[];
}

/** Validates authored Campaign records against one exact captured World. */
export function validateCampaignDefinitionContent(
  content: CampaignDefinitionContent,
  plots: readonly PlotDefinition[],
  placements: readonly CampaignPlacementDefinition[],
  context: CampaignDefinitionValidationContext,
): CampaignDefinitionValidationResult {
  const issues: CampaignDefinitionValidationIssue[] = [];
  const add = (
    code: CampaignDefinitionValidationIssueCode,
    subject: string,
    detail: string,
  ) => issues.push({ code, subject, detail });

  compareMembership(
    content.plotDefinitionIds,
    plots.map(({ id }) => id),
    "plot-membership-mismatch",
    "Campaign Definition",
    "The declared Plot collection must exactly match the captured Plot records.",
    add,
  );
  compareMembership(
    content.placementDefinitionIds,
    placements.map(({ id }) => id),
    "placement-membership-mismatch",
    "Campaign Definition",
    "The declared placement collection must exactly match the captured placement records.",
    add,
  );
  if (new Set(content.modelSchemaReleaseIds).size !== content.modelSchemaReleaseIds.length) {
    add(
      "model-release-duplicate",
      "Campaign Definition",
      "An exact Model Schema release may be selected only once.",
    );
  }

  for (const hierarchyIssue of validatePlotHierarchy(plots).issues) {
    add(hierarchyIssue.code, hierarchyIssue.plotName, hierarchyIssue.message);
  }

  const plotIds = new Set(plots.map(({ id }) => id));
  const placementsById = new Map(placements.map((placement) => [placement.id, placement]));
  for (const plot of plots) {
    if (plot.campaignDefinitionId !== context.campaignDefinitionId) {
      add(
        "plot-campaign-mismatch",
        plot.name,
        "The Plot belongs to a different Campaign Definition.",
      );
    }
    for (const locationContext of plot.locationContexts) {
      if (!context.capturedLocationIds.has(locationContext.locationId)) {
        add(
          "location-not-captured",
          plot.name,
          "A Plot Location context is not present in the captured World.",
        );
      }
      for (const placementId of locationContext.placementDefinitionIds ?? []) {
        const placement = placementsById.get(placementId);
        if (!placement) {
          add(
            "plot-context-placement-not-found",
            plot.name,
            "A referenced Campaign placement is not present in this Campaign Definition.",
          );
        } else if (
          placement.locationId !== locationContext.locationId ||
          !placement.plotDefinitionIds.includes(plot.id)
        ) {
          add(
            "plot-context-placement-mismatch",
            plot.name,
            "A Plot Location context and its Campaign placement must reference one another at the same captured Location.",
          );
        }
      }
    }
  }

  const startingLocationId = content.preparation?.startingLocationId;
  if (
    startingLocationId !== undefined &&
    !context.capturedLocationIds.has(startingLocationId)
  ) {
    add(
      "location-not-captured",
      "Campaign preparation",
      "The starting Location is not present in the captured World.",
    );
  }

  for (const placement of placements) {
    const subject = placement.name?.trim() || "Campaign placement";
    if (!context.capturedLocationIds.has(placement.locationId)) {
      add(
        "location-not-captured",
        subject,
        "The placement Location is not present in the captured World.",
      );
    }
    for (const plotId of placement.plotDefinitionIds) {
      if (!plotIds.has(plotId)) {
        add(
          "placement-plot-not-found",
          subject,
          "A related Plot is not present in this Campaign Definition.",
        );
      }
    }
    if (placement.kind === "independent") {
      if (!sourceIsCaptured(placement.source, context)) {
        add(
          "placement-source-not-captured",
          subject,
          "The placement source is not present in the captured World content.",
        );
      }
      continue;
    }
    const captured = context.capturedWorldPlacements.get(
      placement.capturedWorldPlacementId,
    );
    if (!captured) {
      add(
        "world-placement-not-captured",
        subject,
        "The decorated World placement is not present in the captured World.",
      );
    } else if (captured.locationId !== placement.locationId) {
      add(
        "world-placement-location-mismatch",
        subject,
        "The decoration must use the captured World placement's Location.",
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

function compareMembership<Id extends string>(
  declared: readonly Id[],
  captured: readonly Id[],
  code: CampaignDefinitionValidationIssueCode,
  subject: string,
  detail: string,
  add: (
    code: CampaignDefinitionValidationIssueCode,
    subject: string,
    detail: string,
  ) => void,
): void {
  if (
    new Set(declared).size !== declared.length ||
    new Set(captured).size !== captured.length ||
    declared.length !== captured.length ||
    declared.some((id) => !captured.includes(id))
  ) {
    add(code, subject, detail);
  }
}

function sourceIsCaptured(
  source: CampaignIndependentPlacementSource,
  context: CampaignDefinitionValidationContext,
): boolean {
  if (source.kind === "world-creature") {
    return context.capturedCreatureIds.has(source.creatureId);
  }
  if (source.kind === "world-item") {
    return context.capturedItemDefinitionIds.has(source.itemDefinitionId);
  }
  if (source.kind === "registered-content") {
    return context.capturedDefinitionIds.has(source.definitionId);
  }
  return (
    source.suggestedCreatureDefinitionId === undefined ||
    context.capturedDefinitionIds.has(source.suggestedCreatureDefinitionId)
  );
}
