import assert from "node:assert/strict";
import test from "node:test";
import { BackgroundDefinition } from "../dist/index.js";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
const model = {
  releaseIds: ["release"],
  elements: [
    {
      id: "concept",
      key: "aow:background",
      kind: "concept",
      semanticRole: "aow:background",
    },
  ],
};
const payload = () => ({
  kind: "background",
  identity: { id: "smith", name: "Smith" },
  conformance: { conceptId: "concept", modelSchemaReleaseIds: ["release"] },
  components: {},
  extensions: { "test:private": { secret: true } },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
const grant = () => ({
  id: "bonus",
  label: "Bonus",
  kind: "rolled-flat",
  stacking: "add",
  target: { kind: "health-maximum" },
  dice: [{ count: 1, sides: 6 }],
});
test("Background owns detached raw and envelope codecs and rejects invalid JSON", () => {
  const input = payload();
  const entity = BackgroundDefinition.deserializePayload(input, { model });
  input.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(
    BackgroundDefinition.deserialize(entity.serialize(), {
      model,
    }).serializePayload(),
    payload(),
  );
  assert.throws(
    () => BackgroundDefinition.deserializePayload(entity.serialize()),
    /Background kind/,
  );
  assert.throws(
    () =>
      BackgroundDefinition.deserialize({
        ...entity.serialize(),
        schemaVersion: 2,
      }),
    /schema version/,
  );
  const cyclic = { kind: "background" };
  cyclic.self = cyclic;
  for (const input of [
    cyclic,
    { kind: "background", invalid: NaN },
    { kind: "background", invalid: new Date() },
  ])
    assert.throws(() => BackgroundDefinition.deserializePayload(input), /JSON/);
  const output = entity.serializePayload();
  output.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Background retains sparse legacy grants and owns their collection validation", () => {
  for (const components of [
    {},
    { modifierGrants: [] },
    { modifierGrants: [grant()] },
  ]) {
    const entity = BackgroundDefinition.deserializePayload(
      { ...payload(), components },
      { model },
    );
    assert.deepEqual(codes(entity), []);
    entity.dispose();
  }
  for (const grants of [
    null,
    {},
    [grant(), grant()],
    [{ ...grant(), kind: "bad" }],
    Array.from({ length: 129 }, (_, id) => ({ ...grant(), id: `grant-${id}` })),
  ]) {
    const entity = BackgroundDefinition.deserializePayload(
      { ...payload(), components: { modifierGrants: grants } },
      { model },
    );
    assert.ok(codes(entity).includes("background-canonical-components"));
    entity.dispose();
  }
});
test("Background requires exact Model releases and its semantic concept", () => {
  for (const change of [
    (d) => delete d.conformance,
    (d) => (d.conformance.modelSchemaReleaseIds = ["other"]),
    (d) => (d.conformance.conceptId = "missing"),
  ]) {
    const data = payload();
    change(data);
    const entity = BackgroundDefinition.deserializePayload(data, { model });
    assert.ok(codes(entity).includes("background-model-invalid"));
    entity.dispose();
  }
  const unresolved = BackgroundDefinition.deserializePayload(payload());
  assert.ok(codes(unresolved).includes("background-model-unresolved"));
  unresolved.dispose();
  const wrongRole = BackgroundDefinition.deserializePayload(payload(), {
    model: {
      ...model,
      elements: [{ ...model.elements[0], semanticRole: "aow:skill" }],
    },
  });
  assert.ok(codes(wrongRole).includes("background-model-invalid"));
  wrongRole.dispose();
});
test("Background granted Conditions require captured references and recover when revalidated", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  const entity = BackgroundDefinition.deserializePayload(data, { model });
  assert.ok(codes(entity).includes("background-references-unresolved"));
  entity.validate({ model, records: [] });
  assert.ok(codes(entity).includes("background-codex-granted-conditions"));
  entity.validate({
    model,
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
    const invalid = BackgroundDefinition.deserializePayload(data, {
      model,
      records: [],
    });
    assert.ok(codes(invalid).includes("background-codex-granted-conditions"));
    invalid.dispose();
  }
});
test("Background rename emits committed nested identity and suppresses no-ops", async () => {
  const entity = BackgroundDefinition.deserializePayload(payload(), { model });
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
    /Background name/,
  );
  entity.dispose();
});
test("Background authoring helpers preserve sparse data and detach unchanged benefits", () => {
  const existing = {
    modifierGrants: [grant()],
    featureIds: ["feature"],
    choices: [{ name: "Choose" }],
    extra: { private: true },
  };
  const copy = BackgroundDefinition.authorComponents(existing);
  assert.deepEqual(copy, existing);
  assert.deepEqual(BackgroundDefinition.authorComponents({}), {});
  const grants = [{ ...grant(), id: "second" }];
  const edited = BackgroundDefinition.withModifierGrants(existing, grants);
  assert.deepEqual(edited.featureIds, ["feature"]);
  assert.deepEqual(edited.choices, existing.choices);
  assert.deepEqual(edited.modifierGrants, grants);
  edited.extra.private = false;
  edited.modifierGrants[0].label = "Changed";
  copy.choices[0].name = "Changed";
  assert.equal(existing.extra.private, true);
  assert.equal(existing.choices[0].name, "Choose");
  assert.equal(grants[0].label, "Bonus");
});

test("Background Effect associations preserve authored data and validate captured membership", () => {
  const input = {
    ...payload(),
    components: {
      ...payload().components,
      grantedEffects: [{ effectId: "blessing", privateNote: "retained" }],
    },
  };
  const records = [
    {
      resourceType: "world-effects",
      sourceId: "blessing",
      payload: { id: "blessing" },
    },
  ];
  const entity = BackgroundDefinition.deserializePayload(input, {
    records,
    model,
  });
  assert.equal(
    codes(entity).some((code) => code.includes("granted-effects")),
    false,
  );
  assert.deepEqual(entity.serializePayload(), input);
  entity.dispose();
  for (const grantedEffects of [
    null,
    "blessing",
    [{ effectId: "missing" }],
    [{ effectId: "blessing" }, { effectId: "blessing" }],
  ]) {
    const invalid = BackgroundDefinition.deserializePayload(
      { ...input, components: { ...input.components, grantedEffects } },
      { records, model },
    );
    assert(codes(invalid).includes("background-codex-granted-effects"));
    invalid.dispose();
  }
  const unresolved = BackgroundDefinition.deserializePayload(input, { model });
  assert(codes(unresolved).includes("background-references-unresolved"));
  unresolved.dispose();
});
