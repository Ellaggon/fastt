import { first, and, db, eq, Product, RatePlan, Variant } from "@/shared/infrastructure/db/compat"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"

import type {
	RatePlanPricingContext,
	RatePlanPricingContextRepositoryPort,
} from "@/modules/pricing/application/ports/RatePlanPricingContextRepositoryPort"

export class RatePlanPricingContextRepository implements RatePlanPricingContextRepositoryPort {
	async resolveRatePlanPricingContext(params: {
		providerId: string
		ratePlanId: string
	}): Promise<RatePlanPricingContext | null> {
		const ratePlanName = await resolveRatePlanNameColumn()
		const row = await db
			.select({
				ratePlanId: RatePlan.id,
				ratePlanName,
				productId: Product.id,
				productName: Product.name,
				variantId: Variant.id,
				variantName: Variant.name,
			})
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(RatePlan.id, params.ratePlanId), eq(Product.providerId, params.providerId)))
			.then(first)

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
}
