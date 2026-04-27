import { db, eq, Product, RatePlan, Variant } from "astro:db"
import type {
	RatePlanOwnerContext,
	RatePlanOwnerContextRepositoryPort,
} from "../../application/ports/RatePlanOwnerContextRepositoryPort"

export class RatePlanOwnerContextRepository implements RatePlanOwnerContextRepositoryPort {
	async getOwnerContext(ratePlanId: string): Promise<RatePlanOwnerContext | null> {
		const row = await db
			.select({
				ratePlanId: RatePlan.id,
				variantId: Variant.id,
				productId: Product.id,
				providerId: Product.providerId,
			})
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(RatePlan.id, ratePlanId))
			.get()
		if (!row) return null

		return {
			ratePlanId: String(row.ratePlanId),
			variantId: String(row.variantId),
			productId: String(row.productId),
			providerId: row.providerId == null ? null : String(row.providerId),
		}
	}
}
