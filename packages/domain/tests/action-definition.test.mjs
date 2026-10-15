import assert from "node:assert/strict";
import test from "node:test";
import { ActionDefinition } from "../dist/index.js";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
const payload = () => ({
  kind: "action",
  identity: { id: "smith", name: "Smith" },
  components: {
    activation: "action",
    outcomes: [],
  },
  extensions: { "test:private": { secret: true } },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
test("Action owns detached raw and envelope codecs and rejects invalid JSON", () => {
  const input = payload();
  const entity = ActionDefinition.deserializePayload(input, {});
  input.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  const restored = ActionDefinition.deserialize(entity.serialize(), {});
  assert.deepEqual(restored.serializePayload(), payload());
  restored.dispose();
  assert.throws(
    () => ActionDefinition.deserializePayload(entity.serialize()),
    /Action kind/,
  );
  assert.throws(
    () =>
      ActionDefinition.deserialize({
        ...entity.serialize(),
        schemaVersion: 2,
      }),
    /schema version/,
  );
  const cyclic = { kind: "action" };
  cyclic.self = cyclic;
  for (const input of [
    cyclic,
    { kind: "action", invalid: NaN },
    { kind: "action", invalid: new Date() },
  ])
    assert.throws(() => ActionDefinition.deserializePayload(input), /JSON/);
  const output = entity.serializePayload();
  output.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Action exposes missing fields as unresolved and malformed supplied fields as invalid", () => {
  const incomplete = ActionDefinition.deserializePayload({
    kind: "action",
  });
  assert.ok(codes(incomplete).includes("action-components-unresolved"));
  incomplete.dispose();
  for (const change of [
    { activation: "homebrew:action" },
    { activation: ["action"] },
    { outcomes: null },
    { outcomes: [null] },
    { outcomes: [{ kind: "outcome" }] },
    { outcomes: [{ id: "hit", effects: null }] },
    { outcomes: [{ id: "hit", effects: [{}] }] },
    { outcomes: [{ id: "hit", effects: [], when: {} }] },
    { prerequisites: {} },
    { prerequisites: [{}] },
    { choices: "legacy" },
    { choices: [null] },
    { costs: [null] },
    { targets: [null] },
    { test: [] },
    { duration: {} },
    { sustainedOperation: "yes" },
  ]) {
    const entity = ActionDefinition.deserializePayload({
      ...payload(),
      components: { ...payload().components, ...change },
    });
    assert.ok(
      codes(entity).includes("action-components-invalid"),
      JSON.stringify(change),
    );
    entity.dispose();
  }
  const wrongContainer = ActionDefinition.deserializePayload({
    kind: "action",
    components: [],
  });
  assert.ok(codes(wrongContainer).includes("action-components-invalid"));
  wrongContainer.dispose();
  for (const field of ["activation", "outcomes"]) {
    const data = payload();
    delete data.components[field];
    const entity = ActionDefinition.deserializePayload(data);
    assert.ok(codes(entity).includes("action-components-unresolved"), field);
    entity.dispose();
  }
});
test("Action preserves every canonical activation and rich nested structure", () => {
  for (const activation of [
    "action",
    "bonus-action",
    "reaction",
    "free-action",
    "movement",
    "legendary-action",
    "lair-action",
    "mythic-action",
    "special",
    "passive",
  ]) {
    const data = payload();
    Object.assign(data.components, {
      activation,
      outcomes: [
        {
          id: "hit",
          when: { kind: "custom", rule: "predicate" },
          effects: [
            { kind: "narrative", text: "A bell rings", visibility: "gm" },
          ],
        },
      ],
      costs: [{ kind: "custom", key: "test:cost", payload: { secret: true } }],
      prerequisites: [{ kind: "custom", rule: "predicate" }],
      targets: [{ kind: "self" }],
      choices: [
        { id: "choice", prompt: "Choose", minimum: 0, maximum: 1, options: [] },
      ],
      test: { kind: "attack-roll", ties: "reroll" },
      limit: { kind: "once-per-turn" },
      duration: { kind: "instantaneous" },
      sustainedOperation: false,
    });
    const entity = ActionDefinition.deserializePayload(data);
    assert.deepEqual(codes(entity), []);
    assert.deepEqual(entity.serializePayload(), data);
    entity.dispose();
  }
});
test("Action granted Conditions require captured references and recover when revalidated", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  const entity = ActionDefinition.deserializePayload(data, {});
  assert.ok(codes(entity).includes("action-references-unresolved"));
  entity.validate({ records: [] });
  assert.ok(codes(entity).includes("action-codex-granted-conditions"));
  entity.validate({
    records: [
      {
        resourceType: WORLD_CODEX_RESOURCES.conditions,
        sourceId: "condition",
        payload: { id: "condition" },
      },
    ],
  });
  assert.deepEqual(codes(entity), []);
  entity.dispose();
  for (const grants of [
    null,
    [{ conditionId: "condition" }, { conditionId: "condition" }],
    [{ conditionId: "" }],
  ]) {
    data.components.grantedConditions = grants;
    const invalid = ActionDefinition.deserializePayload(data, {
      records: [],
    });
    assert.ok(codes(invalid).includes("action-codex-granted-conditions"));
    invalid.dispose();
  }
});
test("Action rename emits committed nested identity and suppresses no-ops", async () => {
  const entity = ActionDefinition.deserializePayload(payload(), {});
  const seen = [];
  entity.state$.subscribe((state) => seen.push(state.data.identity.name));
  entity.events.renamed.listen((event) =>
    seen.push(`event:${event.context.name}:${entity.state.data.identity.name}`),
  );
  for (const name of ["  Master smith  ", "Master smith"])
    await entity.command("rename", {
      initiator: "author",
      params: { name },
      context: {},
    });
  assert.deepEqual(seen, [
    "Smith",
    "Master smith",
    "event:Master smith:Master smith",
  ]);
  await assert.rejects(
    () =>
      entity.command("rename", {
        initiator: "author",
        params: { name: " " },
        context: {},
      }),
    /Action name/,
  );
  entity.dispose();
});
test("Action codecs enforce bounded plain JSON while permitting shared references", () => {
  const shared = { value: 1 };
  const valid = ActionDefinition.deserializePayload({
    ...payload(),
    extra: [shared, shared],
  });
  valid.dispose();
  let deep = {};
  for (let i = 0; i < 66; i++) deep = { nested: deep };
  for (const invalid of [undefined, Infinity, () => true, deep]) {
    assert.throws(
      () =>
        ActionDefinition.deserializePayload({
          ...payload(),
          extra: invalid,
        }),
      /JSON/,
    );
  }
});

test("Action shallow checks leave nested rule semantics deferred and permit empty outcomes", () => {
  const data = payload();
  Object.assign(data.components, {
    outcomes: [{ id: "", effects: [{ kind: "custom" }] }],
    choices: [{ id: "", prompt: "", minimum: 0, maximum: 0 }],
    test: { kind: "saving-throw" },
  });
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
  const empty = ActionDefinition.deserializePayload(payload());
  assert.deepEqual(codes(empty), []);
  empty.dispose();
});

test("Action validates authored effect fields with indexed diagnostics and repairable omissions", () => {
  const data = payload();
  data.components.outcomes = [
    {
      id: "result",
      effects: [
        { kind: "narrative", text: 3, visibility: "secret" },
        {
          kind: "damage",
          target: "target",
          damageType: "world:steam",
          amount: {
            terms: [
              { kind: "constant", value: "3" },
              {
                kind: "dice",
                count: { kind: "constant" },
                size: "six",
                sign: 0,
              },
            ],
          },
        },
        {
          kind: "heal",
          target: false,
          amount: { terms: null },
          upToMaximum: "yes",
        },
        {
          kind: "move",
          target: "target",
          distance: { value: "far", unit: "league" },
          forced: "yes",
          direction: 4,
        },
        { kind: "narrative" },
      ],
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  const issues = entity.state.metadata.validity.issues;
  for (const suffix of [
    "[0].text",
    "[0].visibility",
    "[1].amount.terms[0].value",
    "[1].amount.terms[1].size",
    "[1].amount.terms[1].sign",
    "[2].target",
    "[2].amount.terms",
    "[2].upToMaximum",
    "[3].distance.value",
    "[3].distance.unit",
    "[3].forced",
    "[3].direction",
  ])
    assert.ok(
      issues.some(
        (issue) =>
          issue.code === "action-effect-invalid" &&
          issue.path === `components.outcomes[0].effects${suffix}`,
      ),
      suffix,
    );
  for (const suffix of ["[1].amount.terms[1].count.value", "[4].text"])
    assert.ok(
      issues.some(
        (issue) =>
          issue.unresolved &&
          issue.path === `components.outcomes[0].effects${suffix}`,
      ),
      suffix,
    );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Action keeps open values, numeric expressions, and imported effect grammars intact", () => {
  const data = payload();
  data.components.outcomes = [
    {
      id: "",
      when: { kind: "custom", rule: "legacy" },
      effects: [
        { kind: "narrative", text: "", visibility: "controller" },
        {
          kind: "damage",
          target: "",
          damageType: "world:steam",
          amount: {
            terms: [
              { kind: "constant", value: -2.5 },
              { kind: "dice", count: -0.5, size: 7, sign: -1 },
              {
                kind: "arithmetic",
                operator: "add",
                operands: [{ kind: "path", path: "level" }],
              },
            ],
          },
        },
        {
          kind: "heal",
          target: "self",
          amount: { terms: [] },
          upToMaximum: false,
        },
        {
          kind: "move",
          target: "self",
          distance: { value: -0.5, unit: "hex" },
          direction: "",
          forced: false,
        },
        { kind: "world:imported", hidden: { private: true } },
      ],
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Action costs distinguish missing values from malformed values at indexed paths", () => {
  const data = payload();
  data.components.costs = [
    { kind: "economy", activation: "unknown", count: "two" },
    {
      kind: "resource",
      cost: {
        resource: 2,
        amount: { kind: "constant", value: "one" },
        minimumRemaining: false,
      },
    },
    { kind: "capacity", band: "other", sourceId: false },
    { kind: "item-use", item: {}, amount: null },
    { kind: "hit-die", amount: "one" },
    { kind: "movement", distance: { value: "ten", unit: "league" } },
    { kind: "economy" },
    { kind: "resource" },
    { kind: "resource", cost: {} },
    { kind: "resource", cost: { resource: "", amount: { kind: "constant" } } },
    { kind: "capacity" },
    { kind: "item-use" },
    { kind: "hit-die" },
    { kind: "movement", distance: {} },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  const issues = entity.state.metadata.validity.issues;
  for (const path of [
    "[0].activation",
    "[0].count",
    "[1].cost.resource",
    "[1].cost.amount.value",
    "[1].cost.minimumRemaining",
    "[2].band",
    "[2].sourceId",
    "[3].item",
    "[3].amount",
    "[4].amount",
    "[5].distance.value",
    "[5].distance.unit",
  ])
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `components.costs${path}` &&
          issue.code === "action-cost-invalid" &&
          !issue.unresolved,
      ),
      path,
    );
  for (const path of [
    "[6].activation",
    "[7].cost",
    "[8].cost.resource",
    "[8].cost.amount",
    "[9].cost.amount.value",
    "[10].band",
    "[11].item",
    "[12].amount",
    "[13].distance.value",
    "[13].distance.unit",
  ])
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `components.costs${path}` &&
          issue.code === "action-cost-unresolved" &&
          issue.unresolved,
      ),
      path,
    );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Action costs preserve open strings, finite numbers and imported expression grammar", () => {
  const data = payload();
  data.components.costs = [
    { kind: "economy", activation: "legendary-action", count: -0.5 },
    {
      kind: "resource",
      cost: {
        resource: "",
        amount: { kind: "constant", value: -2.5 },
        minimumRemaining: -1,
      },
    },
    {
      kind: "resource",
      cost: {
        resource: "homebrew:steam",
        amount: { kind: "future-expression", private: { rule: true } },
      },
    },
    { kind: "capacity", band: "chosen", sourceId: "" },
    { kind: "capacity", band: -1.5 },
    { kind: "item-use", item: "", amount: -1.5 },
    { kind: "hit-die", amount: 0 },
    ...["foot", "mile", "square", "hex", "meter", "kilometer"].map((unit) => ({
      kind: "movement",
      distance: { value: -1.5, unit },
    })),
    { kind: "custom", key: "test:private", payload: { secret: true } },
    { kind: "imported-cost", extra: { secret: true } },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Action choices distinguish missing fields and malformed values at indexed paths", () => {
  const data = payload();
  data.components.choices = [
    {
      id: 1,
      prompt: false,
      minimum: "one",
      maximum: null,
      optionCatalog: {},
      allowDuplicates: 0,
      visibility: "hidden",
      options: [
        null,
        { id: false, label: 2, value: null, prerequisites: [null, {}] },
        {},
      ],
    },
    {},
    { id: "a", prompt: "Pick", minimum: 0, maximum: 1, options: false },
    {
      id: "b",
      prompt: "Pick",
      minimum: 0,
      maximum: 1,
      options: [{ id: "b", label: "B", value: false, prerequisites: {} }],
    },
    null,
  ];
  const entity = ActionDefinition.deserializePayload(data);
  const issues = entity.state.metadata.validity.issues;
  for (const suffix of [
    "[0].id",
    "[0].prompt",
    "[0].minimum",
    "[0].maximum",
    "[0].optionCatalog",
    "[0].allowDuplicates",
    "[0].visibility",
    "[0].options[0]",
    "[0].options[1].id",
    "[0].options[1].label",
    "[0].options[1].prerequisites[0]",
    "[0].options[1].prerequisites[1]",
    "[2].options",
    "[3].options[0].prerequisites",
    "[4]",
  ])
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `components.choices${suffix}` &&
          issue.code ===
            (suffix.includes("prerequisites")
              ? "action-prerequisite-invalid"
              : "action-choice-invalid") &&
          !issue.unresolved,
      ),
      suffix,
    );
  for (const suffix of [
    "[0].options[2].id",
    "[0].options[2].label",
    "[0].options[2].value",
    "[1].id",
    "[1].prompt",
    "[1].minimum",
    "[1].maximum",
  ])
    assert.ok(
      issues.some(
        (issue) =>
          issue.path === `components.choices${suffix}` &&
          issue.code === "action-choice-unresolved" &&
          issue.unresolved,
      ),
      suffix,
    );
  assert.ok(
    !issues.some(
      (issue) => issue.path === "components.choices[0].options[1].value",
    ),
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
  data.components.choices = {};
  const malformed = ActionDefinition.deserializePayload(data);
  assert.ok(
    malformed.state.metadata.validity.issues.some(
      (issue) =>
        issue.path === "components.choices" &&
        issue.code === "action-choice-invalid",
    ),
  );
  malformed.dispose();
});

test("Action choices preserve JSON values and defer selection, identity and predicate semantics", () => {
  const data = payload();
  data.components.choices = [
    {
      id: "",
      prompt: "",
      minimum: 3.5,
      maximum: -1,
      optionCatalog: "",
      allowDuplicates: false,
      visibility: "gm",
      options: [
        null,
        false,
        0,
        "",
        "definition-id",
        [],
        { nested: [true, null, 0, "value"] },
      ].map((value) => ({
        id: "",
        label: "",
        value,
        prerequisites: [
          { kind: "future-predicate", private: { preserve: true } },
        ],
        private: { keep: true },
      })),
    },
    { id: "", prompt: "", minimum: -0.5, maximum: 0, visibility: "controller" },
    {
      id: "",
      prompt: "",
      minimum: 0,
      maximum: 0,
      visibility: "public",
      options: [],
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
  for (const value of [NaN, Infinity, { nested: undefined }, [() => {}]]) {
    const invalid = payload();
    invalid.components.choices = [
      {
        id: "test",
        prompt: "test",
        minimum: 0,
        maximum: 1,
        options: [{ id: "one", label: "One", value }],
      },
    ];
    assert.throws(() => ActionDefinition.deserializePayload(invalid), /JSON/);
  }
});

test("Action atomic prerequisites report indexed invalid values and repairable omissions", () => {
  const fields = [
    ["has-condition", ["subject", "condition"]],
    ["has-tag", ["subject", "tag"]],
    ["is-proficient", ["subject", "proficiency"]],
    ["is-attuned", ["subject"]],
    ["is-sustaining-operation", ["subject"]],
    ["damage-type", ["damage", "damageType"]],
    ["within-distance", ["source", "target", "distance"]],
    ["visible", ["observer", "target"]],
    ["has-cover", ["observer", "target", "cover"]],
    ["relation", ["source", "target", "relation"]],
  ];
  for (const [kind, keys] of fields) {
    for (const malformed of [false, true]) {
      const predicate = { kind };
      if (malformed) for (const key of keys) predicate[key] = null;
      const data = payload();
      data.components.prerequisites = [{ kind: "always" }, predicate];
      const entity = ActionDefinition.deserializePayload(data);
      const issues = entity.state.metadata.validity.issues;
      for (const key of keys)
        assert.ok(
          issues.some(
            (issue) =>
              issue.path === `components.prerequisites[1].${key}` &&
              issue.code ===
                `action-prerequisite-${malformed ? "invalid" : "unresolved"}` &&
              Boolean(issue.unresolved) === !malformed,
          ),
          `${kind}.${key}`,
        );
      assert.deepEqual(entity.serializePayload(), data);
      entity.dispose();
    }
  }
  for (const [prerequisites, paths] of [
    [null, ["components.prerequisites"]],
    [
      [false, {}, { kind: 2 }],
      [0, 1, 2].map((i) => `components.prerequisites[${i}]`),
    ],
    [
      [
        { kind: "is-attuned", subject: "", item: 2 },
        {
          kind: "within-distance",
          source: "",
          target: "",
          distance: { value: "far", unit: "league" },
        },
      ],
      [
        "components.prerequisites[0].item",
        "components.prerequisites[1].distance.value",
        "components.prerequisites[1].distance.unit",
      ],
    ],
  ]) {
    const entity = ActionDefinition.deserializePayload({
      ...payload(),
      components: { ...payload().components, prerequisites },
    });
    for (const path of paths)
      assert.ok(
        entity.state.metadata.validity.issues.some(
          (issue) =>
            issue.path === path && issue.code === "action-prerequisite-invalid",
        ),
      );
    entity.dispose();
  }
});

test("Action prerequisites preserve open strings, optional omission and deferred grammar", () => {
  const data = payload();
  data.components.prerequisites = [
    { kind: "always" },
    { kind: "never" },
    { kind: "has-condition", subject: "", condition: "world:custom" },
    { kind: "has-tag", subject: "", tag: "" },
    { kind: "is-proficient", subject: "", proficiency: "" },
    { kind: "is-attuned", subject: "" },
    { kind: "is-attuned", subject: "", item: "" },
    { kind: "is-sustaining-operation", subject: "" },
    { kind: "damage-type", damage: "", damageType: "world:steam" },
    { kind: "visible", observer: "", target: "" },
    { kind: "has-cover", observer: "", target: "", cover: "world:custom" },
    { kind: "relation", source: "", target: "", relation: "world:custom" },
    ...["foot", "mile", "square", "hex", "meter", "kilometer"].map((unit) => ({
      kind: "within-distance",
      source: "",
      target: "",
      distance: { value: -0.5, unit },
    })),
    ...["custom", "imported-predicate"].map((kind) => ({
      kind,
      private: { preserve: true },
    })),
  ];
  data.components.choices = [
    {
      id: "choice",
      prompt: "",
      minimum: 0,
      maximum: 1,
      options: [
        {
          id: "option",
          label: "",
          value: null,
          prerequisites: [{ kind: "has-tag", subject: "", tag: "" }],
        },
      ],
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
  for (const value of [NaN, Infinity])
    assert.throws(
      () =>
        ActionDefinition.deserializePayload({
          ...payload(),
          components: {
            ...payload().components,
            prerequisites: [
              {
                kind: "within-distance",
                source: "",
                target: "",
                distance: { value, unit: "foot" },
              },
            ],
          },
        }),
      /JSON/,
    );
});

test("Action compound prerequisites validate descendants with exact paths", () => {
  const data = payload();
  data.components.prerequisites = [
    {
      kind: "all",
      predicates: [
        {
          kind: "any",
          predicates: [
            { kind: "not", predicate: { kind: "has-tag", subject: false } },
            { kind: "not" },
            { kind: "not", predicate: null },
            { kind: "all" },
            { kind: "any", predicates: {} },
            null,
            { kind: "not", predicate: {} },
          ],
        },
      ],
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  const prefix = "components.prerequisites[0].predicates[0].predicates";
  const expected = [
    ["[0].predicate.subject", false],
    ["[0].predicate.tag", true],
    ["[1].predicate", true],
    ["[2].predicate", false],
    ["[3].predicates", true],
    ["[4].predicates", false],
    ["[5]", false],
    ["[6].predicate", false],
  ];
  assert.deepEqual(
    entity.state.metadata.validity.issues.map((issue) => [
      issue.path,
      !!issue.unresolved,
    ]),
    expected.map(([path, unresolved]) => [prefix + path, unresolved]),
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Action compounds preserve empty groups, opaque descendants and private values", () => {
  const data = payload();
  data.components.prerequisites = [
    {
      kind: "all",
      private: { keep: true },
      predicates: [
        { kind: "all", predicates: [] },
        { kind: "any", predicates: [] },
        {
          kind: "not",
          predicate: {
            kind: "any",
            predicates: [
              { kind: "has-tag", subject: "", tag: "" },
              { kind: "imported-comparison", private: { unknown: true } },
              { kind: "custom", payload: { predicates: [false] } },
              { kind: "imported", predicate: null },
            ],
          },
        },
      ],
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  const restored = ActionDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), data);
  restored.dispose();
  entity.dispose();
  const cyclic = { kind: "not" };
  cyclic.predicate = cyclic;
  let deep = { kind: "always" };
  for (let i = 0; i < 70; i++) deep = { kind: "not", predicate: deep };
  for (const predicate of [cyclic, deep])
    assert.throws(
      () =>
        ActionDefinition.deserializePayload({
          ...payload(),
          components: {
            ...payload().components,
            prerequisites: [predicate],
          },
        }),
      /JSON/,
    );
});

test("Action comparisons validate operator and operand fields recursively with exact paths", () => {
  const cases = [
    [
      {},
      [
        ["operator", true],
        ["left", true],
        ["right", true],
      ],
    ],
    [
      { operator: "unknown", left: null, right: [] },
      [
        ["operator", false],
        ["left", false],
        ["right", false],
      ],
    ],
    [
      { operator: "eq", left: {}, right: { kind: false } },
      [
        ["left.kind", true],
        ["right.kind", false],
      ],
    ],
    [
      {
        operator: "eq",
        left: { kind: "constant" },
        right: { kind: "constant", value: "2" },
      },
      [
        ["left.value", true],
        ["right.value", false],
      ],
    ],
    [
      {
        operator: "eq",
        left: { kind: "literal" },
        right: { kind: "literal", value: null },
      },
      [["left.value", true]],
    ],
    [
      {
        operator: "eq",
        left: { kind: "path", fallback: "0" },
        right: { kind: "path", path: false },
      },
      [
        ["left.fallback", false],
        ["left.path", true],
        ["right.path", false],
      ],
    ],
    [
      {
        operator: "eq",
        left: { kind: "event-value" },
        right: { kind: "collection-count", path: 1 },
      },
      [
        ["left.path", true],
        ["right.path", false],
      ],
    ],
  ];
  for (const [fields, expected] of cases) {
    const data = payload();
    data.components.prerequisites = [
      {
        kind: "all",
        predicates: [
          {
            kind: "any",
            predicates: [
              { kind: "not", predicate: { kind: "compare", ...fields } },
            ],
          },
        ],
      },
    ];
    const entity = ActionDefinition.deserializePayload(data);
    const prefix =
      "components.prerequisites[0].predicates[0].predicates[0].predicate.";
    assert.deepEqual(
      entity.state.metadata.validity.issues.map(
        ({ path, unresolved, code }) => [path, !!unresolved, code],
      ),
      expected.map(([path, unresolved]) => [
        prefix + path,
        unresolved,
        `action-prerequisite-${unresolved ? "unresolved" : "invalid"}`,
      ]),
    );
    assert.deepEqual(entity.serializePayload(), data);
    entity.dispose();
  }
});

test("Action comparisons preserve supported values and opaque advanced operands without evaluation", () => {
  const data = payload();
  const operands = [
    { kind: "constant", value: -0.5, private: true },
    ...[null, false, true, "", 2, { nested: [false, null, 2] }].map(
      (value) => ({ kind: "literal", value }),
    ),
    { kind: "path", path: "" },
    { kind: "path", path: "actor.hp", fallback: -0.5 },
    { kind: "event-value", path: "" },
    { kind: "collection-count", path: "" },
    {
      kind: "arithmetic",
      operator: "add",
      operands: [{ kind: "constant", value: 2 }],
    },
    { kind: "dice", expression: { terms: [] } },
    { kind: "imported", private: { keep: true } },
  ];
  data.components.prerequisites = [
    "eq",
    "ne",
    "lt",
    "lte",
    "gt",
    "gte",
    "includes",
    "matches",
  ].flatMap((operator) =>
    operands.map((left) => ({
      kind: "compare",
      operator,
      left,
      right: { kind: "literal", value: null },
    })),
  );
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  const restored = ActionDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), data);
  entity.dispose();
  restored.dispose();
  for (const value of [Infinity, NaN, undefined, () => {}]) {
    assert.throws(
      () =>
        ActionDefinition.deserializePayload({
          ...payload(),
          components: {
            ...payload().components,
            prerequisites: [
              {
                kind: "compare",
                operator: "eq",
                left: { kind: "literal", value },
                right: { kind: "constant", value: 1 },
              },
            ],
          },
        }),
      /JSON/,
    );
  }
});

test("Action has-definition fields validate recursively with unresolved and invalid paths", () => {
  for (const [fields, expected] of [
    [
      {},
      [
        ["subject", true],
        ["definitionId", true],
      ],
    ],
    [
      { subject: null, definitionId: 4 },
      [
        ["subject", false],
        ["definitionId", false],
      ],
    ],
    [{ subject: "actor", definitionId: {} }, [["definitionId", false]]],
    [{ subject: [], definitionId: "imported" }, [["subject", false]]],
  ]) {
    const data = payload();
    data.components.prerequisites = [
      {
        kind: "all",
        predicates: [
          {
            kind: "any",
            predicates: [
              { kind: "not", predicate: { kind: "has-definition", ...fields } },
            ],
          },
        ],
      },
    ];
    const entity = ActionDefinition.deserializePayload(data);
    const prefix =
      "components.prerequisites[0].predicates[0].predicates[0].predicate.";
    assert.deepEqual(
      entity.state.metadata.validity.issues.map(
        ({ path, unresolved, code }) => [path, !!unresolved, code],
      ),
      expected.map(([path, unresolved]) => [
        prefix + path,
        unresolved,
        `action-prerequisite-${unresolved ? "unresolved" : "invalid"}`,
      ]),
    );
    assert.deepEqual(entity.serializePayload(), data);
    entity.dispose();
  }
});

test("Action has-definition preserves open references and private data without catalog resolution", () => {
  const data = payload();
  data.components.prerequisites = [
    { kind: "has-definition", subject: "", definitionId: "" },
    {
      kind: "has-definition",
      subject: "actor",
      definitionId: "unknown-imported-definition",
      private: { secret: [true, null] },
    },
    {
      kind: "not",
      predicate: {
        kind: "has-definition",
        subject: "target",
        definitionId: "c116b502-b719-46c3-84e4-bb01cfaa0318",
      },
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  const restored = ActionDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), data);
  restored.dispose();
  entity.dispose();
});

test("Action Choice Option prerequisites reuse recursive diagnostics with full owner paths", () => {
  for (const [predicate, suffix, unresolved = false] of [
    [{ kind: "has-tag", subject: false, tag: "ready" }, "subject"],
    [{ kind: "has-tag", subject: "actor" }, "tag", true],
    [
      {
        kind: "compare",
        operator: "eq",
        left: { kind: "constant", value: "bad" },
        right: { kind: "literal", value: null },
      },
      "left.value",
    ],
    [
      {
        kind: "compare",
        operator: "eq",
        right: { kind: "literal", value: null },
      },
      "left",
      true,
    ],
    [
      { kind: "has-definition", subject: "actor", definitionId: 1 },
      "definitionId",
    ],
    [{ kind: "has-definition", subject: "actor" }, "definitionId", true],
    [{ kind: "all", predicates: false }, "predicates"],
    [{ kind: "not" }, "predicate", true],
  ]) {
    const data = payload();
    data.components.choices = [
      {
        id: "choice",
        prompt: "Pick",
        minimum: 0,
        maximum: 1,
        options: [
          { id: "sibling", label: "Sibling", value: null },
          {
            id: "option",
            label: "Option",
            value: { nested: [null, true] },
            prerequisites: [
              {
                kind: "all",
                predicates: [
                  { kind: "any", predicates: [{ kind: "not", predicate }] },
                ],
              },
            ],
            private: { keep: true },
          },
        ],
      },
    ];
    const entity = ActionDefinition.deserializePayload(data);
    const path = `components.choices[0].options[1].prerequisites[0].predicates[0].predicates[0].predicate.${suffix}`;
    const issue = entity.state.metadata.validity.issues.find(
      (issue) => issue.path === path,
    );
    assert.ok(issue, path);
    assert.equal(
      issue.code,
      `action-prerequisite-${unresolved ? "unresolved" : "invalid"}`,
    );
    assert.equal(Boolean(issue.unresolved), unresolved);
    assert.deepEqual(entity.serializePayload(), data);
    entity.dispose();
  }
});

test("Action Choice Option prerequisites preserve open references, optional omission and opaque grammar", () => {
  const data = payload();
  data.components.choices = [
    {
      id: "choice",
      prompt: "Pick",
      minimum: 0,
      maximum: 1,
      private: { keep: true },
      options: [
        { id: "omitted", label: "Omitted", value: null },
        { id: "empty", label: "Empty", value: false, prerequisites: [] },
        {
          id: "option",
          label: "Option",
          value: { nested: [null, false, { keep: "yes" }] },
          private: { keep: true },
          prerequisites: [
            {
              kind: "all",
              predicates: [
                { kind: "has-tag", subject: "", tag: "" },
                {
                  kind: "not",
                  predicate: {
                    kind: "has-definition",
                    subject: "",
                    definitionId: "unknown-imported",
                    private: { keep: true },
                  },
                },
              ],
            },
            {
              kind: "compare",
              operator: "eq",
              left: { kind: "future-expression", private: { keep: true } },
              right: { kind: "literal", value: [null, { nested: true }] },
            },
            {
              kind: "custom",
              key: "world:custom",
              payload: { preserve: true },
            },
            { kind: "future-predicate", private: { preserve: true } },
          ],
        },
      ],
    },
  ];
  const entity = ActionDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Action usage limits validate numeric-only maxima and exact repairable paths", () => {
  const cases = [
    [false, "", "invalid"],
    [null, "", "invalid"],
    [{}, ".kind", "unresolved"],
    [{ kind: 1 }, ".kind", "invalid"],
    [{ kind: "uses" }, ".maximum", "unresolved"],
    [{ kind: "uses", maximum: {} }, ".maximum.kind", "unresolved"],
    [{ kind: "uses", maximum: { kind: false } }, ".maximum.kind", "invalid"],
    [
      { kind: "uses", maximum: { kind: "constant" } },
      ".maximum.value",
      "unresolved",
    ],
    [
      { kind: "uses", maximum: { kind: "constant", value: "1" } },
      ".maximum.value",
      "invalid",
    ],
    [
      { kind: "uses", maximum: { kind: "path", path: false, fallback: true } },
      ".maximum.path",
      "invalid",
    ],
    [
      { kind: "uses", maximum: { kind: "path", path: "", fallback: true } },
      ".maximum.fallback",
      "invalid",
    ],
    [
      {
        kind: "uses",
        maximum: { kind: "constant", value: 1 },
        resetsOn: "daily",
      },
      ".resetsOn",
      "invalid",
    ],
    [{ kind: "recharge" }, ".die", "unresolved"],
    [{ kind: "recharge", die: false, succeedsOn: [] }, ".die", "invalid"],
    [{ kind: "recharge", die: 6 }, ".succeedsOn", "unresolved"],
    [
      { kind: "recharge", die: 6, succeedsOn: [2, "3"] },
      ".succeedsOn[1]",
      "invalid",
    ],
    [{ kind: "resource" }, ".resource", "unresolved"],
    [{ kind: "resource", resource: 1 }, ".resource", "invalid"],
    ...[
      "literal",
      "dice",
      "attribute-score",
      "skill-bonus",
      "collection-count",
      "lookup",
      "choice-value",
      "event-value",
    ].map((kind) => [
      { kind: "uses", maximum: { kind, value: 2 } },
      ".maximum",
      "invalid",
    ]),
  ];
  for (const [limit, suffix, status] of cases) {
    const entity = ActionDefinition.deserializePayload({
      ...payload(),
      components: {
        ...payload().components,
        limit,
      },
    });
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.path === `components.limit${suffix}` &&
          issue.code === `action-limit-${status}` &&
          Boolean(issue.unresolved) === (status === "unresolved"),
      ),
      JSON.stringify(limit),
    );
    entity.dispose();
  }
});

test("Action usage limits preserve omission, all variants, numeric freedom and opaque internals", () => {
  const limits = [
    undefined,
    { kind: "once-per-turn", private: true },
    { kind: "once-per-round" },
    { kind: "once-per-encounter" },
    { kind: "resource", resource: "" },
    { kind: "recharge", die: -1.5, succeedsOn: [-4, 0.5, 0.5] },
    { kind: "recharge", die: 0, succeedsOn: [] },
    ...[undefined, "short", "long", "homebrew:", "hit", "custom"].map(
      (resetsOn) => ({
        kind: "uses",
        maximum: { kind: "constant", value: -2.5 },
        ...(resetsOn === undefined ? {} : { resetsOn }),
      }),
    ),
    {
      kind: "uses",
      maximum: { kind: "path", path: "", fallback: 0, private: true },
    },
    ...[
      { kind: "attribute-modifier", attribute: "aow:might" },
      { kind: "proficiency-bonus" },
      { kind: "level" },
      { kind: "resource", resource: "focus" },
      { kind: "arithmetic", operator: "add", operands: [] },
      {
        kind: "conditional",
        predicate: "ready",
        whenTrue: { kind: "constant", value: 1 },
        whenFalse: { kind: "constant", value: 0 },
      },
      { kind: "future" },
    ].map((maximum) => ({
      kind: "uses",
      maximum: { ...maximum, private: { retained: true } },
    })),
    { kind: "future-limit", private: [true] },
  ];
  for (const limit of limits) {
    const input = {
      ...payload(),
      components: {
        ...payload().components,
        private: true,
        prerequisites: [{ kind: "always" }],
        ...(limit === undefined ? {} : { limit }),
      },
    };
    const entity = ActionDefinition.deserializePayload(input);
    assert.equal(
      entity.state.metadata.validity.status,
      "valid",
      JSON.stringify(limit),
    );
    const restored = ActionDefinition.deserialize(entity.serialize());
    assert.deepEqual(restored.serializePayload(), input);
    assert.equal(
      Object.hasOwn(restored.serializePayload().components, "limit"),
      limit !== undefined,
    );
    restored.dispose();
    entity.dispose();
  }
});

test("Action owns recursive Outcome predicates at their singleton paths", () => {
  const when = {
    kind: "all",
    predicates: [
      {
        kind: "any",
        predicates: [
          {
            kind: "not",
            predicate: {
              kind: "compare",
              operator: "eq",
              left: { kind: "constant", value: "bad" },
              right: { kind: "literal", value: null },
            },
          },
        ],
      },
      { kind: "has-definition", subject: "actor" },
    ],
  };
  const input = payload();
  input.components.outcomes = [{ id: "outcome", effects: [], when }];
  const entity = ActionDefinition.deserializePayload(input);
  assert.ok(
    entity.state.metadata.validity.issues.some(
      (issue) =>
        issue.code === "action-outcome-predicate-invalid" &&
        issue.path ===
          "components.outcomes[0].when.predicates[0].predicates[0].predicate.left.value",
    ),
  );
  assert.ok(
    entity.state.metadata.validity.issues.some(
      (issue) =>
        issue.code === "action-outcome-predicate-unresolved" &&
        issue.unresolved &&
        issue.path === "components.outcomes[0].when.predicates[1].definitionId",
    ),
  );
  assert.deepEqual(entity.serializePayload(), input);
  entity.dispose();
});

test("Outcome predicates preserve omission, unknown content and incomplete drafts; reject malformed supplied structure", () => {
  for (const when of [
    undefined,
    { kind: "always" },
    { kind: "all", predicates: [] },
    { kind: "has-tag" },
    { kind: "compare", operator: "eq" },
    { kind: "homebrew:future", predicate: false, private: { keep: true } },
  ]) {
    const input = payload();
    input.components.outcomes = [
      { id: "outcome", effects: [], ...(when === undefined ? {} : { when }) },
    ];
    const entity = ActionDefinition.deserializePayload(input);
    assert.equal(
      entity.state.metadata.validity.issues.some((issue) => !issue.unresolved),
      false,
    );
    assert.deepEqual(entity.serializePayload(), input);
    entity.dispose();
  }
  for (const when of [
    null,
    false,
    [],
    {},
    { kind: "not", predicate: [] },
    { kind: "all", predicates: false },
    { kind: "has-tag", subject: 2 },
  ]) {
    const input = payload();
    input.components.outcomes = [{ id: "outcome", effects: [], when }];
    const entity = ActionDefinition.deserializePayload(input);
    assert.ok(codes(entity).includes("action-outcome-predicate-invalid"));
    entity.dispose();
  }
});
