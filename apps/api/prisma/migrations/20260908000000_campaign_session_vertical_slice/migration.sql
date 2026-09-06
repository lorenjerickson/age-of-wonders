-- Campaign Session vertical slice. This migration is additive: legacy JSON eventLog/summary
-- columns remain read-only import evidence while normalized records become authoritative.

CREATE TYPE "SessionParticipantRole" AS ENUM ('GM', 'PLAYER', 'SPECTATOR', 'AGENT');
CREATE TYPE "SessionInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');
CREATE TYPE "SessionPresencePhase" AS ENUM ('LOBBY', 'PLAY');
CREATE TYPE "SessionEventVisibility" AS ENUM ('GM', 'PARTICIPANTS', 'PLAYERS', 'SPECTATORS', 'SESSION_PUBLIC');
CREATE TYPE "SessionBoundaryReason" AS ENUM ('START', 'PAUSE', 'RESUME_AFTER_MIGRATION', 'CONCLUDE');
CREATE TYPE "SessionSummaryStatus" AS ENUM ('DRAFT', 'APPROVED', 'AMENDED');

-- Contact hashes are protected equality keys for durable identities. Duplicate
-- non-null values make invitation matching ambiguous, so report counts without
-- exposing hashes, encrypted contact values, profile names, or internal IDs.
DO $player_profile_contact_preflight$
DECLARE
  duplicate_email_groups BIGINT;
  duplicate_email_profiles NUMERIC;
  duplicate_phone_groups BIGINT;
  duplicate_phone_profiles NUMERIC;
BEGIN
  SELECT count(*), COALESCE(sum(profile_count), 0)
  INTO duplicate_email_groups, duplicate_email_profiles
  FROM (
    SELECT count(*) AS profile_count
    FROM "PlayerProfile"
    WHERE "emailHash" IS NOT NULL
    GROUP BY "emailHash"
    HAVING count(*) > 1
  ) duplicate_emails;

  SELECT count(*), COALESCE(sum(profile_count), 0)
  INTO duplicate_phone_groups, duplicate_phone_profiles
  FROM (
    SELECT count(*) AS profile_count
    FROM "PlayerProfile"
    WHERE "phoneHash" IS NOT NULL
    GROUP BY "phoneHash"
    HAVING count(*) > 1
  ) duplicate_phones;

  IF duplicate_email_groups > 0 OR duplicate_phone_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'Campaign Session migration blocked: Player profiles contain %s duplicate email-hash groups across %s profiles and %s duplicate phone-hash groups across %s profiles.',
        duplicate_email_groups,
        duplicate_email_profiles,
        duplicate_phone_groups,
        duplicate_phone_profiles
      ),
      HINT = 'Merge or reconcile the duplicate Player identities without exposing contact data, then retry the migration.';
  END IF;
END;
$player_profile_contact_preflight$;

-- The preceding schema allowed any number of PAUSED Sessions while enforcing
-- only one ACTIVE Session. Do not silently choose or mutate a resumable Session:
-- an operator must reconcile the durable lifecycle records before deployment.
DO $campaign_session_resumable_preflight$
DECLARE
  active_count BIGINT;
  paused_count BIGINT;
BEGIN
  SELECT
    count(*) FILTER (WHERE "status" = 'ACTIVE'),
    count(*) FILTER (WHERE "status" = 'PAUSED')
  INTO active_count, paused_count
  FROM "CampaignInstanceSession";

  IF active_count + paused_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'Campaign Session migration blocked: found %s ACTIVE and %s PAUSED Sessions; at most one resumable Session may remain installation-wide.',
        active_count,
        paused_count
      ),
      HINT = 'Conclude or cancel the extra resumable Sessions through the application, then retry the migration.';
  END IF;
END;
$campaign_session_resumable_preflight$;

-- Replace the enum atomically so LOBBY may be used by constraints in this same
-- migration transaction. The dependent constraint and index are recreated below.
ALTER TABLE "CampaignInstanceSession" DROP CONSTRAINT "CampaignInstanceSession_lifecycle_check";
DROP INDEX "CampaignInstanceSession_single_active_installation_key";
ALTER TYPE "CampaignInstanceSessionStatus" RENAME TO "CampaignInstanceSessionStatus_old";
CREATE TYPE "CampaignInstanceSessionStatus" AS ENUM ('PLANNED', 'LOBBY', 'ACTIVE', 'PAUSED', 'CONCLUDED', 'CANCELLED');
ALTER TABLE "CampaignInstanceSession"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "CampaignInstanceSessionStatus"
    USING ("status"::text::"CampaignInstanceSessionStatus"),
  ALTER COLUMN "status" SET DEFAULT 'PLANNED';
DROP TYPE "CampaignInstanceSessionStatus_old";

ALTER TABLE "CampaignInstanceSession"
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "creationKeyHash" TEXT,
  ADD COLUMN "currentSummaryRevision" INTEGER,
  ADD COLUMN "endRuntimeRevision" INTEGER,
  ADD COLUMN "endSnapshotId" TEXT,
  ADD COLUMN "firstEventSequence" INTEGER,
  ADD COLUMN "lastEventSequence" INTEGER,
  ADD COLUMN "lastRuntimeRevision" INTEGER,
  ADD COLUMN "lobbyOpenedAt" TIMESTAMP(3),
  ADD COLUMN "metadataRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "pausedAt" TIMESTAMP(3),
  ADD COLUMN "planningNotes" TEXT,
  ADD COLUMN "resumedAt" TIMESTAMP(3),
  ADD COLUMN "startRuntimeRevision" INTEGER,
  ADD COLUMN "startSnapshotId" TEXT,
  ADD COLUMN "summaryStatus" "SessionSummaryStatus";

ALTER TABLE "SessionParticipation"
  ADD COLUMN "observeCapabilities" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "actCapabilities" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selected" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "respondedAt" TIMESTAMP(3),
  ADD COLUMN "responseMessage" TEXT,
  ADD COLUMN "role" "SessionParticipantRole",
  ADD COLUMN "totalPresentSeconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "SessionParticipation" participation
SET "role" = CASE
  WHEN membership."role" = 'GM' THEN 'GM'::"SessionParticipantRole"
  WHEN membership."role" = 'PLAYER' THEN 'PLAYER'::"SessionParticipantRole"
  ELSE 'SPECTATOR'::"SessionParticipantRole"
END,
"required" = COALESCE(membership."role" IN ('GM', 'PLAYER'), false),
"observeCapabilities" = CASE
  WHEN membership."role" IN ('GM', 'PLAYER', 'SPECTATOR') THEN '["session:observe"]'::jsonb
  ELSE '[]'::jsonb
END,
"actCapabilities" = CASE
  WHEN membership."role" = 'GM' THEN '["session:operate", "session:participate"]'::jsonb
  WHEN membership."role" = 'PLAYER' THEN '["session:participate"]'::jsonb
  ELSE '[]'::jsonb
END
FROM "CampaignInstanceHumanMembership" membership
WHERE membership."id" = participation."humanMembershipId";

UPDATE "SessionParticipation"
SET "role" = 'AGENT',
    "observeCapabilities" = '["aow:event-stream"]'::jsonb,
    "actCapabilities" = '[]'::jsonb
WHERE "agentParticipationId" IS NOT NULL;

ALTER TABLE "SessionParticipation" ALTER COLUMN "role" SET NOT NULL;

-- Preserve normalized legacy columns as evidence and mark rows whose JSON history
-- was not losslessly converted into the new append-only event/summary structures.
UPDATE "CampaignInstanceSession"
SET "extensions" = COALESCE("extensions", '{}'::jsonb) ||
  jsonb_build_object('aow:legacy-session-history', true)
WHERE "eventLog" <> '[]'::jsonb OR "summary" IS NOT NULL;

-- Supply deterministic lifecycle evidence required by the strengthened checks
-- without inventing snapshot/runtime provenance for legacy rows.
UPDATE "CampaignInstanceSession"
SET "pausedAt" = COALESCE("updatedAt", "startedAt")
WHERE "status" = 'PAUSED' AND "pausedAt" IS NULL;

UPDATE "CampaignInstanceSession"
SET "cancellationReason" = 'Cancelled before Session lifecycle tracking was introduced.'
WHERE "status" = 'CANCELLED' AND "cancellationReason" IS NULL;

CREATE TABLE "CampaignSessionInvitation" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "participationId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "predecessorInvitationId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "status" "SessionInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "issuedByUserId" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignSessionInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignSessionInvitationDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "channel" "DeliveryChannel" NOT NULL,
  "status" "DeliveryStatus" NOT NULL,
  "providerReference" TEXT,
  "failureCategory" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignSessionInvitationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionPresenceLease" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "participationId" TEXT NOT NULL,
  "connectionKeyHash" TEXT NOT NULL,
  "phase" "SessionPresencePhase" NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "leftAt" TIMESTAMP(3),
  "ejectedAt" TIMESTAMP(3),
  CONSTRAINT "SessionPresenceLease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignSessionEvent" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "campaignTime" TEXT,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorParticipationId" TEXT,
  "visibility" "SessionEventVisibility" NOT NULL DEFAULT 'PARTICIPANTS',
  "runtimeRevisionBefore" INTEGER,
  "runtimeRevisionAfter" INTEGER,
  "causedBySequence" INTEGER,
  "payload" JSONB,
  "extensions" JSONB NOT NULL DEFAULT '{}',
  "previousHash" TEXT,
  "contentHash" TEXT NOT NULL,
  CONSTRAINT "CampaignSessionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignSessionRuntimeBoundary" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "runtimeRevision" INTEGER NOT NULL,
  "reason" "SessionBoundaryReason" NOT NULL,
  "eventSequence" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignSessionRuntimeBoundary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignSessionSummary" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" "SessionSummaryStatus" NOT NULL,
  "eventSequenceThrough" INTEGER NOT NULL,
  "narrative" TEXT NOT NULL,
  "privateGmNotes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignSessionSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignSessionOutboxEvent" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "CampaignSessionOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignSessionInvitation_tokenHash_key" ON "CampaignSessionInvitation"("tokenHash");
CREATE INDEX "CampaignSessionInvitation_sessionId_status_idx" ON "CampaignSessionInvitation"("sessionId", "status");
CREATE INDEX "CampaignSessionInvitation_expiresAt_idx" ON "CampaignSessionInvitation"("expiresAt");
CREATE UNIQUE INDEX "CampaignSessionInvitation_campaignInstanceId_sessionId_id_key" ON "CampaignSessionInvitation"("campaignInstanceId", "sessionId", "id");
CREATE UNIQUE INDEX "CampaignSessionInvitation_scope_id_key" ON "CampaignSessionInvitation"("campaignInstanceId", "sessionId", "participationId", "id");
CREATE UNIQUE INDEX "CampaignSessionInvitation_participationId_revision_key" ON "CampaignSessionInvitation"("participationId", "revision");
CREATE UNIQUE INDEX "CampaignSessionInvitation_single_pending_participation_key" ON "CampaignSessionInvitation"("participationId") WHERE "status" = 'PENDING';
CREATE INDEX "CampaignSessionInvitationDeliveryAttempt_invitationId_attem_idx" ON "CampaignSessionInvitationDeliveryAttempt"("invitationId", "attemptedAt");
CREATE UNIQUE INDEX "SessionPresenceLease_connectionKeyHash_key" ON "SessionPresenceLease"("connectionKeyHash");
CREATE INDEX "SessionPresenceLease_sessionId_expiresAt_idx" ON "SessionPresenceLease"("sessionId", "expiresAt");
CREATE INDEX "SessionPresenceLease_participationId_expiresAt_idx" ON "SessionPresenceLease"("participationId", "expiresAt");
CREATE INDEX "CampaignSessionEvent_sessionId_occurredAt_idx" ON "CampaignSessionEvent"("sessionId", "occurredAt");
CREATE UNIQUE INDEX "CampaignSessionEvent_sessionId_sequence_key" ON "CampaignSessionEvent"("sessionId", "sequence");
CREATE INDEX "CampaignSessionRuntimeBoundary_campaignInstanceId_snapshotI_idx" ON "CampaignSessionRuntimeBoundary"("campaignInstanceId", "snapshotId");
CREATE UNIQUE INDEX "CampaignSessionRuntimeBoundary_sessionId_eventSequence_key" ON "CampaignSessionRuntimeBoundary"("sessionId", "eventSequence");
CREATE INDEX "CampaignSessionSummary_sessionId_status_idx" ON "CampaignSessionSummary"("sessionId", "status");
CREATE UNIQUE INDEX "CampaignSessionSummary_sessionId_revision_key" ON "CampaignSessionSummary"("sessionId", "revision");
CREATE INDEX "CampaignSessionOutboxEvent_type_deliveredAt_createdAt_idx" ON "CampaignSessionOutboxEvent"("type", "deliveredAt", "createdAt");
CREATE UNIQUE INDEX "CampaignInstanceSession_campaignInstanceId_creationKeyHash_key" ON "CampaignInstanceSession"("campaignInstanceId", "creationKeyHash");
CREATE UNIQUE INDEX "SessionParticipation_campaignInstanceId_sessionId_id_key" ON "SessionParticipation"("campaignInstanceId", "sessionId", "id");
DROP INDEX "PlayerProfile_emailHash_idx";
DROP INDEX "PlayerProfile_phoneHash_idx";
CREATE UNIQUE INDEX "PlayerProfile_emailHash_key" ON "PlayerProfile"("emailHash");
CREATE UNIQUE INDEX "PlayerProfile_phoneHash_key" ON "PlayerProfile"("phoneHash");

CREATE UNIQUE INDEX "CampaignInstanceSession_single_resumable_installation_key"
ON "CampaignInstanceSession" ((true)) WHERE "status" IN ('ACTIVE', 'PAUSED');

ALTER TABLE "CampaignInstanceSession" ADD CONSTRAINT "CampaignInstanceSession_lifecycle_check" CHECK (
  (
    "status" = 'PLANNED'
    AND "startedAt" IS NULL AND "concludedAt" IS NULL AND "cancelledAt" IS NULL
  )
  OR (
    "status" = 'LOBBY'
    AND "lobbyOpenedAt" IS NOT NULL
    AND "startedAt" IS NULL AND "concludedAt" IS NULL AND "cancelledAt" IS NULL
  )
  OR (
    "status" = 'ACTIVE'
    AND "startedAt" IS NOT NULL
    AND "concludedAt" IS NULL AND "cancelledAt" IS NULL
    AND ("pausedAt" IS NULL OR ("resumedAt" IS NOT NULL AND "resumedAt" >= "pausedAt"))
  )
  OR (
    "status" = 'PAUSED'
    AND "startedAt" IS NOT NULL
    AND "pausedAt" IS NOT NULL AND "pausedAt" >= "startedAt"
    AND "concludedAt" IS NULL AND "cancelledAt" IS NULL
  )
  OR (
    "status" = 'CONCLUDED'
    AND "startedAt" IS NOT NULL
    AND "concludedAt" >= "startedAt"
    AND "cancelledAt" IS NULL
  )
  OR (
    "status" = 'CANCELLED'
    AND "concludedAt" IS NULL
    AND "cancelledAt" IS NOT NULL
    AND ("startedAt" IS NULL OR "cancelledAt" >= "startedAt")
  )
);
ALTER TABLE "CampaignInstanceSession" ADD CONSTRAINT "CampaignInstanceSession_revision_shape_check" CHECK (
  "metadataRevision" > 0
  AND ("startRuntimeRevision" IS NULL OR "startRuntimeRevision" > 0)
  AND ("lastRuntimeRevision" IS NULL OR "lastRuntimeRevision" > 0)
  AND ("endRuntimeRevision" IS NULL OR "endRuntimeRevision" > 0)
  AND ("firstEventSequence" IS NULL OR "firstEventSequence" > 0)
  AND ("lastEventSequence" IS NULL OR "lastEventSequence" > 0)
  AND ("firstEventSequence" IS NULL OR "lastEventSequence" IS NULL OR "firstEventSequence" <= "lastEventSequence")
  AND ("currentSummaryRevision" IS NULL OR "currentSummaryRevision" > 0)
  AND (("startSnapshotId" IS NULL) = ("startRuntimeRevision" IS NULL))
  AND (("endSnapshotId" IS NULL) = ("endRuntimeRevision" IS NULL))
  AND (("currentSummaryRevision" IS NULL) = ("summaryStatus" IS NULL))
  AND (("status" = 'CANCELLED' AND "cancellationReason" IS NOT NULL AND length(btrim("cancellationReason")) > 0) OR ("status" <> 'CANCELLED' AND "cancellationReason" IS NULL))
);
ALTER TABLE "SessionParticipation" ADD CONSTRAINT "SessionParticipation_session_fields_check" CHECK (
  "totalPresentSeconds" >= 0
  AND jsonb_typeof("observeCapabilities") = 'array'
  AND jsonb_typeof("actCapabilities") = 'array'
  AND (
    "role" <> 'AGENT'
    OR (
      "observeCapabilities" <@ '["aow:event-stream", "aow:presence", "aow:session-state"]'::jsonb
      AND "actCapabilities" <@ '["aow:draft-narrative", "aow:suggest-content", "aow:suggest-plot-twist"]'::jsonb
    )
  )
  AND ("respondedAt" IS NULL OR "response" IN ('ACCEPTED', 'DECLINED'))
);
ALTER TABLE "CampaignSessionEvent" ADD CONSTRAINT "CampaignSessionEvent_shape_check" CHECK (
  "sequence" > 0 AND length("type") BETWEEN 1 AND 120 AND length("summary") BETWEEN 1 AND 2000
  AND jsonb_typeof("extensions") = 'object' AND ("payload" IS NULL OR pg_column_size("payload") <= 65536)
);
ALTER TABLE "CampaignSessionSummary" ADD CONSTRAINT "CampaignSessionSummary_shape_check" CHECK (
  "revision" > 0 AND "eventSequenceThrough" > 0 AND length("narrative") <= 20000
  AND ("privateGmNotes" IS NULL OR length("privateGmNotes") <= 10000)
  AND (("status" = 'DRAFT' AND "approvedAt" IS NULL) OR ("status" IN ('APPROVED', 'AMENDED') AND "approvedAt" IS NOT NULL))
);
ALTER TABLE "CampaignSessionInvitation" ADD CONSTRAINT "CampaignSessionInvitation_shape_check" CHECK (
  "revision" > 0
  AND "expiresAt" > "issuedAt"
  AND ("predecessorInvitationId" IS NULL OR "predecessorInvitationId" <> "id")
  AND (("revision" = 1 AND "predecessorInvitationId" IS NULL) OR ("revision" > 1 AND "predecessorInvitationId" IS NOT NULL))
  AND (
    ("status" IN ('PENDING', 'DECLINED', 'EXPIRED') AND "acceptedAt" IS NULL AND "revokedAt" IS NULL)
    OR ("status" = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "acceptedAt" >= "issuedAt" AND "revokedAt" IS NULL)
    OR ("status" = 'REVOKED' AND "acceptedAt" IS NULL AND "revokedAt" IS NOT NULL AND "revokedAt" >= "issuedAt")
  )
);
ALTER TABLE "CampaignSessionRuntimeBoundary" ADD CONSTRAINT "CampaignSessionRuntimeBoundary_shape_check" CHECK (
  "runtimeRevision" > 0 AND "eventSequence" > 0 AND length("contentHash") > 0
);

ALTER TABLE "CampaignInstanceSession" ADD CONSTRAINT "CampaignInstanceSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceSession" ADD CONSTRAINT "CampaignInstanceSession_campaignInstanceId_startSnapshotId_fkey" FOREIGN KEY ("campaignInstanceId", "startSnapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInstanceSession" ADD CONSTRAINT "CampaignInstanceSession_campaignInstanceId_endSnapshotId_fkey" FOREIGN KEY ("campaignInstanceId", "endSnapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionInvitation" ADD CONSTRAINT "CampaignSessionInvitation_campaignInstanceId_sessionId_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionInvitation" ADD CONSTRAINT "CampaignSessionInvitation_campaignInstanceId_sessionId_par_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId", "participationId") REFERENCES "SessionParticipation"("campaignInstanceId", "sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionInvitation" ADD CONSTRAINT "CampaignSessionInvitation_predecessor_scope_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId", "participationId", "predecessorInvitationId") REFERENCES "CampaignSessionInvitation"("campaignInstanceId", "sessionId", "participationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionInvitation" ADD CONSTRAINT "CampaignSessionInvitation_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionInvitationDeliveryAttempt" ADD CONSTRAINT "CampaignSessionInvitationDeliveryAttempt_campaignInstanceI_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId", "invitationId") REFERENCES "CampaignSessionInvitation"("campaignInstanceId", "sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionPresenceLease" ADD CONSTRAINT "SessionPresenceLease_campaignInstanceId_sessionId_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionPresenceLease" ADD CONSTRAINT "SessionPresenceLease_campaignInstanceId_sessionId_particip_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId", "participationId") REFERENCES "SessionParticipation"("campaignInstanceId", "sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionEvent" ADD CONSTRAINT "CampaignSessionEvent_campaignInstanceId_sessionId_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionEvent" ADD CONSTRAINT "CampaignSessionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionEvent" ADD CONSTRAINT "CampaignSessionEvent_campaignInstanceId_sessionId_actorPar_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId", "actorParticipationId") REFERENCES "SessionParticipation"("campaignInstanceId", "sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionRuntimeBoundary" ADD CONSTRAINT "CampaignSessionRuntimeBoundary_campaignInstanceId_sessionI_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionRuntimeBoundary" ADD CONSTRAINT "CampaignSessionRuntimeBoundary_campaignInstanceId_snapshot_fkey" FOREIGN KEY ("campaignInstanceId", "snapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionRuntimeBoundary" ADD CONSTRAINT "CampaignSessionRuntimeBoundary_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionSummary" ADD CONSTRAINT "CampaignSessionSummary_campaignInstanceId_sessionId_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionSummary" ADD CONSTRAINT "CampaignSessionSummary_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignSessionOutboxEvent" ADD CONSTRAINT "CampaignSessionOutboxEvent_campaignInstanceId_sessionId_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_campaign_session_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Campaign Session history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CampaignSessionEvent_append_only"
BEFORE UPDATE OR DELETE ON "CampaignSessionEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_campaign_session_history_mutation"();

CREATE TRIGGER "CampaignSessionRuntimeBoundary_append_only"
BEFORE UPDATE OR DELETE ON "CampaignSessionRuntimeBoundary"
FOR EACH ROW EXECUTE FUNCTION "reject_campaign_session_history_mutation"();

CREATE FUNCTION "protect_approved_campaign_session_summary"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('APPROVED', 'AMENDED') THEN
    RAISE EXCEPTION 'Approved Campaign Session summaries are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CampaignSessionSummary_approved_immutable"
BEFORE UPDATE OR DELETE ON "CampaignSessionSummary"
FOR EACH ROW EXECUTE FUNCTION "protect_approved_campaign_session_summary"();
