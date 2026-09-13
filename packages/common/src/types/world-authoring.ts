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
  readonly discoveries?: readonly DiscoveryClaim[];
  /** Optional until an uploaded, selected, or generated image is attached. */
  readonly image?: LocationImage;
  /** Source map; omitted means the existing image presentation. */
  readonly map?: LocationMap;
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
> = ItemDefinition<Extensions> & WorldAuthoredDefinitionGovernance<Extensions>;

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
  readonly gmDescription?: string;
  readonly discoveries?: readonly DiscoveryClaim[];
  readonly image?: LocationImage;
  readonly kind: LocationKind;
  readonly parentLocationId?: LocationId;
  readonly profileSummary?: string;
  readonly profileTags?: readonly string[];
  readonly mapSceneNotes?: string;
  readonly mapOrientation?: LocationMapOrientation;
}

export interface CreateWorldCreatureDraftRequest extends WorldDraftMutationRequest {
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
  readonly itemFamilyKey: NamespacedKey;
  readonly category: WorldItemDefinition["components"]["category"];
  readonly quality: WorldItemDefinition["components"]["quality"];
  /** Alternative complete slot assignments; an entry may require multiple slots. */
  readonly compatibleEquipmentSlotSets: readonly CompatibleEquipmentSlotSet[];
  readonly image: WorldItemDefinition["image"];
}
