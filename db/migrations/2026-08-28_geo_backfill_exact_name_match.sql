-- A normalized city name that has a unique match in the country catalog is
-- auditable, deterministic evidence. Keep it distinct from name + department
-- and coordinate-assisted mappings.

ALTER TABLE "LegacyDestinationGeoPlaceMap"
	DROP CONSTRAINT IF EXISTS "LegacyDestinationGeoPlaceMap_matchMethod_check";

ALTER TABLE "LegacyDestinationGeoPlaceMap"
	ADD CONSTRAINT "LegacyDestinationGeoPlaceMap_matchMethod_check"
	CHECK ("matchMethod" IN ('name', 'name_department', 'coordinates', 'name_coordinates', 'manual', 'unmatched'));
