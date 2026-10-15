import { type CampaignSessionStatus } from "@aow/common";
import {
  Entity,
  type EntityOptions,
  type CommandInvocation,
  type EntityTransition,
  type DeepReadonly,
} from "./entity";

const targets = {
  "open-lobby": "lobby",
  "close-lobby": "planned",
  start: "active",
  pause: "paused",
  resume: "active",
  conclude: "concluded",
  cancel: "cancelled",
} as const;
export type CampaignSessionAction = keyof typeof targets;
/** Lifecycle projection of the current CampaignSession; storage/auth/participants remain external. */
export interface CampaignSessionState extends Record<string, unknown> {
  status: CampaignSessionStatus;
  metadataRevision: number;
  lastEventSequence?: number;
  firstEventSequence?: number;
  lobbyOpenedAt?: string;
  startedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  concludedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  startSnapshotId?: string;
  endSnapshotId?: string;
  startRuntimeRevision?: number;
  lastRuntimeRevision?: number;
  endRuntimeRevision?: number;
  summaryStatus?: "draft" | "approved" | "amended";
  currentSummaryRevision?: number;
}
export type CampaignSessionCommands = {
  transition: {
    params: {
      action: CampaignSessionAction;
      expectedMetadataRevision: number;
      occurredAt: string;
      runtime?: { snapshotId: string; revision: number };
      reason?: string;
    };
    context: object;
  };
};
export type CampaignSessionEvents = {
  transitioned: {
    action: CampaignSessionAction;
    from: CampaignSessionStatus;
    to: CampaignSessionStatus;
    sequence: number;
  };
};

export interface CampaignSessionReadiness {
  instanceStatus: string;
  hasCapturedRuntime: boolean;
  runtimeIssue?: string;
  policyIssue?: string;
  conflictingSessionName?: string;
  session: {
    status: string;
    gmControlsPlayers?: boolean;
    participations: readonly {
      id: string;
      participantName: string;
      role: string;
      response: string;
      required: boolean;
      humanMembership?: {
        status: string;
        activeCharacter?: { status: string } | null;
      } | null;
      agentParticipation?: { status: string } | null;
      presenceLeases: readonly unknown[];
    }[];
  };
}
export class CampaignSession extends Entity<
  CampaignSessionState,
  CampaignSessionCommands,
  CampaignSessionEvents
> {
  static readonly presenceStatuses = ["LOBBY", "ACTIVE", "PAUSED"] as const;
  static assertPresence(response: string, status: string): void {
    if (response !== "ACCEPTED")
      throw new TypeError(
        "Accept the Session invitation before using presence.",
      );
    if (!(this.presenceStatuses as readonly string[]).includes(status))
      throw new TypeError("This Session is not accepting participants.");
  }
  /** Timestamp acquisition and conditional lease updates belong to the adapter. */
  static presenceWindow(now: number) {
    return { expiresAt: now + 90_000, renewHeartbeatThrough: now - 5_000 };
  }
  static presencePhase(status: string): "PLAY" | "LOBBY" {
    return status === "ACTIVE" ? "PLAY" : "LOBBY";
  }
  static attendanceOnJoin(status: string): "ATTENDED" | undefined {
    return status === "ACTIVE" ? "ATTENDED" : undefined;
  }
  static lifecyclePresence(action: "start" | "resume" | "pause") {
    return {
      phase: action === "pause" ? ("LOBBY" as const) : ("PLAY" as const),
      attended: action !== "pause",
    };
  }
  static presenceSeconds(
    joinedAt: number,
    expiresAt: number,
    closedAt: number,
  ): number {
    return Math.max(
      0,
      Math.floor((Math.min(closedAt, expiresAt) - joinedAt) / 1_000),
    );
  }
  static readonly participantLimit = 8;
  /** Readiness uses explicit captured validation and live roster evidence supplied by adapters. */
  static readiness(input: CampaignSessionReadiness) {
    const {
      instanceStatus,
      hasCapturedRuntime,
      runtimeIssue,
      policyIssue,
      session,
      conflictingSessionName,
    } = input;
    const capturedRuntimeReady =
      hasCapturedRuntime && !runtimeIssue && !policyIssue;
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
        (instanceStatus === "ACTIVE" ||
          (session.status === "LOBBY" && instanceStatus === "PREPARING")) &&
        capturedRuntimeReady
          ? "ready"
          : "blocked",
      detail:
        session.status === "LOBBY" && instanceStatus === "PREPARING"
          ? "The Campaign Instance is ready to activate when this Session starts."
          : instanceStatus !== "ACTIVE"
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
    const gmPresent = session.participations.some(
      (p) =>
        p.role === "GM" &&
        p.response === "ACCEPTED" &&
        p.humanMembership?.status === "ACTIVE" &&
        p.presenceLeases.length > 0,
    );
    for (const participant of session.participations) {
      const controlledByGm = Boolean(
        session.gmControlsPlayers && participant.role === "PLAYER",
      );
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
        (controlledByGm
          ? gmPresent
          : participant.response === "ACCEPTED" &&
            (participant.role === "AGENT" || present));
      checks.push({
        key: `participant-${participant.id}`,
        label: participant.participantName || "Required participant",
        status: ready ? "ready" : "blocked",
        detail: ready
          ? controlledByGm
            ? `${participant.participantName} is controlled by the GM.`
            : `${participant.participantName} is ready.`
          : controlledByGm
            ? `${participant.participantName} needs an active membership, an active Character, and the GM present.`
            : participant.role === "AGENT"
              ? `${participant.participantName} must remain authorized for this Session.`
              : `${participant.participantName} must accept, be present, and have any required active Character.`,
      });
    }
    checks.push({
      key: "participant-limit",
      label: "Participant limit",
      status:
        session.participations.length <= CampaignSession.participantLimit
          ? "ready"
          : "blocked",
      detail: `${session.participations.length} of ${CampaignSession.participantLimit} participant places are selected.`,
    });
    return checks;
  }
  static canTransition = canTransitionCampaignSessionStatus;
  private constructor(data: CampaignSessionState, options?: EntityOptions) {
    super(
      "campaign-session",
      data,
      ["transitioned"],
      { mode: "runtime" },
      options,
    );
    this.validate({ mode: "runtime" });
  }
  static target(action: string): CampaignSessionStatus {
    if (!Object.hasOwn(targets, action))
      throw new TypeError("The requested Session action is not supported.");
    return targets[action as CampaignSessionAction];
  }
  static isReplay(
    status: CampaignSessionStatus,
    metadataRevision: number,
    action: string,
    expectedRevision: number,
  ): boolean {
    return (
      status === this.target(action) &&
      metadataRevision === expectedRevision + 1
    );
  }
  static assertTransition(from: CampaignSessionStatus, action: string): void {
    if (!CampaignSession.canTransition(from, this.target(action)))
      throw new TypeError(
        `A ${from} Session cannot ${action.replace("-", " ")}.`,
      );
  }
  static deserializePayload(
    value: unknown,
    options?: EntityOptions,
  ): CampaignSession {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("A Session lifecycle requires an object.");
    return new CampaignSession(value as CampaignSessionState, options);
  }
  static deserialize(value: unknown, options?: EntityOptions): CampaignSession {
    const envelope = value as Record<string, unknown> | null;
    if (
      !envelope ||
      envelope.type !== "campaign-session" ||
      envelope.schemaVersion !== 1
    )
      throw new TypeError("Unsupported Session lifecycle envelope.");
    return this.deserializePayload(envelope.data, options);
  }
  serializePayload(): CampaignSessionState {
    return this.serialize().data;
  }
  protected validateState(data: DeepReadonly<CampaignSessionState>) {
    return [
      "planned",
      "lobby",
      "active",
      "paused",
      "concluded",
      "cancelled",
    ].includes(data.status) &&
      Number.isSafeInteger(data.metadataRevision) &&
      data.metadataRevision > 0
      ? []
      : [
          {
            code: "campaign-session-lifecycle",
            message:
              "A Session requires a valid status and positive metadata revision.",
          },
        ];
  }
  protected handleCommand<K extends keyof CampaignSessionCommands>(
    name: K,
    invocation: CommandInvocation<CampaignSessionCommands[K]>,
  ): EntityTransition<CampaignSessionState, CampaignSessionEvents> {
    if (name !== "transition") throw new TypeError("Unknown Session command.");
    const { action, expectedMetadataRevision, occurredAt, runtime, reason } =
      invocation.params;
    const data = this.serializePayload();
    if (
      CampaignSession.isReplay(
        data.status,
        data.metadataRevision,
        action,
        expectedMetadataRevision,
      )
    )
      return { data };
    CampaignSession.assertTransition(data.status, action);
    if (
      !Number.isSafeInteger(expectedMetadataRevision) ||
      expectedMetadataRevision !== data.metadataRevision
    )
      throw new TypeError("Session state changed; review and retry.");
    if (!Number.isFinite(Date.parse(occurredAt)))
      throw new TypeError("Provide the Session transition time.");
    if (
      ["start", "pause", "resume", "conclude"].includes(action) &&
      (!runtime?.snapshotId ||
        !Number.isSafeInteger(runtime.revision) ||
        runtime.revision < 1)
    )
      throw new TypeError(
        "The Campaign Instance has no valid runtime boundary.",
      );
    if (action === "cancel" && !reason?.trim())
      throw new TypeError("Cancellation reason is required.");
    const sequence = (data.lastEventSequence ?? 0) + 1;
    const next: CampaignSessionState = {
      ...data,
      status: CampaignSession.target(action),
      metadataRevision: data.metadataRevision + 1,
      lastEventSequence: sequence,
    };
    if (action === "open-lobby") next.lobbyOpenedAt = occurredAt;
    if (action === "start")
      Object.assign(next, {
        startedAt: occurredAt,
        startSnapshotId: runtime!.snapshotId,
        startRuntimeRevision: runtime!.revision,
        lastRuntimeRevision: runtime!.revision,
        firstEventSequence: data.firstEventSequence || sequence,
      });
    if (action === "pause")
      Object.assign(next, {
        pausedAt: occurredAt,
        lastRuntimeRevision: runtime!.revision,
      });
    if (action === "resume")
      Object.assign(next, {
        resumedAt: occurredAt,
        lastRuntimeRevision: runtime!.revision,
      });
    if (action === "conclude")
      Object.assign(next, {
        concludedAt: occurredAt,
        endSnapshotId: runtime!.snapshotId,
        endRuntimeRevision: runtime!.revision,
        lastRuntimeRevision: runtime!.revision,
        summaryStatus: "draft",
        currentSummaryRevision: 1,
      });
    if (action === "cancel")
      Object.assign(next, {
        cancelledAt: occurredAt,
        cancellationReason: reason!.trim(),
      });
    return {
      data: next,
      events: [
        {
          name: "transitioned",
          context: { action, from: data.status, to: next.status, sequence },
        },
      ],
    };
  }
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

function canTransitionCampaignSessionStatus(
  from: CampaignSessionStatus,
  to: CampaignSessionStatus,
): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}
