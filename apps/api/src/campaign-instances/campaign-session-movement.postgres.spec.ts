import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  applyTerrainWrites,
  createTerrainVolume,
  starterMovementRules,
  terrainShapePreset,
  type WorldRule,
  type CampaignInstanceRuntimeState,
  type WorldRuleExecution,
} from "@aow/common";
import {
  buildSnapshotManifest,
  canonicalJsonHash,
} from "../domain/snapshot-manifest";
import { CampaignSessionMovementService } from "./campaign-session-movement.service";

const url = process.env.MOVEMENT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("Session movement PostgreSQL boundary", () => {
  let db: PrismaClient;
  let service: CampaignSessionMovementService;
  beforeAll(async () => {
    if (!url || !/test|verify|disposable/i.test(new URL(url).pathname))
      throw new Error("Use a disposable movement test database.");
    db = new PrismaClient({ datasourceUrl: url });
    await db.$connect();
    service = new CampaignSessionMovementService(db as never);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  beforeEach(async () => {
    await db.campaignInstanceSession.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
  });

  it("previews without mutation, commits the captured chain once, and preserves causal history on retry", async () => {
    const f = await seed(db);
    const before = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.scope.instanceId },
    });
    const proposal = await service.preview(f.scope, f.request);
    expect(proposal.status).toBe("pending");
    expect(proposal.effects).toContainEqual(
      expect.stringContaining("change actor position"),
    );
    expect(await service.preview(f.scope, f.request)).toEqual(proposal);
    expect(
      await db.campaignInstanceRuntime.findUniqueOrThrow({
        where: { campaignInstanceId: f.scope.instanceId },
      }),
    ).toEqual(before);
    const first = await service.decide(
      f.scope,
      proposal.id,
      "approved",
      "approval-key-one",
    );
    expect(first.status).toBe("approved");
    const state = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.scope.instanceId },
    });
    expect(state.revision).toBe(2);
    const actor = (state.state as unknown as CampaignInstanceRuntimeState)
      .creatureEmbodiments[0].creature;
    expect(actor.terrainPosition).toEqual(f.request.destination);
    expect(actor.extensions?.["aow:rules"]).toMatchObject({ "aow:moves": 1 });
    const events = await db.campaignSessionEvent.findMany({
      where: { sessionId: f.scope.sessionId },
      orderBy: { sequence: "asc" },
    });
    expect(events.length).toBeGreaterThan(2);
    expect(events[1].causedBySequence).toBe(events[0].sequence);
    expect(
      await service.decide(
        f.scope,
        proposal.id,
        "approved",
        "approval-key-one",
      ),
    ).toEqual(first);
    expect(
      await db.campaignSessionEvent.count({
        where: { sessionId: f.scope.sessionId },
      }),
    ).toBe(events.length);
    await expect(
      service.preview(f.scope, {
        ...f.request,
        destination: { x: 2.5, y: 2.5, z: 1 },
      }),
    ).rejects.toThrow("submission key");
  });

  it("keeps rule-free Worlds inert, blocks paused/foreign access, and rejects without applying effects", async () => {
    const empty = await seed(db, []);
    const noOp = await service.preview(empty.scope, empty.request);
    expect(noOp.status).toBe("no-op");
    expect(noOp.canApprove).toBe(false);
    expect(
      (
        await db.campaignInstanceRuntime.findUniqueOrThrow({
          where: { campaignInstanceId: empty.scope.instanceId },
        })
      ).revision,
    ).toBe(1);
    await expect(
      service.context({ ...empty.scope, userId: randomUUID() }),
    ).rejects.toThrow("not found");
    await db.campaignInstanceSession.update({
      where: { id: empty.scope.sessionId },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
    await expect(
      service.preview(empty.scope, {
        ...empty.request,
        idempotencyKey: "paused-request",
      }),
    ).rejects.toThrow("Resume");
    const f = await seed(db);
    const proposal = await service.preview(f.scope, f.request);
    await service.decide(f.scope, proposal.id, "rejected", "rejection-key");
    const runtime = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.scope.instanceId },
    });
    expect(runtime.revision).toBe(1);
    expect(
      (runtime.state as unknown as CampaignInstanceRuntimeState)
        .creatureEmbodiments[0].creature.terrainPosition,
    ).toEqual({ x: 0.5, y: 0.5, z: 1 });
  });

  it("allows at most one competing approval and requires fresh preview after runtime changes", async () => {
    const f = await seed(db);
    const a = await service.preview(f.scope, f.request);
    const b = await service.preview(f.scope, {
      ...f.request,
      idempotencyKey: "second-preview",
      destination: { x: 2.5, y: 0.5, z: 1 },
    });
    const competing = await Promise.allSettled([
      service.decide(f.scope, a.id, "approved", "decision-first"),
      service.decide(f.scope, b.id, "approved", "decision-second"),
    ]);
    expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const stale = competing[0].status === "fulfilled" ? b : a;
    await expect(
      service.decide(f.scope, stale.id, "approved", "fresh-decision-key"),
    ).rejects.toThrow(/changed|preview/i);
    expect(
      (await service.context(f.scope)).proposals.find((p) => p.id === stale.id)
        ?.canApprove,
    ).toBe(false);
    expect(
      (
        await db.campaignInstanceRuntime.findUniqueOrThrow({
          where: { campaignInstanceId: f.scope.instanceId },
        })
      ).revision,
    ).toBe(2);
  });

  it("fails runaway chains without partial writes and rolls back a failed event journal", async () => {
    const cycle: WorldRule = {
      formatVersion: 1,
      id: randomUUID(),
      name: "Cyclic rule",
      revision: 1,
      lifecycle: "enabled",
      priority: 0,
      trigger: { event: "aow:movement-declared", version: 1 },
      effects: [{ kind: "emit", event: "aow:movement-declared", context: {} }],
      audit: { createdBy: "GM", updatedAt: new Date().toISOString() },
    };
    const f = await seed(db, [cycle]);
    expect((await service.preview(f.scope, f.request)).status).toBe("failed");
    expect(
      (
        await db.campaignInstanceRuntime.findUniqueOrThrow({
          where: { campaignInstanceId: f.scope.instanceId },
        })
      ).revision,
    ).toBe(1);
    await db.campaignInstanceSession.update({
      where: { id: f.scope.sessionId },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
    const healthy = await seed(db);
    const proposal = await service.preview(healthy.scope, healthy.request);
    const broken = new CampaignSessionMovementService({
      $transaction: (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: object,
      ) =>
        db.$transaction(
          (tx) =>
            callback(
              new Proxy(tx, {
                get(target, key) {
                  if (key === "campaignSessionEvent")
                    return {
                      ...target.campaignSessionEvent,
                      create: () =>
                        Promise.reject(new Error("Injected journal failure")),
                    };
                  return Reflect.get(target, key) as unknown;
                },
              }),
            ),
          options,
        ),
    } as never);
    await expect(
      broken.decide(
        healthy.scope,
        proposal.id,
        "approved",
        "rollback-decision",
      ),
    ).rejects.toThrow("Injected journal failure");
    expect(
      (
        await db.campaignInstanceRuntime.findUniqueOrThrow({
          where: { campaignInstanceId: healthy.scope.instanceId },
        })
      ).revision,
    ).toBe(1);
    expect(
      (
        await db.campaignSessionMovementProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).status,
    ).toBe("pending");
    expect(
      await db.campaignSessionEvent.count({
        where: { sessionId: healthy.scope.sessionId },
      }),
    ).toBe(0);
  });

  it("persists dice entropy across preview retries and uses captured rules despite authoring changes", async () => {
    const roll: WorldRule = {
      formatVersion: 1,
      id: randomUUID(),
      name: "Recorded die",
      revision: 1,
      lifecycle: "enabled",
      priority: 50,
      trigger: { event: "aow:movement-declared", version: 1 },
      effects: [
        {
          kind: "roll",
          count: 1,
          sides: 6,
          resultEvent: "aow:roll-result",
          context: {},
        },
      ],
      audit: { createdBy: "GM", updatedAt: new Date().toISOString() },
    };
    const f = await seed(db, [roll]);
    const proposal = await service.preview(f.scope, f.request);
    const row = await db.campaignSessionMovementProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    expect((row.result as unknown as WorldRuleExecution).rolls).toHaveLength(1);
    const previous = await db.worldDefinitionRevision.findUniqueOrThrow({
      where: { id: f.worldRevision },
    });
    const next = await db.worldDefinitionRevision.create({
      data: {
        worldDefinitionId: previous.worldDefinitionId,
        revisionNumber: 2,
        predecessorRevisionId: previous.id,
        name: "New World rules",
        content: { authoringChanges: "different rules" },
        contentHash: "new-head",
      },
    });
    await db.worldDefinition.update({
      where: { id: previous.worldDefinitionId },
      data: { currentRevisionId: next.id },
    });
    expect(await service.preview(f.scope, f.request)).toEqual(proposal);
    expect(
      (
        await db.campaignSessionMovementProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).result,
    ).toEqual(row.result);
    expect((await service.context(f.scope)).capturedRules[0].name).toBe(
      "Recorded die",
    );
  });
  it("invalidates preview on snapshot adoption and rejects cross-parent decisions", async () => {
    const f = await seed(db);
    const proposal = await service.preview(f.scope, f.request);
    await expect(
      service.decide(
        { ...f.scope, definitionId: randomUUID() },
        proposal.id,
        "approved",
        "foreign-decision",
      ),
    ).rejects.toThrow("not found");
    await db.campaignInstanceSession.update({
      where: { id: f.scope.sessionId },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
    await expect(
      service.decide(f.scope, proposal.id, "approved", "paused-decision"),
    ).rejects.toThrow("Resume");
    const previous = await db.campaignInstanceSnapshot.findFirstOrThrow({
      where: { campaignInstanceId: f.scope.instanceId },
    });
    const snapshot = await db.campaignInstanceSnapshot.create({
      data: {
        campaignInstanceId: f.scope.instanceId,
        campaignDefinitionId: previous.campaignDefinitionId,
        campaignDefinitionSnapshotId: previous.campaignDefinitionSnapshotId,
        worldDefinitionSnapshotId: previous.worldDefinitionSnapshotId,
        snapshotNumber: 2,
        predecessorSnapshotId: previous.id,
        reason: "RESTORE",
        manifest: previous.manifest as Prisma.InputJsonValue,
        contentHash: previous.contentHash,
      },
    });
    await db.$transaction(async (tx) => {
      await tx.campaignInstanceRuntime.update({
        where: { campaignInstanceId: f.scope.instanceId },
        data: {
          campaignInstanceSnapshotId: snapshot.id,
          revision: { increment: 1 },
        },
      });
      await tx.campaignInstance.update({
        where: { id: f.scope.instanceId },
        data: { currentSnapshotId: snapshot.id },
      });
      await tx.campaignInstanceSession.update({
        where: { id: f.scope.sessionId },
        data: { status: "ACTIVE", resumedAt: new Date() },
      });
    });
    await expect(
      service.decide(f.scope, proposal.id, "approved", "snapshot-decision"),
    ).rejects.toThrow("captured rules changed");
    expect(
      await db.campaignSessionEvent.count({
        where: { sessionId: f.scope.sessionId },
      }),
    ).toBe(0);
  });

  it("names another affected actor truthfully and journals emitted-event-only approvals", async () => {
    const rule: WorldRule = {
      formatVersion: 1,
      id: randomUUID(),
      name: "Move companion",
      revision: 1,
      lifecycle: "enabled",
      priority: 0,
      trigger: { event: "aow:movement-declared", version: 1 },
      effects: [
        {
          kind: "move",
          target: {
            entity: { kind: "literal", value: "companion" },
            field: "position",
          },
          value: { kind: "context", key: "destination" },
        },
      ],
      audit: { createdBy: "GM", updatedAt: new Date().toISOString() },
    };
    const f = await seed(db, [rule]);
    const runtime = await db.campaignInstanceRuntime.findUniqueOrThrow({
      where: { campaignInstanceId: f.scope.instanceId },
    });
    const state = runtime.state as unknown as CampaignInstanceRuntimeState;
    const companion = {
      ...state.creatureEmbodiments[0],
      runtimeCreatureId: "companion",
      runtimeEntityId: "companion-entity",
      creature: {
        ...state.creatureEmbodiments[0].creature,
        name: "Companion",
        entityId: "companion-entity",
        identity: {
          ...state.creatureEmbodiments[0].creature.identity,
          id: "companion",
        },
      },
    };
    await db.campaignInstanceRuntime.update({
      where: { campaignInstanceId: f.scope.instanceId },
      data: {
        state: {
          ...state,
          creatureEmbodiments: [...state.creatureEmbodiments, companion],
        } as unknown as Prisma.InputJsonValue,
      },
    });
    const proposal = await service.preview(f.scope, f.request);
    expect(proposal.status).toBe("pending");
    expect(proposal.explanation).toContain("declaring actor stays in place");
    expect(proposal.effects[0]).toContain("Companion");
    await service.decide(
      f.scope,
      proposal.id,
      "approved",
      "companion-decision",
    );
    const after = (
      await db.campaignInstanceRuntime.findUniqueOrThrow({
        where: { campaignInstanceId: f.scope.instanceId },
      })
    ).state as unknown as CampaignInstanceRuntimeState;
    expect(after.creatureEmbodiments[0].creature.terrainPosition).toEqual({
      x: 0.5,
      y: 0.5,
      z: 1,
    });
    expect(after.creatureEmbodiments[1].creature.terrainPosition).toEqual(
      f.request.destination,
    );
    await db.campaignInstanceSession.update({
      where: { id: f.scope.sessionId },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
    const eventOnly = {
      ...rule,
      id: randomUUID(),
      name: "Declare a signal",
      effects: [{ kind: "emit" as const, event: "aow:signal", context: {} }],
    };
    const e = await seed(db, [eventOnly]);
    const emitted = await service.preview(e.scope, e.request);
    expect(emitted.status).toBe("pending");
    await service.decide(e.scope, emitted.id, "approved", "signal-decision");
    expect(
      await db.campaignSessionEvent.count({
        where: { sessionId: e.scope.sessionId },
      }),
    ).toBe(3);
  });
});

async function seed(db: PrismaClient, selectedRules?: WorldRule[]) {
  const id = randomUUID(),
    snapshot = randomUUID(),
    location = randomUUID(),
    actor = randomUUID(),
    entity = randomUUID(),
    owner = randomUUID(),
    session = randomUUID();
  const world = randomUUID(),
    wr = randomUUID(),
    ws = randomUUID(),
    campaign = randomUUID(),
    cr = randomUUID(),
    cs = randomUUID();
  const rules =
    selectedRules ??
    starterMovementRules({
      budgetFeet: 30,
      ids: Array.from({ length: 6 }, () => randomUUID()),
      createdBy: owner,
      updatedAt: new Date().toISOString(),
    });
  const volume = applyTerrainWrites(
    createTerrainVolume({ x: 4, y: 4, z: 3 }, [
      {
        key: "terrain:stone",
        revision: 1,
        name: "Stone",
        terrainType: "terrain:stone",
      },
    ]),
    Array.from({ length: 16 }, (_, i) => ({
      address: { x: i % 4, y: Math.floor(i / 4), z: 0 },
      cell: {
        materialKey: "terrain:stone" as const,
        shape: terrainShapePreset("cube"),
      },
    })),
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
    ...rules.map((rule) => ({
      resourceType: "world-rules",
      sourceId: rule.id,
      payload: rule,
    })),
  ]);
  const campaignManifest = buildSnapshotManifest(1, [
    {
      resourceType: "campaign-definition-revision",
      sourceId: cr,
      payload: { name: "Campaign" },
    },
  ]);
  await db.user.create({
    data: { id: owner, displayName: "Morgan", role: "GM" },
  });
  await db.worldDefinition.create({
    data: { id: world, name: "Test world", ownerUserId: owner },
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
      name: "Test campaign",
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
      name: "Test instance",
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
            runtimeEntityId: entity,
            source: { kind: "instance-created", reason: "Test actor" },
            creature: {
              identity: {
                id: actor,
                version: { revision: 1, updatedAt: new Date().toISOString() },
              },
              entityId: entity,
              name: "Hero",
              currentLocationId: location,
              terrainPosition: { x: 0.5, y: 0.5, z: 1 },
            },
          },
        ],
      },
    },
  });
  await db.campaignInstanceSession.create({
    data: {
      id: session,
      campaignInstanceId: id,
      name: "Movement test",
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });
  return {
    scope: {
      definitionId: campaign,
      instanceId: id,
      sessionId: session,
      userId: owner,
    },
    request: {
      actorId: actor,
      destination: { x: 1.5, y: 0.5, z: 1 },
      expectedRuntimeRevision: 1,
      idempotencyKey: randomUUID(),
    },
    worldRevision: wr,
  };
}
