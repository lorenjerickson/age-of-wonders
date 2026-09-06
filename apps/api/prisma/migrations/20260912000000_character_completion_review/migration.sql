ALTER TABLE "CampaignInstanceCharacterDraft"
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewNote" TEXT;

-- Ensure every existing Instance Character has a resumable draft before the
-- completion gate becomes authoritative. Imported legacy sheets are input only;
-- approval must be repeated against the Instance's current captured schema.
INSERT INTO "CampaignInstanceCharacterDraft" (
    "id",
    "campaignInstanceId",
    "playerMembershipId",
    "characterId",
    "revision",
    "status",
    "name",
    "backgroundDefinitionId",
    "professionDefinitionId",
    "heritageDefinitionIds",
    "attributeRolls",
    "attributeAssignments",
    "startingEquipmentIds",
    "biography",
    "imageAssetIds",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    association."campaignInstanceId",
    association."playerMembershipId",
    association."characterId",
    1,
    'IN_PROGRESS'::"CharacterDraftStatus",
    association."characterName",
    CASE WHEN jsonb_typeof(record."data" -> 'backgroundDefinitionId') = 'string'
        THEN record."data" ->> 'backgroundDefinitionId' END,
    CASE WHEN jsonb_typeof(record."data" -> 'professionDefinitionId') = 'string'
        THEN record."data" ->> 'professionDefinitionId' END,
    CASE WHEN jsonb_typeof(record."data" -> 'heritageDefinitionIds') = 'array'
        THEN record."data" -> 'heritageDefinitionIds' ELSE '[]'::jsonb END,
    '[]'::jsonb,
    CASE WHEN jsonb_typeof(record."data" -> 'attributeAssignments') = 'object'
        THEN record."data" -> 'attributeAssignments' ELSE '{}'::jsonb END,
    CASE WHEN jsonb_typeof(record."data" -> 'startingEquipmentDefinitionIds') = 'array'
        THEN record."data" -> 'startingEquipmentDefinitionIds' ELSE '[]'::jsonb END,
    CASE WHEN jsonb_typeof(record."data" -> 'biography') = 'string'
        THEN record."data" ->> 'biography' END,
    CASE WHEN jsonb_typeof(record."data" -> 'imageAssetIds') = 'object'
        THEN record."data" -> 'imageAssetIds' ELSE '{}'::jsonb END,
    association."createdAt",
    CURRENT_TIMESTAMP
FROM "CampaignInstanceCharacterAssociation" association
LEFT JOIN "CampaignInstanceCharacterDraft" draft
    ON draft."characterId" = association."characterId"
LEFT JOIN "DomainRecord" record
    ON record."resource" = 'characters'
    AND record."id" = association."characterId"
WHERE draft."characterId" IS NULL;

CREATE INDEX "InstanceCharacterDraft_reviewer_idx"
ON "CampaignInstanceCharacterDraft"("reviewedByUserId", "reviewedAt");

ALTER TABLE "CampaignInstanceCharacterDraft"
ADD CONSTRAINT "InstanceCharacterDraft_reviewer_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
