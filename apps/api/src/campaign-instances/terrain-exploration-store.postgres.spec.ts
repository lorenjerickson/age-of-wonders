import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  applyTerrainWrites,
  createTerrainVolume,
  terrainShapePreset,
} from "@aow/common";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
} from "../domain/snapshot-manifest";
import { TerrainExplorationStore } from "./terrain-exploration-store.service";
const url = process.env.TERRAIN_EXPLORATION_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("exploration PostgreSQL persistence", () => {
  let db: PrismaClient, store: TerrainExplorationStore;
  beforeAll(async () => {
    if (!url || !/test|verify|disposable/i.test(new URL(url).pathname))
      throw new Error("Use a disposable exploration test database.");
    db = new PrismaClient({ datasourceUrl: url });
    await db.$connect();
    store = new TerrainExplorationStore(db as never);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("persists across clients, preserves memory, and makes identical retries write-free", async () => {
    const f = await seed(db);
    const first = await store.projectAndStore(f.decision);
    expect(first.status).toBe("ready");
    const row = await db.campaignTerrainExploration.findFirstOrThrow({
      where: { campaignInstanceId: f.id },
    });
    expect(await store.projectAndStore(f.decision)).toEqual(first);
    expect(
      await db.campaignTerrainExploration.findFirst({
        where: { campaignInstanceId: f.id },
      }),
    ).toEqual(row);
    await db.campaignInstanceRuntime.update({
      where: { campaignInstanceId: f.id },
      data: { revision: 2 },
    });
    const another = new PrismaClient({ datasourceUrl: url });
    try {
      const result = await new TerrainExplorationStore(
        another as never,
      ).projectAndStore({
        ...f.decision,
        context: { ...f.decision.context, runtimeRevision: 2 },
        visibleSurfaceKeys: [],
      });
      expect(result.status).toBe("ready");
      if (result.status === "ready") {
        expect(result.projection.rememberedSurfaces).toHaveLength(1);
        expect(result.projection.visibleSurfaces).toEqual([]);
        expect(JSON.stringify(result)).not.toMatch(
          /gmNotes|Secret|exploration|lastSeen/,
        );
      }
    } finally {
      await another.$disconnect();
    }
    expect(
      (
        await db.campaignInstanceRuntime.findUniqueOrThrow({
          where: { campaignInstanceId: f.id },
        })
      ).revision,
    ).toBe(2);
  });
  it("serializes competing observations and accepts exactly one conflicting result", async () => {
    const f = await seed(db);
    const results = await Promise.all([
      store.projectAndStore(f.decision),
      store.projectAndStore({ ...f.decision, visibleSurfaceKeys: [] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      "awaiting-visibility",
      "ready",
    ]);
    expect(
      await db.campaignTerrainExploration.count({
        where: { campaignInstanceId: f.id },
      }),
    ).toBe(1);
  });
  it("waits for an in-flight runtime mutation, then rejects the stale decision", async () => {
    const f = await seed(db);
    let release!: () => void, acquired!: () => void;
    const hold = new Promise<void>((r) => (release = r)),
      locked = new Promise<void>((r) => (acquired = r));
    const mutation = db.$transaction(
      async (tx) => {
        await tx.campaignInstanceRuntime.update({
          where: { campaignInstanceId: f.id },
          data: { revision: 2 },
        });
        acquired();
        await hold;
      },
      { timeout: 10000 },
    );
    await locked;
    const attempt = store.projectAndStore(f.decision);
    try {
      let waiting = false;
      for (let n = 0; n < 80; n++) {
        const rows = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%CampaignInstanceRuntime%' AND query LIKE '%FOR UPDATE%') AS waiting`;
        if (rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
      await mutation;
    }
    expect(await attempt).toEqual({ status: "awaiting-visibility" });
    expect(
      await db.campaignTerrainExploration.count({
        where: { campaignInstanceId: f.id },
      }),
    ).toBe(0);
  }, 15000);
  it("rejects absent actors, foreign Instances, stale captures, and corrupt payloads without writes", async () => {
    const f = await seed(db),
      other = await seed(db);
    for (const change of [
      { campaignInstanceId: other.id },
      { snapshotId: other.snapshot },
      { observerId: "missing" },
      { locationId: "missing" },
      { runtimeRevision: 2 },
    ])
      expect(
        await store.projectAndStore({
          ...f.decision,
          context: { ...f.decision.context, ...change },
        }),
      ).toEqual({ status: "awaiting-visibility" });
    expect(
      await db.campaignTerrainExploration.count({
        where: { campaignInstanceId: f.id },
      }),
    ).toBe(0);
    await store.projectAndStore(f.decision);
    await db.campaignTerrainExploration.updateMany({
      where: { campaignInstanceId: f.id },
      data: { contentHash: "0".repeat(64) },
    });
    expect(await store.projectAndStore(f.decision)).toEqual({
      status: "awaiting-visibility",
    });
  });
  it("retains historical memory but begins empty when adoption or restore creates a new snapshot", async () => {
    const f = await seed(db);
    await store.projectAndStore(f.decision);
    const previous = await db.campaignInstanceSnapshot.findUniqueOrThrow({
      where: { id: f.snapshot },
    });
    const next = await db.campaignInstanceSnapshot.create({
      data: {
        campaignInstanceId: f.id,
        campaignDefinitionId: previous.campaignDefinitionId,
        campaignDefinitionSnapshotId: previous.campaignDefinitionSnapshotId,
        worldDefinitionSnapshotId: previous.worldDefinitionSnapshotId,
        snapshotNumber: 2,
        predecessorSnapshotId: f.snapshot,
        reason: "RESTORE",
        manifest: previous.manifest as Prisma.InputJsonValue,
        contentHash: previous.contentHash,
      },
    });
    await db.$transaction(async (tx) => {
      await tx.campaignInstanceRuntime.update({
        where: { campaignInstanceId: f.id },
        data: { campaignInstanceSnapshotId: next.id, revision: 2 },
      });
      await tx.campaignInstance.update({
        where: { id: f.id },
        data: { currentSnapshotId: next.id },
      });
    });
    expect(await store.projectAndStore(f.decision)).toEqual({
      status: "awaiting-visibility",
    });
    const result = await store.projectAndStore({
      ...f.decision,
      context: {
        ...f.decision.context,
        snapshotId: next.id,
        runtimeRevision: 2,
      },
      visibleSurfaceKeys: [],
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready")
      expect(result.projection.rememberedSurfaces).toEqual([]);
    expect(
      await db.campaignTerrainExploration.count({
        where: { campaignInstanceId: f.id },
      }),
    ).toBe(2);
  });
  it("enforces database scope constraints and rolls back failed storage", async () => {
    const f = await seed(db),
      other = await seed(db);
    await store.projectAndStore(f.decision);
    const row = await db.campaignTerrainExploration.findFirstOrThrow({
      where: { campaignInstanceId: f.id },
    });
    await expect(
      db.campaignTerrainExploration.updateMany({
        where: { campaignInstanceId: f.id },
        data: { runtimeRevision: 0 },
      }),
    ).rejects.toThrow();
    await expect(
      db.campaignTerrainExploration.updateMany({
        where: { campaignInstanceId: f.id },
        data: { payload: {} },
      }),
    ).rejects.toThrow();
    const payload = row.payload as Record<string, unknown>;
    await expect(
      db.campaignTerrainExploration.create({
        data: {
          ...row,
          campaignInstanceId: other.id,
          payload: {
            ...payload,
            context: {
              ...(payload.context as object),
              campaignInstanceId: other.id,
            },
          } as Prisma.InputJsonValue,
        },
      }),
    ).rejects.toThrow();
    // Force the write to fail inside the real transaction, after read/merge, without modifying production tables.
    const broken = new TerrainExplorationStore({
      $transaction: (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: object,
      ) =>
        db.$transaction(
          (tx) =>
            callback(
              new Proxy(tx, {
                get(target, key) {
                  if (key === "campaignTerrainExploration")
                    return {
                      ...target.campaignTerrainExploration,
                      upsert: async (
                        args: Parameters<
                          typeof target.campaignTerrainExploration.upsert
                        >[0],
                      ) => {
                        await target.campaignTerrainExploration.upsert(args);
                        throw new Error("Injected storage failure");
                      },
                    };
                  return Reflect.get(target, key);
                },
              }),
            ),
          options,
        ),
    } as never);
    await db.campaignInstanceRuntime.update({
      where: { campaignInstanceId: f.id },
      data: { revision: 2 },
    });
    await expect(
      broken.projectAndStore({
        ...f.decision,
        context: { ...f.decision.context, runtimeRevision: 2 },
        visibleSurfaceKeys: [],
      }),
    ).rejects.toThrow("Injected storage failure");
    expect(
      await db.campaignTerrainExploration.findFirst({
        where: { campaignInstanceId: f.id },
      }),
    ).toEqual(row);
  });
});
async function seed(db: PrismaClient) {
  const id = randomUUID(),
    snapshot = randomUUID(),
    location = randomUUID(),
    actor = randomUUID();
  const world = randomUUID(),
    wr = randomUUID(),
    ws = randomUUID(),
    campaign = randomUUID(),
    cr = randomUUID(),
    cs = randomUUID();
  const volume = applyTerrainWrites(
    createTerrainVolume({ x: 10, y: 10, z: 10 }, [
      {
        key: "terrain:stone",
        revision: 1,
        name: "Secret material label",
        terrainType: "terrain:stone",
      },
    ]),
    [
      {
        address: { x: 1, y: 1, z: 0 },
        cell: {
          materialKey: "terrain:stone",
          shape: terrainShapePreset("cube"),
        },
      },
    ],
  ).volume;
  const map = {
    ...volume,
    kind: "isometric",
    chunks: volume.chunks.map((chunk) => ({
      address: chunk.address,
      contentHash: canonicalJsonHash(chunk),
    })),
  };
  const manifest = buildSnapshotManifest(1, [
    {
      resourceType: "locations",
      sourceId: location,
      payload: { name: "Courtyard", map },
    },
    ...volume.chunks.map((chunk) => ({
      resourceType: "location-terrain-chunks",
      sourceId: canonicalJsonHash(chunk),
      payload: chunk,
    })),
  ]);
  const campaignManifest = buildSnapshotManifest(1, [
    {
      resourceType: "campaign-definition-revision",
      sourceId: cr,
      payload: { name: "Campaign" },
    },
  ]);
  await db.worldDefinition.create({ data: { id: world, name: "Test world" } });
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
    data: { id: campaign, worldDefinitionId: world, name: "Test campaign" },
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
    data: { id, campaignDefinitionId: campaign, name: "Test instance" },
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
      state: {
        formatVersion: 1,
        preparation: {},
        plotProgress: [],
        placementRealizations: [],
        itemInstances: [],
        creatureEmbodiments: [
          {
            campaignInstanceId: id,
            runtimeCreatureId: actor,
            creature: {
              name: "Hero",
              currentLocationId: location,
              terrainPosition: { x: 1.5, y: 1.5, z: 1 },
              gmNotes: "Secret actor note",
            },
          },
        ],
      },
    },
  });
  return {
    id,
    snapshot,
    decision: {
      context: {
        campaignInstanceId: id,
        snapshotId: snapshot,
        locationId: location,
        observerId: actor,
        runtimeRevision: 1,
      },
      visibleSurfaceKeys: ["1,1,0/solid/0"],
      visibleActorIds: [actor],
    },
  };
}
