ALTER TABLE "ProviderExternalCalendar"
	ADD COLUMN IF NOT EXISTS "syncEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
	ADD COLUMN IF NOT EXISTS "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
	ADD COLUMN IF NOT EXISTS "nextSyncAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	ADD COLUMN IF NOT EXISTS "lastAutomaticSyncAt" TIMESTAMP,
	ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS "syncLeaseToken" TEXT,
	ADD COLUMN IF NOT EXISTS "syncLeaseUntil" TIMESTAMP;

UPDATE "ProviderExternalCalendar"
SET
	"syncEnabled" = FALSE,
	"nextSyncAt" = CURRENT_TIMESTAMP
WHERE "status" = 'revoked';

CREATE INDEX IF NOT EXISTS "ProviderExternalCalendar_due_sync_idx"
	ON "ProviderExternalCalendar" ("syncEnabled", "status", "nextSyncAt")
	WHERE "syncEnabled" = TRUE AND "status" <> 'revoked';

ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_sync_interval_check"
	CHECK ("syncIntervalMinutes" BETWEEN 15 AND 10080);

ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_consecutive_failures_check"
	CHECK ("consecutiveFailures" >= 0);
