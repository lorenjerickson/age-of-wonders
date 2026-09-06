import type {
  CampaignInstanceAgentParticipationId,
  CampaignInstanceId,
  CampaignInstanceInvitationId,
  CampaignInstanceMembershipId,
  CampaignInstancePlacementRealizationId,
  CampaignInstanceSnapshotId,
  CampaignDefinitionSnapshotId,
  CampaignDefinitionId,
  CampaignPlacementDefinitionId,
  AgentId,
  CharacterId,
  CreatureId,
  DefinitionId,
  JsonValue,
  ItemInstanceId,
  NamespacedKey,
  PlotDefinitionId,
  PlayerProfileId,
  SessionId,
  SessionParticipationId,
  WorldPlacementDefinitionId,
  WorldDefinitionId,
} from "./primitives";
import type {
  CampaignSessionStatus,
  SessionAttendanceStatus,
  SessionParticipantRole,
  SessionResponseStatus,
  SessionSummaryStatus,
} from "./session";
import type {
  CampaignInstancePreparation,
  CampaignInstanceRealizedEntity,
} from "./campaign-instance";
import type { CampaignInstanceStatus } from "./versioning";
import type {
  CampaignInstancePlotProgressStatus,
  PlotObjectiveProgressStatus,
} from "./plots";

/** Shared HTTP boundary contracts. Provider and web consumers must not redefine these shapes. */
export interface CreateCampaignInstanceRequest {
  readonly idempotencyKey: string;
  readonly name: string;
  readonly campaignDefinitionSnapshotId: CampaignDefinitionSnapshotId;
}

export interface HumanRevisionReference {
  /** Stable lineage identity for contextual routes and commands; never use as a visible label. */
  readonly definitionId: CampaignDefinitionId | WorldDefinitionId;
  readonly name: string;
  readonly revisionNumber: number;
  /** Canonical owning-authoring route; the visible link label uses name/revision. */
  readonly authoringHref: string;
}

export interface CampaignInstanceCapturedPairProjection {
  readonly snapshotId: CampaignInstanceSnapshotId;
  readonly snapshotNumber: number;
  readonly reason: "initial" | "migration" | "restore";
  readonly adoptedAt: string;
  readonly campaignDefinition: HumanRevisionReference;
  readonly worldDefinition: HumanRevisionReference;
}

export interface CampaignInstanceListItemProjection {
  readonly id: CampaignInstanceId;
  /** Stable Definition lineage used for contextual routes; never render as a visible label. */
  readonly campaignDefinitionId: CampaignDefinitionId;
  readonly name: string;
  readonly status: CampaignInstanceStatus;
  readonly metadataRevision: number;
  readonly updatedAt: string;
  readonly currentSnapshot?: CampaignInstanceCapturedPairProjection;
}

export interface CampaignInstanceListProjection {
  readonly items: readonly CampaignInstanceListItemProjection[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface CampaignInstanceRuntimeMetadataProjection {
  readonly revision: number;
  readonly updatedAt: string;
}

export interface CampaignInstanceDetailProjection extends CampaignInstanceListItemProjection {
  readonly createdAt: string;
  readonly concludedAt?: string;
  readonly archivedAt?: string;
  readonly runtime?: CampaignInstanceRuntimeMetadataProjection;
}

export type CreateCampaignInstanceResult = CampaignInstanceDetailProjection;

export interface CampaignInstanceLifecycleRequest {
  readonly expectedMetadataRevision: number;
  readonly targetStatus: CampaignInstanceStatus;
}

export interface CampaignInstanceLifecycleResult {
  readonly id: CampaignInstanceId;
  readonly name: string;
  readonly status: CampaignInstanceStatus;
  readonly metadataRevision: number;
}

export interface CampaignInstanceReadinessCheckProjection {
  readonly key: string;
  readonly label: string;
  readonly status: "ready" | "blocked" | "future";
  readonly detail: string;
}

export interface CampaignInstanceReadinessProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly readyToActivate: boolean;
  readonly checks: readonly CampaignInstanceReadinessCheckProjection[];
}

export interface CampaignInstancePreparationProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly runtimeRevision: number;
  readonly preparation: CampaignInstancePreparation;
}

export interface UpdateCampaignInstancePreparationRequest {
  readonly expectedRuntimeRevision: number;
  readonly preparation: CampaignInstancePreparation;
}

export interface CampaignInstancePlotProjection {
  readonly plotDefinitionId: PlotDefinitionId;
  readonly name: string;
  readonly parentPlotDefinitionId?: PlotDefinitionId;
  readonly parentPlotName?: string;
  readonly status: CampaignInstancePlotProgressStatus;
  readonly objectiveProgress: readonly {
    readonly objectiveId: string;
    readonly objectiveName: string;
    readonly status: PlotObjectiveProgressStatus;
    readonly notes?: string;
  }[];
  /** Full recursive runtime projection; subplots are not flattened or summary-only. */
  readonly children: readonly CampaignInstancePlotProjection[];
}

export interface CampaignInstancePlotListProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly runtimeRevision: number;
  readonly roots: readonly CampaignInstancePlotProjection[];
}

export interface UpdateCampaignInstancePlotRequest {
  readonly expectedRuntimeRevision: number;
  readonly status?: CampaignInstancePlotProgressStatus;
  readonly objectiveProgress?: readonly {
    readonly objectiveId: string;
    readonly status: PlotObjectiveProgressStatus;
    readonly notes?: string;
  }[];
  readonly revealedClaimIds?: readonly string[];
  readonly approvedOverrides?: readonly {
    readonly key: NamespacedKey;
    readonly reason: string;
    readonly value: JsonValue;
  }[];
}

export interface CampaignInstancePlacementProjection {
  readonly realizationId: CampaignInstancePlacementRealizationId;
  readonly name: string;
  readonly status: "planned" | "deferred" | "realized" | "replaced" | "removed";
  readonly sourceTypeLabel: string;
  readonly sourceName: string;
  readonly sourceLocationName: string;
  readonly currentLocationName?: string;
  readonly campaignPlacementDefinitionId?: CampaignPlacementDefinitionId;
  readonly capturedWorldPlacementDefinitionId?: WorldPlacementDefinitionId;
  readonly realizedEntity?: CampaignInstanceRealizedEntity & {
    readonly name: string;
  };
}

export interface CampaignInstancePlacementListProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly runtimeRevision: number;
  readonly items: readonly CampaignInstancePlacementProjection[];
  /** Human-labeled existing runtime entities eligible for replacement. */
  readonly replacementOptions: readonly (
    | {
        readonly kind: "existing-creature";
        readonly runtimeCreatureId: CreatureId;
        readonly name: string;
        readonly typeLabel: "Creature";
        readonly context?: string;
      }
    | {
        readonly kind: "existing-item";
        readonly runtimeItemId: ItemInstanceId;
        readonly name: string;
        readonly typeLabel: "Item";
        readonly context?: string;
      }
  )[];
  readonly totalReplacementOptions: number;
  readonly replacementOptionsTruncated: boolean;
}

export interface CampaignInstancePlacementCommandRequest {
  readonly expectedRuntimeRevision: number;
  readonly action: "realize" | "defer" | "replace" | "remove";
  readonly replacement?:
    | {
        readonly kind: "existing-creature";
        readonly runtimeCreatureId: CreatureId;
      }
    | {
        readonly kind: "existing-item";
        readonly runtimeItemId: ItemInstanceId;
      };
  readonly notes?: string;
}

export interface CampaignInstanceMutationResult {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly runtimeRevision: number;
  readonly affected: readonly {
    readonly name: string;
    readonly typeLabel: string;
  }[];
}

export interface CampaignInstanceRosterProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly memberships: readonly {
    readonly membershipId: CampaignInstanceMembershipId;
    readonly displayName: string;
    readonly role: "gm" | "player" | "spectator";
    readonly status: "active" | "inactive" | "left" | "banned";
    readonly activeCharacterName?: string;
  }[];
  readonly invitations: readonly {
    readonly invitationId: CampaignInstanceInvitationId;
    readonly invitedName?: string;
    readonly role: "player" | "spectator";
    readonly status: "pending" | "accepted" | "expired" | "revoked";
    readonly expiresAt: string;
    readonly delivery: readonly {
      readonly channel: "email" | "sms";
      readonly status: "pending" | "sent" | "captured" | "delivered" | "failed";
      readonly lastAttemptedAt?: string;
      readonly failureMessage?: string;
    }[];
  }[];
  readonly agents: readonly {
    readonly participationId: CampaignInstanceAgentParticipationId;
    readonly name: string;
    readonly status:
      "configured" | "authorized" | "active" | "paused" | "revoked";
    readonly observeCapabilities: readonly NamespacedKey[];
    readonly actCapabilities: readonly NamespacedKey[];
  }[];
  readonly characters: readonly {
    readonly characterId: CharacterId;
    readonly playerMembershipId: CampaignInstanceMembershipId;
    readonly name: string;
    readonly playerName: string;
    readonly status: "draft" | "active" | "inactive" | "retired" | "dead";
    readonly readiness: "ready" | "blocked" | "future";
  }[];
}

export interface CampaignInstanceSessionProjection {
  readonly id: SessionId;
  readonly name: string;
  readonly status: CampaignSessionStatus;
  readonly metadataRevision: number;
  readonly scheduledFor?: string;
  readonly startedAt?: string;
  readonly concludedAt?: string;
  readonly cancelledAt?: string;
  readonly participantCount: number;
}

export interface CampaignSessionParticipantProjection {
  readonly participationId: SessionParticipationId;
  readonly name: string;
  readonly role: SessionParticipantRole;
  readonly required: boolean;
  readonly response: SessionResponseStatus;
  readonly responseMessage?: string;
  readonly attendance: SessionAttendanceStatus;
  readonly firstJoinedAt?: string;
  readonly lastLeftAt?: string;
  readonly totalPresentSeconds: number;
  readonly present: boolean;
  readonly ready: boolean;
  readonly readinessDetail: string;
  readonly observeCapabilities: readonly NamespacedKey[];
  readonly actCapabilities: readonly NamespacedKey[];
}

export interface CampaignSessionDetailProjection extends CampaignInstanceSessionProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly planningNotes?: string;
  readonly lobbyOpenedAt?: string;
  readonly pausedAt?: string;
  readonly resumedAt?: string;
  readonly cancellationReason?: string;
  readonly startRuntimeRevision?: number;
  readonly lastRuntimeRevision?: number;
  readonly endRuntimeRevision?: number;
  readonly summaryStatus?: SessionSummaryStatus;
  readonly currentSummaryRevision?: number;
  readonly participants: readonly CampaignSessionParticipantProjection[];
}

export interface CreateCampaignSessionRequest {
  readonly idempotencyKey: string;
  readonly name: string;
  readonly scheduledFor?: string;
  readonly planningNotes?: string;
  /** Existing Instance memberships selected for this Session. The GM is added atomically. */
  readonly playerMembershipIds?: readonly CampaignInstanceMembershipId[];
  readonly spectatorMembershipIds?: readonly CampaignInstanceMembershipId[];
  readonly agentParticipationIds?: readonly CampaignInstanceAgentParticipationId[];
}

export interface UpdateCampaignSessionRequest {
  readonly expectedMetadataRevision: number;
  readonly name?: string;
  readonly scheduledFor?: string | null;
  readonly planningNotes?: string | null;
}

export interface UpdateCampaignSessionParticipantsRequest {
  readonly expectedMetadataRevision: number;
  readonly playerMembershipIds: readonly CampaignInstanceMembershipId[];
  readonly spectatorMembershipIds: readonly CampaignInstanceMembershipId[];
  readonly agentParticipants: readonly {
    readonly agentParticipationId: CampaignInstanceAgentParticipationId;
    readonly required: boolean;
  }[];
}

export type CampaignSessionCommand =
  | "open-lobby"
  | "close-lobby"
  | "start"
  | "pause"
  | "resume"
  | "conclude"
  | "cancel";

export interface CampaignSessionLifecycleRequest {
  readonly expectedMetadataRevision: number;
  readonly expectedRuntimeRevision?: number;
  readonly readinessToken?: string;
  readonly reason?: string;
}

export interface CampaignSessionReadinessProjection {
  readonly campaignInstanceName: string;
  readonly sessionName: string;
  readonly ready: boolean;
  readonly runtimeRevision: number;
  readonly token: string;
  readonly checks: readonly CampaignInstanceReadinessCheckProjection[];
}

export interface CampaignSessionSummaryProjection {
  readonly sessionName: string;
  readonly revision: number;
  readonly status: SessionSummaryStatus;
  readonly eventSequenceThrough: number;
  readonly narrative: string;
  readonly privateGmNotes?: string;
  readonly createdByName: string;
  readonly createdAt: string;
  readonly approvedAt?: string;
}

export interface UpdateCampaignSessionSummaryRequest {
  readonly expectedSessionRevision: number;
  readonly narrative: string;
  readonly privateGmNotes?: string;
}

export interface CampaignInstanceSessionListProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly current: readonly CampaignInstanceSessionProjection[];
  readonly planned: readonly CampaignInstanceSessionProjection[];
  readonly history: readonly CampaignInstanceSessionProjection[];
  readonly total: number;
}

export interface CampaignInstanceCreatureEmbodimentProjection {
  readonly runtimeCreatureId: CreatureId;
  readonly name: string;
  readonly sourceTypeLabel: string;
  readonly sourceName: string;
  readonly policyLabel: string;
  readonly policyDefaulted: boolean;
  readonly currentLocationName?: string;
}

export interface CampaignInstanceCreatureEmbodimentListProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly runtimeRevision: number;
  readonly items: readonly CampaignInstanceCreatureEmbodimentProjection[];
}

export interface CreateCampaignInstanceInvitationRequest {
  readonly invitedName: string;
  readonly role: "player" | "spectator";
  /** Explicit existing Player selection; never inferred from contact values. */
  readonly playerId?: PlayerProfileId;
  readonly email?: string;
  readonly phone?: string;
}

export interface CampaignInstanceInvitationCommandResult {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly invitation: {
    readonly id: CampaignInstanceInvitationId;
    readonly invitedName: string;
    readonly role: "player" | "spectator";
    readonly status: "pending" | "accepted" | "expired" | "revoked";
    readonly expiresAt: string;
  };
  readonly deliveries: readonly {
    readonly channel: "email" | "sms";
    readonly status: "sent" | "captured" | "failed";
  }[];
}

export interface CampaignInstanceInvitationActionResult {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly invitationName: string;
  readonly status: "revoked";
}

export interface ChangeCampaignInstanceMembershipStatusRequest {
  readonly expectedStatus: "active" | "inactive" | "left" | "banned";
  readonly targetStatus: "active" | "inactive" | "left" | "banned";
}

export interface CreateCampaignInstanceCharacterRequest {
  readonly name: string;
  readonly playerMembershipId: CampaignInstanceMembershipId;
}

export interface PlayerCampaignInstanceCharacterDraftProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly characterId: CharacterId;
  readonly revision: number;
  readonly status: "in-progress" | "ready-for-review" | "complete";
  readonly name?: string;
  readonly backgroundDefinitionId?: DefinitionId;
  readonly professionDefinitionId?: DefinitionId;
  readonly heritageDefinitionIds: readonly DefinitionId[];
  readonly attributeRolls: readonly number[];
  readonly attributeAssignments: Readonly<Record<string, number>>;
  readonly startingEquipmentIds: readonly DefinitionId[];
  readonly biography?: string;
  readonly imageAssetIds: Readonly<Record<string, string>>;
  readonly updatedAt: string;
}

export interface PlayerCampaignInstanceCharacterDraftListProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly items: readonly PlayerCampaignInstanceCharacterDraftProjection[];
  readonly total: number;
}

export interface CreatePlayerCampaignInstanceCharacterRequest {
  readonly name?: string;
}

export interface UpdatePlayerCampaignInstanceCharacterDraftRequest {
  readonly expectedRevision: number;
  readonly name?: string;
  readonly backgroundDefinitionId?: DefinitionId;
  readonly professionDefinitionId?: DefinitionId;
  readonly heritageDefinitionIds?: readonly DefinitionId[];
  readonly attributeAssignments?: Readonly<Record<string, number>>;
  readonly startingEquipmentIds?: readonly DefinitionId[];
  readonly biography?: string;
  readonly imageAssetIds?: Readonly<Record<string, string>>;
}

export interface PlayerCharacterCreationOptionsProjection {
  readonly backgrounds: readonly CharacterCreationOptionProjection[];
  readonly professions: readonly CharacterCreationOptionProjection[];
  readonly heritages: readonly CharacterCreationOptionProjection[];
  readonly maximumHeritages: number;
}

export interface CharacterCreationOptionProjection {
  readonly id: DefinitionId;
  readonly name: string;
  readonly description?: string;
}

export interface ChangeCampaignInstanceCharacterStatusRequest {
  readonly expectedStatus: "draft" | "active" | "inactive" | "retired" | "dead";
  readonly targetStatus: "draft" | "active" | "inactive" | "retired" | "dead";
}

export interface SelectCampaignInstanceCharacterRequest {
  readonly characterId: CharacterId;
}

export interface ImportCampaignInstanceCharacterRequest {
  readonly sourceCampaignDefinitionId: CampaignDefinitionId;
  readonly sourceCampaignInstanceId: CampaignInstanceId;
  readonly sourceCharacterId: CharacterId;
  readonly playerMembershipId: CampaignInstanceMembershipId;
  readonly name?: string;
}

export type CampaignInstanceInvitationRetryResult =
  CampaignInstanceInvitationCommandResult;

export interface ConfigureCampaignInstanceAgentRequest {
  readonly agentId: AgentId;
  readonly observe: readonly NamespacedKey[];
  readonly act: readonly NamespacedKey[];
}

export interface CampaignInstanceAvailableAgentProjection {
  readonly agentId: AgentId;
  readonly name: string;
  readonly status: "active" | "disabled";
}

export interface CampaignInstanceAvailableAgentListProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly items: readonly CampaignInstanceAvailableAgentProjection[];
  readonly total: number;
}

export interface UpdateCampaignInstanceAgentStatusRequest {
  readonly expectedStatus: "configured" | "authorized" | "active" | "paused";
  readonly status: "authorized" | "paused" | "revoked";
}

export interface CampaignInstanceAgentCommandResult {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly participationId: CampaignInstanceAgentParticipationId;
  readonly agentName: string;
  readonly status:
    "configured" | "authorized" | "active" | "paused" | "revoked";
  readonly observeCapabilities: readonly NamespacedKey[];
  readonly actCapabilities: readonly NamespacedKey[];
}

export interface CampaignInstanceContinuationProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly kind:
    "continue" | "resume" | "open-planned" | "choose" | "plan-session";
  readonly label:
    | "Continue"
    | "Resume"
    | "Open Session"
    | "Choose Session"
    | "Plan a Session";
  readonly enabled: boolean;
  readonly detail: string;
  readonly session?: { readonly id: SessionId; readonly name: string };
}

export interface CampaignInstanceVersionProjection {
  readonly snapshotId: CampaignInstanceSnapshotId;
  readonly snapshotNumber: number;
  readonly reason: "initial" | "migration" | "restore";
  readonly adoptedAt: string;
  readonly campaignDefinition: HumanRevisionReference;
  readonly worldDefinition: HumanRevisionReference;
  readonly current: boolean;
}

export interface CampaignInstanceVersionListProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly items: readonly CampaignInstanceVersionProjection[];
  /** Direct-successor choices; labels are sufficient to render without another lookup. */
  readonly migrationTargets: readonly CampaignInstanceMigrationTargetProjection[];
  /** Direct predecessor of the current snapshot, when a recoverable restore is possible. */
  readonly restoreTarget?: CampaignInstanceVersionProjection;
  readonly migrationAvailable: boolean;
  readonly migrationBlockedReason?: string;
}

export interface CampaignInstanceMigrationTargetProjection {
  readonly campaignDefinitionSnapshotId: CampaignDefinitionSnapshotId;
  readonly campaignDefinition: HumanRevisionReference;
  readonly worldDefinition: HumanRevisionReference;
}

export interface CampaignInstanceMigrationMappingRequest {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface CampaignInstanceMigrationPreviewRequest {
  readonly sourceSnapshotId: CampaignInstanceSnapshotId;
  readonly targetCampaignDefinitionSnapshotId: CampaignDefinitionSnapshotId;
  readonly expectedRuntimeRevision: number;
  readonly mappings?: readonly CampaignInstanceMigrationMappingRequest[];
  readonly changeOffset?: number;
  readonly changeLimit?: number;
  readonly conflictOffset?: number;
  readonly conflictLimit?: number;
  readonly candidateOffset?: number;
  readonly candidateLimit?: number;
}

export interface CampaignInstanceMigrationPreviewProjection {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly kind: "migration" | "restore";
  readonly source: CampaignInstanceVersionProjection;
  readonly target: Omit<
    CampaignInstanceVersionProjection,
    "snapshotId" | "snapshotNumber" | "reason" | "adoptedAt" | "current"
  >;
  readonly planHash: string;
  readonly expectedRuntimeRevision: number;
  readonly ready: boolean;
  readonly conflicts: readonly {
    readonly key: string;
    readonly resourceType: string;
    /** Opaque source value for a mapping command; never render this field. */
    readonly sourceId?: string;
    readonly subjectName: string;
    readonly typeLabel: string;
    readonly detail: string;
    readonly mappingRequired: boolean;
  }[];
  readonly mappingCandidates: readonly {
    readonly conflictKey: string;
    readonly resourceType: string;
    /** Opaque option value; render targetName and targetTypeLabel instead. */
    readonly sourceId: string;
    /** Opaque option value; render targetName and targetTypeLabel instead. */
    readonly targetId: string;
    readonly targetName: string;
    readonly targetTypeLabel: string;
    readonly context?: string;
  }[];
  readonly changes: readonly {
    readonly subjectName: string;
    readonly typeLabel: string;
    readonly change: "added" | "changed" | "removed";
    readonly context?: string;
  }[];
  readonly totalChanges: number;
  readonly changeOffset: number;
  readonly changeLimit: number;
  readonly nextChangeOffset?: number;
  readonly totalConflicts: number;
  readonly conflictOffset: number;
  readonly conflictLimit: number;
  readonly nextConflictOffset?: number;
  readonly totalMappingCandidates: number;
  readonly candidateOffset: number;
  readonly candidateLimit: number;
  readonly nextCandidateOffset?: number;
}

export interface ApplyCampaignInstanceMigrationRequest {
  readonly sourceSnapshotId: CampaignInstanceSnapshotId;
  readonly targetCampaignDefinitionSnapshotId: CampaignDefinitionSnapshotId;
  readonly expectedRuntimeRevision: number;
  readonly planHash: string;
  readonly mappings: readonly CampaignInstanceMigrationMappingRequest[];
}

export interface CampaignInstanceMigrationResult {
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly kind: "migration" | "restore";
  readonly snapshot: CampaignInstanceVersionProjection;
  readonly runtimeRevision: number;
}

export interface CampaignInstanceRestorePreviewRequest {
  readonly sourceSnapshotId: CampaignInstanceSnapshotId;
  /** The direct predecessor Instance snapshot whose captured pair will be adopted anew. */
  readonly targetInstanceSnapshotId: CampaignInstanceSnapshotId;
  readonly expectedRuntimeRevision: number;
  readonly mappings?: readonly CampaignInstanceMigrationMappingRequest[];
  readonly changeOffset?: number;
  readonly changeLimit?: number;
  readonly conflictOffset?: number;
  readonly conflictLimit?: number;
  readonly candidateOffset?: number;
  readonly candidateLimit?: number;
}

export interface ApplyCampaignInstanceRestoreRequest {
  readonly sourceSnapshotId: CampaignInstanceSnapshotId;
  readonly targetInstanceSnapshotId: CampaignInstanceSnapshotId;
  readonly expectedRuntimeRevision: number;
  readonly planHash: string;
  readonly mappings: readonly CampaignInstanceMigrationMappingRequest[];
}
