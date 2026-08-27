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

-- GeoPlace.slug is a local segment. canonicalPath is always derived from the
-- hierarchy so direct writes cannot recreate a globally-unique-slug model.
CREATE OR REPLACE FUNCTION fastt_derive_geo_place_canonical_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	parent_path text;
BEGIN
	NEW."slug" := trim(BOTH '-' FROM regexp_replace(lower(trim(NEW."slug")), '[^a-z0-9]+', '-', 'g'));
	IF NEW."slug" !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
		RAISE EXCEPTION 'GEO_PLACE_INVALID_ROUTE_SEGMENT';
	END IF;

	IF NEW."parentId" IS NULL THEN
		NEW."canonicalPath" := NEW."slug";
	ELSE
		IF NEW."parentId" = NEW."id" THEN
			RAISE EXCEPTION 'GEO_PLACE_PARENT_CANNOT_BE_SELF';
		END IF;

		IF TG_OP = 'UPDATE' AND EXISTS (
			WITH RECURSIVE descendants AS (
				SELECT "id" FROM "GeoPlace" WHERE "parentId" = NEW."id"
				UNION ALL
				SELECT child."id"
				FROM "GeoPlace" child
				INNER JOIN descendants parent ON child."parentId" = parent."id"
			)
			SELECT 1 FROM descendants WHERE "id" = NEW."parentId"
		) THEN
			RAISE EXCEPTION 'GEO_PLACE_HIERARCHY_CYCLE';
		END IF;

		SELECT "canonicalPath" INTO parent_path
		FROM "GeoPlace"
		WHERE "id" = NEW."parentId";
		IF parent_path IS NULL THEN
			RAISE EXCEPTION 'GEO_PLACE_PARENT_NOT_FOUND';
		END IF;
		NEW."canonicalPath" := parent_path || '/' || NEW."slug";
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_propagate_geo_place_canonical_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD."canonicalPath" IS DISTINCT FROM NEW."canonicalPath" THEN
		UPDATE "GeoPlace" child
		SET "canonicalPath" = NEW."canonicalPath" || '/' || child."slug"
		WHERE child."parentId" = NEW."id"
			AND child."canonicalPath" IS DISTINCT FROM NEW."canonicalPath" || '/' || child."slug";
	END IF;
	RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_enforce_marketplace_publication_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	product_class text;
BEGIN
	IF TG_TABLE_NAME = 'ProductContent' THEN
		SELECT "dataClass" INTO product_class FROM "Product" WHERE "id" = NEW."productId";
		IF product_class IS NULL THEN
			RAISE EXCEPTION 'PRODUCT_CONTENT_REQUIRES_PRODUCT';
		END IF;
		IF NEW."dataClass" IS DISTINCT FROM product_class THEN
			RAISE EXCEPTION 'PRODUCT_CONTENT_DATA_CLASS_MISMATCH';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_TABLE_NAME = 'Product' THEN
		IF NEW."publicationState" <> 'published' THEN
			RETURN NEW;
		END IF;
		IF NOT EXISTS (
			SELECT 1
			FROM "Product" product
			INNER JOIN "Provider" provider ON provider."id" = product."providerId"
			WHERE product."id" = NEW."id"
				AND product."dataClass" = 'production'
				AND provider."accountPurpose" = 'commercial'
				AND provider."dataClassification" = 'production'
		) THEN
			RAISE EXCEPTION 'PUBLIC_PRODUCT_PROVIDER_NOT_ELIGIBLE';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_TABLE_NAME = 'Provider' THEN
		IF (NEW."accountPurpose" <> 'commercial' OR NEW."dataClassification" <> 'production')
			AND EXISTS (
				SELECT 1
				FROM "Product" product
				WHERE product."providerId" = NEW."id"
					AND product."dataClass" = 'production'
					AND product."publicationState" = 'published'
			) THEN
			RAISE EXCEPTION 'PROVIDER_HAS_PUBLISHED_PRODUCTION_PRODUCTS';
		END IF;
		RETURN NEW;
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
		'ProviderIntegrationCertification',
		'ProviderComplianceAssignment',
		'ProviderConfigurationState',
		'ProviderInvitation',
		'ProductOperationalSurface',
		'VariantRoomProfile',
		'TourSlotProfile',
		'TourTicketType',
		'BookingVoucher',
		'ProductCategory',
		'ProductCategoryLink',
		'ProductReview',
		'DailyInventory',
		'RatePlanConditionState',
		'CommercialRuleSet',
		'CommercialRule',
		'TaxFeeDefinition',
		'FinancialExceptionRecord',
		'RefundHandoffRecord',
		'PaymentTransaction',
		'ReconciliationMatch',
		'ProviderFinancialProfile',
		'FinancialProviderSummary',
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

CREATE INDEX IF NOT EXISTS "ProviderVerification_providerId_created_idx"
	ON "ProviderVerification" ("providerId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "ProviderInvitation_providerId_created_idx"
	ON "ProviderInvitation" ("providerId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "RatePlanOccupancyPolicy_ratePlan_current_idx"
	ON "RatePlanOccupancyPolicy" ("ratePlanId", "effectiveFrom", "id", "effectiveTo");

CREATE INDEX IF NOT EXISTS "EffectivePricingV2_ratePlan_occupancy_date_idx"
	ON "EffectivePricingV2" ("ratePlanId", "occupancyKey", "date", "computedAt");

CREATE INDEX IF NOT EXISTS "TaxFeeDefinition_provider_status_priority_idx"
	ON "TaxFeeDefinition" ("providerId", "status", "priority");

CREATE INDEX IF NOT EXISTS "TaxFeeDefinition_provider_code_status_idx"
	ON "TaxFeeDefinition" ("providerId", "code", "status");

CREATE INDEX IF NOT EXISTS "TaxFeeAssignment_scope_active_channel_idx"
	ON "TaxFeeAssignment" ("scope", "scopeId", "status", "channel");

CREATE INDEX IF NOT EXISTS "TaxFeeAssignment_definition_scope_active_idx"
	ON "TaxFeeAssignment" ("taxFeeDefinitionId", "scope", "scopeId", "status", "channel");

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

DROP TRIGGER IF EXISTS "trg_ProductContent_publication_boundary" ON "ProductContent";
CREATE TRIGGER "trg_ProductContent_publication_boundary"
BEFORE INSERT OR UPDATE OF "productId", "dataClass" ON "ProductContent"
FOR EACH ROW
EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_Product_publication_boundary" ON "Product";
CREATE TRIGGER "trg_Product_publication_boundary"
BEFORE INSERT OR UPDATE OF "publicationState", "providerId", "dataClass" ON "Product"
FOR EACH ROW
EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_Provider_publication_boundary" ON "Provider";
CREATE TRIGGER "trg_Provider_publication_boundary"
BEFORE UPDATE OF "accountPurpose", "dataClassification" ON "Provider"
FOR EACH ROW
EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_GeoPlace_derive_canonical_path" ON "GeoPlace";
CREATE TRIGGER "trg_GeoPlace_derive_canonical_path"
BEFORE INSERT OR UPDATE OF "slug", "parentId", "canonicalPath" ON "GeoPlace"
FOR EACH ROW
EXECUTE FUNCTION fastt_derive_geo_place_canonical_path();

DROP TRIGGER IF EXISTS "trg_GeoPlace_propagate_canonical_path" ON "GeoPlace";
CREATE TRIGGER "trg_GeoPlace_propagate_canonical_path"
AFTER UPDATE ON "GeoPlace"
FOR EACH ROW
WHEN (OLD."canonicalPath" IS DISTINCT FROM NEW."canonicalPath")
EXECUTE FUNCTION fastt_propagate_geo_place_canonical_path();

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
