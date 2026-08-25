-- Migrate only evidence-backed legacy attribution. Ambiguous rows retain no guessed location.
update "MarketplaceEvent" event
set "geoPlaceId" = mapping."placeId"
from "LegacyDestinationGeoPlaceMap" mapping
where event."geoPlaceId" is null
	and event."destinationId" = mapping."legacyDestinationId"
	and mapping."placeId" is not null
	and mapping."resolutionStatus" in ('auto_matched', 'confirmed');

update "MarketplaceEvent"
set "metaJson" = jsonb_set(
	coalesce("metaJson", '{}'::jsonb),
	'{legacyGeoPlaceMigration}',
	jsonb_build_object(
		'status', 'unresolved',
		'legacyDestinationId', "destinationId",
		'migratedAt', now()
	),
	true
)
where "destinationId" is not null and "geoPlaceId" is null;
