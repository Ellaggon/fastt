import { and, asc, db, eq, Product, Variant } from "astro:db"

export type ProviderRatePlanVariantChoice = {
	variantId: string
	variantName: string
	productId: string
	productName: string
	label: string
}

export async function loadProviderRatePlanVariants(
	providerId: string
): Promise<ProviderRatePlanVariantChoice[]> {
	const rows = await db
		.select({
			variantId: Variant.id,
			variantName: Variant.name,
			productId: Product.id,
			productName: Product.name,
		})
		.from(Variant)
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(and(eq(Product.providerId, providerId), eq(Variant.isActive, true)))
		.orderBy(asc(Product.name), asc(Variant.name))
		.all()

	return rows.map((row) => ({
		variantId: String(row.variantId),
		variantName: String(row.variantName ?? "Habitación"),
		productId: String(row.productId),
		productName: String(row.productName ?? "Hotel"),
		label: `${String(row.productName ?? "Hotel")} · ${String(row.variantName ?? "Habitación")}`,
	}))
}
