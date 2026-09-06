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
    updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    campaignInstance: { name: "Tuesday Glasswake" },
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
      maximumHeritages: 1,
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
});
