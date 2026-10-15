import assert from "node:assert/strict";
import test from "node:test";
import { CharacterTemplate } from "../dist/index.js";

test("Character artwork helpers preserve trusted inherited metadata and strip untrusted URIs", () => {
  const previous = {
    assetId: "asset",
    altText: "Old",
    width: 100,
    height: 200,
    mimeType: "image/png",
    uri: "private",
  };
  const supplied = {
    ...previous,
    altText: "New",
    width: 999,
    height: 999,
    mimeType: "image/jpeg",
    uri: "untrusted",
  };
  assert.deepEqual(CharacterTemplate.preservedArtwork(supplied, previous), {
    assetId: "asset",
    altText: "New",
    width: 100,
    height: 200,
    mimeType: "image/png",
  });
  assert.equal(
    CharacterTemplate.preservedArtwork(
      { ...supplied, assetId: "other" },
      previous,
    ),
    undefined,
  );
  assert.deepEqual(CharacterTemplate.verifiedArtwork(supplied, "image/webp"), {
    assetId: "asset",
    altText: "New",
    width: 999,
    height: 999,
    mimeType: "image/webp",
  });
  assert.equal(supplied.uri, "untrusted");
  assert.equal(previous.uri, "private");
});

const payload = () => ({
  id: "npc",
  name: "Guide",
  revision: 1,
  creatureDefinitionId: "creature",
  attributes: { "world:strength": 4 },
  skills: { tracking: 2 },
  health: { current: 10, maximum: 10, temporary: 0 },
  vision: { day: 60, night: 0 },
  movement: { walk: 30, jump: 5 },
  equipment: [],
  grantedConditions: [],
});
const context = () => ({
  mode: "publication",
  records: [
    {
      resourceType: "definitions",
      sourceId: "creature",
      payload: { kind: "creature" },
    },
    ...["pack", "torch"].map((sourceId) => ({
      resourceType: "definitions",
      sourceId,
      payload: { kind: "item" },
    })),
    {
      resourceType: "world-conditions",
      sourceId: "condition",
      payload: { id: "condition" },
    },
  ],
});
const valid = (entity) => entity.state.metadata.validity.status === "valid";
const first = (entity) => entity.state.metadata.validity.issues[0]?.message;

test("Character Template codecs retain extensions, private notes and imagery without mutable aliases", () => {
  const data = {
    ...payload(),
    description: "Private notes",
    extensions: { "world:custom": { values: [1] } },
    images: {
      portrait: {
        assetId: "asset",
        altText: "Guide",
        width: 0,
        height: 100,
        mimeType: "image/png",
      },
    },
  };
  const entity = CharacterTemplate.deserializePayload(data, context());
  assert(valid(entity));
  assert.deepEqual(
    CharacterTemplate.deserialize(
      entity.serialize(),
      context(),
    ).serializePayload(),
    data,
  );
  const encoded = entity.serializePayload();
  encoded.extensions["world:custom"].values.push(2);
  assert.deepEqual(entity.state.data.extensions["world:custom"].values, [1]);
});

test("Character Template construction owns authoritative identity/revision, trim and immutable Creature source", () => {
  const original = payload();
  const result = CharacterTemplate.authorPayload("server-id", {
    ...original,
    id: "untrusted",
    revision: 900,
    name: " Guide ",
  });
  assert.equal(result.id, "server-id");
  assert.equal(result.revision, 1);
  assert.equal(result.name, "Guide");
  assert.equal(
    CharacterTemplate.authorPayload("npc", original, original).revision,
    2,
  );
  for (const creatureDefinitionId of ["other", undefined])
    assert.throws(
      () =>
        CharacterTemplate.authorPayload(
          "npc",
          { ...original, creatureDefinitionId },
          original,
        ),
      /cannot be changed after creation/,
    );
});

test("Character Template distinguishes missing scope from unavailable Creature, Item and Condition references", () => {
  assert.equal(
    CharacterTemplate.deserializePayload(payload()).state.metadata.validity
      .status,
    "unresolved",
  );
  assert.equal(
    first(CharacterTemplate.deserializePayload(payload(), { records: [] })),
    "Choose a Creature template in this World.",
  );
  const data = payload();
  data.equipment = [{ slot: "carried", itemDefinitionId: "foreign" }];
  assert.equal(
    first(CharacterTemplate.deserializePayload(data, context())),
    "An equipped Item is unavailable in this World.",
  );
  data.equipment = [];
  data.grantedConditions = [{ conditionId: "foreign" }];
  assert.equal(
    first(CharacterTemplate.deserializePayload(data, context())),
    "A granted Condition is duplicated or unavailable in this World.",
  );
});

test("Character equipment allows distinct carried Items while rejecting duplicate Items and occupied slots", () => {
  const data = payload();
  data.equipment = [
    { slot: "carried", itemDefinitionId: "pack" },
    { slot: "carried", itemDefinitionId: "torch" },
  ];
  assert(valid(CharacterTemplate.deserializePayload(data, context())));
  data.equipment[1].itemDefinitionId = "pack";
  assert.equal(
    first(CharacterTemplate.deserializePayload(data, context())),
    "Choose each equipment Item only once.",
  );
  data.equipment = [
    { slot: "hand", itemDefinitionId: "pack" },
    { slot: "hand", itemDefinitionId: "torch" },
  ];
  assert.equal(
    first(CharacterTemplate.deserializePayload(data, context())),
    "Choose one Item for each equipment slot.",
  );
});

test("Character scalar invariants reject unsafe numeric maps, health, vision and movement", () => {
  for (const [patch, message] of [
    [
      { attributes: JSON.parse('{"__proto__":2}') },
      "Attributes and Skills must have numeric values.",
    ],
    [
      { skills: { tracking: "2" } },
      "Attributes and Skills must have numeric values.",
    ],
    [
      { health: { current: 11, maximum: 10, temporary: 0 } },
      "Health must be nonnegative and current health cannot exceed maximum.",
    ],
    [
      { vision: { day: -1, night: 0 } },
      "Vision distances must be nonnegative.",
    ],
    [
      { movement: { teleport: 2 } },
      "Choose valid movement modes and nonnegative speeds.",
    ],
    [
      { movement: { walk: -1 } },
      "Choose valid movement modes and nonnegative speeds.",
    ],
  ])
    assert.equal(
      first(
        CharacterTemplate.deserializePayload(
          { ...payload(), ...patch },
          context(),
        ),
      ),
      message,
    );
});

test("Character retains optional grants, empty movement/images and legacy partial source contracts", () => {
  const data = payload();
  delete data.grantedConditions;
  data.movement = {};
  data.images = {};
  assert(valid(CharacterTemplate.deserializePayload(data, context())));
  data.grantedConditions = [
    { conditionId: "condition" },
    { conditionId: "condition" },
  ];
  assert.equal(
    first(CharacterTemplate.deserializePayload(data, context())),
    "A granted Condition is duplicated or unavailable in this World.",
  );
});

test("Character artwork validation accepts supported roles and rejects unknown roles or invalid metadata", () => {
  const image = {
    assetId: "asset",
    altText: "",
    width: 0,
    height: 0,
    mimeType: "image/png",
  };
  for (const role of ["portrait", "overheadToken", "paperDollToken"])
    assert(
      valid(
        CharacterTemplate.deserializePayload(
          { ...payload(), images: { [role]: image } },
          context(),
        ),
      ),
    );
  for (const images of [
    { banner: image },
    { portrait: { ...image, width: -1 } },
    { portrait: { ...image, mimeType: "text/plain" } },
  ])
    assert.equal(
      first(
        CharacterTemplate.deserializePayload(
          { ...payload(), images },
          context(),
        ),
      ),
      "Choose valid Character artwork.",
    );
});

test("Character rename emits state before its event, preserves source, and suppresses no-op", async () => {
  const entity = CharacterTemplate.deserializePayload(payload(), context());
  const seen = [];
  entity.state$.subscribe((state) => seen.push(state.data.name));
  entity.events.renamed.listen((event) => seen.push(event.context.name));
  const command = {
    initiator: "author",
    params: { name: " Scout " },
    context: {},
  };
  assert.equal((await entity.command("rename", command)).status, "committed");
  assert.deepEqual(seen, ["Guide", "Scout", "Scout"]);
  assert.equal(entity.state.data.creatureDefinitionId, "creature");
  assert.equal((await entity.command("rename", command)).status, "unchanged");
  entity.validate({ records: [] });
  assert.equal(
    (
      await entity.command("rename", {
        ...command,
        params: { name: "Invalid rename" },
      })
    ).status,
    "rejected",
  );
  assert.equal(entity.state.data.name, "Scout");
});

test("Character raw-resource boundary cannot validate a nested entity envelope instead of stored fields", () => {
  const raw = {
    id: "npc",
    name: "Shell",
    revision: 1,
    type: "character-template",
    schemaVersion: 1,
    data: payload(),
  };
  assert.equal(
    first(CharacterTemplate.deserializePayload(raw, context())),
    "Choose a Creature template in this World.",
  );
  assert(
    valid(
      CharacterTemplate.deserialize(
        { type: "character-template", schemaVersion: 1, data: payload() },
        context(),
      ),
    ),
  );
  for (const value of [
    null,
    [],
    { ...payload(), invalid: undefined },
    { type: "character-template", schemaVersion: 2, data: payload() },
  ])
    assert.throws(() => CharacterTemplate.deserialize(value, context()));
});

test("Character changed Creature source is represented in validity state against a trusted baseline", () => {
  const original = payload();
  const changed = { ...original, creatureDefinitionId: "other" };
  const scoped = { ...context(), baseline: original };
  scoped.records.push({
    resourceType: "definitions",
    sourceId: "other",
    payload: { kind: "creature" },
  });
  const entity = CharacterTemplate.deserializePayload(changed, scoped);
  assert(
    entity.state.metadata.validity.issues.some(
      (issue) =>
        issue.message ===
        "A Character's Creature template cannot be changed after creation.",
    ),
  );
  assert(!valid(entity));
});
