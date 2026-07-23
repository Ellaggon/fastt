CREATE TABLE IF NOT EXISTS "RatePlanConditionState" (
	"id" text PRIMARY KEY NOT NULL,
	"ratePlanId" text NOT NULL,
	"providerId" text NOT NULL,
	"productId" text NOT NULL,
	"variantId" text NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"totalCategories" integer DEFAULT 0 NOT NULL,
	"coveredCategories" integer DEFAULT 0 NOT NULL,
	"missingCategoriesJson" jsonb NOT NULL,
	"conditionsComplete" boolean DEFAULT false NOT NULL,
	"summary" text NOT NULL,
	"policyCoverageUpdatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan" ("id") ON DELETE CASCADE;

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_providerId_fk"
	FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE;

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_productId_fk"
	FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_variantId_fk"
	FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "RatePlanConditionState_ratePlan_channel_unique"
	ON "RatePlanConditionState" ("ratePlanId", "channel");

CREATE INDEX IF NOT EXISTS "RatePlanConditionState_provider_updated_idx"
	ON "RatePlanConditionState" ("providerId", "updatedAt");

CREATE INDEX IF NOT EXISTS "RatePlanConditionState_product_idx"
	ON "RatePlanConditionState" ("productId");

CREATE INDEX IF NOT EXISTS "RatePlanConditionState_variant_idx"
	ON "RatePlanConditionState" ("variantId");

CREATE INDEX IF NOT EXISTS "RatePlanConditionState_complete_idx"
	ON "RatePlanConditionState" ("conditionsComplete");

CREATE OR REPLACE FUNCTION fastt_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updatedAt" = now();
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_RatePlanConditionState_touch_updatedAt" ON "RatePlanConditionState";
CREATE TRIGGER "trg_RatePlanConditionState_touch_updatedAt"
BEFORE UPDATE ON "RatePlanConditionState"
FOR EACH ROW
EXECUTE FUNCTION fastt_touch_updated_at();
