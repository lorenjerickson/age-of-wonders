import {
  previewMovementRules,
  validateMovementRule,
  type MovementRule,
  type MovementRuleCondition,
  type MovementRuleValue,
} from "@aow/common";

const context = {
  baseMovementCost: 10,
  availableMovement: 30,
  difficultTerrainSegments: 2,
};
const constant = (value: number): MovementRuleValue => ({
  kind: "constant",
  value,
});
const terrain: MovementRule = {
  id: "terrain",
  name: "Difficult terrain costs extra movement",
  state: "enabled",
  trigger: "aow:movement.declared:v1",
  condition: {
    kind: "compare",
    left: { kind: "path", path: "difficultTerrainSegments" },
    operator: "gt",
    right: constant(0),
  },
  modifiers: [
    {
      target: "movementCost",
      operation: "add",
      value: {
        kind: "arithmetic",
        operator: "multiply",
        operands: [
          constant(5),
          { kind: "path", path: "difficultTerrainSegments" },
        ],
      },
    },
  ],
};
function rule(
  id: string,
  operation:
    "add" | "subtract" | "multiply" | "divide" | "set" | "minimum" | "maximum",
  amount: number,
): MovementRule {
  return {
    ...terrain,
    id,
    name: id,
    condition: undefined,
    modifiers: [{ target: "movementCost", operation, value: constant(amount) }],
  };
}
function freeze(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
}

describe("movement rule preview", () => {
  it("explains the proof case without mutating inputs", () => {
    freeze(terrain);
    freeze(context);
    const result = previewMovementRules([terrain], context);
    expect(result.status).toBe("adjusted");
    expect(result.baseline.movementCost).toBe(10);
    expect(result.outcome).toEqual({
      movementCost: 20,
      allowed: true,
      reasons: [],
    });
    expect(result.considered[0].explanations).toContain(
      "Difficult terrain segments (2) is greater than 0: matched.",
    );
    expect(previewMovementRules([terrain], context)).toEqual(result);
  });
  it("retains disabled and nonmatching rule traces", () => {
    const result = previewMovementRules(
      [terrain, { ...terrain, id: "disabled", state: "disabled" }],
      { ...context, difficultTerrainSegments: 0 },
    );
    expect(result.status).toBe("unchanged");
    expect(result.considered.map((r) => r.matched)).toEqual([false, false]);
  });
  it("blocks unaffordable baseline and adjusted movement even with allow", () => {
    const allow: MovementRule = {
      ...terrain,
      id: "allow",
      modifiers: [{ target: "movement", operation: "allow" }],
    };
    expect(
      previewMovementRules([terrain, allow], {
        ...context,
        availableMovement: 15,
      }).outcome?.allowed,
    ).toBe(false);
    expect(
      previewMovementRules([], { ...context, availableMovement: 5 }).status,
    ).toBe("blocked");
  });
  it("composes additions and subtractions from the shared baseline regardless of input order", () => {
    const rules = [
      terrain,
      rule("discount", "subtract", 3),
      rule("extra", "add", 2),
    ];
    expect(previewMovementRules(rules, context).outcome?.movementCost).toBe(19);
    expect(previewMovementRules([...rules].reverse(), context).outcome).toEqual(
      previewMovementRules(rules, context).outcome,
    );
  });
  it("provides isolated candidates and no implicit combined outcome on conflict", () => {
    const result = previewMovementRules(
      [terrain, rule("double", "multiply", 2), rule("extra", "add", 1)],
      context,
    );
    expect(result.status).toBe("conflicted");
    expect(result.outcome).toBeUndefined();
    expect(result.candidates.map((c) => c.outcome.movementCost)).toEqual([
      20, 20, 11,
    ]);
  });
  it("rejects divide-by-zero and negative isolated results without a partial outcome", () => {
    for (const invalid of [
      rule("zero", "divide", 0),
      rule("negative", "subtract", 20),
      rule("overflow", "multiply", Number.MAX_VALUE),
    ]) {
      const result = previewMovementRules([invalid, terrain], context);
      expect(result.status).toBe("conflicted");
      expect(result.outcome).toBeUndefined();
      expect(result.candidates[0].valid).toBe(false);
    }
  });
  it("does not rescue an invalid modifier with another modifier in the same rule", () => {
    const result = previewMovementRules(
      [
        {
          ...terrain,
          modifiers: [
            {
              target: "movementCost",
              operation: "subtract",
              value: constant(20),
            },
            { target: "movementCost", operation: "add", value: constant(30) },
          ],
        },
      ],
      context,
    );
    expect(result.status).toBe("conflicted");
    expect(result.candidates[0].valid).toBe(false);
  });
  it("makes allow/prohibit conflict explicit and retains the reason", () => {
    const result = previewMovementRules(
      [
        {
          ...terrain,
          id: "allow",
          modifiers: [{ target: "movement", operation: "allow" }],
        },
        {
          ...terrain,
          id: "stop",
          modifiers: [
            {
              target: "movement",
              operation: "prohibit",
              reason: "The gate is closed.",
            },
          ],
        },
      ],
      context,
    );
    expect(result.status).toBe("conflicted");
    expect(result.candidates[1].outcome.reasons).toContain(
      "The gate is closed.",
    );
  });
  it.each([
    ["minimum", 15, 15],
    ["maximum", 5, 5],
    ["set", 7, 7],
    ["divide", 2, 5],
  ] as const)("defines %s consistently", (op, n, expected) => {
    expect(
      previewMovementRules([rule("operation", op, n)], context).outcome
        ?.movementCost,
    ).toBe(expected);
  });
  it("evaluates grouped predicates and negation", () => {
    const condition: MovementRuleCondition = {
      kind: "all",
      predicates: [
        { kind: "not", predicate: { kind: "never" } },
        { kind: "any", predicates: [{ kind: "never" }, { kind: "always" }] },
      ],
    };
    expect(
      previewMovementRules([{ ...terrain, condition }], context).considered[0]
        .matched,
    ).toBe(true);
  });
  it("blocks unexpected condition arithmetic failure", () => {
    const condition: MovementRuleCondition = {
      kind: "compare",
      left: {
        kind: "arithmetic",
        operator: "divide",
        operands: [constant(1), constant(0)],
      },
      operator: "gt",
      right: constant(0),
    };
    expect(
      previewMovementRules([{ ...terrain, condition }], context).status,
    ).toBe("blocked");
  });
  it.each([
    null,
    {},
    { ...context, availableMovement: Infinity },
    { ...context, difficultTerrainSegments: 0.5 },
  ])("fails closed for malformed context", (bad) => {
    expect(previewMovementRules([terrain], bad).outcome?.allowed).toBe(false);
  });
});

describe("supported profile validation", () => {
  it("accepts the movement proof rule", () =>
    expect(validateMovementRule(terrain)).toEqual([]));
  it.each([
    { trigger: "move" },
    { priority: 1 },
    { condition: { kind: "custom" } },
    { condition: { kind: "all", predicates: [] } },
    {
      modifiers: [
        { target: "actor.health", operation: "set", value: constant(10) },
      ],
    },
    {
      modifiers: [
        {
          target: "movementCost",
          operation: "add",
          value: { kind: "path", path: "__proto__" },
        },
      ],
    },
    {
      modifiers: [
        {
          target: "movementCost",
          operation: "add",
          value: { kind: "path", path: "baseMovementCost", fallback: 0 },
        },
      ],
    },
    {
      modifiers: [
        { target: "movementCost", operation: "add", value: constant(NaN) },
      ],
    },
    { modifiers: [{ target: "movement", operation: "prohibit", reason: "" }] },
  ])("rejects unsupported or malformed vocabulary", (patch) =>
    expect(validateMovementRule({ ...terrain, ...patch })).not.toEqual([]),
  );
  it("bounds tree depth and total expression nodes, including cyclic input", () => {
    let condition: MovementRuleCondition = { kind: "always" };
    for (let i = 0; i < 14; i++)
      condition = { kind: "not", predicate: condition };
    expect(validateMovementRule({ ...terrain, condition })).not.toEqual([]);
    const cyclic: Record<string, unknown> = { kind: "not" };
    cyclic.predicate = cyclic;
    expect(validateMovementRule({ ...terrain, condition: cyclic })).not.toEqual(
      [],
    );
    expect(
      validateMovementRule({
        ...terrain,
        condition: {
          kind: "all",
          predicates: Array(32).fill({
            kind: "all",
            predicates: Array(32).fill({ kind: "always" }),
          }),
        },
      }),
    ).not.toEqual([]);
  });
  it("bounds rules and rejects ambiguous duplicate identities", () => {
    expect(previewMovementRules(Array(65).fill(terrain), context).status).toBe(
      "blocked",
    );
    expect(previewMovementRules([terrain, terrain], context).status).toBe(
      "blocked",
    );
  });
});
