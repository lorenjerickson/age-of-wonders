-- Freeze legacy Campaign-scoped drafts as migration input. Runtime code no longer writes this table.
ALTER TABLE "CharacterCreationDraft"
ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "CharacterCreationDraft"
SET "archivedAt" = CURRENT_TIMESTAMP
WHERE "archivedAt" IS NULL;

-- A draft now belongs to a Character that is already bound to one Campaign Instance
-- and one Player membership in that Instance.
CREATE TABLE "CampaignInstanceCharacterDraft" (
    "id" TEXT NOT NULL,
    "campaignInstanceId" TEXT NOT NULL,
    "playerMembershipId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
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

    CONSTRAINT "CampaignInstanceCharacterDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignInstanceCharacterDraft_characterId_key"
ON "CampaignInstanceCharacterDraft"("characterId");

CREATE UNIQUE INDEX "InstanceCharacterDraft_membership_character_key"
ON "CampaignInstanceCharacterDraft"("campaignInstanceId", "playerMembershipId", "characterId");

CREATE INDEX "InstanceCharacterDraft_membership_status_idx"
ON "CampaignInstanceCharacterDraft"("campaignInstanceId", "playerMembershipId", "status");

CREATE INDEX "InstanceCharacterDraft_player_status_idx"
ON "CampaignInstanceCharacterDraft"("playerMembershipId", "status");

ALTER TABLE "CampaignInstanceCharacterDraft"
ADD CONSTRAINT "CampaignInstanceCharacterDraft_campaignInstanceId_fkey"
FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignInstanceCharacterDraft"
ADD CONSTRAINT "CampaignInstanceCharacterDraft_membership_fkey"
FOREIGN KEY ("campaignInstanceId", "playerMembershipId")
REFERENCES "CampaignInstanceHumanMembership"("campaignInstanceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignInstanceCharacterDraft"
ADD CONSTRAINT "CampaignInstanceCharacterDraft_character_fkey"
FOREIGN KEY ("campaignInstanceId", "playerMembershipId", "characterId")
REFERENCES "CampaignInstanceCharacterAssociation"("campaignInstanceId", "playerMembershipId", "characterId")
ON DELETE RESTRICT ON UPDATE CASCADE;
