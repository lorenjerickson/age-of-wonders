-- No backfill: an existing map has no exploration until an authorized observation is committed.
CREATE TABLE "CampaignTerrainExploration" (
  "campaignInstanceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "observerId" TEXT NOT NULL,
  "runtimeRevision" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignTerrainExploration_pkey" PRIMARY KEY ("campaignInstanceId", "snapshotId", "locationId", "observerId"),
  CONSTRAINT "CampaignTerrainExploration_instance_fkey" FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CampaignTerrainExploration_snapshot_fkey" FOREIGN KEY ("campaignInstanceId", "snapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CampaignTerrainExploration_revision_check" CHECK ("runtimeRevision" > 0),
  CONSTRAINT "CampaignTerrainExploration_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "CampaignTerrainExploration_scope_check" CHECK ((
    "payload"->'formatVersion' = '1'::jsonb
    AND "payload"#>>'{context,campaignInstanceId}' = "campaignInstanceId"
    AND "payload"#>>'{context,snapshotId}' = "snapshotId"
    AND "payload"#>>'{context,locationId}' = "locationId"
    AND "payload"#>>'{context,observerId}' = "observerId"
    AND "payload"#>'{context,runtimeRevision}' = to_jsonb("runtimeRevision")
    AND jsonb_typeof("payload"->'surfaces') = 'array'
    AND jsonb_typeof("payload"->'visibleSurfaceKeys') = 'array'
  ) IS TRUE)
);
CREATE INDEX "CampaignTerrainExploration_campaignInstanceId_snapshotId_idx" ON "CampaignTerrainExploration"("campaignInstanceId", "snapshotId");
