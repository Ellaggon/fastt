import { and, db, eq, GeoPlace, Product, ProductGeoPlace } from "@/shared/infrastructure/db/compat"

/** Resolves the sellable product's canonical destination for fiscal eligibility. */
export async function getProductTaxJurisdictionContext(
	productId: string
): Promise<{ country: string | null }> {
	const row = await db
		.select({ country: GeoPlace.countryCode })
		.from(Product)
		.innerJoin(
			ProductGeoPlace,
			and(
				eq(ProductGeoPlace.productId, Product.id),
				eq(ProductGeoPlace.role, "primary_discovery"),
				eq(ProductGeoPlace.isPrimary, true)
			)
		)
		.innerJoin(GeoPlace, eq(GeoPlace.id, ProductGeoPlace.placeId))
		.where(eq(Product.id, productId))
		.then((rows) => rows[0] ?? null)
	return { country: row?.country ? String(row.country).toUpperCase() : null }
}
