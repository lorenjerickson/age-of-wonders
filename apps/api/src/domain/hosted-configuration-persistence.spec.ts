import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260913000000_hosted_configuration/migration.sql",
  ),
  "utf8",
);

describe("Hosted configuration persistence", () => {
  it("keeps values and encrypted secrets mutually exclusive", () => {
    expect(migration).toContain('CREATE TABLE "ConfigurationBinding"');
    expect(migration).toContain('"secretEncrypted" TEXT');
    expect(migration).not.toContain('"secretHash" TEXT');
    expect(migration).toContain(
      'CONSTRAINT "ConfigurationBinding_shape_check"',
    );
    expect(migration).toContain(
      'CONSTRAINT "ConfigurationBinding_validation_check"',
    );
  });

  it("makes value-free configuration history append-only", () => {
    expect(migration).toContain('CREATE TABLE "ConfigurationRevision"');
    expect(migration).not.toContain('"secret" TEXT NOT NULL');
    expect(migration).toContain('"ConfigurationRevision_append_only"');
    expect(migration).toContain("Configuration history is append-only");
  });
});
