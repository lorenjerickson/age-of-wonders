import assert from "node:assert/strict";
import test from "node:test";
import { WorldDefinition } from "../dist/index.js";

const content = () => WorldDefinition.createContent("root", ["release"]);
const records = () => [
  {
    resourceType: "locations",
    sourceId: "root",
    payload: { kind: "world", name: "Realm", placement: { kind: "root" } },
  },
];
const context = (data, capture = records(), issues = []) => ({
  records: capture,
  relatedValidation: { content: data, records: capture, issues },
});
const hydrate = (data = content(), capture = records()) =>
  WorldDefinition.deserializePayload(data, context(data, capture));
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);

test("World revision content codecs preserve extensions without capture or aliases", () => {
  const data = {
    ...content(),
    extensions: { secret: [1] },
    privateFields: { notes: "hidden" },
  };
  const entity = hydrate(data);
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.deepEqual(
    WorldDefinition.deserialize(
      entity.serialize(),
      context(data),
    ).serializePayload(),
    data,
  );
  data.extensions.secret.push(2);
  const out = entity.serializePayload();
  out.extensions.secret.push(3);
  assert.deepEqual(entity.state.data.extensions.secret, [1]);
  assert.equal(out.records, undefined);
});
test("World raw content boundary never unwraps envelope-shaped authored input", () => {
  const envelope = hydrate().serialize();
  assert(codes(hydrate(envelope)).includes("root-missing"));
  assert.throws(
    () => WorldDefinition.deserialize({ ...envelope, schemaVersion: 2 }),
    /schema/,
  );
  const cycle = {};
  cycle.self = cycle;
  for (const value of [null, [], 42, { bad: NaN }, cycle, new Date()])
    assert.throws(() => WorldDefinition.deserializePayload(value));
});
test("World collections retain partial drafts as invalid and do not leak usable invalid collections", () => {
  const entity = hydrate({
    locationIds: ["root", 4],
    definitionIds: ["same", "same"],
  });
  assert(codes(entity).includes("collection-invalid"));
  assert(codes(entity).includes("collection-duplicate"));
  assert(codes(entity).includes("model-release-missing"));
  assert(codes(entity).includes("root-missing"));
  assert.deepEqual(entity.publicationCollections().locationIds, []);
});
test("World requires scoped child checks and invalidates stale evidence on content or capture changes", async () => {
  const data = content();
  const capture = records();
  const entity = WorldDefinition.deserializePayload(data, { records: capture });
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  const evidence = context(data, capture);
  entity.validate(evidence);
  assert.equal(entity.state.metadata.validity.status, "valid");
  const order = [];
  entity.state$.subscribe((state) =>
    order.push(state.metadata.validity.status),
  );
  entity.events.contentReplaced.listen(() => order.push("event"));
  const receipt = await entity.command("replaceContent", {
    initiator: "gm",
    params: { content: { ...data, notes: "new" } },
    context: {},
  });
  assert.equal(receipt.status, "committed");
  assert.deepEqual(order, ["valid", "unresolved", "event"]);
  entity.validate({
    ...evidence,
    records: [
      ...capture,
      { resourceType: "extra", sourceId: "x", payload: {} },
    ],
  });
  assert(codes(entity).includes("world-related-unresolved"));
});
test("World retains child diagnostics in state and rejects invariant-breaking commands atomically", async () => {
  const data = content();
  const entity = WorldDefinition.deserializePayload(
    data,
    context(data, records(), [
      { code: "child-invalid", subject: "Realm", message: "Map missing" },
    ]),
  );
  assert.equal(entity.state.metadata.validity.status, "invalid");
  assert(codes(entity).includes("child-invalid"));
  const clean = hydrate();
  const before = clean.serializePayload();
  let emitted = 0;
  clean.events.contentReplaced.listen(() => emitted++);
  const receipt = await clean.command("replaceContent", {
    initiator: "gm",
    params: { content: { ...before, rootLocationId: "missing" } },
    context: {},
  });
  assert.equal(receipt.status, "rejected");
  assert.deepEqual(clean.serializePayload(), before);
  assert.equal(emitted, 0);
  const noop = await clean.command("replaceContent", {
    initiator: "gm",
    params: { content: before },
    context: {},
  });
  assert.equal(noop.status, "unchanged");
  assert.equal(emitted, 0);
});
test("World capture uniqueness trims identities and reserves server revision records", () => {
  const capture = [
    ...records(),
    {
      resourceType: " locations ",
      sourceId: " root ",
      sourceRevision: 2,
      payload: { name: "Duplicate" },
    },
    {
      resourceType: "world-definition-revision",
      sourceId: "revision",
      payload: {},
    },
  ];
  const entity = hydrate(content(), capture);
  assert(codes(entity).includes("duplicate-record"));
  assert(codes(entity).includes("reserved-record"));
});
test("World invalid record JSON remains a diagnostic instead of preventing hydration", () => {
  const entity = hydrate(content(), [
    ...records(),
    { resourceType: "extra", sourceId: "bad", payload: { bad: NaN } },
  ]);
  assert(codes(entity).includes("record-invalid"));
});
test("World checks missing declarations, schema alternatives and placement ownership", () => {
  const data = {
    ...content(),
    definitionIds: ["definition"],
    schemaDefinitionIds: ["schema"],
    worldPlacementDefinitionIds: ["placement"],
  };
  const capture = [
    ...records(),
    {
      resourceType: "world-placements",
      sourceId: "extra",
      payload: { name: "Extra" },
    },
  ];
  const entity = hydrate(data, capture);
  for (const code of [
    "declared-record-missing",
    "schema-record-missing",
    "world-placement-record-missing",
    "world-placement-membership-mismatch",
  ])
    assert(codes(entity).includes(code));
  assert(
    !codes(
      hydrate({ ...content(), schemaDefinitionIds: ["schema"] }, [
        ...records(),
        { resourceType: "definitions", sourceId: "schema", payload: {} },
      ]),
    ).includes("schema-record-missing"),
  );
});
test("World hierarchy validates parent membership and cycles while ignoring retired travel links", () => {
  const capture = [
    {
      ...records()[0],
      payload: {
        kind: "region",
        name: "Realm",
        placement: { kind: "within-parent", parentLocationId: "child" },
      },
    },
    {
      resourceType: "locations",
      sourceId: "child",
      payload: {
        name: "Village",
        placement: { kind: "within-parent", parentLocationId: "root" },
        connectedLocationIds: ["retired"],
      },
    },
  ];
  const entity = hydrate(
    { ...content(), locationIds: ["root", "child"] },
    capture,
  );
  assert(codes(entity).includes("root-kind-invalid"));
  assert(codes(entity).includes("root-placement-invalid"));
  assert.equal(
    codes(entity).filter((code) => code === "location-cycle").length,
    2,
  );
  capture[1].payload.placement.parentLocationId = "missing";
  assert(
    codes(
      hydrate({ ...content(), locationIds: ["root", "child"] }, capture),
    ).includes("location-parent-missing"),
  );
  assert.equal(
    WorldDefinition.hierarchyPlacementIssue(
      content(),
      capture,
      "child",
      "root",
    ),
    "The Location hierarchy cannot contain a cycle.",
  );
  assert.equal(
    WorldDefinition.hierarchyPlacementIssue(
      content(),
      records(),
      "child",
      "root",
    ),
    undefined,
  );
});
test("World membership helpers preserve private fields and isolate inputs", () => {
  const data = { ...content(), privateFields: { notes: ["secret"] } };
  const added = WorldDefinition.withMember(data, "definitionIds", "a");
  assert.deepEqual(
    WorldDefinition.withMember(added, "definitionIds", "a").definitionIds,
    ["a"],
  );
  const removed = WorldDefinition.withoutMember(added, "definitionIds", "a");
  assert.deepEqual(removed.definitionIds, []);
  removed.privateFields.notes.push("other");
  assert.deepEqual(data.privateFields.notes, ["secret"]);
});
test("World validation captures cannot be mutated from outside and subscriptions complete on dispose", () => {
  const data = content();
  const capture = records();
  const ctx = context(data, capture);
  const entity = WorldDefinition.deserializePayload(data, ctx);
  capture[0].payload.kind = "region";
  ctx.relatedValidation.issues.push({
    code: "injected",
    subject: "x",
    message: "x",
  });
  assert.equal(entity.state.metadata.validity.status, "valid");
  let completed = false;
  entity.state$.subscribe({ complete: () => (completed = true) });
  entity.dispose();
  assert(completed);
});

test("World equivalent reordered content does not emit or invalidate related evidence", async () => {
  const entity = hydrate();
  let emitted = 0;
  entity.events.contentReplaced.listen(() => emitted++);
  const reordered = Object.fromEntries(
    Object.entries(entity.serializePayload()).reverse(),
  );
  const receipt = await entity.command("replaceContent", {
    initiator: "gm",
    params: { content: reordered },
    context: {},
  });
  assert.equal(receipt.status, "unchanged");
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.equal(emitted, 0);
});

test("World membership editing preserves string references in incomplete mixed collections", () => {
  const data = { ...content(), locationIds: ["root", null, "town", 5] };
  assert.deepEqual(
    WorldDefinition.withMember(data, "locationIds", "town").locationIds,
    ["root", "town"],
  );
  assert.deepEqual(
    WorldDefinition.withoutMember(data, "locationIds", "town").locationIds,
    ["root"],
  );
  assert.deepEqual(data.locationIds, ["root", null, "town", 5]);
});

test("World placement relationship policy distinguishes declared kinds and legacy Creature captures", () => {
  const collections = {
    locationIds: ["root"],
    definitionIds: ["item", "creature", "registered"],
  };
  const capture = [
    {
      resourceType: "definitions",
      sourceId: "item",
      payload: { kind: "item" },
    },
    {
      resourceType: "definitions",
      sourceId: "creature",
      payload: { kind: "creature" },
    },
    {
      resourceType: "definitions",
      sourceId: "registered",
      payload: { kind: "custom" },
    },
    { resourceType: "world-character-templates", sourceId: "npc", payload: { id: "npc", name: "Count" } },
    { resourceType: "creatures", sourceId: "legacy", payload: {} },
    { resourceType: "creatures", sourceId: "item", payload: {} },
  ];
  const check = (source, locationId = "root") =>
    WorldDefinition.placementReferenceIssues(
      {
        resourceType: "world-placements",
        sourceId: "p",
        payload: { name: "Guard", locationId, source },
      },
      collections,
      capture,
    );
  assert.deepEqual(
    check({ kind: "world-creature", creatureId: "creature" }),
    [],
  );
  assert.deepEqual(check({ kind: "world-character", characterTemplateId: "npc" }), []);
  assert.equal(check({ kind: "world-character", characterTemplateId: "creature" })[0].code, "world-placement-source-not-found");
  assert.deepEqual(check({ kind: "world-creature", creatureId: "legacy" }), []);
  assert.deepEqual(check({ kind: "world-item", itemDefinitionId: "item" }), []);
  assert.deepEqual(
    check({ kind: "registered-content", definitionId: "registered" }),
    [],
  );
  assert.deepEqual(
    check({ kind: "world-creature", creatureId: "item" }, "missing").map(
      (issue) => issue.code,
    ),
    ["world-placement-location-not-found", "world-placement-source-not-found"],
  );
  assert.equal(
    check({ kind: "registered-content", definitionId: "missing" })[0].subject,
    "Guard",
  );
});
