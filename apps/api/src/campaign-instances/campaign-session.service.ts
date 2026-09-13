import { participantActorBinding } from "./participant-spatial-binding";
import type { ParticipantSpatialBinding } from "@aow/common";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CORE_SESSION_AGENT_ACT_CAPABILITIES,
  CORE_SESSION_AGENT_OBSERVE_CAPABILITIES,
  canTransitionCampaignSessionStatus,
} from "@aow/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { InvitationTokenService } from "../invitations/invitation-security";
import { ContactProtector } from "../invitations/invitation-security";
import { ConfigService } from "@nestjs/config";
import {
  EMAIL_NOTIFICATION_PORT,
  SMS_NOTIFICATION_PORT,
  type NotificationPort,
} from "../notifications/notification.port";
import type {
  CampaignSessionLifecycleDto,
  CreateCampaignSessionDto,
  UpdateCampaignSessionDto,
  UpdateCampaignSessionParticipantsDto,
  UpdateCampaignSessionSummaryDto,
} from "./dto/campaign-session.dto";
import { AuthService } from "../auth/auth.service";
import {
  capturedCreaturePolicyProblems,
  validateRuntimeForCapturedPair,
} from "./campaign-instance-management.service";

const MAX_PARTICIPANTS = 8;

@Injectable()
export class CampaignSessionService {
  private readonly invitationFailures = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: InvitationTokenService,
    private readonly config: ConfigService,
    private readonly contacts: ContactProtector,
    private readonly auth: AuthService,
    @Inject(EMAIL_NOTIFICATION_PORT) private readonly email: NotificationPort,
    @Inject(SMS_NOTIFICATION_PORT) private readonly sms: NotificationPort,
  ) {}

  async assertCampaignDefinitionParent(
    campaignDefinitionId: string,
    instanceId: string,
    userId: string,
  ) {
    const instance = await this.prisma.campaignInstance.findFirst({
      where: {
        id: instanceId,
        campaignDefinitionId,
        ownerUserId: userId,
      },
      select: { id: true },
    });
    if (!instance) {
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    }
  }

  async activeForGm(userId: string) {
    const session = await this.prisma.campaignInstanceSession.findFirst({
      where: {
        status: "ACTIVE",
        campaignInstance: { ownerUserId: userId },
      },
      select: {
        id: true,
        name: true,
        status: true,
        campaignInstance: { select: { id: true, name: true } },
      },
    });
    return {
      session: session
        ? {
            campaignInstanceId: session.campaignInstance.id,
            campaignInstanceName: session.campaignInstance.name,
            sessionId: session.id,
            sessionName: session.name,
            status: session.status.toLowerCase(),
            label: "Continue",
          }
        : null,
    };
  }

  async issueInvitations(
    instanceId: string,
    sessionId: string,
    userId: string,
    participationId?: string,
  ) {
    const instance = await this.ownedInstance(instanceId, userId, true);
    const issuanceLimit = this.config.get<number>(
      "SESSION_INVITATION_HOURLY_LIMIT",
      40,
    );
    const result = await this.prisma.$transaction(
      async (client) => {
        await lockSessionLifecycle(client);
        const session = await client.campaignInstanceSession.findFirst({
          where: { id: sessionId, campaignInstanceId: instanceId },
          select: { name: true, status: true, lastEventSequence: true },
        });
        if (!session)
          throw new NotFoundException("The selected Session was not found.");
        if (session.status !== "LOBBY")
          throw new ConflictException(
            "Open the lobby before issuing Session invitations.",
          );
        const participants = await client.sessionParticipation.findMany({
          where: {
            campaignInstanceId: instanceId,
            sessionId,
            selected: true,
            role: { in: ["PLAYER", "SPECTATOR"] },
            response: { not: "ACCEPTED" },
            ...(participationId ? { id: participationId } : {}),
          },
          orderBy: [{ participantName: "asc" }, { id: "asc" }],
          include: {
            humanMembership: {
              select: {
                user: {
                  select: {
                    playerProfile: {
                      select: { emailEncrypted: true, phoneEncrypted: true },
                    },
                  },
                },
              },
            },
          },
        });
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
        await client.campaignSessionInvitation.updateMany({
          where: {
            sessionId,
            status: "PENDING",
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED" },
        });
        const pending = await client.campaignSessionInvitation.findMany({
          where: {
            participationId: { in: participants.map(({ id }) => id) },
            status: "PENDING",
            expiresAt: { gt: now },
          },
          select: {
            id: true,
            participationId: true,
            status: true,
            expiresAt: true,
          },
        });
        const pendingByParticipation = new Map(
          pending.map((invitation) => [invitation.participationId, invitation]),
        );
        const toIssue = participants.filter(
          (participant) =>
            participationId || !pendingByParticipation.has(participant.id),
        );
        const recentCount = await client.campaignSessionInvitation.count({
          where: {
            issuedByUserId: userId,
            issuedAt: { gte: new Date(now.getTime() - 60 * 60 * 1_000) },
          },
        });
        if (recentCount + toIssue.length > issuanceLimit) {
          throw new ConflictException(
            "Session invitation delivery is temporarily limited; try again later.",
          );
        }
        const invitations: {
          invitationId: string;
          participantName: string;
          status: string;
          expiresAt: string;
          token?: string;
          emailEncrypted?: string | null;
          phoneEncrypted?: string | null;
        }[] = [];
        for (const participant of participants) {
          const existing = pendingByParticipation.get(participant.id);
          if (existing && !participationId) {
            invitations.push({
              invitationId: existing.id,
              participantName: participant.participantName,
              status: existing.status.toLowerCase(),
              expiresAt: existing.expiresAt.toISOString(),
            });
            continue;
          }
          if (existing) {
            await client.campaignSessionInvitation.update({
              where: { id: existing.id },
              data: { status: "REVOKED", revokedAt: now },
            });
          }
          const prior = await client.campaignSessionInvitation.findFirst({
            where: { participationId: participant.id },
            orderBy: { revision: "desc" },
            select: { id: true, revision: true },
          });
          const token = this.tokens.issue();
          const invitation = await client.campaignSessionInvitation.create({
            data: {
              campaignInstanceId: instanceId,
              sessionId,
              participationId: participant.id,
              revision: (prior?.revision ?? 0) + 1,
              predecessorInvitationId: prior?.id,
              tokenHash: token.tokenHash,
              expiresAt,
              issuedByUserId: userId,
            },
            select: { id: true, status: true, expiresAt: true },
          });
          await client.sessionParticipation.update({
            where: { id: participant.id },
            data: {
              response: "PENDING",
              responseMessage: null,
              respondedAt: null,
            },
          });
          invitations.push({
            invitationId: invitation.id,
            participantName: participant.participantName,
            status: invitation.status.toLowerCase(),
            expiresAt: invitation.expiresAt.toISOString(),
            token: token.token,
            emailEncrypted:
              participant.humanMembership?.user.playerProfile?.emailEncrypted,
            phoneEncrypted:
              participant.humanMembership?.user.playerProfile?.phoneEncrypted,
          });
        }
        if (toIssue.length > 0) {
          const sequence = (session.lastEventSequence ?? 0) + 1;
          await client.campaignInstanceSession.update({
            where: { id: sessionId },
            data: { lastEventSequence: sequence },
          });
          await this.appendEvent(client, {
            instanceId,
            sessionId,
            sequence,
            type: "session.invitations-issued",
            summary: `Session invitations were issued for ${toIssue.length} participant${toIssue.length === 1 ? "" : "s"}.`,
            actorName: instance.owner.displayName,
            actorUserId: userId,
            visibility: "PARTICIPANTS",
          });
        }
        return { sessionName: session.name, invitations };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const publicWebUrl = this.config.get<string>(
      "PUBLIC_WEB_URL",
      "http://localhost:5173",
    );
    const delivered = await Promise.all(
      result.invitations.map(async (invitation) => {
        if (!invitation.token) {
          return {
            invitationId: invitation.invitationId,
            participantName: invitation.participantName,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
            delivery: [],
          };
        }
        const joinUrl = `${publicWebUrl}/join/session#token=${encodeURIComponent(invitation.token)}`;
        const content = {
          subject: `Invitation to ${result.sessionName}`,
          text: `${invitation.participantName}, you have been invited to ${result.sessionName} in ${instance.name}. Open ${joinUrl}`,
        };
        const destinations = [
          ...(invitation.emailEncrypted
            ? [
                {
                  channel: "email" as const,
                  recipient: this.contacts.decrypt(invitation.emailEncrypted),
                  port: this.email,
                },
              ]
            : []),
          ...(invitation.phoneEncrypted
            ? [
                {
                  channel: "sms" as const,
                  recipient: this.contacts.decrypt(invitation.phoneEncrypted),
                  port: this.sms,
                },
              ]
            : []),
        ];
        const delivery = await Promise.all(
          destinations.map((destination) =>
            this.deliverSessionInvitation(
              instanceId,
              sessionId,
              invitation.invitationId,
              destination,
              content,
            ),
          ),
        );
        return {
          invitationId: invitation.invitationId,
          participantName: invitation.participantName,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          delivery,
        };
      }),
    );
    return {
      campaignInstanceName: instance.name,
      sessionName: result.sessionName,
      invitations: delivered,
    };
  }

  async retryInvitation(
    instanceId: string,
    sessionId: string,
    invitationId: string,
    userId: string,
  ) {
    await this.ownedInstance(instanceId, userId, true);
    const invitation = await this.prisma.campaignSessionInvitation.findFirst({
      where: { id: invitationId, campaignInstanceId: instanceId, sessionId },
      select: { participationId: true, status: true },
    });
    if (!invitation)
      throw new NotFoundException(
        "The selected Session invitation was not found.",
      );
    if (invitation.status === "ACCEPTED")
      throw new ConflictException(
        "An accepted Session invitation cannot be retried.",
      );
    const result = await this.issueInvitations(
      instanceId,
      sessionId,
      userId,
      invitation.participationId,
    );
    if (!result.invitations[0])
      throw new ConflictException(
        "The Session participant is no longer selected.",
      );
    return {
      campaignInstanceName: result.campaignInstanceName,
      sessionName: result.sessionName,
      invitation: result.invitations[0],
    };
  }

  async revokeInvitation(
    instanceId: string,
    sessionId: string,
    invitationId: string,
    userId: string,
  ) {
    const instance = await this.ownedInstance(instanceId, userId, true);
    const invitation = await this.prisma.$transaction(
      async (client) => {
        await lockSessionLifecycle(client);
        const current = await client.campaignSessionInvitation.findFirst({
          where: {
            id: invitationId,
            campaignInstanceId: instanceId,
            sessionId,
            status: "PENDING",
            participation: { selected: true },
            session: { status: { in: ["PLANNED", "LOBBY"] } },
          },
          select: {
            participationId: true,
            participation: { select: { participantName: true } },
            session: {
              select: { name: true, lastEventSequence: true },
            },
          },
        });
        if (!current)
          throw new ConflictException(
            "The Session invitation is no longer pending.",
          );
        const now = new Date();
        await client.campaignSessionInvitation.update({
          where: { id: invitationId },
          data: { status: "REVOKED", revokedAt: now },
        });
        await client.sessionParticipation.update({
          where: { id: current.participationId },
          data: {
            response: "NOT_REQUESTED",
            responseMessage: null,
            respondedAt: null,
          },
        });
        const sequence = (current.session.lastEventSequence ?? 0) + 1;
        await client.campaignInstanceSession.update({
          where: { id: sessionId },
          data: { lastEventSequence: sequence },
        });
        await this.appendEvent(client, {
          instanceId,
          sessionId,
          sequence,
          type: "session.invitation-revoked",
          summary: `${current.participation.participantName}'s Session invitation was revoked.`,
          actorName: instance.owner.displayName,
          actorUserId: userId,
          visibility: "PARTICIPANTS",
        });
        return current;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      campaignInstanceName: instance.name,
      sessionName: invitation.session.name,
      participantName: invitation.participation.participantName,
      status: "revoked" as const,
    };
  }

  async resolveInvitation(token: string, attemptKey = "unknown") {
    const invitation = await this.validSessionInvitation(token, attemptKey);
    return {
      campaignInstanceName: invitation.session.campaignInstance.name,
      sessionName: invitation.session.name,
      participantName: invitation.participation.participantName,
      role: invitation.participation.role.toLowerCase(),
      response: invitation.participation.response.toLowerCase(),
      scheduledFor: invitation.session.scheduledFor?.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async respondToInvitation(
    token: string,
    response: "accepted" | "declined",
    message?: string,
    attemptKey = "unknown",
  ) {
    const invitation = await this.validSessionInvitation(token, attemptKey);
    const now = new Date();
    const preparedSession =
      response === "accepted" && invitation.participation.humanMembership
        ? this.auth.prepareSession(
            invitation.participation.humanMembership.userId,
          )
        : undefined;
    await this.prisma.$transaction(
      async (client) => {
        await lockSessionLifecycle(client);
        const current = await client.campaignSessionInvitation.findFirst({
          where: {
            id: invitation.id,
            campaignInstanceId: invitation.campaignInstanceId,
            sessionId: invitation.sessionId,
            status: "PENDING",
            expiresAt: { gt: now },
            participation: { selected: true },
            session: { status: { in: ["LOBBY", "ACTIVE"] } },
          },
          select: {
            participationId: true,
            participation: { select: { participantName: true } },
            session: { select: { lastEventSequence: true } },
          },
        });
        if (!current)
          throw new ConflictException(
            "Session invitation is no longer available.",
          );
        await client.campaignSessionInvitation.update({
          where: { id: invitation.id },
          data: {
            status: response === "accepted" ? "ACCEPTED" : "DECLINED",
            acceptedAt: response === "accepted" ? now : null,
          },
        });
        await client.sessionParticipation.update({
          where: { id: current.participationId },
          data: {
            response: response === "accepted" ? "ACCEPTED" : "DECLINED",
            responseMessage: cleanOptional(message),
            respondedAt: now,
          },
        });
        const sequence = (current.session.lastEventSequence ?? 0) + 1;
        await client.campaignInstanceSession.update({
          where: { id: invitation.sessionId },
          data: { lastEventSequence: sequence },
        });
        await this.appendEvent(client, {
          instanceId: invitation.campaignInstanceId,
          sessionId: invitation.sessionId,
          sequence,
          type: `session.invitation-${response}`,
          summary: `${current.participation.participantName} ${response} the Session invitation.`,
          actorName: current.participation.participantName,
          actorUserId: invitation.participation.humanMembership?.userId ?? null,
          visibility: "PARTICIPANTS",
        });
        if (preparedSession) {
          await client.authSession.create({ data: preparedSession.data });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      campaignInstanceName: invitation.session.campaignInstance.name,
      sessionName: invitation.session.name,
      participantName: invitation.participation.participantName,
      response,
      sessionToken: preparedSession?.token,
      lobbyHref: `/play/instances/${encodeURIComponent(invitation.campaignInstanceId)}/sessions/${encodeURIComponent(invitation.sessionId)}`,
    };
  }

  async join(
    instanceId: string,
    sessionId: string,
    userId: string,
    connectionKey: string,
  ) {
    const result = await this.withPresenceLock(async (client) => {
      const participation = await this.participationForUser(
        instanceId,
        sessionId,
        userId,
        client,
      );
      requireAcceptedPresence(participation);
      requirePresenceStatus(participation.session.status);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90_000);
      const connectionKeyHash = digest(
        `${sessionId}:${participation.id}:${connectionKey}`,
      );
      const lease = await client.sessionPresenceLease.upsert({
        where: { connectionKeyHash },
        create: {
          campaignInstanceId: instanceId,
          sessionId,
          participationId: participation.id,
          connectionKeyHash,
          phase: participation.session.status === "ACTIVE" ? "PLAY" : "LOBBY",
          expiresAt,
        },
        update: {
          joinedAt: now,
          lastHeartbeatAt: now,
          expiresAt,
          leftAt: null,
          ejectedAt: null,
          phase: participation.session.status === "ACTIVE" ? "PLAY" : "LOBBY",
        },
        select: { expiresAt: true },
      });
      await client.sessionParticipation.update({
        where: { id: participation.id },
        data: {
          joinedAt: participation.joinedAt ?? now,
          ...(participation.session.status === "ACTIVE"
            ? { attendance: "ATTENDED" }
            : {}),
        },
      });
      const sequence = (participation.session.lastEventSequence ?? 0) + 1;
      await client.campaignInstanceSession.update({
        where: { id: sessionId },
        data: { lastEventSequence: sequence },
      });
      await this.appendEvent(client, {
        instanceId,
        sessionId,
        sequence,
        type: "session.participant-joined",
        summary: `${participation.participantName} joined the Session.`,
        actorName: participation.participantName,
        actorUserId: userId,
        visibility: "PARTICIPANTS",
      });
      return { participation, lease };
    });
    return {
      sessionName: result.participation.session.name,
      participantName: result.participation.participantName,
      present: true,
      expiresAt: result.lease.expiresAt.toISOString(),
    };
  }

  async heartbeat(
    instanceId: string,
    sessionId: string,
    userId: string,
    connectionKey: string,
  ) {
    const participation = await this.withPresenceLock(async (client) => {
      const currentParticipation = await this.participationForUser(
        instanceId,
        sessionId,
        userId,
        client,
      );
      requireAcceptedPresence(currentParticipation);
      requirePresenceStatus(currentParticipation.session.status);
      const now = new Date();
      const connectionKeyHash = digest(
        `${sessionId}:${currentParticipation.id}:${connectionKey}`,
      );
      const lease = await client.sessionPresenceLease.updateMany({
        where: {
          sessionId,
          participationId: currentParticipation.id,
          connectionKeyHash,
          leftAt: null,
          ejectedAt: null,
          expiresAt: { gt: now },
          lastHeartbeatAt: { lte: new Date(now.getTime() - 5_000) },
        },
        data: {
          lastHeartbeatAt: now,
          expiresAt: new Date(now.getTime() + 90_000),
        },
      });
      if (lease.count !== 1) {
        const current = await client.sessionPresenceLease.findFirst({
          where: {
            sessionId,
            participationId: currentParticipation.id,
            connectionKeyHash,
            leftAt: null,
            ejectedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
        if (!current)
          throw new NotFoundException(
            "The Session presence connection was not found.",
          );
      }
      return currentParticipation;
    });
    return {
      sessionName: participation.session.name,
      participantName: participation.participantName,
      present: true,
    };
  }

  async participantSpatialBinding(
    instanceId: string,
    sessionId: string,
    userId: string,
  ): Promise<ParticipantSpatialBinding> {
    const participant = await this.participationForUser(
      instanceId,
      sessionId,
      userId,
    );
    if (participant.role !== "PLAYER")
      return { status: "unavailable", reason: "not-player" };
    if (participant.session.status !== "ACTIVE")
      return { status: "unavailable", reason: "session-inactive" };
    const membership =
      await this.prisma.campaignInstanceHumanMembership.findFirst({
        where: {
          id: participant.humanMembershipId!,
          campaignInstanceId: instanceId,
          userId,
          status: "ACTIVE",
          role: "PLAYER",
          user: { playerProfile: { standing: "ACTIVE" } },
        },
        select: {
          activeCharacter: { select: { characterId: true, status: true } },
          campaignInstance: {
            select: {
              runtime: { select: { state: true, revision: true } },
              currentSnapshot: {
                select: {
                  worldDefinitionSnapshot: { select: { manifest: true } },
                },
              },
            },
          },
        },
      });
    if (
      !membership?.activeCharacter ||
      membership.activeCharacter.status !== "ACTIVE"
    )
      return { status: "unavailable", reason: "no-active-character" };
    const instance = membership.campaignInstance;
    if (!instance.runtime)
      return { status: "unavailable", reason: "actor-unplaced" };
    return participantActorBinding(
      instanceId,
      instance.runtime.state,
      membership.activeCharacter.characterId,
      instance.runtime.revision,
      instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
    );
  }

  async participantProjection(
    instanceId: string,
    sessionId: string,
    userId: string,
  ) {
    const participant = await this.participationForUser(
      instanceId,
      sessionId,
      userId,
    );
    const session = await this.prisma.campaignInstanceSession.findFirstOrThrow({
      where: { id: sessionId, campaignInstanceId: instanceId },
      select: {
        name: true,
        status: true,
        scheduledFor: true,
        campaignInstance: { select: { name: true } },
        participations: {
          where: { selected: true },
          orderBy: [{ role: "asc" }, { participantName: "asc" }],
          select: {
            participantName: true,
            role: true,
            presenceLeases: {
              where: {
                leftAt: null,
                ejectedAt: null,
                expiresAt: { gt: new Date() },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    return {
      campaignInstanceName: session.campaignInstance.name,
      sessionName: session.name,
      status: session.status.toLowerCase(),
      scheduledFor: session.scheduledFor?.toISOString(),
      role: participant.role.toLowerCase(),
      participants: session.participations.map((entry) => ({
        name: entry.participantName,
        role: entry.role.toLowerCase(),
        present: entry.presenceLeases.length > 0,
      })),
    };
  }

  async participantEvents(
    instanceId: string,
    sessionId: string,
    userId: string,
    afterSequence = 0,
  ) {
    const participant = await this.participationForUser(
      instanceId,
      sessionId,
      userId,
    );
    const visibility = ["PARTICIPANTS", "SESSION_PUBLIC"] as (
      "PARTICIPANTS" | "SESSION_PUBLIC" | "PLAYERS" | "SPECTATORS" | "GM"
    )[];
    if (participant.role === "PLAYER") visibility.push("PLAYERS");
    if (participant.role === "SPECTATOR") visibility.push("SPECTATORS");
    if (participant.role === "GM")
      visibility.push("GM", "PLAYERS", "SPECTATORS");
    const rows = await this.prisma.campaignSessionEvent.findMany({
      where: {
        campaignInstanceId: instanceId,
        sessionId,
        sequence: { gt: afterSequence },
        visibility: { in: visibility },
      },
      orderBy: { sequence: "asc" },
      take: 101,
      select: {
        sequence: true,
        occurredAt: true,
        campaignTime: true,
        type: true,
        summary: true,
        actorName: true,
      },
    });
    return {
      sessionName: participant.session.name,
      items: rows.slice(0, 100).map((row) => ({
        ...row,
        occurredAt: row.occurredAt.toISOString(),
        campaignTime: row.campaignTime ?? undefined,
      })),
      nextAfterSequence: rows.length > 100 ? rows[99].sequence : undefined,
    };
  }

  async leave(
    instanceId: string,
    sessionId: string,
    userId: string,
    connectionKey: string,
  ) {
    const participation = await this.withPresenceLock(async (client) => {
      const currentParticipation = await this.participationForUser(
        instanceId,
        sessionId,
        userId,
        client,
      );
      requireAcceptedPresence(currentParticipation);
      requirePresenceStatus(currentParticipation.session.status);
      const now = new Date();
      const connectionKeyHash = digest(
        `${sessionId}:${currentParticipation.id}:${connectionKey}`,
      );
      const lease = await client.sessionPresenceLease.findFirst({
        where: {
          sessionId,
          participationId: currentParticipation.id,
          connectionKeyHash,
          leftAt: null,
          ejectedAt: null,
        },
        select: { joinedAt: true, expiresAt: true },
      });
      if (!lease) return currentParticipation;
      const closed = await client.sessionPresenceLease.updateMany({
        where: {
          sessionId,
          participationId: currentParticipation.id,
          connectionKeyHash,
          leftAt: null,
          ejectedAt: null,
        },
        data: { leftAt: now },
      });
      if (closed.count !== 1) return currentParticipation;
      await client.sessionParticipation.update({
        where: { id: currentParticipation.id },
        data: {
          leftAt: now,
          totalPresentSeconds: {
            increment: boundedPresenceSeconds(lease, now),
          },
        },
      });
      const sequence =
        (currentParticipation.session.lastEventSequence ?? 0) + 1;
      await client.campaignInstanceSession.update({
        where: { id: sessionId },
        data: { lastEventSequence: sequence },
      });
      await this.appendEvent(client, {
        instanceId,
        sessionId,
        sequence,
        type: "session.participant-left",
        summary: `${currentParticipation.participantName} left the Session.`,
        actorName: currentParticipation.participantName,
        actorUserId: userId,
        visibility: "PARTICIPANTS",
      });
      return currentParticipation;
    });
    return {
      sessionName: participation.session.name,
      participantName: participation.participantName,
      present: false,
    };
  }

  async eject(
    instanceId: string,
    sessionId: string,
    participationId: string,
    userId: string,
    expectedMetadataRevision: number,
  ) {
    const instance = await this.ownedInstance(instanceId, userId, true);
    await this.prisma.$transaction(
      async (client) => {
        await lockSessionLifecycle(client);
        const session = await client.campaignInstanceSession.findFirst({
          where: {
            id: sessionId,
            campaignInstanceId: instanceId,
            status: { in: ["LOBBY", "ACTIVE", "PAUSED"] },
          },
          select: { metadataRevision: true, lastEventSequence: true },
        });
        const participant = await client.sessionParticipation.findFirst({
          where: {
            id: participationId,
            campaignInstanceId: instanceId,
            sessionId,
            selected: true,
            role: { not: "GM" },
          },
          select: { participantName: true },
        });
        if (!session || !participant)
          throw new NotFoundException(
            "The selected Session participant is unavailable.",
          );
        const now = new Date();
        const sequence = (session.lastEventSequence ?? 0) + 1;
        const changed = await client.campaignInstanceSession.updateMany({
          where: {
            id: sessionId,
            campaignInstanceId: instanceId,
            metadataRevision: expectedMetadataRevision,
          },
          data: {
            metadataRevision: { increment: 1 },
            lastEventSequence: sequence,
          },
        });
        if (changed.count !== 1) throw staleSession();
        const leases = await client.sessionPresenceLease.findMany({
          where: { sessionId, participationId, leftAt: null },
          select: { joinedAt: true, expiresAt: true },
        });
        await client.sessionPresenceLease.updateMany({
          where: { sessionId, participationId, leftAt: null },
          data: { leftAt: now, ejectedAt: now },
        });
        const seconds = leases.reduce(
          (total, lease) => total + boundedPresenceSeconds(lease, now),
          0,
        );
        await client.sessionParticipation.update({
          where: { id: participationId },
          data: {
            leftAt: now,
            totalPresentSeconds: { increment: seconds },
          },
        });
        await this.appendEvent(client, {
          instanceId,
          sessionId,
          sequence,
          type: "session.participant-ejected",
          summary: `${participant.participantName} was removed from Session presence.`,
          actorName: instance.owner.displayName,
          actorUserId: userId,
          visibility: "PARTICIPANTS",
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.detail(instanceId, sessionId, userId);
  }

  async create(
    instanceId: string,
    userId: string,
    dto: CreateCampaignSessionDto,
  ) {
    const instance = await this.ownedInstance(instanceId, userId, true);
    const creationKeyHash = digest(
      `${userId}:${instanceId}:${dto.idempotencyKey}`,
    );
    const existing = await this.prisma.campaignInstanceSession.findFirst({
      where: { campaignInstanceId: instanceId, creationKeyHash },
      select: { id: true },
    });
    if (existing) return this.detail(instanceId, existing.id, userId);

    const selected = await this.resolveRoster(instanceId, userId, {
      playerMembershipIds: dto.playerMembershipIds ?? [],
      spectatorMembershipIds: dto.spectatorMembershipIds ?? [],
      agentParticipants: (dto.agentParticipationIds ?? []).map(
        (agentParticipationId) => ({
          agentParticipationId,
          required: false,
        }),
      ),
    });
    if (selected.length > MAX_PARTICIPANTS) {
      throw new BadRequestException(
        "A Session may include at most 8 participants including the GM.",
      );
    }

    try {
      const session = await this.prisma.$transaction(
        async (client) => {
          const created = await client.campaignInstanceSession.create({
            data: {
              campaignInstanceId: instanceId,
              name: cleanRequired(dto.name, "Session name"),
              planningNotes: cleanOptional(dto.planningNotes),
              scheduledFor: dto.scheduledFor
                ? new Date(dto.scheduledFor)
                : null,
              creationKeyHash,
              createdByUserId: userId,
            },
            select: { id: true },
          });
          await client.sessionParticipation.createMany({
            data: selected.map((participant) => ({
              ...participant,
              campaignInstanceId: instanceId,
              sessionId: created.id,
              scheduledAt: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
            })),
          });
          await this.appendEvent(client, {
            instanceId,
            sessionId: created.id,
            sequence: 1,
            type: "session.planned",
            summary: `${cleanRequired(dto.name, "Session name")} was planned.`,
            actorName: instance.owner.displayName,
            actorUserId: userId,
            visibility: "PARTICIPANTS",
          });
          await client.campaignInstanceSession.update({
            where: { id: created.id },
            data: { lastEventSequence: 1 },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.detail(instanceId, session.id, userId);
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const retry = await this.prisma.campaignInstanceSession.findFirst({
          where: { campaignInstanceId: instanceId, creationKeyHash },
          select: { id: true },
        });
        if (retry) return this.detail(instanceId, retry.id, userId);
      }
      throw error;
    }
  }

  async detail(instanceId: string, sessionId: string, userId: string) {
    const instance = await this.ownedInstance(instanceId, userId);
    const row = await this.prisma.campaignInstanceSession.findFirst({
      where: { id: sessionId, campaignInstanceId: instanceId },
      include: {
        participations: {
          where: { selected: true },
          orderBy: [{ role: "asc" }, { participantName: "asc" }, { id: "asc" }],
          include: {
            humanMembership: { include: { activeCharacter: true } },
            agentParticipation: true,
            presenceLeases: {
              where: {
                leftAt: null,
                ejectedAt: null,
                expiresAt: { gt: new Date() },
              },
              take: 1,
            },
          },
        },
        runtimeBoundaries: {
          orderBy: [{ eventSequence: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { snapshotId: true, runtimeRevision: true },
        },
      },
    });
    if (!row)
      throw new NotFoundException("The selected Session was not found.");
    return projectDetail(instance.name, row);
  }

  async update(
    instanceId: string,
    sessionId: string,
    userId: string,
    dto: UpdateCampaignSessionDto,
  ) {
    await this.ownedInstance(instanceId, userId, true);
    const current = await this.session(instanceId, sessionId);
    if (current.status !== "PLANNED" && current.status !== "LOBBY") {
      throw new ConflictException(
        "Only a planned Session or open lobby may be edited.",
      );
    }
    const updated = await this.prisma.campaignInstanceSession.updateMany({
      where: {
        id: sessionId,
        campaignInstanceId: instanceId,
        metadataRevision: dto.expectedMetadataRevision,
      },
      data: {
        ...(dto.name !== undefined
          ? { name: cleanRequired(dto.name, "Session name") }
          : {}),
        ...(dto.planningNotes !== undefined
          ? { planningNotes: cleanOptional(dto.planningNotes) ?? null }
          : {}),
        ...(dto.scheduledFor !== undefined
          ? {
              scheduledFor: dto.scheduledFor
                ? new Date(dto.scheduledFor)
                : null,
            }
          : {}),
        metadataRevision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw staleSession();
    return this.detail(instanceId, sessionId, userId);
  }

  async replaceParticipants(
    instanceId: string,
    sessionId: string,
    userId: string,
    dto: UpdateCampaignSessionParticipantsDto,
  ) {
    const instance = await this.ownedInstance(instanceId, userId, true);
    const selected = await this.resolveRoster(instanceId, userId, dto);
    if (selected.length > MAX_PARTICIPANTS) {
      throw new BadRequestException(
        "A Session may include at most 8 participants including the GM.",
      );
    }
    await this.prisma.$transaction(async (client) => {
      await lockSessionLifecycle(client);
      const current = await client.campaignInstanceSession.findFirst({
        where: {
          id: sessionId,
          campaignInstanceId: instanceId,
          status: { in: ["PLANNED", "LOBBY"] },
        },
        select: { lastEventSequence: true },
      });
      if (!current) {
        throw new ConflictException(
          "The participant list is frozen after a Session starts.",
        );
      }
      const sequence = (current.lastEventSequence ?? 0) + 1;
      const changed = await client.campaignInstanceSession.updateMany({
        where: {
          id: sessionId,
          campaignInstanceId: instanceId,
          metadataRevision: dto.expectedMetadataRevision,
        },
        data: {
          metadataRevision: { increment: 1 },
          lastEventSequence: sequence,
        },
      });
      if (changed.count !== 1) throw staleSession();
      await client.sessionParticipation.updateMany({
        where: { sessionId, role: { not: "GM" } },
        data: { selected: false },
      });
      for (const participant of selected.filter(
        (entry) => entry.role !== "GM",
      )) {
        const mutation = {
          create: {
            ...participant,
            selected: true,
            campaignInstanceId: instanceId,
            sessionId,
          },
          update: {
            selected: true,
            required: participant.required,
            participantName: participant.participantName,
            role: participant.role,
            observeCapabilities: participant.observeCapabilities,
            actCapabilities: participant.actCapabilities,
          },
        };
        if (participant.humanMembershipId) {
          await client.sessionParticipation.upsert({
            where: {
              sessionId_humanMembershipId: {
                sessionId,
                humanMembershipId: participant.humanMembershipId,
              },
            },
            ...mutation,
          });
        } else {
          await client.sessionParticipation.upsert({
            where: {
              sessionId_agentParticipationId: {
                sessionId,
                agentParticipationId: participant.agentParticipationId!,
              },
            },
            ...mutation,
          });
        }
      }
      await this.appendEvent(client, {
        instanceId,
        sessionId,
        sequence,
        type: "session.roster-updated",
        summary: `The Session roster was updated to ${selected.length} participant${selected.length === 1 ? "" : "s"}.`,
        actorName: instance.owner.displayName,
        actorUserId: userId,
        visibility: "PARTICIPANTS",
      });
    });
    return this.detail(instanceId, sessionId, userId);
  }

  async readiness(instanceId: string, sessionId: string, userId: string) {
    const instance = await this.ownedInstance(instanceId, userId);
    const [row, conflictingSession] = await Promise.all([
      this.loadForReadiness(instanceId, sessionId),
      this.prisma.campaignInstanceSession.findFirst({
        where: {
          id: { not: sessionId },
          status: "ACTIVE",
        },
        select: { name: true },
      }),
    ]);
    const checks = readinessChecks(instance, row, conflictingSession?.name);
    return {
      campaignInstanceName: instance.name,
      sessionName: row.name,
      ready: checks.every((check) => check.status !== "blocked"),
      runtimeRevision: instance.runtime?.revision ?? 0,
      token: readinessToken(instance, row),
      checks,
    };
  }

  async command(
    instanceId: string,
    sessionId: string,
    userId: string,
    command: string,
    dto: CampaignSessionLifecycleDto,
  ) {
    const targetByCommand = {
      "open-lobby": "LOBBY",
      "close-lobby": "PLANNED",
      start: "ACTIVE",
      pause: "PAUSED",
      resume: "ACTIVE",
      conclude: "CONCLUDED",
      cancel: "CANCELLED",
    } as const;
    const target = targetByCommand[command as keyof typeof targetByCommand];
    if (!target)
      throw new BadRequestException(
        "The requested Session action is not supported.",
      );
    await this.ownedInstance(instanceId, userId, true);

    try {
      await this.prisma.$transaction(
        async (client) => {
          await client.$executeRawUnsafe(
            'LOCK TABLE "CampaignInstanceSession" IN SHARE ROW EXCLUSIVE MODE',
          );
          const lockedInstance = await client.campaignInstance.findFirst({
            where: { id: instanceId, ownerUserId: userId },
            select: {
              id: true,
              name: true,
              status: true,
              metadataRevision: true,
              currentSnapshotId: true,
              runtime: {
                select: { revision: true, state: true, extensions: true },
              },
              currentSnapshot: {
                select: {
                  campaignDefinitionSnapshot: { select: { manifest: true } },
                  worldDefinitionSnapshot: { select: { manifest: true } },
                },
              },
              owner: { select: { displayName: true } },
            },
          });
          if (!lockedInstance?.owner)
            throw new ConflictException(
              "The Campaign Instance has no GM owner.",
            );
          const authoritativeInstance = {
            ...lockedInstance,
            owner: lockedInstance.owner,
          };
          const row = await this.loadForReadiness(
            instanceId,
            sessionId,
            client,
          );
          const conflictingSession =
            await client.campaignInstanceSession.findFirst({
              where: {
                id: { not: sessionId },
                status: "ACTIVE",
              },
              select: { name: true },
            });
          if (
            row.status === target &&
            row.metadataRevision === dto.expectedMetadataRevision + 1
          ) {
            return;
          }
          const from = row.status.toLowerCase() as Parameters<
            typeof canTransitionCampaignSessionStatus
          >[0];
          const to = target.toLowerCase() as Parameters<
            typeof canTransitionCampaignSessionStatus
          >[1];
          if (!canTransitionCampaignSessionStatus(from, to)) {
            throw new BadRequestException(
              `A ${from} Session cannot ${command.replace("-", " ")}.`,
            );
          }
          if (command === "start" || command === "resume") {
            const checks = readinessChecks(
              authoritativeInstance,
              row,
              conflictingSession?.name,
            );
            if (checks.some((check) => check.status === "blocked")) {
              throw new BadRequestException(
                "The Session is not ready to start or resume.",
              );
            }
            if (
              dto.readinessToken !== readinessToken(authoritativeInstance, row)
            )
              throw staleSession();
            if (
              dto.expectedRuntimeRevision !== lockedInstance.runtime?.revision
            ) {
              throw new ConflictException(
                "Campaign Instance state changed; review readiness and retry.",
              );
            }
          }
          const now = new Date();
          const sequence = (row.lastEventSequence ?? 0) + 1;
          const runtimeRevision = lockedInstance.runtime?.revision;
          const snapshotId = lockedInstance.currentSnapshotId;
          if (
            ["start", "pause", "resume", "conclude"].includes(command) &&
            (!snapshotId || !runtimeRevision)
          ) {
            throw new ConflictException(
              "The Campaign Instance has no valid runtime boundary.",
            );
          }
          if (command === "start" && lockedInstance.status === "PREPARING") {
            const activated = await client.campaignInstance.updateMany({
              where: {
                id: instanceId,
                ownerUserId: userId,
                status: "PREPARING",
                metadataRevision: lockedInstance.metadataRevision,
              },
              data: {
                status: "ACTIVE",
                metadataRevision: { increment: 1 },
              },
            });
            if (activated.count !== 1) {
              throw new ConflictException(
                "Campaign Instance readiness changed; review and retry.",
              );
            }
          }
          const changed = await client.campaignInstanceSession.updateMany({
            where: {
              id: sessionId,
              campaignInstanceId: instanceId,
              metadataRevision: dto.expectedMetadataRevision,
              status: row.status,
            },
            data: {
              status: target,
              metadataRevision: { increment: 1 },
              lastEventSequence: sequence,
              ...(command === "start" && !row.firstEventSequence
                ? { firstEventSequence: sequence }
                : {}),
              ...(command === "open-lobby" ? { lobbyOpenedAt: now } : {}),
              ...(command === "start"
                ? {
                    startedAt: now,
                    startSnapshotId: snapshotId,
                    startRuntimeRevision: runtimeRevision,
                    lastRuntimeRevision: runtimeRevision,
                  }
                : {}),
              ...(command === "pause"
                ? { pausedAt: now, lastRuntimeRevision: runtimeRevision }
                : {}),
              ...(command === "resume"
                ? { resumedAt: now, lastRuntimeRevision: runtimeRevision }
                : {}),
              ...(command === "conclude"
                ? {
                    concludedAt: now,
                    endSnapshotId: snapshotId,
                    endRuntimeRevision: runtimeRevision,
                    lastRuntimeRevision: runtimeRevision,
                    summaryStatus: "DRAFT",
                    currentSummaryRevision: 1,
                  }
                : {}),
              ...(command === "cancel"
                ? {
                    cancelledAt: now,
                    cancellationReason: cleanRequired(
                      dto.reason,
                      "Cancellation reason",
                    ),
                  }
                : {}),
            },
          });
          if (changed.count !== 1) throw staleSession();
          await this.appendEvent(client, {
            instanceId,
            sessionId,
            sequence,
            type: `session.${command}`,
            summary: `${row.name} ${pastTense(command)}.`,
            actorName: lockedInstance.owner.displayName,
            actorUserId: userId,
            visibility: "PARTICIPANTS",
            runtimeRevisionBefore: runtimeRevision,
            runtimeRevisionAfter: runtimeRevision,
          });
          if (["start", "pause", "resume", "conclude"].includes(command)) {
            const reason =
              command === "resume" &&
              (row.runtimeBoundaries[0]?.snapshotId ?? row.startSnapshotId) !==
                snapshotId
                ? "RESUME_AFTER_MIGRATION"
                : command.toUpperCase();
            if (reason !== "RESUME") {
              await client.campaignSessionRuntimeBoundary.create({
                data: {
                  campaignInstanceId: instanceId,
                  sessionId,
                  snapshotId: snapshotId!,
                  runtimeRevision: runtimeRevision!,
                  reason: reason as
                    "START" | "PAUSE" | "RESUME_AFTER_MIGRATION" | "CONCLUDE",
                  eventSequence: sequence,
                  contentHash: digest(
                    JSON.stringify({
                      campaignInstanceId: instanceId,
                      snapshotId,
                      runtimeRevision,
                      runtimeState: lockedInstance.runtime?.state,
                      runtimeExtensions: lockedInstance.runtime?.extensions,
                      eventSequence: sequence,
                      reason,
                    }),
                  ),
                  actorUserId: userId,
                },
              });
            }
          }
          if (command === "close-lobby") {
            await this.closePresence(client, sessionId, now);
            await client.campaignSessionInvitation.updateMany({
              where: { sessionId, status: "PENDING" },
              data: { status: "REVOKED", revokedAt: now },
            });
          }
          if (command === "cancel") {
            await client.campaignSessionInvitation.updateMany({
              where: { sessionId, status: "PENDING" },
              data: { status: "REVOKED", revokedAt: now },
            });
            await this.closePresence(client, sessionId, now);
          }
          if (command === "conclude") {
            await this.closePresence(client, sessionId, now);
            await client.sessionParticipation.updateMany({
              where: { sessionId, selected: true, attendance: "PENDING" },
              data: { attendance: "NOT_ATTENDED" },
            });
            await client.campaignSessionSummary.create({
              data: {
                campaignInstanceId: instanceId,
                sessionId,
                revision: 1,
                status: "DRAFT",
                eventSequenceThrough: sequence,
                narrative: "",
                createdByUserId: userId,
              },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2002") || isPrismaCode(error, "P2034")) {
        throw new ConflictException(
          "Session state changed concurrently; review readiness and retry.",
        );
      }
      throw error;
    }
    return this.detail(instanceId, sessionId, userId);
  }

  async updateSummary(
    instanceId: string,
    sessionId: string,
    userId: string,
    dto: UpdateCampaignSessionSummaryDto,
  ) {
    const instance = await this.ownedInstance(instanceId, userId);
    const session = await this.session(instanceId, sessionId);
    if (session.status !== "CONCLUDED" || !session.lastEventSequence) {
      throw new ConflictException(
        "A Session summary can be edited only after conclusion.",
      );
    }
    if (session.metadataRevision !== dto.expectedSessionRevision)
      throw staleSession();
    const nextRevision =
      (session.currentSummaryRevision ?? 0) +
      (session.summaryStatus === "DRAFT" ? 0 : 1);
    const status = session.summaryStatus === "DRAFT" ? "APPROVED" : "AMENDED";
    const summary = await this.prisma.$transaction(async (client) => {
      await lockSessionLifecycle(client);
      const currentSummary =
        await client.campaignSessionSummary.findUniqueOrThrow({
          where: {
            sessionId_revision: {
              sessionId,
              revision: session.currentSummaryRevision!,
            },
          },
          select: { eventSequenceThrough: true },
        });
      const sequence = session.lastEventSequence! + 1;
      const changed = await client.campaignInstanceSession.updateMany({
        where: {
          id: sessionId,
          campaignInstanceId: instanceId,
          metadataRevision: dto.expectedSessionRevision,
          status: "CONCLUDED",
        },
        data: {
          summaryStatus: status,
          currentSummaryRevision: nextRevision,
          metadataRevision: { increment: 1 },
          lastEventSequence: sequence,
        },
      });
      if (changed.count !== 1) throw staleSession();
      if (status === "APPROVED") {
        await client.campaignSessionSummary.update({
          where: { sessionId_revision: { sessionId, revision: nextRevision } },
          data: {
            narrative: dto.narrative.trim(),
            privateGmNotes: cleanOptional(dto.privateGmNotes),
            status,
            approvedAt: new Date(),
          },
        });
      } else {
        await client.campaignSessionSummary.create({
          data: {
            campaignInstanceId: instanceId,
            sessionId,
            revision: nextRevision,
            status,
            eventSequenceThrough: currentSummary.eventSequenceThrough,
            narrative: dto.narrative.trim(),
            privateGmNotes: cleanOptional(dto.privateGmNotes),
            createdByUserId: userId,
            approvedAt: new Date(),
          },
        });
      }
      await client.campaignSessionOutboxEvent.create({
        data: {
          campaignInstanceId: instanceId,
          sessionId,
          type: "session-backup-requested",
          payload: { sessionName: session.name, summaryRevision: nextRevision },
        },
      });
      await this.appendEvent(client, {
        instanceId,
        sessionId,
        sequence,
        type:
          status === "APPROVED"
            ? "session.summary-approved"
            : "session.summary-amended",
        summary:
          status === "APPROVED"
            ? "The Session summary was approved."
            : `Session summary amendment ${nextRevision} was recorded.`,
        actorName: instance.owner.displayName,
        actorUserId: userId,
        visibility: "PARTICIPANTS",
      });
      return client.campaignSessionSummary.findUniqueOrThrow({
        where: { sessionId_revision: { sessionId, revision: nextRevision } },
        include: { createdBy: { select: { displayName: true } } },
      });
    });
    return {
      sessionName: session.name,
      revision: summary.revision,
      status: summary.status.toLowerCase(),
      eventSequenceThrough: summary.eventSequenceThrough,
      narrative: summary.narrative,
      privateGmNotes: summary.privateGmNotes ?? undefined,
      createdByName: summary.createdBy.displayName,
      createdAt: summary.createdAt.toISOString(),
      approvedAt: summary.approvedAt?.toISOString(),
      campaignInstanceName: instance.name,
    };
  }

  async events(
    instanceId: string,
    sessionId: string,
    userId: string,
    afterSequence = 0,
  ) {
    const instance = await this.ownedInstance(instanceId, userId);
    const session = await this.session(instanceId, sessionId);
    const rows = await this.prisma.campaignSessionEvent.findMany({
      where: {
        campaignInstanceId: instanceId,
        sessionId,
        sequence: { gt: afterSequence },
      },
      orderBy: { sequence: "asc" },
      take: 101,
    });
    return {
      campaignInstanceName: instance.name,
      sessionName: session.name,
      items: rows.slice(0, 100).map((row) => ({
        sequence: row.sequence,
        occurredAt: row.occurredAt.toISOString(),
        campaignTime: row.campaignTime ?? undefined,
        type: row.type,
        summary: row.summary,
        actorName: row.actorName,
        visibility: row.visibility.toLowerCase().replace("_", "-"),
        runtimeRevisionBefore: row.runtimeRevisionBefore ?? undefined,
        runtimeRevisionAfter: row.runtimeRevisionAfter ?? undefined,
      })),
      nextAfterSequence: rows.length > 100 ? rows[99].sequence : undefined,
    };
  }

  async summary(instanceId: string, sessionId: string, userId: string) {
    const instance = await this.ownedInstance(instanceId, userId);
    const session = await this.session(instanceId, sessionId);
    if (!session.currentSummaryRevision)
      throw new NotFoundException("This Session does not have a summary yet.");
    const row = await this.prisma.campaignSessionSummary.findUnique({
      where: {
        sessionId_revision: {
          sessionId,
          revision: session.currentSummaryRevision,
        },
      },
      include: { createdBy: { select: { displayName: true } } },
    });
    if (!row)
      throw new NotFoundException("This Session summary is unavailable.");
    return {
      campaignInstanceName: instance.name,
      sessionName: session.name,
      revision: row.revision,
      status: row.status.toLowerCase(),
      eventSequenceThrough: row.eventSequenceThrough,
      narrative: row.narrative,
      privateGmNotes: row.privateGmNotes ?? undefined,
      createdByName: row.createdBy.displayName,
      createdAt: row.createdAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString(),
    };
  }

  private async ownedInstance(
    instanceId: string,
    userId: string,
    editable = false,
  ) {
    const instance = await this.prisma.campaignInstance.findFirst({
      where: { id: instanceId, ownerUserId: userId },
      select: {
        id: true,
        name: true,
        status: true,
        currentSnapshotId: true,
        runtime: { select: { revision: true, state: true } },
        currentSnapshot: {
          select: {
            campaignDefinitionSnapshot: { select: { manifest: true } },
            worldDefinitionSnapshot: { select: { manifest: true } },
          },
        },
        owner: { select: { displayName: true } },
      },
    });
    if (!instance)
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    if (!instance.owner)
      throw new ConflictException("The Campaign Instance has no GM owner.");
    if (editable && ["ARCHIVED", "CONCLUDED"].includes(instance.status))
      throw new ConflictException("This Campaign Instance is read-only.");
    return { ...instance, owner: instance.owner };
  }

  private async session(instanceId: string, sessionId: string) {
    const row = await this.prisma.campaignInstanceSession.findFirst({
      where: { id: sessionId, campaignInstanceId: instanceId },
    });
    if (!row)
      throw new NotFoundException("The selected Session was not found.");
    return row;
  }

  private async resolveRoster(
    instanceId: string,
    userId: string,
    input: {
      playerMembershipIds: readonly string[];
      spectatorMembershipIds: readonly string[];
      agentParticipants: readonly {
        agentParticipationId: string;
        required: boolean;
      }[];
    },
  ) {
    const ids = [
      ...new Set([
        ...input.playerMembershipIds,
        ...input.spectatorMembershipIds,
      ]),
    ];
    const agentIds = [
      ...new Set(
        input.agentParticipants.map((entry) => entry.agentParticipationId),
      ),
    ];
    if (
      ids.length !==
        input.playerMembershipIds.length +
          input.spectatorMembershipIds.length ||
      agentIds.length !== input.agentParticipants.length
    ) {
      throw new BadRequestException(
        "Each participant may be selected only once.",
      );
    }
    const [gm, humans, agents] = await Promise.all([
      this.prisma.campaignInstanceHumanMembership.findFirst({
        where: {
          campaignInstanceId: instanceId,
          userId,
          role: "GM",
          status: "ACTIVE",
        },
      }),
      this.prisma.campaignInstanceHumanMembership.findMany({
        where: {
          campaignInstanceId: instanceId,
          id: { in: ids },
          status: "ACTIVE",
        },
      }),
      this.prisma.campaignInstanceAgentParticipation.findMany({
        where: {
          campaignInstanceId: instanceId,
          id: { in: agentIds },
          status: { in: ["AUTHORIZED", "ACTIVE", "PAUSED"] },
        },
      }),
    ]);
    if (!gm)
      throw new ConflictException("An active GM membership is required.");
    if (humans.length !== ids.length || agents.length !== agentIds.length)
      throw new BadRequestException(
        "One or more selected participants is unavailable.",
      );
    const byHuman = new Map(humans.map((row) => [row.id, row]));
    for (const id of input.playerMembershipIds)
      if (byHuman.get(id)?.role !== "PLAYER")
        throw new BadRequestException(
          "A selected Player does not have the Player role.",
        );
    for (const id of input.spectatorMembershipIds)
      if (byHuman.get(id)?.role !== "SPECTATOR")
        throw new BadRequestException(
          "A selected Spectator does not have the Spectator role.",
        );
    const result: RosterParticipant[] = [
      {
        humanMembershipId: gm.id,
        agentParticipationId: null,
        participantName: gm.displayName,
        role: "GM",
        required: true,
        response: "ACCEPTED",
        respondedAt: new Date(),
        observeCapabilities: ["session:observe"],
        actCapabilities: ["session:operate", "session:participate"],
      },
    ];
    for (const id of input.playerMembershipIds)
      result.push({
        humanMembershipId: id,
        agentParticipationId: null,
        participantName: byHuman.get(id)!.displayName,
        role: "PLAYER",
        required: true,
        response: "NOT_REQUESTED",
        observeCapabilities: ["session:observe"],
        actCapabilities: ["session:participate"],
      });
    for (const id of input.spectatorMembershipIds)
      result.push({
        humanMembershipId: id,
        agentParticipationId: null,
        participantName: byHuman.get(id)!.displayName,
        role: "SPECTATOR",
        required: false,
        response: "NOT_REQUESTED",
        observeCapabilities: ["session:observe"],
        actCapabilities: [],
      });
    const requiredAgents = new Map(
      input.agentParticipants.map((entry) => [
        entry.agentParticipationId,
        entry.required,
      ]),
    );
    for (const agent of agents) {
      const observeCapabilities = allowedAgentCapabilities(
        agent.observeCapabilities,
        CORE_SESSION_AGENT_OBSERVE_CAPABILITIES,
      );
      const actCapabilities = allowedAgentCapabilities(
        agent.actCapabilities,
        CORE_SESSION_AGENT_ACT_CAPABILITIES,
      );
      result.push({
        humanMembershipId: null,
        agentParticipationId: agent.id,
        participantName: agent.agentName,
        role: "AGENT",
        required: requiredAgents.get(agent.id) ?? false,
        response: "ACCEPTED",
        observeCapabilities,
        actCapabilities,
      });
    }
    return result;
  }

  private loadForReadiness(
    instanceId: string,
    sessionId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.campaignInstanceSession.findFirstOrThrow({
      where: { id: sessionId, campaignInstanceId: instanceId },
      include: {
        participations: {
          where: { selected: true },
          include: {
            humanMembership: { include: { activeCharacter: true } },
            agentParticipation: true,
            presenceLeases: {
              where: {
                leftAt: null,
                ejectedAt: null,
                expiresAt: { gt: new Date() },
              },
            },
          },
        },
        runtimeBoundaries: {
          orderBy: [{ eventSequence: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { snapshotId: true, runtimeRevision: true },
        },
      },
    });
  }

  private async appendEvent(
    client: Prisma.TransactionClient,
    input: {
      instanceId: string;
      sessionId: string;
      sequence: number;
      type: string;
      summary: string;
      actorName: string;
      actorUserId: string | null;
      visibility: "PARTICIPANTS";
      runtimeRevisionBefore?: number;
      runtimeRevisionAfter?: number;
    },
  ) {
    const previous =
      input.sequence > 1
        ? await client.campaignSessionEvent.findUnique({
            where: {
              sessionId_sequence: {
                sessionId: input.sessionId,
                sequence: input.sequence - 1,
              },
            },
            select: { contentHash: true },
          })
        : null;
    const contentHash = digest(
      JSON.stringify({ ...input, previousHash: previous?.contentHash ?? null }),
    );
    await client.campaignSessionEvent.create({
      data: {
        campaignInstanceId: input.instanceId,
        sessionId: input.sessionId,
        sequence: input.sequence,
        type: input.type,
        summary: input.summary,
        actorName: input.actorName,
        actorUserId: input.actorUserId,
        visibility: input.visibility,
        runtimeRevisionBefore: input.runtimeRevisionBefore,
        runtimeRevisionAfter: input.runtimeRevisionAfter,
        previousHash: previous?.contentHash,
        contentHash,
      },
    });
  }

  private async closePresence(
    client: Prisma.TransactionClient,
    sessionId: string,
    now: Date,
  ) {
    const leases = await client.sessionPresenceLease.findMany({
      where: { sessionId, leftAt: null },
      select: { participationId: true, joinedAt: true, expiresAt: true },
    });
    await client.sessionPresenceLease.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: now },
    });
    const secondsByParticipation = new Map<string, number>();
    for (const lease of leases) {
      const seconds = boundedPresenceSeconds(lease, now);
      secondsByParticipation.set(
        lease.participationId,
        (secondsByParticipation.get(lease.participationId) ?? 0) + seconds,
      );
    }
    for (const [participationId, seconds] of secondsByParticipation) {
      await client.sessionParticipation.update({
        where: { id: participationId },
        data: {
          leftAt: now,
          totalPresentSeconds: { increment: seconds },
        },
      });
    }
  }

  private async withPresenceLock<Result>(
    operation: (client: Prisma.TransactionClient) => Promise<Result>,
  ): Promise<Result> {
    try {
      return await this.prisma.$transaction(
        async (client) => {
          await lockSessionLifecycle(client);
          return operation(client);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2034")) {
        throw new ConflictException(
          "Session presence changed concurrently; reconnect and retry.",
        );
      }
      throw error;
    }
  }

  private async validSessionInvitation(token: string, attemptKey: string) {
    const now = Date.now();
    const prior = this.invitationFailures.get(attemptKey);
    if (
      prior &&
      now - prior.windowStartedAt < 15 * 60 * 1_000 &&
      prior.count >= 10
    ) {
      throw new HttpException(
        "Too many invitation attempts. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const invitation = await this.prisma.campaignSessionInvitation.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
      include: {
        participation: { include: { humanMembership: true } },
        session: { include: { campaignInstance: { select: { name: true } } } },
      },
    });
    if (
      !invitation ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt.getTime() <= Date.now() ||
      !invitation.participation.selected ||
      !["LOBBY", "ACTIVE"].includes(invitation.session.status)
    ) {
      this.invitationFailures.set(attemptKey, {
        count:
          prior && now - prior.windowStartedAt < 15 * 60 * 1_000
            ? prior.count + 1
            : 1,
        windowStartedAt:
          prior && now - prior.windowStartedAt < 15 * 60 * 1_000
            ? prior.windowStartedAt
            : now,
      });
      throw new NotFoundException(
        "Session invitation is invalid or unavailable.",
      );
    }
    this.invitationFailures.delete(attemptKey);
    return invitation;
  }

  private async deliverSessionInvitation(
    instanceId: string,
    sessionId: string,
    invitationId: string,
    destination: {
      channel: "email" | "sms";
      recipient: string;
      port: NotificationPort;
    },
    content: { subject: string; text: string },
  ) {
    const attempt = await this.prisma.$transaction(
      async (client) => {
        await lockSessionLifecycle(client);
        const eligible = await client.campaignSessionInvitation.findFirst({
          where: {
            id: invitationId,
            campaignInstanceId: instanceId,
            sessionId,
            status: "PENDING",
            expiresAt: { gt: new Date() },
            participation: { selected: true },
            session: { status: "LOBBY" },
          },
          select: { id: true },
        });
        if (!eligible) return null;
        return client.campaignSessionInvitationDeliveryAttempt.create({
          data: {
            campaignInstanceId: instanceId,
            sessionId,
            invitationId,
            channel: destination.channel === "email" ? "EMAIL" : "SMS",
            status: "PENDING",
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!attempt) return { channel: destination.channel, status: "skipped" };
    try {
      const result = await destination.port.send({
        deliveryId: attempt.id,
        recipient: destination.recipient,
        ...content,
      });
      const status = result.captured ? "CAPTURED" : "SENT";
      await this.prisma.campaignSessionInvitationDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status,
          providerReference: result.providerMessageId.slice(0, 500),
        },
      });
      return { channel: destination.channel, status: status.toLowerCase() };
    } catch {
      await this.prisma.campaignSessionInvitationDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { status: "FAILED", failureCategory: "provider-error" },
      });
      return { channel: destination.channel, status: "failed" };
    }
  }

  private async participationForUser(
    instanceId: string,
    sessionId: string,
    userId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const participation = await client.sessionParticipation.findFirst({
      where: {
        campaignInstanceId: instanceId,
        sessionId,
        selected: true,
        response: "ACCEPTED",
        humanMembership: {
          userId,
          status: "ACTIVE",
          OR: [
            { role: "GM" },
            { user: { playerProfile: { standing: "ACTIVE" } } },
          ],
        },
      },
      include: {
        session: {
          select: { name: true, status: true, lastEventSequence: true },
        },
      },
    });
    if (!participation)
      throw new NotFoundException("You are not invited to this Session.");
    return participation;
  }
}

function readinessChecks(
  instance: Awaited<ReturnType<CampaignSessionService["ownedInstance"]>>,
  session: Awaited<ReturnType<CampaignSessionService["loadForReadiness"]>>,
  conflictingSessionName?: string,
) {
  let runtimeIssue: string | undefined;
  if (!instance.runtime || !isJsonObject(instance.runtime.state)) {
    runtimeIssue = "The Campaign Instance runtime is unavailable.";
  } else {
    try {
      runtimeIssue = validateRuntimeForCapturedPair(
        instance.runtime.state,
        instance,
      )[0]?.detail;
    } catch {
      runtimeIssue = "The Campaign Instance runtime is malformed.";
    }
  }
  const policyIssue = capturedCreaturePolicyProblems(
    instance.currentSnapshot,
  )[0];
  const capturedRuntimeReady =
    Boolean(instance.currentSnapshotId && instance.runtime) &&
    !runtimeIssue &&
    !policyIssue;
  const checks = [
    {
      key: "lobby",
      label: "Lobby",
      status:
        session.status === "LOBBY" || session.status === "PAUSED"
          ? ("ready" as const)
          : ("blocked" as const),
      detail:
        session.status === "LOBBY" || session.status === "PAUSED"
          ? "The Session is ready for a lifecycle decision."
          : "Open the lobby before starting the Session.",
    },
  ];
  checks.push({
    key: "runtime",
    label: "Campaign Instance",
    status:
      (instance.status === "ACTIVE" ||
        (session.status === "LOBBY" && instance.status === "PREPARING")) &&
      capturedRuntimeReady
        ? "ready"
        : "blocked",
    detail:
      session.status === "LOBBY" && instance.status === "PREPARING"
        ? "The Campaign Instance is ready to activate when this Session starts."
        : instance.status !== "ACTIVE"
          ? "The Campaign Instance must be active before this Session can resume."
          : capturedRuntimeReady
            ? "The captured Campaign, World, and runtime are available."
            : (runtimeIssue ??
              policyIssue ??
              "The captured Campaign and World pair is unavailable."),
  });
  checks.push({
    key: "installation-session",
    label: "Hosted Session capacity",
    status: conflictingSessionName ? "blocked" : "ready",
    detail: conflictingSessionName
      ? `${conflictingSessionName} must pause or conclude before this Session can start or resume.`
      : "No other Session is active on this server.",
  });
  for (const participant of session.participations) {
    if (!participant.required) continue;
    const present = participant.presenceLeases.length > 0;
    const activeHuman =
      !participant.humanMembership ||
      participant.humanMembership.status === "ACTIVE";
    const characterReady =
      participant.role !== "PLAYER" ||
      participant.humanMembership?.activeCharacter?.status === "ACTIVE";
    const agentReady =
      !participant.agentParticipation ||
      ["AUTHORIZED", "ACTIVE", "PAUSED"].includes(
        participant.agentParticipation.status,
      );
    const ready =
      activeHuman &&
      characterReady &&
      agentReady &&
      participant.response === "ACCEPTED" &&
      (participant.role === "AGENT" || present);
    checks.push({
      key: `participant-${participant.id}`,
      label: participant.participantName || "Required participant",
      status: ready ? "ready" : "blocked",
      detail: ready
        ? `${participant.participantName} is ready.`
        : participant.role === "AGENT"
          ? `${participant.participantName} must remain authorized for this Session.`
          : `${participant.participantName} must accept, be present, and have any required active Character.`,
    });
  }
  checks.push({
    key: "participant-limit",
    label: "Participant limit",
    status:
      session.participations.length <= MAX_PARTICIPANTS ? "ready" : "blocked",
    detail: `${session.participations.length} of ${MAX_PARTICIPANTS} participant places are selected.`,
  });
  return checks;
}

function readinessToken(
  instance: Awaited<ReturnType<CampaignSessionService["ownedInstance"]>>,
  session: Awaited<ReturnType<CampaignSessionService["loadForReadiness"]>>,
) {
  return digest(
    JSON.stringify({
      sessionRevision: session.metadataRevision,
      snapshot: instance.currentSnapshotId,
      runtimeRevision: instance.runtime?.revision,
      participants: session.participations.map((p) => [
        p.id,
        p.response,
        p.presenceLeases.length,
        p.humanMembership?.activeCharacter?.status,
        p.agentParticipation?.status,
      ]),
    }),
  );
}

function projectDetail(
  instanceName: string,
  row: Awaited<ReturnType<CampaignSessionService["loadForReadiness"]>>,
) {
  return {
    id: row.id,
    name: row.name,
    campaignInstanceId: row.campaignInstanceId,
    campaignInstanceName: instanceName,
    status: row.status.toLowerCase(),
    metadataRevision: row.metadataRevision,
    scheduledFor: row.scheduledFor?.toISOString(),
    planningNotes: row.planningNotes ?? undefined,
    lobbyOpenedAt: row.lobbyOpenedAt?.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    pausedAt: row.pausedAt?.toISOString(),
    resumedAt: row.resumedAt?.toISOString(),
    concludedAt: row.concludedAt?.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString(),
    cancellationReason: row.cancellationReason ?? undefined,
    startRuntimeRevision: row.startRuntimeRevision ?? undefined,
    lastRuntimeRevision: row.lastRuntimeRevision ?? undefined,
    endRuntimeRevision: row.endRuntimeRevision ?? undefined,
    summaryStatus: row.summaryStatus?.toLowerCase(),
    currentSummaryRevision: row.currentSummaryRevision ?? undefined,
    participantCount: row.participations.length,
    participants: row.participations.map((participant) => {
      const present = participant.presenceLeases.length > 0;
      const ready =
        participant.response === "ACCEPTED" &&
        (!participant.required || present) &&
        (participant.role !== "PLAYER" ||
          participant.humanMembership?.activeCharacter?.status === "ACTIVE");
      return {
        participationId: participant.id,
        name: participant.participantName || "Unnamed participant",
        role: participant.role.toLowerCase(),
        required: participant.required,
        response: participant.response.toLowerCase(),
        responseMessage: participant.responseMessage ?? undefined,
        attendance:
          participant.attendance === "NOT_ATTENDED"
            ? "did-not-attend"
            : participant.attendance.toLowerCase(),
        firstJoinedAt: participant.joinedAt?.toISOString(),
        lastLeftAt: participant.leftAt?.toISOString(),
        totalPresentSeconds: participant.totalPresentSeconds,
        present,
        ready,
        readinessDetail: ready
          ? "Ready"
          : participant.required
            ? "Action required before start"
            : "Optional participant",
        observeCapabilities: jsonStrings(participant.observeCapabilities),
        actCapabilities: jsonStrings(participant.actCapabilities),
      };
    }),
  };
}

function cleanRequired(value: string | undefined, label: string) {
  const result = value?.trim();
  if (!result) throw new BadRequestException(`${label} is required.`);
  return result;
}
function cleanOptional(value: string | undefined | null) {
  const result = value?.trim();
  return result || undefined;
}
async function lockSessionLifecycle(client: Prisma.TransactionClient) {
  await client.$executeRawUnsafe(
    'LOCK TABLE "CampaignInstanceSession" IN SHARE ROW EXCLUSIVE MODE',
  );
}
function requireAcceptedPresence(participation: { response: string }) {
  if (participation.response !== "ACCEPTED") {
    throw new ConflictException(
      "Accept the Session invitation before using presence.",
    );
  }
}
function requirePresenceStatus(status: string) {
  if (!["LOBBY", "ACTIVE", "PAUSED"].includes(status)) {
    throw new ConflictException("This Session is not accepting participants.");
  }
}
function boundedPresenceSeconds(
  lease: { joinedAt: Date; expiresAt: Date },
  closedAt: Date,
) {
  return Math.max(
    0,
    Math.floor(
      (Math.min(closedAt.getTime(), lease.expiresAt.getTime()) -
        lease.joinedAt.getTime()) /
        1_000,
    ),
  );
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function jsonStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
function isJsonObject(
  value: Prisma.JsonValue,
): value is Record<string, Prisma.JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function allowedAgentCapabilities(
  value: Prisma.JsonValue,
  allowedValues: readonly string[],
): string[] {
  const capabilities = jsonStrings(value);
  const allowed = new Set(allowedValues);
  if (capabilities.some((capability) => !allowed.has(capability))) {
    throw new BadRequestException(
      "The selected Agent has capabilities outside the core Session registry.",
    );
  }
  return capabilities;
}
function staleSession() {
  return new ConflictException("Session details changed; reload and retry.");
}
function isPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}
function pastTense(command: string) {
  return (
    (
      {
        "open-lobby": "opened its lobby",
        "close-lobby": "closed its lobby",
        start: "started",
        pause: "paused",
        resume: "resumed",
        conclude: "concluded",
        cancel: "was cancelled",
      } as Record<string, string>
    )[command] ?? "changed"
  );
}

type RosterParticipant = Pick<
  Prisma.SessionParticipationCreateManyInput,
  | "humanMembershipId"
  | "agentParticipationId"
  | "participantName"
  | "role"
  | "required"
  | "response"
  | "respondedAt"
  | "observeCapabilities"
  | "actCapabilities"
>;
