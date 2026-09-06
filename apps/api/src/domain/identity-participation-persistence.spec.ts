import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260909000000_identity_participation_wave/migration.sql",
  ),
  "utf8",
);

describe("Identity and participation migration", () => {
  it("permits exactly one protected installation administrator", () => {
    expect(migration).toContain('CREATE TABLE "SystemAdministrator"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "SystemAdministrator_singletonKey_key"',
    );
    expect(migration).toContain(
      'CONSTRAINT "SystemAdministrator_singleton_check"',
    );
    expect(migration).toContain('"emailEncrypted" TEXT NOT NULL');
    expect(migration).toContain('"emailHash" TEXT NOT NULL');
    expect(migration).toContain('"phoneEncrypted" TEXT NOT NULL');
    expect(migration).toContain('"phoneHash" TEXT NOT NULL');
    expect(migration).not.toContain('"email" TEXT');
    expect(migration).not.toContain('"phone" TEXT');
  });

  it("moves provider identity to User while preserving optional profile consistency", () => {
    expect(migration).toContain('ADD COLUMN "userId" TEXT');
    expect(migration).toContain('ALTER COLUMN "playerProfileId" DROP NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "AuthenticationProviderAssociation_userId_fkey"',
    );
    expect(migration).toContain(
      'CONSTRAINT "AuthenticationProviderAssociation_playerProfileId_userId_fkey"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("playerProfileId", "userId") REFERENCES "PlayerProfile"("id", "userId")',
    );
  });
});
