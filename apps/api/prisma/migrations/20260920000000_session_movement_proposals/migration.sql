CREATE TABLE "CampaignSessionMovementProposal" (
  "id" TEXT NOT NULL,
  "campaignInstanceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "runtimeRevision" INTEGER NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "nextState" JSONB NOT NULL,
  "projection" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "decisionKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignSessionMovementProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignSessionMovementProposal_status_check" CHECK ("status" IN ('pending','approved','rejected','no-op','failed')),
  CONSTRAINT "CampaignSessionMovementProposal_session_fkey" FOREIGN KEY ("campaignInstanceId", "sessionId") REFERENCES "CampaignInstanceSession"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CampaignSessionMovementProposal_snapshot_fkey" FOREIGN KEY ("campaignInstanceId", "snapshotId") REFERENCES "CampaignInstanceSnapshot"("campaignInstanceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CampaignSessionMovementProposal_sessionId_requestKey_key" ON "CampaignSessionMovementProposal"("sessionId", "requestKey");
CREATE INDEX "CampaignSessionMovementProposal_sessionId_createdAt_idx" ON "CampaignSessionMovementProposal"("sessionId", "createdAt");
