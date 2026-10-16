import type {
  D20TestDefinition,
  DiceExpression,
  DiceTerm,
  NumericExpression,
  RollMode,
} from "./dice";
import type { Predicate, ScalarExpression } from "./expressions";
import type { OperatingBasis, UnderstandingState } from "./disciplines";
import type {
  Attribute,
  CurrencyAmount,
  DamageType,
  Definition,
  DefinitionId,
  Distance,
  EntityId,
  ExtensionData,
  ItemInstanceId,
  LocationId,
  MediaAssetId,
  NamespacedKey,
  NonEmptyReadonlyArray,
  OpenString,
  ResourcePool,
  SceneId,
  SizeCategory,
  Weight,
} from "./primitives";
import type { ActionDefinition, RuleModifier, TraitDefinition } from "./rules";

export type ItemRarity = OpenString<
  | "common"
  | "uncommon"
  | "rare"
  | "very-rare"
  | "legendary"
  | "unique"
  | "varies"
>;

export type ItemCategory = OpenString<
  | "weapon"
  | "armor"
  | "shield"
  | "adventuring-gear"
  | "ammunition"
  | "tool"
  | "mount"
  | "vehicle"
  | "trade-good"
  | "control-interface"
  | "compound"
  | "procedure-record"
  | "device"
  | "ring"
  | "rod"
  | "staff"
  | "wand"
  | "treasure"
>;

/** Seed identities from the editable core Equipment Slot vocabulary. This list is not exhaustive. */
export const CORE_EQUIPMENT_SLOT_KEYS = [
  "aow:equipment-slot-pack",
  "aow:equipment-slot-head",
  "aow:equipment-slot-neck",
  "aow:equipment-slot-off-hand",
  "aow:equipment-slot-main-hand",
  "aow:equipment-slot-chest",
  "aow:equipment-slot-shoulders",
  "aow:equipment-slot-arms",
  "aow:equipment-slot-hands",
  "aow:equipment-slot-wrists",
  "aow:equipment-slot-legs",
  "aow:equipment-slot-feet",
  "aow:equipment-slot-waist",
  "aow:equipment-slot-back",
  "aow:equipment-slot-right-finger",
  "aow:equipment-slot-left-finger",
] as const;

/** Exact historical Belt slot aliases; the Belt container category is unrelated. */
export function canonicalEquipmentSlotKey(slot: string): string {
  return slot === "belt"
    ? "waist"
    : slot === "aow:equipment-slot-belt"
      ? "aow:equipment-slot-waist"
      : slot;
}

/** Stable key of an Equipment Slot option in an adopted Model Schema release. */
export type EquipmentSlot = NamespacedKey;
export const ITEM_QUALITIES = [
  "ramshackle",
  "standard",
  "fine",
  "exquisite",
] as const;
export type ItemQuality = (typeof ITEM_QUALITIES)[number];
export type SlottedContainerKind = "belt" | "pack" | "bag";
export type BeltSlotCategory = OpenString<
  "consumable" | "tool" | "wallet" | "purse" | "small-gear"
>;

/** One valid set of slots that an item occupies simultaneously. */
export type CompatibleEquipmentSlotSet<
  Slot extends EquipmentSlot = EquipmentSlot,
> = NonEmptyReadonlyArray<Slot>;

export interface EquippableItemDefinition<
  Slot extends EquipmentSlot = EquipmentSlot,
> {
  /** Each entry is an alternative complete slot assignment for this item. */
  readonly compatibleSlotSets: NonEmptyReadonlyArray<
    CompatibleEquipmentSlotSet<Slot>
  >;
}

export interface QualitySlotCapacity<
  Quality extends ItemQuality = ItemQuality,
> {
  readonly quality: Quality;
  /** Optional exact rarity match; omission is an explicitly authored quality fallback. */
  readonly rarity?: ItemRarity;
  readonly slots: number;
}

export type SlottedContainerDefinition<
  Quality extends ItemQuality = ItemQuality,
> =
  | {
      readonly kind: "belt";
      readonly accepts: "belt-compatible-items";
      readonly capacityByQuality: NonEmptyReadonlyArray<
        QualitySlotCapacity<Quality>
      >;
    }
  | {
      readonly kind: "pack" | "bag";
      readonly accepts: "any-item";
      readonly capacityByQuality: NonEmptyReadonlyArray<
        QualitySlotCapacity<Quality>
      >;
    };

export function isBeltSlotCompatible(components: ItemComponents): boolean {
  return (
    components.consumable === true ||
    components.tool !== undefined ||
    components.beltSlotCategory !== undefined
  );
}

export function containerSlotCapacity<Quality extends ItemQuality>(
  container: SlottedContainerDefinition<Quality>,
  quality: Quality,
  rarity?: ItemRarity,
): number | undefined {
  const rows = container.capacityByQuality;
  return (
    rows.find(
      (entry) =>
        entry.quality === quality &&
        entry.rarity !== undefined &&
        entry.rarity === rarity,
    ) ??
    rows.find(
      (entry) => entry.quality === quality && entry.rarity === undefined,
    )
  )?.slots;
}

export type WeaponCategory = OpenString<
  "simple-melee" | "simple-ranged" | "martial-melee" | "martial-ranged"
>;
export type WeaponProperty = OpenString<
  | "ammunition"
  | "finesse"
  | "heavy"
  | "light"
  | "loading"
  | "reach"
  | "thrown"
  | "two-handed"
  | "versatile"
  | "special"
>;

/** Optional weapon dice added to the attacker's base 1d20 hit roll. */
export interface WeaponHitDice extends DiceExpression {
  readonly terms: NonEmptyReadonlyArray<DiceTerm>;
}

export type WeaponRange =
  | {
      readonly kind: "melee";
      readonly minimum: Distance;
      readonly maximum: Distance;
    }
  | {
      readonly kind: "ranged";
      readonly minimum: Distance;
      readonly maximum: Distance;
    };

export interface WeaponDamageSavingThrow {
  readonly test: D20TestDefinition & { readonly kind: "saving-throw" };
  readonly onSuccess: "negates" | "half-damage";
}

export interface WeaponDamageComponent {
  readonly damage: DiceExpression;
  readonly damageType: DamageType;
  /** When present, this damage component is resolved using the saving throw after a hit lands. */
  readonly savingThrow?: WeaponDamageSavingThrow;
}

export type WeaponWieldingKind = "one-handed" | "two-handed" | "dual-wield";

export type WeaponMinimumProficiency =
  "half" | "proficient" | "expertise" | "custom";

export interface WeaponWieldingProficiency {
  /** Proficiency subjects checked against the wielder's ProficiencyEntry records. */
  readonly subjects: NonEmptyReadonlyArray<string>;
  readonly match: "any" | "all";
  readonly minimumRank: WeaponMinimumProficiency;
  readonly onFailure: {
    readonly hitRollMode: Extract<RollMode, "normal" | "disadvantage">;
    readonly weaponHitDice: "include" | "omit";
  };
}

export interface WeaponWieldingMode {
  readonly kind: WeaponWieldingKind;
  readonly handsRequired: 1 | 2;
  /** Dual wielding uses two one-handed weapon instances, one in each hand. */
  readonly requiresSecondWeapon?: boolean;
  readonly proficiency?: WeaponWieldingProficiency;
}

export interface WeaponDefinition {
  readonly category: WeaponCategory;
  /** Optional and uncommon; rolled with the attacker's base 1d20 for exceptional weapons. */
  readonly hitDice?: WeaponHitDice;
  readonly range: WeaponRange;
  readonly damage: NonEmptyReadonlyArray<WeaponDamageComponent>;
  readonly wieldingModes: NonEmptyReadonlyArray<WeaponWieldingMode>;
  readonly properties: readonly WeaponProperty[];
  readonly ammunitionType?: DefinitionId;
  readonly masteryProperty?: DefinitionId;
  readonly attackAttribute?: Attribute | "best-of-might-agility";
}

export type ArmorCategory = OpenString<"light" | "medium" | "heavy" | "shield">;

/** One or more dice rolled from an equipped armor item for each incoming attack. */
export interface ArmorDefenseDice extends DiceExpression {
  readonly terms: NonEmptyReadonlyArray<DiceTerm>;
}

export interface ArmorDefinition {
  readonly category: ArmorCategory;
  /** Dice contributed to the wearer's opposed defense roll while this armor is equipped. */
  readonly defenseDice: ArmorDefenseDice;
  readonly agilityContribution?: "none" | "full" | { readonly maximum: number };
  readonly mightRequirement?: number;
  readonly stealthDisadvantage?: boolean;
  readonly donTime?: number;
  readonly doffTime?: number;
}

/** A stored square illustration used to depict an item in catalogs, stores, inventories, and slots. */
export interface ItemImage {
  readonly assetId: MediaAssetId;
  readonly uri?: string;
  readonly altText: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: `image/${string}`;
}

export interface ToolDefinition {
  readonly attributeSuggestions?: readonly Attribute[];
  readonly activities?: readonly {
    readonly name: string;
    readonly attribute: Attribute;
    readonly difficultyClass?: number;
  }[];
}

export interface VehicleDefinition {
  readonly vehicleType: OpenString<
    "land" | "waterborne" | "airborne" | "space"
  >;
  readonly size: SizeCategory;
  readonly armorClass: number;
  readonly hitPoints: number;
  readonly damageThreshold?: number;
  readonly crew?: number;
  readonly passengers?: number;
  readonly cargoCapacity?: Weight;
  readonly speeds: Readonly<Record<string, Distance>>;
  readonly components?: readonly DefinitionId[];
  readonly actions?: readonly ActionDefinition[];
}

export interface AttunementRequirement {
  readonly required: boolean;
  readonly prerequisites?: readonly Predicate[];
  readonly countsAgainstLimit?: boolean;
}

export interface ItemCapacityDefinition {
  readonly maximum: NumericExpression;
  readonly recharge?: {
    readonly timing: "dawn" | "dusk" | "short-rest" | "long-rest" | "custom";
    readonly amount: DiceExpression | NumericExpression;
  };
  readonly destroyedWhenEmpty?: boolean;
}

export interface ItemComponents<
  Slot extends EquipmentSlot = EquipmentSlot,
  Quality extends ItemQuality = ItemQuality,
> {
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  readonly category: ItemCategory;
  /** Required construction and workmanship rating for this item definition. */
  readonly quality: Quality;
  readonly notes?: string;
  readonly weight?: Weight;
  readonly cost?: readonly CurrencyAmount[];
  readonly stackable?: boolean;
  readonly consumable?: boolean;
  /** Required for non-consumable, non-tool items intended for belt storage. */
  readonly beltSlotCategory?: BeltSlotCategory;
  readonly equippable?: EquippableItemDefinition<Slot>;
  readonly slottedContainer?: SlottedContainerDefinition<Quality>;
  readonly rarity?: ItemRarity;
  readonly operatingBasis?: OperatingBasis;
  readonly understanding?: UnderstandingState;
  readonly mechanismDescription?: string;
  readonly provenance?: string;
  readonly attunement?: AttunementRequirement;
  readonly weapon?: WeaponDefinition;
  readonly armor?: ArmorDefinition;
  readonly tool?: ToolDefinition;
  readonly vehicle?: VehicleDefinition;
  readonly capacity?: ItemCapacityDefinition;
  readonly traits?: readonly TraitDefinition[];
  readonly actions?: readonly ActionDefinition[];
  readonly modifiers?: readonly RuleModifier[];
  readonly prerequisites?: readonly Predicate[];
  readonly crafting?: CraftingRecipe;
}

export type ItemDefinition<
  Extensions extends ExtensionData = ExtensionData,
  Slot extends EquipmentSlot = EquipmentSlot,
  Quality extends ItemQuality = ItemQuality,
> = Definition<"item", ItemComponents<Slot, Quality>, Extensions> & {
  readonly image: ItemImage;
};

export interface CraftingIngredient {
  readonly itemId?: DefinitionId;
  readonly tag?: string;
  readonly quantity: ScalarExpression;
  readonly consumed: boolean;
}

export interface CraftingRecipe {
  readonly time: NumericExpression;
  readonly cost?: readonly CurrencyAmount[];
  readonly ingredients?: readonly CraftingIngredient[];
  readonly toolProficiencies?: readonly string[];
  readonly check?: string;
  readonly produces: readonly {
    readonly itemId: DefinitionId;
    readonly quantity: NumericExpression;
  }[];
}

export interface ItemInstance<Quality extends ItemQuality = ItemQuality> {
  readonly id: ItemInstanceId;
  readonly definitionId: DefinitionId;
  readonly nameOverride?: string;
  readonly quantity: number;
  /** Actual construction quality of this physical item instance. */
  readonly quality: Quality;
  readonly location:
    | { readonly kind: "inventory"; readonly ownerId: EntityId }
    | { readonly kind: "container"; readonly containerId: ItemInstanceId }
    | {
        readonly kind: "scene";
        readonly sceneId: SceneId;
        readonly position?: import("./combat").Point3D;
      }
    | { readonly kind: "location"; readonly locationId: LocationId }
    | { readonly kind: "carried"; readonly carrierId: EntityId }
    | { readonly kind: "destroyed" };
  readonly attunedBy?: string;
  readonly analyzed?: boolean;
  readonly capacity?: ResourcePool;
  readonly ammunition?: number;
  readonly durability?: ResourcePool;
  readonly customValues?: Readonly<
    Record<string, ScalarExpression | string | number | boolean>
  >;
  readonly extensions?: ExtensionData;
}

export interface ContainerEquipmentSlot<
  ItemId extends ItemInstanceId = ItemInstanceId,
> {
  /** Zero-based stable position within the container. */
  readonly index: number;
  readonly itemId?: ItemId;
}

export interface EquippedContainerState<
  ItemId extends ItemInstanceId = ItemInstanceId,
> {
  readonly containerItemId: ItemId;
  /** Contains every available slot, including empty slots. */
  readonly slots: readonly ContainerEquipmentSlot<ItemId>[];
}

/** Equipment is composed into any inventory-owning creature aggregate. */
export interface EquipmentState<
  Slot extends EquipmentSlot = EquipmentSlot,
  ItemId extends ItemInstanceId = ItemInstanceId,
> {
  /** Multi-slot items repeat the same item ID in every occupied slot. */
  readonly slots: Readonly<Partial<Record<Slot, ItemId>>>;
  readonly containers: readonly EquippedContainerState<ItemId>[];
}

export interface InventoryState {
  readonly itemIds: readonly ItemInstanceId[];
  readonly currencies: readonly CurrencyAmount[];
  readonly attunementLimit: number;
}
