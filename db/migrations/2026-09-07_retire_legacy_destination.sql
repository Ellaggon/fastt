-- This is the intentional point of no return for marketplace geography.
-- GeoPlace + ProductGeoPlace are the only serving geography model after this migration.
do $$
begin
  if exists (
    select 1
    from "Product" p
    where not exists (
      select 1
      from "ProductGeoPlace" pgp
      where pgp."productId" = p."id"
        and pgp."role" = 'primary_discovery'
        and pgp."isPrimary" = true
    )
  ) then
    raise exception 'Cannot retire legacy geography: a Product is missing primary_discovery ProductGeoPlace.';
  end if;

  if exists (select 1 from "Product" where "destinationId" is not null) then
    raise exception 'Cannot retire legacy geography: Product.destinationId still has values.';
  end if;

  if exists (select 1 from "MarketplaceEvent" where "destinationId" is not null) then
    raise exception 'Cannot retire legacy geography: MarketplaceEvent.destinationId still has values.';
  end if;
end $$;

alter table "MarketplaceEvent" drop constraint if exists "MarketplaceEvent_destinationId_fkey";
alter table "MarketplaceEvent" drop column if exists "destinationId";

alter table "Product" drop constraint if exists "Product_destinationId_fkey";
alter table "Product" drop column if exists "destinationId";

drop table if exists "ProductGeoPlaceBackfill";
drop table if exists "LegacyDestinationGeoPlaceMap";
drop table if exists "Destination";
