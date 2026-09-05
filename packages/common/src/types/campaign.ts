import type {
  CampaignId,
  CreatureId,
  CurrencyAmount,
  DefinitionId,
  ExtensionData,
  LocationId,
  StateIdentity,
} from "./primitives";
import type { NormalizedMapCoordinate } from "./locations";

/** @deprecated Use CampaignPlacementDefinition with a world-creature source. */
export interface CampaignCreaturePlacement {
  readonly id: string;
  readonly creatureId: CreatureId;
  readonly locationId: LocationId;
  /** Optional persistent position on the location map. */
  readonly mapPosition?: NormalizedMapCoordinate;
  /** Optional visual scale multiplier for the placed token. */
  readonly scale?: number;
}

/** @deprecated Use CampaignPlacementDefinition with a world-item source. */
export interface CampaignItemPlacement {
  readonly id: string;
  readonly itemDefinitionId: DefinitionId;
  readonly locationId: LocationId;
}

/** @deprecated Objects, Traps, and Hazards are Item families; use CampaignPlacementDefinition. */
export interface CampaignObjectPlacement {
  readonly id: string;
  readonly objectDefinitionId: DefinitionId;
  readonly locationId: LocationId;
}

export type CampaignDiscoveryGrant =
  | {
      readonly kind: "money";
      readonly value: CurrencyAmount;
    }
  | {
      readonly kind: "rumor" | "fact" | "general-knowledge";
      readonly text: string;
    }
  | {
      readonly kind: "item";
      readonly itemDefinitionId: DefinitionId;
    };

/** @deprecated Use PlotDiscovery claims in a Campaign Definition Plot. */
export interface CampaignDiscovery {
  readonly id: string;
  readonly name: string;
  readonly locationId: LocationId;
  readonly grants: readonly CampaignDiscoveryGrant[];
}

/** Stable compositing-layer identifiers used by campaign preparation canvases. */
export type CampaignCanvasLayerKey =
  | "background"
  | "background-effects"
  | "tiles"
  | "grid"
  | "regions"
  | "drawings"
  | "templates"
  | "walls"
  | "tokens"
  | "sounds"
  | "lighting"
  | "notes"
  | "controls"
  | "special-effects"
  | "illumination-effects"
  | "coloration-effects"
  | "darkness-effects"
  | "visibility"
  | "particle-effects"
  | "weather-effects"
  | "filter-effects"
  | "interface";

/** Persistent GM-authored presentation state for one location-canvas layer. */
export interface CampaignCanvasLayerConfiguration {
  readonly key: CampaignCanvasLayerKey;
  readonly visible: boolean;
  /** A normalized value from 0 (transparent) through 1 (opaque). */
  readonly opacity: number;
}

/** A persistent light emitter authored directly on a location map. */
export interface CampaignCanvasLightSource {
  readonly id: string;
  readonly name: string;
  readonly position: NormalizedMapCoordinate;
  /** Range as a fraction of the smaller map dimension. */
  readonly radius: number;
  /** CSS-compatible light color used by the canvas renderer. */
  readonly color: string;
}

/** How a persistent sound source's volume behaves across its range. */
export type CampaignCanvasSoundVolumeMode = "distance" | "constant";

/** A persistent positional sound emitter authored on a location map. */
export interface CampaignCanvasSoundSource {
  readonly id: string;
  readonly name: string;
  readonly position: NormalizedMapCoordinate;
  /** Range as a fraction of the smaller map dimension. */
  readonly radius: number;
  /** Playback volume from 0 (silent) through 1 (full volume). */
  readonly volume: number;
  readonly volumeMode: CampaignCanvasSoundVolumeMode;
  readonly loop: boolean;
}

/** A persistent freeform drawing authored on a location map. */
export interface CampaignCanvasDrawing {
  readonly id: string;
  readonly name: string;
  readonly position: NormalizedMapCoordinate;
  /** Size as a radius expressed as a fraction of the smaller map dimension. */
  readonly radius: number;
}

/** A persistent area template authored on a location map. */
export interface CampaignCanvasTemplate {
  readonly id: string;
  readonly name: string;
  readonly position: NormalizedMapCoordinate;
  /** Size as a radius expressed as a fraction of the smaller map dimension. */
  readonly radius: number;
}

/** A persistent GM-authored note pinned to a location map. */
export interface CampaignCanvasNote {
  readonly id: string;
  readonly name: string;
  readonly position: NormalizedMapCoordinate;
  readonly text: string;
}

/** Reusable canvas preparation for one world location in a campaign. */
export interface CampaignLocationCanvasConfiguration {
  readonly locationId: LocationId;
  readonly layers: readonly CampaignCanvasLayerConfiguration[];
  /** Canvas pixels representing five feet for measurement and side-on falls. */
  readonly pixelsPerFiveFeet?: number;
  readonly lightSources?: readonly CampaignCanvasLightSource[];
  readonly soundSources?: readonly CampaignCanvasSoundSource[];
  readonly drawings?: readonly CampaignCanvasDrawing[];
  readonly templates?: readonly CampaignCanvasTemplate[];
  readonly notes?: readonly CampaignCanvasNote[];
}

/**
 * @deprecated Legacy compatibility aggregate that conflates authored Campaign
 * Definition content with persistent play context and uses CampaignId for both.
 * New work uses CampaignDefinitionLineage, CampaignDefinitionRevision,
 * CampaignInstance, and CampaignInstanceRuntime. This shape remains available
 * until stored legacy campaigns and their callers have migrated.
 */
export interface CampaignDefinition<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignId>;
  readonly name: string;
  readonly worldId: LocationId;
  readonly gmPremise: string;
  readonly playerIntroduction: string;
  /** Materialized world hierarchy; all descendants are in editable scope. */
  readonly locationIds: readonly LocationId[];
  readonly partyStartingLocationId: LocationId;
  readonly creaturePlacements: readonly CampaignCreaturePlacement[];
  readonly itemPlacements: readonly CampaignItemPlacement[];
  readonly objectPlacements: readonly CampaignObjectPlacement[];
  readonly discoveries: readonly CampaignDiscovery[];
  /** Persistent per-location presentation state shared across sessions. */
  readonly locationCanvases: readonly CampaignLocationCanvasConfiguration[];
  readonly extensions?: Extensions;
}
