-- A nullable provider would defeat PostgreSQL unique semantics for a keyed
-- command. Require provider identity whenever a durable write key is present.

ALTER TABLE "CommercialRule"
	DROP CONSTRAINT "CommercialRule_idempotency_pair_check";

ALTER TABLE "CommercialRule"
	ADD CONSTRAINT "CommercialRule_idempotency_pair_check" CHECK (
		("idempotencyKey" IS NULL AND "idempotencyPayloadHash" IS NULL)
		OR (
			"idempotencyKey" IS NOT NULL
			AND "providerId" IS NOT NULL
			AND length(trim("idempotencyKey")) > 0
			AND "idempotencyPayloadHash" ~ '^[a-f0-9]{64}$'
		)
	);
