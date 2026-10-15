import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CampaignInstanceCharactersService } from "./campaign-instance-characters.service";

function harness() {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    campaignInstanceSession: { findFirst: jest.fn().mockResolvedValue(null) },
    campaignInstance: {
      findFirst: jest.fn().mockResolvedValue({ id: "instance-1", currentSnapshotId: "instance-snapshot-1", runtime: { id: "runtime-1", revision: 1, state: { formatVersion: 1, preparation: {}, plotProgress: [], placementRealizations: [], creatureEmbodiments: [], itemInstances: [] } }, currentSnapshot: { campaignDefinitionSnapshot: { manifest: buildSnapshotManifest(1, [{ resourceType: "campaign", sourceId: "campaign", payload: {} }]) }, worldDefinitionSnapshot: { manifest: buildSnapshotManifest(1, [{resourceType: "world", sourceId: "world", payload: {}}]) } } }),
    },
    campaignInstanceRuntime: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    campaignInstanceHumanMembership: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    campaignInstanceCharacterAssociation: {
      create: jest.fn((input: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...input.data,
          status: "DRAFT",
          origin: input.data.origin ?? "CREATED_IN_INSTANCE",
        }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignInstanceCharacterDraft: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    domainRecord: {
      create: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    campaignInstance: { findFirst: jest.fn() },
    campaignInstanceHumanMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    campaignInstanceCharacterAssociation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    sessionParticipation: { findFirst: jest.fn().mockResolvedValue(null) },
    domainRecord: { findUnique: jest.fn() },
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  const characterDrafts = {
    activationMaterialization: jest.fn().mockResolvedValue({
      snapshotId: "instance-snapshot-1",
      sourceDraftRevision: 3,
      equipmentContext: { definitions: [], availableSlots: [] },
      data: {
        identity: { id: "character-1", version: { revision: 1 } },
        ownerMembershipId: "membership-1",
        campaignInstanceId: "instance-1",
        startingEquipmentDefinitionIds: [],
      },
    }),
  };
  return {
    prisma,
    tx,
    characterDrafts,
    service: new CampaignInstanceCharactersService(
      prisma as never,
      characterDrafts as never,
    ),
  };
}

describe("CampaignInstanceCharactersService", () => {
  it("offers imports only for matching Players in other owned Instances", async () => {
    const { service, prisma } = harness();
    prisma.campaignInstance.findFirst.mockResolvedValue({
      name: "Tuesday Glasswake",
    });
    prisma.campaignInstanceHumanMembership.findMany.mockResolvedValue([
      {
        id: "membership-destination",
        userId: "player-user",
        displayName: "River",
      },
    ]);
    prisma.campaignInstanceCharacterAssociation.findMany.mockResolvedValue([
      {
        characterId: "source-character",
        characterName: "Aster Vale",
        status: "RETIRED",
        playerMembership: { userId: "player-user" },
        campaignInstance: {
          id: "source-instance",
          name: "Earlier Glasswake",
          campaignDefinition: {
            id: "source-definition",
            name: "Glasswake",
          },
        },
      },
    ]);
    prisma.campaignInstanceCharacterAssociation.count.mockResolvedValue(1);

    await expect(
      service.characterImportOptions("instance-1", "gm-1", 50, 0),
    ).resolves.toEqual({
      campaignInstanceId: "instance-1",
      campaignInstanceName: "Tuesday Glasswake",
      items: [
        {
          playerMembershipId: "membership-destination",
          playerName: "River",
          sourceCampaignDefinitionId: "source-definition",
          sourceCampaignDefinitionName: "Glasswake",
          sourceCampaignInstanceId: "source-instance",
          sourceCampaignInstanceName: "Earlier Glasswake",
          sourceCharacterId: "source-character",
          sourceCharacterName: "Aster Vale",
          sourceCharacterStatus: "retired",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    expect(
      prisma.campaignInstanceCharacterAssociation.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaignInstanceId: { not: "instance-1" },
          status: { not: "DRAFT" },
          campaignInstance: { ownerUserId: "gm-1" },
          draft: { status: "COMPLETE" },
        }) as unknown,
      }),
    );
  });

  it("blocks membership changes while the member participates in a current Session", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceHumanMembership.findFirst.mockResolvedValue({
      id: "membership-1",
      displayName: "River",
      status: "ACTIVE",
      campaignInstance: { name: "Tuesday Glasswake" },
    });
    prisma.sessionParticipation.findFirst.mockResolvedValue({
      participantName: "River",
    });

    await expect(
      service.changeMembershipStatus("instance-1", "membership-1", "gm-1", {
        expectedStatus: "active",
        targetStatus: "inactive",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      tx.campaignInstanceHumanMembership.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("creates a Character only for an active Player membership", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceHumanMembership.findFirst.mockResolvedValue({
      id: "membership-1",
      userId: "player-user",
      displayName: "River",
      campaignInstance: { name: "Tuesday Glasswake" },
    });

    const result = await service.createCharacter("instance-1", "gm-1", {
      name: "Aster Vale",
      playerMembershipId: "membership-1",
    });

    expect(result).toMatchObject({
      campaignInstanceName: "Tuesday Glasswake",
      character: { name: "Aster Vale", status: "draft" },
    });
    expect(tx.campaignInstanceCharacterAssociation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          campaignInstanceId: "instance-1",
          playerMembershipId: "membership-1",
        }),
      }),
    );
    expect(tx.campaignInstanceCharacterDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignInstanceId: "instance-1",
        playerMembershipId: "membership-1",
        name: "Aster Vale",
      }) as unknown,
    });
  });

  it("rejects one-way import when the destination belongs to another Player", async () => {
    const { service, prisma } = harness();
    prisma.campaignInstanceHumanMembership.findFirst.mockResolvedValue({
      id: "membership-destination",
      userId: "destination-user",
      displayName: "River",
      campaignInstance: { name: "Tuesday Glasswake" },
    });
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue({
      characterId: "source-character",
      characterName: "Aster Vale",
      campaignInstanceId: "source-instance",
      campaignInstance: { name: "Earlier Glasswake" },
      playerMembership: { userId: "different-user", displayName: "Other" },
    });

    await expect(
      service.importCharacter("instance-1", "gm-1", {
        sourceCampaignDefinitionId: "source-definition",
        sourceCampaignInstanceId: "source-instance",
        sourceCharacterId: "source-character",
        playerMembershipId: "membership-destination",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("uses a neutral miss for a Character outside the owned source lineage", async () => {
    const { service, prisma } = harness();
    prisma.campaignInstanceHumanMembership.findFirst.mockResolvedValue({
      id: "membership-destination",
      userId: "destination-user",
      displayName: "River",
      campaignInstance: { name: "Tuesday Glasswake" },
    });
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue(
      null,
    );

    await expect(
      service.importCharacter("instance-1", "gm-1", {
        sourceCampaignDefinitionId: "wrong-definition",
        sourceCampaignInstanceId: "source-instance",
        sourceCharacterId: "source-character",
        playerMembershipId: "membership-destination",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("copies imported sheet choices into a distinct destination draft", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceHumanMembership.findFirst.mockResolvedValue({
      id: "membership-destination",
      userId: "player-user",
      displayName: "River",
      campaignInstance: { name: "Tuesday Glasswake" },
    });
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue({
      characterId: "source-character",
      characterName: "Aster Vale",
      campaignInstanceId: "source-instance",
      campaignInstance: { name: "Earlier Glasswake" },
      playerMembership: { userId: "player-user", displayName: "River" },
    });
    prisma.domainRecord.findUnique.mockResolvedValue({
      kind: "character",
      data: {
        identity: { id: "source-character", revision: 7 },
        name: "Aster Vale",
        ownerMembershipId: "source-membership",
        backgroundDefinitionId: "background-scout",
        professionDefinitionId: "profession-ranger",
        heritageDefinitionIds: ["heritage-riverfolk"],
        attributeAssignments: { might: 75 },
        privateData: { secret: "preserved import" },
      },
    });

    await service.importCharacter("instance-1", "gm-1", {
      sourceCampaignDefinitionId: "source-definition",
      sourceCampaignInstanceId: "source-instance",
      sourceCharacterId: "source-character",
      playerMembershipId: "membership-destination",
      name: "Aster Recast",
    });

    expect(tx.campaignInstanceCharacterDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignInstanceId: "instance-1",
        playerMembershipId: "membership-destination",
        name: "Aster Recast",
        sourceSheet: expect.objectContaining({
          privateData: { secret: "preserved import" },
        }) as unknown,
        backgroundDefinitionId: "background-scout",
        professionDefinitionId: "profession-ranger",
        heritageDefinitionIds: ["heritage-riverfolk"],
      }) as unknown,
    });
  });

  it("blocks Character activation until its Instance-bound draft is approved", async () => {
    const { service, prisma, tx, characterDrafts } = harness();
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue({
      characterId: "character-1",
      characterName: "Aster Vale",
      status: "DRAFT",
      playerMembershipId: "membership-1",
      campaignInstance: { name: "Tuesday Glasswake" },
      playerMembership: {
        status: "ACTIVE",
        displayName: "River",
        playerProfile: { standing: "ACTIVE" },
      },
    });
    characterDrafts.activationMaterialization.mockRejectedValue(
      new ConflictException("The Character sheet requires GM approval."),
    );

    await expect(
      service.changeCharacterStatus("instance-1", "character-1", "gm-1", {
        expectedStatus: "draft",
        targetStatus: "active",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      tx.campaignInstanceCharacterAssociation.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("materializes the approved snapshot-stamped sheet during activation", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue({
      characterId: "character-1",
      characterName: "Aster Vale",
      status: "DRAFT",
      playerMembershipId: "membership-1",
      campaignInstance: { name: "Tuesday Glasswake" },
      playerMembership: {
        status: "ACTIVE",
        displayName: "River",
        playerProfile: { standing: "ACTIVE" },
      },
    });

    await service.changeCharacterStatus("instance-1", "character-1", "gm-1", {
      expectedStatus: "draft",
      targetStatus: "active",
    });

    expect(tx.domainRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: "campaign-instance-character-sheet",
          name: "Aster Vale",
        }) as unknown,
      }),
    );
  });

  it("rejects activation if the Instance snapshot changes before materialization", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue({
      characterId: "character-1",
      characterName: "Aster Vale",
      status: "DRAFT",
      playerMembershipId: "membership-1",
      campaignInstance: { name: "Tuesday Glasswake" },
      playerMembership: {
        status: "ACTIVE",
        displayName: "River",
        playerProfile: { standing: "ACTIVE" },
      },
    });
    tx.campaignInstance.findFirst.mockResolvedValue(null);

    await expect(
      service.changeCharacterStatus("instance-1", "character-1", "gm-1", {
        expectedStatus: "draft",
        targetStatus: "active",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.domainRecord.upsert).not.toHaveBeenCalled();
    expect(
      tx.campaignInstanceCharacterAssociation.updateMany,
    ).not.toHaveBeenCalled();
  });
  it("reactivates an inactive Character without overwriting the runtime sheet", async () => {
    const { service, prisma, tx, characterDrafts } = harness();
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue({
      characterId: "character-1",
      characterName: "Aster",
      status: "INACTIVE",
      playerMembershipId: "membership-1",
      campaignInstance: { name: "Tuesday" },
      playerMembership: {
        status: "ACTIVE",
        playerProfile: { standing: "ACTIVE" },
      },
    });
    await service.changeCharacterStatus("instance-1", "character-1", "gm-1", {
      expectedStatus: "inactive",
      targetStatus: "active",
    });
    expect(characterDrafts.activationMaterialization).not.toHaveBeenCalled();
    expect(tx.domainRecord.upsert).not.toHaveBeenCalled();
    expect(
      tx.campaignInstanceCharacterAssociation.updateMany,
    ).toHaveBeenCalled();
  });
  it("rejects a concurrently changed approval before publishing the sheet", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceCharacterAssociation.findFirst.mockResolvedValue({
      characterId: "character-1",
      characterName: "Aster",
      status: "DRAFT",
      playerMembershipId: "membership-1",
      campaignInstance: { name: "Tuesday" },
      playerMembership: {
        status: "ACTIVE",
        playerProfile: { standing: "ACTIVE" },
      },
    });
    tx.campaignInstanceCharacterDraft.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(
      service.changeCharacterStatus("instance-1", "character-1", "gm-1", {
        expectedStatus: "draft",
        targetStatus: "active",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.campaignInstanceCharacterDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revision: 3,
          status: "COMPLETE",
        }) as unknown,
      }),
    );
    expect(tx.domainRecord.upsert).not.toHaveBeenCalled();
    expect(
      tx.campaignInstanceCharacterAssociation.updateMany,
    ).not.toHaveBeenCalled();
  });
});
