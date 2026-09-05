import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import { MAX_PUBLICATION_JSON_DEPTH } from "../domain/snapshot-manifest";

function argument(mock: jest.Mock, index = 0): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[index];
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object in the persistence call.");
  }
  return value as Record<string, unknown>;
}

function transactionFixture() {
  const tx = {
    worldDefinitionSnapshot: {
      findUnique: jest.fn().mockResolvedValue({
        id: "world-snapshot-2",
        worldDefinitionId: "world-1",
        worldDefinitionRevisionId: "world-revision-2",
        contentHash: "world-hash",
      }),
    },
    campaignDefinition: {
      create: jest.fn().mockResolvedValue({ id: "campaign-1", name: "Ashes" }),
      findUnique: jest.fn().mockResolvedValue({
        id: "campaign-1",
        name: "Ashes",
        status: "ACTIVE",
        worldDefinitionId: "world-1",
        currentRevisionId: "campaign-revision-1",
        currentRevision: { id: "campaign-revision-1", revisionNumber: 1 },
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignDefinitionRevision: {
      create: jest.fn().mockResolvedValue({
        id: "campaign-revision-2",
        revisionNumber: 2,
        name: "Ashes Revised",
        contentHash: "server-content-hash",
      }),
    },
    campaignDefinitionSnapshot: {
      create: jest.fn().mockResolvedValue({
        id: "campaign-snapshot-2",
        contentHash: "server-manifest-hash",
        capturedAt: new Date("2026-09-04T12:00:00.000Z"),
      }),
    },
  };
  const prisma = {
    campaignDefinition: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      Promise.resolve(operation(tx)),
    ),
  };
  return { tx, prisma };
}

describe("CampaignDefinitionsService writes", () => {
  it("rejects excessively deep publication JSON before opening a transaction", async () => {
    const { prisma } = transactionFixture();
    let content: Record<string, unknown> = {};
    for (let depth = 0; depth <= MAX_PUBLICATION_JSON_DEPTH; depth += 1) {
      content = { child: content };
    }

    await expect(
      new CampaignDefinitionsService(prisma).create(
        {
          name: "Ashes",
          worldDefinitionSnapshotId: "world-snapshot-2",
          content,
          snapshotManifest: {
            formatVersion: 1,
            records: [
              {
                resourceType: "campaign-content",
                sourceId: "draft",
                payload: {},
              },
            ],
          },
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new BadRequestException(
        "Complete Campaign revision content must be a bounded JSON object.",
      ),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("atomically creates and publishes an owned multi-lineage Campaign", async () => {
    const { tx, prisma } = transactionFixture();
    tx.campaignDefinitionRevision.create.mockResolvedValue({
      id: "campaign-revision-1",
      revisionNumber: 1,
      name: "Ashes",
      contentHash: "server-content-hash",
    });
    tx.campaignDefinitionSnapshot.create.mockResolvedValue({
      id: "campaign-snapshot-1",
      contentHash: "server-manifest-hash",
      capturedAt: new Date("2026-09-04T12:00:00.000Z"),
    });

    await new CampaignDefinitionsService(prisma).create(
      {
        name: "  Ashes  ",
        description: "  A coastal campaign.  ",
        worldDefinitionSnapshotId: "world-snapshot-2",
        content: { plots: [{ name: "Arrival" }] },
        snapshotManifest: {
          formatVersion: 1,
          records: [
            {
              resourceType: "campaign-content",
              sourceId: "draft",
              payload: { plots: [{ name: "Arrival" }] },
            },
          ],
        },
      },
      "gm-1",
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(argument(prisma.$transaction, 1)).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(argument(tx.campaignDefinition.create)).toMatchObject({
      data: {
        worldDefinitionId: "world-1",
        name: "Ashes",
        description: "A coastal campaign.",
        ownerUserId: "gm-1",
      },
    });
    expect(argument(tx.campaignDefinitionRevision.create)).toMatchObject({
      data: {
        campaignDefinitionId: "campaign-1",
        capturedWorldSnapshotId: "world-snapshot-2",
        revisionNumber: 1,
        createdByUserId: "gm-1",
      },
    });
    expect(argument(tx.campaignDefinitionSnapshot.create)).toMatchObject({
      data: {
        campaignDefinitionRevisionId: "campaign-revision-1",
        capturedWorldSnapshotId: "world-snapshot-2",
      },
    });
    const snapshotData = object(
      object(argument(tx.campaignDefinitionSnapshot.create)).data,
    );
    const completedManifest = object(snapshotData.manifest);
    expect(snapshotData.contentHash).toBe(completedManifest.contentHash);
    expect(completedManifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const completedRecords = completedManifest.records;
    if (!Array.isArray(completedRecords)) {
      throw new Error("Expected completed snapshot records.");
    }
    expect(completedRecords).toEqual([
      expect.objectContaining({
        resourceType: "campaign-definition-revision",
        sourceId: "campaign-revision-1",
        sourceRevision: 1,
        payload: { plots: [{ name: "Arrival" }] },
      }),
      expect.objectContaining({
        resourceType: "campaign-content",
        sourceId: "draft",
        payload: { plots: [{ name: "Arrival" }] },
      }),
    ]);
    expect(object(completedRecords[0]).contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(argument(tx.campaignDefinition.update)).toMatchObject({
      data: { currentRevisionId: "campaign-revision-1" },
    });
    expect(
      JSON.stringify(argument(tx.campaignDefinitionRevision.create)),
    ).toMatch(/"contentHash":"[a-f0-9]{64}"/);
  });

  it("publishes only the direct successor and guard-advances the head", async () => {
    const { tx, prisma } = transactionFixture();

    await new CampaignDefinitionsService(prisma).publishRevision(
      "campaign-1",
      {
        predecessorRevisionId: "campaign-revision-1",
        worldDefinitionSnapshotId: "world-snapshot-2",
        name: "Ashes Revised",
        content: { plots: [{ name: "Arrival" }, { name: "Departure" }] },
        snapshotManifest: {
          formatVersion: 1,
          records: [
            {
              resourceType: "campaign-content",
              sourceId: "draft-2",
              payload: { plots: [] },
            },
          ],
        },
      },
      "gm-1",
    );

    expect(argument(tx.campaignDefinitionRevision.create)).toMatchObject({
      data: {
        revisionNumber: 2,
        predecessorRevisionId: "campaign-revision-1",
        capturedWorldSnapshotId: "world-snapshot-2",
      },
    });
    expect(argument(tx.campaignDefinition.updateMany)).toEqual({
      where: {
        id: "campaign-1",
        currentRevisionId: "campaign-revision-1",
      },
      data: { currentRevisionId: "campaign-revision-2" },
    });
  });

  it("makes no writes for missing snapshots or cross-lineage migration", async () => {
    const missing = transactionFixture();
    missing.tx.worldDefinitionSnapshot.findUnique.mockResolvedValue(null);
    await expect(
      new CampaignDefinitionsService(missing.prisma).create(
        {
          name: "Ashes",
          worldDefinitionSnapshotId: "missing",
          content: {},
          snapshotManifest: {
            formatVersion: 1,
            records: [
              {
                resourceType: "campaign-content",
                sourceId: "draft",
                payload: {},
              },
            ],
          },
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new NotFoundException(
        "The selected World Definition snapshot was not found.",
      ),
    );
    expect(missing.tx.campaignDefinition.create).not.toHaveBeenCalled();

    const mismatch = transactionFixture();
    mismatch.tx.worldDefinitionSnapshot.findUnique.mockResolvedValue({
      id: "foreign-snapshot",
      worldDefinitionId: "foreign-world",
      worldDefinitionRevisionId: "foreign-revision",
      contentHash: "foreign-hash",
    });
    await expect(
      new CampaignDefinitionsService(mismatch.prisma).publishRevision(
        "campaign-1",
        {
          predecessorRevisionId: "campaign-revision-1",
          worldDefinitionSnapshotId: "foreign-snapshot",
          name: "Bad migration",
          content: {},
          snapshotManifest: {
            formatVersion: 1,
            records: [
              {
                resourceType: "campaign-content",
                sourceId: "draft",
                payload: {},
              },
            ],
          },
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new BadRequestException(
        "The selected World snapshot belongs to a different World Definition.",
      ),
    );
    expect(
      mismatch.tx.campaignDefinitionRevision.create,
    ).not.toHaveBeenCalled();
  });

  it.each(["P2002", "P2034"])(
    "maps concurrent publication failure %s to a retryable lineage conflict",
    async (code) => {
      const { tx, prisma } = transactionFixture();
      tx.campaignDefinitionRevision.create.mockRejectedValue({ code });

      await expect(
        new CampaignDefinitionsService(prisma).publishRevision(
          "campaign-1",
          {
            predecessorRevisionId: "campaign-revision-1",
            worldDefinitionSnapshotId: "world-snapshot-2",
            name: "Concurrent publication",
            content: {},
            snapshotManifest: {
              formatVersion: 1,
              records: [
                {
                  resourceType: "campaign-content",
                  sourceId: "draft",
                  payload: {},
                },
              ],
            },
          },
          "gm-1",
        ),
      ).rejects.toEqual(
        new ConflictException(
          "The Campaign Definition has changed; refresh before publishing.",
        ),
      );
      expect(tx.campaignDefinitionSnapshot.create).not.toHaveBeenCalled();
      expect(tx.campaignDefinition.updateMany).not.toHaveBeenCalled();
    },
  );
});
