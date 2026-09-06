import { ConflictException } from "@nestjs/common";
import { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";

function harness(options: { recentCount?: number; createError?: unknown } = {}) {
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
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
  };
  const service = new CampaignInstanceInvitationsService(
    prisma as never,
    { get: jest.fn((_key: string, fallback: unknown) => fallback) } as never,
    { issue: jest.fn(() => ({ token: "secret-token", tokenHash: "token-hash" })) } as never,
    {
      protectEmail: jest.fn(() => ({
        encrypted: "encrypted-email",
        hash: "email-hash",
        normalized: "river@example.test",
      })),
      protectPhone: jest.fn(),
      decrypt: jest.fn(() => "river@example.test"),
    } as never,
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
    expect(prisma.campaignInstanceInvitationDeliveryAttempt.create).toHaveBeenCalledWith({
      data: {
        campaignInstanceId: "instance-1",
        invitationId: "invitation-1",
        channel: "EMAIL",
        status: "PENDING",
      },
      select: { id: true },
    });
    expect(prisma.campaignInstanceInvitationDeliveryAttempt.update).toHaveBeenCalledWith({
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
});
