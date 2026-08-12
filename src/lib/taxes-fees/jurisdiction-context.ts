import { db, Destination, eq, Product } from "@/shared/infrastructure/db/compat"

/** Resolves the sellable product's canonical destination for fiscal eligibility. */
export async function getProductTaxJurisdictionContext(
	productId: string
): Promise<{ country: string | null }> {
	const row = await db
		.select({ country: Destination.country })
		.from(Product)
		.leftJoin(Destination, eq(Product.destinationId, Destination.id))
		.where(eq(Product.id, productId))
		.then((rows) => rows[0] ?? null)
	return { country: row?.country ? String(row.country).toUpperCase() : null }
}
