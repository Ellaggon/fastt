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
		'PricingBulkOperationJob',
		'PricingBulkOperationItem',
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

ALTER TABLE "BookingLineItem"
	ADD CONSTRAINT "BookingLineItem_guest_counts_check"
	CHECK ("adults" >= 0 AND "children" >= 0 AND ("adults" + "children") > 0),
	ADD CONSTRAINT "BookingLineItem_amounts_nonnegative_check"
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

-- A current fiscal version is an immutable release of the same definition.
-- The composite, deferred FK protects both facts: the referenced version exists
-- and it belongs to this definition. A new draft may legitimately have no pointer.
ALTER TABLE "TaxFeeDefinitionVersion"
	ADD CONSTRAINT "TaxFeeDefinitionVersion_definition_id_unique"
	UNIQUE ("taxFeeDefinitionId", "id");

ALTER TABLE "TaxFeeDefinition"
	ADD CONSTRAINT "TaxFeeDefinition_currentVersion_same_definition_fk"
	FOREIGN KEY ("id", "currentVersionId")
	REFERENCES "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "id")
	DEFERRABLE INITIALLY DEFERRED;

-- Fiscal versions are append-only evidence. Definitions can move their current
-- pointer, but a released snapshot is never rewritten or removed in place.
CREATE OR REPLACE FUNCTION fastt_prevent_tax_fee_definition_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'TAX_FEE_DEFINITION_VERSION_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeDefinitionVersion_immutable" ON "TaxFeeDefinitionVersion";
CREATE TRIGGER "trg_TaxFeeDefinitionVersion_immutable"
BEFORE UPDATE OR DELETE ON "TaxFeeDefinitionVersion"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_tax_fee_definition_version_mutation();

-- A definition is not commercially published until it points at an immutable
-- version. This must be deferred because the release transaction inserts the
-- snapshot and advances the pointer before commit.
CREATE OR REPLACE FUNCTION fastt_validate_tax_fee_definition_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."editingState" = 'published' AND NEW."currentVersionId" IS NULL THEN
		RAISE EXCEPTION 'TAX_FEE_PUBLISHED_DEFINITION_REQUIRES_CURRENT_VERSION';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeDefinition_published_version_required" ON "TaxFeeDefinition";
CREATE CONSTRAINT TRIGGER "trg_TaxFeeDefinition_published_version_required"
AFTER INSERT OR UPDATE OF "editingState", "currentVersionId" ON "TaxFeeDefinition"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_tax_fee_definition_publication();

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

CREATE INDEX IF NOT EXISTS "EffectivePricing_ratePlan_occupancy_date_idx"
	ON "EffectivePricing" ("ratePlanId", "occupancyKey", "date", "computedAt");

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
BEFORE UPDATE OF "scope", "productTargetId", "variantTargetId", "ratePlanTargetId", "category", "channel", "effectiveFrom", "effectiveTo", "isActive"
ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_assignment_overlap();

DROP TRIGGER IF EXISTS "trg_Hold_positive_range" ON "Hold";
CREATE TRIGGER "trg_Hold_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "Hold"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_stay_range();

DROP TRIGGER IF EXISTS "trg_BookingLineItem_positive_range" ON "BookingLineItem";
CREATE TRIGGER "trg_BookingLineItem_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "BookingLineItem"
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
-- Category slugs are scoped by vertical. Category links must stay in the
-- same vertical as the product, even when data is written outside the API.
CREATE OR REPLACE FUNCTION fastt_validate_product_category_vertical()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	product_vertical text;
	category_vertical text;
BEGIN
	SELECT lower(trim(product."productType")), lower(trim(category.vertical))
	INTO product_vertical, category_vertical
	FROM "Product" product
	JOIN "ProductCategory" category ON category.id = NEW."categoryId"
	WHERE product.id = NEW."productId";

	IF product_vertical IS NULL OR category_vertical IS NULL THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_LINK_REFERENCES_MISSING_RESOURCE';
	END IF;

	IF product_vertical <> category_vertical THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_VERTICAL_MISMATCH: product %, category %',
			product_vertical, category_vertical;
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProductCategoryLink_vertical_match" ON "ProductCategoryLink";
CREATE TRIGGER "trg_ProductCategoryLink_vertical_match"
BEFORE INSERT OR UPDATE OF "productId", "categoryId" ON "ProductCategoryLink"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_product_category_vertical();

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

-- Catalog media has typed ownership. A stored asset can belong to one catalog
-- gallery only; location content may still reference it independently as a hero.
CREATE OR REPLACE FUNCTION fastt_prevent_catalog_image_owner_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_TABLE_NAME = 'ProductImage' AND EXISTS (
		SELECT 1 FROM "VariantImage" WHERE "imageId" = NEW."imageId"
	) THEN
		RAISE EXCEPTION 'CATALOG_IMAGE_ALREADY_LINKED_TO_VARIANT';
	END IF;

	IF TG_TABLE_NAME = 'VariantImage' AND EXISTS (
		SELECT 1 FROM "ProductImage" WHERE "imageId" = NEW."imageId"
	) THEN
		RAISE EXCEPTION 'CATALOG_IMAGE_ALREADY_LINKED_TO_PRODUCT';
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProductImage_single_catalog_owner" ON "ProductImage";
CREATE TRIGGER "trg_ProductImage_single_catalog_owner"
BEFORE INSERT OR UPDATE OF "imageId" ON "ProductImage"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_catalog_image_owner_overlap();

-- Integration mappings are polymorphic for connector interoperability, but
-- their local identity must still use Fastt's canonical vocabulary and belong
-- to the same provider. This closes the gap left by a generic localEntityId.
CREATE OR REPLACE FUNCTION fastt_validate_provider_integration_mapping_local_entity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF (NEW."mappingType" = 'property' AND NEW."localEntityType" = 'product') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "Product"
			WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'room_type' AND NEW."localEntityType" = 'variant') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "Variant" variant
			JOIN "Product" product ON product."id" = variant."productId"
			WHERE variant."id" = NEW."localEntityId" AND product."providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'rate_plan' AND NEW."localEntityType" = 'rate_plan') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "RatePlan" rate_plan
			JOIN "Variant" variant ON variant."id" = rate_plan."variantId"
			JOIN "Product" product ON product."id" = variant."productId"
			WHERE rate_plan."id" = NEW."localEntityId" AND product."providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'tax' AND NEW."localEntityType" = 'tax') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "TaxFeeDefinition"
			WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'calendar' AND NEW."localEntityType" = 'calendar') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "ProviderExternalCalendar"
			WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'account' AND NEW."localEntityType" = 'provider') THEN
		IF NEW."localEntityId" <> NEW."providerId" THEN
			RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED';
		END IF;
	ELSE
		RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_TYPE_INVALID';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProviderIntegrationMapping_local_entity" ON "ProviderIntegrationMapping";
CREATE TRIGGER "trg_ProviderIntegrationMapping_local_entity"
BEFORE INSERT OR UPDATE OF "providerId", "mappingType", "localEntityType", "localEntityId"
ON "ProviderIntegrationMapping"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_provider_integration_mapping_local_entity();

-- A certification fixture is evidence for an isolated provider. The direct FK
-- prevents orphan products; this trigger also prevents cross-provider or
-- commercial products from being used as certification inventory.
CREATE OR REPLACE FUNCTION fastt_validate_provider_integration_certification_fixture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "Provider"
		WHERE "id" = NEW."providerId" AND "accountPurpose" = 'integration_certification'
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_INVALID'; END IF;
	IF NEW."fixtureProductId" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "Product"
		WHERE "id" = NEW."fixtureProductId"
			AND "providerId" = NEW."providerId"
			AND "dataClass" = 'fixture'
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_INVALID'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_certification_fixture_product_drift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "ProviderIntegrationCertification"
		WHERE "fixtureProductId" = NEW."id"
			AND ("providerId" IS DISTINCT FROM NEW."providerId" OR NEW."dataClass" <> 'fixture')
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_DRIFT'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_certification_provider_purpose_drift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."accountPurpose" <> 'integration_certification' AND EXISTS (
		SELECT 1 FROM "ProviderIntegrationCertification" WHERE "providerId" = NEW."id"
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_PURPOSE_DRIFT'; END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProviderIntegrationCertification_fixture" ON "ProviderIntegrationCertification";
CREATE TRIGGER "trg_ProviderIntegrationCertification_fixture"
BEFORE INSERT OR UPDATE OF "providerId", "fixtureProductId"
ON "ProviderIntegrationCertification"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_provider_integration_certification_fixture();

DROP TRIGGER IF EXISTS "trg_Product_certification_fixture_drift" ON "Product";
CREATE TRIGGER "trg_Product_certification_fixture_drift"
BEFORE UPDATE OF "providerId", "dataClass" ON "Product"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_certification_fixture_product_drift();

DROP TRIGGER IF EXISTS "trg_Provider_certification_fixture_drift" ON "Provider";
CREATE TRIGGER "trg_Provider_certification_fixture_drift"
BEFORE UPDATE OF "accountPurpose" ON "Provider"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_certification_provider_purpose_drift();

DROP TRIGGER IF EXISTS "trg_VariantImage_single_catalog_owner" ON "VariantImage";
CREATE TRIGGER "trg_VariantImage_single_catalog_owner"
BEFORE INSERT OR UPDATE OF "imageId" ON "VariantImage"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_catalog_image_owner_overlap();

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

-- A bulk command is the audit-grade intent accepted from the administrator.
-- Workers may update lifecycle/progress fields only; changing the command
-- would make retries non-reproducible and invalidate the payload hash.
CREATE OR REPLACE FUNCTION fastt_prevent_pricing_bulk_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."providerId" IS DISTINCT FROM OLD."providerId"
		OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
		OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
		OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
		OR NEW."operationType" IS DISTINCT FROM OLD."operationType"
		OR NEW."commandJson" IS DISTINCT FROM OLD."commandJson" THEN
		RAISE EXCEPTION 'PRICING_BULK_OPERATION_COMMAND_IMMUTABLE';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_PricingBulkOperationJob_command_immutable" ON "PricingBulkOperationJob";
CREATE TRIGGER "trg_PricingBulkOperationJob_command_immutable"
BEFORE UPDATE ON "PricingBulkOperationJob"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_pricing_bulk_command_mutation();

-- Financial rows that belong to a reservation must also belong to that
-- reservation's provider. Independent FKs cannot express this composite rule.
CREATE OR REPLACE FUNCTION fastt_validate_financial_booking_provider()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	booking_provider_id text;
BEGIN
	IF NEW."bookingId" IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT "providerId" INTO booking_provider_id
	FROM "Booking"
	WHERE "id" = NEW."bookingId";

	IF booking_provider_id IS NULL OR booking_provider_id <> NEW."providerId" THEN
		RAISE EXCEPTION 'FINANCIAL_BOOKING_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

DO $$
DECLARE
	table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'FinancialExceptionRecord',
		'FinancialReference',
		'RefundHandoffRecord',
		'RefundQuote',
		'RefundLedger',
		'FinancialReviewEvent',
		'PaymentTransaction',
		'FinancialSettlementRecord',
		'ReconciliationMatch',
		'CommissionSnapshot',
		'ProviderPayableSnapshot',
		'PayoutRecord'
	]
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || table_name || '_booking_provider', table_name);
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF "bookingId", "providerId" ON %I FOR EACH ROW EXECUTE FUNCTION fastt_validate_financial_booking_provider()',
			'trg_' || table_name || '_booking_provider', table_name
		);
	END LOOP;
END;
$$;

-- A refund ledger entry is the applied form of one quote. Keeping both IDs
-- aligned prevents an otherwise valid FK graph from joining different sales.
CREATE OR REPLACE FUNCTION fastt_validate_refund_ledger_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	quote_booking_id text;
	quote_provider_id text;
	payment_booking_id text;
	payment_provider_id text;
BEGIN
	SELECT "bookingId", "providerId"
	INTO quote_booking_id, quote_provider_id
	FROM "RefundQuote"
	WHERE "id" = NEW."refundQuoteId";

	IF quote_booking_id IS NULL
		OR quote_booking_id <> NEW."bookingId"
		OR quote_provider_id <> NEW."providerId" THEN
		RAISE EXCEPTION 'REFUND_LEDGER_QUOTE_LINEAGE_MISMATCH';
	END IF;

	IF NEW."paymentTransactionId" IS NOT NULL THEN
		SELECT "bookingId", "providerId"
		INTO payment_booking_id, payment_provider_id
		FROM "PaymentTransaction"
		WHERE "id" = NEW."paymentTransactionId";

		IF payment_provider_id IS NULL
			OR payment_provider_id <> NEW."providerId"
			OR payment_booking_id IS DISTINCT FROM NEW."bookingId" THEN
			RAISE EXCEPTION 'REFUND_LEDGER_PAYMENT_LINEAGE_MISMATCH';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_RefundLedger_lineage" ON "RefundLedger";
CREATE TRIGGER "trg_RefundLedger_lineage"
BEFORE INSERT OR UPDATE OF "refundQuoteId", "bookingId", "providerId", "paymentTransactionId"
ON "RefundLedger"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_refund_ledger_lineage();

-- Review events are immutable evidence, so their optional related records must
-- point at the same booking and provider as the event itself.
CREATE OR REPLACE FUNCTION fastt_validate_financial_review_event_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."financialExceptionId" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "FinancialExceptionRecord"
		WHERE "id" = NEW."financialExceptionId"
			AND "bookingId" = NEW."bookingId"
			AND "providerId" = NEW."providerId"
	) THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_EXCEPTION_LINEAGE_MISMATCH'; END IF;

	IF NEW."financialReferenceId" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "FinancialReference"
		WHERE "id" = NEW."financialReferenceId"
			AND "bookingId" = NEW."bookingId"
			AND "providerId" = NEW."providerId"
	) THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_REFERENCE_LINEAGE_MISMATCH'; END IF;

	IF NEW."refundHandoffId" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "RefundHandoffRecord"
		WHERE "id" = NEW."refundHandoffId"
			AND "bookingId" = NEW."bookingId"
			AND "providerId" = NEW."providerId"
	) THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_HANDOFF_LINEAGE_MISMATCH'; END IF;

	IF NEW."reconciliationMatchId" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "ReconciliationMatch"
		WHERE "id" = NEW."reconciliationMatchId"
			AND "bookingId" = NEW."bookingId"
			AND "providerId" = NEW."providerId"
	) THEN RAISE EXCEPTION 'FINANCIAL_REVIEW_RECONCILIATION_LINEAGE_MISMATCH'; END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_FinancialReviewEvent_lineage" ON "FinancialReviewEvent";
CREATE TRIGGER "trg_FinancialReviewEvent_lineage"
BEFORE INSERT OR UPDATE OF "bookingId", "providerId", "financialExceptionId", "financialReferenceId", "refundHandoffId", "reconciliationMatchId"
ON "FinancialReviewEvent"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_financial_review_event_lineage();

-- Assignment targets are polymorphic only at the domain boundary. Once stored,
-- their FK is typed and this helper resolves the owning provider from it.
CREATE OR REPLACE FUNCTION fastt_catalog_assignment_target_provider(
	product_target_id text,
	variant_target_id text,
	rate_plan_target_id text
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE target_provider_id text;
BEGIN
	IF product_target_id IS NOT NULL THEN
		SELECT "providerId" INTO target_provider_id FROM "Product" WHERE "id" = product_target_id;
	ELSIF variant_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "Variant" variant JOIN "Product" product ON product."id" = variant."productId"
		WHERE variant."id" = variant_target_id;
	ELSIF rate_plan_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "RatePlan" rate_plan
		JOIN "Variant" variant ON variant."id" = rate_plan."variantId"
		JOIN "Product" product ON product."id" = variant."productId"
		WHERE rate_plan."id" = rate_plan_target_id;
	END IF;
	RETURN target_provider_id;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_tax_fee_assignment_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE definition_provider_id text;
DECLARE target_provider_id text;
BEGIN
	SELECT "providerId" INTO definition_provider_id
	FROM "TaxFeeDefinition" WHERE "id" = NEW."taxFeeDefinitionId";

	IF NEW."scope" = 'global' THEN RETURN NEW; END IF;
	IF NEW."scope" = 'provider' THEN
		target_provider_id := NEW."providerTargetId";
	ELSE
		target_provider_id := fastt_catalog_assignment_target_provider(
			NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
		);
	END IF;

	IF definition_provider_id IS NULL OR target_provider_id IS NULL
		OR definition_provider_id <> target_provider_id THEN
		RAISE EXCEPTION 'TAX_FEE_ASSIGNMENT_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_policy_assignment_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE group_provider_id text;
DECLARE target_provider_id text;
BEGIN
	SELECT "ownerProviderId" INTO group_provider_id
	FROM "PolicyGroup" WHERE "id" = NEW."policyGroupId";
	target_provider_id := fastt_catalog_assignment_target_provider(
		NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
	);
	IF group_provider_id IS NULL OR target_provider_id IS NULL
		OR group_provider_id <> target_provider_id THEN
		RAISE EXCEPTION 'POLICY_ASSIGNMENT_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_commercial_rule_application_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE rule_provider_id text;
DECLARE rule_set_provider_id text;
DECLARE rule_set_id text;
DECLARE target_provider_id text;
BEGIN
	SELECT "providerId", "ruleSetId" INTO rule_provider_id, rule_set_id
	FROM "CommercialRule" WHERE "id" = NEW."ruleId";
	SELECT "providerId" INTO rule_set_provider_id
	FROM "CommercialRuleSet" WHERE "id" = NEW."ruleSetId";
	target_provider_id := fastt_catalog_assignment_target_provider(
		NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
	);
	IF rule_provider_id IS NULL OR rule_set_provider_id IS NULL OR target_provider_id IS NULL
		OR NEW."providerId" <> rule_provider_id
		OR NEW."providerId" <> rule_set_provider_id
		OR NEW."ruleSetId" <> rule_set_id
		OR NEW."providerId" <> target_provider_id THEN
		RAISE EXCEPTION 'COMMERCIAL_RULE_APPLICATION_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeAssignment_owner" ON "TaxFeeAssignment";
CREATE TRIGGER "trg_TaxFeeAssignment_owner"
BEFORE INSERT OR UPDATE OF "taxFeeDefinitionId", "scope", "providerTargetId", "productTargetId", "variantTargetId", "ratePlanTargetId"
ON "TaxFeeAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_tax_fee_assignment_owner();

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_owner" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_owner"
BEFORE INSERT OR UPDATE OF "policyGroupId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId"
ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_policy_assignment_owner();

DROP TRIGGER IF EXISTS "trg_CommercialRuleApplication_owner" ON "CommercialRuleApplication";
CREATE TRIGGER "trg_CommercialRuleApplication_owner"
BEFORE INSERT OR UPDATE OF "providerId", "ruleSetId", "ruleId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId"
ON "CommercialRuleApplication"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_commercial_rule_application_owner();
