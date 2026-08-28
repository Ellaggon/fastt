-- The table rename preserves PostgreSQL's generated primary-key constraint name.
-- Normalize that final physical identifier so no V2 artifact remains in the schema.
DO $$
BEGIN
	IF to_regclass('"EffectivePricing"') IS NOT NULL
		AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EffectivePricingV2_pkey') THEN
		ALTER TABLE "EffectivePricing" RENAME CONSTRAINT "EffectivePricingV2_pkey" TO "EffectivePricing_pkey";
	END IF;
END $$;
