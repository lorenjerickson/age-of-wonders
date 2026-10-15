import { test } from "node:test";
import assert from "node:assert/strict";
import { ActorEquipment, Item } from "../dist/index.js";
const head = "aow:head",
  waist = "aow:waist",
  back = "aow:back";
const definition = (id, components) => ({
  identity: { id, name: id },
  kind: "item",
  components: { category: "gear", quality: "standard", ...components },
});
const definitions = [
  definition("helmet", { equippable: { compatibleSlotSets: [[head]] } }),
  definition("belt", {
    equippable: { compatibleSlotSets: [[waist]] },
    slottedContainer: {
      kind: "belt",
      accepts: "belt-compatible-items",
      capacityByQuality: [{ quality: "standard", slots: 2 }],
    },
  }),
  definition("pack", {
    equippable: { compatibleSlotSets: [[back]] },
    rarity: "rare",
    slottedContainer: {
      kind: "pack",
      accepts: "any-item",
      capacityByQuality: [
        { quality: "standard", slots: 1 },
        { quality: "standard", rarity: "rare", slots: 2 },
      ],
    },
  }),
  definition("potion", { consumable: true }),
];
const actor = {
  identity: {
    id: "actor",
    version: {
      revision: 1,
      updatedAt: "2026-10-14T00:00:00Z",
      private: "kept",
    },
  },
  entityId: "entity",
  name: "Hero",
  extensions: { private: { note: "retained" } },
};
const item = (id, definitionId) => ({
  id,
  definitionId,
  quantity: 1,
  quality: "standard",
  location: { kind: "inventory", ownerId: "entity", private: "kept" },
  extensions: { private: id },
});
function setup(
  data = {
    actor,
    items: [
      item("helmet-one", "helmet"),
      item("belt-one", "belt"),
      item("pack-one", "pack"),
      item("potion-one", "potion"),
    ],
  },
) {
  return ActorEquipment.deserialize(data, {
    definitions,
    availableSlots: [head, waist, back],
  });
}
const change = (e, op) =>
  e.command("change", {
    initiator: "gm",
    params: { ...op, updatedAt: "2026-10-14T01:00:00Z" },
    context: {},
  });
test("Pack retrieve consumes one explicit allowance atomically and preserves private/sibling fields", async () => {
  const e = setup();
  try {
    assert.equal(
      (await change(e, { action: "equip", itemId: "pack-one", slots: [back] }))
        .status,
      "committed",
    );
    assert.equal(
      e.serializePayload().actor.equipment.containers[0].slots.length,
      2,
    );
    await change(e, {
      action: "stow",
      itemId: "helmet-one",
      containerId: "pack-one",
      index: 0,
    });
    let prior = e.serializePayload();
    assert.equal(prior.items[0].location.private, "kept");
    await assert.rejects(
      change(e, { action: "retrieve", itemId: "helmet-one", slots: [head] }),
      TypeError,
    );
    assert.deepEqual(e.serializePayload(), prior);
    await change(e, { action: "allowance", bonusActions: 1 });
    assert.equal(
      (
        await change(e, {
          action: "retrieve",
          itemId: "helmet-one",
          slots: [head],
        })
      ).status,
      "committed",
    );
    const next = e.serializePayload();
    assert.equal(next.actor.extensions["aow:rules"]["aow:bonusActions"], 0);
    assert.equal(next.actor.equipment.slots[head], "helmet-one");
    assert.equal(next.items[0].location.private, "kept");
    assert.equal(next.actor.extensions.private.note, "retained");
    assert.deepEqual(next.items[3], prior.items[3]);
  } finally {
    e.dispose();
  }
});
test("Belt supports configured Items only and immediate retrieval while equipped", async () => {
  const e = setup();
  try {
    await change(e, { action: "equip", itemId: "belt-one", slots: [waist] });
    await assert.rejects(
      change(e, {
        action: "stow",
        itemId: "helmet-one",
        containerId: "belt-one",
        index: 0,
      }),
      TypeError,
    );
    await change(e, {
      action: "stow",
      itemId: "potion-one",
      containerId: "belt-one",
      index: 0,
    });
    assert.equal(
      (await change(e, { action: "retrieve", itemId: "potion-one" })).status,
      "committed",
    );
    assert.equal(
      e.serializePayload().actor.extensions["aow:rules"]["aow:bonusActions"],
      undefined,
    );
  } finally {
    e.dispose();
  }
});
test("No slot overlap, self-containment, wrong ownership or implicit capacity", async () => {
  const data = {
    actor,
    items: [
      item("helmet-one", "helmet"),
      item("helmet-two", "helmet"),
      {
        ...item("foreign", "potion"),
        location: { kind: "inventory", ownerId: "other" },
      },
    ],
  };
  const e = setup(data);
  try {
    await change(e, { action: "equip", itemId: "helmet-one", slots: [head] });
    const before = e.serializePayload();
    for (const op of [
      { action: "equip", itemId: "helmet-two", slots: [head] },
      { action: "equip", itemId: "helmet-two", slots: [waist] },
      { action: "quantity", itemId: "foreign", quantity: 2 },
    ]) {
      await assert.rejects(change(e, op), TypeError);
      assert.deepEqual(e.serializePayload(), before);
    }
  } finally {
    e.dispose();
  }
  const localDefs = structuredClone(definitions);
  localDefs[2].components.slottedContainer.capacityByQuality = [
    { quality: "fine", slots: 3 },
  ];
  const x = ActorEquipment.deserialize(
    { actor, items: [item("pack-one", "pack")] },
    { definitions: localDefs, availableSlots: [back] },
  );
  try {
    await assert.rejects(
      change(x, { action: "equip", itemId: "pack-one", slots: [back] }),
      TypeError,
    );
  } finally {
    x.dispose();
  }
});
test("Malformed imported resources block writes without coercion; captured policy is detached", async () => {
  for (const ext of [null, 7, [], { "aow:rules": false }]) {
    const e = setup({ actor: { ...actor, extensions: ext }, items: [] });
    try {
      const before = e.serializePayload();
      await assert.rejects(
        change(e, { action: "allowance", bonusActions: 1 }),
        TypeError,
      );
      assert.deepEqual(e.serializePayload(), before);
    } finally {
      e.dispose();
    }
  }
  const ctx = {
    definitions: structuredClone(definitions),
    availableSlots: [head, back, waist],
  };
  const e = ActorEquipment.deserialize(
    { actor, items: [item("helmet-one", "helmet")] },
    ctx,
  );
  ctx.availableSlots.length = 0;
  try {
    assert.equal(
      (
        await change(e, {
          action: "equip",
          itemId: "helmet-one",
          slots: [head],
        })
      ).status,
      "committed",
    );
  } finally {
    e.dispose();
  }
});
test("Item payload codec preserves type-like extension and rejected quantity emits no state", async () => {
  const data = {
    ...item("x", "helmet"),
    type: "item",
    custom: { secret: true },
  };
  const e = Item.deserializePayload(data);
  try {
    let updates = 0;
    const sub = e.state$.subscribe(() => updates++);
    await assert.rejects(
      e.command("quantity", {
        initiator: "gm",
        params: { quantity: 0 },
        context: {},
      }),
      TypeError,
    );
    assert.deepEqual(e.serializePayload(), data);
    assert.equal(updates, 1);
    sub.unsubscribe();
  } finally {
    e.dispose();
  }
});

test("Creating Items updates an existing inventory index without losing private fields; null and missing identities reject atomically", async () => {
  const e = setup({
    actor: {
      ...actor,
      inventory: {
        itemIds: [],
        currencies: [],
        attunementLimit: 2,
        private: "keep",
      },
    },
    items: [],
  });
  try {
    const before = e.serializePayload();
    await assert.rejects(
      change(e, {
        action: "create",
        definitionId: "helmet",
        createdId: "new",
        quantity: null,
      }),
      TypeError,
    );
    assert.deepEqual(e.serializePayload(), before);
    await change(e, {
      action: "create",
      definitionId: "helmet",
      createdId: "new",
    });
    assert.deepEqual(e.serializePayload().actor.inventory, {
      itemIds: ["new"],
      currencies: [],
      attunementLimit: 2,
      private: "keep",
    });
  } finally {
    e.dispose();
  }
  const bad = setup({ actor: { ...actor, entityId: "" }, items: [] });
  try {
    await assert.rejects(
      change(bad, { action: "allowance", bonusActions: 1 }),
      TypeError,
    );
  } finally {
    bad.dispose();
  }
});
test("Self containment and duplicate container rows reject without mutation", async () => {
  const e = setup();
  try {
    await change(e, { action: "equip", itemId: "pack-one", slots: [back] });
    const before = e.serializePayload();
    await assert.rejects(
      change(e, {
        action: "stow",
        itemId: "pack-one",
        containerId: "pack-one",
        index: 0,
      }),
      TypeError,
    );
    assert.deepEqual(e.serializePayload(), before);
    const dup = structuredClone(before);
    dup.actor.equipment.containers.push(
      structuredClone(dup.actor.equipment.containers[0]),
    );
    const x = setup(dup);
    try {
      await assert.rejects(
        change(x, { action: "allowance", bonusActions: 1 }),
        TypeError,
      );
      assert.deepEqual(x.serializePayload(), dup);
    } finally {
      x.dispose();
    }
  } finally {
    e.dispose();
  }
});
