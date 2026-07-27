ALTER TABLE "ProviderExternalCalendar"
	ADD COLUMN IF NOT EXISTS "feedUrlEncrypted" JSONB,
	ADD COLUMN IF NOT EXISTS "feedUrlHost" TEXT,
	ADD COLUMN IF NOT EXISTS "feedUrlFingerprint" TEXT;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "ProviderExternalCalendar") THEN
		RAISE EXCEPTION
			'ProviderExternalCalendar contains plaintext URLs. Run the key-backed URL backfill before this migration.';
	END IF;
END
$$;

DROP INDEX IF EXISTS "ProviderExternalCalendar_provider_variant_url_unique";

ALTER TABLE "ProviderExternalCalendar"
	DROP COLUMN IF EXISTS "feedUrl",
	ALTER COLUMN "feedUrlEncrypted" SET NOT NULL,
	ALTER COLUMN "feedUrlHost" SET NOT NULL,
	ALTER COLUMN "feedUrlFingerprint" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderExternalCalendar_provider_variant_fingerprint_unique"
	ON "ProviderExternalCalendar" ("providerId", "variantId", "feedUrlFingerprint");
