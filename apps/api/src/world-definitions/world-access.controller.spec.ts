import { WorldAccessController } from "./world-access.controller";
import { ConflictException, NotFoundException } from "@nestjs/common";
function setup() {
  const entries = [
    {
      id: "access",
      playerId: "player",
      role: "viewer",
      revision: 1,
      player: { displayName: "Reader" },
    },
  ];
  const prisma = {
    worldDefinition: {
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; ownerUserId: string } }) =>
          where.id === "world" && where.ownerUserId === "owner"
            ? { id: "world" }
            : null,
      ),
    },
    worldAccessEntry: {
      findMany: jest.fn().mockResolvedValue(entries),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { controller: new WorldAccessController(prisma as never), prisma };
}
const request = (id: string) => ({ user: { id } }) as never;
it.each(["viewer", "editor"])(
  "does not let a shared %s read or change the access roster",
  async (user) => {
    const { controller, prisma } = setup();
    await expect(
      controller.list("world", request(user)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.update("world", "access", request(user), {
        role: "editor",
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.remove("world", "access", request(user), {
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.worldAccessEntry.updateMany).not.toHaveBeenCalled();
    expect(prisma.worldAccessEntry.deleteMany).not.toHaveBeenCalled();
  },
);
it("lets only the owner update a matching World entry revision", async () => {
  const { controller, prisma } = setup();
  await expect(
    controller.update("world", "access", request("owner"), {
      role: "editor",
      expectedRevision: 1,
    }),
  ).resolves.toEqual({
    items: [
      {
        id: "access",
        playerId: "player",
        displayName: "Reader",
        role: "viewer",
        revision: 1,
      },
    ],
  });
  expect(prisma.worldAccessEntry.updateMany).toHaveBeenCalledWith({
    where: { id: "access", worldDefinitionId: "world", revision: 1 },
    data: { role: "editor", revision: { increment: 1 } },
  });
  prisma.worldAccessEntry.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(
    controller.update("world", "access", request("owner"), {
      role: "viewer",
      expectedRevision: 1,
    }),
  ).rejects.toBeInstanceOf(ConflictException);
});
