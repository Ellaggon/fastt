-- Outbound iCal exports are variant-scoped. Unit-scoped export is not supported
-- until bookings can bind to InventoryResource end to end.

ALTER TABLE "ProviderExternalCalendarExport"
	DROP COLUMN IF EXISTS "resourceId";

COMMENT ON TABLE "ProviderExternalCalendarExport" IS
	'Variant-scoped outbound iCal share links. Physical-unit export is not supported.';
