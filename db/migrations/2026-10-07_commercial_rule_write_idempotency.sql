-- A rule write may be retried after an interruption between persistence and
-- downstream materialization. Keep both the caller identity and a canonical
-- payload hash so retries are safe while key reuse with different intent fails.

ALTER TABLE "CommercialRule"
	ADD COLUMN "idempotencyKey" text,
	ADD COLUMN "idempotencyPayloadHash" text;

ALTER TABLE "CommercialRule"
	ADD CONSTRAINT "CommercialRule_idempotency_pair_check" CHECK (
		("idempotencyKey" IS NULL AND "idempotencyPayloadHash" IS NULL)
		OR (
			"idempotencyKey" IS NOT NULL
			AND length(trim("idempotencyKey")) > 0
			AND "idempotencyPayloadHash" ~ '^[a-f0-9]{64}$'
		)
	);

CREATE UNIQUE INDEX "CommercialRule_provider_idempotency_unique"
	ON "CommercialRule" ("providerId", "idempotencyKey")
	WHERE "idempotencyKey" IS NOT NULL;
