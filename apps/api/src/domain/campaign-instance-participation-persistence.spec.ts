import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260904010000_campaign_instance_participation_spine/migration.sql",
  ),
  "utf8",
);

const characterCompletionMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260912000000_character_completion_review/migration.sql",
  ),
  "utf8",
);

const pausedSessionCorrectionMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260914000000_allow_multiple_paused_sessions/migration.sql",
  ),
  "utf8",
);

describe("Campaign Instance participation migration", () => {
  it("enforces same-Instance relationships with composite foreign keys", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("campaignInstanceId", "humanMembershipId") REFERENCES "CampaignInstanceHumanMembership"("campaignInstanceId", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("campaignInstanceId", "agentParticipationId") REFERENCES "CampaignInstanceAgentParticipation"("campaignInstanceId", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("campaignInstanceId", "playerMembershipId", "playerMembershipRole") REFERENCES "CampaignInstanceHumanMembership"("campaignInstanceId", "id", "role")',
    );
  });

  it("requires exactly one Session participant and one installation-wide active Session", () => {
    expect(migration).toContain(
      'CONSTRAINT "SessionParticipation_exactly_one_participant_check"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "CampaignInstanceSession_single_active_installation_key"',
    );
    expect(migration).toContain("WHERE \"status\" = 'ACTIVE'");
  });

  it("restores the active-only Session invariant after the Session vertical slice", () => {
    expect(pausedSessionCorrectionMigration).toContain(
      'DROP INDEX "CampaignInstanceSession_single_resumable_installation_key"',
    );
    expect(pausedSessionCorrectionMigration).toContain(
      'CREATE UNIQUE INDEX "CampaignInstanceSession_single_active_installation_key"',
    );
    expect(pausedSessionCorrectionMigration).toContain(
      "WHERE \"status\" = 'ACTIVE'",
    );
    expect(pausedSessionCorrectionMigration).not.toContain(
      "WHERE \"status\" IN ('ACTIVE', 'PAUSED')",
    );
  });

  it("enforces lifecycle-consistent provider associations, invitations, and Sessions", () => {
    expect(migration).toContain(
      'CONSTRAINT "AuthenticationProviderAssociation_lifecycle_check"',
    );
    expect(migration).toContain(
      'CONSTRAINT "CampaignInstanceInvitation_lifecycle_check"',
    );
    expect(migration).toContain(
      'CONSTRAINT "CampaignInstanceSession_lifecycle_check"',
    );
    expect(migration).toMatch(
      /"status" = 'ACCEPTED'\s+AND "acceptedMembershipId" IS NOT NULL/,
    );
    expect(migration).toMatch(
      /"status" = 'CONCLUDED'\s+AND "startedAt" IS NOT NULL\s+AND "concludedAt" IS NOT NULL/,
    );
  });

  it("requires Agent capability grants to be arrays of namespaced strings", () => {
    expect(migration).toContain(
      'CREATE FUNCTION "is_namespaced_key_array"(value JSONB)',
    );
    expect(migration).toContain("jsonb_typeof(capability) <> 'string'");
    expect(migration).toContain("separator := position(':' in key)");
    expect(migration).toContain(
      "IF separator <= 1 OR separator >= char_length(key)",
    );
    expect(migration).toContain(
      '"is_namespaced_key_array"("observeCapabilities")',
    );
    expect(migration).toContain('"is_namespaced_key_array"("actCapabilities")');
  });

  it("stores identity and invitation secrets only in protected forms", () => {
    expect(migration).toContain('"emailEncrypted" TEXT');
    expect(migration).toContain('"emailHash" TEXT');
    expect(migration).toContain('"phoneEncrypted" TEXT');
    expect(migration).toContain('"phoneHash" TEXT');
    expect(migration).toContain('"providerSubjectHash" TEXT NOT NULL');
    expect(migration).toContain('"providerSubjectEncrypted" TEXT');
    expect(migration).toContain('"credentialReference" TEXT');
    expect(migration).toContain('"tokenHash" TEXT NOT NULL');
    expect(migration).not.toContain('"providerSubject" TEXT');
    expect(migration).not.toContain('"token" TEXT');
  });
});

describe("Campaign Instance Character completion migration", () => {
  it("persists review provenance without weakening the Instance relationship", () => {
    expect(characterCompletionMigration).toContain(
      'ADD COLUMN "reviewedByUserId" TEXT',
    );
    expect(characterCompletionMigration).toContain(
      'FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")',
    );
    expect(characterCompletionMigration).toContain(
      'CREATE INDEX "InstanceCharacterDraft_reviewer_idx"',
    );
  });

  it("backfills resumable drafts for existing Character associations", () => {
    expect(characterCompletionMigration).toContain(
      'INSERT INTO "CampaignInstanceCharacterDraft"',
    );
    expect(characterCompletionMigration).toContain(
      'FROM "CampaignInstanceCharacterAssociation" association',
    );
    expect(characterCompletionMigration).toContain("'IN_PROGRESS'");
    expect(characterCompletionMigration).toContain(
      'WHERE draft."characterId" IS NULL',
    );
  });
});
