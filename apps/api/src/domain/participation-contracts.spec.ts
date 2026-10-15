import { InstanceParticipation as ParticipationOwner } from "@aow/domain";
import type {
  AgentId,
  CampaignInstanceAgentParticipationId,
  CampaignInstanceId,
  CampaignInstanceMembershipId,
  CharacterId,
  PlayerProfileId,
  SessionId,
  SessionParticipationId,
  UserId,
} from "@aow/common";
import {
  type CampaignInstanceAgentParticipation,
  type CampaignInstanceCharacterAssociation,
  type CampaignInstanceHumanMembership,
  type CampaignInstanceInvitationPreview,
  type CampaignInstanceSession,
  type SessionParticipation,
} from "@aow/common";

const id = <Value extends string>(value: string) => value as Value;

const instanceA = id<CampaignInstanceId>("instance-a");
const instanceB = id<CampaignInstanceId>("instance-b");
const playerMembershipId = id<CampaignInstanceMembershipId>("member-player");
const agentParticipationId = id<CampaignInstanceAgentParticipationId>(
  "agent-participation",
);
const characterId = id<CharacterId>("character-a");
const sessionId = id<SessionId>("session-a");

const playerMembership: CampaignInstanceHumanMembership = {
  identity: {
    id: playerMembershipId,
    version: { revision: 1, updatedAt: "2026-09-04T12:00:00Z" },
  },
  campaignInstanceId: instanceA,
  userId: id<UserId>("person-a"),
  displayName: "Ari",
  role: "player",
  playerProfileId: id<PlayerProfileId>("profile-a"),
  status: "active",
  joinedAt: "2026-09-04T12:00:00Z",
  characterIds: [characterId],
  activeCharacterId: characterId,
};

const character: CampaignInstanceCharacterAssociation = {
  characterId,
  characterName: "Kestrel",
  campaignInstanceId: instanceA,
  playerMembershipId,
  status: "active",
  origin: { kind: "created-in-instance" },
};

const session: CampaignInstanceSession = {
  sessionId,
  sessionName: "The Vault Opens",
  campaignInstanceId: instanceA,
};

const agentParticipation: CampaignInstanceAgentParticipation = {
  identity: {
    id: agentParticipationId,
    version: { revision: 1, updatedAt: "2026-09-04T12:00:00Z" },
  },
  campaignInstanceId: instanceA,
  agentId: id<AgentId>("agent-a"),
  agentName: "Chronicler",
  participantKind: "non-human-agent",
  status: "active",
  capabilities: {
    observe: ["aow:event-stream"],
    act: ["aow:draft-narrative"],
  },
};

function sessionParticipation(
  participant: SessionParticipation["participant"],
  campaignInstanceId = instanceA,
): SessionParticipation {
  return {
    identity: {
      id: id<SessionParticipationId>(
        `session-participation-${participant.kind}`,
      ),
      version: { revision: 1, updatedAt: "2026-09-04T12:00:00Z" },
    },
    sessionId,
    sessionName: session.sessionName,
    campaignInstanceId,
    participant,
    scheduledAt: "2026-09-04T12:30:00Z",
    response: "accepted",
    attendance: "attended",
    joinedAt: "2026-09-04T13:00:00Z",
    leftAt: "2026-09-04T16:00:00Z",
    acted: true,
  };
}

describe("validateParticipationConsistency", () => {
  it("keeps recipient-safe invitations and Agents free of human credentials", () => {
    const invitation = {
      campaignInstanceName: "Vault Expedition",
      role: "player",
      invitedName: "Ari",
      status: "pending",
      expiresAt: "2026-09-11T12:00:00Z",
    } satisfies CampaignInstanceInvitationPreview;

    const unsafeInvitation = {
      ...invitation,
      // @ts-expect-error Contact addresses are not part of recipient-safe shared projections.
      email: "private@example.invalid",
    } satisfies CampaignInstanceInvitationPreview;

    const impersonatingAgent = {
      ...agentParticipation,
      // @ts-expect-error A non-human Agent participation cannot carry a human identity.
      userId: id<UserId>("person-a"),
    } satisfies CampaignInstanceAgentParticipation;

    expect(invitation.campaignInstanceName).toBe("Vault Expedition");
    expect(unsafeInvitation.email).toBeDefined();
    expect(impersonatingAgent.userId).toBeDefined();
  });

  it("accepts same-Instance memberships, characters, Sessions, and Agents", () => {
    const result = ParticipationOwner.validateConsistency({
      humanMemberships: [playerMembership],
      agentParticipations: [agentParticipation],
      characterAssociations: [character],
      sessions: [session],
      sessionParticipations: [
        sessionParticipation({
          kind: "human-membership",
          membershipId: playerMembershipId,
          participantName: "Ari",
        }),
        sessionParticipation({
          kind: "agent-participation",
          agentParticipationId,
          participantName: "Chronicler",
        }),
      ],
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("rejects a Character associated with a membership from another Instance", () => {
    const result = ParticipationOwner.validateConsistency({
      humanMemberships: [playerMembership],
      agentParticipations: [],
      characterAssociations: [{ ...character, campaignInstanceId: instanceB }],
      sessions: [],
      sessionParticipations: [],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "character-membership-instance-mismatch",
    );
    expect(result.issues[0]?.message).toContain("Kestrel");
    expect(result.issues[0]?.message).not.toMatch(/instance-a|instance-b/);
  });

  it("rejects Session participation through a membership or Agent from another Instance", () => {
    const result = ParticipationOwner.validateConsistency({
      humanMemberships: [playerMembership],
      agentParticipations: [agentParticipation],
      characterAssociations: [character],
      sessions: [session],
      sessionParticipations: [
        sessionParticipation(
          {
            kind: "human-membership",
            membershipId: playerMembershipId,
            participantName: "Ari",
          },
          instanceB,
        ),
        sessionParticipation(
          {
            kind: "agent-participation",
            agentParticipationId,
            participantName: "Chronicler",
          },
          instanceB,
        ),
      ],
    });

    expect(result.issues.map((issue) => issue.code)).toEqual([
      "session-instance-mismatch",
      "human-participant-instance-mismatch",
      "session-instance-mismatch",
      "agent-participant-instance-mismatch",
    ]);
    expect(result.issues.map((issue) => issue.message).join(" ")).not.toMatch(
      /instance-a|instance-b|member-player|agent-participation/,
    );
  });

  it("rejects active Characters outside the Player membership's association history", () => {
    const result = ParticipationOwner.validateConsistency({
      humanMemberships: [
        {
          ...playerMembership,
          activeCharacterId: id<CharacterId>("missing-character"),
        },
      ],
      agentParticipations: [],
      characterAssociations: [character],
      sessions: [],
      sessionParticipations: [],
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      "active-character-not-in-membership-history",
    );
    expect(result.issues.map((issue) => issue.code)).toContain(
      "active-character-association-missing",
    );
  });

  it("rejects missing or mismatched associations anywhere in Character history", () => {
    const missingCharacter = id<CharacterId>("missing-history-character");
    const wrongMembership = id<CampaignInstanceMembershipId>("other-player");
    const result = ParticipationOwner.validateConsistency({
      humanMemberships: [
        {
          ...playerMembership,
          characterIds: [characterId, missingCharacter],
          activeCharacterId: undefined,
        },
      ],
      agentParticipations: [],
      characterAssociations: [
        { ...character, playerMembershipId: wrongMembership },
      ],
      sessions: [],
      sessionParticipations: [],
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "membership-character-association-missing",
        "membership-character-association-mismatch",
      ]),
    );
    expect(result.issues.map((issue) => issue.message).join(" ")).not.toMatch(
      /missing-history-character|other-player|member-player/,
    );
  });

  it("rejects import provenance that points back to the destination Instance", () => {
    const result = ParticipationOwner.validateConsistency({
      humanMemberships: [playerMembership],
      agentParticipations: [],
      characterAssociations: [
        {
          ...character,
          origin: {
            kind: "one-way-import",
            sourceCampaignInstanceId: instanceA,
            sourceCharacterId: id<CharacterId>("source-character"),
            sourceCampaignInstanceName: "Vault Expedition",
            sourceCharacterName: "Earlier Kestrel",
            importedAt: "2026-09-04T11:00:00Z",
          },
        },
      ],
      sessions: [],
      sessionParticipations: [],
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      "character-import-source-not-distinct",
    );
    expect(result.issues.map((issue) => issue.message).join(" ")).not.toMatch(
      /instance-a|source-character/,
    );
  });
});
