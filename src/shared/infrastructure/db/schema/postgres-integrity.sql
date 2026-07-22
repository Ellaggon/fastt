-- Fastt Supabase integrity layer.
-- Apply after the Drizzle-generated PostgreSQL schema.

CREATE OR REPLACE FUNCTION fastt_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updatedAt" = now();
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_require_policy_assignment_category_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "PolicyGroup"
		WHERE "PolicyGroup"."id" = NEW."policyGroupId"
			AND "PolicyGroup"."category" = NEW."category"
	) THEN
		RAISE EXCEPTION 'POLICY_ASSIGNMENT_CATEGORY_MISMATCH';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_policy_group_category_drift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "PolicyAssignment"
		WHERE "PolicyAssignment"."policyGroupId" = NEW."id"
			AND "PolicyAssignment"."category" <> NEW."category"
	) THEN
		RAISE EXCEPTION 'POLICY_GROUP_CATEGORY_HAS_ASSIGNMENTS';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_policy_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."isActive" = true
		AND NEW."effectiveFrom" IS NOT NULL
		AND NEW."effectiveTo" IS NOT NULL
		AND EXISTS (
			SELECT 1
			FROM "PolicyAssignment" existing
			WHERE existing."id" <> NEW."id"
				AND existing."isActive" = true
				AND existing."scope" = NEW."scope"
				AND existing."scopeId" = NEW."scopeId"
				AND existing."category" = NEW."category"
				AND COALESCE(existing."channel", '__default__') = COALESCE(NEW."channel", '__default__')
				AND existing."effectiveFrom" IS NOT NULL
				AND existing."effectiveTo" IS NOT NULL
				AND daterange(existing."effectiveFrom", existing."effectiveTo", '[]')
					&& daterange(NEW."effectiveFrom", NEW."effectiveTo", '[]')
		) THEN
		RAISE EXCEPTION 'POLICY_ASSIGNMENT_ACTIVE_RANGE_OVERLAP';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_assert_positive_stay_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."checkOut" <= NEW."checkIn" THEN
		RAISE EXCEPTION 'INVALID_STAY_RANGE';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_assert_positive_booking_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."checkOutDate" <= NEW."checkInDate" THEN
		RAISE EXCEPTION 'INVALID_BOOKING_DATE_RANGE';
	END IF;

	RETURN NEW;
END;
$$;

DO $$
DECLARE
	table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'ProviderDocument',
		'ProviderTaxConfiguration',
		'ProviderPaymentAccount',
		'ProviderIntegrationConnection',
		'ProviderComplianceAssignment',
		'ProviderConfigurationState',
		'ProviderInvitation',
		'ProductPreparationSnapshot',
		'VariantRoomProfile',
		'VariantReadiness',
		'DailyInventory',
		'CommercialRuleSet',
		'CommercialRule',
		'TaxFeeDefinition',
		'FinancialExceptionRecord',
		'RefundHandoffRecord',
		'PaymentTransaction',
		'ReconciliationMatch',
		'ProviderFinancialProfile',
		'ProviderPayableSnapshot',
		'PayoutRecord',
		'ProviderStatement'
	]
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || table_name || '_touch_updatedAt', table_name);
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fastt_touch_updated_at()',
			'trg_' || table_name || '_touch_updatedAt',
			table_name
		);
	END LOOP;
END;
$$;

ALTER TABLE "PolicyGroup"
	ADD CONSTRAINT "PolicyGroup_category_check"
	CHECK ("category" IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow'));

ALTER TABLE "Policy"
	ADD CONSTRAINT "Policy_status_check"
	CHECK ("status" IN ('draft', 'active', 'archived')),
	ADD CONSTRAINT "Policy_version_positive_check"
	CHECK ("version" >= 1),
	ADD CONSTRAINT "Policy_effective_range_check"
	CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

ALTER TABLE "PolicyAssignment"
	ADD CONSTRAINT "PolicyAssignment_scope_check"
	CHECK ("scope" IN ('product', 'variant', 'rate_plan')),
	ADD CONSTRAINT "PolicyAssignment_category_check"
	CHECK ("category" IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')),
	ADD CONSTRAINT "PolicyAssignment_effective_range_pair_check"
	CHECK (("effectiveFrom" IS NULL AND "effectiveTo" IS NULL) OR ("effectiveFrom" IS NOT NULL AND "effectiveTo" IS NOT NULL)),
	ADD CONSTRAINT "PolicyAssignment_effective_range_order_check"
	CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

ALTER TABLE "CancellationTier"
	ADD CONSTRAINT "CancellationTier_days_positive_check"
	CHECK ("daysBeforeArrival" >= 0),
	ADD CONSTRAINT "CancellationTier_penalty_type_check"
	CHECK ("penaltyType" IN ('percentage', 'fixed', 'nights', 'none')),
	ADD CONSTRAINT "CancellationTier_penalty_amount_check"
	CHECK ("penaltyAmount" IS NULL OR "penaltyAmount" >= 0);

ALTER TABLE "PolicyRule"
	ADD CONSTRAINT "PolicyRule_key_required_check"
	CHECK (length(trim("ruleKey")) > 0);

ALTER TABLE "VariantCapacity"
	ADD CONSTRAINT "VariantCapacity_occupancy_range_check"
	CHECK ("minOccupancy" >= 0 AND "maxOccupancy" >= "minOccupancy");

ALTER TABLE "VariantInventoryConfig"
	ADD CONSTRAINT "VariantInventoryConfig_positive_units_check"
	CHECK ("defaultTotalUnits" >= 0 AND "horizonDays" > 0);

ALTER TABLE "DailyInventory"
	ADD CONSTRAINT "DailyInventory_nonnegative_check"
	CHECK ("totalInventory" >= 0 AND "reservedCount" >= 0 AND "reservedCount" <= "totalInventory");

ALTER TABLE "EffectiveAvailability"
	ADD CONSTRAINT "EffectiveAvailability_nonnegative_check"
	CHECK (
		"totalUnits" >= 0
		AND "heldUnits" >= 0
		AND "bookedUnits" >= 0
		AND "availableUnits" >= 0
	);

ALTER TABLE "InventoryLock"
	ADD CONSTRAINT "InventoryLock_quantity_positive_check"
	CHECK ("quantity" > 0);

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_guest_counts_check"
	CHECK ("numAdults" >= 0 AND "numChildren" >= 0 AND ("numAdults" + "numChildren") > 0),
	ADD CONSTRAINT "Booking_total_nonnegative_check"
	CHECK ("totalAmount" >= 0);

ALTER TABLE "BookingRoomDetail"
	ADD CONSTRAINT "BookingRoomDetail_guest_counts_check"
	CHECK ("adults" >= 0 AND "children" >= 0 AND ("adults" + "children") > 0),
	ADD CONSTRAINT "BookingRoomDetail_amounts_nonnegative_check"
	CHECK ("subtotalAmount" >= 0 AND "taxAmount" >= 0 AND "totalAmount" >= 0);

ALTER TABLE "RatePlanOccupancyPolicy"
	ADD CONSTRAINT "RatePlanOccupancyPolicy_effective_range_check"
	CHECK ("effectiveFrom" <= "effectiveTo"),
	ADD CONSTRAINT "RatePlanOccupancyPolicy_occupancy_check"
	CHECK ("baseAdults" >= 0 AND "baseChildren" >= 0),
	ADD CONSTRAINT "RatePlanOccupancyPolicy_amounts_nonnegative_check"
	CHECK ("baseAmount" >= 0 AND "extraAdultValue" >= 0 AND "childValue" >= 0);

ALTER TABLE "CommercialRuleSet"
	ADD CONSTRAINT "CommercialRuleSet_date_range_check"
	CHECK ("dateFrom" IS NULL OR "dateTo" IS NULL OR "dateFrom" <= "dateTo");

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_date_range_check"
	CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");

ALTER TABLE "EffectiveRestriction"
	ADD CONSTRAINT "EffectiveRestriction_stay_range_check"
	CHECK ("minStay" IS NULL OR "maxStay" IS NULL OR "minStay" <= "maxStay"),
	ADD CONSTRAINT "EffectiveRestriction_lead_range_check"
	CHECK ("minLeadTime" IS NULL OR "maxLeadTime" IS NULL OR "minLeadTime" <= "maxLeadTime");

ALTER TABLE "TaxFeeDefinition"
	ADD CONSTRAINT "TaxFeeDefinition_kind_check"
	CHECK ("kind" IN ('tax', 'fee')),
	ADD CONSTRAINT "TaxFeeDefinition_calculation_check"
	CHECK ("calculationType" IN ('percentage', 'fixed')),
	ADD CONSTRAINT "TaxFeeDefinition_value_nonnegative_check"
	CHECK ("value" >= 0),
	ADD CONSTRAINT "TaxFeeDefinition_effective_range_check"
	CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

CREATE UNIQUE INDEX IF NOT EXISTS "RatePlan_one_default_active_per_variant_idx"
	ON "RatePlan" ("variantId")
	WHERE "isDefault" = true AND "isActive" = true;

CREATE INDEX IF NOT EXISTS "PolicyAssignment_active_resolution_range_idx"
	ON "PolicyAssignment" ("scope", "scopeId", "category", "channel", "effectiveFrom", "effectiveTo")
	WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "SearchUnitView_available_search_idx"
	ON "SearchUnitView" ("productId", "date", "occupancyKey", "pricePerNight")
	WHERE "isAvailable" = true;

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_category_match_insert" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_category_match_insert"
BEFORE INSERT ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_require_policy_assignment_category_match();

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_category_match_update" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_category_match_update"
BEFORE UPDATE OF "policyGroupId", "category" ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_require_policy_assignment_category_match();

DROP TRIGGER IF EXISTS "trg_PolicyGroup_category_drift_update" ON "PolicyGroup";
CREATE TRIGGER "trg_PolicyGroup_category_drift_update"
BEFORE UPDATE OF "category" ON "PolicyGroup"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_group_category_drift();

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_overlap_insert" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_overlap_insert"
BEFORE INSERT ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_assignment_overlap();

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_overlap_update" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_overlap_update"
BEFORE UPDATE OF "scope", "scopeId", "category", "channel", "effectiveFrom", "effectiveTo", "isActive"
ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_assignment_overlap();

DROP TRIGGER IF EXISTS "trg_Hold_positive_range" ON "Hold";
CREATE TRIGGER "trg_Hold_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "Hold"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_stay_range();

DROP TRIGGER IF EXISTS "trg_BookingRoomDetail_positive_range" ON "BookingRoomDetail";
CREATE TRIGGER "trg_BookingRoomDetail_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "BookingRoomDetail"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_stay_range();

DROP TRIGGER IF EXISTS "trg_Booking_positive_range" ON "Booking";
CREATE TRIGGER "trg_Booking_positive_range"
BEFORE INSERT OR UPDATE OF "checkInDate", "checkOutDate"
ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_booking_range();
