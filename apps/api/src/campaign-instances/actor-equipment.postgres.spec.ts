import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import {
  readActorEquipment,
  changeActorEquipment,
  type EquipmentRequest,
} from "./actor-equipment";
import { equipmentFixture } from "./actor-equipment.fixture";
const url = process.env.EQUIPMENT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("Equipment PostgreSQL boundary", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    if (
      !url ||
      !/^\/aow_b08_disposable_[a-z0-9_]+$/i.test(new URL(url).pathname)
    )
      throw new Error("Use the dedicated B08 disposable database.");
    db = new PrismaClient({ datasourceUrl: url });
    await db.$connect();
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("persists Pack costs, free equipped Belt retrieval and unrelated/private sibling data", async () => {
    const f = await seed(db);
    const original = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.id },
    });
    let view = await readActorEquipment(db as never, f.id, f.owner, "actor");
    expect(view.runtimeRevision).toBe(1);
    const change = async (
      command: Omit<EquipmentRequest, "expectedRuntimeRevision">,
    ) => {
      view = await changeActorEquipment(db as never, f.id, f.owner, "actor", {
        ...command,
        expectedRuntimeRevision: view.runtimeRevision,
      });
      return view;
    };
    await change({
      action: "retrieve",
      containerId: "pack",
      index: 0,
      slots: ["slot:hand"],
    });
    expect(view.bonusActions).toBe(0);
    await change({
      action: "stow",
      itemId: "tool",
      containerId: "belt",
      index: 0,
    });
    await change({
      action: "retrieve",
      containerId: "belt",
      index: 0,
      slots: ["slot:hand"],
    });
    expect(view.bonusActions).toBe(0);
    await change({
      action: "stow",
      itemId: "tool",
      containerId: "pack",
      index: 0,
    });
    const revision = view.runtimeRevision;
    await expect(
      change({ action: "retrieve", containerId: "pack", index: 0 }),
    ).rejects.toThrow("bonus action");
    const after = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.id },
    });
    expect(after.revision).toBe(revision);
    const before = original.state as any,
      state = after.state as any;
    expect(state.preparation).toEqual(before.preparation);
    expect(state.extensions).toEqual(before.extensions);
    expect(state.creatureEmbodiments[1]).toEqual(before.creatureEmbodiments[1]);
    expect(
      state.creatureEmbodiments[0].creature.extensions["fixture:private"],
    ).toEqual(
      before.creatureEmbodiments[0].creature.extensions["fixture:private"],
    );
    expect(state.itemInstances[2].extensions).toEqual(
      before.itemInstances[2].extensions,
    );
    expect(
      await readActorEquipment(db as never, f.id, f.owner, "actor"),
    ).toMatchObject({
      runtimeRevision: revision,
      items: expect.arrayContaining([
        expect.objectContaining({
          name: "Hammer",
          locationLabel: "In Travel pack",
        }),
      ]),
    });
  });
  it("permits one competing CAS write and denies stale revision, foreign owner and frozen status", async () => {
    const f = await seed(db);
    const request = {
      expectedRuntimeRevision: 1,
      action: "allowance" as const,
      bonusActions: 2,
    };
    const results = await Promise.allSettled([
      changeActorEquipment(db as never, f.id, f.owner, "actor", request),
      changeActorEquipment(db as never, f.id, f.owner, "actor", request),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await db.campaignInstanceRuntime.findUniqueOrThrow({
          where: { campaignInstanceId: f.id },
        })
      ).revision,
    ).toBe(2);
    await expect(
      changeActorEquipment(db as never, f.id, f.owner, "actor", request),
    ).rejects.toThrow("changed");
    await expect(
      readActorEquipment(db as never, f.id, randomUUID(), "actor"),
    ).rejects.toThrow("not found");
    await db.campaignInstance.update({
      where: { id: f.id },
      data: { status: "CONCLUDED" },
    });
    await expect(
      changeActorEquipment(db as never, f.id, f.owner, "actor", {
        ...request,
        expectedRuntimeRevision: 2,
      }),
    ).rejects.toThrow("read-only");
  });
  it("enforces canonical captured Creature slots and leaves rejected retrieval atomic", async () => {
    const f = await seed(db, ["slot:back", "slot:waist"]);
    const before = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.id },
    });
    expect(
      (await readActorEquipment(db as never, f.id, f.owner, "actor")).slots.map(
        (slot) => slot.id,
      ),
    ).toEqual(["slot:back", "slot:waist"]);
    await expect(
      changeActorEquipment(db as never, f.id, f.owner, "actor", {
        expectedRuntimeRevision: 1,
        action: "retrieve",
        itemId: "tool",
        slots: ["slot:hand"],
      }),
    ).rejects.toThrow("does not fit");
    const after = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.id },
    });
    expect(after.revision).toBe(before.revision);
    expect(after.state).toEqual(before.state);
  });
  it("rejects capture changes between read and write without altering runtime", async () => {
    const f = await seed(db);
    const wrapper = {
      campaignInstance: db.campaignInstance,
      $transaction: async (fn: any) => {
        await db.campaignInstance.update({
          where: { id: f.id },
          data: { metadataRevision: { increment: 1 } },
        });
        return db.$transaction(fn);
      },
    };
    await expect(
      changeActorEquipment(wrapper as never, f.id, f.owner, "actor", {
        expectedRuntimeRevision: 1,
        action: "allowance",
        bonusActions: 2,
      }),
    ).rejects.toThrow("capture or status");
    expect(
      (
        await db.campaignInstanceRuntime.findUniqueOrThrow({
          where: { campaignInstanceId: f.id },
        })
      ).revision,
    ).toBe(1);
  });
});
async function seed(db: PrismaClient, equipmentSlots?: string[]) {
  const id = randomUUID(),
    owner = randomUUID(),
    world = randomUUID(),
    wr = randomUUID(),
    ws = randomUUID(),
    campaign = randomUUID(),
    cr = randomUUID(),
    cs = randomUUID(),
    snapshot = randomUUID();
  const fixture = equipmentFixture();
  const records: {
    resourceType: string;
    sourceId: string;
    payload: unknown;
  }[] = [...fixture.records];
  if (equipmentSlots) {
    records.push({
      resourceType: "definitions",
      sourceId: "canonical-creature",
      payload: {
        kind: "creature",
        identity: { id: "canonical-creature" },
        components: { equipmentSlots },
      },
    });
    (
      fixture.state.creatureEmbodiments[0].creature as Record<string, unknown>
    ).definitionId = "canonical-creature";
  }
  const manifest = buildSnapshotManifest(1, records);
  const campaignManifest = buildSnapshotManifest(1, [
    {
      resourceType: "campaign-definition-revision",
      sourceId: cr,
      payload: { name: "Equipment fixture" },
    },
  ]);
  await db.user.create({
    data: { id: owner, displayName: "Equipment GM", role: "GM" },
  });
  await db.worldDefinition.create({
    data: { id: world, name: "Equipment fixture", ownerUserId: owner },
  });
  await db.worldDefinitionRevision.create({
    data: {
      id: wr,
      worldDefinitionId: world,
      revisionNumber: 1,
      name: "World",
      content: {},
      contentHash: manifest.contentHash,
    },
  });
  await db.worldDefinitionSnapshot.create({
    data: {
      id: ws,
      worldDefinitionId: world,
      worldDefinitionRevisionId: wr,
      manifest: manifest as unknown as Prisma.InputJsonValue,
      contentHash: manifest.contentHash,
    },
  });
  await db.campaignDefinition.create({
    data: {
      id: campaign,
      worldDefinitionId: world,
      name: "Campaign",
      ownerUserId: owner,
    },
  });
  await db.campaignDefinitionRevision.create({
    data: {
      id: cr,
      campaignDefinitionId: campaign,
      worldDefinitionId: world,
      capturedWorldSnapshotId: ws,
      revisionNumber: 1,
      name: "Campaign",
      content: {},
      contentHash: campaignManifest.contentHash,
    },
  });
  await db.campaignDefinitionSnapshot.create({
    data: {
      id: cs,
      campaignDefinitionId: campaign,
      campaignDefinitionRevisionId: cr,
      capturedWorldSnapshotId: ws,
      manifest: campaignManifest as unknown as Prisma.InputJsonValue,
      contentHash: campaignManifest.contentHash,
    },
  });
  await db.campaignInstance.create({
    data: {
      id,
      campaignDefinitionId: campaign,
      name: "Equipment Instance",
      ownerUserId: owner,
    },
  });
  await db.campaignInstanceSnapshot.create({
    data: {
      id: snapshot,
      campaignInstanceId: id,
      campaignDefinitionId: campaign,
      campaignDefinitionSnapshotId: cs,
      worldDefinitionSnapshotId: ws,
      snapshotNumber: 1,
      reason: "INITIAL",
      manifest: campaignManifest as unknown as Prisma.InputJsonValue,
      contentHash: campaignManifest.contentHash,
    },
  });
  await db.campaignInstance.update({
    where: { id },
    data: { currentSnapshotId: snapshot },
  });
  await db.campaignInstanceRuntime.create({
    data: {
      campaignInstanceId: id,
      campaignInstanceSnapshotId: snapshot,
      state: fixture.state as unknown as Prisma.InputJsonValue,
    },
  });
  if (!equipmentSlots)
    await writeFile(
      "/tmp/aow-B08-equipment-seed.json",
      JSON.stringify({
        ownerId: owner,
        campaignId: campaign,
        instanceId: id,
        actorId: "actor",
      }),
      { mode: 0o600 },
    );
  return { id, owner };
}
