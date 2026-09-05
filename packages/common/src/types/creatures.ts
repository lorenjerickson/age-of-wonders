import type { DiceExpression, NumericExpression } from "./dice";
import type {
  ArmorDefenseDice,
  EquipmentSlot,
  EquipmentState,
  InventoryState,
} from "./items";
import type {
  DisciplineState,
  OperatingBasis,
  UnderstandingState,
} from "./disciplines";
import type {
  AttributeCollection,
  AttributeScore,
  ConditionType,
  CreatureId,
  CreatureNature,
  DamageType,
  Definition,
  DefinitionId,
  EntityId,
  ExtensionData,
  ItemInstanceId,
  LocationId,
  MediaAssetId,
  OpenString,
  PartialAttributeCollection,
  ResourcePool,
  SizeCategory,
  StateIdentity,
} from "./primitives";
import type {
  ActiveEffect,
  ActionDefinition,
  RuleModifier,
  TraitDefinition,
  TriggerDefinition,
} from "./rules";
import type {
  AttributeState,
  HitPointState,
  MovementSpeed,
  ProficiencyEntry,
  SenseState,
  SkillState,
} from "./character";

export type ChallengeRating = number | `${number}/${number}`;

export type CreatureMorphology = OpenString<
  | "humanoid"
  | "animal"
  | "plant"
  | "fungus"
  | "microorganism"
  | "amorphous"
  | "colony"
  | "modular"
  | "unknown"
>;

export interface CreatureClassificationAlias {
  readonly label: string;
  readonly context?: string;
  readonly language?: string;
  readonly locationId?: LocationId;
}

export interface CreatureClassification {
  readonly nature: CreatureNature;
  readonly morphology?: CreatureMorphology;
  readonly formalName?: string;
  readonly origin?: string;
  readonly composition?: readonly string[];
  readonly aliases: readonly CreatureClassificationAlias[];
}

export type CommunicationMedium = OpenString<
  | "acoustic"
  | "visual"
  | "chemical"
  | "radio"
  | "neural"
  | "field-effect"
  | "wired"
  | "unknown"
>;

export interface CommunicationCapability {
  readonly medium: CommunicationMedium;
  readonly directionality: "one-way" | "bidirectional" | "broadcast";
  readonly range?: import("./primitives").Distance;
  readonly operatingBasis: OperatingBasis;
  readonly understanding: UnderstandingState;
  readonly requirements?: readonly string[];
  readonly description?: string;
}

/** A stored creature illustration prepared for a specific table or map view. */
export interface CreatureImage {
  readonly assetId: MediaAssetId;
  readonly uri?: string;
  readonly altText: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: `image/${string}`;
}

/** The three required visual representations of a creature. */
export interface CreatureImages {
  /** Full-size, full-body player-facing illustration used to present the creature at the table. */
  readonly portrait: CreatureImage;
  /** Top-down view used as a token on maps viewed from above. */
  readonly overheadToken: CreatureImage;
  /** Compact, full-body side view used as a token on multi-level maps viewed from the side. */
  readonly paperDollToken: CreatureImage;
}

/** Defense dice supplied by one equipped armor item. */
export interface ArmorDefenseContribution {
  /** The equipped armor instance that supplies these dice. */
  readonly itemId: ItemInstanceId;
  /** Every equipment slot occupied by that armor instance. */
  readonly equipmentSlots: readonly [EquipmentSlot, ...EquipmentSlot[]];
  readonly dice: ArmorDefenseDice;
}

/** Rolled anew against an attacker's base 1d20 plus equipped-weapon hit dice. */
export interface CreatureDefenseRating {
  /** The combined defense roll is the sum of every equipped armor contribution. */
  readonly contributions: readonly ArmorDefenseContribution[];
}

export interface DamageAdjustment {
  readonly damageType: DamageType;
  readonly response:
    "resistance" | "immunity" | "vulnerability" | "reduction" | "multiplier";
  readonly predicate?: import("./expressions").Predicate;
  readonly amount?: NumericExpression;
  readonly multiplier?: number;
  readonly bypassPredicate?: import("./expressions").Predicate;
  readonly extensions?: ExtensionData;
}

export interface MonsterComponents {
  readonly size: SizeCategory;
  readonly classification: CreatureClassification;
  readonly subtypes?: readonly string[];
  readonly alignment?: string;
  readonly defenseRating: DiceExpression;
  readonly hitPoints: {
    readonly average: number;
    readonly formula: import("./dice").DiceExpression;
  };
  readonly speeds: readonly MovementSpeed[];
  readonly attributes: AttributeCollection<AttributeScore>;
  readonly savingThrows?: PartialAttributeCollection<number>;
  readonly skills?: readonly {
    readonly skillDefinitionId: DefinitionId;
    readonly bonus: number;
  }[];
  readonly damageAdjustments?: readonly DamageAdjustment[];
  readonly conditionImmunities?: readonly ConditionType[];
  readonly senses?: readonly SenseState[];
  readonly languages?: readonly string[];
  readonly communicationCapabilities?: readonly CommunicationCapability[];
  readonly challengeRating: ChallengeRating;
  readonly experiencePoints?: number;
  readonly proficiencyBonus?: number;
  readonly traits?: readonly TraitDefinition[];
  readonly actions: readonly ActionDefinition[];
  readonly bonusActions?: readonly ActionDefinition[];
  readonly reactions?: readonly ActionDefinition[];
  readonly legendaryActions?: readonly ActionDefinition[];
  readonly legendaryActionBudget?: number;
  readonly mythicActions?: readonly ActionDefinition[];
  readonly lairActions?: readonly ActionDefinition[];
  readonly regionalEffects?: readonly TraitDefinition[];
  readonly disciplines?: Omit<DisciplineState, "capacityBands">;
  readonly gear?: readonly DefinitionId[];
  readonly encounterGroups?: readonly string[];
}

export type MonsterDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"monster", MonsterComponents, Extensions>;

export interface CreatureState<
  Extensions extends ExtensionData = ExtensionData,
  Equipment extends EquipmentState = EquipmentState,
  Id extends CreatureId = CreatureId,
> {
  readonly identity: StateIdentity<Id>;
  readonly entityId: EntityId;
  /** Root world that owns this creature and supplies its setting context. */
  readonly worldId: LocationId;
  readonly definitionId?: DefinitionId;
  readonly name: string;
  readonly images: CreatureImages;
  readonly controllerIds: readonly string[];
  readonly size: SizeCategory;
  readonly classification: CreatureClassification;
  readonly attributes: AttributeCollection<AttributeState>;
  readonly skills: readonly SkillState[];
  readonly proficiencies: readonly ProficiencyEntry[];
  readonly proficiencyBonus: number;
  readonly defenseRating: CreatureDefenseRating;
  readonly initiativeBonus: number;
  readonly hitPoints: HitPointState;
  readonly speeds: readonly MovementSpeed[];
  readonly senses: readonly SenseState[];
  readonly languages: readonly string[];
  readonly communicationCapabilities: readonly CommunicationCapability[];
  readonly inventory: InventoryState;
  readonly equipment: Equipment;
  readonly disciplines?: DisciplineState;
  readonly actions: readonly DefinitionId[];
  readonly activeEffects: readonly ActiveEffect[];
  readonly conditions: readonly ConditionType[];
  readonly resources: Readonly<Record<string, ResourcePool>>;
  readonly damageAdjustments: readonly DamageAdjustment[];
  readonly modifiers?: readonly RuleModifier[];
  readonly triggers?: readonly TriggerDefinition[];
  readonly form?: {
    readonly definitionId: DefinitionId;
    readonly retainedFields: readonly string[];
    readonly originalStateId?: string;
  };
  readonly disposition?: OpenString<
    "friendly" | "neutral" | "hostile" | "unknown"
  >;
  readonly extensions?: Extensions;
}
