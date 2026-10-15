import { ConfigService } from "@nestjs/config";
import { HttpStatus } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import type { ContactProtector } from "../invitations/invitation-security";

function service() {
  const prisma = {
    systemAdministrator: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: "administrator-1",
          user: {
            id: "gm-1",
            displayName: "Game Master",
            role: UserRole.GM,
          },
        }),
      ),
    },
  } as unknown as PrismaService;
  return new AuthService(
    prisma,
    new ConfigService({ GM_BOOTSTRAP_TOKEN: "correct-bootstrap-token" }),
    {} as ContactProtector,
  );
}

describe("AuthService bootstrap exchange", () => {
  it("accepts the configured credential without persisting it as a session", async () => {
    await expect(
      service().authenticateBootstrap("correct-bootstrap-token", "client-1"),
    ).resolves.toMatchObject({ id: "gm-1", role: UserRole.GM });
  });

  it("authenticates the administrator even when GM authority was not granted", async () => {
    const findFirstAdministrator = jest.fn().mockResolvedValue({
      id: "administrator-1",
      user: {
        id: "operator-1",
        displayName: "Operator",
        role: UserRole.PARTICIPANT,
      },
    });
    const prisma = {
      systemAdministrator: {
        findFirst: findFirstAdministrator,
      },
    } as unknown as PrismaService;
    const auth = new AuthService(
      prisma,
      new ConfigService({ GM_BOOTSTRAP_TOKEN: "correct-bootstrap-token" }),
      {} as ContactProtector,
    );

    await expect(
      auth.authenticateBootstrap("correct-bootstrap-token", "client-1"),
    ).resolves.toMatchObject({
      id: "operator-1",
      role: UserRole.PARTICIPANT,
    });
    expect(findFirstAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE" } }),
    );
  });

  it("reports first-launch setup until an administrator exists", async () => {
    const prisma = {
      systemAdministrator: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const auth = new AuthService(
      prisma,
      new ConfigService({ GM_BOOTSTRAP_TOKEN: "correct-bootstrap-token" }),
      {} as ContactProtector,
    );

    await expect(auth.bootstrapStatus()).resolves.toEqual({
      setupRequired: true,
    });
  });

  it.each([false, true])(
    "establishes the operator while reusing a legacy GM (password setup: %s)",
    async (withPassword) => {
      const tx = {
        localCredential: { create: jest.fn().mockResolvedValue({}) },
        systemAdministrator: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({ id: "administrator-1" }),
        },
        user: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: "gm-1", role: UserRole.GM }]),
          update: jest.fn().mockResolvedValue({
            id: "gm-1",
            displayName: "Loren",
            role: UserRole.GM,
          }),
          create: jest.fn(),
        },
        playerProfile: { findUnique: jest.fn().mockResolvedValue(null) },
        authenticationProviderAssociation: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      const prisma = {
        $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
      } as unknown as PrismaService;
      const contacts = {
        protectEmail: jest.fn(() => ({
          encrypted: "email",
          hash: "email-hash",
        })),
        protectPhone: jest.fn(() => ({
          encrypted: "phone",
          hash: "phone-hash",
        })),
        protectOpaque: jest.fn(() => ({
          encrypted: "subject",
          hash: "subject-hash",
        })),
      } as unknown as ContactProtector;
      const auth = new AuthService(
        prisma,
        new ConfigService({ GM_BOOTSTRAP_TOKEN: "correct-bootstrap-token" }),
        contacts,
      );

      await expect(
        auth.establishFirstAdministrator(
          "correct-bootstrap-token",
          {
            displayName: "Loren",
            email: "loren@example.test",
            phone: "+14155550100",
            grantGameMaster: true,
            ...(withPassword
              ? { accountName: "Loren", password: "a long unique password" }
              : {}),
          },
          "client-1",
        ),
      ).resolves.toMatchObject({ id: "gm-1", role: UserRole.GM });
      expect(tx.localCredential.create).toHaveBeenCalledTimes(
        withPassword ? 1 : 0,
      );
      if (withPassword) {
        expect(tx.localCredential.create).toHaveBeenCalledWith({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            userId: "gm-1",
            accountName: "loren",
          }),
        });
      }
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.systemAdministrator.create).toHaveBeenCalledTimes(1);
      expect(tx.authenticationProviderAssociation.create).toHaveBeenCalledWith({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          userId: "gm-1",
          playerProfileId: undefined,
          providerKey: "aow:bootstrap",
          status: "ASSOCIATED",
        }),
      });
    },
  );

  it("rate limits repeated failed exchanges by client", async () => {
    const auth = service();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        auth.authenticateBootstrap("incorrect-bootstrap", "client-1"),
      ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    }
    await expect(
      auth.authenticateBootstrap("incorrect-bootstrap", "client-1"),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
