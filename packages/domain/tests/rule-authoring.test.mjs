import assert from "node:assert/strict";
import test from "node:test";
import { ActionDefinition, TraitDefinition } from "../dist/index.js";
const constant = { kind: "constant", value: -0.5 };
const duration = { kind: "measured", amount: -0.5, unit: "round" };
const distance = { value: -0.5, unit: "meter" };
const numeric = [
  constant,
  { kind: "path", path: "", fallback: -1 },
  { kind: "attribute-modifier", attribute: "world:might", actor: "" },
  { kind: "proficiency-bonus", multiplier: -0.5 },
  { kind: "level", professionId: "craft", actor: "" },
  { kind: "resource", resource: "" },
  { kind: "arithmetic", operator: "divide", operands: [constant] },
  {
    kind: "conditional",
    predicate: "",
    whenTrue: constant,
    whenFalse: constant,
  },
];
const dice = {
  terms: [
    ...numeric,
    {
      kind: "dice",
      count: numeric[7],
      size: 7,
      sign: -1,
      modifiers: [
        ...["keep-highest", "keep-lowest", "drop-highest", "drop-lowest"].map(
          (kind) => ({ kind, count: -0.5 }),
        ),
        { kind: "reroll", values: [1, 1, -0.5], once: false },
        { kind: "explode", threshold: -0.5, maximumExtraDice: 1.5 },
        { kind: "minimum", value: -3 },
        { kind: "maximum", value: 0 },
        { kind: "future", retained: true },
      ],
    },
  ],
};
const scalars = [
  ...numeric,
  { kind: "literal", value: { nested: [null, false] } },
  { kind: "dice", expression: dice },
  { kind: "attribute-score", attribute: "world:might" },
  { kind: "skill-bonus", skillDefinitionId: "craft" },
  { kind: "collection-count", path: "" },
  { kind: "lookup", table: "table", key: constant },
  { kind: "choice-value", choiceId: "pick" },
  { kind: "event-value", path: "" },
];
const d20 = {
  kind: "saving-throw",
  attribute: "world:might",
  difficultyClass: numeric[7],
  opposedBy: { kind: "attack-roll" },
  criticalSuccessRange: [20, -1],
  criticalFailureRange: [0.5, 0.5],
  ties: "reroll",
  rollMode: "super-disadvantage",
};
const choice = {
  id: "pick",
  prompt: "",
  minimum: -1,
  maximum: 0.5,
  optionCatalog: "catalog",
  allowDuplicates: false,
  visibility: "gm",
  options: [
    {
      id: "a",
      label: "",
      value: { a: [null, false] },
      prerequisites: [{ kind: "always" }],
    },
  ],
};
const effects = [
  { kind: "damage", target: "", amount: dice, damageType: "homebrew" },
  { kind: "heal", target: "", amount: dice, upToMaximum: false },
  {
    kind: "temporary-hit-points",
    target: "",
    amount: scalars[9],
    replaceOnly: false,
  },
  {
    kind: "change-resource",
    target: "",
    resource: "",
    delta: constant,
    allowOverflow: false,
  },
  { kind: "set-value", target: "", path: "", value: scalars[8] },
  {
    kind: "apply-condition",
    target: "",
    condition: "",
    duration,
    saveEnds: d20,
  },
  { kind: "remove-condition", target: "", condition: "" },
  {
    kind: "apply-modifier",
    target: "",
    modifier: {
      id: "m",
      target: "",
      operation: "allow",
      value: constant,
      predicate: { kind: "always" },
      priority: -1,
      stacking: "highest",
      sourceLabel: "",
    },
    duration,
  },
  { kind: "remove-effect", effectId: "e" },
  { kind: "move", target: "", distance, direction: "", forced: false },
  { kind: "transit", target: "", destination: "", maximumDistance: distance },
  { kind: "grant-action", target: "", actionId: "a", duration },
  {
    kind: "award-profession-points",
    target: "",
    professionId: "p",
    amount: constant,
    actionId: "a",
  },
  { kind: "make-test", actor: "", test: d20, bindResultAs: "" },
  {
    kind: "repeat-save",
    target: "",
    test: d20,
    onSuccess: [{ kind: "destroy-entity", target: "" }],
  },
  { kind: "choose", chooser: "", choice, bindAs: "" },
  {
    kind: "branch",
    predicate: { kind: "always" },
    whenTrue: [],
    whenFalse: [{ kind: "narrative", text: "" }],
  },
  { kind: "for-each", collection: scalars[8], bindAs: "", effects: [] },
  {
    kind: "deploy",
    definitionId: "d",
    controller: "",
    count: numeric[6],
    duration,
  },
  { kind: "create-object", definitionId: "d", position: "", duration },
  { kind: "destroy-entity", target: "" },
  { kind: "emit-event", event: "world:event", payload: { a: [null] } },
  { kind: "narrative", text: "", visibility: "public" },
  { kind: "custom", private: true },
  { kind: "future", private: [1] },
];
function action(components = {}) {
  return {
    kind: "action",
    identity: { name: "Rule" },
    components: { activation: "action", outcomes: [], ...components },
    extensions: { "test:private": true },
  };
}
test("built-in rule grammar round-trips all effects, expressions, dice, tests, duration and target fields without evaluating them", () => {
  const input = action({
    test: d20,
    duration,
    choices: [choice],
    outcomes: [{ id: "outcome", effects }],
    prerequisites: scalars.map((left) => ({
      kind: "compare",
      left,
      operator: "eq",
      right: constant,
    })),
    targets: [
      ...[
        "cone",
        "cube",
        "cylinder",
        "emanation",
        "sphere",
        "line",
        "wall",
      ].map((kind) => ({
        kind: "area",
        area: {
          kind,
          length: distance,
          size: distance,
          radius: distance,
          height: distance,
          width: distance,
          thickness: distance,
        },
        count: numeric[6],
        range: distance,
        filters: [{ kind: "always" }],
        requiresSight: false,
        canTargetSelf: false,
        relationship: "any",
      })),
      { kind: "future", private: true },
    ],
  });
  const entity = ActionDefinition.deserializePayload(input);
  assert.deepEqual(entity.state.metadata.validity.issues, []);
  assert.deepEqual(entity.serializePayload(), input);
  entity.dispose();
  const traitInput = {
    kind: "trait",
    components: { triggers: [{ event: "hit", effects }] },
  };
  const trait = TraitDefinition.deserializePayload(traitInput);
  assert.deepEqual(trait.state.metadata.validity.issues, []);
  assert.deepEqual(trait.serializePayload(), traitInput);
  trait.dispose();
});
test("deep effect errors retain exact paths and distinguish omitted from malformed fields across Action and Trait", () => {
  const nested = [
    {
      kind: "branch",
      predicate: { kind: "always" },
      whenTrue: [
        {
          kind: "for-each",
          collection: constant,
          bindAs: "entry",
          effects: [
            {
              kind: "repeat-save",
              target: "",
              test: {
                kind: "saving-throw",
                difficultyClass: {
                  kind: "arithmetic",
                  operator: "add",
                  operands: [
                    {
                      kind: "conditional",
                      predicate: "",
                      whenTrue: { kind: "constant", value: "bad" },
                    },
                  ],
                },
              },
              onSuccess: [
                {
                  kind: "choose",
                  chooser: "",
                  bindAs: "",
                  choice: { ...choice, options: [{ id: "o", label: "" }] },
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  for (const [entity, base] of [
    [
      ActionDefinition.deserializePayload(
        action({ outcomes: [{ id: "o", effects: nested }] }),
      ),
      "components.outcomes[0].effects",
    ],
    [
      TraitDefinition.deserializePayload({
        kind: "trait",
        components: { triggers: [{ event: "hit", effects: nested }] },
      }),
      "components.triggers[0].effects",
    ],
  ]) {
    const issues = entity.state.metadata.validity.issues;
    for (const [suffix, unresolved] of [
      [
        "[0].whenTrue[0].effects[0].test.difficultyClass.operands[0].whenTrue.value",
        false,
      ],
      [
        "[0].whenTrue[0].effects[0].test.difficultyClass.operands[0].whenFalse",
        true,
      ],
      ["[0].whenTrue[0].effects[0].onSuccess[0].choice.options[0].value", true],
    ])
      assert.ok(
        issues.some(
          (issue) =>
            issue.path === base + suffix && !!issue.unresolved === unresolved,
        ),
        base + suffix,
      );
    entity.dispose();
  }
});
test("shared recursive grammar validates every integration path and preserves incomplete drafts", () => {
  const bad = {
    kind: "arithmetic",
    operator: "add",
    operands: [{ kind: "path", fallback: "bad" }],
  };
  const input = action({
    costs: [{ kind: "resource", cost: { resource: "", amount: bad } }],
    limit: { kind: "uses", maximum: bad },
    test: { kind: "attack-roll", difficultyClass: bad },
    duration: { kind: "measured" },
    targets: [
      {
        kind: "area",
        count: bad,
        area: {
          kind: "wall",
          length: distance,
          height: { value: "bad", unit: "meter" },
        },
      },
    ],
  });
  const entity = ActionDefinition.deserializePayload(input);
  for (const base of [
    "components.costs[0].cost.amount",
    "components.limit.maximum",
    "components.test.difficultyClass",
    "components.targets[0].count",
  ]) {
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.path === base + ".operands[0].fallback" && !issue.unresolved,
      ),
    );
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.path === base + ".operands[0].path" && issue.unresolved,
      ),
    );
  }
  assert.ok(
    entity.state.metadata.validity.issues.some(
      (issue) =>
        issue.path === "components.duration.amount" && issue.unresolved,
    ),
  );
  assert.deepEqual(entity.serializePayload(), input);
  entity.dispose();
});
