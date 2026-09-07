import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260916000000_quick_start_guidance/migration.sql",
  ),
  "utf8",
);

describe("Quick Start persistence", () => {
  it("keeps one versioned tutorial progress record per GM and activity", () => {
    expect(migration).toContain('CREATE TABLE "QuickStartProgress"');
    expect(migration).toContain('"activityRevision" INTEGER NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "QuickStartProgress_userId_activityKey_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain('"QuickStartProgress_revision_check"');
  });

  it("stores only guidance context rather than copied domain completion", () => {
    expect(migration).toContain('"targetContext" JSONB');
    expect(migration).toContain('"selfConfirmedStepKeys" JSONB');
    expect(migration).not.toContain('"completedStepKeys"');
    expect(migration).not.toContain('"complete" BOOLEAN');
  });
});
