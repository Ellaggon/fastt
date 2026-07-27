ALTER TABLE "ProviderIntegrationConnection"
	ADD COLUMN IF NOT EXISTS "vendorKey" TEXT,
	ADD COLUMN IF NOT EXISTS "authType" TEXT,
	ADD COLUMN IF NOT EXISTS "externalPropertyId" TEXT,
	ADD COLUMN IF NOT EXISTS "catalogJson" JSONB,
	ADD COLUMN IF NOT EXISTS "lastCatalogSyncAt" TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS "previewJson" JSONB,
	ADD COLUMN IF NOT EXISTS "lastPreviewAt" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "ProviderIntegrationCredential" (
	"connectionId" TEXT PRIMARY KEY NOT NULL
		REFERENCES "ProviderIntegrationConnection" ("id") ON DELETE CASCADE,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"authType" TEXT NOT NULL,
	"encryptedJson" JSONB NOT NULL,
	"tokenExpiresAt" TIMESTAMPTZ,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ProviderIntegrationCredential_provider_idx"
	ON "ProviderIntegrationCredential" ("providerId");
