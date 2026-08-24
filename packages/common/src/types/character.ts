import type { DiceExpression, NumericExpression } from "./dice";
import type { Predicate } from "./expressions";
import type { EquipmentState, InventoryState } from "./items";
import type {
  DisciplineState,
  OperatingBasis,
  UnderstandingState,
} from "./disciplines";
import type { CharacterHeritageState } from "./heritage";
import type {
  Attribute,
  AttributeCollection,
  AttributeScore,
  CharacterId,
  ConditionType,
  Definition,
  DefinitionId,
  Distance,
  EntityId,
  ExtensionData,
  OpenString,
  ResourcePool,
  SenseType,
  SizeCategory,
  StateIdentity,
} from "./primitives";
import type {
  ActiveEffect,
  ChoiceDefinition,
  RuleModifier,
  TraitDefinition,
} from "./rules";
import type { CharacterProfessionState } from "./professions";

export type ProficiencyRank =
  "none" | "half" | "proficient" | "expertise" | "custom";

export interface ProficiencyEntry {
  readonly subject: string;
  readonly rank: ProficiencyRank;
  readonly multiplier?: number;
  readonly sourceIds?: readonly DefinitionId[];
  readonly predicate?: Predicate;
}

export interface AttributeState {
  readonly score: AttributeScore;
  readonly modifier: number;
  readonly savingThrow: number;
  readonly proficientInSave: boolean;
}

export interface SkillState {
  readonly skillDefinitionId: DefinitionId;
  readonly attribute: Attribute;
  readonly rank: ProficiencyRank;
  readonly bonus: number;
  readonly passive: number;
}

export interface HitPointState {
  readonly current: number;
  readonly maximum: number;
  readonly temporary: number;
  readonly maximumReduction?: number;
  readonly hitDice?: readonly {
    readonly size: number;
    readonly total: number;
    readonly remaining: number;
    readonly sourceId: DefinitionId;
  }[];
}

export interface DeathSaveState {
  readonly successes: number;
  readonly failures: number;
  readonly stable: boolean;
}

export interface MovementSpeed {
  readonly mode: string;
  readonly distance: Distance;
  readonly hover?: boolean;
  readonly restrictions?: readonly Predicate[];
}

export interface SenseState {
  readonly sense: SenseType;
  readonly range?: Distance;
  readonly detail?: string;
  readonly operatingBasis?: OperatingBasis;
  readonly understanding?: UnderstandingState;
  readonly mechanismDescription?: string;
}

export interface ClassLevelState {
  readonly classId: DefinitionId;
  readonly subclassId?: DefinitionId;
  readonly level: number;
  readonly hitDie: number;
  readonly featureIds: readonly DefinitionId[];
  readonly resources?: Readonly<Record<string, ResourcePool>>;
  readonly choices?: Readonly<Record<string, readonly DefinitionId[]>>;
}

export type Alignment = OpenString<
  | "lawful-good"
  | "neutral-good"
  | "chaotic-good"
  | "lawful-neutral"
  | "neutral"
  | "chaotic-neutral"
  | "lawful-evil"
  | "neutral-evil"
  | "chaotic-evil"
  | "unaligned"
>;

export interface CharacterTemplateComponents {
  readonly minimumLevel?: number;
  readonly maximumLevel?: number;
  readonly attributeDefaults: AttributeCollection<AttributeScore>;
  readonly attributeGeneration?:
    | {
        readonly kind: "standard-array";
        readonly values: readonly AttributeScore[];
      }
    | {
        readonly kind: "point-buy";
        readonly points: number;
        readonly costs: Readonly<Record<number, number>>;
      }
    | {
        readonly kind: "roll";
        readonly expression: DiceExpression;
        readonly count: number;
      }
    | { readonly kind: "custom"; readonly description: string };
  readonly choices?: readonly ChoiceDefinition[];
  readonly traits?: readonly TraitDefinition[];
}

export type CharacterDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"character-template", CharacterTemplateComponents, Extensions>;

export interface ClassComponents {
  readonly hitDie: number;
  readonly primaryAttributes: readonly Attribute[];
  readonly savingThrowProficiencies: readonly Attribute[];
  readonly levelProgression: readonly ClassLevelDefinition[];
  readonly multiclassPrerequisites?: readonly Predicate[];
  readonly disciplineProgression?:
    "full" | "half" | "third" | "linked" | "none" | string;
}

export type ClassDefinition<Extensions extends ExtensionData = ExtensionData> =
  Definition<"class", ClassComponents, Extensions>;

export interface ClassLevelDefinition {
  readonly level: number;
  readonly proficiencyBonus?: number;
  readonly featureIds: readonly DefinitionId[];
  readonly resourceMaximums?: Readonly<Record<string, NumericExpression>>;
  readonly capacityByBand?: Readonly<Record<number, number>>;
  readonly choices?: readonly ChoiceDefinition[];
}

export interface SubclassComponents {
  readonly parentClassId: DefinitionId;
  readonly levelFeatures: Readonly<Record<number, readonly DefinitionId[]>>;
}

export type SubclassDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"subclass", SubclassComponents, Extensions>;

export interface BackgroundComponents {
  readonly attributeOptions?: readonly Attribute[];
  readonly skillProficiencyIds?: readonly DefinitionId[];
  readonly toolProficiencies?: readonly string[];
  readonly languageChoices?: number;
  readonly startingEquipment?: readonly DefinitionId[];
  readonly featId?: DefinitionId;
  readonly featureIds?: readonly DefinitionId[];
  readonly characteristics?: Readonly<Record<string, readonly string[]>>;
  readonly choices?: readonly ChoiceDefinition[];
}

export type BackgroundDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"background", BackgroundComponents, Extensions>;

export interface FeatComponents {
  readonly category?: OpenString<
    "origin" | "general" | "fighting-style" | "epic-boon"
  >;
  readonly prerequisites?: readonly Predicate[];
  readonly repeatable?: boolean;
  readonly traits: readonly TraitDefinition[];
  readonly choices?: readonly ChoiceDefinition[];
}

export type FeatDefinition<Extensions extends ExtensionData = ExtensionData> =
  Definition<"feat", FeatComponents, Extensions>;

export interface CharacterState<
  Extensions extends ExtensionData = ExtensionData,
  Profession extends CharacterProfessionState = CharacterProfessionState,
  Heritage extends CharacterHeritageState = CharacterHeritageState,
  Equipment extends EquipmentState = EquipmentState,
> {
  readonly identity: StateIdentity<CharacterId>;
  readonly entityId: EntityId;
  readonly name: string;
  readonly playerId?: string;
  readonly controllerIds: readonly string[];
  readonly level: number;
  readonly experiencePoints?: number;
  readonly milestoneCount?: number;
  readonly inspiration?: ResourcePool;
  readonly heritage: Heritage;
  readonly backgroundId: DefinitionId;
  readonly creationFeatId?: DefinitionId;
  readonly alignment?: Alignment;
  readonly deity?: string;
  readonly size: SizeCategory;
  readonly classes: readonly ClassLevelState[];
  readonly attributes: AttributeCollection<AttributeState>;
  readonly skills: readonly SkillState[];
  readonly proficiencyBonus: number;
  readonly proficiencies: readonly ProficiencyEntry[];
  readonly armorClass: number;
  readonly initiativeBonus: number;
  readonly hitPoints: HitPointState;
  readonly deathSaves?: DeathSaveState;
  readonly exhaustionLevel?: number;
  readonly speeds: readonly MovementSpeed[];
  readonly senses: readonly SenseState[];
  readonly languages: readonly string[];
  readonly inventory: InventoryState;
  readonly equipment: Equipment;
  readonly disciplines?: DisciplineState;
  readonly featureIds: readonly DefinitionId[];
  readonly featIds: readonly DefinitionId[];
  readonly professions: readonly Profession[];
  readonly activeEffects: readonly ActiveEffect[];
  readonly conditions: readonly ConditionType[];
  readonly resources: Readonly<Record<string, ResourcePool>>;
  readonly modifiers?: readonly RuleModifier[];
  readonly biography?: Readonly<Record<string, string>>;
  readonly extensions?: Extensions;
}
