CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationConnection_one_primary_unique"
	ON "ProviderIntegrationConnection" ("providerId", "connectorKey")
	WHERE "isPrimary" = true;
