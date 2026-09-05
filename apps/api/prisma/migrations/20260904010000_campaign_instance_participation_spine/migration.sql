-- CreateEnum
CREATE TYPE "PlayerServerStanding" AS ENUM ('ACTIVE', 'INACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "AuthenticationProviderAssociationStatus" AS ENUM ('PENDING', 'ASSOCIATED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CampaignInstanceHumanRole" AS ENUM ('GM', 'PLAYER', 'SPECTATOR');

-- CreateEnum
CREATE TYPE "CampaignInstanceMembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LEFT', 'BANNED');

-- CreateEnum
CREATE TYPE "CampaignInstanceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AgentIdentityStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CampaignInstanceAgentParticipationStatus" AS ENUM ('CONFIGURED', 'AUTHORIZED', 'ACTIVE', 'PAUSED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CampaignInstanceSessionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'CONCLUDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionResponseStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SessionAttendanceStatus" AS ENUM ('PENDING', 'NOT_ATTENDED', 'ATTENDED', 'EXCUSED');

-- CreateEnum
CREATE TYPE "CampaignInstanceCharacterStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'RETIRED', 'DEAD');

-- CreateEnum
CREATE TYPE "CharacterAssociationOrigin" AS ENUM ('CREATED_IN_INSTANCE', 'ONE_WAY_IMPORT');

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "standing" "PlayerServerStanding" NOT NULL DEFAULT 'ACTIVE',
    "emailEncrypted" TEXT,
    "emailHash" TEXT,
    "phoneEncrypted" TEXT,
    "phoneHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthenticationProviderAssociation" (
    "id" TEXT NOT NULL,
    "playerProfileId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerSubjectHash" TEXT NOT NULL,
    "providerSubjectEncrypted" TEXT,
    "credentialReference" TEXT,
    "status" "AuthenticationProviderAssociationStatus" NOT NULL DEFAULT 'PENDING',
    "associatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthenticationProviderAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentIdentity" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AgentIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "configurationReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInstanceHumanMembership" (
    "id" TEXT NOT NULL,
    "campaignInstanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerProfileId" TEXT,
    "displayName" TEXT NOT NULL,
    "role" "CampaignInstanceHumanRole" NOT NULL,
    "status" "CampaignInstanceMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeCharacterId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignInstanceHumanMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInstanceInvitation" (
    "id" TEXT NOT NULL,
    "campaignInstanceId" TEXT NOT NULL,
    "role" "CampaignInstanceHumanRole" NOT NULL,
    "invitedName" TEXT,
    "invitedUserId" TEXT,
    "emailEncrypted" TEXT,
    "emailHash" TEXT,
    "phoneEncrypted" TEXT,
    "phoneHash" TEXT,
    "tokenHash" TEXT NOT NULL,
    "deliveryReference" TEXT,
    "status" "CampaignInstanceInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedMembershipId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignInstanceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInstanceAgentParticipation" (
    "id" TEXT NOT NULL,
    "campaignInstanceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "participantKind" TEXT NOT NULL DEFAULT 'non-human-agent',
    "status" "CampaignInstanceAgentParticipationStatus" NOT NULL DEFAULT 'CONFIGURED',
    "observeCapabilities" JSONB NOT NULL DEFAULT '[]',
    "actCapabilities" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignInstanceAgentParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInstanceSession" (
    "id" TEXT NOT NULL,
    "campaignInstanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignInstanceSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "concludedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "eventLog" JSONB NOT NULL DEFAULT '[]',
    "summary" JSONB,
    "extensions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignInstanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionParticipation" (
    "id" TEXT NOT NULL,
    "campaignInstanceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "humanMembershipId" TEXT,
    "agentParticipationId" TEXT,
    "participantName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "response" "SessionResponseStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "attendance" "SessionAttendanceStatus" NOT NULL DEFAULT 'PENDING',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "acted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInstanceCharacterAssociation" (
    "characterId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "campaignInstanceId" TEXT NOT NULL,
    "playerMembershipId" TEXT NOT NULL,
    "playerMembershipRole" "CampaignInstanceHumanRole" NOT NULL DEFAULT 'PLAYER',
    "status" "CampaignInstanceCharacterStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "CharacterAssociationOrigin" NOT NULL DEFAULT 'CREATED_IN_INSTANCE',
    "sourceCampaignInstanceId" TEXT,
    "sourceCharacterId" TEXT,
    "sourceCampaignInstanceName" TEXT,
    "sourceCharacterName" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignInstanceCharacterAssociation_pkey" PRIMARY KEY ("characterId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

-- CreateIndex
CREATE INDEX "PlayerProfile_standing_displayName_idx" ON "PlayerProfile"("standing", "displayName");

-- CreateIndex
CREATE INDEX "PlayerProfile_emailHash_idx" ON "PlayerProfile"("emailHash");

-- CreateIndex
CREATE INDEX "PlayerProfile_phoneHash_idx" ON "PlayerProfile"("phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_id_userId_key" ON "PlayerProfile"("id", "userId");

-- CreateIndex
CREATE INDEX "AuthenticationProviderAssociation_playerProfileId_status_idx" ON "AuthenticationProviderAssociation"("playerProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationProviderAssociation_providerKey_providerSubje_key" ON "AuthenticationProviderAssociation"("providerKey", "providerSubjectHash");

-- CreateIndex
CREATE INDEX "AgentIdentity_ownerUserId_status_idx" ON "AgentIdentity"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "AgentIdentity_name_idx" ON "AgentIdentity"("name");

-- CreateIndex
CREATE INDEX "CampaignInstanceHumanMembership_playerProfileId_status_idx" ON "CampaignInstanceHumanMembership"("playerProfileId", "status");

-- CreateIndex
CREATE INDEX "CampaignInstanceHumanMembership_campaignInstanceId_role_sta_idx" ON "CampaignInstanceHumanMembership"("campaignInstanceId", "role", "status");

-- CreateIndex
CREATE INDEX "CampaignInstanceHumanMembership_activeCharacterId_idx" ON "CampaignInstanceHumanMembership"("activeCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceHumanMembership_campaignInstanceId_userId_key" ON "CampaignInstanceHumanMembership"("campaignInstanceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceHumanMembership_campaignInstanceId_id_key" ON "CampaignInstanceHumanMembership"("campaignInstanceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceHumanMembership_campaignInstanceId_id_role_key" ON "CampaignInstanceHumanMembership"("campaignInstanceId", "id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceHumanMembership_campaignInstanceId_id_activ_key" ON "CampaignInstanceHumanMembership"("campaignInstanceId", "id", "activeCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceInvitation_tokenHash_key" ON "CampaignInstanceInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "CampaignInstanceInvitation_campaignInstanceId_status_idx" ON "CampaignInstanceInvitation"("campaignInstanceId", "status");

-- CreateIndex
CREATE INDEX "CampaignInstanceInvitation_campaignInstanceId_emailHash_idx" ON "CampaignInstanceInvitation"("campaignInstanceId", "emailHash");

-- CreateIndex
CREATE INDEX "CampaignInstanceInvitation_campaignInstanceId_phoneHash_idx" ON "CampaignInstanceInvitation"("campaignInstanceId", "phoneHash");

-- CreateIndex
CREATE INDEX "CampaignInstanceInvitation_invitedUserId_status_idx" ON "CampaignInstanceInvitation"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "CampaignInstanceInvitation_expiresAt_idx" ON "CampaignInstanceInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "CampaignInstanceAgentParticipation_campaignInstanceId_statu_idx" ON "CampaignInstanceAgentParticipation"("campaignInstanceId", "status");

-- CreateIndex
CREATE INDEX "CampaignInstanceAgentParticipation_agentId_status_idx" ON "CampaignInstanceAgentParticipation"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceAgentParticipation_campaignInstanceId_agent_key" ON "CampaignInstanceAgentParticipation"("campaignInstanceId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceAgentParticipation_campaignInstanceId_id_key" ON "CampaignInstanceAgentParticipation"("campaignInstanceId", "id");

-- CreateIndex
CREATE INDEX "CampaignInstanceSession_campaignInstanceId_status_scheduled_idx" ON "CampaignInstanceSession"("campaignInstanceId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "CampaignInstanceSession_status_updatedAt_idx" ON "CampaignInstanceSession"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceSession_campaignInstanceId_id_key" ON "CampaignInstanceSession"("campaignInstanceId", "id");

-- CreateIndex
CREATE INDEX "SessionParticipation_campaignInstanceId_sessionId_idx" ON "SessionParticipation"("campaignInstanceId", "sessionId");

-- CreateIndex
CREATE INDEX "SessionParticipation_campaignInstanceId_humanMembershipId_idx" ON "SessionParticipation"("campaignInstanceId", "humanMembershipId");

-- CreateIndex
CREATE INDEX "SessionParticipation_campaignInstanceId_agentParticipationI_idx" ON "SessionParticipation"("campaignInstanceId", "agentParticipationId");

-- CreateIndex
CREATE INDEX "SessionParticipation_sessionId_attendance_idx" ON "SessionParticipation"("sessionId", "attendance");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipation_sessionId_humanMembershipId_key" ON "SessionParticipation"("sessionId", "humanMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipation_sessionId_agentParticipationId_key" ON "SessionParticipation"("sessionId", "agentParticipationId");

-- CreateIndex
CREATE INDEX "CampaignInstanceCharacterAssociation_campaignInstanceId_pla_idx" ON "CampaignInstanceCharacterAssociation"("campaignInstanceId", "playerMembershipId", "status");

-- CreateIndex
CREATE INDEX "CampaignInstanceCharacterAssociation_sourceCampaignInstance_idx" ON "CampaignInstanceCharacterAssociation"("sourceCampaignInstanceId", "sourceCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceCharacterAssociation_campaignInstanceId_cha_key" ON "CampaignInstanceCharacterAssociation"("campaignInstanceId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInstanceCharacterAssociation_campaignInstanceId_pla_key" ON "CampaignInstanceCharacterAssociation"("campaignInstanceId", "playerMembershipId", "characterId");

-- RenameForeignKey
ALTER TABLE "CampaignDefinitionRevision" RENAME CONSTRAINT "CampaignDefinitionRevision_campaignDefinitionId_predecessor_fke" TO "CampaignDefinitionRevision_campaignDefinitionId_predecesso_fkey";

-- RenameForeignKey
ALTER TABLE "CampaignInstanceRuntime" RENAME CONSTRAINT "CampaignInstanceRuntime_campaignInstanceId_campaignInst_fkey" TO "CampaignInstanceRuntime_campaignInstanceId_campaignInstanc_fkey";

-- RenameForeignKey
ALTER TABLE "CampaignInstanceSnapshot" RENAME CONSTRAINT "CampaignInstanceSnapshot_campaignInstanceId_predecessor_fkey" TO "CampaignInstanceSnapshot_campaignInstanceId_predecessorSna_fkey";

-- RenameForeignKey
ALTER TABLE "WorldDefinitionRevision" RENAME CONSTRAINT "WorldDefinitionRevision_worldDefinitionId_predecessorRevisionId" TO "WorldDefinitionRevision_worldDefinitionId_predecessorRevis_fkey";

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticationProviderAssociation" ADD CONSTRAINT "AuthenticationProviderAssociation_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceHumanMembership" ADD CONSTRAINT "CampaignInstanceHumanMembership_campaignInstanceId_fkey" FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceHumanMembership" ADD CONSTRAINT "CampaignInstanceHumanMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceHumanMembership" ADD CONSTRAINT "CampaignInstanceHumanMembership_playerProfileId_userId_fkey" FOREIGN KEY ("playerProfileId", "userId") REFERENCES "PlayerProfile"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceHumanMembership" ADD CONSTRAINT "CampaignInstanceHumanMembership_campaignInstanceId_id_acti_fkey" FOREIGN KEY ("campaignInstanceId", "id", "activeCharacterId") REFERENCES "CampaignInstanceCharacterAssociation"("campaignInstanceId", "playerMembershipId", "characterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceInvitation" ADD CONSTRAINT "CampaignInstanceInvitation_campaignInstanceId_fkey" FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceInvitation" ADD CONSTRAINT "CampaignInstanceInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceInvitation" ADD CONSTRAINT "CampaignInstanceInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceInvitation" ADD CONSTRAINT "CampaignInstanceInvitation_campaignInstanceId_acceptedMemb_fkey" FOREIGN KEY ("campaignInstanceId", "acceptedMembershipId", "role") REFERENCES "CampaignInstanceHumanMembership"("campaignInstanceId", "id", "role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceAgentParticipation" ADD CONSTRAINT "CampaignInstanceAgentParticipation_campaignInstanceId_fkey" FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceAgentParticipation" ADD CONSTRAINT "CampaignInstanceAgentParticipation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceSession" ADD CONSTRAINT "CampaignInstanceSession_campaignInstanceId_fkey" FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipation" ADD CONSTRAINT "SessionParticipation_campaignInstanceId_sessionId_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipation" ADD CONSTRAINT "SessionParticipation_campaignInstanceId_humanMembershipId_fkey" FOREIGN KEY ("campaignInstanceId", "humanMembershipId") REFERENCES "CampaignInstanceHumanMembership"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipation" ADD CONSTRAINT "SessionParticipation_campaignInstanceId_agentParticipation_fkey" FOREIGN KEY ("campaignInstanceId", "agentParticipationId") REFERENCES "CampaignInstanceAgentParticipation"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceCharacterAssociation" ADD CONSTRAINT "CampaignInstanceCharacterAssociation_campaignInstanceId_fkey" FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceCharacterAssociation" ADD CONSTRAINT "CampaignInstanceCharacterAssociation_campaignInstanceId_pl_fkey" FOREIGN KEY ("campaignInstanceId", "playerMembershipId", "playerMembershipRole") REFERENCES "CampaignInstanceHumanMembership"("campaignInstanceId", "id", "role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceCharacterAssociation" ADD CONSTRAINT "CampaignInstanceCharacterAssociation_sourceInstance_fkey" FOREIGN KEY ("sourceCampaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInstanceCharacterAssociation" ADD CONSTRAINT "CampaignInstanceCharacterAssociation_sourceAssociation_fkey" FOREIGN KEY ("sourceCampaignInstanceId", "sourceCharacterId") REFERENCES "CampaignInstanceCharacterAssociation"("campaignInstanceId", "characterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CampaignInstanceRuntime_campaignInstanceId_campaignInst_key" RENAME TO "CampaignInstanceRuntime_campaignInstanceId_campaignInstance_key";

-- Role-specific profile ownership: Player memberships require a PlayerProfile;
-- GM and Spectator memberships must not borrow one.
ALTER TABLE "CampaignInstanceHumanMembership"
ADD CONSTRAINT "CampaignInstanceHumanMembership_player_profile_check"
CHECK (
  ("role" = 'PLAYER' AND "playerProfileId" IS NOT NULL)
  OR ("role" <> 'PLAYER' AND "playerProfileId" IS NULL)
);

ALTER TABLE "CampaignInstanceHumanMembership"
ADD CONSTRAINT "CampaignInstanceHumanMembership_left_at_check"
CHECK ("leftAt" IS NULL OR "leftAt" >= "joinedAt");

-- Provider-association timestamps describe a coherent state transition. A
-- pending association may be disabled before it is ever completed, so DISABLED
-- permits a null associatedAt while still requiring disabledAt.
ALTER TABLE "AuthenticationProviderAssociation"
ADD CONSTRAINT "AuthenticationProviderAssociation_lifecycle_check"
CHECK (
  (
    "status" = 'PENDING'
    AND "associatedAt" IS NULL
    AND "disabledAt" IS NULL
  )
  OR (
    "status" = 'ASSOCIATED'
    AND "associatedAt" IS NOT NULL
    AND "disabledAt" IS NULL
  )
  OR (
    "status" = 'DISABLED'
    AND "disabledAt" IS NOT NULL
    AND ("associatedAt" IS NULL OR "disabledAt" >= "associatedAt")
  )
);

-- Invitations are for Players and Spectators only. All recipient addresses and
-- credentials use encrypted, hashed, or provider-reference columns.
ALTER TABLE "CampaignInstanceInvitation"
ADD CONSTRAINT "CampaignInstanceInvitation_non_gm_role_check"
CHECK ("role" <> 'GM');

ALTER TABLE "CampaignInstanceInvitation"
ADD CONSTRAINT "CampaignInstanceInvitation_lifecycle_check"
CHECK (
  "expiresAt" > "createdAt"
  AND (
    (
      "status" IN ('PENDING', 'EXPIRED')
      AND "acceptedMembershipId" IS NULL
      AND "acceptedAt" IS NULL
      AND "revokedAt" IS NULL
    )
    OR (
      "status" = 'ACCEPTED'
      AND "acceptedMembershipId" IS NOT NULL
      AND "acceptedAt" IS NOT NULL
      AND "acceptedAt" >= "createdAt"
      AND "acceptedAt" <= "expiresAt"
      AND "revokedAt" IS NULL
    )
    OR (
      "status" = 'REVOKED'
      AND "acceptedMembershipId" IS NULL
      AND "acceptedAt" IS NULL
      AND "revokedAt" IS NOT NULL
      AND "revokedAt" >= "createdAt"
    )
  )
);

-- Agent authorization is non-human and observe/act grants remain independently
-- auditable arrays of namespaced string keys. This helper deliberately enforces
-- only the shared `${string}:${string}` shape so plugins can introduce keys
-- without a database vocabulary migration.
CREATE FUNCTION "is_namespaced_key_array"(value JSONB) RETURNS BOOLEAN AS $$
DECLARE
  capability JSONB;
  key TEXT;
  separator INTEGER;
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN
    RETURN FALSE;
  END IF;

  FOR capability IN SELECT * FROM jsonb_array_elements(value)
  LOOP
    IF jsonb_typeof(capability) <> 'string' THEN
      RETURN FALSE;
    END IF;
    key := capability #>> '{}';
    separator := position(':' in key);
    IF separator <= 1 OR separator >= char_length(key) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

ALTER TABLE "CampaignInstanceAgentParticipation"
ADD CONSTRAINT "CampaignInstanceAgentParticipation_kind_check"
CHECK ("participantKind" = 'non-human-agent');

ALTER TABLE "CampaignInstanceAgentParticipation"
ADD CONSTRAINT "CampaignInstanceAgentParticipation_capabilities_check"
CHECK (
  "is_namespaced_key_array"("observeCapabilities")
  AND "is_namespaced_key_array"("actCapabilities")
);

ALTER TABLE "CampaignInstanceSession"
ADD CONSTRAINT "CampaignInstanceSession_metadata_shape_check"
CHECK (
  jsonb_typeof("eventLog") = 'array'
  AND jsonb_typeof("extensions") = 'object'
);

ALTER TABLE "CampaignInstanceSession"
ADD CONSTRAINT "CampaignInstanceSession_lifecycle_check"
CHECK (
  (
    "status" = 'PLANNED'
    AND "startedAt" IS NULL
    AND "concludedAt" IS NULL
    AND "cancelledAt" IS NULL
  )
  OR (
    "status" IN ('ACTIVE', 'PAUSED')
    AND "startedAt" IS NOT NULL
    AND "concludedAt" IS NULL
    AND "cancelledAt" IS NULL
  )
  OR (
    "status" = 'CONCLUDED'
    AND "startedAt" IS NOT NULL
    AND "concludedAt" IS NOT NULL
    AND "concludedAt" >= "startedAt"
    AND "cancelledAt" IS NULL
  )
  OR (
    "status" = 'CANCELLED'
    AND "concludedAt" IS NULL
    AND "cancelledAt" IS NOT NULL
    AND ("startedAt" IS NULL OR "cancelledAt" >= "startedAt")
  )
);

-- Session attendance names exactly one durable human membership or one Agent
-- authorization. Composite foreign keys above bind either choice to the same
-- Campaign Instance as the Session.
ALTER TABLE "SessionParticipation"
ADD CONSTRAINT "SessionParticipation_exactly_one_participant_check"
CHECK (
  ("humanMembershipId" IS NOT NULL AND "agentParticipationId" IS NULL)
  OR ("humanMembershipId" IS NULL AND "agentParticipationId" IS NOT NULL)
);

ALTER TABLE "SessionParticipation"
ADD CONSTRAINT "SessionParticipation_join_leave_check"
CHECK ("leftAt" IS NULL OR ("joinedAt" IS NOT NULL AND "leftAt" >= "joinedAt"));

-- A Character always points at a Player-role membership in the same Instance.
-- One-way imports retain complete, immutable source provenance without sharing
-- the destination Character identity or creating a reverse synchronization.
ALTER TABLE "CampaignInstanceCharacterAssociation"
ADD CONSTRAINT "CampaignInstanceCharacterAssociation_player_role_check"
CHECK ("playerMembershipRole" = 'PLAYER');

ALTER TABLE "CampaignInstanceCharacterAssociation"
ADD CONSTRAINT "CampaignInstanceCharacterAssociation_origin_check"
CHECK (
  (
    "origin" = 'CREATED_IN_INSTANCE'
    AND "sourceCampaignInstanceId" IS NULL
    AND "sourceCharacterId" IS NULL
    AND "sourceCampaignInstanceName" IS NULL
    AND "sourceCharacterName" IS NULL
    AND "importedAt" IS NULL
  )
  OR
  (
    "origin" = 'ONE_WAY_IMPORT'
    AND "sourceCampaignInstanceId" IS NOT NULL
    AND "sourceCharacterId" IS NOT NULL
    AND "sourceCampaignInstanceName" IS NOT NULL
    AND "sourceCharacterName" IS NOT NULL
    AND "importedAt" IS NOT NULL
    AND "sourceCampaignInstanceId" <> "campaignInstanceId"
  )
);

-- Many Campaign Instances may be active, but the installation may have only
-- one active Session at a time. PostgreSQL partial indexes are not expressible
-- in Prisma's schema DSL, so this invariant lives in the migration.
CREATE UNIQUE INDEX "CampaignInstanceSession_single_active_installation_key"
ON "CampaignInstanceSession" ((true))
WHERE "status" = 'ACTIVE';
