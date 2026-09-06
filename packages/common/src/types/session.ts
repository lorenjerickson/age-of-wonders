import type {
  CampaignInstanceAgentParticipationId,
  CampaignInstanceId,
  CampaignInstanceMembershipId,
  CampaignInstanceSnapshotId,
  ExtensionData,
  JsonValue,
  NamespacedKey,
  SessionEventId,
  SessionId,
  SessionInvitationId,
  SessionParticipationId,
  SessionPresenceLeaseId,
  SessionRuntimeBoundaryId,
  SessionSummaryId,
  UserId,
} from "./primitives";

export type CampaignSessionStatus =
  "planned" | "lobby" | "active" | "paused" | "concluded" | "cancelled";

export type SessionParticipantRole = "gm" | "player" | "spectator" | "agent";
export type SessionResponseStatus =
  "not-requested" | "pending" | "accepted" | "declined";
export type SessionAttendanceStatus =
  "pending" | "attended" | "excused" | "did-not-attend";
export type SessionPresencePhase = "lobby" | "play";
export type SessionEventVisibility =
  "gm" | "participants" | "players" | "spectators" | "session-public";
export type SessionBoundaryReason =
  "start" | "pause" | "resume-after-migration" | "conclude";
export type SessionSummaryStatus = "draft" | "approved" | "amended";

/** Closed observation grants available to core Session Agent integrations. */
export const CORE_SESSION_AGENT_OBSERVE_CAPABILITIES = [
  "aow:event-stream",
  "aow:presence",
  "aow:session-state",
] as const;
export type CoreSessionAgentObserveCapability =
  (typeof CORE_SESSION_AGENT_OBSERVE_CAPABILITIES)[number];

/** Closed action grants available to core Session Agent integrations. */
export const CORE_SESSION_AGENT_ACT_CAPABILITIES = [
  "aow:draft-narrative",
  "aow:suggest-content",
  "aow:suggest-plot-twist",
] as const;
export type CoreSessionAgentActCapability =
  (typeof CORE_SESSION_AGENT_ACT_CAPABILITIES)[number];

export interface CampaignSession {
  readonly id: SessionId;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly name: string;
  readonly status: CampaignSessionStatus;
  readonly metadataRevision: number;
  readonly scheduledFor?: string;
  readonly planningNotes?: string;
  readonly createdByUserId: UserId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lobbyOpenedAt?: string;
  readonly startedAt?: string;
  readonly pausedAt?: string;
  readonly resumedAt?: string;
  readonly concludedAt?: string;
  readonly cancelledAt?: string;
  readonly cancellationReason?: string;
  readonly startSnapshotId?: CampaignInstanceSnapshotId;
  readonly startRuntimeRevision?: number;
  readonly lastRuntimeRevision?: number;
  readonly endSnapshotId?: CampaignInstanceSnapshotId;
  readonly endRuntimeRevision?: number;
  readonly firstEventSequence?: number;
  readonly lastEventSequence?: number;
  readonly currentSummaryRevision?: number;
  readonly summaryStatus?: SessionSummaryStatus;
  readonly extensions: ExtensionData;
}

export type SessionParticipantReference =
  | {
      readonly kind: "human-membership";
      readonly membershipId: CampaignInstanceMembershipId;
    }
  | {
      readonly kind: "agent-participation";
      readonly agentParticipationId: CampaignInstanceAgentParticipationId;
    };

export interface CampaignSessionParticipation {
  readonly id: SessionParticipationId;
  readonly sessionId: SessionId;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly participant: SessionParticipantReference;
  readonly participantName: string;
  readonly role: SessionParticipantRole;
  readonly required: boolean;
  /** False retains invitation/attendance history after removal from a pre-start roster. */
  readonly selected: boolean;
  readonly response: SessionResponseStatus;
  readonly responseMessage?: string;
  readonly respondedAt?: string;
  readonly attendance: SessionAttendanceStatus;
  readonly firstJoinedAt?: string;
  readonly lastLeftAt?: string;
  readonly totalPresentSeconds: number;
  readonly acted: boolean;
  /** Immutable observe grants captured when this Session roster entry is selected. */
  readonly observeCapabilities: readonly NamespacedKey[];
  /** Immutable act grants captured separately so observation never implies mutation. */
  readonly actCapabilities: readonly NamespacedKey[];
}

export interface CampaignSessionInvitation {
  readonly id: SessionInvitationId;
  readonly sessionId: SessionId;
  readonly participationId: SessionParticipationId;
  readonly revision: number;
  readonly status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  readonly expiresAt: string;
  readonly issuedAt: string;
  readonly acceptedAt?: string;
  readonly revokedAt?: string;
}

export interface SessionPresenceLease {
  readonly id: SessionPresenceLeaseId;
  readonly sessionId: SessionId;
  readonly participationId: SessionParticipationId;
  readonly phase: SessionPresencePhase;
  readonly joinedAt: string;
  readonly lastHeartbeatAt: string;
  readonly expiresAt: string;
  readonly leftAt?: string;
  readonly ejectedAt?: string;
}

export interface CampaignSessionEvent {
  readonly id: SessionEventId;
  readonly sessionId: SessionId;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly campaignTime?: string;
  readonly type: string;
  readonly summary: string;
  readonly actorName: string;
  readonly visibility: SessionEventVisibility;
  readonly runtimeRevisionBefore?: number;
  readonly runtimeRevisionAfter?: number;
  readonly causedBySequence?: number;
  readonly payload?: JsonValue;
  readonly extensions: ExtensionData;
}

export interface CampaignSessionRuntimeBoundary {
  readonly id: SessionRuntimeBoundaryId;
  readonly sessionId: SessionId;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly snapshotId: CampaignInstanceSnapshotId;
  readonly runtimeRevision: number;
  readonly reason: SessionBoundaryReason;
  readonly eventSequence: number;
  readonly contentHash: string;
  readonly actorName: string;
  readonly createdAt: string;
}

export interface CampaignSessionSummary {
  readonly id: SessionSummaryId;
  readonly sessionId: SessionId;
  readonly revision: number;
  readonly status: SessionSummaryStatus;
  readonly eventSequenceThrough: number;
  readonly narrative: string;
  readonly privateGmNotes?: string;
  readonly createdByName: string;
  readonly createdAt: string;
  readonly approvedAt?: string;
}

const SESSION_TRANSITIONS: Readonly<
  Record<CampaignSessionStatus, readonly CampaignSessionStatus[]>
> = {
  planned: ["lobby", "cancelled"],
  lobby: ["planned", "active", "cancelled"],
  active: ["paused", "concluded"],
  paused: ["active", "concluded"],
  concluded: [],
  cancelled: [],
};

export function canTransitionCampaignSessionStatus(
  from: CampaignSessionStatus,
  to: CampaignSessionStatus,
): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}
