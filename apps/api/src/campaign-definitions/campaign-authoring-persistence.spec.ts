import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260906000000_campaign_definition_authoring/migration.sql"),
  "utf8",
);

describe("Campaign Definition authoring persistence", () => {
  it("adds nullable creator ownership for legacy-safe, requester-scoped Generation history", () => {
    expect(migration).toContain('ALTER TABLE "Generation" ADD COLUMN "createdByUserId" TEXT');
    expect(migration).toContain('"Generation_createdByUserId_createdAt_idx"');
    expect(migration).toContain('CONSTRAINT "Generation_createdByUserId_fkey"');
  });

  it("pins drafts to same-lineage Campaign and World snapshots", () => {
    expect(migration).toContain('FOREIGN KEY ("campaignDefinitionId", "worldDefinitionId")');
    expect(migration).toContain('FOREIGN KEY ("baseSnapshotId", "campaignDefinitionId", "baseRevisionId")');
    expect(migration).toContain('FOREIGN KEY ("capturedWorldSnapshotId", "worldDefinitionId")');
  });

  it("makes fork and migration provenance append-only", () => {
    expect(migration).toContain('"CampaignDefinitionForkProvenance_immutable"');
    expect(migration).toContain('"CampaignDefinitionWorldMigrationAudit_append_only"');
    expect(migration).toContain('"CampaignDefinitionWorldMigrationAudit_draft_key"');
    expect(migration).toContain('FOREIGN KEY ("predecessorCampaignRevisionId", "campaignDefinitionId", "sourceWorldSnapshotId")');
    expect(migration).toContain('FOREIGN KEY ("resultCampaignRevisionId", "campaignDefinitionId", "targetWorldSnapshotId")');
  });

  it("keeps one canonical snapshot per published Campaign revision", () => {
    expect(migration).toContain('"CampaignDefinitionSnapshot_revision_key"');
    expect(migration).toContain('"CampaignDefinitionRevision_campaign_source_draft_key"');
  });
});
