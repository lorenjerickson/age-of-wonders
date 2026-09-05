-- Draft-first Campaign Definition authoring, forks, and audited World adoption.

ALTER TABLE "CampaignDefinition" ADD COLUMN "metadataRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CampaignDefinitionRevision" ADD COLUMN "sourceDraftRevision" INTEGER;
ALTER TABLE "Generation" ADD COLUMN "createdByUserId" TEXT;
CREATE INDEX "Generation_createdByUserId_createdAt_idx" ON "Generation"("createdByUserId", "createdAt");
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CampaignDefinitionDraft" (
  "id" TEXT NOT NULL,
  "campaignDefinitionId" TEXT NOT NULL,
  "worldDefinitionId" TEXT NOT NULL,
  "baseRevisionId" TEXT,
  "baseSnapshotId" TEXT,
  "capturedWorldSnapshotId" TEXT NOT NULL,
  "revisionName" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "snapshotRecords" JSONB NOT NULL DEFAULT '[]',
  "storageRevision" INTEGER NOT NULL DEFAULT 1,
  "validationStatus" "DefinitionDraftValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
  "validatedStorageRevision" INTEGER,
  "validationReport" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignDefinitionDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignDefinitionDraft_revision_check" CHECK ("storageRevision" > 0),
  CONSTRAINT "CampaignDefinitionDraft_base_pair_check" CHECK (("baseRevisionId" IS NULL) = ("baseSnapshotId" IS NULL)),
  CONSTRAINT "CampaignDefinitionDraft_json_shape_check" CHECK (jsonb_typeof("content") = 'object' AND jsonb_typeof("snapshotRecords") = 'array'),
  CONSTRAINT "CampaignDefinitionDraft_validation_check" CHECK (
    ("validationStatus" = 'NOT_VALIDATED' AND "validatedStorageRevision" IS NULL AND "validationReport" IS NULL)
    OR ("validationStatus" IN ('VALID', 'BLOCKED') AND "validatedStorageRevision" = "storageRevision" AND "validationReport" IS NOT NULL)
  )
);

CREATE TABLE "CampaignDefinitionForkProvenance" (
  "targetCampaignDefinitionId" TEXT NOT NULL,
  "sourceCampaignDefinitionId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "identityMapping" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignDefinitionForkProvenance_pkey" PRIMARY KEY ("targetCampaignDefinitionId"),
  CONSTRAINT "CampaignDefinitionForkProvenance_mapping_shape_check" CHECK (jsonb_typeof("identityMapping") = 'object')
);

CREATE TABLE "CampaignDefinitionWorldMigrationAudit" (
  "id" TEXT NOT NULL,
  "campaignDefinitionId" TEXT NOT NULL,
  "predecessorCampaignRevisionId" TEXT NOT NULL,
  "sourceWorldSnapshotId" TEXT NOT NULL,
  "targetWorldSnapshotId" TEXT NOT NULL,
  "resultCampaignRevisionId" TEXT NOT NULL,
  "sourceDraftRevision" INTEGER NOT NULL,
  "resolutionPlan" JSONB NOT NULL,
  "planHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignDefinitionWorldMigrationAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignDefinitionWorldMigrationAudit_distinct_world_check" CHECK ("sourceWorldSnapshotId" <> "targetWorldSnapshotId"),
  CONSTRAINT "CampaignDefinitionWorldMigrationAudit_draft_revision_check" CHECK ("sourceDraftRevision" > 0),
  CONSTRAINT "CampaignDefinitionWorldMigrationAudit_plan_shape_check" CHECK (jsonb_typeof("resolutionPlan") = 'object')
);

CREATE UNIQUE INDEX "CampaignDefinitionDraft_campaignDefinitionId_key" ON "CampaignDefinitionDraft"("campaignDefinitionId");
CREATE UNIQUE INDEX "CampaignDefinitionDraft_campaign_world_key" ON "CampaignDefinitionDraft"("campaignDefinitionId", "worldDefinitionId");
CREATE INDEX "CampaignDefinitionDraft_campaign_validation_idx" ON "CampaignDefinitionDraft"("campaignDefinitionId", "validationStatus");
CREATE INDEX "CampaignDefinitionDraft_captured_world_idx" ON "CampaignDefinitionDraft"("capturedWorldSnapshotId");
CREATE INDEX "CampaignDefinitionDraft_base_snapshot_idx" ON "CampaignDefinitionDraft"("baseSnapshotId");
CREATE UNIQUE INDEX "CampaignDefinitionRevision_campaign_source_draft_key" ON "CampaignDefinitionRevision"("campaignDefinitionId", "sourceDraftRevision");
CREATE UNIQUE INDEX "CampaignDefinitionSnapshot_id_campaign_key" ON "CampaignDefinitionSnapshot"("id", "campaignDefinitionId");
CREATE UNIQUE INDEX "CampaignDefinitionSnapshot_id_campaign_revision_key" ON "CampaignDefinitionSnapshot"("id", "campaignDefinitionId", "campaignDefinitionRevisionId");
CREATE UNIQUE INDEX "CampaignDefinitionSnapshot_revision_key" ON "CampaignDefinitionSnapshot"("campaignDefinitionRevisionId");
CREATE INDEX "CampaignDefinitionForkProvenance_source_idx" ON "CampaignDefinitionForkProvenance"("sourceCampaignDefinitionId", "sourceSnapshotId");
CREATE UNIQUE INDEX "CampaignDefinitionWorldMigrationAudit_result_key" ON "CampaignDefinitionWorldMigrationAudit"("resultCampaignRevisionId");
CREATE UNIQUE INDEX "CampaignDefinitionWorldMigrationAudit_draft_key" ON "CampaignDefinitionWorldMigrationAudit"("campaignDefinitionId", "sourceDraftRevision");
CREATE INDEX "CampaignDefinitionWorldMigrationAudit_worlds_idx" ON "CampaignDefinitionWorldMigrationAudit"("sourceWorldSnapshotId", "targetWorldSnapshotId");
CREATE INDEX "CampaignDefinitionWorldMigrationAudit_applied_idx" ON "CampaignDefinitionWorldMigrationAudit"("appliedAt");

ALTER TABLE "CampaignDefinitionDraft" ADD CONSTRAINT "CampaignDefinitionDraft_campaign_fkey" FOREIGN KEY ("campaignDefinitionId", "worldDefinitionId") REFERENCES "CampaignDefinition"("id", "worldDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionDraft" ADD CONSTRAINT "CampaignDefinitionDraft_base_revision_fkey" FOREIGN KEY ("campaignDefinitionId", "baseRevisionId") REFERENCES "CampaignDefinitionRevision"("campaignDefinitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionDraft" ADD CONSTRAINT "CampaignDefinitionDraft_base_snapshot_fkey" FOREIGN KEY ("baseSnapshotId", "campaignDefinitionId", "baseRevisionId") REFERENCES "CampaignDefinitionSnapshot"("id", "campaignDefinitionId", "campaignDefinitionRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionDraft" ADD CONSTRAINT "CampaignDefinitionDraft_world_snapshot_fkey" FOREIGN KEY ("capturedWorldSnapshotId", "worldDefinitionId") REFERENCES "WorldDefinitionSnapshot"("id", "worldDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionDraft" ADD CONSTRAINT "CampaignDefinitionDraft_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionDraft" ADD CONSTRAINT "CampaignDefinitionDraft_updater_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignDefinitionForkProvenance" ADD CONSTRAINT "CampaignDefinitionForkProvenance_target_fkey" FOREIGN KEY ("targetCampaignDefinitionId") REFERENCES "CampaignDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionForkProvenance" ADD CONSTRAINT "CampaignDefinitionForkProvenance_source_fkey" FOREIGN KEY ("sourceCampaignDefinitionId") REFERENCES "CampaignDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionForkProvenance" ADD CONSTRAINT "CampaignDefinitionForkProvenance_snapshot_fkey" FOREIGN KEY ("sourceSnapshotId", "sourceCampaignDefinitionId") REFERENCES "CampaignDefinitionSnapshot"("id", "campaignDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionForkProvenance" ADD CONSTRAINT "CampaignDefinitionForkProvenance_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignDefinitionWorldMigrationAudit" ADD CONSTRAINT "CampaignDefinitionWorldMigrationAudit_campaign_fkey" FOREIGN KEY ("campaignDefinitionId") REFERENCES "CampaignDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionWorldMigrationAudit" ADD CONSTRAINT "CampaignDefinitionWorldMigrationAudit_source_revision_fkey" FOREIGN KEY ("predecessorCampaignRevisionId", "campaignDefinitionId", "sourceWorldSnapshotId") REFERENCES "CampaignDefinitionRevision"("id", "campaignDefinitionId", "capturedWorldSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionWorldMigrationAudit" ADD CONSTRAINT "CampaignDefinitionWorldMigrationAudit_result_revision_fkey" FOREIGN KEY ("resultCampaignRevisionId", "campaignDefinitionId", "targetWorldSnapshotId") REFERENCES "CampaignDefinitionRevision"("id", "campaignDefinitionId", "capturedWorldSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionWorldMigrationAudit" ADD CONSTRAINT "CampaignDefinitionWorldMigrationAudit_actor_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "CampaignDefinitionForkProvenance_immutable" BEFORE UPDATE OR DELETE ON "CampaignDefinitionForkProvenance" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
CREATE TRIGGER "CampaignDefinitionWorldMigrationAudit_append_only" BEFORE UPDATE OR DELETE ON "CampaignDefinitionWorldMigrationAudit" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
