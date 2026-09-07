CREATE TABLE "QuickStartProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityKey" TEXT NOT NULL,
    "activityRevision" INTEGER NOT NULL,
    "currentStepKey" TEXT,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "selfConfirmedStepKeys" JSONB NOT NULL DEFAULT '[]',
    "targetContext" JSONB NOT NULL DEFAULT '{}',
    "lastCanonicalRoute" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickStartProgress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuickStartProgress_revision_check" CHECK ("activityRevision" > 0),
    CONSTRAINT "QuickStartProgress_self_confirmations_check" CHECK (jsonb_typeof("selfConfirmedStepKeys") = 'array'),
    CONSTRAINT "QuickStartProgress_target_context_check" CHECK (jsonb_typeof("targetContext") = 'object')
);

CREATE UNIQUE INDEX "QuickStartProgress_userId_activityKey_key"
ON "QuickStartProgress"("userId", "activityKey");

CREATE INDEX "QuickStartProgress_userId_updatedAt_idx"
ON "QuickStartProgress"("userId", "updatedAt");

ALTER TABLE "QuickStartProgress"
ADD CONSTRAINT "QuickStartProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
