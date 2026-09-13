-- NULL means not recorded. Never backfill old checkpoints from later exploration.
ALTER TABLE "CampaignInstanceRuntimeCheckpoint"
  ADD COLUMN "explorationHash" TEXT,
  ADD COLUMN "explorationCount" INTEGER,
  ADD CONSTRAINT "CampaignRuntimeCheckpoint_exploration_check" CHECK (
    ("explorationHash" IS NULL AND "explorationCount" IS NULL) OR
    ("explorationHash" IS NOT NULL AND "explorationHash" ~ '^[a-f0-9]{64}$' AND "explorationCount" IS NOT NULL AND "explorationCount" >= 0)
  );
CREATE TABLE "CampaignCheckpointExploration" (
  "checkpointId" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "observerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  CONSTRAINT "CampaignCheckpointExploration_pkey" PRIMARY KEY ("checkpointId", "locationId", "observerId"),
  CONSTRAINT "CampaignCheckpointExploration_checkpoint_fkey" FOREIGN KEY ("campaignInstanceId", "checkpointId", "snapshotId") REFERENCES "CampaignInstanceRuntimeCheckpoint"("campaignInstanceId", "id", "campaignInstanceSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CampaignCheckpointExploration_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "CampaignCheckpointExploration_scope_check" CHECK ((
    "payload"->'formatVersion' = '1'::jsonb
    AND "payload"#>>'{context,campaignInstanceId}' = "campaignInstanceId"
    AND "payload"#>>'{context,snapshotId}' = "snapshotId"
    AND "payload"#>>'{context,locationId}' = "locationId"
    AND "payload"#>>'{context,observerId}' = "observerId"
  ) IS TRUE)
);

-- Self-contained for additive adoption on older local db-push databases as well.
CREATE FUNCTION "reject_exploration_checkpoint_mutation"() RETURNS trigger AS $body$
BEGIN
  RAISE EXCEPTION '% exploration is immutable; create a new checkpoint', TG_TABLE_NAME;
END;
$body$ LANGUAGE plpgsql;
CREATE TRIGGER "CampaignRuntimeCheckpoint_exploration_immutable"
BEFORE UPDATE OF "explorationHash", "explorationCount" ON "CampaignInstanceRuntimeCheckpoint"
FOR EACH ROW EXECUTE FUNCTION "reject_exploration_checkpoint_mutation"();
CREATE TRIGGER "CampaignCheckpointExploration_immutable"
BEFORE UPDATE OR DELETE ON "CampaignCheckpointExploration"
FOR EACH ROW EXECUTE FUNCTION "reject_exploration_checkpoint_mutation"();
