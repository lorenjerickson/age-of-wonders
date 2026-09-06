import { ConflictException } from "@nestjs/common";
import { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";

function harness(
  options: { recentCount?: number; createError?: unknown } = {},
) {
  const invitation = {
    id: "invitation-1",
    invitedName: "River",
    role: "PLAYER",
    status: "PENDING",
    expiresAt: new Date("2026-09-12T00:00:00.000Z"),
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
  };
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    campaignInstanceInvitation: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: options.createError
        ? jest.fn().mockRejectedValue(options.createError)
        : jest.fn().mockResolvedValue(invitation),
    },
    campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    campaignInstance: {
      findFirst: jest.fn().mockResolvedValue({
        id: "instance-1",
        name: "Tuesday Glasswake",
        status: "PREPARING",
      }),
    },
    campaignInstanceInvitation: {
      count: jest.fn().mockResolvedValue(options.recentCount ?? 0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    campaignInstanceInvitationDeliveryAttempt: {
      create: jest.fn().mockResolvedValue({ id: "attempt-1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    playerProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  const service = new CampaignInstanceInvitationsService(
    prisma as never,
    { get: jest.fn((_key: string, fallback: unknown) => fallback) } as never,
    {
      issue: jest.fn(() => ({
        token: "secret-token",
        tokenHash: "token-hash",
      })),
    } as never,
    {
      protectEmail: jest.fn(() => ({
        encrypted: "encrypted-email",
        hash: "email-hash",
        normalized: "river@example.test",
      })),
      protectPhone: jest.fn(),
      decrypt: jest.fn(() => "river@example.test"),
      protectOpaque: jest.fn(() => ({
        encrypted: "encrypted-identity",
        hash: "identity-hash",
        normalized: "identity",
      })),
    } as never,
    { prepareSession: jest.fn() } as never,
    {
      send: jest.fn().mockResolvedValue({
        providerMessageId: "provider-message",
        captured: true,
      }),
    },
    { send: jest.fn() },
  );
  return { service, prisma, tx };
}

function acceptanceHarness(invitedUser?: {
  id: string;
  displayName: string;
  playerProfile: null | {
    id: string;
    standing: "ACTIVE" | "INACTIVE" | "BANNED";
  };
}) {
  const invitation = {
    id: "invitation-1",
    campaignInstanceId: "instance-1",
    invitedName: "River",
    role: "PLAYER",
    status: "PENDING",
    emailEncrypted: "encrypted-email",
    emailHash: "email-hash",
    phoneEncrypted: "encrypted-phone",
    phoneHash: "phone-hash",
    tokenHash: "token-hash",
    invitedUserId: invitedUser?.id,
    expiresAt: new Date(Date.now() + 60_000),
    campaignInstance: { name: "Tuesday Glasswake", status: "ACTIVE" },
  };
  const tx = {
    campaignInstanceInvitation: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    playerProfile: {
      create: jest.fn().mockResolvedValue({ id: "new-profile" }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(invitedUser ?? null),
      create: jest.fn().mockResolvedValue({
        id: "new-user",
        displayName: "River",
      }),
    },
    authenticationProviderAssociation: {
      create: jest.fn().mockResolvedValue({}),
    },
    campaignInstanceHumanMembership: { create: jest.fn() },
    authSession: { create: jest.fn() },
  };
  const prisma = {
    campaignInstanceInvitation: {
      findUnique: jest.fn().mockResolvedValue(invitation),
    },
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  const service = new CampaignInstanceInvitationsService(
    prisma as never,
    {} as never,
    { hash: jest.fn(() => "token-hash") } as never,
    {
      protectOpaque: jest.fn(() => ({
        encrypted: "encrypted-identity",
        hash: "identity-hash",
        normalized: "identity",
      })),
    } as never,
    {
      prepareSession: jest.fn(() => ({
        token: "session-token",
        data: {
          userId: "pending",
          tokenHash: "session-hash",
          expiresAt: new Date(Date.now() + 60_000),
        },
      })),
    } as never,
    {} as never,
    {} as never,
  );
  return { service, tx };
}

describe("CampaignInstanceInvitationsService", () => {
  it("creates, audits, and records a contact-free delivery result", async () => {
    const { service, prisma, tx } = harness();
    const result = await service.create("instance-1", "gm-1", {
      invitedName: "River",
      role: "player",
      email: "river@example.test",
    });
    expect(result).toEqual({
      campaignInstanceId: "instance-1",
      campaignInstanceName: "Tuesday Glasswake",
      invitation: {
        id: "invitation-1",
        invitedName: "River",
        role: "player",
        status: "pending",
        expiresAt: "2026-09-12T00:00:00.000Z",
      },
      deliveries: [{ channel: "email", status: "captured" }],
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      tx.campaignInstanceInvitation.create.mock.invocationCallOrder[0],
    );
    expect(tx.campaignInstanceAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.campaignInstanceInvitationDeliveryAttempt.create,
    ).toHaveBeenCalledWith({
      data: {
        campaignInstanceId: "instance-1",
        invitationId: "invitation-1",
        channel: "EMAIL",
        status: "PENDING",
      },
      select: { id: true },
    });
    expect(
      prisma.campaignInstanceInvitationDeliveryAttempt.update,
    ).toHaveBeenCalledWith({
      where: { id: "attempt-1" },
      data: {
        status: "CAPTURED",
        providerReference: "provider-message",
      },
    });
  });

  it("enforces the issuance bound again while holding the table lock", async () => {
    const { service, tx } = harness({ recentCount: 20 });
    await expect(
      service.create("instance-1", "gm-1", {
        invitedName: "River",
        role: "player",
        email: "river@example.test",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.campaignInstanceInvitation.create).not.toHaveBeenCalled();
  });

  it("uses contact matches only to prevent claiming an existing Player", async () => {
    const { service, prisma, tx } = harness();
    prisma.playerProfile.findFirst.mockResolvedValue({
      displayName: "Existing River",
    });

    await expect(
      service.create("instance-1", "gm-1", {
        invitedName: "River",
        role: "player",
        email: "river@example.test",
      }),
    ).rejects.toThrow(
      "Existing River already has a Player profile. Select that Player explicitly.",
    );
    expect(tx.campaignInstanceInvitation.create).not.toHaveBeenCalled();
  });

  it("binds an existing Player only when that profile is selected explicitly", async () => {
    const { service, prisma, tx } = harness();
    prisma.playerProfile.findFirst.mockResolvedValue({
      userId: "river-user",
      displayName: "Existing River",
      emailEncrypted: "encrypted-email",
      emailHash: "email-hash",
      phoneEncrypted: null,
      phoneHash: null,
    });

    await service.create("instance-1", "gm-1", {
      invitedName: "Ignored transport label",
      role: "player",
      playerId: "profile-river",
    });

    expect(tx.campaignInstanceInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          invitedName: "Existing River",
          invitedUserId: "river-user",
        }),
      }),
    );
  });

  it("enforces the same issuance bound when retrying an invitation", async () => {
    const { service, prisma, tx } = harness();
    prisma.campaignInstanceInvitation.findFirst.mockResolvedValue({
      id: "invitation-1",
      invitedName: "River",
      role: "PLAYER",
      status: "PENDING",
      emailEncrypted: "encrypted-email",
      emailHash: "email-hash",
      phoneEncrypted: null,
      phoneHash: null,
      invitedUserId: null,
    });
    tx.campaignInstanceInvitation.count.mockResolvedValue(20);

    await expect(
      service.retry("instance-1", "invitation-1", "gm-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.campaignInstanceInvitation.updateMany).not.toHaveBeenCalled();
    expect(tx.campaignInstanceInvitation.create).not.toHaveBeenCalled();
  });

  it("creates a new identity when an invitation is not explicitly bound", async () => {
    const { service, tx } = acceptanceHarness();
    tx.campaignInstanceHumanMembership.create.mockResolvedValue({
      id: "membership-river",
      role: "PLAYER",
    });

    await service.accept("invitation-token-long-enough");

    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.playerProfile.create).toHaveBeenCalledTimes(1);
    expect(tx.authenticationProviderAssociation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          userId: "new-user",
          playerProfileId: "new-profile",
          providerKey: "aow:invitation",
        }),
      }),
    );
  });

  it("reuses only the active identity explicitly bound when the invitation was issued", async () => {
    const { service, tx } = acceptanceHarness({
      id: "river-user",
      displayName: "River",
      playerProfile: { id: "profile-river", standing: "ACTIVE" },
    });
    tx.campaignInstanceHumanMembership.create.mockResolvedValue({
      id: "membership-river",
      role: "PLAYER",
    });

    await expect(
      service.accept("invitation-token-long-enough"),
    ).resolves.toMatchObject({
      sessionToken: "session-token",
      user: { displayName: "River", role: "player" },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.playerProfile.create).not.toHaveBeenCalled();
    expect(JSON.stringify(tx.authSession.create.mock.calls)).toContain(
      '"userId":"river-user"',
    );
  });

  it("does not issue authentication for an explicitly bound non-active Player", async () => {
    const { service, tx } = acceptanceHarness({
      id: "banned-user",
      displayName: "Banned participant",
      playerProfile: { id: "profile-banned", standing: "BANNED" },
    });

    await expect(
      service.accept("invitation-token-long-enough"),
    ).rejects.toThrow("The invited Player is not active on this server.");
    expect(tx.authSession.create).not.toHaveBeenCalled();
    expect(tx.campaignInstanceHumanMembership.create).not.toHaveBeenCalled();
  });
});
