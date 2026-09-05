import { ConfigService } from "@nestjs/config";
import {
  CampaignRole,
  DeliveryChannel,
  DeliveryStatus,
  InvitationStatus,
  UserRole,
} from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { DomainService } from "../domain/domain.service";
import { CaptureNotificationAdapter } from "../notifications/notification.adapters";
import { PrismaService } from "../prisma/prisma.service";
import {
  ContactProtector,
  InvitationTokenService,
} from "./invitation-security";
import { InvitationsService } from "./invitations.service";

const config = new ConfigService({
  CONTACT_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
  PUBLIC_WEB_URL: "https://table.example",
  INVITATION_TTL_HOURS: 24,
});

describe("InvitationsService", () => {
  it("stores a token digest, captures delivery, and returns a development link", async () => {
    let createData: Record<string, unknown> | undefined;
    const invitation = {
      id: "invite-1",
      campaignId: "campaign-1",
      displayName: "Avery",
      role: CampaignRole.PLAYER,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      deliveries: [
        {
          id: "delivery-1",
          channel: DeliveryChannel.EMAIL,
          status: DeliveryStatus.PENDING,
        },
      ],
    };
    const tx = {
      campaignInvitation: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        create: jest.fn((input: { data: Record<string, unknown> }) => {
          createData = input.data;
          return Promise.resolve(invitation);
        }),
        update: jest.fn(() => Promise.resolve({})),
      },
      campaignMembership: {
        findFirst: jest.fn(() => Promise.resolve(null)),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
      invitationDelivery: { update: jest.fn(() => Promise.resolve({})) },
    } as unknown as PrismaService;
    const capture = new CaptureNotificationAdapter();
    const service = new InvitationsService(
      prisma,
      {
        get: jest.fn(() => Promise.resolve({ name: "Glasswake", data: {} })),
      } as unknown as DomainService,
      config,
      new InvitationTokenService(),
      new ContactProtector(config),
      {} as AuthService,
      capture,
      capture,
    );

    const result = await service.create("campaign-1", "gm-1", {
      displayName: "Avery",
      role: CampaignRole.PLAYER,
      email: "Avery@example.com",
      channels: [DeliveryChannel.EMAIL],
    });

    expect(createData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(createData)).not.toContain("token=");
    expect(result.developmentJoinUrl).toMatch(
      /^https:\/\/table\.example\/join#token=/,
    );
    expect(capture.messages).toHaveLength(1);
    expect(capture.messages[0]?.recipient).toBe("avery@example.com");
  });

  it("accepts a pending token once and creates a player draft", async () => {
    const tokens = new InvitationTokenService();
    const issued = tokens.issue();
    const invitation = {
      id: "invite-1",
      campaignId: "campaign-1",
      displayName: "Avery",
      role: CampaignRole.PLAYER,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      emailEncrypted: "encrypted",
      emailHash: "hash",
      phoneEncrypted: null,
      phoneHash: null,
    };
    const tx = {
      campaignInvitation: {
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
        update: jest.fn(() => Promise.resolve({})),
      },
      user: {
        create: jest.fn(() =>
          Promise.resolve({
            id: "user-1",
            displayName: "Avery",
            role: UserRole.PARTICIPANT,
          }),
        ),
      },
      authSession: {
        create: jest.fn((input: { data: { userId: string } }) => {
          void input;
          return Promise.resolve({ id: "session-1" });
        }),
      },
      campaignMembership: {
        create: jest.fn(() => Promise.resolve({ id: "membership-1" })),
      },
      characterCreationDraft: {
        create: jest.fn(() => Promise.resolve({ id: "draft-1" })),
      },
    };
    const prisma = {
      campaignInvitation: {
        findUnique: jest.fn(() => Promise.resolve(invitation)),
      },
      $transaction: jest.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    } as unknown as PrismaService;
    const auth = {
      prepareSession: jest.fn(() => ({
        token: "session-token",
        data: {
          userId: "pending",
          tokenHash: "session-hash",
          expiresAt: new Date(Date.now() + 60_000),
        },
      })),
    } as unknown as AuthService;
    const service = new InvitationsService(
      prisma,
      {
        get: jest.fn(() => Promise.resolve({ name: "Glasswake", data: {} })),
      } as unknown as DomainService,
      config,
      tokens,
      new ContactProtector(config),
      auth,
      new CaptureNotificationAdapter(),
      new CaptureNotificationAdapter(),
    );

    await expect(service.accept(issued.token)).resolves.toMatchObject({
      sessionToken: "session-token",
      draftId: "draft-1",
      user: { displayName: "Avery", role: "player" },
    });
    expect(tx.campaignInvitation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.characterCreationDraft.create).toHaveBeenCalledWith({
      data: { membershipId: "membership-1" },
    });
    expect(tx.authSession.create.mock.calls[0]?.[0].data.userId).toBe("user-1");
  });
});
