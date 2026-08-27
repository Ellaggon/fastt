-- House rules stay product-default. A variant row is only an override of the
-- hotel, never a commercial Cancellation/Payment/NoShow contract.
ALTER TABLE "HouseRule"
	ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'product',
	ADD COLUMN IF NOT EXISTS "scopeId" text;

UPDATE "HouseRule"
SET "scope" = 'product',
	"scopeId" = NULL
WHERE "scope" IS DISTINCT FROM 'product'
	OR "scopeId" IS NOT NULL;

DELETE FROM "HouseRule" AS duplicate
USING "HouseRule" AS keeper
WHERE duplicate."scope" = 'product'
	AND keeper."scope" = 'product'
	AND duplicate."productId" = keeper."productId"
	AND duplicate."type" = keeper."type"
	AND duplicate."createdAt" > keeper."createdAt";

DELETE FROM "HouseRule" AS duplicate
USING "HouseRule" AS keeper
WHERE duplicate."scope" = 'product'
	AND keeper."scope" = 'product'
	AND duplicate."productId" = keeper."productId"
	AND duplicate."type" = keeper."type"
	AND duplicate."id" > keeper."id";

ALTER TABLE "HouseRule"
	DROP CONSTRAINT IF EXISTS "HouseRule_scope_check",
	DROP CONSTRAINT IF EXISTS "HouseRule_scope_shape_check",
	DROP CONSTRAINT IF EXISTS "HouseRule_variant_type_check";

ALTER TABLE "HouseRule"
	ADD CONSTRAINT "HouseRule_scope_check"
	CHECK ("scope" IN ('product', 'variant')),
	ADD CONSTRAINT "HouseRule_scope_shape_check"
	CHECK (
		("scope" = 'product' AND "scopeId" IS NULL)
		OR ("scope" = 'variant' AND "scopeId" IS NOT NULL)
	),
	ADD CONSTRAINT "HouseRule_variant_type_check"
	CHECK (
		"scope" = 'product'
		OR "type" IN ('Pets', 'Smoking', 'Access', 'Safety', 'ExtraBeds')
	);

ALTER TABLE "HouseRule"
	DROP CONSTRAINT IF EXISTS "HouseRule_scopeId_fk";

ALTER TABLE "HouseRule"
	ADD CONSTRAINT "HouseRule_scopeId_fk"
	FOREIGN KEY ("scopeId")
	REFERENCES "Variant" ("id")
	ON DELETE CASCADE;

DROP INDEX IF EXISTS "HouseRule_productId_type_idx";
CREATE INDEX IF NOT EXISTS "HouseRule_productId_scope_idx"
	ON "HouseRule" ("productId", "scope");
CREATE UNIQUE INDEX IF NOT EXISTS "HouseRule_product_type_unique"
	ON "HouseRule" ("productId", "type")
	WHERE "scope" = 'product';
CREATE UNIQUE INDEX IF NOT EXISTS "HouseRule_variant_type_unique"
	ON "HouseRule" ("scopeId", "type")
	WHERE "scope" = 'variant';

CREATE OR REPLACE FUNCTION fastt_house_rule_variant_belongs_to_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."scope" = 'variant' THEN
		IF NOT EXISTS (
			SELECT 1
			FROM "Variant"
			WHERE "Variant"."id" = NEW."scopeId"
				AND "Variant"."productId" = NEW."productId"
				AND "Variant"."kind" = 'hotel_room'
		) THEN
			RAISE EXCEPTION 'HOUSE_RULE_VARIANT_SCOPE_MISMATCH';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_HouseRule_variant_product" ON "HouseRule";
CREATE TRIGGER "trg_HouseRule_variant_product"
BEFORE INSERT OR UPDATE OF "scope", "scopeId", "productId" ON "HouseRule"
FOR EACH ROW
EXECUTE FUNCTION fastt_house_rule_variant_belongs_to_product();
