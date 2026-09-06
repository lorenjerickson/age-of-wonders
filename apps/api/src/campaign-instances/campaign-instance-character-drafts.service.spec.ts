import { BadRequestException, ConflictException } from "@nestjs/common";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { CampaignInstanceCharacterDraftsService } from "./campaign-instance-character-drafts.service";

const worldManifest = buildSnapshotManifest(1, [
  {
    resourceType: "definitions",
    sourceId: "background-scout",
    payload: { kind: "background", name: "Scout" },
  },
  {
    resourceType: "definitions",
    sourceId: "profession-ranger",
    payload: { kind: "profession", name: "Ranger" },
  },
  {
    resourceType: "definitions",
    sourceId: "heritage-riverfolk",
    payload: { kind: "heritage", name: "Riverfolk" },
  },
]);

function membership() {
  return {
    id: "membership-1",
    displayName: "River",
    campaignInstance: {
      name: "Tuesday Glasswake",
      currentSnapshot: {
        worldDefinitionSnapshot: { manifest: worldManifest },
      },
    },
  };
}

function draft() {
  return {
    id: "draft-1",
    campaignInstanceId: "instance-1",
    playerMembershipId: "membership-1",
    characterId: "character-1",
    revision: 1,
    status: "IN_PROGRESS",
    name: "Aster Vale",
    backgroundDefinitionId: null,
    professionDefinitionId: null,
    heritageDefinitionIds: [],
    attributeRolls: [],
    attributeAssignments: {},
    startingEquipmentIds: [],
    biography: null,
    imageAssetIds: {},
    submittedAt: null,
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    campaignInstance: { name: "Tuesday Glasswake" },
    playerMembership: { displayName: "River" },
    character: { status: "DRAFT" },
  };
}

function completeDraft(overrides: Record<string, unknown> = {}) {
  return {
    ...draft(),
    backgroundDefinitionId: "background-scout",
    professionDefinitionId: "profession-ranger",
    heritageDefinitionIds: ["heritage-riverfolk"],
    attributeRolls: [91, 82, 73, 64, 55, 46, 37, 28, 19, 10],
    attributeAssignments: {
      might: 91,
      intellect: 82,
      will: 73,
      hardiness: 64,
      charisma: 55,
      agility: 46,
      fortune: 37,
      sanity: 28,
    },
    ...overrides,
  };
}

function harness() {
  const allocatedCharacterIds: string[] = [];
  const tx = {
    campaignInstanceCharacterAssociation: {
      create: jest.fn((input: { data: { characterId: string } }) => {
        allocatedCharacterIds.push(input.data.characterId);
        return Promise.resolve({});
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignInstanceCharacterDraft: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    campaignInstance: {
      findUnique: jest.fn().mockResolvedValue({
        currentSnapshot: {
          id: "instance-snapshot-1",
          campaignDefinitionSnapshot: {
            campaignDefinitionRevision: {
              content: { modelSchemaReleaseIds: [] },
            },
          },
          worldDefinitionSnapshot: {
            manifest: worldManifest,
            worldDefinitionRevision: { modelSchemaSelections: [] },
          },
        },
      }),
    },
    modelSchemaRelease: { findMany: jest.fn().mockResolvedValue([]) },
    modelElementRevision: { findMany: jest.fn().mockResolvedValue([]) },
    campaignInstanceHumanMembership: {
      findFirst: jest.fn().mockResolvedValue(membership()),
    },
    campaignInstanceCharacterDraft: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(draft()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  return {
    prisma,
    tx,
    allocatedCharacterIds,
    service: new CampaignInstanceCharacterDraftsService(prisma as never),
  };
}

describe("CampaignInstanceCharacterDraftsService", () => {
  it("allocates the Instance association and resumable sheet together", async () => {
    const { service, tx, allocatedCharacterIds } = harness();

    await service.create("instance-1", "player-1", { name: "Aster Vale" });

    expect(tx.campaignInstanceCharacterAssociation.create).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          campaignInstanceId: "instance-1",
          playerMembershipId: "membership-1",
          characterName: "Aster Vale",
        }) as unknown,
      },
    );
    const characterId = allocatedCharacterIds[0];
    expect(characterId).toEqual(expect.any(String));
    expect(tx.campaignInstanceCharacterDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignInstanceId: "instance-1",
        playerMembershipId: "membership-1",
        characterId,
      }) as unknown,
    });
  });

  it("offers only definitions captured by the Instance World snapshot", async () => {
    const { service } = harness();

    await expect(service.options("instance-1", "player-1")).resolves.toEqual({
      backgrounds: [{ id: "background-scout", name: "Scout" }],
      professions: [{ id: "profession-ranger", name: "Ranger" }],
      heritages: [{ id: "heritage-riverfolk", name: "Riverfolk" }],
      attributes: [
        { id: "might", name: "Might", minimum: 0, maximum: 100 },
        { id: "intellect", name: "Intellect", minimum: 0, maximum: 100 },
        { id: "will", name: "Will", minimum: 0, maximum: 100 },
        { id: "hardiness", name: "Hardiness", minimum: 0, maximum: 100 },
        { id: "charisma", name: "Charisma", minimum: 0, maximum: 100 },
        { id: "agility", name: "Agility", minimum: 0, maximum: 100 },
        { id: "fortune", name: "Fortune", minimum: 0, maximum: 100 },
        { id: "sanity", name: "Sanity", minimum: 0, maximum: 100 },
      ],
      startingEquipment: [],
      maximumHeritages: 1,
      attributeRollCount: 10,
    });
  });

  it("uses extensible Attribute elements captured by the World model release", async () => {
    const { service, prisma } = harness();
    prisma.campaignInstance.findUnique.mockResolvedValue({
      currentSnapshot: {
        id: "instance-snapshot-1",
        campaignDefinitionSnapshot: {
          campaignDefinitionRevision: {
            content: { modelSchemaReleaseIds: [] },
          },
        },
        worldDefinitionSnapshot: {
          manifest: worldManifest,
          worldDefinitionRevision: {
            modelSchemaSelections: [
              {
                modelSchemaRelease: {
                  id: "release-homebrew",
                  dependencies: [],
                  elementSelections: [
                    {
                      elementId: "attribute-likeable",
                      elementRevisionId: "attribute-likeable-revision-1",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    prisma.modelElementRevision.findMany.mockResolvedValue([
      {
        id: "attribute-likeable-revision-1",
        payload: {
          kind: "vocabulary-option",
          valueMetadata: { "aow:minimum": 10, "aow:maximum": 90 },
        },
        presentation: { label: "Likeable" },
        element: {
          id: "attribute-likeable",
          key: "homebrew:attribute-likeable",
          semanticRole: "aow:attribute",
        },
      },
    ]);

    await expect(
      service.options("instance-1", "player-1"),
    ).resolves.toMatchObject({
      attributes: [
        {
          id: "attribute-likeable",
          name: "Likeable",
          minimum: 10,
          maximum: 90,
        },
      ],
      attributeRollCount: 3,
    });
  });

  it("includes Attributes inherited through locked model release dependencies", async () => {
    const { service, prisma } = harness();
    prisma.campaignInstance.findUnique.mockResolvedValue({
      currentSnapshot: {
        id: "instance-snapshot-1",
        campaignDefinitionSnapshot: {
          campaignDefinitionRevision: {
            content: { modelSchemaReleaseIds: [] },
          },
        },
        worldDefinitionSnapshot: {
          manifest: worldManifest,
          worldDefinitionRevision: {
            modelSchemaSelections: [
              {
                modelSchemaRelease: {
                  id: "release-homebrew",
                  dependencies: [{ releaseId: "release-core" }],
                  elementSelections: [
                    {
                      elementRevisionId: "attribute-likeable-revision-1",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    prisma.modelSchemaRelease.findMany.mockResolvedValue([
      {
        id: "release-core",
        dependencies: [],
        elementSelections: [
          { elementRevisionId: "attribute-might-revision-1" },
        ],
      },
    ]);
    prisma.modelElementRevision.findMany.mockResolvedValue([
      {
        id: "attribute-likeable-revision-1",
        payload: { kind: "vocabulary-option" },
        presentation: { label: "Likeable" },
        element: {
          id: "attribute-likeable",
          key: "homebrew:attribute-likeable",
          semanticRole: "aow:attribute",
        },
      },
      {
        id: "attribute-might-revision-1",
        payload: { kind: "vocabulary-option" },
        presentation: { label: "Might" },
        element: {
          id: "attribute-might",
          key: "aow:attribute-might",
          semanticRole: "aow:attribute",
        },
      },
    ]);

    await expect(
      service.options("instance-1", "player-1"),
    ).resolves.toMatchObject({
      attributes: [{ name: "Likeable" }, { name: "Might" }],
      attributeRollCount: 4,
    });
  });

  it("rejects a selection absent from the captured World snapshot", async () => {
    const { service } = harness();

    await expect(
      service.update("instance-1", "character-1", "player-1", {
        expectedRevision: 1,
        professionDefinitionId: "profession-from-another-world",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces optimistic concurrency within the Instance-bound sheet", async () => {
    const { service, tx } = harness();
    tx.campaignInstanceCharacterDraft.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.update("instance-1", "character-1", "player-1", {
        expectedRevision: 1,
        name: "Aster Changed Elsewhere",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps a submitted sheet immutable until the GM requests changes", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceCharacterDraft.findFirst.mockResolvedValue(
      completeDraft({ status: "READY_FOR_REVIEW" }),
    );

    await expect(
      service.update("instance-1", "character-1", "player-1", {
        expectedRevision: 1,
        name: "Changed during review",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.campaignInstanceCharacterDraft.updateMany).not.toHaveBeenCalled();
  });

  it("rejects submission until every captured Attribute has a generated roll", async () => {
    const { service, tx } = harness();

    await expect(
      service.submitForReview("instance-1", "character-1", "player-1", 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.campaignInstanceCharacterDraft.updateMany).not.toHaveBeenCalled();
  });

  it("submits a complete snapshot-conformant draft for GM review", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceCharacterDraft.findFirst.mockResolvedValue(
      completeDraft(),
    );

    await service.submitForReview("instance-1", "character-1", "player-1", 1);

    expect(tx.campaignInstanceCharacterDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "READY_FOR_REVIEW",
        }) as unknown,
      }),
    );
  });

  it("records GM approval and produces snapshot-stamped activation materialization", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceCharacterDraft.findFirst
      .mockResolvedValueOnce(
        completeDraft({ status: "READY_FOR_REVIEW", submittedAt: new Date() }),
      )
      .mockResolvedValueOnce(
        completeDraft({ status: "COMPLETE", reviewedAt: new Date() }),
      )
      .mockResolvedValue(
        completeDraft({ status: "COMPLETE", reviewedAt: new Date() }),
      );

    await service.review("instance-1", "character-1", "gm-1", {
      expectedRevision: 1,
      decision: "approve",
    });
    const materialization = await service.activationMaterialization(
      "instance-1",
      "character-1",
      "gm-1",
    );

    expect(tx.campaignInstanceCharacterDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETE" }) as unknown,
      }),
    );
    expect(materialization).toMatchObject({
      snapshotId: "instance-snapshot-1",
      data: {
        campaignInstanceId: "instance-1",
        campaignInstanceSnapshotId: "instance-snapshot-1",
        ownerMembershipId: "membership-1",
      },
    });
  });
});
