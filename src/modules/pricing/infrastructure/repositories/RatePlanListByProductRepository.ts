import { db, eq, inArray, RatePlan, RatePlanTemplate, Variant } from "astro:db"
import type {
	RatePlanListByProductRepositoryPort,
	RatePlanListItemByProduct,
} from "../../application/ports/RatePlanListByProductRepositoryPort"

export class RatePlanListByProductRepository implements RatePlanListByProductRepositoryPort {
	async listByProduct(productId: string): Promise<RatePlanListItemByProduct[]> {
		const variants = await db
			.select({ id: Variant.id })
			.from(Variant)
			.where(eq(Variant.productId, productId))
		const variantIds = variants.map((v) => String(v.id))

		if (variantIds.length === 0) return []

		return db
			.select({
				id: RatePlan.id,
				variantId: RatePlan.variantId,
				isDefault: RatePlan.isDefault,
				isActive: RatePlan.isActive,
				templateId: RatePlan.templateId,
				templateName: RatePlanTemplate.name,
			})
			.from(RatePlan)
			.innerJoin(RatePlanTemplate, eq(RatePlan.templateId, RatePlanTemplate.id))
			.where(inArray(RatePlan.variantId, variantIds))
			.all()
	}
}
