import type { CharacterHeritageState } from "./heritage";
import type { CreatureImages } from "./creatures";
import type {
  AttributeScore,
  CampaignId,
  CampaignMembershipId,
  CharacterCreationDraftId,
  CharacterId,
  DefinitionId,
  PartialAttributeCollection,
  StateIdentity,
  UserId,
} from "./primitives";

/** Roles a person may hold in the singleton campaign. */
export type CampaignParticipantRole = "gm" | "player" | "spectator";

export type CampaignMembershipStatus = "active" | "banned";

interface CampaignMembershipBase {
  readonly identity: StateIdentity<CampaignMembershipId>;
  readonly campaignId: CampaignId;
  readonly userId: UserId;
  readonly status: CampaignMembershipStatus;
  readonly joinedAt: string;
}

/** A player membership owns its full character history, not only its current character. */
export interface PlayerCampaignMembership extends CampaignMembershipBase {
  readonly role: "player";
  /** All characters created through this membership, including dead and retired characters. */
  readonly characterIds: readonly CharacterId[];
  /** The character currently representing the player; absent while a replacement is being made. */
  readonly activeCharacterId?: CharacterId;
}

export interface NonPlayerCampaignMembership extends CampaignMembershipBase {
  readonly role: "spectator";
}

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

export type CharacterCreationDraftStatus =
  "in-progress" | "ready-for-review" | "complete";

export interface CharacterCreationValidationIssue {
  /** Stable machine-readable code; application content should render a human-readable message. */
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

/** Resumable player-authored input used to create one CharacterState. */
export interface CharacterCreationDraft {
  readonly identity: StateIdentity<CharacterCreationDraftId>;
  readonly campaignId: CampaignId;
  readonly ownerMembershipId: CampaignMembershipId;
  /** Populated once a creature-backed character aggregate has been allocated. */
  readonly characterId?: CharacterId;
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
  readonly startingEquipmentDefinitionIds?: readonly DefinitionId[];
  readonly biography?: string;
  readonly playerDeclaredCompleteAt?: string;
  readonly validationIssues: readonly CharacterCreationValidationIssue[];
}
