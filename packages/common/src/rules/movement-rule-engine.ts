import type {
  MovementProposalModifier,
  MovementRule,
  MovementRuleCondition,
  MovementRuleContext,
  MovementRuleOutcome,
  MovementRulePreview,
  MovementRuleValue,
} from "../types/movement-rules";

export const MOVEMENT_RULE_LIMITS = Object.freeze({
  rules: 64,
  modifiers: 16,
  nodes: 256,
  depth: 12,
  text: 500,
});
const facts = [
  "baseMovementCost",
  "availableMovement",
  "difficultTerrainSegments",
];
const labels: Record<string, string> = {
  baseMovementCost: "Base movement cost",
  availableMovement: "Available movement",
  difficultTerrainSegments: "Difficult terrain segments",
};
const numericOperations = [
  "add",
  "subtract",
  "multiply",
  "divide",
  "minimum",
  "maximum",
  "set",
];
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= MOVEMENT_RULE_LIMITS.text;
const fail = (message: string): never => {
  throw new Error(message);
};
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((key) => !allowed.includes(key)))
    fail("This rule contains unsupported fields.");
}

/** Validate unknown input before interpreting it, including unsupported extra executable fields. */
export function validateMovementRule(input: unknown): readonly string[] {
  let nodes = 0;
  function visit(value: unknown, depth: number, predicate: boolean): void {
    if (
      ++nodes > MOVEMENT_RULE_LIMITS.nodes ||
      depth > MOVEMENT_RULE_LIMITS.depth
    )
      fail("The rule is too complex. Use fewer or shallower expressions.");
    if (!object(value)) fail("Choose a supported expression.");
    const v = value as Record<string, unknown>;
    const child = (x: unknown, p = false) => visit(x, depth + 1, p);
    if (predicate) {
      switch (v.kind) {
        case "always":
        case "never":
          keys(v, ["kind"]);
          return;
        case "not":
          keys(v, ["kind", "predicate"]);
          child(v.predicate, true);
          return;
        case "all":
        case "any":
          keys(v, ["kind", "predicates"]);
          if (
            !Array.isArray(v.predicates) ||
            !v.predicates.length ||
            v.predicates.length > 32
          )
            fail("Condition groups need between one and 32 conditions.");
          for (const p of v.predicates as unknown[]) child(p, true);
          return;
        case "compare":
          keys(v, ["kind", "left", "operator", "right"]);
          if (
            !["eq", "ne", "lt", "lte", "gt", "gte"].includes(String(v.operator))
          )
            fail("Choose a supported comparison.");
          child(v.left);
          child(v.right);
          return;
        default:
          fail("This condition is outside the movement rule profile.");
      }
    }
    switch (v.kind) {
      case "constant":
        keys(v, ["kind", "value"]);
        if (!finite(v.value)) fail("Use a finite numeric value.");
        return;
      case "path":
        keys(v, ["kind", "path"]);
        if (!facts.includes(String(v.path)))
          fail("Choose a supported movement fact.");
        return;
      case "arithmetic":
        keys(v, ["kind", "operator", "operands"]);
        if (
          !["add", "subtract", "multiply", "divide", "min", "max"].includes(
            String(v.operator),
          )
        )
          fail("Choose a supported arithmetic operation.");
        if (!Array.isArray(v.operands) || v.operands.length !== 2)
          fail("Arithmetic needs exactly two operands.");
        for (const operand of v.operands as unknown[]) child(operand);
        return;
      default:
        fail("This expression is outside the movement rule profile.");
    }
  }
  try {
    if (!object(input)) fail("A movement rule is required.");
    const rule = input as Record<string, unknown>;
    keys(rule, [
      "id",
      "name",
      "description",
      "state",
      "trigger",
      "condition",
      "modifiers",
    ]);
    if (
      !text(rule.id) ||
      !text(rule.name) ||
      (rule.description !== undefined &&
        (typeof rule.description !== "string" ||
          rule.description.length > MOVEMENT_RULE_LIMITS.text))
    )
      fail("Give the rule a name and keep its text within 500 characters.");
    if (!["enabled", "disabled", "archived"].includes(String(rule.state)))
      fail("Choose a supported rule lifecycle state.");
    if (rule.trigger !== "aow:movement.declared:v1")
      fail("Only movement declarations are supported.");
    if (rule.condition !== undefined) visit(rule.condition, 0, true);
    if (
      !Array.isArray(rule.modifiers) ||
      !rule.modifiers.length ||
      rule.modifiers.length > MOVEMENT_RULE_LIMITS.modifiers
    )
      fail("A rule needs between one and 16 modifiers.");
    for (const entry of rule.modifiers as unknown[]) {
      if (!object(entry)) fail("Choose a supported proposal modifier.");
      const m = entry as Record<string, unknown>;
      if (
        m.target === "movementCost" &&
        numericOperations.includes(String(m.operation))
      ) {
        keys(m, ["target", "operation", "value"]);
        visit(m.value, 0, false);
      } else if (
        m.target === "movement" &&
        (m.operation === "allow" || m.operation === "prohibit")
      ) {
        keys(
          m,
          m.operation === "allow"
            ? ["target", "operation"]
            : ["target", "operation", "reason"],
        );
        if (m.operation === "prohibit" && !text(m.reason))
          fail("Explain why movement is prohibited.");
      } else fail("Choose a supported proposal field and operation.");
    }
    return [];
  } catch (error) {
    return [
      error instanceof Error ? error.message : "The movement rule is invalid.",
    ];
  }
}

function calculate(operation: string, a: number, b: number): number {
  let result: number;
  switch (operation) {
    case "add":
      result = a + b;
      break;
    case "subtract":
      result = a - b;
      break;
    case "multiply":
      result = a * b;
      break;
    case "divide":
      if (b === 0) fail("Movement arithmetic cannot divide by zero.");
      result = a / b;
      break;
    case "min":
    case "maximum":
      result = Math.min(a, b);
      break;
    case "max":
    case "minimum":
      result = Math.max(a, b);
      break;
    case "set":
      result = b;
      break;
    default:
      return fail("Unsupported arithmetic operation.");
  }
  if (!Number.isFinite(result))
    fail("Movement arithmetic must produce a finite value.");
  return result;
}
function value(v: MovementRuleValue, context: MovementRuleContext): number {
  if (v.kind === "constant") return v.value;
  if (v.kind === "path") return context[v.path];
  return calculate(
    v.operator,
    value(v.operands[0], context),
    value(v.operands[1], context),
  );
}
function condition(
  p: MovementRuleCondition,
  context: MovementRuleContext,
  explanations: string[],
): boolean {
  if (p.kind === "always" || p.kind === "never") {
    explanations.push(
      p.kind === "always" ? "Always applies." : "Never applies.",
    );
    return p.kind === "always";
  }
  if (p.kind === "not") {
    const result = !condition(p.predicate, context, explanations);
    explanations.push(
      `Negated condition: ${result ? "matched" : "did not match"}.`,
    );
    return result;
  }
  if (p.kind === "all" || p.kind === "any") {
    const results = p.predicates.map((child) =>
      condition(child, context, explanations),
    );
    const result =
      p.kind === "all" ? results.every(Boolean) : results.some(Boolean);
    explanations.push(
      `${p.kind === "all" ? "All" : "Any"} conditions: ${result ? "matched" : "did not match"}.`,
    );
    return result;
  }
  if (p.kind !== "compare") return false;
  const a = value(p.left, context),
    b = value(p.right, context);
  const result = {
    eq: a === b,
    ne: a !== b,
    lt: a < b,
    lte: a <= b,
    gt: a > b,
    gte: a >= b,
  }[p.operator];
  const operators = {
    eq: "equals",
    ne: "does not equal",
    lt: "is less than",
    lte: "is at most",
    gt: "is greater than",
    gte: "is at least",
  };
  explanations.push(
    `${p.left.kind === "path" ? labels[p.left.path] + " (" + a + ")" : a} ${operators[p.operator]} ${b}: ${result ? "matched" : "did not match"}.`,
  );
  return result;
}
function outcome(
  cost: number,
  context: MovementRuleContext,
  reasons: string[] = [],
): MovementRuleOutcome {
  if (!Number.isFinite(cost) || cost < 0)
    fail("Movement cost must be finite and nonnegative.");
  if (cost > context.availableMovement)
    reasons.push("The movement cost exceeds available movement.");
  return {
    movementCost: cost,
    allowed: reasons.length === 0,
    reasons: [...new Set(reasons)].sort(),
  };
}
function compose(
  modifiers: readonly MovementProposalModifier[],
  context: MovementRuleContext,
): MovementRuleOutcome {
  const numeric = modifiers.filter((m) => m.target === "movementCost");
  if (
    numeric.length > 1 &&
    numeric.some((m) => m.operation !== "add" && m.operation !== "subtract")
  )
    fail("Multiple modifiers write movement cost incompatibly.");
  if (
    modifiers.some((m) => m.operation === "allow") &&
    modifiers.some((m) => m.operation === "prohibit")
  )
    fail("Rules both allow and prohibit movement.");
  // Validate every write against the baseline before combining compatible deltas.
  for (const modifier of numeric) {
    outcome(
      calculate(
        modifier.operation,
        context.baseMovementCost,
        value(modifier.value, context),
      ),
      context,
    );
  }
  let cost = context.baseMovementCost;
  if (numeric.length > 1) {
    // Canonical numeric ordering avoids dependence on rule order or internal identity.
    const deltas = numeric
      .map(
        (m) => value(m.value, context) * (m.operation === "subtract" ? -1 : 1),
      )
      .sort((a, b) => a - b);
    cost += deltas.reduce((sum, delta) => calculate("add", sum, delta), 0);
  } else if (numeric.length)
    cost = calculate(
      numeric[0].operation,
      cost,
      value(numeric[0].value, context),
    );
  return outcome(
    cost,
    context,
    modifiers.flatMap((m) => (m.operation === "prohibit" ? [m.reason] : [])),
  );
}

/** Pure preview only. The host must separately authorize, capture provenance, persist and approve. */
export function previewMovementRules(
  input: unknown,
  suppliedContext: unknown,
): MovementRulePreview {
  let baseline: MovementRuleOutcome = {
    movementCost: 0,
    allowed: false,
    reasons: ["Movement context is invalid."],
  };
  const considered: MovementRulePreview["considered"][number][] = [];
  try {
    if (
      !object(suppliedContext) ||
      !facts.every(
        (key) =>
          finite(suppliedContext[key]) && Number(suppliedContext[key]) >= 0,
      ) ||
      !Number.isSafeInteger(suppliedContext.difficultTerrainSegments)
    )
      fail(
        "Supply nonnegative movement distances and a whole terrain segment count.",
      );
    const context = suppliedContext as unknown as MovementRuleContext;
    baseline = outcome(context.baseMovementCost, context);
    if (!Array.isArray(input) || input.length > MOVEMENT_RULE_LIMITS.rules)
      fail("Preview supports at most 64 rules.");
    const identities = new Set<string>();
    for (const rule of input as MovementRule[]) {
      const issues = validateMovementRule(rule);
      if (issues.length) fail(issues[0]);
      if (identities.has(rule.id))
        fail("Each rule must have a distinct identity.");
      identities.add(rule.id);
    }
    const matched: MovementRule[] = [];
    for (const rule of input as MovementRule[]) {
      const explanations: string[] = [];
      const applies =
        rule.state === "enabled" &&
        (!rule.condition || condition(rule.condition, context, explanations));
      if (rule.state !== "enabled")
        explanations.push("This rule is not enabled.");
      else if (!rule.condition)
        explanations.push(
          "No conditions; this rule applies to every movement declaration.",
        );
      considered.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched: applies,
        explanations,
      });
      if (applies) matched.push(rule);
    }
    try {
      // An invalid isolated rule must not be rescued by another rule's numeric adjustment.
      for (const rule of matched) compose(rule.modifiers, context);
      const result = compose(
        matched.flatMap((rule) => rule.modifiers),
        context,
      );
      return {
        status: !result.allowed
          ? "blocked"
          : result.movementCost === baseline.movementCost &&
              result.allowed === baseline.allowed
            ? "unchanged"
            : "adjusted",
        baseline,
        outcome: result,
        considered,
        candidates: [],
        diagnostics: [],
      };
    } catch (error) {
      const candidates = matched.map((rule) => {
        try {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            valid: true,
            outcome: compose(rule.modifiers, context),
          };
        } catch {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            valid: false,
            outcome: {
              ...baseline,
              allowed: false,
              reasons: ["This rule cannot produce a valid isolated outcome."],
            },
          };
        }
      });
      return {
        status: "conflicted",
        baseline,
        considered,
        candidates,
        diagnostics: [
          error instanceof Error
            ? error.message
            : "Movement modifiers conflict.",
        ],
      };
    }
  } catch (error) {
    const diagnostic =
      error instanceof Error ? error.message : "Movement evaluation failed.";
    return {
      status: "blocked",
      baseline,
      outcome: { ...baseline, allowed: false, reasons: [diagnostic] },
      considered,
      candidates: [],
      diagnostics: [diagnostic],
    };
  }
}
