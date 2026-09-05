import type { NormalizedMapCoordinate } from "./locations";
import type {
  CampaignPlacementDefinitionId,
  CreatureId,
  DefinitionId,
  ExtensionData,
  JsonValue,
  LocationId,
  NamespacedKey,
  PlotDefinitionId,
  WorldPlacementDefinitionId,
} from "./primitives";
import type { ModelConformance } from "./model-registry";

/** Reusable World content that can be placed at a captured Location. */
export type WorldPlaceableSource =
  | { readonly kind: "world-creature"; readonly creatureId: CreatureId }
  | { readonly kind: "world-item"; readonly itemDefinitionId: DefinitionId }
  | {
      readonly kind: "registered-content";
      readonly definitionId: DefinitionId;
    };

/**
 * World-owned placement intent. Its source token, presentation, and position are
 * immutable data in the World revision that contains it.
 */
export interface WorldPlacementDefinition<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: WorldPlacementDefinitionId;
  readonly locationId: LocationId;
  readonly source: WorldPlaceableSource;
  readonly name?: string;
  readonly mapPosition?: NormalizedMapCoordinate;
  readonly scale?: number;
  readonly notes?: string;
  /** Required when an applicable Model Schema declares an `aow:world-placement` concept. */
  readonly conformance?: ModelConformance;
  /** Values keyed by the selected Model field's stable storage key. */
  readonly modelValues?: Readonly<Record<NamespacedKey, JsonValue>>;
  readonly extensions?: Extensions;
}

export type CampaignIndependentPlacementSource =
  | WorldPlaceableSource
  | {
      readonly kind: "actor-role";
      readonly role: string;
      readonly suggestedCreatureDefinitionId?: DefinitionId;
    };

interface CampaignPlacementDefinitionBase<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: CampaignPlacementDefinitionId;
  /** The captured World Location against which this placement is authored. */
  readonly locationId: LocationId;
  /** A placement may support zero or more Plots without being copied. */
  readonly plotDefinitionIds: readonly PlotDefinitionId[];
  readonly name?: string;
  readonly mapPosition?: NormalizedMapCoordinate;
  readonly scale?: number;
  readonly notes?: string;
  /** Required when an applicable Model Schema declares an `aow:campaign-placement` concept. */
  readonly conformance?: ModelConformance;
  /** Values keyed by the selected Model field's stable storage key. */
  readonly modelValues?: Readonly<Record<NamespacedKey, JsonValue>>;
  readonly extensions?: Extensions;
}

/**
 * Campaign-owned placement intent. Neither variant mutates the captured World.
 * A decoration owns only its Campaign-specific additions to one captured World
 * placement; an independent placement owns its full placement intent.
 */
export type CampaignPlacementDefinition<
  Extensions extends ExtensionData = ExtensionData,
> =
  | (CampaignPlacementDefinitionBase<Extensions> & {
      readonly kind: "independent";
      readonly source: CampaignIndependentPlacementSource;
    })
  | (CampaignPlacementDefinitionBase<Extensions> & {
      readonly kind: "world-decoration";
      readonly capturedWorldPlacementId: WorldPlacementDefinitionId;
    });
