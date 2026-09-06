CREATE TYPE "ConfigurationBindingKind" AS ENUM ('VALUE', 'SECRET', 'DISABLED', 'INHERIT');
CREATE TYPE "ConfigurationValidationStatus" AS ENUM ('UNTESTED', 'VALID', 'INVALID');
CREATE TYPE "ConfigurationRevisionAction" AS ENUM (
  'VALUE_SET',
  'SECRET_REPLACED',
  'SECRET_ROTATED',
  'SECRET_REVOKED',
  'OVERRIDE_RESET',
  'VALIDATION_SUCCEEDED',
  'VALIDATION_FAILED'
);

CREATE TABLE "ConfigurationBinding" (
  "id" TEXT NOT NULL,
  "definitionKey" TEXT NOT NULL,
  "kind" "ConfigurationBindingKind" NOT NULL,
  "value" JSONB,
  "secretEncrypted" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "validationStatus" "ConfigurationValidationStatus" NOT NULL DEFAULT 'UNTESTED',
  "validatedAt" TIMESTAMP(3),
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConfigurationBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConfigurationBinding_key_size_check" CHECK (char_length("definitionKey") BETWEEN 1 AND 120),
  CONSTRAINT "ConfigurationBinding_version_check" CHECK ("version" > 0),
  CONSTRAINT "ConfigurationBinding_shape_check" CHECK (
    ("kind" = 'VALUE' AND "value" IS NOT NULL AND "secretEncrypted" IS NULL)
    OR ("kind" = 'SECRET' AND "value" IS NULL AND "secretEncrypted" IS NOT NULL)
    OR ("kind" = 'DISABLED' AND "value" IS NULL AND "secretEncrypted" IS NULL)
    OR ("kind" = 'INHERIT' AND "value" IS NULL AND "secretEncrypted" IS NULL)
  ),
  CONSTRAINT "ConfigurationBinding_validation_check" CHECK (
    ("validationStatus" = 'UNTESTED' AND "validatedAt" IS NULL)
    OR ("validationStatus" IN ('VALID', 'INVALID') AND "validatedAt" IS NOT NULL)
  )
);

CREATE TABLE "ConfigurationRevision" (
  "id" TEXT NOT NULL,
  "configurationBindingId" TEXT NOT NULL,
  "configurationVersion" INTEGER NOT NULL,
  "action" "ConfigurationRevisionAction" NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfigurationRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConfigurationRevision_version_check" CHECK ("configurationVersion" > 0),
  CONSTRAINT "ConfigurationRevision_reason_size_check" CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX "ConfigurationBinding_definitionKey_key" ON "ConfigurationBinding"("definitionKey");
CREATE INDEX "ConfigurationBinding_kind_updatedAt_idx" ON "ConfigurationBinding"("kind", "updatedAt");
CREATE INDEX "ConfigurationBinding_updatedByUserId_updatedAt_idx" ON "ConfigurationBinding"("updatedByUserId", "updatedAt");
CREATE INDEX "ConfigurationRevision_configurationBindingId_createdAt_idx" ON "ConfigurationRevision"("configurationBindingId", "createdAt");
CREATE INDEX "ConfigurationRevision_actorUserId_createdAt_idx" ON "ConfigurationRevision"("actorUserId", "createdAt");

ALTER TABLE "ConfigurationBinding"
ADD CONSTRAINT "ConfigurationBinding_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConfigurationRevision"
ADD CONSTRAINT "ConfigurationRevision_configurationBindingId_fkey"
FOREIGN KEY ("configurationBindingId") REFERENCES "ConfigurationBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConfigurationRevision"
ADD CONSTRAINT "ConfigurationRevision_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "reject_configuration_revision_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Configuration history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConfigurationRevision_append_only"
BEFORE UPDATE OR DELETE ON "ConfigurationRevision"
FOR EACH ROW EXECUTE FUNCTION "reject_configuration_revision_mutation"();
