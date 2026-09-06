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
  UserRole,
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
import { AuthService } from "../auth/auth.service";
import type { CreateCampaignInstanceInvitationDto } from "./dto/campaign-instance-management.dto";

@Injectable()
export class CampaignInstanceInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: InvitationTokenService,
    private readonly contacts: ContactProtector,
    private readonly auth: AuthService,
    @Inject(EMAIL_NOTIFICATION_PORT) private readonly email: NotificationPort,
    @Inject(SMS_NOTIFICATION_PORT) private readonly sms: NotificationPort,
  ) {}

  async resolve(token: string) {
    const invitation = await this.validInvitation(token);
    return {
      campaignInstanceName: invitation.campaignInstance.name,
      invitedName: invitation.invitedName ?? "Invited participant",
      role: invitation.role.toLowerCase(),
      status: "pending" as const,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(token: string) {
    const invitation = await this.validInvitation(token);
    const prepared = this.auth.prepareSession("pending");
    const invitationIdentity = this.contacts.protectOpaque(
      `invitation:${invitation.tokenHash}`,
    );
    const accepted = await this.prisma
      .$transaction(
        async (tx) => {
          const claimed = await tx.campaignInstanceInvitation.updateMany({
            where: {
              id: invitation.id,
              status: "PENDING",
              expiresAt: { gt: new Date() },
            },
            data: { status: "ACCEPTED", acceptedAt: new Date() },
          });
          if (claimed.count !== 1)
            throw new ConflictException("Invitation is no longer available.");
          const existingUser = invitation.invitedUserId
            ? await tx.user.findUnique({
                where: { id: invitation.invitedUserId },
                include: { playerProfile: true },
              })
            : null;
          if (
            invitation.role === "PLAYER" &&
            existingUser?.playerProfile?.standing !== undefined &&
            existingUser.playerProfile.standing !== "ACTIVE"
          ) {
            throw new ConflictException(
              "The invited Player is not active on this server.",
            );
          }
          const user =
            existingUser ??
            (await tx.user.create({
              data: {
                displayName: invitation.invitedName ?? "Participant",
                role: UserRole.PARTICIPANT,
              },
            }));
          const profile =
            invitation.role === "PLAYER"
              ? (existingUser?.playerProfile ??
                (await tx.playerProfile.create({
                  data: {
                    userId: user.id,
                    displayName: invitation.invitedName ?? "Participant",
                    emailEncrypted: invitation.emailEncrypted,
                    emailHash: invitation.emailHash,
                    phoneEncrypted: invitation.phoneEncrypted,
                    phoneHash: invitation.phoneHash,
                  },
                })))
              : null;
          if (!existingUser) {
            await tx.authenticationProviderAssociation.create({
              data: {
                userId: user.id,
                playerProfileId: profile?.id,
                providerKey: "aow:invitation",
                providerSubjectHash: invitationIdentity.hash,
                providerSubjectEncrypted: invitationIdentity.encrypted,
                credentialReference: `campaign-instance-invitation:${invitation.id}`,
                status: "ASSOCIATED",
                associatedAt: new Date(),
              },
            });
          }
          const membership = await tx.campaignInstanceHumanMembership.create({
            data: {
              campaignInstanceId: invitation.campaignInstanceId,
              userId: user.id,
              playerProfileId: profile?.id ?? null,
              displayName: invitation.invitedName ?? user.displayName,
              role: invitation.role,
            },
          });
          await tx.authSession.create({
            data: { ...prepared.data, userId: user.id },
          });
          await tx.campaignInstanceInvitation.update({
            where: { id: invitation.id },
            data: {
              invitedUserId: user.id,
              acceptedMembershipId: membership.id,
            },
          });
          return { user, membership };
        },
        { isolationLevel: "Serializable" },
      )
      .catch((error: unknown) => {
        if (isPrismaCode(error, "P2002") || isPrismaCode(error, "P2034")) {
          throw new ConflictException(
            "This identity already participates in the Campaign Instance.",
          );
        }
        throw error;
      });
    return {
      sessionToken: prepared.token,
      user: {
        displayName: accepted.user.displayName,
        role:
          accepted.membership.role === "SPECTATOR"
            ? ("spectator" as const)
            : ("player" as const),
      },
      campaignInstanceId: invitation.campaignInstanceId,
      campaignInstanceName: invitation.campaignInstance.name,
    };
  }

  async create(
    campaignInstanceId: string,
    ownerUserId: string,
    dto: CreateCampaignInstanceInvitationDto,
  ) {
    const instance = await this.owned(campaignInstanceId, ownerUserId);
    let email = dto.email ? this.contacts.protectEmail(dto.email) : undefined;
    let phone = dto.phone ? this.contacts.protectPhone(dto.phone) : undefined;
    let invitedUserId: string | undefined;
    let invitedName = dto.invitedName.trim();
    if (dto.playerId) {
      if (dto.role !== "player") {
        throw new ConflictException(
          "Only a Player invitation can select an existing Player profile.",
        );
      }
      if (email || phone) {
        throw new ConflictException(
          "Use the selected Player's protected contact methods without replacements.",
        );
      }
      const player = await this.prisma.playerProfile.findFirst({
        where: { id: dto.playerId, standing: "ACTIVE" },
        select: {
          userId: true,
          displayName: true,
          emailEncrypted: true,
          emailHash: true,
          phoneEncrypted: true,
          phoneHash: true,
        },
      });
      if (!player) {
        throw new NotFoundException(
          "The selected active Player was not found.",
        );
      }
      invitedUserId = player.userId;
      invitedName = player.displayName;
      email =
        player.emailEncrypted && player.emailHash
          ? {
              encrypted: player.emailEncrypted,
              hash: player.emailHash,
              normalized: this.contacts.decrypt(player.emailEncrypted),
            }
          : undefined;
      phone =
        player.phoneEncrypted && player.phoneHash
          ? {
              encrypted: player.phoneEncrypted,
              hash: player.phoneHash,
              normalized: this.contacts.decrypt(player.phoneEncrypted),
            }
          : undefined;
    }
    if (!email && !phone) {
      throw new ConflictException(
        "An email address or phone number is required.",
      );
    }
    if (!dto.playerId) {
      await this.assertContactsDoNotClaimExistingPlayer(
        email?.hash,
        phone?.hash,
      );
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
            invitedName,
            invitedUserId,
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
      text: `${invitedName}, you have been invited to join ${instance.name}. Open ${joinUrl}`,
    };
    const deliveries = await Promise.all([
      ...(email
        ? [
            this.deliver(
              this.email,
              email.normalized,
              campaignInstanceId,
              invitation.id,
              "email",
              content,
            ),
          ]
        : []),
      ...(phone
        ? [
            this.deliver(
              this.sms,
              phone.normalized,
              campaignInstanceId,
              invitation.id,
              "sms",
              content,
            ),
          ]
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
      where: {
        id: invitationId,
        campaignInstanceId: id,
        status: { in: ["PENDING", "EXPIRED"] },
      },
    });
    if (!prior)
      throw new NotFoundException("The selected invitation was not found.");
    const email = prior.emailEncrypted
      ? this.contacts.decrypt(prior.emailEncrypted)
      : undefined;
    const phone = prior.phoneEncrypted
      ? this.contacts.decrypt(prior.phoneEncrypted)
      : undefined;
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
      if (claimed.count !== 1)
        throw new ConflictException("Invitation changed; reload and retry.");
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
            channels: [...(email ? ["email"] : []), ...(phone ? ["sms"] : [])],
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
      ...(email
        ? [
            this.deliver(
              this.email,
              email,
              id,
              replacement.id,
              "email",
              content,
            ),
          ]
        : []),
      ...(phone
        ? [this.deliver(this.sms, phone, id, replacement.id, "sms", content)]
        : []),
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
    if (!instance)
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    return instance;
  }

  private async validInvitation(token: string) {
    const invitation = await this.prisma.campaignInstanceInvitation.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
      include: { campaignInstance: { select: { name: true, status: true } } },
    });
    if (
      !invitation ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt.getTime() <= Date.now() ||
      ["CONCLUDED", "ARCHIVED"].includes(invitation.campaignInstance.status)
    ) {
      throw new NotFoundException("Invitation is invalid or unavailable.");
    }
    return invitation;
  }

  private async assertContactsDoNotClaimExistingPlayer(
    emailHash?: string,
    phoneHash?: string,
  ): Promise<void> {
    const existing = await this.prisma.playerProfile.findFirst({
      where: {
        OR: [
          ...(emailHash ? [{ emailHash }] : []),
          ...(phoneHash ? [{ phoneHash }] : []),
        ],
      },
      select: { displayName: true },
    });
    if (existing) {
      throw new ConflictException(
        `${existing.displayName} already has a Player profile. Select that Player explicitly.`,
      );
    }
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
