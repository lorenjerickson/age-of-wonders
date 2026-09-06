import type { Attribute, DefinitionId } from "./primitives";

export type StandardDie = 2 | 4 | 6 | 8 | 10 | 12 | 20 | 100;
export type DieSize = StandardDie | number;

export type NumericExpression =
  | { readonly kind: "constant"; readonly value: number }
  | { readonly kind: "path"; readonly path: string; readonly fallback?: number }
  | {
      readonly kind: "attribute-modifier";
      readonly attribute: Attribute;
      readonly actor?: string;
    }
  | {
      readonly kind: "proficiency-bonus";
      readonly actor?: string;
      readonly multiplier?: number;
    }
  | {
      readonly kind: "level";
      readonly professionId?: DefinitionId;
      readonly actor?: string;
    }
  | {
      readonly kind: "resource";
      readonly resource: string;
      readonly actor?: string;
    }
  | {
      readonly kind: "arithmetic";
      readonly operator:
        | "add"
        | "subtract"
        | "multiply"
        | "divide"
        | "floor"
        | "ceil"
        | "min"
        | "max";
      readonly operands: readonly NumericExpression[];
    }
  | {
      readonly kind: "conditional";
      readonly predicate: string;
      readonly whenTrue: NumericExpression;
      readonly whenFalse: NumericExpression;
    };

export interface DiceTerm {
  readonly kind: "dice";
  readonly count: number | NumericExpression;
  readonly size: DieSize;
  readonly sign?: 1 | -1;
  readonly modifiers?: readonly DiceModifier[];
  readonly label?: string;
}

export type DiceModifier =
  | {
      readonly kind:
        "keep-highest" | "keep-lowest" | "drop-highest" | "drop-lowest";
      readonly count: number;
    }
  | {
      readonly kind: "reroll";
      readonly values: readonly number[];
      readonly once?: boolean;
    }
  | {
      readonly kind: "explode";
      readonly threshold?: number;
      readonly maximumExtraDice?: number;
    }
  | { readonly kind: "minimum" | "maximum"; readonly value: number };

export type RollTerm = DiceTerm | NumericExpression;

export interface DiceExpression {
  readonly terms: readonly RollTerm[];
  readonly label?: string;
}

export type RollMode =
  | "normal"
  | "advantage"
  | "disadvantage"
  | "super-advantage"
  | "super-disadvantage";

export interface D20TestDefinition {
  readonly kind:
    "attribute-check" | "saving-throw" | "attack-roll" | "death-saving-throw";
  readonly attribute?: Attribute;
  readonly skillDefinitionId?: DefinitionId;
  readonly proficiency?: string;
  readonly difficultyClass?: NumericExpression;
  readonly opposedBy?: D20TestDefinition;
  readonly rollMode?: RollMode;
  readonly criticalSuccessRange?: readonly [minimum: number, maximum: number];
  readonly criticalFailureRange?: readonly [minimum: number, maximum: number];
  readonly ties?: "initiator-wins" | "defender-wins" | "reroll" | "no-change";
}

export interface DieResult {
  readonly size: DieSize;
  readonly values: readonly number[];
  readonly kept: readonly boolean[];
  readonly subtotal: number;
}

export interface RollResult {
  readonly id: string;
  readonly expression: DiceExpression;
  readonly dice: readonly DieResult[];
  readonly total: number;
  readonly natural?: number;
  readonly mode?: RollMode;
  readonly outcome?:
    "critical-success" | "success" | "failure" | "critical-failure";
  readonly entropyToken: string;
}
