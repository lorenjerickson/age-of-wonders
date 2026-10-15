import type {
  ParticipationConsistencyInput,
  ParticipationConsistencyResult,
  ParticipationConsistencyIssue,
} from "@aow/common";
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
