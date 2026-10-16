import test from "node:test";
import assert from "node:assert/strict";
import { CharacterTemplate, CreatureDefinition } from "../dist/index.js";
const slots = [
  "aow:equipment-slot-main-hand",
  "aow:equipment-slot-off-hand",
  "aow:equipment-slot-head",
];
const records = [
  {
    resourceType: "definitions",
    sourceId: "human",
    payload: { kind: "creature", components: { equipmentSlots: slots } },
  },
  ...[
    ["sword", [["main-hand", "off-hand"]]],
    ["hat", [["head"]]],
    ["other-hat", [["head"]]],
  ].map(([sourceId, compatibleSlotSets]) => ({
    resourceType: "definitions",
    sourceId,
    payload: {
      kind: "item",
      components: { equippable: { compatibleSlotSets } },
    },
  })),
];
const character = (equipment) => ({
  id: "npc",
  name: "Guard",
  revision: 1,
  creatureDefinitionId: "human",
  attributes: {},
  skills: {},
  health: { current: 1, maximum: 1, temporary: 0 },
  vision: { day: 1, night: 0 },
  movement: {},
  equipment,
});
const issues = (equipment, baseline) => {
  const owner = CharacterTemplate.deserializePayload(character(equipment), {
    records,
    baseline,
  });
  try {
    return owner.state.metadata.validity.issues
      .filter((i) => !i.unresolved)
      .map((i) => i.message);
  } finally {
    owner.dispose();
  }
};
test("multi-slot assignments require one complete compatible set and support exact legacy core aliases", () => {
  const both = [
    { slot: "main-hand", itemDefinitionId: "sword" },
    { slot: "aow:equipment-slot-off-hand", itemDefinitionId: "sword" },
  ];
  assert.deepEqual(issues(both), []);
  assert.match(issues(both.slice(0, 1))[0], /complete slot/);
  assert.match(
    issues([{ slot: "head", itemDefinitionId: "sword" }])[0],
    /complete slot/,
  );
  assert.match(
    issues([{ slot: "unknown", itemDefinitionId: "hat" }])[0],
    /supported/,
  );
  assert.match(
    issues([
      { slot: "head", itemDefinitionId: "hat" },
      { slot: "aow:equipment-slot-head", itemDefinitionId: "other-hat" },
    ])[0],
    /one Item/,
  );
});
test("carried entries stay explicit and unchanged legacy associations retain references", () => {
  assert.deepEqual(
    issues([
      { slot: "carried", itemDefinitionId: "hat" },
      { slot: "carried", itemDefinitionId: "sword" },
    ]),
    [],
  );
  assert.match(
    issues([
      { slot: "carried", itemDefinitionId: "hat" },
      { slot: "head", itemDefinitionId: "hat" },
    ])[0],
    /only once/,
  );
  const legacy = [{ slot: "legacy-slot", itemDefinitionId: "hat" }];
  assert.deepEqual(issues(legacy, character(legacy)), []);
  assert.match(
    issues([{ slot: "carried", itemDefinitionId: "missing" }])[0],
    /unavailable/,
  );
});
test("Creature authoring preserves omitted equipment and pool and clears only explicitly assigned equipment", () => {
  const previous = {
    components: {
      equipment: [{ slot: "carried", itemDefinitionId: "hat" }],
      equipmentPool: ["sword"],
      private: "retained",
    },
  };
  const input = {
    name: "Human",
    attributes: {},
    equipmentSlots: slots,
    instanceEmbodimentPolicy: { strategy: "one-per-instance" },
  };
  const kept = CreatureDefinition.authorPayload("human", input, {}, previous);
  assert.deepEqual(kept.components.equipment, previous.components.equipment);
  assert.deepEqual(kept.components.equipmentPool, ["sword"]);
  const cleared = CreatureDefinition.authorPayload(
    "human",
    { ...input, equipment: [] },
    {},
    previous,
  );
  assert.deepEqual(cleared.components.equipment, []);
  assert.equal(cleared.components.private, "retained");
  assert.deepEqual(cleared.components.equipmentPool, ["sword"]);
});

test("Creature owner validates explicit assignments independently of the availability pool", () => {
  const base = CreatureDefinition.authorPayload(
    "human",
    {
      name: "Human",
      attributes: {},
      equipmentSlots: slots,
      instanceEmbodimentPolicy: { strategy: "one-per-instance" },
      equipmentPool: ["hat"],
    },
    {},
  );
  for (const [equipment, invalid] of [
    [[{ slot: "head", itemDefinitionId: "hat" }], false],
    [[{ slot: "head", itemDefinitionId: "sword" }], true],
  ]) {
    const owner = CreatureDefinition.deserializePayload(
      { ...base, components: { ...base.components, equipment } },
      { records },
    );
    assert.equal(
      owner.state.metadata.validity.issues.some(
        (i) => i.code === "creature-codex-equipment-assignment",
      ),
      invalid,
    );
    owner.dispose();
  }
});

test("historical Belt slot aliases resolve to Waist without changing container kinds", () => {
  const capture = [
    {
      resourceType: "definitions",
      sourceId: "human",
      payload: {
        kind: "creature",
        components: { equipmentSlots: ["aow:equipment-slot-waist"] },
      },
    },
    {
      resourceType: "definitions",
      sourceId: "belt-item",
      payload: {
        kind: "item",
        components: {
          equippable: { compatibleSlotSets: [["belt"]] },
          slottedContainer: { kind: "belt" },
        },
      },
    },
  ];
  const owner = CharacterTemplate.deserializePayload(
    character([{ slot: "waist", itemDefinitionId: "belt-item" }]),
    { records: capture },
  );
  assert.equal(
    owner.state.metadata.validity.issues.filter((i) => !i.unresolved).length,
    0,
  );
  owner.dispose();
});
