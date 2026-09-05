-- Baseline for the relational schema that predates reviewed migrations.
CREATE TABLE "Generation" (
  "id" TEXT NOT NULL, "kind" TEXT NOT NULL, "prompt" TEXT NOT NULL,
  "output" TEXT NOT NULL, "model" TEXT NOT NULL, "responseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DomainRecord" (
  "resource" TEXT NOT NULL, "id" TEXT NOT NULL, "kind" TEXT, "name" TEXT,
  "data" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainRecord_pkey" PRIMARY KEY ("resource", "id")
);
CREATE TABLE "GraphEntry" (
  "key" TEXT NOT NULL, "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GraphEntry_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL, "bucket" TEXT NOT NULL, "objectKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL, "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "mediaType" TEXT NOT NULL, "purpose" TEXT NOT NULL,
  "size" INTEGER NOT NULL, "etag" TEXT, "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Generation_createdAt_idx" ON "Generation"("createdAt");
CREATE INDEX "DomainRecord_resource_kind_idx" ON "DomainRecord"("resource", "kind");
CREATE INDEX "DomainRecord_resource_name_idx" ON "DomainRecord"("resource", "name");
CREATE INDEX "DomainRecord_resource_updatedAt_idx" ON "DomainRecord"("resource", "updatedAt");
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");
CREATE INDEX "MediaAsset_mediaType_purpose_idx" ON "MediaAsset"("mediaType", "purpose");
CREATE INDEX "MediaAsset_mimeType_idx" ON "MediaAsset"("mimeType");
CREATE INDEX "MediaAsset_tags_idx" ON "MediaAsset" USING GIN ("tags");
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");
