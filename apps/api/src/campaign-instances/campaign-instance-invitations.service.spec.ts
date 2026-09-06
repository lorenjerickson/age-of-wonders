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

function acceptanceHarness(
  profiles: Array<{
    id: string;
    userId: string;
    emailHash: string | null;
    phoneHash: string | null;
    standing: "ACTIVE" | "INACTIVE" | "BANNED";
    user: { id: string; displayName: string };
  }>,
) {
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
    expiresAt: new Date(Date.now() + 60_000),
    campaignInstance: { name: "Tuesday Glasswake", status: "ACTIVE" },
  };
  const tx = {
    campaignInstanceInvitation: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    playerProfile: {
      findMany: jest.fn().mockResolvedValue(profiles),
      create: jest.fn(),
    },
    user: { create: jest.fn() },
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
    {} as never,
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

  it("does not bind an invitation whose contacts resolve to different profiles", async () => {
    const { service, tx } = acceptanceHarness([
      {
        id: "profile-email",
        userId: "victim-user",
        emailHash: "email-hash",
        phoneHash: null,
        standing: "ACTIVE",
        user: { id: "victim-user", displayName: "Victim" },
      },
      {
        id: "profile-phone",
        userId: "other-user",
        emailHash: null,
        phoneHash: "phone-hash",
        standing: "ACTIVE",
        user: { id: "other-user", displayName: "Other" },
      },
    ]);

    await expect(
      service.accept("invitation-token-long-enough"),
    ).rejects.toThrow(
      "The invitation contacts do not identify one active participant profile.",
    );
    expect(tx.authSession.create).not.toHaveBeenCalled();
    expect(tx.campaignInstanceHumanMembership.create).not.toHaveBeenCalled();
  });

  it("reuses the one active profile matched by every invitation contact", async () => {
    const { service, tx } = acceptanceHarness([
      {
        id: "profile-river",
        userId: "river-user",
        emailHash: "email-hash",
        phoneHash: "phone-hash",
        standing: "ACTIVE",
        user: { id: "river-user", displayName: "River" },
      },
    ]);
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

  it("does not issue authentication for a non-active participant profile", async () => {
    const { service, tx } = acceptanceHarness([
      {
        id: "profile-banned",
        userId: "banned-user",
        emailHash: "email-hash",
        phoneHash: "phone-hash",
        standing: "BANNED",
        user: { id: "banned-user", displayName: "Banned participant" },
      },
    ]);

    await expect(
      service.accept("invitation-token-long-enough"),
    ).rejects.toThrow(
      "The invitation contacts do not identify one active participant profile.",
    );
    expect(tx.authSession.create).not.toHaveBeenCalled();
    expect(tx.campaignInstanceHumanMembership.create).not.toHaveBeenCalled();
  });
});
