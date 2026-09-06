import { ConflictException, NotFoundException } from "@nestjs/common";
import { CampaignInstanceCharactersService } from "./campaign-instance-characters.service";

function harness() {
  const tx = {
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
    campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    domainRecord: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    campaignInstanceHumanMembership: { findFirst: jest.fn() },
    campaignInstanceCharacterAssociation: { findFirst: jest.fn() },
    sessionParticipation: { findFirst: jest.fn().mockResolvedValue(null) },
    domainRecord: { findUnique: jest.fn() },
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  return {
    prisma,
    tx,
    service: new CampaignInstanceCharactersService(prisma as never),
  };
}

describe("CampaignInstanceCharactersService", () => {
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

  it("copies Character sheet data into a distinct destination identity", async () => {
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
        campaignStatus: "active",
      },
    });

    await service.importCharacter("instance-1", "gm-1", {
      sourceCampaignDefinitionId: "source-definition",
      sourceCampaignInstanceId: "source-instance",
      sourceCharacterId: "source-character",
      playerMembershipId: "membership-destination",
      name: "Aster Recast",
    });

    expect(tx.domainRecord.create).toHaveBeenCalledWith({
      // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        resource: "characters",
        name: "Aster Recast",
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          name: "Aster Recast",
          ownerMembershipId: "membership-destination",
          // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          identity: expect.objectContaining({ revision: 1 }),
        }),
      }),
    });
  });

  it("blocks Character activation until its sheet belongs to the destination membership", async () => {
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
    prisma.domainRecord.findUnique.mockResolvedValue({
      data: { ownerMembershipId: "another-membership" },
    });

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
});
