-- A paused Session is durable resumable state, not installation-wide active
-- execution. Multiple Campaign Instances may therefore retain paused Sessions;
-- only a Session accepting live play commands is globally exclusive.
DROP INDEX "CampaignInstanceSession_single_resumable_installation_key";

CREATE UNIQUE INDEX "CampaignInstanceSession_single_active_installation_key"
ON "CampaignInstanceSession" ((true))
WHERE "status" = 'ACTIVE';
