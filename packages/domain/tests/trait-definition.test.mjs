import assert from "node:assert/strict";
import test from "node:test";
import { TraitDefinition, ActionDefinition } from "../dist/index.js";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
const payload = () => ({
  kind: "trait",
  identity: { id: "smith", name: "Smith" },
  components: {},
  extensions: { "test:private": { secret: true } },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
test("Trait owns detached raw and envelope codecs and rejects invalid JSON", () => {
  const input = payload();
  const entity = TraitDefinition.deserializePayload(input, {});
  input.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  const restored = TraitDefinition.deserialize(entity.serialize(), {});
  assert.deepEqual(restored.serializePayload(), payload());
  restored.dispose();
  assert.throws(
    () => TraitDefinition.deserializePayload(entity.serialize()),
    /Trait kind/,
  );
  assert.throws(
    () =>
      TraitDefinition.deserialize({
        ...entity.serialize(),
        schemaVersion: 2,
      }),
    /schema version/,
  );
  const cyclic = { kind: "trait" };
  cyclic.self = cyclic;
  for (const input of [
    cyclic,
    { kind: "trait", invalid: NaN },
    { kind: "trait", invalid: new Date() },
  ])
    assert.throws(() => TraitDefinition.deserializePayload(input), /JSON/);
  const output = entity.serializePayload();
  output.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Trait accepts empty optional components and separates missing from malformed components", () => {
  const empty = TraitDefinition.deserializePayload(payload());
  assert.deepEqual(codes(empty), []);
  empty.dispose();
  const incomplete = TraitDefinition.deserializePayload({ kind: "trait" });
  assert.deepEqual(codes(incomplete), ["trait-components-unresolved"]);
  incomplete.dispose();
  for (const components of [null, [], "legacy"]) {
    const invalid = TraitDefinition.deserializePayload({
      ...payload(),
      components,
    });
    assert.ok(codes(invalid).includes("trait-components-invalid"));
    invalid.dispose();
  }
});
test("Trait rejects malformed supplied collection shapes", () => {
  for (const change of [
    { prerequisites: {} },
    { prerequisites: [{}] },
    { modifiers: [null] },
    { modifiers: "legacy" },
    { actions: [{ kind: "trait" }] },
    { actions: [null] },
    { triggers: [{ event: "turn-start", effects: {} }] },
    { triggers: [{ event: "turn-start", effects: [{}] }] },
    { grants: [1] },
    { grants: {} },
    { choices: [null] },
  ]) {
    const entity = TraitDefinition.deserializePayload({
      ...payload(),
      components: change,
    });
    assert.ok(
      codes(entity).some((code) =>
        ["trait-components-invalid", "trait-trigger-invalid"].includes(code),
      ),
      JSON.stringify(change),
    );
    entity.dispose();
  }
});
test("Trait definition grants preserve optional, empty, unknown and repeated string references", () => {
  for (const grants of [
    undefined,
    [],
    ["", "unknown", "unknown", "definition/with/slash"],
  ]) {
    const data = payload();
    data.components = {
      ...(grants === undefined ? {} : { grants }),
      grantedConditions: [],
      actions: [],
      prerequisites: [{ kind: "custom", private: { keep: true } }],
      private: { nested: [false, null] },
    };
    const entity = TraitDefinition.deserializePayload(data, { records: [] });
    assert.deepEqual(codes(entity), []);
    assert.deepEqual(entity.serializePayload(), data);
    assert.equal(
      Object.hasOwn(entity.serializePayload().components, "grants"),
      grants !== undefined,
    );
    const restored = TraitDefinition.deserialize(entity.serialize(), {
      records: [],
    });
    assert.deepEqual(restored.serializePayload(), data);
    restored.dispose();
    entity.dispose();
  }
});
test("Trait definition grants reject non-string entries without adopting Condition-link rules", () => {
  for (const grants of [
    null,
    "definition",
    {},
    [null],
    [false],
    [1],
    [{ definitionId: "definition" }],
  ]) {
    const entity = TraitDefinition.deserializePayload({
      ...payload(),
      components: { grants },
    });
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.code === "trait-components-invalid" &&
          issue.message === "Provide a valid Trait grants value.",
      ),
    );
    assert.equal(
      codes(entity).includes("trait-codex-granted-conditions"),
      false,
    );
    entity.dispose();
  }
});
test("Trait granted Conditions require captured references and recover when revalidated", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  const entity = TraitDefinition.deserializePayload(data, {});
  assert.ok(codes(entity).includes("trait-references-unresolved"));
  entity.validate({ records: [] });
  assert.ok(codes(entity).includes("trait-codex-granted-conditions"));
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
    const invalid = TraitDefinition.deserializePayload(data, {
      records: [],
    });
    assert.ok(codes(invalid).includes("trait-codex-granted-conditions"));
    invalid.dispose();
  }
});
test("Trait rename emits committed nested identity and suppresses no-ops", async () => {
  const entity = TraitDefinition.deserializePayload(payload(), {});
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
    /Trait name/,
  );
  entity.dispose();
});
test("Trait codecs enforce bounded plain JSON while permitting shared references", () => {
  const shared = { value: 1 };
  const valid = TraitDefinition.deserializePayload({
    ...payload(),
    extra: [shared, shared],
  });
  valid.dispose();
  let deep = {};
  for (let i = 0; i < 66; i++) deep = { nested: deep };
  for (const invalid of [undefined, Infinity, () => true, deep]) {
    assert.throws(
      () =>
        TraitDefinition.deserializePayload({
          ...payload(),
          extra: invalid,
        }),
      /JSON/,
    );
  }
});

test("Trait preserves rich interface-shaped nested data without claiming deep rule validation", () => {
  const data = payload();
  Object.assign(data.components, {
    prerequisites: [{ kind: "always" }],
    modifiers: [
      {
        id: "bonus",
        target: "stats.armor",
        operation: "add",
        value: { kind: "literal", value: 1 },
      },
    ],
    actions: [
      {
        kind: "action",
        identity: { id: "alarm", name: "Alarm" },
        components: { activation: "reaction", outcomes: [] },
      },
    ],
    triggers: [
      {
        event: "turn-start",
        timing: "after",
        optional: true,
        effects: [
          { kind: "narrative", text: "A bell rings", visibility: "gm" },
        ],
      },
    ],
    grants: ["gift"],
    choices: [
      { id: "choice", prompt: "Choose", minimum: 0, maximum: 1, options: [] },
    ],
    privateNotes: { secret: true },
  });
  const entity = TraitDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
  const shallow = TraitDefinition.deserializePayload({
    ...payload(),
    components: {
      modifiers: [{}],
      choices: [{}],
      triggers: [{ event: "custom", effects: [{ kind: "custom" }] }],
    },
  });
  assert.equal(shallow.state.metadata.validity.status, "unresolved");
  assert.deepEqual(
    shallow.state.metadata.validity.issues.map((issue) => issue.path),
    [
      "components.modifiers[0].id",
      "components.modifiers[0].target",
      "components.modifiers[0].operation",
      "components.choices[0].id",
      "components.choices[0].prompt",
      "components.choices[0].minimum",
      "components.choices[0].maximum",
    ],
  );
  shallow.dispose();
});

test("Trait owns Action validity, preserves incomplete drafts, and accepts repaired data", () => {
  const data = payload();
  data.components.actions = [
    { kind: "action", components: { activation: "passive", outcomes: [] } },
    {
      kind: "action",
      components: { activation: "typo", outcomes: [] },
      privateNotes: "secret",
    },
  ];
  const invalid = TraitDefinition.deserializePayload(data);
  assert.equal(invalid.state.metadata.validity.status, "invalid");
  assert.deepEqual(codes(invalid), ["trait-actions-action-components-invalid"]);
  assert.equal(
    invalid.state.metadata.validity.issues[0].path,
    "components.actions[1].components",
  );
  assert.deepEqual(invalid.serializePayload(), data);
  invalid.dispose();
  delete data.components.actions[1].components;
  const incomplete = TraitDefinition.deserializePayload(data);
  assert.equal(incomplete.state.metadata.validity.status, "unresolved");
  assert.equal(incomplete.state.metadata.validity.issues[0].unresolved, true);
  assert.deepEqual(incomplete.serializePayload(), data);
  incomplete.dispose();
  data.components.actions[1].components = {
    activation: "reaction",
    outcomes: [],
  };
  const repaired = TraitDefinition.deserializePayload(data);
  assert.equal(repaired.state.metadata.validity.status, "valid");
  assert.deepEqual(repaired.serializePayload(), data);
  repaired.dispose();
});

test("Trait revalidates owned Action references and disposes each temporary child", (t) => {
  const data = payload();
  data.components.actions = [
    {
      kind: "action",
      components: {
        activation: "reaction",
        outcomes: [],
        grantedConditions: [{ conditionId: "condition" }],
      },
    },
  ];
  const children = [];
  const contexts = [];
  const deserialize = ActionDefinition.deserializePayload;
  t.mock.method(
    ActionDefinition,
    "deserializePayload",
    function (value, context) {
      contexts.push(context);
      const child = deserialize.call(this, value, context);
      const tracker = { completed: false };
      child.state$.subscribe({
        complete: () => {
          tracker.completed = true;
        },
      });
      children.push(tracker);
      return child;
    },
  );
  const entity = TraitDefinition.deserializePayload(data, {
    sourceId: "parent",
  });
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  entity.validate({ mode: "publication", sourceId: "parent", records: [] });
  assert.equal(entity.state.metadata.validity.status, "invalid");
  assert.deepEqual(codes(entity), [
    "trait-actions-action-codex-granted-conditions",
  ]);
  const records = [
    {
      resourceType: WORLD_CODEX_RESOURCES.conditions,
      sourceId: "condition",
      payload: {},
    },
  ];
  entity.validate({ mode: "publication", sourceId: "parent", records });
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.equal(contexts.at(-1).mode, "publication");
  assert.deepEqual(contexts.at(-1).records, records);
  assert.notEqual(contexts.at(-1).records, records);
  assert.ok(contexts.every((context) => !("sourceId" in context)));
  assert.equal(children.length, 3);
  assert.ok(children.every((child) => child.completed));
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Trait rejects rename with invalid or unresolved Actions without emitting or mutating", async () => {
  for (const action of [
    { kind: "action", components: { activation: "typo", outcomes: [] } },
    { kind: "action" },
  ]) {
    const data = payload();
    data.components.actions = [action];
    const entity = TraitDefinition.deserializePayload(data);
    const before = entity.state;
    const events = [];
    entity.events.renamed.listen((event) => events.push(event));
    const receipt = await entity.command("rename", {
      initiator: "author",
      params: { name: "Changed" },
      context: {},
    });
    assert.equal(receipt.status, "rejected");
    assert.equal(entity.state, before);
    assert.deepEqual(events, []);
    assert.deepEqual(entity.serializePayload(), data);
    entity.dispose();
  }
  const data = payload();
  data.components.actions = [
    { kind: "action", components: { activation: "reaction", outcomes: [] } },
  ];
  const entity = TraitDefinition.deserializePayload(data);
  const receipt = await entity.command("rename", {
    initiator: "author",
    params: { name: "Changed" },
    context: {},
  });
  assert.equal(receipt.status, "committed");
  assert.equal(entity.state.data.identity.name, "Changed");
  entity.dispose();
});

test("Trait owns recursive prerequisite diagnostics using the same grammar as Action", () => {
  for (const predicate of [
    { kind: "visible", observer: false },
    {
      kind: "compare",
      operator: "invalid",
      left: { kind: "constant", value: "3" },
      right: { kind: "literal" },
    },
    {
      kind: "within-distance",
      source: "",
      target: "",
      distance: { unit: "league" },
    },
    { kind: "has-definition", subject: null },
    { kind: "all", predicates: false },
    { kind: "not" },
  ]) {
    const prerequisites = [
      {
        kind: "all",
        predicates: [{ kind: "any", predicates: [{ kind: "not", predicate }] }],
      },
    ];
    const input = { ...payload(), components: { prerequisites } };
    const trait = TraitDefinition.deserializePayload(input);
    const action = ActionDefinition.deserializePayload({
      kind: "action",
      components: { activation: "action", outcomes: [], prerequisites },
    });
    const actionIssues = action.state.metadata.validity.issues.filter((issue) =>
      issue.code.startsWith("action-prerequisite-"),
    );
    assert.ok(actionIssues.length);
    assert.deepEqual(
      trait.state.metadata.validity.issues,
      actionIssues.map((issue) => ({
        ...issue,
        code: issue.code.replace("action-", "trait-"),
      })),
    );
    assert.deepEqual(trait.serializePayload(), input);
    trait.dispose();
    action.dispose();
  }
});

test("Trait prerequisites preserve open references, omitted fields and opaque expressions", () => {
  const input = {
    ...payload(),
    components: {
      prerequisites: [
        {
          kind: "has-definition",
          subject: "",
          definitionId: "unresolved:reference",
        },
        { kind: "is-attuned", subject: "" },
        {
          kind: "compare",
          operator: "eq",
          left: { kind: "literal", value: { private: [false, null] } },
          right: { kind: "future-expression", payload: { secret: true } },
        },
        { kind: "custom", payload: { private: true } },
        { kind: "future-predicate", payload: [1, false] },
      ],
      choices: [
        {
          id: "choice",
          prompt: "Choose",
          minimum: 0,
          maximum: 1,
          private: true,
        },
      ],
    },
  };
  const trait = TraitDefinition.deserializePayload(input);
  assert.deepEqual(trait.state.metadata.validity.issues, []);
  assert.deepEqual(trait.serializePayload(), input);
  trait.dispose();
});

test("Trait owns Choice and Option diagnostics including recursive Option prerequisites", () => {
  const choices = [
    {
      id: "choice",
      prompt: false,
      minimum: "0",
      maximum: 1,
      visibility: "hidden",
      options: [
        {
          id: "option",
          label: "Option",
          prerequisites: [
            {
              kind: "not",
              predicate: { kind: "has-definition", subject: false },
            },
          ],
        },
      ],
    },
  ];
  const trait = TraitDefinition.deserializePayload({
    ...payload(),
    components: { choices },
  });
  const action = ActionDefinition.deserializePayload({
    kind: "action",
    components: { activation: "action", outcomes: [], choices },
  });
  const issues = trait.state.metadata.validity.issues;
  assert.deepEqual(
    issues,
    action.state.metadata.validity.issues.map((issue) => ({
      ...issue,
      code: issue.code.replace("action-", "trait-"),
    })),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "trait-choice-invalid" &&
        issue.path === "components.choices[0].minimum",
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "trait-choice-unresolved" &&
        issue.path === "components.choices[0].options[0].value" &&
        issue.unresolved,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "trait-prerequisite-invalid" &&
        issue.path.endsWith(".predicate.subject"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "trait-prerequisite-unresolved" &&
        issue.path.endsWith(".predicate.definitionId"),
    ),
  );
  trait.dispose();
  action.dispose();
});

test("Trait Choices round-trip every JSON Option value and private/unknown content without inferred selection rules", () => {
  const input = {
    ...payload(),
    components: {
      choices: [
        {
          id: "",
          prompt: "",
          minimum: -1.5,
          maximum: -3,
          optionCatalog: "unknown",
          allowDuplicates: true,
          visibility: "gm",
          private: { retained: true },
          options: [
            null,
            false,
            3,
            "unknown-reference",
            [1, null],
            { secret: true },
          ].map((value) => ({
            id: "duplicate",
            label: "",
            value,
            prerequisites: [{ kind: "custom", secret: true }],
          })),
        },
      ],
      prerequisites: [{ kind: "always" }],
      actions: [],
      grants: [],
      modifiers: [],
      triggers: [],
    },
  };
  const entity = TraitDefinition.deserializePayload(input);
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.deepEqual(entity.serializePayload(), input);
  const restored = TraitDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), input);
  restored.dispose();
  entity.dispose();
});

test("Trait modifiers report required and malformed fields at exact owned paths", () => {
  const entity = TraitDefinition.deserializePayload({
    ...payload(),
    components: {
      modifiers: [
        {},
        {
          id: false,
          target: null,
          operation: "future",
          priority: "1",
          stacking: "future",
          sourceLabel: false,
          value: { kind: "path", fallback: "1" },
          predicate: false,
        },
        {
          id: "m",
          target: "",
          operation: "add",
          value: { kind: "constant", value: "2" },
        },
        { id: "n", target: "", operation: "set", value: { kind: "literal" } },
      ],
    },
  });
  const issues = entity.state.metadata.validity.issues;
  for (const path of [
    "[0].id",
    "[0].target",
    "[0].operation",
    "[1].value.path",
    "[3].value.value",
  ]) {
    assert.ok(
      issues.some(
        (issue) =>
          issue.code === "trait-modifier-unresolved" &&
          issue.unresolved &&
          issue.path === `components.modifiers${path}`,
      ),
      path,
    );
  }
  for (const path of [
    "[1].id",
    "[1].target",
    "[1].operation",
    "[1].priority",
    "[1].stacking",
    "[1].sourceLabel",
    "[1].value.fallback",
    "[1].predicate",
    "[2].value.value",
  ]) {
    assert.ok(
      issues.some(
        (issue) =>
          issue.code === "trait-modifier-invalid" &&
          !issue.unresolved &&
          issue.path === `components.modifiers${path}`,
      ),
      path,
    );
  }
  entity.dispose();
});

test("Trait modifiers preserve every operation, optional omission and imported scalar/private content", () => {
  const operations = [
    "add",
    "subtract",
    "multiply",
    "divide",
    "set",
    "minimum",
    "maximum",
    "grant-advantage",
    "grant-disadvantage",
    "grant-proficiency",
    "grant-expertise",
    "allow",
    "prohibit",
  ];
  const values = [
    { kind: "constant", value: -1.5 },
    ...[null, false, "", 2, [1], { secret: true }].map((value) => ({
      kind: "literal",
      value,
    })),
    { kind: "path", path: "", fallback: -2.5 },
    { kind: "event-value", path: "" },
    { kind: "collection-count", path: "" },
    { kind: "future-expression", secret: { deep: true } },
  ];
  const input = {
    ...payload(),
    components: {
      modifiers: [
        ...operations.map((operation) => ({ id: "", target: "", operation })),
        ...values.map((value, index) => ({
          id: "duplicate",
          target: "actor.health",
          operation: "add",
          value,
          priority: -1.5,
          stacking: [
            "stack",
            "highest",
            "lowest",
            "replace",
            "unique-by-source",
          ][index % 5],
          sourceLabel: "",
          predicate: { kind: "custom", private: true },
          private: { keep: true },
        })),
      ],
      choices: [],
      grants: [],
      actions: [],
    },
  };
  const entity = TraitDefinition.deserializePayload(input);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const restored = TraitDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), input);
  assert.equal(
    Object.hasOwn(restored.serializePayload().components.modifiers[0], "value"),
    false,
  );
  restored.dispose();
  entity.dispose();
});

test("Trait modifier predicates validate exact root and recursive paths", () => {
  const predicates = [
    false,
    { kind: "has-tag", subject: false },
    {
      kind: "all",
      predicates: [
        {
          kind: "not",
          predicate: {
            kind: "compare",
            operator: "bad",
            left: { kind: "constant", value: "2" },
          },
        },
      ],
    },
    { kind: "not" },
  ];
  const entity = TraitDefinition.deserializePayload({
    ...payload(),
    components: {
      modifiers: predicates.map((predicate) => ({
        id: "m",
        target: "",
        operation: "allow",
        predicate,
      })),
    },
  });
  for (const [path, suffix] of [
    ["[0].predicate", "invalid"],
    ["[1].predicate.subject", "invalid"],
    ["[1].predicate.tag", "unresolved"],
    ["[2].predicate.predicates[0].predicate.operator", "invalid"],
    ["[2].predicate.predicates[0].predicate.left.value", "invalid"],
    ["[2].predicate.predicates[0].predicate.right", "unresolved"],
    ["[3].predicate.predicate", "unresolved"],
  ])
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.code === `trait-modifier-${suffix}` &&
          issue.path === `components.modifiers${path}` &&
          Boolean(issue.unresolved) === (suffix === "unresolved"),
      ),
      path,
    );
  entity.dispose();
});

test("Trait modifier predicates roundtrip omission, nested known checks and opaque rules", () => {
  const input = {
    ...payload(),
    components: {
      modifiers: [
        { id: "omitted", target: "", operation: "allow" },
        {
          id: "m",
          target: "",
          operation: "add",
          private: true,
          predicate: {
            kind: "all",
            predicates: [
              {
                kind: "not",
                predicate: {
                  kind: "has-definition",
                  subject: "",
                  definitionId: "unknown",
                },
              },
              {
                kind: "compare",
                operator: "eq",
                left: { kind: "future-expression", secret: [true] },
                right: { kind: "literal", value: { nested: false } },
              },
              { kind: "custom", secret: { preserved: true } },
              { kind: "future-predicate", private: true },
            ],
          },
        },
      ],
    },
  };
  const entity = TraitDefinition.deserializePayload(input);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const restored = TraitDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), input);
  assert.equal(
    Object.hasOwn(
      restored.serializePayload().components.modifiers[0],
      "predicate",
    ),
    false,
  );
  restored.dispose();
  entity.dispose();
});

test("Trait trigger metadata and effects distinguish missing and malformed values", () => {
  const entity = TraitDefinition.deserializePayload({
    ...payload(),
    components: {
      triggers: [
        {},
        {
          event: "bogus",
          customEvent: "missing-namespace",
          timing: "during",
          optional: 1,
          priority: "2",
          effects: false,
        },
        {
          event: "hit",
          effects: [
            {
              kind: "damage",
              target: false,
              amount: {
                terms: [
                  {
                    kind: "dice",
                    count: { kind: "constant", value: "2" },
                    size: "6",
                    sign: 0,
                  },
                ],
              },
            },
            {
              kind: "heal",
              target: "",
              amount: { terms: [] },
              upToMaximum: "yes",
            },
            {
              kind: "move",
              target: "",
              distance: { value: "1", unit: "unknown" },
              forced: 1,
            },
            { kind: "narrative", visibility: "hidden" },
          ],
        },
      ],
    },
  });
  for (const [path, code] of [
    ["[0].event", "trigger-unresolved"],
    ["[0].effects", "trigger-unresolved"],
    ...[
      "event",
      "customEvent",
      "timing",
      "optional",
      "priority",
      "effects",
    ].map((key) => [`[1].${key}`, "trigger-invalid"]),
    ["[2].effects[0].target", "effect-invalid"],
    ["[2].effects[0].damageType", "effect-unresolved"],
    ["[2].effects[0].amount.terms[0].count.value", "effect-invalid"],
    ["[2].effects[0].amount.terms[0].size", "effect-invalid"],
    ["[2].effects[0].amount.terms[0].sign", "effect-invalid"],
    ["[2].effects[1].upToMaximum", "effect-invalid"],
    ["[2].effects[2].distance.value", "effect-invalid"],
    ["[2].effects[2].distance.unit", "effect-invalid"],
    ["[2].effects[2].forced", "effect-invalid"],
    ["[2].effects[3].text", "effect-unresolved"],
    ["[2].effects[3].visibility", "effect-invalid"],
  ])
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.path === `components.triggers${path}` &&
          issue.code === `trait-${code}`,
      ),
      path,
    );
  entity.dispose();
});

test("Trait triggers preserve optional, advanced, private and sibling rules without runtime semantics", () => {
  const input = {
    ...payload(),
    components: {
      grants: ["unknown"],
      triggers: [
        { event: "custom", effects: [] },
        {
          event: "hit",
          customEvent: ":",
          timing: "replace",
          priority: -0.5,
          optional: false,
          private: true,
          predicate: { kind: "custom", private: true },
          limit: { kind: "uses", maximum: { kind: "future", private: true } },
          effects: [
            {
              kind: "damage",
              target: "",
              damageType: "",
              amount: {
                terms: [
                  {
                    kind: "dice",
                    count: { kind: "future-expression", private: true },
                    size: -1.5,
                  },
                ],
              },
            },
            { kind: "heal", target: "self", amount: { terms: [] } },
            {
              kind: "move",
              target: "self",
              distance: { value: -1.5, unit: "hex" },
            },
            { kind: "narrative", text: "", visibility: "gm", private: true },
            { kind: "future-effect", private: { preserve: [null, false] } },
          ],
        },
      ],
    },
  };
  const entity = TraitDefinition.deserializePayload(input);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const restored = TraitDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), input);
  restored.dispose();
  entity.dispose();
});

test("Trait trigger predicates validate exact root and recursive paths", () => {
  const predicates = [
    false,
    { kind: "has-tag", subject: false },
    {
      kind: "all",
      predicates: [
        {
          kind: "not",
          predicate: {
            kind: "compare",
            operator: "bad",
            left: { kind: "constant", value: "2" },
          },
        },
      ],
    },
    { kind: "not" },
  ];
  const entity = TraitDefinition.deserializePayload({
    ...payload(),
    components: {
      triggers: predicates.map((predicate) => ({
        event: "hit",
        effects: [],
        predicate,
      })),
    },
  });
  for (const [path, suffix] of [
    ["[0].predicate", "invalid"],
    ["[1].predicate.subject", "invalid"],
    ["[1].predicate.tag", "unresolved"],
    ["[2].predicate.predicates[0].predicate.operator", "invalid"],
    ["[2].predicate.predicates[0].predicate.left.value", "invalid"],
    ["[2].predicate.predicates[0].predicate.right", "unresolved"],
    ["[3].predicate.predicate", "unresolved"],
  ])
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.code === `trait-trigger-${suffix}` &&
          issue.path === `components.triggers${path}` &&
          Boolean(issue.unresolved) === (suffix === "unresolved"),
      ),
      path,
    );
  entity.dispose();
});

test("Trait trigger predicates roundtrip omission, nested known checks and opaque rules", () => {
  const input = {
    ...payload(),
    components: {
      triggers: [
        { event: "hit", effects: [] },
        {
          event: "hit",
          effects: [],
          limit: { kind: "uses", maximum: { kind: "future" } },
          private: true,
          predicate: {
            kind: "all",
            predicates: [
              {
                kind: "not",
                predicate: {
                  kind: "has-definition",
                  subject: "",
                  definitionId: "unknown",
                },
              },
              {
                kind: "compare",
                operator: "eq",
                left: { kind: "future-expression", secret: [true] },
                right: { kind: "literal", value: { nested: false } },
              },
              { kind: "custom", secret: { preserved: true } },
              { kind: "future-predicate", private: true },
            ],
          },
        },
      ],
    },
  };
  const entity = TraitDefinition.deserializePayload(input);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const restored = TraitDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), input);
  assert.equal(
    Object.hasOwn(
      restored.serializePayload().components.triggers[0],
      "predicate",
    ),
    false,
  );
  restored.dispose();
  entity.dispose();
});

test("Trait usage limits validate numeric-only maxima and exact repairable paths", () => {
  const cases = [
    [false, "", "invalid"],
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
    const entity = TraitDefinition.deserializePayload({
      ...payload(),
      components: {
        triggers: [{ event: "hit", effects: [], limit }],
      },
    });
    assert.ok(
      entity.state.metadata.validity.issues.some(
        (issue) =>
          issue.path === `components.triggers[0].limit${suffix}` &&
          issue.code === `trait-trigger-${status}` &&
          Boolean(issue.unresolved) === (status === "unresolved"),
      ),
      JSON.stringify(limit),
    );
    entity.dispose();
  }
});

test("Trait usage limits preserve omission, all variants, numeric freedom and opaque internals", () => {
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
  const input = {
    ...payload(),
    components: {
      private: true,
      triggers: limits.map((limit) => ({
        event: "hit",
        effects: [],
        predicate: { kind: "always" },
        private: true,
        ...(limit === undefined ? {} : { limit }),
      })),
    },
  };
  const entity = TraitDefinition.deserializePayload(input);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const restored = TraitDefinition.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), input);
  assert.equal(
    Object.hasOwn(restored.serializePayload().components.triggers[0], "limit"),
    false,
  );
  restored.dispose();
  entity.dispose();
});
