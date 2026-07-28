-- Phase 1: drop unused integration / iCal columns.
-- previewJson / lastPreviewAt were never read or written by application code.
-- syncLease* was only ever cleared to NULL; SyncJob lockedBy/lockedAt owns leases.

ALTER TABLE "ProviderIntegrationConnection"
	DROP COLUMN IF EXISTS "previewJson",
	DROP COLUMN IF EXISTS "lastPreviewAt";

ALTER TABLE "ProviderExternalCalendar"
	DROP COLUMN IF EXISTS "syncLeaseToken",
	DROP COLUMN IF EXISTS "syncLeaseUntil";
