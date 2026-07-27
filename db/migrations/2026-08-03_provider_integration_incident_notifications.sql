ALTER TABLE "ProviderIntegrationIncident"
	ADD COLUMN IF NOT EXISTS "notificationStatus" TEXT NOT NULL DEFAULT 'pending',
	ADD COLUMN IF NOT EXISTS "notificationChannelsJson" JSONB,
	ADD COLUMN IF NOT EXISTS "notificationAttemptCount" INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS "notificationError" TEXT;

ALTER TABLE "ProviderIntegrationIncident"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationIncident_notification_status_check";
ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_notification_status_check"
	CHECK ("notificationStatus" IN ('pending', 'sent', 'partial', 'failed', 'skipped', 'not_configured'));

ALTER TABLE "ProviderIntegrationIncident"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationIncident_notification_attempts_check";
ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_notification_attempts_check"
	CHECK ("notificationAttemptCount" >= 0);
