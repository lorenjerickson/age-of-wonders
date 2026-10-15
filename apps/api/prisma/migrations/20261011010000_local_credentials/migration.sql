CREATE TABLE "LocalCredential" (
  "userId" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalCredential_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "LocalCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LocalCredential_accountName_key" ON "LocalCredential"("accountName");
