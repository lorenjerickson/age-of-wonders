import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("system-boundaries migration", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260910000000_system_boundaries_wave/migration.sql",
    ),
    "utf8",
  );

  it("adds requester/context provenance for AI generation history", () => {
    expect(migration).toContain('ADD COLUMN "contextType" TEXT');
    expect(migration).toContain(
      '"Generation_createdByUserId_contextType_createdAt_idx"',
    );
  });

  it("adds creator and aggregate-scope provenance for media", () => {
    expect(migration).toContain('ADD COLUMN "createdByUserId" TEXT');
    expect(migration).toContain('"MediaAsset_scopeType_scopeId_idx"');
    expect(migration).toContain('"MediaAsset_scope_pair_check"');
  });
});
