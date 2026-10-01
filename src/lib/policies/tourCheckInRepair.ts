import {
	db,
	eq,
	and,
	or,
	first,
	PolicyAssignment,
	Product,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"

/** The target comes from persisted relationships, never from client-provided product IDs. */
export async function loadTourCheckInRepair(providerId: string, ratePlanId: string) {
	const target = await db
		.select({
			productId: Product.id,
			variantId: Variant.id,
			ratePlanId: RatePlan.id,
			productType: Product.productType,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(RatePlan.variantId, Variant.id))
		.innerJoin(Product, eq(Variant.productId, Product.id))
		.where(and(eq(RatePlan.id, ratePlanId), eq(Product.providerId, providerId)))
		.then(first)
	if (!target || String(target.productType).trim().toLowerCase() !== "tour") return null
	const assignments = await db
		.select({
			id: PolicyAssignment.id,
			scope: PolicyAssignment.scope,
			scopeId: PolicyAssignment.scopeId,
			channel: PolicyAssignment.channel,
			effectiveFrom: PolicyAssignment.effectiveFrom,
			effectiveTo: PolicyAssignment.effectiveTo,
		})
		.from(PolicyAssignment)
		.where(
			and(
				eq(PolicyAssignment.isActive, true),
				eq(PolicyAssignment.category, "CheckIn"),
				or(
					and(
						eq(PolicyAssignment.scope, "product"),
						eq(PolicyAssignment.scopeId, target.productId)
					),
					and(
						eq(PolicyAssignment.scope, "variant"),
						eq(PolicyAssignment.scopeId, target.variantId)
					),
					and(
						eq(PolicyAssignment.scope, "rate_plan"),
						eq(PolicyAssignment.scopeId, target.ratePlanId)
					)
				)
			)
		)
	return {
		context: {
			productId: target.productId,
			variantId: target.variantId,
			ratePlanId: target.ratePlanId,
		},
		assignments,
	}
}
