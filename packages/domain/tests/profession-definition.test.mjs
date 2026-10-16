import assert from "node:assert/strict";
import test from "node:test";
import { ProfessionDefinition } from "../dist/index.js";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
const rank = "aow:novice";
const model = {
  releaseIds: ["release"],
  elements: [
    {
      id: "concept",
      key: "aow:profession",
      kind: "concept",
      semanticRole: "aow:profession",
    },
    {
      id: "rank",
      key: rank,
      kind: "vocabulary",
      semanticRole: "aow:profession-rank",
    },
  ],
};
const payload = () => ({
  kind: "profession",
  identity: { id: "smith", name: "Smith" },
  conformance: { conceptId: "concept", modelSchemaReleaseIds: ["release"] },
  components: {
    expertiseOrder: [rank],
    expertiseLevels: [{ tier: rank, rank: 0, benefits: {} }],
    acquisition: [{ kind: "character-creation", startingExpertise: rank }],
    actions: [],
  },
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
test("Profession owns detached raw and envelope codecs and rejects invalid JSON", () => {
  const input = payload();
  const entity = ProfessionDefinition.deserializePayload(input, { model });
  input.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(
    ProfessionDefinition.deserialize(entity.serialize(), {
      model,
    }).serializePayload(),
    payload(),
  );
  assert.throws(
    () => ProfessionDefinition.deserializePayload(entity.serialize()),
    /Profession kind/,
  );
  assert.throws(
    () =>
      ProfessionDefinition.deserialize({
        ...entity.serialize(),
        schemaVersion: 2,
      }),
    /schema version/,
  );
  const cyclic = { kind: "profession" };
  cyclic.self = cyclic;
  for (const input of [
    cyclic,
    { kind: "profession", invalid: NaN },
    { kind: "profession", invalid: new Date() },
  ])
    assert.throws(() => ProfessionDefinition.deserializePayload(input), /JSON/);
  const output = entity.serializePayload();
  output.extensions["test:private"].secret = false;
  assert.equal(entity.state.data.extensions["test:private"].secret, true);
  assert.deepEqual(codes(entity), []);
  entity.dispose();
});
test("Profession canonical policy tolerates sparse legacy state and owns cross-tier grant identity", () => {
  for (const components of [
    {},
    { expertiseLevels: [] },
    { expertiseLevels: [{ benefits: {} }] },
  ]) {
    const entity = ProfessionDefinition.deserializePayload(
      { ...payload(), components },
      { model },
    );
    assert.equal(
      codes(entity).includes("profession-canonical-components"),
      false,
    );
    entity.dispose();
  }
  const data = payload();
  data.components.expertiseLevels = [
    { tier: rank, benefits: { modifierGrants: [grant()] } },
    { tier: rank, benefits: { modifierGrants: [grant()] } },
  ];
  const entity = ProfessionDefinition.deserializePayload(data, { model });
  assert.equal(
    entity.state.metadata.validity.issues[0].message,
    "Profession modifier grant names must be unique across expertise tiers.",
  );
  entity.dispose();
});
test("Profession resolves every authored rank occurrence against exact Model releases", () => {
  const changes = [
    (d) => delete d.conformance,
    (d) => (d.conformance.modelSchemaReleaseIds = ["other"]),
    (d) => (d.conformance.conceptId = "missing"),
    (d) => (d.components.expertiseOrder = []),
    (d) => (d.components.expertiseLevels[0].tier = "missing"),
    (d) => (d.components.acquisition[0].startingExpertise = "missing"),
    (d) => (d.components.actions = [{ unlocksAt: "missing" }]),
    (d) =>
      (d.components.actions = [
        { unlocksAt: rank, improvements: [{ atExpertise: "missing" }] },
      ]),
  ];
  for (const change of changes) {
    const data = payload();
    change(data);
    const entity = ProfessionDefinition.deserializePayload(data, { model });
    assert.ok(codes(entity).includes("profession-model-invalid"));
    entity.dispose();
  }
  const entity = ProfessionDefinition.deserializePayload(payload());
  assert.ok(codes(entity).includes("profession-model-unresolved"));
  entity.dispose();
  const wrongRole = ProfessionDefinition.deserializePayload(payload(), {
    model: {
      ...model,
      elements: [
        { ...model.elements[0], semanticRole: "aow:skill" },
        model.elements[1],
      ],
    },
  });
  assert.ok(codes(wrongRole).includes("profession-model-invalid"));
  wrongRole.dispose();
});
test("Profession granted Conditions require captured references and recover when revalidated", () => {
  const data = payload();
  data.components.grantedConditions = [{ conditionId: "condition" }];
  const entity = ProfessionDefinition.deserializePayload(data, { model });
  assert.ok(codes(entity).includes("profession-references-unresolved"));
  entity.validate({ model, records: [] });
  assert.ok(codes(entity).includes("profession-codex-granted-conditions"));
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
    const invalid = ProfessionDefinition.deserializePayload(data, {
      model,
      records: [],
    });
    assert.ok(codes(invalid).includes("profession-codex-granted-conditions"));
    invalid.dispose();
  }
});
test("Profession rename emits committed nested identity and suppresses no-ops", async () => {
  const entity = ProfessionDefinition.deserializePayload(payload(), { model });
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
    /Profession name/,
  );
  entity.dispose();
});
test("Profession authoring helpers preserve later tiers, grants, acquisition rules and extensions", () => {
  const existing = {
    ...payload().components,
    expertiseOrder: [rank, "aow:master"],
    expertiseLevels: [
      { tier: rank, rank: 0, benefits: { traitIds: ["trait"] } },
      { tier: "aow:master", rank: 1, benefits: { modifierGrants: [grant()] } },
    ],
    acquisition: [{ kind: "during-play", startingExpertise: rank }],
    extra: { private: true },
  };
  const result = ProfessionDefinition.authorComponents(
    existing,
    "aow:apprentice",
  );
  assert.equal(result.expertiseLevels[0].tier, "aow:apprentice");
  assert.deepEqual(result.expertiseLevels[1], existing.expertiseLevels[1]);
  assert.equal(result.acquisition[0].kind, "character-creation");
  assert.deepEqual(result.acquisition[1], existing.acquisition[0]);
  const edited = ProfessionDefinition.withLevelModifierGrants(
    result.expertiseLevels,
    0,
    [grant()],
  );
  assert.deepEqual(edited[0].benefits.traitIds, ["trait"]);
  assert.equal(edited[0].benefits.modifierGrants.length, 1);
  assert.deepEqual(edited[1], existing.expertiseLevels[1]);
  edited[1].benefits.modifierGrants[0].label = "Changed";
  result.extra.private = false;
  assert.equal(
    existing.expertiseLevels[1].benefits.modifierGrants[0].label,
    "Bonus",
  );
  assert.equal(existing.extra.private, true);
  assert.equal(
    ProfessionDefinition.authorComponents({}).expertiseOrder[0],
    "aow:profession-rank-novice",
  );
});

test("Profession Effect associations preserve authored data and validate captured membership", () => {
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
  const entity = ProfessionDefinition.deserializePayload(input, {
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
    const invalid = ProfessionDefinition.deserializePayload(
      { ...input, components: { ...input.components, grantedEffects } },
      { records, model },
    );
    assert(codes(invalid).includes("profession-codex-granted-effects"));
    invalid.dispose();
  }
  const unresolved = ProfessionDefinition.deserializePayload(input, { model });
  assert(codes(unresolved).includes("profession-references-unresolved"));
  unresolved.dispose();
});
