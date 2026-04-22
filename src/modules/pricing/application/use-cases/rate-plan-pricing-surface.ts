import { and, db, eq, Product, RatePlan, RatePlanTemplate, Variant } from "astro:db"

export type RatePlanPricingContext = {
	ratePlanId: string
	ratePlanName: string
	productId: string
	productName: string
	variantId: string
	variantName: string
}

export async function resolveRatePlanPricingContext(params: {
	providerId: string
	ratePlanId: string
}): Promise<RatePlanPricingContext | null> {
	const row = await db
		.select({
			ratePlanId: RatePlan.id,
			ratePlanName: RatePlanTemplate.name,
			productId: Product.id,
			productName: Product.name,
			variantId: Variant.id,
			variantName: Variant.name,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.innerJoin(RatePlanTemplate, eq(RatePlanTemplate.id, RatePlan.templateId))
		.where(and(eq(RatePlan.id, params.ratePlanId), eq(Product.providerId, params.providerId)))
		.get()

	if (!row) return null
	return {
		ratePlanId: String(row.ratePlanId),
		ratePlanName: String(row.ratePlanName),
		productId: String(row.productId),
		productName: String(row.productName),
		variantId: String(row.variantId),
		variantName: String(row.variantName),
	}
}
