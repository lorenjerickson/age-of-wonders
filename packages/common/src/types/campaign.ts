import type {
  CampaignId,
  CreatureId,
  CurrencyAmount,
  DefinitionId,
  ExtensionData,
  LocationId,
  StateIdentity,
} from "./primitives";

/** The initial placement of one world-supplied creature in a campaign. */
export interface CampaignCreaturePlacement {
  readonly id: string;
  readonly creatureId: CreatureId;
  readonly locationId: LocationId;
}

/** The initial placement of one world-defined inventory item in a campaign. */
export interface CampaignItemPlacement {
  readonly id: string;
  readonly itemDefinitionId: DefinitionId;
  readonly locationId: LocationId;
}

/** The initial placement of one world-defined environmental object. */
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

/** GM-controlled information or value authored at one world location. */
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

/** GM-authored presentation defaults for one session-canvas layer. */
export interface CampaignCanvasLayerConfiguration {
  readonly key: CampaignCanvasLayerKey;
  readonly visible: boolean;
  /** A normalized value from 0 (transparent) through 1 (opaque). */
  readonly opacity: number;
}

/** Reusable canvas preparation for one world location in a campaign. */
export interface CampaignLocationCanvasConfiguration {
  readonly locationId: LocationId;
  readonly layers: readonly CampaignCanvasLayerConfiguration[];
}

/**
 * Reusable, GM-authored starting context for campaign instances.
 *
 * This definition deliberately does not contain a party roster, session clock,
 * prescribed player actions, or mutable state produced during play.
 */
export interface CampaignDefinition<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignId>;
  readonly name: string;
  readonly worldId: LocationId;
  readonly gmPremise: string;
  readonly playerIntroduction: string;
  /** World locations explicitly included in this campaign's editable scope. */
  readonly locationIds: readonly LocationId[];
  readonly partyStartingLocationId: LocationId;
  readonly creaturePlacements: readonly CampaignCreaturePlacement[];
  readonly itemPlacements: readonly CampaignItemPlacement[];
  readonly objectPlacements: readonly CampaignObjectPlacement[];
  readonly discoveries: readonly CampaignDiscovery[];
  /** Per-location GM preparation defaults; mutable play state belongs to sessions. */
  readonly locationCanvases: readonly CampaignLocationCanvasConfiguration[];
  readonly extensions?: Extensions;
}
