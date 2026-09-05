-- Invitation, identity, and resumable character-creation foundation.
-- Existing domain aggregates remain in DomainRecord; workflow secrets and PII
-- use dedicated relational tables with database constraints.

CREATE TYPE "UserRole" AS ENUM ('GM', 'PARTICIPANT');
CREATE TYPE "CampaignRole" AS ENUM ('PLAYER', 'SPECTATOR');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'BANNED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'CAPTURED', 'FAILED');
CREATE TYPE "CharacterDraftStatus" AS ENUM ('IN_PROGRESS', 'READY_FOR_REVIEW', 'COMPLETE');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignMembership" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "CampaignRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "displayName" TEXT NOT NULL,
  "emailEncrypted" TEXT,
  "emailHash" TEXT,
  "phoneEncrypted" TEXT,
  "phoneHash" TEXT,
  "characterIds" JSONB NOT NULL DEFAULT '[]',
  "activeCharacterId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignInvitation" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "role" "CampaignRole" NOT NULL,
  "displayName" TEXT NOT NULL,
  "emailEncrypted" TEXT,
  "emailHash" TEXT,
  "phoneEncrypted" TEXT,
  "phoneHash" TEXT,
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "reissuedFromId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "acceptedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvitationDelivery" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "channel" "DeliveryChannel" NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvitationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterCreationDraft" (
  "id" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "characterId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "status" "CharacterDraftStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "name" TEXT,
  "backgroundDefinitionId" TEXT,
  "professionDefinitionId" TEXT,
  "heritageDefinitionIds" JSONB NOT NULL DEFAULT '[]',
  "attributeRolls" JSONB NOT NULL DEFAULT '[]',
  "attributeAssignments" JSONB NOT NULL DEFAULT '{}',
  "startingEquipmentIds" JSONB NOT NULL DEFAULT '[]',
  "biography" TEXT,
  "imageAssetIds" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharacterCreationDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE UNIQUE INDEX "CampaignMembership_campaignId_userId_key" ON "CampaignMembership"("campaignId", "userId");
CREATE INDEX "CampaignMembership_campaignId_role_status_idx" ON "CampaignMembership"("campaignId", "role", "status");
CREATE INDEX "CampaignMembership_campaignId_emailHash_idx" ON "CampaignMembership"("campaignId", "emailHash");
CREATE INDEX "CampaignMembership_campaignId_phoneHash_idx" ON "CampaignMembership"("campaignId", "phoneHash");
CREATE INDEX "CampaignMembership_activeCharacterId_idx" ON "CampaignMembership"("activeCharacterId");
CREATE UNIQUE INDEX "CampaignInvitation_tokenHash_key" ON "CampaignInvitation"("tokenHash");
CREATE INDEX "CampaignInvitation_campaignId_status_idx" ON "CampaignInvitation"("campaignId", "status");
CREATE INDEX "CampaignInvitation_campaignId_emailHash_idx" ON "CampaignInvitation"("campaignId", "emailHash");
CREATE INDEX "CampaignInvitation_campaignId_phoneHash_idx" ON "CampaignInvitation"("campaignId", "phoneHash");
CREATE INDEX "CampaignInvitation_expiresAt_idx" ON "CampaignInvitation"("expiresAt");
CREATE UNIQUE INDEX "InvitationDelivery_invitationId_channel_key" ON "InvitationDelivery"("invitationId", "channel");
CREATE INDEX "InvitationDelivery_status_createdAt_idx" ON "InvitationDelivery"("status", "createdAt");
CREATE INDEX "CharacterCreationDraft_membershipId_status_idx" ON "CharacterCreationDraft"("membershipId", "status");
CREATE INDEX "CharacterCreationDraft_characterId_idx" ON "CharacterCreationDraft"("characterId");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignInvitation" ADD CONSTRAINT "CampaignInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInvitation" ADD CONSTRAINT "CampaignInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvitationDelivery" ADD CONSTRAINT "InvitationDelivery_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CampaignInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterCreationDraft" ADD CONSTRAINT "CharacterCreationDraft_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CampaignMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
