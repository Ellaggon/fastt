create table if not exists "ProductGeoPlaceActivity" (
	"id" text primary key,
	"productId" text not null references "Product"("id") on delete cascade,
	"previousPlaceId" text references "GeoPlace"("id"),
	"placeId" text not null references "GeoPlace"("id"),
	"actorId" text references "User"("id"),
	"source" text not null,
	"createdAt" timestamp with time zone not null default now()
);
create index if not exists "ProductGeoPlaceActivity_product_created_idx"
	on "ProductGeoPlaceActivity" ("productId", "createdAt");
