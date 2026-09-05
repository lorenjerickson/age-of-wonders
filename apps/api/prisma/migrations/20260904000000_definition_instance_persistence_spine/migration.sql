-- Additive persistence spine for immutable World/Campaign definitions and
-- Campaign Instance captures. Legacy DomainRecord and campaignId columns are
-- intentionally unchanged so conversion can be preflighted and shadow-written.

CREATE TYPE "DefinitionLineageStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "CampaignInstanceStatus" AS ENUM ('PREPARING', 'ACTIVE', 'PAUSED', 'CONCLUDED', 'ARCHIVED');
CREATE TYPE "InstanceSnapshotReason" AS ENUM ('INITIAL', 'MIGRATION', 'RESTORE');
CREATE TYPE "InstallationRolloutPhase" AS ENUM (
  'PLANNED',
  'PREFLIGHT_READY',
  'BLOCKED',
  'SHADOW_WRITING',
  'READY_FOR_CUTOVER',
  'CUTOVER_IN_PROGRESS',
  'COMPLETE',
  'FAILED'
);

CREATE TABLE "WorldDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "DefinitionLineageStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentRevisionId" TEXT,
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "WorldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorldDefinitionRevision" (
  "id" TEXT NOT NULL,
  "worldDefinitionId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "predecessorRevisionId" TEXT,
  "name" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldDefinitionRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorldDefinitionRevision_revisionNumber_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "WorldDefinitionRevision_predecessor_check" CHECK ("predecessorRevisionId" IS NULL OR "predecessorRevisionId" <> "id")
);

CREATE TABLE "WorldDefinitionSnapshot" (
  "id" TEXT NOT NULL,
  "worldDefinitionId" TEXT NOT NULL,
  "worldDefinitionRevisionId" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldDefinitionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignDefinition" (
  "id" TEXT NOT NULL,
  "worldDefinitionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "DefinitionLineageStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentRevisionId" TEXT,
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignDefinitionRevision" (
  "id" TEXT NOT NULL,
  "campaignDefinitionId" TEXT NOT NULL,
  "worldDefinitionId" TEXT NOT NULL,
  "capturedWorldSnapshotId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "predecessorRevisionId" TEXT,
  "name" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignDefinitionRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignDefinitionRevision_revisionNumber_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "CampaignDefinitionRevision_predecessor_check" CHECK ("predecessorRevisionId" IS NULL OR "predecessorRevisionId" <> "id")
);

CREATE TABLE "CampaignDefinitionSnapshot" (
  "id" TEXT NOT NULL,
  "campaignDefinitionId" TEXT NOT NULL,
  "campaignDefinitionRevisionId" TEXT NOT NULL,
  "capturedWorldSnapshotId" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignDefinitionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignInstance" (
  "id" TEXT NOT NULL,
  "campaignDefinitionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CampaignInstanceStatus" NOT NULL DEFAULT 'PREPARING',
  "currentSnapshotId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "concludedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignInstanceSnapshot" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "campaignDefinitionId" TEXT NOT NULL,
  "campaignDefinitionSnapshotId" TEXT NOT NULL,
  "worldDefinitionSnapshotId" TEXT NOT NULL,
  "snapshotNumber" INTEGER NOT NULL,
  "predecessorSnapshotId" TEXT,
  "reason" "InstanceSnapshotReason" NOT NULL,
  "manifest" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "migrationPlan" JSONB,
  "createdByUserId" TEXT,
  "adoptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignInstanceSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignInstanceSnapshot_snapshotNumber_check" CHECK ("snapshotNumber" > 0),
  CONSTRAINT "CampaignInstanceSnapshot_predecessor_check" CHECK ("predecessorSnapshotId" IS NULL OR "predecessorSnapshotId" <> "id")
);

CREATE TABLE "CampaignInstanceRuntime" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "campaignInstanceSnapshotId" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "extensions" JSONB NOT NULL DEFAULT '{}',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignInstanceRuntime_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignInstanceRuntime_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "LegacyIdentityMap" (
  "id" TEXT NOT NULL,
  "legacyResource" TEXT NOT NULL,
  "legacyId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetRevisionId" TEXT,
  "sourceDomainRevision" INTEGER,
  "mappingMetadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyIdentityMap_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LegacyIdentityMap_sourceDomainRevision_check" CHECK ("sourceDomainRevision" IS NULL OR "sourceDomainRevision" > 0)
);

CREATE TABLE "InstallationRolloutState" (
  "id" TEXT NOT NULL,
  "installationKey" TEXT NOT NULL,
  "migrationKey" TEXT NOT NULL,
  "phase" "InstallationRolloutPhase" NOT NULL DEFAULT 'PLANNED',
  "sourceVersion" TEXT,
  "targetVersion" TEXT NOT NULL,
  "preflightReport" JSONB,
  "checkpoint" JSONB NOT NULL DEFAULT '{}',
  "initiatedByUserId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstallationRolloutState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstallationRolloutAudit" (
  "id" TEXT NOT NULL,
  "rolloutStateId" TEXT NOT NULL,
  "phase" "InstallationRolloutPhase" NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstallationRolloutAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorldDefinition_status_updatedAt_idx" ON "WorldDefinition"("status", "updatedAt");
CREATE INDEX "WorldDefinition_ownerUserId_status_idx" ON "WorldDefinition"("ownerUserId", "status");
CREATE UNIQUE INDEX "WorldDefinition_currentRevisionId_key" ON "WorldDefinition"("currentRevisionId");
CREATE UNIQUE INDEX "WorldDefinition_id_currentRevisionId_key" ON "WorldDefinition"("id", "currentRevisionId");
CREATE UNIQUE INDEX "WorldDefinitionRevision_worldDefinitionId_revisionNumber_key" ON "WorldDefinitionRevision"("worldDefinitionId", "revisionNumber");
CREATE UNIQUE INDEX "WorldDefinitionRevision_worldDefinitionId_id_key" ON "WorldDefinitionRevision"("worldDefinitionId", "id");
CREATE INDEX "WorldDefinitionRevision_predecessorRevisionId_idx" ON "WorldDefinitionRevision"("predecessorRevisionId");
CREATE INDEX "WorldDefinitionRevision_contentHash_idx" ON "WorldDefinitionRevision"("contentHash");
CREATE INDEX "WorldDefinitionRevision_publishedAt_idx" ON "WorldDefinitionRevision"("publishedAt");
CREATE UNIQUE INDEX "WorldDefinitionSnapshot_id_worldDefinitionId_key" ON "WorldDefinitionSnapshot"("id", "worldDefinitionId");
CREATE INDEX "WorldDefinitionSnapshot_worldDefinitionId_worldDefinitionRe_idx" ON "WorldDefinitionSnapshot"("worldDefinitionId", "worldDefinitionRevisionId");
CREATE INDEX "WorldDefinitionSnapshot_contentHash_idx" ON "WorldDefinitionSnapshot"("contentHash");
CREATE INDEX "WorldDefinitionSnapshot_capturedAt_idx" ON "WorldDefinitionSnapshot"("capturedAt");

CREATE UNIQUE INDEX "CampaignDefinition_id_worldDefinitionId_key" ON "CampaignDefinition"("id", "worldDefinitionId");
CREATE UNIQUE INDEX "CampaignDefinition_currentRevisionId_key" ON "CampaignDefinition"("currentRevisionId");
CREATE UNIQUE INDEX "CampaignDefinition_id_currentRevisionId_key" ON "CampaignDefinition"("id", "currentRevisionId");
CREATE INDEX "CampaignDefinition_worldDefinitionId_status_idx" ON "CampaignDefinition"("worldDefinitionId", "status");
CREATE INDEX "CampaignDefinition_ownerUserId_status_idx" ON "CampaignDefinition"("ownerUserId", "status");
CREATE UNIQUE INDEX "CampaignDefinitionRevision_campaignDefinitionId_revisionNum_key" ON "CampaignDefinitionRevision"("campaignDefinitionId", "revisionNumber");
CREATE UNIQUE INDEX "CampaignDefinitionRevision_campaignDefinitionId_id_key" ON "CampaignDefinitionRevision"("campaignDefinitionId", "id");
CREATE UNIQUE INDEX "CampaignDefinitionRevision_id_campaignDefinitionId_captured_key" ON "CampaignDefinitionRevision"("id", "campaignDefinitionId", "capturedWorldSnapshotId");
CREATE INDEX "CampaignDefinitionRevision_capturedWorldSnapshotId_worldDef_idx" ON "CampaignDefinitionRevision"("capturedWorldSnapshotId", "worldDefinitionId");
CREATE INDEX "CampaignDefinitionRevision_predecessorRevisionId_idx" ON "CampaignDefinitionRevision"("predecessorRevisionId");
CREATE INDEX "CampaignDefinitionRevision_contentHash_idx" ON "CampaignDefinitionRevision"("contentHash");
CREATE INDEX "CampaignDefinitionRevision_publishedAt_idx" ON "CampaignDefinitionRevision"("publishedAt");
CREATE UNIQUE INDEX "CampaignDefinitionSnapshot_id_campaignDefinitionId_captured_key" ON "CampaignDefinitionSnapshot"("id", "campaignDefinitionId", "capturedWorldSnapshotId");
CREATE INDEX "CampaignDefinitionSnapshot_campaignDefinitionRevisionId_cam_idx" ON "CampaignDefinitionSnapshot"("campaignDefinitionRevisionId", "campaignDefinitionId", "capturedWorldSnapshotId");
CREATE INDEX "CampaignDefinitionSnapshot_capturedWorldSnapshotId_idx" ON "CampaignDefinitionSnapshot"("capturedWorldSnapshotId");
CREATE INDEX "CampaignDefinitionSnapshot_contentHash_idx" ON "CampaignDefinitionSnapshot"("contentHash");
CREATE INDEX "CampaignDefinitionSnapshot_capturedAt_idx" ON "CampaignDefinitionSnapshot"("capturedAt");

CREATE UNIQUE INDEX "CampaignInstance_currentSnapshotId_key" ON "CampaignInstance"("currentSnapshotId");
CREATE UNIQUE INDEX "CampaignInstance_id_campaignDefinitionId_key" ON "CampaignInstance"("id", "campaignDefinitionId");
CREATE UNIQUE INDEX "CampaignInstance_id_currentSnapshotId_key" ON "CampaignInstance"("id", "currentSnapshotId");
CREATE INDEX "CampaignInstance_campaignDefinitionId_status_idx" ON "CampaignInstance"("campaignDefinitionId", "status");
CREATE INDEX "CampaignInstance_createdByUserId_status_idx" ON "CampaignInstance"("createdByUserId", "status");

CREATE UNIQUE INDEX "CampaignInstanceSnapshot_campaignInstanceId_snapshotNumber_key" ON "CampaignInstanceSnapshot"("campaignInstanceId", "snapshotNumber");
CREATE UNIQUE INDEX "CampaignInstanceSnapshot_campaignInstanceId_id_key" ON "CampaignInstanceSnapshot"("campaignInstanceId", "id");
CREATE INDEX "CampaignInstanceSnapshot_campaignDefinitionSnapshotId_campa_idx" ON "CampaignInstanceSnapshot"("campaignDefinitionSnapshotId", "campaignDefinitionId", "worldDefinitionSnapshotId");
CREATE INDEX "CampaignInstanceSnapshot_worldDefinitionSnapshotId_idx" ON "CampaignInstanceSnapshot"("worldDefinitionSnapshotId");
CREATE INDEX "CampaignInstanceSnapshot_predecessorSnapshotId_idx" ON "CampaignInstanceSnapshot"("predecessorSnapshotId");
CREATE INDEX "CampaignInstanceSnapshot_contentHash_idx" ON "CampaignInstanceSnapshot"("contentHash");
CREATE INDEX "CampaignInstanceSnapshot_adoptedAt_idx" ON "CampaignInstanceSnapshot"("adoptedAt");
CREATE UNIQUE INDEX "CampaignInstanceRuntime_campaignInstanceId_key" ON "CampaignInstanceRuntime"("campaignInstanceId");
CREATE UNIQUE INDEX "CampaignInstanceRuntime_campaignInstanceSnapshotId_key" ON "CampaignInstanceRuntime"("campaignInstanceSnapshotId");
CREATE UNIQUE INDEX "CampaignInstanceRuntime_campaignInstanceId_campaignInst_key" ON "CampaignInstanceRuntime"("campaignInstanceId", "campaignInstanceSnapshotId");
CREATE INDEX "CampaignInstanceRuntime_updatedAt_idx" ON "CampaignInstanceRuntime"("updatedAt");

CREATE UNIQUE INDEX "LegacyIdentityMap_legacyResource_legacyId_targetType_key" ON "LegacyIdentityMap"("legacyResource", "legacyId", "targetType");
CREATE INDEX "LegacyIdentityMap_targetType_targetId_idx" ON "LegacyIdentityMap"("targetType", "targetId");
CREATE INDEX "LegacyIdentityMap_targetRevisionId_idx" ON "LegacyIdentityMap"("targetRevisionId");
CREATE UNIQUE INDEX "InstallationRolloutState_installationKey_migrationKey_key" ON "InstallationRolloutState"("installationKey", "migrationKey");
CREATE INDEX "InstallationRolloutState_phase_updatedAt_idx" ON "InstallationRolloutState"("phase", "updatedAt");
CREATE INDEX "InstallationRolloutAudit_rolloutStateId_createdAt_idx" ON "InstallationRolloutAudit"("rolloutStateId", "createdAt");
CREATE INDEX "InstallationRolloutAudit_phase_createdAt_idx" ON "InstallationRolloutAudit"("phase", "createdAt");

ALTER TABLE "WorldDefinition" ADD CONSTRAINT "WorldDefinition_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionRevision" ADD CONSTRAINT "WorldDefinitionRevision_worldDefinitionId_fkey" FOREIGN KEY ("worldDefinitionId") REFERENCES "WorldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionRevision" ADD CONSTRAINT "WorldDefinitionRevision_worldDefinitionId_predecessorRevisionId_fkey" FOREIGN KEY ("worldDefinitionId", "predecessorRevisionId") REFERENCES "WorldDefinitionRevision"("worldDefinitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionRevision" ADD CONSTRAINT "WorldDefinitionRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinition" ADD CONSTRAINT "WorldDefinition_id_currentRevisionId_fkey" FOREIGN KEY ("id", "currentRevisionId") REFERENCES "WorldDefinitionRevision"("worldDefinitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionSnapshot" ADD CONSTRAINT "WorldDefinitionSnapshot_worldDefinitionId_worldDefinitionR_fkey" FOREIGN KEY ("worldDefinitionId", "worldDefinitionRevisionId") REFERENCES "WorldDefinitionRevision"("worldDefinitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignDefinition" ADD CONSTRAINT "CampaignDefinition_worldDefinitionId_fkey" FOREIGN KEY ("worldDefinitionId") REFERENCES "WorldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinition" ADD CONSTRAINT "CampaignDefinition_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionRevision" ADD CONSTRAINT "CampaignDefinitionRevision_campaignDefinitionId_worldDefin_fkey" FOREIGN KEY ("campaignDefinitionId", "worldDefinitionId") REFERENCES "CampaignDefinition"("id", "worldDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionRevision" ADD CONSTRAINT "CampaignDefinitionRevision_capturedWorldSnapshotId_worldDe_fkey" FOREIGN KEY ("capturedWorldSnapshotId", "worldDefinitionId") REFERENCES "WorldDefinitionSnapshot"("id", "worldDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionRevision" ADD CONSTRAINT "CampaignDefinitionRevision_campaignDefinitionId_predecessor_fkey" FOREIGN KEY ("campaignDefinitionId", "predecessorRevisionId") REFERENCES "CampaignDefinitionRevision"("campaignDefinitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionRevision" ADD CONSTRAINT "CampaignDefinitionRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinition" ADD CONSTRAINT "CampaignDefinition_id_currentRevisionId_fkey" FOREIGN KEY ("id", "currentRevisionId") REFERENCES "CampaignDefinitionRevision"("campaignDefinitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionSnapshot" ADD CONSTRAINT "CampaignDefinitionSnapshot_campaignDefinitionRevisionId_ca_fkey" FOREIGN KEY ("campaignDefinitionRevisionId", "campaignDefinitionId", "capturedWorldSnapshotId") REFERENCES "CampaignDefinitionRevision"("id", "campaignDefinitionId", "capturedWorldSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignDefinitionSnapshot" ADD CONSTRAINT "CampaignDefinitionSnapshot_capturedWorldSnapshotId_fkey" FOREIGN KEY ("capturedWorldSnapshotId") REFERENCES "WorldDefinitionSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignInstance" ADD CONSTRAINT "CampaignInstance_campaignDefinitionId_fkey" FOREIGN KEY ("campaignDefinitionId") REFERENCES "CampaignDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstance" ADD CONSTRAINT "CampaignInstance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceSnapshot" ADD CONSTRAINT "CampaignInstanceSnapshot_campaignInstanceId_campaignDefini_fkey" FOREIGN KEY ("campaignInstanceId", "campaignDefinitionId") REFERENCES "CampaignInstance"("id", "campaignDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceSnapshot" ADD CONSTRAINT "CampaignInstanceSnapshot_campaignDefinitionSnapshotId_camp_fkey" FOREIGN KEY ("campaignDefinitionSnapshotId", "campaignDefinitionId", "worldDefinitionSnapshotId") REFERENCES "CampaignDefinitionSnapshot"("id", "campaignDefinitionId", "capturedWorldSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceSnapshot" ADD CONSTRAINT "CampaignInstanceSnapshot_worldDefinitionSnapshotId_fkey" FOREIGN KEY ("worldDefinitionSnapshotId") REFERENCES "WorldDefinitionSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceSnapshot" ADD CONSTRAINT "CampaignInstanceSnapshot_campaignInstanceId_predecessor_fkey" FOREIGN KEY ("campaignInstanceId", "predecessorSnapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceSnapshot" ADD CONSTRAINT "CampaignInstanceSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstance" ADD CONSTRAINT "CampaignInstance_id_currentSnapshotId_fkey" FOREIGN KEY ("id", "currentSnapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceRuntime" ADD CONSTRAINT "CampaignInstanceRuntime_campaignInstanceId_fkey" FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceRuntime" ADD CONSTRAINT "CampaignInstanceRuntime_campaignInstanceId_campaignInst_fkey" FOREIGN KEY ("campaignInstanceId", "campaignInstanceSnapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InstallationRolloutState" ADD CONSTRAINT "InstallationRolloutState_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallationRolloutAudit" ADD CONSTRAINT "InstallationRolloutAudit_rolloutStateId_fkey" FOREIGN KEY ("rolloutStateId") REFERENCES "InstallationRolloutState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallationRolloutAudit" ADD CONSTRAINT "InstallationRolloutAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Published revisions and instance captures are append-only. New content or a
-- migration creates a new row; it never rewrites the provenance of an old row.
CREATE FUNCTION "reject_immutable_definition_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; create a new revision or snapshot', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorldDefinitionRevision_immutable"
BEFORE UPDATE OR DELETE ON "WorldDefinitionRevision"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();

CREATE TRIGGER "WorldDefinitionSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "WorldDefinitionSnapshot"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();

CREATE TRIGGER "CampaignDefinitionRevision_immutable"
BEFORE UPDATE OR DELETE ON "CampaignDefinitionRevision"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();

CREATE TRIGGER "CampaignDefinitionSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "CampaignDefinitionSnapshot"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();

CREATE TRIGGER "CampaignInstanceSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "CampaignInstanceSnapshot"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();

CREATE TRIGGER "InstallationRolloutAudit_append_only"
BEFORE UPDATE OR DELETE ON "InstallationRolloutAudit"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
