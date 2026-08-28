-- Scope remains the inheritance vocabulary. Its target is no longer an
-- unchecked polymorphic string: exactly one typed FK owns every assignment.
-- scopeId is recreated as a generated read projection so query contracts stay
-- stable without being writable state.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "TaxFeeAssignment" assignment
		LEFT JOIN "Provider" provider ON assignment."scope" = 'provider' AND provider."id" = assignment."scopeId"
		LEFT JOIN "Product" product ON assignment."scope" = 'product' AND product."id" = assignment."scopeId"
		LEFT JOIN "Variant" variant ON assignment."scope" = 'variant' AND variant."id" = assignment."scopeId"
		LEFT JOIN "RatePlan" rate_plan ON assignment."scope" = 'rate_plan' AND rate_plan."id" = assignment."scopeId"
		WHERE (assignment."scope" = 'global' AND assignment."scopeId" IS NOT NULL)
			OR (assignment."scope" = 'provider' AND (assignment."scopeId" IS NULL OR provider."id" IS NULL))
			OR (assignment."scope" = 'product' AND (assignment."scopeId" IS NULL OR product."id" IS NULL))
			OR (assignment."scope" = 'variant' AND (assignment."scopeId" IS NULL OR variant."id" IS NULL))
			OR (assignment."scope" = 'rate_plan' AND (assignment."scopeId" IS NULL OR rate_plan."id" IS NULL))
			OR assignment."scope" NOT IN ('global', 'provider', 'product', 'variant', 'rate_plan')
	) THEN
		RAISE EXCEPTION 'TYPED_ASSIGNMENT_MIGRATION_INVALID_TAX_FEE_TARGET';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "PolicyAssignment" assignment
		LEFT JOIN "Product" product ON assignment."scope" = 'product' AND product."id" = assignment."scopeId"
		LEFT JOIN "Variant" variant ON assignment."scope" = 'variant' AND variant."id" = assignment."scopeId"
		LEFT JOIN "RatePlan" rate_plan ON assignment."scope" = 'rate_plan' AND rate_plan."id" = assignment."scopeId"
		WHERE (assignment."scope" = 'product' AND product."id" IS NULL)
			OR (assignment."scope" = 'variant' AND variant."id" IS NULL)
			OR (assignment."scope" = 'rate_plan' AND rate_plan."id" IS NULL)
			OR assignment."scope" NOT IN ('product', 'variant', 'rate_plan')
	) THEN
		RAISE EXCEPTION 'TYPED_ASSIGNMENT_MIGRATION_INVALID_POLICY_TARGET';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "CommercialRuleApplication" assignment
		LEFT JOIN "Product" product ON assignment."scope" = 'product' AND product."id" = assignment."scopeId"
		LEFT JOIN "Variant" variant ON assignment."scope" = 'variant' AND variant."id" = assignment."scopeId"
		LEFT JOIN "RatePlan" rate_plan ON assignment."scope" = 'rate_plan' AND rate_plan."id" = assignment."scopeId"
		WHERE (assignment."scope" = 'product' AND product."id" IS NULL)
			OR (assignment."scope" = 'variant' AND variant."id" IS NULL)
			OR (assignment."scope" = 'rate_plan' AND rate_plan."id" IS NULL)
			OR assignment."scope" NOT IN ('product', 'variant', 'rate_plan')
	) THEN
		RAISE EXCEPTION 'TYPED_ASSIGNMENT_MIGRATION_INVALID_COMMERCIAL_RULE_TARGET';
	END IF;
END;
$$;

ALTER TABLE "TaxFeeAssignment"
	ADD COLUMN "providerTargetId" text,
	ADD COLUMN "productTargetId" text,
	ADD COLUMN "variantTargetId" text,
	ADD COLUMN "ratePlanTargetId" text;

UPDATE "TaxFeeAssignment"
SET
	"providerTargetId" = CASE WHEN "scope" = 'provider' THEN "scopeId" END,
	"productTargetId" = CASE WHEN "scope" = 'product' THEN "scopeId" END,
	"variantTargetId" = CASE WHEN "scope" = 'variant' THEN "scopeId" END,
	"ratePlanTargetId" = CASE WHEN "scope" = 'rate_plan' THEN "scopeId" END;

ALTER TABLE "PolicyAssignment"
	ADD COLUMN "productTargetId" text,
	ADD COLUMN "variantTargetId" text,
	ADD COLUMN "ratePlanTargetId" text;

UPDATE "PolicyAssignment"
SET
	"productTargetId" = CASE WHEN "scope" = 'product' THEN "scopeId" END,
	"variantTargetId" = CASE WHEN "scope" = 'variant' THEN "scopeId" END,
	"ratePlanTargetId" = CASE WHEN "scope" = 'rate_plan' THEN "scopeId" END;

ALTER TABLE "CommercialRuleApplication"
	ADD COLUMN "productTargetId" text,
	ADD COLUMN "variantTargetId" text,
	ADD COLUMN "ratePlanTargetId" text;

UPDATE "CommercialRuleApplication"
SET
	"productTargetId" = CASE WHEN "scope" = 'product' THEN "scopeId" END,
	"variantTargetId" = CASE WHEN "scope" = 'variant' THEN "scopeId" END,
	"ratePlanTargetId" = CASE WHEN "scope" = 'rate_plan' THEN "scopeId" END;

DROP INDEX IF EXISTS "TaxFeeAssignment_scope_active_channel_idx";
DROP INDEX IF EXISTS "TaxFeeAssignment_definition_scope_active_idx";
DROP INDEX IF EXISTS "TaxFeeAssignment_active_equivalent_unique";
DROP INDEX IF EXISTS "PolicyAssignment_scope_resolution_idx";
DROP INDEX IF EXISTS "PolicyAssignment_scope_active_range_idx";
DROP INDEX IF EXISTS "PolicyAssignment_active_resolution_range_idx";
DROP INDEX IF EXISTS "CommercialRuleApplication_provider_scope_active_idx";
DROP INDEX IF EXISTS "CommercialRuleApplication_rule_scope_idx";

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_overlap_update" ON "PolicyAssignment";

ALTER TABLE "TaxFeeAssignment" DROP COLUMN "scopeId";
ALTER TABLE "PolicyAssignment" DROP COLUMN "scopeId";
ALTER TABLE "CommercialRuleApplication" DROP COLUMN "scopeId";

ALTER TABLE "TaxFeeAssignment"
	ADD COLUMN "scopeId" text GENERATED ALWAYS AS (
		coalesce("providerTargetId", "productTargetId", "variantTargetId", "ratePlanTargetId")
	) STORED,
	ADD CONSTRAINT "TaxFeeAssignment_providerTargetId_fk" FOREIGN KEY ("providerTargetId") REFERENCES "Provider"("id"),
	ADD CONSTRAINT "TaxFeeAssignment_productTargetId_fk" FOREIGN KEY ("productTargetId") REFERENCES "Product"("id"),
	ADD CONSTRAINT "TaxFeeAssignment_variantTargetId_fk" FOREIGN KEY ("variantTargetId") REFERENCES "Variant"("id"),
	ADD CONSTRAINT "TaxFeeAssignment_ratePlanTargetId_fk" FOREIGN KEY ("ratePlanTargetId") REFERENCES "RatePlan"("id"),
	ADD CONSTRAINT "TaxFeeAssignment_typed_target_check" CHECK (
		("scope" = 'global' AND "providerTargetId" IS NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'provider' AND "providerTargetId" IS NOT NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'product' AND "providerTargetId" IS NULL AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'variant' AND "providerTargetId" IS NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'rate_plan' AND "providerTargetId" IS NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
	);

ALTER TABLE "PolicyAssignment"
	ADD COLUMN "scopeId" text GENERATED ALWAYS AS (
		coalesce("productTargetId", "variantTargetId", "ratePlanTargetId")
	) STORED,
	ADD CONSTRAINT "PolicyAssignment_productTargetId_fk" FOREIGN KEY ("productTargetId") REFERENCES "Product"("id"),
	ADD CONSTRAINT "PolicyAssignment_variantTargetId_fk" FOREIGN KEY ("variantTargetId") REFERENCES "Variant"("id"),
	ADD CONSTRAINT "PolicyAssignment_ratePlanTargetId_fk" FOREIGN KEY ("ratePlanTargetId") REFERENCES "RatePlan"("id"),
	ADD CONSTRAINT "PolicyAssignment_typed_target_check" CHECK (
		("scope" = 'product' AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'variant' AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'rate_plan' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
	);

ALTER TABLE "CommercialRuleApplication"
	ADD COLUMN "scopeId" text GENERATED ALWAYS AS (
		coalesce("productTargetId", "variantTargetId", "ratePlanTargetId")
	) STORED,
	ADD CONSTRAINT "CommercialRuleApplication_productTargetId_fk" FOREIGN KEY ("productTargetId") REFERENCES "Product"("id"),
	ADD CONSTRAINT "CommercialRuleApplication_variantTargetId_fk" FOREIGN KEY ("variantTargetId") REFERENCES "Variant"("id"),
	ADD CONSTRAINT "CommercialRuleApplication_ratePlanTargetId_fk" FOREIGN KEY ("ratePlanTargetId") REFERENCES "RatePlan"("id"),
	ADD CONSTRAINT "CommercialRuleApplication_typed_target_check" CHECK (
		("scope" = 'product' AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'variant' AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
		OR ("scope" = 'rate_plan' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
	);

CREATE INDEX "TaxFeeAssignment_scope_active_channel_idx"
	ON "TaxFeeAssignment" ("scope", "scopeId", "status", "channel");
CREATE INDEX "TaxFeeAssignment_definition_scope_active_idx"
	ON "TaxFeeAssignment" ("taxFeeDefinitionId", "scope", "scopeId", "status", "channel");
CREATE UNIQUE INDEX "TaxFeeAssignment_active_equivalent_unique"
	ON "TaxFeeAssignment" (
		"taxFeeDefinitionId", "scope", coalesce("scopeId", '__global__'), coalesce("channel", '__all_channels__')
	)
	WHERE "status" = 'active';

CREATE INDEX "PolicyAssignment_scope_resolution_idx"
	ON "PolicyAssignment" ("scope", "scopeId", "category", "channel", "isActive");
CREATE INDEX "PolicyAssignment_scope_active_range_idx"
	ON "PolicyAssignment" ("scope", "scopeId", "category", "isActive", "effectiveFrom", "effectiveTo");
CREATE INDEX "PolicyAssignment_active_resolution_range_idx"
	ON "PolicyAssignment" ("scope", "scopeId", "category", "channel", "effectiveFrom", "effectiveTo")
	WHERE "isActive" = true;

CREATE INDEX "CommercialRuleApplication_provider_scope_active_idx"
	ON "CommercialRuleApplication" ("providerId", "scope", "scopeId", "isActive");
CREATE INDEX "CommercialRuleApplication_rule_scope_idx"
	ON "CommercialRuleApplication" ("ruleId", "scope", "scopeId");

CREATE TRIGGER "trg_PolicyAssignment_overlap_update"
BEFORE UPDATE OF "scope", "productTargetId", "variantTargetId", "ratePlanTargetId", "category", "channel", "effectiveFrom", "effectiveTo", "isActive"
ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_assignment_overlap();
