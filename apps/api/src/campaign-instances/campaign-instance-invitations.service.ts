import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CampaignInstanceHumanRole,
  DeliveryChannel,
  DeliveryStatus,
} from "@prisma/client";
import {
  ContactProtector,
  InvitationTokenService,
} from "../invitations/invitation-security";
import {
  EMAIL_NOTIFICATION_PORT,
  type NotificationPort,
  SMS_NOTIFICATION_PORT,
} from "../notifications/notification.port";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCampaignInstanceInvitationDto } from "./dto/campaign-instance-management.dto";

@Injectable()
export class CampaignInstanceInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: InvitationTokenService,
    private readonly contacts: ContactProtector,
    @Inject(EMAIL_NOTIFICATION_PORT) private readonly email: NotificationPort,
    @Inject(SMS_NOTIFICATION_PORT) private readonly sms: NotificationPort,
  ) {}

  async create(
    campaignInstanceId: string,
    ownerUserId: string,
    dto: CreateCampaignInstanceInvitationDto,
  ) {
    const instance = await this.owned(campaignInstanceId, ownerUserId);
    const email = dto.email ? this.contacts.protectEmail(dto.email) : undefined;
    const phone = dto.phone ? this.contacts.protectPhone(dto.phone) : undefined;
    if (!email && !phone) {
      throw new ConflictException("An email address or phone number is required.");
    }
    const issuanceLimit = this.config.get<number>(
      "CAMPAIGN_INSTANCE_INVITATION_HOURLY_LIMIT",
      20,
    );
    const recentCount = await this.prisma.campaignInstanceInvitation.count({
      where: {
        campaignInstanceId,
        createdByUserId: ownerUserId,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1_000) },
      },
    });
    if (recentCount >= issuanceLimit) {
      throw new ConflictException(
        "Invitation delivery is temporarily limited; try again later.",
      );
    }
    const duplicate = await this.prisma.campaignInstanceInvitation.findFirst({
      where: {
        campaignInstanceId,
        status: "PENDING",
        OR: [
          ...(email ? [{ emailHash: email.hash }] : []),
          ...(phone ? [{ phoneHash: phone.hash }] : []),
        ],
      },
      select: { invitedName: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `${duplicate.invitedName ?? "This participant"} already has a pending invitation.`,
      );
    }
    const issued = this.tokens.issue();
    const ttlHours = this.config.get<number>("INVITATION_TTL_HOURS", 168);
    let invitation;
    try {
      invitation = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'LOCK TABLE "CampaignInstanceInvitation" IN SHARE ROW EXCLUSIVE MODE',
        );
        const authoritativeRecentCount =
          await tx.campaignInstanceInvitation.count({
            where: {
              campaignInstanceId,
              createdByUserId: ownerUserId,
              createdAt: { gte: new Date(Date.now() - 60 * 60 * 1_000) },
            },
          });
        if (authoritativeRecentCount >= issuanceLimit) {
          throw new ConflictException(
            "Invitation delivery is temporarily limited; try again later.",
          );
        }
        const created = await tx.campaignInstanceInvitation.create({
      data: {
        campaignInstanceId,
        role:
          dto.role === "player"
            ? CampaignInstanceHumanRole.PLAYER
            : CampaignInstanceHumanRole.SPECTATOR,
        invitedName: dto.invitedName.trim(),
        emailEncrypted: email?.encrypted,
        emailHash: email?.hash,
        phoneEncrypted: phone?.encrypted,
        phoneHash: phone?.hash,
        tokenHash: issued.tokenHash,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
        createdByUserId: ownerUserId,
      },
      select: {
        id: true,
        invitedName: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
        });
        await tx.campaignInstanceAuditEvent.create({
          data: {
            campaignInstanceId,
            actorUserId: ownerUserId,
            action: "instance.invitation.created",
            subjectName: created.invitedName ?? "Invited participant",
            subjectType: "Invitation",
            detail: {
              role: created.role.toLowerCase(),
              channels: [
                ...(email ? ["email"] : []),
                ...(phone ? ["sms"] : []),
              ],
            },
          },
        });
        return created;
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        throw new ConflictException(
          "This participant already has a pending invitation.",
        );
      }
      throw error;
    }
    const joinUrl = `${this.config.get<string>("PUBLIC_WEB_URL", "http://localhost:5173")}/join/instance#token=${encodeURIComponent(issued.token)}`;
    const content = {
      subject: `Invitation to ${instance.name}`,
      text: `${dto.invitedName.trim()}, you have been invited to join ${instance.name}. Open ${joinUrl}`,
    };
    const deliveries = await Promise.all([
      ...(email
        ? [this.deliver(this.email, email.normalized, campaignInstanceId, invitation.id, "email", content)]
        : []),
      ...(phone
        ? [this.deliver(this.sms, phone.normalized, campaignInstanceId, invitation.id, "sms", content)]
        : []),
    ]);
    return {
      campaignInstanceId,
      campaignInstanceName: instance.name,
      invitation: {
        id: invitation.id,
        invitedName: invitation.invitedName ?? "Invited participant",
        role: invitation.role.toLowerCase(),
        status: invitation.status.toLowerCase(),
        expiresAt: invitation.expiresAt.toISOString(),
      },
      deliveries,
    };
  }

  async revoke(id: string, invitationId: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const invitation = await this.prisma.campaignInstanceInvitation.findFirst({
      where: { id: invitationId, campaignInstanceId: id, status: "PENDING" },
      select: { invitedName: true },
    });
    if (!invitation) {
      throw new ConflictException("Invitation cannot be revoked.");
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.campaignInstanceInvitation.updateMany({
        where: { id: invitationId, campaignInstanceId: id, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Invitation cannot be revoked.");
      }
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId: id,
          actorUserId: ownerUserId,
          action: "instance.invitation.revoked",
          subjectName: invitation.invitedName ?? "Invited participant",
          subjectType: "Invitation",
          detail: {},
        },
      });
    });
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      invitationName: invitation.invitedName ?? "Invited participant",
      status: "revoked" as const,
    };
  }

  async retry(id: string, invitationId: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const prior = await this.prisma.campaignInstanceInvitation.findFirst({
      where: { id: invitationId, campaignInstanceId: id, status: { in: ["PENDING", "EXPIRED"] } },
    });
    if (!prior) throw new NotFoundException("The selected invitation was not found.");
    const email = prior.emailEncrypted ? this.contacts.decrypt(prior.emailEncrypted) : undefined;
    const phone = prior.phoneEncrypted ? this.contacts.decrypt(prior.phoneEncrypted) : undefined;
    const issued = this.tokens.issue();
    const ttlHours = this.config.get<number>("INVITATION_TTL_HOURS", 168);
    const issuanceLimit = this.config.get<number>(
      "CAMPAIGN_INSTANCE_INVITATION_HOURLY_LIMIT",
      20,
    );
    const replacement = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE "CampaignInstanceInvitation" IN SHARE ROW EXCLUSIVE MODE',
      );
      const authoritativeRecentCount =
        await tx.campaignInstanceInvitation.count({
          where: {
            campaignInstanceId: id,
            createdByUserId: ownerUserId,
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1_000) },
          },
        });
      if (authoritativeRecentCount >= issuanceLimit) {
        throw new ConflictException(
          "Invitation delivery is temporarily limited; try again later.",
        );
      }
      const claimed = await tx.campaignInstanceInvitation.updateMany({
        where: { id: prior.id, campaignInstanceId: id, status: prior.status },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException("Invitation changed; reload and retry.");
      const created = await tx.campaignInstanceInvitation.create({
        data: {
          campaignInstanceId: id,
          role: prior.role,
          invitedName: prior.invitedName,
          invitedUserId: prior.invitedUserId,
          emailEncrypted: prior.emailEncrypted,
          emailHash: prior.emailHash,
          phoneEncrypted: prior.phoneEncrypted,
          phoneHash: prior.phoneHash,
          tokenHash: issued.tokenHash,
          expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
          createdByUserId: ownerUserId,
        },
      });
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId: id,
          actorUserId: ownerUserId,
          action: "instance.invitation.retried",
          subjectName: created.invitedName ?? "Invited participant",
          subjectType: "Invitation",
          detail: {
            role: created.role.toLowerCase(),
            channels: [
              ...(email ? ["email"] : []),
              ...(phone ? ["sms"] : []),
            ],
          },
        },
      });
      return created;
    });
    const joinUrl = `${this.config.get<string>("PUBLIC_WEB_URL", "http://localhost:5173")}/join/instance#token=${encodeURIComponent(issued.token)}`;
    const content = {
      subject: `Invitation to ${instance.name}`,
      text: `${prior.invitedName ?? "Participant"}, you have been invited to join ${instance.name}. Open ${joinUrl}`,
    };
    const deliveries = await Promise.all([
      ...(email ? [this.deliver(this.email, email, id, replacement.id, "email", content)] : []),
      ...(phone ? [this.deliver(this.sms, phone, id, replacement.id, "sms", content)] : []),
    ]);
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      invitation: {
        id: replacement.id,
        invitedName: replacement.invitedName ?? "Invited participant",
        role: replacement.role.toLowerCase(),
        status: replacement.status.toLowerCase(),
        expiresAt: replacement.expiresAt.toISOString(),
      },
      deliveries,
    };
  }

  private async owned(id: string, ownerUserId: string) {
    const instance = await this.prisma.campaignInstance.findFirst({
      where: { id, ownerUserId },
      select: { id: true, name: true, status: true },
    });
    if (!instance) throw new NotFoundException("The selected Campaign Instance was not found.");
    return instance;
  }

  private async deliver(
    port: NotificationPort,
    recipient: string,
    campaignInstanceId: string,
    deliveryId: string,
    channel: "email" | "sms",
    content: { subject: string; text: string },
  ) {
    const attempt =
      await this.prisma.campaignInstanceInvitationDeliveryAttempt.create({
        data: {
          campaignInstanceId,
          invitationId: deliveryId,
          channel:
            channel === "email" ? DeliveryChannel.EMAIL : DeliveryChannel.SMS,
          status: DeliveryStatus.PENDING,
        },
        select: { id: true },
      });
    let result: Awaited<ReturnType<NotificationPort["send"]>>;
    try {
      result = await port.send({ deliveryId, recipient, ...content });
    } catch {
      await this.prisma.campaignInstanceInvitationDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: DeliveryStatus.FAILED,
          failureCategory: "provider-error",
        },
      });
      return { channel, status: "failed" as const };
    }

    const status = result.captured ? "captured" : "sent";
    await this.prisma.campaignInstanceInvitationDeliveryAttempt.update({
      where: { id: attempt.id },
      data: {
        status: result.captured ? DeliveryStatus.CAPTURED : DeliveryStatus.SENT,
        providerReference: result.providerMessageId.slice(0, 500),
      },
    });
    return { channel, status };
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
