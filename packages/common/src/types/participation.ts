import type { CharacterHeritageState } from "./heritage";
import type { CreatureImages } from "./creatures";
import type {
  AgentId,
  AttributeScore,
  AuthenticationProviderAssociationId,
  CampaignId,
  CampaignInstanceAgentParticipationId,
  CampaignInstanceId,
  CampaignInstanceInvitationId,
  CampaignInstanceMembershipId,
  CampaignInstanceSnapshotId,
  CampaignMembershipId,
  CharacterCreationDraftId,
  CharacterId,
  DefinitionId,
  MediaAssetId,
  NamespacedKey,
  PartialAttributeCollection,
  PlayerProfileId,
  SystemAdministratorId,
  SessionId,
  SessionParticipationId,
  StateIdentity,
  UserId,
} from "./primitives";

/** @deprecated Singleton-Campaign compatibility role. Use CampaignInstanceHumanRole. */
export type CampaignParticipantRole = "gm" | "player" | "spectator";

/** @deprecated Singleton-Campaign compatibility status. Use CampaignInstanceMembershipStatus. */
export type CampaignMembershipStatus = "active" | "banned";

/** @deprecated Compatibility shape that conflates a Campaign Definition with an Instance. */
interface CampaignMembershipBase {
  readonly identity: StateIdentity<CampaignMembershipId>;
  readonly campaignId: CampaignId;
  readonly userId: UserId;
  readonly status: CampaignMembershipStatus;
  readonly joinedAt: string;
}

/**
 * @deprecated Uses CampaignId and CampaignMembershipId. Use PlayerCampaignInstanceMembership.
 * A player membership owns its full character history, not only its current character.
 */
export interface PlayerCampaignMembership extends CampaignMembershipBase {
  readonly role: "player";
  /** All characters created through this membership, including dead and retired characters. */
  readonly characterIds: readonly CharacterId[];
  /** The character currently representing the player; absent while a replacement is being made. */
  readonly activeCharacterId?: CharacterId;
}

/** @deprecated Uses CampaignId. Use NonPlayerCampaignInstanceMembership. */
export interface NonPlayerCampaignMembership extends CampaignMembershipBase {
  readonly role: "spectator";
}

/** @deprecated Uses CampaignId. Use CampaignInstanceHumanMembership. */
export type CampaignMembership =
  PlayerCampaignMembership | NonPlayerCampaignMembership;

export type CampaignInvitationDeliveryChannel = "email" | "sms";
export type CampaignInvitationStatus =
  "pending" | "accepted" | "expired" | "revoked";

/**
 * Recipient-safe invitation data. Delivery addresses, phone numbers, plaintext
 * invitation credentials, and credential hashes are deliberately not part of
 * the shared domain resource.
 */
export interface CampaignInvitationPreview {
  readonly campaignName: string;
  readonly role: Exclude<CampaignParticipantRole, "gm">;
  readonly invitedName?: string;
  readonly status: CampaignInvitationStatus;
  readonly expiresAt: string;
}

/** A non-sensitive delivery result suitable for GM-facing invitation status. */
export interface CampaignInvitationDeliverySummary {
  readonly channel: CampaignInvitationDeliveryChannel;
  readonly status: "pending" | "sent" | "captured" | "delivered" | "failed";
  readonly lastAttemptedAt?: string;
  readonly failureMessage?: string;
}

/** Server-wide standing; independent of any Campaign Instance membership or Session attendance. */
export type PlayerServerStanding = "active" | "inactive" | "banned";

/**
 * A non-sensitive association summary. Provider subject identifiers, credentials, contact
 * methods, and recovery data belong behind a protected identity-service boundary.
 */
export interface AuthenticationProviderAssociation {
  readonly identity: StateIdentity<AuthenticationProviderAssociationId>;
  readonly userId: UserId;
  readonly playerProfileId?: PlayerProfileId;
  readonly provider: NamespacedKey;
  readonly status: "pending" | "associated" | "disabled";
  readonly associatedAt?: string;
}

/** Installation-level operator identity, independent of Game Master authority. */
export interface SystemAdministrator {
  readonly identity: StateIdentity<SystemAdministratorId>;
  readonly userId: UserId;
  readonly displayName: string;
  readonly status: "active" | "disabled";
  readonly hasEmail: boolean;
  readonly hasPhone: boolean;
  readonly createdAt: string;
}

/** Durable Player role/profile, independent of Campaign Instance participation. */
export interface PlayerProfile {
  readonly identity: StateIdentity<PlayerProfileId>;
  readonly userId: UserId;
  readonly displayName: string;
  readonly standing: PlayerServerStanding;
  readonly authenticationProviderAssociationIds: readonly AuthenticationProviderAssociationId[];
  readonly createdAt: string;
}

export type CampaignInstanceHumanRole = "gm" | "player" | "spectator";
export type CampaignInstanceMembershipStatus =
  "active" | "inactive" | "left" | "banned";

interface CampaignInstanceHumanMembershipBase {
  readonly identity: StateIdentity<CampaignInstanceMembershipId>;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly userId: UserId;
  /** Human-readable name for recipient-safe projections and validation messages. */
  readonly displayName: string;
  readonly status: CampaignInstanceMembershipStatus;
  readonly joinedAt: string;
}

/** A Player membership owns its complete, Instance-bound Character history. */
export interface PlayerCampaignInstanceMembership extends CampaignInstanceHumanMembershipBase {
  readonly role: "player";
  readonly playerProfileId: PlayerProfileId;
  readonly characterIds: readonly CharacterId[];
  readonly activeCharacterId?: CharacterId;
}

/** GM and Spectator are human Instance roles but do not own Player Character histories. */
export interface NonPlayerCampaignInstanceMembership extends CampaignInstanceHumanMembershipBase {
  readonly role: "gm" | "spectator";
}

export type CampaignInstanceHumanMembership =
  PlayerCampaignInstanceMembership | NonPlayerCampaignInstanceMembership;

export type CampaignInstanceInvitationStatus =
  "pending" | "accepted" | "expired" | "revoked";

/** Durable invitation workflow record without contact addresses, secrets, or credential hashes. */
export interface CampaignInstanceInvitation {
  readonly identity: StateIdentity<CampaignInstanceInvitationId>;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceName: string;
  readonly role: Exclude<CampaignInstanceHumanRole, "gm">;
  readonly invitedName?: string;
  readonly invitedUserId?: UserId;
  readonly status: CampaignInstanceInvitationStatus;
  readonly expiresAt: string;
  readonly acceptedMembershipId?: CampaignInstanceMembershipId;
}

/** Recipient-safe view; deliberately excludes internal IDs as well as contact and secret data. */
export interface CampaignInstanceInvitationPreview {
  readonly campaignInstanceName: string;
  readonly role: Exclude<CampaignInstanceHumanRole, "gm">;
  readonly invitedName?: string;
  readonly status: CampaignInstanceInvitationStatus;
  readonly expiresAt: string;
}

export interface AgentCapabilityGrants {
  /** Namespaced observation capabilities explicitly granted in this Instance. */
  readonly observe: readonly NamespacedKey[];
  /** Namespaced Agent-native actions explicitly granted in this Instance. */
  readonly act: readonly NamespacedKey[];
}

/**
 * A non-human process participating in one Campaign Instance. This contract intentionally has no
 * UserId, human membership ID, human role, or impersonation target. Capability implementations
 * must never mint human credentials or attribute Agent actions to a human participant.
 */
export interface CampaignInstanceAgentParticipation {
  readonly identity: StateIdentity<CampaignInstanceAgentParticipationId>;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly agentId: AgentId;
  readonly agentName: string;
  readonly participantKind: "non-human-agent";
  readonly status:
    "configured" | "authorized" | "active" | "paused" | "revoked";
  readonly capabilities: AgentCapabilityGrants;
}

/** Minimal Session ownership projection used to validate participation without copying Session. */
export interface CampaignInstanceSession {
  readonly sessionId: SessionId;
  readonly sessionName: string;
  readonly campaignInstanceId: CampaignInstanceId;
}

export type SessionHumanParticipant = {
  readonly kind: "human-membership";
  readonly membershipId: CampaignInstanceMembershipId;
  readonly participantName: string;
};

export type SessionAgentParticipant = {
  readonly kind: "agent-participation";
  readonly agentParticipationId: CampaignInstanceAgentParticipationId;
  readonly participantName: string;
};

/** Session participation has a lifecycle independent of durable Instance membership. */
export interface SessionParticipation {
  readonly identity: StateIdentity<SessionParticipationId>;
  readonly sessionId: SessionId;
  readonly sessionName: string;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly participant: SessionHumanParticipant | SessionAgentParticipant;
  readonly scheduledAt?: string;
  readonly response: "not-requested" | "pending" | "accepted" | "declined";
  readonly attendance: "pending" | "not-attended" | "attended" | "excused";
  readonly joinedAt?: string;
  readonly leftAt?: string;
  readonly acted: boolean;
}

export type CharacterImportProvenance = {
  readonly kind: "one-way-import";
  /** Provenance-only source; it creates no shared identity, synchronization, or back-transfer. */
  readonly sourceCampaignInstanceId: CampaignInstanceId;
  readonly sourceCharacterId: CharacterId;
  readonly sourceCampaignInstanceName: string;
  readonly sourceCharacterName: string;
  readonly importedAt: string;
};

/** Exactly-one-Instance association between a Character and its owning Player membership. */
export interface CampaignInstanceCharacterAssociation {
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly playerMembershipId: CampaignInstanceMembershipId;
  readonly status: "draft" | "active" | "inactive" | "retired" | "dead";
  readonly origin:
    { readonly kind: "created-in-instance" } | CharacterImportProvenance;
}

export type ParticipationConsistencyIssueCode =
  | "character-membership-missing"
  | "character-membership-not-player"
  | "character-membership-instance-mismatch"
  | "character-not-in-membership-history"
  | "membership-character-association-missing"
  | "membership-character-association-mismatch"
  | "character-import-source-not-distinct"
  | "active-character-not-in-membership-history"
  | "active-character-association-missing"
  | "active-character-association-mismatch"
  | "session-missing"
  | "session-instance-mismatch"
  | "human-participant-missing"
  | "human-participant-instance-mismatch"
  | "agent-participant-missing"
  | "agent-participant-instance-mismatch";

export interface ParticipationConsistencyIssue {
  readonly code: ParticipationConsistencyIssueCode;
  /** Human-readable subject; never an opaque identifier. */
  readonly subject: string;
  /** Human-readable explanation; never includes an opaque identifier. */
  readonly message: string;
}

export interface ParticipationConsistencyInput {
  readonly humanMemberships: readonly CampaignInstanceHumanMembership[];
  readonly agentParticipations: readonly CampaignInstanceAgentParticipation[];
  readonly characterAssociations: readonly CampaignInstanceCharacterAssociation[];
  readonly sessions: readonly CampaignInstanceSession[];
  readonly sessionParticipations: readonly SessionParticipation[];
}

export interface ParticipationConsistencyResult {
  readonly valid: boolean;
  readonly issues: readonly ParticipationConsistencyIssue[];
}

/** Pure cross-aggregate validation for DM-022 and DM-023 consistency boundaries. */
export function validateParticipationConsistency(
  input: ParticipationConsistencyInput,
): ParticipationConsistencyResult {
  const issues: ParticipationConsistencyIssue[] = [];
  const memberships = new Map(
    input.humanMemberships.map((membership) => [
      membership.identity.id,
      membership,
    ]),
  );
  const agents = new Map(
    input.agentParticipations.map((participation) => [
      participation.identity.id,
      participation,
    ]),
  );
  const characters = new Map(
    input.characterAssociations.map((association) => [
      association.characterId,
      association,
    ]),
  );
  const sessions = new Map(
    input.sessions.map((session) => [session.sessionId, session]),
  );

  for (const association of input.characterAssociations) {
    if (
      association.origin.kind === "one-way-import" &&
      association.origin.sourceCampaignInstanceId ===
        association.campaignInstanceId
    ) {
      issues.push({
        code: "character-import-source-not-distinct",
        subject: association.characterName,
        message: `${association.characterName}'s import provenance must name a different source Campaign Instance.`,
      });
    }
    const membership = memberships.get(association.playerMembershipId);
    if (!membership) {
      issues.push({
        code: "character-membership-missing",
        subject: association.characterName,
        message: `${association.characterName} has no corresponding Campaign Instance membership.`,
      });
      continue;
    }
    if (membership.role !== "player") {
      issues.push({
        code: "character-membership-not-player",
        subject: association.characterName,
        message: `${association.characterName} must be associated with a Player membership.`,
      });
      continue;
    }
    if (membership.campaignInstanceId !== association.campaignInstanceId) {
      issues.push({
        code: "character-membership-instance-mismatch",
        subject: association.characterName,
        message: `${association.characterName} and its Player membership belong to different Campaign Instances.`,
      });
    }
    if (!membership.characterIds.includes(association.characterId)) {
      issues.push({
        code: "character-not-in-membership-history",
        subject: association.characterName,
        message: `${association.characterName} is absent from its Player membership's Character history.`,
      });
    }
  }

  for (const membership of input.humanMemberships) {
    if (membership.role !== "player") continue;
    for (const characterId of membership.characterIds) {
      const association = characters.get(characterId);
      if (!association) {
        issues.push({
          code: "membership-character-association-missing",
          subject: membership.displayName,
          message: `${membership.displayName}'s Character history contains a Character without a Campaign Instance association.`,
        });
      } else if (
        association.campaignInstanceId !== membership.campaignInstanceId ||
        association.playerMembershipId !== membership.identity.id
      ) {
        issues.push({
          code: "membership-character-association-mismatch",
          subject: membership.displayName,
          message: `${membership.displayName}'s Character history contains a Character from a different Campaign Instance or Player membership.`,
        });
      }
    }
    if (!membership.activeCharacterId) continue;
    if (!membership.characterIds.includes(membership.activeCharacterId)) {
      issues.push({
        code: "active-character-not-in-membership-history",
        subject: membership.displayName,
        message: `${membership.displayName}'s active Character is absent from their Character history.`,
      });
    }
    const activeCharacter = characters.get(membership.activeCharacterId);
    if (!activeCharacter) {
      issues.push({
        code: "active-character-association-missing",
        subject: membership.displayName,
        message: `${membership.displayName}'s active Character has no Campaign Instance association.`,
      });
    } else if (
      activeCharacter.campaignInstanceId !== membership.campaignInstanceId ||
      activeCharacter.playerMembershipId !== membership.identity.id
    ) {
      issues.push({
        code: "active-character-association-mismatch",
        subject: membership.displayName,
        message: `${membership.displayName}'s active Character belongs to a different Campaign Instance or Player membership.`,
      });
    }
  }

  for (const participation of input.sessionParticipations) {
    const session = sessions.get(participation.sessionId);
    if (!session) {
      issues.push({
        code: "session-missing",
        subject: participation.sessionName,
        message: `${participation.sessionName} has participation without a corresponding Session.`,
      });
    } else if (
      session.campaignInstanceId !== participation.campaignInstanceId
    ) {
      issues.push({
        code: "session-instance-mismatch",
        subject: participation.sessionName,
        message: `${participation.sessionName} and its participation belong to different Campaign Instances.`,
      });
    }

    if (participation.participant.kind === "human-membership") {
      const membership = memberships.get(
        participation.participant.membershipId,
      );
      if (!membership) {
        issues.push({
          code: "human-participant-missing",
          subject: participation.participant.participantName,
          message: `${participation.participant.participantName} has no durable Campaign Instance membership.`,
        });
      } else if (
        membership.campaignInstanceId !== participation.campaignInstanceId
      ) {
        issues.push({
          code: "human-participant-instance-mismatch",
          subject: participation.participant.participantName,
          message: `${participation.participant.participantName}'s membership and Session participation belong to different Campaign Instances.`,
        });
      }
    } else {
      const agent = agents.get(participation.participant.agentParticipationId);
      if (!agent) {
        issues.push({
          code: "agent-participant-missing",
          subject: participation.participant.participantName,
          message: `${participation.participant.participantName} has no Campaign Instance Agent participation.`,
        });
      } else if (
        agent.campaignInstanceId !== participation.campaignInstanceId
      ) {
        issues.push({
          code: "agent-participant-instance-mismatch",
          subject: participation.participant.participantName,
          message: `${participation.participant.participantName}'s Agent authorization and Session participation belong to different Campaign Instances.`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export type CharacterCreationDraftStatus =
  "in-progress" | "ready-for-review" | "complete";

export interface CharacterCreationValidationIssue {
  /** Stable machine-readable code; application content should render a human-readable message. */
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

/** Resumable player-authored input for one already Instance-bound Character sheet. */
export interface CharacterCreationDraft {
  readonly identity: StateIdentity<CharacterCreationDraftId>;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly ownerMembershipId: CampaignInstanceMembershipId;
  /** Allocated with the draft so Character identity can never float between Instances. */
  readonly characterId: CharacterId;
  readonly status: CharacterCreationDraftStatus;
  readonly name?: string;
  readonly backgroundId?: DefinitionId;
  readonly professionId?: DefinitionId;
  readonly heritage?: CharacterHeritageState;
  /** The complete N + 2 roll set, retained so generation can be audited and resumed. */
  readonly attributeRolls?: readonly AttributeScore[];
  readonly discardedAttributeRollIndexes?: readonly [number, number];
  readonly attributeAssignments?: PartialAttributeCollection<AttributeScore>;
  /** Draft imagery may be partial; a complete CharacterState requires all three CreatureImages. */
  readonly images?: Partial<CreatureImages>;
  /** Captured Item definition to occupied slot keys; omitted items remain carried. */
  readonly equipmentAssignments?: Readonly<Record<string, readonly string[]>>;
  readonly startingEquipmentDefinitionIds?: readonly DefinitionId[];
  readonly biography?: string;
  readonly playerDeclaredCompleteAt?: string;
  readonly reviewedAt?: string;
  readonly reviewNote?: string;
  readonly validationIssues: readonly CharacterCreationValidationIssue[];
}

/**
 * Snapshot-stamped, GM-approved Character sheet materialized for one Campaign Instance.
 * This is creation output, not a fabricated complete CharacterState; runtime systems may
 * compile it with captured Profession, Heritage, Item, and Rule definitions as needed.
 */
export interface CampaignInstanceCharacterSheet {
  /** Captured acquisition results; rolled-flat grants are never rerolled on reactivation. */
  readonly modifierGrants?: readonly import("./modifiers").GrantedModifier[];
  readonly identity: StateIdentity<CharacterId>;
  readonly campaignInstanceId: CampaignInstanceId;
  readonly campaignInstanceSnapshotId: CampaignInstanceSnapshotId;
  readonly ownerMembershipId: CampaignInstanceMembershipId;
  readonly sourceDraftRevision: number;
  readonly name: string;
  readonly backgroundDefinitionId: DefinitionId;
  readonly professionDefinitionId: DefinitionId;
  readonly heritageDefinitionIds: readonly DefinitionId[];
  /** Keys are captured, extensible Attribute model identities—not a closed built-in enum. */
  readonly attributeAssignments: Readonly<Record<string, AttributeScore>>;
  /** Captured Item definition to occupied slot keys; omitted items remain carried. */
  readonly equipmentAssignments?: Readonly<Record<string, readonly string[]>>;
  readonly startingEquipmentDefinitionIds: readonly DefinitionId[];
  readonly biography?: string;
  readonly imageAssetIds: Readonly<Record<string, MediaAssetId>>;
  readonly approvedAt: string;
}
