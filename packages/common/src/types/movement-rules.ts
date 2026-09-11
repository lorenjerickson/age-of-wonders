import type { ModifierOperation } from "./rules";

/** Executable subset of NumericExpression; all distances in this v1 profile are feet. */
export type MovementRuleValue =
  | { readonly kind: "constant"; readonly value: number }
  | { readonly kind: "path"; readonly path: MovementRuleFact }
  | {
      readonly kind: "arithmetic";
      readonly operator:
        "add" | "subtract" | "multiply" | "divide" | "min" | "max";
      readonly operands: readonly MovementRuleValue[];
    };

export type MovementRuleFact =
  "baseMovementCost" | "availableMovement" | "difficultTerrainSegments";

/** Restricted Predicate vocabulary; an omitted condition matches unconditionally. */
export type MovementRuleCondition =
  | { readonly kind: "always" | "never" }
  | {
      readonly kind: "all" | "any";
      readonly predicates: readonly MovementRuleCondition[];
    }
  | { readonly kind: "not"; readonly predicate: MovementRuleCondition }
  | {
      readonly kind: "compare";
      readonly left: MovementRuleValue;
      readonly operator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
      readonly right: MovementRuleValue;
    };

export type MovementProposalModifier =
  | {
      readonly target: "movementCost";
      readonly operation: Extract<
        ModifierOperation,
        | "add"
        | "subtract"
        | "multiply"
        | "divide"
        | "minimum"
        | "maximum"
        | "set"
      >;
      readonly value: MovementRuleValue;
    }
  | { readonly target: "movement"; readonly operation: "allow" }
  | {
      readonly target: "movement";
      readonly operation: "prohibit";
      readonly reason: string;
    };

/** Preview contract, not yet a persisted World Definition or Session proposal. */
export interface MovementRule {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly state: "enabled" | "disabled" | "archived";
  readonly trigger: "aow:movement.declared:v1";
  readonly condition?: MovementRuleCondition;
  readonly modifiers: readonly MovementProposalModifier[];
}

/** Host-calculated inputs. No client path traversal or actor-state access is supported yet. */
export interface MovementRuleContext {
  readonly baseMovementCost: number;
  readonly availableMovement: number;
  readonly difficultTerrainSegments: number;
}
export interface MovementRuleOutcome {
  readonly movementCost: number;
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}
export interface MovementRuleTrace {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly matched: boolean;
  readonly explanations: readonly string[];
}
export interface MovementRuleCandidate {
  readonly ruleId: string;
  readonly ruleName: string;
  /** Invalid candidates cannot be approved. */
  readonly valid: boolean;
  readonly outcome: MovementRuleOutcome;
}
export interface MovementRulePreview {
  readonly status: "unchanged" | "adjusted" | "blocked" | "conflicted";
  readonly baseline: MovementRuleOutcome;
  /** Absent on conflict: callers must explicitly select a valid candidate or the baseline. */
  readonly outcome?: MovementRuleOutcome;
  readonly considered: readonly MovementRuleTrace[];
  readonly candidates: readonly MovementRuleCandidate[];
  readonly diagnostics: readonly string[];
}
