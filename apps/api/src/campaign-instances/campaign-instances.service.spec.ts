import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { CampaignInstancesService } from "./campaign-instances.service";

function firstCallArgument(mock: jest.Mock, argumentIndex = 0): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[argumentIndex];
}

describe("CampaignInstancesService", () => {
  it("lists compact Instance summaries from captured revisions only", async () => {
    const prisma = {
      campaignInstance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "instance-1",
            name: "Tuesday Glasswake",
            status: "ACTIVE",
            metadataRevision: 2,
            updatedAt: new Date("2026-09-04T12:00:00.000Z"),
            currentSnapshot: {
              id: "instance-snapshot-2",
              snapshotNumber: 2,
              reason: "MIGRATION",
              adoptedAt: new Date("2026-09-03T12:00:00.000Z"),
              campaignDefinitionSnapshot: {
                campaignDefinitionRevision: {
                  revisionNumber: 3,
                  name: "Ashes at Dawn, Third Edition",
                  campaignDefinitionId: "campaign-definition-1",
                },
              },
              worldDefinitionSnapshot: {
                worldDefinitionRevision: {
                  revisionNumber: 5,
                  name: "Glasswake, Fifth Edition",
                  worldDefinitionId: "world-definition-1",
                },
              },
            },
          },
        ]),
        findUnique: jest.fn(),
      },
    };

    const result = await new CampaignInstancesService(prisma).list("gm-1");

    expect(result).toEqual({
      items: [
        {
          id: "instance-1",
          name: "Tuesday Glasswake",
          status: "active",
          metadataRevision: 2,
          updatedAt: "2026-09-04T12:00:00.000Z",
          currentSnapshot: {
            snapshotId: "instance-snapshot-2",
            snapshotNumber: 2,
            reason: "migration",
            adoptedAt: "2026-09-03T12:00:00.000Z",
            campaignDefinition: {
              definitionId: "campaign-definition-1",
              name: "Ashes at Dawn, Third Edition",
              revisionNumber: 3,
              authoringHref: "/campaigns/definitions/campaign-definition-1",
            },
            worldDefinition: {
              definitionId: "world-definition-1",
              name: "Glasswake, Fifth Edition",
              revisionNumber: 5,
              authoringHref: "/worlds/world-definition-1",
            },
          },
        },
      ],
      total: 1,
    });
    expect(prisma.campaignInstance.findMany).toHaveBeenCalledTimes(1);
    const query = firstCallArgument(prisma.campaignInstance.findMany);
    expect(query).toMatchObject({ where: { ownerUserId: "gm-1" } });
    expect(JSON.stringify(query)).not.toMatch(
      /"state"|manifest|currentRevision|sessions|domainRecord/,
    );
    expect(JSON.stringify(query)).toContain(
      '"orderBy":[{"status":"asc"},{"name":"asc"},{"id":"asc"}]',
    );
    expect(JSON.stringify(result)).not.toMatch(/"state"|manifest/);
    expect(result.items[0]).not.toHaveProperty("hasActiveSession");
  });

  it("gets one explicitly selected Instance with immutable compatibility provenance", async () => {
    const prisma = {
      campaignInstance: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: "instance-1",
          name: "Tuesday Glasswake",
          status: "PAUSED",
          metadataRevision: 4,
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          updatedAt: new Date("2026-09-04T12:00:00.000Z"),
          concludedAt: null,
          archivedAt: null,
          currentSnapshot: {
            id: "instance-snapshot-2",
            snapshotNumber: 2,
            predecessorSnapshotId: "instance-snapshot-1",
            reason: "MIGRATION",
            contentHash: "instance-snapshot-hash-2",
            adoptedAt: new Date("2026-09-03T12:00:00.000Z"),
            campaignDefinitionSnapshot: {
              id: "campaign-snapshot-3",
              contentHash: "campaign-snapshot-hash-3",
              capturedAt: new Date("2026-09-03T11:30:00.000Z"),
              campaignDefinitionRevision: {
                id: "campaign-revision-3",
                campaignDefinitionId: "campaign-definition-1",
                revisionNumber: 3,
                name: "Ashes at Dawn, Third Edition",
                contentHash: "campaign-revision-hash-3",
                publishedAt: new Date("2026-09-03T11:00:00.000Z"),
              },
            },
            worldDefinitionSnapshot: {
              id: "world-snapshot-5",
              contentHash: "world-snapshot-hash-5",
              capturedAt: new Date("2026-09-03T10:30:00.000Z"),
              worldDefinitionRevision: {
                id: "world-revision-5",
                worldDefinitionId: "world-definition-1",
                revisionNumber: 5,
                name: "Glasswake, Fifth Edition",
                contentHash: "world-revision-hash-5",
                publishedAt: new Date("2026-09-03T10:00:00.000Z"),
              },
            },
          },
          runtime: {
            id: "runtime-1",
            campaignInstanceSnapshotId: "instance-snapshot-2",
            revision: 12,
            updatedAt: new Date("2026-09-04T11:59:00.000Z"),
          },
        }),
      },
    };

    const result = await new CampaignInstancesService(prisma).get(
      "instance-1",
      "gm-1",
    );

    expect(result).toEqual({
      id: "instance-1",
      name: "Tuesday Glasswake",
      status: "paused",
      metadataRevision: 4,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
      concludedAt: undefined,
      archivedAt: undefined,
      currentSnapshot: {
        snapshotId: "instance-snapshot-2",
        snapshotNumber: 2,
        reason: "migration",
        adoptedAt: "2026-09-03T12:00:00.000Z",
        campaignDefinition: {
          definitionId: "campaign-definition-1",
          revisionNumber: 3,
          name: "Ashes at Dawn, Third Edition",
          authoringHref: "/campaigns/definitions/campaign-definition-1",
        },
        worldDefinition: {
          definitionId: "world-definition-1",
          revisionNumber: 5,
          name: "Glasswake, Fifth Edition",
          authoringHref: "/worlds/world-definition-1",
        },
      },
      runtime: {
        revision: 12,
        updatedAt: "2026-09-04T11:59:00.000Z",
      },
    });
    const query = firstCallArgument(prisma.campaignInstance.findUnique);
    expect(JSON.stringify(query)).toContain(
      '"where":{"id":"instance-1","ownerUserId":"gm-1"}',
    );
    expect(JSON.stringify(query)).not.toMatch(
      /"state"|manifest|currentRevision|sessions|domainRecord/,
    );
    expect(JSON.stringify(result)).not.toContain('"state"');
    expect(result.runtime).not.toHaveProperty("hasActiveSession");
  });

  it("does not infer an Instance when the selected identity is absent", async () => {
    const prisma = {
      campaignInstance: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const opaqueId = "2cf3db72-opaque-campaign-instance-id";
    const operation = new CampaignInstancesService(prisma).get(opaqueId, "gm-1");

    await expect(operation).rejects.toEqual(
      new NotFoundException("The selected Campaign Instance was not found."),
    );
    await expect(operation).rejects.not.toThrow(opaqueId);
    expect(prisma.campaignInstance.findMany).not.toHaveBeenCalled();
  });

  it("sanitizes persistence failures instead of returning database details", async () => {
    const prisma = {
      campaignInstance: {
        findMany: jest.fn(),
        findUnique: jest
          .fn()
          .mockRejectedValue(
            new Error("database failed for opaque-instance-id"),
          ),
      },
    };

    await expect(
      new CampaignInstancesService(prisma).get("opaque-id", "gm-1"),
    ).rejects.toEqual(
      new ServiceUnavailableException(
        "Campaign Instances are temporarily unavailable.",
      ),
    );
  });

  it("atomically creates an initial Instance from the explicitly selected snapshot", async () => {
    const campaignManifest = buildSnapshotManifest(1, [
      {
        resourceType: "campaign-definition-revision",
        sourceId: "campaign-revision-3",
        sourceRevision: 3,
        payload: { plots: [] },
      },
    ]);
    const worldManifest = buildSnapshotManifest(1, [
      {
        resourceType: "world-definition-revision",
        sourceId: "world-revision-5",
        sourceRevision: 5,
        payload: { rootLocationId: "location-1" },
      },
    ]);
    const selectedSnapshot = {
      id: "campaign-snapshot-3",
      campaignDefinitionId: "campaign-definition-1",
      campaignDefinitionRevisionId: "campaign-revision-3",
      capturedWorldSnapshotId: "world-snapshot-5",
      manifest: campaignManifest,
      contentHash: campaignManifest.contentHash,
      capturedAt: new Date("2026-09-03T11:30:00.000Z"),
      campaignDefinitionRevision: {
        id: "campaign-revision-3",
        campaignDefinitionId: "campaign-definition-1",
        capturedWorldSnapshotId: "world-snapshot-5",
        revisionNumber: 3,
        name: "Ashes at Dawn, Third Edition",
        contentHash: campaignManifest.records[0].contentHash,
        publishedAt: new Date("2026-09-03T11:00:00.000Z"),
      },
      capturedWorldSnapshot: {
        id: "world-snapshot-5",
        worldDefinitionId: "world-definition-1",
        worldDefinitionRevisionId: "world-revision-5",
        manifest: worldManifest,
        contentHash: worldManifest.contentHash,
        capturedAt: new Date("2026-09-03T10:30:00.000Z"),
        worldDefinitionRevision: {
          id: "world-revision-5",
          revisionNumber: 5,
          name: "Glasswake, Fifth Edition",
          contentHash: worldManifest.records[0].contentHash,
          publishedAt: new Date("2026-09-03T10:00:00.000Z"),
        },
      },
    };
    const tx = {
      campaignDefinitionSnapshot: {
        findUnique: jest.fn().mockResolvedValue(selectedSnapshot),
      },
      campaignInstance: {
        create: jest.fn().mockResolvedValue({
          id: "instance-1",
          name: "Tuesday Glasswake",
          status: "PREPARING",
          metadataRevision: 1,
          createdAt: new Date("2026-09-04T12:00:00.000Z"),
          updatedAt: new Date("2026-09-04T12:00:00.000Z"),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      campaignInstanceSnapshot: {
        create: jest.fn().mockResolvedValue({
          id: "instance-snapshot-1",
          snapshotNumber: 1,
          reason: "INITIAL",
          contentHash: "instance-content-hash",
          adoptedAt: new Date("2026-09-04T12:00:01.000Z"),
        }),
      },
      campaignInstanceRuntime: {
        create: jest.fn().mockResolvedValue({
          id: "runtime-1",
          revision: 1,
          updatedAt: new Date("2026-09-04T12:00:02.000Z"),
        }),
      },
      campaignInstanceHumanMembership: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      campaignInstance: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    };

    const result = await new CampaignInstancesService(prisma).create(
      {
        idempotencyKey: "create-tuesday-glasswake-1",
        name: "  Tuesday Glasswake  ",
        campaignDefinitionSnapshotId: "campaign-snapshot-3",
      },
      "gm-1",
    );

    expect(result).toMatchObject({
      id: "instance-1",
      name: "Tuesday Glasswake",
      status: "preparing",
      metadataRevision: 1,
      currentSnapshot: {
        snapshotId: "instance-snapshot-1",
        snapshotNumber: 1,
        reason: "initial",
        campaignDefinition: {
          name: "Ashes at Dawn, Third Edition",
          revisionNumber: 3,
        },
        worldDefinition: {
          name: "Glasswake, Fifth Edition",
          revisionNumber: 5,
        },
      },
      runtime: { revision: 1 },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const transactionOptions = firstCallArgument(prisma.$transaction, 1);
    expect(transactionOptions).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    const findSnapshotArgs = firstCallArgument(
      tx.campaignDefinitionSnapshot.findUnique,
    );
    expect(findSnapshotArgs).toMatchObject({
      where: {
        id: "campaign-snapshot-3",
        campaignDefinition: { ownerUserId: "gm-1" },
      },
    });
    const createInstanceArgs = firstCallArgument(tx.campaignInstance.create);
    expect(createInstanceArgs).toMatchObject({
      data: {
        campaignDefinitionId: "campaign-definition-1",
        name: "Tuesday Glasswake",
        status: "PREPARING",
        createdByUserId: "gm-1",
        ownerUserId: "gm-1",
      },
    });
    const createSnapshotArgs = firstCallArgument(
      tx.campaignInstanceSnapshot.create,
    );
    expect(createSnapshotArgs).toMatchObject({
      data: {
        campaignInstanceId: "instance-1",
        campaignDefinitionId: "campaign-definition-1",
        campaignDefinitionSnapshotId: "campaign-snapshot-3",
        worldDefinitionSnapshotId: "world-snapshot-5",
        snapshotNumber: 1,
        reason: "INITIAL",
        createdByUserId: "gm-1",
      },
    });
    const snapshotWrite = createSnapshotArgs as {
      data: {
        manifest: {
          formatVersion: number;
          records: readonly Record<string, unknown>[];
        };
      };
    };
    expect(snapshotWrite.data.manifest.formatVersion).toBe(1);
    const campaignCapture = snapshotWrite.data.manifest.records.find(
      (record) => record.resourceType === "campaign-definition-snapshot",
    );
    const worldCapture = snapshotWrite.data.manifest.records.find(
      (record) => record.resourceType === "world-definition-snapshot",
    );
    expect(campaignCapture).toMatchObject({
      payload: { manifest: campaignManifest },
    });
    expect(worldCapture).toMatchObject({ payload: { manifest: worldManifest } });
    expect(JSON.stringify(createSnapshotArgs)).toMatch(
      /"contentHash":"[a-f0-9]{64}"/,
    );
    const createRuntimeArgs = firstCallArgument(
      tx.campaignInstanceRuntime.create,
    );
    expect(createRuntimeArgs).toMatchObject({
      data: {
        campaignInstanceId: "instance-1",
        campaignInstanceSnapshotId: "instance-snapshot-1",
        state: {
          formatVersion: 1,
          preparation: {},
          plotProgress: [],
          placementRealizations: [],
          creatureEmbodiments: [],
          itemInstances: [],
        },
        extensions: {},
      },
    });
    expect(tx.campaignInstanceHumanMembership.create).toHaveBeenCalledWith({
      data: {
        campaignInstanceId: "instance-1",
        userId: "gm-1",
        displayName: "Game Master",
        role: "GM",
        status: "ACTIVE",
      },
    });
    expect(tx.campaignInstance.update).toHaveBeenCalledWith({
      where: { id: "instance-1" },
      data: { currentSnapshotId: "instance-snapshot-1" },
    });

    tx.campaignDefinitionSnapshot.findUnique.mockResolvedValue({
      ...selectedSnapshot,
      contentHash: "corrupt-manifest-hash",
    });
    tx.campaignInstance.create.mockClear();
    tx.campaignInstanceSnapshot.create.mockClear();
    tx.campaignInstanceRuntime.create.mockClear();
    await expect(
      new CampaignInstancesService(prisma).create(
        {
          idempotencyKey: "create-corrupt-capture-1",
          name: "Corrupt capture",
          campaignDefinitionSnapshotId: "campaign-snapshot-3",
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new BadRequestException(
        "The selected Campaign Definition snapshot is inconsistent.",
      ),
    );
    expect(tx.campaignInstance.create).not.toHaveBeenCalled();
    expect(tx.campaignInstanceSnapshot.create).not.toHaveBeenCalled();
    expect(tx.campaignInstanceRuntime.create).not.toHaveBeenCalled();
  });

  it("makes no writes when the explicitly selected snapshot is absent", async () => {
    const write = jest.fn();
    const tx = {
      campaignDefinitionSnapshot: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      campaignInstance: { create: write, update: write },
      campaignInstanceSnapshot: { create: write },
      campaignInstanceRuntime: { create: write },
      campaignInstanceHumanMembership: { create: write },
    };
    const prisma = {
      campaignInstance: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    };

    await expect(
      new CampaignInstancesService(prisma).create(
        {
          idempotencyKey: "create-missing-snapshot-1",
          name: "Tuesday Glasswake",
          campaignDefinitionSnapshotId: "missing-snapshot-id",
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new NotFoundException(
        "The selected Campaign Definition snapshot was not found.",
      ),
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects reuse of a creation key for different Instance details before writing", async () => {
    const write = jest.fn();
    const tx = {
      campaignDefinitionSnapshot: { findUnique: jest.fn() },
      campaignInstance: {
        findFirst: jest.fn().mockResolvedValue({
          id: "prior-instance",
          name: "Original table",
          campaignDefinitionId: "campaign-definition-1",
          currentSnapshot: {
            campaignDefinitionSnapshotId: "campaign-snapshot-1",
          },
        }),
        create: write,
        update: write,
      },
      campaignInstanceSnapshot: { create: write },
      campaignInstanceRuntime: { create: write },
      campaignInstanceHumanMembership: { create: write },
    };
    const prisma = {
      campaignInstance: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    };

    await expect(
      new CampaignInstancesService(prisma).create(
        {
          idempotencyKey: "same-create-command-key",
          name: "Different table",
          campaignDefinitionSnapshotId: "campaign-snapshot-2",
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new ConflictException(
        "This create request key was already used for different Campaign Instance details.",
      ),
    );
    expect(tx.campaignDefinitionSnapshot.findUnique).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects malformed input and inconsistent captured provenance neutrally", async () => {
    const prismaWithoutTransaction = {
      campaignInstance: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    await expect(
      new CampaignInstancesService(prismaWithoutTransaction).create(
        {
          idempotencyKey: "create-invalid-name-1",
          name: "   ",
          campaignDefinitionSnapshotId: "snapshot-1",
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new BadRequestException("A Campaign Instance name is required."),
    );

    const write = jest.fn();
    const tx = {
      campaignDefinitionSnapshot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "snapshot-1",
          campaignDefinitionId: "campaign-definition-1",
          campaignDefinitionRevisionId: "campaign-revision-1",
          capturedWorldSnapshotId: "world-snapshot-1",
          manifest: {},
          contentHash: "campaign-hash",
          capturedAt: new Date(),
          campaignDefinitionRevision: {
            id: "campaign-revision-1",
            campaignDefinitionId: "campaign-definition-1",
            capturedWorldSnapshotId: "different-world-snapshot",
            revisionNumber: 1,
            name: "Campaign",
            contentHash: "revision-hash",
            publishedAt: new Date(),
          },
          capturedWorldSnapshot: {
            id: "world-snapshot-1",
            worldDefinitionId: "world-1",
            worldDefinitionRevisionId: "world-revision-1",
            manifest: {},
            contentHash: "world-hash",
            capturedAt: new Date(),
            worldDefinitionRevision: {
              id: "world-revision-1",
              revisionNumber: 1,
              name: "World",
              contentHash: "world-revision-hash",
              publishedAt: new Date(),
            },
          },
        }),
      },
      campaignInstance: { create: write, update: write },
      campaignInstanceSnapshot: { create: write },
      campaignInstanceRuntime: { create: write },
      campaignInstanceHumanMembership: { create: write },
    };
    const prisma = {
      campaignInstance: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    };

    await expect(
      new CampaignInstancesService(prisma).create(
        {
          idempotencyKey: "create-inconsistent-capture-1",
          name: "Tuesday Glasswake",
          campaignDefinitionSnapshotId: "snapshot-1",
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new BadRequestException(
        "The selected Campaign Definition snapshot is inconsistent.",
      ),
    );
    expect(write).not.toHaveBeenCalled();
  });
});
