import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";
import type { ContactProtector } from "../invitations/invitation-security";
import type { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { hashPassword, verifyPassword } from "./password-security";

function fixture() {
  const prisma = {
    localCredential: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authSession: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (operation: (tx: typeof prisma) => unknown) => operation(prisma),
  );
  return {
    prisma,
    auth: new AuthService(
      prisma as unknown as PrismaService,
      new ConfigService(),
      {} as ContactProtector,
    ),
  };
}

describe("local account authentication", () => {
  it("normalizes account names and authenticates the existing identity", async () => {
    const { auth, prisma } = fixture();
    const user = { id: "user-1", displayName: "GM", role: UserRole.GM };
    prisma.localCredential.findUnique.mockResolvedValue({
      user,
      passwordHash: await hashPassword("correct long password"),
    });
    await expect(
      auth.authenticatePassword(
        "  Game.Master ",
        "correct long password",
        "client",
      ),
    ).resolves.toEqual(user);
    expect(prisma.localCredential.findUnique).toHaveBeenCalledWith({
      where: { accountName: "game.master" },
      include: { user: true },
    });
  });

  it("returns the same failure for missing accounts and wrong passwords", async () => {
    const { auth, prisma } = fixture();
    prisma.localCredential.findUnique.mockResolvedValue(null);
    await expect(
      auth.authenticatePassword("missing", "incorrect"),
    ).rejects.toMatchObject({
      message: "Account name or password is incorrect.",
      status: 401,
    });
    prisma.localCredential.findUnique.mockResolvedValue({
      passwordHash: await hashPassword("correct long password"),
    });
    await expect(
      auth.authenticatePassword("existing", "incorrect"),
    ).rejects.toMatchObject({
      message: "Account name or password is incorrect.",
      status: 401,
    });
  });

  it("limits parallel attempts before credential lookup", async () => {
    const { auth, prisma } = fixture();
    prisma.localCredential.findUnique.mockResolvedValue(null);
    const results = await Promise.allSettled(
      Array.from({ length: 11 }, () =>
        auth.authenticatePassword("account", "bad", "client"),
      ),
    );
    expect(prisma.localCredential.findUnique).toHaveBeenCalledTimes(10);
    expect(results[10]).toMatchObject({
      status: "rejected",
      reason: { status: 429 },
    });
  });

  it("provisions only the authenticated identity using a hash", async () => {
    const { auth, prisma } = fixture();
    prisma.localCredential.findUnique.mockResolvedValue(null);
    await expect(
      auth.configureCredentials("user-1", {
        accountName: "Game.Master",
        password: "correct long password",
      }),
    ).resolves.toEqual({ configured: true, accountName: "game.master" });
    const call = prisma.localCredential.create.mock.calls[0] as [
      { data: { userId: string; passwordHash: string; accountName: string } },
    ];
    expect(call[0].data.userId).toBe("user-1");
    expect(call[0].data.accountName).toBe("game.master");
    await expect(
      verifyPassword("correct long password", call[0].data.passwordHash),
    ).resolves.toBe(true);
  });

  it("requires the current password for replacement and revokes old sessions", async () => {
    const { auth, prisma } = fixture();
    prisma.localCredential.findUnique.mockResolvedValue({
      passwordHash: await hashPassword("old long password"),
    });
    await expect(
      auth.configureCredentials("user-1", {
        accountName: "account",
        password: "new long password",
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(prisma.localCredential.updateMany).not.toHaveBeenCalled();
    await auth.configureCredentials("user-1", {
      accountName: "account",
      password: "new long password",
      currentPassword: "old long password",
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it("rejects invalid account names and short passwords", async () => {
    const { auth, prisma } = fixture();
    await expect(
      auth.configureCredentials("user-1", {
        accountName: "bad name",
        password: "long password example",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      auth.configureCredentials("user-1", {
        accountName: "account",
        password: "short",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.localCredential.create).not.toHaveBeenCalled();
  });
});
