import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260905000000_world_authoring_lifecycle/migration.sql",
  ),
  "utf8",
);

describe("World authoring lifecycle persistence", () => {
  it("allows only one optimistic draft per World lineage", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "WorldDefinitionDraft_worldDefinitionId_key"',
    );
    expect(migration).toContain(
      'CONSTRAINT "WorldDefinitionDraft_validation_check"',
    );
    expect(migration).toContain(
      '"validatedStorageRevision" = "storageRevision"',
    );
  });

  it("ties draft bases and forks to same-lineage immutable snapshots", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("baseSnapshotId", "worldDefinitionId", "baseRevisionId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("sourceSnapshotId", "sourceWorldDefinitionId")',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "WorldDefinitionForkProvenance_immutable"',
    );
  });

  it("persists exact World model-release selections and immutable registry releases", () => {
    expect(migration).toContain(
      'CREATE TABLE "WorldDefinitionRevisionModelSchemaRelease"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("modelSchemaReleaseId") REFERENCES "ModelSchemaRelease"("id")',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ModelElementRevision_immutable"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ModelSchemaRelease_immutable"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "WorldDefinitionRevisionModelSchemaRelease_immutable"',
    );
  });

  it("scopes GM registry keys by owner while reserving global keys", () => {
    expect(migration).toContain('"ModelRegistry_ownerUserId_key_key"');
    expect(migration).toContain('"ModelRegistry_global_key_key"');
    expect(migration).toContain('WHERE "ownerUserId" IS NULL');
  });
});
