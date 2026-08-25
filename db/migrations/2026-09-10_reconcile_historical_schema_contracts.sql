-- Reconcile installations created by early incremental migrations with the
-- canonical Drizzle schema. Historical timestamp-without-zone values were
-- written while the application and database both operated in UTC; preserve
-- that meaning explicitly during conversion.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "BookingVoucher"
		WHERE "issuedAt" IS NULL OR "createdAt" IS NULL OR "updatedAt" IS NULL
	) THEN RAISE EXCEPTION 'BOOKING_VOUCHER_REQUIRED_TIMESTAMPS_MISSING'; END IF;

	IF EXISTS (SELECT 1 FROM "MarketplaceEvent" WHERE "createdAt" IS NULL) THEN
		RAISE EXCEPTION 'MARKETPLACE_EVENT_CREATED_AT_MISSING';
	END IF;
	IF EXISTS (SELECT 1 FROM "ProductCategory" WHERE "createdAt" IS NULL) THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_CREATED_AT_MISSING';
	END IF;
	IF EXISTS (SELECT 1 FROM "ProductCategoryLink" WHERE "createdAt" IS NULL) THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_LINK_CREATED_AT_MISSING';
	END IF;
	IF EXISTS (SELECT 1 FROM "ProductReview" WHERE "createdAt" IS NULL OR "updatedAt" IS NULL) THEN
		RAISE EXCEPTION 'PRODUCT_REVIEW_REQUIRED_TIMESTAMPS_MISSING';
	END IF;
	IF EXISTS (SELECT 1 FROM "ProviderExternalCalendar" WHERE "nextSyncAt" IS NULL) THEN
		RAISE EXCEPTION 'EXTERNAL_CALENDAR_NEXT_SYNC_AT_MISSING';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "TourPrivateRequest"
		WHERE "partyJson" IS NULL OR "createdAt" IS NULL OR "updatedAt" IS NULL
	) THEN RAISE EXCEPTION 'TOUR_PRIVATE_REQUEST_REQUIRED_DATA_MISSING'; END IF;
	IF EXISTS (SELECT 1 FROM "TourSlotProfile" WHERE "createdAt" IS NULL OR "updatedAt" IS NULL) THEN
		RAISE EXCEPTION 'TOUR_SLOT_PROFILE_REQUIRED_TIMESTAMPS_MISSING';
	END IF;
	IF EXISTS (SELECT 1 FROM "TourTicketType" WHERE "createdAt" IS NULL OR "updatedAt" IS NULL) THEN
		RAISE EXCEPTION 'TOUR_TICKET_TYPE_REQUIRED_TIMESTAMPS_MISSING';
	END IF;
END $$;

ALTER TABLE "ProviderExternalCalendar"
	ALTER COLUMN "nextSyncAt" DROP DEFAULT,
	ALTER COLUMN "nextSyncAt" TYPE timestamp with time zone USING "nextSyncAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "nextSyncAt" SET DEFAULT now(),
	ALTER COLUMN "lastAutomaticSyncAt" TYPE timestamp with time zone USING "lastAutomaticSyncAt" AT TIME ZONE 'UTC';

ALTER TABLE "BookingVoucher"
	ALTER COLUMN "issuedAt" SET NOT NULL,
	ALTER COLUMN "createdAt" SET NOT NULL,
	ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "MarketplaceEvent" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "ProductCategory" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "ProductCategoryLink" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "ProductReview"
	ALTER COLUMN "createdAt" SET NOT NULL,
	ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "TourPrivateRequest"
	ALTER COLUMN "partyJson" SET NOT NULL,
	ALTER COLUMN "createdAt" SET NOT NULL,
	ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "TourSlotProfile"
	ALTER COLUMN "createdAt" SET NOT NULL,
	ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "TourTicketType"
	ALTER COLUMN "createdAt" SET NOT NULL,
	ALTER COLUMN "updatedAt" SET NOT NULL;
