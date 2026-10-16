import type { ModifierGrantDefinition } from "./modifiers";
import type { NumericExpression } from "./dice";
import type { Predicate } from "./expressions";
import type {
  Definition,
  DefinitionId,
  Duration,
  EventId,
  ExtensionData,
  JsonValue,
  NamespacedKey,
} from "./primitives";
import type { ChoiceDefinition, RuleModifier, UsageLimit } from "./rules";

/** Stable key of a Profession Rank option in the applicable captured Model Schema. */
export type ProfessionExpertise = NamespacedKey;

export type ProfessionAcquisitionRule<
  Tier extends string = ProfessionExpertise,
> =
  | {
      readonly kind: "character-creation";
      readonly startingExpertise: Tier;
      readonly choices?: readonly ChoiceDefinition[];
    }
  | {
      readonly kind: "during-play";
      readonly prerequisites?: readonly Predicate[];
      readonly trainingDuration?: Duration;
      readonly trainingActionId?: DefinitionId;
      readonly startingExpertise: Tier;
    };

/** Controls when points may be spent to enter an expertise tier. */
export type ProfessionAdvancementWindow =
  | { readonly kind: "any-time" }
  | { readonly kind: "minimum-character-level"; readonly level: number }
  | { readonly kind: "character-levels"; readonly levels: readonly number[] }
  | {
      readonly kind: "character-level-interval";
      readonly firstLevel: number;
      readonly everyLevels: number;
      readonly finalLevel?: number;
    }
  | { readonly kind: "milestone"; readonly milestone: string }
  | { readonly kind: "custom"; readonly predicate: Predicate };

export interface ProfessionTierBenefits {
  /** Granted once on entering this tier; retained alongside earlier tier grants. */
  readonly modifierGrants?: readonly ModifierGrantDefinition[];
  /** Persistent attribute, statistic, proficiency, or other rule modifiers. */
  readonly modifiers?: readonly RuleModifier[];
  readonly traitIds?: readonly DefinitionId[];
  readonly resourceMaximums?: Readonly<Record<string, NumericExpression>>;
}

export interface ProfessionExpertiseLevel<
  Tier extends string = ProfessionExpertise,
> {
  readonly tier: Tier;
  readonly rank: number;
  /** Omitted only for the initial tier. */
  readonly advancementPointCost?: NumericExpression;
  readonly advancementWindow?: ProfessionAdvancementWindow;
  readonly prerequisites?: readonly Predicate[];
  readonly benefits: ProfessionTierBenefits;
}

export interface ProfessionActionImprovement<
  Tier extends string = ProfessionExpertise,
> {
  readonly atExpertise: Tier;
  /** Modifiers target paths within the referenced action's compiled resolution. */
  readonly modifiers?: readonly RuleModifier[];
  /** Supports a materially different higher-tier action while preserving the progression link. */
  readonly replacementActionId?: DefinitionId;
  readonly description?: string;
}

export interface ProfessionActionProgression<
  Tier extends string = ProfessionExpertise,
> {
  readonly actionId: DefinitionId;
  readonly unlocksAt: Tier;
  readonly advancementPointsOnUse: NumericExpression;
  readonly advancementLimit?: UsageLimit;
  readonly qualifyingUse?: Predicate;
  readonly improvements?: readonly ProfessionActionImprovement<Tier>[];
}

export interface ProfessionComponents<
  Tier extends string = ProfessionExpertise,
> {
  readonly grantedConditions?: readonly import("./world-codex").WorldGrantedCondition[];
  readonly grantedEffects?: readonly import("./world-codex").WorldGrantedEffect[];
  /** Lowest to highest; each tier must appear exactly once. */
  readonly expertiseOrder: readonly Tier[];
  readonly expertiseLevels: readonly ProfessionExpertiseLevel<Tier>[];
  readonly acquisition: readonly ProfessionAcquisitionRule<Tier>[];
  readonly actions: readonly ProfessionActionProgression<Tier>[];
  readonly prerequisites?: readonly Predicate[];
  readonly choices?: readonly ChoiceDefinition[];
  readonly mutuallyExclusiveWith?: readonly DefinitionId[];
}

export type ProfessionDefinition<
  Tier extends string = ProfessionExpertise,
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"profession", ProfessionComponents<Tier>, Extensions>;

export interface ProfessionAcquisitionState {
  readonly kind: "character-creation" | "during-play";
  readonly acquiredAtCharacterLevel: number;
  readonly acquiredAt?: string;
  readonly sourceDefinitionId?: DefinitionId;
  readonly trainingActionId?: DefinitionId;
}

export interface ProfessionAdvancementAward {
  readonly eventId: EventId;
  readonly actionId: DefinitionId;
  readonly points: number;
  readonly awardedAt: string;
}

export interface ProfessionAdvancementSpend<
  Tier extends string = ProfessionExpertise,
> {
  readonly eventId: EventId;
  readonly fromExpertise: Tier;
  readonly toExpertise: Tier;
  readonly points: number;
  readonly characterLevel: number;
  readonly spentAt: string;
}

export interface ProfessionAdvancementState<
  Tier extends string = ProfessionExpertise,
> {
  readonly availablePoints: number;
  readonly lifetimePointsEarned: number;
  readonly lifetimePointsSpent: number;
  readonly awards: readonly ProfessionAdvancementAward[];
  readonly spends: readonly ProfessionAdvancementSpend<Tier>[];
}

export interface CharacterProfessionState<
  Tier extends string = ProfessionExpertise,
  CustomState extends Readonly<Record<string, JsonValue>> = Readonly<
    Record<string, JsonValue>
  >,
> {
  readonly professionId: DefinitionId;
  readonly expertise: Tier;
  readonly acquisition: ProfessionAcquisitionState;
  readonly advancement: ProfessionAdvancementState<Tier>;
  readonly actionUseCounts: Readonly<Record<string, number>>;
  readonly customState?: CustomState;
}
