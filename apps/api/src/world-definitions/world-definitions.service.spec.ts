import { worldAccessWhere } from "./world-access";
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { WorldDefinitionsService } from "./world-definitions.service";

describe("WorldDefinitionsService", () => {
  const publication = {
    name: "The Ember Sea",
    description: "A volcanic archipelago.",
    content: { zeta: 2, alpha: { south: true, north: false } },
    snapshotManifest: {
      formatVersion: 1,
      records: [
        {
          resourceType: "locations",
          sourceId: "ember-port",
          payload: { zeta: 2, alpha: 1 },
        },
      ],
    },
  };

  it("creates an independent lineage, revision 1, snapshot, and head atomically", async () => {
    const revisionContentHash = sha256(
      '{"alpha":{"north":false,"south":true},"zeta":2}',
    );
    const recordContentHash = sha256('{"alpha":1,"zeta":2}');
    const manifestContentHash = sha256(
      `{"formatVersion":1,"records":[{"contentHash":"${recordContentHash}","payload":{"alpha":1,"zeta":2},"resourceType":"locations","sourceId":"ember-port"}]}`,
    );
    const tx = {
      worldDefinition: {
        create: jest.fn().mockResolvedValue({
          id: "world-lineage-new",
          name: "The Ember Sea",
          description: "A volcanic archipelago.",
          status: "ACTIVE",
          createdAt: new Date("2026-09-04T12:00:00.000Z"),
        }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      worldDefinitionRevision: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: "world-revision-new",
          revisionNumber: 1,
          name: "The Ember Sea",
          contentHash: revisionContentHash,
          publishedAt: new Date("2026-09-04T12:00:01.000Z"),
        }),
      },
      worldDefinitionSnapshot: {
        create: jest.fn().mockResolvedValue({
          id: "world-snapshot-new",
          contentHash: manifestContentHash,
          capturedAt: new Date("2026-09-04T12:00:02.000Z"),
        }),
      },
    };
    const prisma = {
      worldDefinition: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operation: (value: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    };

    const result = await new WorldDefinitionsService(prisma).create(
      publication,
      "gm-1",
    );

    expect(result).toMatchObject({
      name: "The Ember Sea",
      status: "active",
      currentRevision: {
        revisionNumber: 1,
        name: "The Ember Sea",
        contentHash: revisionContentHash,
        snapshot: { contentHash: manifestContentHash },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(firstCallArgument(tx.worldDefinition.create)).toMatchObject({
      data: {
        name: "The Ember Sea",
        ownerUserId: "gm-1",
      },
    });
    expect(firstCallArgument(tx.worldDefinitionRevision.create)).toMatchObject({
      data: {
        worldDefinitionId: "world-lineage-new",
        revisionNumber: 1,
        predecessorRevisionId: null,
        name: "The Ember Sea",
        contentHash: revisionContentHash,
        createdByUserId: "gm-1",
      },
    });
    expect(firstCallArgument(tx.worldDefinitionSnapshot.create)).toMatchObject({
      data: {
        worldDefinitionId: "world-lineage-new",
        worldDefinitionRevisionId: "world-revision-new",
      },
    });
    const snapshotData = firstCallArgument(
      tx.worldDefinitionSnapshot.create,
    ) as {
      data: {
        contentHash: string;
        manifest: { contentHash: string; records: unknown[] };
      };
    };
    expect(snapshotData.data.contentHash).toBe(
      snapshotData.data.manifest.contentHash,
    );
    expect(snapshotData.data.manifest.records).toEqual([
      expect.objectContaining({
        resourceType: "world-definition-revision",
        sourceId: "world-revision-new",
        sourceRevision: 1,
        payload: publication.content,
      }),
      expect.objectContaining({
        resourceType: "locations",
        sourceId: "ember-port",
        contentHash: recordContentHash,
      }),
    ]);
    expect(tx.worldDefinition.update).toHaveBeenCalledWith({
      where: { id: "world-lineage-new" },
      data: { currentRevisionId: "world-revision-new" },
    });
    expect(tx.worldDefinition).not.toHaveProperty("findFirst");
    expect(prisma.worldDefinition.findUnique).not.toHaveBeenCalled();
  });

  it("publishes exactly the next direct-lineage revision and guarded head advance", async () => {
    const tx = {
      worldDefinition: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: "world-lineage-1",
          status: "ACTIVE",
          currentRevisionId: "world-revision-1",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      worldDefinitionRevision: {
        findUnique: jest.fn().mockResolvedValue({
          id: "world-revision-1",
          worldDefinitionId: "world-lineage-1",
          revisionNumber: 1,
        }),
        create: jest.fn().mockResolvedValue({
          id: "world-revision-2",
          revisionNumber: 2,
          name: "The Glasswake, Second Edition",
          contentHash: "revision-hash-2",
          publishedAt: new Date("2026-09-04T12:00:01.000Z"),
        }),
      },
      worldDefinitionSnapshot: {
        create: jest.fn().mockResolvedValue({
          id: "world-snapshot-2",
          contentHash: "snapshot-hash-2",
          capturedAt: new Date("2026-09-04T12:00:02.000Z"),
        }),
      },
    };
    const prisma = {
      worldDefinition: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operation: (value: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    };
    const dto = {
      predecessorRevisionId: "world-revision-1",
      name: "The Glasswake, Second Edition",
      content: { rootLocationId: "root-location" },
      snapshotManifest: publication.snapshotManifest,
    };

    const result = await new WorldDefinitionsService(prisma).publishRevision(
      "world-lineage-1",
      dto,
      "gm-1",
    );

    expect(result).toMatchObject({
      revisionNumber: 2,
      predecessorRevisionId: "world-revision-1",
      name: "The Glasswake, Second Edition",
    });
    expect(
      firstCallArgument(tx.worldDefinitionRevision.findUnique),
    ).toMatchObject({
      where: {
        worldDefinitionId_id: {
          worldDefinitionId: "world-lineage-1",
          id: "world-revision-1",
        },
      },
    });
    expect(firstCallArgument(tx.worldDefinitionRevision.create)).toMatchObject({
      data: {
        revisionNumber: 2,
        predecessorRevisionId: "world-revision-1",
        createdByUserId: "gm-1",
      },
    });
    const headAdvance = firstCallArgument(tx.worldDefinition.updateMany);
    expect(headAdvance).toMatchObject({
      where: {
        id: "world-lineage-1",
        currentRevisionId: "world-revision-1",
      },
      data: {
        currentRevisionId: "world-revision-2",
      },
    });
    expect(
      isObject(headAdvance) &&
        isObject(headAdvance.data) &&
        headAdvance.data.updatedAt,
    ).toBeInstanceOf(Date);

    tx.worldDefinition.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      new WorldDefinitionsService(prisma).publishRevision(
        "world-lineage-1",
        dto,
        "gm-1",
      ),
    ).rejects.toEqual(
      new ConflictException(
        "The selected predecessor is not the current revision of this World Definition.",
      ),
    );
  });

  it("rejects a predecessor outside the lineage or no longer at the head before writing", async () => {
    const opaqueId = "2cf3db72-opaque-revision-id";
    const tx = {
      worldDefinition: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: "world-lineage-1",
          status: "ACTIVE",
          currentRevisionId: "world-revision-current",
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      worldDefinitionRevision: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      worldDefinitionSnapshot: { create: jest.fn() },
    };
    const prisma = {
      worldDefinition: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operation: (value: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    };

    await expect(
      new WorldDefinitionsService(prisma).publishRevision(
        "world-lineage-1",
        {
          predecessorRevisionId: opaqueId,
          name: "Rejected Revision",
          content: {},
          snapshotManifest: publication.snapshotManifest,
        },
        "gm-1",
      ),
    ).rejects.toEqual(
      new ConflictException(
        "The selected predecessor is not the current revision of this World Definition.",
      ),
    );
    await expect(
      new WorldDefinitionsService(prisma).publishRevision(
        "world-lineage-1",
        {
          predecessorRevisionId: opaqueId,
          name: "Rejected Revision",
          content: {},
          snapshotManifest: publication.snapshotManifest,
        },
        "gm-1",
      ),
    ).rejects.not.toThrow(opaqueId);
    expect(tx.worldDefinitionRevision.create).not.toHaveBeenCalled();
    expect(tx.worldDefinitionSnapshot.create).not.toHaveBeenCalled();
    expect(tx.worldDefinition.updateMany).not.toHaveBeenCalled();
  });

  it("lists active and archived lineages with current-revision metadata only", async () => {
    const prisma = {
      worldDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "world-lineage-1",
            name: "The Glasswake",
            description: "A fractured coastal world.",
            status: "ACTIVE",
            archivedAt: null,
            metadataRevision: 4,
            updatedAt: new Date("2026-09-04T12:00:00.000Z"),
            draft: {
              storageRevision: 4,
              revisionName: "The Glasswake, Second Edition",
              validationStatus: "VALID",
              validatedStorageRevision: 4,
              baseRevisionId: "world-revision-2",
            },
            currentRevision: {
              id: "world-revision-2",
              revisionNumber: 2,
              name: "The Glasswake, Second Edition",
              contentHash: "hash-2",
              publishedAt: new Date("2026-09-03T12:00:00.000Z"),
              sourceDraftRevision: 3,
              snapshots: [{ id: "world-snapshot-2" }],
            },
          },
          {
            id: "world-lineage-2",
            name: "Old World",
            description: null,
            status: "ARCHIVED",
            archivedAt: new Date("2026-09-01T12:00:00.000Z"),
            metadataRevision: 2,
            updatedAt: new Date("2026-09-01T12:00:00.000Z"),
            currentRevision: null,
            draft: null,
          },
        ]),
        findUnique: jest.fn(),
      },
    };

    const result = await new WorldDefinitionsService(prisma).list("gm-1");

    expect(result).toEqual({
      items: [
        {
          id: "world-lineage-1",
          name: "The Glasswake",
          description: "A fractured coastal world.",
          status: "active",
          archivedAt: undefined,
          metadataRevision: 4,
          updatedAt: "2026-09-04T12:00:00.000Z",
          draft: {
            revisionName: "The Glasswake, Second Edition",
            storageRevision: 4,
            validationStatus: "valid",
            validatedStorageRevision: 4,
            isCurrentBase: true,
            hasUnpublishedChanges: false,
          },
          currentRevision: {
            id: "world-revision-2",
            revisionNumber: 2,
            name: "The Glasswake, Second Edition",
            contentHash: "hash-2",
            publishedAt: "2026-09-03T12:00:00.000Z",
            snapshotId: "world-snapshot-2",
          },
        },
        {
          id: "world-lineage-2",
          name: "Old World",
          description: undefined,
          status: "archived",
          archivedAt: "2026-09-01T12:00:00.000Z",
          metadataRevision: 2,
          updatedAt: "2026-09-01T12:00:00.000Z",
          draft: undefined,
          currentRevision: undefined,
        },
      ],
      total: 2,
    });
    expect(JSON.stringify(result)).not.toMatch(/manifest|content":/);
    expect(prisma.worldDefinition.findMany).toHaveBeenCalledWith({
      where: worldAccessWhere("gm-1"),
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        archivedAt: true,
        metadataRevision: true,
        updatedAt: true,
        draft: {
          select: {
            storageRevision: true,
            revisionName: true,
            validationStatus: true,
            validatedStorageRevision: true,
            baseRevisionId: true,
          },
        },
        currentRevision: {
          select: {
            id: true,
            revisionNumber: true,
            name: true,
            contentHash: true,
            publishedAt: true,
            sourceDraftRevision: true,
            snapshots: {
              select: { id: true },
              orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
              take: 1,
            },
          },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
    });
  });

  it("returns one selected lineage with immutable revisions and snapshots", async () => {
    const prisma = {
      worldDefinition: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: "world-lineage-1",
          name: "The Glasswake",
          description: null,
          status: "ACTIVE",
          currentRevisionId: "world-revision-2",
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          updatedAt: new Date("2026-09-04T12:00:00.000Z"),
          archivedAt: null,
          revisions: [
            {
              id: "world-revision-2",
              revisionNumber: 2,
              predecessorRevisionId: "world-revision-1",
              name: "The Glasswake, Second Edition",
              content: { rootLocationId: "root-location" },
              contentHash: "hash-2",
              createdAt: new Date("2026-09-03T11:00:00.000Z"),
              publishedAt: new Date("2026-09-03T12:00:00.000Z"),
              snapshots: [
                {
                  id: "world-snapshot-2",
                  manifest: { formatVersion: 1, records: [] },
                  contentHash: "snapshot-hash-2",
                  capturedAt: new Date("2026-09-03T12:00:01.000Z"),
                },
              ],
            },
          ],
        }),
      },
    };

    const result = await new WorldDefinitionsService(prisma).get(
      "world-lineage-1",
      "gm-1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: "world-lineage-1",
        name: "The Glasswake",
        status: "active",
        currentRevisionId: "world-revision-2",
        revisions: [
          expect.objectContaining({
            revisionNumber: 2,
            content: { rootLocationId: "root-location" },
            publishedAt: "2026-09-03T12:00:00.000Z",
            snapshots: [
              expect.objectContaining({
                manifest: { formatVersion: 1, records: [] },
                capturedAt: "2026-09-03T12:00:01.000Z",
              }),
            ],
          }),
        ],
      }),
    );
    expect(firstCallArgument(prisma.worldDefinition.findUnique)).toMatchObject({
      where: { id: "world-lineage-1", ...worldAccessWhere("gm-1") },
    });
    expect(prisma.worldDefinition.findUnique).toHaveBeenCalledTimes(1);
  });

  it("uses a neutral not-found response that does not echo the requested ID", async () => {
    const prisma = {
      worldDefinition: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const opaqueId = "2cf3db72-opaque-world-id";

    await expect(
      new WorldDefinitionsService(prisma).get(opaqueId, "gm-1"),
    ).rejects.toEqual(
      new NotFoundException("The selected World Definition was not found."),
    );
    await expect(
      new WorldDefinitionsService(prisma).get(opaqueId, "gm-1"),
    ).rejects.not.toThrow(opaqueId);
  });

  it("sanitizes persistence failures instead of returning database details or IDs", async () => {
    const prisma = {
      worldDefinition: {
        findMany: jest.fn(),
        findUnique: jest
          .fn()
          .mockRejectedValue(
            new Error("database failed for 2cf3db72-opaque-world-id"),
          ),
      },
    };

    await expect(
      new WorldDefinitionsService(prisma).get(
        "2cf3db72-opaque-world-id",
        "gm-1",
      ),
    ).rejects.toEqual(
      new ServiceUnavailableException(
        "World Definitions are temporarily unavailable.",
      ),
    );
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function firstCallArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[0];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
