import { BadRequestException, ConflictException } from "@nestjs/common";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import {
  characterEquipmentIssue,
  CampaignInstanceCharacterDraftsService,
} from "./campaign-instance-character-drafts.service";

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
    heritageDefinitionIds: [],
    imageAssetIds: {
      portrait: "portrait",
      overheadToken: "overhead",
      paperDollToken: "side",
    },
    attributeRolls: [91, 82, 73, 64, 55, 46, 37, 28, 19, 10],
    attributeAssignments: {
      "aow:attribute-might": 91,
      "aow:attribute-intellect": 82,
      "aow:attribute-wisdom": 73,
      "aow:attribute-hardiness": 64,
      "aow:attribute-charisma": 55,
      "aow:attribute-agility": 46,
      "aow:attribute-fortune": 37,
      "aow:attribute-sanity": 28,
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
      findFirst: jest.fn().mockResolvedValue({ id: "instance-1" }),
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
    mediaAsset: { findFirst: jest.fn().mockResolvedValue({ id: "portrait" }) },
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
        { id: "aow:attribute-might", name: "Might", minimum: 0, maximum: 100 },
        {
          id: "aow:attribute-intellect",
          name: "Intellect",
          minimum: 0,
          maximum: 100,
        },
        {
          id: "aow:attribute-wisdom",
          name: "Wisdom",
          minimum: 0,
          maximum: 100,
        },
        {
          id: "aow:attribute-hardiness",
          name: "Hardiness",
          minimum: 0,
          maximum: 100,
        },
        {
          id: "aow:attribute-charisma",
          name: "Charisma",
          minimum: 0,
          maximum: 100,
        },
        {
          id: "aow:attribute-agility",
          name: "Agility",
          minimum: 0,
          maximum: 100,
        },
        {
          id: "aow:attribute-fortune",
          name: "Fortune",
          minimum: 0,
          maximum: 100,
        },
        {
          id: "aow:attribute-sanity",
          name: "Sanity",
          minimum: 0,
          maximum: 100,
        },
      ],
      startingEquipment: [],
      equipmentSlots: [],
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

  it("requires distinct artwork while allowing a sheet without Heritage", async () => {
    const { service, prisma } = harness();
    prisma.campaignInstanceCharacterDraft.findFirst.mockResolvedValue(
      completeDraft({
        imageAssetIds: {
          portrait: "same",
          overheadToken: "same",
          paperDollToken: "same",
        },
      }),
    );
    await expect(
      service.submitForReview("instance-1", "character-1", "player-1", 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("submits a complete snapshot-conformant draft without Heritage for GM review", async () => {
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

describe("GM Character authoring", () => {
  it("checks owner scope and records GM attribution without requiring Player impersonation", async () => {
    const { service, prisma, tx } = harness();
    await service.update(
      "instance-1",
      "character-1",
      "gm-1",
      {
        expectedRevision: 1,
        name: "Prepared Character",
        heritageDefinitionIds: [],
        attributeAssignments: { "aow:attribute-might": 40 },
        imageAssetIds: { portrait: "portrait" },
      },
      true,
    );
    expect(prisma.campaignInstance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerUserId: "gm-1" }) as unknown,
      }),
    );
    expect(
      prisma.campaignInstanceHumanMembership.findFirst,
    ).not.toHaveBeenCalled();
    expect(tx.campaignInstanceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: "gm-1",
          action: "instance.character.edited-by-gm",
        }) as unknown,
      }),
    );
    expect(tx.campaignInstanceCharacterDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revision: 1,
          status: "IN_PROGRESS",
        }) as unknown,
      }),
    );
  });
  it("rejects foreign owners and submitted sheets before mutation", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstance.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.get("instance-1", "character-1", "foreign", true),
    ).rejects.toThrow("not found");
    prisma.campaignInstanceCharacterDraft.findFirst.mockResolvedValueOnce({
      ...draft(),
      status: "READY_FOR_REVIEW",
    });
    await expect(
      service.update(
        "instance-1",
        "character-1",
        "gm-1",
        { expectedRevision: 1, name: "Changed" },
        true,
      ),
    ).rejects.toThrow("immutable");
    expect(tx.campaignInstanceCharacterDraft.updateMany).not.toHaveBeenCalled();
  });
  it("rejects unavailable art and still validates required choices on submission", async () => {
    const { service, prisma, tx } = harness();
    prisma.mediaAsset.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.update(
        "instance-1",
        "character-1",
        "gm-1",
        { expectedRevision: 1, imageAssetIds: { portrait: "foreign" } },
        true,
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      service.submitForReview("instance-1", "character-1", "gm-1", 1, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.campaignInstanceCharacterDraft.updateMany).not.toHaveBeenCalled();
  });
});

describe("Character equipment assignments", () => {
  const slots = [
    { id: "head", name: "Head" },
    { id: "hands", name: "Hands" },
  ];
  const items = [
    { id: "hat", name: "Hat", compatibleSlotSets: [["head"]] },
    { id: "helm", name: "Helm", compatibleSlotSets: [["head"]] },
  ];
  it("accepts carried items and compatible occupied slots", () => {
    expect(
      characterEquipmentIssue({ hat: ["head"] }, ["hat", "helm"], items, slots),
    ).toBeUndefined();
    expect(characterEquipmentIssue({}, ["hat"], items, slots)).toBeUndefined();
  });
  it("rejects incompatible, overlapping, and unowned assignments", () => {
    expect(
      characterEquipmentIssue({ hat: ["hands"] }, ["hat"], items, slots),
    ).toContain("does not fit");
    expect(
      characterEquipmentIssue(
        { hat: ["head"], helm: ["head"] },
        ["hat", "helm"],
        items,
        slots,
      ),
    ).toContain("same equipment slot");
    expect(
      characterEquipmentIssue({ hat: ["head"] }, [], items, slots),
    ).toContain("carried Item");
  });
});

describe("B08 captured Character benefits", () => {
  it("captures Background, explicit Profession tier and referenced Skill grants without inventing actor statistics", async () => {
    const { service, prisma } = harness();
    prisma.campaignInstanceCharacterDraft.findFirst.mockResolvedValue(
      completeDraft({
        status: "COMPLETE",
        reviewedAt: new Date("2026-10-14T00:00:00Z"),
      }),
    );
    const recipe = {
      id: "health",
      label: "Health",
      kind: "rolled-flat",
      stacking: "add",
      dice: [{ count: 2, sides: 6 }],
      target: { kind: "health-maximum" },
    };
    const manifest = buildSnapshotManifest(1, [
      {
        resourceType: "definitions",
        sourceId: "background-scout",
        payload: {
          kind: "background",
          name: "Scout",
          components: {
            modifierGrants: [recipe],
            skillProficiencyIds: ["tracking"],
          },
        },
      },
      {
        resourceType: "definitions",
        sourceId: "tracking",
        payload: {
          kind: "skill",
          components: {
            modifierGrants: [
              {
                ...recipe,
                id: "tracking-grant",
                kind: "skill-proficiency",
                target: { kind: "skill-check", skillDefinitionId: "tracking" },
              },
            ],
          },
        },
      },
      {
        resourceType: "definitions",
        sourceId: "profession-ranger",
        payload: {
          kind: "profession",
          name: "Ranger",
          components: {
            acquisition: [
              { kind: "character-creation", startingExpertise: "aow:novice" },
            ],
            expertiseLevels: [
              {
                tier: "aow:novice",
                benefits: { modifierGrants: [{ ...recipe, id: "novice" }] },
              },
              {
                tier: "aow:master",
                benefits: { modifierGrants: [{ ...recipe, id: "master" }] },
              },
            ],
          },
        },
      },
    ]);
    prisma.campaignInstance.findUnique.mockResolvedValue({
      currentSnapshot: {
        id: "instance-snapshot-1",
        campaignDefinitionSnapshot: {
          campaignDefinitionRevision: { content: {} },
        },
        worldDefinitionSnapshot: {
          manifest,
          worldDefinitionRevision: { modelSchemaSelections: [] },
        },
      },
    });
    const result = await service.activationMaterialization(
      "instance-1",
      "character-1",
      "gm-1",
    );
    const grants = result.data
      .modifierGrants as unknown as import("@aow/common").GrantedModifier[];
    expect(grants.map((grant) => grant.definition.id)).toEqual([
      "health",
      "tracking-grant",
      "novice",
    ]);
    expect(grants[0].resolution).toMatchObject({
      kind: "flat",
      rolls: [[expect.any(Number), expect.any(Number)]],
      value: expect.any(Number) as unknown,
    });
    expect(grants[1].resolution).toEqual({ kind: "per-check" });
    expect(grants[2].source).toMatchObject({
      kind: "profession",
      expertise: "aow:novice",
    });
    expect(result.data).not.toHaveProperty("hitPoints");
    expect(
      grants.every(
        (grant) =>
          grant.grantedByEventId === "character-creation:character-1:1",
      ),
    ).toBe(true);
  });
});

describe("imported Character acquisition", () => {
  it("retains exact captured grants and private source fields without carrying deselected grants", async () => {
    const { service, prisma } = harness();
    const recipe = {
      id: "health",
      label: "Hardy",
      kind: "rolled-flat",
      target: { kind: "health-maximum" },
      stacking: "add",
      dice: [{ count: 1, sides: 6 }],
    };
    const grant = {
      id: "old-grant",
      grantedByEventId: "original-event",
      active: true,
      source: { kind: "background", definitionId: "background-scout" },
      definition: recipe,
      resolution: { kind: "flat", rolls: [[4]], value: 4 },
    };
    prisma.campaignInstanceCharacterDraft.findFirst.mockResolvedValue(
      completeDraft({
        status: "COMPLETE",
        sourceSheet: {
          privateData: { secret: "preserved" },
          modifierGrants: [
            grant,
            {
              ...grant,
              id: "deselected",
              source: { kind: "background", definitionId: "old-background" },
            },
          ],
        },
      }),
    );
    prisma.campaignInstance.findUnique.mockResolvedValue({
      currentSnapshot: {
        id: "instance-snapshot-1",
        campaignDefinitionSnapshot: {
          campaignDefinitionRevision: {
            content: { modelSchemaReleaseIds: [] },
          },
        },
        worldDefinitionSnapshot: {
          worldDefinitionRevision: { modelSchemaSelections: [] },
          manifest: buildSnapshotManifest(1, [
            {
              resourceType: "definitions",
              sourceId: "background-scout",
              payload: {
                kind: "background",
                name: "Scout",
                components: { modifierGrants: [recipe] },
              },
            },
            {
              resourceType: "definitions",
              sourceId: "profession-ranger",
              payload: { kind: "profession", name: "Ranger" },
            },
          ]),
        },
      },
    });
    const result = await service.activationMaterialization(
      "instance-1",
      "character-1",
      "gm-1",
    );
    expect(result.data).toMatchObject({
      privateData: { secret: "preserved" },
      modifierGrants: [grant],
    });
    expect((result.data.modifierGrants as unknown[]).length).toBe(1);
  });
});
