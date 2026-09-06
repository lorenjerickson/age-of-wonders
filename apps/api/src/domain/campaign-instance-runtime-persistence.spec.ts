import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260907000000_campaign_instance_runtime_foundation/migration.sql",
  ),
  "utf8",
);

describe("Campaign Instance runtime foundation migration", () => {
  it("adds explicit Instance ownership and optimistic metadata concurrency", () => {
    expect(migration).toMatch(
      /ALTER TABLE "CampaignInstance"\s+ADD COLUMN "ownerUserId" TEXT/,
    );
    expect(migration).toContain(
      'ADD COLUMN "metadataRevision" INTEGER NOT NULL DEFAULT 1',
    );
    expect(migration).toContain('ADD COLUMN "creationKeyHash" TEXT');
    expect(migration).toContain(
      '"CampaignInstance_ownerUserId_creationKeyHash_key"',
    );
    expect(migration).not.toContain('"creationKey" TEXT');
    expect(migration).toContain(
      'CONSTRAINT "CampaignInstance_metadata_revision_check" CHECK ("metadataRevision" > 0)',
    );
  });

  it("stores immutable pre- and post-adoption runtime checkpoints", () => {
    expect(migration).toContain(
      'CREATE TABLE "CampaignInstanceRuntimeCheckpoint"',
    );
    expect(migration).toContain("'MIGRATION_SOURCE'");
    expect(migration).toContain("'MIGRATION_RESULT'");
    expect(migration).toContain("'RESTORE_SOURCE'");
    expect(migration).toContain("'RESTORE_RESULT'");
    expect(migration).toContain(
      'CREATE TRIGGER "CampaignInstanceRuntimeCheckpoint_immutable"',
    );
  });

  it("binds migration audit source and result records to the same Instance", () => {
    expect(migration).toContain(
      'CREATE TABLE "CampaignInstanceMigrationAudit"',
    );
    expect(migration).toMatch(
      /FOREIGN KEY \("campaignInstanceId", "sourceSnapshotId"\)\s+REFERENCES "CampaignInstanceSnapshot"\("campaignInstanceId", "id"\)/,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \("campaignInstanceId", "resultSnapshotId", "sourceSnapshotId"\)\s+REFERENCES "CampaignInstanceSnapshot"\("campaignInstanceId", "id", "predecessorSnapshotId"\)/,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \("campaignInstanceId", "sourceRuntimeCheckpointId", "sourceSnapshotId"\)\s+REFERENCES "CampaignInstanceRuntimeCheckpoint"\("campaignInstanceId", "id", "campaignInstanceSnapshotId"\)/,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \("campaignInstanceId", "resultRuntimeCheckpointId", "resultSnapshotId"\)\s+REFERENCES "CampaignInstanceRuntimeCheckpoint"\("campaignInstanceId", "id", "campaignInstanceSnapshotId"\)/,
    );
  });

  it("keeps audit and checkpoint JSON bounded to structured containers", () => {
    expect(migration).toContain(
      "jsonb_typeof(\"state\") = 'object' AND jsonb_typeof(\"extensions\") = 'object'",
    );
    expect(migration).toContain("jsonb_typeof(\"resolutionPlan\") = 'object'");
    expect(migration).toContain(
      'CREATE TRIGGER "CampaignInstanceMigrationAudit_append_only"',
    );
  });

  it("persists bounded append-only administrative audit events and invitation race guards", () => {
    expect(migration).toContain('CREATE TABLE "CampaignInstanceAuditEvent"');
    expect(migration).toContain(
      'CONSTRAINT "CampaignInstanceAuditEvent_detail_shape_check"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "CampaignInstanceAuditEvent_append_only"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "CampaignInstanceInvitation_pending_email_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "CampaignInstanceInvitation_pending_phone_key"',
    );
    const reconciliation = migration.indexOf(
      'WITH RECURSIVE "pendingInvitationOrder"',
    );
    const pendingEmailIndex = migration.indexOf(
      'CREATE UNIQUE INDEX "CampaignInstanceInvitation_pending_email_key"',
    );
    expect(reconciliation).toBeGreaterThan(-1);
    expect(reconciliation).toBeLessThan(pendingEmailIndex);
    expect(migration).toContain(
      'ORDER BY invitation."createdAt" DESC, invitation."id" DESC',
    );
    expect(migration).toContain('SET\n  "status" = \'REVOKED\'');
    expect(migration).not.toMatch(
      /pendingInvitationResolution[\s\S]*?(emailEncrypted|phoneEncrypted|tokenHash)/,
    );
    expect(migration).toContain(
      'CREATE TABLE "CampaignInstanceInvitationDeliveryAttempt"',
    );
    expect(migration).toContain(
      '"providerReference" TEXT',
    );
    expect(migration).not.toContain('"recipient" TEXT');
  });
});
