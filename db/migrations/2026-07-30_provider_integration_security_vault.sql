ALTER TABLE "ProviderIntegrationCredential"
	ADD COLUMN IF NOT EXISTS "scopesJson" JSONB,
	ADD COLUMN IF NOT EXISTS "refreshAfterAt" TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS "lastRefreshedAt" TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "ProviderIntegrationCredential_expiry_idx"
	ON "ProviderIntegrationCredential" ("providerId", "tokenExpiresAt");
