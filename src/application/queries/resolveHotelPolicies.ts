import { db, eq, and, asc, EffectivePolicy } from "astro:db"

export async function resolveHotelPolicies(productId: string) {
	return db
		.select()
		.from(EffectivePolicy)
		.where(and(eq(EffectivePolicy.entityType, "product"), eq(EffectivePolicy.entityId, productId)))
		.orderBy(asc(EffectivePolicy.priority))
}
