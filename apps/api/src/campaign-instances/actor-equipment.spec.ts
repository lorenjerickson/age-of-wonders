import { readActorEquipment, changeActorEquipment } from "./actor-equipment";
import { equipmentFixture } from "./actor-equipment.fixture";
function fixture() {
  const f = equipmentFixture();
  let instance: any = {
    id: "instance",
    ownerUserId: "owner",
    status: "PREPARING",
    metadataRevision: 1,
    currentSnapshotId: "capture",
    currentSnapshot: {
      worldDefinitionSnapshot: { manifest: { records: f.records } },
    },
    runtime: {
      id: "runtime",
      campaignInstanceSnapshotId: "capture",
      revision: 1,
      state: f.state,
    },
  };
  const db: any = {
    campaignInstance: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.ownerUserId === instance.ownerUserId
          ? JSON.parse(JSON.stringify(instance))
          : null,
      ),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    campaignInstanceRuntime: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.revision !== instance.runtime.revision) return { count: 0 };
        instance.runtime = {
          ...instance.runtime,
          state: data.state,
          revision: instance.runtime.revision + 1,
        };
        return { count: 1 };
      }),
    },
    $transaction: async (fn: any) => fn(db),
  };
  return { db, get: () => instance };
}
describe("Equipment API owner boundary", () => {
  it("projects named contained Items and atomically preserves unrelated private state", async () => {
    const { db, get } = fixture();
    const before = JSON.parse(JSON.stringify(get().runtime.state));
    expect(
      await readActorEquipment(db, "instance", "owner", "actor"),
    ).toMatchObject({
      bonusActions: 1,
      items: expect.arrayContaining([
        expect.objectContaining({
          name: "Hammer",
          locationLabel: "In Travel pack",
          compatibleSlotSets: [["slot:hand"]],
        }),
      ]),
    });
    await changeActorEquipment(db, "instance", "owner", "actor", {
      expectedRuntimeRevision: 1,
      action: "retrieve",
      containerId: "pack",
      index: 0,
      slots: ["slot:hand"],
    });
    const after = get().runtime.state;
    expect(get().runtime.revision).toBe(2);
    expect(
      after.creatureEmbodiments[0].creature.extensions["aow:rules"][
        "aow:bonusActions"
      ],
    ).toBe(0);
    expect(after.preparation).toEqual(before.preparation);
    expect(after.extensions).toEqual(before.extensions);
    expect(after.creatureEmbodiments[1]).toEqual(before.creatureEmbodiments[1]);
    expect(after.itemInstances[2].extensions).toEqual(
      before.itemInstances[2].extensions,
    );
  });
  it("denies foreign owner, frozen status, stale and changed capture without writes", async () => {
    const { db, get } = fixture();
    await expect(
      readActorEquipment(db, "instance", "outsider", "actor"),
    ).rejects.toThrow("not found");
    await expect(
      changeActorEquipment(db, "instance", "owner", "actor", {
        expectedRuntimeRevision: 0,
        action: "allowance",
        bonusActions: 1,
      }),
    ).rejects.toThrow("changed");
    get().status = "CONCLUDED";
    await expect(
      changeActorEquipment(db, "instance", "owner", "actor", {
        expectedRuntimeRevision: 1,
        action: "allowance",
        bonusActions: 1,
      }),
    ).rejects.toThrow("read-only");
    get().status = "PREPARING";
    db.campaignInstance.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      changeActorEquipment(db, "instance", "owner", "actor", {
        expectedRuntimeRevision: 1,
        action: "allowance",
        bonusActions: 1,
      }),
    ).rejects.toThrow("capture or status");
    expect(db.campaignInstanceRuntime.updateMany).not.toHaveBeenCalled();
  });
  it("rechecks runtime revision inside persistence transaction", async () => {
    const { db, get } = fixture();
    db.campaignInstance.updateMany.mockImplementation(async () => {
      get().runtime.revision = 2;
      return { count: 1 };
    });
    await expect(
      changeActorEquipment(db, "instance", "owner", "actor", {
        expectedRuntimeRevision: 1,
        action: "allowance",
        bonusActions: 2,
      }),
    ).rejects.toThrow("changed");
    expect(
      get().runtime.state.creatureEmbodiments[0].creature.extensions[
        "aow:rules"
      ]["aow:bonusActions"],
    ).toBe(1);
  });
});

describe("Captured Creature equipment restrictions", () => {
  it("uses canonical component slots and captured release labels without synthetic manifest Model records", async () => {
    const { db, get } = fixture();
    const snapshot = get().currentSnapshot.worldDefinitionSnapshot;
    snapshot.manifest.records = snapshot.manifest.records.filter(
      (record: any) => record.resourceType === "definitions",
    );
    const source = {
      resourceType: "definitions",
      sourceId: "creature-def",
      payload: {
        kind: "creature",
        identity: { id: "creature-def" },
        components: { equipmentSlots: ["slot:back", "slot:waist"] },
      },
    };
    snapshot.manifest.records.push(source);
    get().runtime.state.creatureEmbodiments[0].creature.definitionId =
      "creature-def";
    snapshot.worldDefinitionRevision = {
      modelSchemaSelections: [
        {
          modelSchemaRelease: {
            id: "release",
            dependencies: [{ releaseId: "dependency" }],
            elementSelections: [{ elementRevisionId: "back-revision" }],
          },
        },
      ],
    };
    db.modelSchemaRelease = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "dependency",
          dependencies: [],
          elementSelections: [
            { elementRevisionId: "waist-revision" },
            { elementRevisionId: "hand-revision" },
          ],
        },
      ]),
    };
    db.modelElementRevision = {
      findMany: jest.fn().mockResolvedValue(
        ["back", "waist", "hand"].map((name) => ({
          id: `${name}-revision`,
          presentation: { label: `Captured ${name}` },
          element: {
            key: `slot:${name}`,
            semanticRole: "aow:equipment-slot",
          },
        })),
      ),
    };
    const projection = await readActorEquipment(
      db,
      "instance",
      "owner",
      "actor",
    );
    expect(projection.slots).toEqual([
      { id: "slot:back", name: "Captured back" },
      { id: "slot:waist", name: "Captured waist" },
    ]);
    expect(db.modelSchemaRelease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["dependency"] } } }),
    );
    const before = JSON.parse(JSON.stringify(get().runtime.state));
    await expect(
      changeActorEquipment(db, "instance", "owner", "actor", {
        expectedRuntimeRevision: 1,
        action: "retrieve",
        itemId: "tool",
        slots: ["slot:hand"],
      }),
    ).rejects.toThrow("does not fit");
    expect(get().runtime.state).toEqual(before);
    source.payload.components.equipmentSlots = [];
    expect(
      (await readActorEquipment(db, "instance", "owner", "actor")).slots,
    ).toEqual([]);
    source.payload.components.equipmentSlots = null as never;
    await expect(
      readActorEquipment(db, "instance", "owner", "actor"),
    ).rejects.toThrow("slots are invalid");
  });
});

it("masks raw non-UUID actor, Item and Definition identifiers used as labels", async () => {
  const { db, get } = fixture();
  const state = get().runtime.state;
  state.creatureEmbodiments[0].creature.name = "actor-entity";
  state.itemInstances[0].nameOverride = "pack";
  const definition =
    get().currentSnapshot.worldDefinitionSnapshot.manifest.records.find(
      (r: any) => r.sourceId === "pack-def",
    );
  definition.payload.identity.name = "pack-def";
  const result = await readActorEquipment(db, "instance", "owner", "actor");
  expect(result.actorName).toBe("Actor");
  expect(
    result.definitions.find((entry) => entry.id === "pack-def")?.name,
  ).toBe("Item");
  expect(result.items.find((entry) => entry.id === "pack")?.name).toBe("Item");
});
