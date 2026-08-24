-- Canonical geographic attribution for marketplace telemetry.
alter table "MarketplaceEvent"
	add column if not exists "geoPlaceId" text references "GeoPlace"("id");

create index if not exists "MarketplaceEvent_geoPlace_created_idx"
	on "MarketplaceEvent" ("geoPlaceId", "createdAt");
