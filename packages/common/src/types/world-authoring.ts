import type { LocationMap } from "./isometric-terrain";
import type { DiscoveryClaim } from "./plots";
import type { MovementSpeed } from "./character";
import type {
  CreatureImages,
  CreatureInstanceEmbodimentPolicy,
} from "./creatures";
import type {
  CompatibleEquipmentSlotSet,
  EquipmentSlot,
  ItemDefinition,
} from "./items";
import type {
  LocationBorder,
  LocationKind,
  LocationImage,
  LocationMapOrientation,
  LocationSceneGrid,
  NormalizedMapCoordinate,
} from "./locations";
import type { ModelConformance } from "./model-registry";
import type {
  DefinitionId,
  Definition,
  ExtensionData,
  JsonValue,
  LocationId,
  NamespacedKey,
  StateIdentity,
} from "./primitives";

/** Authored scene weather; does not apply gameplay modifiers. */
export interface LocationWeather {
  readonly condition: string;
  readonly temperatureCelsius?: number;
  readonly wind?: {
    readonly speedKph: number;
    readonly directionDegrees?: number;
  };
}
/** Named authored media cue; playback is an Instance/Session concern. */
export interface LocationAudiovisualEffect {
  readonly id: string;
  readonly name: string;
  readonly kind: "audio" | "visual";
  readonly assetId: import("./primitives").MediaAssetId;
  readonly enabled: boolean;
  readonly loop: boolean;
  readonly volume?: number;
  readonly opacity?: number;
}

/** Canonical source Location stored in a World Definition snapshot. */
export interface WorldLocationDefinition<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<LocationId>;
  readonly name: string;
  /** Player-facing description, suitable for revealing during play. */
  readonly description?: string;
  /** Private authoring notes; never include in player-facing projections. */
  readonly gmDescription?: string;
  readonly weather?: LocationWeather;
  readonly audiovisualEffects?: readonly LocationAudiovisualEffect[];
  readonly discoveries?: readonly DiscoveryClaim[];
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  /** Required image content when map.kind is image; terrain maps do not require artwork. */
  readonly image?: LocationImage;
  /** Every valid authored Location owns an image or explicitly authored terrain map. */
  readonly map: LocationMap;
  readonly kind: LocationKind;
  readonly placement:
    | { readonly kind: "root" }
    | {
        readonly kind: "within-parent";
        readonly parentLocationId: LocationId;
        readonly mapPosition?: NormalizedMapCoordinate;
        readonly border?: LocationBorder;
      };
  /** Human-facing summary and discovery tags kept separate from map presentation. */
  readonly profile: {
    readonly summary?: string;
    readonly tags: readonly string[];
  };
  /** Optional scene-authoring notes; richer map resources may be added progressively. */
  readonly mapScene?: {
    readonly notes?: string;
    readonly orientation?: LocationMapOrientation;
    /** Preserved but inactive for scenic maps; independent of terrain cell dimensions. */
    readonly grid?: LocationSceneGrid;
  };
  readonly extensions?: Extensions;
}

interface WorldAuthoredDefinitionGovernance<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly conformance: ModelConformance;
  readonly modelValues?: Readonly<Record<NamespacedKey, JsonValue>>;
  readonly extensions?: Extensions;
}

export interface WorldCreatureDefinitionComponents {
  readonly skills?: Readonly<Record<string, number>>;
  readonly health?: {
    readonly current: number;
    readonly maximum: number;
    readonly temporary: number;
  };
  readonly vision?: { readonly day: number; readonly night: number };
  readonly equipmentPool?: readonly string[];
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  readonly attributes: Readonly<Record<NamespacedKey, number>>;
  readonly equipmentSlots: readonly EquipmentSlot[];
  readonly art: {
    readonly direction?: string;
    readonly images?: Partial<CreatureImages>;
  };
  readonly movement: readonly MovementSpeed[];
  readonly skillDefinitionIds: readonly DefinitionId[];
  readonly professionDefinitionIds: readonly DefinitionId[];
  readonly progressiveMechanics: {
    readonly notes?: string;
  };
}

/** Reusable World source for independently realized Campaign Instance Creatures. */
export type WorldCreatureDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"creature", WorldCreatureDefinitionComponents, Extensions> &
  WorldAuthoredDefinitionGovernance<Extensions> & {
    readonly instanceEmbodimentPolicy: CreatureInstanceEmbodimentPolicy;
  };

/** Reusable World source for Item Instances and World placements. */
export type WorldItemDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Omit<ItemDefinition<Extensions>, "image"> & {
  readonly image?: ItemDefinition<Extensions>["image"];
} & WorldAuthoredDefinitionGovernance<Extensions>;

export type WorldAuthoredRecord =
  | {
      readonly resourceType: "locations";
      readonly sourceId: LocationId;
      readonly payload: WorldLocationDefinition;
    }
  | {
      readonly resourceType: "definitions";
      readonly sourceId: DefinitionId;
      readonly payload: WorldCreatureDefinition | WorldItemDefinition;
    };

export interface WorldDraftMutationRequest {
  readonly expectedStorageRevision: number;
  readonly name: string;
  readonly description?: string;
}

export interface CreateWorldLocationDraftRequest extends WorldDraftMutationRequest {
  /** Omit to preserve; null explicitly removes authored configuration. */
  readonly weather?: LocationWeather | null;
  readonly audiovisualEffects?: readonly LocationAudiovisualEffect[] | null;
  readonly gmDescription?: string;
  readonly discoveries?: readonly DiscoveryClaim[];
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  readonly image?: LocationImage;
  readonly kind: LocationKind;
  readonly parentLocationId?: LocationId;
  readonly profileSummary?: string;
  readonly profileTags?: readonly string[];
  readonly mapSceneNotes?: string;
  readonly mapOrientation?: LocationMapOrientation;
  /** Omit on edits to retain the map; creation must supply a map or image. */
  readonly map?: LocationMap;
  /** Omit to preserve saved configuration; null explicitly clears it. */
  readonly mapSceneGrid?: LocationSceneGrid | null;
}

export interface CreateWorldCreatureDraftRequest extends WorldDraftMutationRequest {
  readonly skills?: Readonly<Record<string, number>>;
  readonly health?: {
    readonly current: number;
    readonly maximum: number;
    readonly temporary: number;
  };
  readonly vision?: { readonly day: number; readonly night: number };
  readonly equipmentPool?: readonly string[];
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  readonly attributes: Readonly<Record<NamespacedKey, number>>;
  readonly equipmentSlots: readonly EquipmentSlot[];
  readonly instanceEmbodimentPolicy: CreatureInstanceEmbodimentPolicy;
  readonly artDirection?: string;
  /** Artwork replacements; omitted views retain their existing images. */
  readonly images?: Partial<CreatureImages>;
  readonly movement?: readonly MovementSpeed[];
  readonly skillDefinitionIds?: readonly DefinitionId[];
  readonly professionDefinitionIds?: readonly DefinitionId[];
  readonly progressiveMechanicsNotes?: string;
}

export interface CreateWorldItemDraftRequest extends WorldDraftMutationRequest {
  /** Omitted preserves existing storage metadata; null explicitly removes it. */
  readonly slottedContainer?:
    import("./items").SlottedContainerDefinition | null;
  readonly beltSlotCategory?: import("./items").BeltSlotCategory | null;
  readonly rarity?: import("./items").ItemRarity | null;
  /** Omitted collections are preserved; an empty list explicitly clears them. */
  readonly traits?: readonly import("./rules").TraitDefinition[];
  readonly actions?: readonly import("./rules").ActionDefinition[];
  /** Omitted preserves existing Vehicle data; null explicitly removes it. */
  readonly vehicle?: import("./items").VehicleDefinition | null;
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  readonly weight?: import("./primitives").Weight;
  readonly cost?: readonly import("./primitives").CurrencyAmount[];
  readonly notes?: string;
  readonly itemFamilyKey: NamespacedKey;
  readonly category: WorldItemDefinition["components"]["category"];
  readonly quality: WorldItemDefinition["components"]["quality"];
  /** Alternative complete slot assignments; an entry may require multiple slots. */
  readonly compatibleEquipmentSlotSets: readonly CompatibleEquipmentSlotSet[];
  readonly image?: WorldItemDefinition["image"];
}
