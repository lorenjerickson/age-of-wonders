import assert from "node:assert/strict";
import test from "node:test";
import { ItemDefinition } from "../dist/index.js";
const storage = {
  kind: "pack",
  accepts: "any-item",
  capacityByQuality: [
    { quality: "fine", slots: 4 },
    { quality: "fine", rarity: "rare", slots: 6, extension: true },
  ],
  extension: { keep: true },
};
test("storage capacities require explicit whole counts and unique quality/rarity selectors", () => {
  assert.equal(ItemDefinition.validStorage(storage), true);
  for (const rows of [
    [],
    [{ quality: "fine", slots: -1 }],
    [{ quality: "fine", slots: 1.5 }],
    [{ quality: "fine" }],
    [
      { quality: "fine", slots: 2 },
      { quality: "fine", slots: 3 },
    ],
  ])
    assert.equal(
      ItemDefinition.validStorage({ ...storage, capacityByQuality: rows }),
      false,
    );
  assert.equal(
    ItemDefinition.validStorage({ ...storage, kind: "belt" }),
    false,
  );
});
test("unrelated Item saves preserve storage; explicit changes and removal preserve siblings", () => {
  const input = {
    name: "Satchel",
    category: "gear",
    quality: "fine",
    itemFamilyKey: "world:gear",
    compatibleEquipmentSlotSets: [],
  };
  const conformance = { conceptId: "item", modelSchemaReleaseIds: ["release"] };
  const prior = ItemDefinition.authorPayload(
    "satchel",
    {
      ...input,
      slottedContainer: storage,
      rarity: "rare",
      beltSlotCategory: "small-gear",
    },
    conformance,
  );
  const saved = ItemDefinition.authorPayload(
    "satchel",
    input,
    conformance,
    prior,
  );
  assert.deepEqual(saved.components.slottedContainer, storage);
  const cleared = ItemDefinition.authorPayload(
    "satchel",
    { ...input, slottedContainer: null, beltSlotCategory: null },
    conformance,
    prior,
  );
  assert.equal(cleared.components.slottedContainer, undefined);
  assert.equal(cleared.components.beltSlotCategory, undefined);
  assert.equal(cleared.components.rarity, "rare");
});

test("storage diagnostics participate in existing Item structural policy", () => {
  const input = {
    name: "Satchel",
    category: "gear",
    quality: "fine",
    itemFamilyKey: "world:gear",
    compatibleEquipmentSlotSets: [],
    slottedContainer: { ...storage, capacityByQuality: [] },
  };
  const payload = ItemDefinition.authorPayload("satchel", input, {
    conceptId: "item",
    modelSchemaReleaseIds: ["release"],
  });
  const owner = ItemDefinition.deserializePayload(payload, {
    sourceId: "satchel",
    mode: "publication",
  });
  try {
    assert.equal(
      owner.state.metadata.validity.issues.some(
        (issue) =>
          issue.code === "item-codex-storage-invalid" &&
          issue.blocking !== false,
      ),
      true,
    );
  } finally {
    owner.dispose();
  }
});
