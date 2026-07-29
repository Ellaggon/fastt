-- ProviderIntegrationCredential is the only source of authentication material.
-- ProviderIntegrationConnection keeps only public connector configuration.

ALTER TABLE "ProviderIntegrationConnection"
	ADD COLUMN IF NOT EXISTS "endpointUrl" TEXT;

UPDATE "ProviderIntegrationConnection"
SET "endpointUrl" = "credentialsRef"
WHERE "endpointUrl" IS NULL
	AND "credentialsRef" LIKE 'https://%';

ALTER TABLE "ProviderIntegrationConnection"
	DROP COLUMN IF EXISTS "credentialsRef";

COMMENT ON COLUMN "ProviderIntegrationConnection"."endpointUrl" IS
	'Public HTTPS endpoint. API keys, OAuth tokens and secret references belong exclusively to ProviderIntegrationCredential.';

ALTER TABLE "ProviderIntegrationConnection"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationConnection_endpoint_url_check";

ALTER TABLE "ProviderIntegrationConnection"
	ADD CONSTRAINT "ProviderIntegrationConnection_endpoint_url_check"
	CHECK ("endpointUrl" IS NULL OR "endpointUrl" ~ '^https://');

ALTER TABLE "ProviderIntegrationCredential"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationCredential_auth_type_check";

ALTER TABLE "ProviderIntegrationCredential"
	ADD CONSTRAINT "ProviderIntegrationCredential_auth_type_check"
	CHECK ("authType" IN ('api_key', 'oauth2', 'reference'));
