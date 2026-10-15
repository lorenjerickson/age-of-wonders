import assert from "node:assert/strict";
import test from "node:test";
import { DisciplineDefinition } from "../dist/index.js";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
const payload = () => ({
  kind: "discipline",
  identity: { id: "smith", name: "Smith" },
  components: {
    band: -0.5,
    functionTags: [],
    operatingBasis: "homebrew:quantum",
    understanding: "homebrew:speculative",
    observedPhenomenon: "",
    activationTime: [],
    range: "self",
    inputs: [],
    duration: { kind: "instantaneous" },
    outcomes: [],
  },
  extensions: { "test:private": { secret: true } },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
test("Discipline owns detached raw and envelope codecs and rejects invalid JSON", () => {
  const input = payload();
  const entity = DisciplineDefinition.deserializePayload(input, {});
  input.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  const restored = DisciplineDefinition.deserialize(entity.serialize(), {});
  assert.deepEqual(restored.serializePayload(), payload());
  restored.dispose();
  assert.throws(
    () => DisciplineDefinition.deserializePayload(entity.serialize()),
    /Discipline kind/,
  );
  assert.throws(
    () =>
      DisciplineDefinition.deserialize({
        ...entity.serialize(),
        schemaVersion: 2,
      }),
    /schema version/,
  );
  const cyclic = { kind: "discipline" };
  cyclic.self = cyclic;
  for (const input of [
    cyclic,
    { kind: "discipline", invalid: NaN },
    { kind: "discipline", invalid: new Date() },
  ])
    assert.throws(() => DisciplineDefinition.deserializePayload(input), /JSON/);
  const output = entity.serializePayload();
  output.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Discipline exposes missing fields as unresolved and malformed supplied fields as invalid", () => {
  const incomplete = DisciplineDefinition.deserializePayload({
    kind: "discipline",
  });
  assert.ok(codes(incomplete).includes("discipline-components-unresolved"));
  incomplete.dispose();
  for (const change of [
    { band: "1" },
    { functionTags: [1] },
    { operatingBasis: [] },
    { understanding: 1 },
    { observedPhenomenon: false },
    { activationTime: {} },
    { range: "nearby" },
    { range: { value: 2, unit: "yard" } },
    { inputs: "legacy" },
    { duration: { kind: "measured", amount: 2, unit: "second" } },
    { outcomes: [null] },
    { scaling: [{ mode: "unknown" }] },
    { scaling: [{ mode: "custom", addDamage: 1 }] },
    { scaling: [{ mode: "custom", addTargets: 1 }] },
    { trainingProgramIds: [1] },
    { extendedProcedure: "yes" },
    { safetyNotes: [false] },
  ]) {
    const entity = DisciplineDefinition.deserializePayload({
      ...payload(),
      components: { ...payload().components, ...change },
    });
    assert.ok(
      codes(entity).includes("discipline-components-invalid"),
      JSON.stringify(change),
    );
    entity.dispose();
  }
  const wrongContainer = DisciplineDefinition.deserializePayload({
    kind: "discipline",
    components: [],
  });
  assert.ok(codes(wrongContainer).includes("discipline-components-invalid"));
  wrongContainer.dispose();
  for (const field of Object.keys(payload().components)) {
    const data = payload();
    delete data.components[field];
    const entity = DisciplineDefinition.deserializePayload(data);
    assert.ok(
      codes(entity).includes("discipline-components-unresolved"),
      field,
    );
    entity.dispose();
  }
});
test("Discipline preserves open vocabularies, fractional bands, empty lists and rich nested structure", () => {
  const data = payload();
  Object.assign(data.components, {
    activationTime: [{ kind: "economy", activation: "reaction" }],
    range: { value: -0.5, unit: "meter" },
    duration: { kind: "measured", amount: -0.25, unit: "round" },
    inputs: [
      { kind: "vocal-command" },
      { kind: "acoustic-signal" },
      { kind: "manual-operation" },
      { kind: "gesture-control" },
      { kind: "body-sequence" },
      { kind: "custom", description: "" },
      {
        kind: "device",
        description: "Tool",
        costInGp: -1,
        consumed: false,
        itemDefinitionId: "item",
      },
    ],
    scaling: [
      {
        mode: "custom",
        baseBand: -0.1,
        intervals: [-1.5],
        addTargets: { kind: "constant", value: 2 },
      },
    ],
    outcomes: [
      {
        id: "outcome",
        effects: [
          { kind: "custom", rule: "test:effect", payload: { private: true } },
        ],
      },
    ],
    prerequisites: [{ kind: "custom", rule: "predicate" }],
    targets: [{ kind: "self" }],
  });
  const entity = DisciplineDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
});
test("Discipline granted Conditions require captured references and recover when revalidated", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  const entity = DisciplineDefinition.deserializePayload(data, {});
  assert.ok(codes(entity).includes("discipline-references-unresolved"));
  entity.validate({ records: [] });
  assert.ok(codes(entity).includes("discipline-codex-granted-conditions"));
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
    const invalid = DisciplineDefinition.deserializePayload(data, {
      records: [],
    });
    assert.ok(codes(invalid).includes("discipline-codex-granted-conditions"));
    invalid.dispose();
  }
});
test("Discipline rename emits committed nested identity and suppresses no-ops", async () => {
  const entity = DisciplineDefinition.deserializePayload(payload(), {});
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
    /Discipline name/,
  );
  entity.dispose();
});
test("Discipline codecs enforce bounded plain JSON while permitting shared references", () => {
  const shared = { value: 1 };
  const valid = DisciplineDefinition.deserializePayload({
    ...payload(),
    extra: [shared, shared],
  });
  valid.dispose();
  let deep = {};
  for (let i = 0; i < 66; i++) deep = { nested: deep };
  for (const invalid of [undefined, Infinity, () => true, deep]) {
    assert.throws(
      () =>
        DisciplineDefinition.deserializePayload({
          ...payload(),
          extra: invalid,
        }),
      /JSON/,
    );
  }
});

test("Discipline retains historical activation captures without claiming nested rule validation", () => {
  const data = payload();
  data.components.activationTime = [{ kind: "reaction" }];
  const entity = DisciplineDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(
    entity.serializePayload().components.activationTime,
    data.components.activationTime,
  );
  entity.dispose();
});

test("Discipline outcomes and scaling effects use OutcomeDefinition containers", () => {
  const data = payload();
  const outcome = {
    id: "hit",
    when: { kind: "always" },
    effects: [{ kind: "narrative", text: "Hit" }],
  };
  data.components.outcomes = [outcome];
  data.components.scaling = [{ mode: "custom", additionalEffects: [outcome] }];
  const entity = DisciplineDefinition.deserializePayload(data);
  assert.deepEqual(codes(entity), []);
  assert.deepEqual(entity.serializePayload(), data);
  entity.dispose();
  for (const invalid of [
    { id: "hit", effects: "invalid" },
    { id: "hit", effects: [null] },
  ]) {
    for (const change of [
      { outcomes: [invalid] },
      { scaling: [{ mode: "custom", additionalEffects: [invalid] }] },
    ]) {
      const rejected = DisciplineDefinition.deserializePayload({
        ...payload(),
        components: { ...payload().components, ...change },
      });
      assert.ok(codes(rejected).includes("discipline-components-invalid"));
      rejected.dispose();
    }
  }
});
