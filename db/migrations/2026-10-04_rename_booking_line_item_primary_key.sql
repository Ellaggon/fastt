-- PostgreSQL preserves a primary-key constraint name when its table is renamed.
-- Complete the BookingLineItem cutover by renaming the constraint and its
-- backing index together through ALTER TABLE.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = '"BookingLineItem"'::regclass
			AND conname = 'BookingRoomDetail_pkey'
	) THEN
		ALTER TABLE "BookingLineItem"
			RENAME CONSTRAINT "BookingRoomDetail_pkey" TO "BookingLineItem_pkey";
	END IF;
END;
$$;
