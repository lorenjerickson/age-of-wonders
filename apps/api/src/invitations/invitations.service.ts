import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CampaignRole,
  DeliveryChannel,
  DeliveryStatus,
  InvitationStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { DomainService } from "../domain/domain.service";
import { isObject } from "../domain/domain-resource";
import {
  EMAIL_NOTIFICATION_PORT,
  type NotificationPort,
  SMS_NOTIFICATION_PORT,
} from "../notifications/notification.port";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCampaignInvitationDto } from "./dto/invitation.dto";
import {
  ContactProtector,
  InvitationTokenService,
} from "./invitation-security";

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: DomainService,
    private readonly config: ConfigService,
    private readonly tokens: InvitationTokenService,
    private readonly contacts: ContactProtector,
    private readonly auth: AuthService,
    @Inject(EMAIL_NOTIFICATION_PORT)
    private readonly email: NotificationPort,
    @Inject(SMS_NOTIFICATION_PORT)
    private readonly sms: NotificationPort,
  ) {}

  async create(
    campaignId: string,
    createdByUserId: string,
    dto: CreateCampaignInvitationDto,
    reissuedFromId?: string,
  ) {
    const campaign = await this.domain.get("campaigns", campaignId);
    const email = dto.email ? this.contacts.protectEmail(dto.email) : undefined;
    const phone = dto.phone ? this.contacts.protectPhone(dto.phone) : undefined;
    this.assertChannels(dto.channels, email !== undefined, phone !== undefined);
    const contactFilters = [
      ...(email ? [{ emailHash: email.hash }] : []),
      ...(phone ? [{ phoneHash: phone.hash }] : []),
    ];
    const issued = this.tokens.issue();
    const ttlHours = this.config.get<number>("INVITATION_TTL_HOURS", 168);
    let invitation: Prisma.CampaignInvitationGetPayload<{
      include: { deliveries: true };
    }>;
    try {
      invitation = await this.prisma.$transaction(
        async (tx) => {
          const [duplicate, existingMembership] = await Promise.all([
            tx.campaignInvitation.findFirst({
              where: {
                campaignId,
                ...(reissuedFromId ? { id: { not: reissuedFromId } } : {}),
                OR: contactFilters,
                AND: [
                  {
                    OR: [
                      {
                        status: InvitationStatus.PENDING,
                        expiresAt: { gt: new Date() },
                      },
                      { status: InvitationStatus.ACCEPTED },
                    ],
                  },
                ],
              },
              select: { id: true },
            }),
            tx.campaignMembership.findFirst({
              where: { campaignId, OR: contactFilters },
              select: { id: true },
            }),
          ]);
          if (duplicate || existingMembership) {
            throw new ConflictException(
              "This participant is already associated with the campaign.",
            );
          }
          const replacement = await tx.campaignInvitation.create({
            data: {
              campaignId,
              role: dto.role,
              displayName: dto.displayName.trim(),
              emailEncrypted: email?.encrypted,
              emailHash: email?.hash,
              phoneEncrypted: phone?.encrypted,
              phoneHash: phone?.hash,
              tokenHash: issued.tokenHash,
              reissuedFromId,
              expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
              createdByUserId,
              deliveries: {
                create: [...new Set(dto.channels)].map((channel) => ({
                  channel,
                })),
              },
            },
            include: { deliveries: true },
          });
          if (reissuedFromId) {
            await tx.campaignInvitation.update({
              where: { id: reissuedFromId },
              data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
            });
          }
          return replacement;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ConflictException(
          "This participant is already associated with the campaign.",
        );
      }
      throw error;
    }
    const campaignName = campaign.name ?? "your campaign";
    const joinUrl = `${this.config.get<string>("PUBLIC_WEB_URL", "http://localhost:5173")}/join#token=${encodeURIComponent(issued.token)}`;
    const results = await Promise.all(
      invitation.deliveries.map((delivery) =>
        this.deliver(delivery.id, delivery.channel, email, phone, {
          subject: `Invitation to ${campaignName}`,
          text: `${dto.displayName.trim()}, you have been invited to join ${campaignName}. Open ${joinUrl}`,
        }),
      ),
    );
    return {
      invitation: this.gmView(invitation),
      deliveries: results,
      ...(results.some((result) => result.status === "captured")
        ? { developmentJoinUrl: joinUrl }
        : {}),
    };
  }

  async list(campaignId: string) {
    const invitations = await this.prisma.campaignInvitation.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
      include: { deliveries: true },
    });
    return invitations.map((invitation) => this.gmView(invitation));
  }

  async participants(campaignId: string) {
    const memberships = await this.prisma.campaignMembership.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayName: true,
        role: true,
        status: true,
        characterIds: true,
        activeCharacterId: true,
        createdAt: true,
      },
    });
    return {
      participants: memberships.map((membership) => ({
        ...membership,
        role: membership.role.toLowerCase(),
        status: membership.status.toLowerCase(),
      })),
    };
  }

  async revoke(campaignId: string, invitationId: string): Promise<void> {
    const result = await this.prisma.campaignInvitation.updateMany({
      where: {
        id: invitationId,
        campaignId,
        status: InvitationStatus.PENDING,
      },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException("Invitation cannot be revoked.");
    }
  }

  async reissue(
    campaignId: string,
    invitationId: string,
    createdByUserId: string,
  ) {
    const current = await this.prisma.campaignInvitation.findFirst({
      where: { id: invitationId, campaignId },
      include: { deliveries: true },
    });
    if (!current) throw new NotFoundException("Invitation was not found.");
    if (current.status === InvitationStatus.ACCEPTED) {
      throw new ConflictException("A joined invitation cannot be reissued.");
    }
    return this.create(
      campaignId,
      createdByUserId,
      {
        displayName: current.displayName,
        role: current.role,
        email: current.emailEncrypted
          ? this.contacts.decrypt(current.emailEncrypted)
          : undefined,
        phone: current.phoneEncrypted
          ? this.contacts.decrypt(current.phoneEncrypted)
          : undefined,
        channels: current.deliveries.map((delivery) => delivery.channel),
      },
      current.id,
    );
  }

  async resolve(token: string) {
    const invitation = await this.validInvitation(token);
    const campaign = await this.domain.get("campaigns", invitation.campaignId);
    return {
      displayName: invitation.displayName,
      role: invitation.role.toLowerCase(),
      expiresAt: invitation.expiresAt,
      campaignName: campaign.name ?? "Campaign",
      playerIntroduction:
        isObject(campaign.data) &&
        typeof campaign.data.playerIntroduction === "string"
          ? campaign.data.playerIntroduction
          : "",
    };
  }

  async accept(token: string): Promise<{
    sessionToken: string;
    user: { displayName: string; role: "player" | "spectator" };
    draftId?: string;
  }> {
    const invitation = await this.validInvitation(token);
    await this.domain.get("campaigns", invitation.campaignId);
    const session = this.auth.prepareSession("pending");
    const accepted = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.campaignInvitation.updateMany({
        where: {
          id: invitation.id,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Invitation is no longer available.");
      }
      const user = await tx.user.create({
        data: {
          displayName: invitation.displayName,
          role: UserRole.PARTICIPANT,
        },
      });
      await tx.authSession.create({
        data: { ...session.data, userId: user.id },
      });
      const membership = await tx.campaignMembership.create({
        data: {
          campaignId: invitation.campaignId,
          userId: user.id,
          role: invitation.role,
          displayName: invitation.displayName,
          emailEncrypted: invitation.emailEncrypted,
          emailHash: invitation.emailHash,
          phoneEncrypted: invitation.phoneEncrypted,
          phoneHash: invitation.phoneHash,
        },
      });
      const draft =
        invitation.role === CampaignRole.PLAYER
          ? await tx.characterCreationDraft.create({
              data: { membershipId: membership.id },
            })
          : undefined;
      await tx.campaignInvitation.update({
        where: { id: invitation.id },
        data: { acceptedByUserId: user.id },
      });
      return { user, draft };
    });
    return {
      sessionToken: session.token,
      user: {
        displayName: accepted.user.displayName,
        role:
          invitation.role === CampaignRole.SPECTATOR ? "spectator" : "player",
      },
      draftId: accepted.draft?.id,
    };
  }

  private async validInvitation(token: string) {
    const invitation = await this.prisma.campaignInvitation.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
    });
    if (
      !invitation ||
      invitation.status !== InvitationStatus.PENDING ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException("Invitation is invalid or unavailable.");
    }
    return invitation;
  }

  private assertChannels(
    channels: readonly DeliveryChannel[],
    hasEmail: boolean,
    hasPhone: boolean,
  ): void {
    if (channels.includes(DeliveryChannel.EMAIL) && !hasEmail) {
      throw new BadRequestException(
        "Email delivery requires an email address.",
      );
    }
    if (channels.includes(DeliveryChannel.SMS) && !hasPhone) {
      throw new BadRequestException("SMS delivery requires a phone number.");
    }
  }

  private async deliver(
    deliveryId: string,
    channel: DeliveryChannel,
    email: { normalized: string } | undefined,
    phone: { normalized: string } | undefined,
    content: { subject: string; text: string },
  ) {
    const port = channel === DeliveryChannel.EMAIL ? this.email : this.sms;
    const recipient =
      channel === DeliveryChannel.EMAIL ? email?.normalized : phone?.normalized;
    if (!recipient)
      throw new BadRequestException("Delivery contact is missing.");
    try {
      const result = await port.send({ deliveryId, recipient, ...content });
      await this.prisma.invitationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: result.captured
            ? DeliveryStatus.CAPTURED
            : DeliveryStatus.SENT,
          providerMessageId: result.providerMessageId,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          sentAt: new Date(),
          lastErrorCode: null,
        },
      });
      return {
        channel,
        status: result.captured ? "captured" : "sent",
        ...result,
      };
    } catch (error) {
      await this.prisma.invitationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.FAILED,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          lastErrorCode:
            error instanceof Error ? error.constructor.name : "Error",
        },
      });
      return { channel, status: "failed" as const };
    }
  }

  private gmView(invitation: {
    id: string;
    displayName: string;
    role: CampaignRole;
    status: InvitationStatus;
    expiresAt: Date;
    createdAt: Date;
    emailEncrypted?: string | null;
    phoneEncrypted?: string | null;
    deliveries: readonly {
      channel: DeliveryChannel;
      status: DeliveryStatus;
    }[];
  }) {
    const status =
      invitation.status === InvitationStatus.PENDING &&
      invitation.expiresAt.getTime() <= Date.now()
        ? InvitationStatus.EXPIRED
        : invitation.status;
    return {
      id: invitation.id,
      displayName: invitation.displayName,
      role: invitation.role.toLowerCase(),
      status: status.toLowerCase(),
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      deliveries: invitation.deliveries.map((delivery) => ({
        channel: delivery.channel.toLowerCase(),
        status: delivery.status.toLowerCase(),
        destinationLabel:
          delivery.channel === DeliveryChannel.EMAIL &&
          invitation.emailEncrypted
            ? this.maskEmail(this.contacts.decrypt(invitation.emailEncrypted))
            : delivery.channel === DeliveryChannel.SMS &&
                invitation.phoneEncrypted
              ? `••••${this.contacts.decrypt(invitation.phoneEncrypted).slice(-4)}`
              : undefined,
      })),
    };
  }

  private maskEmail(email: string): string {
    const [local = "", domain = ""] = email.split("@");
    return `${local.slice(0, 1) || "•"}•••@${domain}`;
  }
}
