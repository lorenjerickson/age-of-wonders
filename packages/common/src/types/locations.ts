import type { DiceExpression, NumericExpression } from "./dice";
import type { OperatingBasis, UnderstandingState } from "./disciplines";
import type { Predicate } from "./expressions";
import type {
  DefinitionId,
  Distance,
  Duration,
  EntityId,
  ExtensionData,
  JsonValue,
  LocationConnectionId,
  LocationId,
  MediaAssetId,
  NamespacedKey,
  OpenString,
  SceneId,
  StateIdentity,
  VersionedState,
} from "./primitives";
import type { RuleModifier } from "./rules";

export type LocationKind = OpenString<
  | "world"
  | "plane"
  | "continent"
  | "ocean"
  | "region"
  | "nation"
  | "province"
  | "territory"
  | "wilderness"
  | "settlement"
  | "district"
  | "site"
>;

export type PhysicalEnvironmentKind = OpenString<
  | "planetary-region"
  | "extradimensional-region"
  | "artificial-habitat"
  | "isolated-habitat"
  | "simulation"
  | "field-contained-region"
  | "unknown"
>;

export interface PhysicalEnvironment {
  readonly kind: PhysicalEnvironmentKind;
  readonly understanding: UnderstandingState;
  readonly observedProperties: readonly [string, ...string[]];
  readonly operatingBasis?: OperatingBasis;
  readonly mechanismDescription?: string;
  readonly sustainingInfrastructure?: readonly string[];
  readonly boundaryConditions?: readonly string[];
  readonly accessConstraints?: readonly string[];
  readonly provenance?: string;
}

/** A location image whose orientation declares its strategic or encounter-map use. */
export interface LocationImage {
  readonly assetId: MediaAssetId;
  readonly uri?: string;
  readonly altText: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: `image/${string}`;
  /** How this image is used by the encounter map renderer. */
  readonly orientation: LocationImageOrientation;
  readonly focalPoint?: NormalizedMapCoordinate;
}

export type LocationImageOrientation = "scenic" | "overhead" | "side-on";
export type LocationMapOrientation = LocationImageOrientation | "isometric";

export interface NormalizedMapCoordinate {
  readonly kind: "normalized-map";
  /** Horizontal position in the inclusive range 0..1. */
  readonly x: number;
  /** Vertical position in the inclusive range 0..1. */
  readonly y: number;
}

export interface LocationWallBlocking {
  readonly sight: boolean;
  readonly sound: boolean;
  readonly movement: boolean;
  readonly environmentalEffects: boolean;
}

export type LocationWallKind = "wall" | "door" | "invisible-wall";

/**
 * An encounter-scale wall drawn over a site's map. Vertices are normalized to
 * the location image so the geometry remains stable across display sizes.
 */
export interface LocationWall {
  readonly id: string;
  /** Missing on legacy records and interpreted as `wall` during migration/read. */
  readonly kind: LocationWallKind;
  readonly vertices: readonly [
    NormalizedMapCoordinate,
    NormalizedMapCoordinate,
    ...NormalizedMapCoordinate[],
  ];
  readonly blocks: LocationWallBlocking;
  /** Only meaningful for doors. Open doors do not block any channel. */
  readonly doorState?: "open" | "closed";
}

export interface LocationTransitionDestination {
  readonly locationId: LocationId;
  readonly position: NormalizedMapCoordinate;
}

/**
 * A circular encounter-map trigger. A token intersecting the trigger is moved
 * to the destination position, which may be on this or another location map.
 */
export interface LocationTransition {
  readonly id: string;
  readonly position: NormalizedMapCoordinate;
  /** Radius as a fraction of the map's smaller displayed dimension. */
  readonly radius: number;
  readonly destination: LocationTransitionDestination;
}

export interface GeographicCoordinate {
  readonly kind: "geographic";
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation?: number;
}

export interface CustomLocationCoordinate {
  readonly kind: "custom";
  readonly coordinateSystem: NamespacedKey;
  readonly value: JsonValue;
}

export type LocationCoordinate =
  NormalizedMapCoordinate | GeographicCoordinate | CustomLocationCoordinate;

/** Rings contain at least three vertices; runtime validation also requires a non-self-intersecting area. */
export type LocationRing<
  Coordinate extends LocationCoordinate = LocationCoordinate,
> = readonly [Coordinate, Coordinate, Coordinate, ...Coordinate[]];

export interface LocationPolygon<
  Coordinate extends LocationCoordinate = LocationCoordinate,
> {
  readonly exterior: LocationRing<Coordinate>;
  readonly holes?: readonly LocationRing<Coordinate>[];
}

export interface LocationBorder<
  Coordinate extends LocationCoordinate = LocationCoordinate,
> {
  /** Identifies the parent map/projection in which every coordinate is expressed. */
  readonly coordinateSpace:
    | { readonly kind: "parent-image"; readonly imageAssetId: MediaAssetId }
    | { readonly kind: "geographic"; readonly datum?: string }
    | { readonly kind: "custom"; readonly key: NamespacedKey };
  readonly geometry:
    | {
        readonly kind: "polygon";
        readonly polygon: LocationPolygon<Coordinate>;
      }
    | {
        readonly kind: "multi-polygon";
        readonly polygons: readonly LocationPolygon<Coordinate>[];
      };
}

export type LocationPlacement<
  Coordinate extends LocationCoordinate = LocationCoordinate,
> =
  | { readonly kind: "root" }
  | {
      readonly kind: "within-parent";
      readonly parentLocationId: LocationId;
      /** Pin position on the parent location's strategic map. */
      readonly mapPosition?: NormalizedMapCoordinate;
      readonly border: LocationBorder<Coordinate>;
    };

export interface LocationAspectSummary {
  readonly summary?: string;
  readonly tags: readonly string[];
  /** References reusable traits from the active rules catalog. */
  readonly traitIds: readonly DefinitionId[];
}

export interface TerrainAggregate {
  readonly aspect: LocationAspectSummary;
  readonly terrainTypes: readonly string[];
  readonly climates?: readonly string[];
  readonly elevationRange?: readonly [minimum: number, maximum: number];
  readonly waterways?: readonly string[];
  readonly naturalResourceTags?: readonly string[];
  readonly hazardDefinitionIds?: readonly DefinitionId[];
  readonly travelModifiers?: readonly RuleModifier[];
}

export interface CulturePresence {
  readonly cultureId: DefinitionId;
  readonly prominence?: number;
  readonly population?: number;
  readonly settlementPattern?: string;
}

export interface CultureAggregate {
  readonly aspect: LocationAspectSummary;
  readonly cultures: readonly CulturePresence[];
  /** Heritage definitions available to characters whose origin is this region. */
  readonly heritageCandidateIds: readonly DefinitionId[];
  readonly languages: readonly string[];
  readonly population?: number;
  readonly customs?: readonly string[];
  readonly religions?: readonly DefinitionId[];
}

export interface PoliticalInfluence {
  /** May identify a faction entity in the campaign or a catalog definition. */
  readonly polityId: EntityId | DefinitionId;
  readonly role: OpenString<
    "sovereign" | "administrator" | "claimant" | "occupier" | "influencer"
  >;
  readonly influence?: number;
}

export interface PoliticalRelationship {
  readonly otherLocationId: LocationId;
  readonly relation: OpenString<
    "allied" | "friendly" | "neutral" | "tense" | "hostile" | "at-war"
  >;
  readonly since?: string;
  readonly notes?: string;
}

export interface PoliticsAggregate {
  readonly aspect: LocationAspectSummary;
  readonly governmentForms?: readonly string[];
  readonly influences: readonly PoliticalInfluence[];
  readonly relationships?: readonly PoliticalRelationship[];
  readonly stability?: number;
  readonly laws?: readonly string[];
}

export interface LocationProfile {
  readonly terrain: TerrainAggregate;
  readonly culture: CultureAggregate;
  readonly politics: PoliticsAggregate;
}

export interface LocationState<
  Coordinate extends LocationCoordinate = LocationCoordinate,
  Profile extends LocationProfile = LocationProfile,
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<LocationId>;
  readonly name: string;
  readonly description?: string;
  readonly kind: LocationKind;
  /** Required when kind is `plane`; optional when unusual physics matters elsewhere. */
  readonly physicalEnvironment?: PhysicalEnvironment;
  readonly placement: LocationPlacement<Coordinate>;
  readonly image: LocationImage;
  readonly profile: Profile;
  /** Encounter-scale collision boundaries; only meaningful when kind is `site`. */
  readonly walls?: readonly LocationWall[];
  /** Encounter-scale token transfer triggers; only meaningful when kind is `site`. */
  readonly transitions?: readonly LocationTransition[];
  /** Encounter-scale scenes contextually situated in this strategic location. */
  readonly sceneIds: readonly SceneId[];
  readonly pointOfInterestIds?: readonly EntityId[];
  readonly discoveredBy?: readonly EntityId[];
  readonly extensions?: Extensions;
}

export type LocationConnectionKind = OpenString<
  | "shared-border"
  | "road"
  | "trail"
  | "river"
  | "sea-route"
  | "air-route"
  | "portal"
  | "passage"
>;

export interface ConnectionMechanism {
  readonly operatingBasis: OperatingBasis;
  readonly understanding: UnderstandingState;
  readonly observedOperation: string;
  readonly mechanismDescription?: string;
  readonly infrastructure?: readonly string[];
  readonly activationRequirements?: readonly string[];
  readonly failureModes?: readonly string[];
}

export interface LocationConnectionState<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<LocationConnectionId>;
  /** The parent location within which this direct movement edge is valid. */
  readonly scopeLocationId: LocationId;
  readonly fromLocationId: LocationId;
  readonly toLocationId: LocationId;
  readonly direction: "bidirectional" | "from-to-only" | "to-from-only";
  readonly kind: LocationConnectionKind;
  readonly status: OpenString<
    "open" | "restricted" | "blocked" | "destroyed" | "unknown"
  >;
  readonly distance?: Distance;
  readonly typicalDuration?: Duration;
  readonly allowedMovementModes?: readonly string[];
  readonly prerequisites?: readonly Predicate[];
  readonly travelCheck?: {
    readonly interval?: Duration;
    readonly encounterRoll?: DiceExpression;
    readonly difficulty?: NumericExpression;
  };
  /** Required for portals and any connection whose traversal is not ordinary locomotion. */
  readonly mechanism?: ConnectionMechanism;
  readonly notes?: string;
  readonly extensions?: Extensions;
}

/** Normalized strategic geography; child collections are derived from each location's placement. */
export interface LocationGraphState<
  Location extends LocationState = LocationState,
  Connection extends LocationConnectionState = LocationConnectionState,
> {
  readonly version: VersionedState;
  readonly rootLocationIds: readonly LocationId[];
  readonly locations: readonly Location[];
  readonly connections: readonly Connection[];
}
