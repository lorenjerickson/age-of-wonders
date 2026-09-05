import { STANDARD_ATTRIBUTES } from "@aow/common";
import {
  CampaignRole,
  CharacterDraftStatus,
  MembershipStatus,
} from "@prisma/client";
import { DomainService } from "../domain/domain.service";
import { PrismaService } from "../prisma/prisma.service";
import { CharacterDraftsService } from "./character-drafts.service";

const draft = {
  id: "draft-1",
  membershipId: "membership-1",
  characterId: null,
  revision: 3,
  status: CharacterDraftStatus.IN_PROGRESS,
  name: null,
  backgroundDefinitionId: null,
  professionDefinitionId: null,
  heritageDefinitionIds: [],
  attributeRolls: [],
  attributeAssignments: {},
  startingEquipmentIds: [],
  biography: null,
  imageAssetIds: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  membership: {
    id: "membership-1",
    campaignId: "campaign-1",
    userId: "user-1",
    role: CampaignRole.PLAYER,
    status: MembershipStatus.ACTIVE,
    displayName: "Avery",
    emailEncrypted: null,
    emailHash: null,
    phoneEncrypted: null,
    phoneHash: null,
    characterIds: [],
    activeCharacterId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe("CharacterDraftsService", () => {
  it("rolls N + 2 d100 values and uses optimistic revision matching", async () => {
    const updateMany = jest.fn(
      (input: {
        where: { id: string; revision: number };
        data: {
          attributeRolls: number[];
          revision: { increment: number };
        };
      }) => {
        void input;
        return Promise.resolve({ count: 1 });
      },
    );
    const prisma = {
      characterCreationDraft: {
        findUnique: jest.fn(() => Promise.resolve(draft)),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new CharacterDraftsService(prisma, {} as DomainService);

    await service.rollAttributes("draft-1", "user-1", 3);

    const input = updateMany.mock.calls[0]?.[0];
    expect(input?.where).toEqual({ id: "draft-1", revision: 3 });
    expect(input?.data.attributeRolls).toHaveLength(
      STANDARD_ATTRIBUTES.length + 2,
    );
    expect(input?.data.attributeRolls).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect(input?.data.revision).toEqual({ increment: 1 });
  });

  it("rejects a definition that is not among campaign-scoped options", async () => {
    const prisma = {
      characterCreationDraft: {
        findUnique: jest.fn(() => Promise.resolve(draft)),
      },
    } as unknown as PrismaService;
    const domain = {
      get: jest.fn(() =>
        Promise.resolve({ data: { worldId: "world-1" }, name: "Glasswake" }),
      ),
      list: jest.fn(() =>
        Promise.resolve({ items: [], total: 0, limit: 200, offset: 0 }),
      ),
    } as unknown as DomainService;
    const service = new CharacterDraftsService(prisma, domain);

    await expect(
      service.update("draft-1", "user-1", {
        expectedRevision: 3,
        backgroundDefinitionId: "background:not-approved",
      }),
    ).rejects.toThrow("not available in this campaign");
  });
});
