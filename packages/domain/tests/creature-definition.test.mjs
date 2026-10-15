import assert from "node:assert/strict";
import test from "node:test";
import { CreatureDefinition } from "../dist/index.js";

const payload = () =>
  CreatureDefinition.authorPayload(
    "creature",
    {
      name: " Raven ",
      attributes: { "world:agility": 3 },
      equipmentSlots: [],
      instanceEmbodimentPolicy: {
        strategy: "one-per-instance",
        maximumPerCampaignInstance: 1,
      },
    },
    { conceptId: "creature", modelSchemaReleaseIds: ["model-release"] },
  );
const context = () => ({
  sourceId: "creature",
  mode: "publication",
  records: [],
  definitionIds: ["creature"],
  model: model(),
});

test("Creature Definition round trips private descriptions, extension payloads, and optional legacy fields", () => {
  const data = payload();
  data.identity.description = "Private source description";
  data.extensions = {
    "world:custom": { nested: ["retained"] },
    "aow:legacy-creature": { payload: { old: true } },
  };
  data.components.futureField = { opaque: "retained" };
  const entity = CreatureDefinition.deserialize(data, context());
  assert.equal(entity.state.metadata.validity.status, "valid");
  const decoded = CreatureDefinition.deserialize(entity.serialize(), context());
  assert.deepEqual(decoded.serializePayload(), data);
  data.extensions["world:custom"].nested.push("outside mutation");
  assert.deepEqual(decoded.state.data.extensions["world:custom"].nested, [
    "retained",
  ]);
});

test("Creature draft scalar problems remain visible, and only unchanged fields are grandfathered", () => {
  const baseline = payload();
  baseline.components.health = { current: 8, maximum: 3, temporary: 0 };
  const edited = structuredClone(baseline);
  edited.identity.name = "Renamed Raven";
  const entity = CreatureDefinition.deserialize(edited, {
    ...context(),
    mode: "draft",
    baseline,
  });
  const issue = entity.state.metadata.validity.issues.find(
    (i) => i.code === "creature-codex-health",
  );
  assert.equal(issue.blocking, false);
  const snapshots = [];
  const subscription = entity.state$.subscribe((state) =>
    snapshots.push(state),
  );
  entity.validate({ ...context(), baseline });
  assert.equal(
    entity.state.metadata.validity.issues.find(
      (i) => i.code === "creature-codex-health",
    ).blocking,
    true,
  );
  assert.equal(snapshots.length, 2);
  subscription.unsubscribe();
  edited.components.health.current = 9;
  const changed = CreatureDefinition.deserialize(edited, {
    ...context(),
    mode: "draft",
    baseline,
  });
  assert.equal(
    changed.state.metadata.validity.issues.find(
      (i) => i.code === "creature-codex-health",
    ).blocking,
    true,
  );
});

test("Creature references resolve only inside the supplied World capture and declared membership", () => {
  const data = payload();
  data.components.equipmentPool = ["foreign-item"];
  data.components.skillDefinitionIds = ["skill"];
  const entity = CreatureDefinition.deserialize(data, {
    ...context(),
    records: [
      {
        resourceType: "definitions",
        sourceId: "skill",
        payload: { kind: "skill" },
      },
    ],
  });
  assert(
    entity.state.metadata.validity.issues.some(
      (i) => i.code === "creature-codex-equipment",
    ),
  );
  assert(
    entity.state.metadata.validity.issues.some(
      (i) => i.code === "creature-definition-reference-invalid",
    ),
  );
  const unresolved = CreatureDefinition.deserialize(payload());
  assert(
    unresolved.state.metadata.validity.issues.some(
      (i) => i.code === "creature-references-unresolved",
    ),
  );
});

test("Creature decode failures stay distinct from incomplete draft validity", () => {
  for (const invalid of [
    null,
    [],
    {},
    { kind: "item" },
    { kind: "creature", bad: NaN },
    { type: "creature-definition", schemaVersion: 2, data: payload() },
  ]) {
    assert.throws(() => CreatureDefinition.deserialize(invalid), TypeError);
  }
  const cyclic = { kind: "creature" };
  cyclic.self = cyclic;
  assert.throws(() => CreatureDefinition.deserialize(cyclic), TypeError);
  assert.equal(
    CreatureDefinition.deserialize({ kind: "creature" }, context()).state
      .metadata.validity.status,
    "invalid",
  );
});

test("Creature authoring retains archived artwork while newer views take precedence", () => {
  const old = payload();
  old.extensions = {
    "aow:legacy-creature": {
      payload: {
        images: {
          portrait: { assetId: "old" },
          overheadToken: { assetId: "archived" },
        },
      },
    },
  };
  old.components.art.images = { portrait: { assetId: "new" } };
  assert.deepEqual(CreatureDefinition.preservedImages(old), {
    portrait: { assetId: "new" },
    overheadToken: { assetId: "archived" },
  });
});

test("Creature rename commits state before its typed event and suppresses repeated names", async () => {
  const entity = CreatureDefinition.deserialize(payload(), context());
  const observed = [];
  entity.state$.subscribe((state) =>
    observed.push(["state", state.data.identity.name]),
  );
  entity.events.renamed.listen((event) =>
    observed.push(["event", event.context.name]),
  );
  const call = (name) =>
    entity.command("rename", {
      initiator: { id: "author" },
      params: { name },
      context: {},
    });
  assert.equal((await call(" Crow ")).status, "committed");
  assert.deepEqual(observed, [
    ["state", "Raven"],
    ["state", "Crow"],
    ["event", "Crow"],
  ]);
  assert.equal((await call("Crow")).status, "unchanged");
  await assert.rejects(call(" "), /valid Creature name/);
  assert.equal(entity.state.data.identity.name, "Crow");
});

const model = () => ({
  releaseIds: ["model-release"],
  elements: [
    {
      key: "world:creature",
      id: "creature",
      kind: "concept",
      semanticRole: "aow:creature",
    },
    {
      key: "world:agility",
      id: "agility",
      kind: "option",
      semanticRole: "aow:attribute",
      valueMetadata: { "aow:minimum": 1, "aow:maximum": 5 },
    },
    {
      key: "world:hand",
      id: "hand",
      kind: "option",
      semanticRole: "aow:equipment-slot",
    },
  ],
});

test("Creature owns effective Model conformance, integer ranges, and equipment option policy", () => {
  const valid = payload();
  valid.components.equipmentSlots = ["world:hand"];
  const check = (value) =>
    CreatureDefinition.deserialize(value, {
      ...context(),
      model: model(),
    }).state.metadata.validity.issues.filter(
      (issue) => issue.code === "creature-model-invalid",
    );
  assert.deepEqual(check(valid), []);
  for (const score of [0, 6, 2.5]) {
    const invalid = structuredClone(valid);
    invalid.components.attributes["world:agility"] = score;
    assert.match(check(invalid)[0].message, /allowed range/);
  }
  for (const slots of [["world:missing"], ["world:hand", "world:hand"]]) {
    const invalid = structuredClone(valid);
    invalid.components.equipmentSlots = slots;
    assert.match(check(invalid)[0].message, /unavailable Model option/);
  }
  const wrongRelease = structuredClone(valid);
  wrongRelease.conformance.modelSchemaReleaseIds = ["another-release"];
  assert.match(check(wrongRelease)[0].message, /exact Model Schema releases/);
  const wrongRole = model();
  wrongRole.elements[0].semanticRole = "aow:item";
  assert(
    CreatureDefinition.deserialize(valid, {
      ...context(),
      model: wrongRole,
    }).state.metadata.validity.issues.some((issue) =>
      /wrong Model concept/.test(issue.message),
    ),
  );
});

test("Creature Model default ranges and legacy root attribute adapter remain compatible", () => {
  const projectedModel = model();
  delete projectedModel.elements[1].valueMetadata;
  const legacy = {
    ...payload(),
    definitionType: "creature",
    attributes: { "world:agility": 100 },
    equipmentSlots: [],
  };
  delete legacy.components;
  const check = (value) =>
    CreatureDefinition.deserialize(value, {
      ...context(),
      model: projectedModel,
    }).state.metadata.validity.issues.filter(
      (issue) => issue.code === "creature-model-invalid",
    );
  assert.deepEqual(check(legacy), []);
  legacy.attributes["world:agility"] = 101;
  assert.match(check(legacy)[0].message, /allowed range/);
});

test("Creature artwork decoder rejects unsupported roles before media authorization", () => {
  assert.throws(
    () =>
      CreatureDefinition.decodeArtworkViews({ banner: { assetId: "image" } }),
    /valid Creature artwork view/,
  );
  assert.throws(
    () => CreatureDefinition.decodeArtworkViews({ portrait: null }),
    /valid Creature artwork view/,
  );
  assert.deepEqual(
    CreatureDefinition.decodeArtworkViews({ portrait: { assetId: "image" } }),
    { portrait: { assetId: "image" } },
  );
});
