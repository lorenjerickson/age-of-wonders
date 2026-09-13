import type { JsonValue } from "./primitives";

export const WORLD_RULE_RESOURCE = "world-rules" as const;
/** Versioned executable subset. It does not imply execution support for all legacy RuleEffect/Predicate members. */
export interface WorldRule {
  readonly formatVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly revision: number;
  readonly lifecycle: "enabled" | "disabled" | "archived";
  /** Lower priorities run first. Same-priority rules read one stage baseline; competing writes fail closed. */
  readonly priority: number;
  readonly trigger: { readonly event: string; readonly version: 1 };
  readonly condition?: WorldRulePredicate;
  readonly effects: readonly WorldRuleEffect[];
  readonly audit: { readonly createdBy: string; readonly updatedAt: string };
}

export type RuleValueType = "number" | "string" | "boolean" | "point" | "json";
export interface RuleStateEntity {
  readonly type: string;
  readonly fields: Readonly<Record<string, JsonValue>>;
}
/** Host assembles only this Instance's runtime and captured data. No host object, credentials, or I/O is available. */
export interface RuleStateView {
  readonly runtime: Readonly<Record<string, RuleStateEntity>>;
  readonly captured: Readonly<Record<string, RuleStateEntity>>;
  readonly schema: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          { readonly type: RuleValueType; readonly writable: boolean }
        >
      >
    >
  >;
}
export type WorldRuleExpression =
  | { readonly kind: "literal"; readonly value: JsonValue }
  | { readonly kind: "constant"; readonly value: number }
  | { readonly kind: "context"; readonly key: string }
  | { readonly kind: "local"; readonly key: string }
  | {
      readonly kind: "state";
      readonly scope: "runtime" | "captured";
      readonly entity: WorldRuleExpression;
      readonly field: string;
    }
  | {
      readonly kind: "arithmetic";
      readonly operator:
        "add" | "subtract" | "multiply" | "divide" | "min" | "max";
      readonly operands: readonly WorldRuleExpression[];
    }
  | {
      readonly kind: "query-count";
      readonly scope: "runtime" | "captured";
      readonly entityType: string;
      readonly field: string;
      readonly equals: WorldRuleExpression;
    };
export type WorldRulePredicate =
  | { readonly kind: "always" | "never" }
  | {
      readonly kind: "all" | "any";
      readonly predicates: readonly WorldRulePredicate[];
    }
  | { readonly kind: "not"; readonly predicate: WorldRulePredicate }
  | {
      readonly kind: "compare";
      readonly left: WorldRuleExpression;
      readonly operator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
      readonly right: WorldRuleExpression;
    };
export interface WorldRuleTarget {
  readonly entity: WorldRuleExpression;
  readonly field: string;
}
export type WorldRuleEffect =
  | {
      readonly kind: "set";
      readonly target: WorldRuleTarget;
      readonly value: WorldRuleExpression;
    }
  | {
      readonly kind: "increment";
      readonly target: WorldRuleTarget;
      readonly value: WorldRuleExpression;
    }
  | {
      readonly kind: "move";
      readonly target: WorldRuleTarget;
      readonly value: WorldRuleExpression;
    }
  | {
      readonly kind: "set-local";
      readonly key: string;
      readonly value: WorldRuleExpression;
    }
  | {
      readonly kind: "emit";
      readonly event: string;
      readonly context: Readonly<Record<string, WorldRuleExpression>>;
    }
  | {
      readonly kind: "roll";
      readonly count: number;
      readonly sides: number;
      readonly resultEvent: string;
      readonly context: Readonly<Record<string, WorldRuleExpression>>;
    };

export interface WorldRuleEvent {
  readonly formatVersion: 1;
  readonly id: string;
  readonly rootEventId: string;
  readonly parentEventId?: string;
  readonly idempotencyKey: string;
  readonly type: string;
  readonly version: 1;
  readonly source: "gm" | "player" | "rule" | "state-change" | "dice";
  readonly context: Readonly<Record<string, JsonValue>>;
  readonly causedBy?: {
    readonly ruleId: string;
    readonly ruleRevision: number;
    readonly effectIndex: number;
  };
}
export interface RecordedRuleRoll {
  readonly requestId: string;
  readonly count: number;
  readonly sides: number;
  readonly values: readonly number[];
}
export interface RuleRollRequest {
  readonly requestId: string;
  readonly count: number;
  readonly sides: number;
}
export interface WorldRuleWrite {
  readonly entityId: string;
  readonly field: string;
  readonly before: JsonValue;
  readonly after: JsonValue;
  readonly eventId: string;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly ruleRevision: number;
  readonly effectIndex: number;
}
export interface WorldRuleTrace {
  readonly eventId: string;
  readonly ruleName?: string;
  readonly effectIndex?: number;
  readonly kind: "event" | "condition" | "effect";
  readonly detail: string;
}
export interface WorldRuleExecution {
  readonly status: "applied" | "no-op" | "failed" | "needs-entropy";
  readonly state: RuleStateView;
  readonly events: readonly WorldRuleEvent[];
  readonly writes: readonly WorldRuleWrite[];
  readonly trace: readonly WorldRuleTrace[];
  readonly rolls: readonly RecordedRuleRoll[];
  readonly requests: readonly RuleRollRequest[];
  readonly diagnostics: readonly string[];
}
export interface WorldRuleExecutionLimits {
  readonly events?: number;
  readonly effects?: number;
  readonly operations?: number;
  readonly depth?: number;
  readonly trace?: number;
}
