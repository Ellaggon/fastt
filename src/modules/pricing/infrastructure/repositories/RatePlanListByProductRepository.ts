import { db, eq, inArray, RatePlan, Variant } from "@/shared/infrastructure/db/compat"
import {
	resolveRatePlanDescriptionColumn,
	resolveRatePlanNameColumn,
} from "@/lib/rates/ratePlanSchemaCompat"
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

		const [ratePlanName, ratePlanDescription] = await Promise.all([
			resolveRatePlanNameColumn(),
			resolveRatePlanDescriptionColumn(),
		])
		return db
			.select({
				id: RatePlan.id,
				variantId: RatePlan.variantId,
				isDefault: RatePlan.isDefault,
				isActive: RatePlan.isActive,
				name: ratePlanName,
				description: ratePlanDescription,
			})
			.from(RatePlan)
			.where(inArray(RatePlan.variantId, variantIds))
	}
}
