-- Capa 4 hardening: make Reservations contract audit resilient to catalog/user edits.
-- Additive-only migration; does not change pricing, inventory, or booking confirmation semantics.

ALTER TABLE "Booking" ADD COLUMN "guestEmailSnapshot" TEXT;
ALTER TABLE "Booking" ADD COLUMN "guestNameSnapshot" TEXT;
ALTER TABLE "Booking" ADD COLUMN "guestContactSnapshotJson" TEXT;
ALTER TABLE "Booking" ADD COLUMN "lifecycleAuditJson" TEXT;
ALTER TABLE "Booking" ADD COLUMN "refundHandoffSnapshotJson" TEXT;
ALTER TABLE "Booking" ADD COLUMN "contractSnapshotVersion" TEXT;

ALTER TABLE "BookingRoomDetail" ADD COLUMN "providerIdSnapshot" TEXT;
ALTER TABLE "BookingRoomDetail" ADD COLUMN "productIdSnapshot" TEXT;
ALTER TABLE "BookingRoomDetail" ADD COLUMN "productNameSnapshot" TEXT;
ALTER TABLE "BookingRoomDetail" ADD COLUMN "variantNameSnapshot" TEXT;
ALTER TABLE "BookingRoomDetail" ADD COLUMN "ratePlanNameSnapshot" TEXT;
ALTER TABLE "BookingRoomDetail" ADD COLUMN "occupancySnapshotJson" TEXT;
