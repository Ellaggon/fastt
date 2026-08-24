-- ProductGeoPlace is authoritative. Refuse to clear any legacy value without a primary canonical place.
do $$
begin
	if exists (
		select 1
		from "Product" p
		where p."destinationId" is not null
			and not exists (
				select 1 from "ProductGeoPlace" pgp
				where pgp."productId" = p."id"
					and pgp."role" = 'primary_discovery'
					and pgp."isPrimary" = true
			)
	) then
		raise exception 'Cannot retire Product.destinationId: product without primary ProductGeoPlace exists.';
	end if;
end $$;

update "Product"
set "destinationId" = null
where "destinationId" is not null;

do $$
begin
	if exists (select 1 from "Product" where "destinationId" is not null) then
		raise exception 'Legacy Product.destinationId values remain after cleanup.';
	end if;
end $$;
