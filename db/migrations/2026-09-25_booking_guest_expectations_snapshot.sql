-- Guest stay expectations are captured on hold; booking must persist the same merge.
ALTER TABLE "Booking"
	ADD COLUMN IF NOT EXISTS "guestExpectationsSnapshotJson" jsonb;
