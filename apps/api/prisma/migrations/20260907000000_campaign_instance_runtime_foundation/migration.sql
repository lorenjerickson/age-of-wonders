-- Campaign Instance ownership, optimistic metadata concurrency, and immutable
-- runtime adoption checkpoints. Existing rows remain valid and unowned legacy
-- Instances can be assigned through a later explicit rollout.

CREATE TYPE "CampaignInstanceRuntimeCheckpointReason" AS ENUM (
  'INITIAL',
  'MIGRATION_SOURCE',
  'MIGRATION_RESULT',
  'RESTORE_SOURCE',
  'RESTORE_RESULT'
);

CREATE TYPE "CampaignInstanceMigrationKind" AS ENUM ('MIGRATION', 'RESTORE');

ALTER TABLE "CampaignInstance"
ADD COLUMN "ownerUserId" TEXT,
ADD COLUMN "creationKeyHash" TEXT,
ADD COLUMN "metadataRevision" INTEGER NOT NULL DEFAULT 1,
ADD CONSTRAINT "CampaignInstance_metadata_revision_check" CHECK ("metadataRevision" > 0);

CREATE TABLE "CampaignInstanceRuntimeCheckpoint" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "campaignInstanceSnapshotId" TEXT NOT NULL,
  "checkpointNumber" INTEGER NOT NULL,
  "reason" "CampaignInstanceRuntimeCheckpointReason" NOT NULL,
  "runtimeRevision" INTEGER NOT NULL,
  "state" JSONB NOT NULL,
  "extensions" JSONB NOT NULL DEFAULT '{}',
  "contentHash" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignInstanceRuntimeCheckpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignInstanceRuntimeCheckpoint_number_check" CHECK ("checkpointNumber" > 0),
  CONSTRAINT "CampaignInstanceRuntimeCheckpoint_revision_check" CHECK ("runtimeRevision" > 0),
  CONSTRAINT "CampaignInstanceRuntimeCheckpoint_json_shape_check" CHECK (
    jsonb_typeof("state") = 'object' AND jsonb_typeof("extensions") = 'object'
  )
);

CREATE TABLE "CampaignInstanceMigrationAudit" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "kind" "CampaignInstanceMigrationKind" NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "resultSnapshotId" TEXT NOT NULL,
  "sourceRuntimeCheckpointId" TEXT NOT NULL,
  "resultRuntimeCheckpointId" TEXT NOT NULL,
  "resolutionPlan" JSONB NOT NULL,
  "planHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignInstanceMigrationAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignInstanceMigrationAudit_distinct_snapshot_check" CHECK (
    "sourceSnapshotId" <> "resultSnapshotId"
  ),
  CONSTRAINT "CampaignInstanceMigrationAudit_distinct_checkpoint_check" CHECK (
    "sourceRuntimeCheckpointId" <> "resultRuntimeCheckpointId"
  ),
  CONSTRAINT "CampaignInstanceMigrationAudit_plan_shape_check" CHECK (
    jsonb_typeof("resolutionPlan") = 'object'
  )
);

CREATE TABLE "CampaignInstanceAuditEvent" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "subjectName" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignInstanceAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignInstanceAuditEvent_action_size_check" CHECK (char_length("action") BETWEEN 1 AND 120),
  CONSTRAINT "CampaignInstanceAuditEvent_subject_name_size_check" CHECK (char_length("subjectName") BETWEEN 1 AND 240),
  CONSTRAINT "CampaignInstanceAuditEvent_subject_type_size_check" CHECK (char_length("subjectType") BETWEEN 1 AND 120),
  CONSTRAINT "CampaignInstanceAuditEvent_detail_shape_check" CHECK (jsonb_typeof("detail") = 'object' AND pg_column_size("detail") <= 32768)
);

CREATE TABLE "CampaignInstanceInvitationDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "channel" "DeliveryChannel" NOT NULL,
  "status" "DeliveryStatus" NOT NULL,
  "providerReference" TEXT,
  "failureCategory" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignInstanceInvitationDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignInstanceInvitationDeliveryAttempt_reference_size_check" CHECK ("providerReference" IS NULL OR char_length("providerReference") <= 500),
  CONSTRAINT "CampaignInstanceInvitationDeliveryAttempt_failure_size_check" CHECK ("failureCategory" IS NULL OR char_length("failureCategory") <= 120)
);

-- Earlier application versions checked for duplicate pending invitations before
-- insertion but had no database race guard. Reconcile any race-created rows
-- deterministically before adding the partial unique indexes. Within each
-- Instance, invitations are considered newest by createdAt and then id. A row
-- remains pending only when neither of its non-null protected contact hashes is
-- already held by a newer retained row. Older conflicts are revoked without
-- reading, logging, or rewriting encrypted contact values or invitation tokens.
WITH RECURSIVE "pendingInvitationOrder" AS (
  SELECT
    invitation."campaignInstanceId",
    invitation."id",
    invitation."emailHash",
    invitation."phoneHash",
    row_number() OVER (
      PARTITION BY invitation."campaignInstanceId"
      ORDER BY invitation."createdAt" DESC, invitation."id" DESC
    ) AS "position"
  FROM "CampaignInstanceInvitation" invitation
  WHERE invitation."status" = 'PENDING'
),
"pendingInvitationResolution" AS (
  SELECT
    ordered."campaignInstanceId",
    ordered."id",
    ordered."position",
    ARRAY_REMOVE(ARRAY[ordered."emailHash"], NULL)::TEXT[] AS "retainedEmailHashes",
    ARRAY_REMOVE(ARRAY[ordered."phoneHash"], NULL)::TEXT[] AS "retainedPhoneHashes",
    TRUE AS "retain"
  FROM "pendingInvitationOrder" ordered
  WHERE ordered."position" = 1

  UNION ALL

  SELECT
    candidate."campaignInstanceId",
    candidate."id",
    candidate."position",
    CASE
      WHEN decision."retain" AND candidate."emailHash" IS NOT NULL
      THEN prior."retainedEmailHashes" || candidate."emailHash"
      ELSE prior."retainedEmailHashes"
    END,
    CASE
      WHEN decision."retain" AND candidate."phoneHash" IS NOT NULL
      THEN prior."retainedPhoneHashes" || candidate."phoneHash"
      ELSE prior."retainedPhoneHashes"
    END,
    decision."retain"
  FROM "pendingInvitationResolution" prior
  JOIN "pendingInvitationOrder" candidate
    ON candidate."campaignInstanceId" = prior."campaignInstanceId"
   AND candidate."position" = prior."position" + 1
  CROSS JOIN LATERAL (
    SELECT
      (candidate."emailHash" IS NULL OR NOT candidate."emailHash" = ANY(prior."retainedEmailHashes"))
      AND
      (candidate."phoneHash" IS NULL OR NOT candidate."phoneHash" = ANY(prior."retainedPhoneHashes"))
      AS "retain"
  ) decision
)
UPDATE "CampaignInstanceInvitation" invitation
SET
  "status" = 'REVOKED',
  "revokedAt" = GREATEST(invitation."createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = GREATEST(invitation."updatedAt", CURRENT_TIMESTAMP)
FROM "pendingInvitationResolution" resolution
WHERE resolution."campaignInstanceId" = invitation."campaignInstanceId"
  AND resolution."id" = invitation."id"
  AND NOT resolution."retain";

CREATE INDEX "CampaignInstance_ownerUserId_status_idx"
ON "CampaignInstance"("ownerUserId", "status");
CREATE UNIQUE INDEX "CampaignInstance_ownerUserId_creationKeyHash_key"
ON "CampaignInstance"("ownerUserId", "creationKeyHash");
CREATE UNIQUE INDEX "CampaignInstanceInvitation_pending_email_key"
ON "CampaignInstanceInvitation"("campaignInstanceId", "emailHash")
WHERE "status" = 'PENDING' AND "emailHash" IS NOT NULL;
CREATE UNIQUE INDEX "CampaignInstanceInvitation_pending_phone_key"
ON "CampaignInstanceInvitation"("campaignInstanceId", "phoneHash")
WHERE "status" = 'PENDING' AND "phoneHash" IS NOT NULL;
CREATE UNIQUE INDEX "CampaignInstanceInvitation_instance_id_key"
ON "CampaignInstanceInvitation"("campaignInstanceId", "id");
CREATE INDEX "CampaignInstanceInvitationDeliveryAttempt_invitation_attempted_idx"
ON "CampaignInstanceInvitationDeliveryAttempt"("campaignInstanceId", "invitationId", "attemptedAt");

CREATE UNIQUE INDEX "CampaignInstanceSnapshot_instance_id_predecessor_key"
ON "CampaignInstanceSnapshot"("campaignInstanceId", "id", "predecessorSnapshotId");

CREATE UNIQUE INDEX "CampaignInstanceRuntimeCheckpoint_instance_number_key"
ON "CampaignInstanceRuntimeCheckpoint"("campaignInstanceId", "checkpointNumber");
CREATE UNIQUE INDEX "CampaignInstanceRuntimeCheckpoint_instance_id_key"
ON "CampaignInstanceRuntimeCheckpoint"("campaignInstanceId", "id");
CREATE UNIQUE INDEX "CampaignInstanceRuntimeCheckpoint_instance_id_snapshot_key"
ON "CampaignInstanceRuntimeCheckpoint"("campaignInstanceId", "id", "campaignInstanceSnapshotId");
CREATE INDEX "CampaignInstanceRuntimeCheckpoint_snapshot_created_idx"
ON "CampaignInstanceRuntimeCheckpoint"("campaignInstanceSnapshotId", "createdAt");
CREATE INDEX "CampaignInstanceRuntimeCheckpoint_contentHash_idx"
ON "CampaignInstanceRuntimeCheckpoint"("contentHash");

CREATE UNIQUE INDEX "CampaignInstanceMigrationAudit_resultSnapshotId_key"
ON "CampaignInstanceMigrationAudit"("resultSnapshotId");
CREATE UNIQUE INDEX "CampaignInstanceMigrationAudit_resultCheckpointId_key"
ON "CampaignInstanceMigrationAudit"("resultRuntimeCheckpointId");
CREATE UNIQUE INDEX "CampaignInstanceMigrationAudit_instance_result_source_key"
ON "CampaignInstanceMigrationAudit"("campaignInstanceId", "resultSnapshotId", "sourceSnapshotId");
CREATE UNIQUE INDEX "CampaignInstanceMigrationAudit_instance_resultCheckpoint_snapshot_key"
ON "CampaignInstanceMigrationAudit"("campaignInstanceId", "resultRuntimeCheckpointId", "resultSnapshotId");
CREATE INDEX "CampaignInstanceMigrationAudit_instance_applied_idx"
ON "CampaignInstanceMigrationAudit"("campaignInstanceId", "appliedAt");
CREATE INDEX "CampaignInstanceMigrationAudit_source_result_idx"
ON "CampaignInstanceMigrationAudit"("sourceSnapshotId", "resultSnapshotId");
CREATE INDEX "CampaignInstanceMigrationAudit_planHash_idx"
ON "CampaignInstanceMigrationAudit"("planHash");
CREATE INDEX "CampaignInstanceAuditEvent_instance_created_idx"
ON "CampaignInstanceAuditEvent"("campaignInstanceId", "createdAt");
CREATE INDEX "CampaignInstanceAuditEvent_actor_created_idx"
ON "CampaignInstanceAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "CampaignInstance"
ADD CONSTRAINT "CampaignInstance_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignInstanceRuntimeCheckpoint"
ADD CONSTRAINT "CampaignInstanceRuntimeCheckpoint_instance_fkey"
FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceRuntimeCheckpoint"
ADD CONSTRAINT "CampaignInstanceRuntimeCheckpoint_snapshot_fkey"
FOREIGN KEY ("campaignInstanceId", "campaignInstanceSnapshotId")
REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceRuntimeCheckpoint"
ADD CONSTRAINT "CampaignInstanceRuntimeCheckpoint_actor_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignInstanceMigrationAudit"
ADD CONSTRAINT "CampaignInstanceMigrationAudit_instance_fkey"
FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceMigrationAudit"
ADD CONSTRAINT "CampaignInstanceMigrationAudit_source_snapshot_fkey"
FOREIGN KEY ("campaignInstanceId", "sourceSnapshotId")
REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceMigrationAudit"
ADD CONSTRAINT "CampaignInstanceMigrationAudit_result_snapshot_fkey"
FOREIGN KEY ("campaignInstanceId", "resultSnapshotId", "sourceSnapshotId")
REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id", "predecessorSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceMigrationAudit"
ADD CONSTRAINT "CampaignInstanceMigrationAudit_source_checkpoint_fkey"
FOREIGN KEY ("campaignInstanceId", "sourceRuntimeCheckpointId", "sourceSnapshotId")
REFERENCES "CampaignInstanceRuntimeCheckpoint"("campaignInstanceId", "id", "campaignInstanceSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceMigrationAudit"
ADD CONSTRAINT "CampaignInstanceMigrationAudit_result_checkpoint_fkey"
FOREIGN KEY ("campaignInstanceId", "resultRuntimeCheckpointId", "resultSnapshotId")
REFERENCES "CampaignInstanceRuntimeCheckpoint"("campaignInstanceId", "id", "campaignInstanceSnapshotId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceMigrationAudit"
ADD CONSTRAINT "CampaignInstanceMigrationAudit_actor_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignInstanceAuditEvent"
ADD CONSTRAINT "CampaignInstanceAuditEvent_instance_fkey"
FOREIGN KEY ("campaignInstanceId") REFERENCES "CampaignInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceAuditEvent"
ADD CONSTRAINT "CampaignInstanceAuditEvent_actor_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceInvitationDeliveryAttempt"
ADD CONSTRAINT "CampaignInstanceInvitationDeliveryAttempt_invitation_fkey"
FOREIGN KEY ("campaignInstanceId", "invitationId")
REFERENCES "CampaignInstanceInvitation"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "CampaignInstanceRuntimeCheckpoint_immutable"
BEFORE UPDATE OR DELETE ON "CampaignInstanceRuntimeCheckpoint"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();

CREATE TRIGGER "CampaignInstanceMigrationAudit_append_only"
BEFORE UPDATE OR DELETE ON "CampaignInstanceMigrationAudit"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
CREATE TRIGGER "CampaignInstanceAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "CampaignInstanceAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_definition_mutation"();
