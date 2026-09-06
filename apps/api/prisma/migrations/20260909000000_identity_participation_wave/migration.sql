CREATE TYPE "SystemAdministratorStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "SystemAdministrator" (
    "id" TEXT NOT NULL,
    "singletonKey" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "emailEncrypted" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "phoneEncrypted" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "status" "SystemAdministratorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemAdministrator_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuthenticationProviderAssociation"
ADD COLUMN "userId" TEXT;

UPDATE "AuthenticationProviderAssociation" association
SET "userId" = profile."userId"
FROM "PlayerProfile" profile
WHERE association."playerProfileId" = profile."id";

ALTER TABLE "AuthenticationProviderAssociation"
ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "playerProfileId" DROP NOT NULL;

CREATE UNIQUE INDEX "SystemAdministrator_userId_key"
ON "SystemAdministrator"("userId");
CREATE UNIQUE INDEX "SystemAdministrator_singletonKey_key"
ON "SystemAdministrator"("singletonKey");
CREATE UNIQUE INDEX "SystemAdministrator_emailHash_key"
ON "SystemAdministrator"("emailHash");
CREATE UNIQUE INDEX "SystemAdministrator_phoneHash_key"
ON "SystemAdministrator"("phoneHash");
CREATE INDEX "SystemAdministrator_status_displayName_idx"
ON "SystemAdministrator"("status", "displayName");

CREATE UNIQUE INDEX "AuthenticationProviderAssociation_userId_providerKey_key"
ON "AuthenticationProviderAssociation"("userId", "providerKey");
CREATE INDEX "AuthenticationProviderAssociation_userId_status_idx"
ON "AuthenticationProviderAssociation"("userId", "status");

ALTER TABLE "SystemAdministrator"
ADD CONSTRAINT "SystemAdministrator_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthenticationProviderAssociation"
ADD CONSTRAINT "AuthenticationProviderAssociation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthenticationProviderAssociation"
DROP CONSTRAINT "AuthenticationProviderAssociation_playerProfileId_fkey";

ALTER TABLE "AuthenticationProviderAssociation"
ADD CONSTRAINT "AuthenticationProviderAssociation_playerProfileId_userId_fkey"
FOREIGN KEY ("playerProfileId", "userId") REFERENCES "PlayerProfile"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SystemAdministrator"
ADD CONSTRAINT "SystemAdministrator_singleton_check"
CHECK ("singletonKey" = 1);
