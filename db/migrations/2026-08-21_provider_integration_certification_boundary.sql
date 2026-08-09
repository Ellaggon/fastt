-- Phase 1: explicit security boundary for non-commercial integration certification.
-- A certification tenant is never a shortcut through KYC, fiscal, payment or publication governance.

ALTER TABLE "Provider"
	ADD COLUMN IF NOT EXISTS "accountPurpose" text NOT NULL DEFAULT 'commercial';

UPDATE "Provider"
SET "accountPurpose" = 'commercial'
WHERE "accountPurpose" IS NULL
	OR "accountPurpose" NOT IN ('commercial', 'internal_qa', 'integration_certification');

ALTER TABLE "Provider"
	DROP CONSTRAINT IF EXISTS "Provider_accountPurpose_check";
ALTER TABLE "Provider"
	ADD CONSTRAINT "Provider_accountPurpose_check"
	CHECK ("accountPurpose" IN ('commercial', 'internal_qa', 'integration_certification'));

CREATE TABLE IF NOT EXISTS "ProviderIntegrationCertification" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL REFERENCES "Provider" ("id"),
	"connectionId" text NOT NULL REFERENCES "ProviderIntegrationConnection" ("id") ON DELETE CASCADE,
	"vendorKey" text NOT NULL,
	"fixtureProductId" text,
	"status" text NOT NULL DEFAULT 'draft',
	"suiteVersion" text,
	"createdBy" text REFERENCES "User" ("id") ON DELETE SET NULL,
	"activatedBy" text REFERENCES "User" ("id") ON DELETE SET NULL,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"evidenceManifestJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "ProviderIntegrationCertification_status_check"
		CHECK ("status" IN ('draft', 'prepared', 'ready', 'running', 'requires_attention', 'completed', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS "ProviderIntegrationCertification_provider_status_idx"
	ON "ProviderIntegrationCertification" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationCertification_connection_status_idx"
	ON "ProviderIntegrationCertification" ("connectionId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationCertification_one_active_connection_unique"
	ON "ProviderIntegrationCertification" ("connectionId")
	WHERE "status" IN ('draft', 'prepared', 'ready', 'running', 'requires_attention');

ALTER TABLE "ProviderIntegrationSyncRun"
	ADD COLUMN IF NOT EXISTS "certificationId" text;
ALTER TABLE "ProviderIntegrationSyncRun"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationSyncRun_certificationId_fk";
ALTER TABLE "ProviderIntegrationSyncRun"
	ADD CONSTRAINT "ProviderIntegrationSyncRun_certificationId_fk"
	FOREIGN KEY ("certificationId")
	REFERENCES "ProviderIntegrationCertification" ("id")
	ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncRun_certification_started_idx"
	ON "ProviderIntegrationSyncRun" ("certificationId", "startedAt" DESC);

DROP TRIGGER IF EXISTS "trg_ProviderIntegrationCertification_touch_updatedAt"
	ON "ProviderIntegrationCertification";
CREATE TRIGGER "trg_ProviderIntegrationCertification_touch_updatedAt"
	BEFORE UPDATE ON "ProviderIntegrationCertification"
	FOR EACH ROW EXECUTE FUNCTION fastt_touch_updated_at();
