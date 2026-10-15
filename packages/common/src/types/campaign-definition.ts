import type { CampaignLocationCanvasConfiguration } from "./campaign";
import type {
  CampaignPlacementDefinition,
  WorldPlacementDefinition,
} from "./placements";
import type { PlotDefinition, PlotHierarchyValidationIssue } from "./plots";
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
  readonly plots: readonly Omit<
    PlotDefinition<Extensions>,
    "campaignDefinitionId"
  >[];
  readonly placements: readonly CampaignPlacementDefinition<Extensions>[];
  readonly records: readonly (
    | {
        readonly resourceType: "plots";
        readonly sourceId: PlotDefinitionId;
        readonly payload: Omit<
          PlotDefinition<Extensions>,
          "campaignDefinitionId"
        >;
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
