import { ConflictException } from "@nestjs/common";
import { PlayersService } from "./players.service";

function harness() {
  const prisma = {
    playerProfile: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const contacts = { decrypt: jest.fn((value: string) => `plain:${value}`) };
  return {
    prisma,
    service: new PlayersService(prisma as never, contacts as never),
  };
}

describe("PlayersService", () => {
  it("returns a bounded server-wide directory without exposing contact values", async () => {
    const { service, prisma } = harness();
    prisma.playerProfile.findMany.mockResolvedValue([
      {
        id: "profile-1",
        displayName: "River",
        standing: "ACTIVE",
        emailEncrypted: "cipher-email",
        phoneEncrypted: null,
        campaignMemberships: [{ _count: { characters: 2 } }],
      },
    ]);
    prisma.playerProfile.count.mockResolvedValue(1);

    await expect(service.list(50, 0)).resolves.toEqual({
      items: [
        {
          playerId: "profile-1",
          displayName: "River",
          standing: "active",
          hasEmail: true,
          hasPhone: false,
          membershipCount: 1,
          characterCount: 2,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
  });

  it("uses optimistic standing transitions", async () => {
    const { service, prisma } = harness();
    prisma.playerProfile.findUnique.mockResolvedValue({ displayName: "River" });
    prisma.playerProfile.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.changeStanding("profile-1", {
        expectedStanding: "active",
        targetStanding: "inactive",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
