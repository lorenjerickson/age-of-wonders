import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { CampaignDefinitionsService } from "./campaign-definitions.service";

function firstCallArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[0];
}

describe("CampaignDefinitionsService", () => {
  it("lists compact lineage summaries with current captured-World provenance", async () => {
    const prisma = {
      campaignDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "campaign-definition-1",
            name: "Ashes at Dawn",
            description: "A Glasswake campaign.",
            status: "ACTIVE",
            archivedAt: null,
            updatedAt: new Date("2026-09-04T12:00:00.000Z"),
            currentRevision: {
              id: "campaign-revision-2",
              revisionNumber: 2,
              name: "Ashes at Dawn, Revised",
              contentHash: "campaign-hash-2",
              publishedAt: new Date("2026-09-03T12:00:00.000Z"),
              capturedWorldSnapshot: {
                id: "world-snapshot-4",
                worldDefinitionId: "world-definition-1",
                worldDefinitionRevisionId: "world-revision-4",
                contentHash: "world-snapshot-hash-4",
                capturedAt: new Date("2026-09-03T11:00:00.000Z"),
                worldDefinitionRevision: {
                  revisionNumber: 4,
                  name: "Glasswake, Fourth Edition",
                  publishedAt: new Date("2026-09-02T12:00:00.000Z"),
                },
              },
            },
          },
        ]),
        findUnique: jest.fn(),
      },
    };

    const result = await new CampaignDefinitionsService(prisma).list("gm-1");

    expect(result).toEqual({
      items: [
        {
          id: "campaign-definition-1",
          name: "Ashes at Dawn",
          description: "A Glasswake campaign.",
          status: "active",
          archivedAt: undefined,
          updatedAt: "2026-09-04T12:00:00.000Z",
          currentRevision: {
            id: "campaign-revision-2",
            revisionNumber: 2,
            name: "Ashes at Dawn, Revised",
            contentHash: "campaign-hash-2",
            publishedAt: "2026-09-03T12:00:00.000Z",
            capturedWorld: {
              snapshotId: "world-snapshot-4",
              worldDefinitionId: "world-definition-1",
              worldDefinitionRevisionId: "world-revision-4",
              revisionNumber: 4,
              name: "Glasswake, Fourth Edition",
            },
          },
        },
      ],
      total: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(/"content"|manifest/);
    expect(prisma.campaignDefinition.findMany).toHaveBeenCalledTimes(1);
    const listQuery = firstCallArgument(prisma.campaignDefinition.findMany);
    expect(listQuery).toMatchObject({
      where: { ownerUserId: "gm-1" },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        archivedAt: true,
        updatedAt: true,
      },
      orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
    });
    expect(JSON.stringify(listQuery)).toContain('"capturedWorldSnapshot"');
    expect(JSON.stringify(listQuery)).not.toContain('"content"');
  });

  it("gets one explicitly selected lineage and immutable current revision content", async () => {
    const prisma = {
      campaignDefinition: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: "campaign-definition-1",
          name: "Ashes at Dawn",
          description: null,
          status: "ACTIVE",
          currentRevisionId: "campaign-revision-2",
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          updatedAt: new Date("2026-09-04T12:00:00.000Z"),
          archivedAt: null,
          currentRevision: {
            id: "campaign-revision-2",
            revisionNumber: 2,
            predecessorRevisionId: "campaign-revision-1",
            name: "Ashes at Dawn, Revised",
            content: {
              gmPremise: "The sea is turning to glass.",
              plotDefinitionIds: ["plot-1"],
            },
            contentHash: "campaign-hash-2",
            createdAt: new Date("2026-09-03T11:00:00.000Z"),
            publishedAt: new Date("2026-09-03T12:00:00.000Z"),
            capturedWorldSnapshot: {
              id: "world-snapshot-4",
              worldDefinitionId: "world-definition-1",
              worldDefinitionRevisionId: "world-revision-4",
              contentHash: "world-snapshot-hash-4",
              capturedAt: new Date("2026-09-03T11:00:00.000Z"),
              worldDefinitionRevision: {
                revisionNumber: 4,
                name: "Glasswake, Fourth Edition",
                contentHash: "world-revision-hash-4",
                publishedAt: new Date("2026-09-02T12:00:00.000Z"),
              },
            },
          },
        }),
      },
    };

    const result = await new CampaignDefinitionsService(prisma).get(
      "campaign-definition-1",
      "gm-1",
    );

    expect(result).toEqual({
      id: "campaign-definition-1",
      name: "Ashes at Dawn",
      description: undefined,
      status: "active",
      currentRevisionId: "campaign-revision-2",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
      archivedAt: undefined,
      currentRevision: {
        id: "campaign-revision-2",
        revisionNumber: 2,
        predecessorRevisionId: "campaign-revision-1",
        name: "Ashes at Dawn, Revised",
        content: {
          gmPremise: "The sea is turning to glass.",
          plotDefinitionIds: ["plot-1"],
        },
        contentHash: "campaign-hash-2",
        createdAt: "2026-09-03T11:00:00.000Z",
        publishedAt: "2026-09-03T12:00:00.000Z",
        capturedWorld: {
          snapshotId: "world-snapshot-4",
          worldDefinitionId: "world-definition-1",
          worldDefinitionRevisionId: "world-revision-4",
          snapshotContentHash: "world-snapshot-hash-4",
          capturedAt: "2026-09-03T11:00:00.000Z",
          revisionNumber: 4,
          name: "Glasswake, Fourth Edition",
          revisionContentHash: "world-revision-hash-4",
          publishedAt: "2026-09-02T12:00:00.000Z",
        },
      },
    });
    expect(firstCallArgument(prisma.campaignDefinition.findUnique)).toMatchObject(
      { where: { id: "campaign-definition-1", ownerUserId: "gm-1" } },
    );
    expect(prisma.campaignDefinition.findUnique).toHaveBeenCalledTimes(1);
    expect(
      firstCallArgument(prisma.campaignDefinition.findUnique),
    ).toMatchObject({
      where: { id: "campaign-definition-1" },
    });
    expect(JSON.stringify(result)).not.toContain("manifest");
  });

  it("uses a neutral not-found response without echoing the requested ID", async () => {
    const prisma = {
      campaignDefinition: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const opaqueId = "2cf3db72-opaque-campaign-definition-id";
    const operation = new CampaignDefinitionsService(prisma).get(
      opaqueId,
      "gm-1",
    );

    await expect(operation).rejects.toEqual(
      new NotFoundException("The selected Campaign Definition was not found."),
    );
    await expect(operation).rejects.not.toThrow(opaqueId);
  });

  it("sanitizes persistence failures instead of returning database details", async () => {
    const prisma = {
      campaignDefinition: {
        findMany: jest.fn(),
        findUnique: jest
          .fn()
          .mockRejectedValue(
            new Error("database failed for opaque-campaign-definition-id"),
          ),
      },
    };

    await expect(
      new CampaignDefinitionsService(prisma).get("opaque-id", "gm-1"),
    ).rejects.toEqual(
      new ServiceUnavailableException(
        "Campaign Definitions are temporarily unavailable.",
      ),
    );
  });
});
