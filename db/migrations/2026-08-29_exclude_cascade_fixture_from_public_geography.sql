-- This record exists to verify delete cascades. It is not provider inventory
-- and must never participate in public discovery or geography coverage.

UPDATE "Product"
SET "dataClass" = 'fixture'
WHERE "id" = 'prod_delete_17b66217-0c00-409e-abc0-5fbc1cccc088';

UPDATE "ProductGeoPlaceBackfill"
SET
	"placeId" = NULL,
	"resolutionStatus" = 'superseded',
	"matchMethod" = 'unmatched',
	"confidence" = 0,
	"distanceMeters" = NULL,
	"evidenceJson" = jsonb_build_object(
		'reason', 'fixture_excluded_from_public_geography',
		'productId', 'prod_delete_17b66217-0c00-409e-abc0-5fbc1cccc088'
	),
	"updatedAt" = now()
WHERE "productId" = 'prod_delete_17b66217-0c00-409e-abc0-5fbc1cccc088';
