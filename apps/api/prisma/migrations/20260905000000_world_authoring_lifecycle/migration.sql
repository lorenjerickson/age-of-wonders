-- Additive mutable World authoring drafts and versioned model registry.

CREATE TYPE "DefinitionDraftValidationStatus" AS ENUM ('NOT_VALIDATED', 'VALID', 'BLOCKED');
CREATE TYPE "ModelElementLifecycleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "WorldDefinition" ADD COLUMN "metadataRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WorldDefinitionRevision" ADD COLUMN "sourceDraftRevision" INTEGER;

CREATE TABLE "WorldDefinitionDraft" (
  "id" TEXT NOT NULL,
  "worldDefinitionId" TEXT NOT NULL,
  "baseRevisionId" TEXT,
  "baseSnapshotId" TEXT,
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
  CONSTRAINT "WorldDefinitionDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorldDefinitionDraft_revision_check" CHECK ("storageRevision" > 0),
  CONSTRAINT "WorldDefinitionDraft_base_pair_check" CHECK (("baseRevisionId" IS NULL) = ("baseSnapshotId" IS NULL)),
  CONSTRAINT "WorldDefinitionDraft_json_shape_check" CHECK (jsonb_typeof("content") = 'object' AND jsonb_typeof("snapshotRecords") = 'array'),
  CONSTRAINT "WorldDefinitionDraft_validation_check" CHECK (
    ("validationStatus" = 'NOT_VALIDATED' AND "validatedStorageRevision" IS NULL AND "validationReport" IS NULL)
    OR ("validationStatus" IN ('VALID', 'BLOCKED') AND "validatedStorageRevision" = "storageRevision" AND "validationReport" IS NOT NULL)
  )
);

CREATE TABLE "WorldDefinitionForkProvenance" (
  "targetWorldDefinitionId" TEXT NOT NULL,
  "sourceWorldDefinitionId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "identityMapping" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldDefinitionForkProvenance_pkey" PRIMARY KEY ("targetWorldDefinitionId"),
  CONSTRAINT "WorldDefinitionForkProvenance_mapping_shape_check" CHECK (jsonb_typeof("identityMapping") = 'object')
);

CREATE TABLE "ModelRegistry" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "provenance" JSONB NOT NULL,
  "ownerUserId" TEXT,
  "metadataRevision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelRegistry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelRegistry_revision_check" CHECK ("metadataRevision" > 0),
  CONSTRAINT "ModelRegistry_provenance_shape_check" CHECK (jsonb_typeof("provenance") = 'object')
);

CREATE TABLE "ModelElementLineage" (
  "id" TEXT NOT NULL,
  "registryId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "semanticRole" TEXT NOT NULL,
  "applicability" JSONB NOT NULL,
  "status" "ModelElementLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentRevisionId" TEXT,
  "metadataRevision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "ModelElementLineage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelElementLineage_revision_check" CHECK ("metadataRevision" > 0),
  CONSTRAINT "ModelElementLineage_kind_check" CHECK ("kind" IN ('concept','field','relationship','vocabulary','vocabulary-option')),
  CONSTRAINT "ModelElementLineage_applicability_shape_check" CHECK (jsonb_typeof("applicability") = 'object')
);

CREATE TABLE "ModelElementRevision" (
  "id" TEXT NOT NULL,
  "elementId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "predecessorRevisionId" TEXT,
  "payload" JSONB NOT NULL,
  "presentation" JSONB NOT NULL,
  "dependencies" JSONB NOT NULL DEFAULT '[]',
  "source" JSONB,
  "contentHash" TEXT NOT NULL,
  "authoredByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelElementRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelElementRevision_number_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "ModelElementRevision_predecessor_check" CHECK ("predecessorRevisionId" IS NULL OR "predecessorRevisionId" <> "id"),
  CONSTRAINT "ModelElementRevision_json_shape_check" CHECK (jsonb_typeof("payload") = 'object' AND jsonb_typeof("presentation") = 'object' AND jsonb_typeof("dependencies") = 'array')
);

CREATE TABLE "ModelSchemaRelease" (
  "id" TEXT NOT NULL,
  "registryId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "predecessorRevisionId" TEXT,
  "name" TEXT NOT NULL,
  "elementSelections" JSONB NOT NULL,
  "dependencies" JSONB NOT NULL DEFAULT '[]',
  "contentHash" TEXT NOT NULL,
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelSchemaRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelSchemaRelease_number_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "ModelSchemaRelease_predecessor_check" CHECK ("predecessorRevisionId" IS NULL OR "predecessorRevisionId" <> "id"),
  CONSTRAINT "ModelSchemaRelease_json_shape_check" CHECK (jsonb_typeof("elementSelections") = 'array' AND jsonb_typeof("dependencies") = 'array')
);

CREATE TABLE "ModelMigrationPlan" (
  "id" TEXT NOT NULL,
  "registryId" TEXT NOT NULL,
  "sourceReleaseId" TEXT NOT NULL,
  "targetReleaseId" TEXT NOT NULL,
  "mappings" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelMigrationPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelMigrationPlan_distinct_release_check" CHECK ("sourceReleaseId" <> "targetReleaseId"),
  CONSTRAINT "ModelMigrationPlan_mapping_shape_check" CHECK (jsonb_typeof("mappings") = 'array')
);

CREATE TABLE "WorldDefinitionRevisionModelSchemaRelease" (
  "worldDefinitionRevisionId" TEXT NOT NULL,
  "modelSchemaReleaseId" TEXT NOT NULL,
  "selectionOrder" INTEGER NOT NULL,
  CONSTRAINT "WorldDefinitionRevisionModelSchemaRelease_pkey" PRIMARY KEY ("worldDefinitionRevisionId", "modelSchemaReleaseId"),
  CONSTRAINT "WorldDefinitionRevisionModelSchemaRelease_order_check" CHECK ("selectionOrder" >= 0)
);

CREATE UNIQUE INDEX "WorldDefinitionDraft_worldDefinitionId_key" ON "WorldDefinitionDraft"("worldDefinitionId");
CREATE INDEX "WorldDefinitionDraft_worldDefinitionId_validation_idx" ON "WorldDefinitionDraft"("worldDefinitionId", "validationStatus");
CREATE INDEX "WorldDefinitionDraft_baseSnapshotId_idx" ON "WorldDefinitionDraft"("baseSnapshotId");
CREATE UNIQUE INDEX "WorldDefinitionRevision_worldDefinitionId_sourceDraftRevision_key" ON "WorldDefinitionRevision"("worldDefinitionId", "sourceDraftRevision");
CREATE UNIQUE INDEX "WorldDefinitionSnapshot_worldDefinitionId_revision_key" ON "WorldDefinitionSnapshot"("worldDefinitionId", "worldDefinitionRevisionId");
CREATE UNIQUE INDEX "WorldDefinitionSnapshot_id_world_revision_key" ON "WorldDefinitionSnapshot"("id", "worldDefinitionId", "worldDefinitionRevisionId");
CREATE INDEX "WorldDefinitionForkProvenance_source_idx" ON "WorldDefinitionForkProvenance"("sourceWorldDefinitionId", "sourceSnapshotId");
CREATE UNIQUE INDEX "ModelRegistry_ownerUserId_key_key" ON "ModelRegistry"("ownerUserId", "key");
CREATE UNIQUE INDEX "ModelRegistry_global_key_key" ON "ModelRegistry"("key") WHERE "ownerUserId" IS NULL;
CREATE INDEX "ModelRegistry_owner_name_idx" ON "ModelRegistry"("ownerUserId", "name");
CREATE UNIQUE INDEX "ModelElementLineage_registry_key_key" ON "ModelElementLineage"("registryId", "key");
CREATE UNIQUE INDEX "ModelElementLineage_currentRevisionId_key" ON "ModelElementLineage"("currentRevisionId");
CREATE UNIQUE INDEX "ModelElementLineage_id_currentRevisionId_key" ON "ModelElementLineage"("id", "currentRevisionId");
CREATE INDEX "ModelElementLineage_registry_kind_status_idx" ON "ModelElementLineage"("registryId", "kind", "status");
CREATE INDEX "ModelElementLineage_semanticRole_idx" ON "ModelElementLineage"("semanticRole");
CREATE UNIQUE INDEX "ModelElementRevision_element_number_key" ON "ModelElementRevision"("elementId", "revisionNumber");
CREATE UNIQUE INDEX "ModelElementRevision_element_id_key" ON "ModelElementRevision"("elementId", "id");
CREATE INDEX "ModelElementRevision_predecessor_idx" ON "ModelElementRevision"("predecessorRevisionId");
CREATE INDEX "ModelElementRevision_contentHash_idx" ON "ModelElementRevision"("contentHash");
CREATE UNIQUE INDEX "ModelSchemaRelease_registry_number_key" ON "ModelSchemaRelease"("registryId", "revisionNumber");
CREATE UNIQUE INDEX "ModelSchemaRelease_registry_id_key" ON "ModelSchemaRelease"("registryId", "id");
CREATE INDEX "ModelSchemaRelease_predecessor_idx" ON "ModelSchemaRelease"("predecessorRevisionId");
CREATE INDEX "ModelSchemaRelease_contentHash_idx" ON "ModelSchemaRelease"("contentHash");
CREATE UNIQUE INDEX "ModelMigrationPlan_registry_source_target_key" ON "ModelMigrationPlan"("registryId", "sourceReleaseId", "targetReleaseId");
CREATE INDEX "ModelMigrationPlan_target_idx" ON "ModelMigrationPlan"("targetReleaseId");
CREATE UNIQUE INDEX "WorldDefinitionRevisionModelSchemaRelease_revision_order_key" ON "WorldDefinitionRevisionModelSchemaRelease"("worldDefinitionRevisionId", "selectionOrder");
CREATE INDEX "WorldDefinitionRevisionModelSchemaRelease_release_idx" ON "WorldDefinitionRevisionModelSchemaRelease"("modelSchemaReleaseId");

ALTER TABLE "WorldDefinitionDraft" ADD CONSTRAINT "WorldDefinitionDraft_world_fkey" FOREIGN KEY ("worldDefinitionId") REFERENCES "WorldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionDraft" ADD CONSTRAINT "WorldDefinitionDraft_base_revision_fkey" FOREIGN KEY ("worldDefinitionId", "baseRevisionId") REFERENCES "WorldDefinitionRevision"("worldDefinitionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionDraft" ADD CONSTRAINT "WorldDefinitionDraft_base_snapshot_fkey" FOREIGN KEY ("baseSnapshotId", "worldDefinitionId", "baseRevisionId") REFERENCES "WorldDefinitionSnapshot"("id", "worldDefinitionId", "worldDefinitionRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionDraft" ADD CONSTRAINT "WorldDefinitionDraft_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionDraft" ADD CONSTRAINT "WorldDefinitionDraft_updater_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionForkProvenance" ADD CONSTRAINT "WorldDefinitionForkProvenance_target_fkey" FOREIGN KEY ("targetWorldDefinitionId") REFERENCES "WorldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionForkProvenance" ADD CONSTRAINT "WorldDefinitionForkProvenance_source_world_fkey" FOREIGN KEY ("sourceWorldDefinitionId") REFERENCES "WorldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionForkProvenance" ADD CONSTRAINT "WorldDefinitionForkProvenance_source_snapshot_fkey" FOREIGN KEY ("sourceSnapshotId", "sourceWorldDefinitionId") REFERENCES "WorldDefinitionSnapshot"("id", "worldDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ModelRegistry" ADD CONSTRAINT "ModelRegistry_owner_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelElementLineage" ADD CONSTRAINT "ModelElementLineage_registry_fkey" FOREIGN KEY ("registryId") REFERENCES "ModelRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelElementRevision" ADD CONSTRAINT "ModelElementRevision_element_fkey" FOREIGN KEY ("elementId") REFERENCES "ModelElementLineage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelElementRevision" ADD CONSTRAINT "ModelElementRevision_predecessor_fkey" FOREIGN KEY ("elementId", "predecessorRevisionId") REFERENCES "ModelElementRevision"("elementId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelElementRevision" ADD CONSTRAINT "ModelElementRevision_author_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelElementLineage" ADD CONSTRAINT "ModelElementLineage_current_revision_fkey" FOREIGN KEY ("id", "currentRevisionId") REFERENCES "ModelElementRevision"("elementId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelSchemaRelease" ADD CONSTRAINT "ModelSchemaRelease_registry_fkey" FOREIGN KEY ("registryId") REFERENCES "ModelRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelSchemaRelease" ADD CONSTRAINT "ModelSchemaRelease_predecessor_fkey" FOREIGN KEY ("registryId", "predecessorRevisionId") REFERENCES "ModelSchemaRelease"("registryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelSchemaRelease" ADD CONSTRAINT "ModelSchemaRelease_publisher_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelMigrationPlan" ADD CONSTRAINT "ModelMigrationPlan_registry_fkey" FOREIGN KEY ("registryId") REFERENCES "ModelRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelMigrationPlan" ADD CONSTRAINT "ModelMigrationPlan_source_fkey" FOREIGN KEY ("registryId", "sourceReleaseId") REFERENCES "ModelSchemaRelease"("registryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelMigrationPlan" ADD CONSTRAINT "ModelMigrationPlan_target_fkey" FOREIGN KEY ("registryId", "targetReleaseId") REFERENCES "ModelSchemaRelease"("registryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelMigrationPlan" ADD CONSTRAINT "ModelMigrationPlan_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionRevisionModelSchemaRelease" ADD CONSTRAINT "WorldDefinitionRevisionModelSchemaRelease_world_revision_fkey" FOREIGN KEY ("worldDefinitionRevisionId") REFERENCES "WorldDefinitionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldDefinitionRevisionModelSchemaRelease" ADD CONSTRAINT "WorldDefinitionRevisionModelSchemaRelease_model_release_fkey" FOREIGN KEY ("modelSchemaReleaseId") REFERENCES "ModelSchemaRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "ModelElementRevision_immutable" BEFORE UPDATE OR DELETE ON "ModelElementRevision" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
CREATE TRIGGER "ModelSchemaRelease_immutable" BEFORE UPDATE OR DELETE ON "ModelSchemaRelease" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
CREATE TRIGGER "WorldDefinitionForkProvenance_immutable" BEFORE UPDATE OR DELETE ON "WorldDefinitionForkProvenance" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
CREATE TRIGGER "WorldDefinitionRevisionModelSchemaRelease_immutable" BEFORE UPDATE OR DELETE ON "WorldDefinitionRevisionModelSchemaRelease" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
