import assert from "node:assert/strict";
import test from "node:test";
import {
  FeatDefinition,
  TraitDefinition,
  ActionDefinition,
} from "../dist/index.js";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
const payload = () => ({
  kind: "feat",
  identity: { id: "smith", name: "Smith" },
  components: {
    category: "homebrew:custom",
    traits: [],
    repeatable: false,
  },
  extensions: { "test:private": { secret: true } },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
test("Feat owns detached raw and envelope codecs and rejects invalid JSON", () => {
  const input = payload();
  const entity = FeatDefinition.deserializePayload(input, {});
  input.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  const restored = FeatDefinition.deserialize(entity.serialize(), {});
  assert.deepEqual(restored.serializePayload(), payload());
  restored.dispose();
  assert.throws(
    () => FeatDefinition.deserializePayload(entity.serialize()),
    /Feat kind/,
  );
  assert.throws(
    () =>
      FeatDefinition.deserialize({
        ...entity.serialize(),
        schemaVersion: 2,
      }),
    /schema version/,
  );
  const cyclic = { kind: "feat" };
  cyclic.self = cyclic;
  for (const input of [
    cyclic,
    { kind: "feat", invalid: NaN },
    { kind: "feat", invalid: new Date() },
  ])
    assert.throws(() => FeatDefinition.deserializePayload(input), /JSON/);
  const output = entity.serializePayload();
  output.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Feat exposes missing fields as unresolved and malformed supplied fields as invalid", () => {
  const incomplete = FeatDefinition.deserializePayload({
    kind: "feat",
  });
  assert.ok(codes(incomplete).includes("feat-components-unresolved"));
  incomplete.dispose();
  for (const change of [
    { category: 1 },
    { repeatable: "yes" },
    { traits: null },
    { traits: [null] },
    { traits: [{ kind: "action" }] },
    { prerequisites: {} },
    { prerequisites: [{}] },
    { choices: "legacy" },
    { choices: [null] },
  ]) {
    const entity = FeatDefinition.deserializePayload({
      ...payload(),
      components: { ...payload().components, ...change },
    });
    assert.ok(
      codes(entity).includes("feat-components-invalid"),
      JSON.stringify(change),
    );
    entity.dispose();
  }
  const wrongContainer = FeatDefinition.deserializePayload({
    kind: "feat",
    components: [],
  });
  assert.ok(codes(wrongContainer).includes("feat-components-invalid"));
  wrongContainer.dispose();
  for (const field of ["traits"]) {
    const data = payload();
    delete data.components[field];
    const entity = FeatDefinition.deserializePayload(data);
    assert.ok(codes(entity).includes("feat-components-unresolved"), field);
    entity.dispose();
  }
});
test("Feat preserves open categories, empty traits and rich nested structure", () => {
  const data = payload();
  Object.assign(data.components, {
    traits: [
      {
        kind: "trait",
        identity: { id: "trait", name: "Homebrew trait" },
        components: {
          modifiers: [
            { kind: "custom", key: "test:rule", payload: { secret: true } },
          ],
        },
      },
    ],
    prerequisites: [{ kind: "custom", rule: "predicate" }],
    choices: [
      { id: "choice", prompt: "Choose", minimum: 0, maximum: 1, options: [] },
    ],
  });
  const entity = FeatDefinition.deserializePayload(data);
  assert.deepEqual(
    codes(entity),
    Array(3).fill("feat-traits-trait-modifier-unresolved"),
  );
  assert.ok(
    entity.state.metadata.validity.issues.every((issue) => issue.unresolved),
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});
test("Feat granted Conditions require captured references and recover when revalidated", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  const entity = FeatDefinition.deserializePayload(data, {});
  assert.ok(codes(entity).includes("feat-references-unresolved"));
  entity.validate({ records: [] });
  assert.ok(codes(entity).includes("feat-codex-granted-conditions"));
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
    const invalid = FeatDefinition.deserializePayload(data, {
      records: [],
    });
    assert.ok(codes(invalid).includes("feat-codex-granted-conditions"));
    invalid.dispose();
  }
});
test("Feat rename emits committed nested identity and suppresses no-ops", async () => {
  const entity = FeatDefinition.deserializePayload(payload(), {});
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
    /Feat name/,
  );
  entity.dispose();
});
test("Feat codecs enforce bounded plain JSON while permitting shared references", () => {
  const shared = { value: 1 };
  const valid = FeatDefinition.deserializePayload({
    ...payload(),
    extra: [shared, shared],
  });
  valid.dispose();
  let deep = {};
  for (let i = 0; i < 66; i++) deep = { nested: deep };
  for (const invalid of [undefined, Infinity, () => true, deep]) {
    assert.throws(
      () =>
        FeatDefinition.deserializePayload({
          ...payload(),
          extra: invalid,
        }),
      /JSON/,
    );
  }
});

test("Feat exposes incomplete owned Traits and Choices as repairable drafts", () => {
  const data = payload();
  data.components.traits = [{ kind: "trait" }];
  data.components.choices = [{}];
  const entity = FeatDefinition.deserializePayload(data);
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  assert.ok(codes(entity).includes("feat-traits-trait-components-unresolved"));
  assert.ok(codes(entity).includes("feat-choice-unresolved"));
  assert.equal(
    entity.state.metadata.validity.issues[0].path,
    "components.traits[0].components",
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Feat recursively inherits Trait and Action validity with authored index paths", () => {
  const data = payload();
  data.components.traits = [
    { kind: "trait", components: {} },
    {
      kind: "trait",
      components: {
        actions: [
          {
            kind: "action",
            components: { activation: "typo", outcomes: [] },
            privateNotes: { secret: true },
          },
        ],
      },
    },
  ];
  const invalid = FeatDefinition.deserializePayload(data);
  assert.equal(invalid.state.metadata.validity.status, "invalid");
  assert.deepEqual(codes(invalid), [
    "feat-traits-trait-actions-action-components-invalid",
  ]);
  assert.equal(
    invalid.state.metadata.validity.issues[0].path,
    "components.traits[1].components.actions[0].components",
  );
  assert.deepEqual(invalid.serializePayload(), data);
  invalid.dispose();
  delete data.components.traits[1].components.actions[0].components;
  const incomplete = FeatDefinition.deserializePayload(data);
  assert.equal(incomplete.state.metadata.validity.status, "unresolved");
  assert.equal(incomplete.state.metadata.validity.issues[0].unresolved, true);
  assert.deepEqual(incomplete.serializePayload(), data);
  incomplete.dispose();
  data.components.traits[1].components.actions[0].components = {
    activation: "reaction",
    outcomes: [],
  };
  const repaired = FeatDefinition.deserializePayload(data);
  assert.equal(repaired.state.metadata.validity.status, "valid");
  assert.deepEqual(repaired.serializePayload(), data);
  repaired.dispose();
});

test("Feat forwards scoped context through its ownership chain and disposes temporary entities", (t) => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        actions: [
          {
            kind: "action",
            components: {
              activation: "reaction",
              outcomes: [],
              grantedConditions: [{ conditionId: "condition" }],
            },
          },
        ],
      },
    },
  ];
  const children = [];
  const contexts = [];
  for (const Definition of [TraitDefinition, ActionDefinition]) {
    const deserialize = Definition.deserializePayload;
    t.mock.method(Definition, "deserializePayload", function (value, context) {
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
    });
  }
  const entity = FeatDefinition.deserializePayload(data, {
    sourceId: "parent",
  });
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  entity.validate({ mode: "publication", sourceId: "parent", records: [] });
  assert.equal(entity.state.metadata.validity.status, "invalid");
  assert.deepEqual(codes(entity), [
    "feat-traits-trait-actions-action-codex-granted-conditions",
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
  for (const context of contexts.slice(-2)) {
    assert.equal(context.mode, "publication");
    assert.deepEqual(context.records, records);
    assert.notEqual(context.records, records);
  }
  assert.ok(contexts.every((context) => !("sourceId" in context)));
  assert.equal(children.length, 6);
  assert.ok(children.every((child) => child.completed));
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});

test("Feat rejects rename with invalid or unresolved owned state without emitting or mutating", async () => {
  for (const trait of [
    {
      kind: "trait",
      components: {
        actions: [
          { kind: "action", components: { activation: "typo", outcomes: [] } },
        ],
      },
    },
    { kind: "trait" },
  ]) {
    const data = payload();
    data.components.traits = [trait];
    const entity = FeatDefinition.deserializePayload(data);
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
  const entity = FeatDefinition.deserializePayload({
    ...payload(),
    components: { traits: [{ kind: "trait", components: {} }] },
  });
  const receipt = await entity.command("rename", {
    initiator: "author",
    params: { name: "Changed" },
    context: {},
  });
  assert.equal(receipt.status, "committed");
  assert.equal(entity.state.data.identity.name, "Changed");
  entity.dispose();
});

test("Feat propagates Trait-owned invalid and unresolved prerequisite metadata", () => {
  const data = payload();
  data.components.traits = [
    {
      kind: "trait",
      components: {
        prerequisites: [
          {
            kind: "all",
            predicates: [
              { kind: "has-tag", subject: false },
              {
                kind: "not",
                predicate: { kind: "has-definition", subject: "" },
              },
            ],
          },
        ],
      },
    },
  ];
  const entity = FeatDefinition.deserializePayload(data);
  const issues = entity.state.metadata.validity.issues;
  const path = "components.traits[0].components.prerequisites[0].predicates";
  assert.ok(
    issues.some(
      (issue) =>
        issue.code.endsWith("trait-prerequisite-invalid") &&
        issue.path === `${path}[0].subject` &&
        !issue.unresolved,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code.endsWith("trait-prerequisite-unresolved") &&
        issue.path === `${path}[1].predicate.definitionId` &&
        issue.unresolved,
    ),
  );
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});
