export function equipmentFixture() {
  const defs = [
    {
      identity: { id: "pack-def", name: "Travel pack" },
      kind: "item",
      components: {
        quality: "standard",
        equippable: { compatibleSlotSets: [["slot:back"]] },
        slottedContainer: {
          kind: "pack",
          accepts: "any-item",
          capacityByQuality: [{ quality: "standard", slots: 2 }],
        },
      },
    },
    {
      identity: { id: "belt-def", name: "Tool belt" },
      kind: "item",
      components: {
        quality: "standard",
        equippable: { compatibleSlotSets: [["slot:waist"]] },
        slottedContainer: {
          kind: "belt",
          accepts: "belt-compatible-items",
          capacityByQuality: [{ quality: "standard", slots: 2 }],
        },
      },
    },
    {
      identity: { id: "tool-def", name: "Hammer" },
      kind: "item",
      components: {
        quality: "standard",
        beltSlotCategory: "tool",
        equippable: { compatibleSlotSets: [["slot:hand"]] },
      },
    },
  ];
  const records = [
    ...defs.map((payload) => ({
      resourceType: "definitions",
      sourceId: payload.identity.id,
      payload,
    })),
    ...["back", "waist", "hand"].map((name) => ({
      resourceType: "model-element-revisions",
      sourceId: `slot-${name}`,
      payload: {
        element: {
          key: `slot:${name}`,
          name,
          semanticRole: "aow:equipment-slot",
        },
      },
    })),
  ];
  const creature = {
    identity: {
      id: "actor",
      version: { revision: 1, updatedAt: "2026-10-14T00:00:00.000Z" },
    },
    entityId: "actor-entity",
    name: "Hero",
    inventory: {
      itemIds: ["pack", "belt", "tool"],
      currencies: [],
      attunementLimit: 3,
    },
    equipment: {
      slots: { "slot:back": "pack", "slot:waist": "belt" },
      containers: [
        {
          containerItemId: "pack",
          slots: [{ index: 0, itemId: "tool" }, { index: 1 }],
        },
        { containerItemId: "belt", slots: [{ index: 0 }, { index: 1 }] },
      ],
    },
    extensions: {
      "fixture:private": { secret: "keep" },
      "aow:rules": { "aow:bonusActions": 1, otherResource: 9 },
    },
  };
  const items = [
    {
      id: "pack",
      definitionId: "pack-def",
      quantity: 1,
      quality: "standard",
      location: { kind: "inventory", ownerId: "actor-entity" },
    },
    {
      id: "belt",
      definitionId: "belt-def",
      quantity: 1,
      quality: "standard",
      location: { kind: "inventory", ownerId: "actor-entity" },
    },
    {
      id: "tool",
      definitionId: "tool-def",
      quantity: 1,
      quality: "standard",
      location: { kind: "container", containerId: "pack" },
      extensions: { "fixture:private": true },
    },
  ];
  return {
    records,
    state: {
      formatVersion: 1,
      preparation: { notes: "private preparation" },
      plotProgress: [],
      placementRealizations: [],
      itemInstances: items,
      creatureEmbodiments: [
        { runtimeCreatureId: "actor", creature },
        {
          runtimeCreatureId: "sibling",
          creature: { name: "Other actor", privateNotes: "keep" },
        },
      ],
      extensions: { "fixture:private": "keep" },
    },
  };
}
