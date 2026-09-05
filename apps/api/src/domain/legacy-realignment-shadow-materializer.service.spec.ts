import type { PrismaService } from "../prisma/prisma.service";
import {
  createManyIfAny,
  LegacyRealignmentShadowMaterializerService,
} from "./legacy-realignment-shadow-materializer.service";

function sourceRows(withRuntime = true) {
  return [
    {
      resource: "locations",
      id: "opaque-world",
      kind: "world",
      name: "Glasswake",
      revision: 2,
      data: {
        identity: { id: "opaque-world" },
        name: "Glasswake",
        kind: "world",
        placement: { kind: "root" },
      },
    },
    {
      resource: "campaigns",
      id: "opaque-campaign",
      kind: null,
      name: "Ashes at Dawn",
      revision: 3,
      data: {
        identity: { id: "opaque-campaign" },
        name: "Ashes at Dawn",
        worldId: "opaque-world",
      },
    },
    ...(withRuntime
      ? [
          {
            resource: "games",
            id: "opaque-game",
            kind: "game-state",
            name: "Ashes at Dawn",
            revision: 4,
            data: {
              campaign: { identity: { id: "opaque-campaign" } },
              events: [{ type: "arrival" }],
            },
          },
        ]
      : []),
  ];
}

function prismaMock(
  options: { blocking?: boolean; withRuntime?: boolean } = {},
) {
  const domainRows = options.blocking
    ? [
        {
          ...sourceRows(false)[1],
          data: {
            identity: { id: "opaque-campaign" },
            name: "Broken Campaign",
            worldId: "missing-world",
          },
        },
      ]
    : sourceRows(options.withRuntime ?? true);
  const tx = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "gm-owner", role: "GM" }),
    },
    domainRecord: { findMany: jest.fn().mockResolvedValue(domainRows) },
    campaignMembership: { findMany: jest.fn().mockResolvedValue([]) },
    campaignInvitation: { findMany: jest.fn().mockResolvedValue([]) },
    characterCreationDraft: { findMany: jest.fn().mockResolvedValue([]) },
    worldDefinition: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    worldDefinitionRevision: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    worldDefinitionSnapshot: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignDefinition: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignDefinitionRevision: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    campaignDefinitionSnapshot: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignInstance: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignInstanceSnapshot: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    campaignInstanceRuntime: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    legacyIdentityMap: {
      createMany: jest.fn().mockResolvedValue({ count: 9 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    installationRolloutState: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn((args: unknown) => {
        void args;
        return Promise.resolve({ id: "opaque-rollout" });
      }),
      update: jest.fn((args: unknown) => {
        void args;
        return Promise.resolve({ id: "opaque-rollout" });
      }),
    },
    installationRolloutAudit: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  return { prisma, tx };
}

describe("LegacyRealignmentShadowMaterializerService", () => {
  it("defaults to a read-only dry run and emits counts without opaque identifiers", async () => {
    const { prisma, tx } = prismaMock();
    const result = await new LegacyRealignmentShadowMaterializerService(
      prisma as unknown as PrismaService,
    ).run({
      apply: false,
      capturedAt: "2026-09-04T12:00:00.000Z",
      ownerUserId: "gm-owner",
    });

    expect(result.mode).toBe("dry-run");
    expect(result.applied).toBe(false);
    expect(result.readyForApply).toBe(true);
    expect(result.planned).toMatchObject({
      worldDefinitions: 1,
      campaignDefinitions: 1,
      campaignInstances: 1,
      campaignInstanceRuntimes: 1,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.worldDefinition.createMany).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/opaque-|postgres|email|phone/i);
  });

  it("refuses all shadow writes when preflight is blocking and audits the refusal", async () => {
    const { prisma, tx } = prismaMock({ blocking: true });
    const result = await new LegacyRealignmentShadowMaterializerService(
      prisma as unknown as PrismaService,
    ).run({
      apply: true,
      capturedAt: "2026-09-04T12:00:00.000Z",
      ownerUserId: "gm-owner",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("blocked");
    expect(result.applied).toBe(false);
    expect(result.blockingIssueCount).toBeGreaterThan(0);
    expect(tx.worldDefinition.createMany).not.toHaveBeenCalled();
    const blockedUpsert = tx.installationRolloutState.upsert.mock
      .calls[0]?.[0] as
      { create: { phase: string }; update: { phase: string } } | undefined;
    expect(blockedUpsert?.create.phase).toBe("BLOCKED");
    expect(blockedUpsert?.update.phase).toBe("BLOCKED");
    expect(tx.installationRolloutAudit.create).toHaveBeenCalledTimes(1);
  });

  it("applies every shadow row and identity map in one transaction", async () => {
    const { prisma, tx } = prismaMock();
    const result = await new LegacyRealignmentShadowMaterializerService(
      prisma as unknown as PrismaService,
    ).run({
      apply: true,
      capturedAt: "2026-09-04T12:00:00.000Z",
      ownerUserId: "gm-owner",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("applied");
    expect(result.applied).toBe(true);
    expect(tx.worldDefinition.createMany).toHaveBeenCalledTimes(1);
    expect(tx.worldDefinitionRevision.createMany).toHaveBeenCalledTimes(1);
    expect(tx.worldDefinitionSnapshot.createMany).toHaveBeenCalledTimes(1);
    expect(tx.campaignDefinition.createMany).toHaveBeenCalledTimes(1);
    expect(tx.campaignDefinitionRevision.createMany).toHaveBeenCalledTimes(1);
    expect(tx.campaignDefinitionSnapshot.createMany).toHaveBeenCalledTimes(1);
    expect(tx.campaignInstance.createMany).toHaveBeenCalledTimes(1);
    expect(tx.campaignInstanceSnapshot.createMany).toHaveBeenCalledTimes(1);
    expect(tx.campaignInstanceRuntime.createMany).toHaveBeenCalledTimes(1);
    expect(tx.legacyIdentityMap.createMany).toHaveBeenCalledTimes(1);
    expect(tx.installationRolloutAudit.create).toHaveBeenCalledTimes(2);
    expect(tx.worldDefinitionRevision.updateMany).not.toHaveBeenCalled();
    expect(tx.campaignDefinitionRevision.updateMany).not.toHaveBeenCalled();
    expect(tx.campaignInstanceSnapshot.updateMany).not.toHaveBeenCalled();
    expect(tx.worldDefinition.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ ownerUserId: "gm-owner" })],
      }),
    );
    expect(tx.worldDefinitionRevision.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ createdByUserId: "gm-owner" })],
      }),
    );
    expect(tx.campaignDefinition.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ ownerUserId: "gm-owner" })],
      }),
    );
    expect(tx.campaignDefinitionRevision.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ createdByUserId: "gm-owner" })],
      }),
    );
    expect(tx.campaignInstance.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ createdByUserId: "gm-owner" })],
      }),
    );
    expect(tx.campaignInstanceSnapshot.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ createdByUserId: "gm-owner" })],
      }),
    );
    const auditCalls = tx.installationRolloutAudit.create.mock.calls as unknown[][];
    const finalAudit = auditCalls.at(-1)?.[0] as
      | { data: { actorUserId?: string } }
      | undefined;
    expect(finalAudit?.data.actorUserId).toBe("gm-owner");
    const completedUpdate = tx.installationRolloutState.update.mock
      .calls[0]?.[0] as { data: { phase: string } } | undefined;
    expect(completedUpdate?.data).toMatchObject({
      phase: "READY_FOR_CUTOVER",
      completedAt: null,
    });
  });

  it("materializes authored-only campaigns without inventing an Instance", async () => {
    const { prisma, tx } = prismaMock({ withRuntime: false });
    const result = await new LegacyRealignmentShadowMaterializerService(
      prisma as unknown as PrismaService,
    ).run({
      apply: true,
      capturedAt: "2026-09-04T12:00:00.000Z",
      ownerUserId: "gm-owner",
    });

    expect(result.planned.campaignInstances).toBe(0);
    expect(tx.campaignInstance.createMany).not.toHaveBeenCalled();
    expect(tx.campaignInstanceSnapshot.createMany).not.toHaveBeenCalled();
    expect(tx.campaignInstanceRuntime.createMany).not.toHaveBeenCalled();
  });

  it("accepts a byte-equivalent deterministic rerun and rejects stale shadow rows", async () => {
    const desired = [{ id: "shadow-row", contentHash: "expected" }];
    const equivalent = {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([...desired]),
    };
    await expect(createManyIfAny(equivalent, desired)).resolves.toBeUndefined();

    const stale = {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "shadow-row", contentHash: "stale" }]),
    };
    await expect(createManyIfAny(stale, desired)).rejects.toThrow(
      "Existing shadow data differs from the deterministic migration plan.",
    );

    const earlierImmutable = {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([
        { id: "immutable-row", createdByUserId: null, contentHash: "same" },
      ]),
    };
    await expect(
      createManyIfAny(
        earlierImmutable,
        [
          {
            id: "immutable-row",
            createdByUserId: "gm-owner",
            contentHash: "same",
          },
        ],
        { allowExistingNullFields: ["createdByUserId"] },
      ),
    ).resolves.toBeUndefined();
    expect(earlierImmutable).not.toHaveProperty("updateMany");

    const differentlyAttributed = {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "immutable-row",
          createdByUserId: "different-gm",
          contentHash: "same",
        },
      ]),
    };
    await expect(
      createManyIfAny(
        differentlyAttributed,
        [
          {
            id: "immutable-row",
            createdByUserId: "gm-owner",
            contentHash: "same",
          },
        ],
        { allowExistingNullFields: ["createdByUserId"] },
      ),
    ).rejects.toThrow(
      "Existing shadow data differs from the deterministic migration plan.",
    );
  });

  it("requires an explicit existing GM and never guesses an adoption owner", async () => {
    const missing = prismaMock();
    await expect(
      new LegacyRealignmentShadowMaterializerService(
        missing.prisma as unknown as PrismaService,
      ).run({ apply: true }),
    ).rejects.toThrow(
      "Shadow materialization requires an explicitly selected GM owner.",
    );
    expect(missing.prisma.$transaction).not.toHaveBeenCalled();

    const nonGm = prismaMock();
    nonGm.tx.user.findUnique.mockResolvedValue({
      id: "participant-owner",
      role: "PARTICIPANT",
    });
    await expect(
      new LegacyRealignmentShadowMaterializerService(
        nonGm.prisma as unknown as PrismaService,
      ).run({ apply: true, ownerUserId: "participant-owner" }),
    ).rejects.toThrow("Shadow materialization requires an existing GM owner.");
    expect(nonGm.tx.worldDefinition.createMany).not.toHaveBeenCalled();

    const alreadyOwned = prismaMock();
    alreadyOwned.tx.installationRolloutState.findUnique.mockResolvedValue({
      startedAt: new Date("2026-09-04T12:00:00.000Z"),
      initiatedByUserId: "different-gm",
    });
    await expect(
      new LegacyRealignmentShadowMaterializerService(
        alreadyOwned.prisma as unknown as PrismaService,
      ).run({ apply: true, ownerUserId: "gm-owner" }),
    ).rejects.toThrow(
      "The existing shadow rollout belongs to a different GM owner.",
    );
    expect(alreadyOwned.tx.worldDefinition.createMany).not.toHaveBeenCalled();
  });

  it("reuses the rollout start time so unchanged apply reruns stay deterministic", async () => {
    const { prisma, tx } = prismaMock();
    tx.installationRolloutState.findUnique.mockResolvedValue({
      startedAt: new Date("2026-09-04T12:00:00.000Z"),
      initiatedByUserId: "gm-owner",
    });

    await new LegacyRealignmentShadowMaterializerService(
      prisma as unknown as PrismaService,
    ).run({
      apply: true,
      capturedAt: "2026-09-05T12:00:00.000Z",
      ownerUserId: "gm-owner",
    });

    expect(tx.worldDefinition.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            createdAt: new Date("2026-09-04T12:00:00.000Z"),
          }),
        ],
      }),
    );
    expect(tx.worldDefinitionSnapshot.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            capturedAt: new Date("2026-09-04T12:00:00.000Z"),
          }),
        ],
      }),
    );
  });
});
