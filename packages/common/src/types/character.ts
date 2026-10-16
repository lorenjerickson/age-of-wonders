import type { ModifierGrantDefinition } from "./modifiers";
import type { DiceExpression } from "./dice";
import type { Predicate } from "./expressions";
import type { EquipmentState } from "./items";
import type { OperatingBasis, UnderstandingState } from "./disciplines";
import type { CharacterHeritageState } from "./heritage";
import type {
  Attribute,
  AttributeCollection,
  AttributeScore,
  CampaignInstanceMembershipId,
  CharacterId,
  Definition,
  DefinitionId,
  Distance,
  ExtensionData,
  OpenString,
  ResourcePool,
  SenseType,
} from "./primitives";
import type { ChoiceDefinition, TraitDefinition } from "./rules";
import type { CharacterProfessionState } from "./professions";
import type { CreatureState } from "./creatures";

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

export interface BackgroundComponents {
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  readonly grantedEffects?: readonly import("./world-codex").WorldGrantedEffect[];
  /** Backstory benefits granted once when the Background is acquired. */
  readonly modifierGrants?: readonly ModifierGrantDefinition[];
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
> extends CreatureState<Extensions, Equipment, CharacterId> {
  /** Campaign membership that owns this character, including inactive predecessors. */
  readonly ownerMembershipId: CampaignInstanceMembershipId;
  /** Whether this character may currently represent its owning player in play. */
  readonly campaignStatus: "active" | "retired" | "dead";
  readonly level: number;
  readonly experiencePoints?: number;
  readonly milestoneCount?: number;
  readonly inspiration?: ResourcePool;
  readonly heritage?: Heritage;
  readonly backgroundId: DefinitionId;
  readonly creationFeatId?: DefinitionId;
  readonly alignment?: Alignment;
  readonly deity?: string;
  readonly deathSaves?: DeathSaveState;
  readonly exhaustionLevel?: number;
  readonly featureIds: readonly DefinitionId[];
  readonly featIds: readonly DefinitionId[];
  readonly professions: readonly Profession[];
  readonly biography?: Readonly<Record<string, string>>;
}
