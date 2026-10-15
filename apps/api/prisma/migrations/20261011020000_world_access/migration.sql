CREATE TABLE "WorldAccessEntry" (
  "id" TEXT NOT NULL,
  "worldDefinitionId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('viewer', 'editor')),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorldAccessEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorldAccessEntry_worldDefinitionId_fkey" FOREIGN KEY ("worldDefinitionId") REFERENCES "WorldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorldAccessEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorldAccessEntry_worldDefinitionId_playerId_key" ON "WorldAccessEntry"("worldDefinitionId", "playerId");
