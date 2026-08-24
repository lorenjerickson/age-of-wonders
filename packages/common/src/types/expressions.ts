import type { DiceExpression, NumericExpression } from "./dice";
import type {
  Attribute,
  ConditionType,
  DamageType,
  DefinitionId,
  Distance,
  EntityReference,
  JsonValue,
} from "./primitives";

export type ScalarExpression =
  | NumericExpression
  | { readonly kind: "literal"; readonly value: JsonValue }
  | { readonly kind: "dice"; readonly expression: DiceExpression }
  | {
      readonly kind: "attribute-score";
      readonly attribute: Attribute;
      readonly actor?: string;
    }
  | {
      readonly kind: "skill-bonus";
      readonly skillDefinitionId: DefinitionId;
      readonly actor?: string;
    }
  | { readonly kind: "collection-count"; readonly path: string }
  | {
      readonly kind: "lookup";
      readonly table: DefinitionId;
      readonly key: ScalarExpression;
    }
  | { readonly kind: "choice-value"; readonly choiceId: string }
  | { readonly kind: "event-value"; readonly path: string };

export type Predicate =
  | { readonly kind: "always" }
  | { readonly kind: "never" }
  | { readonly kind: "all" | "any"; readonly predicates: readonly Predicate[] }
  | { readonly kind: "not"; readonly predicate: Predicate }
  | {
      readonly kind: "compare";
      readonly left: ScalarExpression;
      readonly operator:
        "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "includes" | "matches";
      readonly right: ScalarExpression;
    }
  | {
      readonly kind: "has-condition";
      readonly subject: string;
      readonly condition: ConditionType;
    }
  | { readonly kind: "has-tag"; readonly subject: string; readonly tag: string }
  | {
      readonly kind: "has-definition";
      readonly subject: string;
      readonly definitionId: DefinitionId;
    }
  | {
      readonly kind: "is-proficient";
      readonly subject: string;
      readonly proficiency: string;
    }
  | {
      readonly kind: "is-attuned";
      readonly subject: string;
      readonly item?: string;
    }
  | { readonly kind: "is-sustaining-operation"; readonly subject: string }
  | {
      readonly kind: "damage-type";
      readonly damage: string;
      readonly damageType: DamageType;
    }
  | {
      readonly kind: "within-distance";
      readonly source: string;
      readonly target: string;
      readonly distance: Distance;
    }
  | {
      readonly kind: "visible";
      readonly observer: string;
      readonly target: string;
    }
  | {
      readonly kind: "has-cover";
      readonly observer: string;
      readonly target: string;
      readonly cover: string;
    }
  | {
      readonly kind: "relation";
      readonly source: string;
      readonly target: string;
      readonly relation: string;
    }
  | {
      readonly kind: "custom";
      readonly rule: DefinitionId;
      readonly payload?: JsonValue;
    };

export interface EvaluationBinding {
  readonly name: string;
  readonly value: JsonValue | EntityReference;
}
