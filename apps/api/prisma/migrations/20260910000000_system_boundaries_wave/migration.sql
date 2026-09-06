ALTER TABLE "Generation"
ADD COLUMN "contextType" TEXT,
ADD COLUMN "contextId" TEXT;

ALTER TABLE "MediaAsset"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "scopeType" TEXT,
ADD COLUMN "scopeId" TEXT;

CREATE INDEX "Generation_createdByUserId_contextType_createdAt_idx"
ON "Generation"("createdByUserId", "contextType", "createdAt");

CREATE INDEX "MediaAsset_createdByUserId_createdAt_idx"
ON "MediaAsset"("createdByUserId", "createdAt");

CREATE INDEX "MediaAsset_scopeType_scopeId_idx"
ON "MediaAsset"("scopeType", "scopeId");

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_scope_pair_check"
CHECK (
  ("scopeType" IS NULL AND "scopeId" IS NULL)
  OR
  ("scopeType" IS NOT NULL AND "scopeId" IS NOT NULL)
);
