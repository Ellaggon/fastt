-- Synthetic XS tours exercise small-response and availability paths. They have
-- no commercial destination or coordinates, so they are fixtures rather than
-- public marketplace inventory.

UPDATE "Product"
SET "dataClass" = 'fixture'
WHERE "id" LIKE 'prod_tour_xs_%'
	AND "name" = 'Tour XS';

UPDATE "ProductContent"
SET "dataClass" = 'fixture'
WHERE "productId" LIKE 'prod_tour_xs_%';

UPDATE "ProductGeoPlaceBackfill"
SET
	"placeId" = NULL,
	"resolutionStatus" = 'superseded',
	"matchMethod" = 'unmatched',
	"confidence" = 0,
	"distanceMeters" = NULL,
	"evidenceJson" = jsonb_build_object('reason', 'fixture_excluded_from_public_geography'),
	"updatedAt" = now()
WHERE "productId" LIKE 'prod_tour_xs_%';
