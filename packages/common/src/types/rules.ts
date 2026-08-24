import type {
  D20TestDefinition,
  DiceExpression,
  NumericExpression,
} from "./dice";
import type { Predicate, ScalarExpression } from "./expressions";
import type {
  ConditionType,
  DamageType,
  DefinitionId,
  Definition,
  Distance,
  Duration,
  EffectInstanceId,
  EntityId,
  ExtensionData,
  JsonValue,
  NamespacedKey,
  RulePath,
} from "./primitives";

export type ActivationType =
  | "action"
  | "bonus-action"
  | "reaction"
  | "free-action"
  | "movement"
  | "legendary-action"
  | "lair-action"
  | "mythic-action"
  | "special"
  | "passive";

export type RestType = "short" | "long" | `homebrew:${string}`;

export interface ResourceCost {
  readonly resource: string;
  readonly amount: NumericExpression;
  readonly minimumRemaining?: number;
}

export type ActionCost =
  | {
      readonly kind: "economy";
      readonly activation: ActivationType;
      readonly count?: number;
    }
  | { readonly kind: "resource"; readonly cost: ResourceCost }
  | {
      readonly kind: "capacity";
      readonly band: number | "chosen";
      readonly sourceId?: string;
    }
  | {
      readonly kind: "item-use";
      readonly item: string;
      readonly amount?: number;
    }
  | { readonly kind: "hit-die"; readonly amount: number }
  | { readonly kind: "movement"; readonly distance: Distance }
  | {
      readonly kind: "custom";
      readonly key: NamespacedKey;
      readonly payload?: JsonValue;
    };

export type AreaShape =
  | { readonly kind: "cone"; readonly length: Distance }
  | { readonly kind: "cube"; readonly size: Distance }
  | {
      readonly kind: "cylinder";
      readonly radius: Distance;
      readonly height: Distance;
    }
  | { readonly kind: "emanation" | "sphere"; readonly radius: Distance }
  | {
      readonly kind: "line";
      readonly length: Distance;
      readonly width: Distance;
    }
  | {
      readonly kind: "wall";
      readonly length: Distance;
      readonly height: Distance;
      readonly thickness?: Distance;
    }
  | {
      readonly kind: "custom";
      readonly key: NamespacedKey;
      readonly payload?: JsonValue;
    };

export interface TargetDefinition {
  readonly kind:
    | "self"
    | "creature"
    | "object"
    | "point"
    | "area"
    | "willing-creature"
    | "custom";
  readonly count?: NumericExpression;
  readonly range?: Distance | "touch" | "sight" | "unlimited" | "self";
  readonly area?: AreaShape;
  readonly filters?: readonly Predicate[];
  readonly requiresSight?: boolean;
  readonly canTargetSelf?: boolean;
  readonly relationship?: "ally" | "enemy" | "neutral" | "any";
}

export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly value: JsonValue | DefinitionId;
  readonly prerequisites?: readonly Predicate[];
}

export interface ChoiceDefinition {
  readonly id: string;
  readonly prompt: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly options?: readonly ChoiceOption[];
  readonly optionCatalog?: DefinitionId;
  readonly allowDuplicates?: boolean;
  readonly visibility?: "public" | "controller" | "gm";
}

export type EventType =
  | "before-d20-test"
  | "after-d20-test"
  | "before-attack"
  | "after-attack"
  | "hit"
  | "miss"
  | "critical-hit"
  | "before-damage"
  | "after-damage"
  | "damage-taken"
  | "healed"
  | "reduced-to-zero-hp"
  | "death"
  | "turn-start"
  | "turn-end"
  | "round-start"
  | "round-end"
  | "move"
  | "enter-area"
  | "leave-area"
  | "condition-applied"
  | "condition-removed"
  | "discipline-activated"
  | "rest-start"
  | "rest-complete"
  | "resource-spent"
  | "profession-action-used"
  | "profession-advanced"
  | "custom";

export interface TriggerDefinition {
  readonly event: EventType;
  readonly customEvent?: NamespacedKey;
  readonly predicate?: Predicate;
  readonly timing?: "before" | "replace" | "after";
  readonly limit?: UsageLimit;
  readonly optional?: boolean;
  readonly priority?: number;
  readonly effects: readonly RuleEffect[];
}

export type UsageLimit =
  | {
      readonly kind: "uses";
      readonly maximum: NumericExpression;
      readonly resetsOn?: RestType | EventType;
    }
  | {
      readonly kind: "recharge";
      readonly die: number;
      readonly succeedsOn: readonly number[];
    }
  | { readonly kind: "once-per-turn" | "once-per-round" | "once-per-encounter" }
  | { readonly kind: "resource"; readonly resource: string };

export type ModifierOperation =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "set"
  | "minimum"
  | "maximum"
  | "grant-advantage"
  | "grant-disadvantage"
  | "grant-proficiency"
  | "grant-expertise"
  | "allow"
  | "prohibit";

export interface RuleModifier {
  readonly id: string;
  readonly target: RulePath;
  readonly operation: ModifierOperation;
  readonly value?: ScalarExpression;
  readonly predicate?: Predicate;
  readonly priority?: number;
  readonly stacking?:
    "stack" | "highest" | "lowest" | "replace" | "unique-by-source";
  readonly sourceLabel?: string;
}

export type RuleEffect =
  | {
      readonly kind: "damage";
      readonly target: string;
      readonly amount: DiceExpression;
      readonly damageType: DamageType;
    }
  | {
      readonly kind: "heal";
      readonly target: string;
      readonly amount: DiceExpression;
      readonly upToMaximum?: boolean;
    }
  | {
      readonly kind: "temporary-hit-points";
      readonly target: string;
      readonly amount: ScalarExpression;
      readonly replaceOnly?: boolean;
    }
  | {
      readonly kind: "change-resource";
      readonly target: string;
      readonly resource: string;
      readonly delta: ScalarExpression;
      readonly allowOverflow?: boolean;
    }
  | {
      readonly kind: "set-value";
      readonly target: string;
      readonly path: RulePath;
      readonly value: ScalarExpression;
    }
  | {
      readonly kind: "apply-condition";
      readonly target: string;
      readonly condition: ConditionType;
      readonly duration?: Duration;
      readonly saveEnds?: D20TestDefinition;
    }
  | {
      readonly kind: "remove-condition";
      readonly target: string;
      readonly condition: ConditionType;
    }
  | {
      readonly kind: "apply-modifier";
      readonly target: string;
      readonly modifier: RuleModifier;
      readonly duration?: Duration;
    }
  | { readonly kind: "remove-effect"; readonly effectId: EffectInstanceId }
  | {
      readonly kind: "move";
      readonly target: string;
      readonly distance: Distance;
      readonly forced?: boolean;
      readonly direction?: string;
    }
  | {
      readonly kind: "transit";
      readonly target: string;
      readonly destination: string;
      readonly maximumDistance?: Distance;
    }
  | {
      readonly kind: "grant-action";
      readonly target: string;
      readonly actionId: DefinitionId;
      readonly duration?: Duration;
    }
  | {
      readonly kind: "award-profession-points";
      readonly target: string;
      readonly professionId: DefinitionId;
      readonly amount: ScalarExpression;
      readonly actionId?: DefinitionId;
    }
  | {
      readonly kind: "make-test";
      readonly actor: string;
      readonly test: D20TestDefinition;
      readonly bindResultAs?: string;
    }
  | {
      readonly kind: "repeat-save";
      readonly target: string;
      readonly test: D20TestDefinition;
      readonly onSuccess?: readonly RuleEffect[];
    }
  | {
      readonly kind: "choose";
      readonly chooser: string;
      readonly choice: ChoiceDefinition;
      readonly bindAs: string;
    }
  | {
      readonly kind: "branch";
      readonly predicate: Predicate;
      readonly whenTrue: readonly RuleEffect[];
      readonly whenFalse?: readonly RuleEffect[];
    }
  | {
      readonly kind: "for-each";
      readonly collection: ScalarExpression;
      readonly bindAs: string;
      readonly effects: readonly RuleEffect[];
    }
  | {
      readonly kind: "deploy";
      readonly definitionId: DefinitionId;
      readonly controller?: string;
      readonly count?: NumericExpression;
      readonly duration?: Duration;
    }
  | {
      readonly kind: "create-object";
      readonly definitionId: DefinitionId;
      readonly position?: string;
      readonly duration?: Duration;
    }
  | { readonly kind: "destroy-entity"; readonly target: string }
  | {
      readonly kind: "emit-event";
      readonly event: NamespacedKey;
      readonly payload?: JsonValue;
    }
  | {
      readonly kind: "narrative";
      readonly text: string;
      readonly visibility?: "public" | "controller" | "gm";
    }
  | {
      readonly kind: "custom";
      readonly rule: DefinitionId;
      readonly payload: JsonValue;
    };

export interface OutcomeDefinition {
  readonly id: string;
  readonly when?: Predicate;
  readonly effects: readonly RuleEffect[];
}

export interface ActionComponents {
  readonly activation: ActivationType;
  readonly costs?: readonly ActionCost[];
  readonly prerequisites?: readonly Predicate[];
  readonly targets?: readonly TargetDefinition[];
  readonly choices?: readonly ChoiceDefinition[];
  readonly test?: D20TestDefinition;
  readonly outcomes: readonly OutcomeDefinition[];
  readonly limit?: UsageLimit;
  readonly sustainedOperation?: boolean;
  readonly duration?: Duration;
}

export type ActionDefinition<Extensions extends ExtensionData = ExtensionData> =
  Definition<"action", ActionComponents, Extensions>;

export interface TraitComponents {
  readonly prerequisites?: readonly Predicate[];
  readonly modifiers?: readonly RuleModifier[];
  readonly actions?: readonly ActionDefinition[];
  readonly triggers?: readonly TriggerDefinition[];
  readonly grants?: readonly DefinitionId[];
  readonly choices?: readonly ChoiceDefinition[];
}

export type TraitDefinition<Extensions extends ExtensionData = ExtensionData> =
  Definition<"trait", TraitComponents, Extensions>;

export interface ConditionComponents {
  readonly condition: ConditionType;
  readonly modifiers?: readonly RuleModifier[];
  readonly actions?: readonly ActionDefinition[];
  readonly triggers?: readonly TriggerDefinition[];
  readonly stacking?: "none" | "levels" | "instances";
  readonly maximumLevel?: number;
}

export type ConditionDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"condition", ConditionComponents, Extensions>;

export interface ActiveEffect {
  readonly id: EffectInstanceId;
  readonly sourceId?: EntityId | DefinitionId;
  readonly definitionId?: DefinitionId;
  readonly name: string;
  readonly appliedAt: string;
  readonly duration?: Duration;
  readonly remaining?: number;
  readonly sustainingEntityId?: EntityId;
  readonly conditions?: readonly ConditionType[];
  readonly modifiers?: readonly RuleModifier[];
  readonly triggers?: readonly TriggerDefinition[];
  readonly extensions?: ExtensionData;
}

export interface RuleExecutionState {
  readonly executionId: string;
  readonly actionId: DefinitionId;
  readonly actorId: EntityId;
  readonly targetIds: readonly EntityId[];
  readonly phase:
    "declared" | "awaiting-choice" | "resolving" | "completed" | "cancelled";
  readonly paidCosts: readonly ActionCost[];
  readonly bindings: Readonly<Record<string, JsonValue>>;
  readonly pendingChoiceIds: readonly string[];
}
