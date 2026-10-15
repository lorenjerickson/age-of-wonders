import assert from "node:assert/strict";
import test from "node:test";
import {
  ProfessionDefinition,
  BackgroundDefinition,
  FeatDefinition,
  HeritageDefinition,
  DisciplineDefinition,
} from "../dist/index.js";
const owners = {
  profession: ProfessionDefinition,
  background: BackgroundDefinition,
  feat: FeatDefinition,
  heritage: HeritageDefinition,
  discipline: DisciplineDefinition,
};
const validate = (kind, components) => {
  const payload = {
    kind,
    components,
    extensions: { "test:private": { retained: true } },
  };
  const entity = owners[kind].deserializePayload(payload);
  try {
    assert.deepEqual(entity.serializePayload(), payload);
    return entity.state.metadata.validity.issues;
  } finally {
    entity.dispose();
  }
};
const samples = [
  [
    "profession",
    {
      expertiseLevels: [
        {
          benefits: {
            resourceMaximums: { focus: { kind: "constant", value: "bad" } },
          },
        },
      ],
    },
    "components.expertiseLevels[0].benefits.resourceMaximums.focus.value",
  ],
  [
    "profession",
    {
      acquisition: [
        {
          kind: "during-play",
          prerequisites: [
            {
              kind: "compare",
              operator: "eq",
              left: { kind: "constant", value: "bad" },
              right: { kind: "constant", value: 1 },
            },
          ],
        },
      ],
    },
    "components.acquisition[0].prerequisites[0].left.value",
  ],
  [
    "profession",
    {
      actions: [
        {
          advancementLimit: {
            kind: "uses",
            maximum: { kind: "constant", value: false },
          },
        },
      ],
    },
    "components.actions[0].advancementLimit.maximum.value",
  ],
  [
    "profession",
    {
      expertiseLevels: [
        {
          advancementWindow: {
            kind: "character-level-interval",
            everyLevels: "bad",
          },
        },
      ],
    },
    "components.expertiseLevels[0].advancementWindow.everyLevels",
  ],
  [
    "profession",
    {
      actions: [
        {
          improvements: [
            {
              modifiers: [
                {
                  id: "m",
                  target: "x",
                  operation: "add",
                  value: { kind: "constant", value: false },
                },
              ],
            },
          ],
        },
      ],
    },
    "components.actions[0].improvements[0].modifiers[0].value.value",
  ],
  [
    "background",
    { characteristics: { ideal: [false] } },
    "components.characteristics.ideal[0]",
  ],
  [
    "background",
    { attributeOptions: ["plain"] },
    "components.attributeOptions[0]",
  ],
  [
    "background",
    { choices: [{ minimum: false }] },
    "components.choices[0].minimum",
  ],
  ["feat", { choices: [{ minimum: false }] }, "components.choices[0].minimum"],
  [
    "feat",
    { prerequisites: [{ kind: "not", predicate: false }] },
    "components.prerequisites[0].predicate",
  ],
  [
    "heritage",
    {
      modifierPairs: [
        {
          id: "p",
          beneficial: [
            { kind: "rule-modifier", modifier: { priority: "bad" } },
          ],
          harmful: [{ kind: "custom", key: "test:cost", payload: 1 }],
        },
      ],
    },
    "components.modifierPairs[0].beneficial[0].modifier.priority",
  ],
  [
    "heritage",
    {
      modifierPairs: [
        {
          id: "p",
          beneficial: [{ kind: "choice", choice: { maximum: false } }],
          harmful: [{ kind: "custom", key: "test:cost", payload: 1 }],
        },
      ],
    },
    "components.modifierPairs[0].beneficial[0].choice.maximum",
  ],
  [
    "discipline",
    {
      activationTime: [
        {
          kind: "resource",
          cost: {
            resource: "focus",
            amount: { kind: "constant", value: false },
          },
        },
      ],
    },
    "components.activationTime[0].cost.amount.value",
  ],
  [
    "discipline",
    {
      targets: [
        { kind: "creature", count: { kind: "constant", value: false } },
      ],
    },
    "components.targets[0].count.value",
  ],
  [
    "discipline",
    { inputs: [{ kind: "device", costInGp: false }] },
    "components.inputs[0].costInGp",
  ],
  [
    "discipline",
    {
      scaling: [
        {
          mode: "custom",
          additionalEffects: [
            {
              effects: [
                {
                  kind: "heal",
                  amount: { terms: [{ kind: "constant", value: false }] },
                },
              ],
            },
          ],
        },
      ],
    },
    "components.scaling[0].additionalEffects[0].effects[0].amount.terms[0].value",
  ],
  [
    "discipline",
    { duration: { kind: "measured", amount: false } },
    "components.duration.amount",
  ],
];
for (const [kind, components, path] of samples)
  test(`${kind}: nested malformed value at ${path}`, () => {
    const issues = validate(kind, components);
    assert.ok(
      issues.some((issue) => issue.path === path && !issue.unresolved),
      JSON.stringify(issues),
    );
  });
for (const kind of Object.keys(owners))
  test(`${kind}: malformed components and open extensions are preserved`, () => {
    assert.ok(
      validate(kind, []).some(
        (issue) => issue.path === "components" && !issue.unresolved,
      ),
    );
    const issues = validate(kind, { "private:field": { deep: [1, true] } });
    assert.equal(issues.filter((issue) => !issue.unresolved).length, 0);
  });
test("known missing nested values remain repairable", () => {
  for (const [kind, components] of [
    [
      "profession",
      {
        expertiseLevels: [
          {
            tier: "home:rank",
            rank: 1,
            benefits: {},
            advancementPointCost: { kind: "constant" },
          },
        ],
      },
    ],
    ["background", { choices: [{}] }],
    ["feat", { traits: [], choices: [{}] }],
    [
      "heritage",
      {
        modifierPairs: [
          {
            id: "p",
            beneficial: [{ kind: "grant-action" }],
            harmful: [{ kind: "custom", key: "home:cost", payload: null }],
          },
        ],
      },
    ],
    ["discipline", { inputs: [{ kind: "device" }], outcomes: [{}] }],
  ])
    assert.equal(
      validate(kind, components).filter((issue) => !issue.unresolved).length,
      0,
      kind,
    );
});

test("Profession preserves complete built-ins, rank identity and open rules", () => {
  const choice = {
    id: "choose",
    prompt: "Pick",
    minimum: 0,
    maximum: 1,
    options: [
      {
        id: "opt",
        label: "Choice",
        value: { custom: [true, 1] },
        prerequisites: [{ kind: "always" }],
      },
    ],
  };
  const modifier = {
    id: "mod",
    target: "focus",
    operation: "add",
    value: { kind: "constant", value: -0.5 },
  };
  const components = {
    expertiseOrder: ["home:novice", "home:expert"],
    expertiseLevels: [
      { tier: "home:novice", rank: 0, benefits: {} },
      {
        tier: "home:expert",
        rank: 1,
        advancementPointCost: { kind: "constant", value: 2 },
        advancementWindow: { kind: "custom", predicate: { kind: "always" } },
        prerequisites: [],
        benefits: {
          modifiers: [modifier],
          traitIds: ["trait"],
          resourceMaximums: { focus: { kind: "constant", value: 2 } },
        },
      },
    ],
    acquisition: [
      {
        kind: "character-creation",
        startingExpertise: "home:novice",
        choices: [choice],
      },
      {
        kind: "during-play",
        startingExpertise: "home:novice",
        trainingDuration: { kind: "measured", amount: 1, unit: "day" },
      },
    ],
    actions: [
      {
        actionId: "act",
        unlocksAt: "home:novice",
        advancementPointsOnUse: { kind: "constant", value: 1 },
        qualifyingUse: { kind: "always" },
        advancementLimit: {
          kind: "uses",
          maximum: { kind: "constant", value: 2 },
        },
        improvements: [
          {
            atExpertise: "home:expert",
            modifiers: [modifier],
            replacementActionId: "better",
          },
        ],
      },
    ],
    prerequisites: [{ kind: "home:future", private: true }],
    choices: [choice],
    mutuallyExclusiveWith: ["other"],
  };
  assert.equal(
    validate("profession", components).filter((issue) => !issue.unresolved)
      .length,
    0,
  );
  assert.ok(
    validate("profession", {
      ...components,
      expertiseOrder: ["home:novice", "home:novice"],
    }).some(
      (issue) =>
        !issue.unresolved && issue.path === "components.expertiseOrder[1]",
    ),
  );
});

test("unknown imported Heritage and Discipline rule tags remain opaque", () => {
  for (const [kind, components] of [
    [
      "heritage",
      {
        shortDescription: "",
        modifierPairs: [
          {
            id: "p",
            beneficial: [{ kind: "home:future", private: true }],
            harmful: [{ kind: "custom", key: "home:cost", payload: null }],
          },
        ],
      },
    ],
    [
      "discipline",
      {
        inputs: [{ kind: "home:future", private: true }],
        activationTime: [{ kind: "home:future", private: true }],
      },
    ],
  ])
    assert.equal(
      validate(kind, components).filter((issue) => !issue.unresolved).length,
      0,
    );
});

test("Discipline Effect Choices keep the owning class diagnostic prefix", () => {
  const issues = validate("discipline", {
    outcomes: [
      {
        id: "outcome",
        effects: [{ kind: "choose", choice: { minimum: false } }],
      },
    ],
  });
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "discipline-choice-invalid" &&
        issue.path === "components.outcomes[0].effects[0].choice.minimum",
    ),
  );
});
