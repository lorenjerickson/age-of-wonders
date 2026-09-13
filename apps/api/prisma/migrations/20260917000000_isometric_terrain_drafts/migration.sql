-- Uploads are staging data only; committed terrain is captured in snapshotRecords.
CREATE TABLE "WorldTerrainUpload" (
  "draftId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldTerrainUpload_pkey" PRIMARY KEY ("draftId", "contentHash"),
  CONSTRAINT "WorldTerrainUpload_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "WorldDefinitionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorldTerrainUpload_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "WorldTerrainUpload_draftId_createdAt_idx" ON "WorldTerrainUpload"("draftId", "createdAt");
CREATE TABLE "WorldTerrainSave" (
  "draftId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "storageRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldTerrainSave_pkey" PRIMARY KEY ("draftId", "operationId"),
  CONSTRAINT "WorldTerrainSave_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "WorldDefinitionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorldTerrainSave_revision_check" CHECK ("storageRevision" > 0),
  CONSTRAINT "WorldTerrainSave_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$')
);
