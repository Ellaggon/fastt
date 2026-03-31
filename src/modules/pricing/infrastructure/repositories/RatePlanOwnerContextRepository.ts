import { db, eq, RatePlan, Variant } from "astro:db"
import type {
	RatePlanOwnerContext,
	RatePlanOwnerContextRepositoryPort,
} from "../../application/ports/RatePlanOwnerContextRepositoryPort"

export class RatePlanOwnerContextRepository implements RatePlanOwnerContextRepositoryPort {
	async getOwnerContext(ratePlanId: string): Promise<RatePlanOwnerContext | null> {
		const rp = await db.select().from(RatePlan).where(eq(RatePlan.id, ratePlanId)).get()
		if (!rp) return null

		const v = await db.select().from(Variant).where(eq(Variant.id, rp.variantId)).get()
		if (!v) return null

		return {
			ratePlanId: rp.id,
			variantId: rp.variantId,
			productId: v.productId,
		}
	}
}
