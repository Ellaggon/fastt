-- EffectivePricingV2 was the first and only persisted effective-pricing projection.
-- Rename it in place so existing rows, foreign keys and consumers keep one canonical identity.
DO $$
BEGIN
	IF to_regclass('"EffectivePricingV2"') IS NOT NULL
		AND to_regclass('"EffectivePricing"') IS NULL THEN
		ALTER TABLE "EffectivePricingV2" RENAME TO "EffectivePricing";
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('"EffectivePricing"') IS NOT NULL
		AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EffectivePricingV2_variantId_fk') THEN
		ALTER TABLE "EffectivePricing" RENAME CONSTRAINT "EffectivePricingV2_variantId_fk" TO "EffectivePricing_variantId_fk";
	END IF;
	IF to_regclass('"EffectivePricing"') IS NOT NULL
		AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EffectivePricingV2_ratePlanId_fk') THEN
		ALTER TABLE "EffectivePricing" RENAME CONSTRAINT "EffectivePricingV2_ratePlanId_fk" TO "EffectivePricing_ratePlanId_fk";
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('"EffectivePricingV2_variant_rate_date_occupancy_unique"') IS NOT NULL THEN
		ALTER INDEX "EffectivePricingV2_variant_rate_date_occupancy_unique" RENAME TO "EffectivePricing_variant_rate_date_occupancy_unique";
	END IF;
	IF to_regclass('"EffectivePricingV2_ratePlan_date_idx"') IS NOT NULL THEN
		ALTER INDEX "EffectivePricingV2_ratePlan_date_idx" RENAME TO "EffectivePricing_ratePlan_date_idx";
	END IF;
	IF to_regclass('"EffectivePricingV2_ratePlan_occupancy_date_idx"') IS NOT NULL THEN
		ALTER INDEX "EffectivePricingV2_ratePlan_occupancy_date_idx" RENAME TO "EffectivePricing_ratePlan_occupancy_date_idx";
	END IF;
	IF to_regclass('"EffectivePricingV2_variant_date_occupancy_idx"') IS NOT NULL THEN
		ALTER INDEX "EffectivePricingV2_variant_date_occupancy_idx" RENAME TO "EffectivePricing_variant_date_occupancy_idx";
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('"EffectivePricing"') IS NOT NULL THEN
		ALTER TABLE "EffectivePricing"
			ALTER COLUMN "sourceVersion" SET DEFAULT 'effective_pricing';
		UPDATE "EffectivePricing"
		SET "sourceVersion" = 'effective_pricing'
		WHERE "sourceVersion" IN ('v2', 'effective_pricing_v2');
	END IF;
END $$;
