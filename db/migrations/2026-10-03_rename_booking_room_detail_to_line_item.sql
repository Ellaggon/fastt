-- BookingRoomDetail became the cross-vertical reservation contract long ago.
-- Rename the physical table and every named database object in one transaction;
-- ALTER TABLE preserves its rows, foreign keys and dependent query semantics.

DO $$
BEGIN
	IF to_regclass('"BookingRoomDetail"') IS NOT NULL
		AND to_regclass('"BookingLineItem"') IS NOT NULL THEN
		RAISE EXCEPTION 'BOOKING_LINE_ITEM_RENAME_AMBIGUOUS: both table names exist';
	END IF;

	IF to_regclass('"BookingRoomDetail"') IS NOT NULL THEN
		ALTER TABLE "BookingRoomDetail" RENAME TO "BookingLineItem";
	ELSIF to_regclass('"BookingLineItem"') IS NULL THEN
		RAISE EXCEPTION 'BOOKING_LINE_ITEM_RENAME_MISSING_SOURCE';
	END IF;

	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = '"BookingLineItem"'::regclass
			AND conname = 'BookingRoomDetail_bookingId_fk'
	) THEN
		ALTER TABLE "BookingLineItem"
			RENAME CONSTRAINT "BookingRoomDetail_bookingId_fk" TO "BookingLineItem_bookingId_fk";
	END IF;

	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = '"BookingLineItem"'::regclass
			AND conname = 'BookingRoomDetail_variantId_fk'
	) THEN
		ALTER TABLE "BookingLineItem"
			RENAME CONSTRAINT "BookingRoomDetail_variantId_fk" TO "BookingLineItem_variantId_fk";
	END IF;

	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = '"BookingLineItem"'::regclass
			AND conname = 'BookingRoomDetail_ratePlanId_fk'
	) THEN
		ALTER TABLE "BookingLineItem"
			RENAME CONSTRAINT "BookingRoomDetail_ratePlanId_fk" TO "BookingLineItem_ratePlanId_fk";
	END IF;

	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = '"BookingLineItem"'::regclass
			AND conname = 'BookingRoomDetail_guest_counts_check'
	) THEN
		ALTER TABLE "BookingLineItem"
			RENAME CONSTRAINT "BookingRoomDetail_guest_counts_check" TO "BookingLineItem_guest_counts_check";
	END IF;

	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = '"BookingLineItem"'::regclass
			AND conname = 'BookingRoomDetail_amounts_nonnegative_check'
	) THEN
		ALTER TABLE "BookingLineItem"
			RENAME CONSTRAINT "BookingRoomDetail_amounts_nonnegative_check" TO "BookingLineItem_amounts_nonnegative_check";
	END IF;

	IF to_regclass('"BookingRoomDetail_bookingId_idx"') IS NOT NULL THEN
		ALTER INDEX "BookingRoomDetail_bookingId_idx" RENAME TO "BookingLineItem_bookingId_idx";
	END IF;

	IF to_regclass('"BookingRoomDetail_variantId_idx"') IS NOT NULL THEN
		ALTER INDEX "BookingRoomDetail_variantId_idx" RENAME TO "BookingLineItem_variantId_idx";
	END IF;

	IF to_regclass('"BookingRoomDetail_ratePlanId_idx"') IS NOT NULL THEN
		ALTER INDEX "BookingRoomDetail_ratePlanId_idx" RENAME TO "BookingLineItem_ratePlanId_idx";
	END IF;

	IF EXISTS (
		SELECT 1 FROM pg_trigger
		WHERE tgrelid = '"BookingLineItem"'::regclass
			AND tgname = 'trg_BookingRoomDetail_positive_range'
	) THEN
		ALTER TRIGGER "trg_BookingRoomDetail_positive_range"
			ON "BookingLineItem"
			RENAME TO "trg_BookingLineItem_positive_range";
	END IF;
END;
$$;

-- Finance projections and snapshots are contractual evidence. Keep their
-- meaning intact while removing the lodging-only token from persisted bases
-- and derived JSON fields.
UPDATE "CommissionSnapshot"
SET "basis" = replace("basis", 'booking_room_detail', 'booking_line_item')
WHERE "basis" LIKE '%booking_room_detail%';

UPDATE "ProviderPayableSnapshot"
SET "basis" = replace("basis", 'booking_room_detail', 'booking_line_item')
WHERE "basis" LIKE '%booking_room_detail%';

UPDATE "ReconciliationMatch"
SET "basis" = replace("basis", 'booking_room_detail', 'booking_line_item')
WHERE "basis" LIKE '%booking_room_detail%';

UPDATE "FinancialProviderSummary"
SET
	"summaryJson" = replace(replace(replace(replace("summaryJson"::text,
		'booking_room_detail', 'booking_line_item'),
		'hasRoomSnapshots', 'hasLineItemSnapshots'),
		'roomSnapshotCount', 'lineItemSnapshotCount'),
		'multiRoomAllocationCount', 'lineItemAllocationCount')::jsonb,
	"collectionsJson" = replace(replace(replace(replace("collectionsJson"::text,
		'booking_room_detail', 'booking_line_item'),
		'hasRoomSnapshots', 'hasLineItemSnapshots'),
		'roomSnapshotCount', 'lineItemSnapshotCount'),
		'multiRoomAllocationCount', 'lineItemAllocationCount')::jsonb,
	"refundsJson" = replace(replace(replace(replace("refundsJson"::text,
		'booking_room_detail', 'booking_line_item'),
		'hasRoomSnapshots', 'hasLineItemSnapshots'),
		'roomSnapshotCount', 'lineItemSnapshotCount'),
		'multiRoomAllocationCount', 'lineItemAllocationCount')::jsonb,
	"exceptionsJson" = replace(replace(replace(replace("exceptionsJson"::text,
		'booking_room_detail', 'booking_line_item'),
		'hasRoomSnapshots', 'hasLineItemSnapshots'),
		'roomSnapshotCount', 'lineItemSnapshotCount'),
		'multiRoomAllocationCount', 'lineItemAllocationCount')::jsonb
WHERE "summaryJson"::text LIKE '%booking_room_detail%'
	OR "summaryJson"::text LIKE '%hasRoomSnapshots%'
	OR "summaryJson"::text LIKE '%roomSnapshotCount%'
	OR "summaryJson"::text LIKE '%multiRoomAllocationCount%'
	OR "collectionsJson"::text LIKE '%booking_room_detail%'
	OR "collectionsJson"::text LIKE '%hasRoomSnapshots%'
	OR "collectionsJson"::text LIKE '%roomSnapshotCount%'
	OR "collectionsJson"::text LIKE '%multiRoomAllocationCount%'
	OR "refundsJson"::text LIKE '%booking_room_detail%'
	OR "refundsJson"::text LIKE '%hasRoomSnapshots%'
	OR "refundsJson"::text LIKE '%roomSnapshotCount%'
	OR "refundsJson"::text LIKE '%multiRoomAllocationCount%'
	OR "exceptionsJson"::text LIKE '%booking_room_detail%'
	OR "exceptionsJson"::text LIKE '%hasRoomSnapshots%'
	OR "exceptionsJson"::text LIKE '%roomSnapshotCount%'
	OR "exceptionsJson"::text LIKE '%multiRoomAllocationCount%';
